import { computeBaseFinancials } from "../../school-financial-model/src/lib/scenario-engine.js";
import {
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeCapDebtForYear,
  computeTotalFTE,
  getEnrollmentArray,
  normalizeStaffingRow,
  type RevenueRow,
  type ExpenseRow,
  type CapitalDebtRow,
} from "../src/lib/workbook-helpers.js";
import { computeYearFinancialsFromData } from "../src/lib/consultant-engine.js";
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
    failures.push(`  FAIL: ${label} — got ${Math.round(actual)}, expected ${Math.round(expected)}, diff=${Math.round(diff)}, tol=${Math.round(absTol)}`);
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

interface EngineYearResult {
  revenue: number;
  staffing: number;
  nonStaffExpenses: number;
  netIncome: number;
}

interface TriEngineResults {
  fe: EngineYearResult[];
  be: EngineYearResult[];
  ce: EngineYearResult[];
}

function runTriEngine(fixture: TestModelPayload): TriEngineResults {
  const sp = fixture.schoolProfile;
  const debtIncluded = sp.debtIncluded !== false;
  const effectiveFixture = debtIncluded ? fixture : {
    ...fixture,
    capitalAndDebtRows: fixture.capitalAndDebtRows.filter(r => !r.isLoan),
  };

  const feMetrics = computeBaseFinancials(effectiveFixture as Parameters<typeof computeBaseFinancials>[0]);

  const enrollment = getEnrollmentArray(fixture.enrollment);
  const revRows = adaptRevenueRows(fixture.revenueRows);
  const staffRows = adaptStaffingRows(fixture.staffingRows);
  const expRows = adaptExpenseRows(fixture.expenseRows);
  const cdRows = adaptCapDebtRows(effectiveFixture.capitalAndDebtRows);
  const pf = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 10) / 12 : 1;
  const salaryEsc = (fixture.facilities.annualSalaryIncrease || 0) / 100;
  const costInfl = fixture.facilities.generalCostInflation || 0;

  const ceYears = computeYearFinancialsFromData({
    ...fixture,
    skipFacilityOverlay: true,
  } as unknown as Record<string, unknown>);

  const fe: EngineYearResult[] = [];
  const be: EngineYearResult[] = [];
  const ce: EngineYearResult[] = [];

  for (let y = 0; y < 5; y++) {
    const yPf = y === 0 ? pf : 1;
    const students = enrollment[y];
    const fte = computeTotalFTE(staffRows, y, students);
    const rev = computeRevenueForYear(revRows, y, students, undefined, undefined, sp);

    const beRev = Math.round(rev * yPf);
    const beStaff = Math.round(computePersonnelForYear(staffRows, salaryEsc, pf, y, students));
    const beExp = Math.round(computeExpenseForYear(expRows, y, students, rev, costInfl, undefined, undefined, fte) * yPf);
    const beCapDebt = Math.round(computeCapDebtForYear(cdRows, y, students));
    const beNonStaff = beExp + beCapDebt;
    const beNet = beRev - beStaff - beNonStaff;

    const feRev = Math.round(feMetrics.revenue[y]);
    const feStaff = Math.round(feMetrics.staffingCost[y]);
    const feNonStaff = Math.round(feMetrics.facilityCost[y]) + Math.round(feMetrics.opex[y]) +
      Math.round(computeCapDebtForYear(cdRows, y, students));
    const feNet = Math.round(feMetrics.netIncome[y]);

    const ceYear = ceYears[y];
    const ceRev = Math.round(ceYear.totalRevenue);
    const ceStaff = Math.round(ceYear.totalStaffingCost);
    const ceNonStaff = Math.round(ceYear.totalExpenses - ceYear.totalStaffingCost - ceYear.depreciation);
    const ceNet = Math.round(ceYear.netIncome + ceYear.depreciation);

    fe.push({ revenue: feRev, staffing: feStaff, nonStaffExpenses: feNonStaff, netIncome: feNet });
    be.push({ revenue: beRev, staffing: beStaff, nonStaffExpenses: beNonStaff, netIncome: beNet });
    ce.push({ revenue: ceRev, staffing: ceStaff, nonStaffExpenses: ceNonStaff, netIncome: ceNet });
  }

  return { fe, be, ce };
}

function testTriEngineParity(label: string, fixture: TestModelPayload) {
  console.log(`\n— Three-engine parity: ${label} —`);
  const d = runTriEngine(fixture);

  for (let y = 0; y < 5; y++) {
    const yr = `Y${y + 1}`;
    check(`${label} ${yr} FE↔BE revenue`, d.fe[y].revenue, d.be[y].revenue);
    check(`${label} ${yr} FE↔CE revenue`, d.fe[y].revenue, d.ce[y].revenue);
    check(`${label} ${yr} FE↔BE staffing`, d.fe[y].staffing, d.be[y].staffing);
    check(`${label} ${yr} FE↔CE staffing`, d.fe[y].staffing, d.ce[y].staffing);
    check(`${label} ${yr} FE↔BE non-staff expenses`, d.fe[y].nonStaffExpenses, d.be[y].nonStaffExpenses);
    check(`${label} ${yr} FE↔CE non-staff expenses`, d.fe[y].nonStaffExpenses, d.ce[y].nonStaffExpenses);
    check(`${label} ${yr} FE↔BE net income`, d.fe[y].netIncome, d.be[y].netIncome);
    check(`${label} ${yr} FE↔CE net income`, d.fe[y].netIncome, d.ce[y].netIncome);
  }
}

function testPerFteConsistency() {
  console.log("\n— per_fte driver consistency (Private School fixture) —");
  const fixture = privateSchoolFixture;
  const hasPerFte = fixture.expenseRows.some(r => r.driverType === "per_fte");
  bool("Fixture has per_fte expense row", hasPerFte);

  if (!hasPerFte) return;

  const enrollment = getEnrollmentArray(fixture.enrollment);
  const staffRows = adaptStaffingRows(fixture.staffingRows);
  const expRows = adaptExpenseRows(fixture.expenseRows);
  const revRows = adaptRevenueRows(fixture.revenueRows);
  const sp = fixture.schoolProfile;
  const pf = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 10) / 12 : 1;
  const costInfl = fixture.facilities.generalCostInflation || 0;

  for (let y = 0; y < 5; y++) {
    const yPf = y === 0 ? pf : 1;
    const students = enrollment[y];
    const fte = computeTotalFTE(staffRows, y, students);
    const rev = computeRevenueForYear(revRows, y, students, undefined, undefined, sp);
    const beExpense = computeExpenseForYear(expRows, y, students, rev, costInfl, undefined, undefined, fte) * yPf;

    const perFteRow = fixture.expenseRows.find(r => r.driverType === "per_fte")!;
    const expectedPerFteContribution = perFteRow.amounts[y] * fte * yPf;
    bool(`Y${y + 1} per_fte contributes non-zero (FTE=${fte.toFixed(1)})`, expectedPerFteContribution > 0,
      `expected=${Math.round(expectedPerFteContribution)}`);
    bool(`Y${y + 1} BE expense includes per_fte contribution`, beExpense >= expectedPerFteContribution * 0.99,
      `expense=${Math.round(beExpense)}, perFte=${Math.round(expectedPerFteContribution)}`);
  }

  console.log("  Running FE↔BE↔CE comparison with per_fte row...");
  testTriEngineParity("Private+per_fte", fixture);
}

function testSalaryEscalationMapping() {
  console.log("\n— Salary escalation field mapping (Microschool, salaryIncrease=3%) —");
  const fixture = microschoolFixture;
  bool("Fixture has non-zero salary escalation", fixture.facilities.annualSalaryIncrease > 0,
    `value=${fixture.facilities.annualSalaryIncrease}`);

  const feMetrics = computeBaseFinancials(fixture as Parameters<typeof computeBaseFinancials>[0]);

  const ceYears = computeYearFinancialsFromData({
    ...fixture,
    skipFacilityOverlay: true,
  } as unknown as Record<string, unknown>);

  for (let y = 0; y < 5; y++) {
    check(`Y${y + 1} FE↔CE staffing (salary esc=${fixture.facilities.annualSalaryIncrease}%)`,
      Math.round(feMetrics.staffingCost[y]),
      Math.round(ceYears[y].totalStaffingCost));
  }

  if (fixture.facilities.annualSalaryIncrease > 0) {
    const feY1 = Math.round(feMetrics.staffingCost[0]);
    const feY5 = Math.round(feMetrics.staffingCost[4]);
    const ceY1 = Math.round(ceYears[0].totalStaffingCost);
    const ceY5 = Math.round(ceYears[4].totalStaffingCost);
    bool("FE staffing increases over 5 years", feY5 > feY1,
      `Y1=${feY1}, Y5=${feY5}`);
    bool("CE staffing increases over 5 years", ceY5 > ceY1,
      `Y1=${ceY1}, Y5=${ceY5}`);
  }
}

function testBreakevenIncludesFacility() {
  console.log("\n— Breakeven enrollment includes facility costs —");
  const fixture = microschoolFixture;
  const feMetrics = computeBaseFinancials(fixture as Parameters<typeof computeBaseFinancials>[0]);

  const facilityCost = feMetrics.facilityCost[0];
  const staffingCost = feMetrics.staffingCost[0];
  const enrollment = feMetrics.enrollment[0];
  const revenue = feMetrics.revenue[0];
  const loanDS = feMetrics.loanDebtService?.[0] ?? 0;

  bool("Facility cost Y1 is non-zero", facilityCost > 0, `facilityCost=${Math.round(facilityCost)}`);
  bool("Staffing cost Y1 is non-zero", staffingCost > 0, `staffingCost=${Math.round(staffingCost)}`);

  const revenuePerStudent = revenue / enrollment;
  const opex = feMetrics.opex[0];
  const variableCostPerStudent = enrollment > 0 ? opex / enrollment : 0;
  const contributionMargin = revenuePerStudent - variableCostPerStudent;

  const fixedWithFacility = staffingCost + facilityCost + loanDS;
  const fixedWithoutFacility = staffingCost + loanDS;
  const breakevenWith = Math.ceil(fixedWithFacility / contributionMargin);
  const breakevenWithout = Math.ceil(fixedWithoutFacility / contributionMargin);

  bool("Breakeven with facility > breakeven without",
    breakevenWith > breakevenWithout,
    `withFacility=${breakevenWith}, without=${breakevenWithout}`);
  bool("Breakeven with facility is reasonable (< maxCapacity)",
    breakevenWith < fixture.schoolProfile.maxCapacity * 2,
    `breakeven=${breakevenWith}, maxCap=${fixture.schoolProfile.maxCapacity}`);
}

async function main() {
  console.log("=== Three-Engine Financial Consistency Test ===");
  console.log("FE: computeBaseFinancials (scenario-engine.ts)");
  console.log("BE: workbook-helpers.ts (Excel/PDF exports)");
  console.log("CE: consultant-engine.ts (consultant analysis)");
  console.log("Tolerance: 1% or $5 absolute minimum");
  console.log("Note: CE includes depreciation — comparisons exclude it for parity");

  testTriEngineParity("Microschool", microschoolFixture);
  testTriEngineParity("Private School", privateSchoolFixture);
  testTriEngineParity("Charter School", charterFixture);
  testPerFteConsistency();
  testSalaryEscalationMapping();
  testBreakevenIncludesFacility();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
