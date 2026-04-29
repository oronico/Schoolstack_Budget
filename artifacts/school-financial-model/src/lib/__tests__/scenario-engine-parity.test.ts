import { describe, expect, it } from "vitest";
import { computeScenarios, computeBaseFinancials } from "../scenario-engine";
import {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  driverCoverageFixture,
  computeBackendValues,
  type TestModelPayload,
  type TestRevenueRow,
  type TestExpenseRow,
  type TestCapDebtRow,
  type BackendComputedValues,
} from "@workspace/finance";

type FullModelData = Parameters<typeof computeBaseFinancials>[0];

function toFullModelData(fixture: TestModelPayload): FullModelData {
  return fixture as FullModelData;
}

function withinPct(actual: number, expected: number, pct: number, isRatio = false): boolean {
  const floor = isRatio ? 0.01 : 5;
  const tol = Math.max(Math.abs(expected) * (pct / 100), floor);
  return Math.abs(actual - expected) <= tol;
}

function describeCrossEngineParity(label: string, fixture: TestModelPayload) {
  describe(`cross-engine parity: ${label}`, () => {
    const feResult = computeScenarios(toFullModelData(fixture), []);
    const fe = feResult.base.metrics;
    const be: BackendComputedValues = computeBackendValues(fixture);

    for (let y = 0; y < 5; y++) {
      it(`Y${y + 1} revenue: FE vs BE within 1%`, () => {
        expect(withinPct(fe.revenue[y], be.revenue[y], 1)).toBe(true);
      });

      it(`Y${y + 1} staffing: FE vs BE within 1%`, () => {
        expect(withinPct(fe.staffingCost[y], be.personnel[y], 1)).toBe(true);
      });

      it(`Y${y + 1} expenses (facility+opex): FE vs BE within 1%`, () => {
        const feExp = fe.facilityCost[y] + fe.opex[y];
        expect(withinPct(feExp, be.expenses[y], 1)).toBe(true);
      });

      it(`Y${y + 1} net income: FE vs BE within 1%`, () => {
        expect(withinPct(fe.netIncome[y], be.netIncome[y], 1)).toBe(true);
      });

      if (be.loanDS[y] > 0) {
        it(`Y${y + 1} DSCR: FE vs BE within 1%`, () => {
          const feDscr = fe.dscr[y];
          const beDscr = Math.round(((be.netIncome[y] + be.loanDS[y]) / be.loanDS[y]) * 100) / 100;
          expect(withinPct(feDscr, beDscr, 1, true)).toBe(true);
        });
      }
    }
  });
}

describeCrossEngineParity("microschool", microschoolFixture);
describeCrossEngineParity("private school", privateSchoolFixture);
describeCrossEngineParity("charter school", charterFixture);
describeCrossEngineParity("driver coverage", driverCoverageFixture);

describe("cross-engine: charter loan PMT exactness", () => {
  const result = computeScenarios(toFullModelData(charterFixture), []);
  const m = result.base.metrics;

  it("loan debt service matches PMT formula exactly", () => {
    const mr = 0.0575 / 12;
    const n = 15 * 12;
    const monthlyPmt = (500000 * mr) / (1 - Math.pow(1 + mr, -n));
    const annualPmt = monthlyPmt * 12;
    expect(Math.abs(m.loanDebtService![0] - annualPmt)).toBeLessThan(1);
  });
});

describe("cross-engine: computeBaseFinancials output shape", () => {
  const m = computeBaseFinancials(toFullModelData(microschoolFixture));

  it("returns 5-year arrays for all metric fields", () => {
    expect(m.revenue).toHaveLength(5);
    expect(m.staffingCost).toHaveLength(5);
    expect(m.facilityCost).toHaveLength(5);
    expect(m.opex).toHaveLength(5);
    expect(m.totalExpenses).toHaveLength(5);
    expect(m.netIncome).toHaveLength(5);
    expect(m.netMargin).toHaveLength(5);
    expect(m.dscr).toHaveLength(5);
    expect(m.staffingPctOfRevenue).toHaveLength(5);
    expect(m.enrollment).toHaveLength(5);
    expect(m.loanDebtService).toHaveLength(5);
  });

  it("netIncome = revenue - totalExpenses for each year", () => {
    for (let y = 0; y < 5; y++) {
      expect(m.netIncome[y]).toBeCloseTo(m.revenue[y] - m.totalExpenses[y], 0);
    }
  });
});

/* -----------------------------------------------------------------------
 * Per-driver fail-fast guards.
 *
 * Each test below builds a minimal one-row model that exercises a single
 * driver type and asserts BE applies the driver multiplier (rather than
 * silently returning the raw amount, as the BE engine did for `per_fte`
 * for a long time before anyone noticed). The tests are deliberately
 * structured so the failure mode is "BE returned the raw amount", which
 * is the exact drift class we want to catch. They also assert FE/BE
 * parity on the same model so any new driver added to FE has to be
 * wired through BE too.
 *
 * Multipliers are chosen so raw vs. driven differ by far more than the
 * 1% parity tolerance — e.g. 10 students or 12 months — making "BE
 * returned raw" obvious.
 * --------------------------------------------------------------------- */

const ENROLL_FOR_GUARDS = { year1: 10, year2: 15, year3: 20, year4: 20, year5: 20, retentionRate: 80 } as const;

function makeMinimalModel(): TestModelPayload {
  return {
    schoolProfile: {
      schoolName: "Driver Guard",
      state: "XX",
      schoolType: "private_school",
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      debtIncluded: false,
      maxCapacity: 100,
      fiscalYearStartMonth: 7,
    },
    enrollment: { ...ENROLL_FOR_GUARDS },
    facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
    revenueRows: [],
    staffingRows: [],
    expenseRows: [],
    capitalAndDebtRows: [],
    openingBalances: { cash: 0 },
  };
}

function withRevenueRow(row: TestRevenueRow): TestModelPayload {
  const m = makeMinimalModel();
  m.revenueRows = [row];
  return m;
}

function withExpenseRow(row: TestExpenseRow, withOneFte = false): TestModelPayload {
  const m = makeMinimalModel();
  m.expenseRows = [row];
  if (withOneFte) {
    m.staffingRows = [
      {
        id: "s1",
        roleName: "T",
        functionCategory: "instructional",
        employmentType: "full_time",
        fte: 1,
        annualizedRate: 0,
        benefitsEligible: false,
        benefitsRate: 0,
        payrollTaxRate: 0,
        payrollLike: false,
      },
    ];
  }
  return m;
}

function withCapDebtRow(row: TestCapDebtRow): TestModelPayload {
  const m = makeMinimalModel();
  m.capitalAndDebtRows = [row];
  return m;
}

function feAndBe(fixture: TestModelPayload) {
  return {
    fe: computeBaseFinancials(toFullModelData(fixture)),
    be: computeBackendValues(fixture),
  };
}

describe("driver guard: revenue drivers are not silently dropped", () => {
  it("per_student: BE multiplies by enrollment (not raw amount)", () => {
    const raw = 100;
    const fixture = withRevenueRow({
      id: "r1", category: "tuition_and_fees", lineItem: "T",
      enabled: true, driverType: "per_student", amounts: [raw, raw, raw, raw, raw],
    });
    const { fe, be } = feAndBe(fixture);
    // 10 students × $100 = $1000 — must NOT equal $100 (raw)
    expect(be.revenue[0]).toBe(1000);
    expect(be.revenue[0]).not.toBe(raw);
    expect(withinPct(fe.revenue[0], be.revenue[0], 1)).toBe(true);
  });

  it("monthly: BE multiplies by 12 (not raw amount)", () => {
    const raw = 200;
    const fixture = withRevenueRow({
      id: "r1", category: "other_revenue", lineItem: "M",
      enabled: true, driverType: "monthly", amounts: [raw, raw, raw, raw, raw],
    });
    const { fe, be } = feAndBe(fixture);
    expect(be.revenue[0]).toBe(2400);
    expect(be.revenue[0]).not.toBe(raw);
    expect(withinPct(fe.revenue[0], be.revenue[0], 1)).toBe(true);
  });

  it("annual_fixed: BE returns raw amount (driver is identity)", () => {
    const raw = 7500;
    const fixture = withRevenueRow({
      id: "r1", category: "philanthropy", lineItem: "G",
      enabled: true, driverType: "annual_fixed", amounts: [raw, raw, raw, raw, raw],
    });
    const { fe, be } = feAndBe(fixture);
    expect(be.revenue[0]).toBe(raw);
    expect(withinPct(fe.revenue[0], be.revenue[0], 1)).toBe(true);
  });

  it("percent_of_base: BE applies pct to base (not raw)", () => {
    const m = makeMinimalModel();
    m.revenueRows = [
      { id: "r1", category: "tuition_and_fees", lineItem: "Tuition",
        enabled: true, driverType: "per_student", amounts: [1000, 1000, 1000, 1000, 1000] },
      { id: "r2", category: "tuition_offsets", lineItem: "Discount",
        enabled: true, driverType: "percent_of_base", amounts: [10, 10, 10, 10, 10], percentBase: "r1" },
    ];
    const { fe, be } = feAndBe(m);
    // base = 10 × 1000 = 10000; discount = 10% × 10000 = 1000; net rev = 9000
    expect(be.revenue[0]).toBe(9000);
    // If BE silently treated percent_of_base as raw, it would compute
    // 10000 - 10 = 9990 (off by ~990).
    expect(be.revenue[0]).not.toBe(9990);
    expect(withinPct(fe.revenue[0], be.revenue[0], 1)).toBe(true);
  });
});

describe("driver guard: expense drivers are not silently dropped", () => {
  it("per_student: BE multiplies by enrollment (not raw)", () => {
    const raw = 100;
    const fixture = withExpenseRow({
      id: "e1", category: "instructional_program", lineItem: "X",
      enabled: true, driverType: "per_student", amounts: [raw, raw, raw, raw, raw],
    });
    const { fe, be } = feAndBe(fixture);
    expect(be.expenses[0]).toBe(1000);
    expect(be.expenses[0]).not.toBe(raw);
    expect(withinPct(fe.opex[0] + fe.facilityCost[0], be.expenses[0], 1)).toBe(true);
  });

  it("monthly: BE multiplies by 12 (not raw)", () => {
    const raw = 500;
    const fixture = withExpenseRow({
      id: "e1", category: "occupancy_facility", lineItem: "Rent",
      enabled: true, driverType: "monthly", amounts: [raw, raw, raw, raw, raw],
    });
    const { fe, be } = feAndBe(fixture);
    expect(be.expenses[0]).toBe(6000);
    expect(be.expenses[0]).not.toBe(raw);
    expect(withinPct(fe.opex[0] + fe.facilityCost[0], be.expenses[0], 1)).toBe(true);
  });

  it("annual_fixed: BE returns raw (driver is identity)", () => {
    const raw = 4321;
    const fixture = withExpenseRow({
      id: "e1", category: "administrative_general", lineItem: "F",
      enabled: true, driverType: "annual_fixed", amounts: [raw, raw, raw, raw, raw],
    });
    const { fe, be } = feAndBe(fixture);
    expect(be.expenses[0]).toBe(raw);
    expect(withinPct(fe.opex[0] + fe.facilityCost[0], be.expenses[0], 1)).toBe(true);
  });

  it("per_fte: BE multiplies by total FTE (not raw) — caught a real BE drift bug", () => {
    const raw = 1500;
    const fixture = withExpenseRow({
      id: "e1", category: "administrative_general", lineItem: "PD",
      enabled: true, driverType: "per_fte", amounts: [raw, raw, raw, raw, raw],
    }, /* withOneFte */ true);
    const { fe, be } = feAndBe(fixture);
    // 1 FTE × $1500 = $1500. With multiple FTEs it would be N×raw.
    // The key assertion: even with 1 FTE, BE must apply the multiplier
    // (i.e. NOT silently fall through to "annual_fixed = raw").
    // Strengthen with multiple FTEs:
    fixture.staffingRows.push({
      id: "s2", roleName: "T2", functionCategory: "instructional",
      employmentType: "full_time", fte: 3, annualizedRate: 0,
      benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false,
    });
    const reBe = computeBackendValues(fixture);
    const reFe = computeBaseFinancials(toFullModelData(fixture));
    // 4 FTE × $1500 = $6000 — must NOT equal $1500 (raw)
    expect(reBe.expenses[0]).toBe(6000);
    expect(reBe.expenses[0]).not.toBe(raw);
    expect(withinPct(reFe.opex[0] + reFe.facilityCost[0], reBe.expenses[0], 1)).toBe(true);
    // Also keep the original 1-FTE result in scope so the assertion above still ran.
    expect(be.expenses[0]).toBe(1500);
    expect(fe.opex[0] + fe.facilityCost[0]).toBeGreaterThan(0);
  });

  it("percent_of_revenue: BE applies pct to revenue (not raw pct)", () => {
    const m = makeMinimalModel();
    m.revenueRows = [
      { id: "r1", category: "philanthropy", lineItem: "G",
        enabled: true, driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
    ];
    m.expenseRows = [
      { id: "e1", category: "administrative_general", lineItem: "Mgmt Fee",
        enabled: true, driverType: "percent_of_revenue", amounts: [5, 5, 5, 5, 5] },
    ];
    const { fe, be } = feAndBe(m);
    // 5% × $100,000 = $5,000 — must NOT equal $5 (raw pct as dollars)
    expect(be.expenses[0]).toBe(5000);
    expect(be.expenses[0]).not.toBe(5);
    expect(withinPct(fe.opex[0] + fe.facilityCost[0], be.expenses[0], 1)).toBe(true);
  });

  it("per_new_student: BE multiplies by new students (not raw)", () => {
    const raw = 200;
    const fixture = withExpenseRow({
      id: "e1", category: "administrative_general", lineItem: "Onboard",
      enabled: true, driverType: "per_new_student", amounts: [raw, raw, raw, raw, raw],
    });
    const { fe, be } = feAndBe(fixture);
    // Y1: all 10 students are new → 10 × $200 = $2000
    expect(be.expenses[0]).toBe(2000);
    expect(be.expenses[0]).not.toBe(raw);
    // Y2: enrollment=15, returning=round(10×0.8)=8, new=15-8=7 → 7×$200 = $1400
    expect(be.expenses[1]).toBe(1400);
    expect(be.expenses[1]).not.toBe(raw);
    for (let y = 0; y < 5; y++) {
      expect(withinPct(fe.opex[y] + fe.facilityCost[y], be.expenses[y], 1)).toBe(true);
    }
  });

  it("per_returning_student: BE multiplies by returning students (not raw, not all students)", () => {
    const raw = 100;
    const fixture = withExpenseRow({
      id: "e1", category: "administrative_general", lineItem: "Retain",
      enabled: true, driverType: "per_returning_student", amounts: [raw, raw, raw, raw, raw],
    });
    const { fe, be } = feAndBe(fixture);
    // Y1: 0 returning → $0 (must NOT silently use enrollment=10 → $1000)
    expect(be.expenses[0]).toBe(0);
    expect(be.expenses[0]).not.toBe(raw);
    expect(be.expenses[0]).not.toBe(1000);
    // Y2: returning = min(15, round(10×0.8)) = 8 → 8 × $100 = $800
    expect(be.expenses[1]).toBe(800);
    expect(be.expenses[1]).not.toBe(raw);
    for (let y = 0; y < 5; y++) {
      expect(withinPct(fe.opex[y] + fe.facilityCost[y], be.expenses[y], 1)).toBe(true);
    }
  });
});

describe("driver guard: capital & debt drivers are not silently dropped", () => {
  it("non-loan annual_fixed: BE returns raw amount", () => {
    const raw = 6000;
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "FF&E", enabled: true,
      driverType: "annual_fixed", amounts: [raw, raw, raw, raw, raw], isLoan: false,
    });
    const { fe, be } = feAndBe(fixture);
    expect(be.capDebt[0]).toBe(raw);
    // Net income: 0 revenue - 0 personnel - 0 expense - 6000 capDebt
    expect(fe.netIncome[0]).toBeCloseTo(-raw, 0);
    expect(withinPct(fe.netIncome[0], be.netIncome[0], 1)).toBe(true);
  });

  it("non-loan monthly: BE multiplies by 12 (not raw)", () => {
    const raw = 250;
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "Lease", enabled: true,
      driverType: "monthly", amounts: [raw, raw, raw, raw, raw], isLoan: false,
    });
    const { fe, be } = feAndBe(fixture);
    expect(be.capDebt[0]).toBe(3000);
    expect(be.capDebt[0]).not.toBe(raw);
    expect(withinPct(fe.netIncome[0], be.netIncome[0], 1)).toBe(true);
  });

  it("non-loan per_student: BE multiplies by enrollment (not raw)", () => {
    const raw = 100;
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "Tech", enabled: true,
      driverType: "per_student", amounts: [raw, raw, raw, raw, raw], isLoan: false,
    });
    const { fe, be } = feAndBe(fixture);
    expect(be.capDebt[0]).toBe(1000);
    expect(be.capDebt[0]).not.toBe(raw);
    expect(withinPct(fe.netIncome[0], be.netIncome[0], 1)).toBe(true);
  });

  it("loan PMT: BE applies amortization (not raw amount=0)", () => {
    const principal = 60000;
    const rate = 6;
    const term = 5;
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "Loan", enabled: true,
      driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true,
      loanPrincipal: principal, loanRate: rate, loanTermYears: term,
    });
    const { fe, be } = feAndBe(fixture);
    // PMT formula: monthly = P*r/(1-(1+r)^-n), annual = monthly*12
    const mr = rate / 100 / 12;
    const n = term * 12;
    const annualPmt = (principal * mr) / (1 - Math.pow(1 + mr, -n)) * 12;
    expect(be.loanDS[0]).toBeGreaterThan(0);
    // Within rounding (BE rounds capDebt to nearest dollar)
    expect(Math.abs(be.loanDS[0] - annualPmt)).toBeLessThan(2);
    expect(Math.abs((fe.loanDebtService?.[0] ?? 0) - annualPmt)).toBeLessThan(1);
  });

  it("loan amortization stops after term ends in both engines", () => {
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "Short Loan", enabled: true,
      driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true,
      loanPrincipal: 10000, loanRate: 5, loanTermYears: 3,
    });
    const { fe, be } = feAndBe(fixture);
    expect(be.loanDS[0]).toBeGreaterThan(0);
    expect(be.loanDS[1]).toBeGreaterThan(0);
    expect(be.loanDS[2]).toBeGreaterThan(0);
    expect(be.loanDS[3]).toBe(0);
    expect(be.loanDS[4]).toBe(0);
    expect(fe.loanDebtService?.[3]).toBe(0);
    expect(fe.loanDebtService?.[4]).toBe(0);
  });
});
