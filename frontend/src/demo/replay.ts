/**
 * Deterministic, browser-only replay engine for the Benchwatch demo.
 *
 * This does NOT re-simulate the deterministic protocol engine. It faithfully
 * plays back the REAL recorded event log (demo_session.json) which is the
 * single source of truth, mapping each recorded Event to UI state exactly as
 * the live WebSocket handler in App.tsx does. The only thing it adds is
 * presentation pacing: the ~84s recorded span is compressed to a fixed
 * ~75s of wall-clock playback via a single time-scale factor applied to the
 * inter-event deltas, and the step-4 incubation countdown is ticked smoothly
 * (in scaled seconds) between the start of incubation (step 3 completed) and
 * the recorded warning / overrun so the viewer visibly sees it count down,
 * turn amber at the 50s mark, and overrun. That countdown is synthesized from
 * wall-clock scaled back to recorded seconds, so its visible amber flip and
 * overrun are presentation pacing that approximately coincides with (but is
 * not exactly locked to) the recorded timer_warning / timer_overrun events;
 * because the two run off independent clocks they can differ by ~1s.
 *
 * No WebSocket, no fetch, no camera, no mic. Everything is derived from the
 * bundled log.
 */
import type {
  AlertSeverity,
  AlertState,
  BenchEvent,
  ProtocolView,
  TimerState,
} from "../types";
import demoSession from "./demo_session.json";
import { demoProtocol } from "./demoProtocol";
import { demoReport } from "./demoReport";

/** Target wall-clock playback length, in seconds. */
const TARGET_PLAYBACK_S = 75;

/** How often the incubation countdown re-renders, in real wall-clock ms. */
const TIMER_TICK_MS = 100;

export interface ReplayState {
  protocol: ProtocolView;
  events: BenchEvent[];
  completed: number[];
  currentStepId: number | null;
  timer: TimerState | null;
  alert: AlertState | null;
  report: string | null;
  started: boolean;
  finished: boolean;
}

type Listener = (state: ReplayState) => void;

const ALERT_SEVERITIES: Record<string, AlertSeverity> = {
  deviation: "deviation",
  timer_warning: "warning",
  timer_overrun: "overrun",
};

function loadEvents(): BenchEvent[] {
  // Cast through the known shape; the JSON is the verbatim recorded log.
  return (demoSession as { events: BenchEvent[] }).events;
}

/**
 * Drives the replay. Create one instance per demo run (restart replaces it via
 * reset()). Subscribe with onChange to receive immutable state snapshots; call
 * speak() yourself from the App when alerts fire (kept out of the engine so the
 * engine stays presentation-agnostic and testable).
 */
export class ReplayEngine {
  private readonly log: BenchEvent[];
  private readonly scale: number;
  private readonly firstTs: number;

  private listeners = new Set<Listener>();
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  private state: ReplayState;

  // The step-4 incubation window, in recorded (unscaled) timestamps.
  private incubateStartTs: number | null = null;
  private readonly incubateDurationS: number;
  private readonly incubateWarnAtS: number | null;

  constructor() {
    this.log = loadEvents();
    this.firstTs = this.log.length > 0 ? this.log[0].timestamp : 0;
    const lastTs =
      this.log.length > 0 ? this.log[this.log.length - 1].timestamp : 0;
    const span = Math.max(0.001, lastTs - this.firstTs);
    this.scale = TARGET_PLAYBACK_S / span;

    const incubateStep = demoProtocol.steps.find((s) => s.type === "incubate");
    this.incubateDurationS = incubateStep?.duration_s ?? 60;
    this.incubateWarnAtS = incubateStep?.warn_at_s ?? null;

    this.state = this.initialState();
  }

  private initialState(): ReplayState {
    return {
      protocol: demoProtocol,
      events: [],
      completed: [],
      currentStepId: demoProtocol.steps.length > 0 ? demoProtocol.steps[0].id : null,
      timer: null,
      alert: null,
      report: null,
      started: false,
      finished: false,
    };
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): ReplayState {
    return this.state;
  }

  private setState(patch: Partial<ReplayState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** Begin playback from the start. Safe to call once per run. */
  play() {
    if (this.state.started) return;
    this.setState({ started: true });
    for (const ev of this.log) {
      const delayMs = (ev.timestamp - this.firstTs) * this.scale * 1000;
      const t = setTimeout(() => this.apply(ev), Math.max(0, delayMs));
      this.timeouts.push(t);
    }
  }

  /** Stop everything and reset to the pre-start state. */
  reset() {
    this.clearSchedules();
    this.incubateStartTs = null;
    this.state = this.initialState();
    for (const l of this.listeners) l(this.state);
  }

  /** Tear down timers; call on unmount. */
  dispose() {
    this.clearSchedules();
    this.listeners.clear();
  }

  private clearSchedules() {
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
    if (this.timerInterval != null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Apply one recorded event to the derived UI state, mirroring the live
   * handler's mapping: step_completed advances the checklist; deviation /
   * timer_warning / timer_overrun raise an alert; session_complete shows the
   * report. Every event is appended to the timeline.
   */
  private apply(ev: BenchEvent) {
    // Every fact lands on the timeline.
    const events = [...this.state.events, ev];
    const patch: Partial<ReplayState> = { events };

    switch (ev.type) {
      case "step_completed": {
        if (ev.step_id != null) {
          const completed = this.state.completed.includes(ev.step_id)
            ? this.state.completed
            : [...this.state.completed, ev.step_id];
          patch.completed = completed;
          patch.currentStepId = this.nextStepId(ev.step_id);

          // Starting incubation: step 3 completing makes step 4 (incubate)
          // the current step. Kick off the smooth countdown from here.
          if (patch.currentStepId != null) {
            const nextStep = demoProtocol.steps.find(
              (s) => s.id === patch.currentStepId
            );
            if (nextStep?.type === "incubate") {
              this.startIncubationTimer(ev.timestamp);
            }
          }
          // The incubate step itself completing stops the countdown.
          const doneStep = demoProtocol.steps.find((s) => s.id === ev.step_id);
          if (doneStep?.type === "incubate") {
            this.stopIncubationTimer();
          }
        }
        break;
      }
      case "deviation":
      case "timer_warning":
      case "timer_overrun": {
        const text =
          typeof ev.payload.message === "string" ? ev.payload.message : ev.type;
        const severity = ALERT_SEVERITIES[ev.type] ?? "deviation";
        patch.alert = { text, severity, at: Date.now() };
        this.setState(patch);
        this.emitAlert(text, severity);
        return;
      }
      case "session_complete": {
        patch.report = demoReport;
        patch.finished = true;
        this.stopIncubationTimer();
        break;
      }
    }

    this.setState(patch);
  }

  private nextStepId(completedId: number): number | null {
    const steps = demoProtocol.steps;
    const idx = steps.findIndex((s) => s.id === completedId);
    if (idx >= 0 && idx + 1 < steps.length) return steps[idx + 1].id;
    return null;
  }

  /**
   * Drive the incubation countdown smoothly. The recorded incubation starts
   * when step 3 completes (startTs) and runs for duration_s nominal. We tick in
   * real wall-clock but convert elapsed real time back into recorded seconds
   * via the scale factor so the displayed remaining time tracks the recorded
   * run. The amber flip and overrun this produces are recomputed from elapsed
   * time, so they approximately coincide with (but are not exactly locked to)
   * the recorded timer_warning / timer_overrun events and may differ by ~1s.
   */
  private startIncubationTimer(startTs: number) {
    this.incubateStartTs = startTs;
    const stepId = demoProtocol.steps.find((s) => s.type === "incubate")?.id ?? 4;
    const duration = this.incubateDurationS;
    const warnAt = this.incubateWarnAtS;
    const startReal = Date.now();

    const emit = () => {
      if (this.incubateStartTs == null) return;
      const elapsedRecorded = ((Date.now() - startReal) / 1000) / this.scale;
      const remaining = duration - elapsedRecorded;
      const timer: TimerState = {
        stepId,
        remainingS: remaining,
        durationS: duration,
        warnAtS: warnAt,
        running: true,
      };
      this.setState({ timer });
    };

    emit();
    this.timerInterval = setInterval(emit, TIMER_TICK_MS);
  }

  private stopIncubationTimer() {
    if (this.timerInterval != null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.incubateStartTs != null) {
      this.incubateStartTs = null;
      this.setState({ timer: null });
    }
  }

  // --- optional alert sink (speech) ------------------------------------

  private alertSink: ((text: string, severity: AlertSeverity) => void) | null =
    null;

  /** Register a callback invoked when an alert fires (used to speak it). */
  onAlert(sink: (text: string, severity: AlertSeverity) => void) {
    this.alertSink = sink;
  }

  private emitAlert(text: string, severity: AlertSeverity) {
    if (this.alertSink) this.alertSink(text, severity);
  }
}
