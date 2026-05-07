/**
 * Task #607 — DSCR regression test for scenario-engine.
 *
 * Pins the new DSCR math after the guest-debt fix in the capDebt loop:
 *   1. Non-loan capDebt rows whose `flatAnnualDebtService > 0` MUST flow
 *      into the DSCR denominator. Before the fix this was silently 0,
 *      hiding the real debt burden in lender packets.
 *   2. When BOTH an isLoan amortization AND a flat guest-debt service
 *      are present, BOTH amounts MUST be summed in the denominator.
 *
 * This is the regression guard the bug lacked when it shipped: any
 * future refactor of the capDebt loop that drops either branch will
 * trip these assertions.
 */
import { computeBaseFinancials } from "../scenario-engine.js";
import type { FullModelData } from "../model-shape.js";

const failures: string[] = [];
let passed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function approxEq(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Closed-form annual payment for a fully-amortizing loan, mirroring
 * the formula in scenario-engine.ts so the test asserts against the
 * engine's own arithmetic (not a hand-rounded constant that would
 * drift if the formula evolved).
 */
function annualLoanPayment(principal: number, ratePct: number, termYears: number): number {
  const rate = ratePct / 100;
  if (rate <= 0) return principal / termYears;
  const monthlyRate = rate / 12;
  const n = termYears * 12;
  const monthlyPmt = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
  return monthlyPmt * 12;
}

/**
 * Minimal model: 10 students × $1000 tuition = $10k revenue, no
 * staffing / facilities / opex. Net income = revenue − cdTotal so the
 * arithmetic stays trivial and the DSCR assertion is exact.
 */
function baseModel(): FullModelData {
  return {
    schoolProfile: { isPartialFirstYear: false },
    enrollment: { year1: 10, year2: 10, year3: 10, year4: 10, year5: 10, retentionRate: 100 },
    facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
    revenueRows: [
      {
        id: "r1",
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "per_student",
        amounts: [1000, 1000, 1000, 1000, 1000],
      },
    ],
    staffingRows: [],
    expenseRows: [],
    capitalAndDebtRows: [],
    openingBalances: { cash: 0 },
  };
}

// ─── Case 1: only non-loan capDebt rows w/ flatAnnualDebtService > 0 ───
{
  const flatDebt = 2000;
  const model = baseModel();
  model.capitalAndDebtRows = [
    {
      id: "guest1",
      lineItem: "Founder Personal Note",
      enabled: true,
      isLoan: false,
      driverType: "annual_fixed",
      amounts: [0, 0, 0, 0, 0],
      flatAnnualDebtService: flatDebt,
    },
  ];

  const m = computeBaseFinancials(model);

  // ni = revenue (10000) − cdTotal (0, because amounts=0 and flatDebt
  // does not flow into expenses). Engine: dscr = round((ni + flatDebt)/flatDebt * 100)/100.
  const expectedDscr = Math.round(((m.netIncome[0] + flatDebt) / flatDebt) * 100) / 100;

  check(
    "case1: flat guest-debt feeds loanDebtService (regression: was silently 0)",
    m.loanDebtService?.[0] === flatDebt,
    `loanDebtService[0]=${m.loanDebtService?.[0]} expected=${flatDebt}`
  );
  check(
    "case1: dscr[0] equals (ni + flatDebt) / flatDebt",
    m.dscr[0] === expectedDscr,
    `dscr[0]=${m.dscr[0]} expected=${expectedDscr}`
  );
  check(
    "case1: dscr[0] is non-zero (the actual symptom of the original bug)",
    m.dscr[0] !== 0,
    `dscr[0]=${m.dscr[0]}`
  );
}

// ─── Case 2: isLoan amortization AND flatAnnualDebtService both present ───
{
  const flatDebt = 2000;
  const principal = 10000;
  const ratePct = 6;
  const termYears = 5;
  const expectedAnnualPmt = annualLoanPayment(principal, ratePct, termYears);

  const model = baseModel();
  model.capitalAndDebtRows = [
    {
      id: "loan1",
      lineItem: "Equipment Loan",
      enabled: true,
      isLoan: true,
      driverType: "annual_fixed",
      amounts: [0, 0, 0, 0, 0],
      loanPrincipal: principal,
      loanRate: ratePct,
      loanTermYears: termYears,
    },
    {
      id: "guest1",
      lineItem: "Founder Personal Note",
      enabled: true,
      isLoan: false,
      driverType: "annual_fixed",
      amounts: [0, 0, 0, 0, 0],
      flatAnnualDebtService: flatDebt,
    },
  ];

  const m = computeBaseFinancials(model);
  const ds0 = m.loanDebtService?.[0] ?? 0;

  check(
    "case2: loanDebtService[0] sums amortization AND flat guest debt",
    approxEq(ds0, expectedAnnualPmt + flatDebt),
    `loanDebtService[0]=${ds0} expected≈${expectedAnnualPmt + flatDebt}`
  );
  check(
    "case2: loanDebtService[0] strictly larger than the flat-only amount",
    ds0 > flatDebt + 1,
    `loanDebtService[0]=${ds0} flatDebt=${flatDebt}`
  );
  // Mirror the engine's rounding to reconstruct the expected dscr.
  const expectedDscr = Math.round(((m.netIncome[0] + ds0) / ds0) * 100) / 100;
  check(
    "case2: dscr[0] denominator includes both contributions",
    m.dscr[0] === expectedDscr && m.dscr[0] !== 0,
    `dscr[0]=${m.dscr[0]} expected=${expectedDscr}`
  );
}

console.log(`\nscenario-engine DSCR: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
