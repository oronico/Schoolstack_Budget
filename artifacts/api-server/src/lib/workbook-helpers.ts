import ExcelJS from "exceljs";

export const NAVY = "FF1E293B";
export const WHITE = "FFFFFFFF";
export const LIGHT_GRAY = "FFE8EDF2";
export const GREEN_BG = "FFE8F5E9";
export const RED_BG = "FFFCE4EC";
export const YELLOW_INPUT = "FFFFFDE8";
export const AMBER_BG = "FFFFF8E1";
export const TEAL = "FF0D9488";
export const EVERGREEN = "FF328555";
export const CREAM = "FFFAF9F7";

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
    const rounded = Math.round(result * 100) / 100;
    return { formula, result: rounded === 0 ? "0" : rounded };
  }
  if (typeof result === "string") return { formula, result: result || "0" };
  return { formula, result: "0" };
}

export function setFormula(cell: ExcelJS.Cell, formula: string, result: unknown) {
  cell.value = safeFormulaValue(formula, result);
}

export function inputCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW_INPUT } };
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
    grants_contributions: "Grants & Contributions", philanthropy: "Philanthropy",
    other_revenue: "Other Revenue",
  };
  return map[cat] || cat;
}

export function expCatLabel(cat: string): string {
  const map: Record<string, string> = {
    instructional_program: "Instructional / Program", technology: "Technology",
    occupancy_facility: "Occupancy / Facility", administrative_general: "Administrative / General",
    capital_financing: "Capital / Financing", personnel: "Personnel",
  };
  return map[cat] || cat;
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
  revenue?: Record<string, unknown>;
  revenueRows?: RevenueRow[];
  staffing?: Record<string, unknown>;
  staffingRows?: StaffingRow[];
  facilities?: Record<string, unknown>;
  expenseRows?: ExpenseRow[];
  capitalAndDebtRows?: CapitalDebtRow[];
  priorYearSnapshot?: PriorYearSnapshot;
  currentYearProjection?: CurrentYearProjection;
  openingBalances?: OpeningBalances;
  sourcesAndUses?: SourcesAndUses;
  scenarios?: ScenarioDef[];
  covenantThresholds?: CovenantThresholds;
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
  r: RevenueRow, y: number, students: number, tiers?: TuitionTier[], costInflPct?: number
): number {
  if (!r.enabled) return 0;
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
  rows: RevenueRow[], y: number, students: number, tiers?: TuitionTier[], costInflPct?: number
): number {
  const vals = new Map<string, number>();
  for (const r of rows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    vals.set(r.id, computeRevLineItem(r, y, students, tiers, costInflPct));
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
