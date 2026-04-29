export {
  computeAnnualDebt,
  computeMonthlyDebt,
  computeAnnualDebtForYear,
  computeInterestPortion,
  computePrincipalPortion,
  computeRemainingBalance,
} from "./amortization.js";

export {
  DEFAULT_BENEFITS_RATE,
  DEFAULT_PAYROLL_TAX_RATE,
  DEFAULT_COLA_PCT,
  DEFAULT_GENERAL_INFLATION_PCT,
  DEFAULT_RENT_ESCALATION_PCT,
  DEFAULT_TUITION_ESCALATION_PCT,
  DEFAULT_RETENTION_RATE,
  LOADED_COST_MULTIPLIER,
  YEAR_COUNT,
  BENCHMARK_DSCR_GREEN,
  BENCHMARK_DSCR_AMBER,
} from "./constants.js";

export {
  computeEffectiveFte,
  resolveEsc,
  type StaffingRowLike,
} from "./staffing.js";

export {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  type TestModelPayload,
  type TestRevenueRow,
  type TestStaffingRow,
  type TestExpenseRow,
  type TestCapDebtRow,
  type TestEnrollment,
  type TestSchoolProfile,
  type TestFacilities,
  type TestOpeningBalances,
} from "./test-fixtures.js";

export {
  driverVal,
  computeBackendValues,
  type BackendComputedValues,
} from "./backend-compute.js";

export {
  DECISION_LABELS,
  OUTCOME_LABELS,
  buildDecisionBullets,
  coercePersistedDecisionOverrides,
  isDecisionType,
  isDecisionOutcomeStatus,
  type DecisionOutcomeStatus,
  type PersistedDecisionOverrides,
} from "./decision-bullets.js";

export {
  type FullModelData as DecisionEngineModelData,
  type DecisionType,
} from "./decision-engine/model-shape.js";

export {
  computeBaseFinancials,
  computeScenarios,
  computeQuickLevers,
  type ScenarioAdjustments,
  type ScenarioMetrics,
  type ScenarioResult,
  type NudgeItem,
  type LeverMetrics,
  type QuickLever,
} from "./decision-engine/scenario-engine.js";

export {
  applyWhatIfOverrides,
  computeWhatIfImpact,
  detectFacilityRent,
  decodeOverridesFromHash,
  encodeOverridesToHash,
  isEmptyOverrides,
  EMPTY_OVERRIDES,
  type WhatIfOverrides,
  type WhatIfImpact,
} from "./decision-engine/whatif-engine.js";

export {
  applyAddProgramDecision,
  applyDecisionToData,
  applyPersistedScenarioToData,
  buildBlankAddProgramInputs,
  buildBlankEnrollmentChangeInputs,
  buildBlankSiteInputs,
  computeDecisionImpact,
  computeDecisionImpactFromPersisted,
  computeProjectedSnapshot,
  decisionToPersistedOverrides,
  enrollmentChangeInputsToOverrides,
  siteInputsToOverrides,
  DECISION_LABELS as DECISION_FLOW_LABELS,
  DECISION_SHORT,
  DECISION_THEME,
  type AddProgramInputs,
  type DecisionImpact,
  type DecisionInputs,
  type EnrollmentChangeInputs,
  type ProjectedSnapshot,
  type SiteInputs,
} from "./decision-engine/decision-flows.js";

export { buildDecisionBullets as buildDecisionFlowBullets } from "./decision-engine/decision-flows.js";

export function computeStraightLineDepreciation(
  fixedAssets: number,
  usefulLifeYears: number,
  yearIndex: number,
): { annualDepreciation: number; accumulatedDepreciation: number; netBookValue: number } {
  if (fixedAssets <= 0 || usefulLifeYears <= 0) {
    return { annualDepreciation: 0, accumulatedDepreciation: 0, netBookValue: fixedAssets };
  }
  const annual = fixedAssets / usefulLifeYears;
  const yearsDepreciated = Math.min(yearIndex + 1, usefulLifeYears);
  const accumulated = annual * yearsDepreciated;
  const nbv = Math.max(0, fixedAssets - accumulated);
  const actualAnnual = yearIndex < usefulLifeYears ? annual : 0;
  return { annualDepreciation: actualAnnual, accumulatedDepreciation: accumulated, netBookValue: nbv };
}

export function computeProjectedAR(
  annualTuitionRevenue: number,
  collectionDelayDays: number,
): number {
  if (annualTuitionRevenue <= 0 || collectionDelayDays <= 0) return 0;
  return annualTuitionRevenue * (collectionDelayDays / 365);
}
