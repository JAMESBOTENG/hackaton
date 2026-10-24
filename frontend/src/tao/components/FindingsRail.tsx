import { findingsById } from "../data/findings";
import type { ResolvedEvidenceItem } from "../engine/evidence";

export default function FindingsRail({ items, onReapplyClinician }: { items: ResolvedEvidenceItem[]; onReapplyClinician: (findingId: string, present: boolean) => void }) {
  return <section className="tao-findings" aria-label="Evidence history">
    <div className="tao-section-heading is-small"><div><span>Evidence history</span><h2>Current findings with source trail</h2></div><strong>{items.length}</strong></div>
    {items.length === 0 ? <p className="tao-empty-copy">No evidence committed yet. Start playback or answer the information gap.</p> : <div className="tao-findings-scroll">{items.map((item) => {
      const finding = findingsById[item.findingId];
      const label = item.status === "absent" ? finding?.negationLabel ?? `No ${finding?.label.toLowerCase()}` : finding?.label;
      const provenance = [
        item.source,
        item.corroboratedBy?.length ? `corroborates ${item.corroboratedBy.join(" + ")}` : "",
        item.supersedes ? `overrides ${item.supersedes}` : "",
      ].filter(Boolean).join(" · ");
      const title = [
        `Current source: ${item.source}.`,
        item.corroboratedBy?.length ? `Same-value corroboration: ${item.corroboratedBy.join(", ")}.` : "",
        item.supersedes ? `Later ${item.source} evidence supersedes contradictory ${item.supersedes} evidence.` : "",
      ].filter(Boolean).join(" ");
      return <span key={item.findingId} className={`tao-finding-chip is-${item.status} ${item.supersedes ? "has-override" : ""}`} title={title}><i />{label}<small>{provenance}</small>{item.source === "scripted" && item.supersedes === "clinician" && item.supersededStatus && <button type="button" onClick={() => onReapplyClinician(item.findingId, item.supersededStatus === "present")}>Reapply clinician {item.supersededStatus}</button>}</span>;
    })}</div>}
  </section>;
}
