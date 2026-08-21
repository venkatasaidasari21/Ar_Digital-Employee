import { afterEach, describe, expect, test } from "bun:test";
import { activeProviderName, parsePlan } from "./provider";

const GOAL = "Build a landing page";

describe("parsePlan", () => {
  test("parses a valid JSON plan into tasks", () => {
    const raw = JSON.stringify([
      { title: "Research", agent: "researcher" },
      { title: "Draft", agent: "scribe", durationHint: "15m" },
    ]);
    const tasks = parsePlan(raw, GOAL);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      id: "task-llm-1",
      agent: "researcher",
      status: "planned",
    });
    expect(tasks[1].id).toBe("task-llm-2");
    expect(tasks[1].detail).toContain("15m");
  });

  test("assigns task-review to a needsApproval checkpoint", () => {
    const tasks = parsePlan(
      JSON.stringify([
        { title: "Checkpoint", agent: "coordinator", needsApproval: true },
      ]),
      GOAL,
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-review");
  });

  test("parses JSON wrapped in a markdown code block", () => {
    const raw =
      "```json\n" +
      JSON.stringify([{ title: "A", agent: "planner" }]) +
      "\n```";
    const tasks = parsePlan(raw, GOAL);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("A");
  });

  test("falls back to the safe default plan on malformed JSON", () => {
    const tasks = parsePlan("{ not valid json at all", GOAL);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "task-plan",
      agent: "planner",
      status: "planned",
      detail: expect.stringContaining("Turn the goal"),
    });
    expect(tasks[0].title).toContain(GOAL);
  });

  test("falls back when the response is a JSON object, not an array", () => {
    const tasks = parsePlan('{ "plan": "gather inputs" }', GOAL);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-plan");
  });

  test("falls back when items have missing or invalid agents", () => {
    const tasks = parsePlan(
      JSON.stringify([
        { title: "No agent" },
        { agent: "hacker", title: "Bad agent" },
      ]),
      GOAL,
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-plan");
  });

  test("falls back on an empty array", () => {
    const tasks = parsePlan("[]", GOAL);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-plan");
  });

  test("keeps valid items and skips only invalid ones", () => {
    const tasks = parsePlan(
      JSON.stringify([
        { title: "Good", agent: "planner" },
        { title: "Bad", agent: "unknown" },
      ]),
      GOAL,
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Good");
  });
});

describe("activeProviderName", () => {
  const saved = {
    provider: process.env.VOXOS_PROVIDER,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };

  afterEach(() => {
    setEnv(saved.provider, saved.openai, saved.gemini);
  });

  function setEnv(provider?: string, openai?: string, gemini?: string) {
    if (provider === undefined) delete process.env.VOXOS_PROVIDER;
    else process.env.VOXOS_PROVIDER = provider;
    if (openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = openai;
    if (gemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = gemini;
  }

  test("resolves to the built-in default when no keys are set", () => {
    setEnv();
    expect(activeProviderName()).toBe("default");
  });

  test("falls back to default when a provider is requested but its key is missing", () => {
    setEnv("openai");
    expect(activeProviderName()).toBe("default");
    setEnv("gemini");
    expect(activeProviderName()).toBe("default");
  });

  test("selects openai when OPENAI_API_KEY is present", () => {
    setEnv(undefined, "sk-test");
    expect(activeProviderName()).toBe("openai");
  });

  test("selects gemini when GEMINI_API_KEY is present", () => {
    setEnv(undefined, undefined, "sk-test");
    expect(activeProviderName()).toBe("gemini");
  });
});
