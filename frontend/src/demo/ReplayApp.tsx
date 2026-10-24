/**
 * Browser-only REPLAY dashboard.
 *
 * This is the default experience of the deployed demo: a fully self-contained
 * playback of the REAL recorded Benchwatch session (backend/app/fixtures/
 * demo_session.json), bundled as a static asset. It opens NO WebSocket and
 * makes NO fetch to /protocols or any API — everything is derived from the
 * bundled log by the ReplayEngine, then rendered with the exact same dashboard
 * components the live mode uses (AlertBanner, Timer, Checklist, Timeline) plus
 * a simulated-feed stand-in for the camera.
 *
 * Alerts are spoken via the browser speechSynthesis API, guarded so a missing
 * or blocked speechSynthesis never throws and playback continues silently. The
 * visible "Start demo" button provides the user gesture browsers require before
 * speech is allowed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import AlertBanner from "../components/AlertBanner";
import Checklist from "../components/Checklist";
import Timeline from "../components/Timeline";
import Timer from "../components/Timer";
import SimulatedCameraView from "./SimulatedCameraView";
import { ReplayEngine, type ReplayState } from "./replay";

export default function ReplayApp() {
  const engine = useMemo(() => new ReplayEngine(), []);
  const [state, setState] = useState<ReplayState>(() => engine.getState());
  const lastSpokenRef = useRef<string>("");

  useEffect(() => {
    const unsub = engine.onChange(setState);
    engine.onAlert((text: string) => speak(text, lastSpokenRef));
    return () => {
      unsub();
      engine.dispose();
    };
  }, [engine]);

  const start = () => {
    // The click is the user gesture; warm up speech so later alerts are
    // allowed. Guarded so it never throws when speech is unavailable.
    primeSpeech();
    lastSpokenRef.current = "";
    engine.play();
  };

  const restart = () => {
    lastSpokenRef.current = "";
    engine.reset();
    // Replace the engine's schedule by playing again on the next tick. reset()
    // returns it to the pre-start state; a fresh play() re-runs the log.
    engine.play();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold">Benchwatch</h1>
          <p className="text-sm text-slate-400">
            A protocol-aware co-pilot that watches and listens at the lab bench.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs uppercase tracking-wide text-slate-400">
            Recorded replay
          </span>
          {!state.started ? (
            <button
              onClick={start}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500"
            >
              Start demo
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

      <main className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {!state.started && (
            <div className="rounded-lg border border-sky-700/50 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
              <p className="font-medium">
                Benchwatch watches a lab bench with a camera and microphone and
                keeps a technician on protocol — ticking off steps, timing
                incubations, and flagging the wrong reagent before it is poured.
              </p>
              <p className="mt-1 text-sky-200/80">
                This is a recorded replay of a real session (no camera, mic, or
                backend needed). Press <span className="font-semibold">Start demo</span> to play it
                back. Audio alerts use your browser&rsquo;s speech if available.
              </p>
            </div>
          )}
          <AlertBanner alert={state.alert} />
          <SimulatedCameraView protocol={state.protocol} events={state.events} />
          <Timer timer={state.timer} />
          {state.report && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-2 text-lg font-medium">Session report</h2>
              <pre className="whitespace-pre-wrap text-sm text-slate-300">
                {state.report}
              </pre>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="text-xs text-slate-500">
            {state.finished
              ? "Replay complete"
              : state.started
              ? "Replaying recorded session…"
              : "Ready"}
          </div>
          <Checklist
            protocol={state.protocol}
            completed={state.completed}
            currentStepId={state.currentStepId}
          />
          <div className="min-h-[16rem] flex-1">
            <Timeline events={state.events} />
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Speak an alert, guarded against environments where speechSynthesis is
 * missing or throws. Debounces duplicate consecutive alerts, mirroring the
 * live App.tsx speak() approach. Alerts are short and rare by design.
 */
function speak(text: string, lastSpokenRef: React.MutableRefObject<string>) {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (text === lastSpokenRef.current) return;
    lastSpokenRef.current = text;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    /* speech unavailable or blocked — playback continues silently */
  }
}

/**
 * Warm up speechSynthesis on the Start gesture so later alerts are permitted by
 * browser autoplay policy. Fully guarded; never throws.
 */
function primeSpeech() {
  try {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
