import { conditionsById } from "../data/conditions";
import type { ScoredCondition } from "../engine/score";
import Icon from "./Icon";

export default function RemainingDifferential({ items, onSelect }: { items: ScoredCondition[]; onSelect: (id: string) => void }) {
  if (!items.length) return null;
  return <details className="tao-remaining"><summary><span>Remaining differential ({items.length})</span><Icon name="chevron" size={16}/></summary>
    <div>{items.map((item) => <button key={item.conditionId} onClick={() => onSelect(item.conditionId)}><span>{conditionsById[item.conditionId]?.name}</span><strong>{Math.round(item.probability * 100)}%</strong></button>)}</div>
  </details>;
}
