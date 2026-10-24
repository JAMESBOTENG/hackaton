/**
 * TAO — Diagnostic Co-pilot (top-level page, the DEFAULT app).
 *
 * ⚠️ DECISION SUPPORT, NOT A DIAGNOSIS. Educational demo built on a curated
 * teaching dataset. Fully offline: no backend, no API key, no microphone
 * required. The scripted doctor-patient consultation is the guaranteed path.
 *
 * Layout (Boardroom Navy design system):
 *   • LEFT + CENTER (majority width) — headline intelligence (suggested next
 *     question + evidence-confidence meter + live findings rail) above the
 *     animated, color-coded, ranked probability board that reshuffles as
 *     findings accumulate.
 *   • RIGHT column — the live consultation transcript, streaming the scripted
 *     turns (doctor vs patient visually distinguished, finding chips).
 *
 * Data flow: subscribe to the deterministic TranscriptPlayer, feed its
 * cumulative {asserted, negated} finding sets into scoreConditions() against the
 * SELECTED scenario's condition pool, and drive the board + the new
 * next-question / confidence / rail panels from that pure engine output.
 *
 * Scenarios: a clean header selector switches between the bundled cases. Picking
 * one rebuilds the player from that scenario's consultation, resets playback,
 * and scores against its conditionPool so (e.g.) headache conditions never
 * appear in the chest-pain board.
 *
 * Optional progressive enhancements, all guarded so they can never break the
 * scripted demo:
 *   • a Web Speech mic toggle (OFF by default) that appends recognized speech
 *     to the transcript and keyword-matches it to findings, and
 *   • live PubMed citations in the detail modal (see pubmed.ts).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { TranscriptPlayer, type PlayerState } from "./engine/player";
import { scoreConditions, type ScoredCondition } from "./engine/score";
import { suggestNextQuestion } from "./engine/nextQuestion";
import { evidenceConfidence } from "./engine/confidence";
import { runEngineSelfCheck } from "./engine/selfcheck";
import type { ConsultationTurn } from "./data/consultation";
import { findings } from "./data/findings";
import {
  scenarios,
  scenariosById,
  defaultScenarioId,
} from "./data/scenarios";
import ProbabilityBoard from "./components/ProbabilityBoard";
import ConditionDetail from "./components/ConditionDetail";
import TranscriptPanel from "./components/TranscriptPanel";
import NextQuestion from "./components/NextQuestion";
import ConfidenceMeter from "./components/ConfidenceMeter";
import FindingsRail from "./components/FindingsRail";

export default function TaoApp() {
  // Selected scenario drives both the player script and the scored pool.
  const [scenarioId, setScenarioId] = useState<string>(defaultScenarioId);
  const scenario = scenariosById[scenarioId] ?? scenariosById[defaultScenarioId];

  // Rebuild the player whenever the scenario changes (resets playback).
  const player = useMemo(
    () => new TranscriptPlayer(scenario.consultation),
    [scenario]
  );
  const [state, setState] = useState<PlayerState>(() => player.getState());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Optional live-mic (Web Speech) enhancement. OFF by default.
  const [micOn, setMicOn] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [liveTurns, setLiveTurns] = useState<ConsultationTurn[]>([]);
  const [liveAsserted, setLiveAsserted] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null);

  // DEV-only: assert the deterministic engine invariants once at startup.
  useEffect(() => {
    runEngineSelfCheck();
  }, []);

  // Subscribe to the deterministic player. Cleanup disposes timers on unmount
  // AND whenever the player instance changes (scenario switch).
  useEffect(() => {
    setState(player.getState());
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

  const findingState = useMemo(
    () => ({ asserted, negated: state.negated }),
    [asserted, state.negated]
  );

  const scored: ScoredCondition[] = useMemo(
    () => scoreConditions(findingState, scenario.conditionPool),
    [findingState, scenario]
  );

  // Headline intelligence derived purely from the deterministic engine.
  const suggestion = useMemo(
    () => suggestNextQuestion(scored, findingState),
    [scored, findingState]
  );
  const confidence = useMemo(
    () => evidenceConfidence(scored, findingState),
    [scored, findingState]
  );

  // Finding ids the latest transcript turn touched — for the transcript→card link.
  const lastTurnFindings = useMemo(() => {
    const t = state.lastTurn;
    if (!t) return [];
    return [...(t.revealsFindings ?? []), ...(t.negatesFindings ?? [])];
  }, [state.lastTurn]);

  const selected = useMemo(
    () => (selectedId ? scored.find((s) => s.conditionId === selectedId) : null),
    [selectedId, scored]
  );

  const start = () => {
    setSelectedId(null);
    player.play();
  };

  const restart = () => {
    setSelectedId(null);
    setLiveTurns([]);
    setLiveAsserted([]);
    player.restart();
  };

  // Switch scenario: stop the mic, clear live state + selection, swap the
  // scenario id (which rebuilds the player and resets playback via useMemo).
  const changeScenario = (id: string) => {
    if (id === scenarioId) return;
    stopRecognition(recognitionRef);
    setMicOn(false);
    setSelectedId(null);
    setLiveTurns([]);
    setLiveAsserted([]);
    setScenarioId(id);
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
    return () => stopRecognition(recognitionRef);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-surface text-content">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline bg-surface-raised px-6 py-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-base font-black tracking-tight text-content-inverse shadow-raised ring-1 ring-brand-400/40">
            TAO
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-content">
              TAO{" "}
              <span className="font-normal text-content-subtle">·</span>{" "}
              <span className="text-content-muted">Diagnostic Co-pilot</span>
            </h1>
            <p className="text-xs text-content-subtle">
              Listens to the consultation and ranks what it could be, with the
              research behind every call.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scenario selector */}
          <label className="flex items-center gap-2">
            <span className="text-eyebrow text-2xs font-semibold uppercase text-content-subtle">
              Scenario
            </span>
            <select
              value={scenarioId}
              onChange={(e) => changeScenario(e.target.value)}
              aria-label="Select consultation scenario"
              className="rounded-md border border-hairline bg-surface-inset px-3 py-2 text-sm font-medium text-content transition-colors hover:border-hairline-strong focus:border-brand-500"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id} className="bg-surface-overlay">
                  {s.title}
                </option>
              ))}
            </select>
          </label>

          {micSupported && (
            <button
              onClick={toggleMic}
              title="Optional: use your microphone to add live speech to the transcript"
              className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                micOn
                  ? "border-critical-500/50 bg-critical-500/15 text-critical-200 hover:bg-critical-500/25"
                  : "border-hairline bg-surface-inset text-content-muted hover:bg-surface-raised"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  micOn ? "animate-pulse bg-critical-400" : "bg-ink-500"
                }`}
              />
              {micOn ? "Mic on" : "Mic (optional)"}
            </button>
          )}
          {!state.started ? (
            <button
              onClick={start}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-500"
            >
              Start
            </button>
          ) : (
            <button
              onClick={restart}
              className="rounded-md border border-hairline bg-surface-inset px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-raised"
            >
              Restart
            </button>
          )}
        </div>
      </header>

      {/* Disclaimer — visible but non-intrusive (invariant 1) */}
      <div className="border-b border-signal-500/20 bg-signal-500/10 px-6 py-2 text-center text-xs text-signal-200/90">
        Decision support, not a diagnosis. Not a substitute for clinical
        judgment.
      </div>

      {/* Main layout: board (left+center) + transcript (right) */}
      <main className="mx-auto grid w-full max-w-board flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-eyebrow text-2xs font-semibold uppercase text-content-muted">
                Differential diagnosis
              </h2>
              <p className="mt-0.5 text-xs text-content-subtle">
                {scenario.description}
              </p>
            </div>
            <span className="text-xs text-content-subtle">
              {state.finished
                ? "Consultation complete"
                : state.started
                ? "Updating live…"
                : "Ranked by current evidence"}
            </span>
          </div>

          {/* Headline intelligence */}
          <div className="mb-3 space-y-3">
            <NextQuestion suggestion={suggestion} />
            <ConfidenceMeter confidence={confidence} />
            <FindingsRail asserted={asserted} negated={state.negated} />
          </div>

          {!state.started && (
            <div className="mb-3 rounded-lg border border-brand-800/50 bg-brand-500/10 px-4 py-3 text-sm text-content">
              Press <span className="font-semibold">Start</span> to play the
              scripted consultation. As the patient speaks, the board reshuffles
              in real time and the can&rsquo;t-miss emergencies stay on the
              radar. Click any condition to see why and open its sources.
            </div>
          )}

          <ProbabilityBoard
            scored={scored}
            lastTurnFindings={lastTurnFindings}
            onSelect={setSelectedId}
          />

          <p className="mt-4 text-center text-2xs text-content-subtle">
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
