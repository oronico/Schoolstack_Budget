export {
  computeAnnualDscr,
  breakEvenYearFromAnnual,
  type DscrYearLike,
  type BreakEvenYearLike,
} from "./headline-metrics.js";

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
  DEFAULT_COLLECTION_RATE_BY_METHOD,
  COLLECTION_RATE_BENCHMARK_COPY,
  defaultCollectionRateForMethod,
  type CollectionMethod,
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
  homeschoolCoopFixture,
  chestertonAcademyFixture,
  tutoringCenterFixture,
  learningPodFixture,
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

export {
  DECISION_TYPES,
  type DecisionType,
  DECISION_OUTCOME_STATUSES,
} from "./decision-types.js";

export {
  type FullModelData as DecisionEngineModelData,
} from "./decision-engine/model-shape.js";

export {
  computeBaseFinancials,
  computeProgramBreakEven,
  type ProgramBreakEven,
  computeScenarios,
  computeQuickLevers,
  computeBreakEvenStudentsForYear,
  computeDownsideBand,
  computeNormalizedFinancials,
  computeSensitivityGrid,
  DEFAULT_SENSITIVITY_ENROLLMENT_DELTAS,
  DEFAULT_SENSITIVITY_TUITION_DELTAS,
  type ScenarioAdjustments,
  type ScenarioMetrics,
  type ScenarioResult,
  type NudgeItem,
  type LeverMetrics,
  type QuickLever,
  type DownsideBand,
  type DownsideScenario,
  type NormalizedFinancialsView,
  type SensitivityGrid,
  type SensitivityGridCell,
  type SensitivityGridOptions,
} from "./decision-engine/scenario-engine.js";

export {
  LENDER_STRESS_SCENARIOS,
  DEFAULT_ESA_DELAY_MONTHS,
  DEFAULT_RENT_SHOCK_PCT,
  computeLenderStressTests,
  computeCustomLenderStressTest,
  minStructuralDscr,
  type LenderStressScenarioId,
  type LenderStressScenarioMeta,
  type LenderStressScenarioResult,
  type LenderStressTestBaseline,
  type LenderStressTestResults,
  type LenderStressTestOptions,
  type CustomStressKnob,
  type CustomStressTestInput,
} from "./decision-engine/lender-stress-tests.js";

export {
  findFounderRow,
  getSuggestedFounderComp,
  getReportedFounderCompYears,
  deriveReportedFounderCompFromStartDate,
  getNormalizedFounderCompYears,
  getFounderCompBenchmarkPerYear,
  getFounderCompBandTransitions,
  computeFounderCompNormalization,
  getFounderCompBenchmark,
  type FounderCompYearBenchmark,
  type SizeBandTransition,
  sizeBandFor,
  colTierFor,
  tenureBandFor,
  SIZE_BANDS,
  COL_TIERS,
  TENURE_BANDS,
  type FounderCompNormalization,
  type FounderCompBenchmark,
  type FounderCompBenchmarkInput,
  type SizeBand,
  type SizeBandDef,
  type ColTier,
  type ColTierDef,
  type TenureBand,
  type TenureBandDef,
  type BenchmarkSource,
} from "./founder-comp.js";

export {
  applyWhatIfOverrides,
  computeWhatIfImpact,
  detectFacilityRent,
  decodeOverridesFromHash,
  encodeOverridesToHash,
  isEmptyOverrides,
  overridesEqual,
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
  filterForecastAccuracy,
  hasComparableActuals,
  selectAccuracyScenarios,
  type AccuracyMetricKey,
  type AccuracyMetricMeta,
  type ForecastAccuracyAggregate,
  type ForecastAccuracyEntry,
  type ForecastAccuracyFilter,
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
  mapAccountingExportToSnapshot,
  MAX_ACCOUNTING_EXPORT_BYTES,
  computeCategorySubtotalReconciliation,
  CATEGORY_RECONCILIATION_THRESHOLD,
  type AccountingExportTotals,
  type ParsedAccountingExport,
  type CategorySubtotalReconciliation,
  type ActualsSnapshotField,
} from "./decision-engine/accounting-export-parser.js";

export type { AccountingExportLike, LiveSnapshotLike } from "./decision-engine/model-shape.js";

export {
  distributeRevenueMonthly,
  distributeRevenueMonthlyByRow,
  distributePersonnelMonthly,
  distributeOpexMonthly,
  distributeDebtMonthly,
  computeYear1MonthlyCashFlow,
  findLowestCashMonth,
  findLowestCashMonthAcrossYears,
  computeCashRunwayMonths,
  type MonthlyRevenueRowLike,
  type PayrollCadence,
  type DebtCadence,
  type MonthlyCashFlowSeries,
  type ComputeYear1MonthlyCashFlowInput,
  type LowestCashMonth,
} from "./monthly-cash-flow.js";

// Task #455: state-funding catalog + fragility detector. Re-exported here so
// both the wizard (RevenueStep chip) and api-server (assumption flags +
// lender/board PDF footnotes) read the same program-status table.
export {
  STATE_FUNDING_MAP,
  getStateFundingConfig,
  getAllStatesWithProgram,
  getCharterMethodologyStates,
} from "./state-funding-data.js";

export type {
  CharterMethodology,
  SchoolChoiceProgramType,
  ProgramStatus,
  ProgramInfo,
  CharterPerPupilRange,
  StateFundingEntry,
  SchoolType,
  StateFundingConfig,
} from "./state-funding-data.js";

export {
  ROW_ID_TO_PROGRAM_TYPE,
  PROGRAM_TYPE_TO_ROW_ID,
  detectFragileFunding,
  type FragileProgramMatch,
  type FragileFundingReport,
} from "./state-funding-fragility.js";

export {
  inferRevenueQuality,
  computeRevenueQualityRollup,
  computeRevenueRowAmountsForYear,
  detectFundingMixInconsistencies,
  applyFundingMixCorrection,
  REVENUE_QUALITY_LABELS,
  REVENUE_QUALITY_DEFINITIONS,
  REVENUE_QUALITY_ORDER,
  type RevenueQuality,
  type RevenueQualityYearRollup,
  type RevenueQualityYearInputs,
  type RevenueRowAmountsRowLike,
  type RevenueRowAmountsSchoolProfileLike,
  type TuitionTierLike,
} from "./revenue-quality.js";

export {
  ASSUMPTION_CONFIDENCE_POSTURE_DESCRIPTIONS,
  rollupAssumptionConfidence,
  type AssumptionConfidencePosture,
  ASSUMPTION_REGISTRY,
  HEADLINE_METRIC_LABELS,
  METRIC_DRIVER_KEYS,
  computeMetricDrivers,
  isAssumptionKey,
  listAssumptionKeys,
  listAssumptionKeysByStep,
  isEstimateWithoutEvidence,
  ASSUMPTION_CONFIDENCE_LEVELS,
  ASSUMPTION_CONFIDENCE_LABELS,
  ASSUMPTION_CONFIDENCE_DESCRIPTIONS,
  HIGH_IMPACT_CONFIDENCE_KEYS,
  computeAssumptionConfidenceRollup,
  ASSUMPTION_CONFIDENCE_STATUS_COPY,
  PATHWAY_FRAMING_COPY,
  LAUNCH_CHECKLIST_ITEMS,
  type AssumptionConfidenceStatus,
  type AssumptionConfidenceRollup,
  type LaunchChecklistItem,
  type AssumptionKey,
  type AssumptionMeta,
  type AssumptionFormat,
  type AssumptionDriver,
  type AssumptionConfidenceLevel,
  type AssumptionConfidenceEntry,
  type AssumptionEvidenceFile,
  classifyEvidenceFileEmbed,
  EVIDENCE_INLINE_PREVIEW_MAX_BYTES,
  EVIDENCE_ATTACHMENT_MAX_BYTES,
  EVIDENCE_INLINE_PREVIEW_MIMES,
  type EvidenceFileEmbedClassification,
  type EvidenceFileEmbedDisposition,
  type HeadlineMetricKey,
  type MetricDriverInfo,
} from "./assumption-registry.js";

export { isRestrictedRevenueRow } from "./restricted-revenue.js";

export {
  classifyRevenueRow,
  computeRevenueSourceMix,
  isCharterSchoolType,
  getPhilanthropyBucket,
  getBucketOrder,
  getBucketLabel,
  getBucketColor,
  PRIVATE_BUCKET_ORDER,
  CHARTER_BUCKET_ORDER,
  PRIVATE_BUCKET_LABELS,
  CHARTER_BUCKET_LABELS,
  PRIVATE_BUCKET_COLORS,
  CHARTER_BUCKET_COLORS,
  type PrivateRevenueSourceBucket,
  type CharterRevenueSourceBucket,
  type RevenueSourceBucket,
  type RevenueSourceMixYear,
  type RevenueSourceMixResult,
} from "./revenue-source-mix.js";

export {
  validateNextStep,
  assertEveryNextStep,
  NextStepGuardrailError,
  BANNED_NEXT_STEP_PATTERNS,
  WEAK_NEXT_STEP_PATTERNS,
} from "./coaching-flag-guardrail.js";

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

export {
  enrollmentToCoverCost,
  utilizationFraction,
  assessGrowthReasonable,
  staffingFractionOfRevenue,
  facilityBurdenFractionOfRevenue,
  studentsPerTeacherActual,
  loadedPersonnelCost,
  founderCompIsIncluded,
  type GrowthReasonableness,
} from "./wizard-ratios.js";

export function computeProjectedAR(
  annualTuitionRevenue: number,
  collectionDelayDays: number,
): number {
  if (annualTuitionRevenue <= 0 || collectionDelayDays <= 0) return 0;
  return annualTuitionRevenue * (collectionDelayDays / 365);
}
