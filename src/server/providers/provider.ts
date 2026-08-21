import type { Task } from "../../types";
import { logger } from "../logger";

export interface LLMProvider {
  readonly name: "openai" | "gemini";
  complete(system: string, user: string): Promise<string>;
}

export type ProviderName = "default" | "openai" | "gemini";

function requestedProvider(): string | undefined {
  const value = process.env.VOXOS_PROVIDER?.trim().toLowerCase();
  return value || undefined;
}

export function activeProviderName(): ProviderName {
  const requested = requestedProvider();
  if (requested === "openai")
    return process.env.OPENAI_API_KEY ? "openai" : "default";
  if (requested === "gemini")
    return process.env.GEMINI_API_KEY ? "gemini" : "default";
  if (requested === "default") return "default";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "default";
}

export async function getProvider(): Promise<LLMProvider | null> {
  const requested = requestedProvider();
  const active = activeProviderName();
  if (requested === "openai" && !process.env.OPENAI_API_KEY)
    logger.warn(
      "VOXOS_PROVIDER=openai but OPENAI_API_KEY is missing; using built-in default.",
      { provider: "openai" },
    );
  if (requested === "gemini" && !process.env.GEMINI_API_KEY)
    logger.warn(
      "VOXOS_PROVIDER=gemini but GEMINI_API_KEY is missing; using built-in default.",
      { provider: "gemini" },
    );
  if (requested && !["openai", "gemini", "default"].includes(requested))
    logger.warn(
      `Unknown VOXOS_PROVIDER '${requested}'; using built-in default.`,
      {
        provider: requested,
      },
    );
  if (active === "default") return null;
  if (active === "openai") {
    const { OpenAIProvider } = await import("./openai");
    return new OpenAIProvider();
  }
  const { GeminiProvider } = await import("./gemini");
  return new GeminiProvider();
}

export const PLAN_SYSTEM_PROMPT = `You are VoxOS's planning engine. Return ONLY a JSON array of tasks. Each item must have title (string), agent (one of planner, researcher, coordinator, scribe), optional needsApproval (boolean), and optional durationHint (string). Make a concise actionable plan, usually 3-6 tasks. Include a coordinator checkpoint with needsApproval true when a meaningful human decision is needed.`;

const AGENTS = new Set(["planner", "researcher", "coordinator", "scribe"]);
export function parsePlan(raw: string, goal: string): Task[] {
  let text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fallbackPlan(goal);
  }
  if (!Array.isArray(parsed)) return fallbackPlan(goal);
  const tasks: Task[] = [];
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const title =
      typeof candidate.title === "string" ? candidate.title.trim() : "";
    const agent =
      typeof candidate.agent === "string" && AGENTS.has(candidate.agent)
        ? candidate.agent
        : "";
    if (!title || !agent) continue;
    const needsApproval = candidate.needsApproval === true;
    tasks.push({
      id: needsApproval ? "task-review" : `task-llm-${index + 1}`,
      title,
      agent,
      status: "planned",
      detail:
        typeof candidate.durationHint === "string"
          ? `Estimated duration: ${candidate.durationHint}`
          : undefined,
    });
  }
  return tasks.length ? tasks : fallbackPlan(goal);
}

function fallbackPlan(goal: string): Task[] {
  const base = goal.trim().replace(/[.!?]+$/, "") || "your goal";
  return [
    {
      id: "task-plan",
      title: `Clarify and plan: ${base}`,
      agent: "planner",
      status: "planned",
      detail: "Turn the goal into an actionable approach.",
    },
  ];
}

export async function providerForTests(
  name: "openai" | "gemini",
): Promise<LLMProvider> {
  if (name === "openai") {
    const { OpenAIProvider } = await import("./openai");
    return new OpenAIProvider();
  }
  const { GeminiProvider } = await import("./gemini");
  return new GeminiProvider();
}
