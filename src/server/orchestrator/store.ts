import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FeedEvent, RunResult, RunPhase, Task } from "../../types";

export interface PersistedRun {
  runId: string;
  goal: string;
  phase: RunPhase;
  tasks: Task[];
  feed: FeedEvent[];
  result: RunResult | null;
  createdAt: string;
  updatedAt: string;
  retryCounts: Record<string, number>;
}

const filePath = join(import.meta.dir, "../../../data/voxos-store.json");
let runs = new Map<string, PersistedRun>();
let ready: Promise<void> | undefined;
let writeQueue = Promise.resolve();

async function load() {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as PersistedRun[];
    for (const run of parsed) runs.set(run.runId, run);
  } catch (error: any) {
    if (error?.code !== "ENOENT")
      console.error("VoxOS store load failed", error);
  }
}
export function ensureLoaded() {
  return (ready ??= load());
}
export async function persist() {
  await ensureLoaded();
  const snapshot = JSON.stringify([...runs.values()], null, 2);
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    await writeFile(temp, snapshot, "utf8");
    await rename(temp, filePath);
  });
  return writeQueue;
}
export async function allRuns() {
  await ensureLoaded();
  return [...runs.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
export async function getRun(id: string) {
  await ensureLoaded();
  return runs.get(id);
}
export async function saveRun(run: PersistedRun) {
  await ensureLoaded();
  runs.set(run.runId, run);
  await persist();
  return run;
}
export function publicRun(run: PersistedRun) {
  const {
    retryCounts: _retryCounts,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...apiRun
  } = run;
  return apiRun;
}
export function timestamps(run: PersistedRun) {
  const now = new Date().toISOString();
  run.updatedAt = now;
  return now;
}
