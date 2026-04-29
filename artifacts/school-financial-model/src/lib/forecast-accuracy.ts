// Forecast accuracy roll-up — aggregates projected-vs-actual deltas across
// every Pursued saved scenario that has actuals captured. Powers the
// "Forecast accuracy" view on the Scenarios page so a founder can see at a
// glance whether they tend to over- or under-project a given metric.
//
// We deliberately keep this layer pure and decoupled from React: the page
// component calls `computeForecastAccuracy(modelData)` and renders the result.
// That keeps the math testable in isolation and lets future surfaces (a board
// PDF page, an export tab, etc.) reuse the same aggregation without touching
// UI code.

import {
  computeProjectedSnapshot,
  type PersistedDecisionOverrides,
  type ProjectedSnapshot,
} from "./decision-flows";
import type {
  CustomScenario,
  CustomScenarioActuals,
  FullModelData,
} from "@/pages/model-wizard/schema";

// Stable identifiers for the metrics we roll up. Order here drives display
// order in the UI (headline financials first, then decision-specific extras).
export type AccuracyMetricKey =
  | "enrollment"
  | "revenue"
  | "expense"
  | "netIncome"
  | "monthlyRent"
  | "programEnrollment";

export interface AccuracyMetricMeta {
  key: AccuracyMetricKey;
  label: string;
  // money fields format with $/K/M, count fields stay raw integers.
  kind: "money" | "count";
  // Which direction is good for the founder when actual diverges from
  // projected. Higher revenue / enrollment / net income / program enrollment
  // is good; higher expense / rent is bad.
  betterWhen: "higher" | "lower";
}

export const ACCURACY_METRICS: AccuracyMetricMeta[] = [
  { key: "enrollment", label: "Total enrollment", kind: "count", betterWhen: "higher" },
  { key: "revenue", label: "Revenue", kind: "money", betterWhen: "higher" },
  { key: "expense", label: "Expenses", kind: "money", betterWhen: "lower" },
  { key: "netIncome", label: "Net income", kind: "money", betterWhen: "higher" },
  { key: "monthlyRent", label: "Signed rent (mo)", kind: "money", betterWhen: "lower" },
  { key: "programEnrollment", label: "Program enrollment", kind: "count", betterWhen: "higher" },
];

// One projected/actual pair for a single metric on a single saved scenario.
// `deltaPct` is null when the projection is zero (avoids div-by-zero noise).
export interface MetricDelta {
  projected: number;
  actual: number;
  deltaAbs: number;
  // Signed percentage: actual minus projected, divided by |projected|.
  // Positive means actual came in HIGHER than projected, regardless of
  // whether that's good or bad for the metric — interpretation lives in
  // `betterWhen` so the UI can color it.
  deltaPct: number | null;
}

export interface ForecastAccuracyEntry {
  scenario: CustomScenario;
  asOfYear: number;
  projected: ProjectedSnapshot;
  // Sparse — only the metrics that have a captured actual show up here, so
  // the UI can iterate without filtering out undefineds itself.
  metrics: Partial<Record<AccuracyMetricKey, MetricDelta>>;
}

export interface ForecastAccuracyAggregate {
  metric: AccuracyMetricKey;
  // Number of scenarios contributing to this aggregate (>= 1).
  count: number;
  meanDeltaPct: number;
  medianDeltaPct: number;
}

export interface ForecastAccuracyRollup {
  entries: ForecastAccuracyEntry[];
  aggregates: ForecastAccuracyAggregate[];
}

// Pull the actual value for a given metric out of the actuals snapshot. We
// keep this in one place so adding a new metric only touches the schema and
// this map (plus ACCURACY_METRICS) instead of every consumer.
function actualValueFor(
  actuals: CustomScenarioActuals,
  key: AccuracyMetricKey,
): number | undefined {
  switch (key) {
    case "enrollment":
      return actuals.enrollmentActual;
    case "revenue":
      return actuals.revenueActual;
    case "expense":
      return actuals.expenseActual;
    case "netIncome":
      return actuals.netIncomeActual;
    case "monthlyRent":
      return actuals.signedMonthlyRent;
    case "programEnrollment":
      return actuals.programEnrollmentActual;
  }
}

// Pull the projected counterpart from the snapshot. Decision-specific
// projections (monthlyRent / programEnrollment) may be undefined when the
// saved scenario isn't of the matching decision type — we just skip those
// metrics in that case.
function projectedValueFor(
  snap: ProjectedSnapshot,
  key: AccuracyMetricKey,
): number | undefined {
  switch (key) {
    case "enrollment":
      return snap.enrollment;
    case "revenue":
      return snap.revenue;
    case "expense":
      return snap.expense;
    case "netIncome":
      return snap.netIncome;
    case "monthlyRent":
      return snap.monthlyRent;
    case "programEnrollment":
      return snap.programEnrollment;
  }
}

function computeDelta(projected: number, actual: number): MetricDelta {
  const deltaAbs = actual - projected;
  if (!isFinite(projected) || projected === 0) {
    return { projected, actual, deltaAbs, deltaPct: null };
  }
  const deltaPct = (deltaAbs / Math.abs(projected)) * 100;
  return { projected, actual, deltaAbs, deltaPct };
}

// Numeric helpers — kept tiny and local so we don't drag in a stats library
// for what amounts to a handful of values.
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

// Check whether actuals contain at least one captured number. Notes alone
// don't qualify — the entry has to carry a comparable value or there's
// nothing to roll up.
export function hasComparableActuals(actuals: CustomScenarioActuals | undefined): boolean {
  if (!actuals) return false;
  return ACCURACY_METRICS.some((m) => actualValueFor(actuals, m.key) !== undefined);
}

// Filter the saved scenarios down to the ones the roll-up cares about: only
// scenarios marked Pursued *and* that have at least one numeric actual.
// "Pursued" is the gate because declined / on-hold scenarios don't have
// realized outcomes to compare against, so their actuals (if any were
// captured before the status flipped) would skew the aggregates.
export function selectAccuracyScenarios(scenarios: CustomScenario[]): CustomScenario[] {
  return scenarios.filter(
    (cs) => cs.outcomeStatus === "pursued" && hasComparableActuals(cs.actuals),
  );
}

// The main aggregator. Walks every eligible saved scenario, builds its per-
// metric deltas, and rolls them into mean/median tendencies per metric.
export function computeForecastAccuracy(modelData: FullModelData): ForecastAccuracyRollup {
  const customScenarios =
    ((modelData as Record<string, unknown>).customScenarios as CustomScenario[] | undefined) ||
    [];
  const eligible = selectAccuracyScenarios(customScenarios);

  const entries: ForecastAccuracyEntry[] = [];
  // Per-metric collector — only deltas with a defined projected/actual pair
  // and a finite deltaPct contribute to the aggregate.
  const buckets: Record<AccuracyMetricKey, number[]> = {
    enrollment: [],
    revenue: [],
    expense: [],
    netIncome: [],
    monthlyRent: [],
    programEnrollment: [],
  };

  for (const cs of eligible) {
    const actuals = cs.actuals!;
    const asOfYear = actuals.asOfYear ?? 1;
    const projected = computeProjectedSnapshot(
      modelData,
      cs.overrides as PersistedDecisionOverrides,
      cs.decisionType,
      asOfYear,
    );
    const metrics: Partial<Record<AccuracyMetricKey, MetricDelta>> = {};
    for (const meta of ACCURACY_METRICS) {
      const actual = actualValueFor(actuals, meta.key);
      if (actual === undefined || Number.isNaN(actual)) continue;
      const proj = projectedValueFor(projected, meta.key);
      if (proj === undefined || Number.isNaN(proj)) continue;
      const delta = computeDelta(proj, actual);
      metrics[meta.key] = delta;
      if (delta.deltaPct !== null && isFinite(delta.deltaPct)) {
        buckets[meta.key].push(delta.deltaPct);
      }
    }
    entries.push({ scenario: cs, asOfYear, projected, metrics });
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

// Plain-English summary for an aggregate row — "you tend to over-project
// enrollment by 5%" / "you tend to under-project rent by 3%". The UI can
// also show the raw mean/median; this is the founder-friendly callout.
//
// Sign convention: a *positive* meanDeltaPct means actuals came in HIGHER
// than projected. Whether that translates to "over-" or "under-projecting"
// depends on the metric's natural direction — for revenue, actual > projected
// means we under-projected; for expense, actual > projected means we
// under-projected (it cost more than planned).
export function describeTendency(
  meta: AccuracyMetricMeta,
  meanDeltaPct: number,
): { text: string; tone: "good" | "bad" | "neutral" } {
  const abs = Math.abs(meanDeltaPct);
  if (abs < 0.5) {
    return { text: `On plan for ${meta.label.toLowerCase()}`, tone: "neutral" };
  }
  const rounded = Math.round(abs);
  // "Higher than planned" vs "lower than planned" frames the direction in
  // neutral language so we can layer the good/bad tone separately based on
  // betterWhen — keeps the message accurate even when "higher" is bad.
  const direction = meanDeltaPct > 0 ? "higher" : "lower";
  const verb = meanDeltaPct > 0 ? "under-project" : "over-project";
  // For revenue / enrollment / net income / program enrollment, actual >
  // projected is good. For expense / rent, actual > projected is bad.
  const isGood =
    meta.betterWhen === "higher" ? meanDeltaPct > 0 : meanDeltaPct < 0;
  const tone: "good" | "bad" | "neutral" = isGood ? "good" : "bad";
  return {
    text: `You tend to ${verb} ${meta.label.toLowerCase()} by ${rounded}% (actual runs ${direction})`,
    tone,
  };
}
