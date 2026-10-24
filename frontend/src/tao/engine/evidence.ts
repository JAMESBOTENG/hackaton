import type { ConsultationTurn } from "../data/consultation";
import type { InitialEvidence } from "../data/scenarios";
import type { FindingState } from "./score";

export type EvidenceStatus = "present" | "absent";
export type EvidenceSource = "chart" | "scripted" | "clinician";

/** A clinician answer is ordered after every scripted turn visible when entered. */
export interface ManualEvidenceAnswer {
  status: EvidenceStatus;
  afterTurnIndex: number;
  revision: number;
}

export interface ResolvedEvidenceItem {
  findingId: string;
  status: EvidenceStatus;
  source: EvidenceSource;
  /** Earlier sources that independently stated the same effective value. */
  corroboratedBy?: EvidenceSource[];
  /** Present only when a contradictory earlier source was visibly superseded. */
  supersedes?: EvidenceSource;
  /** Earlier contradictory value, retained so a clinician can re-apply it. */
  supersededStatus?: EvidenceStatus;
}

export interface EvidenceChange {
  source: EvidenceSource;
  findingIds: string[];
}

interface Candidate {
  findingId: string;
  status: EvidenceStatus;
  source: EvidenceSource;
  position: number;
  revision: number;
}

const later = (left: Candidate, right: Candidate) =>
  left.position - right.position || left.revision - right.revision || left.findingId.localeCompare(right.findingId);
const sameBatch = (left: Candidate, right: Candidate) =>
  left.position === right.position && left.revision === right.revision && left.source === right.source;

/**
 * Resolve chart, authored script, and clinician evidence by explicit chronology.
 * Chart evidence is earliest. Later same-polarity statements corroborate the
 * effective value without counting as score changes; contradictions supersede
 * it visibly. Assertion/negation is never inferred from profile prose.
 */
export function resolveEvidence(
  transcript: ConsultationTurn[],
  manual: Record<string, ManualEvidenceAnswer>,
  chart: InitialEvidence[] = []
): { state: FindingState; items: ResolvedEvidenceItem[]; latestChange: EvidenceChange | null } {
  const candidates = new Map<string, Candidate[]>();
  const add = (candidate: Candidate) => candidates.set(
    candidate.findingId,
    [...(candidates.get(candidate.findingId) ?? []), candidate]
  );

  chart.forEach((item) => add({ findingId: item.findingId, status: item.status, source: "chart", position: 0, revision: 0 }));
  transcript.forEach((turn, zeroBasedIndex) => {
    const position = (zeroBasedIndex + 1) * 2;
    for (const findingId of turn.revealsFindings ?? []) add({ findingId, status: "present", source: "scripted", position, revision: 0 });
    for (const findingId of turn.negatesFindings ?? []) add({ findingId, status: "absent", source: "scripted", position, revision: 0 });
  });
  for (const [findingId, answer] of Object.entries(manual)) {
    add({ findingId, status: answer.status, source: "clinician", position: answer.afterTurnIndex * 2 + 1, revision: answer.revision });
  }

  const resolved = [...candidates.entries()].map(([findingId, values]) => {
    const chronological = [...values].sort(later);
    const current = chronological[chronological.length - 1];
    const earlier = chronological.slice(0, -1);
    const contradictory = [...earlier].reverse().find((item) => item.status !== current.status);
    const corroboratedBy = [...new Set(
      earlier
        .filter((item) => item.status === current.status && item.source !== current.source)
        .map((item) => item.source)
    )];
    return {
      current,
      item: {
        findingId,
        status: current.status,
        source: current.source,
        ...(corroboratedBy.length ? { corroboratedBy } : {}),
        ...(contradictory ? { supersedes: contradictory.source, supersededStatus: contradictory.status } : {}),
      } satisfies ResolvedEvidenceItem,
    };
  }).sort((a, b) => later(a.current, b.current));

  const asserted: string[] = [];
  const negated: string[] = [];
  for (const { item } of resolved) (item.status === "present" ? asserted : negated).push(item.findingId);

  const allCandidates = [...candidates.values()].flat().sort(later);
  const newest = allCandidates[allCandidates.length - 1];
  const changedIds = newest ? allCandidates
    .filter((candidate) => sameBatch(candidate, newest))
    .filter((candidate) => {
      const preceding = (candidates.get(candidate.findingId) ?? [])
        .filter((item) => later(item, candidate) < 0)
        .sort(later);
      const prior = preceding[preceding.length - 1];
      return !prior || prior.status !== candidate.status;
    })
    .map((candidate) => candidate.findingId)
    .sort() : [];
  const latestChange = newest && changedIds.length ? { source: newest.source, findingIds: changedIds } : null;

  return { state: { asserted, negated }, items: resolved.map(({ item }) => item), latestChange };
}
