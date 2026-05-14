// Single-year budget exporter (used by /export/single-year via models.ts and
// public.ts). The legacy 14-tab underwriting workbook (`generateUnderwritingWorkbook`)
// that previously lived in this file has been removed (task #226) — the only
// active 5-year workbook is now the v2 export in `underwriting-workbook.ts`.
import ExcelJS from "exceljs";
import { addDecisionHistorySheet } from "./packets/build-decision-history.js";
import { computeEffectiveFte, computeTotalFTE, resolveEsc as resolveEscShared } from "./workbook-helpers.js";
import {
  computeAnnualDebt,
  applyFundingMixCorrection,
  type RevenueRowAmountsRowLike,
} from "@workspace/finance";

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

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: WHITE }, size: 11, name: "Calibri" };
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11, color: { argb: NAVY }, name: "Calibri" };
const NF: Partial<ExcelJS.Font> = { size: 11, name: "Calibri" };
const BF: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true };
const CUR = '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"??_);_(@_)';
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

const SUBTOTAL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF1E293B" } },
  bottom: { style: "double", color: { argb: "FF1E293B" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

function gc(cell: ExcelJS.Cell) { cell.font = BF; cell.border = SUBTOTAL_BORDER; }

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

function resolveEsc(rowEsc: number | undefined, fallback: number): number {
  return resolveEscShared(rowEsc, fallback);
}

function driverVal(amounts: number[] | undefined, y: number, dt: string, students: number, escalationRate?: number, fallbackInflation?: number, newStudents?: number, returningStudents?: number, _escalationRateOverridden?: boolean, fte?: number): number {
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
    case "per_fte": return base * (fte ?? 0);
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

function resolveAmount(amounts: number[] | undefined, y: number, rowEsc: number | undefined, costInflPct: number): number {
  const esc = resolveEsc(rowEsc, costInflPct);
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
  // Task #860 — "Tuition is just price." Apply the funding-mix
  // correction so the single-year underwriting export does not
  // double-count tuition + per-student ESA / voucher / tax-credit rows.
  applyFundingMixCorrection(vals, rows as unknown as RevenueRowAmountsRowLike[], y, students);
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
  rows: ExpenseRow[], y: number, students: number, totalRevenue: number, costInflationPct?: number, newStudents?: number, returningStudents?: number, totalFTE?: number,
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
      total += driverVal(r.amounts, y, r.driverType, students, r.escalationRate, fallback, newStudents, returningStudents, undefined, totalFTE);
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
  const isPartial = sp.isPartialFirstYear || false;
  const opMonthsBase = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = opMonthsBase / 12;
  const opMonths = yi === 0 ? opMonthsBase : 12;

  const students = enrollment[yi];
  const pf = yi === 0 ? prorationFactor : 1;
  const annualRevRaw = computeRevenueForYear(revenueRows, yi, students, data.tuitionTiers, sp);
  const annualRev = Math.round(annualRevRaw * pf);
  const annualPersonnel = Math.round(computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, yi, students));
  const sybFTE = computeTotalFTE(staffingRows, yi, students);
  const annualOps = Math.round(computeExpenseForYear(expenseRows, yi, students, annualRevRaw, costInflPct, localNewStudents(enrollment, sybRR, yi), localReturningStudents(enrollment, sybRR, yi), sybFTE) * pf);
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
  const revTotalRow = buildSYRevenue(wb, revenueRows, monthlyRev, opMonths, students, cols, headers, data.tuitionTiers, yi, costInflPct);
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

  // Mirror the lender / standard / formula exports so reviewers downloading the
  // single-year budget see the same outcome track record. The decision history
  // is model-wide (not year-scoped) — the value to reviewers is consistency
  // across formats, and the empty state renders cleanly when no decisions have
  // been logged.
  addDecisionHistorySheet(wb, rawData as Parameters<typeof addDecisionHistorySheet>[1]);

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
  tiers?: TuitionTier[], yi?: number, costInflPct: number = 0
): number {
  const ws = wb.addWorksheet("Revenue");
  ws.columns = [{ width: 30 }, ...Array(12).fill({ width: 14 }), { width: 16 }];

  let r = 1;
  ws.getRow(r).values = headers;
  hdr(ws, r, cols);

  for (const ro of rows) {
    r++; ws.getCell(r, 1).value = ro.lineItem || "Unnamed"; ws.getCell(r, 1).font = NF;
    const yearAmt = computeRevForRow(ro, yi ?? 0, students, tiers, costInflPct);
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

function computeRevForRow(ro: RevenueRow, yi: number, students: number, tiers?: TuitionTier[], costInflPct: number = 0): number {
  const amt = resolveAmount(ro.amounts, yi, ro.escalationRate, costInflPct);
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
