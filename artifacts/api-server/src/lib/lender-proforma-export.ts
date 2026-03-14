// @ts-ignore — xlsx-populate has no type definitions
import XlsxPopulate from "xlsx-populate";

interface SchoolProfile {
  schoolName?: string;
  state?: string;
  schoolType?: string;
  schoolTypeOther?: string;
  openingYear?: number;
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
}

interface RevenueRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  percentBase?: string;
  collectionRate?: number;
}

interface StaffingRow {
  id: string;
  roleName: string;
  functionCategory: string;
  employmentType: string;
  fte: number;
  annualizedRate: number;
  benefitsEligible: boolean;
  benefitsRate: number;
  payrollTaxRate: number;
  payrollLike: boolean;
}

interface ExpenseRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
}

interface CapitalDebtRow {
  id: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  isLoan?: boolean;
  loanPrincipal?: number;
  loanRate?: number;
  loanTermYears?: number;
}

interface PriorYearSnapshot {
  endingCash?: number;
}

interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  revenueRows?: RevenueRow[];
  staffingRows?: StaffingRow[];
  expenseRows?: ExpenseRow[];
  capitalAndDebtRows?: CapitalDebtRow[];
  priorYearSnapshot?: PriorYearSnapshot;
}

const SCHOOL_TYPE_DISPLAY: Record<string, string> = {
  charter_school: "Charter School",
  homeschool_coop: "Homeschool Co-Op",
  learning_pod: "Learning Pod",
  microschool: "Microschool",
  private_school: "Private School",
  tutoring_center: "Tutoring Center",
  other: "Other",
};

function inferGrowthRate(amounts: number[], yearIdx0: number, yearIdx1: number): number {
  const v0 = amounts?.[yearIdx0] ?? 0;
  const v1 = amounts?.[yearIdx1] ?? 0;
  if (v0 <= 0 || v1 <= 0) return 0;
  return (v1 - v0) / v0;
}

function computeDriverValue(amounts: number[] | undefined, yearIdx: number, driverType: string, students: number): number {
  const base = amounts?.[yearIdx] ?? 0;
  switch (driverType) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "annual_fixed": return base;
    default: return base;
  }
}

function sumExpenseCategoryY1(rows: ExpenseRow[], category: string, students: number, totalRevenue: number): number {
  let total = 0;
  for (const row of rows) {
    if (!row.enabled || row.category !== category) continue;
    if (row.driverType === "percent_of_revenue") {
      total += ((row.amounts?.[0] ?? 0) / 100) * totalRevenue;
    } else {
      total += computeDriverValue(row.amounts, 0, row.driverType, students);
    }
  }
  return total;
}

function avgExpenseGrowth(rows: ExpenseRow[], category: string, students1: number, students2: number, rev1: number, rev2: number): number {
  let sum0 = 0, sum1 = 0;
  for (const row of rows) {
    if (!row.enabled || row.category !== category) continue;
    if (row.driverType === "percent_of_revenue") {
      sum0 += ((row.amounts?.[0] ?? 0) / 100) * rev1;
      sum1 += ((row.amounts?.[1] ?? 0) / 100) * rev2;
    } else {
      sum0 += computeDriverValue(row.amounts, 0, row.driverType, students1);
      sum1 += computeDriverValue(row.amounts, 1, row.driverType, students2);
    }
  }
  if (sum0 <= 0 || sum1 <= 0) return 0.03;
  return (sum1 - sum0) / sum0;
}

function computeRevenueY(rows: RevenueRow[], yearIdx: number, students: number): number {
  const rowValues = new Map<string, number>();
  for (const row of rows) {
    if (!row.enabled || row.driverType === "percent_of_base") continue;
    rowValues.set(row.id, computeDriverValue(row.amounts, yearIdx, row.driverType, students));
  }
  for (const row of rows) {
    if (!row.enabled || row.driverType !== "percent_of_base") continue;
    const baseVal = rowValues.get(row.percentBase || "") || 0;
    const pctVal = (row.amounts?.[yearIdx] ?? 0) / 100;
    rowValues.set(row.id, baseVal * pctVal);
  }
  let total = 0;
  for (const row of rows) {
    if (!row.enabled) continue;
    const val = rowValues.get(row.id) || 0;
    if (row.category === "tuition_offsets") {
      total -= val;
    } else {
      total += val;
    }
  }
  return total;
}

export function mapModelToTemplateInput(rawData: Record<string, unknown>): Record<string, string | number> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const revenueRows = data.revenueRows || [];
  const staffingRows = data.staffingRows || [];
  const expenseRows = data.expenseRows || [];
  const capDebtRows = data.capitalAndDebtRows || [];
  const prior = data.priorYearSnapshot;

  const enrollY1 = en.year1 || 0;
  const enrollY2 = en.year2 || 0;

  const result: Record<string, string | number> = {};

  result.schoolName = sp.schoolName || "";
  result.state = sp.state || "";
  result.schoolType = SCHOOL_TYPE_DISPLAY[sp.schoolType || ""] || sp.schoolTypeOther || sp.schoolType || "";
  result.firstOperatingYear = sp.openingYear || new Date().getFullYear();

  result.enrollmentY1 = en.year1 || 0;
  result.enrollmentY2 = en.year2 || 0;
  result.enrollmentY3 = en.year3 || 0;
  result.enrollmentY4 = en.year4 || 0;
  result.enrollmentY5 = en.year5 || 0;

  const grossTuitionRow = revenueRows.find(r => r.id === "gross_tuition" && r.enabled);
  const tuitionY1PerStudent = grossTuitionRow?.driverType === "per_student"
    ? (grossTuitionRow.amounts?.[0] ?? 0)
    : (grossTuitionRow && enrollY1 > 0
      ? computeDriverValue(grossTuitionRow.amounts, 0, grossTuitionRow.driverType, enrollY1) / enrollY1
      : 0);
  result.tuitionPerStudentY1 = tuitionY1PerStudent;

  if (grossTuitionRow && grossTuitionRow.amounts?.length >= 2) {
    result.tuitionGrowthPct = inferGrowthRate(grossTuitionRow.amounts, 0, 1);
  } else {
    result.tuitionGrowthPct = 0.03;
  }

  const esaRow = revenueRows.find(r =>
    r.enabled && (r.category === "public_funding" || r.category === "school_choice") && r.driverType === "per_student"
  );
  result.esaPerStudentY1 = esaRow?.amounts?.[0] ?? 0;
  if (esaRow && esaRow.amounts?.length >= 2 && (esaRow.amounts[0] ?? 0) > 0) {
    result.esaGrowthPct = inferGrowthRate(esaRow.amounts, 0, 1);
  } else {
    result.esaGrowthPct = 0;
  }

  const otherEarnedRow = revenueRows.find(r =>
    r.enabled && r.category === "other_revenue" && r.driverType === "per_student"
  );
  result.otherEarnedPerStudentY1 = otherEarnedRow?.amounts?.[0] ?? 0;
  if (otherEarnedRow && otherEarnedRow.amounts?.length >= 2 && (otherEarnedRow.amounts[0] ?? 0) > 0) {
    result.otherEarnedGrowthPct = inferGrowthRate(otherEarnedRow.amounts, 0, 1);
  } else {
    result.otherEarnedGrowthPct = 0.02;
  }

  const collectionRow = grossTuitionRow;
  result.collectionRatePct = (collectionRow as RevenueRow)?.collectionRate
    ? (collectionRow as RevenueRow).collectionRate! / 100
    : 0.95;

  let grantsY1 = 0;
  for (const row of revenueRows) {
    if (!row.enabled || row.category !== "grants_contributions") continue;
    if (row.driverType === "percent_of_base") {
      const baseRow = revenueRows.find(r => r.id === row.percentBase);
      const baseVal = baseRow ? computeDriverValue(baseRow.amounts, 0, baseRow.driverType, enrollY1) : 0;
      grantsY1 += baseVal * ((row.amounts?.[0] ?? 0) / 100);
    } else {
      grantsY1 += computeDriverValue(row.amounts, 0, row.driverType, enrollY1);
    }
  }
  result.grantsY1 = grantsY1;
  result.grantsGrowthPct = 0;

  const instructionalRows = staffingRows.filter(r => r.functionCategory === "instructional");
  const nonInstructionalRows = staffingRows.filter(r => r.functionCategory !== "instructional");

  const totalInstructionalFte = instructionalRows.reduce((sum, r) => sum + r.fte, 0);
  result.studentsPerTeacher = totalInstructionalFte > 0 ? Math.round(enrollY1 / totalInstructionalFte) : 12;

  const avgTeacherSalary = instructionalRows.length > 0
    ? instructionalRows.reduce((sum, r) => sum + r.annualizedRate, 0) / instructionalRows.length
    : 0;
  result.teacherSalaryY1 = Math.round(avgTeacherSalary);
  result.teacherSalaryGrowthPct = 0.03;

  const totalAdminFte = nonInstructionalRows.reduce((sum, r) => sum + r.fte, 0);
  result.adminFteY1 = totalAdminFte;
  result.adminFteY2 = totalAdminFte;
  result.adminFteY3 = totalAdminFte;
  result.adminFteY4 = totalAdminFte;
  result.adminFteY5 = totalAdminFte;

  const avgAdminSalary = nonInstructionalRows.length > 0
    ? nonInstructionalRows.reduce((sum, r) => sum + r.annualizedRate, 0) / nonInstructionalRows.length
    : 0;
  result.adminSalaryY1 = Math.round(avgAdminSalary);
  result.adminSalaryGrowthPct = 0.03;

  const allBenefitsRates = staffingRows.filter(r => r.benefitsEligible).map(r => r.benefitsRate);
  const avgBenefits = allBenefitsRates.length > 0
    ? allBenefitsRates.reduce((a, b) => a + b, 0) / allBenefitsRates.length
    : 10;
  result.benefitsBurdenPct = avgBenefits / 100;

  const revY1 = revenueRows.length > 0 ? computeRevenueY(revenueRows, 0, enrollY1) : 0;
  const revY2 = revenueRows.length > 0 ? computeRevenueY(revenueRows, 1, enrollY2) : 0;

  const facilityY1 = sumExpenseCategoryY1(expenseRows, "occupancy_facility", enrollY1, revY1);
  const rentRow = expenseRows.find(r => r.enabled && r.category === "occupancy_facility" && r.lineItem.toLowerCase().includes("rent"));
  result.annualRentY1 = rentRow
    ? computeDriverValue(rentRow.amounts, 0, rentRow.driverType, enrollY1)
    : facilityY1;
  const otherFacility = rentRow ? facilityY1 - (result.annualRentY1 as number) : 0;
  result.otherFacilityCostY1 = Math.max(0, otherFacility);

  if (expenseRows.some(r => r.enabled && r.category === "occupancy_facility" && r.amounts?.length >= 2)) {
    result.rentGrowthPct = avgExpenseGrowth(expenseRows, "occupancy_facility", enrollY1, enrollY2, revY1, revY2);
    result.otherFacilityCostGrowthPct = result.rentGrowthPct as number;
  } else {
    result.rentGrowthPct = 0.03;
    result.otherFacilityCostGrowthPct = 0.03;
  }

  const programY1 = sumExpenseCategoryY1(expenseRows, "instructional_program", enrollY1, revY1);
  result.programCostPerStudentY1 = enrollY1 > 0 ? Math.round(programY1 / enrollY1) : 0;
  if (expenseRows.some(r => r.enabled && r.category === "instructional_program" && r.amounts?.length >= 2)) {
    result.programCostGrowthPct = avgExpenseGrowth(expenseRows, "instructional_program", enrollY1, enrollY2, revY1, revY2);
  } else {
    result.programCostGrowthPct = 0.03;
  }

  const otherCategories = ["technology", "administrative_general"];
  let fixedOpsY1 = 0;
  for (const cat of otherCategories) {
    fixedOpsY1 += sumExpenseCategoryY1(expenseRows, cat, enrollY1, revY1);
  }
  result.fixedOperatingCostY1 = Math.round(fixedOpsY1);
  result.fixedOperatingCostGrowthPct = 0.03;

  result.startingCash = prior?.endingCash ?? 0;

  let existingDebt = 0;
  let proposedLoanAmount = 0;
  let proposedRate = 0.08;
  let proposedTerm = 5;
  let foundProposedLoan = false;

  for (const row of capDebtRows) {
    if (!row.enabled) continue;
    if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
      if (!foundProposedLoan) {
        proposedLoanAmount = row.loanPrincipal;
        proposedRate = (row.loanRate || 8) / 100;
        proposedTerm = row.loanTermYears || 5;
        foundProposedLoan = true;
      } else {
        const rate = (row.loanRate || 0) / 100;
        const term = row.loanTermYears || 0;
        existingDebt += computeAnnualDebtService(row.loanPrincipal, rate, term);
      }
    } else {
      existingDebt += computeDriverValue(row.amounts, 0, row.driverType, enrollY1);
    }
  }

  result.existingAnnualDebtService = Math.round(existingDebt);
  result.proposedLoanAmount = proposedLoanAmount;
  result.interestRatePct = proposedRate;
  result.termYears = proposedTerm;

  return result;
}

function computeAnnualDebtService(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (annualRate <= 0) return principal / termYears;
  const monthlyRate = annualRate / 12;
  const months = termYears * 12;
  const mp = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return mp * 12;
}

const NAVY = "1E293B";
const AMBER = "D97706";
const TEAL = "0D9488";
const WHITE = "FFFFFF";
const CREAM = "FAF9F7";
const LIGHT_GRAY = "F1F5F9";
const MEDIUM_GRAY = "94A3B8";

function fmt(val: number | string, type: "currency" | "pct" | "int" | "text"): string | number {
  if (type === "text") return String(val);
  const n = Number(val);
  if (isNaN(n)) return 0;
  if (type === "pct") return n;
  if (type === "int") return Math.round(n);
  return Math.round(n);
}

function applyGrowth(base: number, rate: number, years: number): number {
  return base * Math.pow(1 + rate, years);
}

export async function generateLenderProFormaWorkbook(rawData: Record<string, unknown>): Promise<Buffer> {
  const input = mapModelToTemplateInput(rawData);
  const workbook = await XlsxPopulate.fromBlankAsync();

  const schoolName = String(input.schoolName || "School");
  const state = String(input.state || "");
  const schoolType = String(input.schoolType || "");
  const openingYear = Number(input.firstOperatingYear || new Date().getFullYear());

  const enrollments = [
    Number(input.enrollmentY1 || 0),
    Number(input.enrollmentY2 || 0),
    Number(input.enrollmentY3 || 0),
    Number(input.enrollmentY4 || 0),
    Number(input.enrollmentY5 || 0),
  ];

  const tuitionPerStudent = Number(input.tuitionPerStudentY1 || 0);
  const tuitionGrowth = Number(input.tuitionGrowthPct || 0.03);
  const esaPerStudent = Number(input.esaPerStudentY1 || 0);
  const esaGrowth = Number(input.esaGrowthPct || 0);
  const otherPerStudent = Number(input.otherEarnedPerStudentY1 || 0);
  const otherGrowth = Number(input.otherEarnedGrowthPct || 0.02);
  const collectionRate = Number(input.collectionRatePct || 0.95);
  const grantsY1 = Number(input.grantsY1 || 0);
  const grantsGrowthPct = Number(input.grantsGrowthPct || 0);

  const studentsPerTeacher = Number(input.studentsPerTeacher || 12);
  const teacherSalary = Number(input.teacherSalaryY1 || 0);
  const teacherSalaryGrowth = Number(input.teacherSalaryGrowthPct || 0.03);
  const adminFtes = [
    Number(input.adminFteY1 || 0),
    Number(input.adminFteY2 || 0),
    Number(input.adminFteY3 || 0),
    Number(input.adminFteY4 || 0),
    Number(input.adminFteY5 || 0),
  ];
  const adminSalary = Number(input.adminSalaryY1 || 0);
  const adminSalaryGrowth = Number(input.adminSalaryGrowthPct || 0.03);
  const benefitsBurden = Number(input.benefitsBurdenPct || 0.1);

  const annualRent = Number(input.annualRentY1 || 0);
  const rentGrowth = Number(input.rentGrowthPct || 0.03);
  const otherFacility = Number(input.otherFacilityCostY1 || 0);
  const otherFacilityGrowth = Number(input.otherFacilityCostGrowthPct || 0.03);
  const programPerStudent = Number(input.programCostPerStudentY1 || 0);
  const programGrowth = Number(input.programCostGrowthPct || 0.03);
  const fixedOps = Number(input.fixedOperatingCostY1 || 0);
  const fixedOpsGrowth = Number(input.fixedOperatingCostGrowthPct || 0.03);

  const startingCash = Number(input.startingCash || 0);
  const existingDebtService = Number(input.existingAnnualDebtService || 0);
  const proposedLoan = Number(input.proposedLoanAmount || 0);
  const loanRate = Number(input.interestRatePct || 0.08);
  const loanTerm = Number(input.termYears || 5);

  const proposedDebtService = proposedLoan > 0 ? computeAnnualDebtService(proposedLoan, loanRate, loanTerm) : 0;

  const years = 5;
  const yearLabels = Array.from({ length: years }, (_, i) => `Year ${i + 1} (${openingYear + i})`);

  const revenueByYear: number[] = [];
  const staffingByYear: number[] = [];
  const opexByYear: number[] = [];
  const totalExpByYear: number[] = [];
  const noiByYear: number[] = [];
  const netIncomeByYear: number[] = [];
  const cashFlowByYear: number[] = [];
  const dscrByYear: number[] = [];

  for (let y = 0; y < years; y++) {
    const students = enrollments[y] || 0;
    const tuition = students * applyGrowth(tuitionPerStudent, tuitionGrowth, y) * collectionRate;
    const esa = students * applyGrowth(esaPerStudent, esaGrowth, y);
    const other = students * applyGrowth(otherPerStudent, otherGrowth, y);
    const grants = applyGrowth(grantsY1, grantsGrowthPct, y);
    const totalRev = tuition + esa + other + grants;
    revenueByYear.push(totalRev);

    const teacherFte = students > 0 ? Math.ceil(students / studentsPerTeacher) : 0;
    const tSalary = teacherFte * applyGrowth(teacherSalary, teacherSalaryGrowth, y);
    const aSalary = (adminFtes[y] || 0) * applyGrowth(adminSalary, adminSalaryGrowth, y);
    const totalSalaries = tSalary + aSalary;
    const benefits = totalSalaries * benefitsBurden;
    const totalStaffing = totalSalaries + benefits;
    staffingByYear.push(totalStaffing);

    const rent = applyGrowth(annualRent, rentGrowth, y);
    const otherFac = applyGrowth(otherFacility, otherFacilityGrowth, y);
    const program = students * applyGrowth(programPerStudent, programGrowth, y);
    const fixed = applyGrowth(fixedOps, fixedOpsGrowth, y);
    const totalOpex = rent + otherFac + program + fixed;
    opexByYear.push(totalOpex);

    const totalExp = totalStaffing + totalOpex;
    totalExpByYear.push(totalExp);

    const noi = totalRev - totalExp;
    noiByYear.push(noi);

    const totalDebtSvc = existingDebtService + proposedDebtService;
    const netIncome = noi - totalDebtSvc;
    netIncomeByYear.push(netIncome);
    cashFlowByYear.push(netIncome);

    dscrByYear.push(totalDebtSvc > 0 ? noi / totalDebtSvc : noi > 0 ? 99.9 : 0);
  }

  const sheet = workbook.sheet(0);
  sheet.name("Pro Forma P&L");

  sheet.column("A").width(4);
  sheet.column("B").width(36);
  sheet.column("C").width(18);
  sheet.column("D").width(18);
  sheet.column("E").width(18);
  sheet.column("F").width(18);
  sheet.column("G").width(18);

  let row = 1;

  const setCell = (r: number, c: string, val: string | number, opts?: { bold?: boolean; bg?: string; fg?: string; fontSize?: number; numFmt?: string; border?: boolean; align?: string }) => {
    const cell = sheet.cell(`${c}${r}`);
    cell.value(val);
    if (opts?.bold) cell.style("bold", true);
    if (opts?.bg) cell.style("fill", { type: "solid", color: opts.bg });
    if (opts?.fg) cell.style("fontColor", opts.fg);
    if (opts?.fontSize) cell.style("fontSize", opts.fontSize);
    if (opts?.numFmt) cell.style("numberFormat", opts.numFmt);
    if (opts?.align) cell.style("horizontalAlignment", opts.align);
  };

  const setHeaderRow = (r: number, label: string, bg: string, fg: string) => {
    setCell(r, "B", label, { bold: true, bg, fg, fontSize: 11 });
    for (const c of ["C", "D", "E", "F", "G"]) {
      setCell(r, c, "", { bg, fg });
    }
  };

  const setDataRow = (r: number, label: string, values: number[], numFmt: string, bg?: string) => {
    setCell(r, "B", label, { bg: bg || CREAM });
    for (let i = 0; i < values.length; i++) {
      const col = String.fromCharCode(67 + i);
      setCell(r, col, Math.round(values[i]), { numFmt, bg: bg || CREAM, align: "right" });
    }
  };

  sheet.range(`B${row}:G${row}`).merged(true);
  setCell(row, "B", `${schoolName} — Lender Pro Forma`, { bold: true, fontSize: 16, fg: NAVY });
  row++;

  setCell(row, "B", "Prepared by SchoolStack Budget", { fg: MEDIUM_GRAY, fontSize: 9 });
  row++;

  setCell(row, "B", `${schoolType} | ${state} | Opening ${openingYear}`, { fg: MEDIUM_GRAY, fontSize: 10 });
  row += 2;

  setCell(row, "B", "", { bold: true, bg: NAVY, fg: WHITE });
  for (let i = 0; i < years; i++) {
    const col = String.fromCharCode(67 + i);
    setCell(row, col, yearLabels[i], { bold: true, bg: NAVY, fg: WHITE, align: "center" });
  }
  const headerRow = row;
  row++;

  setHeaderRow(row, "ENROLLMENT", TEAL, WHITE);
  for (let i = 0; i < years; i++) {
    const col = String.fromCharCode(67 + i);
    setCell(row, col, "Students", { bg: TEAL, fg: WHITE, bold: true, align: "center" });
  }
  row++;

  setDataRow(row, "Total Students", enrollments, "#,##0");
  row += 2;

  setHeaderRow(row, "REVENUE", TEAL, WHITE);
  for (let i = 0; i < years; i++) {
    const col = String.fromCharCode(67 + i);
    setCell(row, col, "", { bg: TEAL, fg: WHITE });
  }
  row++;

  const tuitionByYear = enrollments.map((s, y) => s * applyGrowth(tuitionPerStudent, tuitionGrowth, y) * collectionRate);
  setDataRow(row, "Tuition Revenue (Net)", tuitionByYear, "$#,##0");
  row++;

  const esaByYear = enrollments.map((s, y) => s * applyGrowth(esaPerStudent, esaGrowth, y));
  if (esaPerStudent > 0) {
    setDataRow(row, "ESA / School Choice Revenue", esaByYear, "$#,##0");
    row++;
  }

  const otherRevByYear = enrollments.map((s, y) => s * applyGrowth(otherPerStudent, otherGrowth, y));
  if (otherPerStudent > 0) {
    setDataRow(row, "Other Earned Revenue", otherRevByYear, "$#,##0");
    row++;
  }

  if (grantsY1 > 0) {
    const grantsByYear = Array.from({ length: years }, (_, y) => applyGrowth(grantsY1, grantsGrowthPct, y));
    setDataRow(row, "Grants & Contributions", grantsByYear, "$#,##0");
    row++;
  }

  setDataRow(row, "Total Revenue", revenueByYear, "$#,##0", LIGHT_GRAY);
  setCell(row, "B", "Total Revenue", { bold: true, bg: LIGHT_GRAY });
  row += 2;

  setHeaderRow(row, "STAFFING COSTS", AMBER, WHITE);
  for (let i = 0; i < years; i++) {
    const col = String.fromCharCode(67 + i);
    setCell(row, col, "", { bg: AMBER, fg: WHITE });
  }
  row++;

  const teacherCostByYear = enrollments.map((s, y) => {
    const fte = s > 0 ? Math.ceil(s / studentsPerTeacher) : 0;
    return fte * applyGrowth(teacherSalary, teacherSalaryGrowth, y);
  });
  setDataRow(row, "Instructional Salaries", teacherCostByYear, "$#,##0");
  row++;

  const adminCostByYear = adminFtes.map((fte, y) => fte * applyGrowth(adminSalary, adminSalaryGrowth, y));
  setDataRow(row, "Administrative Salaries", adminCostByYear, "$#,##0");
  row++;

  const benefitsByYear = staffingByYear.map((s, y) => {
    const salaries = teacherCostByYear[y] + adminCostByYear[y];
    return salaries * benefitsBurden;
  });
  setDataRow(row, "Benefits & Payroll Taxes", benefitsByYear, "$#,##0");
  row++;

  setDataRow(row, "Total Staffing", staffingByYear, "$#,##0", LIGHT_GRAY);
  setCell(row, "B", "Total Staffing", { bold: true, bg: LIGHT_GRAY });
  row += 2;

  setHeaderRow(row, "OPERATING EXPENSES", AMBER, WHITE);
  for (let i = 0; i < years; i++) {
    const col = String.fromCharCode(67 + i);
    setCell(row, col, "", { bg: AMBER, fg: WHITE });
  }
  row++;

  const rentByYear = Array.from({ length: years }, (_, y) => applyGrowth(annualRent, rentGrowth, y));
  setDataRow(row, "Rent / Lease", rentByYear, "$#,##0");
  row++;

  if (otherFacility > 0) {
    const otherFacByYear = Array.from({ length: years }, (_, y) => applyGrowth(otherFacility, otherFacilityGrowth, y));
    setDataRow(row, "Other Facility Costs", otherFacByYear, "$#,##0");
    row++;
  }

  const programByYear = enrollments.map((s, y) => s * applyGrowth(programPerStudent, programGrowth, y));
  if (programPerStudent > 0) {
    setDataRow(row, "Program / Curriculum", programByYear, "$#,##0");
    row++;
  }

  const fixedByYear = Array.from({ length: years }, (_, y) => applyGrowth(fixedOps, fixedOpsGrowth, y));
  setDataRow(row, "G&A / Technology", fixedByYear, "$#,##0");
  row++;

  setDataRow(row, "Total Operating Expenses", opexByYear, "$#,##0", LIGHT_GRAY);
  setCell(row, "B", "Total Operating Expenses", { bold: true, bg: LIGHT_GRAY });
  row += 2;

  setDataRow(row, "Total Expenses", totalExpByYear, "$#,##0", LIGHT_GRAY);
  setCell(row, "B", "Total Expenses", { bold: true, bg: LIGHT_GRAY });
  row++;

  setHeaderRow(row, "NET OPERATING INCOME", NAVY, WHITE);
  for (let i = 0; i < years; i++) {
    const col = String.fromCharCode(67 + i);
    setCell(row, col, Math.round(noiByYear[i]), { bold: true, bg: NAVY, fg: WHITE, numFmt: "$#,##0", align: "right" });
  }
  row++;

  const marginByYear = revenueByYear.map((r, i) => r > 0 ? noiByYear[i] / r : 0);
  setCell(row, "B", "Operating Margin", { fg: MEDIUM_GRAY });
  for (let i = 0; i < years; i++) {
    const col = String.fromCharCode(67 + i);
    setCell(row, col, marginByYear[i], { numFmt: "0.0%", align: "right", fg: MEDIUM_GRAY });
  }
  row += 2;

  if (proposedLoan > 0 || existingDebtService > 0) {
    setHeaderRow(row, "DEBT SERVICE & COVERAGE", NAVY, WHITE);
    for (let i = 0; i < years; i++) {
      const col = String.fromCharCode(67 + i);
      setCell(row, col, "", { bg: NAVY, fg: WHITE });
    }
    row++;

    if (existingDebtService > 0) {
      const existDebtArr = Array(years).fill(Math.round(existingDebtService));
      setDataRow(row, "Existing Debt Service", existDebtArr, "$#,##0");
      row++;
    }

    if (proposedLoan > 0) {
      const propDebtArr = Array(years).fill(Math.round(proposedDebtService));
      setDataRow(row, `Proposed Loan Service ($${(proposedLoan / 1000).toFixed(0)}K @ ${(loanRate * 100).toFixed(1)}%)`, propDebtArr, "$#,##0");
      row++;
    }

    const totalDebt = existingDebtService + proposedDebtService;
    const totalDebtArr = Array(years).fill(Math.round(totalDebt));
    setDataRow(row, "Total Debt Service", totalDebtArr, "$#,##0", LIGHT_GRAY);
    setCell(row, "B", "Total Debt Service", { bold: true, bg: LIGHT_GRAY });
    row++;

    setCell(row, "B", "DSCR", { bold: true });
    for (let i = 0; i < years; i++) {
      const col = String.fromCharCode(67 + i);
      const dscr = dscrByYear[i];
      const color = dscr >= 1.25 ? "16A34A" : dscr >= 1.0 ? AMBER : "DC2626";
      setCell(row, col, dscr > 50 ? "N/A" : Number(dscr.toFixed(2)), { bold: true, fg: color, align: "right", numFmt: dscr > 50 ? "@" : "0.00x" });
    }
    row++;

    setDataRow(row, "Net Income After Debt", netIncomeByYear, "$#,##0");
    row += 2;
  }

  setHeaderRow(row, "CUMULATIVE CASH POSITION", TEAL, WHITE);
  for (let i = 0; i < years; i++) {
    const col = String.fromCharCode(67 + i);
    setCell(row, col, "", { bg: TEAL, fg: WHITE });
  }
  row++;

  if (startingCash > 0) {
    setCell(row, "B", "Starting Cash", { bg: CREAM });
    setCell(row, "C", Math.round(startingCash), { numFmt: "$#,##0", bg: CREAM, align: "right" });
    row++;
  }

  let cumCash = startingCash;
  const cumCashByYear: number[] = [];
  for (let y = 0; y < years; y++) {
    cumCash += cashFlowByYear[y];
    cumCashByYear.push(cumCash);
  }
  setDataRow(row, "Cumulative Cash", cumCashByYear, "$#,##0", LIGHT_GRAY);
  setCell(row, "B", "Cumulative Cash", { bold: true, bg: LIGHT_GRAY });
  row += 2;

  sheet.range(`B${row}:G${row}`).merged(true);
  setCell(row, "B", `Generated by SchoolStack Budget on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, {
    fg: MEDIUM_GRAY, fontSize: 8,
  });

  sheet.freezePanes(headerRow, 2);

  const buffer = await workbook.outputAsync();
  return Buffer.from(buffer);
}
