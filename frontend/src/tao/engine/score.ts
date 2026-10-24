/**
 * TAO — deterministic, explainable scoring engine.
 *
 * ⚠️ DEMO / EDUCATIONAL. Decision SUPPORT only, not a diagnosis.
 *
 * ── Why this is plain code, not an LLM ─────────────────────────────────────
 * Every probability TAO shows must be traceable to specific findings and
 * specific weights — no black box. This module is therefore pure arithmetic:
 *
 *   1. For each condition, start from its `prior` (baseline weight).
 *   2. For every finding the clinician has ASSERTED, add that finding's weight
 *      for the condition (if the condition cares about it).
 *   3. For every finding explicitly NEGATED (the patient denied it), add the
 *      OPPOSITE-sign weight. Denying a finding that supports a condition lowers
 *      that condition; denying a finding that argues against a condition raises
 *      it slightly. This keeps negation symmetric and inspectable.
 *   4. Clamp each raw score to be non-negative (a condition's evidence weight
 *      cannot go below zero), then normalize across all conditions so the
 *      probabilities sum to ~1.0.
 *
 * We normalize by simple division of non-negative scores rather than softmax so
 * the output is directly interpretable: a condition's probability is literally
 * its share of the total evidence weight. The function is pure and
 * deterministic: identical input always yields identical output.
 */

import { conditions, type Condition } from "../data/conditions";
import { findingIds } from "../data/findings";

/** Direction a finding pushed a condition's score. */
export type Direction = "up" | "down";

/** One finding's signed contribution to a single condition's score. */
export interface Contribution {
  findingId: string;
  /** Signed weight actually applied (already negated for negated findings). */
  weight: number;
  direction: Direction;
  /** Whether this came from a negated (denied) finding. */
  negated: boolean;
}

/** A scored condition with its ranked probability and full "why" breakdown. */
export interface ScoredCondition {
  conditionId: string;
  /** Normalized probability in [0, 1]; across the array these sum to ~1.0. */
  probability: number;
  /** Raw (pre-normalization, clamped) evidence score. */
  score: number;
  /** Findings that moved this condition, strongest influence first. */
  contributingFindings: Contribution[];
  /** Convenience passthrough so the UI need not re-join. */
  cantMiss: boolean;
}

/** Input to the scorer: the current asserted and negated finding sets. */
export interface FindingState {
  /** Findings the clinician/patient has asserted are present. */
  asserted: Iterable<string>;
  /** Findings explicitly denied / ruled out. */
  negated?: Iterable<string>;
}

/**
 * Score a single condition against the asserted/negated finding sets.
 * Returns the clamped raw score plus the per-finding contributions.
 */
function scoreCondition(
  condition: Condition,
  asserted: Set<string>,
  negated: Set<string>
): { score: number; contributions: Contribution[] } {
  let raw = condition.prior;
  const contributions: Contribution[] = [];

  for (const [findingId, weight] of Object.entries(condition.findingWeights)) {
    if (asserted.has(findingId)) {
      raw += weight;
      contributions.push({
        findingId,
        weight,
        direction: weight >= 0 ? "up" : "down",
        negated: false,
      });
    } else if (negated.has(findingId)) {
      // Denying a finding applies the opposite-sign influence.
      const applied = -weight;
      raw += applied;
      contributions.push({
        findingId,
        weight: applied,
        direction: applied >= 0 ? "up" : "down",
        negated: true,
      });
    }
  }

  // Sort contributions by absolute impact, largest first, for the UI.
  contributions.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

  // Evidence weight cannot go negative.
  return { score: Math.max(0, raw), contributions };
}

/**
 * Score every condition and return them ranked by probability (descending).
 * Pure and deterministic. Probabilities sum to ~1.0 (exactly 1.0 unless every
 * score is zero, in which case all probabilities are 0).
 *
 * @param state  asserted + optionally negated finding ids
 * @param pool   condition list to score (defaults to the bundled DEMO set)
 */
export function scoreConditions(
  state: FindingState,
  pool: Condition[] = conditions
): ScoredCondition[] {
  const asserted = new Set(state.asserted);
  const negated = new Set(state.negated ?? []);

  // Defensive, dev-friendly validation: flag unknown finding ids rather than
  // silently ignoring typos. This keeps the data layers honest.
  if (import.meta.env?.DEV) {
    for (const id of [...asserted, ...negated]) {
      if (!findingIds.has(id)) {
        // eslint-disable-next-line no-console
        console.warn(`[tao/score] unknown finding id: "${id}"`);
      }
    }
  }

  const scored = pool.map((condition) => {
    const { score, contributions } = scoreCondition(condition, asserted, negated);
    return {
      conditionId: condition.id,
      score,
      probability: 0, // filled in after normalization
      contributingFindings: contributions,
      cantMiss: condition.cantMiss,
    } satisfies ScoredCondition;
  });

  const total = scored.reduce((sum, s) => sum + s.score, 0);
  for (const s of scored) {
    s.probability = total > 0 ? s.score / total : 0;
  }

  // Rank by probability; tie-break deterministically by conditionId so the
  // order is stable across identical inputs.
  scored.sort((a, b) => {
    if (b.probability !== a.probability) return b.probability - a.probability;
    return a.conditionId.localeCompare(b.conditionId);
  });

  return scored;
}
