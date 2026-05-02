import ExcelJS from "exceljs";
import {
  computeAnnualDebt,
  computeAnnualDebtForYear,
  computeInterestPortion,
  computePrincipalPortion,
  computeRemainingBalance,
  resolveEsc,
  computeEffectiveFte,
} from "@workspace/finance";
export {
  computeAnnualDebt,
  computeAnnualDebtForYear,
  computeInterestPortion,
  computePrincipalPortion,
  computeRemainingBalance,
};

export const NAVY = "FF1E293B";
export const WHITE = "FFFFFFFF";
export const LIGHT_GRAY = "FFE8EDF2";
export const GREEN_BG = "FFE8F5E9";
export const RED_BG = "FFFCE4EC";
export const AMBER_BG = "FFFFF8E1";
export const TEAL = "FF0D9488";
export const EVERGREEN = "FF328555";
export const CREAM = "FFFAF9F7";
const BLUE_INPUT_BG = "FFDBEAFE";
const BLUE_INPUT_FONT = "FF1E3A5F";
export const DASHBOARD_GREEN = "FF16A34A";
const DASHBOARD_AMBER = "FFD97706";
const DASHBOARD_RED = "FFDC2626";
const VIOLET = "FF7C3AED";

import {
  BENCHMARK_PAYROLL_GREEN,
  BENCHMARK_PAYROLL_AMBER,
  BENCHMARK_FACILITY_GREEN,
  BENCHMARK_FACILITY_AMBER,
  BENCHMARK_DSCR_GREEN,
  BENCHMARK_DSCR_AMBER,
  BENCHMARK_REV_PER_STUDENT_GREEN,
  BENCHMARK_REV_PER_STUDENT_AMBER,
  BENCHMARK_REV_SOURCES_GREEN,
  BENCHMARK_REV_SOURCES_AMBER,
  BENCHMARK_DCOH_GREEN,
  BENCHMARK_DCOH_AMBER,
} from "./benchmark-thresholds.js";
export {
  BENCHMARK_PAYROLL_GREEN,
  BENCHMARK_PAYROLL_AMBER,
  BENCHMARK_FACILITY_GREEN,
  BENCHMARK_FACILITY_AMBER,
  BENCHMARK_DSCR_GREEN,
  BENCHMARK_DSCR_AMBER,
  BENCHMARK_DCOH_GREEN,
  BENCHMARK_DCOH_AMBER,
};

export function computeDaysCashOnHand(endingCash: number, totalAnnualExpenses: number): number {
  if (totalAnnualExpenses <= 0) return endingCash >= 0 ? 365 : 0;
  return Math.max(0, (endingCash / totalAnnualExpenses) * 365);
}

export const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
export const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: WHITE }, size: 11, name: "Calibri" };
export const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
export const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11, color: { argb: NAVY }, name: "Calibri" };
export const NF: Partial<ExcelJS.Font> = { size: 11, name: "Calibri" };
export const BF: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true };
export const CUR = '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"??_);_(@_)';
export const PCT = '0.0%;[Red](0.0%);"-"';
export const NUM = '#,##0;#,##0;"-"';
export const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D0D0" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};
export const SUBTOTAL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF1E293B" } },
  bottom: { style: "double", color: { argb: "FF1E293B" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};
const GREEN_OUTPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_BG } };

export const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function hdr(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = HEADER_FILL; cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BORDER;
  }
  ws.getRow(row).height = 28;
}

export function sec(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = SECTION_FILL; cell.font = SECTION_FONT; cell.border = BORDER;
  }
  ws.getRow(row).height = 24;
}

export function dc(cell: ExcelJS.Cell) { cell.font = NF; cell.border = BORDER; }
export function bc(cell: ExcelJS.Cell) { cell.font = BF; cell.border = BORDER; }
export function gc(cell: ExcelJS.Cell) { cell.font = BF; cell.border = SUBTOTAL_BORDER; }

export const INPUT_CELL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_INPUT_BG } };
export const INPUT_CELL_FONT: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, color: { argb: BLUE_INPUT_FONT } };
export const INPUT_CELL_BORDER: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin", color: { argb: "FFB0C4DE" } },
};

export function applyInputStyle(cell: ExcelJS.Cell) {
  cell.fill = INPUT_CELL_FILL;
  cell.font = INPUT_CELL_FONT;
  cell.border = INPUT_CELL_BORDER;
}

export function cn(row: number, col: number): string {
  let s = "";
  let c = col;
  while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
  return `${s}${row}`;
}

export function colLetter(col: number): string {
  let s = "";
  let c = col;
  while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
  return s;
}

export function safeFormulaValue(formula: string, result: unknown): { formula: string; result: number | string } {
  if (result === null || result === undefined) return { formula, result: "0" };
  if (typeof result === "number") {
    if (isNaN(result) || !isFinite(result)) return { formula, result: "0" };
    const rounded = Math.round(result * 1e8) / 1e8;
    return { formula, result: rounded === 0 ? "0" : rounded };
  }
  if (typeof result === "string") return { formula, result: result || "0" };
  return { formula, result: "0" };
}

export function setFormula(cell: ExcelJS.Cell, formula: string, result: unknown) {
  cell.value = safeFormulaValue(formula, result);
}

export function inputCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE_INPUT_BG } };
  cell.font = { ...cell.font, color: { argb: BLUE_INPUT_FONT } };
}

export function outputCell(cell: ExcelJS.Cell) {
  cell.fill = GREEN_OUTPUT_FILL;
}

export function schoolYearLabel(baseYear: number | undefined, offset: number): string {
  if (!baseYear) return `Year ${offset + 1}`;
  const y = baseYear + offset;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function yearLabels(openingYear?: number): string[] {
  return [0, 1, 2, 3, 4].map(i => schoolYearLabel(openingYear, i));
}

export function schoolTypeLabel(t?: string, o?: string): string {
  const map: Record<string, string> = {
    charter_school: "Charter School", homeschool_coop: "Homeschool Co-Op",
    learning_pod: "Learning Pod", microschool: "Microschool",
    private_school: "Private School", tutoring_center: "Tutoring Center", other: o || "Other"
  };
  return map[t || ""] || t || "";
}

export function entityLabel(e?: string): string {
  const map: Record<string, string> = {
    sole_practitioner: "Sole Practitioner", llc_single: "LLC (Single Member)",
    llc_partnership: "LLC (Partnership)", c_corp: "C Corporation",
    s_corp: "S Corporation", nonprofit_501c3: "501(c)(3) Nonprofit",
    undetermined: "Undetermined"
  };
  return map[e || ""] || e || "";
}

export function isNonprofit(entityType?: string): boolean {
  return entityType === "nonprofit_501c3";
}

export function netIncomeLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Change in Net Assets" : "Net Income";
}

export function equityLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Assets" : "Equity";
}

export function funcLabel(fc: string): string {
  const map: Record<string, string> = {
    instructional: "Instructional", school_leadership: "School Leadership",
    student_support: "Student Support", operations: "Operations",
    administrative: "Administrative", other: "Other"
  };
  return map[fc] || fc;
}

export function catLabel(cat: string): string {
  const map: Record<string, string> = {
    tuition_and_fees: "Tuition & Fees", tuition_offsets: "Tuition Offsets",
    public_funding: "Public Funding", school_choice: "School Choice",
    grants_contributions: "Philanthropy", philanthropy: "Philanthropy",
    other_revenue: "Other Revenue",
  };
  return map[cat] || cat;
}

export function expCatLabel(cat: string, customLabels?: Record<string, string>): string {
  const map: Record<string, string> = {
    instructional_program: "Instructional / Program", technology: "Technology",
    occupancy_facility: "Occupancy / Facility", administrative_general: "Administrative / General",
    capital_financing: "Capital / Financing", personnel: "Personnel",
  };
  return customLabels?.[cat] || map[cat] || cat;
}

export function driverLabel(dt: string): string {
  const map: Record<string, string> = {
    annual_fixed: "Annual Fixed", monthly: "Monthly", per_student: "Per Student",
    percent_of_base: "% of Base", percent_of_revenue: "% of Revenue",
  };
  return map[dt] || dt;
}

export function fundingLabel(fp?: string): string {
  const map: Record<string, string> = {
    tuition_based: "Tuition-Based",
    charter_public_funded: "Public Funded (Charter)",
    hybrid_mixed: "Hybrid / Mixed",
  };
  return map[fp || ""] || fp || "";
}

export function stageLabel(s?: string): string {
  return s === "operating_school" ? "Operating" : "Startup / Pre-Opening";
}

export function accountingBasisLabel(ab?: string): string {
  const map: Record<string, string> = {
    cash: "Cash Basis",
    accrual: "Accrual Basis",
    not_sure: "Not Yet Determined",
  };
  return map[ab || ""] || "";
}

// Task #454: differentiate tutoring_center + learning_pod + homeschool_coop
// instead of folding all three into the "microschool" bucket. The string
// returned here is printed verbatim in the underwriting workbook header
// ("School Model" cell), so we use human-readable display labels rather
// than raw snake_case enum ids. `microschool` / `charter` / `private` keep
// their pre-#454 single-word strings so existing workbooks render unchanged.
export function schoolModelFromType(schoolType?: string): string {
  if (!schoolType) return "private";
  switch (schoolType) {
    case "charter_school":
      return "charter";
    case "microschool":
      return "microschool";
    case "learning_pod":
      return "learning pod";
    case "homeschool_coop":
      return "homeschool co-op";
    case "tutoring_center":
      return "tutoring center";
    default:
      return "private";
  }
}



export { resolveEsc };

export function computeNewStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return enrollment[0] || 0;
  const returning = Math.round((enrollment[y - 1] || 0) * (retentionRate / 100));
  return Math.max(0, (enrollment[y] || 0) - Math.min(returning, enrollment[y] || 0));
}

export function computeReturningStudents(enrollment: number[], retentionRate: number, y: number): number {
  if (y === 0) return 0;
  return Math.min(enrollment[y] || 0, Math.round((enrollment[y - 1] || 0) * (retentionRate / 100)));
}

export function driverVal(
  amounts: number[] | undefined,
  y: number,
  dt: string,
  students: number,
  escalationRate?: number,
  fallbackInflation?: number,
  newStudents?: number,
  returningStudents?: number,
  escalationRateOverridden?: boolean,
  fte?: number,
): number {
  let base = amounts?.[y] ?? 0;
  const esc = escalationRateOverridden ? (escalationRate ?? 0) : resolveEsc(escalationRate, fallbackInflation);
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

export interface SchoolProfile {
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
  accountingBasis?: string;
  fundingProfile?: string;
  debtIncluded?: boolean;
  lendingLabIntent?: string;
  gradeBandEnrollment?: { k5: number[]; m68: number[]; h912: number[] };
  gradeBandPerPupil?: { k5: number; m68: number; h912: number };
  enrollmentRevenueMethod?: string;
  charterDepositTiming?: string;
  priorYearADM?: number;
  priorYearADA?: number;
  spedCount?: number[];
  ellCount?: number[];
  ecoDisCount?: number[];
  enrollmentGrowthRate?: number;
  stateFundingMethodology?: string;
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

export interface Enrollment { year1?: number; year2?: number; year3?: number; year4?: number; year5?: number; retentionRate?: number; }

export interface RevenueRow {
  id: string; category: string; lineItem: string; enabled: boolean;
  driverType: string; amounts: number[]; percentBase?: string;
  escalationRate?: number; note?: string; billingMonths?: number;
  escalationRateOverridden?: boolean;
  collectionMethod?: string; collectionRate?: number; collectionDelayDays?: number;
  paymentFrequency?: string; paymentTiming?: string; disbursementType?: string;
  reimbursementLagMonths?: number; grantStatus?: string; receiptQuarter?: number;
}

export interface PayrollTaxComponent {
  label?: string;
  rate: number;
  /** Per-employee annual wage cap; undefined = applies to all wages (no cap). */
  wageBase?: number;
}

export interface StaffingRow {
  id: string; roleName: string; functionCategory: string; employmentType: string;
  fte: number; annualizedRate: number; benefitsEligible: boolean;
  benefitsRate: number; payrollTaxRate: number; payrollLike: boolean; notes: string;
  staffingMode?: "fixed" | "ratio";
  studentRatio?: number;
  minFte?: number;
  maxFte?: number;
  startYear?: number;
  endYear?: number;
  benefitsRateOverridden?: boolean;
  payrollTaxRateOverridden?: boolean;
  /** Per-component breakdown (FICA, Medicare, FUTA, state SUI, etc.) with
   *  wage-base caps. Persisted by the wizard so the api-server can recompute
   *  the wage-base-aware payroll tax + surface the cap-savings insight in
   *  packet PDFs (Task #322). */
  payrollTaxComponents?: PayrollTaxComponent[];
}

function normalizePayrollTaxComponents(raw: unknown): PayrollTaxComponent[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: PayrollTaxComponent[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const rate = Number(obj.rate);
    if (!Number.isFinite(rate)) continue;
    const labelRaw = obj.label;
    const wageBaseRaw = obj.wageBase;
    out.push({
      rate,
      label: typeof labelRaw === "string" ? labelRaw : undefined,
      wageBase: typeof wageBaseRaw === "number" && Number.isFinite(wageBaseRaw) ? wageBaseRaw : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

export function normalizeStaffingRow(raw: Record<string, unknown>): StaffingRow {
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
    staffingMode: String(raw.staffingMode ?? "fixed") as "fixed" | "ratio",
    studentRatio: raw.studentRatio != null ? Number(raw.studentRatio) : undefined,
    minFte: raw.minFte != null ? Number(raw.minFte) : undefined,
    maxFte: raw.maxFte != null ? Number(raw.maxFte) : undefined,
    startYear: raw.startYear != null ? Number(raw.startYear) : undefined,
    endYear: raw.endYear != null ? Number(raw.endYear) : undefined,
    benefitsRateOverridden: raw.benefitsRateOverridden === true ? true : undefined,
    payrollTaxRateOverridden: raw.payrollTaxRateOverridden === true ? true : undefined,
    payrollTaxComponents: normalizePayrollTaxComponents(raw.payrollTaxComponents),
  };
}

export interface ExpenseRow {
  id: string; category: string; lineItem: string; enabled: boolean;
  driverType: string; amounts: number[]; escalationRate?: number; note?: string;
  escalationRateOverridden?: boolean;
}

export interface CapitalDebtRow {
  id: string; lineItem: string; enabled: boolean; driverType: string;
  amounts: number[]; note?: string; isLoan?: boolean;
  loanPrincipal?: number; loanRate?: number; loanTermYears?: number;
  purpose?: string;
}

export interface TuitionTier {
  id: string; tierType: string; label: string;
  discountPercent: number; studentCounts: number[];
}

export interface Program {
  id: string; name: string; annualTuition: number;
  priorYear?: number; currentYear?: number;
  year1: number; year2: number; year3: number; year4: number; year5: number;
}

export interface PriorYearSnapshot {
  endingEnrollment?: number; totalRevenue?: number;
  totalExpenses?: number; endingCash?: number;
  tuitionRevenue?: number; publicFundingRevenue?: number;
  philanthropyRevenue?: number; otherRevenue?: number;
  personnelExpenses?: number; facilityExpenses?: number;
  instructionalExpenses?: number; adminExpenses?: number;
}

export interface CurrentYearProjection {
  currentEnrollment?: number; projectedRevenue?: number;
  projectedExpenses?: number; currentCash?: number; monthsCompleted?: number;
}

export interface OpeningBalances {
  cash?: number;
  accountsReceivable?: number;
  fixedAssets?: number;
  otherAssets?: number;
  accountsPayable?: number;
  currentDebtPortion?: number;
  longTermDebt?: number;
  fixedAssetUsefulLife?: number;
}

export interface SourcesAndUses {
  sources?: Array<{ lineItem: string; amount: number; category: string }>;
  uses?: Array<{ lineItem: string; amount: number; category: string }>;
}

export interface ScenarioDef {
  name: string;
  enrollmentAdjustment: number;
  tuitionAdjustment: number;
  expenseAdjustment: number;
  staffingAdjustment?: number;
  facilityAdjustment?: number;
}

export interface CovenantThresholds {
  minDSCR?: number;
  dscrByYear?: number[];
  minDaysCashOnHand?: number;
  minMonthsRunway?: number;
  minCapacityUtil?: number;
  minCurrentRatio?: number;
}

export interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  tuitionTiers?: TuitionTier[];
  programs?: Program[];
  tuitionEscalation?: { rate?: number };
  salaryEscalationRate?: number;
  costInflationRate?: number;
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
  openingBalances?: OpeningBalances;
  sourcesAndUses?: SourcesAndUses;
  scenarios?: ScenarioDef[];
  covenantThresholds?: CovenantThresholds;
}

export function computeGradeBandRevenue(sp: SchoolProfile, y: number): number {
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
    const ratio = adm > 0 ? Math.min(ada / adm, 1) : 0.95;
    total *= ratio;
  }
  return total;
}

export function hasGradeBandData(sp?: SchoolProfile): boolean {
  if (!sp?.gradeBandEnrollment || !sp?.gradeBandPerPupil) return false;
  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  const hasEnrollment = [gbe.k5, gbe.m68, gbe.h912].some(
    (arr) => arr && arr.some((v) => (v ?? 0) > 0),
  );
  const hasRates = (gbp.k5 || 0) + (gbp.m68 || 0) + (gbp.h912 || 0) > 0;
  return hasEnrollment && hasRates;
}

export function tuitionWithTiers(gross: number, y: number, students: number, tiers?: TuitionTier[]): number {
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

export function normalizeRevenueRows(rows: RevenueRow[]): RevenueRow[] {
  return rows.map(r => {
    let updated = r;
    if ((r.category as string) === "grants_contributions") {
      updated = { ...updated, category: "philanthropy" };
    }
    if (r.id === "gross_tuition" && r.lineItem === "Gross Tuition") {
      updated = { ...updated, lineItem: "Private Pay / Tuition" };
    }
    return updated;
  });
}

export function computeRevLineItem(
  r: RevenueRow, y: number, students: number, tiers?: TuitionTier[], costInflPct?: number, sp?: SchoolProfile,
  newStudents?: number, returningStudents?: number,
): number {
  if (!r.enabled) return 0;
  if (r.id === "state_local_perpupil" && sp && hasGradeBandData(sp)) {
    return computeGradeBandRevenue(sp, y);
  }
  if (r.id === "gross_tuition" && r.driverType === "per_student" && tiers && tiers.length > 0) {
    let perStudentAmount = r.amounts?.[y] ?? 0;
    if (r.escalationRate !== undefined && r.escalationRate !== 0 && y > 0) {
      perStudentAmount = (r.amounts?.[0] ?? 0) * Math.pow(1 + r.escalationRate / 100, y);
    }
    return tuitionWithTiers(perStudentAmount, y, students, tiers);
  }
  return driverVal(
    r.amounts,
    y,
    r.driverType,
    students,
    r.escalationRate,
    costInflPct,
    newStudents,
    returningStudents,
    r.escalationRateOverridden === true,
  );
}

export function computeRevenueForYear(
  rows: RevenueRow[], y: number, students: number, tiers?: TuitionTier[], costInflPct?: number, sp?: SchoolProfile,
  newStudents?: number, returningStudents?: number,
): number {
  const fallback = costInflPct ?? 0;
  const vals = new Map<string, number>();
  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    vals.set(r.id, computeRevLineItem(r, y, students, tiers, costInflPct, sp, newStudents, returningStudents));
  }
  for (const r of rows) {
    if (!r.enabled || r.driverType !== "percent_of_base") continue;
    const baseVal = vals.get(r.percentBase || "") || 0;
    let pctVal = r.amounts?.[y] ?? 0;
    const percentEscalation = r.escalationRateOverridden === true
      ? (r.escalationRate ?? 0)
      : resolveEsc(r.escalationRate, fallback);
    if (percentEscalation !== 0 && y > 0) {
      pctVal = (r.amounts?.[0] ?? 0) * Math.pow(1 + percentEscalation / 100, y);
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

export { computeEffectiveFte };

export function computePersonnelForYear(
  rows: StaffingRow[], salaryEsc: number, prorationFactor: number, y: number,
  enrollment?: number
): number {
  let total = 0;
  for (const r of rows) {
    const effectiveFte = enrollment !== undefined
      ? computeEffectiveFte(r, y, enrollment)
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

export function computeStaffingLoaded(r: StaffingRow, y?: number, enrollment?: number): number {
  const effectiveFte = (y !== undefined && enrollment !== undefined)
    ? computeEffectiveFte(r, y, enrollment)
    : r.fte;
  const annual = effectiveFte * r.annualizedRate;
  const isContractNoPL = r.employmentType === "contract" && !r.payrollLike;
  let benefits = 0, tax = 0;
  if (!isContractNoPL) {
    if (r.benefitsEligible) benefits = annual * (r.benefitsRate / 100);
    tax = annual * (r.payrollTaxRate / 100);
  }
  return annual + benefits + tax;
}

export function computeTotalFTE(staffingRows: StaffingRow[], y: number, enrollment: number): number {
  let total = 0;
  for (const r of staffingRows) {
    total += computeEffectiveFte(r, y, enrollment);
  }
  return total;
}

export function computeExpenseForYear(
  rows: ExpenseRow[], y: number, students: number, totalRevenue: number, costInflationPct?: number, newStudents?: number, returningStudents?: number, totalFTE?: number,
): number {
  let total = 0;
  const fallback = costInflationPct ?? 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.driverType === "percent_of_revenue") {
      const esc = r.escalationRateOverridden === true ? (r.escalationRate ?? 0) : resolveEsc(r.escalationRate, fallback);
      let pct: number;
      if (esc !== 0 && y > 0) {
        pct = (r.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
      } else {
        pct = r.amounts?.[y] ?? 0;
      }
      total += (pct / 100) * totalRevenue;
    } else {
      total += driverVal(
        r.amounts,
        y,
        r.driverType,
        students,
        r.escalationRate,
        fallback,
        newStudents,
        returningStudents,
        r.escalationRateOverridden === true,
        totalFTE,
      );
    }
  }
  return total;
}

export function computeFacilityCostByYear(
  expenseRows: Pick<ExpenseRow, "enabled" | "category" | "driverType" | "amounts" | "escalationRate" | "lineItem">[],
  enrollment: number[], revenueByYear: number[], yearCount: number, costInflationPct?: number, retentionRate?: number, staffingRows?: StaffingRow[],
): number[] {
  const facilRows = (expenseRows as ExpenseRow[]).filter(r => r.enabled && r.category === "occupancy_facility");
  const result: number[] = [];
  const rr = retentionRate ?? 85;
  for (let y = 0; y < yearCount; y++) {
    const ns = computeNewStudents(enrollment, rr, y);
    const rs = computeReturningStudents(enrollment, rr, y);
    const fte = staffingRows ? computeTotalFTE(staffingRows, y, enrollment[y]) : undefined;
    result.push(computeExpenseForYear(facilRows, y, enrollment[y], revenueByYear[y], costInflationPct, ns, rs, fte));
  }
  return result;
}

export function computeInstructionalCostByYear(
  expenseRows: Pick<ExpenseRow, "enabled" | "category" | "driverType" | "amounts" | "escalationRate" | "lineItem">[],
  enrollment: number[], revenueByYear: number[], yearCount: number, costInflationPct?: number, staffingRows?: StaffingRow[],
): number[] {
  const instrRows = (expenseRows as ExpenseRow[]).filter(r => r.enabled && r.category === "instructional_program");
  const result: number[] = [];
  for (let y = 0; y < yearCount; y++) {
    const fte = staffingRows ? computeTotalFTE(staffingRows, y, enrollment[y]) : undefined;
    result.push(computeExpenseForYear(instrRows, y, enrollment[y], revenueByYear[y], costInflationPct, undefined, undefined, fte));
  }
  return result;
}

export function computeCapDebtForYear(rows: CapitalDebtRow[], y: number, students: number): number {
  let total = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.isLoan) {
      total += computeAnnualDebtForYear(r.loanPrincipal || 0, (r.loanRate || 0) / 100, r.loanTermYears || 0, y);
    } else {
      total += driverVal(r.amounts, y, r.driverType, students);
    }
  }
  return total;
}

export function computeDebtServiceForYear(rows: CapitalDebtRow[], y: number): number {
  let total = 0;
  for (const r of rows) {
    if (!r.enabled || !r.isLoan) continue;
    total += computeAnnualDebtForYear(r.loanPrincipal || 0, (r.loanRate || 0) / 100, r.loanTermYears || 0, y);
  }
  return total;
}

export function getEnrollmentArray(enrollment: Enrollment | undefined): number[] {
  if (!enrollment) return [0, 0, 0, 0, 0];
  return [
    enrollment.year1 ?? 0, enrollment.year2 ?? 0, enrollment.year3 ?? 0,
    enrollment.year4 ?? 0, enrollment.year5 ?? 0
  ];
}

export function printSetup(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter = {
    oddFooter: "&L&8SchoolStack Budget&C&8Confidential&R&8Page &P of &N",
  };
}

export interface InstructionsConfig {
  workbookType: "formula" | "lender" | "underwriting";
  tabNames?: string[];
  schoolName?: string;
  schoolType?: string;
}

export function addInstructionsSheet(wb: ExcelJS.Workbook, config: InstructionsConfig) {
  const ws = wb.addWorksheet("Instructions");
  ws.columns = [{ width: 4 }, { width: 80 }];
  ws.properties.tabColor = { argb: EVERGREEN };
  printSetup(ws);

  let r = 2;
  ws.getCell(r, 2).value = "How to Use This Workbook";
  ws.getCell(r, 2).font = { bold: true, size: 16, name: "Calibri", color: { argb: NAVY } };

  if (config.schoolName) {
    r++;
    ws.getCell(r, 2).value = config.schoolName;
    ws.getCell(r, 2).font = { size: 12, name: "Calibri", color: { argb: NAVY } };
  }
  r++;
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  ws.getCell(r, 2).value = `Generated ${dateStr}${config.schoolType ? ` · ${config.schoolType}` : ""}`;
  ws.getCell(r, 2).font = { size: 10, italic: true, name: "Calibri", color: { argb: "FF6B7280" } };

  r += 2;

  const legendSample = ws.getCell(r, 2);
  legendSample.value = "Cell Color Legend";
  legendSample.font = { ...BF, color: { argb: NAVY } };
  r++;
  ws.getCell(r, 2).fill = INPUT_CELL_FILL;
  ws.getCell(r, 2).value = "  Blue cells are editable inputs — change these to update your model.";
  ws.getCell(r, 2).font = INPUT_CELL_FONT;
  r++;
  ws.getCell(r, 2).value = "  White cells contain formulas — do not edit (they recalculate automatically).";
  ws.getCell(r, 2).font = NF;
  r++;
  ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_BG } };
  ws.getCell(r, 2).value = "  Green cells are key outputs and summary metrics.";
  ws.getCell(r, 2).font = NF;
  r++;

  let structure: [string, string][];
  if (config.workbookType === "underwriting") {
    structure = [
      ["Structure", "Tabs 1-4: Profile & setup"],
      ["", "Tabs 5-9: Drivers & inputs"],
      ["", "Tabs 10-13: Forecasts & budgets"],
      ["", "Tabs 14-17: Financial statements"],
      ["", "Tabs 18-22: Analysis, underwriting & dashboard"],
    ];
  } else if (config.workbookType === "lender") {
    structure = [
      ["Structure", "Cover: School identification"],
      ["", "Assumptions & Drivers: Model inputs and calculations"],
      ["", "5-Year P&L & Cash Flow: Financial projections"],
      ["", "Staffing & Loan Snapshot: Personnel and debt detail"],
      ["", "Summary & Financial Health: Key metrics dashboard"],
    ];
  } else {
    structure = [
      ["Structure", "Assumptions: All editable model inputs"],
      ["", "5-Year Model: Detailed revenue, expense, and cash projections"],
      ["", "Pro Forma: Consolidated income statement"],
      ["", "Actuals vs Projections: Variance tracking"],
      ["", "Financial Health: Key metrics dashboard"],
    ];
  }

  const instructions: [string, string][] = [
    ["", ""],
    ["Navigation", config.tabNames
      ? "Use the Cover tab's Table of Contents to jump between sheets."
      : "Use the tab bar at the bottom to navigate between sheets."],
    ["", "The Assumptions tab is the central control panel — all other tabs reference it."],
    ["", ""],
    ...structure,
    ["", ""],
    ["Debt Service Convention", "This model treats full debt service (interest + principal) as an"],
    ["", "operating expense on the Operating Statement. This is a standard"],
    ["", "simplification used in school financial underwriting that ensures internal"],
    ["", "consistency across all tabs."],
    ["", ""],
    ["Tips", "Start with the Assumptions tab to verify your inputs."],
    ["", "Check the Financial Health dashboard for an at-a-glance assessment."],
    ["", "Review key metrics: net margin, cash runway, and DSCR."],
    ["", ""],
    ["Next Steps", "1. Review all blue input cells on the Assumptions tab."],
    ["", "2. Verify enrollment and revenue projections match your plan."],
    ["", "3. Check the Financial Health dashboard for risk signals."],
    ["", "4. Share this workbook with your lender or financial advisor."],
    ["", "5. Update inputs as your school's plan evolves."],
    ["", ""],
    ["Disclaimer", "This model is a planning tool. It does not constitute financial advice,"],
    ["", "a loan commitment, or a guarantee of funding. All projections are based on"],
    ["", "user-provided assumptions and should be independently verified."],
  ];

  for (const [label, text] of instructions) {
    if (label) {
      ws.getCell(r, 2).value = label;
      ws.getCell(r, 2).font = { ...BF, color: { argb: NAVY } };
    } else {
      ws.getCell(r, 2).value = text;
      ws.getCell(r, 2).font = NF;
    }
    r++;
  }
}

export interface DashboardInput {
  schoolName: string;
  entityType: string;
  enrollment: number[];
  revenueByYear: number[];
  personnelByYear: number[];
  opexByYear: number[];
  facilityCostByYear?: number[];
  instructionalByYear?: number[];
  adminByYear?: number[];
  debtServiceByYear: number[];
  netIncomeByYear: number[];
  cashByYear: number[];
  startingCash: number;
  hasDebt: boolean;
  revenueCategories?: Record<string, number[]>;
  cumNIRef?: { sheetName: string; row: number; startCol: number };
  hasManagementFee?: boolean;
  managementFeePercent?: number;
}

function statusColor(status: string): string {
  if (status === "healthy") return DASHBOARD_GREEN;
  if (status === "watch") return DASHBOARD_AMBER;
  return DASHBOARD_RED;
}

function statusIcon(status: string): string {
  if (status === "healthy") return "●";
  if (status === "watch") return "◐";
  return "○";
}

export async function addDashboardSheet(wb: ExcelJS.Workbook, input: DashboardInput) {
  const ws = wb.addWorksheet("Financial Health");
  ws.columns = [
    { width: 4 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 20 }, { width: 40 },
  ];
  ws.properties.tabColor = { argb: EVERGREEN };
  printSetup(ws);

  const cfRules: { row: number; greenThreshold: string; amberThreshold: string; mode: "gte" | "lte" }[] = [];

  let r = 2;
  ws.mergeCells(r, 2, r, 8);
  ws.getCell(r, 2).value = `${input.schoolName} — Financial Health Dashboard`;
  ws.getCell(r, 2).font = { bold: true, size: 16, name: "Calibri", color: { argb: NAVY } };
  ws.getRow(r).height = 30;

  r++;
  ws.mergeCells(r, 2, r, 8);
  ws.getCell(r, 2).value = `Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
  ws.getCell(r, 2).font = { size: 11, italic: true, name: "Calibri", color: { argb: "FF6B7280" } };

  r++;
  const greenDot = ws.getCell(r, 2);
  greenDot.value = "● Green = healthy";
  greenDot.font = { size: 11, name: "Calibri", bold: true, color: { argb: DASHBOARD_GREEN } };
  const amberDot = ws.getCell(r, 4);
  amberDot.value = "◐ Yellow = monitor";
  amberDot.font = { size: 11, name: "Calibri", bold: true, color: { argb: DASHBOARD_AMBER } };
  const redDot = ws.getCell(r, 6);
  redDot.value = "○ Red = action needed";
  redDot.font = { size: 11, name: "Calibri", bold: true, color: { argb: DASHBOARD_RED } };

  r += 2;
  for (let c = 2; c <= 8; c++) {
    ws.getCell(r, c).fill = SECTION_FILL;
    ws.getCell(r, c).border = BORDER;
  }
  ws.getCell(r, 2).value = "Metric";
  ws.getCell(r, 2).font = SECTION_FONT;
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 3).value = `Year ${y + 1}`;
    ws.getCell(r, y + 3).font = SECTION_FONT;
    ws.getCell(r, y + 3).alignment = { horizontal: "center" };
  }
  ws.getCell(r, 8).value = "Benchmark";
  ws.getCell(r, 8).font = SECTION_FONT;
  ws.getCell(r, 8).alignment = { horizontal: "center" };
  ws.getRow(r).height = 24;

  r++;
  ws.getCell(r, 2).value = "Enrollment"; dc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 3).value = input.enrollment[y];
    ws.getCell(r, y + 3).numFmt = NUM;
    dc(ws.getCell(r, y + 3));
    ws.getCell(r, y + 3).alignment = { horizontal: "right" };
  }

  r++;
  ws.getCell(r, 2).value = "Revenue"; dc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 3).value = input.revenueByYear[y];
    ws.getCell(r, y + 3).numFmt = CUR;
    dc(ws.getCell(r, y + 3));
    ws.getCell(r, y + 3).alignment = { horizontal: "right" };
  }

  r++;
  ws.getCell(r, 2).value = "Personnel"; dc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 3).value = input.personnelByYear[y];
    ws.getCell(r, y + 3).numFmt = CUR;
    dc(ws.getCell(r, y + 3));
    ws.getCell(r, y + 3).alignment = { horizontal: "right" };
  }

  r++;
  ws.getCell(r, 2).value = "Operating Expenses"; dc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 3).value = input.opexByYear[y];
    ws.getCell(r, y + 3).numFmt = CUR;
    dc(ws.getCell(r, y + 3));
    ws.getCell(r, y + 3).alignment = { horizontal: "right" };
  }

  r++;
  ws.getCell(r, 2).value = "Debt Service"; dc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 3).value = input.debtServiceByYear[y];
    ws.getCell(r, y + 3).numFmt = CUR;
    dc(ws.getCell(r, y + 3));
    ws.getCell(r, y + 3).alignment = { horizontal: "right" };
  }

  r++;
  const netIncomeRow = r;
  ws.getCell(r, 2).value = "Net Income"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const ni = input.netIncomeByYear[y];
    const cell = ws.getCell(r, y + 3);
    cell.value = ni;
    cell.numFmt = CUR;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ni >= 0 ? GREEN_BG : RED_BG } };
  }
  cfRules.push({ row: netIncomeRow, greenThreshold: "0", amberThreshold: "-1", mode: "gte" });

  r++;
  const endingCashRow = r;
  ws.getCell(r, 2).value = "Ending Cash"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const cash = input.cashByYear[y];
    const cell = ws.getCell(r, y + 3);
    cell.value = cash;
    cell.numFmt = CUR;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cash >= 0 ? GREEN_BG : RED_BG } };
  }
  cfRules.push({ row: endingCashRow, greenThreshold: "0", amberThreshold: "-1", mode: "gte" });

  r++;
  const netMarginRow = r;
  ws.getCell(r, 2).value = "Net Margin"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const rev = input.revenueByYear[y];
    const margin = rev > 0 ? input.netIncomeByYear[y] / rev : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = margin;
    cell.numFmt = PCT;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: margin >= 0.05 ? GREEN_BG : margin >= 0 ? AMBER_BG : RED_BG } };
  }
  cfRules.push({ row: netMarginRow, greenThreshold: "0.05", amberThreshold: "0", mode: "gte" });

  r++;
  const rpsRow = r;
  ws.getCell(r, 2).value = "Revenue per Student"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const rps = input.enrollment[y] > 0 ? input.revenueByYear[y] / input.enrollment[y] : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = rps;
    cell.numFmt = CUR;
    dc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rps >= BENCHMARK_REV_PER_STUDENT_GREEN ? GREEN_BG : rps >= BENCHMARK_REV_PER_STUDENT_AMBER ? AMBER_BG : RED_BG } };
  }
  ws.getCell(r, 8).value = `≥ $${BENCHMARK_REV_PER_STUDENT_GREEN.toLocaleString()}`; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;
  cfRules.push({ row: rpsRow, greenThreshold: String(BENCHMARK_REV_PER_STUDENT_GREEN), amberThreshold: String(BENCHMARK_REV_PER_STUDENT_AMBER), mode: "gte" });

  r++;
  ws.getCell(r, 2).value = "Cost per Student"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const totalCost = input.personnelByYear[y] + input.opexByYear[y] + input.debtServiceByYear[y];
    const cps = input.enrollment[y] > 0 ? totalCost / input.enrollment[y] : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = cps;
    cell.numFmt = CUR;
    bc(cell);
    cell.alignment = { horizontal: "right" };
  }

  r++;
  ws.getCell(r, 2).value = "  Instructional / Student"; dc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const instrCost = input.instructionalByYear ? (input.instructionalByYear[y] || 0) : 0;
    const ips = input.enrollment[y] > 0 ? instrCost / input.enrollment[y] : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = ips;
    cell.numFmt = CUR;
    dc(cell);
    cell.alignment = { horizontal: "right" };
  }

  r++;
  ws.getCell(r, 2).value = "  Facility / Student"; dc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const facCost = input.facilityCostByYear ? (input.facilityCostByYear[y] || 0) : (input.opexByYear[y] * 0.3);
    const fps = input.enrollment[y] > 0 ? facCost / input.enrollment[y] : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = fps;
    cell.numFmt = CUR;
    dc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fps <= 2000 ? GREEN_BG : fps <= 3500 ? AMBER_BG : RED_BG } };
  }
  ws.getCell(r, 8).value = "≤ $2,000 / $2k–$3.5k / > $3,500"; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;

  r++;
  ws.getCell(r, 2).value = "Surplus per Student"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const sps = input.enrollment[y] > 0 ? input.netIncomeByYear[y] / input.enrollment[y] : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = sps;
    cell.numFmt = CUR;
    bc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sps >= 0 ? GREEN_BG : RED_BG } };
  }

  r++;
  const payrollRow = r;
  ws.getCell(r, 2).value = "Payroll %"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const rev = input.revenueByYear[y];
    const pPct = rev > 0 ? input.personnelByYear[y] / rev : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = pPct;
    cell.numFmt = PCT;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: pPct <= BENCHMARK_PAYROLL_GREEN ? GREEN_BG : pPct <= BENCHMARK_PAYROLL_AMBER ? AMBER_BG : RED_BG } };
  }
  ws.getCell(r, 8).value = `≤ ${Math.round(BENCHMARK_PAYROLL_GREEN * 100)}%`; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;
  cfRules.push({ row: payrollRow, greenThreshold: String(BENCHMARK_PAYROLL_GREEN), amberThreshold: String(BENCHMARK_PAYROLL_AMBER), mode: "lte" });

  r++;
  const facilityRow = r;
  ws.getCell(r, 2).value = "Facility %"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const rev = input.revenueByYear[y];
    const facCost = input.facilityCostByYear ? (input.facilityCostByYear[y] || 0) : (input.opexByYear[y] * 0.3);
    const fPct = rev > 0 ? facCost / rev : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = fPct;
    cell.numFmt = PCT;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fPct <= BENCHMARK_FACILITY_GREEN ? GREEN_BG : fPct <= BENCHMARK_FACILITY_AMBER ? AMBER_BG : RED_BG } };
  }
  ws.getCell(r, 8).value = `≤ ${Math.round(BENCHMARK_FACILITY_GREEN * 100)}%`; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;
  cfRules.push({ row: facilityRow, greenThreshold: String(BENCHMARK_FACILITY_GREEN), amberThreshold: String(BENCHMARK_FACILITY_AMBER), mode: "lte" });

  if (input.hasManagementFee) {
    r++;
    const mgmtFeeRow = r;
    ws.getCell(r, 2).value = "Management Fee %"; bc(ws.getCell(r, 2));
    for (let y = 0; y < 5; y++) {
      const rev = input.revenueByYear[y];
      const feePct = rev > 0 ? (input.managementFeePercent || 0) / 100 : 0;
      const cell = ws.getCell(r, y + 3);
      cell.value = feePct;
      cell.numFmt = PCT;
      gc(cell);
      cell.alignment = { horizontal: "right" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: feePct <= 0.10 ? GREEN_BG : feePct <= 0.15 ? AMBER_BG : RED_BG } };
    }
    ws.getCell(r, 8).value = "≤ 15%"; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;
    cfRules.push({ row: mgmtFeeRow, greenThreshold: "0.10", amberThreshold: "0.15", mode: "lte" });
  }

  r++;
  const opMarginRow = r;
  ws.getCell(r, 2).value = "Operating Margin"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const rev = input.revenueByYear[y];
    const opMargin = rev > 0 ? (rev - input.personnelByYear[y] - input.opexByYear[y]) / rev : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = opMargin;
    cell.numFmt = PCT;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opMargin >= 0.10 ? GREEN_BG : opMargin >= 0 ? AMBER_BG : RED_BG } };
  }
  ws.getCell(r, 8).value = "≥ 10%"; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;
  cfRules.push({ row: opMarginRow, greenThreshold: "0.10", amberThreshold: "0", mode: "gte" });

  r++;
  const revSourcesByYear: number[] = new Array(5).fill(0);
  if (input.revenueCategories) {
    for (let y = 0; y < 5; y++) {
      for (const [, vals] of Object.entries(input.revenueCategories)) {
        if ((vals[y] || 0) > 0) revSourcesByYear[y]++;
      }
    }
  } else {
    for (let y = 0; y < 5; y++) {
      revSourcesByYear[y] = (input.revenueByYear[y] || 0) > 0 ? 1 : 0;
    }
  }
  ws.getCell(r, 2).value = "Revenue Sources"; bc(ws.getCell(r, 2));
  ws.getCell(r, 2).border = BORDER;
  for (let y = 0; y < 5; y++) {
    const cnt = revSourcesByYear[y];
    const cell = ws.getCell(r, y + 3);
    cell.value = cnt;
    cell.numFmt = NUM;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cnt >= BENCHMARK_REV_SOURCES_GREEN ? GREEN_BG : cnt >= BENCHMARK_REV_SOURCES_AMBER ? AMBER_BG : RED_BG } };
  }
  ws.getCell(r, 8).value = `≥ ${BENCHMARK_REV_SOURCES_GREEN} sources`; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;

  const totalExpByYear = input.revenueByYear.map((_, i) =>
    input.personnelByYear[i] + input.opexByYear[i] + input.debtServiceByYear[i]
  );

  r++;
  const dscrRow = r;
  ws.getCell(r, 2).value = "DSCR"; bc(ws.getCell(r, 2));
  for (let y = 0; y < 5; y++) {
    const yRev = input.revenueByYear[y];
    const yNOI = yRev - input.personnelByYear[y] - input.opexByYear[y];
    const yDebt = input.debtServiceByYear[y];
    const yDSCR = yDebt > 0 ? yNOI / yDebt : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = input.hasDebt ? yDSCR : "N/A";
    cell.numFmt = input.hasDebt ? "0.00x" : "@";
    gc(cell);
    cell.alignment = { horizontal: "right" };
    if (input.hasDebt) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: yDSCR >= BENCHMARK_DSCR_GREEN ? GREEN_BG : yDSCR >= BENCHMARK_DSCR_AMBER ? AMBER_BG : RED_BG } };
    }
  }
  ws.getCell(r, 8).value = input.hasDebt ? `≥ ${BENCHMARK_DSCR_GREEN.toFixed(2)}x` : "N/A"; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;
  if (input.hasDebt) {
    cfRules.push({ row: dscrRow, greenThreshold: String(BENCHMARK_DSCR_GREEN), amberThreshold: String(BENCHMARK_DSCR_AMBER), mode: "gte" });
  }

  r++;
  const cumNI: number[] = [];
  let cumSum = 0;
  for (let y = 0; y < 5; y++) {
    cumSum += input.netIncomeByYear[y];
    cumNI.push(cumSum);
  }
  let breakEvenYear = -1;
  for (let y = 0; y < 5; y++) {
    if (cumNI[y] >= 0) { breakEvenYear = y; break; }
  }
  ws.getCell(r, 2).value = "Break-even Year"; bc(ws.getCell(r, 2));
  ws.getCell(r, 2).border = BORDER;
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(r, y + 3);
    if (input.cumNIRef) {
      const refCol = colLetter(input.cumNIRef.startCol + y);
      const cumRef = `'${input.cumNIRef.sheetName}'!${refCol}${input.cumNIRef.row}`;
      if (y === 0) {
        setFormula(cell, `IF(${cumRef}>=0,"✓ Break-even","")`, y === breakEvenYear ? "✓ Break-even" : "");
      } else {
        const prevRefCol = colLetter(input.cumNIRef.startCol + y - 1);
        const prevCumRef = `'${input.cumNIRef.sheetName}'!${prevRefCol}${input.cumNIRef.row}`;
        setFormula(cell, `IF(AND(${cumRef}>=0,${prevCumRef}<0),"✓ Break-even","")`, y === breakEvenYear ? "✓ Break-even" : "");
      }
    } else {
      cell.value = y === breakEvenYear ? "✓ Break-even" : "";
    }
    cell.font = y === breakEvenYear
      ? { bold: true, size: 11, name: "Calibri", color: { argb: DASHBOARD_GREEN } }
      : NF;
    cell.border = BORDER;
    cell.alignment = { horizontal: "center" };
  }
  ws.getCell(r, 8).value = "Year 1"; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;

  r++;
  ws.getCell(r, 2).value = "Cash Runway (Months)"; bc(ws.getCell(r, 2));
  ws.getCell(r, 2).border = BORDER;
  for (let y = 0; y < 5; y++) {
    const cashBal = input.cashByYear[y] || 0;
    const totalExp = totalExpByYear[y] || 0;
    const monthlyBurnY = totalExp / 12;
    const runwayM = monthlyBurnY > 0 ? Math.round(cashBal / monthlyBurnY) : (cashBal >= 0 ? 60 : 0);
    const cappedM = Math.min(runwayM, 60);
    const cell = ws.getCell(r, y + 3);
    cell.value = cappedM >= 60 ? "60+" : cappedM;
    cell.numFmt = cappedM >= 60 ? "@" : NUM;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cappedM >= 24 ? GREEN_BG : cappedM >= 12 ? AMBER_BG : RED_BG } };
  }
  ws.getCell(r, 8).value = "≥ 24 months"; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;

  r++;
  ws.getCell(r, 2).value = "Days Cash on Hand"; bc(ws.getCell(r, 2));
  ws.getCell(r, 2).border = BORDER;
  for (let y = 0; y < 5; y++) {
    const dcohVal = computeDaysCashOnHand(input.cashByYear[y] || 0, totalExpByYear[y] || 0);
    const rounded = Math.round(dcohVal);
    const cell = ws.getCell(r, y + 3);
    cell.value = rounded;
    cell.numFmt = NUM;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rounded >= BENCHMARK_DCOH_GREEN ? GREEN_BG : rounded >= BENCHMARK_DCOH_AMBER ? AMBER_BG : RED_BG } };
  }
  ws.getCell(r, 8).value = `≥ ${BENCHMARK_DCOH_GREEN} days`; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;

  let cashRunwayMonths = 60;
  let _runCash = input.startingCash;
  for (let y = 0; y < 5; y++) {
    const mNI = input.netIncomeByYear[y] / 12;
    for (let m = 0; m < 12; m++) {
      _runCash += mNI;
      if (_runCash <= 0) { cashRunwayMonths = y * 12 + m + 1; break; }
    }
    if (_runCash <= 0) break;
  }

  const y5Rev = input.revenueByYear[4] || 1;
  const y5Pers = input.personnelByYear[4];
  const y5TotalExp = totalExpByYear[4];
  const staffPct = y5Pers / y5Rev;

  const facilityCostY5 = input.facilityCostByYear ? (input.facilityCostByYear[4] || 0) : (input.opexByYear[4] * 0.3);
  const facPct = facilityCostY5 / y5Rev;

  const y5NI = input.netIncomeByYear[4];
  const y5Margin = y5Rev > 0 ? y5NI / y5Rev : 0;
  const y1Margin = input.revenueByYear[0] > 0 ? input.netIncomeByYear[0] / input.revenueByYear[0] : 0;

  const monthlyBurn = y5TotalExp / 12;
  const y5Cash = input.cashByYear[4];
  const reserveMonths = monthlyBurn > 0 ? y5Cash / monthlyBurn : 0;

  const y5Debt = input.debtServiceByYear[4];
  const y5NOI = y5Rev - y5Pers - input.opexByYear[4];
  const dscr = y5Debt > 0 ? y5NOI / y5Debt : 0;

  let philanthropy = 0;
  const publicRev = y5Rev;
  const philanthropyPct = y5Rev > 0 ? philanthropy / y5Rev : 0;

  const { generateHealthSignals } = await importHealthModule();

  const signals = generateHealthSignals({
    y1NetMargin: y1Margin,
    lastYearNetMargin: y5Margin,
    breakEvenYear,
    yearCount: 5,
    cashRunwayMonths,
    reserveMonths,
    staffingCostPct: staffPct,
    facilityCostPct: facPct,
    dscr,
    hasDebt: input.hasDebt,
    philanthropyPct: philanthropyPct,
    publicRevenuePct: 0,
    tuitionPct: 0,
    entityType: input.entityType,
  });

  r += 2;
  for (let c = 2; c <= 8; c++) {
    ws.getCell(r, c).fill = SECTION_FILL;
    ws.getCell(r, c).border = BORDER;
  }
  ws.getCell(r, 2).value = "FINANCIAL HEALTH SIGNALS";
  ws.getCell(r, 2).font = { ...BF, color: { argb: NAVY } };
  ws.getCell(r, 3).value = "Status";
  ws.getCell(r, 3).font = SECTION_FONT;
  ws.mergeCells(r, 4, r, 5);
  ws.getCell(r, 4).value = "Assessment";
  ws.getCell(r, 4).font = SECTION_FONT;
  ws.mergeCells(r, 6, r, 8);
  ws.getCell(r, 6).value = "Watch Item";
  ws.getCell(r, 6).font = SECTION_FONT;
  ws.getRow(r).height = 24;

  for (const signal of signals) {
    r++;
    ws.getCell(r, 2).value = signal.dimension.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    ws.getCell(r, 2).font = { ...BF, color: { argb: NAVY } };
    ws.getCell(r, 2).border = BORDER;

    ws.getCell(r, 3).value = `${statusIcon(signal.status)} ${signal.label}`;
    ws.getCell(r, 3).font = { size: 11, name: "Calibri", bold: true, color: { argb: statusColor(signal.status) } };
    ws.getCell(r, 3).border = BORDER;
    ws.getCell(r, 3).alignment = { horizontal: "center" };

    ws.mergeCells(r, 4, r, 5);
    ws.getCell(r, 4).value = signal.explanation;
    ws.getCell(r, 4).font = NF;
    ws.getCell(r, 4).border = BORDER;
    ws.getCell(r, 4).alignment = { wrapText: true };

    ws.mergeCells(r, 6, r, 8);
    ws.getCell(r, 6).value = signal.watchItem;
    ws.getCell(r, 6).font = { size: 11, name: "Calibri", italic: true, color: { argb: "FF6B7280" } };
    ws.getCell(r, 6).border = BORDER;
    ws.getCell(r, 6).alignment = { wrapText: true };

    ws.getRow(r).height = 45;
  }

  r += 2;
  const healthyCount = signals.filter(s => s.status === "healthy").length;
  const watchCount = signals.filter(s => s.status === "watch").length;
  const atRiskCount = signals.filter(s => s.status === "at_risk").length;

  ws.getCell(r, 2).value = "Summary";
  ws.getCell(r, 2).font = { ...BF, color: { argb: NAVY } };
  ws.getCell(r, 2).border = BORDER;
  ws.mergeCells(r, 3, r, 6);
  ws.getCell(r, 3).value = `${healthyCount} Healthy  |  ${watchCount} Watch  |  ${atRiskCount} Needs Attention`;
  ws.getCell(r, 3).font = BF;
  ws.getCell(r, 3).border = BORDER;

  r += 2;
  ws.mergeCells(r, 2, r, 8);
  ws.getCell(r, 2).value = "Built by SchoolStack Budget  •  budget.schoolstack.ai";
  ws.getCell(r, 2).font = { italic: true, size: 11, color: { argb: "FF9CA3AF" }, name: "Calibri" };
  ws.getCell(r, 2).alignment = { horizontal: "center" };

  for (const rule of cfRules) {
    const range = `C${rule.row}:G${rule.row}`;
    const greenFill = { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: GREEN_BG } } };
    const amberFill = { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: AMBER_BG } } };
    const redFill = { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: RED_BG } } };

    if (rule.mode === "gte") {
      ws.addConditionalFormatting({
        ref: range,
        rules: [
          { type: "expression", formulae: [`C${rule.row}>=${rule.greenThreshold}`], priority: 1, style: greenFill },
          { type: "expression", formulae: [`C${rule.row}>=${rule.amberThreshold}`], priority: 2, style: amberFill },
          { type: "expression", formulae: [`C${rule.row}<${rule.amberThreshold}`], priority: 3, style: redFill },
        ],
      });
    } else {
      ws.addConditionalFormatting({
        ref: range,
        rules: [
          { type: "expression", formulae: [`C${rule.row}<=${rule.greenThreshold}`], priority: 1, style: greenFill },
          { type: "expression", formulae: [`C${rule.row}<=${rule.amberThreshold}`], priority: 2, style: amberFill },
          { type: "expression", formulae: [`C${rule.row}>${rule.amberThreshold}`], priority: 3, style: redFill },
        ],
      });
    }
  }
}

const OWNERSHIP_LABELS: Record<string, string> = {
  own: "Own",
  rent: "Rent / Lease",
  donated: "Donated / No-Cost",
  home_based: "Home-Based",
};

export const OWNERSHIP_COLORS: Record<string, string> = {
  own: EVERGREEN,
  rent: BLUE_INPUT_FONT,
  donated: DASHBOARD_AMBER,
  home_based: VIOLET,
};

export const OWNERSHIP_BG_COLORS: Record<string, string> = {
  own: "FFE8F5E9",
  rent: BLUE_INPUT_BG,
  donated: "FFFFF8E1",
  home_based: "FFF3E8FF",
};

export interface PhaseTimelineYear {
  ownershipType: string;
  label: string;
  monthlyCost: number;
  costLabel: string;
  keyTerms: string;
}

export interface PhaseDetail {
  phase: SchoolProfile["facilityPhases"] extends (infer T)[] | undefined ? NonNullable<T> : never;
  label: string;
  yearRange: string;
  color: string;
  bgColor: string;
  details: [string, string | number, string?][];
}

type FacilityPhase = NonNullable<SchoolProfile["facilityPhases"]>[number];

export function buildPhaseTimelineData(phases: FacilityPhase[]): Map<number, PhaseTimelineYear> {
  const map = new Map<number, PhaseTimelineYear>();
  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear);
  for (const phase of sorted) {
    for (let y = phase.startYear; y <= phase.endYear && y <= 5; y++) {
      const label = OWNERSHIP_LABELS[phase.ownershipType] || phase.ownershipType;
      let monthlyCost = 0;
      let costLabel = "";
      const terms: string[] = [];

      switch (phase.ownershipType) {
        case "rent":
          monthlyCost = phase.monthlyRent || 0;
          costLabel = "Monthly Rent";
          if (phase.isNNNLease) terms.push("NNN Lease");
          if (phase.annualRentEscalation) terms.push(`${phase.annualRentEscalation}% esc.`);
          break;
        case "own":
          if (phase.hasMortgage) {
            monthlyCost = phase.mortgageMonthlyPayment || 0;
            costLabel = "Mortgage";
            terms.push("Mortgage");
          } else {
            terms.push("No mortgage");
          }
          if (phase.propertyTaxAnnual) terms.push(`Prop. Tax: $${Math.round(phase.propertyTaxAnnual).toLocaleString()}/yr`);
          break;
        case "donated":
          monthlyCost = phase.comparableMarketRent || 0;
          costLabel = "Comp. Rent";
          if (phase.hasWrittenAgreement) terms.push("Written agreement");
          break;
        case "home_based":
          monthlyCost = phase.monthlyFacilityAllocation || 0;
          costLabel = "Allocation";
          break;
      }

      map.set(y, { ownershipType: phase.ownershipType, label, monthlyCost, costLabel, keyTerms: terms.join(", ") });
    }
  }
  return map;
}

export function buildPhaseDetails(phases: FacilityPhase[]): PhaseDetail[] {
  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear);
  return sorted.map((phase) => {
    const label = OWNERSHIP_LABELS[phase.ownershipType] || phase.ownershipType;
    const yearRange = `Year ${phase.startYear}–${phase.endYear}`;
    const color = OWNERSHIP_COLORS[phase.ownershipType] || NAVY;
    const bgColor = OWNERSHIP_BG_COLORS[phase.ownershipType] || LIGHT_GRAY;
    const details: [string, string | number, string?][] = [];

    switch (phase.ownershipType) {
      case "rent":
        if (phase.monthlyRent) details.push(["Monthly Rent", phase.monthlyRent, CUR]);
        if (phase.annualRentEscalation) details.push(["Annual Rent Escalation", phase.annualRentEscalation / 100, PCT]);
        if (phase.postLeaseRenewalBump) details.push(["Post-Lease Renewal Bump", phase.postLeaseRenewalBump / 100, PCT]);
        if (phase.isNNNLease) {
          details.push(["Lease Type", "NNN (Triple Net)"]);
          if (phase.nnnCamCharges) details.push(["  CAM Charges", phase.nnnCamCharges, CUR]);
          if (phase.nnnMaintenance) details.push(["  Maintenance", phase.nnnMaintenance, CUR]);
          if (phase.nnnUtilities) details.push(["  Utilities", phase.nnnUtilities, CUR]);
        }
        break;
      case "own":
        if (phase.propertyTaxAnnual) details.push(["Property Tax (Annual)", phase.propertyTaxAnnual, CUR]);
        if (phase.hasMortgage) {
          details.push(["Has Mortgage", "Yes"]);
          if (phase.mortgageMonthlyPayment) details.push(["  Monthly Payment", phase.mortgageMonthlyPayment, CUR]);
        }
        break;
      case "donated":
        if (phase.comparableMarketRent) details.push(["Comparable Market Rent", phase.comparableMarketRent, CUR]);
        details.push(["Written Agreement", phase.hasWrittenAgreement ? "Yes" : "No"]);
        break;
      case "home_based":
        if (phase.monthlyFacilityAllocation) details.push(["Monthly Facility Allocation", phase.monthlyFacilityAllocation, CUR]);
        break;
    }

    return { phase, label, yearRange, color, bgColor, details };
  });
}

export function computeMonthlyCashInflow(
  rows: RevenueRow[],
  yearIndex: number = 0,
  students: number = 0,
): number[] {
  const monthly = new Array(12).fill(0);
  const rowValues = new Map<string, number>();

  for (const row of rows) {
    if (!row.enabled || row.driverType === "percent_of_base") continue;
    const base = row.amounts?.[yearIndex] ?? 0;
    let val = 0;
    switch (row.driverType) {
      case "monthly": val = base * 12; break;
      case "per_student": val = base * students; break;
      case "annual_fixed": val = base; break;
      default: val = base;
    }
    rowValues.set(row.id, val);
  }

  for (const row of rows) {
    if (!row.enabled || row.driverType !== "percent_of_base") continue;
    const baseVal = rowValues.get(row.percentBase ?? "") ?? 0;
    const percentage = (row.amounts?.[yearIndex] ?? 0) / 100;
    rowValues.set(row.id, baseVal * percentage);
  }

  for (const row of rows) {
    if (!row.enabled) continue;
    const annualAmount = rowValues.get(row.id) ?? 0;
    if (annualAmount === 0) continue;
    const category = row.category;

    if (category === "tuition_and_fees" || category === "tuition_offsets") {
      const isTuition = row.id === "gross_tuition" || category === "tuition_offsets";
      if (isTuition) {
        const billingMonths = row.billingMonths ?? 10;
        const collectionRate = (row.collectionMethod === "invoiced" || row.collectionMethod === "mixed")
          ? (row.collectionRate ?? 95) / 100 : 1;
        const delayDays = (row.collectionMethod === "invoiced" || row.collectionMethod === "mixed")
          ? (row.collectionDelayDays ?? 0) : 0;
        const delayMs = Math.floor(delayDays / 30);
        const effectiveAmount = category === "tuition_offsets" ? -annualAmount : annualAmount;
        const adjustedAmount = effectiveAmount * collectionRate;
        const perMonth = adjustedAmount / billingMonths;
        const startMonth = (billingMonths === 12 ? 0 : 1) + delayMs;
        for (let i = startMonth; i < startMonth + billingMonths && i < 12; i++) monthly[i] += perMonth;
      } else {
        monthly[0] += annualAmount;
      }
    } else if (category === "public_funding") {
      const freq = row.paymentFrequency ?? "monthly";
      const timing = row.paymentTiming ?? "upfront";
      if (freq === "monthly") {
        const perMonth = annualAmount / 12;
        if (timing === "arrears") {
          for (let i = 1; i < 12; i++) monthly[i] += perMonth;
        } else {
          for (let i = 0; i < 12; i++) monthly[i] += perMonth;
        }
      } else if (freq === "quarterly") {
        const perPayment = annualAmount / 4;
        const months = timing === "arrears" ? [2, 5, 8, 11] : [0, 3, 6, 9];
        months.forEach(m => { monthly[m] += perPayment; });
      } else if (freq === "semi_annual") {
        const perPayment = annualAmount / 2;
        const months = timing === "arrears" ? [5, 11] : [0, 6];
        months.forEach(m => { monthly[m] += perPayment; });
      } else if (freq === "annual") {
        const month = timing === "arrears" ? 11 : 0;
        monthly[month] += annualAmount;
      }
    } else if (category === "school_choice") {
      const disbType = row.disbursementType ?? "direct";
      if (disbType === "direct") {
        const perQuarter = annualAmount / 4;
        [0, 3, 6, 9].forEach(m => { monthly[m] += perQuarter; });
      } else {
        const lagMonths = row.reimbursementLagMonths ?? 2;
        const perMonth = annualAmount / 12;
        for (let i = lagMonths; i < 12; i++) monthly[i] += perMonth;
        if (lagMonths > 0 && lagMonths < 12) {
          const deferred = perMonth * lagMonths;
          const remainingMonths = 12 - lagMonths;
          for (let i = lagMonths; i < 12; i++) monthly[i] += deferred / remainingMonths;
        }
      }
    } else if (category === "philanthropy" || category === "grants_contributions") {
      const quarter = row.receiptQuarter ?? 1;
      const startMonth = (quarter - 1) * 3;
      monthly[startMonth] += annualAmount;
    } else {
      const perMonth = annualAmount / 12;
      for (let i = 0; i < 12; i++) monthly[i] += perMonth;
    }
  }
  return monthly;
}

let _healthModule: { generateHealthSignals: (input: unknown) => Array<{ dimension: string; status: string; label: string; explanation: string; watchItem: string }> } | null = null;
async function importHealthModule() {
  if (!_healthModule) {
    const mod = await import("./financial-health.js");
    _healthModule = { generateHealthSignals: mod.generateHealthSignals as (input: unknown) => Array<{ dimension: string; status: string; label: string; explanation: string; watchItem: string }> };
  }
  return _healthModule!;
}
