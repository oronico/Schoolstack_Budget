// @deprecated — This module is superseded by underwriting-workbook.ts (v2).
// The /export/underwriting route has been removed; only /export/underwriting-v2 is active.
// Retained for reference only — do not add new code here.
import ExcelJS from "exceljs";
import { addDashboardSheet, DASHBOARD_GREEN, computeFacilityCostByYear, computeInstructionalCostByYear, resolveEsc as resolveEscShared, computeEffectiveFte } from "./workbook-helpers.js";
import { computeAnnualDebt } from "@workspace/finance";

function schoolYearLabel(baseYear: number | undefined, offset: number): string {
  if (!baseYear) return `Year ${offset + 1}`;
  const y = baseYear + offset;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

interface SchoolProfile {
  schoolName?: string;
  state?: string;
  schoolType?: string;
  schoolTypeOther?: string;
  entityType?: string;
  ein?: string;
  website?: string;
  schoolStage?: string;
  openingYear?: number;
  plannedOpeningYear?: string;
  operatingYear?: string;
  currentStudents?: number;
  maxCapacity?: number;
  fiscalYearStartMonth?: number;
  isPartialFirstYear?: boolean;
  year1OperatingMonths?: number;
  isAccredited?: boolean;
  accreditingBody?: string;
  hasManagementFee?: boolean;
  managementFeePercent?: number;
  gradeBandEnrollment?: { k5: number[]; m68: number[]; h912: number[] };
  gradeBandPerPupil?: { k5: number; m68: number; h912: number };
  enrollmentRevenueMethod?: string;
  charterDepositTiming?: string;
  priorYearADM?: number;
  priorYearADA?: number;
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
  retentionRate?: number;
}

interface RevenueRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  percentBase?: string;
  escalationRate?: number;
  note?: string;
  billingMonths?: number;
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
  notes: string;
  staffingMode?: "fixed" | "ratio";
  studentRatio?: number;
  minFte?: number;
  maxFte?: number;
  startYear?: number;
  endYear?: number;
}

function normalizeStaffingRow(raw: Record<string, unknown>): StaffingRow {
  return {
    id: String(raw.id ?? ""),
    roleName: String(raw.roleName ?? raw.name ?? raw.title ?? "Unnamed"),
    functionCategory: String(raw.functionCategory ?? raw.category ?? "other"),
    employmentType: String(raw.employmentType ?? "full_time"),
    fte: Number(raw.fte) || 0,
    annualizedRate: Number(raw.annualizedRate ?? raw.salary ?? raw.rate) || 0,
    benefitsEligible: Boolean(raw.benefitsEligible ?? true),
    benefitsRate: Number(raw.benefitsRate) || 0,
    payrollTaxRate: Number(raw.payrollTaxRate) || 0,
    payrollLike: Boolean(raw.payrollLike ?? false),
    notes: String(raw.notes ?? ""),
    staffingMode: (raw.staffingMode as "fixed" | "ratio") || "fixed",
    studentRatio: raw.studentRatio != null ? Number(raw.studentRatio) : undefined,
    minFte: raw.minFte != null ? Number(raw.minFte) : undefined,
    maxFte: raw.maxFte != null ? Number(raw.maxFte) : undefined,
    startYear: raw.startYear != null ? Number(raw.startYear) : undefined,
    endYear: raw.endYear != null ? Number(raw.endYear) : undefined,
  };
}

interface ExpenseRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  escalationRate?: number;
  note?: string;
}

interface CapitalDebtRow {
  id: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  note?: string;
  isLoan?: boolean;
  loanPrincipal?: number;
  loanRate?: number;
  loanTermYears?: number;
}

interface TuitionTier {
  id: string;
  tierType: string;
  label: string;
  discountPercent: number;
  studentCounts: number[];
}

interface PriorYearSnapshot {
  endingEnrollment?: number;
  totalRevenue?: number;
  totalExpenses?: number;
  endingCash?: number;
}

interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  tuitionTiers?: TuitionTier[];
  revenue?: Record<string, unknown>;
  revenueRows?: RevenueRow[];
  staffing?: Record<string, unknown>;
  staffingRows?: StaffingRow[];
  facilities?: Record<string, unknown>;
  expenseRows?: ExpenseRow[];
  capitalAndDebtRows?: CapitalDebtRow[];
  priorYearSnapshot?: PriorYearSnapshot;
}

const NAVY = "FF1E293B";
const WHITE = "FFFFFFFF";
const LIGHT_GRAY = "FFE8EDF2";
const GREEN_BG = "FFE8F5E9";
const RED_BG = "FFFCE4EC";
const AMBER_BG = "FFFFF8E1";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: WHITE }, size: 11, name: "Calibri" };
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11, color: { argb: NAVY }, name: "Calibri" };
const NF: Partial<ExcelJS.Font> = { size: 11, name: "Calibri" };
const BF: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true };
const CUR = '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"??_);_(@_)';
const PCT = '0.0%;[Red](0.0%);"-"';
const NUM = '#,##0;#,##0;"-"';
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D0D0" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};
const INPUT_CELL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
const INPUT_CELL_FONT: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, color: { argb: "FF1E3A5F" } };
const INPUT_CELL_BORDER: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: "FF93C5FD" } } };
function applyInputStyle(cell: ExcelJS.Cell) {
  cell.fill = INPUT_CELL_FILL;
  cell.font = INPUT_CELL_FONT;
  cell.border = INPUT_CELL_BORDER;
}

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function hdr(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = HEADER_FILL; cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BORDER;
  }
  ws.getRow(row).height = 28;
}

function sec(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = SECTION_FILL; cell.font = SECTION_FONT; cell.border = BORDER;
  }
  ws.getRow(row).height = 24;
}

function dc(cell: ExcelJS.Cell) { cell.font = NF; cell.border = BORDER; }
function bc(cell: ExcelJS.Cell) { cell.font = BF; cell.border = BORDER; }

function cn(row: number, col: number): string {
  let s = "";
  let c = col;
  while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
  return `${s}${row}`;
}

function safeFormulaValue(formula: string, result: unknown): { formula: string; result: number | string } {
  if (result === null || result === undefined) return { formula, result: "0" };
  if (typeof result === "number") {
    if (isNaN(result) || !isFinite(result)) return { formula, result: "0" };
    const rounded = Math.round(result * 100) / 100;
    return { formula, result: rounded === 0 ? "0" : rounded };
  }
  if (typeof result === "string") return { formula, result: result || "0" };
  return { formula, result: "0" };
}

function setFormula(cell: ExcelJS.Cell, formula: string, result: unknown) {
  cell.value = safeFormulaValue(formula, result);
}

const ASM = {
  ENROLL_ROW: 17,
  SALARY_ESC_ROW: 20,
  COST_INFL_ROW: 21,
  PRORATION_ROW: 22,
  MAX_CAP_ROW: 10,
  YEAR_COL_START: 2,
};

interface CrossTabCtx {
  yc: number;
  revGrandTotalRow: number;
  staffTotalRow: number;
  opexGrandTotalRow: number;
  facGrandTotalRow: number;
  capDebtTotalRow: number;
  plRevenueRow: number;
  plTotalExpRow: number;
  plNetIncomeRow: number;
}

function asmEnroll(y: number): string {
  return `Assumptions!$${String.fromCharCode(66 + y)}$${ASM.ENROLL_ROW}`;
}
function asmRef(row: number): string {
  return `Assumptions!$B$${row}`;
}

const SUBTOTAL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF1E293B" } },
  bottom: { style: "double", color: { argb: "FF1E293B" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

function gc(cell: ExcelJS.Cell) { cell.font = BF; cell.border = SUBTOTAL_BORDER; }

function setPrintAreaUW(ws: ExcelJS.Worksheet, lastRow: number, lastCol: number) {
  const endColLetter = String.fromCharCode(64 + lastCol);
  ws.pageSetup = {
    ...(ws.pageSetup || {}),
    printArea: `A1:${endColLetter}${lastRow}`,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 1 as unknown as undefined,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter = {
    oddFooter: "&L&8SchoolStack Budget - Underwriting&C&8Page &P of &N&R&8&D",
  };
}

function normalizeAmounts(amounts: number[] | undefined, yc: number) {
  if (!amounts) return;
  const last = amounts.length > 0 ? amounts[amounts.length - 1] : 0;
  while (amounts.length < yc) amounts.push(last);
}

function polishWorkbookUW(wb: ExcelJS.Workbook, schoolName?: string) {
  const coverNames = new Set(["Cover"]);
  const name = schoolName || "School";

  for (const ws of wb.worksheets) {
    if (!coverNames.has(ws.name)) {
      ws.views = [{ state: "frozen" as const, xSplit: 1, ySplit: 1, topLeftCell: "B2", activeCell: "B2" }];

      const lastRow = ws.rowCount || 1;
      const lastCol = ws.columnCount || 1;
      const endColLetter = lastCol <= 26 ? String.fromCharCode(64 + lastCol) : "Z";
      ws.pageSetup = {
        ...(ws.pageSetup || {}),
        printArea: ws.pageSetup?.printArea || `A1:${endColLetter}${lastRow}`,
        printTitlesRow: "1:1",
        orientation: ws.pageSetup?.orientation || "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 1 as unknown as undefined,
        margins: ws.pageSetup?.margins || { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      };
      ws.headerFooter = {
        oddHeader: `&L&10&B${name}&R&8&I${ws.name}`,
        oddFooter: "&L&8Built by SchoolStack Budget  •  budget.schoolstack.ai&C&8Page &P of &N&R&8&D",
      };
    }
  }
}

function schoolTypeLabel(t?: string, o?: string): string {
  const map: Record<string, string> = {
    charter_school: "Charter School", homeschool_coop: "Homeschool Co-Op",
    learning_pod: "Learning Pod", microschool: "Microschool",
    private_school: "Private School", tutoring_center: "Tutoring Center", other: o || "Other"
  };
  return map[t || ""] || t || "";
}

function entityLabel(e?: string): string {
  const map: Record<string, string> = {
    sole_practitioner: "Sole Practitioner", llc_single: "LLC (Single Member)",
    llc_partnership: "LLC (Partnership)", c_corp: "C Corporation",
    s_corp: "S Corporation", nonprofit_501c3: "501(c)(3) Nonprofit"
  };
  return map[e || ""] || e || "";
}

function funcLabel(fc: string): string {
  const map: Record<string, string> = {
    instructional: "Instructional", school_leadership: "School Leadership",
    student_support: "Student Support", operations: "Operations",
    administrative: "Administrative", other: "Other"
  };
  return map[fc] || fc;
}

let _globalCostInflationPct = 0;

function setGlobalCostInflation(pct: number) { _globalCostInflationPct = pct; }

function resolveEsc(rowEsc?: number): number {
  return resolveEscShared(rowEsc, _globalCostInflationPct);
}

function driverVal(amounts: number[] | undefined, y: number, dt: string, students: number, escalationRate?: number, fallbackInflation?: number, newStudents?: number, returningStudents?: number): number {
  let base = amounts?.[y] ?? 0;
  const esc = (escalationRate !== undefined && escalationRate !== 0) ? escalationRate : (fallbackInflation ?? 0);
  if (esc !== 0 && y > 0) {
    const y1 = amounts?.[0] ?? 0;
    base = y1 * Math.pow(1 + esc / 100, y);
  }
  switch (dt) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "per_new_student": return base * (newStudents ?? students);
    case "per_returning_student": return base * (returningStudents ?? 0);
    case "annual_fixed": return base;
    default: return base;
  }
}

function localNewStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return enrollment[0] || 0;
  const returning = Math.round((enrollment[y - 1] || 0) * (retentionRate / 100));
  return Math.max(0, (enrollment[y] || 0) - Math.min(returning, enrollment[y] || 0));
}

function localReturningStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return 0;
  return Math.min(enrollment[y] || 0, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100)));
}

function resolveAmount(amounts: number[] | undefined, y: number, rowEsc?: number): number {
  const esc = resolveEsc(rowEsc);
  if (esc !== 0 && y > 0) {
    return (amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
  }
  return amounts?.[y] ?? 0;
}

function tuitionWithTiers(gross: number, y: number, students: number, tiers?: TuitionTier[]): number {
  if (!tiers || tiers.length === 0) return gross * students;
  let rawTotal = 0;
  for (const t of tiers) rawTotal += t.studentCounts?.[y] ?? 0;
  if (rawTotal === 0) return gross * students;
  const sf = rawTotal > students ? students / rawTotal : 1;
  let total = 0, alloc = 0;
  for (const t of tiers) {
    const sc = (t.studentCounts?.[y] ?? 0) * sf;
    alloc += sc;
    total += sc * gross * (1 - (t.discountPercent || 0) / 100);
  }
  const rem = students - alloc;
  if (rem > 0) total += rem * gross;
  return total;
}

function computeGradeBandRevenueUW(sp: SchoolProfile, y: number): number {
  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  if (!gbe || !gbp) return 0;
  const k5e = gbe.k5?.[y] ?? 0;
  const m68e = gbe.m68?.[y] ?? 0;
  const h912e = gbe.h912?.[y] ?? 0;
  if (k5e + m68e + h912e === 0) return 0;
  let total = k5e * (gbp.k5 || 0) + m68e * (gbp.m68 || 0) + h912e * (gbp.h912 || 0);
  if (sp.enrollmentRevenueMethod === "ada") {
    const adm = sp.priorYearADM || 0;
    const ada = sp.priorYearADA || 0;
    total *= adm > 0 ? Math.min(ada / adm, 1) : 0.95;
  }
  return total;
}

function hasGradeBandUW(sp?: SchoolProfile): boolean {
  if (!sp?.gradeBandEnrollment || !sp?.gradeBandPerPupil) return false;
  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  const hasEnrollment = [gbe.k5, gbe.m68, gbe.h912].some(
    (arr) => arr && arr.some((v) => (v ?? 0) > 0),
  );
  return hasEnrollment && ((gbp.k5 || 0) + (gbp.m68 || 0) + (gbp.h912 || 0) > 0);
}

function computeRevenueForYear(
  rows: RevenueRow[], y: number, students: number, tiers?: TuitionTier[], sp?: SchoolProfile
): number {
  const vals = new Map<string, number>();
  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    if (r.id === "state_local_perpupil" && sp && hasGradeBandUW(sp)) {
      vals.set(r.id, computeGradeBandRevenueUW(sp, y));
    } else if (r.id === "gross_tuition" && r.driverType === "per_student" && tiers && tiers.length > 0) {
      let perStudentAmount = r.amounts?.[y] ?? 0;
      if (r.escalationRate !== undefined && r.escalationRate !== 0 && y > 0) {
        perStudentAmount = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
      }
      vals.set(r.id, tuitionWithTiers(perStudentAmount, y, students, tiers));
    } else {
      vals.set(r.id, driverVal(r.amounts, y, r.driverType, students, r.escalationRate));
    }
  }
  for (const r of rows) {
    if (!r.enabled || r.driverType !== "percent_of_base") continue;
    const baseVal = vals.get(r.percentBase || "") || 0;
    let pctVal = r.amounts?.[y] ?? 0;
    if (r.escalationRate !== undefined && r.escalationRate !== 0 && y > 0) {
      pctVal = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
    }
    vals.set(r.id, baseVal * (pctVal / 100));
  }
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    const v = vals.get(r.id) || 0;
    if (r.category === "tuition_offsets") total -= Math.abs(v);
    else total += v;
  }
  return total;
}

function computeExpenseForYear(
  rows: ExpenseRow[], y: number, students: number, totalRevenue: number, costInflationPct?: number, newStudents?: number, returningStudents?: number
): number {
  let total = 0;
  const fallback = costInflationPct ?? 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.driverType === "percent_of_revenue") {
      const esc = (r.escalationRate !== undefined && r.escalationRate !== 0) ? r.escalationRate : fallback;
      let pct: number;
      if (esc !== 0 && y > 0) {
        pct = (r.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
      } else {
        pct = r.amounts?.[y] ?? 0;
      }
      total += (pct / 100) * totalRevenue;
    } else {
      total += driverVal(r.amounts, y, r.driverType, students, r.escalationRate, fallback, newStudents, returningStudents);
    }
  }
  return total;
}

const computeEffectiveFteLocal = computeEffectiveFte;

function computePersonnelForYear(
  rows: StaffingRow[], salaryEsc: number, prorationFactor: number, y: number, enrollment?: number
): number {
  let total = 0;
  for (const r of rows) {
    const fte = enrollment !== undefined ? computeEffectiveFteLocal(r, y, enrollment) : r.fte;
    const annual = fte * r.annualizedRate;
    const isContractNoPL = r.employmentType === "contract" && !r.payrollLike;
    let benefits = 0, tax = 0;
    if (!isContractNoPL) {
      if (r.benefitsEligible) benefits = annual * (r.benefitsRate / 100);
      tax = annual * (r.payrollTaxRate / 100);
    }
    total += annual + benefits + tax;
  }
  const esc = Math.pow(1 + salaryEsc, y);
  const pf = y === 0 ? prorationFactor : 1;
  return total * esc * pf;
}

function computeCapDebtForYear(rows: CapitalDebtRow[], y: number, students: number): number {
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.isLoan) {
      total += computeAnnualDebt(r.loanPrincipal || 0, (r.loanRate || 0) / 100, r.loanTermYears || 0);
    } else {
      total += driverVal(r.amounts, y, r.driverType, students);
    }
  }
  return total;
}

function totalDebtService(capDebtRows: CapitalDebtRow[]): number {
  let ds = 0;
  for (const r of capDebtRows) {
    if (!r.enabled || !r.isLoan) continue;
    ds += computeAnnualDebt(r.loanPrincipal || 0, (r.loanRate || 0) / 100, r.loanTermYears || 0);
  }
  return ds;
}

function totalLoanPrincipal(capDebtRows: CapitalDebtRow[]): number {
  let p = 0;
  for (const r of capDebtRows) {
    if (!r.enabled || !r.isLoan) continue;
    p += r.loanPrincipal || 0;
  }
  return p;
}

const REV_CAT_LABELS: Record<string, string> = {
  tuition_and_fees: "Tuition & Student Fees",
  tuition_offsets: "Tuition Offsets",
  public_funding: "Public Funding",
  school_choice: "School Choice Funding",
  grants_contributions: "Philanthropy",
  philanthropy: "Philanthropy",
  other_revenue: "Other Revenue",
};

const EXP_CAT_LABELS: Record<string, string> = {
  instructional_program: "Instructional / Program",
  technology: "Technology",
  occupancy_facility: "Occupancy / Facility",
  administrative_general: "Administrative / General",
};

export async function generateUnderwritingWorkbook(rawData: Record<string, unknown>): Promise<Buffer> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const revenueRows = data.revenueRows || [];
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = data.expenseRows || [];
  const capDebtRows = data.capitalAndDebtRows || [];

  const yc = 5;

  const enrollment = [en.year1 || 0, en.year2 || 0, en.year3 || 0, en.year4 || 0, en.year5 || 0];
  const uwRR = en.retentionRate ?? 85;
  const salaryEsc = (data.facilities as Record<string, unknown>)?.annualSalaryIncrease
    ? Number((data.facilities as Record<string, unknown>).annualSalaryIncrease) / 100 : 0;
  const costInflation = (data.facilities as Record<string, unknown>)?.generalCostInflation
    ? Number((data.facilities as Record<string, unknown>).generalCostInflation) / 100 : 0;
  setGlobalCostInflation(costInflation * 100);
  const isPartial = sp.isPartialFirstYear || false;
  const opMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = opMonths / 12;

  for (const row of revenueRows) { normalizeAmounts(row.amounts, yc); }
  for (const row of expenseRows) { normalizeAmounts(row.amounts, yc); }
  for (const row of capDebtRows) { normalizeAmounts(row.amounts, yc); }

  const annualRevenue: number[] = [];
  const annualPersonnel: number[] = [];
  const annualExpenses: number[] = [];
  const annualCapDebt: number[] = [];
  const annualNetIncome: number[] = [];
  const annualCumNI: number[] = [];

  for (let y = 0; y < yc; y++) {
    const students = enrollment[y];
    const rev = computeRevenueForYear(revenueRows, y, students, data.tuitionTiers, sp);
    const pf = y === 0 ? prorationFactor : 1;
    const personnel = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, y, students);
    const costInflPct = costInflation * 100;
    const ops = computeExpenseForYear(expenseRows, y, students, rev, costInflPct, localNewStudents(enrollment, uwRR, y), localReturningStudents(enrollment, uwRR, y)) * (y === 0 ? prorationFactor : 1);
    const capDebt = computeCapDebtForYear(capDebtRows, y, students);
    const totalExp = personnel + ops + capDebt;
    const ni = (rev * pf) - totalExp;

    annualRevenue.push(Math.round(rev * pf));
    annualPersonnel.push(Math.round(personnel));
    annualExpenses.push(Math.round(ops));
    annualCapDebt.push(Math.round(capDebt));
    annualNetIncome.push(Math.round(ni));
    annualCumNI.push((annualCumNI[y - 1] || 0) + Math.round(ni));
  }

  const startingCash = data.priorYearSnapshot?.endingCash || 0;
  const annualDebtSvc = totalDebtService(capDebtRows);
  const totalPrincipal = totalLoanPrincipal(capDebtRows);
  const cashAtOpen = startingCash + totalPrincipal;
  const maxCapacity = sp.maxCapacity || enrollment[yc - 1] || 100;

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget - Underwriting Export";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const yearHeaders = ["", ...Array.from({ length: yc }, (_, i) => schoolYearLabel(sp.openingYear, i))];
  const cols = yc + 1;

  buildAssumptions(wb, sp, enrollment, yc, salaryEsc, costInflation, prorationFactor, data.tuitionTiers);
  buildEnrollmentRevDrivers(wb, enrollment, revenueRows, yc, cols, yearHeaders, maxCapacity, data.tuitionTiers);
  const revGrandTotalRow = buildTuitionFundingDetail(wb, revenueRows, enrollment, yc, cols, yearHeaders, data.tuitionTiers);
  const staffTotalRow = buildStaffingPlan(wb, staffingRows, salaryEsc, prorationFactor, yc, cols, yearHeaders);
  const opexGrandTotalRow = buildOperatingExpenses(wb, expenseRows, enrollment, annualRevenue, yc, cols, yearHeaders);
  const facGrandTotalRow = buildFacilitiesOccupancy(wb, expenseRows, enrollment, annualRevenue, yc, cols, yearHeaders);
  buildSourcesUses(wb, sp, capDebtRows, startingCash, annualPersonnel, annualExpenses, annualCapDebt, expenseRows, enrollment, totalPrincipal);
  buildDebtSchedule(wb, capDebtRows, yc);
  buildMonthlyCashFlowY1(wb, sp, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, cashAtOpen, opMonths, revenueRows, enrollment, data.tuitionTiers, sp.fiscalYearStartMonth);

  const mgmtFeeByYear: number[] = [];
  if (sp.hasManagementFee) {
    const feeRow = expenseRows.find(ex => ex.id === "authorizer_fee" && ex.enabled);
    if (feeRow && feeRow.driverType === "percent_of_revenue") {
      for (let y = 0; y < yc; y++) {
        const pf = y === 0 ? prorationFactor : 1;
        const rev = computeRevenueForYear(revenueRows, y, enrollment[y], data.tuitionTiers, sp);
        mgmtFeeByYear.push(Math.round(((feeRow.amounts?.[y] ?? 0) / 100) * rev * pf));
      }
    }
  }

  const ctx: Partial<CrossTabCtx> = { revGrandTotalRow, staffTotalRow, opexGrandTotalRow, facGrandTotalRow };
  const plRows = buildFiveYearPL(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, yc, cols, yearHeaders, sp.entityType, ctx, mgmtFeeByYear.length > 0 ? mgmtFeeByYear : undefined);
  const plCumNIRow = plRows.cumNIRow;

  buildFiveYearBS(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualCumNI, cashAtOpen, totalPrincipal, capDebtRows, yc, cols, yearHeaders);
  buildDSCRCovenant(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualDebtSvc, cashAtOpen, enrollment, maxCapacity, yc, cols, yearHeaders);
  buildUnderwritingSnapshot(wb, sp, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualCumNI, annualDebtSvc, cashAtOpen, enrollment, maxCapacity, totalPrincipal, yc);
  buildSummary(wb, sp, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualCumNI, annualDebtSvc, cashAtOpen, enrollment, yc, cols, yearHeaders, plRows);

  buildUWCoverSheet(wb, sp, yc, annualRevenue, annualNetIncome, annualCumNI, annualDebtSvc, startingCash, enrollment, maxCapacity);

  {
    const hasDebt = capDebtRows.some(r => r.isLoan && r.enabled !== false);
    const cashArr: number[] = [];
    let runCash = cashAtOpen;
    for (let y = 0; y < yc; y++) {
      runCash += annualNetIncome[y];
      cashArr.push(runCash);
    }

    const revCatsV1: Record<string, number[]> = {};
    for (const rv of revenueRows) {
      if (!rv.enabled) continue;
      const cat = rv.category || "other";
      if (!revCatsV1[cat]) revCatsV1[cat] = new Array(yc).fill(0);
      for (let y = 0; y < yc; y++) {
        const students = enrollment[y];
        const pf = y === 0 ? prorationFactor : 1;
        const val = driverVal(rv.amounts, y, rv.driverType, students, rv.escalationRate) * pf;
        revCatsV1[cat][y] += rv.category === "tuition_offsets" ? -Math.abs(val) : val;
      }
    }

    const facCostV1 = computeFacilityCostByYear(expenseRows, enrollment, annualRevenue, yc, costInflation * 100);
    const debtSvcByYear = Array.from({ length: yc }, () => Math.round(annualDebtSvc));
    await addDashboardSheet(wb, {
      schoolName: sp.schoolName || "School",
      entityType: sp.entityType || "",
      enrollment,
      revenueByYear: annualRevenue,
      personnelByYear: annualPersonnel,
      opexByYear: annualExpenses,
      facilityCostByYear: facCostV1,
      debtServiceByYear: debtSvcByYear,
      netIncomeByYear: annualNetIncome,
      cashByYear: cashArr,
      startingCash: cashAtOpen,
      hasDebt,
      revenueCategories: revCatsV1,
      cumNIRef: { sheetName: "5-Year P&L", row: plCumNIRow, startCol: 2 },
      hasManagementFee: sp.hasManagementFee,
      managementFeePercent: sp.managementFeePercent,
    });
  }

  polishWorkbookUW(wb, sp.schoolName);
  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf as ArrayBuffer);
}

export async function generateUnderwritingWorkbookToFile(rawData: Record<string, unknown>, filePath: string): Promise<void> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const revenueRows = data.revenueRows || [];
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = data.expenseRows || [];
  const capDebtRows = data.capitalAndDebtRows || [];

  const yc = 5;

  const enrollment = [en.year1 || 0, en.year2 || 0, en.year3 || 0, en.year4 || 0, en.year5 || 0];
  const uwRR = en.retentionRate ?? 85;
  const salaryEsc = (data.facilities as Record<string, unknown>)?.annualSalaryIncrease
    ? Number((data.facilities as Record<string, unknown>).annualSalaryIncrease) / 100 : 0;
  const costInflation = (data.facilities as Record<string, unknown>)?.generalCostInflation
    ? Number((data.facilities as Record<string, unknown>).generalCostInflation) / 100 : 0;
  setGlobalCostInflation(costInflation * 100);
  const isPartial = sp.isPartialFirstYear || false;
  const opMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = opMonths / 12;

  for (const row of revenueRows) { normalizeAmounts(row.amounts, yc); }
  for (const row of expenseRows) { normalizeAmounts(row.amounts, yc); }
  for (const row of capDebtRows) { normalizeAmounts(row.amounts, yc); }

  const annualRevenue: number[] = [];
  const annualPersonnel: number[] = [];
  const annualExpenses: number[] = [];
  const annualCapDebt: number[] = [];
  const annualNetIncome: number[] = [];
  const annualCumNI: number[] = [];

  for (let y = 0; y < yc; y++) {
    const students = enrollment[y];
    const rev = computeRevenueForYear(revenueRows, y, students, data.tuitionTiers, sp);
    const pf = y === 0 ? prorationFactor : 1;
    const personnel = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, y, students);
    const costInflPct = costInflation * 100;
    const ops = computeExpenseForYear(expenseRows, y, students, rev, costInflPct, localNewStudents(enrollment, uwRR, y), localReturningStudents(enrollment, uwRR, y)) * (y === 0 ? prorationFactor : 1);
    const capDebt = computeCapDebtForYear(capDebtRows, y, students);
    const totalExp = personnel + ops + capDebt;
    const ni = (rev * pf) - totalExp;

    annualRevenue.push(Math.round(rev * pf));
    annualPersonnel.push(Math.round(personnel));
    annualExpenses.push(Math.round(ops));
    annualCapDebt.push(Math.round(capDebt));
    annualNetIncome.push(Math.round(ni));
    annualCumNI.push((annualCumNI[y - 1] || 0) + Math.round(ni));
  }

  const startingCash = data.priorYearSnapshot?.endingCash || 0;
  const annualDebtSvc = totalDebtService(capDebtRows);
  const totalPrincipal = totalLoanPrincipal(capDebtRows);
  const cashAtOpen = startingCash + totalPrincipal;
  const maxCapacity = sp.maxCapacity || enrollment[yc - 1] || 100;

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget - Underwriting Export";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const yearHeaders = ["", ...Array.from({ length: yc }, (_, i) => schoolYearLabel(sp.openingYear, i))];
  const cols = yc + 1;

  buildAssumptions(wb, sp, enrollment, yc, salaryEsc, costInflation, prorationFactor, data.tuitionTiers);
  buildEnrollmentRevDrivers(wb, enrollment, revenueRows, yc, cols, yearHeaders, maxCapacity, data.tuitionTiers);
  const revGrandTotalRow2 = buildTuitionFundingDetail(wb, revenueRows, enrollment, yc, cols, yearHeaders, data.tuitionTiers);
  const staffTotalRow2 = buildStaffingPlan(wb, staffingRows, salaryEsc, prorationFactor, yc, cols, yearHeaders);
  const opexGrandTotalRow2 = buildOperatingExpenses(wb, expenseRows, enrollment, annualRevenue, yc, cols, yearHeaders);
  const facGrandTotalRow2 = buildFacilitiesOccupancy(wb, expenseRows, enrollment, annualRevenue, yc, cols, yearHeaders);
  buildSourcesUses(wb, sp, capDebtRows, startingCash, annualPersonnel, annualExpenses, annualCapDebt, expenseRows, enrollment, totalPrincipal);
  buildDebtSchedule(wb, capDebtRows, yc);
  buildMonthlyCashFlowY1(wb, sp, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, cashAtOpen, opMonths, revenueRows, enrollment, data.tuitionTiers, sp.fiscalYearStartMonth);

  const mgmtFeeByYear2: number[] = [];
  if (sp.hasManagementFee) {
    const feeRow = expenseRows.find(ex => ex.id === "authorizer_fee" && ex.enabled);
    if (feeRow && feeRow.driverType === "percent_of_revenue") {
      for (let y = 0; y < yc; y++) {
        const pf = y === 0 ? prorationFactor : 1;
        const rev = computeRevenueForYear(revenueRows, y, enrollment[y], data.tuitionTiers, sp);
        mgmtFeeByYear2.push(Math.round(((feeRow.amounts?.[y] ?? 0) / 100) * rev * pf));
      }
    }
  }

  const ctx2: Partial<CrossTabCtx> = { revGrandTotalRow: revGrandTotalRow2, staffTotalRow: staffTotalRow2, opexGrandTotalRow: opexGrandTotalRow2, facGrandTotalRow: facGrandTotalRow2 };
  const plRows2 = buildFiveYearPL(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, yc, cols, yearHeaders, sp.entityType, ctx2, mgmtFeeByYear2.length > 0 ? mgmtFeeByYear2 : undefined);
  const plCumNIRow2 = plRows2.cumNIRow;

  buildFiveYearBS(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualCumNI, cashAtOpen, totalPrincipal, capDebtRows, yc, cols, yearHeaders);
  buildDSCRCovenant(wb, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualDebtSvc, cashAtOpen, enrollment, maxCapacity, yc, cols, yearHeaders);
  buildUnderwritingSnapshot(wb, sp, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualCumNI, annualDebtSvc, cashAtOpen, enrollment, maxCapacity, totalPrincipal, yc);
  buildSummary(wb, sp, annualRevenue, annualPersonnel, annualExpenses, annualCapDebt, annualNetIncome, annualCumNI, annualDebtSvc, cashAtOpen, enrollment, yc, cols, yearHeaders, plRows2);

  buildUWCoverSheet(wb, sp, yc, annualRevenue, annualNetIncome, annualCumNI, annualDebtSvc, startingCash, enrollment, maxCapacity);

  {
    const hasDebt = capDebtRows.some(r => r.isLoan && r.enabled !== false);
    const cashArr: number[] = [];
    let rc = cashAtOpen;
    for (let y = 0; y < yc; y++) {
      rc += annualNetIncome[y];
      cashArr.push(rc);
    }

    const revCatsV1b: Record<string, number[]> = {};
    for (const rv of revenueRows) {
      if (!rv.enabled) continue;
      const cat = rv.category || "other";
      if (!revCatsV1b[cat]) revCatsV1b[cat] = new Array(yc).fill(0);
      for (let y = 0; y < yc; y++) {
        const students = enrollment[y];
        const pf = y === 0 ? prorationFactor : 1;
        const val = driverVal(rv.amounts, y, rv.driverType, students, rv.escalationRate) * pf;
        revCatsV1b[cat][y] += rv.category === "tuition_offsets" ? -Math.abs(val) : val;
      }
    }

    await addDashboardSheet(wb, {
      schoolName: sp.schoolName || "School",
      entityType: sp.entityType || "",
      enrollment,
      revenueByYear: annualRevenue,
      personnelByYear: annualPersonnel,
      opexByYear: annualExpenses,
      facilityCostByYear: computeFacilityCostByYear(expenseRows, enrollment, annualRevenue, yc, costInflation * 100),
      instructionalByYear: computeInstructionalCostByYear(expenseRows, enrollment, annualRevenue, yc, costInflation * 100),
      debtServiceByYear: Array.from({ length: yc }, () => Math.round(annualDebtSvc)),
      netIncomeByYear: annualNetIncome,
      cashByYear: cashArr,
      startingCash: cashAtOpen,
      hasDebt,
      revenueCategories: revCatsV1b,
      cumNIRef: { sheetName: "5-Year P&L", row: plCumNIRow2, startCol: 2 },
      hasManagementFee: sp.hasManagementFee,
      managementFeePercent: sp.managementFeePercent,
    });
  }

  polishWorkbookUW(wb, sp.schoolName);
  await wb.xlsx.writeFile(filePath);
}

export async function generateSingleYearBudget(rawData: Record<string, unknown>, yearIndex: number = 0): Promise<Buffer> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const enr = data.enrollment || {};
  const enrollment = [enr.year1 || 0, enr.year2 || 0, enr.year3 || 0, enr.year4 || 0, enr.year5 || 0];
  const sybRR = enr.retentionRate ?? 85;
  const yc = 5;
  const yi = Math.max(0, Math.min(yearIndex, yc - 1));

  const revenueRows = data.revenueRows || [];
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = (data.expenseRows || []).filter((r: ExpenseRow) => r.enabled !== false);
  const capDebtRows = (data.capitalAndDebtRows || []).filter((r: CapitalDebtRow) => r.enabled !== false);

  const salaryEsc = (data.facilities as Record<string, unknown>)?.annualSalaryIncrease
    ? Number((data.facilities as Record<string, unknown>).annualSalaryIncrease) / 100 : 0;
  const costInflation = (data.facilities as Record<string, unknown>)?.generalCostInflation
    ? Number((data.facilities as Record<string, unknown>).generalCostInflation) / 100 : 0;
  const costInflPct = costInflation * 100;
  setGlobalCostInflation(costInflPct);
  const isPartial = sp.isPartialFirstYear || false;
  const opMonthsBase = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = opMonthsBase / 12;
  const opMonths = yi === 0 ? opMonthsBase : 12;

  const students = enrollment[yi];
  const pf = yi === 0 ? prorationFactor : 1;
  const annualRevRaw = computeRevenueForYear(revenueRows, yi, students, data.tuitionTiers, sp);
  const annualRev = Math.round(annualRevRaw * pf);
  const annualPersonnel = Math.round(computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, yi, students));
  const annualOps = Math.round(computeExpenseForYear(expenseRows, yi, students, annualRevRaw, costInflPct, localNewStudents(enrollment, sybRR, yi), localReturningStudents(enrollment, sybRR, yi)) * pf);
  const annualCapDebt = Math.round(computeCapDebtForYear(capDebtRows, yi, students));
  const annualNI = annualRev - annualPersonnel - annualOps - annualCapDebt;

  const fyStart = sp.fiscalYearStartMonth || 7;
  const monthLabels = [""];
  for (let i = 0; i < 12; i++) {
    const mIdx = ((fyStart - 1 + i) % 12) + 1;
    monthLabels.push(MONTH_NAMES[mIdx]);
  }
  const yearLabel = `Year ${yi + 1}`;

  const monthlyRev = (yi === 0 && revenueRows.length > 0)
    ? computeExportMonthlyRevenue(revenueRows, students, opMonths, data.tuitionTiers)
    : Array.from({ length: 12 }, (_, m) => m < opMonths ? annualRev / (opMonths || 12) : 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();

  const cols = 14;
  const headers = [...monthLabels, `${yearLabel} Total`];

  buildSYAssumptions(wb, sp, students, salaryEsc, costInflation, prorationFactor, yearLabel);
  const revTotalRow = buildSYRevenue(wb, revenueRows, monthlyRev, opMonths, students, cols, headers, data.tuitionTiers, yi);
  const staffRow = buildSYStaffing(wb, staffingRows, salaryEsc, prorationFactor, opMonths, cols, headers, yi);
  const opsRow = buildSYExpenses(wb, expenseRows, students, annualRev, costInflation, prorationFactor, opMonths, cols, headers, yi);
  let syMgmtFee = 0;
  if (sp.hasManagementFee) {
    const feeRow = expenseRows.find(ex => ex.id === "authorizer_fee" && ex.enabled);
    if (feeRow && feeRow.driverType === "percent_of_revenue") {
      syMgmtFee = Math.round(((feeRow.amounts?.[yi] ?? 0) / 100) * annualRevRaw * pf);
    }
  }
  buildSYPL(wb, monthlyRev, annualPersonnel, annualOps, annualCapDebt, annualNI, opMonths, cols, headers, sp, staffRow, opsRow, revTotalRow, syMgmtFee);

  polishWorkbookUW(wb, sp.schoolName);
  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf as ArrayBuffer);
}

function buildSYAssumptions(
  wb: ExcelJS.Workbook, sp: SchoolProfile, students: number,
  salaryEsc: number, costInfl: number, proration: number, yearLabel: string
) {
  const ws = wb.addWorksheet("Assumptions");
  ws.columns = [{ width: 35 }, { width: 20 }];

  let r = 1;
  ws.getCell(r, 1).value = `${yearLabel} Budget Assumptions`; ws.getCell(r, 1).font = BF;
  sec(ws, r, 2);

  r = 2;
  ws.getCell(r, 1).fill = INPUT_CELL_FILL;
  ws.getCell(r, 1).value = "";
  ws.getCell(r, 1).border = INPUT_CELL_BORDER;
  ws.getCell(r, 2).value = "Editable assumption \u2014 change this value";
  ws.getCell(r, 2).font = { italic: true, size: 11, color: { argb: "FF666666" }, name: "Calibri" };
  ws.getCell(r, 4).value = "";
  ws.getCell(r, 4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(r, 4).border = { bottom: { style: "thin", color: { argb: "FFD0D0D0" } } };
  ws.getCell(r, 5).value = "Calculated \u2014 driven by formula";
  ws.getCell(r, 5).font = { italic: true, size: 11, color: { argb: "FF666666" }, name: "Calibri" };

  r += 2; ws.getCell(r, 1).value = "School Name"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = sp.schoolName || "";
  r++; ws.getCell(r, 1).value = "School Type"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = sp.schoolType || "";

  r += 2; sec(ws, r, 2); ws.getCell(r, 1).value = "KEY ASSUMPTIONS";
  r++; ws.getCell(r, 1).value = "Enrollment"; ws.getCell(r, 1).font = NF;
  const enrollCell = ws.getCell(r, 2);
  enrollCell.value = students; enrollCell.numFmt = NUM;
  applyInputStyle(enrollCell);

  r++; ws.getCell(r, 1).value = "Salary Escalation"; ws.getCell(r, 1).font = NF;
  const salCell = ws.getCell(r, 2);
  salCell.value = salaryEsc; salCell.numFmt = "0.0%";
  applyInputStyle(salCell);

  r++; ws.getCell(r, 1).value = "Cost Inflation"; ws.getCell(r, 1).font = NF;
  const costCell = ws.getCell(r, 2);
  costCell.value = costInfl; costCell.numFmt = "0.0%";
  applyInputStyle(costCell);

  r++; ws.getCell(r, 1).value = "Year 1 Proration Factor"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = proration; ws.getCell(r, 2).numFmt = "0.00"; applyInputStyle(ws.getCell(r, 2));

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
}

function buildSYRevenue(
  wb: ExcelJS.Workbook, rows: RevenueRow[], monthlyRev: number[],
  opMonths: number, students: number, cols: number, headers: string[],
  tiers?: TuitionTier[], yi?: number
): number {
  const ws = wb.addWorksheet("Revenue");
  ws.columns = [{ width: 30 }, ...Array(12).fill({ width: 14 }), { width: 16 }];

  let r = 1;
  ws.getRow(r).values = headers;
  hdr(ws, r, cols);

  for (const ro of rows) {
    r++; ws.getCell(r, 1).value = ro.lineItem || "Unnamed"; ws.getCell(r, 1).font = NF;
    const yearAmt = computeRevForRow(ro, yi ?? 0, students, tiers);
    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, m + 2);
      cell.value = m < opMonths ? Math.round(yearAmt / (opMonths || 12)) : 0;
      cell.numFmt = CUR; dc(cell);
    }
    const total = Math.round(yearAmt * (yi === 0 ? opMonths / 12 : 1));
    setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, total);
    ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));
  }

  const firstData = 2;
  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "TOTAL REVENUE";
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = Math.round(monthlyRev[m] || 0);
    setFormula(cell, `SUM(${cn(firstData, m + 2)}:${cn(r - 1, m + 2)})`, v);
    cell.numFmt = CUR; bc(cell);
  }
  const annualTotal = monthlyRev.reduce((a, b) => a + Math.round(b), 0);
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, annualTotal);
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return r;
}

function computeRevForRow(ro: RevenueRow, yi: number, students: number, tiers?: TuitionTier[]): number {
  const amt = resolveAmount(ro.amounts, yi, ro.escalationRate);
  if (ro.driverType === "per_student") {
    if (ro.category === "tuition" && tiers && tiers.length > 0) {
      let total = 0;
      for (const t of tiers) {
        const sc = t.studentCounts?.[yi] || 0;
        const disc = t.discountPercent || 0;
        total += sc * amt * (1 - disc / 100);
      }
      return total;
    }
    return amt * students;
  } else if (ro.driverType === "flat" || ro.driverType === "annual_fixed" || ro.driverType === "monthly") {
    return ro.driverType === "monthly" ? amt * 12 : amt;
  }
  return amt;
}

function buildSYStaffing(
  wb: ExcelJS.Workbook, rows: StaffingRow[], salaryEsc: number,
  proration: number, opMonths: number, cols: number, headers: string[], yi: number
): number {
  const ws = wb.addWorksheet("Personnel");
  ws.columns = [{ width: 30 }, ...Array(12).fill({ width: 14 }), { width: 16 }];

  let r = 1;
  ws.getRow(r).values = headers;
  hdr(ws, r, cols);

  const esc = Math.pow(1 + salaryEsc, yi);
  const pf = yi === 0 ? proration : 1;

  for (const ro of rows) {
    r++; ws.getCell(r, 1).value = ro.roleName || "Unnamed"; ws.getCell(r, 1).font = NF;
    const fte = ro.fte ?? 1;
    const base = ro.annualizedRate ?? 0;
    const benefits = ro.benefitsEligible ? (ro.benefitsRate ?? 0.25) : 0;
    const payrollTax = ro.payrollTaxRate ?? 0.08;
    const loaded = base * esc * fte * (1 + benefits + payrollTax);
    const annual = Math.round(loaded * pf);
    const monthly = Math.round(annual / (opMonths || 12));

    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, m + 2);
      cell.value = m < opMonths ? monthly : 0;
      cell.numFmt = CUR; dc(cell);
    }
    setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, annual);
    ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));
  }

  const firstData = 2;
  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "TOTAL PERSONNEL";
  const staffTotalRow = r;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `SUM(${cn(firstData, m + 2)}:${cn(r - 1, m + 2)})`, 0);
    cell.numFmt = CUR; bc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, 0);
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return staffTotalRow;
}

function buildSYExpenses(
  wb: ExcelJS.Workbook, rows: ExpenseRow[], students: number, annualRev: number,
  costInfl: number, proration: number, opMonths: number, cols: number, headers: string[], yi: number
): number {
  const ws = wb.addWorksheet("Operating Expenses");
  ws.columns = [{ width: 30 }, ...Array(12).fill({ width: 14 }), { width: 16 }];

  let r = 1;
  ws.getRow(r).values = headers;
  hdr(ws, r, cols);

  const pf = yi === 0 ? proration : 1;

  for (const ro of rows) {
    r++; ws.getCell(r, 1).value = ro.lineItem || "Unnamed"; ws.getCell(r, 1).font = NF;
    const yearAmt = Math.round(driverVal(ro.amounts, yi, ro.driverType, students, ro.escalationRate, costInfl) * pf);
    const monthly = Math.round(yearAmt / (opMonths || 12));

    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, m + 2);
      cell.value = m < opMonths ? monthly : 0;
      cell.numFmt = CUR; dc(cell);
    }
    setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, yearAmt);
    ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));
  }

  const firstData = 2;
  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "TOTAL OPERATING EXPENSES";
  const opsTotalRow = r;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `SUM(${cn(firstData, m + 2)}:${cn(r - 1, m + 2)})`, 0);
    cell.numFmt = CUR; bc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, 0);
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return opsTotalRow;
}

function buildSYPL(
  wb: ExcelJS.Workbook, monthlyRev: number[], annualPers: number, annualOps: number,
  annualCapDebt: number, annualNI: number, opMonths: number, cols: number, headers: string[],
  sp: SchoolProfile, staffTotalRow: number, opsTotalRow: number, revTotalRow: number,
  mgmtFeeAmt: number = 0,
) {
  const ws = wb.addWorksheet("P&L Summary");
  ws.columns = [{ width: 30 }, ...Array(12).fill({ width: 14 }), { width: 16 }];

  let r = 1;
  ws.getRow(r).values = headers;
  hdr(ws, r, cols);

  r++; ws.getCell(r, 1).value = "Total Revenue"; ws.getCell(r, 1).font = BF;
  const revRow = r;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `Revenue!${cn(revTotalRow, m + 2)}`, Math.round(monthlyRev[m] || 0));
    cell.numFmt = CUR; bc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, monthlyRev.reduce((a, b) => a + Math.round(b), 0));
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "Personnel"; ws.getCell(r, 1).font = NF;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `Personnel!${cn(staffTotalRow, m + 2)}`, m < opMonths ? Math.round(annualPers / (opMonths || 12)) : 0);
    cell.numFmt = CUR; dc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(annualPers));
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  const displayOps = sp.hasManagementFee ? annualOps - mgmtFeeAmt : annualOps;
  r++; ws.getCell(r, 1).value = "Operating Expenses"; ws.getCell(r, 1).font = NF;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `'Operating Expenses'!${cn(opsTotalRow, m + 2)}`, m < opMonths ? Math.round(displayOps / (opMonths || 12)) : 0);
    cell.numFmt = CUR; dc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(displayOps));
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  let mgmtFeeRowNum = 0;
  if (sp.hasManagementFee && mgmtFeeAmt > 0) {
    r++; ws.getCell(r, 1).value = "Authorizer / Management Fee"; ws.getCell(r, 1).font = NF;
    mgmtFeeRowNum = r;
    const monthlyFee = Math.round(mgmtFeeAmt / (opMonths || 12));
    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, m + 2);
      cell.value = m < opMonths ? monthlyFee : 0;
      cell.numFmt = CUR; dc(cell);
    }
    setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(mgmtFeeAmt));
    ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));
  }

  r++; ws.getCell(r, 1).value = "Capital & Debt"; ws.getCell(r, 1).font = NF;
  const monthlyDebt = Math.round(annualCapDebt / 12);
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    cell.value = monthlyDebt;
    cell.numFmt = CUR; dc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(annualCapDebt));
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  const totalExpRow = r + 1;
  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "Total Expenses";
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `SUM(${cn(revRow + 1, m + 2)}:${cn(r - 1, m + 2)})`, 0);
    cell.numFmt = CUR; gc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(annualPers + annualOps + annualCapDebt));
  ws.getCell(r, 14).numFmt = CUR; gc(ws.getCell(r, 14));

  const niLabel = sp.entityType === "nonprofit_501c3" ? "Net Income" : "Profit / (Loss)";
  r++; ws.getCell(r, 1).value = niLabel; ws.getCell(r, 1).font = BF;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `${cn(revRow, m + 2)}-${cn(totalExpRow, m + 2)}`, 0);
    cell.numFmt = CUR; gc(cell);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: annualNI >= 0 ? GREEN_BG : RED_BG } };
  }
  setFormula(ws.getCell(r, 14), `${cn(revRow, 14)}-${cn(totalExpRow, 14)}`, Math.round(annualNI));
  ws.getCell(r, 14).numFmt = CUR; gc(ws.getCell(r, 14));
  ws.getCell(r, 14).fill = { type: "pattern", pattern: "solid", fgColor: { argb: annualNI >= 0 ? GREEN_BG : RED_BG } };

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildUWCoverSheet(
  wb: ExcelJS.Workbook, sp: SchoolProfile, yc: number,
  rev: number[], ni: number[], cumNI: number[],
  annualDebtSvc: number, startingCash: number, enrollment: number[], maxCapacity: number,
) {
  const ws = wb.addWorksheet("Cover");
  ws.columns = [{ width: 5 }, { width: 38 }, { width: 30 }, { width: 5 }];

  ws.getRow(1).height = 20;
  ws.getRow(2).height = 10;

  let r = 3;
  ws.getCell(r, 2).value = "SchoolStack Budget";
  ws.getCell(r, 2).font = { bold: true, size: 24, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 2, r, 3);
  ws.getRow(r).height = 40;

  r++;
  ws.getCell(r, 2).value = "Underwriting Package";
  ws.getCell(r, 2).font = { bold: true, size: 16, color: { argb: "FF64748B" }, name: "Calibri" };
  ws.mergeCells(r, 2, r, 3);
  ws.getRow(r).height = 28;

  r += 2;
  for (let c = 2; c <= 3; c++) {
    ws.getCell(r, c).border = { bottom: { style: "medium", color: { argb: "FFD97706" } } };
  }
  ws.getRow(r).height = 4;

  r += 2;
  ws.getCell(r, 2).value = "Prepared for";
  ws.getCell(r, 2).font = { size: 11, color: { argb: "FF94A3B8" }, name: "Calibri" };
  r++;
  ws.getCell(r, 2).value = sp.schoolName || "School";
  ws.getCell(r, 2).font = { bold: true, size: 18, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 2, r, 3);
  ws.getRow(r).height = 32;

  r++;
  const details: string[] = [];
  if (sp.schoolType) details.push(schoolTypeLabel(sp.schoolType, sp.schoolTypeOther));
  if (sp.entityType) details.push(entityLabel(sp.entityType));
  if (sp.state) details.push(sp.state);
  ws.getCell(r, 2).value = details.join("  •  ");
  ws.getCell(r, 2).font = { size: 11, color: { argb: "FF64748B" }, name: "Calibri" };
  ws.mergeCells(r, 2, r, 3);

  r += 2;
  ws.getCell(r, 2).value = "Date Prepared";
  ws.getCell(r, 2).font = { size: 11, color: { argb: "FF94A3B8" }, name: "Calibri" };
  ws.getCell(r, 3).value = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  ws.getCell(r, 3).font = { bold: true, size: 11, color: { argb: NAVY }, name: "Calibri" };

  r += 3;
  sec(ws, r, 3);
  ws.getCell(r, 2).value = "UNDERWRITING HIGHLIGHTS";
  ws.getRow(r).height = 24;

  const lastYear = yc - 1;
  const finalRev = rev[lastYear] ?? 0;
  const finalNI = ni[lastYear] ?? 0;
  const finalCash = startingCash + cumNI[lastYear];

  const passCount = [
    finalNI >= 0,
    finalCash > 0,
    enrollment[lastYear] / Math.max(maxCapacity, 1) >= 0.7,
  ].filter(Boolean).length;
  const assessment = passCount === 3 ? "Strong" : passCount >= 2 ? "Conditional" : "Needs Work";

  const highlights: Array<{ label: string; value: string | number; fmt: string }> = [
    { label: `Year ${yc} Revenue`, value: finalRev, fmt: CUR },
    { label: `Year ${yc} Net Income`, value: finalNI, fmt: CUR },
    { label: "Ending Cash Balance", value: finalCash, fmt: CUR },
    { label: "Overall Assessment", value: assessment, fmt: "" },
  ];

  for (const { label, value, fmt } of highlights) {
    r++;
    ws.getCell(r, 2).value = label;
    ws.getCell(r, 2).font = NF;
    ws.getCell(r, 2).border = BORDER;
    ws.getCell(r, 3).value = value;
    ws.getCell(r, 3).font = BF;
    ws.getCell(r, 3).border = BORDER;
    if (fmt) ws.getCell(r, 3).numFmt = fmt;
    if (label === "Overall Assessment") {
      const aFill = assessment === "Strong" ? GREEN_BG : assessment === "Conditional" ? AMBER_BG : RED_BG;
      ws.getCell(r, 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: aFill } };
    }
  }

  r += 3;
  sec(ws, r, 3);
  ws.getCell(r, 2).value = "TABLE OF CONTENTS";
  ws.getRow(r).height = 24;

  const sheets = wb.worksheets.filter(s => s.name !== "Cover");
  for (const sheet of sheets) {
    r++;
    ws.getCell(r, 2).value = { text: sheet.name, hyperlink: `#'${sheet.name}'!A1` };
    ws.getCell(r, 2).font = { size: 11, name: "Calibri", color: { argb: "FF2563EB" }, underline: true };
    ws.getCell(r, 2).border = BORDER;
    ws.getCell(r, 3).border = BORDER;
  }

  r += 3;
  ws.getCell(r, 2).value = "Generated by SchoolStack Budget  •  budget.schoolstack.ai";
  ws.getCell(r, 2).font = { italic: true, size: 11, color: { argb: "FF9CA3AF" }, name: "Calibri" };
  ws.mergeCells(r, 2, r, 3);

  ws.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    paperSize: 1 as unknown as undefined,
    margins: { left: 0.75, right: 0.75, top: 1, bottom: 1, header: 0.3, footer: 0.3 },
  };
}

function buildAssumptions(
  wb: ExcelJS.Workbook, sp: SchoolProfile, enrollment: number[], yc: number,
  salaryEsc: number, costInflation: number, proration: number, tiers?: TuitionTier[]
) {
  const ws = wb.addWorksheet("Assumptions");
  const colCount = Math.max(2, yc + 1);
  ws.columns = [{ width: 38 }, ...Array(Math.max(1, yc)).fill({ width: 18 })];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack - Assumptions & Drivers";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, colCount);
  ws.getRow(r).height = 32;

  r++;
  ws.getCell(r, 1).fill = INPUT_CELL_FILL;
  ws.getCell(r, 1).value = "";
  ws.getCell(r, 1).border = INPUT_CELL_BORDER;
  ws.getCell(r, 2).value = "Editable assumption \u2014 change this value";
  ws.getCell(r, 2).font = { italic: true, size: 11, color: { argb: "FF666666" }, name: "Calibri" };
  ws.getCell(r, 4).value = "";
  ws.getCell(r, 4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(r, 4).border = { bottom: { style: "thin", color: { argb: "FFD0D0D0" } } };
  ws.getCell(r, 5).value = "Calculated \u2014 driven by formula";
  ws.getCell(r, 5).font = { italic: true, size: 11, color: { argb: "FF666666" }, name: "Calibri" };

  r = 3; sec(ws, r, colCount);
  ws.getCell(r, 1).value = "SCHOOL INFORMATION";

  const infoItems: [string, string | number][] = [
    ["School Name", sp.schoolName || ""],
    ["State", sp.state || ""],
    ["School Type", schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityLabel(sp.entityType)],
    ["School Stage", sp.schoolStage === "operating_school" ? "Operating School" : "New School"],
    [sp.schoolStage === "new_school" ? "Planned Opening Year" : "Year Opened",
      sp.schoolStage === "new_school" ? (sp.plannedOpeningYear || "") : (sp.openingYear || 0)],
    ["Max Student Capacity", sp.maxCapacity || 0],
    ["Fiscal Year Start", (MONTH_NAMES[sp.fiscalYearStartMonth || 7] || "July") as string],
    ["EIN", sp.ein || ""],
    ["Year 1 Operating Months", sp.isPartialFirstYear ? (sp.year1OperatingMonths || 12) : 12],
  ];

  for (const [l, v] of infoItems) {
    r++; ws.getCell(r, 1).value = l; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = v; ws.getCell(r, 2).font = BF;
  }

  r = 15; sec(ws, r, colCount);
  ws.getCell(r, 1).value = "ENROLLMENT BY YEAR";

  r = 16;
  ws.getCell(r, 1).value = ""; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    ws.getCell(r, y + 2).value = `Year ${y + 1}`;
    ws.getCell(r, y + 2).font = BF;
    ws.getCell(r, y + 2).alignment = { horizontal: "center" };
  }
  hdr(ws, r, colCount);

  r = ASM.ENROLL_ROW;
  ws.getCell(r, 1).value = "Students"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = enrollment[y]; cell.numFmt = NUM; bc(cell);
    applyInputStyle(cell);
  }

  r = 19; sec(ws, r, colCount);
  ws.getCell(r, 1).value = "GROWTH & ESCALATION RATES";

  r = ASM.SALARY_ESC_ROW;
  ws.getCell(r, 1).value = "Salary Escalation"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = salaryEsc; ws.getCell(r, 2).numFmt = PCT;
  applyInputStyle(ws.getCell(r, 2));

  r = ASM.COST_INFL_ROW;
  ws.getCell(r, 1).value = "Cost Inflation"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = costInflation; ws.getCell(r, 2).numFmt = PCT;
  applyInputStyle(ws.getCell(r, 2));

  r = ASM.PRORATION_ROW;
  ws.getCell(r, 1).value = "Year 1 Proration Factor"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = proration; ws.getCell(r, 2).numFmt = "0.00";
  applyInputStyle(ws.getCell(r, 2));

  r = 23;
  ws.getCell(r, 1).value = "Projection Period"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = `${yc} Years`; ws.getCell(r, 2).font = BF;

  if (tiers && tiers.length > 0) {
    r = 25; sec(ws, r, colCount);
    ws.getCell(r, 1).value = "TUITION DISCOUNT TIERS";
    for (const t of tiers) {
      r++; ws.getCell(r, 1).value = `${t.label} (${t.discountPercent}% discount)`; ws.getCell(r, 1).font = NF;
      ws.getCell(r, 2).value = `${t.studentCounts.reduce((a, b) => a + b, 0)} total students`; ws.getCell(r, 2).font = BF;
    }
  }
}

function buildEnrollmentRevDrivers(
  wb: ExcelJS.Workbook, enrollment: number[], rows: RevenueRow[], yc: number,
  cols: number, yearHeaders: string[], maxCapacity: number, tiers?: TuitionTier[]
) {
  const ws = wb.addWorksheet("Enrollment & Rev Drivers");
  ws.columns = [{ width: 42 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  r++; ws.getCell(r, 1).value = "Students"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = enrollment[y]; cell.numFmt = NUM; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Enrollment Growth %"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (y === 0) { cell.value = "-"; dc(cell); }
    else {
      const prev = enrollment[y - 1];
      const cur = enrollment[y];
      setFormula(cell, `IF(${cn(r - 1, y + 1)}=0,"-",(${cn(r - 1, y + 2)}-${cn(r - 1, y + 1)})/${cn(r - 1, y + 1)})`, prev === 0 ? "-" : (cur - prev) / prev);
      cell.numFmt = PCT; dc(cell);
    }
  }

  r++; ws.getCell(r, 1).value = "Capacity Utilization %"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = maxCapacity > 0 ? enrollment[y] / maxCapacity : 0;
    cell.numFmt = PCT; dc(cell);
  }

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "REVENUE PER STUDENT";

  const perStudentRevRows = rows.filter(ro => ro.enabled && ro.driverType === "per_student");
  for (const ro of perStudentRevRows) {
    r++; ws.getCell(r, 1).value = `${ro.lineItem} (per student)`; ws.getCell(r, 1).font = NF;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      cell.value = ro.amounts?.[y] ?? 0; cell.numFmt = CUR; dc(cell);
    }
  }

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "REVENUE MIX SUMMARY";

  const categories = ["tuition_and_fees", "tuition_offsets", "public_funding", "school_choice", "philanthropy", "other_revenue"];
  for (const cat of categories) {
    const catRows = rows.filter(ro => ro.enabled && (ro.category === cat || (cat === "philanthropy" && ro.category === "grants_contributions")));
    if (catRows.length === 0) continue;
    r++; ws.getCell(r, 1).value = REV_CAT_LABELS[cat] || cat; ws.getCell(r, 1).font = NF;
    for (let y = 0; y < yc; y++) {
      let catTotal = 0;
      for (const ro of catRows) {
        if (ro.driverType === "percent_of_base") {
          const baseRow = rows.find(b => b.id === ro.percentBase);
          if (baseRow) {
            const baseVal = driverVal(baseRow.amounts, y, baseRow.driverType, enrollment[y]);
            catTotal += baseVal * ((ro.amounts?.[y] ?? 0) / 100);
          }
        } else if (ro.id === "gross_tuition" && ro.driverType === "per_student" && tiers && tiers.length > 0) {
          catTotal += tuitionWithTiers(ro.amounts?.[y] ?? 0, y, enrollment[y], tiers);
        } else {
          catTotal += driverVal(ro.amounts, y, ro.driverType, enrollment[y]);
        }
      }
      if (cat === "tuition_offsets") catTotal = -Math.abs(catTotal);
      const cell = ws.getCell(r, y + 2); cell.value = Math.round(catTotal); cell.numFmt = CUR; dc(cell);
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildTuitionFundingDetail(
  wb: ExcelJS.Workbook, rows: RevenueRow[], enrollment: number[], yc: number,
  cols: number, yearHeaders: string[], tiers?: TuitionTier[]
): number {
  const ws = wb.addWorksheet("Tuition & Funding Detail");
  ws.columns = [{ width: 42 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  r++; ws.getCell(r, 1).value = "Students"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, asmEnroll(y), enrollment[y]);
    cell.numFmt = NUM; bc(cell);
  }

  const categories = ["tuition_and_fees", "tuition_offsets", "public_funding", "school_choice", "philanthropy", "other_revenue"];
  const catTotalRows: number[] = [];
  const catTotalValues: number[][] = [];

  for (const cat of categories) {
    const catRows = rows.filter(ro => ro.enabled && (ro.category === cat || (cat === "philanthropy" && ro.category === "grants_contributions")));
    if (catRows.length === 0) continue;

    r++; sec(ws, r, cols); ws.getCell(r, 1).value = (REV_CAT_LABELS[cat] || cat).toUpperCase();
    const firstData = r + 1;

    for (const ro of catRows) {
      r++; ws.getCell(r, 1).value = ro.lineItem; ws.getCell(r, 1).font = NF;
      for (let y = 0; y < yc; y++) {
        const cell = ws.getCell(r, y + 2);
        const amt = ro.amounts?.[y] ?? 0;
        let computed = 0;
        if (ro.driverType === "percent_of_base") {
          const baseRow = rows.find(b => b.id === ro.percentBase);
          if (baseRow) {
            const baseVal = driverVal(baseRow.amounts, y, baseRow.driverType, enrollment[y]);
            computed = Math.round(baseVal * (amt / 100));
          }
          cell.value = computed;
        } else if (ro.driverType === "per_student") {
          if (ro.id === "gross_tuition" && tiers && tiers.length > 0) {
            computed = Math.round(tuitionWithTiers(amt, y, enrollment[y], tiers));
            cell.value = computed;
          } else {
            computed = Math.round(amt * enrollment[y]);
            setFormula(cell, `ROUND(${asmEnroll(y)}*${amt},0)`, computed);
          }
        } else if (ro.driverType === "monthly") {
          computed = Math.round(amt * 12);
          cell.value = computed;
        } else {
          computed = Math.round(amt);
          cell.value = computed;
        }
        if (cat === "tuition_offsets") {
          const absVal = Math.abs(typeof cell.value === "number" ? cell.value : computed);
          cell.value = -absVal;
        }
        cell.numFmt = CUR; dc(cell);
      }
    }

    r++; ws.getCell(r, 1).value = `Total ${REV_CAT_LABELS[cat] || cat}`; ws.getCell(r, 1).font = BF;
    const catTotals: number[] = [];
    for (let y = 0; y < yc; y++) {
      let catSum = 0;
      for (const ro of catRows) {
        const amt = ro.amounts?.[y] ?? 0;
        if (ro.driverType === "percent_of_base") {
          const baseRow = rows.find(b => b.id === ro.percentBase);
          if (baseRow) catSum += Math.round(driverVal(baseRow.amounts, y, baseRow.driverType, enrollment[y]) * (amt / 100));
        } else if (ro.driverType === "per_student") {
          if (ro.id === "gross_tuition" && tiers && tiers.length > 0) catSum += Math.round(tuitionWithTiers(amt, y, enrollment[y], tiers));
          else catSum += Math.round(amt * enrollment[y]);
        } else if (ro.driverType === "monthly") {
          catSum += Math.round(amt * 12);
        } else {
          catSum += Math.round(amt);
        }
      }
      if (cat === "tuition_offsets") catSum = -Math.abs(catSum);
      catTotals.push(catSum);
      const cell = ws.getCell(r, y + 2);
      setFormula(cell, `SUM(${cn(firstData, y + 2)}:${cn(r - 1, y + 2)})`, catSum);
      cell.numFmt = CUR; bc(cell);
    }
    sec(ws, r, cols);
    catTotalRows.push(r);
    catTotalValues.push(catTotals);
  }

  r += 2; ws.getCell(r, 1).value = "TOTAL NET REVENUE"; ws.getCell(r, 1).font = BF;
  const grandTotalRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (catTotalRows.length > 0) {
      const netRev = catTotalValues.reduce((sum, ct) => sum + (ct[y] || 0), 0);
      setFormula(cell, catTotalRows.map(tr => cn(tr, y + 2)).join("+"), netRev);
    } else cell.value = 0;
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return grandTotalRow;
}

function buildStaffingPlan(
  wb: ExcelJS.Workbook, rows: StaffingRow[], salaryEsc: number,
  proration: number, yc: number, cols: number, yearHeaders: string[]
): number {
  const ws = wb.addWorksheet("Staffing Plan");

  const rosterCols = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 18 }];
  ws.columns = rosterCols;

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack - Staffing Plan";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 8); ws.getRow(r).height = 32;

  r = 3;
  ws.getRow(r).values = ["Role", "Function", "Type", "FTE", "Annual Rate", "Benefits %", "Payroll Tax %", "Total Cost"];
  hdr(ws, r, 8);

  const funcOrder = ["school_leadership", "instructional", "student_support", "operations", "administrative", "other"];
  const sorted = [...rows].sort((a, b) => {
    const ai = funcOrder.indexOf(a.functionCategory);
    const bi = funcOrder.indexOf(b.functionCategory);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  let totalSalaries = 0, totalBenefits = 0, totalTax = 0, totalContract = 0, totalFTE = 0;

  for (const row of sorted) {
    r++;
    const annual = row.fte * row.annualizedRate;
    const isCNPL = row.employmentType === "contract" && !row.payrollLike;
    let ben = 0, tax = 0;
    if (isCNPL) { totalContract += annual; }
    else {
      totalSalaries += annual;
      if (row.benefitsEligible) { ben = annual * (row.benefitsRate / 100); totalBenefits += ben; }
      tax = annual * (row.payrollTaxRate / 100); totalTax += tax;
    }
    totalFTE += row.fte;
    const tc = annual + ben + tax;

    ws.getCell(r, 1).value = row.roleName; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = funcLabel(row.functionCategory); ws.getCell(r, 2).font = NF;
    ws.getCell(r, 3).value = row.employmentType === "full_time" ? "FT" : row.employmentType === "part_time" ? "PT" : "Contract";
    ws.getCell(r, 3).font = NF;
    ws.getCell(r, 4).value = row.fte; ws.getCell(r, 4).font = NF; ws.getCell(r, 4).numFmt = "0.00"; applyInputStyle(ws.getCell(r, 4));
    ws.getCell(r, 5).value = row.annualizedRate; ws.getCell(r, 5).font = NF; ws.getCell(r, 5).numFmt = CUR; applyInputStyle(ws.getCell(r, 5));
    ws.getCell(r, 6).value = row.benefitsEligible ? row.benefitsRate / 100 : 0; ws.getCell(r, 6).font = NF; ws.getCell(r, 6).numFmt = PCT; applyInputStyle(ws.getCell(r, 6));
    ws.getCell(r, 7).value = row.payrollTaxRate / 100; ws.getCell(r, 7).font = NF; ws.getCell(r, 7).numFmt = PCT; applyInputStyle(ws.getCell(r, 7));
    ws.getCell(r, 8).value = Math.round(tc); ws.getCell(r, 8).font = BF; ws.getCell(r, 8).numFmt = CUR;
  }

  const grandTotal = totalSalaries + totalBenefits + totalTax + totalContract;

  r += 2; sec(ws, r, 8); ws.getCell(r, 1).value = "PERSONNEL COST SUMMARY";
  r++; ws.getCell(r, 1).value = "Total Headcount"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = rows.length; ws.getCell(r, 2).font = BF;
  r++; ws.getCell(r, 1).value = "Total FTE"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalFTE * 10) / 10; ws.getCell(r, 2).font = BF;
  r++; ws.getCell(r, 1).value = "Salaries & Wages"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalSalaries); ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Benefits"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalBenefits); ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Payroll Taxes"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalTax); ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Contracted Personnel"; ws.getCell(r, 1).font = NF; ws.getCell(r, 2).value = Math.round(totalContract); ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Total Base Personnel Cost"; ws.getCell(r, 1).font = BF;
  ws.getCell(r, 2).value = Math.round(grandTotal); ws.getCell(r, 2).font = BF; ws.getCell(r, 2).numFmt = CUR;

  r += 2;
  ws.columns = [{ width: 30 }, ...Array(yc).fill({ width: 18 })];
  sec(ws, r, cols); ws.getCell(r, 1).value = "MULTI-YEAR PERSONNEL PROJECTION";
  r++; ws.getRow(r).values = yearHeaders; hdr(ws, r, cols);

  const baseRow = r + 1;
  r = baseRow;
  ws.getCell(r, 1).value = "Base Cost"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = Math.round(grandTotal); cell.numFmt = CUR; dc(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Escalation Factor"; ws.getCell(r, 1).font = NF;
  const escRow = r;
  for (let y = 0; y < yc; y++) {
    const esc = Math.pow(1 + salaryEsc, y);
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `(1+${asmRef(ASM.SALARY_ESC_ROW)})^${y}`, esc);
    cell.numFmt = "0.0000"; dc(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Proration"; ws.getCell(r, 1).font = NF;
  const proRow = r;
  for (let y = 0; y < yc; y++) {
    const pf = y === 0 ? proration : 1;
    const cell = ws.getCell(r, y + 2);
    if (y === 0) setFormula(cell, asmRef(ASM.PRORATION_ROW), pf);
    else cell.value = 1;
    cell.numFmt = "0.000"; dc(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Total Personnel"; ws.getCell(r, 1).font = BF;
  const staffTotalRow = r;
  for (let y = 0; y < yc; y++) {
    const esc = Math.pow(1 + salaryEsc, y);
    const pf = y === 0 ? proration : 1;
    const total = Math.round(grandTotal * esc * pf);
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `${cn(baseRow, y + 2)}*${cn(escRow, y + 2)}*${cn(proRow, y + 2)}`, total);
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 1 }];
  return staffTotalRow;
}

function buildOperatingExpenses(
  wb: ExcelJS.Workbook, rows: ExpenseRow[], enrollment: number[],
  annualRev: number[], yc: number, cols: number, yearHeaders: string[]
): number {
  const ws = wb.addWorksheet("Operating Expenses");
  ws.columns = [{ width: 42 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  const nonFacility = rows.filter(ro => ro.category !== "occupancy_facility");

  const categories = ["instructional_program", "technology", "administrative_general"];
  const catTotalRows: number[] = [];
  const catTotalVals: number[][] = [];

  for (const cat of categories) {
    const catRows = nonFacility.filter(ro => ro.enabled && ro.category === cat);

    r++; sec(ws, r, cols); ws.getCell(r, 1).value = (EXP_CAT_LABELS[cat] || cat).toUpperCase();
    const firstData = r + 1;

    for (const ro of catRows) {
      r++; ws.getCell(r, 1).value = ro.lineItem; ws.getCell(r, 1).font = NF;
      for (let y = 0; y < yc; y++) {
        const cell = ws.getCell(r, y + 2);
        const computed = ro.driverType === "percent_of_revenue"
          ? Math.round((resolveAmount(ro.amounts, y, ro.escalationRate) / 100) * annualRev[y])
          : Math.round(driverVal(ro.amounts, y, ro.driverType, enrollment[y], ro.escalationRate, _globalCostInflationPct));

        if (ro.driverType === "per_student") {
          const baseAmt = ro.amounts?.[0] ?? 0;
          const esc = resolveEsc(ro.escalationRate);
          if (esc !== 0 && y > 0) {
            setFormula(cell, `ROUND(${asmEnroll(y)}*${baseAmt}*(1+${asmRef(ASM.COST_INFL_ROW)})^${y},0)`, computed);
          } else {
            setFormula(cell, `ROUND(${asmEnroll(y)}*${ro.amounts?.[y] ?? 0},0)`, computed);
          }
        } else {
          cell.value = computed;
        }
        cell.numFmt = CUR; dc(cell);
      }
    }

    r++; ws.getCell(r, 1).value = `Total ${EXP_CAT_LABELS[cat] || cat}`; ws.getCell(r, 1).font = BF;
    const totals: number[] = [];
    for (let y = 0; y < yc; y++) {
      let catSum = 0;
      for (const ro of catRows) {
        if (ro.driverType === "percent_of_revenue") catSum += Math.round((resolveAmount(ro.amounts, y, ro.escalationRate) / 100) * annualRev[y]);
        else catSum += Math.round(driverVal(ro.amounts, y, ro.driverType, enrollment[y], ro.escalationRate, _globalCostInflationPct));
      }
      totals.push(catSum);
      const cell = ws.getCell(r, y + 2);
      if (catRows.length === 0) {
        cell.value = 0;
      } else {
        setFormula(cell, `SUM(${cn(firstData, y + 2)}:${cn(r - 1, y + 2)})`, catSum);
      }
      cell.numFmt = CUR; bc(cell);
    }
    sec(ws, r, cols);
    catTotalRows.push(r);
    catTotalVals.push(totals);
  }

  r += 2; ws.getCell(r, 1).value = "TOTAL OPERATING EXPENSES"; ws.getCell(r, 1).font = BF;
  const grandTotalRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (catTotalRows.length > 0) {
      const total = catTotalVals.reduce((sum, ct) => sum + (ct[y] || 0), 0);
      setFormula(cell, catTotalRows.map(tr => cn(tr, y + 2)).join("+"), total);
    } else cell.value = 0;
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return grandTotalRow;
}

function buildFacilitiesOccupancy(
  wb: ExcelJS.Workbook, rows: ExpenseRow[], enrollment: number[],
  annualRev: number[], yc: number, cols: number, yearHeaders: string[]
): number {
  const ws = wb.addWorksheet("Facilities & Occupancy");
  ws.columns = [{ width: 42 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  const facRows = rows.filter(ro => ro.enabled && ro.category === "occupancy_facility");

  if (facRows.length === 0) {
    r++; ws.getCell(r, 1).value = "No facility expenses entered"; ws.getCell(r, 1).font = NF;
    r++; ws.getCell(r, 1).value = "Total Facility Costs"; ws.getCell(r, 1).font = BF;
    for (let y = 0; y < yc; y++) { const cell = ws.getCell(r, y + 2); cell.value = 0; cell.numFmt = CUR; bc(cell); }
    return r;
  }

  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "OCCUPANCY / FACILITY COSTS";
  const firstData = r + 1;

  for (const ro of facRows) {
    r++; ws.getCell(r, 1).value = ro.lineItem; ws.getCell(r, 1).font = NF;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      if (ro.driverType === "percent_of_revenue") {
        cell.value = Math.round((resolveAmount(ro.amounts, y, ro.escalationRate) / 100) * annualRev[y]);
      } else {
        cell.value = Math.round(driverVal(ro.amounts, y, ro.driverType, enrollment[y], ro.escalationRate, _globalCostInflationPct));
      }
      cell.numFmt = CUR; dc(cell);
    }
  }

  r++; ws.getCell(r, 1).value = "Total Facility Costs"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    let facSum = 0;
    for (const ro of facRows) {
      if (ro.driverType === "percent_of_revenue") facSum += Math.round((resolveAmount(ro.amounts, y, ro.escalationRate) / 100) * annualRev[y]);
      else facSum += Math.round(driverVal(ro.amounts, y, ro.driverType, enrollment[y], ro.escalationRate, _globalCostInflationPct));
    }
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `SUM(${cn(firstData, y + 2)}:${cn(r - 1, y + 2)})`, facSum);
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  r += 2; ws.getCell(r, 1).value = "Cost per Student"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    let facTotal = 0;
    for (const ro of facRows) {
      if (ro.driverType === "percent_of_revenue") facTotal += (resolveAmount(ro.amounts, y, ro.escalationRate) / 100) * annualRev[y];
      else facTotal += driverVal(ro.amounts, y, ro.driverType, enrollment[y], ro.escalationRate, _globalCostInflationPct);
    }
    cell.value = enrollment[y] > 0 ? Math.round(facTotal / enrollment[y]) : 0;
    cell.numFmt = CUR; dc(cell);
  }

  const facTotalRow = r - 2;
  r++; ws.getCell(r, 1).value = "% of Revenue"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    let facTotal = 0;
    for (const ro of facRows) {
      if (ro.driverType === "percent_of_revenue") facTotal += (resolveAmount(ro.amounts, y, ro.escalationRate) / 100) * annualRev[y];
      else facTotal += driverVal(ro.amounts, y, ro.driverType, enrollment[y], ro.escalationRate, _globalCostInflationPct);
    }
    cell.value = annualRev[y] > 0 ? facTotal / annualRev[y] : 0;
    cell.numFmt = PCT; dc(cell);
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return facTotalRow;
}

function buildSourcesUses(
  wb: ExcelJS.Workbook, sp: SchoolProfile, capDebtRows: CapitalDebtRow[], startingCash: number,
  annualPersonnel: number[], annualExpenses: number[],
  annualCapDebt: number[],
  expenseRows: ExpenseRow[], enrollment: number[],
  totalPrincipal: number
) {
  const ws = wb.addWorksheet("Capital Stack & Startup Uses");
  ws.columns = [{ width: 44 }, { width: 22 }];
  const yr1Lbl = schoolYearLabel(sp.openingYear, 0);

  let r = 1;
  ws.getCell(r, 1).value = `SchoolStack - Capital Stack (${yr1Lbl})`;
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 2); ws.getRow(r).height = 32;

  r = 3; sec(ws, r, 2); ws.getCell(r, 1).value = "SOURCES OF CAPITAL";
  const sourcesStart = r + 1;

  r++; ws.getCell(r, 1).value = "Founder Equity / Starting Cash"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = NF;

  for (const row of capDebtRows) {
    if (!row.enabled || !row.isLoan) continue;
    r++; ws.getCell(r, 1).value = `Loan: ${row.lineItem}`; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = row.loanPrincipal || 0; ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = NF;
  }

  for (const row of capDebtRows) {
    if (!row.enabled || row.isLoan) continue;
    if ((row.amounts?.[0] ?? 0) < 0) {
      r++; ws.getCell(r, 1).value = `Grant / In-Kind: ${row.lineItem}`; ws.getCell(r, 1).font = NF;
      ws.getCell(r, 2).value = Math.abs(row.amounts?.[0] ?? 0); ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = NF;
    }
  }

  r++; sec(ws, r, 2); ws.getCell(r, 1).value = "TOTAL CAPITAL SOURCES";
  const srcTotal = r;
  let totalSources = startingCash;
  for (const row of capDebtRows) { if (row.enabled && row.isLoan) totalSources += row.loanPrincipal || 0; }
  for (const row of capDebtRows) { if (row.enabled && !row.isLoan && (row.amounts?.[0] ?? 0) < 0) totalSources += Math.abs(row.amounts?.[0] ?? 0); }
  setFormula(ws.getCell(r, 2), `SUM(${cn(sourcesStart, 2)}:${cn(r - 1, 2)})`, totalSources);
  ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;

  r += 2; sec(ws, r, 2); ws.getCell(r, 1).value = "STARTUP / PRE-OPENING USES";
  const usesStart = r + 1;

  const y1Personnel = annualPersonnel[0] || 0;
  const y1Expenses = annualExpenses[0] || 0;
  const y1CapDebt = annualCapDebt[0] || 0;

  const occupancyRows = expenseRows.filter(e => e.enabled && e.category === "occupancy_facility");
  const techRows = expenseRows.filter(e => e.enabled && e.category === "technology");
  const instructionalRows = expenseRows.filter(e => e.enabled && e.category === "instructional_program");

  const occupancyY1 = occupancyRows.reduce((s, e) => s + driverVal(e.amounts, 0, e.driverType, enrollment[0]), 0);
  const equipmentFFE = Math.round(techRows.reduce((s, e) => s + driverVal(e.amounts, 0, e.driverType, enrollment[0]), 0) * 0.5);
  const curriculumLaunch = Math.round(instructionalRows.reduce((s, e) => s + driverVal(e.amounts, 0, e.driverType, enrollment[0]), 0));
  const depositsPrepaid = Math.round(occupancyY1 / 12 * 2);
  const workingCapReserve = Math.round((y1Personnel + y1Expenses) / 12 * 2);

  const usesItems: [string, number][] = [];

  if (depositsPrepaid > 0) usesItems.push(["Deposits & Prepaid Occupancy (2 mo)", depositsPrepaid]);
  if (equipmentFFE > 0) usesItems.push(["Equipment / FF&E / Technology", equipmentFFE]);
  if (curriculumLaunch > 0) usesItems.push(["Curriculum & Program Launch Costs", curriculumLaunch]);

  for (const row of capDebtRows) {
    if (!row.enabled || row.isLoan) continue;
    if ((row.amounts?.[0] ?? 0) >= 0) {
      usesItems.push([row.lineItem, row.amounts?.[0] ?? 0]);
    }
  }

  if (workingCapReserve > 0) usesItems.push(["Working Capital Reserve (2 mo)", workingCapReserve]);

  const subtotal = usesItems.reduce((s, [, v]) => s + v, 0);
  const contingency = Math.round(subtotal * 0.05);
  usesItems.push(["Contingency (5%)", contingency]);

  let totalUses = 0;
  for (const [label, val] of usesItems) {
    r++; ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = val; ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = NF;
    totalUses += val;
  }

  r++; sec(ws, r, 2); ws.getCell(r, 1).value = "TOTAL STARTUP USES";
  const useTotal = r;
  setFormula(ws.getCell(r, 2), `SUM(${cn(usesStart, 2)}:${cn(r - 1, 2)})`, totalUses);
  ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;

  r += 2;
  ws.getCell(r, 1).value = "CAPITAL SURPLUS / (GAP)"; ws.getCell(r, 1).font = BF;
  const gap = totalSources - totalUses;
  setFormula(ws.getCell(r, 2), `${cn(srcTotal, 2)}-${cn(useTotal, 2)}`, gap);
  ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;
  const gapCell = ws.getCell(r, 2);
  gapCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gap >= 0 ? GREEN_BG : RED_BG } };

  r++; ws.getCell(r, 1).value = gap >= 0 ? "✓ Capital sources cover projected startup uses" : "⚠ Funding gap - additional capital needed";
  ws.getCell(r, 1).font = { ...NF, italic: true, color: { argb: gap >= 0 ? "FF328555" : "FFD32F2F" } };
}

function buildDebtSchedule(wb: ExcelJS.Workbook, capDebtRows: CapitalDebtRow[], yc: number) {
  const ws = wb.addWorksheet("Debt Schedule");
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack - Debt Schedule";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 7); ws.getRow(r).height = 32;

  r = 3;
  ws.getRow(r).values = ["Loan / Facility", "Principal", "Rate", "Term (yrs)", "Annual Payment", "Monthly Payment", "Total Interest"];
  hdr(ws, r, 7);

  const loans = capDebtRows.filter(ro => ro.enabled && ro.isLoan);
  let totalAnnual = 0;

  if (loans.length === 0) {
    r++; ws.getCell(r, 1).value = "No loans entered"; ws.getCell(r, 1).font = NF;
  } else {
    for (const loan of loans) {
      r++;
      const p = loan.loanPrincipal || 0;
      const rate = (loan.loanRate || 0) / 100;
      const term = loan.loanTermYears || 0;
      const annualPmt = computeAnnualDebt(p, rate, term);
      totalAnnual += annualPmt;

      ws.getCell(r, 1).value = loan.lineItem; ws.getCell(r, 1).font = NF;
      ws.getCell(r, 2).value = p; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); applyInputStyle(ws.getCell(r, 2));
      ws.getCell(r, 3).value = rate; ws.getCell(r, 3).numFmt = PCT; dc(ws.getCell(r, 3)); applyInputStyle(ws.getCell(r, 3));
      ws.getCell(r, 4).value = term; ws.getCell(r, 4).numFmt = "0"; dc(ws.getCell(r, 4)); applyInputStyle(ws.getCell(r, 4));
      ws.getCell(r, 5).value = Math.round(annualPmt); ws.getCell(r, 5).numFmt = CUR; dc(ws.getCell(r, 5));
      ws.getCell(r, 6).value = Math.round(annualPmt / 12); ws.getCell(r, 6).numFmt = CUR; dc(ws.getCell(r, 6));
      ws.getCell(r, 7).value = Math.round(annualPmt * term - p); ws.getCell(r, 7).numFmt = CUR; dc(ws.getCell(r, 7));
    }
  }

  r += 2; sec(ws, r, 7); ws.getCell(r, 1).value = "TOTAL DEBT SERVICE";
  r++; ws.getCell(r, 1).value = "Annual Debt Service"; ws.getCell(r, 1).font = BF;
  ws.getCell(r, 2).value = Math.round(totalAnnual); ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;
  r++; ws.getCell(r, 1).value = "Monthly Debt Service"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = Math.round(totalAnnual / 12); ws.getCell(r, 2).numFmt = CUR;

  r += 2; sec(ws, r, 7); ws.getCell(r, 1).value = "AMORTIZATION SCHEDULE (ANNUAL)";
  r++;
  const amortHeaders = ["Year", ...loans.map(l => `${l.lineItem} Balance`)];
  if (amortHeaders.length > 1) {
    ws.getRow(r).values = amortHeaders;
    hdr(ws, r, amortHeaders.length);

    for (let y = 0; y < yc; y++) {
      r++;
      ws.getCell(r, 1).value = `Year ${y + 1}`; ws.getCell(r, 1).font = NF;
      for (let li = 0; li < loans.length; li++) {
        const loan = loans[li];
        const p = loan.loanPrincipal || 0;
        const rate = (loan.loanRate || 0) / 100;
        const term = loan.loanTermYears || 0;
        let balance = p;
        const annualPmt = computeAnnualDebt(p, rate, term);
        for (let yr = 0; yr < y + 1; yr++) {
          const interest = balance * rate;
          const principalPaid = annualPmt - interest;
          balance = Math.max(0, balance - principalPaid);
        }
        const cell = ws.getCell(r, li + 2);
        cell.value = Math.round(balance); cell.numFmt = CUR; dc(cell);
      }
    }
  }
}

function computeExportMonthlyRevenue(
  rows: RevenueRow[], students: number, opMonths: number, tiers?: TuitionTier[]
): number[] {
  const monthly = new Array(12).fill(0);
  const rowValues = new Map<string, number>();

  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    if (r.id === "gross_tuition" && r.driverType === "per_student" && tiers && tiers.length > 0) {
      rowValues.set(r.id, tuitionWithTiers(r.amounts?.[0] ?? 0, 0, students, tiers));
    } else {
      rowValues.set(r.id, driverVal(r.amounts, 0, r.driverType, students));
    }
  }
  for (const r of rows) {
    if (!r.enabled || r.driverType !== "percent_of_base") continue;
    const baseVal = rowValues.get(r.percentBase || "") || 0;
    rowValues.set(r.id, baseVal * ((r.amounts?.[0] ?? 0) / 100));
  }

  for (const r of rows) {
    if (!r.enabled) continue;
    const annualAmount = rowValues.get(r.id) || 0;
    if (annualAmount === 0) continue;

    const isTuition = r.id === "gross_tuition" || r.category === "tuition_offsets";

    if (r.category === "tuition_and_fees" || r.category === "tuition_offsets") {
      if (isTuition) {
        const bm = r.billingMonths ?? 10;
        const effectiveAmount = r.category === "tuition_offsets" ? -Math.abs(annualAmount) : annualAmount;
        const perMonth = effectiveAmount / bm;
        const startMonth = bm >= 12 ? 0 : 1;
        for (let i = startMonth; i < startMonth + bm && i < 12; i++) {
          monthly[i] += perMonth;
        }
      } else {
        monthly[0] += annualAmount;
      }
    } else {
      const perMonth = annualAmount / opMonths;
      for (let m = 0; m < opMonths; m++) {
        monthly[m] += perMonth;
      }
    }
  }
  return monthly;
}

function trueUpMonthly(monthlyArr: number[], annualTarget: number, activeMonths: number): number[] {
  const result = [...monthlyArr];
  const sum = result.reduce((s, v) => s + v, 0);
  const diff = annualTarget - sum;
  if (diff !== 0 && activeMonths > 0) {
    const lastActive = activeMonths - 1;
    result[lastActive] += diff;
  }
  return result;
}

function buildMonthlyCashFlowY1(
  wb: ExcelJS.Workbook, sp: SchoolProfile, annualRev: number[], annualPersonnel: number[],
  annualExpenses: number[], annualCapDebt: number[], startingCash: number, opMonths: number,
  revenueRows?: RevenueRow[], enrollment?: number[], tiers?: TuitionTier[],
  fiscalYearStartMonth?: number
) {
  const ws = wb.addWorksheet("Cash Flow Monthly Y1");
  const fyStart = fiscalYearStartMonth || 7;
  const monthLabels = [""];
  for (let i = 0; i < 12; i++) {
    const mIdx = ((fyStart - 1 + i) % 12) + 1;
    monthLabels.push(MONTH_NAMES[mIdx]);
  }
  ws.columns = [{ width: 30 }, ...Array(12).fill({ width: 14 }), { width: 16 }];
  const yr1Label = schoolYearLabel(sp.openingYear, 0);

  let r = 1;
  ws.getRow(r).values = [...monthLabels, `${yr1Label} Total`];
  hdr(ws, r, 14);

  const students = enrollment?.[0] ?? 0;
  const rawRevMonthly = revenueRows && revenueRows.length > 0
    ? computeExportMonthlyRevenue(revenueRows, students, opMonths, tiers)
    : Array.from({ length: 12 }, (_, m) => m < opMonths ? Math.round((annualRev[0] || 0) / (opMonths || 12)) : 0);
  const monthlyRevArray = trueUpMonthly(rawRevMonthly.map(v => Math.round(v)), annualRev[0] || 0, opMonths);

  const rawPers = Array.from({ length: 12 }, (_, m) => m < opMonths ? Math.round((annualPersonnel[0] || 0) / (opMonths || 12)) : 0);
  const monthlyPersArray = trueUpMonthly(rawPers, annualPersonnel[0] || 0, opMonths);

  const rawOps = Array.from({ length: 12 }, (_, m) => m < opMonths ? Math.round((annualExpenses[0] || 0) / (opMonths || 12)) : 0);
  const monthlyOpsArray = trueUpMonthly(rawOps, annualExpenses[0] || 0, opMonths);

  const rawDebt = Array.from({ length: 12 }, () => Math.round((annualCapDebt[0] || 0) / 12));
  const monthlyDebtArray = trueUpMonthly(rawDebt, annualCapDebt[0] || 0, 12);

  const revRow = r + 1;
  r++; ws.getCell(r, 1).value = "Revenue"; ws.getCell(r, 1).font = BF;
  let revTotal = 0;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = monthlyRevArray[m];
    revTotal += v;
    cell.value = v;
    cell.numFmt = CUR; dc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, revTotal);
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "Personnel"; ws.getCell(r, 1).font = NF;
  let persTotal = 0;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = monthlyPersArray[m];
    persTotal += v;
    cell.value = v;
    cell.numFmt = CUR; dc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, persTotal);
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "Operating Expenses"; ws.getCell(r, 1).font = NF;
  let opsTotal = 0;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = monthlyOpsArray[m];
    opsTotal += v;
    cell.value = v;
    cell.numFmt = CUR; dc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, opsTotal);
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "Debt Service"; ws.getCell(r, 1).font = NF;
  let debtTotal = 0;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = monthlyDebtArray[m];
    debtTotal += v;
    cell.value = v;
    cell.numFmt = CUR; dc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, debtTotal);
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  const totalExpRow = r + 1;
  r++; sec(ws, r, 14); ws.getCell(r, 1).value = "Total Expenses";
  const monthlyExpTotals: number[] = [];
  let expGrandTotal = 0;
  for (let m = 0; m < 12; m++) {
    const total = monthlyPersArray[m] + monthlyOpsArray[m] + monthlyDebtArray[m];
    monthlyExpTotals.push(total);
    expGrandTotal += total;
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `SUM(${cn(revRow + 1, m + 2)}:${cn(r - 1, m + 2)})`, total);
    cell.numFmt = CUR; bc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, expGrandTotal);
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "Net Cash Flow"; ws.getCell(r, 1).font = BF;
  const monthlyNet: number[] = [];
  let netTotal = 0;
  for (let m = 0; m < 12; m++) {
    const rev = Math.round(monthlyRevArray[m] || 0);
    const net = rev - monthlyExpTotals[m];
    monthlyNet.push(net);
    netTotal += net;
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `${cn(revRow, m + 2)}-${cn(totalExpRow, m + 2)}`, net);
    cell.numFmt = CUR; bc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, netTotal);
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  const netCashRow = r;
  r++; ws.getCell(r, 1).value = "Cumulative Cash"; ws.getCell(r, 1).font = BF;
  let cumCash = startingCash;
  const cumValues: number[] = [];
  for (let m = 0; m < 12; m++) {
    cumCash += monthlyNet[m];
    cumValues.push(cumCash);
    const cell = ws.getCell(r, m + 2);
    if (m === 0) {
      setFormula(cell, `${startingCash}+${cn(netCashRow, m + 2)}`, cumCash);
    } else {
      setFormula(cell, `${cn(r, m + 1)}+${cn(netCashRow, m + 2)}`, cumCash);
    }
    cell.numFmt = CUR; bc(cell);
  }
  const endingCash = cumValues[11] || 0;
  setFormula(ws.getCell(r, 14), cn(r, 13), endingCash);
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r += 2; sec(ws, r, 14); ws.getCell(r, 1).value = "CASH FLOW METRICS";
  r++; ws.getCell(r, 1).value = "Starting Cash"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR;
  r++; ws.getCell(r, 1).value = "Ending Cash (Month 12)"; ws.getCell(r, 1).font = NF;
  const cumRow = netCashRow + 1;
  setFormula(ws.getCell(r, 2), cn(cumRow, 13), endingCash);
  ws.getCell(r, 2).numFmt = CUR; ws.getCell(r, 2).font = BF;

  r++; ws.getCell(r, 1).value = "Minimum Cash Month"; ws.getCell(r, 1).font = NF;
  const minCash = Math.min(...cumValues);
  setFormula(ws.getCell(r, 2), `MIN(${cn(cumRow, 2)}:${cn(cumRow, 13)})`, minCash);
  ws.getCell(r, 2).numFmt = CUR;

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildFiveYearPL(
  wb: ExcelJS.Workbook, rev: number[], personnel: number[], ops: number[],
  capDebt: number[], ni: number[], yc: number, cols: number, yearHeaders: string[],
  entityType?: string, ctx?: Partial<CrossTabCtx>, mgmtFeeAmounts?: number[]
): { revRow: number; totalExpRow: number; niRow: number; cumNIRow: number } {
  const hasMgmtFee = mgmtFeeAmounts && mgmtFeeAmounts.some(v => v > 0);
  const ws = wb.addWorksheet("5-Year P&L");
  ws.columns = [{ width: 35 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  const revGT = ctx?.revGrandTotalRow;
  const staffGT = ctx?.staffTotalRow;
  const opexGT = ctx?.opexGrandTotalRow;
  const facGT = ctx?.facGrandTotalRow;

  r++; ws.getCell(r, 1).value = "Total Revenue"; ws.getCell(r, 1).font = BF;
  const revRowPL = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (revGT) {
      setFormula(cell, `'Tuition & Funding Detail'!${cn(revGT, y + 2)}`, rev[y] || 0);
    } else {
      cell.value = rev[y] || 0;
    }
    cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Personnel"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (staffGT) {
      setFormula(cell, `'Staffing Plan'!${cn(staffGT, y + 2)}`, personnel[y] || 0);
    } else {
      cell.value = personnel[y] || 0;
    }
    cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Operating Expenses"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const displayOps = hasMgmtFee ? (ops[y] || 0) - (mgmtFeeAmounts![y] || 0) : (ops[y] || 0);
    if (opexGT && facGT) {
      setFormula(cell, `'Operating Expenses'!${cn(opexGT, y + 2)}+'Facilities & Occupancy'!${cn(facGT, y + 2)}`, displayOps);
    } else if (opexGT) {
      setFormula(cell, `'Operating Expenses'!${cn(opexGT, y + 2)}`, displayOps);
    } else {
      cell.value = displayOps;
    }
    cell.numFmt = CUR; dc(cell);
  }

  if (hasMgmtFee) {
    r++; ws.getCell(r, 1).value = "Authorizer / Management Fee"; ws.getCell(r, 1).font = NF;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      cell.value = mgmtFeeAmounts![y] || 0;
      cell.numFmt = CUR; dc(cell);
    }
  }

  r++; ws.getCell(r, 1).value = "Capital & Debt Service"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = capDebt[y] || 0;
    cell.numFmt = CUR; dc(cell);
  }

  const totalExpRow = r + 1;
  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "Total Expenses";
  for (let y = 0; y < yc; y++) {
    const totalExp = (personnel[y] || 0) + (ops[y] || 0) + (capDebt[y] || 0);
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `SUM(${cn(revRowPL + 1, y + 2)}:${cn(r - 1, y + 2)})`, totalExp);
    cell.numFmt = CUR; gc(cell);
  }

  const niLabel = entityType === "nonprofit_501c3" ? "Net Income" : "Profit / (Loss)";
  r++; ws.getCell(r, 1).value = niLabel; ws.getCell(r, 1).font = BF;
  const niRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `${cn(revRowPL, y + 2)}-${cn(totalExpRow, y + 2)}`, ni[y] || 0);
    cell.numFmt = CUR; gc(cell);
    const niVal = ni[y] || 0;
    if (niVal >= 0) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_BG } };
    } else {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_BG } };
    }
  }

  r++; ws.getCell(r, 1).value = "Net Margin %"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const margin = (rev[y] || 0) === 0 ? 0 : (ni[y] || 0) / (rev[y] || 1);
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `IF(${cn(revRowPL, y + 2)}=0,0,${cn(niRow, y + 2)}/${cn(revRowPL, y + 2)})`, margin);
    cell.numFmt = PCT; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Cumulative Net Income"; ws.getCell(r, 1).font = BF;
  const cumNIRowPL = r;
  let cumNI = 0;
  for (let y = 0; y < yc; y++) {
    cumNI += ni[y] || 0;
    const cell = ws.getCell(r, y + 2);
    if (y === 0) setFormula(cell, cn(niRow, 2), cumNI);
    else setFormula(cell, `${cn(r, y + 1)}+${cn(niRow, y + 2)}`, cumNI);
    cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Break-even"; ws.getCell(r, 1).font = BF;
  let beYr = -1;
  let cumChk = 0;
  for (let y = 0; y < yc; y++) {
    cumChk += ni[y] || 0;
    if (beYr < 0 && cumChk >= 0) beYr = y;
  }
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (y === beYr) {
      cell.value = "✓ Break-even";
      cell.font = { bold: true, size: 11, name: "Calibri", color: { argb: DASHBOARD_GREEN } };
    } else {
      cell.value = "";
    }
    cell.border = BORDER;
    cell.alignment = { horizontal: "center" };
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return { revRow: revRowPL, totalExpRow, niRow, cumNIRow: cumNIRowPL };
}


function computeRemainingDebtForYear(capDebtRows: CapitalDebtRow[], year: number): number {
  let remaining = 0;
  for (const r of capDebtRows) {
    if (!r.enabled || !r.isLoan) continue;
    const p = r.loanPrincipal || 0;
    const rate = (r.loanRate || 0) / 100;
    const term = r.loanTermYears || 0;
    if (p <= 0 || term <= 0) continue;
    const annualPmt = computeAnnualDebt(p, rate, term);
    let balance = p;
    for (let y = 0; y < year; y++) {
      const interest = balance * rate;
      const principalPaid = annualPmt - interest;
      balance = Math.max(0, balance - principalPaid);
    }
    remaining += balance;
  }
  return remaining;
}

function buildFiveYearBS(
  wb: ExcelJS.Workbook, rev: number[], personnel: number[], ops: number[],
  capDebt: number[], ni: number[], cumNI: number[], cashAtOpen: number,
  totalPrincipal: number, capDebtRows: CapitalDebtRow[], yc: number, cols: number, yearHeaders: string[]
) {
  const ws = wb.addWorksheet("5-Year Balance Sheet");
  ws.columns = [{ width: 35 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "ASSETS";

  r++; ws.getCell(r, 1).value = "Cash & Equivalents"; ws.getCell(r, 1).font = NF;
  const cashVals: number[] = [];
  for (let y = 0; y < yc; y++) {
    const cashVal = cashAtOpen + cumNI[y];
    cashVals.push(cashVal);
    const cell = ws.getCell(r, y + 2);
    cell.value = cashVal; cell.numFmt = CUR; dc(cell);
  }
  const cashRow = r;

  r++; ws.getCell(r, 1).value = "Other Assets"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = 0; cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Total Assets"; ws.getCell(r, 1).font = BF;
  const totalAssetsRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `SUM(${cn(cashRow, y + 2)}:${cn(r - 1, y + 2)})`, cashVals[y]);
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "LIABILITIES";

  r++; ws.getCell(r, 1).value = "Debt Outstanding"; ws.getCell(r, 1).font = NF;
  const debtVals: number[] = [];
  for (let y = 0; y < yc; y++) {
    const dv = Math.round(computeRemainingDebtForYear(capDebtRows, y + 1));
    debtVals.push(dv);
    const cell = ws.getCell(r, y + 2);
    cell.value = dv; cell.numFmt = CUR; dc(cell);
  }
  const debtRow = r;

  r++; ws.getCell(r, 1).value = "Other Liabilities"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = 0; cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Total Liabilities"; ws.getCell(r, 1).font = BF;
  const totalLiabRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `SUM(${cn(debtRow, y + 2)}:${cn(r - 1, y + 2)})`, debtVals[y]);
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "EQUITY / NET ASSETS";

  r++; ws.getCell(r, 1).value = "Beginning Net Position"; ws.getCell(r, 1).font = NF;
  const begEquityRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const begEq = y === 0 ? (cashAtOpen - totalPrincipal) : (cashVals[y - 1] - debtVals[y - 1]);
    cell.value = begEq; cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Change in Net Position"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const begEq = y === 0 ? (cashAtOpen - totalPrincipal) : (cashVals[y - 1] - debtVals[y - 1]);
    const endEq = cashVals[y] - debtVals[y];
    cell.value = endEq - begEq; cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Total Equity / Net Assets"; ws.getCell(r, 1).font = BF;
  const totalEquityRow = r;
  for (let y = 0; y < yc; y++) {
    const totalEquity = cashVals[y] - debtVals[y];
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `${cn(totalAssetsRow, y + 2)}-${cn(totalLiabRow, y + 2)}`, totalEquity);
    cell.numFmt = CUR; bc(cell);
  }
  sec(ws, r, cols);

  r += 2; ws.getCell(r, 1).value = "BALANCE CHECK (Assets − Liab − Equity)"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `${cn(totalAssetsRow, y + 2)}-${cn(totalLiabRow, y + 2)}-${cn(totalEquityRow, y + 2)}`, 0);
    cell.numFmt = CUR; bc(cell);
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildDSCRCovenant(
  wb: ExcelJS.Workbook, rev: number[], personnel: number[], ops: number[],
  capDebt: number[], ni: number[], annualDebtSvc: number, startingCash: number,
  enrollment: number[], maxCapacity: number, yc: number, cols: number, yearHeaders: string[]
) {
  const ws = wb.addWorksheet("DSCR & Covenants");
  ws.columns = [{ width: 38 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "DEBT SERVICE COVERAGE RATIO (DSCR)";

  r++; ws.getCell(r, 1).value = "Net Operating Income (NOI)"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const noi = rev[y] - personnel[y] - ops[y];
    const cell = ws.getCell(r, y + 2); cell.value = Math.round(noi); cell.numFmt = CUR; dc(cell);
  }
  const noiRow = r;

  r++; ws.getCell(r, 1).value = "Annual Debt Service"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2); cell.value = Math.round(annualDebtSvc); cell.numFmt = CUR; dc(cell);
  }
  const dsRow = r;

  r++; ws.getCell(r, 1).value = "DSCR"; ws.getCell(r, 1).font = BF;
  const dscrRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const roundedDS = Math.round(annualDebtSvc);
    if (annualDebtSvc > 0) {
      const noi = Math.round(rev[y] - personnel[y] - ops[y]);
      const dscrVal = roundedDS === 0 ? "N/A" : noi / roundedDS;
      setFormula(cell, `IF(${cn(dsRow, y + 2)}=0,"N/A",${cn(noiRow, y + 2)}/${cn(dsRow, y + 2)})`, dscrVal);
    } else {
      cell.value = "N/A";
    }
    cell.numFmt = "0.00x"; bc(cell);
  }

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "LIQUIDITY METRICS";

  r++; ws.getCell(r, 1).value = "Ending Cash Balance"; ws.getCell(r, 1).font = NF;
  let cumNI = 0;
  const cashBalances: number[] = [];
  for (let y = 0; y < yc; y++) {
    cumNI += ni[y];
    const cashBal = Math.round(startingCash + cumNI);
    cashBalances.push(cashBal);
    const cell = ws.getCell(r, y + 2); cell.value = cashBal; cell.numFmt = CUR; dc(cell);
  }
  const cashBalRow = r;

  r++; ws.getCell(r, 1).value = "Monthly Operating Cost"; ws.getCell(r, 1).font = NF;
  const monthlyOpsCosts: number[] = [];
  for (let y = 0; y < yc; y++) {
    const totalOps = personnel[y] + ops[y];
    const moc = Math.round(totalOps / 12);
    monthlyOpsCosts.push(moc);
    const cell = ws.getCell(r, y + 2); cell.value = moc; cell.numFmt = CUR; dc(cell);
  }
  const monthlyOpsRow = r;

  r++; ws.getCell(r, 1).value = "Cash Reserve (Months)"; ws.getCell(r, 1).font = BF;
  const cashReserveRow = r;
  for (let y = 0; y < yc; y++) {
    const reserveMonths = monthlyOpsCosts[y] === 0 ? 0 : cashBalances[y] / monthlyOpsCosts[y];
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `IF(${cn(monthlyOpsRow, y + 2)}=0,0,${cn(cashBalRow, y + 2)}/${cn(monthlyOpsRow, y + 2)})`, reserveMonths);
    cell.numFmt = "0.0"; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Days Cash on Hand"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const totalOps = personnel[y] + ops[y];
    const dailyOps = totalOps / 365;
    cumNI = 0;
    for (let yy = 0; yy <= y; yy++) cumNI += ni[yy];
    const cash = startingCash + cumNI;
    const cell = ws.getCell(r, y + 2);
    cell.value = dailyOps > 0 ? Math.round(cash / dailyOps) : 0;
    cell.numFmt = NUM; dc(cell);
  }

  r += 2; sec(ws, r, cols); ws.getCell(r, 1).value = "COVENANT CHECKS";

  const dscrCheckRow = r + 1;
  r++; ws.getCell(r, 1).value = "DSCR ≥ 1.20x"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (annualDebtSvc > 0) {
      const noi = rev[y] - personnel[y] - ops[y];
      const dscr = noi / annualDebtSvc;
      const dscrCellRef = cn(dscrRow, y + 2);
      setFormula(cell, `IF(${dscrCellRef}>=1.2,"PASS","FAIL")`, dscr >= 1.2 ? "PASS" : "FAIL");
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dscr >= 1.2 ? GREEN_BG : RED_BG } };
    } else {
      cell.value = "N/A";
    }
    cell.font = BF; cell.alignment = { horizontal: "center" };
  }

  r++; ws.getCell(r, 1).value = "Cash Reserve ≥ 2.0 Months"; ws.getCell(r, 1).font = NF;
  cumNI = 0;
  for (let y = 0; y < yc; y++) {
    cumNI += ni[y];
    const cash = startingCash + cumNI;
    const monthlyOps = (personnel[y] + ops[y]) / 12;
    const reserve = monthlyOps > 0 ? cash / monthlyOps : 0;
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `IF(${cn(cashReserveRow, y + 2)}>=2,"PASS","FAIL")`, reserve >= 2.0 ? "PASS" : "FAIL");
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: reserve >= 2.0 ? GREEN_BG : RED_BG } };
    cell.font = BF; cell.alignment = { horizontal: "center" };
  }

  r++; ws.getCell(r, 1).value = "Positive Net Income"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = ni[y] >= 0 ? "PASS" : "FAIL";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ni[y] >= 0 ? GREEN_BG : RED_BG } };
    cell.font = BF; cell.alignment = { horizontal: "center" };
  }

  r++; ws.getCell(r, 1).value = "Enrollment ≥ 70% Capacity"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const util = maxCapacity > 0 ? enrollment[y] / maxCapacity : 0;
    const cell = ws.getCell(r, y + 2);
    cell.value = util >= 0.7 ? "PASS" : "FAIL";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: util >= 0.7 ? GREEN_BG : RED_BG } };
    cell.font = BF; cell.alignment = { horizontal: "center" };
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

function buildUnderwritingSnapshot(
  wb: ExcelJS.Workbook, sp: SchoolProfile, rev: number[], personnel: number[],
  ops: number[], capDebt: number[], ni: number[], cumNI: number[],
  annualDebtSvc: number, startingCash: number, enrollment: number[],
  maxCapacity: number, totalPrincipalFromLoans: number, yc: number
) {
  const ws = wb.addWorksheet("Underwriting Snapshot");
  ws.columns = [{ width: 42 }, { width: 25 }, { width: 16 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack - Underwriting Snapshot";
  ws.getCell(r, 1).font = { bold: true, size: 16, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 3); ws.getRow(r).height = 36;

  r++; ws.getCell(r, 1).value = `${sp.schoolName || "School"} | ${schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)} | ${sp.state || ""}`;
  ws.getCell(r, 1).font = { size: 12, color: { argb: "FF64748B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 3);

  r += 2; sec(ws, r, 3); ws.getCell(r, 1).value = "POLICY FLAGS";

  const flags: [string, boolean, string][] = [];

  const y1NOI = rev[0] - personnel[0] - ops[0];
  const y1DSCR = annualDebtSvc > 0 ? y1NOI / annualDebtSvc : 0;
  const flagYr1 = schoolYearLabel(sp.openingYear, 0);
  if (annualDebtSvc > 0) {
    flags.push([`DSCR ≥ 1.20x (${flagYr1})`, y1DSCR >= 1.2, `${y1DSCR.toFixed(2)}x`]);
  }

  const y1Cash = startingCash + ni[0];
  const y1MonthlyOps = (personnel[0] + ops[0]) / 12;
  const y1Reserve = y1MonthlyOps > 0 ? y1Cash / y1MonthlyOps : 0;
  flags.push([`Min 2 Months Cash Reserve (${flagYr1})`, y1Reserve >= 2.0, `${y1Reserve.toFixed(1)} months`]);

  flags.push([`Positive Net Income (${flagYr1})`, ni[0] >= 0, ni[0] >= 0 ? "Yes" : "No"]);

  let breakEvenYear = -1;
  for (let y = 0; y < yc; y++) {
    if (ni[y] >= 0) { breakEvenYear = y + 1; break; }
  }
  flags.push(["Break-Even Within Projection Period", breakEvenYear > 0, breakEvenYear > 0 ? schoolYearLabel(sp.openingYear, breakEvenYear - 1) : "Not Reached"]);

  const y1Util = maxCapacity > 0 ? enrollment[0] / maxCapacity : 0;
  flags.push([`Enrollment ≥ 70% Capacity (${flagYr1})`, y1Util >= 0.7, `${(y1Util * 100).toFixed(0)}%`]);

  const endingCash = startingCash + cumNI[yc - 1];
  flags.push(["Positive Ending Cash (Final Year)", endingCash > 0, endingCash > 0 ? "Yes" : "No"]);

  for (const [label, pass, detail] of flags) {
    r++;
    ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = pass ? "PASS" : "FAIL";
    ws.getCell(r, 2).font = BF;
    ws.getCell(r, 2).alignment = { horizontal: "center" };
    ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: pass ? GREEN_BG : RED_BG } };
    ws.getCell(r, 3).value = detail; ws.getCell(r, 3).font = NF;
  }

  const passCount = flags.filter(f => f[1]).length;
  r += 2; sec(ws, r, 3); ws.getCell(r, 1).value = "UNDERWRITING ASSESSMENT";
  r++; ws.getCell(r, 1).value = "Flags Passed"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = `${passCount} / ${flags.length}`; ws.getCell(r, 2).font = BF;

  const assessment = passCount === flags.length ? "Strong" : passCount >= flags.length - 1 ? "Conditional" : passCount >= flags.length / 2 ? "Weak" : "Not Ready";
  r++; ws.getCell(r, 1).value = "Overall Assessment"; ws.getCell(r, 1).font = NF;
  ws.getCell(r, 2).value = assessment; ws.getCell(r, 2).font = BF;
  const assessFill = assessment === "Strong" ? GREEN_BG : assessment === "Conditional" ? AMBER_BG : RED_BG;
  ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: assessFill } };

  r += 2; sec(ws, r, 3); ws.getCell(r, 1).value = "KEY METRICS SUMMARY";

  const yr1Lbl = schoolYearLabel(sp.openingYear, 0);
  const metrics: [string, string | number, string][] = [
    [`${yr1Lbl} Revenue`, rev[0], CUR],
    [`${yr1Lbl} Total Expenses`, personnel[0] + ops[0] + capDebt[0], CUR],
    [`${yr1Lbl} Net Income`, ni[0], CUR],
    [`${yr1Lbl} Net Margin`, rev[0] > 0 ? ni[0] / rev[0] : 0, PCT],
    ["Starting Cash", startingCash, CUR],
    [`${yr1Lbl} Ending Cash`, startingCash + ni[0], CUR],
    ["Total Debt", totalPrincipalFromLoans, CUR],
    [`${yr1Lbl} DSCR`, annualDebtSvc > 0 ? `${y1DSCR.toFixed(2)}x` : "N/A", ""],
    [`${yr1Lbl} Cash Reserve (Months)`, `${y1Reserve.toFixed(1)}`, ""],
    ["Break-Even Year", breakEvenYear > 0 ? schoolYearLabel(sp.openingYear, breakEvenYear - 1) : "Not Reached", ""],
    [`Revenue per Student (${yr1Lbl})`, enrollment[0] > 0 ? Math.round(rev[0] / enrollment[0]) : 0, CUR],
    [`Cost per Student (${yr1Lbl})`, enrollment[0] > 0 ? Math.round((personnel[0] + ops[0] + capDebt[0]) / enrollment[0]) : 0, CUR],
  ];

  for (const [label, val, fmt] of metrics) {
    r++; ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = NF;
    ws.getCell(r, 2).value = val;
    ws.getCell(r, 2).font = BF;
    if (fmt) ws.getCell(r, 2).numFmt = fmt;
  }
}


function buildSummary(
  wb: ExcelJS.Workbook, sp: SchoolProfile, rev: number[], personnel: number[],
  ops: number[], capDebt: number[], ni: number[], cumNI: number[],
  annualDebtSvc: number, startingCash: number, enrollment: number[],
  yc: number, cols: number, yearHeaders: string[],
  plRows?: { revRow: number; totalExpRow: number; niRow: number }
) {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [{ width: 35 }, ...Array(yc).fill({ width: 18 })];

  let r = 1;
  ws.getCell(r, 1).value = sp.schoolName || "School";
  ws.getCell(r, 1).font = { bold: true, size: 16, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, cols); ws.getRow(r).height = 28;

  r++;
  ws.getCell(r, 1).value = "5-Year Financial Model";
  ws.getCell(r, 1).font = { bold: true, size: 13, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 1, r, cols); ws.getRow(r).height = 22;

  r++;
  const details: string[] = [];
  if (sp.schoolType) details.push(schoolTypeLabel(sp.schoolType, sp.schoolTypeOther));
  if (sp.state) details.push(sp.state);
  if (sp.plannedOpeningYear) details.push(`Opening ${sp.plannedOpeningYear}`);
  else if (sp.openingYear) details.push(`Est. ${sp.openingYear}`);
  ws.getCell(r, 1).value = details.join("  |  ");
  ws.getCell(r, 1).font = { size: 11, color: { argb: "FF6B7280" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, cols); ws.getRow(r).height = 18;

  r++;
  ws.getCell(r, 1).value = `Prepared ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
  ws.getCell(r, 1).font = { italic: true, size: 11, color: { argb: "FF9CA3AF" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, cols); ws.getRow(r).height = 16;

  r += 2;
  ws.getRow(r).values = yearHeaders;
  hdr(ws, r, cols);

  r++; ws.getCell(r, 1).value = "Students"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, asmEnroll(y), enrollment[y] || 0);
    cell.numFmt = NUM; dc(cell);
  }

  const plRef = (plRow: number, y: number) => `'5-Year P&L'!${cn(plRow, y + 2)}`;

  r++; ws.getCell(r, 1).value = "Total Revenue"; ws.getCell(r, 1).font = BF;
  const sumRevRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (plRows) setFormula(cell, plRef(plRows.revRow, y), rev[y] || 0);
    else cell.value = rev[y] || 0;
    cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Total Expenses"; ws.getCell(r, 1).font = NF;
  const sumExpRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (plRows) setFormula(cell, plRef(plRows.totalExpRow, y), personnel[y] + ops[y] + capDebt[y]);
    else cell.value = personnel[y] + ops[y] + capDebt[y];
    cell.numFmt = CUR; dc(cell);
  }

  r++; sec(ws, r, cols);
  ws.getCell(r, 1).value = sp.entityType === "nonprofit_501c3" ? "Net Income" : "Profit / (Loss)";
  const sumNIRow = r;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (plRows) setFormula(cell, plRef(plRows.niRow, y), ni[y] || 0);
    else setFormula(cell, `${cn(sumRevRow, y + 2)}-${cn(sumExpRow, y + 2)}`, ni[y] || 0);
    cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Net Margin %"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `IF(${cn(sumRevRow, y + 2)}=0,0,${cn(sumNIRow, y + 2)}/${cn(sumRevRow, y + 2)})`,
      rev[y] > 0 ? ni[y] / rev[y] : 0);
    cell.numFmt = PCT; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Cumulative Net Income"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (y === 0) setFormula(cell, cn(sumNIRow, 2), cumNI[y]);
    else setFormula(cell, `${cn(r, y + 1)}+${cn(sumNIRow, y + 2)}`, cumNI[y]);
    cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Cash Balance"; ws.getCell(r, 1).font = BF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = startingCash + cumNI[y]; cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Revenue per Student"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = enrollment[y] > 0 ? Math.round(rev[y] / enrollment[y]) : 0; cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Cost per Student"; ws.getCell(r, 1).font = NF;
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const totalCost = personnel[y] + ops[y] + capDebt[y];
    cell.value = enrollment[y] > 0 ? Math.round(totalCost / enrollment[y]) : 0; cell.numFmt = CUR; dc(cell);
  }

  if (annualDebtSvc > 0) {
    r++; ws.getCell(r, 1).value = "DSCR"; ws.getCell(r, 1).font = BF;
    for (let y = 0; y < yc; y++) {
      const noi = rev[y] - personnel[y] - ops[y];
      const cell = ws.getCell(r, y + 2);
      cell.value = annualDebtSvc > 0 ? Math.round(noi / annualDebtSvc * 100) / 100 : 0;
      cell.numFmt = "0.00x"; bc(cell);
    }
  }

  r += 2;
  ws.getCell(r, 1).value = "Generated by SchoolStack Budget  •  budget.schoolstack.ai";
  ws.getCell(r, 1).font = { italic: true, size: 11, color: { argb: "FF9CA3AF" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, cols);

  ws.views = [{ state: "frozen", ySplit: 7, xSplit: 1 }];
}
