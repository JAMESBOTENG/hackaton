/**
 * TAO — one condition card on the probability board.
 *
 * Presentation only. Shows the condition name, an animated probability bar and
 * percentage, a can't-miss red-flag badge, and a compact row of the top
 * contributing findings (the evidence that is currently moving this condition).
 *
 * Animation strategy (no heavy deps):
 *   • Bar width is a plain CSS width transition, so probability changes glide.
 *   • Reordering/reshuffling is done by the parent board via a FLIP transform
 *     transition; this card just renders its current state.
 */
import type { ScoredCondition } from "../engine/score";
import { conditionsById } from "../data/conditions";
import { findingsById } from "../data/findings";

interface Props {
  scored: ScoredCondition;
  /** 0-based rank on the board (0 = most likely). */
  rank: number;
  onClick: () => void;
}

/**
 * Pick a color theme by rank + urgency. Can't-miss conditions always read as a
 * red-flag accent so they never visually disappear even at low probability;
 * otherwise the top ranks are warm (sky/indigo) and lower ranks cool/muted.
 */
function theme(rank: number, cantMiss: boolean) {
  if (cantMiss) {
    return {
      bar: "bg-gradient-to-r from-rose-500 to-red-400",
      ring: "ring-rose-500/40",
      glow: "hover:ring-rose-400/60",
      pct: "text-rose-200",
    };
  }
  if (rank === 0)
    return {
      bar: "bg-gradient-to-r from-sky-500 to-cyan-400",
      ring: "ring-sky-500/40",
      glow: "hover:ring-sky-400/60",
      pct: "text-sky-200",
    };
  if (rank <= 2)
    return {
      bar: "bg-gradient-to-r from-indigo-500 to-sky-400",
      ring: "ring-indigo-500/30",
      glow: "hover:ring-indigo-400/50",
      pct: "text-indigo-200",
    };
  return {
    bar: "bg-gradient-to-r from-slate-500 to-slate-400",
    ring: "ring-slate-700",
    glow: "hover:ring-slate-500",
    pct: "text-slate-300",
  };
}

export default function ProbabilityCard({ scored, rank, onClick }: Props) {
  const condition = conditionsById[scored.conditionId];
  if (!condition) return null;

  const pct = Math.round(scored.probability * 1000) / 10;
  const t = theme(rank, scored.cantMiss);

  // Top up to 3 supporting findings (positive direction) as compact chips.
  const topSupport = scored.contributingFindings
    .filter((c) => c.direction === "up")
    .slice(0, 3);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group block w-full rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 text-left ring-1 ${t.ring} ${t.glow} transition-all duration-300 hover:bg-slate-900`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-100">
              {condition.name}
            </span>
            {scored.cantMiss && (
              <span className="shrink-0 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-200 ring-1 ring-rose-500/40">
                Can&rsquo;t miss
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
            {condition.description}
          </p>
        </div>
        <div className={`shrink-0 text-right font-mono text-lg font-bold tabular-nums ${t.pct}`}>
          {pct.toFixed(1)}
          <span className="text-xs font-normal text-slate-500">%</span>
        </div>
      </div>

      {/* Animated probability bar */}
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${t.bar} transition-[width] duration-700 ease-out`}
          style={{ width: `${Math.max(2, scored.probability * 100)}%` }}
        />
      </div>

      {/* Compact top-contributing-findings indicator */}
      {topSupport.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {topSupport.map((c) => {
            const finding = findingsById[c.findingId];
            if (!finding) return null;
            return (
              <span
                key={c.findingId}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  c.negated
                    ? "bg-slate-700/60 text-slate-300"
                    : "bg-amber-400/10 text-amber-200/90"
                }`}
              >
                {c.negated ? `✓ ${finding.negationLabel ?? finding.label}` : finding.label}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
}
