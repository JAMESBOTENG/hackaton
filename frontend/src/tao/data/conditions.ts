/**
 * TAO — DEMO dataset: condition knowledge base.
 *
 * ⚠️ DEMO / EDUCATIONAL DATA ONLY. This is a curated, clearly-labeled teaching
 * dataset built for a decision-support demo. It is NOT a validated diagnostic
 * instrument and must never be used for real patient care. TAO is framed as
 * decision SUPPORT, not autonomous diagnosis. No real PII appears anywhere.
 *
 * Presentation modeled: acute CHEST PAIN / SHORTNESS OF BREATH in an adult.
 *
 * ── How the model works (so every probability is inspectable) ──────────────
 * Each Condition declares:
 *   • prior          — a baseline weight reflecting roughly how common the
 *                      condition is in an undifferentiated chest-pain/dyspnea
 *                      presentation BEFORE any findings are known. These are
 *                      illustrative teaching priors, not epidemiological rates.
 *   • findingWeights — for each relevant finding id, a signed weight. Positive
 *                      raises the condition's score when that finding is
 *                      asserted; negative lowers it. If the finding is
 *                      explicitly NEGATED in the transcript, the engine applies
 *                      the opposite-sign contribution (see engine/score.ts).
 *   • cantMiss       — true for red-flag ("can't-miss") emergencies that must
 *                      always be considered even at low probability.
 *   • whyTemplate    — plain-language reasoning shown in the UI "why" panel.
 *   • references     — real, citable sources (PubMed / StatPearls / NICE /
 *                      WHO / MedlinePlus).
 *
 * The scoring engine (engine/score.ts) is deliberately plain arithmetic:
 * score = prior + Σ(weights of matched findings). Scores are then normalized to
 * a probability distribution. Nothing here is a black box.
 */

/** A citable reference. All URLs point to real, stable pages. */
export interface Reference {
  title: string;
  url: string;
  /** Publisher/source, for the UI badge. */
  source: "PubMed" | "StatPearls" | "NICE" | "WHO" | "MedlinePlus";
}

export interface Condition {
  /** Stable machine id. */
  id: string;
  /** Human-readable condition name. */
  name: string;
  /** Short plain-language description for the card. */
  description: string;
  /**
   * Baseline weight before any findings (illustrative teaching prior, not a
   * real prevalence). Higher = more common in this presentation.
   */
  prior: number;
  /**
   * Signed influence of each relevant finding id. Positive raises the score,
   * negative lowers it. Only findings listed here affect this condition.
   */
  findingWeights: Record<string, number>;
  /** Red-flag / can't-miss emergency that must always stay on the radar. */
  cantMiss: boolean;
  /**
   * Plain-language reasoning template shown in the "why" panel. The UI may
   * append the concrete contributing findings computed by the engine.
   */
  whyTemplate: string;
  /** Real, citable references (>= 2 each). */
  references: Reference[];
}

/**
 * The condition set: common differentials + a handful of can't-miss
 * emergencies for an acute chest-pain / dyspnea presentation.
 */
export const conditions: Condition[] = [
  // ───────────────────────── Can't-miss emergencies ─────────────────────────
  {
    id: "acs",
    name: "Acute coronary syndrome",
    description:
      "Reduced blood flow to the heart muscle (unstable angina or myocardial infarction).",
    prior: 1.4,
    cantMiss: true,
    findingWeights: {
      chest_pain: 1.1,
      pressure_quality: 1.2,
      exertional: 1.3,
      radiates_to_left_arm: 1.6,
      diaphoresis: 1.2,
      nausea: 0.7,
      dyspnea: 0.6,
      older_age: 0.7,
      smoker: 0.6,
      hypertension: 0.5,
      diabetes: 0.6,
      family_history_cad: 0.6,
      reproducible_tenderness: -1.4,
      pleuritic: -0.9,
      stress_related: -0.6,
    },
    whyTemplate:
      "Pressure-type chest pain that worsens with exertion and radiates to the arm or jaw, with sweating and cardiac risk factors, is the classic pattern of myocardial ischemia and must be excluded first.",
    references: [
      {
        title: "Acute Coronary Syndrome (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK459157/",
        source: "StatPearls",
      },
      {
        title: "Heart attack — MedlinePlus",
        url: "https://medlineplus.gov/heartattack.html",
        source: "MedlinePlus",
      },
      {
        title:
          "Acute coronary syndromes: diagnosis and management (NICE NG185)",
        url: "https://www.nice.org.uk/guidance/ng185",
        source: "NICE",
      },
    ],
  },
  {
    id: "pulmonary_embolism",
    name: "Pulmonary embolism",
    description: "A blood clot lodged in the pulmonary arteries of the lungs.",
    prior: 0.8,
    cantMiss: true,
    findingWeights: {
      dyspnea: 1.3,
      pleuritic: 1.2,
      sudden_onset: 1.1,
      tachycardia: 1.0,
      hypoxia: 1.4,
      unilateral_leg_swelling: 1.7,
      recent_immobility: 1.6,
      chest_pain: 0.5,
      reproducible_tenderness: -1.0,
      exertional: -0.4,
    },
    whyTemplate:
      "Sudden pleuritic breathlessness with low oxygen, a fast heart rate, and a recent period of immobility or a swollen calf points to a clot in the lungs.",
    references: [
      {
        title: "Pulmonary Embolism (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK560551/",
        source: "StatPearls",
      },
      {
        title:
          "Venous thromboembolic diseases: diagnosis and management (NICE NG158)",
        url: "https://www.nice.org.uk/guidance/ng158",
        source: "NICE",
      },
      {
        title: "Pulmonary embolism — MedlinePlus",
        url: "https://medlineplus.gov/pulmonaryembolism.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "aortic_dissection",
    name: "Aortic dissection",
    description: "A tear in the inner wall of the aorta, the body's main artery.",
    prior: 0.3,
    cantMiss: true,
    findingWeights: {
      tearing_to_back: 2.2,
      sudden_onset: 1.4,
      chest_pain: 0.8,
      hypertension: 1.0,
      older_age: 0.6,
      diaphoresis: 0.6,
      reproducible_tenderness: -1.2,
      pleuritic: -0.6,
    },
    whyTemplate:
      "Abrupt, severe tearing pain radiating to the back in a patient with high blood pressure is the hallmark of an aortic dissection, a surgical emergency.",
    references: [
      {
        title: "Aortic Dissection (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK441963/",
        source: "StatPearls",
      },
      {
        title: "Aortic dissection — MedlinePlus",
        url: "https://medlineplus.gov/ency/article/000181.htm",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "tension_pneumothorax",
    name: "Pneumothorax",
    description:
      "Air trapped between the lung and chest wall, causing the lung to collapse.",
    prior: 0.3,
    cantMiss: true,
    findingWeights: {
      sudden_onset: 1.3,
      dyspnea: 1.1,
      pleuritic: 1.0,
      hypoxia: 0.9,
      tachycardia: 0.6,
      chest_pain: 0.6,
      smoker: 0.4,
      reproducible_tenderness: -0.6,
    },
    whyTemplate:
      "Sudden one-sided pleuritic chest pain with breathlessness and low oxygen, often in a tall or smoking patient, suggests a collapsed lung.",
    references: [
      {
        title: "Pneumothorax (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK441885/",
        source: "StatPearls",
      },
      {
        title: "Collapsed lung — MedlinePlus",
        url: "https://medlineplus.gov/ency/article/000087.htm",
        source: "MedlinePlus",
      },
    ],
  },

  // ───────────────────────── Common differentials ──────────────────────────
  {
    id: "stable_angina",
    name: "Stable angina",
    description:
      "Predictable chest discomfort from coronary narrowing, brought on by exertion and relieved by rest.",
    prior: 1.1,
    cantMiss: false,
    findingWeights: {
      chest_pain: 0.8,
      pressure_quality: 1.0,
      exertional: 1.5,
      older_age: 0.6,
      smoker: 0.5,
      hypertension: 0.5,
      diabetes: 0.5,
      family_history_cad: 0.5,
      sudden_onset: -0.8,
      pleuritic: -0.9,
      reproducible_tenderness: -1.0,
    },
    whyTemplate:
      "Pressure-type chest discomfort that is reliably brought on by exertion and settles with rest, with cardiac risk factors, fits stable angina.",
    references: [
      {
        title: "Stable Angina (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK554542/",
        source: "StatPearls",
      },
      {
        title: "Stable angina: management (NICE CG126)",
        url: "https://www.nice.org.uk/guidance/cg126",
        source: "NICE",
      },
    ],
  },
  {
    id: "gerd",
    name: "Gastroesophageal reflux (GERD)",
    description:
      "Stomach acid flowing back into the esophagus, causing burning chest discomfort.",
    prior: 1.3,
    cantMiss: false,
    findingWeights: {
      burning_retrosternal: 1.7,
      worse_after_meals: 1.5,
      chest_pain: 0.4,
      nausea: 0.3,
      exertional: -0.9,
      diaphoresis: -0.6,
      radiates_to_left_arm: -0.5,
      pleuritic: -0.4,
    },
    whyTemplate:
      "Burning discomfort behind the breastbone that is worse after meals or lying down, without an exertional trigger, is typical of acid reflux.",
    references: [
      {
        title: "Gastroesophageal Reflux Disease (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK441938/",
        source: "StatPearls",
      },
      {
        title: "GERD — MedlinePlus",
        url: "https://medlineplus.gov/gerd.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "costochondritis",
    name: "Costochondritis",
    description:
      "Inflammation of the cartilage joining the ribs to the breastbone.",
    prior: 1.1,
    cantMiss: false,
    findingWeights: {
      reproducible_tenderness: 2.0,
      chest_pain: 0.5,
      pleuritic: 0.6,
      exertional: -0.7,
      diaphoresis: -0.7,
      radiates_to_left_arm: -0.6,
      dyspnea: -0.4,
    },
    whyTemplate:
      "Sharp chest-wall pain that is reproduced by pressing on the ribs, without sweating or breathlessness, points to inflamed rib cartilage.",
    references: [
      {
        title: "Costochondritis (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK532931/",
        source: "StatPearls",
      },
      {
        title: "Chest pain — MedlinePlus",
        url: "https://medlineplus.gov/chestpain.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "pneumonia",
    name: "Pneumonia",
    description: "Infection of the lung tissue, often bacterial or viral.",
    prior: 0.9,
    cantMiss: false,
    findingWeights: {
      fever: 1.6,
      productive_cough: 1.6,
      pleuritic: 1.0,
      dyspnea: 0.9,
      tachycardia: 0.5,
      hypoxia: 0.7,
      recent_uri: 0.6,
      chest_pain: 0.3,
      exertional: -0.5,
      burning_retrosternal: -0.5,
    },
    whyTemplate:
      "Fever with a productive cough and pleuritic chest pain, often after a viral illness, suggests a chest infection.",
    references: [
      {
        title: "Community-Acquired Pneumonia (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK430749/",
        source: "StatPearls",
      },
      {
        title: "Pneumonia — WHO fact sheet",
        url: "https://www.who.int/news-room/fact-sheets/detail/pneumonia",
        source: "WHO",
      },
      {
        title: "Pneumonia — MedlinePlus",
        url: "https://medlineplus.gov/pneumonia.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "pericarditis",
    name: "Pericarditis",
    description: "Inflammation of the sac surrounding the heart.",
    prior: 0.6,
    cantMiss: false,
    findingWeights: {
      positional_pain: 1.8,
      pleuritic: 1.1,
      recent_uri: 0.9,
      chest_pain: 0.6,
      fever: 0.5,
      exertional: -0.6,
      reproducible_tenderness: -0.5,
      radiates_to_left_arm: -0.3,
    },
    whyTemplate:
      "Sharp chest pain that is worse lying flat and eased by sitting forward, often after a recent viral illness, is characteristic of pericarditis.",
    references: [
      {
        title: "Acute Pericarditis (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK431080/",
        source: "StatPearls",
      },
      {
        title: "Pericarditis — MedlinePlus",
        url: "https://medlineplus.gov/ency/article/000182.htm",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "panic_attack",
    name: "Panic attack / anxiety",
    description:
      "An acute surge of anxiety producing chest tightness, palpitations and breathlessness.",
    prior: 0.9,
    cantMiss: false,
    findingWeights: {
      stress_related: 1.8,
      palpitations: 1.2,
      dyspnea: 0.6,
      chest_pain: 0.4,
      pressure_quality: 0.3,
      exertional: -1.0,
      diaphoresis: 0.2,
      fever: -0.6,
      hypoxia: -0.8,
    },
    whyTemplate:
      "Chest tightness with palpitations and breathlessness that comes on with acute stress rather than exertion, and with normal oxygen, suggests a panic attack.",
    references: [
      {
        title: "Panic Disorder (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK430973/",
        source: "StatPearls",
      },
      {
        title: "Panic disorder — MedlinePlus",
        url: "https://medlineplus.gov/panicdisorder.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "muscle_strain",
    name: "Musculoskeletal strain",
    description: "Strained chest-wall muscles, often after exertion or coughing.",
    prior: 1.0,
    cantMiss: false,
    findingWeights: {
      reproducible_tenderness: 1.6,
      chest_pain: 0.4,
      pleuritic: 0.4,
      diaphoresis: -0.7,
      radiates_to_left_arm: -0.6,
      dyspnea: -0.5,
      exertional: -0.3,
    },
    whyTemplate:
      "Localized chest-wall pain reproduced by movement or palpation, without cardiac or infective features, suggests a muscle strain.",
    references: [
      {
        title: "Muscle Strain (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK535402/",
        source: "StatPearls",
      },
      {
        title: "Chest pain — MedlinePlus",
        url: "https://medlineplus.gov/chestpain.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "atrial_fibrillation",
    name: "Atrial fibrillation",
    description: "An irregular, often rapid heart rhythm.",
    prior: 0.6,
    cantMiss: false,
    findingWeights: {
      palpitations: 1.7,
      tachycardia: 1.1,
      dyspnea: 0.7,
      older_age: 0.6,
      hypertension: 0.5,
      chest_pain: 0.3,
      reproducible_tenderness: -0.6,
      pleuritic: -0.4,
    },
    whyTemplate:
      "Palpitations with a fast, irregular pulse and breathlessness, especially in an older patient, raise the possibility of atrial fibrillation.",
    references: [
      {
        title: "Atrial Fibrillation (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK526072/",
        source: "StatPearls",
      },
      {
        title: "Atrial fibrillation: diagnosis and management (NICE NG196)",
        url: "https://www.nice.org.uk/guidance/ng196",
        source: "NICE",
      },
    ],
  },
  {
    id: "asthma",
    name: "Asthma exacerbation",
    description: "Reversible narrowing of the airways causing wheeze and breathlessness.",
    prior: 0.7,
    cantMiss: false,
    findingWeights: {
      dyspnea: 1.4,
      productive_cough: 0.6,
      tachycardia: 0.5,
      recent_uri: 0.7,
      pressure_quality: 0.3,
      radiates_to_left_arm: -0.7,
      reproducible_tenderness: -0.6,
      burning_retrosternal: -0.5,
    },
    whyTemplate:
      "Breathlessness with chest tightness and cough, often triggered by a viral illness, can reflect an asthma flare.",
    references: [
      {
        title: "Asthma (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK430901/",
        source: "StatPearls",
      },
      {
        title: "Asthma — WHO fact sheet",
        url: "https://www.who.int/news-room/fact-sheets/detail/asthma",
        source: "WHO",
      },
    ],
  },
  {
    id: "copd_exacerbation",
    name: "COPD exacerbation",
    description:
      "A flare of chronic obstructive pulmonary disease with worsening breathlessness and cough.",
    prior: 0.6,
    cantMiss: false,
    findingWeights: {
      dyspnea: 1.3,
      productive_cough: 1.2,
      smoker: 1.3,
      older_age: 0.7,
      recent_uri: 0.6,
      hypoxia: 0.7,
      radiates_to_left_arm: -0.7,
      reproducible_tenderness: -0.6,
    },
    whyTemplate:
      "Worsening breathlessness and a productive cough in an older smoker point to a flare of chronic lung disease.",
    references: [
      {
        title: "Chronic Obstructive Pulmonary Disease (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK559281/",
        source: "StatPearls",
      },
      {
        title:
          "Chronic obstructive pulmonary disease in over 16s: diagnosis and management (NICE NG115)",
        url: "https://www.nice.org.uk/guidance/ng115",
        source: "NICE",
      },
    ],
  },
  {
    id: "pleurisy",
    name: "Pleurisy",
    description: "Inflammation of the lining of the lungs, typically after a viral illness.",
    prior: 0.6,
    cantMiss: false,
    findingWeights: {
      pleuritic: 1.7,
      recent_uri: 1.0,
      chest_pain: 0.5,
      fever: 0.5,
      exertional: -0.6,
      radiates_to_left_arm: -0.6,
      diaphoresis: -0.5,
    },
    whyTemplate:
      "Sharp pain that is clearly worse on breathing in, following a recent viral illness, suggests inflammation of the lung lining.",
    references: [
      {
        title: "Pleurisy and Pleural Effusion (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK513240/",
        source: "StatPearls",
      },
      {
        title: "Pleural disorders — MedlinePlus",
        url: "https://medlineplus.gov/pleuraldisorders.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "peptic_ulcer",
    name: "Peptic ulcer disease",
    description: "A sore in the lining of the stomach or upper small intestine.",
    prior: 0.6,
    cantMiss: false,
    findingWeights: {
      burning_retrosternal: 1.1,
      worse_after_meals: 1.3,
      nausea: 0.8,
      chest_pain: 0.3,
      exertional: -0.8,
      diaphoresis: -0.5,
      pleuritic: -0.5,
      radiates_to_left_arm: -0.5,
    },
    whyTemplate:
      "Burning upper-abdominal or lower-chest pain related to meals, with nausea and no exertional trigger, may reflect a peptic ulcer.",
    references: [
      {
        title: "Peptic Ulcer Disease (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK534792/",
        source: "StatPearls",
      },
      {
        title: "Peptic ulcer — MedlinePlus",
        url: "https://medlineplus.gov/pepticulcer.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "gallbladder_disease",
    name: "Biliary colic / gallstones",
    description:
      "Pain from gallstones obstructing the gallbladder, often after fatty meals.",
    prior: 0.5,
    cantMiss: false,
    findingWeights: {
      worse_after_meals: 1.4,
      nausea: 1.1,
      chest_pain: 0.2,
      fever: 0.4,
      exertional: -0.8,
      pleuritic: -0.5,
      radiates_to_left_arm: -0.6,
      diaphoresis: -0.4,
    },
    whyTemplate:
      "Right-upper-abdominal or lower-chest pain after fatty meals with nausea, without cardiac or respiratory features, can be biliary in origin.",
    references: [
      {
        title: "Cholelithiasis (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK470440/",
        source: "StatPearls",
      },
      {
        title: "Gallstones — MedlinePlus",
        url: "https://medlineplus.gov/gallstones.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "bronchitis",
    name: "Acute bronchitis",
    description: "A usually viral infection of the large airways causing cough.",
    prior: 0.7,
    cantMiss: false,
    findingWeights: {
      productive_cough: 1.5,
      recent_uri: 1.1,
      fever: 0.6,
      chest_pain: 0.2,
      pleuritic: 0.4,
      exertional: -0.5,
      radiates_to_left_arm: -0.6,
      hypoxia: -0.4,
    },
    whyTemplate:
      "A productive cough following a viral illness, with only mild chest discomfort and normal oxygen, suggests acute bronchitis.",
    references: [
      {
        title: "Acute Bronchitis (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK448067/",
        source: "StatPearls",
      },
      {
        title: "Acute bronchitis — MedlinePlus",
        url: "https://medlineplus.gov/acutebronchitis.html",
        source: "MedlinePlus",
      },
    ],
  },
  {
    id: "esophageal_spasm",
    name: "Esophageal spasm",
    description:
      "Uncoordinated contractions of the esophagus that can mimic cardiac chest pain.",
    prior: 0.4,
    cantMiss: false,
    findingWeights: {
      burning_retrosternal: 1.0,
      chest_pain: 0.6,
      worse_after_meals: 0.8,
      pressure_quality: 0.5,
      nausea: 0.3,
      exertional: -0.7,
      diaphoresis: -0.5,
      reproducible_tenderness: -0.6,
    },
    whyTemplate:
      "Squeezing retrosternal pain related to swallowing or meals, which can mimic angina but lacks an exertional trigger, may be esophageal spasm.",
    references: [
      {
        title: "Esophageal Motility Disorders (StatPearls)",
        url: "https://www.ncbi.nlm.nih.gov/books/NBK562155/",
        source: "StatPearls",
      },
      {
        title: "Esophagus disorders — MedlinePlus",
        url: "https://medlineplus.gov/esophagusdisorders.html",
        source: "MedlinePlus",
      },
    ],
  },
];

/** Fast id -> Condition lookup. */
export const conditionsById: Record<string, Condition> = Object.fromEntries(
  conditions.map((c) => [c.id, c])
);
