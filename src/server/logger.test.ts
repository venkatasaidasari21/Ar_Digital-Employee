import { afterEach, describe, expect, test } from "bun:test";
import { logger } from "./logger";

const original = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

/** Intercepts all console methods, runs fn, restores them, and returns the calls. */
function capture(fn: () => void) {
  const calls: Array<{ method: "log" | "warn" | "error"; text: string }> = [];
  const makeSpy =
    (method: "log" | "warn" | "error") =>
    (...args: unknown[]) =>
      calls.push({ method, text: args.map(String).join(" ") });
  console.log = makeSpy("log") as typeof console.log;
  console.warn = makeSpy("warn") as typeof console.warn;
  console.error = makeSpy("error") as typeof console.error;
  try {
    fn();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
  return calls;
}

afterEach(() => {
  console.log = original.log;
  console.warn = original.warn;
  console.error = original.error;
});

describe("logger", () => {
  test("emits structured JSON with level, timestamp, and message", () => {
    const [call] = capture(() => logger.info("hello"));
    expect(call.method).toBe("log");
    const entry = JSON.parse(call.text) as Record<string, unknown>;
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("hello");
    expect(typeof entry.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(entry.timestamp as string))).toBe(false);
  });

  test("routes warn to console.warn and error to console.error", () => {
    const warn = capture(() => logger.warn("careful"));
    expect(warn[0].method).toBe("warn");
    const err = capture(() => logger.error("boom"));
    expect(err[0].method).toBe("error");
    expect(JSON.parse(err[0].text)["level"]).toBe("error");
  });

  test("includes a context object when provided", () => {
    const [call] = capture(() => logger.error("boom", { runId: "r1" }));
    const entry = JSON.parse(call.text) as Record<string, unknown>;
    expect(entry.context).toEqual({ runId: "r1" });
  });

  test("omits context when none is provided", () => {
    const [call] = capture(() => logger.warn("no ctx"));
    const entry = JSON.parse(call.text) as Record<string, unknown>;
    expect(entry.context).toBeUndefined();
  });
});
