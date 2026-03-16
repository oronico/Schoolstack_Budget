import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHASE2_DIR = path.join(__dirname, "..", "qa-output", "phase2");

interface CheckResult {
  name: string;
  passed: boolean;
  details: string[];
  errors: string[];
}

function check(name: string): CheckResult {
  return { name, passed: false, details: [], errors: [] };
}

function getFormulaResult(cell: ExcelJS.Cell): { formula: string | null; result: unknown } {
  const v = cell.value;
  if (v && typeof v === "object" && "formula" in v) {
    return { formula: (v as any).formula, result: (v as any).result };
  }
  return { formula: null, result: v };
}

function numVal(cell: ExcelJS.Cell): number {
  const { result } = getFormulaResult(cell);
  if (typeof result === "number") return result;
  if (typeof result === "string") {
    const n = parseFloat(result);
    if (!isNaN(n)) return n;
  }
  return 0;
}

function strVal(cell: ExcelJS.Cell): string {
  const { result } = getFormulaResult(cell);
  if (typeof result === "string") return result;
  if (result !== null && result !== undefined) return String(result);
  return "";
}

function computeAnnualDebtService(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (annualRate <= 0) return principal / termYears;
  const mr = annualRate / 12;
  const m = termYears * 12;
  return (principal * (mr * Math.pow(1 + mr, m)) / (Math.pow(1 + mr, m) - 1)) * 12;
}

function near(a: number, b: number, tol: number = 1): boolean {
  return Math.abs(a - b) <= tol;
}

function pctNear(a: number, b: number, tolPct: number = 0.01): boolean {
  if (a === 0 && b === 0) return true;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / denom <= tolPct;
}

async function validateWorkbook(filePath: string, inputPath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const name = path.basename(filePath, ".xlsx");

  const tabCheck = check(`${name}: Tab Structure`);
  const expectedTabs = ["Cover", "Assumptions", "Drivers", "5-Year P&L", "Cash Flow & DSCR", "Staffing", "Loan Snapshot", "Summary"];
  const actualTabs = wb.worksheets.map(ws => ws.name);
  tabCheck.details.push(`Expected: ${expectedTabs.join(", ")}`);
  tabCheck.details.push(`Actual: ${actualTabs.join(", ")}`);
  const missingTabs = expectedTabs.filter(t => !actualTabs.includes(t));
  if (missingTabs.length === 0) {
    tabCheck.passed = true;
  } else {
    tabCheck.errors.push(`Missing: ${missingTabs.join(", ")}`);
  }
  results.push(tabCheck);

  const assumptions = wb.getWorksheet("Assumptions")!;
  const assumptionCheck = check(`${name}: Assumptions Values`);
  const cellMap: Record<string, string> = {
    schoolName: "D5", state: "D6", schoolType: "D7", firstOperatingYear: "D8",
    enrollmentY1: "D12", enrollmentY2: "D13", enrollmentY3: "D14", enrollmentY4: "D15", enrollmentY5: "D16",
    tuitionPerStudentY1: "D20", tuitionGrowthPct: "D21",
    esaPerStudentY1: "D22", esaGrowthPct: "D23",
    otherEarnedPerStudentY1: "D24", otherEarnedGrowthPct: "D25",
    collectionRatePct: "D26", grantsY1: "D27", grantsGrowthPct: "D28",
    studentsPerTeacher: "D32", teacherSalaryY1: "D33", teacherSalaryGrowthPct: "D34",
    adminFteY1: "D35", adminFteY2: "D36", adminFteY3: "D37", adminFteY4: "D38", adminFteY5: "D39",
    adminSalaryY1: "D40", adminSalaryGrowthPct: "D41", benefitsBurdenPct: "D42",
    annualRentY1: "D46", rentGrowthPct: "D47",
    otherFacilityCostY1: "D48", otherFacilityCostGrowthPct: "D49",
    programCostPerStudentY1: "D50", programCostGrowthPct: "D51",
    fixedOperatingCostY1: "D52", fixedOperatingCostGrowthPct: "D53",
    startingCash: "D57", existingAnnualDebtService: "D58",
    proposedLoanAmount: "D59", interestRatePct: "D60", termYears: "D61",
  };

  let assumptionErrors = 0;
  for (const [key, cellRef] of Object.entries(cellMap)) {
    const expected = input[key];
    const cell = assumptions.getCell(cellRef);
    const actual = cell.value;
    if (typeof expected === "number") {
      if (typeof actual !== "number" || !near(actual, expected, 0.001)) {
        assumptionCheck.errors.push(`${cellRef} (${key}): expected=${expected}, actual=${actual}`);
        assumptionErrors++;
      }
    } else if (typeof expected === "string") {
      if (String(actual || "") !== expected) {
        assumptionCheck.errors.push(`${cellRef} (${key}): expected="${expected}", actual="${actual}"`);
        assumptionErrors++;
      }
    }
  }
  assumptionCheck.passed = assumptionErrors === 0;
  assumptionCheck.details.push(`Checked ${Object.keys(cellMap).length} cells, ${assumptionErrors} mismatches`);
  results.push(assumptionCheck);

  const n = (k: string) => Number(input[k]) || 0;
  const enrollment = [n("enrollmentY1"), n("enrollmentY2"), n("enrollmentY3"), n("enrollmentY4"), n("enrollmentY5")];
  const tuitionPerStudent = n("tuitionPerStudentY1");
  const tuitionGrowth = n("tuitionGrowthPct");
  const esaPerStudent = n("esaPerStudentY1");
  const esaGrowth = n("esaGrowthPct");
  const otherPerStudent = n("otherEarnedPerStudentY1");
  const otherGrowth = n("otherEarnedGrowthPct");
  const collectionRate = n("collectionRatePct");
  const grantsY1 = n("grantsY1");
  const grantsGrowth = n("grantsGrowthPct");
  const studentsPerTeacher = n("studentsPerTeacher") || 12;
  const teacherSalary = n("teacherSalaryY1");
  const teacherGrowth = n("teacherSalaryGrowthPct");
  const adminSalary = n("adminSalaryY1");
  const adminGrowth = n("adminSalaryGrowthPct");
  const benefitsPct = n("benefitsBurdenPct");
  const rentY1 = n("annualRentY1");
  const rentGrowth = n("rentGrowthPct");
  const otherFacilityY1 = n("otherFacilityCostY1");
  const otherFacilityGrowth = n("otherFacilityCostGrowthPct");
  const programPerStudent = n("programCostPerStudentY1");
  const programGrowth = n("programCostGrowthPct");
  const fixedOps = n("fixedOperatingCostY1");
  const fixedGrowth = n("fixedOperatingCostGrowthPct");
  const startingCash = n("startingCash");
  const existingDebt = n("existingAnnualDebtService");
  const loanAmount = n("proposedLoanAmount");
  const loanRate = n("interestRatePct");
  const loanTerm = n("termYears");
  const adminFte = [n("adminFteY1"), n("adminFteY2"), n("adminFteY3"), n("adminFteY4"), n("adminFteY5")];

  const expected: Record<string, number[]> = {};
  expected.enrollment = enrollment;
  expected.tuitionRevNet = [];
  expected.tuitionCollected = [];
  expected.esaRevenue = [];
  expected.otherRevenue = [];
  expected.grants = [];
  expected.totalRevenue = [];
  expected.teacherFte = [];
  expected.teacherSalaries = [];
  expected.adminSalaries = [];
  expected.benefits = [];
  expected.totalStaffing = [];
  expected.rent = [];
  expected.otherFacility = [];
  expected.programCost = [];
  expected.gaAndTech = [];
  expected.totalOpEx = [];
  expected.totalExpenses = [];
  expected.noi = [];
  expected.operatingMargin = [];

  for (let y = 0; y < 5; y++) {
    const e = enrollment[y];
    const tuition = e * tuitionPerStudent * Math.pow(1 + tuitionGrowth, y);
    expected.tuitionRevNet.push(tuition);
    expected.tuitionCollected.push(tuition * collectionRate);
    expected.esaRevenue.push(e * esaPerStudent * Math.pow(1 + esaGrowth, y));
    expected.otherRevenue.push(e * otherPerStudent * Math.pow(1 + otherGrowth, y));
    expected.grants.push(grantsY1 * Math.pow(1 + grantsGrowth, y));
    expected.totalRevenue.push(
      expected.tuitionCollected[y] + expected.esaRevenue[y] + expected.otherRevenue[y] + expected.grants[y]
    );

    const tFte = Math.ceil(e / studentsPerTeacher);
    expected.teacherFte.push(tFte);
    const tSal = tFte * teacherSalary * Math.pow(1 + teacherGrowth, y);
    expected.teacherSalaries.push(tSal);
    const aSal = adminFte[y] * adminSalary * Math.pow(1 + adminGrowth, y);
    expected.adminSalaries.push(aSal);
    const ben = (tSal + aSal) * benefitsPct;
    expected.benefits.push(ben);
    expected.totalStaffing.push(tSal + aSal + ben);

    const r = rentY1 * Math.pow(1 + rentGrowth, y);
    expected.rent.push(r);
    const of_ = otherFacilityY1 * Math.pow(1 + otherFacilityGrowth, y);
    expected.otherFacility.push(of_);
    const pc = e * programPerStudent * Math.pow(1 + programGrowth, y);
    expected.programCost.push(pc);
    const ga = fixedOps * Math.pow(1 + fixedGrowth, y);
    expected.gaAndTech.push(ga);
    expected.totalOpEx.push(r + of_ + pc + ga);
    expected.totalExpenses.push(expected.totalStaffing[y] + expected.totalOpEx[y]);
    expected.noi.push(expected.totalRevenue[y] - expected.totalExpenses[y]);
    expected.operatingMargin.push(expected.totalRevenue[y] > 0 ? expected.noi[y] / expected.totalRevenue[y] : 0);
  }

  const proposedDebtService = loanAmount > 0 ? computeAnnualDebtService(loanAmount, loanRate, loanTerm) : 0;
  const totalDebtService = existingDebt + proposedDebtService;
  const dscr: number[] = [];
  const netIncomeAfterDebt: number[] = [];
  const cumulativeCash: number[] = [];
  for (let y = 0; y < 5; y++) {
    dscr.push(totalDebtService > 0 ? expected.noi[y] / totalDebtService : (expected.noi[y] > 0 ? 99.9 : 0));
    netIncomeAfterDebt.push(expected.noi[y] - totalDebtService);
    cumulativeCash.push(y === 0 ? startingCash + netIncomeAfterDebt[0] : cumulativeCash[y - 1] + netIncomeAfterDebt[y]);
  }

  const drivers = wb.getWorksheet("Drivers")!;
  const driverCheck = check(`${name}: Drivers Cached Results`);
  const driverRows: [number, string, number[]][] = [
    [4, "Enrollment", expected.enrollment],
    [5, "Tuition Rev Net", expected.tuitionRevNet],
    [6, "Tuition Collected", expected.tuitionCollected],
    [7, "ESA Revenue", expected.esaRevenue],
    [8, "Other Revenue", expected.otherRevenue],
    [9, "Grants", expected.grants],
    [10, "Total Revenue", expected.totalRevenue],
    [12, "Teacher FTE", expected.teacherFte],
    [13, "Teacher Salaries", expected.teacherSalaries],
    [14, "Admin Salaries", expected.adminSalaries],
    [15, "Benefits", expected.benefits],
    [16, "Total Staffing", expected.totalStaffing],
    [18, "Rent", expected.rent],
    [19, "Other Facility", expected.otherFacility],
    [20, "Program Cost", expected.programCost],
    [21, "G&A", expected.gaAndTech],
    [22, "Total OpEx", expected.totalOpEx],
  ];
  let driverErrors = 0;
  for (const [row, label, expectedVals] of driverRows) {
    for (let y = 0; y < 5; y++) {
      const actual = numVal(drivers.getCell(row, y + 3));
      const exp = expectedVals[y];
      if (!pctNear(actual, exp, 0.005)) {
        driverCheck.errors.push(`Drivers R${row} Y${y + 1} (${label}): expected=${exp.toFixed(2)}, actual=${actual.toFixed(2)}, diff=${Math.abs(actual - exp).toFixed(2)}`);
        driverErrors++;
      }
    }
  }
  driverCheck.passed = driverErrors === 0;
  driverCheck.details.push(`Checked ${driverRows.length * 5} cells, ${driverErrors} mismatches`);
  results.push(driverCheck);

  const pnl = wb.getWorksheet("5-Year P&L")!;
  const pnlCheck = check(`${name}: P&L Cached Results`);
  const pnlRows: [number, string, number[]][] = [
    [5, "Enrollment", expected.enrollment],
    [6, "Tuition Collected", expected.tuitionCollected],
    [7, "ESA Revenue", expected.esaRevenue],
    [8, "Other Revenue", expected.otherRevenue],
    [9, "Grants", expected.grants],
    [10, "Total Revenue", expected.totalRevenue],
    [12, "Total Staffing", expected.totalStaffing],
    [13, "Total OpEx", expected.totalOpEx],
    [15, "Total Expenses", expected.totalExpenses],
    [16, "NOI", expected.noi],
    [17, "Operating Margin", expected.operatingMargin],
  ];
  let pnlErrors = 0;
  for (const [row, label, expectedVals] of pnlRows) {
    for (let y = 0; y < 5; y++) {
      const actual = numVal(pnl.getCell(row, y + 3));
      const exp = expectedVals[y];
      if (!pctNear(actual, exp, 0.005)) {
        pnlCheck.errors.push(`P&L R${row} Y${y + 1} (${label}): expected=${exp.toFixed(2)}, actual=${actual.toFixed(2)}`);
        pnlErrors++;
      }
    }
  }
  pnlCheck.passed = pnlErrors === 0;
  pnlCheck.details.push(`Checked ${pnlRows.length * 5} cells, ${pnlErrors} mismatches`);
  results.push(pnlCheck);

  const cf = wb.getWorksheet("Cash Flow & DSCR")!;
  const cfCheck = check(`${name}: Cash Flow Cached Results`);
  const cfRows: [number, string, number[]][] = [
    [4, "NOI", expected.noi],
    [6, "Existing Debt", [existingDebt, existingDebt, existingDebt, existingDebt, existingDebt]],
    [7, "Proposed Debt", [proposedDebtService, proposedDebtService, proposedDebtService, proposedDebtService, proposedDebtService]],
    [8, "Total Debt Service", [totalDebtService, totalDebtService, totalDebtService, totalDebtService, totalDebtService]],
    [10, "DSCR", dscr],
    [12, "Net After Debt", netIncomeAfterDebt],
    [14, "Cumulative Cash", cumulativeCash],
  ];
  let cfErrors = 0;
  for (const [row, label, expectedVals] of cfRows) {
    for (let y = 0; y < 5; y++) {
      const actual = numVal(cf.getCell(row, y + 3));
      const exp = expectedVals[y];
      if (!pctNear(actual, exp, 0.005)) {
        cfCheck.errors.push(`CF R${row} Y${y + 1} (${label}): expected=${exp.toFixed(2)}, actual=${actual.toFixed(2)}`);
        cfErrors++;
      }
    }
  }
  cfCheck.passed = cfErrors === 0;
  cfCheck.details.push(`Checked ${cfRows.length * 5} cells, ${cfErrors} mismatches`);
  results.push(cfCheck);

  const staffing = wb.getWorksheet("Staffing")!;
  const staffCheck = check(`${name}: Staffing Cached Results`);
  let staffErrors = 0;
  for (let y = 0; y < 5; y++) {
    const tFte = numVal(staffing.getCell(4, y + 3));
    if (!near(tFte, expected.teacherFte[y])) {
      staffCheck.errors.push(`Staffing Teacher FTE Y${y + 1}: expected=${expected.teacherFte[y]}, actual=${tFte}`);
      staffErrors++;
    }
    const aFte = numVal(staffing.getCell(5, y + 3));
    if (!near(aFte, adminFte[y])) {
      staffCheck.errors.push(`Staffing Admin FTE Y${y + 1}: expected=${adminFte[y]}, actual=${aFte}`);
      staffErrors++;
    }
    const totalFte = numVal(staffing.getCell(6, y + 3));
    if (!near(totalFte, expected.teacherFte[y] + adminFte[y])) {
      staffCheck.errors.push(`Staffing Total FTE Y${y + 1}: expected=${expected.teacherFte[y] + adminFte[y]}, actual=${totalFte}`);
      staffErrors++;
    }
  }
  staffCheck.passed = staffErrors === 0;
  staffCheck.details.push(`Checked 15 cells, ${staffErrors} mismatches`);
  results.push(staffCheck);

  const loan = wb.getWorksheet("Loan Snapshot")!;
  const loanCheck = check(`${name}: Loan Snapshot`);
  let loanErrors = 0;
  const lAmount = numVal(loan.getCell("C3"));
  if (!near(lAmount, loanAmount, 1)) {
    loanCheck.errors.push(`Loan Amount: expected=${loanAmount}, actual=${lAmount}`);
    loanErrors++;
  }
  const lRate = numVal(loan.getCell("C4"));
  if (!near(lRate, loanRate, 0.001)) {
    loanCheck.errors.push(`Interest Rate: expected=${loanRate}, actual=${lRate}`);
    loanErrors++;
  }
  const lTerm = numVal(loan.getCell("C5"));
  if (!near(lTerm, loanTerm, 0.1)) {
    loanCheck.errors.push(`Term: expected=${loanTerm}, actual=${lTerm}`);
    loanErrors++;
  }
  const lDebt = numVal(loan.getCell("C6"));
  if (!pctNear(lDebt, proposedDebtService, 0.005)) {
    loanCheck.errors.push(`Annual Debt Service: expected=${proposedDebtService.toFixed(2)}, actual=${lDebt.toFixed(2)}`);
    loanErrors++;
  }
  const lDscr = numVal(loan.getCell("C8"));
  if (!pctNear(lDscr, dscr[0], 0.005)) {
    loanCheck.errors.push(`Year 1 DSCR: expected=${dscr[0].toFixed(2)}, actual=${lDscr.toFixed(2)}`);
    loanErrors++;
  }
  loanCheck.passed = loanErrors === 0;
  loanCheck.details.push(`Checked 5 cells, ${loanErrors} mismatches`);
  results.push(loanCheck);

  const summary = wb.getWorksheet("Summary")!;
  const summaryCheck = check(`${name}: Summary`);
  let summaryErrors = 0;
  const sName = strVal(summary.getCell("C3"));
  if (sName !== String(input.schoolName || "")) {
    summaryCheck.errors.push(`School Name: expected="${input.schoolName}", actual="${sName}"`);
    summaryErrors++;
  }
  const sType = strVal(summary.getCell("C4"));
  if (sType !== String(input.schoolType || "")) {
    summaryCheck.errors.push(`School Type: expected="${input.schoolType}", actual="${sType}"`);
    summaryErrors++;
  }
  const sEnroll = numVal(summary.getCell("C8"));
  if (!near(sEnroll, enrollment[4])) {
    summaryCheck.errors.push(`Y5 Enrollment: expected=${enrollment[4]}, actual=${sEnroll}`);
    summaryErrors++;
  }
  const sRev = numVal(summary.getCell("C9"));
  if (!pctNear(sRev, expected.totalRevenue[4], 0.005)) {
    summaryCheck.errors.push(`Y5 Revenue: expected=${expected.totalRevenue[4].toFixed(2)}, actual=${sRev.toFixed(2)}`);
    summaryErrors++;
  }
  const sNoi = numVal(summary.getCell("C10"));
  if (!pctNear(sNoi, expected.noi[4], 0.005)) {
    summaryCheck.errors.push(`Y5 NOI: expected=${expected.noi[4].toFixed(2)}, actual=${sNoi.toFixed(2)}`);
    summaryErrors++;
  }
  summaryCheck.passed = summaryErrors === 0;
  summaryCheck.details.push(`Checked 5 cells, ${summaryErrors} mismatches`);
  results.push(summaryCheck);

  const formulaCheck = check(`${name}: Formula Presence`);
  let formulaCells = 0;
  let formulasFound = 0;
  const formulaSheets = ["Drivers", "5-Year P&L", "Cash Flow & DSCR", "Staffing", "Loan Snapshot", "Summary"];
  for (const sheetName of formulaSheets) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v = cell.value;
        if (v && typeof v === "object" && "formula" in v) {
          formulaCells++;
          const f = (v as any).formula;
          if (f && typeof f === "string" && f.length > 0) formulasFound++;
        }
      });
    });
  }
  formulaCheck.passed = formulasFound > 50;
  formulaCheck.details.push(`Found ${formulasFound} formula cells across ${formulaSheets.length} sheets`);
  if (formulasFound < 50) {
    formulaCheck.errors.push(`Expected at least 50 formula cells, found ${formulasFound}`);
  }
  results.push(formulaCheck);

  const crossTabCheck = check(`${name}: Cross-Tab Formula References`);
  let crossTabErrors = 0;
  const pnlR10 = getFormulaResult(pnl.getCell("C10"));
  if (!pnlR10.formula || !pnlR10.formula.includes("Drivers!")) {
    crossTabCheck.errors.push(`P&L Total Revenue should reference Drivers!, got: ${pnlR10.formula}`);
    crossTabErrors++;
  }
  const cfR4 = getFormulaResult(cf.getCell("C4"));
  if (!cfR4.formula || !cfR4.formula.includes("5-Year P&L")) {
    crossTabCheck.errors.push(`Cash Flow NOI should reference 5-Year P&L, got: ${cfR4.formula}`);
    crossTabErrors++;
  }
  const loanR8 = getFormulaResult(loan.getCell("C8"));
  if (!loanR8.formula || !loanR8.formula.includes("Cash Flow")) {
    crossTabCheck.errors.push(`Loan DSCR should reference Cash Flow, got: ${loanR8.formula}`);
    crossTabErrors++;
  }
  const summR9 = getFormulaResult(summary.getCell("C9"));
  if (!summR9.formula || !summR9.formula.includes("Drivers!")) {
    crossTabCheck.errors.push(`Summary Y5 Revenue should reference Drivers!, got: ${summR9.formula}`);
    crossTabErrors++;
  }
  crossTabCheck.passed = crossTabErrors === 0;
  crossTabCheck.details.push(`Checked 4 cross-tab formula chains, ${crossTabErrors} broken`);
  results.push(crossTabCheck);

  const formatCheck = check(`${name}: Formatting Quality`);
  let formatIssues = 0;

  const assumptionLabels = ["School Name", "Year 1 Enrollment", "Tuition per Student", "Starting Cash"];
  for (const label of assumptionLabels) {
    let found = false;
    assumptions.eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value || "").includes(label)) found = true;
      });
    });
    if (!found) {
      formatCheck.errors.push(`Missing Assumptions label: "${label}"`);
      formatIssues++;
    }
  }

  const inputCellRefs = ["D12", "D20", "D33", "D46", "D59"];
  for (const ref of inputCellRefs) {
    const cell = assumptions.getCell(ref);
    const fill = cell.fill;
    if (!fill || fill.type !== "pattern" || !(fill as any).fgColor?.argb?.includes("FFFD")) {
      formatCheck.errors.push(`Assumptions ${ref} should have yellow input fill`);
      formatIssues++;
    }
  }

  const sectionRows = [3, 10, 18, 30, 44, 55];
  for (const r of sectionRows) {
    const cell = assumptions.getCell(`B${r}`);
    const fill = cell.fill;
    if (!fill || fill.type !== "pattern") {
      formatCheck.errors.push(`Assumptions section header row ${r} missing fill`);
      formatIssues++;
    }
  }

  for (let y = 0; y < 5; y++) {
    const cell = cf.getCell(10, y + 3);
    const fill = cell.fill;
    if (!fill || fill.type !== "pattern") {
      formatCheck.errors.push(`DSCR Y${y + 1} missing conditional fill`);
      formatIssues++;
    }
  }

  for (let y = 0; y < 5; y++) {
    const cell = pnl.getCell(16, y + 3);
    const fill = cell.fill;
    if (!fill || fill.type !== "pattern") {
      formatCheck.errors.push(`NOI Y${y + 1} missing conditional fill`);
      formatIssues++;
    }
  }

  formatCheck.passed = formatIssues === 0;
  formatCheck.details.push(`Checked labels, input fills, section headers, conditional formatting. ${formatIssues} issues.`);
  results.push(formatCheck);

  return results;
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║     SchoolStack Budget — Lender Pro Forma Parity Check     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const payloads = ["Microschool", "PrivateESA", "Charter"];
  let totalPassed = 0;
  let totalFailed = 0;
  const allResults: CheckResult[] = [];

  for (const payload of payloads) {
    const xlsxPath = path.join(PHASE2_DIR, `Lender_${payload}.xlsx`);
    const jsonPath = path.join(PHASE2_DIR, `Input_${payload}.json`);

    if (!fs.existsSync(xlsxPath) || !fs.existsSync(jsonPath)) {
      console.log(`  ⚠ Skipping ${payload} — files not found`);
      continue;
    }

    console.log(`\n  ── ${payload} ──`);
    const results = await validateWorkbook(xlsxPath, jsonPath);
    allResults.push(...results);

    for (const r of results) {
      const icon = r.passed ? "✅" : "❌";
      console.log(`  ${icon} ${r.name}`);
      for (const d of r.details) console.log(`     ${d}`);
      for (const e of r.errors) console.log(`     ⚠ ${e}`);
      if (r.passed) totalPassed++; else totalFailed++;
    }
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    PARITY CHECK RESULTS                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`  Total: ${totalPassed + totalFailed} | Passed: ${totalPassed} | Failed: ${totalFailed}\n`);

  const reportPath = path.join(PHASE2_DIR, "parity-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`  Report: ${reportPath}\n`);

  if (totalFailed > 0) {
    console.log(`  ❌ ${totalFailed} check(s) FAILED.\n`);
    process.exit(1);
  } else {
    console.log(`  ✅ All ${totalPassed} checks PASSED.\n`);
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(2);
});
