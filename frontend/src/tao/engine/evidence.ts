import type { ConsultationTurn } from "../data/consultation";
import type { FindingState } from "./score";

export type EvidenceStatus = "present" | "absent";
export type EvidenceSource = "scripted" | "clinician";

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
  /** Present only when a contradictory earlier source was visibly superseded. */
  supersedes?: EvidenceSource;
  /** Earlier contradictory value, retained so a clinician can re-apply it. */
  supersededStatus?: EvidenceStatus;
}

interface ScriptedAnswer {
  status: EvidenceStatus;
  turnIndex: number;
}

/**
 * Resolve authored and clinician evidence by explicit chronology.
 * A later scripted claim supersedes an earlier clinician answer; a clinician
 * answer entered after that script supersedes it in turn. This is deterministic
 * and returns both the effective scoring state and visible provenance.
 */
export function resolveEvidence(
  transcript: ConsultationTurn[],
  manual: Record<string, ManualEvidenceAnswer>
): { state: FindingState; items: ResolvedEvidenceItem[] } {
  const scripted = new Map<string, ScriptedAnswer>();
  transcript.forEach((turn, zeroBasedIndex) => {
    const turnIndex = zeroBasedIndex + 1;
    for (const findingId of turn.revealsFindings ?? []) {
      scripted.set(findingId, { status: "present", turnIndex });
    }
    for (const findingId of turn.negatesFindings ?? []) {
      scripted.set(findingId, { status: "absent", turnIndex });
    }
  });

  const ids = new Set([...scripted.keys(), ...Object.keys(manual)]);
  const ordered = [...ids].map((findingId) => {
    const scriptAnswer = scripted.get(findingId);
    const manualAnswer = manual[findingId];
    const scriptIsLater = Boolean(
      scriptAnswer && manualAnswer && scriptAnswer.turnIndex > manualAnswer.afterTurnIndex
    );
    const source: EvidenceSource = scriptAnswer && (!manualAnswer || scriptIsLater)
      ? "scripted"
      : "clinician";
    const current = source === "scripted" ? scriptAnswer! : manualAnswer!;
    const prior = source === "scripted" ? manualAnswer : scriptAnswer;
    const order = source === "scripted"
      ? scriptAnswer!.turnIndex * 2
      : manualAnswer!.afterTurnIndex * 2 + 1;
    return {
      order,
      item: {
        findingId,
        status: current.status,
        source,
        ...(prior && prior.status !== current.status ? {
          supersedes: source === "scripted" ? "clinician" as const : "scripted" as const,
          supersededStatus: prior.status,
        } : {}),
      },
    };
  }).sort((a, b) => a.order - b.order || a.item.findingId.localeCompare(b.item.findingId));

  const asserted: string[] = [];
  const negated: string[] = [];
  for (const { item } of ordered) {
    (item.status === "present" ? asserted : negated).push(item.findingId);
  }

  return { state: { asserted, negated }, items: ordered.map(({ item }) => item) };
}
