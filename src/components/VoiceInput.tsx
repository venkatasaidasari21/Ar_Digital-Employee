import { useEffect, useRef, useState } from "react";

// Minimal structural types for the Web Speech API (not in the standard TS lib).
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: { results: { length: number; [i: number]: SpeechRecognitionResultLike } }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

const SUGGESTIONS = [
  "Plan my week",
  "Research quantum computing and draft a brief",
  "Write a thank-you email to the team",
];

interface VoiceInputProps {
  onSubmit: (goal: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onSubmit, disabled = false }: VoiceInputProps) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const submittedRef = useRef<string | null>(null);

  useEffect(() => {
    setSupported(getRecognition() !== null);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const startListening = () => {
    if (disabled) return;
    const rec = getRecognition();
    if (!rec) {
      setNote("Voice capture isn't supported in this browser — type your goal instead.");
      setSupported(false);
      return;
    }
    setNote(null);
    recognitionRef.current = rec;
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setText(transcript);
      const final = e.results[e.results.length - 1]?.isFinal;
      const trimmed = transcript.trim();
      if (final && trimmed.length > 1 && submittedRef.current !== trimmed) {
        // Voice-first: once the utterance is final, run it immediately.
        submittedRef.current = trimmed;
        stopListening();
        onSubmit(trimmed);
      }
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setNote("Microphone access was denied — type your goal instead.");
      } else if (e.error === "no-speech") {
        setNote("No speech detected — try again, or type your goal.");
      } else if (e.error === "aborted") {
        setNote(null);
      } else {
        setNote("Voice capture failed — type your goal instead.");
      }
    };
    rec.onend = () => setListening(false);

    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setNote("Couldn't start the microphone — type your goal instead.");
    }
  };

  const canSubmit = text.trim().length > 0 && !disabled;

  return (
    <div className="w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          submittedRef.current = text.trim();
          onSubmit(text.trim());
        }}
        className="group relative"
      >
        <div
          className={`flex items-center gap-2 rounded-2xl border bg-white/[0.04] p-2 shadow-[0_0_60px_-20px_rgba(56,189,248,0.45)] backdrop-blur transition-colors ${
            listening
              ? "border-cyan-400/60"
              : "border-white/10 focus-within:border-cyan-400/40"
          }`}
        >
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            disabled={!supported || disabled}
            aria-label={listening ? "Stop listening" : "Speak your goal"}
            title={
              supported
                ? "Speak your goal"
                : "Voice capture not supported here — type instead"
            }
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
              listening
                ? "animate-pulse-ring border-cyan-300/70 bg-cyan-400/20 text-cyan-200"
                : supported
                  ? "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
                  : "cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600"
            }`}
          >
            {listening ? <StopIcon /> : <MicIcon />}
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={supported ? "Speak or type your goal…" : "Type your goal…"}
            autoComplete="off"
            disabled={disabled}
            className="h-11 w-full bg-transparent text-base text-slate-100 placeholder-slate-500 outline-none disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={!canSubmit}
            className="h-11 shrink-0 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 text-sm font-semibold text-slate-950 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {listening ? "Listening…" : "Run goal"}
          </button>
        </div>
      </form>

      {listening && (
        <p className="mt-3 flex items-center gap-2 text-sm text-cyan-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          Listening — speak your goal. It runs as soon as you finish the sentence.
        </p>
      )}
      {!listening && note && (
        <p className="mt-3 text-sm text-amber-300/90">{note}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-500">Try</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setText(s);
              setNote(null);
            }}
            disabled={disabled}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3.5" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
