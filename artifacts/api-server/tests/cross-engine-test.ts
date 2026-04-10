import { computeBaseFinancials } from "../../school-financial-model/src/lib/scenario-engine.js";
import {
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeCapDebtForYear,
  getEnrollmentArray,
  normalizeStaffingRow,
  type RevenueRow,
  type ExpenseRow,
  type CapitalDebtRow,
} from "../src/lib/workbook-helpers.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  type TestModelPayload,
  type TestRevenueRow,
  type TestStaffingRow,
  type TestExpenseRow,
  type TestCapDebtRow,
} from "@workspace/finance";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: number, expected: number, tolerancePct = 1) {
  const absTol = Math.max(Math.abs(expected) * (tolerancePct / 100), 5);
  const diff = Math.abs(actual - expected);
  if (diff <= absTol) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — FE=${Math.round(actual)}, BE=${Math.round(expected)}, diff=${Math.round(diff)}, tol=${Math.round(absTol)}`);
  }
}

function bool(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; }
  else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function adaptRevenueRows(rows: TestRevenueRow[]): RevenueRow[] {
  return rows.map(r => ({
    id: r.id, category: r.category, lineItem: r.lineItem,
    enabled: r.enabled, driverType: r.driverType, amounts: r.amounts,
    billingMonths: r.billingMonths, escalationRate: r.escalationRate,
    escalationRateOverridden: r.escalationRateOverridden, percentBase: r.percentBase,
  }));
}

function adaptExpenseRows(rows: TestExpenseRow[]): ExpenseRow[] {
  return rows.map(r => ({
    id: r.id, category: r.category, lineItem: r.lineItem,
    enabled: r.enabled, driverType: r.driverType, amounts: r.amounts,
    escalationRate: r.escalationRate, escalationRateOverridden: r.escalationRateOverridden,
  }));
}

function adaptCapDebtRows(rows: TestCapDebtRow[]): CapitalDebtRow[] {
  return rows.map(r => ({
    id: r.id, lineItem: r.lineItem, enabled: r.enabled,
    driverType: r.driverType, amounts: r.amounts, isLoan: r.isLoan,
    loanPrincipal: r.loanPrincipal, loanRate: r.loanRate,
    loanTermYears: r.loanTermYears, purpose: r.purpose,
  }));
}

function adaptStaffingRows(rows: TestStaffingRow[]) {
  return rows.map(r => normalizeStaffingRow(r));
}

interface DualEngineResult {
  feRevenue: number[];
  feStaffing: number[];
  feFacilityOpex: number[];
  feNetIncome: number[];
  feDscr: number[];
  feLoanDS: number[];
  beRevenue: number[];
  bePersonnel: number[];
  beExpenses: number[];
  beCapDebt: number[];
  beNetIncome: number[];
  beLoanDS: number[];
}

function runDualEngine(fixture: TestModelPayload): DualEngineResult {
  const feMetrics = computeBaseFinancials(fixture as Parameters<typeof computeBaseFinancials>[0]);

  const sp = fixture.schoolProfile;
  const enrollment = getEnrollmentArray(fixture.enrollment);
  const revRows = adaptRevenueRows(fixture.revenueRows);
  const staffRows = adaptStaffingRows(fixture.staffingRows);
  const expRows = adaptExpenseRows(fixture.expenseRows);
  const cdRows = adaptCapDebtRows(fixture.capitalAndDebtRows);
  const loanRows = cdRows.filter(r => r.isLoan);
  const pf = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 10) / 12 : 1;
  const salaryEsc = (fixture.facilities.annualSalaryIncrease || 0) / 100;
  const costInfl = fixture.facilities.generalCostInflation || 0;

  const beRevenue: number[] = [], bePersonnel: number[] = [], beExpenses: number[] = [];
  const beCapDebt: number[] = [], beLoanDS: number[] = [];
  for (let y = 0; y < 5; y++) {
    const yPf = y === 0 ? pf : 1;
    const rev = Math.round(computeRevenueForYear(revRows, y, enrollment[y], undefined, undefined, sp) * yPf);
    beRevenue.push(rev);
    bePersonnel.push(Math.round(computePersonnelForYear(staffRows, salaryEsc, pf, y, enrollment[y])));
    beExpenses.push(Math.round(computeExpenseForYear(expRows, y, enrollment[y], rev, costInfl) * yPf));
    beCapDebt.push(Math.round(computeCapDebtForYear(cdRows, y, enrollment[y])));
    beLoanDS.push(Math.round(computeCapDebtForYear(loanRows, y, enrollment[y])));
  }
  const beNetIncome = beRevenue.map((r, i) => r - bePersonnel[i] - beExpenses[i] - beCapDebt[i]);

  return {
    feRevenue: feMetrics.revenue,
    feStaffing: feMetrics.staffingCost,
    feFacilityOpex: feMetrics.facilityCost.map((f, i) => f + feMetrics.opex[i]),
    feNetIncome: feMetrics.netIncome,
    feDscr: feMetrics.dscr,
    feLoanDS: feMetrics.loanDebtService || [0, 0, 0, 0, 0],
    beRevenue, bePersonnel, beExpenses, beCapDebt, beNetIncome, beLoanDS,
  };
}

function testCrossEngineParity(label: string, fixture: TestModelPayload) {
  console.log(`\n— Cross-engine parity: ${label} (FE computeBaseFinancials vs BE workbook-helpers) —`);
  const d = runDualEngine(fixture);

  for (let y = 0; y < 5; y++) {
    check(`${label} Y${y + 1} revenue`, d.feRevenue[y], d.beRevenue[y], 1);
    check(`${label} Y${y + 1} staffing`, d.feStaffing[y], d.bePersonnel[y], 1);
    check(`${label} Y${y + 1} expenses`, d.feFacilityOpex[y], d.beExpenses[y], 1);
    check(`${label} Y${y + 1} net income`, d.feNetIncome[y], d.beNetIncome[y], 1);

    if (d.beLoanDS[y] > 0) {
      const beDscr = (d.beNetIncome[y] + d.beLoanDS[y]) / d.beLoanDS[y];
      check(`${label} Y${y + 1} DSCR`, d.feDscr[y], Math.round(beDscr * 100) / 100, 1);
    }
  }
}

async function testWorkbookGeneration() {
  console.log("\n— Workbook generation (all 3 fixtures) —");

  for (const [label, fixture] of [
    ["Microschool", microschoolFixture],
    ["Private", privateSchoolFixture],
    ["Charter", charterFixture],
  ] as const) {
    try {
      const wb = await generateUnderwritingWorkbook(fixture as Record<string, unknown>);
      bool(`${label}: workbook generated without error`, true);

      const sheetNames = wb.worksheets.map(ws => ws.name);
      bool(`${label}: has multiple sheets`, sheetNames.length >= 5,
        `sheetCount=${sheetNames.length}`);
      bool(`${label}: has assumptions sheet`,
        sheetNames.some(n => n.toLowerCase().includes("assumption")),
        `sheets=${sheetNames.join(", ")}`);
      bool(`${label}: has budget/detail sheet`,
        sheetNames.some(n => n.toLowerCase().includes("budget") || n.toLowerCase().includes("detail")),
        `sheets=${sheetNames.join(", ")}`);
      bool(`${label}: has operating/income sheet`,
        sheetNames.some(n => n.toLowerCase().includes("operating") || n.toLowerCase().includes("income")),
        `sheets=${sheetNames.join(", ")}`);
    } catch (err) {
      failed++;
      failures.push(`  FAIL: ${label}: workbook generation threw — ${(err as Error).message}`);
    }
  }
}

async function main() {
  console.log("=== Cross-Engine Parity Test ===");
  console.log("Frontend: computeBaseFinancials (scenario-engine.ts)");
  console.log("Backend:  computeRevenueForYear / computePersonnelForYear / computeExpenseForYear / computeCapDebtForYear (workbook-helpers.ts)");
  console.log("Tolerance: 1% or $5 absolute minimum");

  testCrossEngineParity("Microschool", microschoolFixture);
  testCrossEngineParity("Private School", privateSchoolFixture);
  testCrossEngineParity("Charter School", charterFixture);
  await testWorkbookGeneration();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
  }

  console.log("\n— Known parity gap —");
  console.log("escalationRateOverridden=true + escalationRate=0:");
  console.log("  Backend: treats as literally 0% escalation");
  console.log("  Frontend: falls back to costInflation (ignores override flag)");
  console.log("  Impact: Only affects expense rows with explicit 0% override; none in shared fixtures");

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
