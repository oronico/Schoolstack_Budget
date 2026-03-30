import ExcelJS from "exceljs";
import {
  addInstructionsSheet, addDashboardSheet, type DashboardInput, DASHBOARD_GREEN,
  computeRevenueForYear as sharedComputeRevenue,
  computePersonnelForYear as sharedComputePersonnel,
  computeEffectiveFte as sharedComputeEffectiveFte,
  computeStaffingLoaded,
  computeExpenseForYear as sharedComputeExpense,
  computeDebtServiceForYear as sharedComputeDebtService,
  computeFacilityCostByYear,
  computeInstructionalCostByYear,
  computeNewStudents,
  computeReturningStudents,
  type RevenueRow as SharedRevenueRow, type StaffingRow as SharedStaffingRow,
  type ExpenseRow as SharedExpenseRow, type CapitalDebtRow as SharedCapDebtRow,
  type TuitionTier as SharedTuitionTier, type SchoolProfile as SharedSchoolProfile,
} from "./workbook-helpers.js";
import {
  computeSchoolProfileFacilityOverlay,
  hasSchoolProfileFacilityData,
} from "./consultant-engine.js";

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
  locationSecured?: boolean;
  facilityStreet?: string;
  facilityCity?: string;
  facilityState?: string;
  facilityZip?: string;
  ownershipType?: string;
  propertyTaxAnnual?: number;
  hasMortgage?: boolean;
  mortgageMonthlyPayment?: number;
  leaseExpirationMonth?: number;
  leaseExpirationYear?: number;
  monthlyRent?: number;
  annualRentEscalation?: number;
  postLeaseRenewalBump?: number;
  isNNNLease?: boolean;
  nnnCamCharges?: number;
  nnnMaintenance?: number;
  nnnUtilities?: number;
  estimatedMonthlyFacilityBudget?: number;
  facilityArrangementEndDate?: string;
  comparableMarketRent?: number;
  hasWrittenAgreement?: boolean;
  monthlyFacilityAllocation?: number;
  hasBookkeeper?: boolean;
  bookkeeperMonthlyCost?: number;
  hasLawyer?: boolean;
  lawyerMonthlyCost?: number;
  hasGeneralLiabilityInsurance?: boolean;
  insuranceCost?: number;
  fundingProfile?: string;
  gradeBandEnrollment?: { k5: number[]; m68: number[]; h912: number[] };
  gradeBandPerPupil?: { k5: number; m68: number; h912: number };
  enrollmentRevenueMethod?: string;
  charterDepositTiming?: string;
  priorYearADM?: number;
  priorYearADA?: number;
  facilityPhases?: Array<{
    id: string;
    ownershipType: string;
    startYear: number;
    endYear: number;
    monthlyRent?: number;
    annualRentEscalation?: number;
    postLeaseRenewalBump?: number;
    leaseExpirationMonth?: number;
    leaseExpirationYear?: number;
    isNNNLease?: boolean;
    nnnCamCharges?: number;
    nnnMaintenance?: number;
    nnnUtilities?: number;
    propertyTaxAnnual?: number;
    hasMortgage?: boolean;
    mortgageMonthlyPayment?: number;
    facilityArrangementEndDate?: string;
    comparableMarketRent?: number;
    hasWrittenAgreement?: boolean;
    monthlyFacilityAllocation?: number;
  }>;
}

function schoolYearLabel(baseYear: number | undefined, offset: number): string {
  if (!baseYear) return `Year ${offset + 1}`;
  const y = baseYear + offset;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

function yearLabels(sp: SchoolProfile): string[] {
  const base = sp.openingYear;
  return [0, 1, 2, 3, 4].map(i => schoolYearLabel(base, i));
}

interface Enrollment { year1?: number; year2?: number; year3?: number; year4?: number; year5?: number; retentionRate?: number; }

interface RevenueRow {
  id: string; category: string; lineItem: string; enabled: boolean;
  driverType: string; amounts: number[]; percentBase?: string;
  escalationRate?: number; note?: string; billingMonths?: number;
  collectionMethod?: string; collectionRate?: number; collectionDelayDays?: number;
  paymentFrequency?: string; paymentTiming?: string; disbursementType?: string;
  reimbursementLagMonths?: number; grantStatus?: string; receiptQuarter?: number;
}

interface StaffingRow {
  id: string; roleName: string; functionCategory: string; employmentType: string;
  fte: number; annualizedRate: number; benefitsEligible: boolean;
  benefitsRate: number; payrollTaxRate: number; payrollLike: boolean; notes: string;
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
    staffingMode: String(raw.staffingMode ?? "fixed") as "fixed" | "ratio",
    studentRatio: raw.studentRatio != null ? Number(raw.studentRatio) : undefined,
    minFte: raw.minFte != null ? Number(raw.minFte) : undefined,
    maxFte: raw.maxFte != null ? Number(raw.maxFte) : undefined,
    startYear: raw.startYear != null ? Number(raw.startYear) : undefined,
    endYear: raw.endYear != null ? Number(raw.endYear) : undefined,
    payrollTaxRate: Number(raw.payrollTaxRate) || 0,
    payrollLike: Boolean(raw.payrollLike ?? false),
    notes: String(raw.notes ?? ""),
  };
}

interface ExpenseRow {
  id: string; category: string; lineItem: string; enabled: boolean;
  driverType: string; amounts: number[]; escalationRate?: number; note?: string;
}

interface CapitalDebtRow {
  id: string; lineItem: string; enabled: boolean; driverType: string;
  amounts: number[]; note?: string; isLoan?: boolean;
  loanPrincipal?: number; loanRate?: number; loanTermYears?: number;
}

interface TuitionTier {
  id: string; tierType: string; label: string;
  discountPercent: number; studentCounts: number[];
}

interface Program {
  id: string; name: string; annualTuition: number;
  priorYear?: number; currentYear?: number;
  year1: number; year2: number; year3: number; year4: number; year5: number;
}

interface PriorYearSnapshot {
  endingEnrollment?: number; totalRevenue?: number;
  totalExpenses?: number; endingCash?: number;
}

interface CurrentYearProjection {
  currentEnrollment?: number; projectedRevenue?: number;
  projectedExpenses?: number; currentCash?: number; monthsCompleted?: number;
}

interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  tuitionTiers?: TuitionTier[];
  programs?: Program[];
  tuitionEscalation?: { rate?: number };
  revenue?: Record<string, unknown>;
  revenueRows?: RevenueRow[];
  staffing?: Record<string, unknown>;
  staffingRows?: StaffingRow[];
  facilities?: Record<string, unknown>;
  expenseRows?: ExpenseRow[];
  customCategoryLabels?: Record<string, string>;
  capitalAndDebtRows?: CapitalDebtRow[];
  priorYearSnapshot?: PriorYearSnapshot;
  currentYearProjection?: CurrentYearProjection;
}

const NAVY = "FF1E293B";
const WHITE = "FFFFFFFF";
const LIGHT_GRAY = "FFE8EDF2";
const GREEN_BG = "FFE8F5E9";
const RED_BG = "FFFCE4EC";
const AMBER_BG = "FFFFF8E1";
const BLUE_INPUT_BG = "FFDBEAFE";
const BLUE_INPUT_FONT = "FF1E3A5F";

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
const SUBTOTAL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF1E293B" } },
  bottom: { style: "double", color: { argb: "FF1E293B" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

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
function gc(cell: ExcelJS.Cell) { cell.font = BF; cell.border = SUBTOTAL_BORDER; }

function cn(row: number, col: number): string {
  let s = "";
  let c = col;
  while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
  return `${s}${row}`;
}

function colLetter(col: number): string {
  let s = "";
  let c = col;
  while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
  return s;
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

function inputCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_INPUT_BG } };
  cell.font = { ...cell.font, color: { argb: BLUE_INPUT_FONT } };
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

function catLabel(cat: string): string {
  const map: Record<string, string> = {
    tuition_and_fees: "Tuition & Fees", tuition_offsets: "Tuition Offsets",
    public_funding: "Public Funding", school_choice: "School Choice",
    grants_contributions: "Philanthropy", philanthropy: "Philanthropy", other_revenue: "Other Revenue",
  };
  return map[cat] || cat;
}

function expCatLabel(cat: string, customLabels?: Record<string, string>): string {
  const map: Record<string, string> = {
    instructional_program: "Instructional / Program", technology: "Technology",
    occupancy_facility: "Occupancy / Facility", administrative_general: "Administrative / General",
    capital_financing: "Capital / Financing", personnel: "Personnel",
  };
  return customLabels?.[cat] || map[cat] || cat;
}

function driverLabel(dt: string): string {
  const map: Record<string, string> = {
    annual_fixed: "Annual Fixed", monthly: "Monthly", per_student: "Per Student",
    percent_of_base: "% of Base", percent_of_revenue: "% of Revenue",
  };
  return map[dt] || dt;
}

function computeAnnualDebt(principal: number, rate: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (rate <= 0) return principal / termYears;
  const mr = rate / 12;
  const m = termYears * 12;
  return (principal * (mr * Math.pow(1 + mr, m)) / (Math.pow(1 + mr, m) - 1)) * 12;
}

function resolveEsc(rowEsc?: number, fallback?: number): number {
  if (rowEsc !== undefined && rowEsc !== 0) return rowEsc;
  return fallback ?? 0;
}

function driverVal(amounts: number[] | undefined, y: number, dt: string, students: number, escalationRate?: number, fallbackInflation?: number, newStudents?: number, returningStudents?: number): number {
  let base = amounts?.[y] ?? 0;
  const esc = resolveEsc(escalationRate, fallbackInflation);
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

function computeGradeBandRevenueFE(sp: SchoolProfile, y: number): number {
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

function hasGradeBandFE(sp?: SchoolProfile): boolean {
  if (!sp?.gradeBandEnrollment || !sp?.gradeBandPerPupil) return false;
  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  const hasEnrollment = [gbe.k5, gbe.m68, gbe.h912].some(
    (arr) => arr && arr.some((v) => (v ?? 0) > 0),
  );
  return hasEnrollment && ((gbp.k5 || 0) + (gbp.m68 || 0) + (gbp.h912 || 0) > 0);
}

function computeRevenueForYear(
  rows: RevenueRow[], y: number, students: number, tiers?: TuitionTier[], costInflPct?: number, sp?: SchoolProfile
): number {
  const vals = new Map<string, number>();
  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    if (r.id === "state_local_perpupil" && sp && hasGradeBandFE(sp)) {
      vals.set(r.id, computeGradeBandRevenueFE(sp, y));
    } else if (r.id === "gross_tuition" && r.driverType === "per_student" && tiers && tiers.length > 0) {
      let perStudentAmount = r.amounts?.[y] ?? 0;
      if (r.escalationRate !== undefined && r.escalationRate !== 0 && y > 0) {
        perStudentAmount = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
      }
      vals.set(r.id, tuitionWithTiers(perStudentAmount, y, students, tiers));
    } else {
      vals.set(r.id, driverVal(r.amounts, y, r.driverType, students, r.escalationRate, costInflPct));
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

function computePersonnelForYear(
  rows: StaffingRow[], salaryEsc: number, prorationFactor: number, y: number,
  enrollment?: number
): number {
  let total = 0;
  for (const r of rows) {
    const effectiveFte = enrollment !== undefined
      ? sharedComputeEffectiveFte(r, y, enrollment)
      : r.fte;
    const annual = effectiveFte * r.annualizedRate;
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

function computeExpenseForYear(
  rows: ExpenseRow[], y: number, students: number, totalRevenue: number, costInflationPct?: number, newStudents?: number, returningStudents?: number
): number {
  let total = 0;
  const fallback = costInflationPct ?? 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.driverType === "percent_of_revenue") {
      const esc = resolveEsc(r.escalationRate, fallback);
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
        for (let i = startMonth; i < startMonth + bm && i < 12; i++) monthly[i] += perMonth;
      } else {
        monthly[0] += annualAmount;
      }
    } else {
      const perMonth = annualAmount / opMonths;
      for (let m = 0; m < opMonths; m++) monthly[m] += perMonth;
    }
  }
  return monthly;
}

interface AsmRegistry {
  profileStartRow: number;
  enrollStartRow: number;
  enrollY1Col: number;
  revStartRow: number;
  revCount: number;
  tierStartRow: number;
  tierCount: number;
  staffStartRow: number;
  staffCount: number;
  facilStartRow: number;
  expStartRow: number;
  expCount: number;
  capDebtStartRow: number;
  capDebtCount: number;
  growthStartRow: number;
  salaryEscRow: number;
  costInflRow: number;
  prorationRow: number;
  startingCashRow: number;
  mgmtFeeRow: number;
  maxCapRow: number;
  histStartRow: number;
}

function buildAssumptions(
  wb: ExcelJS.Workbook, data: ModelData, enrollment: number[],
  salaryEsc: number, costInflation: number, prorationFactor: number,
  startingCash: number
): AsmRegistry {
  const ws = wb.addWorksheet("Assumptions");
  const sp = data.schoolProfile || {};
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = (data.expenseRows || []).filter(r => r.enabled);
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const programs = data.programs || [];

  ws.columns = [
    { width: 38 }, { width: 18 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 16 }, { width: 18 },
  ];

  let r = 1;
  ws.mergeCells(r, 1, r, 7);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} - Financial Model Assumptions`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };
  ws.getCell(r, 1).alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(r).height = 32;

  r++;
  ws.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_INPUT_BG } };
  ws.getCell(r, 1).value = "";
  ws.getCell(r, 2).value = "Editable assumption \u2014 change this value";
  ws.getCell(r, 2).font = { size: 11, italic: true, name: "Calibri", color: { argb: "FF666666" } };
  ws.getCell(r, 4).value = "";
  ws.getCell(r, 4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(r, 4).border = { bottom: { style: "thin", color: { argb: "FFD0D0D0" } } };
  ws.getCell(r, 5).value = "Calculated \u2014 driven by formula";
  ws.getCell(r, 5).font = { size: 11, italic: true, name: "Calibri", color: { argb: "FF666666" } };

  r += 2;
  const profileStartRow = r;
  sec(ws, r, 7); ws.getCell(r, 1).value = "SCHOOL PROFILE";

  r++; ws.getCell(r, 1).value = "School Name"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = sp.schoolName || ""; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  ws.mergeCells(r, 2, r, 4);

  r++; ws.getCell(r, 1).value = "State"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = sp.state || ""; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++; ws.getCell(r, 1).value = "School Type"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = schoolTypeLabel(sp.schoolType, sp.schoolTypeOther); dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++; ws.getCell(r, 1).value = "Legal Entity"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = entityLabel(sp.entityType); dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++; ws.getCell(r, 1).value = "EIN"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = sp.ein || "N/A"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++; ws.getCell(r, 1).value = "Website"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = sp.website || "N/A"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  ws.mergeCells(r, 2, r, 4);

  r++; ws.getCell(r, 1).value = "Fiscal Year Start"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = MONTH_NAMES[sp.fiscalYearStartMonth || 7]; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  const maxCapRow = r + 1;
  r++; ws.getCell(r, 1).value = "Maximum Capacity"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = sp.maxCapacity || 100; ws.getCell(r, 2).numFmt = NUM; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++; ws.getCell(r, 1).value = "School Stage"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = sp.schoolStage === "operating_school" ? "Operating School" : "New School"; dc(ws.getCell(r, 2));

  if (sp.locationSecured) {
    r++; ws.getCell(r, 1).value = "Location"; dc(ws.getCell(r, 1));
    const addr = [sp.facilityStreet, sp.facilityCity, sp.facilityState, sp.facilityZip].filter(Boolean).join(", ");
    ws.getCell(r, 2).value = addr || "Secured"; dc(ws.getCell(r, 2));
  }

  r += 2;
  const enrollStartRow = r;
  const yLabels = yearLabels(sp);
  sec(ws, r, 7); ws.getCell(r, 1).value = "ENROLLMENT";
  for (let c = 2; c <= 6; c++) { ws.getCell(r, c).value = yLabels[c - 2]; ws.getCell(r, c).font = SECTION_FONT; ws.getCell(r, c).alignment = { horizontal: "center" }; }

  const enrollY1Col = 2;
  r++; ws.getCell(r, 1).value = "Students Enrolled"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = enrollment[y]; cell.numFmt = NUM; dc(cell); inputCell(cell);
    cell.alignment = { horizontal: "center" };
  }

  if (programs.length > 0) {
    r++; ws.getCell(r, 1).value = ""; 
    r++; ws.getCell(r, 1).value = "Enrollment by Program"; ws.getCell(r, 1).font = BF;
    for (const p of programs) {
      r++; ws.getCell(r, 1).value = `  ${p.name}`; dc(ws.getCell(r, 1));
      const counts = [p.year1, p.year2, p.year3, p.year4, p.year5];
      for (let y = 0; y < 5; y++) {
        const cell = ws.getCell(r, y + 2);
        cell.value = counts[y] || 0; cell.numFmt = NUM; dc(cell);
        cell.alignment = { horizontal: "center" };
      }
      ws.getCell(r, 7).value = `$${(p.annualTuition || 0).toLocaleString()} tuition`;
      ws.getCell(r, 7).font = { size: 11, italic: true, name: "Calibri", color: { argb: "FF888888" } };
    }
  }

  r += 2;
  const revStartRow = r;
  sec(ws, r, 10);
  ws.getCell(r, 1).value = "REVENUE SOURCES";
  ws.getCell(r, 2).value = "Category";
  ws.getCell(r, 3).value = "Driver";
  ws.getCell(r, 4).value = "Yr 1 Amount";
  ws.getCell(r, 5).value = "Escalation %";
  ws.getCell(r, 6).value = "Billing Mo.";
  ws.getCell(r, 7).value = "Collection %";
  ws.getCell(r, 8).value = "Note";
  for (let c = 2; c <= 8; c++) { ws.getCell(r, c).font = SECTION_FONT; }

  let revCount = 0;
  for (const rv of revenueRows) {
    r++; revCount++;
    ws.getCell(r, 1).value = rv.lineItem || "Unnamed"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = catLabel(rv.category); dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = driverLabel(rv.driverType); dc(ws.getCell(r, 3));
    ws.getCell(r, 4).value = rv.amounts?.[0] ?? 0; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = (rv.escalationRate ?? 0) / 100; ws.getCell(r, 5).numFmt = PCT; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
    ws.getCell(r, 6).value = rv.billingMonths ?? 12; ws.getCell(r, 6).numFmt = NUM; dc(ws.getCell(r, 6)); inputCell(ws.getCell(r, 6));
    ws.getCell(r, 7).value = (rv.collectionRate ?? 100) / 100; ws.getCell(r, 7).numFmt = PCT; dc(ws.getCell(r, 7)); inputCell(ws.getCell(r, 7));
    ws.getCell(r, 8).value = rv.note || ""; dc(ws.getCell(r, 8));
  }

  r += 2;
  const tierStartRow = r;
  let tierCount = 0;
  if (tiers.length > 0) {
    sec(ws, r, 7);
    ws.getCell(r, 1).value = "TUITION DISCOUNT TIERS";
    ws.getCell(r, 2).value = "Discount %";
    ws.getCell(r, 3).value = "Yr 1"; ws.getCell(r, 4).value = "Yr 2";
    ws.getCell(r, 5).value = "Yr 3"; ws.getCell(r, 6).value = "Yr 4";
    ws.getCell(r, 7).value = "Yr 5";
    for (let c = 2; c <= 7; c++) { ws.getCell(r, c).font = SECTION_FONT; ws.getCell(r, c).alignment = { horizontal: "center" }; }

    for (const t of tiers) {
      r++; tierCount++;
      ws.getCell(r, 1).value = t.label || t.tierType; dc(ws.getCell(r, 1));
      ws.getCell(r, 2).value = (t.discountPercent || 0) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
      ws.getCell(r, 2).alignment = { horizontal: "center" };
      for (let y = 0; y < 5; y++) {
        const cell = ws.getCell(r, y + 3);
        cell.value = t.studentCounts?.[y] ?? 0; cell.numFmt = NUM; dc(cell); inputCell(cell);
        cell.alignment = { horizontal: "center" };
      }
    }
    r++;
  }

  r++;
  const staffStartRow = r;
  sec(ws, r, 9);
  ws.getCell(r, 1).value = "STAFFING ROSTER";
  ws.getCell(r, 2).value = "Function";
  ws.getCell(r, 3).value = "Type";
  ws.getCell(r, 4).value = "FTE";
  ws.getCell(r, 5).value = "Annual Rate";
  ws.getCell(r, 6).value = "Benefits %";
  ws.getCell(r, 7).value = "Payroll Tax %";
  ws.getCell(r, 8).value = "Benefits Elig.";
  ws.getCell(r, 9).value = "Notes";
  for (let c = 2; c <= 9; c++) { ws.getCell(r, c).font = SECTION_FONT; }

  let staffCount = 0;
  for (const sr of staffingRows) {
    r++; staffCount++;
    const ratioTag = sr.staffingMode === "ratio" && sr.studentRatio ? ` [1:${sr.studentRatio}]` : "";
    ws.getCell(r, 1).value = (sr.roleName || "Unnamed") + ratioTag; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = funcLabel(sr.functionCategory); dc(ws.getCell(r, 2));
    const empMap: Record<string, string> = { full_time: "FT", part_time: "PT", contract: "Contract" };
    ws.getCell(r, 3).value = empMap[sr.employmentType] || sr.employmentType; dc(ws.getCell(r, 3));
    ws.getCell(r, 4).value = sr.fte; ws.getCell(r, 4).numFmt = "0.00"; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = sr.annualizedRate; ws.getCell(r, 5).numFmt = CUR; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
    ws.getCell(r, 6).value = sr.benefitsRate / 100; ws.getCell(r, 6).numFmt = PCT; dc(ws.getCell(r, 6)); inputCell(ws.getCell(r, 6));
    ws.getCell(r, 7).value = sr.payrollTaxRate / 100; ws.getCell(r, 7).numFmt = PCT; dc(ws.getCell(r, 7)); inputCell(ws.getCell(r, 7));
    ws.getCell(r, 8).value = sr.benefitsEligible ? "Yes" : "No"; dc(ws.getCell(r, 8));
    ws.getCell(r, 9).value = sr.notes || ""; dc(ws.getCell(r, 9));
  }

  r += 2;
  const facilStartRow = r;
  sec(ws, r, 4); ws.getCell(r, 1).value = "FACILITIES & OCCUPANCY";
  ws.getCell(r, 2).value = "Amount"; ws.getCell(r, 3).value = "Frequency";
  for (let c = 2; c <= 3; c++) ws.getCell(r, c).font = SECTION_FONT;

  const ownershipLabels: Record<string, string> = { own: "Own", rent: "Rent", donated: "Donated / No-Cost", home_based: "Home-Based" };

  if (sp.facilityPhases && sp.facilityPhases.length > 0) {
    r++; ws.getCell(r, 1).value = "Facility Timeline"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = `${sp.facilityPhases.length} phase(s)`; dc(ws.getCell(r, 2));
    for (const phase of sp.facilityPhases) {
      r++; ws.getCell(r, 1).value = `  Phase: ${ownershipLabels[phase.ownershipType] || phase.ownershipType}`; bc(ws.getCell(r, 1));
      ws.getCell(r, 2).value = `Year ${phase.startYear}–${phase.endYear}`; dc(ws.getCell(r, 2));
      if (phase.ownershipType === "rent" && (phase.monthlyRent || 0) > 0) {
        r++; ws.getCell(r, 1).value = "    Monthly Rent"; dc(ws.getCell(r, 1));
        ws.getCell(r, 2).value = phase.monthlyRent || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
      }
      if (phase.ownershipType === "own" && phase.hasMortgage) {
        r++; ws.getCell(r, 1).value = "    Mortgage Payment"; dc(ws.getCell(r, 1));
        ws.getCell(r, 2).value = phase.mortgageMonthlyPayment || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
        ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));
      }
      if (phase.ownershipType === "donated" && (phase.comparableMarketRent || 0) > 0) {
        r++; ws.getCell(r, 1).value = "    Comparable Market Rent"; dc(ws.getCell(r, 1));
        ws.getCell(r, 2).value = phase.comparableMarketRent || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
        ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));
      }
      if (phase.ownershipType === "home_based" && (phase.monthlyFacilityAllocation || 0) > 0) {
        r++; ws.getCell(r, 1).value = "    Facility Allocation"; dc(ws.getCell(r, 1));
        ws.getCell(r, 2).value = phase.monthlyFacilityAllocation || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
        ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));
      }
    }
  } else {
  r++; ws.getCell(r, 1).value = "Ownership Type"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = ownershipLabels[sp.ownershipType || ""] || "N/A"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  }

  if (!sp.facilityPhases?.length && sp.ownershipType === "own") {
    r++; ws.getCell(r, 1).value = "Property Tax (Annual)"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.propertyTaxAnnual || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    if (sp.hasMortgage) {
      r++; ws.getCell(r, 1).value = "Mortgage Payment"; dc(ws.getCell(r, 1));
      ws.getCell(r, 2).value = sp.mortgageMonthlyPayment || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
      ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));
    }
  } else if (!sp.facilityPhases?.length && sp.ownershipType === "rent") {
    r++; ws.getCell(r, 1).value = "Monthly Rent"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.monthlyRent || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));

    r++; ws.getCell(r, 1).value = "Annual Rent Escalation"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = (sp.annualRentEscalation || 0) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

    if (sp.leaseExpirationYear) {
      r++; ws.getCell(r, 1).value = "Lease Expires"; dc(ws.getCell(r, 1));
      ws.getCell(r, 2).value = `${MONTH_NAMES[sp.leaseExpirationMonth || 1]} ${sp.leaseExpirationYear}`; dc(ws.getCell(r, 2));
      r++; ws.getCell(r, 1).value = "Post-Lease Renewal Bump"; dc(ws.getCell(r, 1));
      ws.getCell(r, 2).value = (sp.postLeaseRenewalBump || 0) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    }
  } else if (!sp.facilityPhases?.length && sp.ownershipType === "donated") {
    r++; ws.getCell(r, 1).value = "Facility Arrangement"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = "Donated / No-Cost Space"; dc(ws.getCell(r, 2));
    r++; ws.getCell(r, 1).value = "Written Agreement"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.hasWrittenAgreement ? "Yes" : "No"; dc(ws.getCell(r, 2));
    if (sp.facilityArrangementEndDate) {
      r++; ws.getCell(r, 1).value = "Arrangement End Date"; dc(ws.getCell(r, 1));
      ws.getCell(r, 2).value = sp.facilityArrangementEndDate; dc(ws.getCell(r, 2));
    }
    r++; ws.getCell(r, 1).value = "Comparable Market Rent"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.comparableMarketRent || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));
  } else if (!sp.facilityPhases?.length && sp.ownershipType === "home_based") {
    r++; ws.getCell(r, 1).value = "Facility Arrangement"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = "Home-Based Program"; dc(ws.getCell(r, 2));
    r++; ws.getCell(r, 1).value = "Monthly Facility Allocation"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.monthlyFacilityAllocation || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));
    r++; ws.getCell(r, 1).value = "Written Use Agreement"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.hasWrittenAgreement ? "Yes" : "No"; dc(ws.getCell(r, 2));
  }

  if (!sp.facilityPhases?.length && sp.isNNNLease) {
    r++; ws.getCell(r, 1).value = "CAM / Common Area Charges"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.nnnCamCharges || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));

    r++; ws.getCell(r, 1).value = "NNN Maintenance"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.nnnMaintenance || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));

    r++; ws.getCell(r, 1).value = "NNN Utilities"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.nnnUtilities || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));
  }

  if (sp.hasGeneralLiabilityInsurance) {
    r++; ws.getCell(r, 1).value = "General Liability Insurance"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.insuranceCost || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = "Annual"; dc(ws.getCell(r, 3));
  }

  if (sp.hasBookkeeper) {
    r++; ws.getCell(r, 1).value = "Bookkeeper"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.bookkeeperMonthlyCost || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));
  }

  if (sp.hasLawyer) {
    r++; ws.getCell(r, 1).value = "Legal Counsel"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.lawyerMonthlyCost || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = "Monthly"; dc(ws.getCell(r, 3));
  }

  r += 2;
  const expStartRow = r;
  sec(ws, r, 7);
  ws.getCell(r, 1).value = "OPERATING EXPENSES";
  ws.getCell(r, 2).value = "Category";
  ws.getCell(r, 3).value = "Driver";
  ws.getCell(r, 4).value = "Yr 1 Amount";
  ws.getCell(r, 5).value = "Escalation %";
  ws.getCell(r, 6).value = "Note";
  for (let c = 2; c <= 6; c++) ws.getCell(r, c).font = SECTION_FONT;

  let expCount = 0;
  for (const ex of expenseRows) {
    r++; expCount++;
    ws.getCell(r, 1).value = ex.lineItem || "Unnamed"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = expCatLabel(ex.category); dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = driverLabel(ex.driverType); dc(ws.getCell(r, 3));
    ws.getCell(r, 4).value = ex.amounts?.[0] ?? 0; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = (ex.escalationRate ?? 0) / 100; ws.getCell(r, 5).numFmt = PCT; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
    ws.getCell(r, 6).value = ex.note || ""; dc(ws.getCell(r, 6));
  }

  r += 2;
  const capDebtStartRow = r;
  sec(ws, r, 8);
  ws.getCell(r, 1).value = "CAPITAL & DEBT";
  ws.getCell(r, 2).value = "Is Loan?";
  ws.getCell(r, 3).value = "Yr 1 Amount";
  ws.getCell(r, 4).value = "Principal";
  ws.getCell(r, 5).value = "Interest Rate";
  ws.getCell(r, 6).value = "Term (Yrs)";
  ws.getCell(r, 7).value = "Annual Payment";
  ws.getCell(r, 8).value = "Note";
  for (let c = 2; c <= 8; c++) ws.getCell(r, c).font = SECTION_FONT;

  let capDebtCount = 0;
  for (const cd of capDebtRows) {
    r++; capDebtCount++;
    ws.getCell(r, 1).value = cd.lineItem || "Unnamed"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = cd.isLoan ? "Yes" : "No"; dc(ws.getCell(r, 2));
    if (cd.isLoan) {
      ws.getCell(r, 3).value = 0; ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3));
      ws.getCell(r, 4).value = cd.loanPrincipal || 0; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
      ws.getCell(r, 5).value = (cd.loanRate || 0) / 100; ws.getCell(r, 5).numFmt = "0.00%"; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
      ws.getCell(r, 6).value = cd.loanTermYears || 0; ws.getCell(r, 6).numFmt = NUM; dc(ws.getCell(r, 6)); inputCell(ws.getCell(r, 6));
      const annualPmt = computeAnnualDebt(cd.loanPrincipal || 0, (cd.loanRate || 0) / 100, cd.loanTermYears || 0);
      ws.getCell(r, 7).value = Math.round(annualPmt); ws.getCell(r, 7).numFmt = CUR; dc(ws.getCell(r, 7));
    } else {
      ws.getCell(r, 3).value = cd.amounts?.[0] ?? 0; ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));
      ws.getCell(r, 4).value = 0; dc(ws.getCell(r, 4));
      ws.getCell(r, 5).value = ""; dc(ws.getCell(r, 5));
      ws.getCell(r, 6).value = ""; dc(ws.getCell(r, 6));
      ws.getCell(r, 7).value = ""; dc(ws.getCell(r, 7));
    }
    ws.getCell(r, 8).value = cd.note || ""; dc(ws.getCell(r, 8));
  }

  r += 2;
  const growthStartRow = r;
  sec(ws, r, 3); ws.getCell(r, 1).value = "GROWTH & TIMING ASSUMPTIONS";

  const salaryEscRow = r + 1;
  r++; ws.getCell(r, 1).value = "Annual Salary Escalation"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = salaryEsc; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  const costInflRow = r + 1;
  r++; ws.getCell(r, 1).value = "General Cost Inflation"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = costInflation; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  const prorationRow = r + 1;
  r++; ws.getCell(r, 1).value = "Year 1 Proration Factor"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = prorationFactor; ws.getCell(r, 2).numFmt = "0.00"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  ws.getCell(r, 3).value = `(${sp.year1OperatingMonths || 12} of 12 months)`; ws.getCell(r, 3).font = { size: 11, italic: true, name: "Calibri", color: { argb: "FF888888" } };

  r++; ws.getCell(r, 1).value = "Tuition Escalation Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = (data.tuitionEscalation?.rate ?? 3) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  const mgmtFeeRow = r + 1;
  r++; ws.getCell(r, 1).value = "Management Fee %"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = (sp.managementFeePercent || 0) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  const startingCashRow = r + 1;
  r++; ws.getCell(r, 1).value = "Starting Cash"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  let histStartRow = 0;
  const prior = data.priorYearSnapshot;
  const current = data.currentYearProjection;
  const hasHistorical = sp.schoolStage === "operating_school" && (prior || current);

  if (hasHistorical) {
    r += 2;
    histStartRow = r;
    sec(ws, r, 4); ws.getCell(r, 1).value = "HISTORICAL / CURRENT YEAR DATA";
    ws.getCell(r, 2).value = "Prior Year"; ws.getCell(r, 3).value = "Current Year";
    for (let c = 2; c <= 3; c++) { ws.getCell(r, c).font = SECTION_FONT; ws.getCell(r, c).alignment = { horizontal: "center" }; }

    r++; ws.getCell(r, 1).value = "Enrollment"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = prior?.endingEnrollment ?? ""; ws.getCell(r, 2).numFmt = NUM; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = current?.currentEnrollment ?? ""; ws.getCell(r, 3).numFmt = NUM; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));

    r++; ws.getCell(r, 1).value = "Total Revenue"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = prior?.totalRevenue ?? ""; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = current?.projectedRevenue ?? ""; ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));

    r++; ws.getCell(r, 1).value = "Total Expenses"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = prior?.totalExpenses ?? ""; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = current?.projectedExpenses ?? ""; ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));

    r++; ws.getCell(r, 1).value = "Net Income"; dc(ws.getCell(r, 1));
    if (prior?.totalRevenue !== undefined && prior?.totalExpenses !== undefined) {
      setFormula(ws.getCell(r, 2), `${cn(r - 1, 2)}-${cn(r, 2)}`, (prior.totalRevenue ?? 0) - (prior.totalExpenses ?? 0));
    }
    if (current?.projectedRevenue !== undefined && current?.projectedExpenses !== undefined) {
      setFormula(ws.getCell(r, 3), `${cn(r - 1, 3)}-${cn(r, 3)}`, (current.projectedRevenue ?? 0) - (current.projectedExpenses ?? 0));
    }
    ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
    ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3));

    r++; ws.getCell(r, 1).value = "Ending Cash"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = prior?.endingCash ?? ""; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = current?.currentCash ?? ""; ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));

    if (current?.monthsCompleted !== undefined) {
      r++; ws.getCell(r, 1).value = "Months Completed"; dc(ws.getCell(r, 1));
      ws.getCell(r, 3).value = current.monthsCompleted; ws.getCell(r, 3).numFmt = NUM; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));
    }
  }

  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  if (gbe && gbp && ((gbe.k5?.[0] ?? 0) + (gbe.m68?.[0] ?? 0) + (gbe.h912?.[0] ?? 0) > 0)) {
    const METHOD_LABELS: Record<string, string> = { count_days: "Count Days", adm: "ADM (Avg Daily Membership)", ada: "ADA (Avg Daily Attendance)" };
    const TIMING_LABELS: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual", semi_annual: "Semi-Annual" };
    r += 2;
    sec(ws, r, 7); ws.getCell(r, 1).value = "CHARTER FUNDING DETAILS";
    r++;
    ws.getCell(r, 1).value = "Enrollment Revenue Method"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = METHOD_LABELS[sp.enrollmentRevenueMethod || "count_days"] || sp.enrollmentRevenueMethod || "Count Days"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    r++;
    ws.getCell(r, 1).value = "Charter Deposit Timing"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = TIMING_LABELS[sp.charterDepositTiming || "monthly"] || sp.charterDepositTiming || "Monthly"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    r++;
    ws.getCell(r, 1).value = "Prior-Year ADM"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.priorYearADM || 0; ws.getCell(r, 2).numFmt = NUM; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    r++;
    ws.getCell(r, 1).value = "Prior-Year ADA"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = sp.priorYearADA || 0; ws.getCell(r, 2).numFmt = NUM; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    r++;
    const adaRatioFE = (sp.priorYearADM || 0) > 0 ? Math.min((sp.priorYearADA || 0) / (sp.priorYearADM || 1), 1) : 0.95;
    ws.getCell(r, 1).value = "Attendance Ratio (ADA ÷ ADM)"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = adaRatioFE; ws.getCell(r, 2).numFmt = "0.00%"; dc(ws.getCell(r, 2));
    r += 2;
    const yLbls = yearLabels(sp);
    ws.getRow(r).values = ["Per-Pupil Rate", "K-5", "6-8", "9-12"];
    hdr(ws, r, 4);
    r++;
    ws.getCell(r, 1).value = "Rate per Student"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = gbp.k5 || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = gbp.m68 || 0; ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));
    ws.getCell(r, 4).value = gbp.h912 || 0; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    r += 2;
    ws.getRow(r).values = ["Grade-Band Enrollment", ...yLbls];
    hdr(ws, r, 6);
    const bands = [
      { label: "K-5", data: gbe.k5 },
      { label: "6-8", data: gbe.m68 },
      { label: "9-12", data: gbe.h912 },
    ];
    for (const band of bands) {
      r++;
      ws.getCell(r, 1).value = `  ${band.label}`; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const cell = ws.getCell(r, y + 2);
        cell.value = band.data?.[y] ?? 0; cell.numFmt = NUM; dc(cell); inputCell(cell);
      }
    }
  }

  r += 2;
  ws.mergeCells(r, 1, r, 7);
  ws.getCell(r, 1).value = "Built by SchoolStack Budget  •  budget.schoolstack.ai";
  ws.getCell(r, 1).font = { italic: true, size: 11, color: { argb: "FF9CA3AF" }, name: "Calibri" };

  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 1, topLeftCell: "B4", activeCell: "B4" }];

  return {
    profileStartRow, enrollStartRow, enrollY1Col, revStartRow, revCount,
    tierStartRow, tierCount, staffStartRow, staffCount, facilStartRow,
    expStartRow, expCount, capDebtStartRow, capDebtCount,
    growthStartRow, salaryEscRow, costInflRow, prorationRow,
    startingCashRow, mgmtFeeRow, maxCapRow, histStartRow,
  };
}

interface FiveYearResult {
  revTotalRow: number;
  persTotalRow: number;
  opexTotalRow: number;
  facilTotalRow: number;
  capDebtTotalRow: number;
  netIncomeRow: number;
  cumNIRow: number;
  cfadsRow: number;
  endingCashRow: number;
  dscrRow: number;
  breakEvenRow: number;
}

function buildFiveYearModel(
  wb: ExcelJS.Workbook, data: ModelData, enrollment: number[],
  salaryEsc: number, costInflation: number, prorationFactor: number,
  startingCash: number, asm: AsmRegistry
): FiveYearResult {
  const ws = wb.addWorksheet("5-Year Model");
  const sp = data.schoolProfile || {};
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = (data.expenseRows || []).filter(r => r.enabled);
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const yc = 5;
  const costInflPct = costInflation * 100;
  const rr = data.enrollment?.retentionRate ?? 85;

  ws.columns = [{ width: 38 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];

  const schoolName = sp.schoolName || "School";
  const yLabels = yearLabels(sp);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = `${schoolName} - 5-Year Financial Model`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };
  ws.getCell(r, 1).alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(r).height = 32;

  r++;
  ws.getRow(r).values = ["", yLabels[0], yLabels[1], yLabels[2], yLabels[3], yLabels[4]];
  hdr(ws, r, 6);

  const enrollRow = r + 1;
  r++; ws.getCell(r, 1).value = "Students Enrolled"; bc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `Assumptions!${cn(asm.enrollStartRow + 1, y + asm.enrollY1Col)}`, enrollment[y]);
    cell.numFmt = NUM; bc(cell);
  }

  r++;

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "REVENUE";
  const revFirstRow = r + 1;

  for (let i = 0; i < revenueRows.length; i++) {
    const rv = revenueRows[i];
    r++;
    ws.getCell(r, 1).value = rv.lineItem || "Unnamed"; dc(ws.getCell(r, 1));

    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      const students = enrollment[y];
      let val: number;

      if (rv.driverType === "percent_of_base") {
        const baseRow = revenueRows.findIndex(rr => rr.id === rv.percentBase);
        if (baseRow >= 0) {
          const baseVal = computeRevLineItem(revenueRows[baseRow], y, students, tiers, costInflPct, sp);
          let pctVal = rv.amounts?.[y] ?? 0;
          if (rv.escalationRate && rv.escalationRate !== 0 && y > 0) {
            pctVal = (rv.amounts?.[0] ?? 0) * Math.pow(1 + rv.escalationRate / 100, y);
          }
          val = baseVal * (pctVal / 100);
        } else {
          val = 0;
        }
      } else {
        val = computeRevLineItem(rv, y, students, tiers, costInflPct, sp);
      }

      if (rv.category === "tuition_offsets") val = -Math.abs(val);

      const pf = y === 0 ? prorationFactor : 1;
      val = Math.round(val * pf);
      cell.value = val;
      cell.numFmt = CUR; dc(cell);
    }
  }

  const revTotalRow = r + 1;
  r++; sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL REVENUE";
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const totalRev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
    const pf = y === 0 ? prorationFactor : 1;
    setFormula(cell, `SUM(${cn(revFirstRow, y + 2)}:${cn(r - 1, y + 2)})`, Math.round(totalRev * pf));
    cell.numFmt = CUR; gc(cell);
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "PERSONNEL";
  const persFirstRow = r + 1;

  for (const sr of staffingRows) {
    r++;
    const ratioTag2 = sr.staffingMode === "ratio" && sr.studentRatio ? ` [1:${sr.studentRatio}]` : "";
    ws.getCell(r, 1).value = `${sr.roleName}${ratioTag2} (${funcLabel(sr.functionCategory)})`;
    dc(ws.getCell(r, 1));

    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      const esc = Math.pow(1 + salaryEsc, y);
      const pf = y === 0 ? prorationFactor : 1;
      const loaded = computeStaffingLoaded(sr, y, enrollment[y]);
      cell.value = Math.round(loaded * esc * pf);
      cell.numFmt = CUR; dc(cell);
    }
  }

  const persTotalRow = r + 1;
  r++; sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL PERSONNEL";
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const persVal = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, y, enrollment[y]);
    setFormula(cell, `SUM(${cn(persFirstRow, y + 2)}:${cn(r - 1, y + 2)})`, Math.round(persVal));
    cell.numFmt = CUR; gc(cell);
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "OPERATING EXPENSES";
  const opexFirstRow = r + 1;

  const baseOpexCategories = ["instructional_program", "technology", "occupancy_facility", "administrative_general"];
  const customExpCats = [...new Set(expenseRows.map(e => e.category).filter(c => !baseOpexCategories.includes(c) && c !== "personnel" && c !== "capital_financing"))];
  const opexCategories = [...baseOpexCategories, ...customExpCats];
  const ccLabels = data.customCategoryLabels || {};
  const opexCatTotalRows: number[] = [];

  for (const cat of opexCategories) {
    const catRows = expenseRows.filter(ex => ex.category === cat);
    if (catRows.length === 0) continue;

    r++; ws.getCell(r, 1).value = expCatLabel(cat, ccLabels); ws.getCell(r, 1).font = BF;
    for (let ci = 1; ci <= yc + 1; ci++) dc(ws.getCell(r, ci));

    for (const ex of catRows) {
      r++;
      ws.getCell(r, 1).value = `  ${ex.lineItem} (${driverLabel(ex.driverType)})`;
      dc(ws.getCell(r, 1));

      for (let y = 0; y < yc; y++) {
        const cell = ws.getCell(r, y + 2);
        const students = enrollment[y];
        const pf = y === 0 ? prorationFactor : 1;
        const rev = computeRevenueForYear(revenueRows, y, students, tiers, costInflPct, sp);
        let val: number;
        if (ex.driverType === "percent_of_revenue") {
          const esc = resolveEsc(ex.escalationRate, costInflPct);
          let pct: number;
          if (esc !== 0 && y > 0) {
            pct = (ex.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
          } else {
            pct = ex.amounts?.[y] ?? 0;
          }
          val = Math.round((pct / 100) * rev * pf);
        } else {
          val = Math.round(driverVal(ex.amounts, y, ex.driverType, students, ex.escalationRate, costInflPct, computeNewStudents(enrollment, rr, y), computeReturningStudents(enrollment, rr, y)) * pf);
        }
        cell.value = val;
        cell.numFmt = CUR; dc(cell);
      }
    }

    r++;
    ws.getCell(r, 1).value = `Total ${expCatLabel(cat, ccLabels)}`; ws.getCell(r, 1).font = BF;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      const students = enrollment[y];
      const pf = y === 0 ? prorationFactor : 1;
      const rev = computeRevenueForYear(revenueRows, y, students, tiers, costInflPct, sp);
      let catSum = 0;
      for (const ex of catRows) {
        if (ex.driverType === "percent_of_revenue") {
          const esc = resolveEsc(ex.escalationRate, costInflPct);
          let pct: number;
          if (esc !== 0 && y > 0) {
            pct = (ex.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
          } else {
            pct = ex.amounts?.[y] ?? 0;
          }
          catSum += Math.round((pct / 100) * rev * pf);
        } else {
          catSum += Math.round(driverVal(ex.amounts, y, ex.driverType, students, ex.escalationRate, costInflPct, computeNewStudents(enrollment, rr, y), computeReturningStudents(enrollment, rr, y)) * pf);
        }
      }
      cell.value = catSum;
      cell.numFmt = CUR; bc(cell);
    }
    opexCatTotalRows.push(r);
  }

  const opexTotalRow = r + 1;
  r++; sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL OPERATING EXPENSES";
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const students = enrollment[y];
    const rev = computeRevenueForYear(revenueRows, y, students, tiers, costInflPct, sp);
    const pf = y === 0 ? prorationFactor : 1;
    const expVal = computeExpenseForYear(expenseRows, y, students, rev, costInflPct, computeNewStudents(enrollment, rr, y), computeReturningStudents(enrollment, rr, y)) * pf;
    const sumParts = opexCatTotalRows.map(tr => cn(tr, y + 2)).join("+");
    setFormula(cell, sumParts, Math.round(expVal));
    cell.numFmt = CUR; gc(cell);
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "CAPITAL & DEBT SERVICE";
  const capFirstRow = r + 1;

  for (const cd of capDebtRows) {
    r++;
    ws.getCell(r, 1).value = cd.lineItem || "Unnamed"; dc(ws.getCell(r, 1));

    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      let val: number;
      if (cd.isLoan) {
        val = Math.round(computeAnnualDebt(cd.loanPrincipal || 0, (cd.loanRate || 0) / 100, cd.loanTermYears || 0));
      } else {
        val = Math.round(driverVal(cd.amounts, y, cd.driverType, enrollment[y]));
      }
      cell.value = val;
      cell.numFmt = CUR; dc(cell);
    }
  }

  const capDebtTotalRow = r + 1;
  r++; sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL CAPITAL & DEBT SERVICE";
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const cdVal = computeCapDebtForYear(capDebtRows, y, enrollment[y]);
    if (capDebtRows.length > 0) {
      setFormula(cell, `SUM(${cn(capFirstRow, y + 2)}:${cn(r - 1, y + 2)})`, Math.round(cdVal));
    } else {
      cell.value = 0;
    }
    cell.numFmt = CUR; gc(cell);
  }

  const revArr: number[] = [];
  const persArr: number[] = [];
  const opexArr: number[] = [];
  const cdArr: number[] = [];
  const niArr: number[] = [];
  const totalExpArr: number[] = [];
  const cfadsArr: number[] = [];
  const endCashArr: number[] = [];
  const maxCap = sp.maxCapacity || 0;

  for (let y = 0; y < yc; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
    const pers = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, y, enrollment[y]);
    const exp = computeExpenseForYear(expenseRows, y, enrollment[y], rev, costInflPct, computeNewStudents(enrollment, rr, y), computeReturningStudents(enrollment, rr, y)) * pf;
    const cd = computeCapDebtForYear(capDebtRows, y, enrollment[y]);
    const revRounded = Math.round(rev * pf);
    const persRounded = Math.round(pers);
    const expRounded = Math.round(exp);
    const cdRounded = Math.round(cd);
    const totalExp = persRounded + expRounded + cdRounded;
    const ni = revRounded - totalExp;
    const cfads = revRounded - persRounded - expRounded;
    const startCash = y === 0 ? startingCash : endCashArr[y - 1];
    const endCash = startCash + ni;
    revArr.push(revRounded);
    persArr.push(persRounded);
    opexArr.push(expRounded);
    cdArr.push(cdRounded);
    niArr.push(ni);
    totalExpArr.push(totalExp);
    cfadsArr.push(cfads);
    endCashArr.push(endCash);
  }

  r += 2;
  const plHeaderRow = r;
  sec(ws, r, 6); ws.getCell(r, 1).value = "INCOME STATEMENT SUMMARY";

  r++; ws.getCell(r, 1).value = "Total Revenue"; bc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, cn(revTotalRow, y + 2), revArr[y]);
    cell.numFmt = CUR; bc(cell);
  }
  const plRevRow = r;

  r++; ws.getCell(r, 1).value = "Total Personnel"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, cn(persTotalRow, y + 2), persArr[y]);
    cell.numFmt = CUR; dc(cell);
  }
  const plPersRow = r;

  const mgmtFeeRow = expenseRows.find(ex => ex.id === "authorizer_fee" && ex.enabled);
  const mgmtFeeAmounts: number[] = [];
  if (sp.hasManagementFee && mgmtFeeRow) {
    for (let y = 0; y < yc; y++) {
      const pf = y === 0 ? prorationFactor : 1;
      const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
      const esc = resolveEsc(mgmtFeeRow.escalationRate, costInflPct);
      let pct: number;
      if (esc !== 0 && y > 0) {
        pct = (mgmtFeeRow.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
      } else {
        pct = mgmtFeeRow.amounts?.[y] ?? 0;
      }
      mgmtFeeAmounts.push(Math.round((pct / 100) * rev * pf));
    }
  }

  r++; ws.getCell(r, 1).value = "Total Operating Expenses"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const displayVal = sp.hasManagementFee ? opexArr[y] - (mgmtFeeAmounts[y] || 0) : opexArr[y];
    setFormula(cell, cn(opexTotalRow, y + 2), displayVal);
    cell.numFmt = CUR; dc(cell);
  }
  const plOpexRow = r;

  let plMgmtFeeRow = 0;
  if (sp.hasManagementFee && mgmtFeeAmounts.length > 0) {
    r++; ws.getCell(r, 1).value = "Authorizer / Management Fee"; dc(ws.getCell(r, 1));
    plMgmtFeeRow = r;
    for (let y = 0; y < yc; y++) {
      const cell = ws.getCell(r, y + 2);
      cell.value = mgmtFeeAmounts[y] || 0;
      cell.numFmt = CUR; dc(cell);
    }
  }

  r++; ws.getCell(r, 1).value = "Total Capital & Debt Service"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, cn(capDebtTotalRow, y + 2), cdArr[y]);
    cell.numFmt = CUR; dc(cell);
  }
  const plCapRow = r;

  r++; ws.getCell(r, 1).value = "Total Expenses"; bc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const parts = [cn(plPersRow, y + 2), cn(plOpexRow, y + 2), cn(plCapRow, y + 2)];
    if (plMgmtFeeRow > 0) parts.push(cn(plMgmtFeeRow, y + 2));
    setFormula(cell, parts.join("+"), totalExpArr[y]);
    cell.numFmt = CUR; bc(cell);
  }
  const totalExpRow = r;

  r++; ws.getCell(r, 1).value = ""; 

  const isNonprofit = sp.entityType === "nonprofit_501c3";
  const niLabel = isNonprofit ? "Net Income" : "Profit / (Loss)";

  const netIncomeRow = r + 1;
  r++; ws.getCell(r, 1).value = niLabel; ws.getCell(r, 1).font = { bold: true, size: 12, name: "Calibri", color: { argb: NAVY } };
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `${cn(plRevRow, y + 2)}-${cn(totalExpRow, y + 2)}`, niArr[y]);
    cell.numFmt = CUR; gc(cell);
    if (niArr[y] < 0) cell.font = { bold: true, size: 11, name: "Calibri", color: { argb: "FFDC2626" } };
  }

  r++; ws.getCell(r, 1).value = isNonprofit ? "Net Margin %" : "Profit Margin %"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const margin = revArr[y] === 0 ? "" : niArr[y] / revArr[y];
    setFormula(cell, `IF(${cn(plRevRow, y + 2)}=0,"",${cn(netIncomeRow, y + 2)}/${cn(plRevRow, y + 2)})`, margin);
    cell.numFmt = PCT; dc(cell);
  }

  r++; ws.getCell(r, 1).value = isNonprofit ? "Cumulative Net Income" : "Cumulative Profit"; dc(ws.getCell(r, 1));
  let cumNI = 0;
  for (let y = 0; y < yc; y++) {
    cumNI += niArr[y];
    const cell = ws.getCell(r, y + 2);
    if (y === 0) {
      setFormula(cell, cn(netIncomeRow, y + 2), cumNI);
    } else {
      setFormula(cell, `${cn(r, y + 1)}+${cn(netIncomeRow, y + 2)}`, cumNI);
    }
    cell.numFmt = CUR; dc(cell);
  }
  const cumNIRow = r;

  r++; ws.getCell(r, 1).value = "Break-even"; ws.getCell(r, 1).font = BF;
  let beYrF = -1;
  let cumChkF = 0;
  for (let y = 0; y < yc; y++) {
    cumChkF += niArr[y];
    if (beYrF < 0 && cumChkF >= 0) beYrF = y;
  }
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    if (y === beYrF) {
      cell.value = "✓ Break-even";
      cell.font = { bold: true, size: 11, name: "Calibri", color: { argb: DASHBOARD_GREEN } };
    } else {
      cell.value = "";
    }
    cell.border = BORDER; cell.alignment = { horizontal: "center" };
  }

  r += 2;
  const cfadsRow = r + 1;
  sec(ws, r, 6); ws.getCell(r, 1).value = "CASH FLOW & DEBT COVERAGE";

  r++; ws.getCell(r, 1).value = "CFADS (Cash Flow Available for Debt Service)"; bc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `${cn(plRevRow, y + 2)}-${cn(plPersRow, y + 2)}-${cn(plOpexRow, y + 2)}`, cfadsArr[y]);
    cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Debt Service"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, cn(plCapRow, y + 2), cdArr[y]);
    cell.numFmt = CUR; dc(cell);
  }
  const dsDebtRow = r;

  const dscrRow = r + 1;
  r++; ws.getCell(r, 1).value = "DSCR (Debt Service Coverage Ratio)"; bc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const dscrVal = cdArr[y] === 0 ? "N/A" : Math.round((cfadsArr[y] / cdArr[y]) * 100) / 100;
    setFormula(cell, `IF(${cn(dsDebtRow, y + 2)}=0,"N/A",${cn(cfadsRow, y + 2)}/${cn(dsDebtRow, y + 2)})`, dscrVal);
    cell.numFmt = "0.00x"; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Starting Cash"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const sc = y === 0 ? startingCash : endCashArr[y - 1];
    if (y === 0) {
      setFormula(cell, `Assumptions!${cn(asm.startingCashRow, 2)}`, sc);
    } else {
      setFormula(cell, cn(r + 1, y + 1), sc);
    }
    cell.numFmt = CUR; dc(cell);
  }
  const startCashRow = r;

  const endingCashRow = r + 1;
  r++; ws.getCell(r, 1).value = "Ending Cash"; bc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `${cn(startCashRow, y + 2)}+${cn(netIncomeRow, y + 2)}`, endCashArr[y]);
    cell.numFmt = CUR; bc(cell);
  }

  r++; ws.getCell(r, 1).value = "Days Cash on Hand"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const days = totalExpArr[y] === 0 ? "" : Math.round(endCashArr[y] / totalExpArr[y] * 365);
    setFormula(cell, `IF(${cn(totalExpRow, y + 2)}=0,"",${cn(endingCashRow, y + 2)}/${cn(totalExpRow, y + 2)}*365)`, days);
    cell.numFmt = NUM; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Months of Runway"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const months = totalExpArr[y] === 0 ? "" : Math.round(endCashArr[y] / (totalExpArr[y] / 12) * 10) / 10;
    setFormula(cell, `IF(${cn(totalExpRow, y + 2)}=0,"",${cn(endingCashRow, y + 2)}/(${cn(totalExpRow, y + 2)}/12))`, months);
    cell.numFmt = "0.0"; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Capacity Utilization %"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const capUtil = maxCap === 0 ? "" : enrollment[y] / maxCap;
    setFormula(cell, `IF(Assumptions!${cn(asm.maxCapRow, 2)}=0,"",${cn(enrollRow, y + 2)}/Assumptions!${cn(asm.maxCapRow, 2)})`, capUtil);
    cell.numFmt = PCT; dc(cell);
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "COVENANT & HEALTH CHECKS";

  r++; ws.getCell(r, 1).value = "DSCR ≥ 1.20x"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const dscrChk = cdArr[y] === 0 ? "N/A" : (cfadsArr[y] / cdArr[y] >= 1.2 ? "PASS" : "FAIL");
    setFormula(cell, `IF(${cn(dsDebtRow, y + 2)}=0,"N/A",IF(${cn(dscrRow, y + 2)}>=1.2,"PASS","FAIL"))`, dscrChk);
    dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Positive Net Income"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    setFormula(cell, `IF(${cn(netIncomeRow, y + 2)}>0,"PASS","FAIL")`, niArr[y] > 0 ? "PASS" : "FAIL");
    dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Enrollment ≥ 70% Capacity"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const capChk = maxCap === 0 ? "N/A" : (enrollment[y] / maxCap >= 0.7 ? "PASS" : "FAIL");
    setFormula(cell, `IF(Assumptions!${cn(asm.maxCapRow, 2)}=0,"N/A",IF(${cn(enrollRow, y + 2)}/Assumptions!${cn(asm.maxCapRow, 2)}>=0.7,"PASS","FAIL"))`, capChk);
    dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Cash Reserve ≥ 2 Months"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const reserveChk = totalExpArr[y] === 0 ? "N/A" : (endCashArr[y] / (totalExpArr[y] / 12) >= 2 ? "PASS" : "FAIL");
    setFormula(cell, `IF(${cn(totalExpRow, y + 2)}=0,"N/A",IF(${cn(endingCashRow, y + 2)}/(${cn(totalExpRow, y + 2)}/12)>=2,"PASS","FAIL"))`, reserveChk);
    dc(cell);
  }

  r += 2;
  const breakEvenRow = r + 1;
  sec(ws, r, 6); ws.getCell(r, 1).value = "BREAK-EVEN ANALYSIS";

  r++; ws.getCell(r, 1).value = "Revenue Per Student"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const rps = enrollment[y] === 0 ? "" : Math.round(revArr[y] / enrollment[y]);
    setFormula(cell, `IF(${cn(enrollRow, y + 2)}=0,"",${cn(revTotalRow, y + 2)}/${cn(enrollRow, y + 2)})`, rps);
    cell.numFmt = CUR; dc(cell);
  }
  const revPerStudRow = r;

  r++; ws.getCell(r, 1).value = "Cost Per Student"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const cps = enrollment[y] === 0 ? "" : Math.round(totalExpArr[y] / enrollment[y]);
    setFormula(cell, `IF(${cn(enrollRow, y + 2)}=0,"",${cn(totalExpRow, y + 2)}/${cn(enrollRow, y + 2)})`, cps);
    cell.numFmt = CUR; dc(cell);
  }

  r++; ws.getCell(r, 1).value = "Fixed Costs (Personnel + Debt)"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const fc = persArr[y] + cdArr[y];
    setFormula(cell, `${cn(plPersRow, y + 2)}+${cn(plCapRow, y + 2)}`, fc);
    cell.numFmt = CUR; dc(cell);
  }
  const fixedCostRow = r;

  r++; ws.getCell(r, 1).value = "Variable Cost Per Student"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const vcps = enrollment[y] === 0 ? "" : Math.round(opexArr[y] / enrollment[y]);
    setFormula(cell, `IF(${cn(enrollRow, y + 2)}=0,"",${cn(plOpexRow, y + 2)}/${cn(enrollRow, y + 2)})`, vcps);
    cell.numFmt = CUR; dc(cell);
  }
  const varCostRow = r;

  r++; ws.getCell(r, 1).value = "Contribution Margin Per Student"; dc(ws.getCell(r, 1));
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const rps = enrollment[y] === 0 ? 0 : revArr[y] / enrollment[y];
    const vcps = enrollment[y] === 0 ? 0 : opexArr[y] / enrollment[y];
    const cm = enrollment[y] === 0 ? "" : Math.round(rps - vcps);
    setFormula(cell, `IF(${cn(enrollRow, y + 2)}=0,"",${cn(revPerStudRow, y + 2)}-${cn(varCostRow, y + 2)})`, cm);
    cell.numFmt = CUR; dc(cell);
  }
  const cmRow = r;

  r++; ws.getCell(r, 1).value = "Break-Even Enrollment"; bc(ws.getCell(r, 1));
  ws.getCell(r, 1).font = { bold: true, size: 12, name: "Calibri", color: { argb: NAVY } };
  for (let y = 0; y < yc; y++) {
    const cell = ws.getCell(r, y + 2);
    const fc = persArr[y] + cdArr[y];
    const rps = enrollment[y] === 0 ? 0 : revArr[y] / enrollment[y];
    const vcps = enrollment[y] === 0 ? 0 : opexArr[y] / enrollment[y];
    const cm = rps - vcps;
    const be = cm <= 0 ? "N/A" : Math.ceil(fc / cm);
    setFormula(cell, `IF(${cn(cmRow, y + 2)}<=0,"N/A",ROUNDUP(${cn(fixedCostRow, y + 2)}/${cn(cmRow, y + 2)},0))`, be);
    cell.numFmt = NUM; gc(cell);
  }

  r += 2;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "Built by SchoolStack Budget  •  budget.schoolstack.ai";
  ws.getCell(r, 1).font = { italic: true, size: 11, color: { argb: "FF9CA3AF" }, name: "Calibri" };

  ws.views = [{ state: "frozen", ySplit: 2, xSplit: 1, topLeftCell: "B3", activeCell: "B3" }];

  return {
    revTotalRow, persTotalRow: persTotalRow, opexTotalRow, facilTotalRow: 0,
    capDebtTotalRow, netIncomeRow, cumNIRow, cfadsRow: cfadsRow,
    endingCashRow, dscrRow: dscrRow, breakEvenRow: r,
  };
}

function computeRevLineItem(rv: RevenueRow, y: number, students: number, tiers: TuitionTier[], costInflPct: number, sp?: SchoolProfile): number {
  if (rv.driverType === "percent_of_base") return 0;

  if (rv.id === "state_local_perpupil" && sp && hasGradeBandFE(sp)) {
    return computeGradeBandRevenueFE(sp, y);
  }
  if (rv.id === "gross_tuition" && rv.driverType === "per_student" && tiers && tiers.length > 0) {
    let perStudentAmount = rv.amounts?.[y] ?? 0;
    if (rv.escalationRate !== undefined && rv.escalationRate !== 0 && y > 0) {
      perStudentAmount = (rv.amounts?.[0] ?? 0) * Math.pow(1 + rv.escalationRate / 100, y);
    }
    return tuitionWithTiers(perStudentAmount, y, students, tiers);
  }
  return driverVal(rv.amounts, y, rv.driverType, students, rv.escalationRate, costInflPct);
}

function buildProForma(
  wb: ExcelJS.Workbook, data: ModelData, enrollment: number[],
  salaryEsc: number, costInflation: number, prorationFactor: number,
  startingCash: number, fiveYr: FiveYearResult
) {
  const ws = wb.addWorksheet("Year 1 Pro Forma");
  const sp = data.schoolProfile || {};
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = (data.expenseRows || []).filter(r => r.enabled);
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const costInflPct = costInflation * 100;
  const rr2 = data.enrollment?.retentionRate ?? 85;

  const isPartial = sp.isPartialFirstYear || false;
  const opMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;

  const fyStart = sp.fiscalYearStartMonth || 7;
  const monthLabels = [""];
  for (let i = 0; i < 12; i++) {
    const mIdx = ((fyStart - 1 + i) % 12) + 1;
    monthLabels.push(MONTH_NAMES[mIdx]);
  }

  ws.columns = [{ width: 36 }, ...Array(12).fill({ width: 14 }), { width: 16 }];
  const schoolName = sp.schoolName || "School";
  const yr1Label = schoolYearLabel(sp.openingYear, 0);

  let r = 1;
  ws.mergeCells(r, 1, r, 14);
  ws.getCell(r, 1).value = `${schoolName} - ${yr1Label} Pro Forma`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };
  ws.getCell(r, 1).alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(r).height = 32;

  r++;
  ws.getRow(r).values = [...monthLabels, `${yr1Label} Total`];
  hdr(ws, r, 14);

  const students = enrollment[0];
  const monthlyRevArr = revenueRows.length > 0
    ? computeExportMonthlyRevenue(revenueRows, students, opMonths, tiers)
    : Array.from({ length: 12 }, (_, m) => m < opMonths ? 0 : 0);

  r++; sec(ws, r, 14); ws.getCell(r, 1).value = "REVENUE";
  const revFirstRow = r + 1;

  for (const rv of revenueRows) {
    r++;
    ws.getCell(r, 1).value = rv.lineItem || "Unnamed"; dc(ws.getCell(r, 1));
    const annualVal = computeRevLineItem(rv, 0, students, tiers, costInflPct, sp);
    const isOffset = rv.category === "tuition_offsets";
    const effectiveAnnual = isOffset ? -Math.abs(annualVal) : annualVal;
    const perMonth = effectiveAnnual / (opMonths || 12);

    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, m + 2);
      cell.value = m < opMonths ? Math.round(perMonth) : 0;
      cell.numFmt = CUR; dc(cell);
    }
    setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(effectiveAnnual * prorationFactor));
    ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));
  }

  const pfRevTotalRow = r + 1;
  r++; sec(ws, r, 14); ws.getCell(r, 1).value = "TOTAL REVENUE";
  let revTotal = 0;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const v = Math.round(monthlyRevArr[m] || 0);
    revTotal += v;
    if (revenueRows.length > 0) {
      setFormula(cell, `SUM(${cn(revFirstRow, m + 2)}:${cn(r - 1, m + 2)})`, v);
    } else {
      cell.value = v;
    }
    cell.numFmt = CUR; gc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, revTotal);
  ws.getCell(r, 14).numFmt = CUR; gc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "";

  r++; sec(ws, r, 14); ws.getCell(r, 1).value = "PERSONNEL";
  const pfPersFirstRow = r + 1;

  const pers0 = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, 0, enrollment[0]);
  const monthlyPers = pers0 / (opMonths || 12);

  for (const sr of staffingRows) {
    r++;
    const ratioTag3 = sr.staffingMode === "ratio" && sr.studentRatio ? ` [1:${sr.studentRatio}]` : "";
    ws.getCell(r, 1).value = (sr.roleName || "Unnamed") + ratioTag3; dc(ws.getCell(r, 1));
    const loaded = computeStaffingLoaded(sr, 0, enrollment[0]) * prorationFactor;
    const monthly = loaded / (opMonths || 12);

    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, m + 2);
      cell.value = m < opMonths ? Math.round(monthly) : 0;
      cell.numFmt = CUR; dc(cell);
    }
    setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(loaded));
    ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));
  }

  const pfPersTotalRow = r + 1;
  r++; sec(ws, r, 14); ws.getCell(r, 1).value = "TOTAL PERSONNEL";
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    if (staffingRows.length > 0) {
      setFormula(cell, `SUM(${cn(pfPersFirstRow, m + 2)}:${cn(r - 1, m + 2)})`, m < opMonths ? Math.round(monthlyPers) : 0);
    } else {
      cell.value = 0;
    }
    cell.numFmt = CUR; gc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(pers0));
  ws.getCell(r, 14).numFmt = CUR; gc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "";

  r++; sec(ws, r, 14); ws.getCell(r, 1).value = "OPERATING EXPENSES";
  const pfOpexFirstRow = r + 1;

  const rev0 = computeRevenueForYear(revenueRows, 0, students, tiers, costInflPct, sp);
  const opex0 = computeExpenseForYear(expenseRows, 0, students, rev0, costInflPct, computeNewStudents(enrollment, rr2, 0), computeReturningStudents(enrollment, rr2, 0)) * prorationFactor;
  const monthlyOps = opex0 / (opMonths || 12);

  const pfBaseOpexCats = ["instructional_program", "technology", "occupancy_facility", "administrative_general"];
  const pfCustomExpCats = [...new Set(expenseRows.map(e => e.category).filter(c => !pfBaseOpexCats.includes(c) && c !== "personnel" && c !== "capital_financing"))];
  const pfOpexCategories = [...pfBaseOpexCats, ...pfCustomExpCats];
  const pfCcLabels = data.customCategoryLabels || {};
  const pfOpexCatTotalRows: number[] = [];

  for (const cat of pfOpexCategories) {
    const catRows = expenseRows.filter(ex => ex.category === cat);
    if (catRows.length === 0) continue;

    r++; ws.getCell(r, 1).value = expCatLabel(cat, pfCcLabels); ws.getCell(r, 1).font = BF;
    for (let ci = 1; ci <= 14; ci++) dc(ws.getCell(r, ci));

    for (const ex of catRows) {
      r++;
      ws.getCell(r, 1).value = `  ${ex.lineItem || "Unnamed"}`; dc(ws.getCell(r, 1));
      let val: number;
      if (ex.driverType === "percent_of_revenue") {
        const pct = ex.amounts?.[0] ?? 0;
        val = (pct / 100) * rev0 * prorationFactor;
      } else {
        val = driverVal(ex.amounts, 0, ex.driverType, students, ex.escalationRate, costInflPct) * prorationFactor;
      }
      const monthly = val / (opMonths || 12);

      for (let m = 0; m < 12; m++) {
        const cell = ws.getCell(r, m + 2);
        cell.value = m < opMonths ? Math.round(monthly) : 0;
        cell.numFmt = CUR; dc(cell);
      }
      setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(val));
      ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));
    }

    r++;
    ws.getCell(r, 1).value = `Total ${expCatLabel(cat, pfCcLabels)}`; ws.getCell(r, 1).font = BF;
    if (catRows.length === 0) {
      for (let m = 0; m < 12; m++) {
        const cell = ws.getCell(r, m + 2);
        cell.value = 0; cell.numFmt = CUR; bc(cell);
      }
      ws.getCell(r, 14).value = 0; ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));
    } else {
      for (let m = 0; m < 12; m++) {
        const cell = ws.getCell(r, m + 2);
        let catMonthly = 0;
        for (const ex of catRows) {
          let val: number;
          if (ex.driverType === "percent_of_revenue") {
            val = ((ex.amounts?.[0] ?? 0) / 100) * rev0 * prorationFactor;
          } else {
            val = driverVal(ex.amounts, 0, ex.driverType, students, ex.escalationRate, costInflPct) * prorationFactor;
          }
          catMonthly += val / (opMonths || 12);
        }
        cell.value = m < opMonths ? Math.round(catMonthly) : 0;
        cell.numFmt = CUR; bc(cell);
      }
      let catTotal = 0;
      for (const ex of catRows) {
        if (ex.driverType === "percent_of_revenue") {
          catTotal += ((ex.amounts?.[0] ?? 0) / 100) * rev0 * prorationFactor;
        } else {
          catTotal += driverVal(ex.amounts, 0, ex.driverType, students, ex.escalationRate, costInflPct) * prorationFactor;
        }
      }
      setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(catTotal));
      ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));
    }
    pfOpexCatTotalRows.push(r);
  }

  const pfOpexTotalRow = r + 1;
  r++; sec(ws, r, 14); ws.getCell(r, 1).value = "TOTAL OPERATING EXPENSES";
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    const sumParts = pfOpexCatTotalRows.map(tr => cn(tr, m + 2)).join("+");
    setFormula(cell, sumParts, m < opMonths ? Math.round(monthlyOps) : 0);
    cell.numFmt = CUR; gc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(opex0));
  ws.getCell(r, 14).numFmt = CUR; gc(ws.getCell(r, 14));

  r++; ws.getCell(r, 1).value = "";

  r++; ws.getCell(r, 1).value = "Capital & Debt Service"; bc(ws.getCell(r, 1));
  const cd0 = computeCapDebtForYear(capDebtRows, 0, students);
  const monthlyDebt = cd0 / 12;
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    cell.value = Math.round(monthlyDebt);
    cell.numFmt = CUR; dc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(cd0));
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));
  const pfDebtRow = r;

  r++; ws.getCell(r, 1).value = "";

  r++; sec(ws, r, 14); ws.getCell(r, 1).value = "MONTHLY CASH FLOW";

  const pfMonthlyPers = (m: number) => m < opMonths ? Math.round(monthlyPers) : 0;
  const pfMonthlyOps = (m: number) => m < opMonths ? Math.round(monthlyOps) : 0;
  const pfMonthlyDebt = Math.round(monthlyDebt);

  const pfTotalExpMonthly: number[] = [];
  const pfNetCashMonthly: number[] = [];
  const pfCumCashMonthly: number[] = [];
  for (let m = 0; m < 12; m++) {
    const totalExp = pfMonthlyPers(m) + pfMonthlyOps(m) + pfMonthlyDebt;
    pfTotalExpMonthly.push(totalExp);
    const revM = Math.round(monthlyRevArr[m] || 0);
    const netCash = revM - totalExp;
    pfNetCashMonthly.push(netCash);
    const cumCash = m === 0 ? startingCash + netCash : pfCumCashMonthly[m - 1] + netCash;
    pfCumCashMonthly.push(cumCash);
  }

  r++; ws.getCell(r, 1).value = "Total Expenses"; bc(ws.getCell(r, 1));
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `${cn(pfPersTotalRow, m + 2)}+${cn(pfOpexTotalRow, m + 2)}+${cn(pfDebtRow, m + 2)}`, pfTotalExpMonthly[m]);
    cell.numFmt = CUR; bc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, pfTotalExpMonthly.reduce((a, b) => a + b, 0));
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));
  const pfTotalExpRow = r;

  r++; ws.getCell(r, 1).value = "Net Cash Flow"; bc(ws.getCell(r, 1));
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    setFormula(cell, `${cn(pfRevTotalRow, m + 2)}-${cn(pfTotalExpRow, m + 2)}`, pfNetCashMonthly[m]);
    cell.numFmt = CUR; bc(cell);
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, pfNetCashMonthly.reduce((a, b) => a + b, 0));
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));
  const pfNetCashRow = r;

  r++; ws.getCell(r, 1).value = "Cumulative Cash"; bc(ws.getCell(r, 1));
  for (let m = 0; m < 12; m++) {
    const cell = ws.getCell(r, m + 2);
    if (m === 0) {
      setFormula(cell, `${startingCash}+${cn(pfNetCashRow, m + 2)}`, pfCumCashMonthly[m]);
    } else {
      setFormula(cell, `${cn(r, m + 1)}+${cn(pfNetCashRow, m + 2)}`, pfCumCashMonthly[m]);
    }
    cell.numFmt = CUR; bc(cell);
  }
  setFormula(ws.getCell(r, 14), cn(r, 13), pfCumCashMonthly[11]);
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));
  const pfCumCashRow = r;

  r += 2;
  sec(ws, r, 3); ws.getCell(r, 1).value = "CASH FLOW METRICS";

  r++; ws.getCell(r, 1).value = "Starting Cash"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));

  r++; ws.getCell(r, 1).value = "Ending Cash (Month 12)"; dc(ws.getCell(r, 1));
  setFormula(ws.getCell(r, 2), cn(pfCumCashRow, 13), pfCumCashMonthly[11]);
  ws.getCell(r, 2).numFmt = CUR; bc(ws.getCell(r, 2));

  r++; ws.getCell(r, 1).value = "Minimum Cash Month"; dc(ws.getCell(r, 1));
  setFormula(ws.getCell(r, 2), `MIN(${cn(pfCumCashRow, 2)}:${cn(pfCumCashRow, 13)})`, Math.min(...pfCumCashMonthly));
  ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));

  r += 2;
  ws.mergeCells(r, 1, r, 14);
  ws.getCell(r, 1).value = "Built by SchoolStack Budget  •  budget.schoolstack.ai";
  ws.getCell(r, 1).font = { italic: true, size: 11, color: { argb: "FF9CA3AF" }, name: "Calibri" };

  ws.views = [{ state: "frozen", ySplit: 2, xSplit: 1, topLeftCell: "B3", activeCell: "B3" }];
}

function buildActualsVsProjections(
  wb: ExcelJS.Workbook, data: ModelData, enrollment: number[],
  salaryEsc: number, costInflation: number, prorationFactor: number,
  fiveYr: FiveYearResult
) {
  const sp = data.schoolProfile || {};
  const prior = data.priorYearSnapshot;
  const current = data.currentYearProjection;
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = (data.expenseRows || []).filter(r => r.enabled);
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const costInflPct = costInflation * 100;
  const rr3 = data.enrollment?.retentionRate ?? 85;

  const hasPrior = prior && (prior.totalRevenue || prior.endingEnrollment || prior.totalExpenses);
  const hasCurrent = current && (current.projectedRevenue || current.currentEnrollment || current.projectedExpenses);
  if (!hasPrior && !hasCurrent) return;

  const ws = wb.addWorksheet("Actuals vs. Projections");
  const schoolName = sp.schoolName || "School";
  const baseYear = sp.openingYear;
  const yr1Lbl = schoolYearLabel(baseYear, 0);
  const yr2Lbl = schoolYearLabel(baseYear, 1);
  const priorLbl = baseYear ? schoolYearLabel(baseYear, -2) : "Prior Year";
  const currentLbl = baseYear ? schoolYearLabel(baseYear, -1) : "Current Year";

  const colHeaders = [""];
  if (hasPrior) colHeaders.push(`${priorLbl} (Actual)`);
  if (hasCurrent) colHeaders.push(currentLbl);
  colHeaders.push(`${yr1Lbl} (Projected)`, `${yr2Lbl} (Projected)`);
  if (hasCurrent || hasPrior) colHeaders.push(`${yr1Lbl} vs ${hasCurrent ? currentLbl : priorLbl}`);

  const cols = colHeaders.length;
  ws.columns = Array(cols).fill({ width: 22 });
  ws.columns[0] = { width: 36 } as any;

  let r = 1;
  ws.mergeCells(r, 1, r, cols);
  ws.getCell(r, 1).value = `${schoolName} - Actuals vs. Projections`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };
  ws.getCell(r, 1).alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(r).height = 32;

  r++;
  ws.getRow(r).values = colHeaders;
  hdr(ws, r, cols);

  const rev0 = computeRevenueForYear(revenueRows, 0, enrollment[0], tiers, costInflPct, sp);
  const rev1 = computeRevenueForYear(revenueRows, 1, enrollment[1], tiers, costInflPct, sp);
  const pf = prorationFactor;
  const pers0 = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, 0, enrollment[0]);
  const pers1 = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, 1, enrollment[1]);
  const exp0 = computeExpenseForYear(expenseRows, 0, enrollment[0], rev0, costInflPct, computeNewStudents(enrollment, rr3, 0), computeReturningStudents(enrollment, rr3, 0)) * pf;
  const exp1 = computeExpenseForYear(expenseRows, 1, enrollment[1], rev1, costInflPct, computeNewStudents(enrollment, rr3, 1), computeReturningStudents(enrollment, rr3, 1));
  const cd0 = computeCapDebtForYear(capDebtRows, 0, enrollment[0]);
  const cd1 = computeCapDebtForYear(capDebtRows, 1, enrollment[1]);
  const totalExp0 = Math.round(pers0) + Math.round(exp0) + Math.round(cd0);
  const totalExp1 = Math.round(pers1) + Math.round(exp1) + Math.round(cd1);
  const ni0 = Math.round(rev0 * pf) - totalExp0;
  const ni1 = Math.round(rev1) - totalExp1;

  const priorEnroll = prior?.endingEnrollment ?? 0;
  const currentEnroll = current?.currentEnrollment ?? 0;
  const baselineEnroll = hasCurrent ? currentEnroll : priorEnroll;
  const baselineRev = hasCurrent ? (current?.projectedRevenue ?? 0) : (prior?.totalRevenue ?? 0);

  r++; sec(ws, r, cols); ws.getCell(r, 1).value = "KEY METRICS";

  r++; ws.getCell(r, 1).value = "Enrollment"; bc(ws.getCell(r, 1));
  let c = 2;
  if (hasPrior) { ws.getCell(r, c).value = priorEnroll; ws.getCell(r, c).numFmt = NUM; dc(ws.getCell(r, c)); c++; }
  if (hasCurrent) { ws.getCell(r, c).value = currentEnroll; ws.getCell(r, c).numFmt = NUM; dc(ws.getCell(r, c)); c++; }
  ws.getCell(r, c).value = enrollment[0]; ws.getCell(r, c).numFmt = NUM; dc(ws.getCell(r, c)); c++;
  ws.getCell(r, c).value = enrollment[1]; ws.getCell(r, c).numFmt = NUM; dc(ws.getCell(r, c)); c++;
  if (baselineEnroll > 0) {
    const growth = (enrollment[0] - baselineEnroll) / baselineEnroll;
    ws.getCell(r, c).value = growth; ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c));
    if (Math.abs(growth) > 0.3) {
      ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: growth > 0 ? AMBER_BG.replace("FF", "") : RED_BG.replace("FF", "") } };
      ws.getCell(r, c).font = { bold: true, size: 11, name: "Calibri" };
    }
  }

  r++; ws.getCell(r, 1).value = "Total Revenue"; bc(ws.getCell(r, 1));
  c = 2;
  if (hasPrior) { ws.getCell(r, c).value = prior?.totalRevenue ?? 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }
  if (hasCurrent) { ws.getCell(r, c).value = current?.projectedRevenue ?? 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }
  ws.getCell(r, c).value = Math.round(rev0 * pf); ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++;
  ws.getCell(r, c).value = Math.round(rev1); ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++;
  if (baselineRev > 0) {
    const growth = (Math.round(rev0 * pf) - baselineRev) / baselineRev;
    ws.getCell(r, c).value = growth; ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c));
    if (Math.abs(growth) > 0.25) {
      ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER_BG.replace("FF", "") } };
      ws.getCell(r, c).font = { bold: true, size: 11, name: "Calibri" };
    }
  }

  r++; ws.getCell(r, 1).value = "Total Expenses"; bc(ws.getCell(r, 1));
  c = 2;
  if (hasPrior) { ws.getCell(r, c).value = prior?.totalExpenses ?? 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }
  if (hasCurrent) { ws.getCell(r, c).value = current?.projectedExpenses ?? 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }
  ws.getCell(r, c).value = totalExp0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++;
  ws.getCell(r, c).value = totalExp1; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c));

  const priorNI = (prior?.totalRevenue ?? 0) - (prior?.totalExpenses ?? 0);
  const currentNI = (current?.projectedRevenue ?? 0) - (current?.projectedExpenses ?? 0);

  r++; ws.getCell(r, 1).value = "Net Income (Surplus / Deficit)"; gc(ws.getCell(r, 1));
  c = 2;
  const niVals = [] as { col: number; val: number }[];
  if (hasPrior) { niVals.push({ col: c, val: priorNI }); c++; }
  if (hasCurrent) { niVals.push({ col: c, val: currentNI }); c++; }
  niVals.push({ col: c, val: ni0 }); c++;
  niVals.push({ col: c, val: ni1 });
  for (const nv of niVals) {
    const cell = ws.getCell(r, nv.col);
    cell.value = nv.val; cell.numFmt = CUR; gc(cell);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: nv.val >= 0 ? GREEN_BG.replace("FF", "") : RED_BG.replace("FF", "") } };
    if (nv.val < 0) cell.font = { bold: true, size: 11, name: "Calibri", color: { argb: "FFDC2626" } };
  }

  r++; ws.getCell(r, 1).value = "Cash Position"; bc(ws.getCell(r, 1));
  c = 2;
  if (hasPrior) { ws.getCell(r, c).value = prior?.endingCash ?? 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }
  if (hasCurrent) { ws.getCell(r, c).value = current?.currentCash ?? 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }

  r += 2;
  sec(ws, r, cols); ws.getCell(r, 1).value = "PER-STUDENT METRICS";

  r++; ws.getCell(r, 1).value = "Revenue Per Student"; bc(ws.getCell(r, 1));
  c = 2;
  if (hasPrior && priorEnroll > 0) {
    ws.getCell(r, c).value = Math.round((prior?.totalRevenue ?? 0) / priorEnroll);
    ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++;
  } else if (hasPrior) { ws.getCell(r, c).value = 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }
  if (hasCurrent && currentEnroll > 0) {
    ws.getCell(r, c).value = Math.round((current?.projectedRevenue ?? 0) / currentEnroll);
    ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++;
  } else if (hasCurrent) { ws.getCell(r, c).value = 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }
  if (enrollment[0] > 0) {
    ws.getCell(r, c).value = Math.round((rev0 * pf) / enrollment[0]);
    ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++;
    ws.getCell(r, c).value = enrollment[1] > 0 ? Math.round(rev1 / enrollment[1]) : 0;
    ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c));
  }

  r++; ws.getCell(r, 1).value = "Expense Per Student"; bc(ws.getCell(r, 1));
  c = 2;
  if (hasPrior && priorEnroll > 0) {
    ws.getCell(r, c).value = Math.round((prior?.totalExpenses ?? 0) / priorEnroll);
    ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++;
  } else if (hasPrior) { ws.getCell(r, c).value = 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }
  if (hasCurrent && currentEnroll > 0) {
    ws.getCell(r, c).value = Math.round((current?.projectedExpenses ?? 0) / currentEnroll);
    ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++;
  } else if (hasCurrent) { ws.getCell(r, c).value = 0; ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++; }
  if (enrollment[0] > 0) {
    ws.getCell(r, c).value = Math.round(totalExp0 / enrollment[0]);
    ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c)); c++;
    ws.getCell(r, c).value = Math.round(totalExp1 / (enrollment[1] || 1));
    ws.getCell(r, c).numFmt = CUR; dc(ws.getCell(r, c));
  }

  r++; ws.getCell(r, 1).value = "Net Margin %"; bc(ws.getCell(r, 1));
  c = 2;
  if (hasPrior && (prior?.totalRevenue ?? 0) > 0) {
    ws.getCell(r, c).value = priorNI / (prior?.totalRevenue ?? 1);
    ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c)); c++;
  } else if (hasPrior) { ws.getCell(r, c).value = 0; ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c)); c++; }
  if (hasCurrent && (current?.projectedRevenue ?? 0) > 0) {
    ws.getCell(r, c).value = currentNI / (current?.projectedRevenue ?? 1);
    ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c)); c++;
  } else if (hasCurrent) { ws.getCell(r, c).value = 0; ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c)); c++; }
  const projRev0 = Math.round(rev0 * pf);
  const projRev1 = Math.round(rev1);
  if (projRev0 > 0) {
    ws.getCell(r, c).value = ni0 / projRev0;
    ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c)); c++;
    ws.getCell(r, c).value = projRev1 > 0 ? ni1 / projRev1 : 0;
    ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c));
  }

  r++; ws.getCell(r, 1).value = "Personnel as % of Revenue"; bc(ws.getCell(r, 1));
  c = 2;
  if (hasPrior) { ws.getCell(r, c).value = "N/A"; dc(ws.getCell(r, c)); c++; }
  if (hasCurrent) { ws.getCell(r, c).value = "N/A"; dc(ws.getCell(r, c)); c++; }
  if (projRev0 > 0) {
    ws.getCell(r, c).value = Math.round(pers0) / projRev0;
    ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c)); c++;
    ws.getCell(r, c).value = projRev1 > 0 ? Math.round(pers1) / projRev1 : 0;
    ws.getCell(r, c).numFmt = PCT; dc(ws.getCell(r, c));
  }

  r += 2;
  sec(ws, r, cols); ws.getCell(r, 1).value = "REALITY CHECK FLAGS";

  r++; ws.getCell(r, 1).value = "⚠ Enrollment growth > 30%"; dc(ws.getCell(r, 1));
  ws.getCell(r, 1).font = { size: 11, name: "Calibri", color: { argb: "FFD97706" } };
  c = 2;
  const yr1Col = (hasPrior ? 1 : 0) + (hasCurrent ? 1 : 0) + 2;
  if (baselineEnroll > 0 && ((enrollment[0] - baselineEnroll) / baselineEnroll) > 0.3) {
    ws.getCell(r, yr1Col).value = `Projecting ${enrollment[0]} vs ${baselineEnroll} actual (${Math.round(((enrollment[0] - baselineEnroll) / baselineEnroll) * 100)}% growth)`;
    ws.getCell(r, yr1Col).font = { size: 11, name: "Calibri", color: { argb: "FFD97706" }, bold: true };
  } else {
    ws.getCell(r, yr1Col).value = "Within range";
    ws.getCell(r, yr1Col).font = { size: 11, name: "Calibri", color: { argb: "FF328555" } };
  }

  r++; ws.getCell(r, 1).value = "⚠ Revenue growth > 25%"; dc(ws.getCell(r, 1));
  ws.getCell(r, 1).font = { size: 11, name: "Calibri", color: { argb: "FFD97706" } };
  if (baselineRev > 0 && ((Math.round(rev0 * pf) - baselineRev) / baselineRev) > 0.25) {
    ws.getCell(r, yr1Col).value = `Projecting $${Math.round(rev0 * pf).toLocaleString()} vs $${baselineRev.toLocaleString()} actual (${Math.round(((Math.round(rev0 * pf) - baselineRev) / baselineRev) * 100)}% growth)`;
    ws.getCell(r, yr1Col).font = { size: 11, name: "Calibri", color: { argb: "FFD97706" }, bold: true };
  } else if (baselineRev > 0) {
    ws.getCell(r, yr1Col).value = "Within range";
    ws.getCell(r, yr1Col).font = { size: 11, name: "Calibri", color: { argb: "FF328555" } };
  }

  r++; ws.getCell(r, 1).value = "⚠ First-year positive income (rare)"; dc(ws.getCell(r, 1));
  ws.getCell(r, 1).font = { size: 11, name: "Calibri", color: { argb: "FFD97706" } };
  if (sp.schoolStage === "operating_school") {
    ws.getCell(r, yr1Col).value = "Operating school - less unusual";
    ws.getCell(r, yr1Col).font = { size: 11, name: "Calibri", color: { argb: "FF328555" } };
  } else if (ni0 > 0) {
    ws.getCell(r, yr1Col).value = "New school showing Year 1 profit - verify assumptions";
    ws.getCell(r, yr1Col).font = { size: 11, name: "Calibri", color: { argb: "FFD97706" }, bold: true };
  } else {
    ws.getCell(r, yr1Col).value = "Typical startup loss pattern";
    ws.getCell(r, yr1Col).font = { size: 11, name: "Calibri", color: { argb: "FF328555" } };
  }

  r += 2;
  ws.mergeCells(r, 1, r, cols);
  ws.getCell(r, 1).value = "Built by SchoolStack Budget  •  budget.schoolstack.ai";
  ws.getCell(r, 1).font = { italic: true, size: 11, color: { argb: "FF9CA3AF" }, name: "Calibri" };

  ws.views = [{ state: "frozen", ySplit: 2, xSplit: 1, topLeftCell: "B3", activeCell: "B3" }];
}

export async function generateFormulaWorkbook(rawData: Record<string, unknown>): Promise<Buffer> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const revenueRows = data.revenueRows || [];
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = data.expenseRows || [];
  const capDebtRows = data.capitalAndDebtRows || [];

  const enrollment = [en.year1 || 0, en.year2 || 0, en.year3 || 0, en.year4 || 0, en.year5 || 0];
  const retentionRate = en.retentionRate ?? 85;
  const salaryEsc = (data.facilities as Record<string, unknown>)?.annualSalaryIncrease
    ? Number((data.facilities as Record<string, unknown>).annualSalaryIncrease) / 100 : 0;
  const costInflation = (data.facilities as Record<string, unknown>)?.generalCostInflation
    ? Number((data.facilities as Record<string, unknown>).generalCostInflation) / 100 : 0;
  const isPartial = sp.isPartialFirstYear || false;
  const opMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = opMonths / 12;
  const startingCash = data.priorYearSnapshot?.endingCash || data.currentYearProjection?.currentCash || 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget - Formula Model";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  addInstructionsSheet(wb, {
    workbookType: "formula",
    schoolName: sp.schoolName || undefined,
    schoolType: sp.entityType || sp.schoolType || undefined,
  });

  const spFacAuth = hasSchoolProfileFacilityData(sp as unknown as Parameters<typeof hasSchoolProfileFacilityData>[0]);

  const asm = buildAssumptions(wb, data, enrollment, salaryEsc, costInflation, prorationFactor, startingCash);

  const fiveYr = buildFiveYearModel(wb, data, enrollment, salaryEsc, costInflation, prorationFactor, startingCash, asm);

  buildProForma(wb, data, enrollment, salaryEsc, costInflation, prorationFactor, startingCash, fiveYr);

  buildActualsVsProjections(wb, data, enrollment, salaryEsc, costInflation, prorationFactor, fiveYr);

  {
  const dbRevRows = data.revenueRows || [];
  const dbStaffRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const dbExpRows = data.expenseRows || [];
  const dbCapRows = data.capitalAndDebtRows || [];
  const dbTiers = data.tuitionTiers || [];
  const costInflPct = costInflation * 100;

  const revByYear: number[] = [];
  const persByYear: number[] = [];
  const opexByYear: number[] = [];
  const debtByYear: number[] = [];
  const niByYear: number[] = [];
  const cashByYear: number[] = [];
  const effectiveExpRows: ExpenseRow[] = spFacAuth
    ? dbExpRows.map(r => r.category === "occupancy_facility" ? { ...r, enabled: false } : r)
    : dbExpRows;
  let runCash = startingCash;
  for (let y = 0; y < 5; y++) {
    const students = enrollment[y];
    const pf = y === 0 ? prorationFactor : 1;
    const rev = sharedComputeRevenue(dbRevRows as unknown as SharedRevenueRow[], y, students, dbTiers as unknown as SharedTuitionTier[], costInflPct, sp as unknown as SharedSchoolProfile);
    const pers = sharedComputePersonnel(dbStaffRows as unknown as SharedStaffingRow[], salaryEsc, pf, y);
    let opex = sharedComputeExpense(effectiveExpRows as unknown as SharedExpenseRow[], y, students, rev, costInflPct);
    if (spFacAuth) {
      const overlay = computeSchoolProfileFacilityOverlay(sp as unknown as Parameters<typeof computeSchoolProfileFacilityOverlay>[0], y, pf);
      opex += overlay.total;
    }
    const debt = sharedComputeDebtService(dbCapRows as unknown as SharedCapDebtRow[], y);
    const ni = rev - pers - opex - debt;
    runCash += ni;
    revByYear.push(rev);
    persByYear.push(pers);
    opexByYear.push(opex);
    debtByYear.push(debt);
    niByYear.push(ni);
    cashByYear.push(runCash);
  }

  const hasDebt = dbCapRows.some(r => r.isLoan && r.enabled !== false);

  const revCatsF: Record<string, number[]> = {};
  for (const rv of dbRevRows) {
    if (rv.enabled === false) continue;
    const cat = rv.category || "other";
    if (!revCatsF[cat]) revCatsF[cat] = new Array(5).fill(0);
    for (let y = 0; y < 5; y++) {
      const students = enrollment[y];
      const val = computeRevLineItem(rv as unknown as RevenueRow, y, students, dbTiers as unknown as TuitionTier[], costInflPct, sp as unknown as SchoolProfile);
      revCatsF[cat][y] += rv.category === "tuition_offsets" ? -Math.abs(val) : val;
    }
  }

  const facCostByYrF = computeFacilityCostByYear(effectiveExpRows, enrollment, revByYear, 5, costInflPct, retentionRate);
  if (spFacAuth) {
    for (let y = 0; y < 5; y++) {
      const pf = y === 0 ? prorationFactor : 1;
      const overlay = computeSchoolProfileFacilityOverlay(sp as unknown as Parameters<typeof computeSchoolProfileFacilityOverlay>[0], y, pf);
      facCostByYrF[y] += overlay.total;
    }
  }
  const instrCostByYrF = computeInstructionalCostByYear(dbExpRows, enrollment, revByYear, 5, costInflPct);

  await addDashboardSheet(wb, {
    schoolName: sp.schoolName || "School",
    entityType: sp.entityType || "",
    enrollment,
    revenueByYear: revByYear,
    personnelByYear: persByYear,
    opexByYear: opexByYear,
    facilityCostByYear: facCostByYrF,
    instructionalByYear: instrCostByYrF,
    debtServiceByYear: debtByYear,
    netIncomeByYear: niByYear,
    cashByYear,
    startingCash,
    hasDebt,
    revenueCategories: revCatsF,
    cumNIRef: { sheetName: "5-Year Model", row: fiveYr.cumNIRow, startCol: 2 },
    hasManagementFee: sp.hasManagementFee,
    managementFeePercent: sp.managementFeePercent,
  });
  }

  const schoolName = sp.schoolName || "School";
  for (const ws of wb.worksheets) {
    ws.views = ws.views || [{ state: "frozen", ySplit: 2, xSplit: 1, topLeftCell: "B3", activeCell: "B3" }];
    const lastRow = ws.rowCount || 1;
    const lastCol = ws.columnCount || 1;
    const endColLetter = lastCol <= 26 ? String.fromCharCode(64 + lastCol) : "Z";
    const isAssumptions = ws.name === "Assumptions";
    const headerRows = isAssumptions ? "1:3" : "1:2";
    ws.pageSetup = {
      ...(ws.pageSetup || {}),
      printArea: `A1:${endColLetter}${lastRow}`,
      printTitlesRow: headerRows,
      orientation: lastCol > 6 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 1 as unknown as undefined,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    };
    ws.headerFooter = {
      oddHeader: `&L&10&B${schoolName}&R&8&I${ws.name}`,
      oddFooter: "&L&8Built by SchoolStack Budget  •  budget.schoolstack.ai&C&8Page &P of &N&R&8&D",
    };
  }

  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf as ArrayBuffer);
}
