import { describe, expect, test } from "bun:test";
import { api } from "./api";

const PROVIDERS = ["default", "openai", "gemini"] as const;

describe("health endpoint", () => {
  test("GET /api/health returns 200", async () => {
    const res = await api(
      new Request("http://localhost/api/health"),
      "/api/health",
    );
    expect(res?.status).toBe(200);
  });

  test("the body has ok and provider fields", async () => {
    const res = await api(
      new Request("http://localhost/api/health"),
      "/api/health",
    );
    const body = (await res!.json()) as { status: string; provider: string };
    expect(body.status).toBe("ok");
    expect(typeof body.provider).toBe("string");
    // The active provider is one of the known provider names (default when no keys).
    expect(PROVIDERS).toContain(body.provider as (typeof PROVIDERS)[number]);
  });
});
