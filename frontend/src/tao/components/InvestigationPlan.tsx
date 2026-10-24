import { useEffect, useId, useRef } from "react";
import { findingsById } from "../data/findings";
import type { InvestigationKind, InvestigationUrgency } from "../data/investigations";
import type { PlannedInvestigation } from "../engine/investigationPlan";
import Icon from "./Icon";

export const urgencyLabels: Record<InvestigationUrgency, string> = { immediate: "Immediate review", urgent: "Urgent consideration", follow_up: "Follow-up discussion" };
const roleLabels = { leading: "leading", safety_watch: "safety watch" } as const;

export function InvestigationControl({ plan, onOpen }: { plan: PlannedInvestigation[]; onOpen: () => void }) {
  const immediate = plan.filter((item) => item.urgency === "immediate").length;
  const urgent = plan.filter((item) => item.urgency === "urgent").length;
  return <button className="tao-investigation-trigger" type="button" onClick={onOpen}>
    <span><Icon name="laboratory" size={15} /><b>Suggested investigations</b></span>
    <small>{plan.length} options · {immediate ? `${immediate} immediate` : urgent ? `${urgent} urgent` : "follow-up"}</small>
  </button>;
}

export default function InvestigationPlan({ plan, onClose, onCondition }: { plan: PlannedInvestigation[]; onClose: () => void; onCondition: (id: string) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId(); const descriptionId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button,[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("keydown", keydown); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [onClose]);

  return <div className="tao-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="tao-modal tao-investigation-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header><div><span>Deterministic authored plan</span><h2 id={titleId}>Suggested investigations</h2><p id={descriptionId}>Options linked to normalized leaders when available, plus every safety-watch condition.</p></div><div className="tao-modal-score"><strong>{plan.length}</strong><small>deduplicated options</small></div><button onClick={onClose} aria-label="Close suggested investigations"><Icon name="close" /></button></header>
      <div className="tao-investigation-body">
        <div className="tao-local-disclaimer"><Icon name="shield" size={16} /><strong>Illustrative investigation options for clinician review; not an order set.</strong><span>Consider or discuss these options in clinical context. They do not confirm a diagnosis.</span></div>
        {plan.length === 0 ? <p className="tao-investigation-empty">No authored investigation options are available for this pool.</p> : (["immediate", "urgent", "follow_up"] as InvestigationUrgency[]).map((urgency) => {
          const items = plan.filter((item) => item.urgency === urgency);
          if (!items.length) return null;
          return <section className={`tao-investigation-group is-${urgency}`} key={urgency}><header><span>{urgencyLabels[urgency]}</span><b>{items.length}</b></header><div>{items.map((item) => <InvestigationCard key={item.id} item={item} onCondition={onCondition} />)}</div></section>;
        })}
      </div>
      <footer>Bundled educational metadata · No LLM or network participates.</footer>
    </div>
  </div>;
}

export function InvestigationCard({ item, onCondition, compact = false }: { item: PlannedInvestigation; onCondition: (id: string) => void; compact?: boolean }) {
  return <article className={`tao-investigation-card ${compact ? "is-compact" : ""}`}>
    <div className={`tao-investigation-kind is-${item.kind}`}><Icon name={item.kind as InvestigationKind} size={17} /></div>
    <div><header><h3>{item.label}</h3><span>{item.kind}</span></header><p>{item.description}</p><div className="tao-investigation-reasons">{item.reasons.map((reason) => <div key={reason.conditionId}><button type="button" onClick={() => onCondition(reason.conditionId)}>{reason.conditionName}</button><span>#{reason.rank} · {Math.round(reason.evidenceShare * 100)}% share · {urgencyLabels[reason.urgency]} · {reason.roles.map((role) => roleLabels[role]).join(" · ")}</span><p>{reason.rationale}</p>{reason.baselineOnly ? <small>No current case finding has moved this condition yet; it remains represented from its authored baseline.</small> : <small>Strongest current findings: {reason.strongestContributions.map((finding) => `${finding.negated ? findingsById[finding.findingId]?.negationLabel : findingsById[finding.findingId]?.label} (${finding.weight >= 0 ? "+" : ""}${finding.weight.toFixed(1)})`).join(", ")}</small>}</div>)}</div></div>
  </article>;
}
