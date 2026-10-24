import type { PlayerState } from "../engine/player";
import Icon from "./Icon";

interface Props { state: PlayerState; onPlayPause: () => void; onRate: () => void; onStep: () => void; onRestart: () => void; }
export default function PlaybackControls({ state, onPlayPause, onRate, onStep, onRestart }: Props) {
  const progress = state.durationMs ? Math.min(100, state.elapsedMs / state.durationMs * 100) : 0;
  return <section className="tao-playback" aria-label="Scripted demo playback">
    <button className="tao-icon-button is-primary" onClick={onPlayPause} disabled={state.finished} aria-label={state.started && !state.paused ? "Pause scripted demo" : "Play scripted demo"}>
      <Icon name={state.started && !state.paused && !state.finished ? "pause" : "play"} size={16} />
    </button>
    <button className="tao-control-button" onClick={onRate} aria-label={`Playback speed ${state.playbackRate} times`}>{state.playbackRate}×</button>
    <button className="tao-control-button" onClick={onStep} disabled={state.finished} title="Reveal through the next evidence-bearing turn"><Icon name="skip" size={15} /> Next evidence</button>
    <button className="tao-icon-button" onClick={onRestart} aria-label="Restart scripted demo"><Icon name="restart" size={16} /></button>
    <div className="tao-progress" role="progressbar" aria-label="Consultation progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
  </section>;
}
