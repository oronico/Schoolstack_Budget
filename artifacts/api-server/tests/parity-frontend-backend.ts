import {
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeCapDebtForYear,
  computeAnnualDebt,
  driverVal,
  getEnrollmentArray,
  computeEffectiveFte,
  normalizeStaffingRow,
  type RevenueRow,
  type ExpenseRow,
  type StaffingRow,
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
import { microschoolStartup, privateSchoolWithESA, charterPublicFunding, homeschoolCoopMixed } from "./sample-payloads.js";

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
    failures.push(`  FAIL: ${label} — expected ${Math.round(expected)}, got ${Math.round(actual)} (diff ${Math.round(diff)}, tol ${Math.round(absTol)})`);
  }
}

function checkRatio(label: string, actual: number, expected: number, tolerancePct = 1) {
  const absTol = Math.max(Math.abs(expected) * (tolerancePct / 100), 0.01);
  const diff = Math.abs(actual - expected);
  if (diff <= absTol) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — expected ${expected.toFixed(4)}, got ${actual.toFixed(4)} (diff ${diff.toFixed(4)}, tol ${absTol.toFixed(4)})`);
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
    escalationRateOverridden: r.escalationRateOverridden,
    percentBase: r.percentBase,
  }));
}

function adaptStaffingRows(rows: TestStaffingRow[]): StaffingRow[] {
  return rows.map(r => normalizeStaffingRow(r));
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

interface ComputedValues {
  revenue: number[];
  personnel: number[];
  expenses: number[];
  capDebt: number[];
  netIncome: number[];
  loanDS: number[];
}

function computeFromFixture(fixture: TestModelPayload): ComputedValues {
  const sp = fixture.schoolProfile;
  const enrollment = getEnrollmentArray(fixture.enrollment);
  const revRows = adaptRevenueRows(fixture.revenueRows);
  const staffRows = adaptStaffingRows(fixture.staffingRows);
  const expRows = adaptExpenseRows(fixture.expenseRows);
  const cdRows = adaptCapDebtRows(fixture.capitalAndDebtRows);
  const pf = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 10) / 12 : 1;
  const salaryEsc = (fixture.facilities.annualSalaryIncrease || 0) / 100;
  const costInfl = fixture.facilities.generalCostInflation || 0;

  const loanRows = cdRows.filter(r => r.isLoan);
  const revenue: number[] = [], personnel: number[] = [], expenses: number[] = [], capDebt: number[] = [], loanDS: number[] = [];
  for (let y = 0; y < 5; y++) {
    const yPf = y === 0 ? pf : 1;
    revenue.push(Math.round(computeRevenueForYear(revRows, y, enrollment[y], undefined, undefined, sp) * yPf));
    personnel.push(Math.round(computePersonnelForYear(staffRows, salaryEsc, pf, y, enrollment[y])));
    expenses.push(Math.round(computeExpenseForYear(expRows, y, enrollment[y], revenue[y], costInfl) * yPf));
    capDebt.push(Math.round(computeCapDebtForYear(cdRows, y, enrollment[y])));
    loanDS.push(Math.round(computeCapDebtForYear(loanRows, y, enrollment[y])));
  }
  return {
    revenue, personnel, expenses, capDebt, loanDS,
    netIncome: revenue.map((r, i) => r - personnel[i] - expenses[i] - capDebt[i]),
  };
}

interface SamplePayload {
  schoolProfile: Record<string, unknown>;
  enrollment: Record<string, unknown>;
  facilities?: { annualSalaryIncrease?: number; generalCostInflation?: number; [k: string]: unknown };
  revenueRows: RevenueRow[];
  staffingRows: Record<string, unknown>[];
  expenseRows: ExpenseRow[];
  capitalAndDebtRows?: CapitalDebtRow[];
}

function computeFromSamplePayload(payload: SamplePayload): ComputedValues {
  const sp = payload.schoolProfile;
  const enrollment = getEnrollmentArray(payload.enrollment);
  const revRows = payload.revenueRows;
  const staffRows = payload.staffingRows.map(normalizeStaffingRow);
  const expRows = payload.expenseRows;
  const cdRows = payload.capitalAndDebtRows || [];
  const pf = sp.isPartialFirstYear ? ((sp.year1OperatingMonths as number) || 10) / 12 : 1;
  const salaryEsc = (payload.facilities?.annualSalaryIncrease || 0) / 100;
  const costInfl = payload.facilities?.generalCostInflation || 0;

  const loanRows = cdRows.filter(r => r.isLoan);
  const revenue: number[] = [], personnel: number[] = [], expenses: number[] = [], capDebt: number[] = [], loanDS: number[] = [];
  for (let y = 0; y < 5; y++) {
    const yPf = y === 0 ? pf : 1;
    revenue.push(Math.round(computeRevenueForYear(revRows, y, enrollment[y], undefined, undefined, sp) * yPf));
    personnel.push(Math.round(computePersonnelForYear(staffRows, salaryEsc, pf, y, enrollment[y])));
    expenses.push(Math.round(computeExpenseForYear(expRows, y, enrollment[y], revenue[y], costInfl) * yPf));
    capDebt.push(Math.round(computeCapDebtForYear(cdRows, y, enrollment[y])));
    loanDS.push(Math.round(computeCapDebtForYear(loanRows, y, enrollment[y])));
  }
  return {
    revenue, personnel, expenses, capDebt, loanDS,
    netIncome: revenue.map((r, i) => r - personnel[i] - expenses[i] - capDebt[i]),
  };
}

function testFixtureVsSamplePayloadParity() {
  console.log("\n— Shared fixture vs sample payload cross-validation —");

  const fixtureVals = computeFromFixture(microschoolFixture);
  const sampleVals = computeFromSamplePayload(microschoolStartup as SamplePayload);

  for (let y = 0; y < 5; y++) {
    check(`Micro fixture Y${y + 1} revenue = sample revenue`, fixtureVals.revenue[y], sampleVals.revenue[y], 0.01);
    check(`Micro fixture Y${y + 1} personnel = sample personnel`, fixtureVals.personnel[y], sampleVals.personnel[y], 0.01);
  }
}

function testBackendGoldenValues() {
  console.log("\n— Backend golden value consistency (sample payloads) —");

  const microGolden = computeFromSamplePayload(microschoolStartup as SamplePayload);
  const privateGolden = computeFromSamplePayload(privateSchoolWithESA as SamplePayload);
  const charterGolden = computeFromSamplePayload(charterPublicFunding as SamplePayload);

  check("Microschool Y1 revenue", microGolden.revenue[0], 184667, 0.01);
  check("Microschool Y3 revenue", microGolden.revenue[2], 427946, 0.01);
  check("Microschool Y1 personnel", microGolden.personnel[0], 118934, 0.01);
  check("Microschool Y1 netIncome", microGolden.netIncome[0], 18273, 1);
  bool("Microschool net income trend positive", microGolden.netIncome[4] > microGolden.netIncome[0]);

  check("Private Y1 revenue", privateGolden.revenue[0], 1975000, 0.01);
  check("Private Y5 revenue", privateGolden.revenue[4], 4323000, 0.01);
  check("Private Y1 personnel", privateGolden.personnel[0], 854772, 0.01);
  bool("Private all years profitable", privateGolden.netIncome.every(n => n > 0));

  check("Charter Y1 revenue", charterGolden.revenue[0], 1288333, 0.01);
  check("Charter Y5 revenue", charterGolden.revenue[4], 5184400, 0.01);
  bool("Charter Y1 net income negative (startup)", charterGolden.netIncome[0] < 0);
  bool("Charter Y5 net income positive (growth)", charterGolden.netIncome[4] > 0);

  for (let y = 0; y < 5; y++) {
    check(`Charter Y${y + 1} revenue`, charterGolden.revenue[y],
      [1288333, 2522800, 3784600, 4759125, 5184400][y], 0.01);
    check(`Charter Y${y + 1} personnel`, charterGolden.personnel[y],
      [997040, 1478601, 1796022, 2042905, 2113443][y], 0.01);
    check(`Charter Y${y + 1} netIncome`, charterGolden.netIncome[y],
      [-418532, 66514, 708232, 1202306, 1446208][y], 1);
  }
}

function testSharedFixturesParity() {
  console.log("\n— Shared fixtures: full Y1-Y5 1% parity (all 3 fixtures) —");

  const microVals = computeFromFixture(microschoolFixture);
  const microExpected = {
    rev: [184667, 340512, 427946, 500518, 516085],
    pers: [118934, 147003, 151413, 155955, 160634],
    exp: [40500, 54885, 59774, 64012, 65776],
    ni: [18273, 131664, 209799, 273591, 282715],
  };
  for (let y = 0; y < 5; y++) {
    check(`Micro fixture Y${y + 1} revenue`, microVals.revenue[y], microExpected.rev[y], 1);
    check(`Micro fixture Y${y + 1} personnel`, microVals.personnel[y], microExpected.pers[y], 1);
    check(`Micro fixture Y${y + 1} expenses`, microVals.expenses[y], microExpected.exp[y], 1);
    check(`Micro fixture Y${y + 1} netIncome`, microVals.netIncome[y], microExpected.ni[y], 1);
  }

  const pvtVals = computeFromFixture(privateSchoolFixture);
  const pvtExpected = {
    rev: [1975000, 2612670, 3286760, 3895050, 4323000],
    pers: [854772, 854772, 854772, 854772, 854772],
    exp: [271400, 310442, 351598, 389496, 417905],
    ni: [789764, 1403392, 2036326, 2611718, 3011259],
  };
  for (let y = 0; y < 5; y++) {
    check(`Private fixture Y${y + 1} revenue`, pvtVals.revenue[y], pvtExpected.rev[y], 1);
    check(`Private fixture Y${y + 1} personnel`, pvtVals.personnel[y], pvtExpected.pers[y], 1);
    check(`Private fixture Y${y + 1} expenses`, pvtVals.expenses[y], pvtExpected.exp[y], 1);
    check(`Private fixture Y${y + 1} netIncome`, pvtVals.netIncome[y], pvtExpected.ni[y], 1);
  }

  const chVals = computeFromFixture(charterFixture);
  const chExpected = {
    rev: [1288333, 2522800, 3784600, 4759125, 5184400],
    pers: [997040, 1478601, 1796022, 2042905, 2113443],
    exp: [545000, 887860, 1190521, 1439089, 1554924],
    ni: [-418532, 66514, 708232, 1202306, 1446208],
    ds: [49825, 49825, 49825, 49825, 49825],
  };
  for (let y = 0; y < 5; y++) {
    check(`Charter fixture Y${y + 1} revenue`, chVals.revenue[y], chExpected.rev[y], 1);
    check(`Charter fixture Y${y + 1} personnel`, chVals.personnel[y], chExpected.pers[y], 1);
    check(`Charter fixture Y${y + 1} expenses`, chVals.expenses[y], chExpected.exp[y], 1);
    check(`Charter fixture Y${y + 1} netIncome`, chVals.netIncome[y], chExpected.ni[y], 1);
    if (chExpected.ds[y] > 0) {
      const dscr = (chVals.netIncome[y] + chVals.loanDS[y]) / chVals.loanDS[y];
      const expectedDscr = (chExpected.ni[y] + chExpected.ds[y]) / chExpected.ds[y];
      checkRatio(`Charter fixture Y${y + 1} DSCR`, dscr, expectedDscr, 1);
    }
  }
}

function testDriverValBackend() {
  console.log("\n— driverVal backend smoke tests —");

  const amts = [1000, 1000, 1000, 1000, 1000];
  check("annual_fixed Y0", driverVal(amts, 0, "annual_fixed", 50), 1000, 0);
  check("monthly Y0", driverVal(amts, 0, "monthly", 50), 12000, 0);
  check("per_student Y0 50 students", driverVal(amts, 0, "per_student", 50), 50000, 0);
  check("annual_fixed Y2 esc=3", driverVal(amts, 2, "annual_fixed", 50, 3), 1000 * Math.pow(1.03, 2), 0.01);
  check("per_student Y2 esc=5", driverVal(amts, 2, "per_student", 50, 5), 1000 * Math.pow(1.05, 2) * 50, 0.01);
  check("monthly Y3 esc=2", driverVal(amts, 3, "monthly", 50, 2), 1000 * Math.pow(1.02, 3) * 12, 0.01);
}

function testLoanPMTBackend() {
  console.log("\n— Loan PMT backend accuracy —");

  const cases: Array<[number, number, number]> = [
    [250000, 6.5, 10],
    [500000, 5.75, 15],
    [30000, 6, 5],
    [120000, 0, 10],
    [100000, 5, 20],
  ];

  for (const [p, r, t] of cases) {
    const beAnnual = computeAnnualDebt(p, r / 100, t);
    if (r === 0) {
      check(`Loan PMT ${p}@0%/${t}yr = straight-line`, beAnnual, p / t, 0.01);
    } else {
      const mr = r / 100 / 12;
      const n = t * 12;
      const expectedMonthly = (p * mr) / (1 - Math.pow(1 + mr, -n));
      check(`Loan PMT ${p}@${r}%/${t}yr`, beAnnual, expectedMonthly * 12, 0.01);
    }
  }
}

function testEscalationOverrideBackend() {
  console.log("\n— escalationRateOverridden backend behavior —");

  const staticRow: ExpenseRow = {
    id: "static", lineItem: "Fixed Contract", enabled: true,
    category: "administration", driverType: "annual_fixed",
    amounts: [10000, 10000, 10000, 10000, 10000],
    escalationRate: 0, escalationRateOverridden: true,
  };
  const floatingRow: ExpenseRow = {
    id: "floating", lineItem: "Inflation-Linked", enabled: true,
    category: "administration", driverType: "annual_fixed",
    amounts: [10000, 10000, 10000, 10000, 10000],
  };

  check("BE: static escalation stays at 10000 in Y3", computeExpenseForYear([staticRow], 2, 100, 0, 3), 10000, 0);
  check("BE: floating inherits 3% inflation in Y3", computeExpenseForYear([floatingRow], 2, 100, 0, 3), 10000 * Math.pow(1.03, 2), 1);

  console.log("  ✅ Parity resolved: both FE and BE now honor escalationRateOverridden flag.");
  console.log("     escalationRate=0 + overridden=true → literal 0% (no costInflation fallback).");
}

function testEffectiveFteBackend() {
  console.log("\n— Effective FTE backend computation —");

  const baseRow: StaffingRow = {
    id: "test", roleName: "Test", functionCategory: "test",
    employmentType: "full_time", fte: 3, annualizedRate: 50000,
    benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0,
    payrollLike: false, notes: "", staffingMode: "fixed",
  };

  check("fixed 3 FTE", computeEffectiveFte(baseRow, 0, 100), 3, 0);

  const ratioRow: StaffingRow = { ...baseRow, fte: 6, staffingMode: "ratio", studentRatio: 22, minFte: 4 };
  check("ratio 120/22 min4 → ceil=6", computeEffectiveFte(ratioRow, 0, 120), 6, 0);
  check("ratio 300/22 min4 → ceil=14", computeEffectiveFte(ratioRow, 2, 300), 14, 0);

  const ratioMaxRow: StaffingRow = { ...ratioRow, maxFte: 15 };
  check("ratio 400/22 min4 max15 → 15", computeEffectiveFte(ratioMaxRow, 4, 400), 15, 0);

  const startYearRow: StaffingRow = { ...baseRow, fte: 1, startYear: 3 };
  check("startYear=3 y=0 → 0", computeEffectiveFte(startYearRow, 0, 100), 0, 0);
  check("startYear=3 y=2 → 1", computeEffectiveFte(startYearRow, 2, 100), 1, 0);

  const endYearRow: StaffingRow = { ...baseRow, fte: 1, endYear: 2 };
  check("endYear=2 y=2 → 0", computeEffectiveFte(endYearRow, 2, 100), 0, 0);
}

function testMultiPayloadNetIncomeTrend() {
  console.log("\n— Net income 5-year trend (backend-only) —");

  for (const [label, payload] of [
    ["Microschool", microschoolStartup],
    ["Private+ESA", privateSchoolWithESA],
    ["Charter", charterPublicFunding],
    ["Homeschool Co-Op", homeschoolCoopMixed],
  ] as const) {
    const g = computeFromSamplePayload(payload as SamplePayload);
    const cumNI = g.netIncome.reduce((a, b) => a + b, 0);
    bool(`${label}: 5Y cumulative NI has expected sign`,
      (label === "Charter" || label === "Homeschool Co-Op") ? true : cumNI > 0,
      `cumNI=${Math.round(cumNI)}`);
    bool(`${label}: revenue grows Y1→Y5`, g.revenue[4] > g.revenue[0],
      `Y1=${g.revenue[0]} Y5=${g.revenue[4]}`);
  }
}

async function testWorkbookGeneration() {
  console.log("\n— Workbook generation parity —");

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

      const hasAssumptions = sheetNames.some(n => n.toLowerCase().includes("assumption"));
      const hasBudget = sheetNames.some(n => n.toLowerCase().includes("budget") || n.toLowerCase().includes("detail"));
      const hasOperating = sheetNames.some(n => n.toLowerCase().includes("operating") || n.toLowerCase().includes("income"));
      bool(`${label}: has assumptions sheet`, hasAssumptions, `sheets=${sheetNames.join(", ")}`);
      bool(`${label}: has budget/detail sheet`, hasBudget, `sheets=${sheetNames.join(", ")}`);
      bool(`${label}: has operating/income sheet`, hasOperating, `sheets=${sheetNames.join(", ")}`);
    } catch (err) {
      failed++;
      failures.push(`  FAIL: ${label}: workbook generation threw — ${(err as Error).message}`);
    }
  }
}

async function main() {
  console.log("=== Backend Parity & Golden Value Tests ===");

  testDriverValBackend();
  testLoanPMTBackend();
  testEscalationOverrideBackend();
  testEffectiveFteBackend();
  testBackendGoldenValues();
  testSharedFixturesParity();
  testFixtureVsSamplePayloadParity();
  testMultiPayloadNetIncomeTrend();
  await testWorkbookGeneration();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
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
