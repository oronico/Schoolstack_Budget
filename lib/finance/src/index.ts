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
  CAP_INSIGHT_MIN_SAVINGS,
  computePayrollTaxForSalary,
  computePayrollTaxCapSavings,
  buildCapInsightText,
  aggregateRosterCapSavings,
  buildRosterCapInsightText,
  type PayrollTaxComponent,
  type CappedComponent,
  type PayrollTaxCapInsight,
  type ComfortVariant,
  type RosterStaffingRowLike,
  type RosterCapSavingsAggregate,
} from "./payroll-tax-cap.js";

export {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  driverCoverageFixture,
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
  DECISION_LABELS,
  OUTCOME_LABELS,
  buildDecisionBullets,
  coercePersistedDecisionOverrides,
  isDecisionType,
  isDecisionOutcomeStatus,
  type DecisionOutcomeStatus,
  type PersistedDecisionOverrides,
} from "./decision-bullets.js";

export { DECISION_TYPES, type DecisionType } from "./decision-types.js";

export {
  type FullModelData as DecisionEngineModelData,
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
  summarizeDecisionChanges,
  DECISION_LABELS as DECISION_FLOW_LABELS,
  DECISION_SHORT,
  DECISION_THEME,
  type AddProgramInputs,
  type DecisionFieldChange,
  type DecisionImpact,
  type DecisionInputs,
  type EnrollmentChangeInputs,
  type ProjectedSnapshot,
  type SiteInputs,
} from "./decision-engine/decision-flows.js";

export { buildDecisionBullets as buildDecisionFlowBullets } from "./decision-engine/decision-flows.js";

export {
  ACCURACY_METRICS,
  computeForecastAccuracy,
  describeTendency,
  hasComparableActuals,
  selectAccuracyScenarios,
  type AccuracyMetricKey,
  type AccuracyMetricMeta,
  type ForecastAccuracyAggregate,
  type ForecastAccuracyEntry,
  type ForecastAccuracyRollup,
  type MetricDelta,
  type ScenarioActualsLike,
  type ScenarioLike,
} from "./decision-engine/forecast-accuracy.js";

export {
  buildActualsSuggestion,
  type ActualsSuggestion,
  type ActualsSuggestionField,
  type ActualsContributor,
} from "./decision-engine/decision-flows.js";

export {
  parseAccountingExportCsv,
  parseAccountingExportRows,
  parseAccountingNumber,
  MAX_ACCOUNTING_EXPORT_BYTES,
  type AccountingExportTotals,
  type ParsedAccountingExport,
} from "./decision-engine/accounting-export-parser.js";

export type { AccountingExportLike, LiveSnapshotLike } from "./decision-engine/model-shape.js";

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
