import { useEffect, useRef, useState } from "react";
import type { RunHandle } from "~/api";
import type { RunState, Task, TaskStatus } from "~/types";

const MUTE_KEY = "voxos-muted";

function initialMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {
    // TTS is best-effort — never break the UI over it.
  }
}

const STATUS_META: Record<
  TaskStatus,
  { label: string; dot: string; text: string }
> = {
  planned: { label: "planned", dot: "bg-slate-500", text: "text-slate-400" },
  running: { label: "running", dot: "bg-cyan-400", text: "text-cyan-300" },
  "needs-approval": {
    label: "needs you",
    dot: "bg-amber-400",
    text: "text-amber-300",
  },
  done: { label: "done", dot: "bg-emerald-400", text: "text-emerald-300" },
};

const PHASE_LABEL: Record<RunState["phase"], string> = {
  planning: "Planning",
  executing: "Agents at work",
  "awaiting-approval": "Waiting on you",
  done: "Complete",
};

interface OrchestrationViewProps {
  run: RunHandle;
  onReset: () => void;
}

export function OrchestrationView({ run, onReset }: OrchestrationViewProps) {
  const [state, setState] = useState<RunState | null>(null);
  const [muted, setMuted] = useState(initialMuted);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = run.subscribe(setState);
    return () => {
      unsub();
      run.cancel();
    };
  }, [run]);

  // Speak the summary once the result lands (unless muted).
  useEffect(() => {
    if (!state || state.phase !== "done" || !state.result || muted) return;
    speak(state.result.summary);
  }, [state?.phase, state?.result, muted]);

  // Keep the activity feed scrolled to the newest event.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state?.feed.length]);

  if (!state) {
    return (
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-slate-400">
        Starting orchestration…
      </div>
    );
  }

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      if (!next && state.result) speak(state.result.summary);
      return next;
    });
  };

  return (
    <div className="w-full max-w-3xl animate-fade-up">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
          {run.demoMode ? "demo mode" : "live orchestrator"}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-xs text-slate-400">
          {run.runId}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
          {PHASE_LABEL[state.phase]}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              muted
                ? "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200"
                : "border-violet-400/30 bg-violet-400/10 text-violet-200"
            }`}
            title={muted ? "Unmute voice replies" : "Mute voice replies"}
          >
            {muted ? "🔇 voice off" : "🔊 voice on"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300 transition-colors hover:border-white/30 hover:text-white"
          >
            New goal
          </button>
        </div>
      </div>

      {/* Goal */}
      <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="text-xs uppercase tracking-wider text-slate-500">
          Goal
        </div>
        <div className="mt-1 text-lg font-medium text-slate-100">
          “{state.goal}”
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Task list */}
        <div className="lg:col-span-3">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Plan
          </h2>
          <ol className="space-y-2">
            {state.tasks.map((t) => (
              <TaskRow key={t.id} task={t} run={run} />
            ))}
          </ol>
        </div>

        {/* Activity feed */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Agent activity
          </h2>
          <div
            ref={feedRef}
            className="h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-xs lg:h-[19.5rem]"
          >
            {state.feed.map((e) => (
              <div key={e.id} className="flex gap-2 leading-relaxed">
                <span className="shrink-0 text-slate-600">
                  +{(e.time / 1000).toFixed(1)}s
                </span>
                <span className="shrink-0 text-slate-500">
                  [{e.agent ?? "voxos"}]
                </span>
                <span
                  className={
                    e.kind === "approval"
                      ? "text-amber-300"
                      : e.kind === "success"
                        ? "text-emerald-300"
                        : e.kind === "agent"
                          ? "text-cyan-200"
                          : "text-slate-300"
                  }
                >
                  {e.text}
                </span>
              </div>
            ))}
            {state.phase === "awaiting-approval" && (
              <div className="flex items-center gap-2 pt-1 text-amber-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                awaiting your decision…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result */}
      {state.result && (
        <div className="mt-5 animate-fade-up rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.08] via-transparent to-cyan-400/[0.06] p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
            <CheckIcon />
            Result
          </div>
          <p className="mt-2 text-base leading-relaxed text-slate-100">
            {state.result.summary}
          </p>
          <ul className="mt-3 space-y-1.5">
            {state.result.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className="text-emerald-400/80">▸</span>
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            {muted
              ? "Voice reply muted — toggle “voice on” to hear the summary."
              : "Summary read aloud via your browser’s speech synthesis."}
          </p>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-600">
        {run.demoMode
          ? "API unavailable — running the local demo simulation."
          : "Live run powered by the VoxOS orchestrator."}
      </p>
    </div>
  );
}

function TaskRow({ task, run }: { task: Task; run: RunHandle }) {
  const meta = STATUS_META[task.status];
  const waiting = task.status === "needs-approval";
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        waiting
          ? "animate-pulse-ring-amber border-amber-400/40 bg-amber-400/[0.06]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {task.status === "running" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${meta.dot}`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-100">{task.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono uppercase tracking-wide text-slate-400">
            {task.agent}
          </span>
          {task.detail && <span className="text-slate-500">{task.detail}</span>}
        </div>
      </div>
      <div className="shrink-0">
        {task.status === "running" ? (
          <span className="flex items-center gap-1.5 text-xs text-cyan-300">
            <Spinner /> running
          </span>
        ) : waiting ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => run.approveTask(task.id)}
              className="rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-all hover:brightness-110"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => run.rejectTask(task.id)}
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-white/30 hover:text-white"
            >
              Revise
            </button>
          </span>
        ) : (
          <span className={`text-xs ${meta.text}`}>{meta.label}</span>
        )}
      </div>
    </li>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}
