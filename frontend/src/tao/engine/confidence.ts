import type { Condition } from "../data/conditions";
import { findings } from "../data/findings";
import type { FindingState, ScoredCondition } from "./score";

export type CoverageLevel = "low" | "medium" | "high";
export type ConfidenceLevel = CoverageLevel;

export const COVERAGE_THRESHOLDS = {
  MEDIUM: 0.18,
  HIGH: 0.42,
} as const;

export interface EvidenceCoverage {
  findingsCount: number;
  relevantCount: number;
  safetyCuesAnswered: number;
  safetyCuesTotal: number;
  ratio: number;
  level: CoverageLevel;
  topMargin: number;
  caption: string;
}
export type EvidenceConfidence = EvidenceCoverage;

function relevantFindingIds(pool: Condition[]): Set<string> {
  return new Set(pool.flatMap((condition) => Object.keys(condition.findingWeights)));
}

/** Honest demo heuristic: scenario-relevant coverage, weighted toward explicit safety cues. */
export function evidenceCoverage(
  scored: ScoredCondition[],
  state: FindingState,
  pool: Condition[]
): EvidenceCoverage {
  const answered = new Set([...state.asserted, ...(state.negated ?? [])]);
  const relevant = relevantFindingIds(pool);
  const safetyCues = new Set(
    findings.filter((finding) => finding.safetyCue && relevant.has(finding.id)).map((finding) => finding.id)
  );
  const findingsCount = [...answered].filter((id) => relevant.has(id)).length;
  const safetyCuesAnswered = [...answered].filter((id) => safetyCues.has(id)).length;
  const relevantRatio = relevant.size ? findingsCount / relevant.size : 0;
  const safetyCueRatio = safetyCues.size ? safetyCuesAnswered / safetyCues.size : 0;
  const ratio = relevantRatio * 0.65 + safetyCueRatio * 0.35;
  const level: CoverageLevel =
    ratio >= COVERAGE_THRESHOLDS.HIGH ? "high" : ratio >= COVERAGE_THRESHOLDS.MEDIUM ? "medium" : "low";
  const topMargin = Math.max(0, (scored[0]?.probability ?? 0) - (scored[1]?.probability ?? 0));
  return {
    findingsCount,
    relevantCount: relevant.size,
    safetyCuesAnswered,
    safetyCuesTotal: safetyCues.size,
    ratio,
    level,
    topMargin,
    caption: `${level} evidence coverage from ${findingsCount} scenario-relevant findings`,
  };
}

/** Backward-compatible export for callers outside the cockpit. */
export function evidenceConfidence(
  scored: ScoredCondition[],
  state: FindingState,
  pool: Condition[] = []
): EvidenceCoverage {
  return evidenceCoverage(scored, state, pool);
}
