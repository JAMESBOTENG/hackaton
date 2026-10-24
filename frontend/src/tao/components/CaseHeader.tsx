import type { Scenario } from "../data/scenarios";
import type { PlayerState } from "../engine/player";
import Icon from "./Icon";

interface Props { scenario: Scenario; state: PlayerState; evidenceCount: number; onOpenProfile: () => void; }
const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export default function CaseHeader({ scenario, state, evidenceCount, onOpenProfile }: Props) {
  const status = state.finished ? "Complete" : state.started ? state.paused ? "Paused" : "Playing" : "Ready";
  const patient = scenario.patient;
  return <section className="tao-case-header" aria-label="Case overview">
    <div className="tao-case-identity">
      <span className="tao-demo-badge">Fictional demo</span>
      <div><h1>{scenario.title}</h1><p>{scenario.complaint}</p></div>
    </div>
    <button className="tao-case-profile" type="button" onClick={onOpenProfile} aria-label={`Open patient profile for ${patient.displayName}`}>
      <Icon name="profile" size={17} /><span><small>Patient profile</small><strong>{patient.displayName} · {patient.ageYears} · {patient.sex} · {patient.chartId}</strong></span><Icon name="chevron" size={14} />
    </button>
    <dl className="tao-case-metrics">
      <div><dt>Status</dt><dd><i className={`tao-status-dot is-${status.toLowerCase()}`} />{status}</dd></div>
      <div><dt>Evidence</dt><dd>{evidenceCount}</dd></div>
      <div><dt>Time</dt><dd className="tao-tabular">{time(state.elapsedMs)} / {time(state.durationMs)}</dd></div>
    </dl>
  </section>;
}
