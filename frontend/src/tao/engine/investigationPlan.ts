import type { Condition } from "../data/conditions";
import {
  conditionInvestigationMappings,
  investigationsById,
  type InvestigationDefinition,
  type InvestigationUrgency,
} from "../data/investigations";
import type { Contribution, ScoredCondition } from "./score";

export type InvestigationRole = "leading" | "safety_watch";
export interface InvestigationReason {
  conditionId: string;
  conditionName: string;
  rank: number;
  evidenceShare: number;
  urgency: InvestigationUrgency;
  roles: InvestigationRole[];
  rationale: string;
  strongestContributions: Contribution[];
  baselineOnly: boolean;
}
export interface PlannedInvestigation extends InvestigationDefinition {
  urgency: InvestigationUrgency;
  safetyWatchRelevant: boolean;
  bestRank: number;
  reasons: InvestigationReason[];
}
export interface InvestigationPlanOptions { leaderCount?: number; }

export const urgencyPriority: Record<InvestigationUrgency, number> = {
  immediate: 0,
  urgent: 1,
  follow_up: 2,
};

/**
 * Build a deterministic, deduplicated set of authored options from the top
 * leaders plus every safety-watch condition in the active pool. Pure data in,
 * data out: no mutation, network, or generated clinical content.
 */
export function buildInvestigationPlan(
  scored: ScoredCondition[],
  pool: Condition[],
  options: InvestigationPlanOptions = {}
): PlannedInvestigation[] {
  const leaderCount = Math.max(0, options.leaderCount ?? 3);
  const scoredById = new Map(scored.map((item, index) => [item.conditionId, { item, rank: index + 1 }]));
  const poolById = new Map(pool.map((condition) => [condition.id, condition]));
  const hasNormalizedRanking = scored.some((item) => item.totalPoolScore > 0);
  const leaderIds = new Set(
    hasNormalizedRanking ? scored.slice(0, leaderCount).map((item) => item.conditionId) : []
  );
  const selectedIds = new Set([
    ...leaderIds,
    ...pool.filter((condition) => condition.cantMiss).map((condition) => condition.id),
  ]);
  const grouped = new Map<string, PlannedInvestigation>();

  for (const mapping of conditionInvestigationMappings) {
    if (!selectedIds.has(mapping.conditionId)) continue;
    const definition = investigationsById[mapping.investigationId];
    const condition = poolById.get(mapping.conditionId);
    const scoredEntry = scoredById.get(mapping.conditionId);
    if (!definition || !condition || !scoredEntry) continue;
    const roles: InvestigationRole[] = [
      ...(leaderIds.has(condition.id) ? ["leading" as const] : []),
      ...(condition.cantMiss ? ["safety_watch" as const] : []),
    ];
    const reason: InvestigationReason = {
      conditionId: condition.id,
      conditionName: condition.name,
      rank: scoredEntry.rank,
      evidenceShare: scoredEntry.item.probability,
      urgency: mapping.urgency,
      roles,
      rationale: mapping.rationale,
      strongestContributions: scoredEntry.item.contributingFindings.slice(0, 3).map((item) => ({ ...item })),
      baselineOnly: scoredEntry.item.contributingFindings.length === 0,
    };
    const existing = grouped.get(definition.id);
    if (existing) {
      existing.reasons.push(reason);
      if (urgencyPriority[mapping.urgency] < urgencyPriority[existing.urgency]) existing.urgency = mapping.urgency;
      existing.safetyWatchRelevant ||= condition.cantMiss;
      existing.bestRank = Math.min(existing.bestRank, scoredEntry.rank);
    } else {
      grouped.set(definition.id, {
        ...definition,
        urgency: mapping.urgency,
        safetyWatchRelevant: condition.cantMiss,
        bestRank: scoredEntry.rank,
        reasons: [reason],
      });
    }
  }

  return [...grouped.values()].map((item) => ({
    ...item,
    reasons: [...item.reasons].sort((a, b) =>
      Number(b.roles.includes("safety_watch")) - Number(a.roles.includes("safety_watch")) ||
      a.rank - b.rank || a.conditionId.localeCompare(b.conditionId)
    ),
  })).sort((a, b) =>
    urgencyPriority[a.urgency] - urgencyPriority[b.urgency] ||
    Number(b.safetyWatchRelevant) - Number(a.safetyWatchRelevant) ||
    a.bestRank - b.bestRank ||
    a.id.localeCompare(b.id)
  );
}
