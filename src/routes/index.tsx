import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createRun, getRun, listRuns } from "~/api";
import type { RunHandle, RunSummary } from "~/api";
import { VoiceInput } from "~/components/VoiceInput";
import { OrchestrationView } from "~/components/OrchestrationView";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [run, setRun] = useState<RunHandle | null>(null);
  const [started, setStarted] = useState(false);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/provider")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { name?: string } | null) => {
        if (d?.name) setProvider(d.name);
      })
      .catch(() => {});
  }, []);

  const refreshHistory = () => {
    void listRuns()
      .then(setHistory)
      .catch(() => setHistoryError(true));
  };
  useEffect(() => {
    refreshHistory();
    const timer = setInterval(refreshHistory, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = (goal: string) => {
    setRun((prev) => {
      prev?.cancel();
      return null;
    });
    void createRun(goal).then((next) => {
      setRun(next);
      setStarted(true);
      refreshHistory();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };
  const handleReset = () => {
    setRun((prev) => {
      prev?.cancel();
      return null;
    });
    setStarted(false);
  };
  const openRun = (id: string) => {
    void getRun(id).then((next) => {
      if (next) {
        setRun((prev) => {
          prev?.cancel();
          return next;
        });
        setStarted(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  return (
    <div className="bg-voxos bg-grid min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 font-mono text-sm font-bold text-slate-950">
              V
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-100">
              Vox<span className="text-gradient">OS</span>
            </span>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-400">
            voice-first · model-agnostic
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-500">
            planner: {provider === "default" ? "built-in" : (provider ?? "…")}
          </span>
        </header>
        <section className="mt-16 text-center sm:mt-20">
          <h1 className="text-gradient text-5xl font-bold tracking-tight sm:text-7xl">
            Speak. It plans. It executes.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
            VoxOS is a voice-first AI operating system. Say a goal — it breaks
            it into tasks, delegates to specialist agents working in the
            background, and only comes back to you when a decision really needs
            a human.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
            {[
              "goal → plan → agents → result",
              "persistent memory",
              "swap in ChatGPT or Gemini",
            ].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1 font-mono text-cyan-300/90"
              >
                {chip}
              </span>
            ))}
          </div>
        </section>
        <section className="mt-12 flex flex-col items-center sm:mt-14">
          {!started || !run ? (
            <>
              <span className="mb-4 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                live orchestrator · persistent memory
              </span>
              <VoiceInput onSubmit={handleSubmit} />
            </>
          ) : (
            <OrchestrationView run={run} onReset={handleReset} />
          )}
        </section>
        <section className="mx-auto mt-12 w-full max-w-3xl">
          <details
            open
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <summary className="cursor-pointer text-sm font-semibold text-slate-200">
              Previous runs{" "}
              <span className="ml-1 text-xs font-normal text-slate-500">
                ({history.length})
              </span>
            </summary>
            {historyError ? (
              <p className="mt-3 text-xs text-slate-500">
                Run history unavailable right now.
              </p>
            ) : history.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                Your completed and active runs will appear here.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {history.map((item) => (
                  <button
                    key={item.runId}
                    type="button"
                    onClick={() => openRun(item.runId)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition hover:border-cyan-400/40"
                  >
                    <span className="min-w-0 truncate text-sm text-slate-200">
                      {item.goal}
                    </span>
                    <span
                      className={`shrink-0 text-xs ${item.phase === "done" ? "text-emerald-300" : item.phase === "awaiting-approval" ? "text-amber-300" : "text-cyan-300"}`}
                    >
                      {item.phase}
                    </span>
                    <time className="hidden shrink-0 text-xs text-slate-500 sm:block">
                      {new Date(item.created).toLocaleString()}
                    </time>
                  </button>
                ))}
              </div>
            )}
          </details>
        </section>
        <footer className="mt-auto flex flex-col items-center gap-2 pt-16 pb-2 text-center text-xs text-slate-600">
          <span>
            MVP voice-first operating system · built with{" "}
            <a
              href="https://cto.new"
              className="underline hover:text-slate-400"
            >
              cto.new
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}
