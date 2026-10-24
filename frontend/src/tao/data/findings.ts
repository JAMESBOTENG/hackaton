/**
 * TAO — DEMO dataset: clinical findings catalog.
 *
 * ⚠️ DEMO / EDUCATIONAL DATA ONLY. This is a curated, clearly-labeled teaching
 * dataset for a decision-support demo. It is NOT a validated clinical tool and
 * must not be used for real patient care. All patient framing elsewhere is
 * fictional; this file contains no PII.
 *
 * A "finding" is an atomic, observable clinical fact: a symptom, a sign, or a
 * risk factor (e.g. chest pain, exertional component, diaphoresis, smoker).
 * Findings are the vocabulary shared by three layers:
 *   1. conditions.ts  — each condition weights a subset of these findings.
 *   2. consultation.ts — each spoken turn reveals/negates finding ids.
 *   3. engine/score.ts — scores conditions from the asserted finding set.
 *
 * Keeping findings as small typed ids (rather than free text) is what makes the
 * scoring engine deterministic and inspectable: every probability traces back
 * to a specific finding id and a specific weight.
 *
 * Presentation modeled: acute CHEST PAIN / SHORTNESS OF BREATH in an adult.
 */

/** Broad bucket a finding belongs to — used by the UI for grouping/labels. */
export type FindingKind = "symptom" | "sign" | "risk_factor";

export interface Finding {
  /** Stable machine id, referenced by conditions.ts and consultation.ts. */
  id: string;
  /** Short human label for chips/legends in the UI. */
  label: string;
  /** Canonical clinical phrasing, e.g. for tooltips / the "why" panel. */
  canonical: string;
  /** Authored clinician-ready prompt used by the information-gap control. */
  questionPrompt: string;
  /** Symptom vs. sign vs. risk factor. */
  kind: FindingKind;
  /** Authored can't-miss screening cue; never inferred from condition weights. */
  safetyCue?: boolean;
  /**
   * How to phrase the negation when the finding is explicitly ruled out.
   * The transcript can negate a finding (patient denies it); the UI shows this
   * text and the engine applies the finding's negative influence.
   */
  negationLabel?: string;
}

/**
 * The finding catalog. Ids are the single source of truth; anything that
 * references a finding MUST use an id present here. The score engine validates
 * against this list in development.
 */
const findingDefinitions: Omit<Finding, "questionPrompt">[] = [
  {
    id: "chest_pain",
    label: "Chest pain",
    canonical: "Central or left-sided chest pain",
    kind: "symptom",
    negationLabel: "No chest pain",
  },
  {
    id: "exertional",
    label: "Worse on exertion",
    canonical: "Pain brought on or worsened by physical exertion",
    kind: "symptom",
    negationLabel: "Not related to exertion",
  },
  {
    id: "radiates_to_left_arm",
    label: "Radiates to left arm/jaw",
    canonical: "Pain radiating to the left arm, shoulder or jaw",
    kind: "symptom",
    negationLabel: "No radiation",
  },
  {
    id: "pressure_quality",
    label: "Pressure/tightness",
    canonical: "Pressure, heaviness or tightness quality (not sharp)",
    kind: "symptom",
  },
  {
    id: "sudden_onset",
    label: "Sudden onset",
    canonical: "Abrupt, maximal-at-onset symptom start",
    kind: "symptom",
    safetyCue: true,
  },
  {
    id: "pleuritic",
    label: "Pleuritic (worse breathing in)",
    canonical: "Sharp pain worse with inspiration or coughing",
    kind: "symptom",
  },
  {
    id: "positional_pain",
    label: "Positional (worse lying flat)",
    canonical: "Pain changes with posture; worse supine, eased sitting forward",
    kind: "symptom",
  },
  {
    id: "dyspnea",
    label: "Shortness of breath",
    canonical: "Breathlessness / dyspnea",
    kind: "symptom",
    safetyCue: true,
    negationLabel: "No breathlessness",
  },
  {
    id: "diaphoresis",
    label: "Sweating",
    canonical: "Cold sweat / diaphoresis",
    kind: "sign",
  },
  {
    id: "nausea",
    label: "Nausea",
    canonical: "Nausea or vomiting accompanying the pain",
    kind: "symptom",
  },
  {
    id: "fever",
    label: "Fever",
    canonical: "Documented or subjective fever",
    kind: "sign",
    safetyCue: true,
    negationLabel: "No fever",
  },
  {
    id: "productive_cough",
    label: "Productive cough",
    canonical: "Cough productive of sputum",
    kind: "symptom",
  },
  {
    id: "unilateral_leg_swelling",
    label: "Swollen calf",
    canonical: "Unilateral leg swelling / calf tenderness",
    kind: "sign",
    safetyCue: true,
  },
  {
    id: "recent_immobility",
    label: "Recent immobility/long flight",
    canonical: "Recent long-haul travel, surgery or prolonged immobility",
    kind: "risk_factor",
    safetyCue: true,
  },
  {
    id: "tachycardia",
    label: "Fast heart rate",
    canonical: "Tachycardia on examination",
    kind: "sign",
  },
  {
    id: "hypoxia",
    label: "Low oxygen saturation",
    canonical: "Reduced SpO2 on pulse oximetry",
    kind: "sign",
    safetyCue: true,
  },
  {
    id: "reproducible_tenderness",
    label: "Tender to press",
    canonical: "Chest wall tenderness reproduced by palpation",
    kind: "sign",
  },
  {
    id: "burning_retrosternal",
    label: "Burning behind breastbone",
    canonical: "Burning retrosternal discomfort, acid taste",
    kind: "symptom",
  },
  {
    id: "worse_after_meals",
    label: "Worse after meals/lying down",
    canonical: "Discomfort worse after eating or when recumbent",
    kind: "symptom",
  },
  {
    id: "stress_related",
    label: "Stress/anxiety related",
    canonical: "Symptoms linked to acute stress or anxiety, with no exertional trigger",
    kind: "symptom",
  },
  {
    id: "palpitations",
    label: "Palpitations",
    canonical: "Awareness of rapid or irregular heartbeat",
    kind: "symptom",
  },
  {
    id: "tearing_to_back",
    label: "Tearing pain to back",
    canonical: "Severe tearing/ripping pain radiating to the back",
    kind: "symptom",
    safetyCue: true,
  },
  {
    id: "smoker",
    label: "Smoker",
    canonical: "Current or heavy former cigarette smoking",
    kind: "risk_factor",
  },
  {
    id: "hypertension",
    label: "High blood pressure",
    canonical: "Known hypertension",
    kind: "risk_factor",
  },
  {
    id: "diabetes",
    label: "Diabetes",
    canonical: "Known diabetes mellitus",
    kind: "risk_factor",
  },
  {
    id: "family_history_cad",
    label: "Family history of heart disease",
    canonical: "Premature coronary artery disease in a first-degree relative",
    kind: "risk_factor",
  },
  {
    id: "older_age",
    label: "Older age",
    canonical: "Age over 50",
    kind: "risk_factor",
    safetyCue: true,
  },
  {
    id: "recent_uri",
    label: "Recent viral illness",
    canonical: "Recent upper respiratory / viral prodrome",
    kind: "risk_factor",
  },

  // ───────────────────────── Headache presentation ─────────────────────────
  // Added for the HEADACHE scenario (migraine vs. subarachnoid haemorrhage /
  // meningitis / giant cell arteritis). DEMO / EDUCATIONAL, no PII.
  {
    id: "headache",
    label: "Headache",
    canonical: "Headache as the presenting complaint",
    kind: "symptom",
    negationLabel: "No headache",
  },
  {
    id: "thunderclap_onset",
    label: "Thunderclap onset",
    canonical: "Instantaneous, maximal-at-onset (thunderclap) headache",
    kind: "symptom",
    safetyCue: true,
    negationLabel: "No thunderclap onset",
  },
  {
    id: "worst_headache_of_life",
    label: "Worst headache of life",
    canonical: "Patient reports the worst headache they have ever had",
    kind: "symptom",
    safetyCue: true,
    negationLabel: "Not the worst headache ever",
  },
  {
    id: "neck_stiffness",
    label: "Neck stiffness",
    canonical: "Neck stiffness / meningismus",
    kind: "sign",
    safetyCue: true,
    negationLabel: "No neck stiffness",
  },
  {
    id: "photophobia",
    label: "Light sensitivity",
    canonical: "Photophobia (discomfort in bright light)",
    kind: "symptom",
    negationLabel: "No light sensitivity",
  },
  {
    id: "aura",
    label: "Visual aura",
    canonical: "Preceding visual aura (e.g. zig-zag lines, scotoma)",
    kind: "symptom",
    negationLabel: "No aura",
  },
  {
    id: "unilateral_throbbing",
    label: "One-sided throbbing",
    canonical: "Unilateral, pulsating/throbbing headache",
    kind: "symptom",
    negationLabel: "Not one-sided or throbbing",
  },
  {
    id: "relieved_by_dark_room",
    label: "Eased by dark/quiet",
    canonical: "Relieved by lying in a dark, quiet room",
    kind: "symptom",
    negationLabel: "Not relieved by dark/quiet",
  },
  {
    id: "focal_neuro_deficit",
    label: "Focal neurological deficit",
    canonical: "Focal neurological deficit (weakness, speech or vision loss)",
    kind: "sign",
    safetyCue: true,
    negationLabel: "No focal neurological deficit",
  },
  {
    id: "gradual_onset",
    label: "Gradual onset",
    canonical: "Headache that built up gradually over minutes to hours",
    kind: "symptom",
    negationLabel: "Not gradual in onset",
  },
  {
    id: "prior_similar_headaches",
    label: "Prior similar headaches",
    canonical: "History of previous similar headache episodes",
    kind: "risk_factor",
    negationLabel: "No previous similar headaches",
  },
  {
    id: "scalp_tenderness",
    label: "Scalp tenderness",
    canonical: "Tender scalp or temporal artery, jaw claudication",
    kind: "sign",
    safetyCue: true,
    negationLabel: "No scalp tenderness",
  },
  {
    id: "visual_disturbance",
    label: "Visual disturbance",
    canonical: "New visual disturbance or transient visual loss",
    kind: "symptom",
    safetyCue: true,
    negationLabel: "No visual disturbance",
  },
  {
    id: "nausea_vomiting",
    label: "Nausea/vomiting",
    canonical: "Nausea or vomiting accompanying the headache",
    kind: "symptom",
    negationLabel: "No nausea or vomiting",
  },
];

/** Authored prompts are deliberately data, not generated grammar or an LLM. */
const questionPrompts: Record<string, string> = {
  chest_pain: "Is the discomfort central or left-sided in the chest?",
  exertional: "Does physical activity bring on or worsen the symptoms?",
  radiates_to_left_arm: "Does the discomfort travel to the arm, shoulder, jaw, or back?",
  pressure_quality: "Does it feel like pressure, heaviness, or tightness rather than a sharp pain?",
  sudden_onset: "Did the symptoms begin abruptly and reach maximum intensity immediately?",
  pleuritic: "Is the pain worse with a deep breath or cough?",
  positional_pain: "Does posture change the pain, particularly lying flat or sitting forward?",
  dyspnea: "Is there shortness of breath with these symptoms?",
  diaphoresis: "Have you had an unexplained cold sweat?",
  nausea: "Have you felt nauseated or vomited with the pain?",
  fever: "Have you had a measured fever or felt feverish?",
  productive_cough: "Have you had a cough producing sputum?",
  unilateral_leg_swelling: "Is one calf newly swollen, painful, or tender?",
  recent_immobility: "Any recent surgery, prolonged immobility, or long-distance travel?",
  tachycardia: "Is the measured heart rate elevated?",
  hypoxia: "Is the oxygen saturation reduced?",
  reproducible_tenderness: "Can palpation of the chest wall reproduce the pain?",
  burning_retrosternal: "Is there burning behind the breastbone or an acid taste?",
  worse_after_meals: "Is the discomfort worse after meals or when lying down?",
  stress_related: "Did the symptoms begin during acute stress without an exertional trigger?",
  palpitations: "Have you noticed a rapid or irregular heartbeat?",
  tearing_to_back: "Is there severe tearing pain radiating through to the back?",
  smoker: "Do you currently smoke, or have a substantial previous smoking history?",
  hypertension: "Is there a history of high blood pressure?",
  diabetes: "Is there a history of diabetes?",
  family_history_cad: "Any premature heart disease in a parent or sibling?",
  older_age: "Is the patient over 50?",
  recent_uri: "Was there a recent viral or upper-respiratory illness?",
  headache: "Is headache the main presenting symptom?",
  thunderclap_onset: "Did the headache reach maximum intensity within seconds?",
  worst_headache_of_life: "Is this the worst headache the patient has ever experienced?",
  neck_stiffness: "Is there neck stiffness or pain on neck flexion?",
  photophobia: "Does bright light worsen the headache?",
  aura: "Were there visual zig-zags, flashing lights, or another warning before onset?",
  unilateral_throbbing: "Is the headache predominantly one-sided and throbbing?",
  relieved_by_dark_room: "Does resting in a dark, quiet room improve the symptoms?",
  focal_neuro_deficit: "Is there new weakness, numbness, speech difficulty, or vision loss?",
  gradual_onset: "Did the headache build gradually over minutes to hours?",
  prior_similar_headaches: "Has the patient had previous episodes with the same pattern?",
  scalp_tenderness: "Is there scalp or temporal tenderness, or jaw pain when chewing?",
  visual_disturbance: "Is there new visual disturbance or transient visual loss?",
  nausea_vomiting: "Is nausea or vomiting accompanying the headache?",
};

export const findings: Finding[] = findingDefinitions.map((finding) => ({
  ...finding,
  questionPrompt:
    questionPrompts[finding.id] ?? `Clarify whether ${finding.canonical.toLowerCase()} is present.`,
}));

/** Fast id -> Finding lookup. */
export const findingsById: Record<string, Finding> = Object.fromEntries(
  findings.map((f) => [f.id, f])
);

/** All valid finding ids (used by the engine to validate references). */
export const findingIds: ReadonlySet<string> = new Set(findings.map((f) => f.id));
