/**
 * TAO — deterministic evidence-confidence (certainty) derivation.
 *
 * ⚠️ DEMO / EDUCATIONAL. Decision SUPPORT only, not a diagnosis.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The scorer normalizes evidence into a probability distribution, so even a
 * single finding can make one condition look like a confident front-runner.
 * That is misleading: a high probability resting on one or two findings is NOT
 * the same as a high probability built from a fully-explored consultation.
 *
 * This module derives a separate CONFIDENCE band from how much evidence has
 * actually accumulated, so the UI can honestly caption a ranking as
 * "based on N findings — low / medium / high confidence". It is pure arithmetic
 * over fixed, named thresholds: identical input always yields identical output,
 * and nothing here is an LLM.
 *
 * ── How the band is chosen ─────────────────────────────────────────────────
 * Primary signal: the number of findings the clinician has committed to
 * (asserted + negated). More answered questions = more confidence. A secondary
 * signal, the probability MARGIN between the top two conditions, can only
 * PROMOTE confidence (a clear front-runner), never demote it — so an early
 * 1-2-finding state always reads as 'low' regardless of how lopsided the
 * normalized probabilities happen to look.
 */

import type { FindingState, ScoredCondition } from "./score";

/** Confidence band shown to the user. */
export type ConfidenceLevel = "low" | "medium" | "high";

/**
 * Fixed, named thresholds (findings count) for the primary signal. Kept as
 * constants so the mapping is auditable and easy to tune.
 */
export const CONFIDENCE_THRESHOLDS = {
  /** >= this many findings reaches at least 'medium'. */
  MEDIUM_MIN_FINDINGS: 3,
  /** >= this many findings reaches 'high'. */
  HIGH_MIN_FINDINGS: 6,
  /**
   * Probability margin (top1 - top2) that can promote a 'medium' state up to
   * 'high' when there is a clear front-runner. Only ever promotes.
   */
  CLEAR_LEADER_MARGIN: 0.25,
} as const;

/** The derived confidence for the current evidence state. */
export interface EvidenceConfidence {
  /** Count of findings committed to (asserted + negated). */
  findingsCount: number;
  /** Derived band. */
  level: ConfidenceLevel;
  /** Probability margin between the top two conditions, in [0, 1]. */
  topMargin: number;
  /** Short human-readable caption, e.g. "based on 4 findings — medium confidence". */
  caption: string;
}

/** Count the distinct findings the clinician has committed to. */
function countFindings(state: FindingState): number {
  const ids = new Set<string>([
    ...state.asserted,
    ...(state.negated ?? []),
  ]);
  return ids.size;
}

/**
 * Derive the confidence band for the current evidence state. Pure and
 * deterministic.
 *
 * @param scored conditions ranked by {@link scoreConditions} (descending)
 * @param state  current asserted + negated finding sets
 */
export function evidenceConfidence(
  scored: ScoredCondition[],
  state: FindingState
): EvidenceConfidence {
  const findingsCount = countFindings(state);

  const top1 = scored[0]?.probability ?? 0;
  const top2 = scored[1]?.probability ?? 0;
  const topMargin = Math.max(0, top1 - top2);

  // Primary signal: evidence volume.
  let level: ConfidenceLevel;
  if (findingsCount >= CONFIDENCE_THRESHOLDS.HIGH_MIN_FINDINGS) {
    level = "high";
  } else if (findingsCount >= CONFIDENCE_THRESHOLDS.MEDIUM_MIN_FINDINGS) {
    level = "medium";
  } else {
    level = "low";
  }

  // Secondary signal: a clear front-runner can PROMOTE 'medium' to 'high', but
  // never rescues a thin ('low') state — early high probabilities stay 'low'.
  if (
    level === "medium" &&
    topMargin >= CONFIDENCE_THRESHOLDS.CLEAR_LEADER_MARGIN
  ) {
    level = "high";
  }

  const plural = findingsCount === 1 ? "finding" : "findings";
  const caption = `based on ${findingsCount} ${plural} — ${level} confidence`;

  return { findingsCount, level, topMargin, caption };
}
