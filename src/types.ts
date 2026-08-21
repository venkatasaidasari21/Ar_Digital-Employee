// Shared domain types for the VoxOS UI.
// These shapes are what the (future) real API will return; the UI components
// only depend on these types and on the client module (src/api.ts).

export type TaskStatus = "planned" | "running" | "needs-approval" | "done";

export interface Task {
  id: string;
  title: string;
  agent: string;
  status: TaskStatus;
  detail?: string;
}

export type FeedEventKind = "info" | "agent" | "success" | "approval";

export interface FeedEvent {
  id: string;
  /** ms since the run started */
  time: number;
  kind: FeedEventKind;
  agent?: string;
  text: string;
}

export interface RunResult {
  summary: string;
  bullets: string[];
}

export type RunPhase = "planning" | "executing" | "awaiting-approval" | "done";

export interface RunState {
  runId: string;
  goal: string;
  phase: RunPhase;
  tasks: Task[];
  feed: FeedEvent[];
  result: RunResult | null;
}

/**
 * Typed application error carrying an HTTP status and a stable machine code.
 * Thrown by server handlers so the API layer maps failures to the right
 * status code instead of ad-hoc `{ error }` objects.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  /** 400 — the request was malformed or failed validation. */
  static validation(message: string): AppError {
    return new AppError(message, 400, "validation_error");
  }

  /** 404 — the requested resource does not exist. */
  static notFound(message: string): AppError {
    return new AppError(message, 404, "not_found");
  }

  /** 409 — the request conflicts with the current state of a resource. */
  static conflict(message: string): AppError {
    return new AppError(message, 409, "conflict");
  }

  /** 500 — an unexpected internal error. */
  static internal(message = "Internal server error"): AppError {
    return new AppError(message, 500, "internal_error");
  }
}

/** Type guard for {@link AppError}. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
