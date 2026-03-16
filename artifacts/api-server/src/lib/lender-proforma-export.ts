import path from "path";
import fs from "fs";
// @ts-ignore — xlsx-populate has no type definitions
import XlsxPopulate from "xlsx-populate";

function resolveTemplatePath(): string {
  const templateName = "SchoolStack_Prelaunch_ProForma_Template_v1.xlsx";
  const candidates = [
    path.join(process.cwd(), "artifacts", "api-server", "src", "templates", templateName),
    path.join(process.cwd(), "src", "templates", templateName),
    path.join(process.cwd(), "templates", templateName),
    path.join(process.cwd(), "dist", "templates", templateName),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const TEMPLATE_PATH = resolveTemplatePath();

const CELL_MAP: Record<string, string> = {
  schoolName: "D5",
  state: "D6",
  schoolType: "D7",
  firstOperatingYear: "D8",
  enrollmentY1: "D12",
  enrollmentY2: "D13",
  enrollmentY3: "D14",
  enrollmentY4: "D15",
  enrollmentY5: "D16",
  tuitionPerStudentY1: "D20",
  tuitionGrowthPct: "D21",
  esaPerStudentY1: "D22",
  esaGrowthPct: "D23",
  otherEarnedPerStudentY1: "D24",
  otherEarnedGrowthPct: "D25",
  collectionRatePct: "D26",
  grantsY1: "D27",
  grantsGrowthPct: "D28",
  studentsPerTeacher: "D32",
  teacherSalaryY1: "D33",
  teacherSalaryGrowthPct: "D34",
  adminFteY1: "D35",
  adminFteY2: "D36",
  adminFteY3: "D37",
  adminFteY4: "D38",
  adminFteY5: "D39",
  adminSalaryY1: "D40",
  adminSalaryGrowthPct: "D41",
  benefitsBurdenPct: "D42",
  annualRentY1: "D46",
  rentGrowthPct: "D47",
  otherFacilityCostY1: "D48",
  otherFacilityCostGrowthPct: "D49",
  programCostPerStudentY1: "D50",
  programCostGrowthPct: "D51",
  fixedOperatingCostY1: "D52",
  fixedOperatingCostGrowthPct: "D53",
  startingCash: "D57",
  existingAnnualDebtService: "D58",
  proposedLoanAmount: "D59",
  interestRatePct: "D60",
  termYears: "D61",
};

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
  paymentTiming?: string;
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

const PAYMENT_TIMING_RATES: Record<string, number> = {
  upfront: 1.0,
  monthly: 0.95,
  quarterly: 0.97,
  semester: 0.98,
  annual: 1.0,
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

function avgExpenseGrowth(rows: ExpenseRow[], categories: string[], students1: number, students2: number, rev1: number, rev2: number): number {
  let sum0 = 0, sum1 = 0;
  for (const row of rows) {
    if (!row.enabled || !categories.includes(row.category)) continue;
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

const FACILITY_CATEGORIES = ["occupancy_facility"];
const PROGRAM_CATEGORIES = ["instructional_program"];

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

  const esaRows = revenueRows.filter(r =>
    r.enabled && (r.category === "public_funding" || r.category === "school_choice") && r.driverType === "per_student"
  );
  let esaTotal = 0;
  for (const row of esaRows) esaTotal += (row.amounts?.[0] ?? 0);
  result.esaPerStudentY1 = esaTotal;
  if (esaRows.length > 0 && esaTotal > 0) {
    let esaY2 = 0;
    for (const row of esaRows) esaY2 += (row.amounts?.[1] ?? row.amounts?.[0] ?? 0);
    result.esaGrowthPct = esaTotal > 0 ? (esaY2 - esaTotal) / esaTotal : 0;
  } else {
    result.esaGrowthPct = 0;
  }

  const otherEarnedRows = revenueRows.filter(r =>
    r.enabled && r.category === "other_revenue" && r.driverType === "per_student"
  );
  let otherTotal = 0;
  for (const row of otherEarnedRows) otherTotal += (row.amounts?.[0] ?? 0);
  result.otherEarnedPerStudentY1 = otherTotal;
  if (otherEarnedRows.length > 0 && otherTotal > 0) {
    let otherY2 = 0;
    for (const row of otherEarnedRows) otherY2 += (row.amounts?.[1] ?? row.amounts?.[0] ?? 0);
    result.otherEarnedGrowthPct = otherTotal > 0 ? (otherY2 - otherTotal) / otherTotal : 0;
  } else {
    result.otherEarnedGrowthPct = 0.02;
  }

  if (grossTuitionRow?.paymentTiming && PAYMENT_TIMING_RATES[grossTuitionRow.paymentTiming] !== undefined) {
    result.collectionRatePct = PAYMENT_TIMING_RATES[grossTuitionRow.paymentTiming];
  } else if ((grossTuitionRow as RevenueRow)?.collectionRate) {
    result.collectionRatePct = (grossTuitionRow as RevenueRow).collectionRate! / 100;
  } else {
    result.collectionRatePct = 0.95;
  }

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
    result.rentGrowthPct = avgExpenseGrowth(expenseRows, ["occupancy_facility"], enrollY1, enrollY2, revY1, revY2);
    result.otherFacilityCostGrowthPct = result.rentGrowthPct as number;
  } else {
    result.rentGrowthPct = 0.03;
    result.otherFacilityCostGrowthPct = 0.03;
  }

  const programY1 = sumExpenseCategoryY1(expenseRows, "instructional_program", enrollY1, revY1);
  result.programCostPerStudentY1 = enrollY1 > 0 ? Math.round(programY1 / enrollY1) : 0;
  if (expenseRows.some(r => r.enabled && r.category === "instructional_program" && r.amounts?.length >= 2)) {
    result.programCostGrowthPct = avgExpenseGrowth(expenseRows, ["instructional_program"], enrollY1, enrollY2, revY1, revY2);
  } else {
    result.programCostGrowthPct = 0.03;
  }

  const excludedCategories = new Set([...FACILITY_CATEGORIES, ...PROGRAM_CATEGORIES]);
  const allExpenseCategories = new Set(expenseRows.filter(r => r.enabled).map(r => r.category));
  const fixedOpsCategories = [...allExpenseCategories].filter(c => !excludedCategories.has(c));

  let fixedOpsY1 = 0;
  for (const cat of fixedOpsCategories) {
    fixedOpsY1 += sumExpenseCategoryY1(expenseRows, cat, enrollY1, revY1);
  }
  result.fixedOperatingCostY1 = Math.round(fixedOpsY1);

  if (fixedOpsCategories.length > 0 && expenseRows.some(r => r.enabled && fixedOpsCategories.includes(r.category) && r.amounts?.length >= 2)) {
    result.fixedOperatingCostGrowthPct = avgExpenseGrowth(expenseRows, fixedOpsCategories, enrollY1, enrollY2, revY1, revY2);
  } else {
    result.fixedOperatingCostGrowthPct = 0.03;
  }

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

function polishLenderWorkbook(workbook: any, schoolName: string) {
  const sheets = workbook.sheets();

  let coverSheet = sheets.find((s: any) => s.name() === "Cover");
  if (!coverSheet) {
    coverSheet = workbook.addSheet("Cover");
    workbook.moveSheet("Cover", 0);

    const NAVY = "1E293B";
    const GREEN = "328555";
    const GRAY = "6B7280";

    coverSheet.column("A").width(5);
    coverSheet.column("B").width(35);
    coverSheet.column("C").width(30);
    coverSheet.column("D").width(5);

    let r = 3;
    coverSheet.cell(`B${r}`).value("SCHOOLSTACK BUDGET").style({
      fontFamily: "Calibri", fontSize: 22, bold: true, fontColor: NAVY,
    });
    coverSheet.range(`B${r}:C${r}`).merged(true);

    r += 1;
    coverSheet.cell(`B${r}`).value("Lender-Ready Pro Forma").style({
      fontFamily: "Calibri", fontSize: 14, fontColor: GREEN,
    });
    coverSheet.range(`B${r}:C${r}`).merged(true);

    r += 2;
    coverSheet.cell(`B${r}`).value(schoolName || "Financial Model").style({
      fontFamily: "Calibri", fontSize: 16, bold: true, fontColor: NAVY,
    });
    coverSheet.range(`B${r}:C${r}`).merged(true);

    r += 2;
    coverSheet.cell(`B${r}`).value("TABLE OF CONTENTS").style({
      fontFamily: "Calibri", fontSize: 11, bold: true, fontColor: NAVY,
      bottomBorder: true, bottomBorderColor: GREEN, bottomBorderStyle: "medium",
    });
    coverSheet.range(`B${r}:C${r}`).merged(true);

    const tocSheets = workbook.sheets().filter((s: any) => s.name() !== "Cover");
    for (const sheet of tocSheets) {
      r++;
      coverSheet.cell(`B${r}`).value(sheet.name()).style({
        fontFamily: "Calibri", fontSize: 10, fontColor: "0563C1", underline: true,
      }).hyperlink({ sheet: sheet.name(), cell: "A1" });
    }

    r += 3;
    coverSheet.cell(`B${r}`).value(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`).style({
      fontFamily: "Calibri", fontSize: 9, italic: true, fontColor: GRAY,
    });
    coverSheet.range(`B${r}:C${r}`).merged(true);

    r += 1;
    coverSheet.cell(`B${r}`).value("Generated by SchoolStack Budget  •  budget.schoolstack.ai").style({
      fontFamily: "Calibri", fontSize: 9, italic: true, fontColor: GRAY,
    });
    coverSheet.range(`B${r}:C${r}`).merged(true);

    try {
      coverSheet.pageMargins("left", 0.75);
      coverSheet.pageMargins("right", 0.75);
      coverSheet.pageMargins("top", 1);
      coverSheet.pageMargins("bottom", 1);
    } catch (_) {}
  }

  const ACCT_FMT = '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"??_);_(@_)';
  const PCT_FMT = "0.0%";
  const GREEN_HEX = "E8F5E9";
  const RED_HEX = "FCE4EC";
  const AMBER_HEX = "FFF8E1";

  for (const sheet of workbook.sheets()) {
    if (sheet.name() === "Cover") continue;
    try { sheet.freezePanes(1, 1); } catch (_) {}
    try {
      sheet.pageMargins("left", 0.25);
      sheet.pageMargins("right", 0.25);
      sheet.pageMargins("top", 0.5);
      sheet.pageMargins("bottom", 0.5);
    } catch (_) {}
    try { sheet.printGridLines(false); } catch (_) {}

    try {
      sheet.headerFooter("oddHeader", `&L&10&B${schoolName}&R&8&I${sheet.name()}`);
      sheet.headerFooter("oddFooter", "&L&8Built by SchoolStack Budget  •  budget.schoolstack.ai&C&8Page &P of &N&R&8&D");
    } catch (err) {
      console.warn(`Header/footer setup skipped for "${sheet.name()}":`, err instanceof Error ? err.message : err);
    }
  }

  const pnlSheet = workbook.sheet("5-Year P&L");
  if (pnlSheet) {
    const used = pnlSheet.usedRange();
    if (used) {
      const endRow = used.endCell().rowNumber();
      for (let row = 1; row <= endRow; row++) {
        const label = pnlSheet.cell(`A${row}`).value();
        if (typeof label !== "string") continue;
        const lower = label.toLowerCase();

        if (lower.includes("net income") || lower.includes("net surplus")) {
          for (let col = 2; col <= 6; col++) {
            const cell = pnlSheet.cell(row, col);
            const val = cell.value();
            if (typeof val === "number") {
              cell.style("numberFormat", ACCT_FMT);
              cell.style("fill", { type: "solid", color: val >= 0 ? GREEN_HEX : RED_HEX });
            }
          }
        }

        if (lower.includes("total revenue") || lower.includes("total expenses") || lower.includes("total operating")) {
          for (let col = 2; col <= 6; col++) {
            const cell = pnlSheet.cell(row, col);
            cell.style("numberFormat", ACCT_FMT);
            cell.style("bold", true);
            cell.style("bottomBorder", true);
            cell.style("bottomBorderStyle", "double");
          }
        }
      }
    }
  }

  const dscrSheet = workbook.sheet("Cash Flow & DSCR");
  if (dscrSheet) {
    const used = dscrSheet.usedRange();
    if (used) {
      const endRow = used.endCell().rowNumber();
      for (let row = 1; row <= endRow; row++) {
        const label = dscrSheet.cell(`A${row}`).value();
        if (typeof label !== "string") continue;
        const lower = label.toLowerCase();

        if (lower.includes("dscr") || lower.includes("debt service coverage")) {
          for (let col = 2; col <= 6; col++) {
            const cell = dscrSheet.cell(row, col);
            const val = cell.value();
            if (typeof val === "number") {
              cell.style("fill", { type: "solid", color: val >= 1.2 ? GREEN_HEX : val >= 1.0 ? AMBER_HEX : RED_HEX });
            }
          }
        }

        if (lower.includes("ending cash") || lower.includes("cash balance")) {
          for (let col = 2; col <= 6; col++) {
            const cell = dscrSheet.cell(row, col);
            const val = cell.value();
            if (typeof val === "number") {
              cell.style("numberFormat", ACCT_FMT);
              cell.style("fill", { type: "solid", color: val >= 0 ? GREEN_HEX : RED_HEX });
            }
          }
        }
      }
    }
  }

  const summarySheet = workbook.sheet("Summary");
  if (summarySheet) {
    const used = summarySheet.usedRange();
    if (used) {
      const endRow = used.endCell().rowNumber();
      for (let row = 1; row <= endRow; row++) {
        const label = summarySheet.cell(`A${row}`).value();
        if (typeof label !== "string") continue;
        const lower = label.toLowerCase();

        if (lower.includes("margin") || lower.includes("ratio")) {
          for (let col = 2; col <= 6; col++) {
            const cell = summarySheet.cell(row, col);
            const val = cell.value();
            if (typeof val === "number" && Math.abs(val) <= 1) {
              cell.style("numberFormat", PCT_FMT);
            }
          }
        }
      }
    }
  }
}

export async function generateLenderProFormaWorkbook(rawData: Record<string, unknown>): Promise<Buffer> {
  const input = mapModelToTemplateInput(rawData);

  const workbook = await XlsxPopulate.fromFileAsync(TEMPLATE_PATH);
  const assumptions = workbook.sheet("Assumptions");

  if (!assumptions) {
    throw new Error("Template missing 'Assumptions' sheet");
  }

  for (const [field, cellRef] of Object.entries(CELL_MAP)) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      assumptions.cell(cellRef).value(input[field]);
    }
  }

  polishLenderWorkbook(workbook, String(input.schoolName || ""));

  const buffer = await workbook.outputAsync("nodebuffer");
  return buffer;
}
