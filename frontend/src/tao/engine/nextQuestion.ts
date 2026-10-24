import { conditions, type Condition } from "../data/conditions";
import { findingsById } from "../data/findings";
import type { FindingState, ScoredCondition } from "./score";

export const DEFAULT_TOP_K = 4;

export interface NextQuestionOptions {
  topK?: number;
  pool?: Condition[];
}

export interface SeparatedLeader {
  conditionId: string;
  name: string;
  /** Signed authored score contribution if the finding is present. */
  presentWeight: number;
  /** Exact reversed score contribution if the finding is absent. */
  absentWeight: number;
  evidenceShare: number;
}

export interface NextQuestionSuggestion {
  findingId: string;
  prompt: string;
  /** Pairwise expected contrast; deterministic and unitless. */
  separation: number;
  separates: SeparatedLeader[];
}

/**
 * Select the unanswered finding with maximum pairwise leader contrast:
 * Σ(i<j) pᵢpⱼ|wᵢ-wⱼ|. Equal weights therefore provide zero separation.
 */
export function suggestNextQuestion(
  scored: ScoredCondition[],
  state: FindingState,
  opts: NextQuestionOptions = {}
): NextQuestionSuggestion | null {
  const topK = Math.max(0, opts.topK ?? DEFAULT_TOP_K);
  const pool = opts.pool ?? conditions;
  const byId = new Map(pool.map((condition) => [condition.id, condition]));
  const leaders = scored
    .slice(0, topK)
    .map((row) => ({ row, condition: byId.get(row.conditionId) }))
    .filter((item): item is { row: ScoredCondition; condition: Condition } => !!item.condition);
  if (leaders.length < 2) return null;

  const answered = new Set([...state.asserted, ...(state.negated ?? [])]);
  const candidates = new Set<string>();
  for (const { condition } of leaders) {
    for (const findingId of Object.keys(condition.findingWeights)) {
      if (!answered.has(findingId)) candidates.add(findingId);
    }
  }

  let best: NextQuestionSuggestion | null = null;
  for (const findingId of [...candidates].sort()) {
    let separation = 0;
    for (let i = 0; i < leaders.length; i += 1) {
      for (let j = i + 1; j < leaders.length; j += 1) {
        const left = leaders[i];
        const right = leaders[j];
        const leftWeight = left.condition.findingWeights[findingId] ?? 0;
        const rightWeight = right.condition.findingWeights[findingId] ?? 0;
        separation +=
          left.row.probability *
          right.row.probability *
          Math.abs(leftWeight - rightWeight);
      }
    }
    if (separation <= 0) continue;

    const suggestion: NextQuestionSuggestion = {
      findingId,
      prompt: findingsById[findingId]?.questionPrompt ?? "Clarify this finding.",
      separation,
      separates: leaders
        .map(({ row, condition }) => ({
          conditionId: condition.id,
          name: condition.name,
          presentWeight: condition.findingWeights[findingId] ?? 0,
          absentWeight: -(condition.findingWeights[findingId] ?? 0),
          evidenceShare: row.probability,
        }))
        .sort((a, b) => Math.abs(b.presentWeight) - Math.abs(a.presentWeight) || a.conditionId.localeCompare(b.conditionId)),
    };

    if (
      !best ||
      suggestion.separation > best.separation ||
      (suggestion.separation === best.separation && suggestion.findingId < best.findingId)
    ) best = suggestion;
  }
  return best;
}
