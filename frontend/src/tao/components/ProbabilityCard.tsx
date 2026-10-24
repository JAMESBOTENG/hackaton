/**
 * TAO — one condition card on the probability board.
 *
 * Presentation only. Shows the condition name, an animated probability bar and
 * percentage, a can't-miss red-flag badge, a brief per-turn DELTA badge
 * (▲ +12% / ▼ -8%), and a compact row of the top contributing findings (the
 * evidence currently moving this condition).
 *
 * Animation strategy (no heavy deps):
 *   • Bar width is a plain CSS width transition, so probability changes glide.
 *   • Reordering/reshuffling is done by the parent board via a FLIP transform
 *     transition; this card just renders its current state.
 *   • When a card changed meaningfully on the latest turn, the parent asks it to
 *     show a one-shot highlight pulse (FEAT-001 `animate-pulse`).
 *   • When the latest transcript turn revealed/negated a finding this condition
 *     cares about, the parent flags it `linked` for a brief shared accent that
 *     visually ties the spoken line (right) to the card that moved (left).
 *
 * Risk encoding (Boardroom Navy tokens):
 *   • cantMiss  -> a forced `critical` (red) accent + badge, with the bar width
 *     floored at 2% so an emergency can never visually disappear.
 *   • otherwise -> `brand` for the leader, a cooler brand for near-leaders, and
 *     a muted ink treatment for long-shots, so color encodes rank/magnitude.
 */
import type { ScoredCondition } from "../engine/score";
import { conditionsById } from "../data/conditions";
import { findingsById } from "../data/findings";

interface Props {
  scored: ScoredCondition;
  /** 0-based rank on the board (0 = most likely). */
  rank: number;
  /** Signed probability change since the previous scored snapshot, in [-1, 1]. */
  delta: number;
  /** Show a one-shot highlight pulse (card changed meaningfully this turn). */
  pulse: boolean;
  /** The latest transcript turn touched a finding this condition cares about. */
  linked: boolean;
  onClick: () => void;
}

/**
 * Color theme by rank + urgency, expressed with the Boardroom Navy semantic
 * tokens. Can't-miss conditions always read as the `critical` red tier so they
 * never visually disappear even at low probability.
 */
function theme(rank: number, cantMiss: boolean) {
  if (cantMiss) {
    return {
      bar: "bg-gradient-to-r from-critical-600 to-critical-400",
      ring: "ring-critical-500/40",
      border: "border-critical-800/60",
      hover: "hover:ring-critical-400/70",
      pct: "text-critical-200",
    };
  }
  if (rank === 0)
    return {
      bar: "bg-gradient-to-r from-brand-600 to-brand-400",
      ring: "ring-brand-500/40",
      border: "border-brand-800/50",
      hover: "hover:ring-brand-400/70",
      pct: "text-brand-200",
    };
  if (rank <= 2)
    return {
      bar: "bg-gradient-to-r from-brand-700 to-brand-500",
      ring: "ring-brand-500/25",
      border: "border-hairline",
      hover: "hover:ring-brand-400/50",
      pct: "text-brand-300",
    };
  return {
    bar: "bg-gradient-to-r from-ink-600 to-ink-500",
    ring: "ring-hairline",
    border: "border-hairline",
    hover: "hover:ring-hairline-strong",
    pct: "text-content-muted",
  };
}

export default function ProbabilityCard({
  scored,
  rank,
  delta,
  pulse,
  linked,
  onClick,
}: Props) {
  const condition = conditionsById[scored.conditionId];
  if (!condition) return null;

  const pct = Math.round(scored.probability * 1000) / 10;
  const t = theme(rank, scored.cantMiss);

  // Delta badge: shown only when the change is meaningful this turn.
  const deltaPct = Math.round(delta * 1000) / 10;
  const showDelta = Math.abs(deltaPct) >= 0.1;
  const up = deltaPct > 0;

  // Top up to 3 supporting findings (positive direction) as compact chips.
  const topSupport = scored.contributingFindings
    .filter((c) => c.direction === "up")
    .slice(0, 3);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group block w-full rounded-xl border ${t.border} bg-surface-raised p-3.5 text-left shadow-card ring-1 ${t.ring} ${t.hover} transition-[box-shadow,background-color,transform] duration-300 hover:bg-surface-overlay ${
        pulse ? "animate-pulse" : ""
      } ${linked ? "ring-2 ring-brand-400/70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-content">
              {condition.name}
            </span>
            {scored.cantMiss && (
              <span className="shrink-0 rounded-full bg-critical-500/20 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-critical-200 ring-1 ring-critical-500/50">
                Can&rsquo;t miss
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-content-subtle">
            {condition.description}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <div
            className={`text-right font-mono text-xl font-bold tabular-nums leading-none ${t.pct}`}
          >
            {pct.toFixed(1)}
            <span className="text-xs font-normal text-content-subtle">%</span>
          </div>
          {showDelta && (
            <span
              className={`animate-rise-in rounded px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums ${
                up
                  ? "bg-present-500/15 text-present-300"
                  : "bg-denied-500/15 text-denied-300"
              }`}
            >
              {up ? "▲ +" : "▼ "}
              {deltaPct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Animated probability bar — floored at 2% so can't-miss never vanishes */}
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-ink-800">
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
                className={`rounded px-1.5 py-0.5 text-2xs font-medium ${
                  c.negated
                    ? "bg-denied-500/10 text-denied-200/90"
                    : "bg-present-500/10 text-present-200/90"
                }`}
              >
                {c.negated
                  ? `✓ ${finding.negationLabel ?? finding.label}`
                  : finding.label}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
}
