// Shim — the forecast-accuracy roll-up implementation lives in
// `@workspace/finance/src/decision-engine/forecast-accuracy.ts` so the
// planner UI (web) and the lender / board packet builders (api-server) share
// one source of truth. See the header in that file for the full rationale.
//
// This module re-exports the shared API so existing call sites (the
// `ForecastAccuracyView` component, the scenarios page, the founder-persona
// helper, and the existing vitest suite) keep importing from
// `@/lib/forecast-accuracy` unchanged.
//
// `filterForecastAccuracy` (and its `ForecastAccuracyFilter` input) was
// originally local to this shim because it was UI-only. Task #391 lifted it
// into `@workspace/finance` so the lender / board PDF routes can apply the
// same filter the founder set on the Forecast Accuracy view, ensuring the
// printable packet mirrors the on-screen slice. We keep re-exporting it from
// here so existing web call sites are unchanged.
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
} from "@workspace/finance";
