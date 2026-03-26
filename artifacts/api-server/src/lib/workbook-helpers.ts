import ExcelJS from "exceljs";

export const NAVY = "FF1E293B";
export const WHITE = "FFFFFFFF";
export const LIGHT_GRAY = "FFE8EDF2";
export const GREEN_BG = "FFE8F5E9";
export const RED_BG = "FFFCE4EC";
export const AMBER_BG = "FFFFF8E1";
export const TEAL = "FF0D9488";
export const EVERGREEN = "FF328555";
export const CREAM = "FFFAF9F7";
export const BLUE_INPUT_BG = "FFDBEAFE";
export const BLUE_INPUT_FONT = "FF1E3A5F";
export const DASHBOARD_GREEN = "FF16A34A";
export const DASHBOARD_AMBER = "FFD97706";
export const DASHBOARD_RED = "FFDC2626";

export const BENCHMARK_PAYROLL_GREEN = 0.55;
export const BENCHMARK_PAYROLL_AMBER = 0.65;
export const BENCHMARK_FACILITY_GREEN = 0.15;
export const BENCHMARK_FACILITY_AMBER = 0.25;
export const BENCHMARK_DSCR_GREEN = 1.25;
export const BENCHMARK_DSCR_AMBER = 1.0;
export const BENCHMARK_REV_PER_STUDENT_GREEN = 10000;
export const BENCHMARK_REV_PER_STUDENT_AMBER = 7000;
export const BENCHMARK_REV_SOURCES_GREEN = 3;
export const BENCHMARK_REV_SOURCES_AMBER = 2;

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
export const GREEN_OUTPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_BG } };

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
export const FORMULA_CELL_FONT: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, color: { argb: NAVY } };

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
    s_corp: "S Corporation", nonprofit_501c3: "501(c)(3) Nonprofit"
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

export function profitLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Change in Net Assets" : "Profit / (Loss)";
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

export function schoolModelFromType(schoolType?: string): string {
  if (!schoolType) return "private";
  if (schoolType === "charter_school") return "charter";
  if (schoolType === "microschool" || schoolType === "learning_pod" || schoolType === "homeschool_coop") return "microschool";
  return "private";
}

export function isCharterModel(schoolType?: string, fundingProfile?: string): boolean {
  return schoolType === "charter_school" || fundingProfile === "charter_public_funded";
}

export function computeAnnualDebt(principal: number, rate: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (rate <= 0) return principal / termYears;
  const mr = rate / 12;
  const m = termYears * 12;
  return (principal * (mr * Math.pow(1 + mr, m)) / (Math.pow(1 + mr, m) - 1)) * 12;
}

export function computeMonthlyDebt(principal: number, rate: number, termYears: number): number {
  return computeAnnualDebt(principal, rate, termYears) / 12;
}

export function computeInterestPortion(principal: number, rate: number, termYears: number, year: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const monthlyPayment = computeAnnualDebt(principal, rate, termYears) / 12;
  const mr = rate <= 0 ? 0 : rate / 12;
  let balance = principal;
  let yearInterest = 0;
  for (let m = 0; m < (year + 1) * 12; m++) {
    const interest = balance * mr;
    const prinPay = monthlyPayment - interest;
    if (m >= year * 12) yearInterest += interest;
    balance -= prinPay;
    if (balance <= 0) break;
  }
  return yearInterest;
}

export function computePrincipalPortion(principal: number, rate: number, termYears: number, year: number): number {
  if (principal <= 0 || termYears <= 0 || year >= termYears) return 0;
  const annual = computeAnnualDebtForYear(principal, rate, termYears, year);
  const interest = computeInterestPortion(principal, rate, termYears, year);
  return Math.max(0, annual - interest);
}

export function computeAnnualDebtForYear(principal: number, rate: number, termYears: number, year: number): number {
  if (year >= termYears) return 0;
  return computeAnnualDebt(principal, rate, termYears);
}

export function computeRemainingBalance(principal: number, rate: number, termYears: number, afterYear: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  const monthlyPayment = computeAnnualDebt(principal, rate, termYears) / 12;
  const mr = rate <= 0 ? 0 : rate / 12;
  let balance = principal;
  for (let m = 0; m < (afterYear + 1) * 12; m++) {
    const interest = balance * mr;
    balance -= (monthlyPayment - interest);
    if (balance <= 0) return 0;
  }
  return Math.max(0, balance);
}

export function resolveEsc(rowEsc?: number, fallback?: number): number {
  if (rowEsc !== undefined && rowEsc !== 0) return rowEsc;
  return fallback ?? 0;
}

export function driverVal(amounts: number[] | undefined, y: number, dt: string, students: number, escalationRate?: number, fallbackInflation?: number): number {
  let base = amounts?.[y] ?? 0;
  const esc = resolveEsc(escalationRate, fallbackInflation);
  if (esc !== 0 && y > 0) {
    const y1 = amounts?.[0] ?? 0;
    base = y1 * Math.pow(1 + esc / 100, y);
  }
  switch (dt) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
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
  hasBookkeeper?: boolean;
  bookkeeperMonthlyCost?: number;
  hasLawyer?: boolean;
  lawyerMonthlyCost?: number;
  hasGeneralLiabilityInsurance?: boolean;
  insuranceCost?: number;
  fundingProfile?: string;
  debtIncluded?: boolean;
  lendingLabIntent?: string;
  gradeBandEnrollment?: { k5: number[]; m68: number[]; h912: number[] };
  gradeBandPerPupil?: { k5: number; m68: number; h912: number };
  enrollmentRevenueMethod?: string;
  charterDepositTiming?: string;
  priorYearADM?: number;
  priorYearADA?: number;
}

export interface Enrollment { year1?: number; year2?: number; year3?: number; year4?: number; year5?: number; }

export interface RevenueRow {
  id: string; category: string; lineItem: string; enabled: boolean;
  driverType: string; amounts: number[]; percentBase?: string;
  escalationRate?: number; note?: string; billingMonths?: number;
  collectionMethod?: string; collectionRate?: number; collectionDelayDays?: number;
  paymentFrequency?: string; paymentTiming?: string; disbursementType?: string;
  reimbursementLagMonths?: number; grantStatus?: string; receiptQuarter?: number;
}

export interface StaffingRow {
  id: string; roleName: string; functionCategory: string; employmentType: string;
  fte: number; annualizedRate: number; benefitsEligible: boolean;
  benefitsRate: number; payrollTaxRate: number; payrollLike: boolean; notes: string;
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
  };
}

export interface ExpenseRow {
  id: string; category: string; lineItem: string; enabled: boolean;
  driverType: string; amounts: number[]; escalationRate?: number; note?: string;
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
  minDaysCashOnHand?: number;
  minMonthsRunway?: number;
  minCapacityUtil?: number;
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

export function computeRevLineItem(
  r: RevenueRow, y: number, students: number, tiers?: TuitionTier[], costInflPct?: number, sp?: SchoolProfile
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
  return driverVal(r.amounts, y, r.driverType, students, r.escalationRate, costInflPct);
}

export function computeRevenueForYear(
  rows: RevenueRow[], y: number, students: number, tiers?: TuitionTier[], costInflPct?: number, sp?: SchoolProfile
): number {
  const vals = new Map<string, number>();
  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    vals.set(r.id, computeRevLineItem(r, y, students, tiers, costInflPct, sp));
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

export function computePersonnelForYear(
  rows: StaffingRow[], salaryEsc: number, prorationFactor: number, y: number
): number {
  let total = 0;
  for (const r of rows) {
    const annual = r.fte * r.annualizedRate;
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

export function computeStaffingLoaded(r: StaffingRow): number {
  const annual = r.fte * r.annualizedRate;
  const isContractNoPL = r.employmentType === "contract" && !r.payrollLike;
  let benefits = 0, tax = 0;
  if (!isContractNoPL) {
    if (r.benefitsEligible) benefits = annual * (r.benefitsRate / 100);
    tax = annual * (r.payrollTaxRate / 100);
  }
  return annual + benefits + tax;
}

export function computeExpenseForYear(
  rows: ExpenseRow[], y: number, students: number, totalRevenue: number, costInflationPct?: number
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
      total += driverVal(r.amounts, y, r.driverType, students, r.escalationRate, fallback);
    }
  }
  return total;
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

export function getEnrollment(enrollment: Enrollment | undefined, y: number): number {
  if (!enrollment) return 0;
  const arr = [enrollment.year1, enrollment.year2, enrollment.year3, enrollment.year4, enrollment.year5];
  return arr[y] ?? 0;
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
  debtServiceByYear: number[];
  netIncomeByYear: number[];
  cashByYear: number[];
  startingCash: number;
  hasDebt: boolean;
  revenueCategories?: Record<string, number[]>;
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
    const fPct = rev > 0 ? (input.opexByYear[y] * 0.3) / rev : 0;
    const cell = ws.getCell(r, y + 3);
    cell.value = fPct;
    cell.numFmt = PCT;
    gc(cell);
    cell.alignment = { horizontal: "right" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fPct <= BENCHMARK_FACILITY_GREEN ? GREEN_BG : fPct <= BENCHMARK_FACILITY_AMBER ? AMBER_BG : RED_BG } };
  }
  ws.getCell(r, 8).value = `≤ ${Math.round(BENCHMARK_FACILITY_GREEN * 100)}%`; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;
  cfRules.push({ row: facilityRow, greenThreshold: String(BENCHMARK_FACILITY_GREEN), amberThreshold: String(BENCHMARK_FACILITY_AMBER), mode: "lte" });

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
  let revSourceCount = 0;
  const catTotals = new Map<string, number>();
  if (input.revenueCategories) {
    for (const [cat, vals] of Object.entries(input.revenueCategories)) {
      const total = vals.reduce((a: number, b: number) => a + b, 0);
      if (total > 0) { revSourceCount++; catTotals.set(cat, total); }
    }
  } else {
    revSourceCount = input.revenueByYear.some(v => v > 0) ? 1 : 0;
  }
  ws.getCell(r, 2).value = "Revenue Sources"; bc(ws.getCell(r, 2));
  ws.getCell(r, 2).border = BORDER;
  const rsCell = ws.getCell(r, 3);
  rsCell.value = revSourceCount;
  rsCell.numFmt = NUM;
  rsCell.font = { ...BF, color: { argb: revSourceCount >= BENCHMARK_REV_SOURCES_GREEN ? DASHBOARD_GREEN : revSourceCount >= BENCHMARK_REV_SOURCES_AMBER ? DASHBOARD_AMBER : DASHBOARD_RED } };
  rsCell.border = BORDER;
  ws.mergeCells(r, 3, r, 7);
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
  const beCell = ws.getCell(r, 3);
  beCell.value = breakEvenYear >= 0 ? `Year ${breakEvenYear + 1}` : "Not reached";
  beCell.font = { ...BF, color: { argb: breakEvenYear >= 0 ? DASHBOARD_GREEN : DASHBOARD_RED } };
  beCell.border = BORDER;
  ws.mergeCells(r, 3, r, 7);
  ws.getCell(r, 8).value = "Year 1"; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;

  r++;
  let cashRunwayMonths = 60;
  let runningCash = input.startingCash;
  for (let y = 0; y < 5; y++) {
    const monthlyNI = input.netIncomeByYear[y] / 12;
    for (let m = 0; m < 12; m++) {
      runningCash += monthlyNI;
      if (runningCash < 0) { cashRunwayMonths = y * 12 + m; break; }
    }
    if (runningCash < 0) break;
  }
  ws.getCell(r, 2).value = "Cash Runway"; bc(ws.getCell(r, 2));
  ws.getCell(r, 2).border = BORDER;
  const crCell = ws.getCell(r, 3);
  crCell.value = cashRunwayMonths >= 60 ? "60+ months" : `${cashRunwayMonths} months`;
  crCell.font = { ...BF, color: { argb: cashRunwayMonths >= 24 ? DASHBOARD_GREEN : cashRunwayMonths >= 12 ? DASHBOARD_AMBER : DASHBOARD_RED } };
  crCell.border = BORDER;
  ws.mergeCells(r, 3, r, 7);
  ws.getCell(r, 8).value = "60+ months"; ws.getCell(r, 8).font = { ...NF, italic: true, color: { argb: "FF6B7280" } }; ws.getCell(r, 8).border = BORDER;

  const y5Rev = input.revenueByYear[4] || 1;
  const y5Pers = input.personnelByYear[4];
  const y5TotalExp = totalExpByYear[4];
  const staffPct = y5Pers / y5Rev;

  const facilityCost = input.opexByYear[4] * 0.3;
  const facPct = facilityCost / y5Rev;

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

let _healthModule: { generateHealthSignals: (input: unknown) => Array<{ dimension: string; status: string; label: string; explanation: string; watchItem: string }> } | null = null;
async function importHealthModule() {
  if (!_healthModule) {
    const mod = await import("./financial-health.js");
    _healthModule = { generateHealthSignals: mod.generateHealthSignals as (input: unknown) => Array<{ dimension: string; status: string; label: string; explanation: string; watchItem: string }> };
  }
  return _healthModule!;
}
