/**
 * Task #469 — Single-year engine cascade.
 *
 * The wizard's single-year toggle hides Y2-Y5 inputs but the underlying
 * engines still emit length-5 arrays. Three downstream consumers used to
 * read Y5 unconditionally and produced misleading output for single-year
 * founders. These tests gate the consumers on `modelDuration` so:
 *
 *   - Compare-Scenarios anchors every metric on Y1 (was: Y5) and the
 *     verdict copy reads "Year 1" instead of the multi-year phrasing.
 *   - The diagnostics engine skips every rule that reads index >= 1 from
 *     a per-year array (fast_enrollment_growth, expense_growth_exceeds_
 *     revenue, surplus_but_tight_cash, the multi-year negative_cash). The
 *     Y1-only rules still fire normally; a Y1-only negative-cash variant
 *     replaces the multi-year scan in single-year mode.
 *
 * The mailer template is covered by a sibling test in api-server.
 */
import { describe, expect, it } from "vitest";
import { compareScenarios } from "../scenario-compare";
import type { ScenarioMetrics } from "../scenario-engine";
import { runDiagnostics } from "../coaching/diagnostics-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";

function makeMetrics(over: Partial<ScenarioMetrics> = {}): ScenarioMetrics {
  return {
    enrollment: [100, 0, 0, 0, 0],
    revenue: [1_000_000, 0, 0, 0, 0],
    staffingCost: [600_000, 0, 0, 0, 0],
    facilityCost: [100_000, 0, 0, 0, 0],
    opex: [50_000, 0, 0, 0, 0],
    totalExpenses: [800_000, 0, 0, 0, 0],
    netIncome: [200_000, 0, 0, 0, 0],
    netMargin: [0.2, 0, 0, 0, 0],
    dscr: [1.8, 0, 0, 0, 0],
    staffingPctOfRevenue: [0.6, 0, 0, 0, 0],
    breakEvenYear: 1,
    cashRunwayMonths: 60,
    reserveMonths: 3,
    cashPosition: [200_000, 0, 0, 0, 0],
    contractedRevenue: [1_000_000, 0, 0, 0, 0],
    badDebt: [0, 0, 0, 0, 0],
    arBalance: [0, 0, 0, 0, 0],
    restrictedRevenue: [0, 0, 0, 0, 0],
    restrictedCash: [0, 0, 0, 0, 0],
    unrestrictedCash: [200_000, 0, 0, 0, 0],
    unrestrictedCashRunwayMonths: 60,
    tuitionDelinquencyRateApplied: 0,
    ...over,
  };
}

describe("compareScenarios — single-year branch", () => {
  it("five-year mode keeps anchoring on Y5 and labels metrics 'Year 5'", () => {
    const base = makeMetrics({
      revenue: [1_000_000, 1_100_000, 1_200_000, 1_300_000, 1_400_000],
      netIncome: [50_000, 80_000, 120_000, 160_000, 200_000],
    });
    const compare = makeMetrics({
      revenue: [1_000_000, 1_100_000, 1_200_000, 1_300_000, 1_700_000],
      netIncome: [50_000, 80_000, 120_000, 160_000, 350_000],
    });

    const result = compareScenarios(base, compare);
    const labels = result.metricDeltas.map((d) => d.label);
    expect(labels).toContain("Year 5 Revenue");
    expect(labels).toContain("Year 5 Net Income");
    // Five-year mode keeps the break-even row.
    expect(labels).toContain("Break-Even Year");
    const revDelta = result.metricDeltas.find((d) => d.id === "revenue_y5")!;
    expect(revDelta.compareValue).toBe(1_700_000);
  });

  it("single-year mode drops scalar multi-year metrics (reserve months, cash runway)", () => {
    // Engine emits scalar reserveMonths=2 / cashRunwayMonths=12 derived
    // from the FULL 5-year trajectory. Including them in single-year
    // compare would let phantom Y2-Y5 zeros drive the verdict, so they
    // must be excluded entirely (rather than mislabelled "Year 1").
    const base = makeMetrics({ reserveMonths: 2, cashRunwayMonths: 12 });
    const compare = makeMetrics({ reserveMonths: 6, cashRunwayMonths: 60 });
    const result = compareScenarios(base, compare, undefined, undefined, { isSingleYear: true });
    const ids = result.metricDeltas.map((d) => d.id);
    expect(ids).not.toContain("reserve_months");
    expect(ids).not.toContain("cash_runway");
    // Verdict must therefore be driven by the Y1 array metrics only — Y1
    // numbers are identical here, so the verdict cannot say "stronger".
    expect(result.verdict).not.toBe("stronger");
    expect(result.verdict).not.toBe("weaker");
  });

  it("five-year mode KEEPS reserve months + cash runway", () => {
    const base = makeMetrics();
    const compare = makeMetrics({ reserveMonths: 6, cashRunwayMonths: 60 });
    const result = compareScenarios(base, compare);
    const ids = result.metricDeltas.map((d) => d.id);
    expect(ids).toContain("reserve_months");
    expect(ids).toContain("cash_runway");
  });

  it("single-year mode anchors every metric on Y1 and labels them 'Year 1'", () => {
    const base = makeMetrics({
      revenue: [1_000_000, 0, 0, 0, 0],
      netIncome: [50_000, 0, 0, 0, 0],
    });
    const compare = makeMetrics({
      revenue: [1_300_000, 0, 0, 0, 0],
      netIncome: [180_000, 0, 0, 0, 0],
    });

    const result = compareScenarios(base, compare, undefined, undefined, {
      isSingleYear: true,
    });
    const labels = result.metricDeltas.map((d) => d.label);
    expect(labels).toContain("Year 1 Revenue");
    expect(labels).toContain("Year 1 Net Income");
    expect(labels).not.toContain("Year 5 Revenue");
    // Break-even is dropped in single-year (it requires multi-year context).
    expect(labels).not.toContain("Break-Even Year");

    const revDelta = result.metricDeltas.find((d) => d.id === "revenue_y1")!;
    expect(revDelta.baseValue).toBe(1_000_000);
    expect(revDelta.compareValue).toBe(1_300_000);
    expect(revDelta.direction).toBe("improved");

    expect(result.verdict).toBe("stronger");
    // Verdict copy must read against Y1, not the generic multi-year copy.
    expect(result.verdictExplanation).toMatch(/Year 1/);
  });

  it("single-year identical scenarios produce a Y1-aware 'identical' verdict (was Y5-anchored 'identical')", () => {
    const m = makeMetrics();
    const result = compareScenarios(m, m, undefined, undefined, { isSingleYear: true });
    expect(result.verdict).toBe("mixed");
    expect(result.verdictExplanation).toMatch(/Year 1/);
  });

  it("single-year explanations cite Year 1 in the metric prose", () => {
    const base = makeMetrics({ revenue: [1_000_000, 0, 0, 0, 0] });
    const compare = makeMetrics({ revenue: [800_000, 0, 0, 0, 0] });
    const result = compareScenarios(base, compare, undefined, undefined, { isSingleYear: true });
    const revDelta = result.metricDeltas.find((d) => d.id === "revenue_y1")!;
    expect(revDelta.explanation).toMatch(/Year 1 revenue/);
  });
});

function buildModelForDiagnostics(over: {
  modelDuration?: "single_year" | "five_year";
  enrollment?: { year1: number; year2: number; year3: number; year4: number; year5: number };
  revenueRows?: unknown[];
  expenseRows?: unknown[];
} = {}): FullModelData {
  return {
    schoolProfile: {
      modelDuration: over.modelDuration ?? "five_year",
      annualSalaryIncrease: 0,
    },
    enrollment: over.enrollment ?? { year1: 50, year2: 100, year3: 200, year4: 400, year5: 800, retentionRate: 85 },
    facilities: { generalCostInflation: 0 },
    programs: [],
    staffingRows: [],
    revenueRows: over.revenueRows ?? [
      {
        id: "tuition",
        enabled: true,
        category: "tuition",
        driverType: "per_student",
        amounts: [10_000, 10_000, 10_000, 10_000, 10_000],
      },
    ],
    expenseRows: over.expenseRows ?? [
      {
        id: "rent",
        enabled: true,
        category: "occupancy_facility",
        driverType: "annual_fixed",
        amounts: [50_000, 50_000, 50_000, 50_000, 50_000],
        escalationRate: 50,
      },
    ],
    capitalAndDebtRows: [],
    openingBalances: { cash: 100_000 },
  } as unknown as FullModelData;
}

describe("runDiagnostics — single-year filter", () => {
  it("five-year mode fires multi-year rules (fast enrollment growth)", () => {
    const data = buildModelForDiagnostics({ modelDuration: "five_year" });
    const findings = runDiagnostics(data, 10);
    const ids = findings.map((f) => f.id);
    // 50 → 100 → 200 → 400 → 800 is well above the 50%/year threshold.
    expect(ids).toContain("fast_enrollment_growth");
  });

  it("single-year mode skips every multi-year rule", () => {
    const data = buildModelForDiagnostics({ modelDuration: "single_year" });
    const findings = runDiagnostics(data, 10);
    const ids = findings.map((f) => f.id);
    expect(ids).not.toContain("fast_enrollment_growth");
    expect(ids).not.toContain("expense_growth_exceeds_revenue");
    expect(ids).not.toContain("surplus_but_tight_cash");
    // The multi-year negative_cash variant is also skipped; the Y1-only
    // negative_cash_y1 variant replaces it.
    expect(ids).not.toContain("negative_cash");
  });

  it("single-year mode still fires Y1-only rules (no_revenue_entered)", () => {
    const data = buildModelForDiagnostics({
      modelDuration: "single_year",
      revenueRows: [],
    });
    const findings = runDiagnostics(data, 10);
    const ids = findings.map((f) => f.id);
    expect(ids).toContain("no_revenue_entered");
  });

  it("single-year mode flags Y1 negative cash via the Y1-specific rule", () => {
    // Big rent expense + tiny enrollment ensures Y1 ending cash < 0.
    const data = buildModelForDiagnostics({
      modelDuration: "single_year",
      enrollment: { year1: 5, year2: 0, year3: 0, year4: 0, year5: 0 },
      expenseRows: [
        { id: "rent", enabled: true, category: "occupancy_facility", driverType: "annual_fixed", amounts: [500_000, 0, 0, 0, 0] },
      ],
    });
    // Strip starting cash so it actually goes negative.
    (data as unknown as { openingBalances: { cash: number } }).openingBalances = { cash: 0 };

    const findings = runDiagnostics(data, 10);
    const ids = findings.map((f) => f.id);
    expect(ids).toContain("negative_cash_y1");
    expect(ids).not.toContain("negative_cash");
  });
});
