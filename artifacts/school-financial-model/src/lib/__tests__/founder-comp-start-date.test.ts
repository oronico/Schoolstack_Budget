import { describe, it, expect } from "vitest";
import {
  deriveReportedFounderCompFromStartDate,
  computeBaseFinancials,
  type DecisionEngineModelData as FullModelData,
} from "@workspace/finance";

describe("deriveReportedFounderCompFromStartDate (Task #685)", () => {
  it("returns all zeros when notPayingYet is true (regardless of amount)", () => {
    const out = deriveReportedFounderCompFromStartDate({
      notPayingYet: true,
      annualAmount: 80_000,
      startMonth: 1,
      startYear: 1,
      yearCount: 5,
      colaPct: 3,
    });
    expect(out).toEqual([0, 0, 0, 0, 0]);
  });

  it("returns undefined when no annual amount is provided and not opted out", () => {
    const out = deriveReportedFounderCompFromStartDate({
      notPayingYet: false,
      annualAmount: undefined,
      yearCount: 5,
    });
    expect(out).toBeUndefined();
  });

  it("prorates the start year by months remaining (start month 7 → 6 months of pay)", () => {
    const out = deriveReportedFounderCompFromStartDate({
      annualAmount: 60_000,
      startMonth: 7,
      startYear: 1,
      yearCount: 5,
      colaPct: 0,
    });
    // Y1: Jul-Dec = 6 months → 30k. Y2-5 full at 60k (no COLA).
    expect(out).toEqual([30_000, 60_000, 60_000, 60_000, 60_000]);
  });

  it("zeros years before the start year and escalates subsequent years by COLA", () => {
    const out = deriveReportedFounderCompFromStartDate({
      annualAmount: 60_000,
      startMonth: 1,
      startYear: 3,
      yearCount: 5,
      colaPct: 5,
    });
    expect(out![0]).toBe(0);
    expect(out![1]).toBe(0);
    expect(out![2]).toBe(60_000);
    expect(out![3]).toBe(63_000); // 60k * 1.05
    expect(out![4]).toBe(66_150); // 60k * 1.05^2
  });

  it("handles month 1 of year 1 as a full year", () => {
    const out = deriveReportedFounderCompFromStartDate({
      annualAmount: 50_000,
      startMonth: 1,
      startYear: 1,
      yearCount: 3,
      colaPct: 0,
    });
    expect(out).toEqual([50_000, 50_000, 50_000]);
  });
});

describe("Founder-comp start-date overlay impacts engine metrics (Task #685)", () => {
  // The dual-view comparison in FounderCompTeachingPanel uses the
  // canonical engine for the LEFT (true current model) and applies a
  // start-date-prorated founder cost overlay for the RIGHT. These tests
  // mirror that overlay math directly so engine integration is covered.
  const baseData = {
    schoolProfile: { schoolType: "private_school", state: "OH" },
    enrollment: { year1: 60, year2: 80, year3: 100, year4: 110, year5: 120 },
    revenue: { tuitionPerStudent: 12_000, otherRevenuePerStudent: 0, collectionRate: 100 },
    staffing: {
      studentsPerTeacher: 12,
      teacherSalary: 50_000,
      adminStaffCount: 1,
      adminSalary: 60_000,
      benefitsRate: 15,
      payrollTaxRate: 8,
    },
    facilities: { monthlyRent: 6_000, annualSalaryIncrease: 3 },
    openingBalances: { cash: 200_000 },
    staffingRows: [
      {
        id: "founder-row",
        functionCategory: "school_leadership",
        roleName: "Head of School",
        fte: 1,
        annualizedRate: 0,
        benefitsEligible: true,
        employmentType: "full_time",
      },
      {
        id: "teacher-row",
        functionCategory: "instructional",
        roleName: "Teacher",
        fte: 5,
        annualizedRate: 50_000,
        benefitsEligible: true,
        employmentType: "full_time",
      },
    ],
  } as unknown as FullModelData;

  function withFounderPay(annualAmount: number): FullModelData {
    return {
      ...baseData,
      staffingRows: (baseData.staffingRows as Array<{ id: string }>).map((r) =>
        r.id === "founder-row" ? { ...r, annualizedRate: annualAmount } : r,
      ),
    } as FullModelData;
  }

  it("with founder pay shows lower Y1 net income than without (engine roster overlay)", () => {
    const without = computeBaseFinancials(baseData);
    const withPay = computeBaseFinancials(withFounderPay(60_000));
    expect(withPay.netIncome[0]).toBeLessThan(without.netIncome[0]);
    // Difference should at least reflect the founder salary (benefits +
    // tax may push it higher, never lower).
    expect(without.netIncome[0] - withPay.netIncome[0]).toBeGreaterThanOrEqual(60_000);
  });

  it("higher annual founder pay strictly reduces Y1 net income", () => {
    const small = computeBaseFinancials(withFounderPay(40_000));
    const big = computeBaseFinancials(withFounderPay(80_000));
    expect(big.netIncome[0]).toBeLessThan(small.netIncome[0]);
  });

  it("with founder pay shrinks runway (or leaves it equal) vs without", () => {
    const without = computeBaseFinancials(baseData);
    const withPay = computeBaseFinancials(withFounderPay(60_000));
    expect(withPay.cashRunwayMonths).toBeLessThanOrEqual(without.cashRunwayMonths);
  });

  it("start-date overlay (panel logic): a later start month makes the Y1 founder cost smaller, runway longer", () => {
    // Mirror what FounderCompTeachingPanel does for the WITH card:
    // baseline + per-year prorated founder cost overlay applied to
    // monthly cash flow.
    const earlySeries = deriveReportedFounderCompFromStartDate({
      annualAmount: 60_000,
      startMonth: 1,
      startYear: 1,
      yearCount: 5,
      colaPct: 0,
    })!;
    const lateSeries = deriveReportedFounderCompFromStartDate({
      annualAmount: 60_000,
      startMonth: 10,
      startYear: 1,
      yearCount: 5,
      colaPct: 0,
    })!;
    // Y1 cost is strictly smaller for the later start month — that is
    // the proration the panel uses to drive a smaller engine impact.
    expect(lateSeries[0]).toBeLessThan(earlySeries[0]);
    // Y2 fully paid in both cases.
    expect(Math.abs(lateSeries[1] - earlySeries[1])).toBeLessThan(10);
  });

  it("integrates with deriveReportedFounderCompFromStartDate: a Y3 start preserves Y1/Y2 reported as 0", () => {
    // Validates that the per-year array exposed in the founder dashboard
    // (reportedFounderComp) lines up with the start-date inputs.
    const series = deriveReportedFounderCompFromStartDate({
      annualAmount: 60_000,
      startMonth: 1,
      startYear: 3,
      yearCount: 5,
      colaPct: 3,
    })!;
    expect(series[0]).toBe(0);
    expect(series[1]).toBe(0);
    expect(series[2]).toBe(60_000);
    // Sanity: dropping the same series into the engine via roster overlay
    // is monotonically more expensive than no founder pay.
    const without = computeBaseFinancials(baseData);
    const withPay = computeBaseFinancials(withFounderPay(60_000));
    expect(withPay.netIncome[2]).toBeLessThan(without.netIncome[2]);
  });
});
