import { describe, expect, test } from "bun:test";
import { createRun, decide, defaultPlanner, fullRun, LLMPlanner } from "./core";

// Force the built-in default planner so the orchestrator runs hermetically
// (no API keys, no network calls) regardless of the host environment.
process.env.VOXOS_PROVIDER = "default";

/** A fake LLM provider used to prove the mocked planner path maps a plan to tasks. */
const fakeProvider = {
  complete: async (_system: string, _user: string): Promise<string> =>
    JSON.stringify([
      { title: "Draft the doc", agent: "scribe", durationHint: "10m" },
      {
        title: "Coordinate the review",
        agent: "coordinator",
        needsApproval: true,
      },
    ]),
};

async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 25000,
  intervalMs = 120,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await Bun.sleep(intervalMs);
  }
  throw new Error("Timed out waiting for condition");
}

/**
 * Starts a run on the default plan and waits until it halts awaiting approval.
 * The default plan fans out several tasks with real internal delays (including
 * the researcher's automatic retry), so the slow tests set a generous timeout.
 */
async function startDefaultRun(goal: string) {
  const created = await createRun(goal);
  await waitFor(
    async () => (await fullRun(created.runId))?.phase === "awaiting-approval",
  );
  const run = (await fullRun(created.runId))!;
  return { runId: created.runId, run };
}

describe("orchestrator core", () => {
  test("LLMPlanner maps a mocked provider plan into tasks", async () => {
    const planner = new LLMPlanner(fakeProvider);
    const tasks = await planner.plan("Ship a feature");
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ agent: "scribe", status: "planned" });
    expect(tasks[0].detail).toContain("10m");
    expect(tasks[1]).toMatchObject({ agent: "coordinator", status: "planned" });
  });

  test("defaultPlanner produces a plan that includes a review checkpoint", async () => {
    const tasks = await defaultPlanner.plan("Plan my week");
    expect(tasks).toHaveLength(4);
    expect(tasks.some((t) => t.id === "task-review")).toBe(true);
    expect(tasks.every((t) => t.status === "planned")).toBe(true);
  });

  test("createRun creates a run with the goal and a created plan", async () => {
    const created = await createRun("Draft a brief");
    expect(created.runId).toBeTruthy();
    expect(created.goal).toBe("Draft a brief");
    expect(created.phase).toBe("planning");
    expect(created.tasks.length).toBeGreaterThan(0);
    await waitFor(
      async () => (await fullRun(created.runId))!.phase !== "planning",
    );
  });

  test(
    "execution runs retry-on-failure then halts awaiting approval",
    async () => {
      const { run } = await startDefaultRun("Research and draft a brief");
      // The run must have paused at the human-approval checkpoint.
      expect(run.phase).toBe("awaiting-approval");
      const review = run.tasks.find((t) => t.id === "task-review");
      expect(review?.status).toBe("needs-approval");

      const research = run.tasks.find((t) => t.id === "task-research");
      // The researcher task failed once and was retried automatically, so it ends done.
      expect(research?.status).toBe("done");

      const retried = run.feed.some((e) =>
        e.text.includes("Retrying automatically"),
      );
      expect(retried).toBe(true);
    },
    { timeout: 30000 },
  );

  test(
    "approving the checkpoint resumes execution and completes the run",
    async () => {
      const { runId, run } = await startDefaultRun("Approve this plan");
      const review = run.tasks.find((t) => t.id === "task-review")!;
      expect(review.status).toBe("needs-approval");

      await decide(runId, review.id, true);
      await waitFor(async () => (await fullRun(runId))?.phase === "done");

      const done = (await fullRun(runId))!;
      expect(done.phase).toBe("done");
      expect(done.tasks).toHaveLength(run.tasks.length);
      expect(done.tasks.every((t) => t.status === "done")).toBe(true);
      expect(done.result).not.toBeNull();
      expect(done.feed.some((e) => e.text.includes("Approval received"))).toBe(
        true,
      );
    },
    { timeout: 30000 },
  );

  test(
    "rejecting the checkpoint reroutes the remaining plan and completes",
    async () => {
      const { runId, run } = await startDefaultRun("Reject this plan");
      const review = run.tasks.find((t) => t.id === "task-review")!;

      await decide(runId, review.id, false);
      await waitFor(async () => (await fullRun(runId))?.phase === "done");

      const done = (await fullRun(runId))!;
      expect(done.phase).toBe("done");
      expect(done.tasks.find((t) => t.id === "task-review")?.detail).toContain(
        "Rejected",
      );
      // The rejection records a reroute event for the remaining plan.
      expect(
        done.feed.some((e) => e.text.includes("Rejected checkpoint rerouted")),
      ).toBe(true);
    },
    { timeout: 30000 },
  );

  test("decide rejects an unknown run and a task that is not awaiting approval", async () => {
    const missing = await decide("does-not-exist", "task-review", true);
    expect(missing).toMatchObject({ status: 404 });

    // task-review is still "planned" immediately after createRun, so deciding on
    // it before execution reaches the gate must return a 409 conflict.
    const created = await createRun("Gate error cases");
    const conflict = await decide(created.runId, "task-review", true);
    expect(conflict).toMatchObject({ status: 409 });
  });
});
