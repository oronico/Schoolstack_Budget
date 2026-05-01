import { describe, expect, it } from "vitest";
import {
  ACCURACY_METRICS,
  computeForecastAccuracy,
  describeTendency,
  filterForecastAccuracy,
  hasComparableActuals,
  selectAccuracyScenarios,
} from "../forecast-accuracy";
import type { CustomScenario, FullModelData } from "@/pages/model-wizard/schema";

// Build a minimal model with the fields the engine needs to produce a usable
// projected snapshot. Mirrors the fixture used in decision-flows tests so the
// behavior we exercise here matches what the rest of the app sees.
function buildBaseModel(overrides: Record<string, unknown> = {}): FullModelData {
  return {
    schoolProfile: {
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      debtIncluded: false,
      ...(overrides.schoolProfile as Record<string, unknown> || {}),
    },
    enrollment: {
      year1: 100,
      year2: 120,
      year3: 140,
      year4: 160,
      year5: 180,
      retentionRate: 85,
      ...(overrides.enrollment as Record<string, unknown> || {}),
    },
    facilities: {
      annualSalaryIncrease: 0,
      generalCostInflation: 0,
      ...(overrides.facilities as Record<string, unknown> || {}),
    },
    revenueRows: (overrides.revenueRows as unknown[]) || [],
    staffingRows: (overrides.staffingRows as unknown[]) || [],
    expenseRows: (overrides.expenseRows as unknown[]) || [],
    capitalAndDebtRows: (overrides.capitalAndDebtRows as unknown[]) || [],
    tuitionTiers: (overrides.tuitionTiers as unknown[]) || [],
    openingBalances: { cash: 50000 },
    customScenarios: (overrides.customScenarios as unknown[]) || [],
  } as unknown as FullModelData;
}

function buildScenario(overrides: Partial<CustomScenario> = {}): CustomScenario {
  return {
    name: overrides.name ?? "Site A",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    overrides: overrides.overrides ?? {},
    decisionType: overrides.decisionType,
    narrative: overrides.narrative,
    outcomeStatus: overrides.outcomeStatus,
    retrospective: overrides.retrospective,
    outcomeUpdatedAt: overrides.outcomeUpdatedAt,
    appliedToModelAt: overrides.appliedToModelAt,
    actuals: overrides.actuals,
  };
}

describe("hasComparableActuals", () => {
  it("returns false when actuals are missing or only contain notes/asOfYear", () => {
    expect(hasComparableActuals(undefined)).toBe(false);
    expect(hasComparableActuals({ asOfYear: 1 })).toBe(false);
    expect(hasComparableActuals({ asOfYear: 1, notes: "Lease signed" })).toBe(false);
  });

  it("returns true once any actual numeric field is captured", () => {
    expect(hasComparableActuals({ asOfYear: 1, enrollmentActual: 95 })).toBe(true);
    expect(hasComparableActuals({ asOfYear: 1, signedMonthlyRent: 9000 })).toBe(true);
  });
});

describe("selectAccuracyScenarios", () => {
  it("only keeps Pursued scenarios that have at least one numeric actual", () => {
    const scenarios = [
      buildScenario({
        name: "Pursued + actual",
        outcomeStatus: "pursued",
        actuals: { asOfYear: 1, enrollmentActual: 90 },
      }),
      buildScenario({
        name: "Pursued, no actuals",
        createdAt: "2026-02-01T00:00:00.000Z",
        outcomeStatus: "pursued",
      }),
      buildScenario({
        name: "Declined w/ actuals",
        createdAt: "2026-03-01T00:00:00.000Z",
        outcomeStatus: "declined",
        actuals: { asOfYear: 1, enrollmentActual: 90 },
      }),
      buildScenario({
        name: "Untracked w/ actuals",
        createdAt: "2026-04-01T00:00:00.000Z",
        actuals: { asOfYear: 1, enrollmentActual: 90 },
      }),
    ];
    const kept = selectAccuracyScenarios(scenarios);
    expect(kept.map((s) => s.name)).toEqual(["Pursued + actual"]);
  });
});

// --- computeForecastAccuracy -----------------------------------------------
//
// End-to-end: a model with two pursued scenarios that captured a couple of
// actuals each. We assert the per-entry deltas line up with projected vs
// actual, and that the aggregate mean/median percentages reflect the
// individual deltas.

describe("computeForecastAccuracy", () => {
  it("returns empty rollup when there are no eligible scenarios", () => {
    const data = buildBaseModel();
    const rollup = computeForecastAccuracy(data);
    expect(rollup.entries).toEqual([]);
    expect(rollup.aggregates).toEqual([]);
  });

  it("ignores declined / untracked scenarios and surfaces only Pursued ones with actuals", () => {
    const scenarios: CustomScenario[] = [
      buildScenario({
        name: "Site A",
        createdAt: "2026-01-01T00:00:00.000Z",
        outcomeStatus: "pursued",
        decisionType: "evaluate_site",
        overrides: { monthlyRent: 10000 },
        actuals: { asOfYear: 1, signedMonthlyRent: 11000 },
      }),
      buildScenario({
        name: "Site B (declined)",
        createdAt: "2026-02-01T00:00:00.000Z",
        outcomeStatus: "declined",
        decisionType: "evaluate_site",
        overrides: { monthlyRent: 9000 },
        actuals: { asOfYear: 1, signedMonthlyRent: 9500 },
      }),
    ];
    const data = buildBaseModel({ customScenarios: scenarios });
    const rollup = computeForecastAccuracy(data);
    expect(rollup.entries).toHaveLength(1);
    expect(rollup.entries[0].scenario.name).toBe("Site A");
    const rentDelta = rollup.entries[0].metrics.monthlyRent;
    expect(rentDelta).toBeDefined();
    expect(rentDelta!.projected).toBe(10000);
    expect(rentDelta!.actual).toBe(11000);
    expect(rentDelta!.deltaPct).toBeCloseTo(10, 5);
  });

  it("computes mean and median per metric across multiple scenarios", () => {
    // Two enrollment-change scenarios with hand-picked actuals so the math is
    // easy to verify: scenario one comes in 10% over plan on enrollment, scenario
    // two comes in 20% under plan.
    const scenarios: CustomScenario[] = [
      buildScenario({
        name: "Plan A",
        createdAt: "2026-01-01T00:00:00.000Z",
        outcomeStatus: "pursued",
        decisionType: "change_enrollment",
        overrides: { enrollmentDelta: [0, 0, 0, 0, 0] },
        // Year-1 baseline enrollment = 100 (from buildBaseModel), so +10%
        // projected→actual means a captured actual of 110.
        actuals: { asOfYear: 1, enrollmentActual: 110 },
      }),
      buildScenario({
        name: "Plan B",
        createdAt: "2026-02-01T00:00:00.000Z",
        outcomeStatus: "pursued",
        decisionType: "change_enrollment",
        overrides: { enrollmentDelta: [0, 0, 0, 0, 0] },
        // -20% on year-1 baseline of 100 → captured actual of 80.
        actuals: { asOfYear: 1, enrollmentActual: 80 },
      }),
    ];
    const data = buildBaseModel({ customScenarios: scenarios });
    const rollup = computeForecastAccuracy(data);
    expect(rollup.entries).toHaveLength(2);
    const enrollAgg = rollup.aggregates.find((a) => a.metric === "enrollment");
    expect(enrollAgg).toBeDefined();
    expect(enrollAgg!.count).toBe(2);
    // (10 + -20) / 2 = -5
    expect(enrollAgg!.meanDeltaPct).toBeCloseTo(-5, 5);
    // Median of two values is their average — same as the mean here.
    expect(enrollAgg!.medianDeltaPct).toBeCloseTo(-5, 5);
  });

  it("handles a zero projection without crashing — delta percentage is null", () => {
    const scenarios: CustomScenario[] = [
      buildScenario({
        name: "Net income flat",
        createdAt: "2026-01-01T00:00:00.000Z",
        outcomeStatus: "pursued",
        decisionType: "change_enrollment",
        overrides: { enrollmentDelta: [0, 0, 0, 0, 0] },
        actuals: { asOfYear: 1, netIncomeActual: 5000 },
      }),
    ];
    // No revenue or expense rows ⇒ projected net income is 0, so the helper
    // should record the absolute delta but skip the percentage (and skip the
    // metric in the aggregate altogether).
    const data = buildBaseModel({ customScenarios: scenarios });
    const rollup = computeForecastAccuracy(data);
    expect(rollup.entries).toHaveLength(1);
    const niDelta = rollup.entries[0].metrics.netIncome;
    expect(niDelta).toBeDefined();
    expect(niDelta!.projected).toBe(0);
    expect(niDelta!.actual).toBe(5000);
    expect(niDelta!.deltaPct).toBeNull();
    // Aggregate excludes net income because there's no usable percentage.
    expect(rollup.aggregates.find((a) => a.metric === "netIncome")).toBeUndefined();
  });

  it("only emits aggregates for metrics with at least one captured pair", () => {
    const scenarios: CustomScenario[] = [
      buildScenario({
        name: "Just rent",
        createdAt: "2026-01-01T00:00:00.000Z",
        outcomeStatus: "pursued",
        decisionType: "evaluate_site",
        overrides: { monthlyRent: 8000 },
        actuals: { asOfYear: 1, signedMonthlyRent: 8400 },
      }),
    ];
    const data = buildBaseModel({ customScenarios: scenarios });
    const rollup = computeForecastAccuracy(data);
    const metrics = rollup.aggregates.map((a) => a.metric);
    expect(metrics).toEqual(["monthlyRent"]);
  });
});

// --- filterForecastAccuracy -------------------------------------------------
//
// Builds a fixture rollup with a few entries spread across metrics + asOfYear
// so the metric / year / combined cases each have something to assert on.

describe("filterForecastAccuracy", () => {
  // Fixture: three pursued entries — two enrollment in Year 1, one rent in
  // Year 2 — produced via computeForecastAccuracy so we exercise the real
  // shape of MetricDelta / aggregates rather than a hand-rolled stub.
  function buildFixtureRollup() {
    const scenarios: CustomScenario[] = [
      buildScenario({
        name: "Enroll Y1 over",
        createdAt: "2026-01-01T00:00:00.000Z",
        outcomeStatus: "pursued",
        decisionType: "change_enrollment",
        overrides: { enrollmentDelta: [0, 0, 0, 0, 0] },
        actuals: { asOfYear: 1, enrollmentActual: 110 },
      }),
      buildScenario({
        name: "Enroll Y1 under",
        createdAt: "2026-02-01T00:00:00.000Z",
        outcomeStatus: "pursued",
        decisionType: "change_enrollment",
        overrides: { enrollmentDelta: [0, 0, 0, 0, 0] },
        actuals: { asOfYear: 1, enrollmentActual: 80 },
      }),
      buildScenario({
        name: "Rent Y2",
        createdAt: "2026-03-01T00:00:00.000Z",
        outcomeStatus: "pursued",
        decisionType: "evaluate_site",
        overrides: { monthlyRent: 10000 },
        actuals: { asOfYear: 2, signedMonthlyRent: 11000 },
      }),
    ];
    const data = buildBaseModel({ customScenarios: scenarios });
    return computeForecastAccuracy(data);
  }

  it("returns the same rollup reference when no filter is applied", () => {
    const rollup = buildFixtureRollup();
    const filtered = filterForecastAccuracy(rollup, {});
    expect(filtered).toBe(rollup);
  });

  it("filters entries by metric and keeps only the matching aggregate", () => {
    const rollup = buildFixtureRollup();
    const filtered = filterForecastAccuracy(rollup, { metric: "monthlyRent" });
    expect(filtered.entries.map((e) => e.scenario.name)).toEqual(["Rent Y2"]);
    const metrics = filtered.aggregates.map((a) => a.metric);
    expect(metrics).toEqual(["monthlyRent"]);
  });

  it("filters entries by asOfYear and recomputes aggregates from just that slice", () => {
    const rollup = buildFixtureRollup();
    const filtered = filterForecastAccuracy(rollup, { asOfYear: 1 });
    expect(filtered.entries.map((e) => e.scenario.name)).toEqual([
      "Enroll Y1 over",
      "Enroll Y1 under",
    ]);
    const enrollAgg = filtered.aggregates.find((a) => a.metric === "enrollment");
    expect(enrollAgg).toBeDefined();
    expect(enrollAgg!.count).toBe(2);
    // (10 + -20) / 2 = -5
    expect(enrollAgg!.meanDeltaPct).toBeCloseTo(-5, 5);
    // Rent only existed on the Year 2 entry, so it falls out entirely.
    expect(filtered.aggregates.find((a) => a.metric === "monthlyRent")).toBeUndefined();
  });

  it("combines metric + asOfYear filters with AND semantics", () => {
    const rollup = buildFixtureRollup();
    const filtered = filterForecastAccuracy(rollup, {
      metric: "enrollment",
      asOfYear: 2,
    });
    // No Year 2 enrollment entry in the fixture → both lists empty.
    expect(filtered.entries).toEqual([]);
    expect(filtered.aggregates).toEqual([]);
  });

  it("recomputes the metric aggregate against just the surviving entries", () => {
    const rollup = buildFixtureRollup();
    // Filter to enrollment + Year 1 — both enrollment entries survive, so
    // the aggregate should match the unfiltered enrollment aggregate.
    const filtered = filterForecastAccuracy(rollup, {
      metric: "enrollment",
      asOfYear: 1,
    });
    const agg = filtered.aggregates.find((a) => a.metric === "enrollment");
    expect(agg).toBeDefined();
    expect(agg!.count).toBe(2);
    expect(agg!.meanDeltaPct).toBeCloseTo(-5, 5);
  });
});

// --- describeTendency -------------------------------------------------------

describe("describeTendency", () => {
  const enrollMeta = ACCURACY_METRICS.find((m) => m.key === "enrollment")!;
  const expenseMeta = ACCURACY_METRICS.find((m) => m.key === "expense")!;

  it("calls out neutrality when the mean delta is essentially zero", () => {
    const t = describeTendency(enrollMeta, 0.1);
    expect(t.tone).toBe("neutral");
    expect(t.text.toLowerCase()).toContain("on plan");
  });

  it("flags higher-is-better metrics as good when actual runs higher", () => {
    const t = describeTendency(enrollMeta, 7);
    expect(t.tone).toBe("good");
    // Actual > projected → user under-projected the metric.
    expect(t.text).toContain("under-project");
  });

  it("flags higher-is-better metrics as bad when actual runs lower", () => {
    const t = describeTendency(enrollMeta, -7);
    expect(t.tone).toBe("bad");
    expect(t.text).toContain("over-project");
  });

  it("flags lower-is-better metrics (e.g. expenses) as bad when actual runs higher", () => {
    const t = describeTendency(expenseMeta, 6);
    expect(t.tone).toBe("bad");
    // Higher actual on a "lower is better" metric still means the user
    // under-projected the metric (it cost more than they planned).
    expect(t.text).toContain("under-project");
  });
});
