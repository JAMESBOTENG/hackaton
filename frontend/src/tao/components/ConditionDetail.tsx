/**
 * TAO — condition detail modal (opens when a board card is clicked).
 *
 * Shows two things the clinician needs to trust (or challenge) the ranking:
 *   1. WHY — a plain-language summary built deterministically from the
 *      condition's whyTemplate plus the ACTUAL findings currently driving its
 *      score, phrased as "raised by: … ; lowered by: …" so the reasoning ties
 *      back to what the patient actually said.
 *   2. SOURCES — the condition's curated, clickable references (always shown,
 *      works offline), with any successfully-fetched live PubMed citations
 *      layered on top as a progressive enhancement.
 *
 * The PubMed fetch is best-effort (see pubmed.ts): if it fails or we are
 * offline, the bundled references remain and nothing breaks.
 */
import { useEffect, useRef, useState } from "react";
import { conditionsById } from "../data/conditions";
import { findingsById } from "../data/findings";
import type { ScoredCondition } from "../engine/score";
import { fetchPubMedCitations, type PubMedCitation } from "../pubmed";

interface Props {
  scored: ScoredCondition;
  onClose: () => void;
}

export default function ConditionDetail({ scored, onClose }: Props) {
  const condition = conditionsById[scored.conditionId];
  const [live, setLive] = useState<PubMedCitation[]>([]);
  const [liveState, setLiveState] = useState<"idle" | "loading" | "done">(
    "idle"
  );
  const closeRef = useRef<HTMLButtonElement>(null);

  // Progressive enhancement: try PubMed, but never block or break on failure.
  useEffect(() => {
    if (!condition) return;
    let cancelled = false;
    setLive([]);
    setLiveState("loading");
    fetchPubMedCitations(`${condition.name} chest pain diagnosis`)
      .then((results) => {
        if (cancelled) return;
        setLive(results);
        setLiveState("done");
      })
      .catch(() => {
        if (!cancelled) setLiveState("done");
      });
    return () => {
      cancelled = true;
    };
  }, [condition]);

  // Close on Escape; focus the close button for keyboard users.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!condition) return null;

  const raisedBy = scored.contributingFindings
    .filter((c) => c.direction === "up")
    .map((c) => findingLabel(c.findingId, c.negated));
  const loweredBy = scored.contributingFindings
    .filter((c) => c.direction === "down")
    .map((c) => findingLabel(c.findingId, c.negated));

  const pct = (scored.probability * 100).toFixed(1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${condition.name} detail`}
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-100">
                {condition.name}
              </h2>
              {condition.cantMiss && (
                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-200 ring-1 ring-rose-500/40">
                  Can&rsquo;t miss
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400">{condition.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="font-mono text-2xl font-bold tabular-nums text-sky-300">
              {pct}
              <span className="text-sm font-normal text-slate-500">%</span>
            </span>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close"
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700"
            >
              Back
            </button>
          </div>
        </div>

        {/* WHY */}
        <section className="px-6 py-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Why this is being considered
          </h3>
          <p className="text-sm leading-relaxed text-slate-200">
            {condition.whyTemplate}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ReasonColumn
              title="Raised by"
              accent="text-emerald-300"
              dot="bg-emerald-400"
              items={raisedBy}
              emptyText="No supporting findings yet."
            />
            <ReasonColumn
              title="Lowered by"
              accent="text-rose-300"
              dot="bg-rose-400"
              items={loweredBy}
              emptyText="No findings arguing against it yet."
            />
          </div>
        </section>

        {/* SOURCES */}
        <section className="border-t border-slate-800 px-6 py-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Sources &amp; research
          </h3>

          <ul className="space-y-2">
            {condition.references.map((ref) => (
              <li key={ref.url}>
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2 text-sm text-sky-300 transition-colors hover:border-sky-600/50 hover:bg-slate-800"
                >
                  <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                    {ref.source}
                  </span>
                  <span className="truncate">{ref.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-500">
                    open ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>

          {/* Live PubMed layer (progressive enhancement) */}
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                Live from PubMed
              </span>
              {liveState === "loading" && (
                <span className="text-[11px] text-slate-500">searching…</span>
              )}
            </div>
            {live.length > 0 ? (
              <ul className="space-y-2">
                {live.map((c) => (
                  <li key={c.pmid}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-emerald-800/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200 transition-colors hover:border-emerald-600/60 hover:bg-emerald-500/10"
                    >
                      <span className="shrink-0 rounded bg-emerald-700/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                        PubMed
                      </span>
                      <span className="truncate">{c.title}</span>
                      <span className="ml-auto shrink-0 text-xs text-emerald-500/70">
                        open ↗
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">
                {liveState === "done"
                  ? "No live results available (offline or blocked) — the curated sources above always work."
                  : "Checking for recent citations…"}
              </p>
            )}
          </div>
        </section>

        <div className="border-t border-slate-800 px-6 py-3 text-center text-[11px] text-slate-500">
          Decision support, not a diagnosis. Educational demo data.
        </div>
      </div>
    </div>
  );
}

function ReasonColumn({
  title,
  accent,
  dot,
  items,
  emptyText,
}: {
  title: string;
  accent: string;
  dot: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-800/30 p-3">
      <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${accent}`}>
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((label, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Human-readable label for a contributing finding, respecting negation. */
function findingLabel(findingId: string, negated: boolean): string {
  const finding = findingsById[findingId];
  if (!finding) return findingId;
  if (negated) {
    return finding.negationLabel ?? `no ${finding.label.toLowerCase()}`;
  }
  return finding.label.toLowerCase();
}
