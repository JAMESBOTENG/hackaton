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
  /** Symptom vs. sign vs. risk factor. */
  kind: FindingKind;
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
export const findings: Finding[] = [
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
  },
  {
    id: "recent_immobility",
    label: "Recent immobility/long flight",
    canonical: "Recent long-haul travel, surgery or prolonged immobility",
    kind: "risk_factor",
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
  },
  {
    id: "recent_uri",
    label: "Recent viral illness",
    canonical: "Recent upper respiratory / viral prodrome",
    kind: "risk_factor",
  },
];

/** Fast id -> Finding lookup. */
export const findingsById: Record<string, Finding> = Object.fromEntries(
  findings.map((f) => [f.id, f])
);

/** All valid finding ids (used by the engine to validate references). */
export const findingIds: ReadonlySet<string> = new Set(findings.map((f) => f.id));
