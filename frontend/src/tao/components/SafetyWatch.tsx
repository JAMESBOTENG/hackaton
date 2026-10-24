import { conditionsById } from "../data/conditions";
import type { ScoredCondition } from "../engine/score";
import Icon from "./Icon";

export default function SafetyWatch({ items, onSelect }: { items: ScoredCondition[]; onSelect: (id: string) => void }) {
  return <section className="tao-safety" aria-label="Safety watch">
    <div className="tao-safety-title"><Icon name="shield" size={16}/><span>Safety watch</span><small>Can&rsquo;t-miss considerations remain visible</small></div>
    <div className="tao-safety-list">{items.map((item) => <button key={item.conditionId} onClick={() => onSelect(item.conditionId)}>
      <span>{conditionsById[item.conditionId]?.name}</span><strong>{Math.round(item.probability * 100)}%</strong>
    </button>)}</div>
  </section>;
}
