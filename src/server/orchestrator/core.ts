import type { FeedEvent, Task, RunResult } from "../../types";
import { allRuns, ensureLoaded, getRun, persist, publicRun, saveRun, timestamps, type PersistedRun } from "./store";
import { getProvider, parsePlan, PLAN_SYSTEM_PROMPT } from "../providers/provider";

export interface Plannable { plan(goal: string): Task[] | Promise<Task[]>; }

export class LLMPlanner implements Plannable {
  constructor(private readonly provider: { complete(system: string, user: string): Promise<string> }) {}
  async plan(goal: string): Promise<Task[]> {
    try { return parsePlan(await this.provider.complete(PLAN_SYSTEM_PROMPT, goal), goal); }
    catch (error) { console.warn("VoxOS: LLM planning failed; using safe fallback plan.", error instanceof Error ? error.message : "unknown error"); return defaultPlanner.plan(goal); }
  }
}
export const defaultPlanner: Plannable = { plan(goal) {
  const base = goal.trim().replace(/[.!?]+$/, "") || "your goal";
  return [
    { id: "task-plan", title: `Clarify and plan: ${base}`, agent: "planner", status: "planned", detail: "Turn the goal into an actionable approach." },
    { id: "task-research", title: `Research key inputs for ${base}`, agent: "researcher", status: "planned", detail: "Gather relevant context and options." },
    { id: "task-review", title: "Review the approach with you", agent: "coordinator", status: "planned", detail: "Human approval is required before execution continues." },
    { id: "task-draft", title: `Draft the deliverable for ${base}`, agent: "scribe", status: "planned", detail: "Produce a concise first draft." },
  ];
} };

const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const event = (run: PersistedRun, kind: FeedEvent["kind"], text: string, agent?: string) => {
  run.feed.push({ id: id("evt"), time: Date.now() - Date.parse(run.createdAt), kind, agent, text });
  timestamps(run);
};
const result = (run: PersistedRun): RunResult => ({ summary: `Completed the plan for “${run.goal}”.`, bullets: run.tasks.filter(t => t.status === "done").map(t => t.title) });

export async function createRun(goal: string) {
  await ensureLoaded();
  const now = new Date().toISOString();
  const provider = await getProvider();
  const planner: Plannable = provider ? new LLMPlanner(provider) : defaultPlanner;
  const run: PersistedRun = { runId: id("run"), goal, phase: "planning", tasks: await planner.plan(goal), feed: [], result: null, createdAt: now, updatedAt: now, retryCounts: {} };
  event(run, "info", "Goal received; plan created.", "planner");
  await saveRun(run);
  void execute(run.runId);
  return publicRun(run);
}
export async function listRuns() { return (await allRuns()).map(run => ({ runId: run.runId, goal: run.goal, phase: run.phase, created: run.createdAt })); }
export async function fullRun(id: string) { const run = await getRun(id); return run && publicRun(run); }

async function execute(runId: string) {
  const run = await getRun(runId); if (!run) return;
  run.phase = "executing"; event(run, "info", "Agents are beginning work."); await persist();
  for (let index = 0; index < run.tasks.length; index++) {
    const task = run.tasks[index];
    if (task.status === "done") continue;
    if (task.status === "needs-approval") { run.phase = "awaiting-approval"; await persist(); return; }
    task.status = "running"; event(run, "agent", `${task.title} started.`, task.agent); await persist();
    await new Promise(r => setTimeout(r, task.agent === "researcher" ? 3000 : 2200));
    if (task.id === "task-research" && !run.retryCounts[task.id]) {
      run.retryCounts[task.id] = 1; task.status = "planned"; task.detail = "Transient failure; queued for automatic retry.";
      event(run, "info", `${task.title} failed. Retrying automatically (1/1).`, task.agent); await persist(); await new Promise(r => setTimeout(r, 900)); index--; continue;
    }
    if (task.id === "task-review") { task.status = "needs-approval"; run.phase = "awaiting-approval"; event(run, "approval", "Your approval is needed to continue.", task.agent); await persist(); return; }
    task.status = "done"; task.detail = `Completed by ${task.agent}.`; event(run, "success", `${task.title} completed.`, task.agent); await persist();
  }
  run.phase = "done"; run.result = result(run); event(run, "success", "All tasks complete; result ready."); await persist();
}
export async function decide(runId: string, taskId: string, approved: boolean) {
  const run = await getRun(runId); if (!run) return { error: "Run not found", status: 404 } as const;
  const task = run.tasks.find(t => t.id === taskId); if (!task) return { error: "Task not found", status: 404 } as const;
  if (task.status !== "needs-approval") return { error: "Task is not awaiting approval", status: 409 } as const;
  if (approved) { task.status = "done"; task.detail = "Approved by human; checkpoint accepted."; event(run, "success", "Approval received; execution resumed.", task.agent); }
  else { task.status = "done"; task.detail = "Rejected; rerouted with a safer alternative."; event(run, "info", "Rejected checkpoint rerouted remaining plan.", task.agent); const next = run.tasks.find(t => t.id === "task-draft"); if (next) next.detail = "Rerouted after rejection."; }
  run.phase = "executing"; await persist(); void execute(runId); return publicRun(run);
}
