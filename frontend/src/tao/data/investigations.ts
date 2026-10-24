/**
 * Authored educational investigation options for TAO's fictional scenarios.
 * This catalog is bundled, deterministic, and contains no treatment guidance.
 */
export type InvestigationKind = "bedside" | "laboratory" | "imaging" | "monitoring";
export type InvestigationUrgency = "immediate" | "urgent" | "follow_up";

export interface InvestigationDefinition {
  id: string;
  label: string;
  kind: InvestigationKind;
  description: string;
}

export interface ConditionInvestigationMapping {
  conditionId: string;
  investigationId: string;
  urgency: InvestigationUrgency;
  rationale: string;
}

export const investigations: InvestigationDefinition[] = [
  { id: "focused_exam", label: "Focused cardiorespiratory examination", kind: "bedside", description: "Consider reassessing circulation, breathing, chest findings, and clinical stability." },
  { id: "ecg", label: "12-lead ECG", kind: "bedside", description: "Consider reviewing rhythm and electrical patterns relevant to cardiac causes." },
  { id: "serial_troponin", label: "Serial cardiac troponin", kind: "laboratory", description: "Consider trending an authored cardiac injury marker in clinical context." },
  { id: "pulse_oximetry", label: "Pulse oximetry", kind: "monitoring", description: "Consider tracking oxygen saturation without delaying clinical assessment." },
  { id: "chest_radiograph", label: "Chest radiograph", kind: "imaging", description: "Consider reviewing lungs, pleural spaces, and gross cardiomediastinal features." },
  { id: "d_dimer", label: "D-dimer (when pre-test assessment supports it)", kind: "laboratory", description: "Consider as a context-dependent exclusion aid, not a standalone answer." },
  { id: "ctpa", label: "CT pulmonary angiography", kind: "imaging", description: "Consider pulmonary arterial imaging when embolism remains clinically plausible." },
  { id: "cta_aorta", label: "CT angiography of the aorta", kind: "imaging", description: "Consider aortic imaging when acute aortic pathology remains a concern." },
  { id: "echocardiography", label: "Echocardiography", kind: "imaging", description: "Consider assessment of cardiac structure, function, and selected complications." },
  { id: "cbc", label: "Complete blood count", kind: "laboratory", description: "Consider leukocytes, haemoglobin, and platelets in clinical context." },
  { id: "metabolic_panel", label: "Metabolic panel", kind: "laboratory", description: "Consider renal function and electrolytes relevant to interpretation." },
  { id: "inflammatory_markers", label: "Inflammatory markers", kind: "laboratory", description: "Consider an authored inflammatory signal in the wider clinical picture." },
  { id: "rhythm_monitoring", label: "Rhythm monitoring", kind: "monitoring", description: "Consider monitoring for intermittent or sustained rhythm disturbance." },
  { id: "spirometry", label: "Spirometry or peak flow", kind: "bedside", description: "Consider airflow assessment when clinically stable and appropriate." },
  { id: "upper_gi_evaluation", label: "Upper-GI evaluation", kind: "bedside", description: "Consider symptom-led oesophageal or gastric evaluation after urgent mimics are addressed." },
  { id: "abdominal_ultrasound", label: "Abdominal ultrasound", kind: "imaging", description: "Consider biliary imaging when the symptom pattern supports it." },
  { id: "focused_neuro_exam", label: "Focused neurological examination", kind: "bedside", description: "Consider documenting mental status, cranial nerves, power, sensation, and coordination." },
  { id: "noncontrast_head_ct", label: "Noncontrast head CT", kind: "imaging", description: "Consider assessment for acute intracranial blood or other urgent structural findings." },
  { id: "cta_brain", label: "CT angiography of the brain", kind: "imaging", description: "Consider intracranial vessel imaging when vascular pathology remains plausible." },
  { id: "lumbar_puncture", label: "Lumbar puncture (when appropriate)", kind: "bedside", description: "Consider cerebrospinal fluid assessment after contraindications and prior imaging needs are reviewed." },
  { id: "esr_crp", label: "ESR and CRP", kind: "laboratory", description: "Consider inflammatory markers relevant to suspected cranial arteritis." },
  { id: "temporal_artery_imaging", label: "Temporal artery ultrasound or imaging", kind: "imaging", description: "Consider temporal artery imaging when clinical features support cranial arteritis." },
  { id: "eye_assessment", label: "Urgent eye assessment", kind: "bedside", description: "Consider documenting visual acuity, fields, pupils, and fundal findings." },
];

export const investigationsById: Record<string, InvestigationDefinition> = Object.fromEntries(
  investigations.map((item) => [item.id, item])
);

const map = (conditionId: string, investigationId: string, urgency: InvestigationUrgency, rationale: string): ConditionInvestigationMapping => ({ conditionId, investigationId, urgency, rationale });

/** Every condition in the three scenario pools has authored, condition-specific options. */
export const conditionInvestigationMappings: ConditionInvestigationMapping[] = [
  map("acs", "ecg", "immediate", "Consider early electrical assessment because acute coronary syndromes can produce time-sensitive ECG changes."),
  map("acs", "serial_troponin", "immediate", "Consider serial values because the current pattern may evolve and a single early value can be insufficient."),
  map("acs", "echocardiography", "urgent", "Discuss structural and functional assessment if the clinical or ECG picture warrants it."),
  map("pulmonary_embolism", "pulse_oximetry", "immediate", "Consider oxygenation monitoring while pulmonary embolism remains on the safety watch."),
  map("pulmonary_embolism", "d_dimer", "urgent", "Consider only after clinical pre-test assessment identifies an appropriate exclusion pathway."),
  map("pulmonary_embolism", "ctpa", "urgent", "Discuss pulmonary arterial imaging when embolism remains sufficiently plausible after bedside assessment."),
  map("aortic_dissection", "focused_exam", "immediate", "Consider repeated pulse, perfusion, blood-pressure, and neurological assessment for an acute aortic pattern."),
  map("aortic_dissection", "cta_aorta", "immediate", "Discuss urgent aortic imaging when the symptom and examination pattern sustains concern."),
  map("tension_pneumothorax", "focused_exam", "immediate", "Consider immediate bedside stability and asymmetric respiratory assessment; discuss imaging only if it will not delay emergency clinical review."),
  map("tension_pneumothorax", "pulse_oximetry", "immediate", "Consider continuous oxygenation monitoring while this safety-watch condition is assessed."),
  map("tension_pneumothorax", "chest_radiograph", "urgent", "Consider chest imaging only when the patient is stable enough and it will not delay emergency assessment."),
  map("stable_angina", "ecg", "urgent", "Consider a resting ECG as part of clinician-led assessment of an exertional cardiac pattern."),
  map("stable_angina", "serial_troponin", "urgent", "Discuss biomarker assessment when acute coronary syndrome has not been clinically excluded."),
  map("gerd", "upper_gi_evaluation", "follow_up", "Consider symptom-led upper-GI review after urgent cardiac and thoracic causes are addressed."),
  map("costochondritis", "focused_exam", "follow_up", "Consider focused palpation and movement assessment to evaluate reproducible chest-wall pain."),
  map("pneumonia", "pulse_oximetry", "urgent", "Consider oxygenation assessment because lower respiratory infection can impair gas exchange."),
  map("pneumonia", "chest_radiograph", "urgent", "Discuss chest imaging when examination and respiratory features support pneumonia."),
  map("pneumonia", "cbc", "urgent", "Consider blood-count context when infection severity or an alternative diagnosis is uncertain."),
  map("pericarditis", "ecg", "urgent", "Consider ECG assessment for patterns that can align with pericardial inflammation."),
  map("pericarditis", "inflammatory_markers", "urgent", "Consider inflammatory markers as supportive context rather than a standalone determination."),
  map("pericarditis", "echocardiography", "urgent", "Discuss echocardiography when an effusion or functional impact is a concern."),
  map("panic_attack", "ecg", "urgent", "Consider rhythm and cardiac assessment before attributing acute chest symptoms to anxiety."),
  map("muscle_strain", "focused_exam", "follow_up", "Consider movement and palpation findings after important cardiopulmonary alternatives are assessed."),
  map("atrial_fibrillation", "ecg", "immediate", "Consider ECG documentation because rhythm identification changes the diagnostic pathway."),
  map("atrial_fibrillation", "rhythm_monitoring", "urgent", "Discuss monitoring when symptoms are intermittent or rate behavior needs characterization."),
  map("atrial_fibrillation", "metabolic_panel", "urgent", "Consider electrolytes and renal function as relevant context for a rhythm disturbance."),
  map("asthma", "pulse_oximetry", "urgent", "Consider oxygenation monitoring when breathlessness suggests an airway flare."),
  map("asthma", "spirometry", "follow_up", "Consider airflow testing when clinically stable; it should not delay acute assessment."),
  map("copd_exacerbation", "pulse_oximetry", "urgent", "Consider oxygenation monitoring in worsening breathlessness with chronic lung risk."),
  map("copd_exacerbation", "chest_radiograph", "urgent", "Discuss imaging when infection, pneumothorax, or another thoracic cause remains possible."),
  map("copd_exacerbation", "spirometry", "follow_up", "Consider stable-state airflow testing for longer-term diagnostic clarification."),
  map("pleurisy", "chest_radiograph", "urgent", "Consider imaging to evaluate pulmonary and pleural alternatives to isolated pleurisy."),
  map("peptic_ulcer", "upper_gi_evaluation", "follow_up", "Consider symptom-led gastric evaluation once urgent chest-pain causes are addressed."),
  map("peptic_ulcer", "cbc", "follow_up", "Consider a blood count if bleeding or anaemia is clinically suspected."),
  map("gallbladder_disease", "abdominal_ultrasound", "follow_up", "Consider biliary ultrasound when post-meal symptoms localize to a biliary pattern."),
  map("gallbladder_disease", "cbc", "urgent", "Consider a blood count when fever or inflammatory complications are clinically suspected."),
  map("bronchitis", "pulse_oximetry", "urgent", "Consider oxygenation assessment when cough is accompanied by breathlessness."),
  map("bronchitis", "chest_radiograph", "follow_up", "Discuss imaging when pneumonia or another cause cannot be excluded clinically."),
  map("esophageal_spasm", "upper_gi_evaluation", "follow_up", "Consider oesophageal evaluation only after urgent cardiac mimics are addressed."),
  map("subarachnoid_hemorrhage", "focused_neuro_exam", "immediate", "Consider immediate neurological assessment while an acute intracranial bleed remains on the safety watch."),
  map("subarachnoid_hemorrhage", "noncontrast_head_ct", "immediate", "Discuss urgent noncontrast imaging when the onset pattern supports intracranial haemorrhage."),
  map("subarachnoid_hemorrhage", "cta_brain", "urgent", "Consider vascular imaging when aneurysmal pathology remains plausible after initial assessment."),
  map("subarachnoid_hemorrhage", "lumbar_puncture", "urgent", "Discuss cerebrospinal fluid assessment when suspicion persists and clinician-reviewed timing and contraindications support it."),
  map("meningitis", "focused_neuro_exam", "immediate", "Consider immediate neurological and mental-status assessment for this safety-watch infection."),
  map("meningitis", "cbc", "immediate", "Consider blood-count context as part of urgent infection assessment."),
  map("meningitis", "lumbar_puncture", "urgent", "Discuss cerebrospinal fluid assessment after clinician review of contraindications and any imaging need."),
  map("giant_cell_arteritis", "eye_assessment", "immediate", "Consider urgent visual assessment because sight-threatening features may be subtle."),
  map("giant_cell_arteritis", "esr_crp", "urgent", "Consider inflammatory markers as supportive evidence in the appropriate age and symptom context."),
  map("giant_cell_arteritis", "temporal_artery_imaging", "urgent", "Discuss temporal artery imaging when cranial arteritis remains clinically plausible."),
  map("migraine", "focused_neuro_exam", "urgent", "Consider a focused neurological examination to check for features outside a familiar migraine pattern."),
  map("migraine", "eye_assessment", "follow_up", "Consider eye assessment when visual symptoms are atypical, persistent, or not clearly a familiar aura."),
  map("tension_headache", "focused_neuro_exam", "follow_up", "Consider a focused neurological examination when confirming a benign primary-headache pattern."),
];
