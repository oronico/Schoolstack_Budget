import { describe, it, expect } from "vitest";
import {
  findFounderRow,
  getSuggestedFounderComp,
  getReportedFounderCompYears,
  getNormalizedFounderCompYears,
  computeFounderCompNormalization,
  computeNormalizedFinancials,
  computeBaseFinancials,
  type DecisionEngineModelData as FullModelData,
  type StaffingRowLike,
} from "@workspace/finance";

const baseModel = (overrides: Partial<FullModelData> = {}): FullModelData =>
  ({
    schoolProfile: { schoolType: "private_school", state: "OH" },
    enrollment: { yearOneEnrollment: 60, growthRate: 10, attritionRate: 5 },
    revenue: { tuitionPerStudent: 12_000, otherRevenuePerStudent: 0, collectionRate: 100, paymentTimingMonths: 0 },
    staffing: {
      studentTeacherRatio: 12,
      teacherSalary: 50_000,
      adminSalary: 65_000,
      benefitsRate: 20,
      payrollTaxRate: 8,
    },
    facilities: {
      monthlyRent: 6_000,
      utilitiesPerMonth: 800,
      maintenancePerMonth: 400,
      annualSalaryIncrease: 3,
      annualRentIncrease: 0,
      annualOverheadIncrease: 0,
    },
    capital: { startingCash: 250_000, monthlyOverhead: 5_000 },
    ...overrides,
  } as unknown as FullModelData);

const founderRow = (rate: number, opts: Partial<StaffingRowLike> = {}): StaffingRowLike =>
  ({
    id: "founder",
    title: "Head of School",
    functionCategory: "school_leadership",
    fte: 1,
    annualizedRate: rate,
    benefitsEligible: true,
    ...opts,
  } as StaffingRowLike);

describe("getSuggestedFounderComp", () => {
  it("returns base comp for the school type when state is unknown", () => {
    const v = getSuggestedFounderComp("private_school", "OH");
    expect(v).toBe(95_000);
  });
  it("applies the high-COL multiplier (1.25x) for CA / NY / etc.", () => {
    expect(getSuggestedFounderComp("private_school", "CA")).toBe(Math.round((95_000 * 1.25) / 1000) * 1000);
  });
  it("applies the medium-high-COL multiplier (1.10x) for CO / IL / etc.", () => {
    expect(getSuggestedFounderComp("charter_school", "CO")).toBe(Math.round((110_000 * 1.1) / 1000) * 1000);
  });
  it("returns undefined when school type is missing", () => {
    expect(getSuggestedFounderComp(undefined, "CA")).toBeUndefined();
  });
});

describe("findFounderRow", () => {
  it("returns undefined when no leadership row exists", () => {
    expect(findFounderRow([])).toBeUndefined();
    expect(findFounderRow(undefined)).toBeUndefined();
  });
  it("picks the highest FTE-weighted school_leadership row", () => {
    const rows = [
      founderRow(60_000, { id: "ops", title: "Ops Director" }),
      founderRow(85_000, { id: "head", title: "Head of School" }),
      { ...founderRow(120_000), functionCategory: "instruction" } as StaffingRowLike,
    ];
    expect(findFounderRow(rows)?.id).toBe("head");
  });
});

describe("getReportedFounderCompYears (backward compat)", () => {
  it("uses reportedFounderComp[] when provided and pads short arrays forward", () => {
    const m = baseModel({
      staffing: { ...baseModel().staffing, reportedFounderComp: [50_000, 55_000] } as never,
    });
    const ys = getReportedFounderCompYears(m, 5);
    expect(ys).toEqual([50_000, 55_000, 55_000, 55_000, 55_000]);
  });
  it("falls back to legacy founderSalary, broadcast across years with COLA", () => {
    const m = baseModel({
      staffing: { ...baseModel().staffing, founderSalary: 60_000 } as never,
    });
    const ys = getReportedFounderCompYears(m, 5);
    expect(ys[0]).toBe(60_000);
    // 3% COLA → year 5 ≈ 60000 * 1.03^4
    expect(ys[4]).toBe(Math.round(60_000 * Math.pow(1.03, 4)));
  });
  it("falls back to founder row annualized rate when no explicit field is set", () => {
    const m = baseModel({ staffingRows: [founderRow(72_000)] });
    const ys = getReportedFounderCompYears(m, 5);
    expect(ys[0]).toBe(72_000);
  });
});

describe("getNormalizedFounderCompYears (defaulting + override)", () => {
  it("uses normalizedFounderComp[] when the founder set per-year overrides", () => {
    const m = baseModel({
      staffing: { ...baseModel().staffing, normalizedFounderComp: [90_000, 92_000, 95_000, 95_000, 95_000] } as never,
    });
    expect(getNormalizedFounderCompYears(m, 5)).toEqual([90_000, 92_000, 95_000, 95_000, 95_000]);
  });
  it("defaults to the suggested market rate (school type × state) when no override", () => {
    const m = baseModel({ schoolProfile: { schoolType: "private_school", state: "CA" } as never });
    const ys = getNormalizedFounderCompYears(m, 5);
    // CA → 95k * 1.25 = 118,750 → rounded to nearest $1k = 119,000
    expect(ys[0]).toBe(119_000);
  });
});

describe("computeFounderCompNormalization", () => {
  it("returns hasAdjustment=false and zero deltas when reported == normalized", () => {
    const m = baseModel({
      schoolProfile: { schoolType: "private_school", state: "OH" } as never,
      staffing: {
        ...baseModel().staffing,
        reportedFounderComp: [95_000, 95_000, 95_000, 95_000, 95_000],
        normalizedFounderComp: [95_000, 95_000, 95_000, 95_000, 95_000],
      } as never,
    });
    const out = computeFounderCompNormalization(m, 5);
    expect(out.hasAdjustment).toBe(false);
    expect(out.totalDelta).toBe(0);
  });

  it("produces a positive delta (loaded) when founder under-pays themselves", () => {
    const m = baseModel({
      staffing: {
        ...baseModel().staffing,
        reportedFounderComp: [40_000, 40_000, 40_000, 40_000, 40_000],
        normalizedFounderComp: [90_000, 90_000, 90_000, 90_000, 90_000],
        benefitsRate: 20,
        payrollTaxRate: 10,
      } as never,
    });
    const out = computeFounderCompNormalization(m, 5);
    expect(out.hasAdjustment).toBe(true);
    // Loaded multiplier = 1 + 0.20 + 0.10 = 1.30 → per-year delta = (90k − 40k) * 1.30 = 65,000
    expect(out.delta[0]).toBeCloseTo(65_000, 0);
    expect(out.totalDelta).toBeCloseTo(325_000, 0);
  });

  it("respects per-component payroll tax wage bases on the founder row", () => {
    const components = [
      { label: "FICA SS", rate: 6.2, wageBase: 176_100 },
      { label: "Medicare", rate: 1.45 },
      { label: "FUTA", rate: 0.6, wageBase: 7_000 },
    ];
    const m = baseModel({
      // annualizedRate must be > 0 so findFounderRow picks this row up;
      // the actual comp values come from reported/normalizedFounderComp below.
      staffingRows: [founderRow(50_000, { payrollTaxComponents: components, payrollTaxRateOverridden: false })],
      staffing: {
        ...baseModel().staffing,
        reportedFounderComp: [50_000, 50_000, 50_000, 50_000, 50_000],
        normalizedFounderComp: [200_000, 200_000, 200_000, 200_000, 200_000],
        benefitsRate: 0,
      } as never,
    });
    const out = computeFounderCompNormalization(m, 5);
    // Reported $50k: FICA 50k*6.2% + Medicare 50k*1.45% + FUTA 7k*0.6% = 3,100 + 725 + 42 = 3,867
    // Normalized $200k: FICA 176.1k*6.2% + Medicare 200k*1.45% + FUTA 7k*0.6% = 10,918.20 + 2,900 + 42 = 13,860.20
    // Delta loaded = (200k - 50k) salary + (13,860.20 - 3,867) tax = 150,000 + 9,993.20 ≈ 159,993.20
    expect(out.delta[0]).toBeCloseTo(159_993.2, 0);
  });
});

describe("computeNormalizedFinancials (DSCR / runway divergence)", () => {
  it("produces matching reported vs normalized when there's no adjustment", () => {
    const m = baseModel({
      staffing: {
        ...baseModel().staffing,
        reportedFounderComp: [80_000, 80_000, 80_000, 80_000, 80_000],
        normalizedFounderComp: [80_000, 80_000, 80_000, 80_000, 80_000],
      } as never,
    });
    const view = computeNormalizedFinancials(m);
    expect(view.founderComp.hasAdjustment).toBe(false);
    expect(view.normalized.netIncome).toEqual(view.reported.netIncome);
    expect(view.normalized.dscr).toEqual(view.reported.dscr);
    expect(view.normalized.cashRunwayMonths).toBe(view.reported.cashRunwayMonths);
  });

  it("normalized DSCR <= reported DSCR when founder under-pays themselves", () => {
    const m = baseModel({
      staffing: {
        ...baseModel().staffing,
        reportedFounderComp: [30_000, 30_000, 30_000, 30_000, 30_000],
        normalizedFounderComp: [110_000, 110_000, 110_000, 110_000, 110_000],
      } as never,
    });
    const view = computeNormalizedFinancials(m);
    expect(view.founderComp.hasAdjustment).toBe(true);
    // Year 1 DSCR/runway should NOT be better under the lender view.
    expect(view.normalized.dscr[0]).toBeLessThanOrEqual(view.reported.dscr[0]);
    expect(view.normalized.cashRunwayMonths).toBeLessThanOrEqual(view.reported.cashRunwayMonths);
    // Net income should drop by exactly the loaded delta.
    expect(view.reported.netIncome[0] - view.normalized.netIncome[0]).toBeCloseTo(view.founderComp.delta[0], 0);
  });

  it("reported view matches the unadjusted base financials (regression guard)", () => {
    const m = baseModel({
      staffing: {
        ...baseModel().staffing,
        reportedFounderComp: [50_000, 50_000, 50_000, 50_000, 50_000],
        normalizedFounderComp: [120_000, 120_000, 120_000, 120_000, 120_000],
      } as never,
    });
    const view = computeNormalizedFinancials(m);
    const base = computeBaseFinancials(m);
    expect(view.reported.netIncome).toEqual(base.netIncome);
    expect(view.reported.dscr).toEqual(base.dscr);
    expect(view.reported.cashRunwayMonths).toBe(base.cashRunwayMonths);
  });
});
