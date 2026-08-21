// HTTP API handler shared by the production server (serve.ts) and the test
// suite. Kept separate from serve.ts's Bun bootstrap so routes can be tested
// directly with plain `Request`/`Response` objects. Only `/api/*` paths are
// handled; anything else returns `undefined` so the server can fall through to
// static/SSR handling.
import { createRun, decide, fullRun, listRuns } from "./orchestrator/core";
import { activeProviderName } from "./providers/provider";
import { logger } from "./logger";

export async function api(
  req: Request,
  pathname: string,
): Promise<Response | undefined> {
  if (!pathname.startsWith("/api/")) return undefined;
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const segments = pathname.split("/").filter(Boolean);
  try {
    if (req.method === "GET" && pathname === "/api/health")
      return json({ status: "ok", provider: activeProviderName() });
    if (req.method === "POST" && pathname === "/api/goals") {
      const body = (await req.json()) as { goal?: string };
      if (!body.goal?.trim()) return json({ error: "goal is required" }, 400);
      return json(await createRun(body.goal), 201);
    }
    if (req.method === "GET" && pathname === "/api/runs")
      return json(await listRuns());
    if (req.method === "GET" && pathname === "/api/provider")
      return json({ name: activeProviderName() });
    if (
      req.method === "GET" &&
      segments.length === 3 &&
      segments[1] === "runs"
    ) {
      const run = await fullRun(segments[2]);
      return run ? json(run) : json({ error: "Run not found" }, 404);
    }
    if (
      req.method === "POST" &&
      segments.length === 6 &&
      segments[1] === "runs" &&
      segments[3] === "tasks"
    ) {
      const approved = segments[5] === "approve";
      const rejected = segments[5] === "reject";
      if (!approved && !rejected) return json({ error: "Unknown action" }, 404);
      const outcome = await decide(segments[2], segments[4], approved);
      return "status" in outcome
        ? json({ error: outcome.error }, outcome.status)
        : json(outcome);
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    logger.error("VoxOS API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Internal server error" }, 500);
  }
}
