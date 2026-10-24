import { afterEach, describe, expect, it, vi } from "vitest";
import { conditions, type Condition } from "../data/conditions";
import { findingsById } from "../data/findings";
import { scenarios, scenariosById } from "../data/scenarios";
import { assertValidTaoData, validateTaoData } from "../data/validate";
import { conditionInvestigationMappings, investigationsById } from "../data/investigations";
import { evidenceCoverage } from "./confidence";
import { resolveEvidence } from "./evidence";
import { buildInvestigationPlan, urgencyPriority } from "./investigationPlan";
import { suggestNextQuestion } from "./nextQuestion";
import { TranscriptPlayer } from "./player";
import { fetchPubMedCitations } from "../pubmed";
import { scoreConditions, type ScoredCondition } from "./score";

const condition = (id: string, prior: number, findingWeights: Record<string, number>, cantMiss = false): Condition => ({
  id, name: id, description: id, prior, findingWeights, cantMiss, whyTemplate: id, references: [],
});

describe("deterministic scorer", () => {
  const pool = [condition("a", 1, { chest_pain: 2 }), condition("b", 1, { chest_pain: -1 })];
  it("is deterministic and normalized", () => {
    const first = scoreConditions({ asserted: ["chest_pain"] }, pool);
    expect(scoreConditions({ asserted: ["chest_pain"] }, pool)).toEqual(first);
    expect(first.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1);
  });
  it("reverses authored weights for negation", () => {
    const result = scoreConditions({ asserted: [], negated: ["chest_pain"] }, pool);
    expect(result.find((item) => item.conditionId === "a")?.contributingFindings[0].weight).toBe(-2);
  });
  it("lets asserted evidence win malformed overlap", () => {
    const result = scoreConditions({ asserted: ["chest_pain"], negated: ["chest_pain"] }, pool);
    expect(result.find((item) => item.conditionId === "a")?.rawScore).toBe(3);
  });
  it("returns finite zero shares when the pool total is zero", () => {
    const result = scoreConditions({ asserted: [] }, [condition("zero", 0, {})]);
    expect(result[0]).toMatchObject({ probability: 0, totalPoolScore: 0 });
    expect(Number.isNaN(result[0].probability)).toBe(false);
  });
});

describe("next-question selection", () => {
  const scored = (ids: string[]): ScoredCondition[] => ids.map((id) => ({ conditionId: id, probability: .5, score: 1, baseline: 1, rawScore: 1, clampedScore: 1, totalPoolScore: 2, contributingFindings: [], cantMiss: false }));
  it("is deterministic", () => {
    const pool = [condition("a", 1, { chest_pain: 1, dyspnea: 1 }), condition("b", 1, { chest_pain: -1, dyspnea: 0 })];
    expect(suggestNextQuestion(scored(["a", "b"]), { asserted: [] }, { pool })).toEqual(suggestNextQuestion(scored(["a", "b"]), { asserted: [] }, { pool }));
  });
  it("does not select an equal-weight non-discriminator", () => {
    const pool = [condition("a", 1, { chest_pain: 1, dyspnea: 2 }), condition("b", 1, { chest_pain: 1, dyspnea: -2 })];
    expect(suggestNextQuestion(scored(["a", "b"]), { asserted: [] }, { pool })?.findingId).toBe("dyspnea");
  });
});

describe("evidence chronology", () => {
  const chart = [{ findingId: "chest_pain", status: "present" as const, basis: "Chief complaint: chest pain" }];
  const script = [{ atMs: 1, speaker: "patient" as const, text: "No pain", negatesFindings: ["chest_pain"] }];
  it("resolves chart then script with visible supersession", () => {
    const result = resolveEvidence(script, {}, chart);
    expect(result.items[0]).toMatchObject({ source: "scripted", status: "absent", supersedes: "chart" });
    expect(result.latestChange).toEqual({ source: "scripted", findingIds: ["chest_pain"] });
  });
  it("lets a later clinician answer supersede script and identifies the real latest change", () => {
    const result = resolveEvidence(script, { chest_pain: { status: "present", afterTurnIndex: 1, revision: 2 } }, chart);
    expect(result.items[0]).toMatchObject({ source: "clinician", status: "present", supersedes: "scripted" });
    expect(result.latestChange).toEqual({ source: "clinician", findingIds: ["chest_pain"] });
  });
  it("does not treat same-polarity chart-to-script corroboration as a score change", () => {
    const result = resolveEvidence(
      [{ atMs: 1, speaker: "patient", text: "Pain confirmed", revealsFindings: ["chest_pain"] }],
      {},
      chart
    );
    expect(result.items[0]).toMatchObject({ source: "scripted", status: "present", corroboratedBy: ["chart"] });
    expect(result.latestChange).toBeNull();
  });
  it("does not treat a same-polarity script-to-clinician restatement as a score change", () => {
    const result = resolveEvidence(
      [{ atMs: 1, speaker: "patient", text: "Breathless", revealsFindings: ["dyspnea"] }],
      { dyspnea: { status: "present", afterTurnIndex: 1, revision: 1 } },
      []
    );
    expect(result.items[0]).toMatchObject({ source: "clinician", status: "present", corroboratedBy: ["scripted"] });
    expect(result.latestChange).toBeNull();
  });
  it("links only genuinely new findings in a mixed corroboration turn", () => {
    const result = resolveEvidence(
      [{ atMs: 1, speaker: "patient", text: "Pain and breathlessness", revealsFindings: ["chest_pain", "dyspnea"] }],
      {},
      chart
    );
    expect(result.latestChange).toEqual({ source: "scripted", findingIds: ["dyspnea"] });
    expect(result.items.find((item) => item.findingId === "chest_pain")?.corroboratedBy).toEqual(["chart"]);
  });
  it("commits chart IDs directly into scoring", () => {
    const scenario = scenariosById.chest_pain;
    const resolved = resolveEvidence([], {}, scenario.initialEvidence);
    expect([...resolved.state.asserted]).toContain("hypertension");
    expect(scoreConditions(resolved.state, scenario.conditionPool)[0].contributingFindings.length).toBeGreaterThan(0);
  });
});

describe("transcript player", () => {
  afterEach(() => vi.useRealTimers());
  it("steps through trailing dialogue to terminal completion", () => {
    const player = new TranscriptPlayer([{ atMs: 100, speaker: "patient", text: "evidence", revealsFindings: ["chest_pain"] }, { atMs: 200, speaker: "doctor", text: "tail" }]);
    player.stepToNextFinding(); player.stepToNextFinding();
    expect(player.getState()).toMatchObject({ finished: true, nextTurnIndex: 2, paused: false });
  });
  it("restart clears state and preserves speed", () => {
    const player = new TranscriptPlayer([{ atMs: 100, speaker: "patient", text: "evidence", revealsFindings: ["chest_pain"] }]);
    player.setPlaybackRate(2); player.stepToNextFinding(); player.restart(false);
    expect(player.getState()).toMatchObject({ playbackRate: 2, transcript: [], asserted: [], started: false });
  });
  it("pauses and changes rate predictably under fake timers", () => {
    vi.useFakeTimers();
    const player = new TranscriptPlayer([{ atMs: 100, speaker: "patient", text: "evidence", revealsFindings: ["chest_pain"] }]);
    player.play(); vi.advanceTimersByTime(150); player.pause();
    const elapsed = player.getState().elapsedMs;
    expect(player.getState().paused).toBe(true);
    player.setPlaybackRate(2); expect(player.getState().playbackRate).toBe(2);
    vi.advanceTimersByTime(300); expect(player.getState().elapsedMs).toBe(elapsed);
    player.dispose();
  });
});

describe("investigation plan", () => {
  const scenario = scenariosById.chest_pain;
  const scored = scoreConditions({ asserted: [] }, scenario.conditionPool);
  const plan = buildInvestigationPlan(scored, scenario.conditionPool ?? []);
  it("includes top leaders and every safety-watch condition, even without applied findings", () => {
    const reasonIds = new Set(plan.flatMap((item) => item.reasons.map((reason) => reason.conditionId)));
    for (const leader of scored.slice(0, 3)) expect(reasonIds.has(leader.conditionId)).toBe(true);
    for (const safety of (scenario.conditionPool ?? []).filter((item) => item.cantMiss)) expect(reasonIds.has(safety.id)).toBe(true);
    expect(plan.flatMap((item) => item.reasons).filter((reason) => reason.baselineOnly).length).toBeGreaterThan(0);
  });
  it("deduplicates options while retaining multiple condition reasons and roles", () => {
    expect(new Set(plan.map((item) => item.id)).size).toBe(plan.length);
    const shared = plan.find((item) => item.reasons.length > 1);
    expect(shared?.reasons.length).toBeGreaterThan(1);
    expect(shared?.reasons.some((reason) => reason.roles.includes("safety_watch"))).toBe(true);
  });
  it("sorts stably by urgency, safety relevance, rank, then id", () => {
    expect(buildInvestigationPlan(scored, scenario.conditionPool ?? [])).toEqual(plan);
    for (let index = 1; index < plan.length; index += 1) {
      const left = plan[index - 1], right = plan[index];
      const comparison = urgencyPriority[left.urgency] - urgencyPriority[right.urgency] || Number(right.safetyWatchRelevant) - Number(left.safetyWatchRelevant) || left.bestRank - right.bestRank || left.id.localeCompare(right.id);
      expect(comparison).toBeLessThanOrEqual(0);
    }
  });
  it("preserves each condition's authored urgency after shared-option deduplication", () => {
    const all = buildInvestigationPlan(scored, scenario.conditionPool ?? [], { leaderCount: scored.length });
    const ecg = all.find((item) => item.id === "ecg");
    expect(ecg?.urgency).toBe("immediate");
    expect(ecg?.reasons.find((reason) => reason.conditionId === "stable_angina")?.urgency).toBe("urgent");
  });
  it("keeps only safety-watch reasons when pool normalization is unavailable", () => {
    const zeroPool = (scenario.conditionPool ?? []).map((item) => ({ ...item, prior: 0, findingWeights: {} }));
    const zeroScored = scoreConditions({ asserted: [] }, zeroPool);
    const zeroPlan = buildInvestigationPlan(zeroScored, zeroPool);
    const reasons = zeroPlan.flatMap((item) => item.reasons);
    const expectedSafetyIds = new Set(zeroPool.filter((item) => item.cantMiss).map((item) => item.id));
    expect(reasons.length).toBeGreaterThan(1);
    expect(new Set(reasons.map((reason) => reason.conditionId))).toEqual(expectedSafetyIds);
    expect(reasons.every((reason) => reason.roles.length === 1 && reason.roles[0] === "safety_watch")).toBe(true);
  });
  it("uses bundled data and never calls the network", () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    buildInvestigationPlan(scored, scenario.conditionPool ?? []);
    expect(fetchSpy).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
});

describe("authored dataset integrity and safety taxonomy", () => {
  it("resolves every scenario, condition, finding, investigation, and profile reference", () => {
    expect(() => assertValidTaoData()).not.toThrow();
    for (const mapping of conditionInvestigationMappings) {
      expect(investigationsById[mapping.investigationId]).toBeDefined();
      expect(conditions.some((item) => item.id === mapping.conditionId)).toBe(true);
    }
    for (const scenario of scenarios) {
      expect(scenario.patient.chartId).toMatch(/^DEMO-/);
      expect(scenario.patient.vitals.length).toBeGreaterThan(0);
      for (const finding of scenario.initialEvidence) expect(findingsById[finding.findingId]).toBeDefined();
    }
    const headacheEvidence = scenariosById.headache.initialEvidence;
    expect(headacheEvidence).toContainEqual({ findingId: "older_age", status: "absent", basis: "Demographics: age 34 years" });
    expect(headacheEvidence.some((item) => item.findingId === "focal_neuro_deficit")).toBe(false);
  });
  it("rejects duplicate scenario pool IDs instead of masking them", () => {
    const scenario = scenariosById.chest_pain;
    scenario.conditionPoolIds.push(scenario.conditionPoolIds[0]);
    try { expect(validateTaoData()).toContain(`scenario ${scenario.id} duplicates pool condition ${scenario.conditionPoolIds[0]}`); }
    finally { scenario.conditionPoolIds.pop(); }
  });
  it("rejects missing evidence basis, contradictory chart evidence, and unknown finding IDs", () => {
    const scenario = scenariosById.chest_pain;
    const first = scenario.initialEvidence[0];
    const originalBasis = first.basis;
    first.basis = "";
    try { expect(validateTaoData()).toContain(`scenario ${scenario.id} chart finding ${first.findingId} has no basis`); }
    finally { first.basis = originalBasis; }

    scenario.initialEvidence.push({ findingId: first.findingId, status: first.status === "present" ? "absent" : "present", basis: "Contradictory test fact" });
    try { expect(validateTaoData()).toContain(`scenario ${scenario.id} contradicts chart finding ${first.findingId}`); }
    finally { scenario.initialEvidence.pop(); }

    scenario.initialEvidence.push({ findingId: "unknown_test_finding", status: "present", basis: "Test chart fact" });
    try { expect(validateTaoData()).toContain(`scenario ${scenario.id} chart references unknown finding unknown_test_finding`); }
    finally { scenario.initialEvidence.pop(); }
  });
  it("counts only explicit scenario-relevant safety cues", () => {
    const pool = scenariosById.chest_pain.conditionPool ?? [];
    const benign = evidenceCoverage(scoreConditions({ asserted: ["reproducible_tenderness"] }, pool), { asserted: ["reproducible_tenderness"] }, pool);
    const safety = evidenceCoverage(scoreConditions({ asserted: [], negated: ["sudden_onset"] }, pool), { asserted: [], negated: ["sudden_onset"] }, pool);
    expect(benign.safetyCuesAnswered).toBe(0);
    expect(safety.safetyCuesAnswered).toBe(1);
  });
});

describe("PubMed progressive enhancement", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const jsonResponse = (body: unknown) => ({ ok: true, json: async () => body });

  it("shares one esearch and one esummary sequence across concurrent callers", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ esearchresult: { idlist: ["101"] } }))
      .mockResolvedValueOnce(jsonResponse({ result: { "101": { title: "Shared result." } } }));
    vi.stubGlobal("fetch", fetchSpy);
    const [first, second] = await Promise.all([
      fetchPubMedCitations("concurrent-sharing-contract"),
      fetchPubMedCitations("concurrent-sharing-contract"),
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0][0])).toContain("esearch.fcgi");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("esummary.fcgi");
    expect(first).toEqual(second);
  });
  it("caches successful results and returns defensive copies", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ esearchresult: { idlist: ["202"] } }))
      .mockResolvedValueOnce(jsonResponse({ result: { "202": { title: "Cache-safe title." } } }));
    vi.stubGlobal("fetch", fetchSpy);
    const first = await fetchPubMedCitations("defensive-cache-contract");
    first[0].title = "mutated caller copy";
    const second = await fetchPubMedCitations("defensive-cache-contract");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(second).toEqual([{ pmid: "202", title: "Cache-safe title", url: "https://pubmed.ncbi.nlm.nih.gov/202/" }]);
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
  });
  it("shares one end-to-end timeout and resolves every concurrent caller to empty", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn((_url: string, options?: RequestInit) => new Promise((resolve, reject) => {
      const signal = options?.signal;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      if (fetchSpy.mock.calls.length === 1) {
        setTimeout(() => resolve(jsonResponse({ esearchresult: { idlist: ["303"] } })), 3000);
      }
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const first = fetchPubMedCitations("shared-timeout-contract");
    const second = fetchPubMedCitations("shared-timeout-contract");
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  it("fails to an empty list and allows a transient failure to retry", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchSpy);
    await expect(fetchPubMedCitations("retry-contract-one")).resolves.toEqual([]);
    await expect(fetchPubMedCitations("retry-contract-one")).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
