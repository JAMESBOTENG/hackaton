/**
 * TAO — deterministic "suggested next question" selector.
 *
 * ⚠️ DEMO / EDUCATIONAL. Decision SUPPORT only, not a diagnosis.
 *
 * ── Why this is plain code, not an LLM ─────────────────────────────────────
 * TAO must never let a language model drive clinical reasoning. Choosing the
 * most useful next question is therefore pure arithmetic over the SAME signed
 * finding weights the scorer already uses — so the suggestion is fully
 * explainable and identical input always yields identical output.
 *
 * ── The idea ───────────────────────────────────────────────────────────────
 * A good next question is one whose answer would most SEPARATE the conditions
 * that are currently in contention. We look at the current top-K leading
 * conditions, and for every finding the clinician has NOT yet asked about
 * (neither asserted nor negated) we measure how much that finding's signed
 * weight DIFFERS across those leaders:
 *
 *   • A finding that pushes one leader strongly UP and another strongly DOWN is
 *     highly discriminating — asking about it will meaningfully reshuffle the
 *     board whichever way the patient answers.
 *   • A finding every leader weights the same way (or ignores) tells us little.
 *
 * We weight each leader's contribution by its current probability (separating
 * the actual front-runners matters more than separating long-shots) and take
 * the spread (max minus min) of the probability-weighted signed weights across
 * the leaders. The finding with the largest spread wins; ties break by finding
 * id so the result is deterministic.
 */

import type { FindingState, ScoredCondition } from "./score";
import { conditionsById, type Condition } from "../data/conditions";
import { findingsById } from "../data/findings";

/** How many leading conditions to consider when measuring separation. */
export const DEFAULT_TOP_K = 4;

/** Options for {@link suggestNextQuestion}. */
export interface NextQuestionOptions {
  /** Number of leading conditions to separate (default {@link DEFAULT_TOP_K}). */
  topK?: number;
}

/** One leader a suggested finding would help separate. */
export interface SeparatedLeader {
  conditionId: string;
  /** Condition display name, for the UI. */
  name: string;
  /**
   * Signed weight this finding carries for this leader. Positive raises the
   * condition if the finding is present, negative lowers it. Zero means the
   * finding is irrelevant to this condition.
   */
  weight: number;
}

/** A deterministic suggestion for the single highest-value next question. */
export interface NextQuestionSuggestion {
  /** The finding id to ask about. */
  findingId: string;
  /** A human-readable question/prompt derived from the finding. */
  prompt: string;
  /**
   * How strongly answering this finding would separate the current leaders
   * (larger = more discriminating). Deterministic, unitless.
   */
  separation: number;
  /** The leaders this finding helps distinguish, strongest influence first. */
  separates: SeparatedLeader[];
}

/**
 * Derive a natural-language question from a finding's canonical phrasing /
 * label. Pure and deterministic — same finding, same prompt.
 */
function promptForFinding(findingId: string): string {
  const f = findingsById[findingId];
  if (!f) return `Is "${findingId}" present?`;
  // Canonical phrasing reads as a clinical descriptor; turn it into a question.
  const subject = (f.canonical || f.label).trim();
  const lower = subject.charAt(0).toLowerCase() + subject.slice(1);
  return `Ask about: ${lower}?`;
}

/**
 * Collect candidate findings to ask about: every finding referenced by any of
 * the leading conditions that has NOT already been asserted or negated. Sorted
 * by id so iteration order is deterministic regardless of object key order.
 */
function candidateFindings(
  leaders: Condition[],
  asked: Set<string>
): string[] {
  const ids = new Set<string>();
  for (const c of leaders) {
    for (const findingId of Object.keys(c.findingWeights)) {
      if (!asked.has(findingId)) ids.add(findingId);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

/**
 * Suggest the single highest-value next question: the unasked finding that most
 * separates the current top-K leading conditions.
 *
 * Pure, deterministic, no side effects. Returns null when no discriminating
 * finding remains (every relevant finding already asked, or no separation).
 *
 * @param scored  conditions ranked by {@link scoreConditions} (descending)
 * @param state   current asserted + negated finding sets
 * @param opts    optional tuning ({@link NextQuestionOptions.topK})
 */
export function suggestNextQuestion(
  scored: ScoredCondition[],
  state: FindingState,
  opts: NextQuestionOptions = {}
): NextQuestionSuggestion | null {
  const topK = opts.topK ?? DEFAULT_TOP_K;

  // Findings already covered — never suggest one the clinician has asked about.
  const asked = new Set<string>([
    ...state.asserted,
    ...(state.negated ?? []),
  ]);

  // The current leaders and their probabilities, in ranked order.
  const leaderRows = scored.slice(0, Math.max(0, topK));
  const leaders: Condition[] = [];
  const probById = new Map<string, number>();
  for (const row of leaderRows) {
    const c = conditionsById[row.conditionId];
    if (!c) continue; // unknown id — skip defensively
    leaders.push(c);
    probById.set(c.id, row.probability);
  }
  if (leaders.length < 2) return null; // nothing to separate

  let best: NextQuestionSuggestion | null = null;

  for (const findingId of candidateFindings(leaders, asked)) {
    // Probability-weighted signed weight of this finding for each leader.
    const weighted: number[] = [];
    const perLeader: SeparatedLeader[] = [];
    for (const c of leaders) {
      const w = c.findingWeights[findingId] ?? 0;
      const prob = probById.get(c.id) ?? 0;
      weighted.push(w * prob);
      perLeader.push({ conditionId: c.id, name: c.name, weight: w });
    }

    // Separation = spread of the probability-weighted weights across leaders.
    // Large opposing weights among the front-runners produce a large spread.
    const separation = Math.max(...weighted) - Math.min(...weighted);
    if (separation <= 0) continue;

    // Keep only the leaders this finding actually touches, strongest first.
    const separates = perLeader
      .filter((l) => l.weight !== 0)
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    const candidate: NextQuestionSuggestion = {
      findingId,
      prompt: promptForFinding(findingId),
      separation,
      separates,
    };

    // Pick the largest separation; deterministic tie-break by finding id.
    if (
      best === null ||
      candidate.separation > best.separation ||
      (candidate.separation === best.separation &&
        candidate.findingId.localeCompare(best.findingId) < 0)
    ) {
      best = candidate;
    }
  }

  return best;
}
