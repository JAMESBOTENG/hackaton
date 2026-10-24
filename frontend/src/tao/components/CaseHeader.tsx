import type { Scenario } from "../data/scenarios";
import type { PlayerState } from "../engine/player";

interface Props { scenario: Scenario; state: PlayerState; evidenceCount: number; }
const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export default function CaseHeader({ scenario, state, evidenceCount }: Props) {
  const status = state.finished ? "Complete" : state.started ? state.paused ? "Paused" : "Playing" : "Ready";
  return <section className="tao-case-header" aria-label="Case overview">
    <div className="tao-case-identity">
      <span className="tao-demo-badge">Fictional demo</span>
      <div><h1>{scenario.title}</h1><p>{scenario.complaint}</p></div>
    </div>
    <div className="tao-case-profile"><span>Profile</span><strong>{scenario.patientProfile}</strong></div>
    <dl className="tao-case-metrics">
      <div><dt>Status</dt><dd><i className={`tao-status-dot is-${status.toLowerCase()}`} />{status}</dd></div>
      <div><dt>Evidence</dt><dd>{evidenceCount}</dd></div>
      <div><dt>Time</dt><dd className="tao-tabular">{time(state.elapsedMs)} / {time(state.durationMs)}</dd></div>
    </dl>
  </section>;
}
