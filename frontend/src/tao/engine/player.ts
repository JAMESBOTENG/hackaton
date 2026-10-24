/**
 * TAO — deterministic transcript player.
 *
 * ⚠️ DEMO / EDUCATIONAL. No network, no audio, no mic. Fully offline.
 *
 * Plays the scripted consultation (data/consultation.ts) on a timed schedule,
 * emitting immutable state snapshots to subscribers. As each turn "arrives" it:
 *   • appends the turn to the visible transcript, and
 *   • folds any revealed/negated findings into the cumulative finding set,
 * so a subscriber (the UI) can re-run the scoring engine and reshuffle the
 * probability board.
 *
 * Modeled on the subscriber pattern in frontend/src/demo/replay.ts
 * (onChange snapshots + play/reset/dispose lifecycle) but self-contained: it
 * depends only on the bundled TAO consultation script and carries no
 * Benchwatch-specific logic, no WebSocket, and no speech.
 */

import {
  consultation,
  type ConsultationTurn,
} from "../data/consultation";

/** Immutable snapshot handed to subscribers on every change. */
export interface PlayerState {
  /** Turns that have arrived so far, in order. */
  transcript: ConsultationTurn[];
  /** Cumulative set of currently-asserted finding ids. */
  asserted: string[];
  /** Cumulative set of explicitly-negated finding ids. */
  negated: string[];
  /** Playback has been started. */
  started: boolean;
  /** All turns have been delivered. */
  finished: boolean;
  /** The most recently delivered turn, or null before playback. */
  lastTurn: ConsultationTurn | null;
}

type Listener = (state: PlayerState) => void;

/**
 * Drives timed playback of the consultation script. Create one instance per run
 * (restart() replays from the top). Subscribe with onChange to receive
 * immutable snapshots; the engine stays presentation-agnostic (no DOM, no
 * speech, no scoring) so it is trivially testable.
 */
export class TranscriptPlayer {
  private readonly turns: ConsultationTurn[];

  private listeners = new Set<Listener>();
  private timeouts: ReturnType<typeof setTimeout>[] = [];

  private state: PlayerState;

  constructor(script: ConsultationTurn[] = consultation) {
    // Defensive copy, sorted by time so playback order is deterministic
    // regardless of how the script was authored.
    this.turns = [...script].sort((a, b) => a.atMs - b.atMs);
    this.state = this.initialState();
  }

  private initialState(): PlayerState {
    return {
      transcript: [],
      asserted: [],
      negated: [],
      started: false,
      finished: false,
      lastTurn: null,
    };
  }

  /**
   * Total scripted runtime in ms, derived generically from the loaded script
   * (last turn's time plus a short pad) so the player can run ANY scenario to
   * completion, not just the bundled chest-pain case.
   */
  get durationMs(): number {
    if (this.turns.length === 0) return 0;
    return this.turns[this.turns.length - 1].atMs + 3000;
  }

  /** Subscribe; immediately receives the current snapshot. Returns unsubscribe. */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): PlayerState {
    return this.state;
  }

  private setState(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** Begin playback from the start. Safe to call once per run. */
  play() {
    if (this.state.started) return;
    this.setState({ started: true });
    for (const turn of this.turns) {
      const t = setTimeout(() => this.deliver(turn), Math.max(0, turn.atMs));
      this.timeouts.push(t);
    }
    // Schedule the finished flag just after the last turn.
    const end = setTimeout(
      () => this.setState({ finished: true }),
      Math.max(0, this.durationMs)
    );
    this.timeouts.push(end);
  }

  /** Stop everything and replay from the beginning. */
  restart() {
    this.clearSchedules();
    this.state = this.initialState();
    for (const l of this.listeners) l(this.state);
    this.play();
  }

  /** Tear down timers; call on unmount. */
  dispose() {
    this.clearSchedules();
    this.listeners.clear();
  }

  private clearSchedules() {
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
  }

  /**
   * Apply one turn: append it to the transcript and fold its revealed/negated
   * findings into the cumulative sets. Asserting a finding removes it from the
   * negated set and vice-versa, so the two sets never conflict.
   */
  private deliver(turn: ConsultationTurn) {
    const asserted = new Set(this.state.asserted);
    const negated = new Set(this.state.negated);

    for (const id of turn.revealsFindings ?? []) {
      negated.delete(id);
      asserted.add(id);
    }
    for (const id of turn.negatesFindings ?? []) {
      asserted.delete(id);
      negated.add(id);
    }

    this.setState({
      transcript: [...this.state.transcript, turn],
      asserted: [...asserted],
      negated: [...negated],
      lastTurn: turn,
    });
  }
}
