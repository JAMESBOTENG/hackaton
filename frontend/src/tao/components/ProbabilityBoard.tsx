import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ScoredCondition } from "../engine/score";
import { conditionsById } from "../data/conditions";
import ProbabilityCard from "./ProbabilityCard";

interface Props { scored: ScoredCondition[]; lastTurnFindings?: string[]; onSelect: (id: string) => void; resetKey: string; }
const MEANINGFUL_DELTA = 0.015;

export default function ProbabilityBoard({ scored, lastTurnFindings = [], onSelect, resetKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const previous = useRef(new Map<string, { probability: number; rank: number }>());
  const raf = useRef<number>();
  const [announcement, setAnnouncement] = useState("");

  const meta = useMemo(() => {
    const touched = new Set(lastTurnFindings);
    return new Map(scored.map((item, rank) => {
      const old = previous.current.get(item.conditionId);
      const delta = old ? item.probability - old.probability : 0;
      const condition = conditionsById[item.conditionId];
      const linked = !!condition && [...touched].some((id) => id in condition.findingWeights);
      return [item.conditionId, { delta, changed: !!old && Math.abs(delta) >= MEANINGFUL_DELTA, linked, rankMove: old ? old.rank - rank : 0 }];
    }));
  }, [scored, lastTurnFindings]);

  useEffect(() => {
    positions.current.clear(); previous.current.clear(); setAnnouncement("");
  }, [resetKey]);

  useLayoutEffect(() => {
    const cards = containerRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [];
    cards.forEach((card) => {
      const id = card.dataset.cardId!;
      const top = card.getBoundingClientRect().top;
      const old = positions.current.get(id);
      if (old !== undefined && Math.abs(old - top) > 1) {
        card.style.transition = "none"; card.style.transform = `translateY(${old - top}px)`;
        raf.current = requestAnimationFrame(() => { card.style.transition = "transform 420ms cubic-bezier(.22,1,.36,1)"; card.style.transform = ""; });
      }
      positions.current.set(id, top);
    });
    const biggest = [...meta.entries()].sort((a, b) => Math.abs(b[1].rankMove) - Math.abs(a[1].rankMove))[0];
    if (biggest?.[1].rankMove) {
      const name = conditionsById[biggest[0]]?.name ?? biggest[0];
      setAnnouncement(`${name} moved ${biggest[1].rankMove > 0 ? "up" : "down"} ${Math.abs(biggest[1].rankMove)} ${Math.abs(biggest[1].rankMove) === 1 ? "place" : "places"}.`);
    }
    previous.current = new Map(scored.map((item, rank) => [item.conditionId, { probability: item.probability, rank }]));
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [scored, meta]);

  return <section className="tao-board" aria-labelledby="differential-title">
    <div className="tao-section-heading"><div><span>Ranked evidence</span><h2 id="differential-title">Leading considerations</h2></div><p>Illustrative model · normalized evidence alignment</p></div>
    <div ref={containerRef} className="tao-rank-list">{scored.map((item, rank) => {
      const info = meta.get(item.conditionId) ?? { delta: 0, changed: false, linked: false, rankMove: 0 };
      return <div key={item.conditionId} data-card-id={item.conditionId}><ProbabilityCard scored={item} rank={rank} delta={info.delta} changed={info.changed} linked={info.linked} onClick={() => onSelect(item.conditionId)} /></div>;
    })}</div>
    <p className="tao-sr-only" aria-live="polite">{announcement}</p>
  </section>;
}
