import { describe, it, expect } from "vitest";
import {
  findFounderRow,
  getSuggestedFounderComp,
  getFounderCompBenchmark,
  getFounderCompBenchmarkPerYear,
  getFounderCompBandTransitions,
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

describe("getSuggestedFounderComp (Task #633: NAIS / NACSA / BLS benchmarks)", () => {
  it("returns the NAIS xs-band median for a small private school in an average-COL state", () => {
    // private_school xs band ($140k) × medium COL (1.0) × experienced (1.0)
    expect(getSuggestedFounderComp("private_school", "OH", 100)).toBe(140_000);
  });
  it("uses the size band derived from year-1 enrollment", () => {
    // private_school s band ($180k) × medium COL × experienced
    expect(getSuggestedFounderComp("private_school", "OH", 220)).toBe(180_000);
    // private_school m band ($230k)
    expect(getSuggestedFounderComp("private_school", "OH", 400)).toBe(230_000);
  });
  it("applies the very-high COL multiplier (1.30x) for CA / NY / DC", () => {
    // 140_000 * 1.30 = 182_000
    expect(getSuggestedFounderComp("private_school", "CA", 100)).toBe(182_000);
  });
  it("applies the high COL multiplier (1.15x) for CO / IL / etc.", () => {
    // charter_school xs band ($95k) * 1.15 = 109_250 → 109_000
    expect(getSuggestedFounderComp("charter_school", "CO", 100)).toBe(109_000);
  });
  it("applies the low-COL multiplier (0.90x) for low-COL states", () => {
    // private_school xs ($140k) * 0.90 = 126_000
    expect(getSuggestedFounderComp("private_school", "MS", 100)).toBe(126_000);
  });
  it("applies the early-career tenure adjustment (0.85x) when founder has <4 years", () => {
    // 140_000 * 0.85 = 119_000
    expect(getSuggestedFounderComp("private_school", "OH", 100, 1)).toBe(119_000);
  });
  it("falls back to a blended NAIS+NACSA median for uncovered school types", () => {
    // 'other' is uncovered → fallback table xs band = avg(140k, 95k) = 117_500 → 118_000
    // medium COL × experienced (1.0) → 118_000
    expect(getSuggestedFounderComp("other", "OH", 100)).toBe(118_000);
  });
  it("returns undefined when school type is missing", () => {
    expect(getSuggestedFounderComp(undefined, "CA")).toBeUndefined();
  });
});

describe("getFounderCompBenchmark", () => {
  it("returns a citation pointing at NAIS for private schools", () => {
    const b = getFounderCompBenchmark({
      schoolType: "private_school",
      stateCode: "OH",
      enrollmentY1: 100,
    });
    expect(b?.source.shortLabel).toMatch(/NAIS/);
    expect(b?.isFallback).toBe(false);
    expect(b?.sizeBand.key).toBe("xs");
    expect(b?.colTier.key).toBe("medium");
    expect(b?.tenureBand.key).toBe("experienced");
    expect(b?.amount).toBe(140_000);
  });
  it("returns a citation pointing at NACSA for charter schools", () => {
    const b = getFounderCompBenchmark({
      schoolType: "charter_school",
      stateCode: "TX",
      enrollmentY1: 220,
    });
    expect(b?.source.shortLabel).toMatch(/NACSA/);
    expect(b?.sizeBand.key).toBe("s");
  });
  it("returns a citation pointing at BLS for microschool / pod / coop / tutoring", () => {
    const b = getFounderCompBenchmark({
      schoolType: "microschool",
      stateCode: "OH",
      enrollmentY1: 30,
    });
    expect(b?.source.shortLabel).toMatch(/BLS/);
  });
  it("flags isFallback=true and uses a blended source for uncovered school types", () => {
    const b = getFounderCompBenchmark({
      schoolType: "boarding_school_with_farm",
      stateCode: "OH",
      enrollmentY1: 100,
    });
    expect(b?.isFallback).toBe(true);
    expect(b?.source.shortLabel).toMatch(/[Ff]allback/);
  });
  it("includes a one-sentence explanation that mentions the size band", () => {
    const b = getFounderCompBenchmark({
      schoolType: "private_school",
      stateCode: "CA",
      enrollmentY1: 100,
    });
    expect(b?.explanation).toMatch(/under 150 students/i);
    expect(b?.explanation).toMatch(/very high cost/i);
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
  it("defaults to the suggested market rate (school type × size × state) when no override", () => {
    const m = baseModel({
      schoolProfile: { schoolType: "private_school", state: "CA" } as never,
      enrollment: { year1: 100 } as never,
    });
    const ys = getNormalizedFounderCompYears(m, 5);
    // private_school xs band ($140k) × very-high COL (1.30) × experienced (1.0)
    // = 182_000 (rounded to nearest $1k)
    expect(ys[0]).toBe(182_000);
  });
  it("picks a larger size band when year-1 enrollment grows", () => {
    const m = baseModel({
      schoolProfile: { schoolType: "private_school", state: "OH" } as never,
      enrollment: { year1: 400 } as never,
    });
    const ys = getNormalizedFounderCompYears(m, 5);
    // private_school m band ($230k) × medium COL (1.0) × experienced (1.0) = 230_000
    expect(ys[0]).toBe(230_000);
  });
});

describe("getFounderCompBenchmarkPerYear (Task #650: per-year size band)", () => {
  it("resolves a benchmark per year using each year's projected enrollment band", () => {
    // private_school NAIS bands: xs (<150), s (150–300), m (300–500)
    // Y1 100 → xs ($140k); Y3 200 → s ($180k); Y5 350 → m ($230k).
    // 0% COLA so escalatedAmount equals the base amount.
    const m = baseModel({
      schoolProfile: { schoolType: "private_school", state: "OH" } as never,
      enrollment: { year1: 100, year2: 140, year3: 200, year4: 280, year5: 350 } as never,
      facilities: { ...baseModel().facilities, annualSalaryIncrease: 0 } as never,
    });
    const series = getFounderCompBenchmarkPerYear(m, 5);
    expect(series.map((s) => s?.benchmark.sizeBand.key)).toEqual([
      "xs",
      "xs",
      "s",
      "s",
      "m",
    ]);
    expect(series.map((s) => s?.escalatedAmount)).toEqual([
      140_000,
      140_000,
      180_000,
      180_000,
      230_000,
    ]);
  });

  it("forward-fills enrollment when later years are missing", () => {
    const m = baseModel({
      schoolProfile: { schoolType: "private_school", state: "OH" } as never,
      enrollment: { year1: 100 } as never,
      facilities: { ...baseModel().facilities, annualSalaryIncrease: 0 } as never,
    });
    const series = getFounderCompBenchmarkPerYear(m, 5);
    expect(series.every((s) => s?.benchmark.sizeBand.key === "xs")).toBe(true);
  });

  it("escalates each year's benchmark by COLA from year 1", () => {
    const m = baseModel({
      schoolProfile: { schoolType: "private_school", state: "OH" } as never,
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100 } as never,
      facilities: { ...baseModel().facilities, annualSalaryIncrease: 3 } as never,
    });
    const series = getFounderCompBenchmarkPerYear(m, 5);
    // Y5: 140k * 1.03^4 ≈ 157,576 → rounded to nearest $1k = 158_000.
    expect(series[0]?.escalatedAmount).toBe(140_000);
    expect(series[4]?.escalatedAmount).toBe(Math.round((140_000 * Math.pow(1.03, 4)) / 1000) * 1000);
  });

  it("returns undefined entries when schoolType is missing", () => {
    const m = baseModel({ schoolProfile: {} as never });
    expect(getFounderCompBenchmarkPerYear(m, 5).every((s) => s === undefined)).toBe(true);
  });
});

describe("getFounderCompBandTransitions", () => {
  it("flags the year a school crosses into a new NAIS / NACSA band", () => {
    const m = baseModel({
      schoolProfile: { schoolType: "private_school", state: "OH" } as never,
      enrollment: { year1: 100, year2: 140, year3: 200, year4: 280, year5: 350 } as never,
      facilities: { ...baseModel().facilities, annualSalaryIncrease: 0 } as never,
    });
    const transitions = getFounderCompBandTransitions(getFounderCompBenchmarkPerYear(m, 5));
    expect(transitions.map((t) => ({ year: t.year, from: t.fromBand.key, to: t.toBand.key }))).toEqual([
      { year: 3, from: "xs", to: "s" },
      { year: 5, from: "s", to: "m" },
    ]);
  });

  it("returns no transitions when the band stays the same all 5 years", () => {
    const m = baseModel({
      schoolProfile: { schoolType: "private_school", state: "OH" } as never,
      enrollment: { year1: 60, year2: 70, year3: 80, year4: 90, year5: 100 } as never,
    });
    expect(getFounderCompBandTransitions(getFounderCompBenchmarkPerYear(m, 5))).toEqual([]);
  });
});

describe("getNormalizedFounderCompYears (per-year band defaults — Task #650)", () => {
  it("uses per-year benchmarks (not a Y1 broadcast) when there's no override", () => {
    const m = baseModel({
      schoolProfile: { schoolType: "private_school", state: "OH" } as never,
      enrollment: { year1: 100, year2: 140, year3: 200, year4: 280, year5: 350 } as never,
      facilities: { ...baseModel().facilities, annualSalaryIncrease: 0 } as never,
    });
    expect(getNormalizedFounderCompYears(m, 5)).toEqual([140_000, 140_000, 180_000, 180_000, 230_000]);
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
