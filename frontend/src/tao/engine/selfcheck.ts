/**
 * TAO — deterministic engine self-check (DEV only).
 *
 * Vitest provides the CI correctness anchor; this lightweight DEV check keeps
 * assumptions loud during development. Like the unknown-finding-id check in
 * score.ts, it runs ONLY under
 * import.meta.env?.DEV and NEVER throws in production — failures are reported
 * with console.warn so a broken assumption is loud in development but can never
 * break the shipped demo.
 *
 * Call runEngineSelfCheck() once from the app entry / TaoApp, guarded by DEV.
 */

import { scoreConditions } from "./score";
import { suggestNextQuestion } from "./nextQuestion";
import { evidenceConfidence } from "./confidence";
import { resolveEvidence } from "./evidence";
import { TranscriptPlayer } from "./player";
import { scenariosById, defaultScenarioId } from "../data/scenarios";
import { validateTaoData } from "../data/validate";

/** Collected failure messages; empty means all invariants held. */
function check(): string[] {
  const failures: string[] = [];
  const assert = (ok: boolean, msg: string) => {
    if (!ok) failures.push(msg);
  };
  failures.push(...validateTaoData());

  const scenario = scenariosById[defaultScenarioId];
  const pool = scenario?.conditionPool;

  // Build an "early" (thin) and a "full" (fully-played) finding state from the
  // default scenario's script.
  const earlyState = { asserted: ["chest_pain"], negated: [] as string[] };

  const fullAsserted = new Set<string>();
  const fullNegated = new Set<string>();
  for (const turn of scenario?.consultation ?? []) {
    for (const id of turn.revealsFindings ?? []) {
      fullNegated.delete(id);
      fullAsserted.add(id);
    }
    for (const id of turn.negatesFindings ?? []) {
      fullAsserted.delete(id);
      fullNegated.add(id);
    }
  }
  const fullState = {
    asserted: [...fullAsserted],
    negated: [...fullNegated],
  };

  // ── 1. Determinism: identical input -> identical suggestion ──────────────
  const earlyScored = scoreConditions(earlyState, pool);
  const s1 = suggestNextQuestion(earlyScored, earlyState);
  const s2 = suggestNextQuestion(earlyScored, earlyState);
  assert(
    JSON.stringify(s1) === JSON.stringify(s2),
    "suggestNextQuestion is not deterministic for identical input"
  );

  // ── 2. suggestNextQuestion never returns an already-asked finding ────────
  if (s1) {
    const asked = new Set([
      ...earlyState.asserted,
      ...earlyState.negated,
    ]);
    assert(
      !asked.has(s1.findingId),
      `suggestNextQuestion returned an already-asked finding: ${s1.findingId}`
    );
  }

  // ── 3. Confidence scales with evidence: early = low, full = higher ───────
  const earlyConf = evidenceConfidence(earlyScored, earlyState, pool);
  const fullScored = scoreConditions(fullState, pool);
  const fullConf = evidenceConfidence(fullScored, fullState, pool);
  const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };
  assert(
    earlyConf.level === "low",
    `expected 'low' confidence for a 1-finding state, got '${earlyConf.level}'`
  );
  assert(
    rank[fullConf.level] > rank[earlyConf.level],
    `expected fully-played confidence (${fullConf.level}) to exceed early (${earlyConf.level})`
  );
  assert(
    fullConf.findingsCount > earlyConf.findingsCount,
    "fully-played findingsCount should exceed the early state"
  );

  // ── 4. Safety coverage uses explicit, scenario-relevant metadata only ────
  const benignCoverage = evidenceConfidence(
    scoreConditions({ asserted: ["reproducible_tenderness"], negated: [] }, pool),
    { asserted: ["reproducible_tenderness"], negated: [] },
    pool
  );
  const safetyCoverage = evidenceConfidence(
    scoreConditions({ asserted: [], negated: ["sudden_onset"] }, pool),
    { asserted: [], negated: ["sudden_onset"] },
    pool
  );
  assert(
    benignCoverage.safetyCuesAnswered === 0,
    "benign discriminator was incorrectly counted as an explicit safety cue"
  );
  assert(
    safetyCoverage.safetyCuesAnswered === 1,
    "an explicitly absent safety cue should count as checked"
  );
  const irrelevantCoverage = evidenceConfidence(
    [],
    { asserted: ["thunderclap_onset"], negated: [] },
    pool
  );
  assert(
    irrelevantCoverage.safetyCuesAnswered === 0 && irrelevantCoverage.findingsCount === 0,
    "scenario coverage included an unrelated safety cue"
  );

  // ── 5. Both expected-impact branches expose exact sign reversal ─────────
  assert(
    !s1 || s1.separates.every((leader) => leader.absentWeight === -leader.presentWeight),
    "absent expected contribution is not the inverse of present"
  );

  // ── 6. Stepping consumes trailing dialogue and reaches terminal state ───
  const stepped = new TranscriptPlayer([
    { atMs: 100, speaker: "patient", text: "Evidence", revealsFindings: ["chest_pain"] },
    { atMs: 200, speaker: "doctor", text: "Closing dialogue" },
  ]);
  stepped.stepToNextFinding();
  stepped.stepToNextFinding();
  const terminal = stepped.getState();
  assert(
    terminal.finished && !terminal.paused && terminal.elapsedMs === terminal.durationMs && terminal.nextTurnIndex === 2,
    "next-evidence stepping did not complete at script exhaustion"
  );

  // ── 7. Contradictory evidence is resolved by visible chronology ─────────
  const manualFirst = resolveEvidence(
    [{ atMs: 100, speaker: "patient", text: "No tenderness", negatesFindings: ["reproducible_tenderness"] }],
    { reproducible_tenderness: { status: "present", afterTurnIndex: 0, revision: 1 } }
  );
  const manualLast = resolveEvidence(
    [{ atMs: 100, speaker: "patient", text: "No tenderness", negatesFindings: ["reproducible_tenderness"] }],
    { reproducible_tenderness: { status: "present", afterTurnIndex: 1, revision: 2 } }
  );
  assert(
    manualFirst.items[0]?.source === "scripted" && manualFirst.items[0]?.supersedes === "clinician" && [...(manualFirst.state.negated ?? [])].includes("reproducible_tenderness"),
    "later script did not visibly supersede contradictory clinician evidence"
  );
  assert(
    manualLast.items[0]?.source === "clinician" && manualLast.items[0]?.supersedes === "scripted" && [...manualLast.state.asserted].includes("reproducible_tenderness"),
    "later clinician evidence did not visibly supersede contradictory script evidence"
  );

  return failures;
}

/**
 * Run the engine self-check. No-op outside DEV. Reports failures via
 * console.warn and never throws, so it is safe to call unconditionally from the
 * app entry.
 */
export function runEngineSelfCheck(): void {
  if (!import.meta.env?.DEV) return;
  try {
    const failures = check();
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "[tao/selfcheck] engine invariants FAILED:\n" +
          failures.map((f) => `  • ${f}`).join("\n")
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[tao/selfcheck] self-check threw (ignored in DEV):", err);
  }
}
