import type { ScoredCondition } from "../engine/score";
import { conditionsById } from "../data/conditions";
import { findingsById } from "../data/findings";

interface Props { scored: ScoredCondition; rank: number; delta: number; changed: boolean; linked: boolean; onClick: () => void; }

export default function ProbabilityCard({ scored, rank, delta, changed, linked, onClick }: Props) {
  const condition = conditionsById[scored.conditionId];
  if (!condition) return null;
  const share = Math.round(scored.probability * 100);
  const deltaPct = Math.round(delta * 100);
  const width = scored.cantMiss ? Math.max(2, share) : share;
  const support = scored.contributingFindings.filter((item) => item.direction === "up").slice(0, 2);
  return <button type="button" onClick={onClick} className={`tao-rank-card ${rank === 0 ? "is-leader" : ""} ${scored.cantMiss ? "is-critical" : ""} ${changed ? "tao-card-changed" : ""} ${linked ? "is-linked" : ""}`}>
    <span className="tao-rank-number">{String(rank + 1).padStart(2, "0")}</span>
    <span className="tao-rank-content"><span className="tao-rank-name">{condition.name}{scored.cantMiss && <em>Can&rsquo;t miss</em>}</span><span className="tao-rank-description">{condition.description}</span>
      {support.length > 0 && <span className="tao-rank-evidence">{support.map((item) => findingsById[item.findingId]?.label).filter(Boolean).join(" · ")}</span>}
    </span>
    <span className="tao-rank-score"><strong>{share}%</strong>{deltaPct !== 0 && <small className={deltaPct > 0 ? "is-up" : "is-down"}>{deltaPct > 0 ? "+" : ""}{deltaPct}</small>}</span>
    <span className="tao-rank-bar"><i style={{ width: `${width}%` }} /></span>
  </button>;
}
