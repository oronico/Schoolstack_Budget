// The actual implementation lives in @workspace/finance so the api-server can
// reuse the same engine for server-side compute (precomputed share-link
// impacts, lender packets, etc). Keeping this shim lets every existing
// `@/lib/scenario-engine` import keep working unchanged.
export {
  computeBaseFinancials,
  computeProgramBreakEven,
  type ProgramBreakEven,
  computeScenarios,
  computeQuickLevers,
  computeBreakEvenStudentsForYear,
  computeDownsideBand,
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
  type SensitivityGrid,
  type SensitivityGridCell,
  type SensitivityGridOptions,
} from "@workspace/finance";
