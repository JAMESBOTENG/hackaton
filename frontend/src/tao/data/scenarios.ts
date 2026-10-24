/**
 * TAO — DEMO dataset: switchable consultation scenarios.
 *
 * ⚠️ DEMO / EDUCATIONAL. Fictional patients, no real PII. Each scenario is a
 * scripted doctor-patient consultation plus the condition pool it should be
 * scored against. The deterministic player (engine/player.ts) streams the turns
 * and the scorer (engine/score.ts) ranks the scenario's conditionPool, so a
 * headache case never pollutes the board with chest-pain conditions and vice
 * versa. Every revealsFindings / negatesFindings id MUST exist in findings.ts.
 *
 * Scenarios included:
 *   • chest_pain  — the original chest-pain -> ACS case (reuses consultation.ts).
 *   • headache    — trends to migraine while the doctor explicitly excludes the
 *                   can't-miss red flags (subarachnoid haemorrhage, meningitis).
 *   • late_twist  — anti-anchoring: an early benign-looking leader is overturned
 *                   late by a red-flag finding with strong opposing weights.
 */

import {
  consultation,
  type ConsultationTurn,
} from "./consultation";
import { conditions, conditionsById, type Condition } from "./conditions";

/** A selectable scripted scenario. */
export interface Scenario {
  /** Stable machine id, used by the scenario selector. */
  id: string;
  /** Short title for the selector. */
  title: string;
  /** One-line description / subtitle shown under the title. */
  description: string;
  /** The scripted consultation, ordered by atMs. */
  consultation: ConsultationTurn[];
  /**
   * Conditions this scenario should be scored against. Keeps each board focused
   * on the relevant differentials. Omit to score against the full set.
   */
  conditionPool?: Condition[];
}

/** Pull a focused condition pool by id (order preserved). */
function pool(ids: string[]): Condition[] {
  return ids.map((id) => conditionsById[id]).filter(Boolean) as Condition[];
}

// ── Chest-pain -> ACS pool (the original presentation) ──────────────────────
const CHEST_PAIN_POOL = pool([
  "acs",
  "pulmonary_embolism",
  "aortic_dissection",
  "tension_pneumothorax",
  "stable_angina",
  "gerd",
  "costochondritis",
  "pneumonia",
  "pericarditis",
  "panic_attack",
  "muscle_strain",
  "atrial_fibrillation",
  "asthma",
  "copd_exacerbation",
  "pleurisy",
  "peptic_ulcer",
  "gallbladder_disease",
  "bronchitis",
  "esophageal_spasm",
]);

// ── Headache pool (migraine vs. the can't-miss red flags) ───────────────────
const HEADACHE_POOL = pool([
  "migraine",
  "tension_headache",
  "subarachnoid_hemorrhage",
  "meningitis",
  "giant_cell_arteritis",
]);

/**
 * HEADACHE consultation (fictional patient "Jordan Lee", 34).
 *
 * Narrative arc: a severe one-sided throbbing headache initially keeps migraine
 * and the can't-miss subarachnoid haemorrhage / meningitis all on the board.
 * The doctor explicitly probes the red flags (thunderclap onset, worst-ever,
 * neck stiffness, fever) and the patient DENIES them, so the emergencies
 * recede and migraine pulls ahead — while aura, prior identical attacks and
 * relief in a dark room cement it. Decision SUPPORT: the red flags are ruled
 * out by evidence, not ignored.
 */
const HEADACHE_CONSULTATION: ConsultationTurn[] = [
  {
    atMs: 0,
    speaker: "doctor",
    text: "Hi Jordan, what's been going on today?",
  },
  {
    atMs: 4000,
    speaker: "patient",
    text: "I've had a really bad headache since this morning, mostly on the right side of my head.",
    revealsFindings: ["headache", "unilateral_throbbing"],
  },
  {
    atMs: 10000,
    speaker: "doctor",
    text: "Did it come on all at once, like a thunderclap, or build up gradually?",
  },
  {
    atMs: 15000,
    speaker: "patient",
    text: "It built up over maybe half an hour. It wasn't sudden or explosive.",
    revealsFindings: ["gradual_onset"],
    negatesFindings: ["thunderclap_onset", "sudden_onset"],
  },
  {
    atMs: 22000,
    speaker: "doctor",
    text: "Is this the worst headache of your life, or does it feel like ones you've had before?",
  },
  {
    atMs: 27000,
    speaker: "patient",
    text: "Honestly it's like the migraines I used to get — bad, but I recognise it.",
    revealsFindings: ["prior_similar_headaches"],
    negatesFindings: ["worst_headache_of_life"],
  },
  {
    atMs: 34000,
    speaker: "doctor",
    text: "Any warning signs before it started — flashing lights or zig-zag patterns in your vision?",
  },
  {
    atMs: 39000,
    speaker: "patient",
    text: "Yes, I got those shimmering zig-zag lines for about twenty minutes first.",
    revealsFindings: ["aura"],
  },
  {
    atMs: 46000,
    speaker: "doctor",
    text: "How are bright lights and noise? And does anything help?",
  },
  {
    atMs: 51000,
    speaker: "patient",
    text: "Light is awful, I've been lying in a dark room and that's the only thing that helps.",
    revealsFindings: ["photophobia", "relieved_by_dark_room"],
  },
  {
    atMs: 58000,
    speaker: "doctor",
    text: "Have you had a fever, or does it hurt to bend your neck forward?",
  },
  {
    atMs: 63000,
    speaker: "patient",
    text: "No fever, and my neck moves fine, it's not stiff.",
    negatesFindings: ["fever", "neck_stiffness"],
  },
  {
    atMs: 70000,
    speaker: "doctor",
    text: "Any weakness, numbness, or trouble speaking since it began?",
  },
  {
    atMs: 75000,
    speaker: "patient",
    text: "No, nothing like that. Just the headache and feeling a bit sick.",
    revealsFindings: ["nausea_vomiting"],
    negatesFindings: ["focal_neuro_deficit"],
  },
  {
    atMs: 82000,
    speaker: "doctor",
    text: "Good. The red flags for a bleed or infection are absent and this matches your usual migraine — but we keep those on the radar until they're clearly excluded.",
  },
];

/**
 * LATE-TWIST consultation (fictional patient "Sam Carter", 61) — anti-anchoring.
 *
 * Narrative arc: looks like classic GERD / reflux early on (burning retrosternal
 * discomfort worse after meals), so a benign condition leads and the board
 * feels "solved". Then LATE the patient reveals exertional onset, radiation to
 * the left arm, sweating and nausea — findings with strong weights toward ACS —
 * and the board dramatically reshuffles to the can't-miss emergency. The point:
 * TAO does not anchor on the early leader. Reuses the chest-pain pool entirely.
 */
const LATE_TWIST_CONSULTATION: ConsultationTurn[] = [
  {
    atMs: 0,
    speaker: "doctor",
    text: "Hi Sam, tell me what's been bothering you.",
  },
  {
    atMs: 4000,
    speaker: "patient",
    text: "I've had this burning behind my breastbone, like bad heartburn.",
    revealsFindings: ["chest_pain", "burning_retrosternal"],
  },
  {
    atMs: 10000,
    speaker: "doctor",
    text: "Does it come on after meals or when you lie down?",
  },
  {
    atMs: 15000,
    speaker: "patient",
    text: "Yes, definitely worse after a big meal and when I lie flat at night.",
    revealsFindings: ["worse_after_meals"],
  },
  {
    atMs: 22000,
    speaker: "doctor",
    text: "Any nausea with it? Have you tried anything for it?",
  },
  {
    atMs: 27000,
    speaker: "patient",
    text: "A little queasy. Antacids used to take the edge off, so I assumed it was just reflux.",
    revealsFindings: ["nausea"],
  },
  {
    atMs: 34000,
    speaker: "doctor",
    text: "When I press on your chest wall here, does that reproduce the pain?",
  },
  {
    atMs: 39000,
    speaker: "patient",
    text: "No, pressing doesn't change it.",
    negatesFindings: ["reproducible_tenderness"],
  },
  {
    atMs: 47000,
    speaker: "doctor",
    text: "You look uncomfortable now — has anything changed in the last hour?",
  },
  {
    atMs: 52000,
    speaker: "patient",
    text: "Actually, it got much worse walking up the hill to the clinic, and now it's a heavy pressure.",
    revealsFindings: ["exertional", "pressure_quality"],
  },
  {
    atMs: 60000,
    speaker: "doctor",
    text: "Does the pain travel anywhere — your arm, shoulder or jaw?",
  },
  {
    atMs: 65000,
    speaker: "patient",
    text: "Now that you mention it, it's shooting down my left arm, and I've broken out in a cold sweat.",
    revealsFindings: ["radiates_to_left_arm", "diaphoresis"],
  },
  {
    atMs: 72000,
    speaker: "doctor",
    text: "Any high blood pressure or smoking history?",
  },
  {
    atMs: 77000,
    speaker: "patient",
    text: "High blood pressure, yes, and I smoke. I'm feeling short of breath too.",
    revealsFindings: ["hypertension", "smoker", "dyspnea", "older_age"],
  },
  {
    atMs: 85000,
    speaker: "doctor",
    text: "This is no longer reassuring reflux — the exertional, radiating, sweaty pattern means we rule out your heart NOW. ECG and bloods immediately.",
  },
];

/** Generic end-of-script duration: last turn's time plus a short pad. */
export function scenarioDurationMs(turns: ConsultationTurn[]): number {
  if (turns.length === 0) return 0;
  const last = turns.reduce((max, t) => (t.atMs > max ? t.atMs : max), 0);
  return last + 3000;
}

/** The scenarios registry, in display order. */
export const scenarios: Scenario[] = [
  {
    id: "chest_pain",
    title: "Chest pain → ACS",
    description:
      "An adult with exertional chest pain and cardiac risk factors; ACS leads while the emergencies stay on the radar.",
    consultation,
    conditionPool: CHEST_PAIN_POOL,
  },
  {
    id: "headache",
    title: "Headache → migraine vs SAH",
    description:
      "A severe one-sided headache that trends to migraine as the can't-miss subarachnoid haemorrhage and meningitis red flags are explicitly excluded.",
    consultation: HEADACHE_CONSULTATION,
    conditionPool: HEADACHE_POOL,
  },
  {
    id: "late_twist",
    title: "Late twist (anti-anchoring)",
    description:
      "What looks like simple reflux is dramatically overturned late by exertional, radiating, sweaty pain — the board reshuffles to a can't-miss emergency.",
    consultation: LATE_TWIST_CONSULTATION,
    conditionPool: CHEST_PAIN_POOL,
  },
];

/** The default scenario id used when none is selected. */
export const defaultScenarioId = "chest_pain";

/** Fast id -> Scenario lookup. */
export const scenariosById: Record<string, Scenario> = Object.fromEntries(
  scenarios.map((s) => [s.id, s])
);

// Re-export the full condition set for callers that want the unfiltered pool.
export { conditions };
