import type { Condition } from "../data/conditions";
import { conditions } from "../data/conditions";
import { findingIds } from "../data/findings";

export type Direction = "up" | "down";

export interface Contribution {
  findingId: string;
  /** Signed weight actually applied; negated evidence reverses the authored weight. */
  weight: number;
  direction: Direction;
  negated: boolean;
}

/**
 * A transparent score snapshot. `probability` is retained for compatibility,
 * but is presented as an illustrative normalized evidence share, never risk.
 */
export interface ScoredCondition {
  conditionId: string;
  probability: number;
  /** Compatibility alias for clampedScore. */
  score: number;
  baseline: number;
  rawScore: number;
  clampedScore: number;
  totalPoolScore: number;
  contributingFindings: Contribution[];
  cantMiss: boolean;
}

export interface FindingState {
  asserted: Iterable<string>;
  negated?: Iterable<string>;
}

function scoreCondition(
  condition: Condition,
  asserted: Set<string>,
  negated: Set<string>
): {
  baseline: number;
  rawScore: number;
  clampedScore: number;
  contributions: Contribution[];
} {
  let rawScore = condition.prior;
  const contributions: Contribution[] = [];

  for (const [findingId, authoredWeight] of Object.entries(condition.findingWeights)) {
    let applied: number | null = null;
    let wasNegated = false;
    if (asserted.has(findingId)) {
      applied = authoredWeight;
    } else if (negated.has(findingId)) {
      applied = -authoredWeight;
      wasNegated = true;
    }
    if (applied === null) continue;
    rawScore += applied;
    contributions.push({
      findingId,
      weight: applied,
      direction: applied >= 0 ? "up" : "down",
      negated: wasNegated,
    });
  }

  contributions.sort(
    (a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.findingId.localeCompare(b.findingId)
  );

  return {
    baseline: condition.prior,
    rawScore,
    clampedScore: Math.max(0, rawScore),
    contributions,
  };
}

/** Pure, deterministic ranking over bundled priors and signed finding weights. */
export function scoreConditions(
  state: FindingState,
  pool: Condition[] = conditions
): ScoredCondition[] {
  const asserted = new Set(state.asserted);
  const negated = new Set(state.negated ?? []);
  // Assertion wins defensively if a malformed caller supplies both states.
  for (const id of asserted) negated.delete(id);

  if (import.meta.env?.DEV) {
    for (const id of [...asserted, ...negated]) {
      if (!findingIds.has(id)) console.warn(`[tao/score] unknown finding id: "${id}"`);
    }
  }

  const snapshots = pool.map((condition) => ({
    condition,
    ...scoreCondition(condition, asserted, negated),
  }));
  const totalPoolScore = snapshots.reduce((sum, item) => sum + item.clampedScore, 0);

  const scored: ScoredCondition[] = snapshots.map(({ condition, ...snapshot }) => ({
    conditionId: condition.id,
    probability: totalPoolScore > 0 ? snapshot.clampedScore / totalPoolScore : 0,
    score: snapshot.clampedScore,
    totalPoolScore,
    cantMiss: condition.cantMiss,
    contributingFindings: snapshot.contributions,
    baseline: snapshot.baseline,
    rawScore: snapshot.rawScore,
    clampedScore: snapshot.clampedScore,
  }));

  scored.sort(
    (a, b) => b.probability - a.probability || a.conditionId.localeCompare(b.conditionId)
  );
  return scored;
}
