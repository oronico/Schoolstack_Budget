// The actual implementation lives in @workspace/finance so the api-server can
// reuse the same engine for server-side compute (precomputed share-link
// impacts, lender packets, etc). Keeping this shim lets every existing
// `@/lib/scenario-engine` import keep working unchanged.
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
} from "@workspace/finance";
