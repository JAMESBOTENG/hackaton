/**
 * Shared types mirroring the backend WebSocket protocol (see
 * backend/app/server.py for the authoritative message definitions).
 */

export type EventSource = "vision" | "audio" | "engine" | "user";

export interface BenchEvent {
  source: EventSource;
  type: string;
  step_id: number | null;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface Reagent {
  key: string;
  label: string;
  cap_color: string;
  zone: number;
}

export interface Step {
  id: number;
  type: "add" | "mix" | "incubate" | "manual";
  description: string;
  reagent: string | null;
  duration_s: number | null;
  warn_at_s: number | null;
}

export interface ProtocolView {
  name: string;
  target_zone: number;
  reagents: Record<string, Reagent>;
  steps: Step[];
}

export type AlertSeverity = "deviation" | "warning" | "overrun";

/** Server -> client messages. */
export type ServerMessage =
  | { type: "event"; event: BenchEvent }
  | {
      type: "step_state";
      current_step_index: number;
      current_step_id: number | null;
      completed: number[];
      finished: boolean;
    }
  | {
      type: "timer";
      step_id: number;
      remaining_s: number;
      duration_s: number;
      warn_at_s: number | null;
      running: boolean;
    }
  | { type: "alert"; text: string; severity: AlertSeverity }
  | {
      type: "status";
      state: string;
      detail: string;
      mat_detected: boolean;
      all_home: boolean;
      can_start: boolean;
      started?: boolean;
    }
  | { type: "frame"; jpeg_b64: string }
  | { type: "session_started"; protocol: ProtocolView }
  | { type: "report"; markdown: string; log_path: string; log: unknown }
  | { type: "error"; message: string };

export interface SessionStatus {
  state: string;
  detail: string;
  matDetected: boolean;
  allHome: boolean;
  canStart: boolean;
  started: boolean;
}

export interface TimerState {
  stepId: number;
  remainingS: number;
  durationS: number;
  warnAtS: number | null;
  running: boolean;
}

export interface AlertState {
  text: string;
  severity: AlertSeverity;
  at: number;
}
