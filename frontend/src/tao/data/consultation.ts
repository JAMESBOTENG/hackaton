/**
 * TAO — DEMO dataset: scripted doctor-patient consultation.
 *
 * ⚠️ DEMO / EDUCATIONAL. Fictional patient, no real PII. This scripted dialogue
 * drives the offline demo: as each turn "arrives", the findings it reveals (or
 * negates) are fed to the scoring engine, so the probability board visibly
 * reshuffles from early ambiguity toward a clear leading condition while the
 * can't-miss emergencies stay appropriately on the radar.
 *
 * Narrative arc (fictional patient "Alex Rivera", 58):
 *   • t ≈ 0-30s   — undifferentiated chest pain + exertion + risk factors:
 *                   ACS and stable angina lead, emergencies stay visible.
 *   • t ≈ 30-75s  — radiation to arm, sweating, nausea, breathlessness:
 *                   ACS pulls clearly ahead.
 *   • t ≈ 75-120s — PE features (leg swelling, recent flight) explored and the
 *                   board narrows; reflux is explicitly ruled out.
 * Total runtime ≈ 120s (within the 90-150s target).
 *
 * Every revealsFindings / negatesFindings id MUST exist in findings.ts.
 */

/** Who is speaking in a transcript turn. */
export type Speaker = "doctor" | "patient";

export interface ConsultationTurn {
  /** Playback time, in milliseconds from the start of the consultation. */
  atMs: number;
  speaker: Speaker;
  /** Spoken line shown in the transcript panel. */
  text: string;
  source?: "scripted" | "microphone";
  /** Optional marker for microphone text that has not been clinically reviewed. */
  unreviewed?: boolean;
  /** Finding ids this turn asserts as present. */
  revealsFindings?: string[];
  /** Finding ids this turn explicitly denies / rules out. */
  negatesFindings?: string[];
}

/**
 * The scripted consultation. Ordered by atMs. The player (engine/player.ts)
 * accumulates revealed findings and removes/denies negated ones as it streams
 * these turns.
 */
export const consultation: ConsultationTurn[] = [
  {
    atMs: 0,
    speaker: "doctor",
    text: "Hi Alex, thanks for coming in. What brings you here today?",
  },
  {
    atMs: 4000,
    speaker: "patient",
    text: "I've been getting this pain in the middle of my chest for the last couple of hours.",
    revealsFindings: ["chest_pain"],
  },
  {
    atMs: 10000,
    speaker: "doctor",
    text: "Can you describe the pain? Is it sharp, or more of a pressure?",
  },
  {
    atMs: 15000,
    speaker: "patient",
    text: "It's like a heavy pressure, almost like something is sitting on my chest.",
    revealsFindings: ["pressure_quality"],
  },
  {
    atMs: 22000,
    speaker: "doctor",
    text: "Does anything bring it on or make it worse?",
  },
  {
    atMs: 27000,
    speaker: "patient",
    text: "It started when I was climbing the stairs, and it got worse the more I pushed.",
    revealsFindings: ["exertional"],
  },
  {
    atMs: 34000,
    speaker: "doctor",
    text: "Any medical history I should know about? Blood pressure, smoking?",
  },
  {
    atMs: 39000,
    speaker: "patient",
    text: "I have high blood pressure, and I smoke about a pack a day. My dad had a heart attack at 55.",
    revealsFindings: ["hypertension", "smoker", "family_history_cad", "older_age"],
  },
  {
    atMs: 47000,
    speaker: "doctor",
    text: "Does the pain travel anywhere, like into your arm, shoulder or jaw?",
  },
  {
    atMs: 52000,
    speaker: "patient",
    text: "Yeah, it kind of shoots down my left arm and up into my jaw.",
    revealsFindings: ["radiates_to_left_arm"],
  },
  {
    atMs: 59000,
    speaker: "doctor",
    text: "Have you felt sweaty, sick to your stomach, or short of breath?",
  },
  {
    atMs: 64000,
    speaker: "patient",
    text: "I broke out in a cold sweat and felt a bit nauseous. I'm also a little short of breath.",
    revealsFindings: ["diaphoresis", "nausea", "dyspnea"],
  },
  {
    atMs: 72000,
    speaker: "doctor",
    text: "Is this a burning feeling, and is it worse after meals or when you lie down?",
  },
  {
    atMs: 77000,
    speaker: "patient",
    text: "No, it's not burning at all, and meals don't seem to change it.",
    negatesFindings: ["burning_retrosternal", "worse_after_meals"],
  },
  {
    atMs: 85000,
    speaker: "doctor",
    text: "When I press here on your chest wall, does that reproduce the pain?",
  },
  {
    atMs: 90000,
    speaker: "patient",
    text: "No, pressing on it doesn't really change anything.",
    negatesFindings: ["reproducible_tenderness"],
  },
  {
    atMs: 97000,
    speaker: "doctor",
    text: "Any recent long flights, surgery, or swelling or pain in your calves?",
  },
  {
    atMs: 102000,
    speaker: "patient",
    text: "No long trips, and my legs feel completely normal.",
    negatesFindings: ["recent_immobility", "unilateral_leg_swelling"],
  },
  {
    atMs: 109000,
    speaker: "doctor",
    text: "Did the pain come on all at once, like a sudden tearing, or build up gradually?",
  },
  {
    atMs: 114000,
    speaker: "patient",
    text: "It built up over a few minutes with the exertion, no sudden tearing feeling.",
    negatesFindings: ["sudden_onset", "tearing_to_back"],
  },
  {
    atMs: 120000,
    speaker: "doctor",
    text: "Thank you, Alex. Given the pattern, we need to rule out your heart first — I'm getting an ECG and bloods right now.",
  },
];

/** Total scripted runtime in milliseconds (end of the last turn, padded). */
export const consultationDurationMs =
  consultation.length > 0
    ? consultation[consultation.length - 1].atMs + 3000
    : 0;
