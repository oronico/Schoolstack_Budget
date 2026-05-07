import { describe, it, expect } from "vitest";
import {
  inferRevenueQuality,
  computeRevenueQualityRollup,
  type RevenueQualityYearInputs,
} from "@workspace/finance";

describe("inferRevenueQuality", () => {
  it("respects an explicit override regardless of category", () => {
    expect(
      inferRevenueQuality({
        id: "philanthropy_annual_fund",
        category: "philanthropy",
        revenueQuality: "contracted",
      }),
    ).toBe("contracted");
  });

  it("buckets gross_tuition as contracted but other tuition_and_fees rows as projected", () => {
    expect(inferRevenueQuality({ id: "gross_tuition", category: "tuition_and_fees" })).toBe(
      "contracted",
    );
    expect(inferRevenueQuality({ id: "registration_fees", category: "tuition_and_fees" })).toBe(
      "projected",
    );
    expect(inferRevenueQuality({ id: "aftercare", category: "tuition_and_fees" })).toBe("projected");
  });

  it("treats tuition_offsets (scholarship discounts) as contracted so they net hard revenue", () => {
    expect(inferRevenueQuality({ id: "scholarship_discounts", category: "tuition_offsets" })).toBe(
      "contracted",
    );
  });

  it("buckets public_funding and school_choice rows as policy_dependent", () => {
    expect(inferRevenueQuality({ id: "state_local_perpupil", category: "public_funding" })).toBe(
      "policy_dependent",
    );
    expect(inferRevenueQuality({ id: "esa_vouchers", category: "school_choice" })).toBe(
      "policy_dependent",
    );
  });

  it("buckets philanthropy and grants_contributions as donor_dependent", () => {
    expect(inferRevenueQuality({ id: "annual_fund", category: "philanthropy" })).toBe(
      "donor_dependent",
    );
    expect(inferRevenueQuality({ id: "foundation_grant", category: "grants_contributions" })).toBe(
      "donor_dependent",
    );
  });

  it("falls back to projected for other_revenue or unknown categories", () => {
    expect(inferRevenueQuality({ id: "summer_camp", category: "other_revenue" })).toBe("projected");
    expect(inferRevenueQuality({ id: "mystery_row", category: "weird_unknown" })).toBe("projected");
    expect(inferRevenueQuality({})).toBe("projected");
  });
});

describe("computeRevenueQualityRollup", () => {
  // Mixed-source row set covering every bucket so the rollup math has to
  // partition correctly: signed tuition + scholarship offset (contracted),
  // ESA voucher (policy), aftercare fees (projected), and annual fund
  // (donor).
  const rows = [
    { id: "gross_tuition", category: "tuition_and_fees" as const },
    { id: "scholarship_discounts", category: "tuition_offsets" as const },
    { id: "esa_vouchers", category: "school_choice" as const },
    { id: "aftercare", category: "tuition_and_fees" as const },
    { id: "annual_fund", category: "philanthropy" as const },
    { id: "explicit_override", category: "other_revenue" as const, revenueQuality: "contracted" as const },
  ];

  it("partitions amounts into the correct buckets and computes percentages that sum to 1", () => {
    const inputs: RevenueQualityYearInputs[] = [
      {
        year: 1,
        rowAmountsById: {
          gross_tuition: 800_000,
          scholarship_discounts: -50_000, // sign-flipped offset
          esa_vouchers: 200_000,
          aftercare: 25_000,
          annual_fund: 75_000,
          explicit_override: 50_000,
        },
        fixedCosts: 600_000,
        debtService: 100_000,
      },
    ];
    const [y1] = computeRevenueQualityRollup(rows, inputs);

    // Contracted = gross_tuition + scholarship_discounts + explicit_override.
    expect(y1.byBucket.contracted).toBe(800_000 - 50_000 + 50_000);
    expect(y1.byBucket.policy_dependent).toBe(200_000);
    expect(y1.byBucket.projected).toBe(25_000);
    expect(y1.byBucket.donor_dependent).toBe(75_000);

    expect(y1.totalRevenue).toBe(800_000 - 50_000 + 200_000 + 25_000 + 75_000 + 50_000);

    const sumPct =
      y1.pctByBucket.contracted +
      y1.pctByBucket.projected +
      y1.pctByBucket.donor_dependent +
      y1.pctByBucket.policy_dependent;
    expect(sumPct).toBeCloseTo(1, 10);
  });

  it("computes hard revenue coverage as contracted ÷ (fixedCosts + debtService)", () => {
    const inputs: RevenueQualityYearInputs[] = [
      {
        year: 1,
        rowAmountsById: {
          gross_tuition: 800_000,
          scholarship_discounts: -50_000,
          esa_vouchers: 200_000,
          aftercare: 0,
          annual_fund: 0,
          explicit_override: 0,
        },
        fixedCosts: 600_000,
        debtService: 100_000,
      },
    ];
    const [y1] = computeRevenueQualityRollup(rows, inputs);
    expect(y1.hardRevenueCoverage).toBeCloseTo((800_000 - 50_000) / (600_000 + 100_000), 10);
  });

  it("returns null hardRevenueCoverage when fixed costs + debt service are zero", () => {
    const inputs: RevenueQualityYearInputs[] = [
      {
        year: 1,
        rowAmountsById: { gross_tuition: 100_000 },
        fixedCosts: 0,
        debtService: 0,
      },
    ];
    const [y1] = computeRevenueQualityRollup(rows, inputs);
    expect(y1.hardRevenueCoverage).toBeNull();
  });

  it("returns zero percentages and zero buckets when the year has no revenue", () => {
    const inputs: RevenueQualityYearInputs[] = [
      { year: 1, rowAmountsById: {}, fixedCosts: 50_000, debtService: 0 },
    ];
    const [y1] = computeRevenueQualityRollup(rows, inputs);
    expect(y1.totalRevenue).toBe(0);
    expect(y1.pctByBucket.contracted).toBe(0);
    expect(y1.pctByBucket.projected).toBe(0);
    expect(y1.byBucket.donor_dependent).toBe(0);
    // No contracted revenue against $50k of fixed costs → coverage of 0.
    expect(y1.hardRevenueCoverage).toBe(0);
  });

  it("treats unknown row ids as projected (safe default for legacy/migrated models)", () => {
    const inputs: RevenueQualityYearInputs[] = [
      {
        year: 1,
        rowAmountsById: { unknown_row_not_in_rows: 10_000, gross_tuition: 90_000 },
        fixedCosts: 0,
        debtService: 0,
      },
    ];
    const [y1] = computeRevenueQualityRollup(rows, inputs);
    expect(y1.byBucket.projected).toBe(10_000);
    expect(y1.byBucket.contracted).toBe(90_000);
  });

  it("produces independent rollups across multiple years (no cross-year leakage)", () => {
    const inputs: RevenueQualityYearInputs[] = [
      {
        year: 1,
        rowAmountsById: { gross_tuition: 500_000, annual_fund: 100_000 },
        fixedCosts: 400_000,
        debtService: 50_000,
      },
      {
        year: 2,
        rowAmountsById: { gross_tuition: 600_000, annual_fund: 50_000, esa_vouchers: 150_000 },
        fixedCosts: 450_000,
        debtService: 50_000,
      },
    ];
    const [y1, y2] = computeRevenueQualityRollup(rows, inputs);
    expect(y1.byBucket.contracted).toBe(500_000);
    expect(y1.byBucket.policy_dependent).toBe(0);
    expect(y2.byBucket.contracted).toBe(600_000);
    expect(y2.byBucket.policy_dependent).toBe(150_000);
    expect(y1.year).toBe(1);
    expect(y2.year).toBe(2);
  });
});
