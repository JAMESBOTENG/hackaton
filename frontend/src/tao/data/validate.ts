import { conditions, conditionsById } from "./conditions";
import { findings, findingsById } from "./findings";
import { conditionInvestigationMappings, investigations, investigationsById } from "./investigations";
import { scenarios } from "./scenarios";

const duplicates = (ids: string[]) => ids.filter((id, index) => ids.indexOf(id) !== index);

/** Return all authored-data integrity failures without crashing the production demo. */
export function validateTaoData(): string[] {
  const errors: string[] = [];
  for (const id of duplicates(conditions.map((item) => item.id))) errors.push(`duplicate condition id: ${id}`);
  for (const id of duplicates(findings.map((item) => item.id))) errors.push(`duplicate finding id: ${id}`);
  for (const id of duplicates(scenarios.map((item) => item.id))) errors.push(`duplicate scenario id: ${id}`);
  for (const id of duplicates(investigations.map((item) => item.id))) errors.push(`duplicate investigation id: ${id}`);
  for (const condition of conditions) {
    for (const findingId of Object.keys(condition.findingWeights)) {
      if (!findingsById[findingId]) errors.push(`condition ${condition.id} references unknown finding ${findingId}`);
    }
  }
  const mappingKeys = conditionInvestigationMappings.map((mapping) => `${mapping.conditionId}/${mapping.investigationId}`);
  for (const key of duplicates(mappingKeys)) errors.push(`duplicate condition/investigation mapping: ${key}`);
  for (const mapping of conditionInvestigationMappings) {
    if (!conditionsById[mapping.conditionId]) errors.push(`investigation mapping references unknown condition ${mapping.conditionId}`);
    if (!investigationsById[mapping.investigationId]) errors.push(`mapping for ${mapping.conditionId} references unknown investigation ${mapping.investigationId}`);
    if (!mapping.rationale.trim()) errors.push(`mapping ${mapping.conditionId}/${mapping.investigationId} has no rationale`);
  }
  for (const investigation of investigations) {
    if (!conditionInvestigationMappings.some((mapping) => mapping.investigationId === investigation.id)) errors.push(`investigation ${investigation.id} is never mapped`);
  }
  for (const scenario of scenarios) {
    if (!scenario.id || !scenario.patient.displayName || scenario.patient.ageYears <= 0 || !scenario.patient.sex || !scenario.patient.chartId.startsWith("DEMO-")) {
      errors.push(`scenario ${scenario.id || "<missing>"} has invalid fictional patient demographics`);
    }
    if (!scenario.patient.vitals.length || !scenario.patient.history.length || !scenario.patient.medications.length || !scenario.patient.allergies.length || !scenario.patient.social.length || !scenario.patient.familyHistory.length) {
      errors.push(`scenario ${scenario.id} patient profile is incomplete`);
    }
    for (const conditionId of duplicates(scenario.conditionPoolIds)) errors.push(`scenario ${scenario.id} duplicates pool condition ${conditionId}`);
    for (const conditionId of scenario.conditionPoolIds) {
      if (!conditionsById[conditionId]) errors.push(`scenario ${scenario.id} references unknown pool condition ${conditionId}`);
      if (!conditionInvestigationMappings.some((mapping) => mapping.conditionId === conditionId)) errors.push(`scenario ${scenario.id} condition ${conditionId} has no investigation mapping`);
    }
    const resolvedPoolIds = (scenario.conditionPool ?? conditions).map((condition) => condition.id);
    if (resolvedPoolIds.length !== scenario.conditionPoolIds.length || resolvedPoolIds.some((id, index) => id !== scenario.conditionPoolIds[index])) errors.push(`scenario ${scenario.id} resolved pool does not match its authored ids`);
    const chartStatuses = new Map<string, "present" | "absent">();
    for (const initial of scenario.initialEvidence) {
      const priorStatus = chartStatuses.get(initial.findingId);
      if (priorStatus === initial.status) errors.push(`scenario ${scenario.id} duplicates chart finding ${initial.findingId}`);
      if (priorStatus && priorStatus !== initial.status) errors.push(`scenario ${scenario.id} contradicts chart finding ${initial.findingId}`);
      chartStatuses.set(initial.findingId, initial.status);
      if (!findingsById[initial.findingId]) errors.push(`scenario ${scenario.id} chart references unknown finding ${initial.findingId}`);
      if (!initial.basis?.trim()) errors.push(`scenario ${scenario.id} chart finding ${initial.findingId} has no basis`);
    }
    for (const label of duplicates(scenario.patient.vitals.map((vital) => vital.label))) errors.push(`scenario ${scenario.id} duplicates vital label ${label}`);
    for (const [index, turn] of scenario.consultation.entries()) {
      if (index > 0 && turn.atMs < scenario.consultation[index - 1].atMs) errors.push(`scenario ${scenario.id} consultation timestamps are not ordered at turn ${index}`);
      const reveals = new Set(turn.revealsFindings ?? []);
      for (const findingId of [...reveals, ...(turn.negatesFindings ?? [])]) {
        if (!findingsById[findingId]) errors.push(`scenario ${scenario.id} turn ${index} references unknown finding ${findingId}`);
      }
      for (const findingId of turn.negatesFindings ?? []) {
        if (reveals.has(findingId)) errors.push(`scenario ${scenario.id} turn ${index} both reveals and negates ${findingId}`);
      }
    }
  }
  return errors;
}

/** Intended for build/test enforcement; unlike runtime diagnostics, this fails loudly. */
export function assertValidTaoData(): void {
  const errors = validateTaoData();
  if (errors.length) throw new Error(`Invalid TAO authored data:\n${errors.join("\n")}`);
}
