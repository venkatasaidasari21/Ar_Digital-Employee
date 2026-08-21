import type {
  FeedEvent,
  FeedEventKind,
  RunResult,
  RunState,
  Task,
} from "./types";

export interface RunSummary {
  runId: string;
  goal: string;
  phase: RunState["phase"];
  created: string;
}

export interface RunHandle {
  runId: string;
  demoMode?: boolean;
  getState(): RunState;
  subscribe(cb: (state: RunState) => void): () => void;
  approveTask(taskId: string): void;
  rejectTask(taskId: string): void;
  cancel(): void;
}

// Offline simulator retained as a graceful fallback for static/unreachable hosts.
interface ScenarioTask {
  title: string;
  agent: string;
  gate?: boolean;
  durationMs: number;
}
interface Scenario {
  plannerNote: string;
  tasks: ScenarioTask[];
  resultSummary: string;
  resultBullets: string[];
}
const SCENARIOS: Scenario[] = [
  {
    plannerNote: "decomposed goal into 5 tasks across 3 agents",
    tasks: [
      {
        title: "Clarify the goal and success criteria",
        agent: "planner",
        durationMs: 700,
      },
      {
        title: "Gather the raw material",
        agent: "researcher",
        durationMs: 800,
      },
      {
        title: "Confirm direction with you before proceeding",
        agent: "coordinator",
        gate: true,
        durationMs: 700,
      },
      { title: "Execute the core work", agent: "worker", durationMs: 800 },
      { title: "Package the final result", agent: "scribe", durationMs: 600 },
    ],
    resultSummary:
      "Done. The goal was broken into five steps, the key decision was brought to you, and the final result is packaged and ready.",
    resultBullets: [
      "Goal decomposed into 5 tracked tasks",
      "One decision surfaced for your approval",
      "Core work executed by the specialist agent",
      "Result delivered below — ask VoxOS to go deeper any time",
    ],
  },
  {
    plannerNote: "decomposed goal into 5 tasks across 3 agents",
    tasks: [
      {
        title: "Inventory the week: meetings, deadlines, deep-work blocks",
        agent: "planner",
        durationMs: 700,
      },
      {
        title: "Draft the time-blocked schedule",
        agent: "planner",
        durationMs: 700,
      },
      {
        title: "Confirm priorities with you before locking the calendar",
        agent: "coordinator",
        gate: true,
        durationMs: 700,
      },
      {
        title: "Build the day-by-day plan with buffers",
        agent: "planner",
        durationMs: 700,
      },
      {
        title: "Summarize the week at a glance",
        agent: "scribe",
        durationMs: 600,
      },
    ],
    resultSummary:
      "Your week is planned: focus blocks protected in the mornings, meetings batched in the afternoons, and a 30-minute buffer each day for the unexpected.",
    resultBullets: [
      "Monday–Friday: deep-work blocks 9:00–11:30",
      "Meetings batched 14:00–16:00 to protect flow",
      "Buffer time added daily before your first hard deadline",
      "Sunday evening: 15-minute auto-review of the coming week",
    ],
  },
];
function mockSubmitGoal(goal: string): RunHandle {
  const scenario = /plan|schedule|week/i.test(goal)
    ? SCENARIOS[1]
    : SCENARIOS[0];
  const runId = `demo_${Math.random().toString(36).slice(2, 9)}`;
  const t0 = Date.now();
  const tasks: Task[] = scenario.tasks.map((x, i) => ({
    id: `t${i + 1}`,
    title: x.title,
    agent: x.agent,
    status: "planned",
  }));
  const feed: FeedEvent[] = [];
  const listeners = new Set<(s: RunState) => void>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let phase: RunState["phase"] = "planning",
    result: RunResult | null = null,
    cursor = 0,
    cancelled = false;
  const emit = () =>
    listeners.forEach((cb) =>
      cb({
        runId,
        goal,
        phase,
        tasks: tasks.map((x) => ({ ...x })),
        feed: feed.map((x) => ({ ...x })),
        result: result ? { ...result, bullets: [...result.bullets] } : null,
      }),
    );
  const push = (kind: FeedEventKind, text: string, agent?: string) =>
    feed.push({
      id: `e${feed.length}`,
      time: Date.now() - t0,
      kind,
      text,
      agent,
    });
  const step = () => {
    if (cancelled) return;
    const s = scenario.tasks[cursor];
    if (!s) {
      phase = "done";
      result = {
        summary: scenario.resultSummary,
        bullets: scenario.resultBullets,
      };
      push(
        "success",
        "all tasks complete — final result ready",
        "orchestrator",
      );
      emit();
      return;
    }
    const t = tasks[cursor];
    if (t.status === "planned") {
      t.status = "running";
      phase = "executing";
      push("agent", `picked up “${t.title}”`, t.agent);
      emit();
      timers.push(setTimeout(step, s.durationMs));
    } else if (t.status === "running") {
      if (s.gate) {
        t.status = "needs-approval";
        phase = "awaiting-approval";
        push(
          "approval",
          `“${t.title}” — needs your approval to continue`,
          t.agent,
        );
        emit();
      } else {
        t.status = "done";
        push("success", `finished “${t.title}”`, t.agent);
        cursor++;
        emit();
        timers.push(setTimeout(step, 250));
      }
    }
  };
  push("info", scenario.plannerNote, "planner");
  emit();
  timers.push(setTimeout(step, 500));
  const decide = (id: string, approved: boolean) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status !== "needs-approval") return;
    t.status = "done";
    t.detail = approved
      ? "approved by you"
      : "revised — rerouted per your input";
    phase = "executing";
    push(
      approved ? "success" : "info",
      approved
        ? "approval received — resuming pipeline"
        : "direction updated — rerouting the rest of the plan",
      "orchestrator",
    );
    emit();
    timers.push(
      setTimeout(() => {
        cursor++;
        step();
      }, 250),
    );
  };
  return {
    runId,
    demoMode: true,
    getState: () => ({ runId, goal, phase, tasks, feed, result }),
    subscribe(cb) {
      listeners.add(cb);
      cb({ runId, goal, phase, tasks, feed, result });
      return () => listeners.delete(cb);
    },
    approveTask: (id) => decide(id, true),
    rejectTask: (id) => decide(id, false),
    cancel() {
      cancelled = true;
      timers.forEach(clearTimeout);
      listeners.clear();
    },
  };
}

function apiHandle(initial: RunState): RunHandle {
  let state = initial;
  let stopped = false;
  const listeners = new Set<(s: RunState) => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notify = (s: RunState) => {
    state = s;
    listeners.forEach((cb) => cb(s));
  };
  const poll = async () => {
    if (stopped) return;
    try {
      const r = await fetch(`/api/runs/${encodeURIComponent(state.runId)}`);
      if (r.status === 404) {
        stopped = true;
        return;
      }
      if (!r.ok) throw Error("poll failed");
      const next = (await r.json()) as RunState;
      notify(next);
      if (next.phase !== "done") timer = setTimeout(poll, 1800);
    } catch {
      timer = setTimeout(poll, 3000);
    }
  };
  if (initial.phase !== "done") timer = setTimeout(poll, 250);
  const decide = async (taskId: string, action: "approve" | "reject") => {
    try {
      await fetch(
        `/api/runs/${encodeURIComponent(state.runId)}/tasks/${encodeURIComponent(taskId)}/${action}`,
        { method: "POST" },
      );
      poll();
    } catch {
      /* polling retries */
    }
  };
  return {
    runId: initial.runId,
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      cb(state);
      return () => listeners.delete(cb);
    },
    approveTask: (id) => {
      void decide(id, "approve");
    },
    rejectTask: (id) => {
      void decide(id, "reject");
    },
    cancel() {
      stopped = true;
      if (timer) clearTimeout(timer);
      listeners.clear();
    },
  };
}

export async function createRun(goal: string): Promise<RunHandle> {
  try {
    const r = await fetch("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal }),
    });
    if (!r.ok) throw Error("create failed");
    return apiHandle((await r.json()) as RunState);
  } catch {
    return mockSubmitGoal(goal);
  }
}
export const submitGoal = (goal: string) => mockSubmitGoal(goal);
export async function getRun(runId: string): Promise<RunHandle | null> {
  try {
    const r = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
    if (!r.ok) return null;
    return apiHandle((await r.json()) as RunState);
  } catch {
    return null;
  }
}
export async function listRuns(): Promise<RunSummary[]> {
  const r = await fetch("/api/runs");
  if (!r.ok) throw Error("history unavailable");
  return (await r.json()) as RunSummary[];
}
