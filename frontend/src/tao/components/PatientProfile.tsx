import { useEffect, useId, useRef } from "react";
import type { Scenario } from "../data/scenarios";
import { findingsById } from "../data/findings";
import Icon from "./Icon";

export default function PatientProfile({ scenario, onClose }: { scenario: Scenario; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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

  const patient = scenario.patient;
  return <div className="tao-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} className="tao-modal tao-profile-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header><div><span>Fictional patient chart</span><h2 id={titleId}>{patient.displayName}</h2><p id={descriptionId}>{patient.ageYears} years · {patient.sex}{patient.pronouns ? ` · ${patient.pronouns}` : ""}{patient.occupation ? ` · ${patient.occupation}` : ""} · {patient.chartId}</p></div><button onClick={onClose} aria-label="Close patient profile"><Icon name="close" /></button></header>
      <div className="tao-profile-body">
        <section><div className="tao-section-heading is-small"><div><span>At presentation</span><h3>Vitals</h3></div></div><div className="tao-vitals">{patient.vitals.map((vital) => <div className={`is-${vital.status ?? "normal"}`} key={vital.label}><span>{vital.label}</span><strong>{vital.value}</strong></div>)}</div></section>
        <ProfileList title="History" items={patient.history} />
        <ProfileList title="Medications" items={patient.medications} />
        <ProfileList title="Allergies" items={patient.allergies} />
        <ProfileList title="Social context" items={patient.social} />
        <ProfileList title="Family history" items={patient.familyHistory} />
        <section className="tao-chart-evidence"><div className="tao-section-heading is-small"><div><span>Deterministic provenance</span><h3>Chart findings committed to ranking</h3></div></div><div>{scenario.initialEvidence.map((item) => <span className={`is-${item.status}`} key={item.findingId}>{item.status === "absent" ? findingsById[item.findingId]?.negationLabel : findingsById[item.findingId]?.label}<small>chart · {item.basis}</small></span>)}</div><p>Only these authored finding IDs affect ranking. Narrative profile text is never parsed.</p></section>
      </div>
      <footer>Fictional educational chart · Decision support, not a diagnosis.</footer>
    </div>
  </div>;
}

function ProfileList({ title, items }: { title: string; items: string[] }) {
  return <section className="tao-profile-list"><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>;
}
