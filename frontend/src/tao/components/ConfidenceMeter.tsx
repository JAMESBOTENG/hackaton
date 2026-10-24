/**
 * TAO — evidence-confidence (certainty) meter.
 *
 * Presentation only. Consumes the deterministic evidenceConfidence() derivation
 * (engine/confidence.ts) and renders an honest "based on N findings —
 * low/medium/high confidence" indicator with a small three-segment graphical
 * scale. This reinforces invariant 1 (decision support, not a diagnosis): a
 * probability that looks high on thin early evidence still reads as LOW
 * confidence, so the clinician is never lulled by a confident-looking bar.
 */
import type { EvidenceConfidence, ConfidenceLevel } from "../engine/confidence";

interface Props {
  confidence: EvidenceConfidence;
}

/** Visual spec per band — color + how many of the three segments are lit. */
const LEVELS: Record<
  ConfidenceLevel,
  { label: string; segments: number; seg: string; text: string; ring: string }
> = {
  low: {
    label: "Low",
    segments: 1,
    seg: "bg-signal-500",
    text: "text-signal-300",
    ring: "ring-signal-500/30",
  },
  medium: {
    label: "Medium",
    segments: 2,
    seg: "bg-brand-500",
    text: "text-brand-300",
    ring: "ring-brand-500/30",
  },
  high: {
    label: "High",
    segments: 3,
    seg: "bg-present-500",
    text: "text-present-300",
    ring: "ring-present-500/30",
  },
};

export default function ConfidenceMeter({ confidence }: Props) {
  const spec = LEVELS[confidence.level];
  const plural = confidence.findingsCount === 1 ? "finding" : "findings";

  return (
    <div
      aria-label={confidence.caption}
      className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-raised px-3 py-2 shadow-card"
    >
      <div className="flex flex-col">
        <span className="text-2xs font-medium uppercase tracking-wide text-content-subtle">
          Evidence confidence
        </span>
        <span className="text-xs text-content-muted">
          <span className="font-mono font-semibold tabular-nums text-content">
            {confidence.findingsCount}
          </span>{" "}
          {plural} committed
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        {/* Three-segment graphical scale */}
        <div className="flex items-end gap-1" aria-hidden>
          {[0, 1, 2].map((i) => {
            const lit = i < spec.segments;
            const heights = ["h-2.5", "h-3.5", "h-4.5"];
            return (
              <span
                key={i}
                className={`w-1.5 rounded-sm ${heights[i]} ${
                  lit ? spec.seg : "bg-ink-700"
                }`}
              />
            );
          })}
        </div>
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${spec.text} ${spec.ring} bg-surface-inset`}
        >
          {spec.label}
        </span>
      </div>
    </div>
  );
}
