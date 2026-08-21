import { describe, expect, test } from "bun:test";
import { AppError, isAppError } from "../types";
import { api } from "./api";

describe("AppError", () => {
  test("validation carries a 400 status and validation_error code", () => {
    const err = AppError.validation("goal is required");
    expect(err.status).toBe(400);
    expect(err.code).toBe("validation_error");
    expect(err.name).toBe("AppError");
  });

  test("isAppError narrows only AppError instances", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError(AppError.internal())).toBe(true);
  });
});

describe("api typed-error handling", () => {
  test("POST /api/goals without a goal returns 400 with a validation code", async () => {
    const res = await api(
      new Request("http://localhost/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      "/api/goals",
    );
    expect(res?.status).toBe(400);
    const body = (await res!.json()) as { error: string; code: string };
    expect(body.error).toBe("goal is required");
    expect(body.code).toBe("validation_error");
  });

  test("unknown routes return 404 with a not_found code", async () => {
    const res = await api(
      new Request("http://localhost/api/nope"),
      "/api/nope",
    );
    expect(res?.status).toBe(404);
    const body = (await res!.json()) as { code: string };
    expect(body.code).toBe("not_found");
  });
});
