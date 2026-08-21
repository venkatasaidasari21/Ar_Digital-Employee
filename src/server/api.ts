// HTTP API handler shared by the production server (serve.ts) and the test
// suite. Kept separate from serve.ts's Bun bootstrap so routes can be tested
// directly with plain `Request`/`Response` objects. Only `/api/*` paths are
// handled; anything else returns `undefined` so the server can fall through to
// static/SSR handling.
import { AppError, isAppError } from "../types";
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
      if (!body.goal?.trim()) throw AppError.validation("goal is required");
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
      if (!run) throw AppError.notFound("Run not found");
      return json(run);
    }
    if (
      req.method === "POST" &&
      segments.length === 6 &&
      segments[1] === "runs" &&
      segments[3] === "tasks"
    ) {
      const approved = segments[5] === "approve";
      const rejected = segments[5] === "reject";
      if (!approved && !rejected) throw AppError.notFound("Unknown action");
      const outcome = await decide(segments[2], segments[4], approved);
      if ("status" in outcome) {
        throw new AppError(
          outcome.error,
          outcome.status,
          outcome.status === 409 ? "conflict" : "not_found",
        );
      }
      return json(outcome);
    }
    throw AppError.notFound("Not found");
  } catch (error) {
    if (isAppError(error)) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    logger.error("VoxOS API error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return json(
      { error: "Internal server error", code: "internal_error" },
      500,
    );
  }
}
