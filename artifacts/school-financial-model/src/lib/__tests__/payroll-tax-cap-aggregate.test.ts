import { describe, it, expect } from "vitest";
import {
  aggregateRosterCapSavings,
  buildRosterCapInsightText,
  CAP_INSIGHT_MIN_SAVINGS,
  computePayrollTaxCapSavings,
  type PayrollTaxComponent,
} from "@workspace/finance";

// Realistic WA-style component set: FICA + Medicare + FUTA + WA SUI + WA
// PFML + WA Comp. Used across the per-row + roster aggregator tests so the
// numbers stay traceable.
const WA_COMPONENTS: PayrollTaxComponent[] = [
  { label: "FICA SS", rate: 6.2, wageBase: 176_100 },
  { label: "Medicare", rate: 1.45 },
  { label: "FUTA", rate: 0.6, wageBase: 7_000 },
  { label: "WA SUI", rate: 1.22, wageBase: 72_800 },
  { label: "WA PFML", rate: 0.28, wageBase: 176_100 },
  { label: "WA Comp", rate: 0.4 },
];

describe("aggregateRosterCapSavings", () => {
  it("returns null when no row has a salary that crosses any wage base", () => {
    // Both salaries (full-time-equivalent) sit below FUTA's $7k floor —
    // the lowest cap in the WA component set — so nothing triggers.
    const agg = aggregateRosterCapSavings([
      { annualizedRate: 6_500, fte: 1, payrollTaxComponents: WA_COMPONENTS },
      { annualizedRate: 12_000, fte: 0.5, payrollTaxComponents: WA_COMPONENTS },
    ]);
    expect(agg).toBeNull();
  });

  it("sums savings across all rows whose salary exceeds a cap", () => {
    // $200k Head of School + $90k Operations Director, both 1.0 FTE.
    const rows = [
      { annualizedRate: 200_000, fte: 1, payrollTaxComponents: WA_COMPONENTS },
      { annualizedRate: 90_000, fte: 1, payrollTaxComponents: WA_COMPONENTS },
    ];
    const agg = aggregateRosterCapSavings(rows);
    expect(agg).not.toBeNull();
    if (!agg) return;
    // The aggregator rounds per-row before summing, so we compose the
    // expectation the same way to stay stable against $1 rounding drift.
    const expectedTotal =
      Math.round(computePayrollTaxCapSavings(200_000, WA_COMPONENTS)?.savings ?? 0) +
      Math.round(computePayrollTaxCapSavings(90_000, WA_COMPONENTS)?.savings ?? 0);
    expect(agg.totalSavings).toBe(expectedTotal);
    expect(agg.affectedRoleCount).toBe(2);
    // The roster aggregate should expose the distinct capped component
    // labels so the surrounding copy can name them.
    expect(agg.cappedComponentLabels).toContain("FUTA");
  });

  it("ignores rows missing payrollTaxComponents (legacy / contractor rows)", () => {
    const agg = aggregateRosterCapSavings([
      { annualizedRate: 200_000, fte: 1, payrollTaxComponents: WA_COMPONENTS },
      { annualizedRate: 200_000, fte: 1 },
    ]);
    expect(agg).not.toBeNull();
    if (!agg) return;
    expect(agg.affectedRoleCount).toBe(1);
  });

  it("skips rows where the founder manually overrode the blended payroll tax rate", () => {
    const agg = aggregateRosterCapSavings([
      {
        annualizedRate: 200_000,
        fte: 1,
        payrollTaxComponents: WA_COMPONENTS,
        payrollTaxRateOverridden: true,
      },
    ]);
    expect(agg).toBeNull();
  });

  it("skips contract rows that are not payroll-like", () => {
    const agg = aggregateRosterCapSavings([
      {
        annualizedRate: 200_000,
        fte: 1,
        payrollTaxComponents: WA_COMPONENTS,
        employmentType: "contract",
        payrollLike: false,
      },
    ]);
    expect(agg).toBeNull();
  });

  it("uses the FTE-scaled salary when checking each row against the wage bases", () => {
    // A 0.1 FTE on a $200k annualized rate works out to $20k actual pay —
    // above FUTA ($7k) but below every other cap. The aggregator should
    // surface only FUTA's savings, never the higher-cap components, so the
    // dollar number stays small + accurate.
    const partial = aggregateRosterCapSavings([
      { annualizedRate: 200_000, fte: 0.1, payrollTaxComponents: WA_COMPONENTS },
    ]);
    expect(partial).not.toBeNull();
    if (!partial) return;
    expect(partial.cappedComponentLabels).toEqual(["FUTA"]);
    // FUTA savings on a $20k FTE-scaled salary: ($20k − $7k) × 0.6% = $78.
    expect(partial.totalSavings).toBe(78);
  });
});

describe("buildRosterCapInsightText", () => {
  const agg = aggregateRosterCapSavings([
    { annualizedRate: 200_000, fte: 1, payrollTaxComponents: WA_COMPONENTS },
  ]);

  it("uses plain-language wording for new_to_budgeting founders", () => {
    expect(agg).not.toBeNull();
    if (!agg) return;
    const text = buildRosterCapInsightText(agg, "new_to_budgeting");
    // Plain-language variant should call out the savings without leaning
    // on "wage base" jargon as the lead noun.
    expect(text.toLowerCase()).toContain("save");
    expect(text).toMatch(/\$[\d,]+/);
  });

  it("uses the technical wording for comfortable founders and null persona", () => {
    expect(agg).not.toBeNull();
    if (!agg) return;
    const technical = buildRosterCapInsightText(agg, "comfortable");
    const fallback = buildRosterCapInsightText(agg, null);
    // Both technical surfaces should reference the wage-base mechanic
    // explicitly so the reader can map the line back to the math.
    expect(technical.toLowerCase()).toContain("wage-base");
    expect(fallback.toLowerCase()).toContain("wage-base");
  });
});

describe("CAP_INSIGHT_MIN_SAVINGS", () => {
  it("is the documented $1 sanity floor", () => {
    expect(CAP_INSIGHT_MIN_SAVINGS).toBe(1);
  });
});
