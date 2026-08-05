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
