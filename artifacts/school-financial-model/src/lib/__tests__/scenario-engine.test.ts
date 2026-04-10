import { describe, expect, it } from "vitest";
import { computeScenarios, type ScenarioAdjustments } from "../scenario-engine";

type ModelInput = Parameters<typeof computeScenarios>[0];

function buildBaseModel(overrides: Record<string, unknown> = {}): ModelInput {
  return {
    schoolProfile: {
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      debtIncluded: true,
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
    openingBalances: {
      cash: 50000,
      ...(overrides.openingBalances as Record<string, unknown> || {}),
    },
    tuitionEscalation: overrides.tuitionEscalation || undefined,
  } as ModelInput;
}

function run(overrides: Record<string, unknown> = {}) {
  const data = buildBaseModel(overrides);
  return computeScenarios(data, []).base.metrics;
}

function runWithScenarios(overrides: Record<string, unknown>, scenarios: ScenarioAdjustments[]) {
  const data = buildBaseModel(overrides);
  return computeScenarios(data, scenarios);
}

describe("scenario-engine: driverVal — all driver types", () => {
  it("annual_fixed returns raw amount unchanged", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [50000, 50000, 50000, 50000, 50000] },
      ],
    });
    expect(m.revenue[0]).toBe(50000);
    expect(m.revenue[4]).toBe(50000);
  });

  it("monthly multiplies by 12", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "monthly", amounts: [1000, 1000, 1000, 1000, 1000] },
      ],
    });
    expect(m.revenue[0]).toBe(12000);
  });

  it("per_student multiplies by enrollment", () => {
    const m = run({
      enrollment: { year1: 50, year2: 60, year3: 70, year4: 80, year5: 90, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "per_student", amounts: [1000, 1000, 1000, 1000, 1000] },
      ],
    });
    expect(m.revenue[0]).toBe(50000);
    expect(m.revenue[1]).toBe(60000);
    expect(m.revenue[4]).toBe(90000);
  });

  it("per_new_student in revenue context uses total enrollment (newStudents not passed)", () => {
    const m = run({
      enrollment: { year1: 100, year2: 120, year3: 140, year4: 160, year5: 180, retentionRate: 100 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "per_new_student", amounts: [500, 500, 500, 500, 500] },
      ],
    });
    expect(m.revenue[0]).toBe(100 * 500);
    expect(m.revenue[1]).toBe(120 * 500);
  });

  it("per_returning_student in revenue context returns 0 (returningStudents not passed)", () => {
    const m = run({
      enrollment: { year1: 100, year2: 120, year3: 140, year4: 160, year5: 180, retentionRate: 100 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "per_returning_student", amounts: [500, 500, 500, 500, 500] },
      ],
    });
    expect(m.revenue[0]).toBe(0);
    expect(m.revenue[1]).toBe(0);
  });

  it("per_new_student and per_returning_student in expense context use new/returning students", () => {
    const m = run({
      enrollment: { year1: 100, year2: 120, year3: 140, year4: 160, year5: 180, retentionRate: 100 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "per_new_student", amounts: [500, 500, 500, 500, 500] },
        { id: "e2", enabled: true, category: "administrative_general", driverType: "per_returning_student", amounts: [300, 300, 300, 300, 300] },
      ],
    });
    expect(m.opex[0]).toBe(100 * 500 + 0 * 300);
    const returningY2 = Math.min(120, Math.round(100 * 1.0));
    const newY2 = Math.max(0, 120 - returningY2);
    expect(m.opex[1]).toBe(newY2 * 500 + returningY2 * 300);
  });
});

describe("scenario-engine: escalation logic", () => {
  it("applies per-row escalationRate when set", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000], escalationRate: 5 },
      ],
    });
    expect(m.revenue[0]).toBe(10000);
    expect(m.revenue[1]).toBeCloseTo(10000 * 1.05, 0);
    expect(m.revenue[2]).toBeCloseTo(10000 * 1.05 ** 2, 0);
  });

  it("falls back to costInflation when escalationRate is 0", () => {
    const m = run({
      facilities: { annualSalaryIncrease: 0, generalCostInflation: 3 },
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000], escalationRate: 0 },
      ],
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
    });
    expect(m.opex[0]).toBe(10000);
    expect(m.opex[2]).toBeCloseTo(10000 * 1.03 ** 2, 0);
  });

  it("uses escalationRate=0 literally when escalationRateOverridden is true (no fallback)", () => {
    const m = run({
      facilities: { annualSalaryIncrease: 0, generalCostInflation: 5 },
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000], escalationRate: 0, escalationRateOverridden: true },
      ],
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
    });
    expect(m.opex[2]).toBe(10000);
  });
});

describe("scenario-engine: percent_of_base revenue", () => {
  it("computes scholarship as percent of tuition base row", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000] },
        { id: "r2", enabled: true, category: "tuition_offsets", driverType: "percent_of_base", percentBase: "r1", amounts: [10, 10, 10, 10, 10] },
      ],
    });
    expect(m.revenue[0]).toBe(1000000 - 100000);
  });

  it("handles escalating percent_of_base with its own escalationRate", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000] },
        { id: "r2", enabled: true, category: "tuition_offsets", driverType: "percent_of_base", percentBase: "r1", amounts: [10, 10, 10, 10, 10], escalationRate: 5 },
      ],
    });
    const tuition = 10000 * 100;
    const discountY2 = tuition * (10 * 1.05) / 100;
    expect(m.revenue[1]).toBeCloseTo(tuition - discountY2, 0);
  });
});

describe("scenario-engine: percent_of_revenue expense", () => {
  it("computes management fee as percent of revenue", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [1000000, 1000000, 1000000, 1000000, 1000000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "percent_of_revenue", amounts: [5, 5, 5, 5, 5] },
      ],
    });
    expect(m.opex[0]).toBe(50000);
  });

  it("escalates percent_of_revenue using its own rate", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [1000000, 1000000, 1000000, 1000000, 1000000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "percent_of_revenue", amounts: [5, 5, 5, 5, 5], escalationRate: 2 },
      ],
    });
    const pctY2 = 5 * 1.02;
    expect(m.opex[1]).toBeCloseTo(1000000 * pctY2 / 100, 0);
  });
});

describe("scenario-engine: staffing loaded cost", () => {
  it("computes loaded cost with benefits and payroll tax", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 60000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
      ],
    });
    const loaded = 60000 * (1 + 0.20 + 0.0765);
    expect(m.staffingCost[0]).toBeCloseTo(loaded, 0);
  });

  it("does not add benefits/tax for contract non-payrollLike", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Consultant", functionCategory: "instructional", employmentType: "contract", fte: 1, annualizedRate: 60000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
      ],
    });
    expect(m.staffingCost[0]).toBe(60000);
  });

  it("adds payroll tax for contract payrollLike", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Consultant", functionCategory: "instructional", employmentType: "contract", fte: 1, annualizedRate: 60000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: true },
      ],
    });
    const loaded = 60000 * (1 + 0.20 + 0.0765);
    expect(m.staffingCost[0]).toBeCloseTo(loaded, 0);
  });

  it("applies salary escalation compounding per year", () => {
    const m = run({
      facilities: { annualSalaryIncrease: 3, generalCostInflation: 0 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 60000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false },
      ],
    });
    expect(m.staffingCost[0]).toBe(60000);
    expect(m.staffingCost[1]).toBeCloseTo(60000 * 1.03, 0);
    expect(m.staffingCost[2]).toBeCloseTo(60000 * 1.03 ** 2, 0);
  });

  it("applies FTE multiplier", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 3, annualizedRate: 50000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false },
      ],
    });
    expect(m.staffingCost[0]).toBe(150000);
  });
});

describe("scenario-engine: ratio-mode staffing", () => {
  it("computes FTE from student ratio with half-FTE rounding", () => {
    const m = run({
      enrollment: { year1: 120, year2: 120, year3: 120, year4: 120, year5: 120, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [1000000, 1000000, 1000000, 1000000, 1000000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 6, annualizedRate: 50000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false, staffingMode: "ratio", studentRatio: 22, minFte: 4 },
      ],
    });
    const computed = 120 / 22;
    const capped = Math.max(computed, 4);
    const fte = Math.ceil(capped * 2) / 2;
    expect(m.staffingCost[0]).toBeCloseTo(fte * 50000, 0);
  });

  it("respects startYear and endYear", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Hire Y2", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 50000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false, startYear: 2 },
      ],
    });
    expect(m.staffingCost[0]).toBe(0);
    expect(m.staffingCost[1]).toBe(50000);
  });
});

describe("scenario-engine: proration factor", () => {
  it("prorates Y1 revenue, expenses, and staffing when isPartialFirstYear", () => {
    const pf = 10 / 12;
    const m = run({
      schoolProfile: { isPartialFirstYear: true, year1OperatingMonths: 10 },
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [120000, 120000, 120000, 120000, 120000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 60000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [24000, 24000, 24000, 24000, 24000] },
      ],
    });
    expect(m.revenue[0]).toBeCloseTo(120000 * pf, 0);
    expect(m.revenue[1]).toBe(120000);
    expect(m.staffingCost[0]).toBeCloseTo(60000 * pf, 0);
    expect(m.opex[0]).toBeCloseTo(24000 * pf, 0);
  });
});

describe("scenario-engine: capital & debt", () => {
  it("computes loan debt service using PMT formula", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      capitalAndDebtRows: [
        { id: "cd1", enabled: true, isLoan: true, loanPrincipal: 250000, loanRate: 6.5, loanTermYears: 10, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0] },
      ],
    });
    const mr = 0.065 / 12;
    const n = 10 * 12;
    const monthlyPmt = (250000 * mr) / (1 - Math.pow(1 + mr, -n));
    const annualPmt = monthlyPmt * 12;
    expect(m.loanDebtService![0]).toBeCloseTo(annualPmt, 0);
    expect(m.totalExpenses[0]).toBeCloseTo(annualPmt, 0);
  });

  it("zero-rate loan divides principal by term", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      capitalAndDebtRows: [
        { id: "cd1", enabled: true, isLoan: true, loanPrincipal: 120000, loanRate: 0, loanTermYears: 10, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0] },
      ],
    });
    expect(m.loanDebtService![0]).toBe(12000);
  });

  it("non-loan capex uses driverVal", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      capitalAndDebtRows: [
        { id: "cd1", enabled: true, isLoan: false, driverType: "annual_fixed", amounts: [25000, 10000, 5000, 0, 0] },
      ],
    });
    expect(m.totalExpenses[0]).toBe(25000);
    expect(m.totalExpenses[1]).toBe(10000);
    expect(m.totalExpenses[2]).toBe(5000);
  });
});

describe("scenario-engine: DSCR calculation", () => {
  it("computes DSCR as (netIncome + loanDS) / loanDS", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [200000, 200000, 200000, 200000, 200000] },
      ],
      capitalAndDebtRows: [
        { id: "cd1", enabled: true, isLoan: true, loanPrincipal: 120000, loanRate: 0, loanTermYears: 10, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0] },
      ],
    });
    const ds = 12000;
    const ni = 200000 - ds;
    const expected = Math.round(((ni + ds) / ds) * 100) / 100;
    expect(m.dscr[0]).toBe(expected);
  });

  it("returns 0 DSCR when no debt service", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [200000, 200000, 200000, 200000, 200000] },
      ],
    });
    expect(m.dscr[0]).toBe(0);
  });
});

describe("scenario-engine: break-even year", () => {
  it("returns year 1 when profitable from start", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [80000, 80000, 80000, 80000, 80000] },
      ],
    });
    expect(m.breakEvenYear).toBe(1);
  });

  it("returns null when never breaks even", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [50000, 50000, 50000, 50000, 50000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
    });
    expect(m.breakEvenYear).toBeNull();
  });

  it("returns correct year when profitability starts in year 3", () => {
    const m = run({
      enrollment: { year1: 50, year2: 80, year3: 120, year4: 150, year5: 180, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "per_student", amounts: [1000, 1000, 1000, 1000, 1000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
    });
    expect(m.breakEvenYear).toBe(3);
  });
});

describe("scenario-engine: net margin", () => {
  it("computes net margin as netIncome / revenue", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [200000, 200000, 200000, 200000, 200000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [180000, 180000, 180000, 180000, 180000] },
      ],
    });
    expect(m.netMargin[0]).toBeCloseTo(20000 / 200000, 4);
  });

  it("returns 0 margin when revenue is 0", () => {
    const m = run({});
    expect(m.netMargin[0]).toBe(0);
  });
});

describe("scenario-engine: cash runway and reserves", () => {
  it("counts first depletion month as month 1 for base model", () => {
    const m = run({
      openingBalances: { cash: 1000 },
      enrollment: { year1: 10, year2: 10, year3: 10, year4: 10, year5: 10, retentionRate: 90 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [12000, 12000, 12000, 12000, 12000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [24000, 24000, 24000, 24000, 24000] },
      ],
    });
    expect(m.cashRunwayMonths).toBe(1);
  });

  it("returns 60 months when always profitable", () => {
    const m = run({
      openingBalances: { cash: 100000 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [200000, 200000, 200000, 200000, 200000] },
      ],
    });
    expect(m.cashRunwayMonths).toBe(60);
  });
});

describe("scenario-engine: tuition tiers", () => {
  it("applies discount tiers to tuition row", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
      tuitionTiers: [
        { id: "t1", name: "Full Pay", discountPercent: 0, studentCounts: [60, 60, 60, 60, 60] },
        { id: "t2", name: "50% Off", discountPercent: 50, studentCounts: [40, 40, 40, 40, 40] },
      ],
    });
    const expected = 60 * 10000 + 40 * 10000 * 0.5;
    expect(m.revenue[0]).toBeCloseTo(expected, 0);
  });

  it("handles excess tier students by scaling down", () => {
    const m = run({
      enrollment: { year1: 80, year2: 80, year3: 80, year4: 80, year5: 80, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
      tuitionTiers: [
        { id: "t1", name: "Full Pay", discountPercent: 0, studentCounts: [60, 60, 60, 60, 60] },
        { id: "t2", name: "50% Off", discountPercent: 50, studentCounts: [40, 40, 40, 40, 40] },
      ],
    });
    const rawTotal = 60 + 40;
    const scale = 80 / rawTotal;
    const expected = (60 * scale) * 10000 + (40 * scale) * 10000 * 0.5;
    expect(m.revenue[0]).toBeCloseTo(expected, 0);
  });
});

describe("scenario-engine: facility vs opex categorization", () => {
  it("separates occupancy_facility from other expense categories", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [5000, 5000, 5000, 5000, 5000] },
        { id: "e2", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
    });
    expect(m.facilityCost[0]).toBe(60000);
    expect(m.opex[0]).toBe(10000);
    expect(m.totalExpenses[0]).toBe(70000);
  });
});

describe("scenario-engine: scenario adjustments (all 5 levers)", () => {
  const baseOverrides = {
    enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
    revenueRows: [
      { id: "r1", enabled: true, category: "other_revenue", driverType: "per_student", amounts: [1000, 1000, 1000, 1000, 1000] },
    ],
    staffingRows: [
      { id: "s1", roleName: "Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 50000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false },
    ],
    expenseRows: [
      { id: "e1", enabled: true, category: "occupancy_facility", driverType: "annual_fixed", amounts: [20000, 20000, 20000, 20000, 20000] },
      { id: "e2", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000] },
    ],
  };

  it("enrollment adjustment scales enrollment by factor", () => {
    const result = runWithScenarios(baseOverrides, [
      { name: "Low", enrollmentAdjustment: -20, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
    ]);
    expect(result.scenarios[0].metrics.enrollment[0]).toBe(80);
  });

  it("tuition adjustment scales revenue", () => {
    const result = runWithScenarios(baseOverrides, [
      { name: "High Tuition", enrollmentAdjustment: 0, tuitionAdjustment: 10, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
    ]);
    expect(result.scenarios[0].metrics.revenue[0]).toBeCloseTo(result.base.metrics.revenue[0] * 1.1, 0);
  });

  it("staffing adjustment scales staffing cost", () => {
    const result = runWithScenarios(baseOverrides, [
      { name: "Cut Staff", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: -10, facilityAdjustment: 0 },
    ]);
    expect(result.scenarios[0].metrics.staffingCost[0]).toBeCloseTo(result.base.metrics.staffingCost[0] * 0.9, 0);
  });

  it("facility adjustment scales facility cost", () => {
    const result = runWithScenarios(baseOverrides, [
      { name: "Cheap Space", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: -15 },
    ]);
    expect(result.scenarios[0].metrics.facilityCost[0]).toBeCloseTo(result.base.metrics.facilityCost[0] * 0.85, 0);
  });

  it("expense adjustment scales opex", () => {
    const result = runWithScenarios(baseOverrides, [
      { name: "Cost Overrun", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 15, staffingAdjustment: 0, facilityAdjustment: 0 },
    ]);
    expect(result.scenarios[0].metrics.opex[0]).toBeCloseTo(result.base.metrics.opex[0] * 1.15, 0);
  });

  it("loan debt service is unchanged by scenario adjustments", () => {
    const overrides = {
      ...baseOverrides,
      capitalAndDebtRows: [
        { id: "cd1", enabled: true, isLoan: true, loanPrincipal: 100000, loanRate: 0, loanTermYears: 10, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0] },
      ],
    };
    const result = runWithScenarios(overrides, [
      { name: "All Adjusted", enrollmentAdjustment: -20, tuitionAdjustment: -10, expenseAdjustment: 15, staffingAdjustment: 10, facilityAdjustment: 5 },
    ]);
    expect(result.scenarios[0].metrics.loanDebtService![0]).toBe(result.base.metrics.loanDebtService![0]);
  });
});

describe("scenario-engine: staffing percent of revenue", () => {
  it("computes staffing as fraction of revenue", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [200000, 200000, 200000, 200000, 200000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 100000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false },
      ],
    });
    expect(m.staffingPctOfRevenue[0]).toBeCloseTo(0.5, 4);
  });
});

describe("scenario-engine: golden parity — microschool payload", () => {
  const microschoolData = {
    schoolProfile: {
      isPartialFirstYear: true,
      year1OperatingMonths: 10,
      debtIncluded: false,
    },
    enrollment: { year1: 12, year2: 18, year3: 22, year4: 25, year5: 25 },
    facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
    revenueRows: [
      { id: "r1", category: "tuition_and_fees", lineItem: "Tuition", enabled: true, driverType: "per_student", amounts: [12000, 12360, 12731, 13113, 13506], billingMonths: 10 },
      { id: "r2", category: "tuition_and_fees", lineItem: "Registration Fee", enabled: true, driverType: "per_student", amounts: [250, 250, 250, 250, 250], billingMonths: 12 },
      { id: "r3", category: "school_choice", lineItem: "AZ ESA Funds", enabled: true, driverType: "per_student", amounts: [7000, 7210, 7426, 7649, 7878], billingMonths: 12 },
      { id: "r4", category: "philanthropy", lineItem: "Annual Fundraising", enabled: true, driverType: "annual_fixed", amounts: [5000, 6000, 7000, 8000, 9000] },
      { id: "r5", category: "tuition_offsets", lineItem: "Scholarship Discount", enabled: true, driverType: "percent_of_base", amounts: [10, 10, 10, 10, 10], percentBase: "r1" },
    ],
    staffingRows: [
      { id: "s1", roleName: "Founder", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
      { id: "s2", roleName: "Lead Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 45000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
      { id: "s3", roleName: "Teaching Assistant", functionCategory: "instructional", employmentType: "part_time", fte: 0.5, annualizedRate: 28000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
    ],
    expenseRows: [
      { id: "e1", category: "occupancy_facility", lineItem: "Rent", enabled: true, driverType: "monthly", amounts: [2500, 2575, 2652, 2732, 2814], escalationRate: 3 },
      { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "monthly", amounts: [300, 308, 316, 324, 332] },
      { id: "e3", category: "occupancy_facility", lineItem: "Insurance", enabled: true, driverType: "annual_fixed", amounts: [2400, 2460, 2522, 2585, 2650] },
      { id: "e4", category: "instructional_program", lineItem: "Curriculum", enabled: true, driverType: "per_student", amounts: [500, 515, 530, 546, 562] },
      { id: "e5", category: "technology", lineItem: "Technology", enabled: true, driverType: "per_student", amounts: [300, 309, 318, 328, 338] },
      { id: "e6", category: "administrative_general", lineItem: "Marketing", enabled: true, driverType: "annual_fixed", amounts: [3000, 3075, 3152, 3231, 3312] },
    ],
    capitalAndDebtRows: [
      { id: "cd1", lineItem: "Equipment Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 30000, loanRate: 6, loanTermYears: 5 },
    ],
    tuitionTiers: [],
    openingBalances: { cash: 15000 },
  } as ModelInput;

  it("Y1 revenue matches backend golden value within 1%", () => {
    const result = computeScenarios(microschoolData, []);
    const pf = 10 / 12;
    const r1 = 12000 * 12 * pf;
    const r2 = 250 * 12 * pf;
    const r3 = 7000 * 12 * pf;
    const r4 = 5000 * pf;
    const r5 = r1 * 0.10;
    const expected = r1 + r2 + r3 + r4 - r5;
    expect(Math.abs(result.base.metrics.revenue[0] - expected)).toBeLessThan(expected * 0.01);
  });

  it("Y1 personnel matches within 1%", () => {
    const result = computeScenarios(microschoolData, []);
    const pf = 10 / 12;
    const s1 = 55000 * (1 + 0.20 + 0.0765);
    const s2 = 45000 * (1 + 0.20 + 0.0765);
    const s3 = 0.5 * 28000 * (1 + 0 + 0.0765);
    const expected = (s1 + s2 + s3) * pf;
    expect(Math.abs(result.base.metrics.staffingCost[0] - expected)).toBeLessThan(expected * 0.01);
  });
});

describe("scenario-engine: disabled rows are excluded", () => {
  it("skips disabled revenue rows", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
        { id: "r2", enabled: false, category: "other_revenue", driverType: "annual_fixed", amounts: [50000, 50000, 50000, 50000, 50000] },
      ],
    });
    expect(m.revenue[0]).toBe(100000);
  });

  it("skips disabled expense rows", () => {
    const m = run({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000] },
        { id: "e2", enabled: false, category: "administrative_general", driverType: "annual_fixed", amounts: [50000, 50000, 50000, 50000, 50000] },
      ],
    });
    expect(m.opex[0]).toBe(10000);
  });
});

describe("scenario-engine: per_fte expense driver", () => {
  it("multiplies by total FTE across all staff", () => {
    const m = run({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Teacher A", functionCategory: "instructional", employmentType: "full_time", fte: 3, annualizedRate: 50000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false },
        { id: "s2", roleName: "Admin", functionCategory: "administrative", employmentType: "full_time", fte: 2, annualizedRate: 40000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "per_fte", amounts: [1000, 1000, 1000, 1000, 1000] },
      ],
    });
    expect(m.opex[0]).toBe(1000 * 5);
  });
});

describe("scenario-engine: nudges generation", () => {
  it("generates green break-even nudge for early profitability", () => {
    const result = runWithScenarios({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
    }, []);
    const breakEven = result.base.nudges.find(n => n.label === "Break-Even");
    expect(breakEven?.signal).toBe("green");
  });

  it("generates red break-even nudge when never profitable", () => {
    const result = runWithScenarios({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "administrative_general", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
    }, []);
    const breakEven = result.base.nudges.find(n => n.label === "Break-Even");
    expect(breakEven?.signal).toBe("red");
  });

  it("generates DSCR nudge when debt exists", () => {
    const result = runWithScenarios({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [200000, 200000, 200000, 200000, 200000] },
      ],
      capitalAndDebtRows: [
        { id: "cd1", enabled: true, isLoan: true, loanPrincipal: 100000, loanRate: 0, loanTermYears: 10, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0] },
      ],
    }, []);
    const dscrNudge = result.base.nudges.find(n => n.label === "DSCR");
    expect(dscrNudge).toBeDefined();
  });
});

describe("scenario-engine: lever nudges", () => {
  it("generates enrollment +10% lever", () => {
    const result = runWithScenarios({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "per_student", amounts: [1000, 1000, 1000, 1000, 1000] },
      ],
    }, []);
    const lever = result.leverNudges.find(l => l.id === "enrollment_up_10");
    expect(lever).toBeDefined();
    expect(lever!.after.netIncome).toBeGreaterThan(lever!.before.netIncome);
  });

  it("generates tuition +5% lever", () => {
    const result = runWithScenarios({
      enrollment: { year1: 100, year2: 100, year3: 100, year4: 100, year5: 100, retentionRate: 85 },
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
    }, []);
    const lever = result.leverNudges.find(l => l.id === "tuition_up_5");
    expect(lever).toBeDefined();
  });
});
