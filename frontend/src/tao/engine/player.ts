import { consultation, type ConsultationTurn } from "../data/consultation";

export interface PlayerState {
  transcript: ConsultationTurn[];
  asserted: string[];
  negated: string[];
  started: boolean;
  paused: boolean;
  finished: boolean;
  elapsedMs: number;
  durationMs: number;
  playbackRate: 1 | 2;
  nextTurnIndex: number;
  lastTurn: ConsultationTurn | null;
}

type Listener = (state: PlayerState) => void;

/** Deterministic scripted player with pause, speed, stepping and clean disposal. */
export class TranscriptPlayer {
  private readonly turns: ConsultationTurn[];
  private readonly listeners = new Set<Listener>();
  private state: PlayerState;
  private timer: ReturnType<typeof setInterval> | null = null;
  private anchorRealMs = 0;
  private anchorElapsedMs = 0;

  constructor(script: ConsultationTurn[] = consultation) {
    this.turns = [...script].sort((a, b) => a.atMs - b.atMs);
    this.state = this.initialState();
  }

  get durationMs(): number {
    return this.turns.length ? this.turns[this.turns.length - 1].atMs + 3000 : 0;
  }

  private initialState(rate: 1 | 2 = 1): PlayerState {
    return {
      transcript: [], asserted: [], negated: [], started: false, paused: false,
      finished: false, elapsedMs: 0, durationMs: this.durationMs, playbackRate: rate,
      nextTurnIndex: 0, lastTurn: null,
    };
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  getState(): PlayerState { return this.snapshot(); }

  private snapshot(): PlayerState {
    return {
      ...this.state,
      transcript: [...this.state.transcript],
      asserted: [...this.state.asserted],
      negated: [...this.state.negated],
    };
  }

  private emit(patch: Partial<PlayerState> = {}) {
    this.state = { ...this.state, ...patch };
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  play() {
    if (this.state.finished) return;
    if (!this.state.started) this.emit({ started: true, paused: false });
    else if (this.state.paused) this.emit({ paused: false });
    else if (this.timer) return;
    this.anchorRealMs = performance.now();
    this.anchorElapsedMs = this.state.elapsedMs;
    this.advance();
    this.timer = setInterval(() => this.advance(), 100);
  }

  pause() {
    if (!this.state.started || this.state.paused || this.state.finished) return;
    this.advance();
    this.clearTimer();
    this.emit({ paused: true });
  }

  setPlaybackRate(rate: 1 | 2) {
    if (rate === this.state.playbackRate) return;
    const running = this.state.started && !this.state.paused && !this.state.finished;
    if (running) this.advance();
    this.emit({ playbackRate: rate });
    if (running) {
      this.anchorRealMs = performance.now();
      this.anchorElapsedMs = this.state.elapsedMs;
    }
  }

  /** Reveal through the next evidence turn; exhaustion consumes the tail and completes. */
  stepToNextFinding() {
    if (this.state.finished) return;
    this.clearTimer();
    let target = this.state.nextTurnIndex;
    while (target < this.turns.length) {
      const turn = this.turns[target];
      target += 1;
      if ((turn.revealsFindings?.length ?? 0) + (turn.negatesFindings?.length ?? 0) > 0) break;
    }
    for (let i = this.state.nextTurnIndex; i < target; i += 1) this.deliver(this.turns[i], i + 1);
    const exhausted = target >= this.turns.length;
    const elapsedMs = exhausted
      ? this.durationMs
      : Math.min(this.durationMs, this.turns[target - 1]?.atMs ?? this.state.elapsedMs);
    this.emit({
      started: true,
      paused: !exhausted,
      finished: exhausted,
      elapsedMs,
      nextTurnIndex: target,
    });
  }

  restart(autoPlay = true) {
    this.clearTimer();
    const rate = this.state.playbackRate;
    this.state = this.initialState(rate);
    this.emit();
    if (autoPlay) this.play();
  }

  dispose() {
    this.clearTimer();
    this.listeners.clear();
  }

  private advance() {
    if (this.state.paused || this.state.finished) return;
    const elapsedMs = Math.min(
      this.durationMs,
      this.anchorElapsedMs + (performance.now() - this.anchorRealMs) * this.state.playbackRate
    );
    let next = this.state.nextTurnIndex;
    while (next < this.turns.length && this.turns[next].atMs <= elapsedMs) {
      this.deliver(this.turns[next], next + 1);
      next += 1;
    }
    const finished = elapsedMs >= this.durationMs;
    this.emit({ elapsedMs, nextTurnIndex: next, finished, paused: finished ? false : this.state.paused });
    if (finished) this.clearTimer();
  }

  private deliver(turn: ConsultationTurn, nextTurnIndex: number) {
    const asserted = new Set(this.state.asserted);
    const negated = new Set(this.state.negated);
    for (const id of turn.revealsFindings ?? []) { negated.delete(id); asserted.add(id); }
    for (const id of turn.negatesFindings ?? []) { asserted.delete(id); negated.add(id); }
    this.state = {
      ...this.state,
      transcript: [...this.state.transcript, turn],
      asserted: [...asserted], negated: [...negated], lastTurn: turn, nextTurnIndex,
    };
  }

  private clearTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
