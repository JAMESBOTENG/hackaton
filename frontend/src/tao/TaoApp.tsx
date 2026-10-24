/**
 * TAO — Diagnostic Co-pilot (top-level page, the DEFAULT app).
 *
 * ⚠️ DECISION SUPPORT, NOT A DIAGNOSIS. Educational demo built on a curated
 * teaching dataset. Fully offline: no backend, no API key, no microphone
 * required. The scripted doctor-patient consultation is the guaranteed path.
 *
 * Layout:
 *   • LEFT + CENTER (majority width) — the animated, color-coded, ranked
 *     probability board that reshuffles as findings accumulate.
 *   • RIGHT column — the live consultation transcript, streaming the scripted
 *     turns (doctor vs patient visually distinguished).
 *
 * Data flow: subscribe to the deterministic TranscriptPlayer (FEAT-001), feed
 * its cumulative {asserted, negated} finding sets into scoreConditions()
 * (FEAT-001), and drive both the board and the transcript from that state.
 *
 * Optional progressive enhancements, all guarded so they can never break the
 * scripted demo:
 *   • a Web Speech mic toggle (OFF by default) that appends recognized speech
 *     to the transcript and keyword-matches it to findings, and
 *   • live PubMed citations in the detail modal (see pubmed.ts).
 *
 * Styling mirrors the Benchwatch ReplayApp conventions: Tailwind dark slate
 * theme, Start/Restart controls, subscriber lifecycle via useEffect cleanup.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TranscriptPlayer, type PlayerState } from "./engine/player";
import { scoreConditions, type ScoredCondition } from "./engine/score";
import type { ConsultationTurn } from "./data/consultation";
import { findings } from "./data/findings";
import ProbabilityBoard from "./components/ProbabilityBoard";
import ConditionDetail from "./components/ConditionDetail";
import TranscriptPanel from "./components/TranscriptPanel";

export default function TaoApp() {
  const player = useMemo(() => new TranscriptPlayer(), []);
  const [state, setState] = useState<PlayerState>(() => player.getState());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Optional live-mic (Web Speech) enhancement. OFF by default.
  const [micOn, setMicOn] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [liveTurns, setLiveTurns] = useState<ConsultationTurn[]>([]);
  const [liveAsserted, setLiveAsserted] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null);

  // Subscribe to the deterministic player. Cleanup disposes timers on unmount.
  useEffect(() => {
    const unsub = player.onChange(setState);
    return () => {
      unsub();
      player.dispose();
    };
  }, [player]);

  // Detect Web Speech support once (guarded; never throws).
  useEffect(() => {
    try {
      const w = window as any;
      setMicSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    } catch {
      setMicSupported(false);
    }
  }, []);

  // Combine scripted + live-mic transcript/findings for the board and panel.
  const transcript = useMemo(
    () => [...state.transcript, ...liveTurns],
    [state.transcript, liveTurns]
  );
  const asserted = useMemo(
    () => Array.from(new Set([...state.asserted, ...liveAsserted])),
    [state.asserted, liveAsserted]
  );

  const scored: ScoredCondition[] = useMemo(
    () => scoreConditions({ asserted, negated: state.negated }),
    [asserted, state.negated]
  );

  const selected = useMemo(
    () => (selectedId ? scored.find((s) => s.conditionId === selectedId) : null),
    [selectedId, scored]
  );

  const start = () => {
    // The click is the user gesture needed before speech/mic is allowed.
    setSelectedId(null);
    player.play();
  };

  const restart = () => {
    setSelectedId(null);
    setLiveTurns([]);
    setLiveAsserted([]);
    player.restart();
  };

  // ── Optional mic toggle, fully guarded ───────────────────────────────────
  const toggleMic = () => {
    if (micOn) {
      stopRecognition(recognitionRef);
      setMicOn(false);
      return;
    }
    const ok = startRecognition(recognitionRef, (text) => {
      setLiveTurns((prev) => [
        ...prev,
        { atMs: Date.now(), speaker: "patient", text },
      ]);
      const matched = matchFindings(text);
      if (matched.length > 0) {
        setLiveAsserted((prev) => Array.from(new Set([...prev, ...matched])));
      }
    });
    setMicOn(ok);
  };

  useEffect(() => {
    // Ensure the recognizer is torn down on unmount.
    return () => stopRecognition(recognitionRef);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-lg font-black tracking-tight text-white shadow-lg">
            TAO
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">
              TAO <span className="text-slate-500">·</span>{" "}
              <span className="text-slate-300">Diagnostic Co-pilot</span>
            </h1>
            <p className="text-xs text-slate-400">
              Listens to the consultation and ranks what it could be, with the
              research behind every call.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {micSupported && (
            <button
              onClick={toggleMic}
              title="Optional: use your microphone to add live speech to the transcript"
              className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                micOn
                  ? "border-rose-500/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  micOn ? "animate-pulse bg-rose-400" : "bg-slate-500"
                }`}
              />
              {micOn ? "Mic on" : "Mic (optional)"}
            </button>
          )}
          {!state.started ? (
            <button
              onClick={start}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500"
            >
              Start
            </button>
          ) : (
            <button
              onClick={restart}
              className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700"
            >
              Restart
            </button>
          )}
        </div>
      </header>

      {/* Disclaimer — visible but non-intrusive */}
      <div className="border-b border-amber-500/20 bg-amber-500/10 px-6 py-2 text-center text-xs text-amber-200/90">
        Decision support, not a diagnosis. Not a substitute for clinical
        judgment.
      </div>

      {/* Main layout: board (left+center) + transcript (right) */}
      <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Differential diagnosis
            </h2>
            <span className="text-xs text-slate-500">
              {state.finished
                ? "Consultation complete"
                : state.started
                ? "Updating live…"
                : "Ranked by current evidence"}
            </span>
          </div>

          {!state.started && (
            <div className="mb-3 rounded-lg border border-sky-700/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              Press <span className="font-semibold">Start</span> to play a
              scripted chest-pain consultation. As the patient speaks, the board
              reshuffles in real time and the can&rsquo;t-miss emergencies stay
              on the radar. Click any condition to see why and open its sources.
            </div>
          )}

          <ProbabilityBoard scored={scored} onSelect={setSelectedId} />

          <p className="mt-4 text-center text-[11px] text-slate-600">
            Probabilities are a transparent share of weighted evidence from a
            curated teaching dataset, not validated clinical risk.
          </p>
        </div>

        <div className="min-h-[24rem] lg:h-[calc(100vh-10rem)]">
          <TranscriptPanel
            transcript={transcript}
            started={state.started}
            liveListening={micOn}
          />
        </div>
      </main>

      {selected && (
        <ConditionDetail scored={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

/**
 * Keyword -> finding matcher for the optional live mic. Intentionally simple:
 * it scans recognized text for a finding's label/canonical keywords. The
 * scripted path never depends on this.
 */
function matchFindings(text: string): string[] {
  const hay = text.toLowerCase();
  const matched: string[] = [];
  for (const f of findings) {
    const needles = [f.label, f.canonical]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4);
    if (needles.some((n) => hay.includes(n))) matched.push(f.id);
  }
  return matched;
}

/**
 * Start Web Speech recognition, guarded. Returns true if it started. Any lack
 * of support, permission denial, or runtime error leaves the scripted path
 * untouched and returns false.
 */
function startRecognition(
  ref: React.MutableRefObject<any>,
  onText: (text: string) => void
): boolean {
  try {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return false;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event: any) => {
      try {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const t = String(result[0]?.transcript ?? "").trim();
            if (t) onText(t);
          }
        }
      } catch {
        /* ignore malformed events */
      }
    };
    rec.onerror = () => {
      /* denied/unsupported: stay silent, scripted path unaffected */
    };
    rec.start();
    ref.current = rec;
    return true;
  } catch {
    return false;
  }
}

/** Stop and release a running recognizer, guarded. */
function stopRecognition(ref: React.MutableRefObject<any>) {
  try {
    ref.current?.stop?.();
  } catch {
    /* ignore */
  }
  ref.current = null;
}
