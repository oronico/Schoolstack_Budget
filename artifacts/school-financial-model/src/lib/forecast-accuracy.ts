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
// `filterForecastAccuracy` (and its `ForecastAccuracyFilter` input) stays
// local to this shim because it's a UI-only concern: the scenarios page reads
// `?metric=…&asOfYear=…` from the URL and slices an existing roll-up to
// match. The api-server packets always render the full unfiltered roll-up,
// so there's no value in shipping this helper across the workspace boundary.
import {
  ACCURACY_METRICS,
  type AccuracyMetricKey,
  type ForecastAccuracyAggregate,
  type ForecastAccuracyRollup,
} from "@workspace/finance";

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
} from "@workspace/finance";

// Filter inputs for `filterForecastAccuracy`. Both fields are independently
// optional — null/undefined means "no filter on that axis", and combining
// them ANDs the filters together. The shape mirrors what the UI reads from
// the URL (`?metric=…&asOfYear=…`) so the page layer can pass it through
// without translation.
export interface ForecastAccuracyFilter {
  metric?: AccuracyMetricKey | null;
  asOfYear?: number | null;
}

// Local mean helper — kept tiny so the shim doesn't need to import a stats
// utility just to recompute aggregate means from a filtered subset.
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// Slice an existing roll-up by metric and/or asOfYear so the UI can offer
// "show me only enrollment accuracy" / "only Year 1 actuals" cuts without
// re-running the (relatively expensive) per-scenario engine projection that
// `computeForecastAccuracy` performed. Aggregates are recomputed from the
// filtered entries so the headline tendency (e.g. "you tend to over-project
// X by Y%") always reflects the active filter rather than the unfiltered
// population.
//
// When `metric` is set, entries that don't carry a delta for that metric
// fall out entirely (there's nothing to render for them in the filtered
// view) and only that metric's aggregate survives. When `asOfYear` is set,
// only entries whose captured actuals belong to that model year remain.
export function filterForecastAccuracy(
  rollup: ForecastAccuracyRollup,
  filter: ForecastAccuracyFilter,
): ForecastAccuracyRollup {
  const metric = filter.metric ?? null;
  const asOfYear = filter.asOfYear ?? null;
  if (!metric && !asOfYear) return rollup;

  const entries = rollup.entries.filter((e) => {
    if (asOfYear !== null && e.asOfYear !== asOfYear) return false;
    if (metric && !e.metrics[metric]) return false;
    return true;
  });

  const buckets: Record<AccuracyMetricKey, number[]> = {
    enrollment: [],
    revenue: [],
    expense: [],
    netIncome: [],
    monthlyRent: [],
    programEnrollment: [],
  };
  for (const e of entries) {
    for (const meta of ACCURACY_METRICS) {
      if (metric && meta.key !== metric) continue;
      const delta = e.metrics[meta.key];
      if (!delta || delta.deltaPct === null || !isFinite(delta.deltaPct)) continue;
      buckets[meta.key].push(delta.deltaPct);
    }
  }

  const aggregates: ForecastAccuracyAggregate[] = [];
  for (const meta of ACCURACY_METRICS) {
    const values = buckets[meta.key];
    if (values.length === 0) continue;
    aggregates.push({
      metric: meta.key,
      count: values.length,
      meanDeltaPct: mean(values),
      medianDeltaPct: median(values),
    });
  }

  return { entries, aggregates };
}
