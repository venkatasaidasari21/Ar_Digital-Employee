import { describe, expect, test } from "bun:test";
import { publicRun, timestamps } from "./store";
import type { PersistedRun } from "./store";

function makeRun(): PersistedRun {
  return {
    runId: "run_test",
    goal: "Test goal",
    phase: "planning",
    tasks: [],
    feed: [],
    result: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    retryCounts: {},
  };
}

describe("store", () => {
  test("publicRun strips the private persisted fields", () => {
    const pub = publicRun(makeRun());
    expect(pub.runId).toBe("run_test");
    expect(pub.phase).toBe("planning");
    expect(pub).not.toHaveProperty("retryCounts");
    expect(pub).not.toHaveProperty("createdAt");
    expect(pub).not.toHaveProperty("updatedAt");
  });

  test("timestamps refreshes updatedAt to the current time", () => {
    const run = makeRun();
    const stamp = timestamps(run);
    expect(stamp).toBe(run.updatedAt);
    expect(new Date(run.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(run.createdAt).getTime(),
    );
  });
});
