import { useEffect, useId, useMemo, useRef, useState } from "react";
import { conditionsById } from "../data/conditions";
import { findingsById } from "../data/findings";
import type { ScoredCondition } from "../engine/score";
import { fetchPubMedCitations, type PubMedCitation } from "../pubmed";
import Icon from "./Icon";

export default function ConditionDetail({ scored, onClose }: { scored: ScoredCondition; onClose: () => void }) {
  const condition = conditionsById[scored.conditionId];
  const [live, setLive] = useState<PubMedCitation[]>([]);
  const [loading, setLoading] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId(); const descriptionId = useId();

  useEffect(() => { if (!condition) return; let active = true; setLive([]); setLoading(true); fetchPubMedCitations(`${condition.name} diagnosis`).then((items) => { if (active) { setLive(items); setLoading(false); } }); return () => { active = false; }; }, [condition]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const dialog = dialogRef.current; dialog?.querySelector<HTMLElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button,a[href],[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("keydown", keydown); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [onClose]);

  const summary = useMemo(() => {
    const up = scored.contributingFindings.filter((item) => item.direction === "up").slice(0, 2).map((item) => findingsById[item.findingId]?.label.toLowerCase()).filter(Boolean);
    const down = scored.contributingFindings.filter((item) => item.direction === "down").slice(0, 2).map((item) => findingsById[item.findingId]?.label.toLowerCase()).filter(Boolean);
    if (!up.length && !down.length) return "No case findings have yet changed this condition from its illustrative baseline.";
    return `${up.length ? `Current evidence raises alignment through ${up.join(" and ")}` : "No current evidence raises alignment"}${down.length ? `, while ${down.join(" and ")} lower it.` : "."}`;
  }, [scored]);
  if (!condition) return null;
  const raised = scored.contributingFindings.filter((item) => item.direction === "up");
  const lowered = scored.contributingFindings.filter((item) => item.direction === "down");

  return <div className="tao-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className="tao-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <header><div><span>Live evidence snapshot</span><h2 id={titleId}>{condition.name}</h2><p id={descriptionId}>{condition.description}</p></div><div className="tao-modal-score"><strong>{Math.round(scored.probability * 100)}%</strong><small>evidence share</small></div><button onClick={onClose} aria-label="Close detail"><Icon name="close"/></button></header>
    <div className="tao-modal-body"><section><div className="tao-section-heading is-small"><div><span>Traceable rationale</span><h3>Why it is here now</h3></div></div><p className="tao-live-summary">{summary}</p><div className="tao-reason-grid"><Reason title="Raised by" items={raised}/><Reason title="Lowered by" items={lowered}/></div>
      <div className="tao-equation"><h4>Score calculation</h4><div><span>Illustrative baseline</span><b>{scored.baseline.toFixed(2)}</b></div>{scored.contributingFindings.map((item) => <div key={`${item.findingId}-${item.negated}`}><span>{item.negated ? findingsById[item.findingId]?.negationLabel ?? item.findingId : findingsById[item.findingId]?.label ?? item.findingId}<small>{item.negated ? "negated · sign reversed" : "present"}</small></span><b className={item.weight >= 0 ? "is-positive" : "is-negative"}>{item.weight >= 0 ? "+" : ""}{item.weight.toFixed(2)}</b></div>)}<div><span>Raw score</span><b>{scored.rawScore.toFixed(2)}</b></div><div><span>Clamped score</span><b>{scored.clampedScore.toFixed(2)}</b></div><div className="is-total"><span>Normalized evidence share</span><b>{scored.clampedScore.toFixed(2)} ÷ {scored.totalPoolScore.toFixed(2)} = {Math.round(scored.probability * 100)}%</b></div></div>
    </section><section className="tao-sources"><div className="tao-section-heading is-small"><div><span>Reference layer</span><h3>Sources</h3></div></div><p>Curated citations remain available; opening sources requires a connection.</p><ul>{condition.references.map((reference) => <li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer"><span>{reference.source}</span>{reference.title}<b>↗</b></a></li>)}</ul><h4>Live PubMed enhancement</h4>{loading ? <div className="tao-source-loading">Searching without blocking the case view…</div> : live.length ? <ul>{live.map((item) => <li key={item.pmid}><a href={item.url} target="_blank" rel="noreferrer"><span>PubMed</span>{item.title}<b>↗</b></a></li>)}</ul> : <p>No live results available. Bundled citation metadata remains visible above.</p>}</section></div>
    <footer>Illustrative model · Decision support, not a diagnosis.</footer>
  </div></div>;
}

function Reason({ title, items }: { title: string; items: ScoredCondition["contributingFindings"] }) { return <div><h4>{title}</h4>{items.length ? <ul>{items.map((item) => <li key={item.findingId}><i />{item.negated ? findingsById[item.findingId]?.negationLabel : findingsById[item.findingId]?.label}<b>{item.weight >= 0 ? "+" : ""}{item.weight.toFixed(1)}</b></li>)}</ul> : <p>None yet</p>}</div>; }
