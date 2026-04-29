import { describe, expect, it } from "vitest";
import { computeScenarios, computeBaseFinancials } from "../scenario-engine";
import {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  driverCoverageFixture,
  type TestModelPayload,
  type TestRevenueRow,
  type TestExpenseRow,
  type TestCapDebtRow,
} from "@workspace/finance";
import goldenJson from "./scenario-engine-golden.json";

/**
 * GOLDEN-SNAPSHOT PARITY TEST
 *
 * The "engine of record" is `lib/finance/src/decision-engine/scenario-engine.ts`.
 * It is the single source of truth used by both the front-end planner and the
 * api-server (precomputed share-link impacts, lender packets, etc).
 *
 * We previously kept a parallel "shadow" implementation in
 * `lib/finance/src/backend-compute.ts` to cross-check the engine, but that
 * shadow engine drifted from the real one whenever a new driver / escalation
 * rule landed (which is how the `per_fte` bug stayed hidden). We replaced it
 * with frozen golden-value snapshots: this test re-runs the production engine
 * against representative fixtures (microschool, private school, charter,
 * driver coverage) and asserts the numeric output matches the committed
 * snapshot exactly.
 *
 * If the engine output changes intentionally, regenerate the snapshot with:
 *   pnpm --filter @workspace/school-financial-model exec \
 *     tsx scripts/gen-golden-snapshots.ts
 * and review the JSON diff carefully before committing.
 */

type FullModelData = Parameters<typeof computeBaseFinancials>[0];

function toFullModelData(fixture: TestModelPayload): FullModelData {
  return fixture as unknown as FullModelData;
}

interface GoldenSnapshot {
  enrollment: number[];
  revenue: number[];
  staffingCost: number[];
  facilityCost: number[];
  opex: number[];
  totalExpenses: number[];
  netIncome: number[];
  netMargin: number[];
  dscr: number[];
  staffingPctOfRevenue: number[];
  cashPosition: number[];
  cashRunwayMonths: number;
  reserveMonths: number;
  breakEvenYear: number | null;
  loanDebtService: number[] | null;
}

const golden = goldenJson as Record<
  "microschool" | "privateSchool" | "charter" | "driverCoverage",
  GoldenSnapshot
>;

const ARRAY_FIELDS: Array<keyof GoldenSnapshot> = [
  "enrollment",
  "revenue",
  "staffingCost",
  "facilityCost",
  "opex",
  "totalExpenses",
  "netIncome",
  "netMargin",
  "dscr",
  "staffingPctOfRevenue",
  "cashPosition",
];

const SCALAR_FIELDS: Array<keyof GoldenSnapshot> = [
  "cashRunwayMonths",
  "reserveMonths",
  "breakEvenYear",
];

function describeGoldenSnapshot(label: string, fixture: TestModelPayload, expected: GoldenSnapshot) {
  describe(`golden snapshot: ${label}`, () => {
    const m = computeBaseFinancials(toFullModelData(fixture));

    for (const field of ARRAY_FIELDS) {
      const expectedArr = expected[field] as number[];
      const actualArr = m[field as keyof typeof m] as number[];

      it(`${field} matches snapshot (length 5)`, () => {
        expect(actualArr).toHaveLength(5);
      });

      for (let y = 0; y < 5; y++) {
        it(`Y${y + 1} ${field} matches snapshot`, () => {
          expect(actualArr[y]).toBeCloseTo(expectedArr[y], 6);
        });
      }
    }

    for (const field of SCALAR_FIELDS) {
      it(`${field} matches snapshot`, () => {
        const actual = m[field as keyof typeof m] as number | null;
        const exp = expected[field] as number | null;
        if (exp === null) {
          expect(actual).toBeNull();
        } else {
          expect(actual as number).toBeCloseTo(exp, 6);
        }
      });
    }

    const expectedDS = expected.loanDebtService;
    if (expectedDS !== null) {
      for (let y = 0; y < 5; y++) {
        it(`Y${y + 1} loanDebtService matches snapshot`, () => {
          expect(m.loanDebtService).toBeDefined();
          expect((m.loanDebtService as number[])[y]).toBeCloseTo(expectedDS[y], 6);
        });
      }
    }
  });
}

describeGoldenSnapshot("microschool", microschoolFixture, golden.microschool);
describeGoldenSnapshot("private school", privateSchoolFixture, golden.privateSchool);
describeGoldenSnapshot("charter school", charterFixture, golden.charter);
describeGoldenSnapshot("driver coverage", driverCoverageFixture, golden.driverCoverage);

describe("golden snapshot: charter loan PMT exactness", () => {
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

describe("golden snapshot: computeBaseFinancials output shape", () => {
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
 * driver type and asserts the engine of record applies the driver
 * multiplier (rather than silently returning the raw amount, as the
 * removed shadow engine did for `per_fte` for a long time before anyone
 * noticed). The tests are deliberately structured so the failure mode is
 * "engine returned the raw amount", which is the exact drift class we
 * want to catch in the real engine going forward.
 *
 * Multipliers are chosen so raw vs. driven differ by far more than
 * floating-point noise — e.g. 10 students or 12 months — making "engine
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

function feOnly(fixture: TestModelPayload) {
  return computeBaseFinancials(toFullModelData(fixture));
}

function feExpenses(fe: ReturnType<typeof computeBaseFinancials>, y = 0): number {
  return fe.opex[y] + fe.facilityCost[y];
}

describe("driver guard: revenue drivers are not silently dropped", () => {
  it("per_student: engine multiplies by enrollment (not raw amount)", () => {
    const raw = 100;
    const fixture = withRevenueRow({
      id: "r1", category: "tuition_and_fees", lineItem: "T",
      enabled: true, driverType: "per_student", amounts: [raw, raw, raw, raw, raw],
    });
    const fe = feOnly(fixture);
    // 10 students × $100 = $1000 — must NOT equal $100 (raw)
    expect(fe.revenue[0]).toBe(1000);
    expect(fe.revenue[0]).not.toBe(raw);
  });

  it("monthly: engine multiplies by 12 (not raw amount)", () => {
    const raw = 200;
    const fixture = withRevenueRow({
      id: "r1", category: "other_revenue", lineItem: "M",
      enabled: true, driverType: "monthly", amounts: [raw, raw, raw, raw, raw],
    });
    const fe = feOnly(fixture);
    expect(fe.revenue[0]).toBe(2400);
    expect(fe.revenue[0]).not.toBe(raw);
  });

  it("annual_fixed: engine returns raw amount (driver is identity)", () => {
    const raw = 7500;
    const fixture = withRevenueRow({
      id: "r1", category: "philanthropy", lineItem: "G",
      enabled: true, driverType: "annual_fixed", amounts: [raw, raw, raw, raw, raw],
    });
    const fe = feOnly(fixture);
    expect(fe.revenue[0]).toBe(raw);
  });

  it("percent_of_base: engine applies pct to base (not raw)", () => {
    const m = makeMinimalModel();
    m.revenueRows = [
      { id: "r1", category: "tuition_and_fees", lineItem: "Tuition",
        enabled: true, driverType: "per_student", amounts: [1000, 1000, 1000, 1000, 1000] },
      { id: "r2", category: "tuition_offsets", lineItem: "Discount",
        enabled: true, driverType: "percent_of_base", amounts: [10, 10, 10, 10, 10], percentBase: "r1" },
    ];
    const fe = feOnly(m);
    // base = 10 × 1000 = 10000; discount = 10% × 10000 = 1000; net rev = 9000
    expect(fe.revenue[0]).toBe(9000);
    // If the engine silently treated percent_of_base as raw, it would compute
    // 10000 - 10 = 9990 (off by ~990).
    expect(fe.revenue[0]).not.toBe(9990);
  });
});

describe("driver guard: expense drivers are not silently dropped", () => {
  it("per_student: engine multiplies by enrollment (not raw)", () => {
    const raw = 100;
    const fixture = withExpenseRow({
      id: "e1", category: "instructional_program", lineItem: "X",
      enabled: true, driverType: "per_student", amounts: [raw, raw, raw, raw, raw],
    });
    const fe = feOnly(fixture);
    expect(feExpenses(fe)).toBe(1000);
    expect(feExpenses(fe)).not.toBe(raw);
  });

  it("monthly: engine multiplies by 12 (not raw)", () => {
    const raw = 500;
    const fixture = withExpenseRow({
      id: "e1", category: "occupancy_facility", lineItem: "Rent",
      enabled: true, driverType: "monthly", amounts: [raw, raw, raw, raw, raw],
    });
    const fe = feOnly(fixture);
    expect(feExpenses(fe)).toBe(6000);
    expect(feExpenses(fe)).not.toBe(raw);
  });

  it("annual_fixed: engine returns raw (driver is identity)", () => {
    const raw = 4321;
    const fixture = withExpenseRow({
      id: "e1", category: "administrative_general", lineItem: "F",
      enabled: true, driverType: "annual_fixed", amounts: [raw, raw, raw, raw, raw],
    });
    const fe = feOnly(fixture);
    expect(feExpenses(fe)).toBe(raw);
  });

  it("per_fte: engine multiplies by total FTE (not raw) — caught a real engine drift bug", () => {
    const raw = 1500;
    const fixture = withExpenseRow({
      id: "e1", category: "administrative_general", lineItem: "PD",
      enabled: true, driverType: "per_fte", amounts: [raw, raw, raw, raw, raw],
    }, /* withOneFte */ true);
    const feSingle = feOnly(fixture);
    // 1 FTE × $1500 = $1500. The key assertion: even with 1 FTE, the engine
    // must apply the multiplier (i.e. NOT silently fall through to
    // "annual_fixed = raw"). Strengthen with multiple FTEs:
    fixture.staffingRows.push({
      id: "s2", roleName: "T2", functionCategory: "instructional",
      employmentType: "full_time", fte: 3, annualizedRate: 0,
      benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false,
    });
    const feMulti = feOnly(fixture);
    // 4 FTE × $1500 = $6000 — must NOT equal $1500 (raw)
    expect(feExpenses(feMulti)).toBe(6000);
    expect(feExpenses(feMulti)).not.toBe(raw);
    // Also keep the original 1-FTE result in scope so the assertion above still ran.
    expect(feExpenses(feSingle)).toBe(1500);
  });

  it("percent_of_revenue: engine applies pct to revenue (not raw pct)", () => {
    const m = makeMinimalModel();
    m.revenueRows = [
      { id: "r1", category: "philanthropy", lineItem: "G",
        enabled: true, driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
    ];
    m.expenseRows = [
      { id: "e1", category: "administrative_general", lineItem: "Mgmt Fee",
        enabled: true, driverType: "percent_of_revenue", amounts: [5, 5, 5, 5, 5] },
    ];
    const fe = feOnly(m);
    // 5% × $100,000 = $5,000 — must NOT equal $5 (raw pct as dollars)
    expect(feExpenses(fe)).toBe(5000);
    expect(feExpenses(fe)).not.toBe(5);
  });

  it("per_new_student: engine multiplies by new students (not raw)", () => {
    const raw = 200;
    const fixture = withExpenseRow({
      id: "e1", category: "administrative_general", lineItem: "Onboard",
      enabled: true, driverType: "per_new_student", amounts: [raw, raw, raw, raw, raw],
    });
    const fe = feOnly(fixture);
    // Y1: all 10 students are new → 10 × $200 = $2000
    expect(feExpenses(fe, 0)).toBe(2000);
    expect(feExpenses(fe, 0)).not.toBe(raw);
    // Y2: enrollment=15, returning=round(10×0.8)=8, new=15-8=7 → 7×$200 = $1400
    expect(feExpenses(fe, 1)).toBe(1400);
    expect(feExpenses(fe, 1)).not.toBe(raw);
  });

  it("per_returning_student: engine multiplies by returning students (not raw, not all students)", () => {
    const raw = 100;
    const fixture = withExpenseRow({
      id: "e1", category: "administrative_general", lineItem: "Retain",
      enabled: true, driverType: "per_returning_student", amounts: [raw, raw, raw, raw, raw],
    });
    const fe = feOnly(fixture);
    // Y1: 0 returning → $0 (must NOT silently use enrollment=10 → $1000)
    expect(feExpenses(fe, 0)).toBe(0);
    expect(feExpenses(fe, 0)).not.toBe(raw);
    expect(feExpenses(fe, 0)).not.toBe(1000);
    // Y2: returning = min(15, round(10×0.8)) = 8 → 8 × $100 = $800
    expect(feExpenses(fe, 1)).toBe(800);
    expect(feExpenses(fe, 1)).not.toBe(raw);
  });
});

describe("driver guard: capital & debt drivers are not silently dropped", () => {
  it("non-loan annual_fixed: engine returns raw amount", () => {
    const raw = 6000;
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "FF&E", enabled: true,
      driverType: "annual_fixed", amounts: [raw, raw, raw, raw, raw], isLoan: false,
    });
    const fe = feOnly(fixture);
    // Net income: 0 revenue - 0 personnel - 0 expense - 6000 capDebt
    expect(fe.netIncome[0]).toBeCloseTo(-raw, 0);
  });

  it("non-loan monthly: engine multiplies by 12 (not raw)", () => {
    const raw = 250;
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "Lease", enabled: true,
      driverType: "monthly", amounts: [raw, raw, raw, raw, raw], isLoan: false,
    });
    const fe = feOnly(fixture);
    expect(fe.netIncome[0]).toBeCloseTo(-3000, 0);
    expect(fe.netIncome[0]).not.toBe(-raw);
  });

  it("non-loan per_student: engine multiplies by enrollment (not raw)", () => {
    const raw = 100;
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "Tech", enabled: true,
      driverType: "per_student", amounts: [raw, raw, raw, raw, raw], isLoan: false,
    });
    const fe = feOnly(fixture);
    expect(fe.netIncome[0]).toBeCloseTo(-1000, 0);
    expect(fe.netIncome[0]).not.toBe(-raw);
  });

  it("loan PMT: engine applies amortization (not raw amount=0)", () => {
    const principal = 60000;
    const rate = 6;
    const term = 5;
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "Loan", enabled: true,
      driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true,
      loanPrincipal: principal, loanRate: rate, loanTermYears: term,
    });
    const fe = feOnly(fixture);
    // PMT formula: monthly = P*r/(1-(1+r)^-n), annual = monthly*12
    const mr = rate / 100 / 12;
    const n = term * 12;
    const annualPmt = (principal * mr) / (1 - Math.pow(1 + mr, -n)) * 12;
    expect(fe.loanDebtService?.[0] ?? 0).toBeGreaterThan(0);
    expect(Math.abs((fe.loanDebtService?.[0] ?? 0) - annualPmt)).toBeLessThan(1);
  });

  it("loan amortization stops after term ends", () => {
    const fixture = withCapDebtRow({
      id: "cd1", lineItem: "Short Loan", enabled: true,
      driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true,
      loanPrincipal: 10000, loanRate: 5, loanTermYears: 3,
    });
    const fe = feOnly(fixture);
    expect(fe.loanDebtService?.[0]).toBeGreaterThan(0);
    expect(fe.loanDebtService?.[1]).toBeGreaterThan(0);
    expect(fe.loanDebtService?.[2]).toBeGreaterThan(0);
    expect(fe.loanDebtService?.[3]).toBe(0);
    expect(fe.loanDebtService?.[4]).toBe(0);
  });
});
