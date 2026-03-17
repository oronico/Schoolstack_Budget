import {
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeCapDebtForYear,
  computeAnnualDebt,
  driverVal,
  getEnrollmentArray,
  computeGradeBandRevenue,
  hasGradeBandData,
  type SchoolProfile,
  type StaffingRow,
  type RevenueRow,
  type ExpenseRow,
  type CapitalDebtRow,
} from "../src/lib/workbook-helpers.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { microschoolStartup, privateSchoolWithESA, charterPublicFunding, charterADAGradeBand } from "./sample-payloads.js";

interface GoldenValue {
  label: string;
  actual: number;
  expected: number;
  tolerance: number;
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: number, expected: number, tolerance = 1) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — expected ${expected}, got ${Math.round(actual)} (diff ${Math.round(diff)})`);
  }
}

function normalizeRow(raw: Record<string, unknown>): StaffingRow {
  return {
    id: (raw.id as string) || "",
    roleName: (raw.roleName as string) || "",
    functionCategory: (raw.functionCategory as string) || "",
    employmentType: (raw.employmentType as string) || "full_time",
    fte: (raw.fte as number) || 1,
    annualizedRate: (raw.annualizedRate as number) || 0,
    benefitsEligible: raw.benefitsEligible !== false,
    benefitsRate: (raw.benefitsRate as number) || 0,
    payrollTaxRate: (raw.payrollTaxRate as number) || 7.65,
    payrollLike: (raw.payrollLike as boolean) || false,
    notes: (raw.notes as string) || "",
  };
}

function testMicroschoolStartup() {
  console.log("\n— Microschool Startup (debtIncluded=false) —");
  const data = microschoolStartup;
  const enrollment = getEnrollmentArray(data.enrollment);
  const revenueRows = data.revenueRows as unknown as RevenueRow[];
  const staffingRows = (data.staffingRows as unknown as Record<string, unknown>[]).map(normalizeRow);
  const expenseRows = data.expenseRows as unknown as ExpenseRow[];
  const capDebtRows = (data.capitalAndDebtRows || []) as unknown as CapitalDebtRow[];

  // Y1: 12 students
  // r1 tuition: 12000 × 12 = 144,000
  // r2 reg fee: 250 × 12 = 3,000
  // r3 ESA: 7000 × 12 = 84,000
  // r4 fundraising: 5,000
  // Total = 236,000
  const revY1 = computeRevenueForYear(revenueRows, 0, enrollment[0]);
  check("Micro Y1 Revenue", revY1, 236000);

  // Y3: 22 students
  // r1 tuition: 12731 × 22 = 280,082
  // r2 reg: 250 × 22 = 5,500
  // r3 ESA: 7426 × 22 = 163,372
  // r4 fundraising: 7,000
  // Total = 455,954
  const revY3 = computeRevenueForYear(revenueRows, 2, enrollment[2]);
  check("Micro Y3 Revenue", revY3, 455954);

  // Personnel Y1: prorationFactor = 10/12
  // s1: 55000 * (1 + 0.20 + 0.0765) = 55000 * 1.2765 = 70207.50
  // s2: 45000 * (1 + 0.20 + 0.0765) = 45000 * 1.2765 = 57442.50
  // s3: 0.5*28000 = 14000 * (1 + 0 + 0.0765) = 14000 * 1.0765 = 15071.00
  // base total = 142,721
  // Y1: 142721 * 1 (no escalation y0) * 10/12 = 118,934
  const salaryEsc = 3 / 100;
  const prorationFactor = 10 / 12;
  const persY1 = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, 0);
  check("Micro Y1 Personnel", persY1, 118934, 2);

  // Y2: 142721 * (1.03)^1 * 1 = 147,003
  const persY2 = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, 1);
  check("Micro Y2 Personnel", persY2, 147003, 2);

  // No capDebtRows → zero debt
  const cdY1 = computeCapDebtForYear(capDebtRows, 0, enrollment[0]);
  check("Micro Y1 CapDebt", cdY1, 0);

  // OpEx Y1 (check a few line items):
  // e1 Rent: 2500 * 12 = 30,000  (monthly driver, amounts[0]=2500)
  // e2 Utilities: 300 * 12 = 3,600
  // e3 Insurance: 2400 (annual_fixed)
  // e4 Curriculum: 500 * 12 = 6,000 (per_student)
  // e5 Tech: 300 * 12 = 3,600 (per_student)
  // e6 Marketing: 3,000 (annual_fixed)
  // Total = 30000 + 3600 + 2400 + 6000 + 3600 + 3000 = 48,600
  const costInflPct = 3; // from tuitionEscalation.rate default
  const opexY1 = computeExpenseForYear(expenseRows, 0, enrollment[0], revY1, costInflPct);
  check("Micro Y1 OpEx", opexY1, 48600);
}

function testPrivateSchoolWithESA() {
  console.log("\n— Private School with ESA (debtIncluded=true) —");
  const data = privateSchoolWithESA;
  const enrollment = getEnrollmentArray(data.enrollment);
  const revenueRows = data.revenueRows as unknown as RevenueRow[];
  const staffingRows = (data.staffingRows as unknown as Record<string, unknown>[]).map(normalizeRow);
  const expenseRows = data.expenseRows as unknown as ExpenseRow[];
  const capDebtRows = data.capitalAndDebtRows as unknown as CapitalDebtRow[];

  // Y1: 100 students
  // r1 tuition: 10500 × 100 = 1,050,000
  // r2 reg fee: 350 × 100 = 35,000
  // r3 scholarship: -1050 × 100 = -105,000 (tuition_offset)
  // r4 FL FTC: 8700 × 100 = 870,000
  // r5 Foundation: 50,000
  // r6 Annual Fund: 25,000
  // r7 After-school: 500 × 100 = 50,000
  // Total = 1,050,000 + 35,000 - 105,000 + 870,000 + 50,000 + 25,000 + 50,000 = 1,975,000
  const revY1 = computeRevenueForYear(revenueRows, 0, enrollment[0]);
  check("Private Y1 Revenue", revY1, 1975000);

  // Y5: 200 students
  const revY5 = computeRevenueForYear(revenueRows, 4, enrollment[4]);
  // r1: 11818 × 200 = 2,363,600
  // r2: 350 × 200 = 70,000
  // r3: -1182 × 200 = -236,400 offset
  // r4: 9792 × 200 = 1,958,400
  // r5: 10,000
  // r6: 45,000
  // r7: 562 × 200 = 112,400
  // Total = 2,363,600 + 70,000 - 236,400 + 1,958,400 + 10,000 + 45,000 + 112,400 = 4,323,000
  check("Private Y5 Revenue", revY5, 4323000);

  // CapDebt Y1: cd1 is a loan: 250k @ 6.5% over 10yr
  const annualDebt = computeAnnualDebt(250000, 0.065, 10);
  // PMT(0.065/12, 120, 250000) * 12 ≈ 34,064
  check("Private Annual Debt Service", annualDebt, 34064, 10);

  // cd2 is non-loan capex: 25,000 Y1
  const cdY1 = computeCapDebtForYear(capDebtRows, 0, enrollment[0]);
  // loan debt + 25000 capex
  check("Private Y1 CapDebt (loan+capex)", cdY1, annualDebt + 25000, 10);
}

function testCharterPublicFunding() {
  console.log("\n— Charter Public Funding —");
  const data = charterPublicFunding;
  const enrollment = getEnrollmentArray(data.enrollment);
  const revenueRows = data.revenueRows as unknown as RevenueRow[];
  const staffingRows = (data.staffingRows as unknown as Record<string, unknown>[]).map(normalizeRow);
  const expenseRows = data.expenseRows as unknown as ExpenseRow[];

  // Y1: 120 students
  // r1: 9500 × 120 = 1,140,000
  // r2: 800 × 120 = 96,000
  // r3: 1200 × 120 = 144,000
  // r4: 100,000
  // r5: 30,000
  // r6: 300 × 120 = 36,000
  // Total = 1,546,000
  const revY1 = computeRevenueForYear(revenueRows, 0, enrollment[0]);
  check("Charter Y1 Revenue", revY1, 1546000);

  // Y3: 300 students
  // r1: 9884 × 300 = 2,965,200
  // r2: 832 × 300 = 249,600
  // r3: 1248 × 300 = 374,400
  // r4: 50,000
  // r5: 50,000
  // r6: 318 × 300 = 95,400
  // Total = 3,784,600
  const revY3 = computeRevenueForYear(revenueRows, 2, enrollment[2]);
  check("Charter Y3 Revenue", revY3, 3784600);

  // Personnel: 9 staff rows
  // s1: 110000 * (1+0.28+0.0765) = 110000 * 1.3565 = 149215
  // s2: 90000 * 1.3565 = 122085
  // s3: 72000 * 1.3565 = 97668
  // s4: 6 * 52000 * 1.3565 = 423228
  // s5: 55000 * 1.3565 = 74607.5
  // s6: 3 * 30000 * (1+0.20+0.0765) = 90000 * 1.2765 = 114885
  // s7: 55000 * 1.3565 = 74607.5
  // s8: 2 * 38000 * (1+0.25+0.0765) = 76000 * 1.3265 = 100814
  // s9: 55000 * 1.3565 = 74607.5
  // Base total ≈ 1,231,717.5
  // Y1 pf = 10/12
  const salaryEsc = 0;
  const prorationFactor = 10 / 12;
  const persY1 = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, 0);
  check("Charter Y1 Personnel (no esc)", persY1, 1231718 * prorationFactor, 5);
}

function testCharterADAGradeBand() {
  console.log("\n— Charter ADA Grade-Band —");
  const data = charterADAGradeBand;
  const sp = data.schoolProfile as unknown as SchoolProfile;

  // hasGradeBandData should be true
  check("GradeBand data present", hasGradeBandData(sp) ? 1 : 0, 1);

  // Grade-band revenue Y1: k5=80×8200 + m68=40×9100 + h912=0×10500 = 656,000 + 364,000 = 1,020,000
  // ADA ratio: priorYearADM=0 → default 0.95
  // Adjusted = 1,020,000 × 0.95 = 969,000
  const gbRevY1 = computeGradeBandRevenue(sp, 0);
  check("GradeBand Y1 Revenue", gbRevY1, 969000);

  // Y5: k5=260×8200 + m68=140×9100 + h912=100×10500
  // = 2,132,000 + 1,274,000 + 1,050,000 = 4,456,000
  // × 0.95 = 4,233,200
  const gbRevY5 = computeGradeBandRevenue(sp, 4);
  check("GradeBand Y5 Revenue", gbRevY5, 4233200);

  // Full revenue Y1 (grade-band replaces state_local_perpupil):
  const enrollment = getEnrollmentArray(data.enrollment);
  const revenueRows = data.revenueRows as unknown as RevenueRow[];
  // gbRev=969000 + r2 Title I: 750×120=90000 + r3 IDEA: 1100×120=132000
  // + r4 CSP Grant: 150000 + r5 Fundraising: 25000 + r6 Care: 400×120=48000
  // Total = 969000 + 90000 + 132000 + 150000 + 25000 + 48000 = 1,414,000
  const revY1 = computeRevenueForYear(revenueRows, 0, enrollment[0], undefined, undefined, sp);
  check("GradeBand Y1 Full Revenue", revY1, 1414000);
}

function testDebtServiceMath() {
  console.log("\n— Debt Service Math —");

  // Zero-rate loan
  check("Zero-rate: 100k/10yr", computeAnnualDebt(100000, 0, 10), 10000);

  // Standard amortization: 250k @ 6.5% over 10yr
  // Using PMT formula
  const annual = computeAnnualDebt(250000, 0.065, 10);
  check("250k @ 6.5% / 10yr", annual, 34064, 10);

  // Edge cases
  check("Zero principal", computeAnnualDebt(0, 0.05, 10), 0);
  check("Zero term", computeAnnualDebt(100000, 0.05, 0), 0);

  // driverVal tests
  check("driverVal monthly", driverVal([1000], 0, "monthly", 10), 12000);
  check("driverVal per_student", driverVal([500], 0, "per_student", 20), 10000);
  check("driverVal annual_fixed", driverVal([5000], 0, "annual_fixed", 100), 5000);

  // driverVal with escalation
  // base=1000, esc=3%, y=2: 1000 * (1.03)^2 = 1060.9
  check("driverVal annual w/ esc", driverVal([1000], 2, "annual_fixed", 1, 3), 1061, 1);
}

function testMonthlyTimingRules() {
  console.log("\n— Monthly Timing Rules —");

  // RULE 1: Personnel with proration (10/12) vs full year (12/12)
  // When isPartialFirstYear=true, Y1 personnel should be 10/12 of full year
  const singleStaff: StaffingRow[] = [{
    id: "test", roleName: "Teacher", functionCategory: "instruction",
    employmentType: "full_time", fte: 1, annualizedRate: 60000,
    benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65,
    payrollLike: false, notes: "",
  }];
  // Full-year loaded cost: 60000 * (1 + 0.20 + 0.0765) = 60000 * 1.2765 = 76,590
  const fullYear = computePersonnelForYear(singleStaff, 0, 1, 0);
  check("Timing: Full-year personnel", fullYear, 76590);

  // 10-month prorated
  const prorated = computePersonnelForYear(singleStaff, 0, 10 / 12, 0);
  check("Timing: 10-mo prorated personnel", prorated, 63825);

  // Monthly spread: personnel/opMonths should equal personnel/10 for partial year
  const monthlyPers10 = prorated / 10;
  check("Timing: Monthly personnel (10 opMonths)", monthlyPers10, 6383, 1);

  // RULE 2: Revenue timing — driverVal for per_student gives annual total
  // Tuition: annual total then spread over billingMonths (default 10)
  // e.g., $10,000/student × 50 students = $500,000 annual
  // monthly tuition = $500,000 / 10 = $50,000 (months 1-10, NOT month 0)
  const annualTuition = driverVal([10000], 0, "per_student", 50);
  check("Timing: Annual tuition total", annualTuition, 500000);
  const monthlyTuition = annualTuition / 10;
  check("Timing: Monthly tuition (10 billing months)", monthlyTuition, 50000);

  // RULE 3: Debt service spread over 12 months always
  // Even if opMonths=10, debt is always /12
  const annualDebt = computeAnnualDebt(120000, 0, 10);
  check("Timing: Annual debt (120k/10yr)", annualDebt, 12000);
  const monthlyDebt = annualDebt / 12;
  check("Timing: Monthly debt (always /12)", monthlyDebt, 1000);

  // RULE 4: OpEx with proration
  // Annual OpEx is multiplied by prorationFactor in buildMonthlyCashFlowY1
  // Then spread over opMonths. So monthly = (annual * pf) / opMonths
  // For a $12,000/yr expense with pf=10/12:
  // prorated annual = 12000 * 10/12 = 10,000
  // monthly = 10000 / 10 = 1,000
  const annualOpex = 12000;
  const proratedOpex = annualOpex * (10 / 12);
  check("Timing: Prorated OpEx", Math.round(proratedOpex), 10000);
  const monthlyOpex = proratedOpex / 10;
  check("Timing: Monthly OpEx (10 opMonths)", Math.round(monthlyOpex), 1000);

  // RULE 5: Salary escalation compounds per year
  // Y0: base, Y1: base*1.03, Y2: base*1.03^2
  const persY0 = computePersonnelForYear(singleStaff, 0.03, 1, 0);
  const persY1 = computePersonnelForYear(singleStaff, 0.03, 1, 1);
  const persY2 = computePersonnelForYear(singleStaff, 0.03, 1, 2);
  check("Timing: Y0 personnel (no esc)", persY0, 76590);
  check("Timing: Y1 personnel (3% esc)", persY1, 78888, 1);
  check("Timing: Y2 personnel (3% esc^2)", persY2, 81254, 2);
}

function testDebtIncludedExclusion() {
  console.log("\n— Debt Included Exclusion —");

  const loanRow: CapitalDebtRow = {
    id: "loan1", lineItem: "SBA Loan", isLoan: true, enabled: true,
    driverType: "annual_fixed",
    loanPrincipal: 200000, loanRate: 5.5, loanTermYears: 15,
    amounts: [200000, 0, 0, 0, 0],
  };
  const capexRow: CapitalDebtRow = {
    id: "capex1", lineItem: "Furniture", isLoan: false, enabled: true,
    driverType: "annual_fixed",
    amounts: [15000, 5000, 0, 0, 0],
  };

  // With both rows, Y1 = loan debt service + capex
  const fullY1 = computeCapDebtForYear([loanRow, capexRow], 0, 100);
  const loanAnnual = computeAnnualDebt(200000, 0.055, 15);
  check("DebtIncl: Full Y1 = loan+capex", fullY1, loanAnnual + 15000, 5);

  // Filtering only non-loan rows (simulating debtIncluded=false at engine level)
  const noLoanRows = [loanRow, capexRow].filter(r => !r.isLoan);
  const filteredY1 = computeCapDebtForYear(noLoanRows, 0, 100);
  check("DebtIncl: Filtered Y1 = capex only", filteredY1, 15000);

  // Y2: loan still paying, capex = 5000
  const fullY2 = computeCapDebtForYear([loanRow, capexRow], 1, 100);
  check("DebtIncl: Full Y2 = loan+capex", fullY2, loanAnnual + 5000, 5);
  const filteredY2 = computeCapDebtForYear(noLoanRows, 1, 100);
  check("DebtIncl: Filtered Y2 = capex only", filteredY2, 5000);
}

function testGradeBandEdgeCases() {
  console.log("\n— Grade-Band Edge Cases —");

  // ADA with ADM>0: ratio = min(ADA/ADM, 1)
  const spWithADM: SchoolProfile = {
    gradeBandEnrollment: { k5: [100], m68: [0], h912: [0] },
    gradeBandPerPupil: { k5: 10000, m68: 0, h912: 0 },
    enrollmentRevenueMethod: "ada",
    priorYearADM: 100,
    priorYearADA: 92,
  };
  // 100 × 10000 = 1,000,000 × (92/100) = 920,000
  check("GradeBand ADA ADM>0", computeGradeBandRevenue(spWithADM, 0), 920000);

  // ADA ratio capped at 1.0 when ADA > ADM
  const spOverADA: SchoolProfile = {
    gradeBandEnrollment: { k5: [50], m68: [50], h912: [0] },
    gradeBandPerPupil: { k5: 8000, m68: 9000, h912: 0 },
    enrollmentRevenueMethod: "ada",
    priorYearADM: 80,
    priorYearADA: 100,
  };
  // (50×8000 + 50×9000) = 850,000 × min(100/80, 1) = 850,000 × 1.0
  check("GradeBand ADA ratio capped at 1", computeGradeBandRevenue(spOverADA, 0), 850000);

  // Non-ADA method: no ratio applied
  const spNoADA: SchoolProfile = {
    gradeBandEnrollment: { k5: [100], m68: [0], h912: [0] },
    gradeBandPerPupil: { k5: 10000, m68: 0, h912: 0 },
    enrollmentRevenueMethod: "headcount",
    priorYearADM: 100,
    priorYearADA: 92,
  };
  check("GradeBand headcount (no ADA)", computeGradeBandRevenue(spNoADA, 0), 1000000);

  // Missing grade-band data
  const spEmpty: SchoolProfile = {};
  check("GradeBand empty profile", computeGradeBandRevenue(spEmpty, 0), 0);
}

function testDriverValEdgeCases() {
  console.log("\n— Driver Value Edge Cases —");

  // Multi-year amounts array
  check("driverVal multi-year idx 0", driverVal([100, 200, 300], 0, "annual_fixed", 1), 100);
  check("driverVal multi-year idx 2", driverVal([100, 200, 300], 2, "annual_fixed", 1), 300);

  // Empty amounts
  check("driverVal empty amounts", driverVal([], 0, "annual_fixed", 1), 0);
  check("driverVal undefined amounts", driverVal(undefined as unknown as number[], 0, "annual_fixed", 1), 0);

  // percent_of_revenue is handled by computeExpenseForYear, not driverVal
  // Test via computeExpenseForYear with a percent_of_revenue row
  const pctRevRow: ExpenseRow = {
    id: "mgmt_fee", lineItem: "Mgmt Fee", enabled: true,
    category: "administration",
    driverType: "percent_of_revenue",
    amounts: [5, 5, 5, 5, 5],
  };
  // 5% of 1,000,000 revenue = 50,000
  check("ExpenseRow percent_of_revenue", computeExpenseForYear([pctRevRow], 0, 100, 1000000, 0), 50000);
}

function cellNum(ws: import("exceljs").Worksheet, row: number, col: number): number {
  const cell = ws.getCell(row, col);
  const v = cell.value;
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null) {
    const obj = v as Record<string, unknown>;
    if ("result" in obj && typeof obj.result === "number") return obj.result;
    if ("result" in obj && typeof obj.result === "object" && obj.result !== null) {
      const inner = obj.result as Record<string, unknown>;
      if ("result" in inner && typeof inner.result === "number") return inner.result;
    }
    if ("sharedFormula" in obj && "result" in obj) return Number(obj.result) || 0;
  }
  return Number(v) || 0;
}

function findRowByLabel(ws: import("exceljs").Worksheet, label: string, startRow = 1, endRow = 80): number {
  for (let r = startRow; r <= endRow; r++) {
    const v = ws.getCell(r, 1).value;
    if (typeof v === "string" && v.trim() === label) return r;
  }
  return -1;
}

async function testWorkbookKPIs() {
  console.log("\n— Workbook-Level KPIs —");

  interface KPIExpected {
    y1Rev: number; y5Rev: number;
    y1Pers: number; y1Opex: number; y1CD: number;
    y1TotalExp: number; y1NI: number; y5NI: number;
    y1DebtSvc: number;
    y1DSCR: number | "N/A";
    y1EndingCash: number;
  }

  const expectations: [string, Record<string, unknown>, KPIExpected][] = [
    ["Microschool", microschoolStartup as unknown as Record<string, unknown>, {
      y1Rev: 196667, y5Rev: 547279,
      y1Pers: 118934, y1Opex: 40500, y1CD: 0,
      y1TotalExp: 159434, y1NI: 37233, y5NI: 320240,
      y1DebtSvc: 0, y1DSCR: "N/A", y1EndingCash: 76570,
    }],
    ["Private+ESA", privateSchoolWithESA as unknown as Record<string, unknown>, {
      y1Rev: 1975000, y5Rev: 4361347,
      y1Pers: 854772, y1Opex: 271400, y1CD: 59064,
      y1TotalExp: 1185236, y1NI: 789764, y5NI: 2942215,
      y1DebtSvc: 34064, y1DSCR: 24.92, y1EndingCash: 864756,
    }],
    ["Charter", charterPublicFunding as unknown as Record<string, unknown>, {
      y1Rev: 1288333, y5Rev: 5458718,
      y1Pers: 1026431, y1Opex: 545000, y1CD: 164825,
      y1TotalExp: 1736256, y1NI: -447923, y5NI: 2447131,
      y1DebtSvc: 49825, y1DSCR: -5.68, y1EndingCash: -190250,
    }],
    ["Charter ADA", charterADAGradeBand as unknown as Record<string, unknown>, {
      y1Rev: 1178333, y5Rev: 5696361,
      y1Pers: 780535, y1Opex: 503333, y1CD: 106629,
      y1TotalExp: 1390497, y1NI: -212164, y5NI: 3114494,
      y1DebtSvc: 46629, y1DSCR: -2.26, y1EndingCash: 74498,
    }],
  ];

  for (const [name, payload, exp] of expectations) {
    const wb = await generateUnderwritingWorkbook(payload);
    const summary = wb.getWorksheet("Budget Summary");
    if (!summary) { failed++; failures.push(`  FAIL: ${name} — Budget Summary tab missing`); continue; }

    const revRow = findRowByLabel(summary, "Total Revenue");
    const persRow = findRowByLabel(summary, "Total Personnel");
    const opexRow = findRowByLabel(summary, "Total Operating Expenses");
    const cdRow = findRowByLabel(summary, "Total Capital & Debt Service");
    const expRow = findRowByLabel(summary, "Total Expenses");
    const niLabels = ["Net Income", "Net Surplus", "Change in Net Assets"];
    let niRow = -1;
    for (const l of niLabels) { niRow = findRowByLabel(summary, l); if (niRow > 0) break; }

    check(`${name} WB: Y1 Revenue`, cellNum(summary, revRow, 2), exp.y1Rev);
    check(`${name} WB: Y5 Revenue`, cellNum(summary, revRow, 6), exp.y5Rev);
    check(`${name} WB: Y1 Personnel`, cellNum(summary, persRow, 2), exp.y1Pers);
    check(`${name} WB: Y1 OpEx`, cellNum(summary, opexRow, 2), exp.y1Opex);
    check(`${name} WB: Y1 Cap&Debt`, cellNum(summary, cdRow, 2), exp.y1CD);
    check(`${name} WB: Y1 Total Expenses`, cellNum(summary, expRow, 2), exp.y1TotalExp);
    if (niRow > 0) {
      check(`${name} WB: Y1 Net Income`, cellNum(summary, niRow, 2), exp.y1NI);
      check(`${name} WB: Y5 Net Income`, cellNum(summary, niRow, 6), exp.y5NI);
    }

    const computedTotalExp = cellNum(summary, persRow, 2) + cellNum(summary, opexRow, 2) + cellNum(summary, cdRow, 2);
    check(`${name} WB: Total Exp tie-out`, cellNum(summary, expRow, 2), computedTotalExp, 2);

    const opStmt = wb.getWorksheet("Operating Statement");
    if (opStmt) {
      const osRevRow = findRowByLabel(opStmt, "Total Revenue");
      const osExpRow = findRowByLabel(opStmt, "Total Expenses");
      if (osRevRow > 0) check(`${name} WB: OpStmt Rev matches`, cellNum(opStmt, osRevRow, 2), exp.y1Rev, 2);
      if (osExpRow > 0) check(`${name} WB: OpStmt Exp matches`, cellNum(opStmt, osExpRow, 2), exp.y1TotalExp, 2);
    }

    const dscr = wb.getWorksheet("DSCR & Covenants");
    if (dscr) {
      const dsRow = findRowByLabel(dscr, "Debt Service");
      if (dsRow > 0) check(`${name} WB: DSCR Debt Service`, cellNum(dscr, dsRow, 2), exp.y1DebtSvc);
      const dscrRow = findRowByLabel(dscr, "DSCR");
      if (dscrRow > 0) {
        const dscrVal = dscr.getCell(dscrRow, 2).value;
        if (exp.y1DSCR === "N/A") {
          check(`${name} WB: DSCR N/A`, dscrVal === "N/A" || (typeof dscrVal === "object" && dscrVal !== null && (dscrVal as any).result === "N/A") ? 1 : 0, 1);
        } else {
          const actualDscr = cellNum(dscr, dscrRow, 2);
          check(`${name} WB: Y1 DSCR`, Math.round(actualDscr * 100), Math.round((exp.y1DSCR as number) * 100));
        }
      }
    }

    const mcf = wb.getWorksheet("Monthly Cash Flow Y1");
    if (mcf) {
      let ecRow = findRowByLabel(mcf, "Ending Cash (Month 12)", 1, 25);
      if (ecRow < 0) ecRow = findRowByLabel(mcf, "Ending Cash", 1, 25);
      if (ecRow > 0) check(`${name} WB: Y1 Ending Cash`, cellNum(mcf, ecRow, 2), exp.y1EndingCash);
    }

    const balSheet = wb.getWorksheet("Balance Sheet");
    if (balSheet) {
      const taRow = findRowByLabel(balSheet, "Total Assets");
      let tlRow = findRowByLabel(balSheet, "Total Liabilities & Equity");
      if (tlRow < 0) tlRow = findRowByLabel(balSheet, "Total Liabilities & Net Assets");
      if (taRow > 0 && tlRow > 0) {
        check(`${name} WB: Balance Sheet ties`, cellNum(balSheet, taRow, 2), cellNum(balSheet, tlRow, 2), 2);
      }
    }
  }
}

async function testMonthlyTimingWorkbook() {
  console.log("\n— Monthly Timing Workbook Assertions —");

  // Microschool: partial year (10 opMonths), tuition billed over 10 months starting month 1
  const microWb = await generateUnderwritingWorkbook(microschoolStartup as unknown as Record<string, unknown>);
  const microMcf = microWb.getWorksheet("Monthly Cash Flow Y1")!;
  const mRevRow = findRowByLabel(microMcf, "Total Revenue", 1, 20);
  const mPersRow = findRowByLabel(microMcf, "Personnel", 1, 20);
  const mOpsRow = findRowByLabel(microMcf, "Operating Expenses", 1, 20);
  const mDebtRow = findRowByLabel(microMcf, "Debt Service", 1, 20);

  // Personnel spread over 10 opMonths: M1-M10 = 11893, M11-M12 = 0
  check("Micro MCF: Personnel M1", cellNum(microMcf, mPersRow, 2), 11893);
  check("Micro MCF: Personnel M10", cellNum(microMcf, mPersRow, 11), 11893);
  check("Micro MCF: Personnel M11 (zero)", cellNum(microMcf, mPersRow, 12), 0);
  check("Micro MCF: Personnel M12 (zero)", cellNum(microMcf, mPersRow, 13), 0);

  // OpEx spread over 10 opMonths: M1-M10 = 4050, M11-M12 = 0
  check("Micro MCF: OpEx M1", cellNum(microMcf, mOpsRow, 2), 4050);
  check("Micro MCF: OpEx M11 (zero)", cellNum(microMcf, mOpsRow, 12), 0);

  // Debt service: zero (no debt) — all 12 months
  check("Micro MCF: Debt M1 (zero)", cellNum(microMcf, mDebtRow, 2), 0);
  check("Micro MCF: Debt M6 (zero)", cellNum(microMcf, mDebtRow, 7), 0);

  // Revenue M1 (non-tuition only, tuition starts M2): 9150
  check("Micro MCF: Rev M1", cellNum(microMcf, mRevRow, 2), 9150);
  // Revenue M2-M10 (tuition + non-tuition): 23550
  check("Micro MCF: Rev M2", cellNum(microMcf, mRevRow, 3), 23550);
  // Annual total: 236000
  check("Micro MCF: Rev Annual", cellNum(microMcf, mRevRow, 14), 236000);

  // Private+ESA: full year (12 opMonths), debt service spread over 12 months
  const privWb = await generateUnderwritingWorkbook(privateSchoolWithESA as unknown as Record<string, unknown>);
  const privMcf = privWb.getWorksheet("Monthly Cash Flow Y1")!;
  const pPersRow = findRowByLabel(privMcf, "Personnel", 1, 20);
  const pDebtRow = findRowByLabel(privMcf, "Debt Service", 1, 20);

  // Personnel spread over 12 months (full year)
  check("Priv MCF: Personnel M1", cellNum(privMcf, pPersRow, 2), 71231);
  check("Priv MCF: Personnel M12", cellNum(privMcf, pPersRow, 13), 71231);

  // Debt service spread over 12 months always (4922/month)
  check("Priv MCF: Debt M1", cellNum(privMcf, pDebtRow, 2), 4922);
  check("Priv MCF: Debt M12", cellNum(privMcf, pDebtRow, 13), 4922);
  check("Priv MCF: Debt Annual", cellNum(privMcf, pDebtRow, 14), 59064);

  // Ending cash metric
  const pEndRow = findRowByLabel(privMcf, "Ending Cash (Month 12)", 1, 25);
  if (pEndRow > 0) check("Priv MCF: Ending Cash", cellNum(privMcf, pEndRow, 2), 864756);
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║               GOLDEN MODEL REGRESSION TESTS                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  testMicroschoolStartup();
  testPrivateSchoolWithESA();
  testCharterPublicFunding();
  testCharterADAGradeBand();
  testDebtServiceMath();
  testMonthlyTimingRules();
  testDebtIncludedExclusion();
  testGradeBandEdgeCases();
  testDriverValEdgeCases();
  await testWorkbookKPIs();
  await testMonthlyTimingWorkbook();

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                      FINAL REPORT                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`  Passed: ${passed} | Failed: ${failed}\n`);

  if (failures.length > 0) {
    for (const f of failures) console.log(f);
    console.log("");
    process.exit(1);
  } else {
    console.log("  All golden-model assertions passed.\n");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
