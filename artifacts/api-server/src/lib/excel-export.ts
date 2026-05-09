import ExcelJS from "exceljs";
import { computeAnnualDebt, computeFounderCompNormalization } from "@workspace/finance";
import type { DecisionEngineModelData } from "@workspace/finance";
type FullModelData = DecisionEngineModelData;
import { accountingBasisLabel, addDashboardSheet, computeFacilityCostByYear, computeInstructionalCostByYear, setFormula } from "./workbook-helpers.js";
import { addDecisionHistorySheet } from "./packets/build-decision-history.js";
import { lenderReadinessCoachingHeadline } from "./lender-readiness-coaching.js";

function safeResult(v: unknown): number | string {
  if (v === null || v === undefined) return "0";
  if (typeof v === "number") {
    if (isNaN(v) || !isFinite(v)) return "0";
    return v === 0 ? "0" : v;
  }
  if (typeof v === "string") return v || "0";
  return "0";
}

interface SchoolProfile {
  schoolName?: string;
  state?: string;
  schoolType?: string;
  schoolTypeOther?: string;
  entityType?: string;
  ein?: string;
  schoolStage?: string;
  // Task #703 — explicit founder pathway choice; drives the provenance
  // banner on the dashboard sheet (mirrors workbook-helpers SchoolProfile).
  wizardPathway?: "actuals" | "assumptions";
  openingYear?: number;
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
  accountingBasis?: string;
}

interface TuitionTier {
  id: string;
  tierType: string;
  label: string;
  discountPercent: number;
  studentCounts: number[];
}

function isNonprofit(entityType?: string): boolean {
  return entityType === "nonprofit_501c3";
}

function profitLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Income" : "Profit";
}

function cumulativeProfitLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Cumulative Net Income" : "Cumulative Profit";
}

function profitMarginLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Margin %" : "Profit Margin %";
}

function entityTypeDisplay(entityType?: string): string {
  switch (entityType) {
    case "sole_practitioner": return "Sole Practitioner";
    case "llc_single": return "LLC - Single Member";
    case "llc_partnership": return "LLC - Partnership";
    case "c_corp": return "C Corporation";
    case "s_corp": return "S Corporation";
    case "nonprofit_501c3": return "501(c)(3) Nonprofit";
    case "undetermined": return "Undetermined";
    default: return entityType || "";
  }
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
  note?: string;
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
}

interface ExpenseRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
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

interface PriorYearSnapshot {
  endingEnrollment?: number;
  totalRevenue?: number;
  totalExpenses?: number;
  endingCash?: number;
}

interface ConsultantSummary {
  executiveSummary?: string;
  lenderReadiness?: string;
  lenderReadinessExplanation?: string;
  biggestStrength?: string;
  biggestRisk?: string;
  recommendations?: Array<{ title: string; description: string; priority: string }>;
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
  customCategoryLabels?: Record<string, string>;
  capitalAndDebtRows?: CapitalDebtRow[];
  priorYearSnapshot?: PriorYearSnapshot;
  currentYearProjection?: { currentCash?: number };
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E293B" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
  name: "Calibri",
};
const SECTION_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EDF2" },
};
const SECTION_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 11,
  color: { argb: "FF1E293B" },
  name: "Calibri",
};
const NORMAL_FONT: Partial<ExcelJS.Font> = { size: 11, name: "Calibri" };
const BOLD_FONT: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true };
const INPUT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
const INPUT_FONT: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, color: { argb: "FF1E3A5F" } };
const INPUT_BORDER: Partial<ExcelJS.Borders> = { bottom: { style: "thin", color: { argb: "FF93C5FD" } } };
const CALC_FONT: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, color: { argb: "FF1E293B" } };

function applyInput(cell: ExcelJS.Cell) {
  cell.fill = INPUT_FILL;
  cell.font = INPUT_FONT;
  cell.border = INPUT_BORDER;
}
function applyCalc(cell: ExcelJS.Cell) {
  cell.font = CALC_FONT;
}
const CURRENCY_FORMAT = '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"??_);_(@_)';
const PERCENT_FORMAT = '0.0%;[Red](0.0%);"-"';
const NUMBER_FORMAT = '#,##0;#,##0;"-"';
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD0D0D0" } },
  bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};
const GREEN_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
const AMBER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E1" } };
const RED_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4EC" } };
const NAVY = "FF1E293B";
const AMBER_FONT: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true, color: { argb: "FFD97706" } };
const GREEN_FONT: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true, color: { argb: "FF16A34A" } };
const RED_FONT_COLOR: Partial<ExcelJS.Font> = { size: 11, name: "Calibri", bold: true, color: { argb: "FFDC2626" } };
const SUBTOTAL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF1E293B" } },
  bottom: { style: "double", color: { argb: "FF1E293B" } },
  left: { style: "thin", color: { argb: "FFD0D0D0" } },
  right: { style: "thin", color: { argb: "FFD0D0D0" } },
};

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function styleHeaderRow(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = THIN_BORDER;
  }
  ws.getRow(row).height = 28;
}

function styleSectionRow(ws: ExcelJS.Worksheet, row: number, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill = SECTION_FILL;
    cell.font = SECTION_FONT;
    cell.border = THIN_BORDER;
  }
  ws.getRow(row).height = 24;
}

function styleDataCell(cell: ExcelJS.Cell) {
  cell.font = NORMAL_FONT;
  cell.border = THIN_BORDER;
}

function styleBoldDataCell(cell: ExcelJS.Cell) {
  cell.font = BOLD_FONT;
  cell.border = THIN_BORDER;
}

function styleGrandTotalCell(cell: ExcelJS.Cell) {
  cell.font = BOLD_FONT;
  cell.border = SUBTOTAL_BORDER;
}

function applyHealthFill(cell: ExcelJS.Cell, value: number, thresholds: { green: number; amber: number }, higherIsBetter = true) {
  if (higherIsBetter) {
    if (value >= thresholds.green) { cell.fill = GREEN_FILL; cell.font = GREEN_FONT; }
    else if (value >= thresholds.amber) { cell.fill = AMBER_FILL; cell.font = AMBER_FONT; }
    else { cell.fill = RED_FILL; cell.font = RED_FONT_COLOR; }
  } else {
    if (value <= thresholds.green) { cell.fill = GREEN_FILL; cell.font = GREEN_FONT; }
    else if (value <= thresholds.amber) { cell.fill = AMBER_FILL; cell.font = AMBER_FONT; }
    else { cell.fill = RED_FILL; cell.font = RED_FONT_COLOR; }
  }
}

function setPrintArea(ws: ExcelJS.Worksheet, lastRow: number, lastCol: number) {
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
    oddFooter: "&L&8SchoolStack Budget&C&8Page &P of &N&R&8&D",
  };
}

function setSheetOrder(ws: ExcelJS.Worksheet, order: number) {
  Object.defineProperty(ws, "orderNo", { value: order, writable: true, configurable: true });
}

function polishWorkbook(wb: ExcelJS.Workbook, schoolName?: string) {
  const coverNames = new Set(["Cover"]);
  const name = schoolName || "School";

  for (const ws of wb.worksheets) {
    if (!coverNames.has(ws.name)) {
      ws.views = [{ state: "frozen" as const, xSplit: 1, ySplit: 1, topLeftCell: "B2", activeCell: "B2" }];
    }

    if (ws.name !== "Cover") {
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

  const cover = wb.worksheets.find(s => coverNames.has(s.name));
  if (cover) {
    setSheetOrder(cover, 1);
    let idx = 2;
    for (const ws of wb.worksheets) {
      if (!coverNames.has(ws.name)) { setSheetOrder(ws, idx++); }
    }
  }
}

function buildCoverSheet(
  wb: ExcelJS.Workbook,
  sp: SchoolProfile,
  yearCount: number,
  precomputed?: PrecomputedFinancials,
  consultantData?: ConsultantSummary,
  enrollment?: number[],
) {
  const ws = wb.addWorksheet("Cover");
  ws.columns = [{ width: 5 }, { width: 35 }, { width: 30 }, { width: 5 }];

  ws.getRow(1).height = 20;
  ws.getRow(2).height = 10;

  let r = 3;
  ws.getCell(r, 2).value = "SchoolStack Budget";
  ws.getCell(r, 2).font = { bold: true, size: 24, color: { argb: NAVY }, name: "Calibri" };
  ws.mergeCells(r, 2, r, 3);
  ws.getRow(r).height = 40;

  r++;
  const titleLine = `${yearCount}-Year Financial Model`;
  ws.getCell(r, 2).value = titleLine;
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
  if (sp.schoolType) details.push(schoolTypeDisplay(sp.schoolType, sp.schoolTypeOther));
  if (sp.entityType) details.push(entityTypeDisplay(sp.entityType));
  if (sp.accountingBasis) details.push(accountingBasisLabel(sp.accountingBasis));
  if (sp.state) details.push(sp.state);
  ws.getCell(r, 2).value = details.join("  •  ");
  ws.getCell(r, 2).font = { size: 11, color: { argb: "FF64748B" }, name: "Calibri" };
  ws.mergeCells(r, 2, r, 3);

  r += 2;
  ws.getCell(r, 2).value = "Date Prepared";
  ws.getCell(r, 2).font = { size: 11, color: { argb: "FF94A3B8" }, name: "Calibri" };
  ws.getCell(r, 3).value = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  ws.getCell(r, 3).font = { bold: true, size: 11, color: { argb: NAVY }, name: "Calibri" };

  if (precomputed) {
    r += 3;
    for (let c = 2; c <= 3; c++) {
      ws.getCell(r, c).fill = SECTION_FILL;
      ws.getCell(r, c).font = SECTION_FONT;
      ws.getCell(r, c).border = THIN_BORDER;
    }
    ws.getCell(r, 2).value = "KEY HIGHLIGHTS";
    ws.getRow(r).height = 24;

    const lastYear = yearCount - 1;
    const finalRev = precomputed.totalRevenue[lastYear] ?? 0;
    const finalNI = precomputed.netIncome[lastYear] ?? 0;
    const finalMargin = finalRev > 0 ? finalNI / finalRev : 0;
    const finalReserve = (precomputed.totalAllExpenses[lastYear] ?? 0) > 0
      ? ((precomputed.cumulativeNI[lastYear] ?? 0) > 0 ? (precomputed.cumulativeNI[lastYear] ?? 0) / ((precomputed.totalAllExpenses[lastYear] ?? 0) / 12) : 0)
      : 0;

    const finalEnrollment = enrollment ? (enrollment[lastYear] ?? 0) : 0;
    const highlights: [string, number | string, string][] = [
      [`Year ${yearCount} Revenue`, finalRev, CURRENCY_FORMAT],
      [`Year ${yearCount} Net Income`, finalNI, CURRENCY_FORMAT],
      [`Year ${yearCount} Net Margin`, finalMargin, PERCENT_FORMAT],
      ["Operating Reserve (Months)", finalReserve, "0.0"],
      [`Year ${yearCount} Enrollment`, finalEnrollment, "#,##0"],
    ];

    for (const [label, value, fmt] of highlights) {
      r++;
      ws.getCell(r, 2).value = label;
      ws.getCell(r, 2).font = NORMAL_FONT;
      ws.getCell(r, 2).border = THIN_BORDER;
      ws.getCell(r, 3).value = value;
      ws.getCell(r, 3).font = BOLD_FONT;
      ws.getCell(r, 3).numFmt = fmt;
      ws.getCell(r, 3).border = THIN_BORDER;
      if (typeof value === "number") {
        if (fmt === CURRENCY_FORMAT && label.includes("Net Income")) {
          applyHealthFill(ws.getCell(r, 3), value, { green: 0, amber: -50000 });
        }
        if (fmt === PERCENT_FORMAT) {
          applyHealthFill(ws.getCell(r, 3), value, { green: 0.05, amber: 0 });
        }
        if (fmt === "0.0") {
          applyHealthFill(ws.getCell(r, 3), value, { green: 3, amber: 2 });
        }
      }
    }
  }

  if (consultantData?.lenderReadiness) {
    r += 2;
    ws.getCell(r, 2).value = "Lender Readiness";
    ws.getCell(r, 2).font = { size: 11, color: { argb: "FF94A3B8" }, name: "Calibri" };
    ws.getCell(r, 3).value = lenderReadinessCoachingHeadline(consultantData.lenderReadiness);
    const readinessColor = consultantData.lenderReadiness === "Strong" ? "FF16A34A"
      : consultantData.lenderReadiness === "Needs Work" ? "FFD97706" : "FFDC2626";
    ws.getCell(r, 3).font = { bold: true, size: 14, name: "Calibri", color: { argb: readinessColor } };
  }

  r += 3;
  for (let c = 2; c <= 3; c++) {
    ws.getCell(r, c).fill = SECTION_FILL;
    ws.getCell(r, c).font = SECTION_FONT;
    ws.getCell(r, c).border = THIN_BORDER;
  }
  ws.getCell(r, 2).value = "TABLE OF CONTENTS";
  ws.getRow(r).height = 24;

  const sheets = wb.worksheets.filter(s => s.name !== "Cover");
  for (const sheet of sheets) {
    r++;
    ws.getCell(r, 2).value = { text: sheet.name, hyperlink: `#'${sheet.name}'!A1` };
    ws.getCell(r, 2).font = { size: 11, name: "Calibri", color: { argb: "FF2563EB" }, underline: true };
    ws.getCell(r, 2).border = THIN_BORDER;
    ws.getCell(r, 3).border = THIN_BORDER;
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

function computeRevenueMixForExport(
  rows: RevenueRow[],
  enrollment: number[],
  yearCount: number,
  tuitionTiers?: TuitionTier[],
): { tuitionPct: number[]; publicPct: number[]; philanthropyPct: number[] } {
  const tuitionPct: number[] = [];
  const publicPct: number[] = [];
  const philanthropyPct: number[] = [];

  for (let y = 0; y < yearCount; y++) {
    const students = enrollment[y] || 0;
    const rowValues = new Map<string, number>();

    for (const row of rows) {
      if (!row.enabled || row.driverType === "percent_of_base") continue;
      if (row.id === "gross_tuition" && row.driverType === "per_student" && tuitionTiers && tuitionTiers.length > 0) {
        const perStudentAmount = row.amounts?.[y] ?? 0;
        rowValues.set(row.id, computeTuitionWithTiersForMix(perStudentAmount, y, students, tuitionTiers));
      } else {
        rowValues.set(row.id, computeDriverValueExport(row.amounts, y, row.driverType, students));
      }
    }
    for (const row of rows) {
      if (!row.enabled || row.driverType !== "percent_of_base") continue;
      const baseVal = rowValues.get(row.percentBase || "") || 0;
      const pctVal = (row.amounts?.[y] ?? 0) / 100;
      rowValues.set(row.id, baseVal * pctVal);
    }

    let tuition = 0, publicFund = 0, philanthropy = 0;
    for (const row of rows) {
      if (!row.enabled) continue;
      const val = rowValues.get(row.id) || 0;
      switch (row.category) {
        case "tuition_and_fees": case "other_revenue": tuition += val; break;
        case "tuition_offsets": tuition -= val; break;
        case "public_funding": case "school_choice": publicFund += val; break;
        case "grants_contributions": case "philanthropy": philanthropy += val; break;
      }
    }

    const total = tuition + publicFund + philanthropy;
    tuitionPct.push(total > 0 ? tuition / total : 0);
    publicPct.push(total > 0 ? publicFund / total : 0);
    philanthropyPct.push(total > 0 ? philanthropy / total : 0);
  }

  return { tuitionPct, publicPct, philanthropyPct };
}

function computeTuitionWithTiersForMix(
  grossPerStudent: number,
  yearIdx: number,
  totalStudents: number,
  tuitionTiers: TuitionTier[],
): number {
  let rawTierTotal = 0;
  for (const tier of tuitionTiers) {
    rawTierTotal += tier.studentCounts?.[yearIdx] ?? 0;
  }
  if (rawTierTotal === 0) return grossPerStudent * totalStudents;

  const scaleFactor = rawTierTotal > totalStudents ? totalStudents / rawTierTotal : 1;
  let total = 0;
  let allocated = 0;
  for (const tier of tuitionTiers) {
    const scaled = (tier.studentCounts?.[yearIdx] ?? 0) * scaleFactor;
    allocated += scaled;
    total += scaled * grossPerStudent * (1 - (tier.discountPercent || 0) / 100);
  }
  const remaining = totalStudents - allocated;
  if (remaining > 0) total += remaining * grossPerStudent;
  return total;
}

function computeDriverValueExport(amounts: number[] | undefined, yearIdx: number, driverType: string, students: number): number {
  const base = amounts?.[yearIdx] ?? 0;
  switch (driverType) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "annual_fixed": return base;
    default: return base;
  }
}

function schoolTypeDisplay(type?: string, otherLabel?: string): string {
  switch (type) {
    case "charter_school": return "Charter School";
    case "homeschool_coop": return "Homeschool Co-Op";
    case "learning_pod": return "Learning Pod";
    case "microschool": return "Microschool";
    case "private_school": return "Private School";
    case "tutoring_center": return "Tutoring Center";
    case "other": return otherLabel || "Other";
    default: return type || "";
  }
}

function c(row: number, col: number): string {
  return `${String.fromCharCode(64 + col)}${row}`;
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

const computeAnnualDebtService = computeAnnualDebt;

function driverLabel(dt: string): string {
  switch (dt) {
    case "annual_fixed": return "Annual";
    case "monthly": return "Monthly";
    case "per_student": return "Per Student";
    case "percent_of_base": return "% of Base";
    case "percent_of_revenue": return "% of Revenue";
    default: return dt;
  }
}

function funcCategoryLabel(fc: string): string {
  switch (fc) {
    case "instructional": return "Instructional";
    case "school_leadership": return "School Leadership";
    case "student_support": return "Student Support";
    case "operations": return "Operations";
    case "administrative": return "Administrative";
    case "other": return "Other";
    default: return fc;
  }
}

function empTypeLabel(et: string): string {
  switch (et) {
    case "full_time": return "Full-Time";
    case "part_time": return "Part-Time";
    case "contract": return "Contract";
    default: return et;
  }
}

const REVENUE_CATEGORY_LABELS: Record<string, string> = {
  tuition_and_fees: "TUITION & STUDENT FEES",
  tuition_offsets: "TUITION OFFSETS",
  public_funding: "PUBLIC FUNDING",
  school_choice: "SCHOOL CHOICE / CHOICE FUNDING",
  grants_contributions: "PHILANTHROPY",
  philanthropy: "PHILANTHROPY",
  other_revenue: "OTHER REVENUE",
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  instructional_program: "INSTRUCTIONAL / PROGRAM",
  technology: "TECHNOLOGY",
  occupancy_facility: "OCCUPANCY / FACILITY",
  administrative_general: "ADMINISTRATIVE / GENERAL",
};

interface PrecomputedFinancials {
  revenueByRow: Map<string, number[]>;
  revenueCategoryTotals: Map<string, number[]>;
  totalRevenue: number[];
  totalPersonnel: number[];
  totalExpenses: number[];
  totalCapDebt: number[];
  totalAllExpenses: number[];
  netIncome: number[];
  cumulativeNI: number[];
  managementFee: number[];
}

function precomputeFinancials(
  revenueRows: RevenueRow[],
  staffingRows: StaffingRow[],
  expenseRows: ExpenseRow[],
  capDebtRows: CapitalDebtRow[],
  enrollment: number[],
  yearCount: number,
  salaryEscRate: number,
  prorationFactor: number,
  tuitionTiers?: TuitionTier[],
): PrecomputedFinancials {
  const revenueByRow = new Map<string, number[]>();
  const revenueCategoryTotals = new Map<string, number[]>();
  const totalRevenue: number[] = [];
  const totalPersonnel: number[] = [];
  const totalExpenses: number[] = [];
  const totalCapDebt: number[] = [];
  const totalAllExpenses: number[] = [];
  const netIncome: number[] = [];
  const cumulativeNI: number[] = [];
  const managementFee: number[] = [];

  for (let y = 0; y < yearCount; y++) {
    const students = enrollment[y] || 0;
    const pf = y === 0 ? prorationFactor : 1;

    const rowValues = new Map<string, number>();
    for (const row of revenueRows) {
      if (!row.enabled || row.driverType === "percent_of_base") continue;
      if (row.id === "gross_tuition" && row.driverType === "per_student" && tuitionTiers && tuitionTiers.length > 0) {
        rowValues.set(row.id, computeTuitionWithTiersExport(row.amounts?.[y] ?? 0, y, students, tuitionTiers));
      } else {
        rowValues.set(row.id, computeDriverValue(row.amounts, y, row.driverType, students));
      }
    }
    for (const row of revenueRows) {
      if (!row.enabled || row.driverType !== "percent_of_base") continue;
      const baseVal = rowValues.get(row.percentBase || "") || 0;
      rowValues.set(row.id, baseVal * ((row.amounts?.[y] ?? 0) / 100));
    }

    let yearTotalRev = 0;
    for (const row of revenueRows) {
      if (!row.enabled) continue;
      let val = rowValues.get(row.id) || 0;
      if (row.category === "tuition_offsets") val = -Math.abs(val);
      if (!revenueByRow.has(row.id)) revenueByRow.set(row.id, []);
      revenueByRow.get(row.id)!.push(val);
      yearTotalRev += val;

      const catKey = row.category;
      if (!revenueCategoryTotals.has(catKey)) revenueCategoryTotals.set(catKey, new Array(yearCount).fill(0));
      revenueCategoryTotals.get(catKey)![y] += val;
    }

    let grandTotalBase = 0;
    for (const row of staffingRows) {
      const annual = row.fte * row.annualizedRate;
      const isContractNoPL = row.employmentType === "contract" && !row.payrollLike;
      let benefits = 0, tax = 0;
      if (!isContractNoPL) {
        if (row.benefitsEligible) benefits = annual * (row.benefitsRate / 100);
        tax = annual * (row.payrollTaxRate / 100);
      }
      grandTotalBase += annual + benefits + tax;
    }
    const personnelEsc = Math.pow(1 + salaryEscRate, y);
    const yearPersonnel = Math.round(grandTotalBase * personnelEsc * pf);

    let yearExpenses = 0;
    let yearMgmtFee = 0;
    for (const row of expenseRows) {
      if (!row.enabled) continue;
      let val = 0;
      if (row.driverType === "percent_of_revenue") {
        val = ((row.amounts?.[y] ?? 0) / 100) * yearTotalRev;
      } else {
        val = computeDriverValue(row.amounts, y, row.driverType, students);
      }
      if (row.id === "authorizer_fee") {
        yearMgmtFee = val;
      }
      yearExpenses += val;
    }
    yearExpenses = Math.round(yearExpenses);

    let yearCapDebt = 0;
    for (const row of capDebtRows) {
      if (!row.enabled) continue;
      if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
        yearCapDebt += computeAnnualDebtService(row.loanPrincipal, (row.loanRate || 0) / 100, row.loanTermYears || 0);
      } else {
        yearCapDebt += computeDriverValue(row.amounts, y, row.driverType, students);
      }
    }
    yearCapDebt = Math.round(yearCapDebt);

    const yearRevRounded = Math.round(yearTotalRev);
    const yearAllExp = yearPersonnel + yearExpenses + yearCapDebt;
    const yearNI = yearRevRounded - yearAllExp;

    totalRevenue.push(yearRevRounded);
    totalPersonnel.push(yearPersonnel);
    totalExpenses.push(yearExpenses);
    totalCapDebt.push(yearCapDebt);
    totalAllExpenses.push(yearAllExp);
    netIncome.push(yearNI);
    cumulativeNI.push((cumulativeNI[y - 1] || 0) + yearNI);
    managementFee.push(Math.round(yearMgmtFee));
  }

  return { revenueByRow, revenueCategoryTotals, totalRevenue, totalPersonnel, totalExpenses, totalCapDebt, totalAllExpenses, netIncome, cumulativeNI, managementFee };
}

// Task #739 — Single-year ("1-Year Operating Budget") workbooks need a
// month-by-month cash flow view tied to the annual P&L on the Financial
// Model sheet. Spreads precomputed annual totals across 12 fiscal-year
// months (default Jul–Jun, overridable via schoolProfile.fiscalYearStartMonth).
//   - Revenue & operating expenses: spread evenly across `opMonths`
//     (year1OperatingMonths when isPartialFirstYear, else 12).
//   - Personnel: spread evenly across `opMonths` (no payroll outside
//     operating window).
//   - Capital & debt service: spread evenly across all 12 months
//     (lenders bill year-round even before the school opens).
// Each per-stream Annual Total cell uses a direct formula reference back
// to the matching Financial Model row so the sheet can never drift from
// the P&L. Includes a trough-month callout and an Ending Cash highlight.
function buildMonthlyCashFlowTab(
  ws: ExcelJS.Worksheet,
  sp: SchoolProfile,
  precomputed: PrecomputedFinancials,
  expenseRows: ExpenseRow[],
  enrollment: number[],
  startingCash: number,
  fmRows: { revenueRow: number; staffRow: number; expenseRow: number; mgmtFeeRow: number | null; capDebtRow: number; totalExpRow: number; netIncomeRow: number },
): void {
  const fyStart = sp.fiscalYearStartMonth || 7;
  const isPartial = sp.isPartialFirstYear || false;
  const opMonths = isPartial ? Math.max(1, Math.min(12, sp.year1OperatingMonths || 10)) : 12;
  const students = enrollment[0] || 0;

  ws.columns = [{ width: 32 }, ...Array(12).fill({ width: 14 }), { width: 16 }];

  const monthHeaders: string[] = [""];
  for (let i = 0; i < 12; i++) {
    const mIdx = ((fyStart - 1 + i) % 12) + 1;
    monthHeaders.push(MONTH_NAMES[mIdx]);
  }
  monthHeaders.push("Annual Total");

  // Title
  let r = 1;
  ws.mergeCells(r, 1, r, 14);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} — Year 1 Monthly Cash Flow`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };
  ws.getRow(r).height = 26;

  // Header row
  r++;
  ws.getRow(r).values = monthHeaders;
  styleHeaderRow(ws, r, 14);

  // Helper: write an evenly-spread row whose Annual Total ties back to a
  // specific Financial Model cell.
  function writeSpreadRow(label: string, annualTotal: number, monthsActive: number, fmFormula?: string, bold = false): { row: number; monthlyVals: number[] } {
    r++;
    ws.getCell(r, 1).value = label;
    if (bold) styleBoldDataCell(ws.getCell(r, 1)); else styleDataCell(ws.getCell(r, 1));
    const monthlyVals: number[] = new Array(12).fill(0);
    if (monthsActive > 0 && annualTotal !== 0) {
      const baseMonthly = Math.round(annualTotal / monthsActive);
      let allocated = 0;
      for (let m = 0; m < monthsActive; m++) {
        // Last active month absorbs the rounding residual so monthly
        // sum equals the annual total exactly (lender QA tolerates ±1
        // but parity is cheap to maintain here).
        const v = m === monthsActive - 1 ? annualTotal - allocated : baseMonthly;
        allocated += v;
        monthlyVals[m] = v;
      }
    }
    for (let m = 0; m < 12; m++) {
      const cell = ws.getCell(r, m + 2);
      cell.value = monthlyVals[m];
      cell.numFmt = CURRENCY_FORMAT;
      if (bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }
    const totalCell = ws.getCell(r, 14);
    if (fmFormula) {
      setFormula(totalCell, fmFormula, annualTotal);
    } else {
      setFormula(totalCell, `SUM(${c(r, 2)}:${c(r, 13)})`, annualTotal);
    }
    totalCell.numFmt = CURRENCY_FORMAT;
    if (bold) styleBoldDataCell(totalCell); else styleDataCell(totalCell);
    return { row: r, monthlyVals };
  }

  // ── Opening cash ──
  r++;
  styleSectionRow(ws, r, 14);
  ws.getCell(r, 1).value = "OPENING CASH";

  r++;
  ws.getCell(r, 1).value = "Opening Cash Balance";
  styleDataCell(ws.getCell(r, 1));
  const openCashCell = ws.getCell(r, 2);
  openCashCell.value = Math.round(startingCash);
  openCashCell.numFmt = CURRENCY_FORMAT;
  styleBoldDataCell(openCashCell);
  const openCashRow = r;

  // ── Cash inflows by source ──
  r++;
  styleSectionRow(ws, r, 14);
  ws.getCell(r, 1).value = "CASH INFLOWS BY SOURCE";

  const inflowRowNumbers: number[] = [];
  // Iterate revenue categories in a stable, lender-friendly order.
  const REV_CAT_ORDER = ["tuition_and_fees", "tuition_offsets", "school_choice", "public_funding", "philanthropy", "grants_contributions", "other_revenue"];
  const seenRevCats = new Set<string>();
  for (const cat of REV_CAT_ORDER) {
    const totals = precomputed.revenueCategoryTotals.get(cat);
    if (!totals) continue;
    seenRevCats.add(cat);
    const annual = Math.round(totals[0] ?? 0);
    if (annual === 0) continue;
    const label = REVENUE_CATEGORY_LABELS[cat] ?? cat;
    const out = writeSpreadRow(toTitleCase(label), annual, opMonths);
    inflowRowNumbers.push(out.row);
  }
  // Catch any category not in the canonical order list.
  for (const [cat, totals] of precomputed.revenueCategoryTotals.entries()) {
    if (seenRevCats.has(cat)) continue;
    const annual = Math.round(totals[0] ?? 0);
    if (annual === 0) continue;
    const label = REVENUE_CATEGORY_LABELS[cat] ?? cat;
    const out = writeSpreadRow(toTitleCase(label), annual, opMonths);
    inflowRowNumbers.push(out.row);
  }

  // Total inflows row.
  r++;
  ws.getCell(r, 1).value = "Total Cash Inflows";
  styleBoldDataCell(ws.getCell(r, 1));
  const totalInflowRow = r;
  for (let m = 0; m < 12; m++) {
    const col = m + 2;
    const cell = ws.getCell(r, col);
    let monthly = 0;
    for (const ir of inflowRowNumbers) {
      const v = ws.getCell(ir, col).value;
      if (typeof v === "number") monthly += v;
    }
    if (inflowRowNumbers.length > 0) {
      const sumExpr = inflowRowNumbers.map(ir => c(ir, col)).join("+");
      setFormula(cell, sumExpr, monthly);
    } else {
      cell.value = 0;
    }
    cell.numFmt = CURRENCY_FORMAT;
    styleBoldDataCell(cell);
  }
  // Annual total ties to Financial Model revenue row.
  setFormula(ws.getCell(r, 14), `'Financial Model'!B${fmRows.revenueRow}`, precomputed.totalRevenue[0] ?? 0);
  ws.getCell(r, 14).numFmt = CURRENCY_FORMAT;
  styleBoldDataCell(ws.getCell(r, 14));

  // ── Cash outflows by category ──
  r++;
  styleSectionRow(ws, r, 14);
  ws.getCell(r, 1).value = "CASH OUTFLOWS BY CATEGORY";

  const outflowRowNumbers: number[] = [];

  // Personnel (single line). Annual Total ties to FM staffing row.
  const persOut = writeSpreadRow(
    "Personnel",
    precomputed.totalPersonnel[0] ?? 0,
    opMonths,
    `'Financial Model'!B${fmRows.staffRow}`,
  );
  outflowRowNumbers.push(persOut.row);

  // Operating expenses by category. Recompute year-0 totals per category
  // mirroring precomputeFinancials so the breakdown sums (with the
  // last-month residual absorption) back to the FM operating-expense
  // total.
  const expCatTotals = new Map<string, number>();
  const yearTotalRev = precomputed.totalRevenue[0] ?? 0;
  for (const row of expenseRows) {
    if (!row.enabled) continue;
    // The management fee (authorizer_fee row) gets its own dedicated
    // outflow line below when hasManagementFee is true — exclude it
    // here to avoid double-counting in the category breakdown.
    if (fmRows.mgmtFeeRow !== null && row.id === "authorizer_fee") continue;
    let val = 0;
    if (row.driverType === "percent_of_revenue") {
      val = ((row.amounts?.[0] ?? 0) / 100) * yearTotalRev;
    } else {
      val = computeDriverValue(row.amounts, 0, row.driverType, students);
    }
    const catKey = row.category || "other";
    expCatTotals.set(catKey, (expCatTotals.get(catKey) ?? 0) + val);
  }
  const EXP_CAT_ORDER = ["occupancy_facility", "instructional_program", "technology", "administrative_general"];
  const seenExpCats = new Set<string>();
  for (const cat of EXP_CAT_ORDER) {
    if (!expCatTotals.has(cat)) continue;
    seenExpCats.add(cat);
    const annual = Math.round(expCatTotals.get(cat) ?? 0);
    if (annual === 0) continue;
    const label = EXPENSE_CATEGORY_LABELS[cat] ?? cat;
    const out = writeSpreadRow(toTitleCase(label), annual, opMonths);
    outflowRowNumbers.push(out.row);
  }
  for (const [cat, val] of expCatTotals.entries()) {
    if (seenExpCats.has(cat)) continue;
    const annual = Math.round(val);
    if (annual === 0) continue;
    const label = EXPENSE_CATEGORY_LABELS[cat] ?? cat;
    const out = writeSpreadRow(toTitleCase(label), annual, opMonths);
    outflowRowNumbers.push(out.row);
  }

  // Management fee (when present) — spread across the operating window.
  // The Financial Model lists management fee on its own row between Opex
  // and Capital & Debt, so we spread it the same way as opex to keep the
  // monthly shape realistic.
  if (fmRows.mgmtFeeRow !== null) {
    const mgmtFeeAnnual = Math.round(precomputed.managementFee[0] ?? 0);
    if (mgmtFeeAnnual !== 0) {
      const mfOut = writeSpreadRow(
        "Management Fee",
        mgmtFeeAnnual,
        opMonths,
        `'Financial Model'!B${fmRows.mgmtFeeRow}`,
      );
      outflowRowNumbers.push(mfOut.row);
    }
  }

  // Capital & debt service spread across all 12 months.
  const capDebtAnnual = precomputed.totalCapDebt[0] ?? 0;
  if (capDebtAnnual !== 0) {
    const cdOut = writeSpreadRow(
      "Capital & Debt Service",
      capDebtAnnual,
      12,
      `'Financial Model'!B${fmRows.capDebtRow}`,
    );
    outflowRowNumbers.push(cdOut.row);
  }

  // Total outflows row.
  r++;
  ws.getCell(r, 1).value = "Total Cash Outflows";
  styleBoldDataCell(ws.getCell(r, 1));
  const totalOutflowRow = r;
  for (let m = 0; m < 12; m++) {
    const col = m + 2;
    const cell = ws.getCell(r, col);
    let monthly = 0;
    for (const or of outflowRowNumbers) {
      const v = ws.getCell(or, col).value;
      if (typeof v === "number") monthly += v;
    }
    if (outflowRowNumbers.length > 0) {
      const sumExpr = outflowRowNumbers.map(or => c(or, col)).join("+");
      setFormula(cell, sumExpr, monthly);
    } else {
      cell.value = 0;
    }
    cell.numFmt = CURRENCY_FORMAT;
    styleBoldDataCell(cell);
  }
  // Tie annual outflow total directly to the Financial Model "Total
  // Expenses" row. That row already includes Personnel + Opex +
  // Management Fee (when present) + Capital & Debt, so a single
  // reference is robust to row-shifting from optional sections.
  const totalOutflowAnnual =
    (precomputed.totalPersonnel[0] ?? 0)
    + (precomputed.totalExpenses[0] ?? 0)
    + (precomputed.totalCapDebt[0] ?? 0);
  setFormula(
    ws.getCell(r, 14),
    `'Financial Model'!B${fmRows.totalExpRow}`,
    totalOutflowAnnual,
  );
  ws.getCell(r, 14).numFmt = CURRENCY_FORMAT;
  styleBoldDataCell(ws.getCell(r, 14));

  // ── Net change & ending cash ──
  r++;
  styleSectionRow(ws, r, 14);
  ws.getCell(r, 1).value = "NET CHANGE IN CASH";

  r++;
  ws.getCell(r, 1).value = "Net Cash Flow (Inflows − Outflows)";
  styleBoldDataCell(ws.getCell(r, 1));
  const netCfRow = r;
  const netCfMonthly: number[] = new Array(12).fill(0);
  for (let m = 0; m < 12; m++) {
    const col = m + 2;
    const inV = ws.getCell(totalInflowRow, col).value;
    const outV = ws.getCell(totalOutflowRow, col).value;
    const inN = typeof inV === "number" ? inV : (inV && typeof inV === "object" && "result" in inV && typeof (inV as { result: unknown }).result === "number" ? (inV as { result: number }).result : 0);
    const outN = typeof outV === "number" ? outV : (outV && typeof outV === "object" && "result" in outV && typeof (outV as { result: unknown }).result === "number" ? (outV as { result: number }).result : 0);
    netCfMonthly[m] = inN - outN;
    setFormula(ws.getCell(r, col), `${c(totalInflowRow, col)}-${c(totalOutflowRow, col)}`, netCfMonthly[m]);
    ws.getCell(r, col).numFmt = CURRENCY_FORMAT;
    styleBoldDataCell(ws.getCell(r, col));
  }
  setFormula(
    ws.getCell(r, 14),
    `'Financial Model'!B${fmRows.netIncomeRow}`,
    precomputed.netIncome[0] ?? 0,
  );
  ws.getCell(r, 14).numFmt = CURRENCY_FORMAT;
  styleBoldDataCell(ws.getCell(r, 14));

  r++;
  ws.getCell(r, 1).value = "Ending Cash Balance";
  styleBoldDataCell(ws.getCell(r, 1));
  const endingCashRow = r;
  const endingMonthly: number[] = new Array(12).fill(0);
  let running = startingCash;
  for (let m = 0; m < 12; m++) {
    const col = m + 2;
    running = running + netCfMonthly[m];
    endingMonthly[m] = running;
    if (m === 0) {
      setFormula(ws.getCell(r, col), `${c(openCashRow, 2)}+${c(netCfRow, col)}`, Math.round(running));
    } else {
      setFormula(ws.getCell(r, col), `${c(endingCashRow, col - 1)}+${c(netCfRow, col)}`, Math.round(running));
    }
    ws.getCell(r, col).numFmt = CURRENCY_FORMAT;
    styleBoldDataCell(ws.getCell(r, col));
  }
  setFormula(ws.getCell(r, 14), `${c(endingCashRow, 13)}`, Math.round(endingMonthly[11]));
  ws.getCell(r, 14).numFmt = CURRENCY_FORMAT;
  styleBoldDataCell(ws.getCell(r, 14));
  // Highlight Year 1 ending cash (red if negative, amber if thin, green if healthy).
  applyHealthFill(ws.getCell(r, 14), endingMonthly[11], { green: Math.max(startingCash * 0.25, 1), amber: 0 });

  // ── Trough callout ──
  r += 2;
  const minCash = Math.min(...endingMonthly);
  const minIdx = endingMonthly.indexOf(minCash);
  const minMonthLabel = MONTH_NAMES[((fyStart - 1 + minIdx) % 12) + 1];

  ws.getCell(r, 1).value = "Cash Trough Month";
  styleDataCell(ws.getCell(r, 1));
  ws.getCell(r, 2).value = `${minMonthLabel} (Month ${minIdx + 1})`;
  ws.getCell(r, 2).font = BOLD_FONT;
  ws.getCell(r, 2).border = THIN_BORDER;
  ws.mergeCells(r, 2, r, 4);

  r++;
  ws.getCell(r, 1).value = "Trough Cash Balance";
  styleDataCell(ws.getCell(r, 1));
  setFormula(ws.getCell(r, 2), `MIN(${c(endingCashRow, 2)}:${c(endingCashRow, 13)})`, Math.round(minCash));
  ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  styleBoldDataCell(ws.getCell(r, 2));
  applyHealthFill(ws.getCell(r, 2), minCash, { green: Math.max(startingCash * 0.25, 1), amber: 0 });

  r++;
  ws.getCell(r, 1).value = "Year 1 Ending Cash";
  styleDataCell(ws.getCell(r, 1));
  setFormula(ws.getCell(r, 2), `${c(endingCashRow, 13)}`, Math.round(endingMonthly[11]));
  ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  styleBoldDataCell(ws.getCell(r, 2));
  applyHealthFill(ws.getCell(r, 2), endingMonthly[11], { green: Math.max(startingCash * 0.25, 1), amber: 0 });

  r += 2;
  ws.getCell(r, 1).value = "Year 1 operates for " + opMonths + " of 12 months" + (isPartial ? " (partial-year start)" : "") + ". Revenue and operating expenses are spread evenly across the operating window; capital and debt service are spread across all 12 months. Annual totals are tied directly to the Financial Model sheet.";
  ws.getCell(r, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FF6B7280" } };
  ws.mergeCells(r, 1, r, 14);
  ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(r).height = 28;

  setPrintArea(ws, r, 14);
}

function toTitleCase(label: string): string {
  return label
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.length === 0 ? w : w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export async function generateWorkbook(rawData: Record<string, unknown>, consultantData?: ConsultantSummary): Promise<Buffer> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};

  const hasRowData = !!(
    (data.revenueRows && data.revenueRows.length > 0) ||
    (data.staffingRows && data.staffingRows.length > 0) ||
    (data.expenseRows && data.expenseRows.length > 0)
  );

  const yearCount = hasRowData
    ? (data.revenueRows?.[0]?.amounts?.length || data.expenseRows?.[0]?.amounts?.length || (sp.schoolStage === "operating_school" ? 5 : 3))
    : 5;

  const enrollmentByYear = [
    en.year1 || 0,
    en.year2 || 0,
    en.year3 || 0,
    ...(yearCount > 3 ? [en.year4 || 0] : []),
    ...(yearCount > 4 ? [en.year5 || 0] : []),
  ];

  const salaryEscRate = (data.facilities as Record<string, unknown>)?.annualSalaryIncrease
    ? Number((data.facilities as Record<string, unknown>).annualSalaryIncrease) / 100
    : 0;
  const costInflation = (data.facilities as Record<string, unknown>)?.generalCostInflation
    ? Number((data.facilities as Record<string, unknown>).generalCostInflation) / 100
    : 0;
  const isPartial = sp.isPartialFirstYear || false;
  const operatingMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = operatingMonths / 12;

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const cols = yearCount + 1;
  const yearHeaders = ["", ...Array.from({ length: yearCount }, (_, i) => `Year ${i + 1}`)];

  if (hasRowData) {
    const revenueRows = data.revenueRows || [];
    const staffingRows = data.staffingRows || [];
    const expenseRows = data.expenseRows || [];
    const capDebtRows = data.capitalAndDebtRows || [];

    const precomputed = precomputeFinancials(revenueRows, staffingRows, expenseRows, capDebtRows, enrollmentByYear, yearCount, salaryEscRate, prorationFactor, data.tuitionTiers);

    const assumptionsWs = wb.addWorksheet("Assumptions");
    const aRefs = buildAssumptionsTab(assumptionsWs, sp, enrollmentByYear, yearCount, salaryEscRate, costInflation, prorationFactor, data.tuitionTiers);

    const revenueWs = wb.addWorksheet("Revenue Schedule");
    const staffingWs = wb.addWorksheet("Staffing & Personnel");
    const expensesWs = wb.addWorksheet("Operating Expenses");
    const capitalWs = wb.addWorksheet("Capital & Debt");
    const pnlWs = wb.addWorksheet("Financial Model");
    // Task #739 — In single-year mode the Monthly Cash Flow sheet is
    // inserted between the Financial Model and Summary tabs so the cover
    // ToC and sheet ordering stay logical (P&L → monthly cash → summary).
    const monthlyCashFlowWs = yearCount === 1 ? wb.addWorksheet("Monthly Cash Flow") : null;
    const summaryWs = wb.addWorksheet("Summary");

    const revTotalRow = buildRevenueScheduleTab(revenueWs, revenueRows, enrollmentByYear, yearCount, cols, yearHeaders, aRefs, data.tuitionTiers, precomputed);
    const staffTotalRow = buildStaffingTab(staffingWs, staffingRows, salaryEscRate, prorationFactor, yearCount, cols, yearHeaders, aRefs, data);
    const expTotalRow = buildExpensesTab(expensesWs, expenseRows, enrollmentByYear, revTotalRow, yearCount, cols, yearHeaders, aRefs, precomputed, data.customCategoryLabels);
    const capTotalRow = buildCapitalDebtTab(capitalWs, capDebtRows, enrollmentByYear, yearCount, cols, yearHeaders, aRefs);

    buildPnLTab(pnlWs, yearCount, cols, yearHeaders, revTotalRow, staffTotalRow, expTotalRow, capTotalRow, sp.entityType, precomputed, sp.hasManagementFee, data);

    const mgmtOffset = sp.hasManagementFee ? 1 : 0;

    if (monthlyCashFlowWs) {
      // Financial Model row layout (mirrors buildPnLTab):
      //   row 2 = Total Revenue, row 3 = Personnel, row 4 = Operating
      //   Expenses, row 5 = Management Fee (if hasManagementFee), then
      //   Capital & Debt, Total Expenses, Net Income.
      const startingCash = data.priorYearSnapshot?.endingCash ?? data.currentYearProjection?.currentCash ?? 0;
      buildMonthlyCashFlowTab(
        monthlyCashFlowWs,
        sp,
        precomputed,
        expenseRows,
        enrollmentByYear,
        startingCash,
        {
          revenueRow: 2,
          staffRow: 3,
          expenseRow: 4,
          mgmtFeeRow: sp.hasManagementFee ? 5 : null,
          capDebtRow: 5 + mgmtOffset,
          totalExpRow: 6 + mgmtOffset,
          netIncomeRow: 7 + mgmtOffset,
        },
      );
    }

    const revenueMix = computeRevenueMixForExport(revenueRows, enrollmentByYear, yearCount, data.tuitionTiers);
    buildSummaryTabNew(summaryWs, sp, yearCount, cols, yearHeaders, {
      fmRevenueRow: 2, fmStaffRow: 3, fmExpenseRow: 4, fmCapDebtRow: 5 + mgmtOffset,
      fmTotalExpRow: 6 + mgmtOffset, fmNIRow: 7 + mgmtOffset, fmCumNIRow: 8 + mgmtOffset, fmReserveRow: 9 + mgmtOffset,
      studentsRef: (cl) => `'Revenue Schedule'!${cl}2`,
      revenueMix,
    }, consultantData, precomputed, enrollmentByYear);

    if (consultantData) {
      const notesWs = wb.addWorksheet("Consultant Notes");
      buildConsultantNotesTab(notesWs, consultantData);
    }

    if (data.priorYearSnapshot && sp.schoolStage === "operating_school") {
      const priorWs = wb.addWorksheet("Prior-Year Snapshot");
      buildPriorYearTab(priorWs, data.priorYearSnapshot, sp.entityType);
    }

    addDecisionHistorySheet(wb, rawData as Parameters<typeof addDecisionHistorySheet>[1]);

    buildCoverSheet(wb, sp, yearCount, precomputed, consultantData, enrollmentByYear);
    setPrintArea(revenueWs, revTotalRow, cols);
    setPrintArea(expensesWs, expTotalRow, cols);
    setPrintArea(capitalWs, capTotalRow, cols);

    {
      const dbCapDebt = capDebtRows;
      const hasDebt = dbCapDebt.some(r => r.isLoan && r.enabled !== false);
      const cashArr: number[] = [];
      let runCash = data.priorYearSnapshot?.endingCash ?? data.currentYearProjection?.currentCash ?? 0;
      const debtSvcArr: number[] = [];
      for (let y = 0; y < yearCount; y++) {
        let yDebt = 0;
        for (const row of dbCapDebt) {
          if (!row.enabled) continue;
          if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
            yDebt += computeAnnualDebtService(row.loanPrincipal, (row.loanRate || 0) / 100, row.loanTermYears || 0);
          }
        }
        debtSvcArr.push(yDebt);
        runCash += (precomputed.netIncome[y] ?? 0);
        cashArr.push(runCash);
      }
      const revCats: Record<string, number[]> = {};
      for (const row of revenueRows) {
        if (!row.enabled) continue;
        const cat = row.category || "other";
        if (!revCats[cat]) revCats[cat] = new Array(yearCount).fill(0);
        const rowVals = precomputed.revenueByRow.get(row.id);
        if (rowVals) {
          for (let y = 0; y < yearCount; y++) revCats[cat][y] += rowVals[y] ?? 0;
        }
      }
      const facCostArr = computeFacilityCostByYear(expenseRows, enrollmentByYear, precomputed.totalRevenue, yearCount);
      const instrCostArr = computeInstructionalCostByYear(expenseRows, enrollmentByYear, precomputed.totalRevenue, yearCount);
      await addDashboardSheet(wb, {
        schoolName: sp.schoolName || "School",
        entityType: sp.entityType || "",
        enrollment: enrollmentByYear,
        revenueByYear: precomputed.totalRevenue,
        personnelByYear: precomputed.totalPersonnel,
        opexByYear: precomputed.totalExpenses,
        facilityCostByYear: facCostArr,
        instructionalByYear: instrCostArr,
        debtServiceByYear: debtSvcArr,
        netIncomeByYear: precomputed.netIncome,
        cashByYear: cashArr,
        startingCash: data.priorYearSnapshot?.endingCash ?? data.currentYearProjection?.currentCash ?? 0,
        hasDebt,
        revenueCategories: revCats,
        cumNIRef: { sheetName: "Financial Model", row: 8 + (sp.hasManagementFee ? 1 : 0), startCol: 2 },
        hasManagementFee: sp.hasManagementFee,
        managementFeePercent: sp.managementFeePercent,
        // Task #703 — provenance + assumptions-confidence rollup banner.
        provenance:
          sp.wizardPathway === "actuals"
            ? "actuals"
            : sp.wizardPathway === "assumptions"
              ? "assumptions"
              : sp.schoolStage === "operating_school"
                ? "actuals"
                : "assumptions",
        assumptionConfidence:
          (rawData as { assumptionConfidence?: Record<string, { confidence: string; evidenceNote?: string }> })
            .assumptionConfidence,
      });
    }
  } else {
    const assumptionsWs = wb.addWorksheet("Assumptions");
    buildAssumptionsTab(assumptionsWs, sp, enrollmentByYear, yearCount, salaryEscRate, costInflation, prorationFactor, data.tuitionTiers);

    const pnlWs = wb.addWorksheet("Financial Model");
    const legacyResult = buildLegacyPnLTab(pnlWs, data, enrollmentByYear, yearCount, cols, yearHeaders, prorationFactor);

    const summaryWs = wb.addWorksheet("Summary");
    buildSummaryTabNew(summaryWs, sp, yearCount, cols, yearHeaders, {
      fmRevenueRow: 3, fmStaffRow: 4, fmExpenseRow: 5, fmCapDebtRow: 0,
      fmTotalExpRow: 6, fmNIRow: 7, fmCumNIRow: 8, fmReserveRow: 9,
      studentsRef: (cl) => `'Financial Model'!${cl}2`,
    }, consultantData, undefined, enrollmentByYear);

    if (consultantData) {
      const notesWs = wb.addWorksheet("Consultant Notes");
      buildConsultantNotesTab(notesWs, consultantData);
    }

    addDecisionHistorySheet(wb, rawData as Parameters<typeof addDecisionHistorySheet>[1]);

    buildCoverSheet(wb, sp, yearCount, undefined, consultantData, enrollmentByYear);

    {
      const fac = (data.facilities || {}) as Record<string, number>;
      const hasDebt = (fac.loanAmount || 0) > 0;
      const cashArr: number[] = [];
      let runCash = 0;
      for (let y = 0; y < yearCount; y++) {
        runCash += (legacyResult.niByYr[y] || 0);
        cashArr.push(runCash);
      }
      const costInfl = (fac.generalCostInflation || 0) / 100;
      const rentInc = (fac.annualRentIncrease || 0) / 100;
      const legacyFacCost: number[] = [];
      for (let y = 0; y < yearCount; y++) {
        const pf = y === 0 ? prorationFactor : 1;
        const infEsc = Math.pow(1 + costInfl, y);
        const rent = (fac.monthlyRent || 0) * 12 * Math.pow(1 + rentInc, y) * pf;
        const utils = (fac.annualUtilities || 0) * infEsc * pf;
        const ins = (fac.annualInsurance || 0) * infEsc * pf;
        const maint = (fac.facilityMaintenance || 0) * infEsc * pf;
        legacyFacCost.push(rent + utils + ins + maint);
      }
      await addDashboardSheet(wb, {
        schoolName: sp.schoolName || "School",
        entityType: sp.entityType || "",
        enrollment: enrollmentByYear,
        revenueByYear: legacyResult.revenueByYr,
        personnelByYear: legacyResult.staffByYr,
        opexByYear: legacyResult.expByYr,
        facilityCostByYear: legacyFacCost,
        debtServiceByYear: new Array(yearCount).fill(0),
        netIncomeByYear: legacyResult.niByYr,
        cashByYear: cashArr,
        startingCash: 0,
        hasDebt,
        revenueCategories: {},
        cumNIRef: { sheetName: "Financial Model", row: 8, startCol: 2 },
        // Task #703 — provenance + assumptions-confidence rollup banner.
        provenance:
          sp.wizardPathway === "actuals"
            ? "actuals"
            : sp.wizardPathway === "assumptions"
              ? "assumptions"
              : sp.schoolStage === "operating_school"
                ? "actuals"
                : "assumptions",
        assumptionConfidence:
          (rawData as { assumptionConfidence?: Record<string, { confidence: string; evidenceNote?: string }> })
            .assumptionConfidence,
      });
    }
  }

  polishWorkbook(wb, sp.schoolName);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

interface AssumptionRefs {
  enrollmentRows: number[];
  salaryEscRow: number;
  costInflationRow: number;
  prorationRow: number;
}

function buildAssumptionsTab(
  ws: ExcelJS.Worksheet,
  sp: SchoolProfile,
  enrollment: number[],
  yearCount: number,
  salaryEscRate: number,
  costInflation: number,
  prorationFactor: number,
  tuitionTiers?: TuitionTier[],
): AssumptionRefs {
  ws.columns = [{ width: 35 }, { width: 25 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack Budget - Assumptions";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 2);
  ws.getRow(r).height = 32;

  r = 2;
  ws.getCell(r, 1).fill = INPUT_FILL;
  ws.getCell(r, 1).value = "";
  ws.getCell(r, 1).border = INPUT_BORDER;
  ws.getCell(r, 2).value = "Editable assumption \u2014 change this value";
  ws.getCell(r, 2).font = { size: 11, name: "Calibri", italic: true, color: { argb: "FF666666" } };
  ws.getCell(r, 4).value = "";
  ws.getCell(r, 4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(r, 4).border = { bottom: { style: "thin", color: { argb: "FFD0D0D0" } } };
  ws.getCell(r, 5).value = "Calculated \u2014 driven by formula";
  ws.getCell(r, 5).font = { size: 11, name: "Calibri", italic: true, color: { argb: "FF666666" } };

  r = 3;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "SCHOOL INFORMATION";

  const profileItems: [string, string | number][] = [
    ["School Name", sp.schoolName || ""],
    ["State", sp.state || ""],
    ["School Type", schoolTypeDisplay(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityTypeDisplay(sp.entityType)],
    ...(sp.ein ? [["EIN", sp.ein] as [string, string]] : []),
    ["School Stage", sp.schoolStage === "operating_school" ? "Operating School" : "New School"],
    ["Opening Year", sp.openingYear || 0],
    ["Current Students", sp.currentStudents || 0],
    ["Max Student Capacity", sp.maxCapacity || 0],
    ["Fiscal Year Start", MONTH_NAMES[sp.fiscalYearStartMonth || 7] || "July"],
    ["Accounting Basis", accountingBasisLabel(sp.accountingBasis)],
  ];

  if (sp.isPartialFirstYear) {
    profileItems.push(["Year 1 Operating Months", sp.year1OperatingMonths || 12]);
  }

  if (sp.schoolType === "private_school") {
    profileItems.push(["Accredited", sp.isAccredited ? "Yes" : "No"]);
    if (sp.isAccredited && sp.accreditingBody) {
      profileItems.push(["Accrediting Body", sp.accreditingBody]);
    }
  }

  if (sp.hasManagementFee) {
    profileItems.push(["Management Fee", `${sp.managementFeePercent || 0}% of Revenue`]);
  }

  if (sp.locationSecured !== undefined) {
    profileItems.push(["Location Secured", sp.locationSecured ? "Yes" : "No (Estimated)"]);
  }
  if (sp.locationSecured && sp.facilityStreet) {
    const addr = [sp.facilityStreet, sp.facilityCity, sp.facilityState, sp.facilityZip].filter(Boolean).join(", ");
    profileItems.push(["Facility Address", addr]);
  }
  if (sp.ownershipType) {
    profileItems.push(["Facility Ownership", sp.ownershipType === "own" ? "Owned" : "Rented / Leased"]);
  }
  if (sp.ownershipType === "rent") {
    if (sp.monthlyRent) profileItems.push(["Monthly Rent", `$${(sp.monthlyRent).toLocaleString()}`]);
    if (sp.annualRentEscalation) profileItems.push(["Annual Rent Escalation", `${sp.annualRentEscalation}%`]);
    if (sp.leaseExpirationMonth && sp.leaseExpirationYear) {
      const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      profileItems.push(["Lease Expiration", `${monthNames[sp.leaseExpirationMonth] || ""} ${sp.leaseExpirationYear}`]);
    }
    if (sp.postLeaseRenewalBump) profileItems.push(["Post-Lease Renewal Bump", `${sp.postLeaseRenewalBump}%`]);
    if (sp.isNNNLease) {
      profileItems.push(["Lease Type", "Triple Net (NNN)"]);
      const nnnTotal = (sp.nnnCamCharges || 0) + (sp.nnnMaintenance || 0) + (sp.nnnUtilities || 0);
      if (nnnTotal > 0) profileItems.push(["Monthly NNN Charges", `$${nnnTotal.toLocaleString()}`]);
    }
  }
  if (sp.ownershipType === "own") {
    if (sp.entityType && sp.entityType !== "nonprofit_501c3" && sp.propertyTaxAnnual) {
      profileItems.push(["Annual Property Tax", `$${sp.propertyTaxAnnual.toLocaleString()}`]);
    }
    if (sp.hasMortgage && sp.mortgageMonthlyPayment) {
      profileItems.push(["Monthly Mortgage Payment", `$${sp.mortgageMonthlyPayment.toLocaleString()}`]);
    }
  }
  if (!sp.locationSecured && sp.estimatedMonthlyFacilityBudget) {
    profileItems.push(["Estimated Monthly Facility Budget", `$${sp.estimatedMonthlyFacilityBudget.toLocaleString()}`]);
  }

  for (const [label, value] of profileItems) {
    r++;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = value;
    applyInput(ws.getCell(r, 2));
  }

  r += 2;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "ENROLLMENT BY YEAR";

  const enrollmentRows: number[] = [];
  for (let y = 0; y < yearCount; y++) {
    r++;
    enrollmentRows.push(r);
    ws.getCell(r, 1).value = `Year ${y + 1} Students`;
    ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = enrollment[y];
    applyInput(ws.getCell(r, 2));
    ws.getCell(r, 2).numFmt = NUMBER_FORMAT;
  }

  const hasWeightedEnroll = (sp.spedCount?.some((v: number) => v > 0)) || (sp.ellCount?.some((v: number) => v > 0)) || (sp.ecoDisCount?.some((v: number) => v > 0));
  if (hasWeightedEnroll) {
    r += 2;
    styleSectionRow(ws, r, yearCount + 1);
    ws.getCell(r, 1).value = "WEIGHTED ENROLLMENT POPULATIONS";

    for (let c = 2; c <= yearCount + 1; c++) {
      if (!ws.getColumn(c).width || (ws.getColumn(c).width as number) < 14)
        ws.getColumn(c).width = 14;
    }

    r++;
    ws.getCell(r, 1).value = ""; ws.getCell(r, 1).font = NORMAL_FONT;
    for (let y = 0; y < yearCount; y++) {
      ws.getCell(r, y + 2).value = `Year ${y + 1}`;
      ws.getCell(r, y + 2).font = { ...NORMAL_FONT, bold: true };
      ws.getCell(r, y + 2).alignment = { horizontal: "right" };
    }

    const popTypes = [
      { label: "Special Education (SPED)", data: sp.spedCount },
      { label: "English Language Learners (ELL)", data: sp.ellCount },
      { label: "Economically Disadvantaged", data: sp.ecoDisCount },
    ];
    const popDataRows: number[] = [];
    for (const pop of popTypes) {
      r++;
      popDataRows.push(r);
      ws.getCell(r, 1).value = pop.label;
      ws.getCell(r, 1).font = NORMAL_FONT;
      for (let y = 0; y < yearCount; y++) {
        const cell = ws.getCell(r, y + 2);
        cell.value = pop.data?.[y] ?? 0;
        cell.numFmt = "#,##0";
        applyInput(cell);
      }
    }
    r++;
    ws.getCell(r, 1).value = "Total Weighted Students";
    ws.getCell(r, 1).font = { ...NORMAL_FONT, bold: true };
    const totalRow = r;
    for (let y = 0; y < yearCount; y++) {
      const col = y + 2;
      const cell = ws.getCell(r, col);
      const colLtr = String.fromCharCode(64 + col);
      const sumParts = popDataRows.map(pr => `${colLtr}${pr}`).join("+");
      const total = (sp.spedCount?.[y] ?? 0) + (sp.ellCount?.[y] ?? 0) + (sp.ecoDisCount?.[y] ?? 0);
      setFormula(cell, sumParts, total);
      cell.numFmt = "#,##0";
      cell.font = { ...NORMAL_FONT, bold: true };
    }
    r++;
    ws.getCell(r, 1).value = "Weighted % of Enrollment";
    ws.getCell(r, 1).font = { ...NORMAL_FONT, italic: true };
    for (let y = 0; y < yearCount; y++) {
      const col = y + 2;
      const cell = ws.getCell(r, col);
      const colLtr = String.fromCharCode(64 + col);
      const enrollAddr = `${colLtr}${enrollmentRows[y]}`;
      const totalAddr = `${colLtr}${totalRow}`;
      const pct = enrollment[y] > 0 ? ((sp.spedCount?.[y] ?? 0) + (sp.ellCount?.[y] ?? 0) + (sp.ecoDisCount?.[y] ?? 0)) / enrollment[y] : 0;
      setFormula(cell, `IF(${enrollAddr}=0,0,${totalAddr}/${enrollAddr})`, pct);
      cell.numFmt = "0%";
      cell.font = { ...NORMAL_FONT, italic: true };
    }
  }

  if (tuitionTiers && tuitionTiers.length > 0 && sp.schoolType !== "charter_school") {
    r += 2;
    styleSectionRow(ws, r, 2);
    ws.getCell(r, 1).value = "TUITION DISCOUNT TIERS";

    for (const tier of tuitionTiers) {
      r++;
      ws.getCell(r, 1).value = `${tier.label} (${tier.discountPercent}% discount)`;
      ws.getCell(r, 1).font = NORMAL_FONT;
      const totalStudents = tier.studentCounts.reduce((s, n) => s + n, 0);
      ws.getCell(r, 2).value = `${totalStudents} total students across years`;
      applyCalc(ws.getCell(r, 2));
    }
  }

  r += 2;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "GROWTH & ESCALATION ASSUMPTIONS";

  r++;
  const salaryEscRow = r;
  ws.getCell(r, 1).value = "Annual Salary Escalation"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = salaryEscRate; applyInput(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = PERCENT_FORMAT;
  r++;
  const costInflationRow = r;
  ws.getCell(r, 1).value = "General Cost Inflation"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = costInflation; applyInput(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = PERCENT_FORMAT;
  r++;
  const prorationRow = r;
  ws.getCell(r, 1).value = "Year 1 Proration Factor"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = prorationFactor; applyInput(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = "0.00";
  r++;
  ws.getCell(r, 1).value = "Projection Period"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = `${yearCount} Years`; applyCalc(ws.getCell(r, 2));

  const riskFlags: string[] = [];
  if (sp.locationSecured === false) {
    riskFlags.push("No facility location secured - costs are estimated");
  }
  if (sp.locationSecured && sp.ownershipType === "rent" && sp.leaseExpirationYear) {
    const curYear = new Date().getFullYear();
    const projStartYear = Math.max(sp.openingYear || curYear, curYear);
    const yearsUntilExpiry = sp.leaseExpirationYear - projStartYear;
    if (yearsUntilExpiry >= 0 && yearsUntilExpiry < yearCount) {
      riskFlags.push(`Lease expires in Year ${yearsUntilExpiry + 1} (${sp.leaseExpirationYear}) - renewal bump of ${sp.postLeaseRenewalBump || 15}% modeled`);
    }
    if (yearsUntilExpiry < 2 && yearsUntilExpiry >= 0) {
      riskFlags.push("Short remaining lease term - less than 2 years until expiration");
    }
  }
  if (sp.locationSecured && sp.ownershipType === "rent" && sp.isNNNLease) {
    const nnnTotal = (sp.nnnCamCharges || 0) + (sp.nnnMaintenance || 0) + (sp.nnnUtilities || 0);
    if (nnnTotal > 0) {
      riskFlags.push(`NNN lease: $${(nnnTotal * 12).toLocaleString()}/year in additional charges (CAM, maintenance, utilities)`);
    }
  }
  if (sp.locationSecured && sp.ownershipType === "own" && sp.entityType && sp.entityType !== "nonprofit_501c3" && (sp.propertyTaxAnnual || 0) > 0) {
    riskFlags.push(`For-profit property tax: $${(sp.propertyTaxAnnual || 0).toLocaleString()}/year`);
  }

  if (riskFlags.length > 0) {
    r += 2;
    styleSectionRow(ws, r, 2);
    ws.getCell(r, 1).value = "FACILITY RISK FLAGS";
    for (const flag of riskFlags) {
      r++;
      ws.getCell(r, 1).value = `⚠ ${flag}`;
      ws.getCell(r, 1).font = { ...NORMAL_FONT, color: { argb: "FFD97706" } };
      ws.mergeCells(r, 1, r, 2);
      ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
    }
  }

  return { enrollmentRows, salaryEscRow, costInflationRow, prorationRow };
}

function buildConsultantNotesTab(ws: ExcelJS.Worksheet, consultant: ConsultantSummary) {
  ws.columns = [{ width: 25 }, { width: 80 }];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack Budget - Consultant Notes";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 2);
  ws.getRow(r).height = 32;

  r = 3;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "EXECUTIVE SUMMARY";

  r++;
  ws.getCell(r, 1).value = consultant.executiveSummary || "";
  ws.getCell(r, 1).font = NORMAL_FONT;
  ws.mergeCells(r, 1, r, 2);
  ws.getRow(r).height = 40;
  ws.getRow(r).alignment = { wrapText: true, vertical: "top" };

  r += 2;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "LENDER READINESS";

  r++;
  ws.getCell(r, 1).value = "Status"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = lenderReadinessCoachingHeadline(consultant.lenderReadiness); ws.getCell(r, 2).font = BOLD_FONT;
  r++;
  ws.getCell(r, 1).value = "Assessment"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = consultant.lenderReadinessExplanation || ""; ws.getCell(r, 2).font = NORMAL_FONT;
  ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(r).height = 30;

  r += 2;
  ws.getCell(r, 1).value = "Biggest Strength"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = consultant.biggestStrength || ""; ws.getCell(r, 2).font = BOLD_FONT;
  r++;
  ws.getCell(r, 1).value = "Biggest Risk"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = consultant.biggestRisk || ""; ws.getCell(r, 2).font = BOLD_FONT;

  if (consultant.recommendations && consultant.recommendations.length > 0) {
    r += 2;
    styleSectionRow(ws, r, 2);
    ws.getCell(r, 1).value = "RECOMMENDATIONS";

    for (const rec of consultant.recommendations) {
      r++;
      ws.getCell(r, 1).value = `[${rec.priority.toUpperCase()}] ${rec.title}`;
      ws.getCell(r, 1).font = BOLD_FONT;
      r++;
      ws.getCell(r, 1).value = rec.description;
      ws.getCell(r, 1).font = NORMAL_FONT;
      ws.mergeCells(r, 1, r, 2);
      ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 40;
    }
  }
}

function buildPriorYearTab(ws: ExcelJS.Worksheet, snapshot: PriorYearSnapshot, entityType?: string) {
  ws.columns = [{ width: 35 }, { width: 25 }];

  let r = 1;
  ws.getCell(r, 1).value = "Prior-Year Snapshot";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 2);
  ws.getRow(r).height = 32;

  r = 3;
  styleSectionRow(ws, r, 2);
  ws.getCell(r, 1).value = "PRIOR YEAR ACTUALS";

  const items: [string, number | undefined, string][] = [
    ["Ending Enrollment", snapshot.endingEnrollment, NUMBER_FORMAT],
    ["Total Revenue", snapshot.totalRevenue, CURRENCY_FORMAT],
    ["Total Expenses", snapshot.totalExpenses, CURRENCY_FORMAT],
    ["Ending Cash Balance", snapshot.endingCash, CURRENCY_FORMAT],
  ];

  for (const [label, value, fmt] of items) {
    r++;
    ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = value ?? 0; ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = fmt;
  }

  if (snapshot.totalRevenue && snapshot.totalExpenses) {
    r++;
    ws.getCell(r, 1).value = `${profitLabel(entityType)} (Prior Year)`; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = snapshot.totalRevenue - snapshot.totalExpenses;
    ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  }
  if (snapshot.endingCash !== undefined && snapshot.totalExpenses && snapshot.totalExpenses > 0) {
    r++;
    ws.getCell(r, 1).value = "Cash Reserve (Months)"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = Math.round(snapshot.endingCash / (snapshot.totalExpenses / 12) * 10) / 10;
    ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = "0.0";
  }
}

function computeTuitionWithTiersExport(
  grossPerStudent: number,
  yearIdx: number,
  totalStudents: number,
  tuitionTiers?: TuitionTier[],
): number {
  if (!tuitionTiers || tuitionTiers.length === 0) {
    return grossPerStudent * totalStudents;
  }
  let rawTierTotal = 0;
  for (const tier of tuitionTiers) {
    rawTierTotal += tier.studentCounts?.[yearIdx] ?? 0;
  }
  if (rawTierTotal === 0) {
    return grossPerStudent * totalStudents;
  }
  const scaleFactor = rawTierTotal > totalStudents ? totalStudents / rawTierTotal : 1;
  let total = 0;
  let allocated = 0;
  for (const tier of tuitionTiers) {
    const scaled = (tier.studentCounts?.[yearIdx] ?? 0) * scaleFactor;
    allocated += scaled;
    total += scaled * grossPerStudent * (1 - (tier.discountPercent || 0) / 100);
  }
  const remaining = totalStudents - allocated;
  if (remaining > 0) {
    total += remaining * grossPerStudent;
  }
  return total;
}

function buildRevenueScheduleTab(
  ws: ExcelJS.Worksheet,
  rows: RevenueRow[],
  enrollment: number[],
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  aRefs?: AssumptionRefs,
  tuitionTiers?: TuitionTier[],
  precomputed?: PrecomputedFinancials,
): number {
  ws.columns = [{ width: 42 }, ...Array(yearCount).fill({ width: 18 })];
  ws.getRow(1).values = yearHeaders;
  styleHeaderRow(ws, 1, cols);

  let r = 2;
  ws.getCell(r, 1).value = "Students";
  ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    if (aRefs) {
      cell.value = { formula: `Assumptions!B${aRefs.enrollmentRows[y]}`, result: safeResult(enrollment[y]) };
    } else {
      cell.value = enrollment[y];
    }
    cell.numFmt = NUMBER_FORMAT;
    styleDataCell(cell);
  }

  const rowExcelRows = new Map<string, number>();

  const categories = [
    "tuition_and_fees", "tuition_offsets", "public_funding",
    "school_choice", "philanthropy", "other_revenue",
  ];
  const categoryTotalRows: number[] = [];

  const nonPobRows = rows.filter(row => row.enabled && row.driverType !== "percent_of_base");
  const pobRows = rows.filter(row => row.enabled && row.driverType === "percent_of_base");
  const orderedRows = [...nonPobRows, ...pobRows];

  for (const cat of categories) {
    const catRows = orderedRows.filter(row => row.category === cat || (cat === "philanthropy" && row.category === "grants_contributions"));
    if (catRows.length === 0) continue;

    r++;
    styleSectionRow(ws, r, cols);
    ws.getCell(r, 1).value = REVENUE_CATEGORY_LABELS[cat] || cat;

    const firstDataRow = r + 1;

    for (const row of catRows) {
      r++;
      rowExcelRows.set(row.id, r);
      ws.getCell(r, 1).value = row.lineItem;
      ws.getCell(r, 1).font = NORMAL_FONT;

      for (let y = 0; y < yearCount; y++) {
        const cell = ws.getCell(r, y + 2);
        const amt = row.amounts?.[y] ?? 0;
        const studentsCell = aRefs ? `Assumptions!B${aRefs.enrollmentRows[y]}` : `$B$2`;
        const cachedVal = precomputed?.revenueByRow.get(row.id)?.[y] ?? 0;

        if (row.driverType === "percent_of_base") {
          const baseExcelRow = rowExcelRows.get(row.percentBase || "");
          if (baseExcelRow) {
            const sign = cat === "tuition_offsets" ? "-" : "";
            cell.value = { formula: `${sign}${c(baseExcelRow, y + 2)}*${amt / 100}`, result: safeResult(cachedVal) };
          } else {
            cell.value = cachedVal;
          }
        } else if (row.driverType === "per_student") {
          const sign = cat === "tuition_offsets" ? "-" : "";
          if (row.id === "gross_tuition" && tuitionTiers && tuitionTiers.length > 0) {
            const tierValue = computeTuitionWithTiersExport(amt, y, enrollment[y] || 0, tuitionTiers);
            cell.value = cat === "tuition_offsets" ? -Math.abs(tierValue) : tierValue;
          } else {
            cell.value = { formula: `${sign}${amt}*${studentsCell}`, result: safeResult(cachedVal) };
          }
        } else if (row.driverType === "monthly") {
          const sign = cat === "tuition_offsets" ? "-" : "";
          cell.value = { formula: `${sign}${amt}*12`, result: safeResult(cachedVal) };
        } else {
          cell.value = cat === "tuition_offsets" ? -Math.abs(amt) : amt;
        }
        cell.numFmt = CURRENCY_FORMAT;
        styleDataCell(cell);
      }
    }

    r++;
    ws.getCell(r, 1).value = `Total ${(REVENUE_CATEGORY_LABELS[cat] || cat).split("(")[0].trim()}`;
    ws.getCell(r, 1).font = BOLD_FONT;
    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      const catTotal = precomputed?.revenueCategoryTotals.get(cat)?.[y] ?? 0;
      cell.value = { formula: `SUM(${c(firstDataRow, y + 2)}:${c(r - 1, y + 2)})`, result: safeResult(Math.round(catTotal)) };
      cell.numFmt = CURRENCY_FORMAT;
      styleBoldDataCell(cell);
    }
    styleSectionRow(ws, r, cols);
    categoryTotalRows.push(r);
  }

  r += 2;
  ws.getCell(r, 1).value = "TOTAL NET REVENUE";
  ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    const sumParts = categoryTotalRows.map(tr => c(tr, y + 2)).join("+");
    cell.value = { formula: sumParts || "0", result: safeResult(precomputed?.totalRevenue[y] ?? 0) };
    cell.numFmt = CURRENCY_FORMAT;
    styleGrandTotalCell(cell);
  }
  styleSectionRow(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return r;
}

function buildStaffingTab(
  ws: ExcelJS.Worksheet,
  rows: StaffingRow[],
  salaryEscRate: number,
  prorationFactor: number,
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  aRefs?: AssumptionRefs,
  founderCompData?: ModelData,
): number {
  ws.columns = [
    { width: 30 }, { width: 18 }, { width: 14 }, { width: 10 },
    { width: 16 }, { width: 12 }, { width: 12 }, { width: 18 },
  ];

  let r = 1;
  ws.getCell(r, 1).value = "SchoolStack Budget - Staffing & Personnel";
  ws.getCell(r, 1).font = { bold: true, size: 14, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, 8);
  ws.getRow(r).height = 32;

  r = 3;
  const rosterHeaders = ["Role", "Function", "Type", "FTE", "Annual Rate", "Benefits %", "Payroll Tax %", "Total Annual Cost"];
  ws.getRow(r).values = rosterHeaders;
  styleHeaderRow(ws, r, 8);

  const funcOrder = ["school_leadership", "instructional", "student_support", "operations", "administrative", "other"];
  const sorted = [...rows].sort((a, b) => {
    const ai = funcOrder.indexOf(a.functionCategory);
    const bi = funcOrder.indexOf(b.functionCategory);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  let totalSalaries = 0, totalBenefits = 0, totalPayrollTax = 0, totalContracted = 0;
  let totalFTE = 0;

  for (const row of sorted) {
    r++;
    const annualCost = row.fte * row.annualizedRate;
    const isContractNotPayrollLike = row.employmentType === "contract" && !row.payrollLike;
    let benefitsAmt = 0, taxAmt = 0;

    if (isContractNotPayrollLike) {
      totalContracted += annualCost;
    } else {
      totalSalaries += annualCost;
      if (row.benefitsEligible) {
        benefitsAmt = annualCost * (row.benefitsRate / 100);
        totalBenefits += benefitsAmt;
      }
      taxAmt = annualCost * (row.payrollTaxRate / 100);
      totalPayrollTax += taxAmt;
    }
    totalFTE += row.fte;

    const totalCost = annualCost + benefitsAmt + taxAmt;

    ws.getCell(r, 1).value = row.roleName; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = funcCategoryLabel(row.functionCategory); ws.getCell(r, 2).font = NORMAL_FONT;
    ws.getCell(r, 3).value = empTypeLabel(row.employmentType); ws.getCell(r, 3).font = NORMAL_FONT;
    ws.getCell(r, 4).value = row.fte; applyInput(ws.getCell(r, 4)); ws.getCell(r, 4).numFmt = "0.00";
    ws.getCell(r, 5).value = row.annualizedRate; applyInput(ws.getCell(r, 5)); ws.getCell(r, 5).numFmt = CURRENCY_FORMAT;
    ws.getCell(r, 6).value = row.benefitsEligible ? row.benefitsRate / 100 : 0; applyInput(ws.getCell(r, 6)); ws.getCell(r, 6).numFmt = PERCENT_FORMAT;
    ws.getCell(r, 7).value = row.payrollTaxRate / 100; applyInput(ws.getCell(r, 7)); ws.getCell(r, 7).numFmt = PERCENT_FORMAT;
    ws.getCell(r, 8).value = totalCost; applyCalc(ws.getCell(r, 8)); ws.getCell(r, 8).numFmt = CURRENCY_FORMAT;
  }

  const grandTotal = totalSalaries + totalBenefits + totalPayrollTax + totalContracted;

  r += 2;
  styleSectionRow(ws, r, 8);
  ws.getCell(r, 1).value = "PERSONNEL COST SUMMARY";

  r++;
  ws.getCell(r, 1).value = "Total Headcount"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = rows.length; ws.getCell(r, 2).font = BOLD_FONT;
  r++;
  ws.getCell(r, 1).value = "Total FTE"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalFTE * 10) / 10; ws.getCell(r, 2).font = BOLD_FONT;
  r++;
  ws.getCell(r, 1).value = "Salaries & Wages"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalSalaries); ws.getCell(r, 2).font = NORMAL_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r++;
  ws.getCell(r, 1).value = "Benefits"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalBenefits); ws.getCell(r, 2).font = NORMAL_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r++;
  ws.getCell(r, 1).value = "Payroll Taxes"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalPayrollTax); ws.getCell(r, 2).font = NORMAL_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r++;
  ws.getCell(r, 1).value = "Contracted Personnel"; ws.getCell(r, 1).font = NORMAL_FONT;
  ws.getCell(r, 2).value = Math.round(totalContracted); ws.getCell(r, 2).font = NORMAL_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;
  r++;
  ws.getCell(r, 1).value = "Total Annual Personnel Cost"; ws.getCell(r, 1).font = BOLD_FONT;
  ws.getCell(r, 2).value = Math.round(grandTotal); ws.getCell(r, 2).font = BOLD_FONT; ws.getCell(r, 2).numFmt = CURRENCY_FORMAT;

  r += 2;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "PERSONNEL COST PROJECTION";

  ws.columns = [{ width: 30 }, ...Array(yearCount).fill({ width: 18 })];
  r++;
  ws.getRow(r).values = yearHeaders;
  styleHeaderRow(ws, r, cols);

  const projItems: [string, boolean][] = [
    ["Base Personnel Cost", false],
    ["Salary Escalation Factor", false],
    ["Proration Factor", false],
    ["Total Personnel Cost", true],
  ];

  const projStartRow = r + 1;

  for (const [label, bold] of projItems) {
    r++;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      const pf = y === 0 ? prorationFactor : 1;
      const esc = Math.pow(1 + salaryEscRate, y);
      const salaryEscRef = aRefs ? `Assumptions!B${aRefs.salaryEscRow}` : null;
      const prorationRef = aRefs ? `Assumptions!B${aRefs.prorationRow}` : null;

      switch (label) {
        case "Base Personnel Cost":
          cell.value = Math.round(grandTotal);
          cell.numFmt = CURRENCY_FORMAT;
          break;
        case "Salary Escalation Factor":
          if (salaryEscRef) {
            cell.value = { formula: `(1+${salaryEscRef})^${y}`, result: safeResult(esc) };
          } else {
            cell.value = esc;
          }
          cell.numFmt = "0.0000";
          break;
        case "Proration Factor":
          if (prorationRef && y === 0) {
            cell.value = { formula: prorationRef, result: safeResult(pf) };
          } else {
            cell.value = pf;
          }
          cell.numFmt = "0.000";
          break;
        case "Total Personnel Cost": {
          const baseRef = c(projStartRow, y + 2);
          const escRef = c(projStartRow + 1, y + 2);
          const pfRef = c(projStartRow + 2, y + 2);
          const totalVal = Math.round(grandTotal * esc * pf);
          cell.value = { formula: `${baseRef}*${escRef}*${pfRef}`, result: safeResult(totalVal) };
          cell.numFmt = CURRENCY_FORMAT;
          break;
        }
      }
      if (bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }
  }

  const totalRow = r;
  styleSectionRow(ws, totalRow, cols);

  // Task #692: dedicated, clearly labeled "Founder compensation" breakdown
  // (reported vs market-rate normalized, with the lender adjustment delta
  // and a per-year + N-year total). Numbers come from the same
  // `computeFounderCompNormalization` helper the in-app dashboard uses.
  if (founderCompData) {
    const fc = computeFounderCompNormalization(founderCompData as FullModelData, yearCount);
    const stRaw = (founderCompData.staffing || {}) as Record<string, unknown>;
    const notPayingYet = stRaw.notPayingFounderYet === true;
    const hasReported = fc.reported.some((v) => v > 0);

    if (hasReported || notPayingYet || fc.hasAdjustment) {
      // Extend the visible table by one column for an explicit "Total" so
      // section styling, header, and per-row writes stay in sync (previously
      // we wrote out-of-band into yearCount+2 with a tautological guard).
      const totalColIdx = yearCount + 2;
      ws.getColumn(totalColIdx).width = 18;
      const fcCols = cols + 1;

      r += 2;
      const sectionRow = r;
      styleSectionRow(ws, sectionRow, fcCols);
      ws.getCell(sectionRow, 1).value = "FOUNDER COMPENSATION";
      ws.getCell(sectionRow, totalColIdx).value = `${yearCount}-Year Total`;

      const fcRows: Array<{ label: string; values: number[]; bold?: boolean }> = [
        { label: "Founder Compensation (as planned)", values: fc.reported },
        { label: "  Fully-loaded (incl. benefits + payroll tax)", values: fc.reportedLoaded },
        { label: "Founder Compensation (market rate, normalized)", values: fc.normalized },
        { label: "  Fully-loaded (incl. benefits + payroll tax)", values: fc.normalizedLoaded },
        { label: "Lender Normalization Adjustment (market - planned)", values: fc.delta, bold: true },
      ];

      for (const item of fcRows) {
        r++;
        ws.getCell(r, 1).value = item.label;
        ws.getCell(r, 1).font = item.bold ? BOLD_FONT : NORMAL_FONT;
        let total = 0;
        for (let y = 0; y < yearCount; y++) {
          const cell = ws.getCell(r, y + 2);
          const v = Math.round(item.values[y] || 0);
          total += v;
          cell.value = v;
          cell.numFmt = CURRENCY_FORMAT;
          if (item.bold) styleBoldDataCell(cell); else styleDataCell(cell);
        }
        const lastYearColLetter = String.fromCharCode(65 + yearCount);
        const totalCell = ws.getCell(r, totalColIdx);
        totalCell.value = { formula: `SUM(B${r}:${lastYearColLetter}${r})`, result: safeResult(total) };
        totalCell.numFmt = CURRENCY_FORMAT;
        if (item.bold) styleBoldDataCell(totalCell); else styleDataCell(totalCell);
      }

      r++;
      const note = notPayingYet
        ? "Note: Founder selected \"not paying yet\" — reported founder compensation is $0 across all years. The market-rate line shows what a comparable hire would cost; the lender adjustment is the gap underwriters apply."
        : fc.hasAdjustment
        ? "Note: Founder is paying themselves below market rate (\"sweat equity\"). Lenders and boards underwrite to the market-rate line; the adjustment shows the gap."
        : "Note: Reported and market-rate founder compensation match — no normalization adjustment is applied.";
      ws.getCell(r, 1).value = note;
      ws.getCell(r, 1).font = { ...NORMAL_FONT, italic: true, color: { argb: "FF64748B" } };
      ws.mergeCells(r, 1, r, fcCols);
      ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = 32;
    }
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return totalRow;
}

function buildExpensesTab(
  ws: ExcelJS.Worksheet,
  expenseRows: ExpenseRow[],
  enrollment: number[],
  revTotalRow: number,
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  aRefs?: AssumptionRefs,
  precomputed?: PrecomputedFinancials,
  customCategoryLabels?: Record<string, string>,
): number {
  ws.columns = [{ width: 42 }, ...Array(yearCount).fill({ width: 18 })];
  ws.getRow(1).values = yearHeaders;
  styleHeaderRow(ws, 1, cols);

  let r = 2;
  ws.getCell(r, 1).value = "Students";
  ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    if (aRefs) {
      cell.value = { formula: `Assumptions!B${aRefs.enrollmentRows[y]}`, result: safeResult(enrollment[y]) };
    } else {
      cell.value = enrollment[y];
    }
    cell.numFmt = NUMBER_FORMAT;
    styleDataCell(cell);
  }

  const baseCategories = ["instructional_program", "technology", "occupancy_facility", "administrative_general"];
  const customCats = [...new Set(expenseRows.map(r => r.category).filter(c => !baseCategories.includes(c) && c !== "personnel" && c !== "capital_financing"))];
  const categories = [...baseCategories, ...customCats];
  const categoryTotalRows: number[] = [];

  for (const cat of categories) {
    const catRows = expenseRows.filter(row => row.category === cat && row.enabled);
    if (catRows.length === 0) continue;

    r++;
    styleSectionRow(ws, r, cols);
    ws.getCell(r, 1).value = customCategoryLabels?.[cat] || EXPENSE_CATEGORY_LABELS[cat] || cat;

    const firstDataRow = r + 1;

    for (const row of catRows) {
      r++;
      ws.getCell(r, 1).value = row.lineItem;
      ws.getCell(r, 1).font = NORMAL_FONT;

      for (let y = 0; y < yearCount; y++) {
        const cell = ws.getCell(r, y + 2);
        const amt = row.amounts?.[y] ?? 0;
        const studentsCell = aRefs ? `Assumptions!B${aRefs.enrollmentRows[y]}` : `$B$2`;
        const revTotalRef = revTotalRow > 0 ? `'Revenue Schedule'!${String.fromCharCode(66 + y)}${revTotalRow}` : null;

        let cachedExpVal: number;
        if (row.driverType === "percent_of_revenue") {
          cachedExpVal = ((amt) / 100) * (precomputed?.totalRevenue[y] ?? 0);
        } else {
          cachedExpVal = computeDriverValue(row.amounts, y, row.driverType, enrollment[y] || 0);
        }

        if (row.driverType === "percent_of_revenue" && revTotalRef) {
          cell.value = { formula: `${amt / 100}*${revTotalRef}`, result: safeResult(cachedExpVal) };
        } else if (row.driverType === "per_student") {
          cell.value = { formula: `${amt}*${studentsCell}`, result: safeResult(cachedExpVal) };
        } else if (row.driverType === "monthly") {
          cell.value = { formula: `${amt}*12`, result: safeResult(cachedExpVal) };
        } else {
          cell.value = amt;
        }
        cell.numFmt = CURRENCY_FORMAT;
        styleDataCell(cell);
      }
    }

    r++;
    ws.getCell(r, 1).value = `Total ${(customCategoryLabels?.[cat] || EXPENSE_CATEGORY_LABELS[cat] || cat).split("/")[0].trim()}`;
    ws.getCell(r, 1).font = BOLD_FONT;
    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      if (catRows.length === 0) {
        cell.value = 0;
      } else {
        let catSubtotal = 0;
        for (const cr of catRows) {
          if (cr.driverType === "percent_of_revenue") {
            catSubtotal += ((cr.amounts?.[y] ?? 0) / 100) * (precomputed?.totalRevenue[y] ?? 0);
          } else {
            catSubtotal += computeDriverValue(cr.amounts, y, cr.driverType, enrollment[y] || 0);
          }
        }
        cell.value = { formula: `SUM(${c(firstDataRow, y + 2)}:${c(r - 1, y + 2)})`, result: safeResult(Math.round(catSubtotal)) };
      }
      cell.numFmt = CURRENCY_FORMAT;
      styleBoldDataCell(cell);
    }
    styleSectionRow(ws, r, cols);
    categoryTotalRows.push(r);
  }

  r += 2;
  ws.getCell(r, 1).value = "TOTAL OPERATING EXPENSES";
  ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    const sumParts = categoryTotalRows.map(tr => c(tr, y + 2)).join("+");
    cell.value = { formula: sumParts || "0", result: safeResult(precomputed?.totalExpenses[y] ?? 0) };
    cell.numFmt = CURRENCY_FORMAT;
    styleGrandTotalCell(cell);
  }
  styleSectionRow(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return r;
}

function buildCapitalDebtTab(
  ws: ExcelJS.Worksheet,
  rows: CapitalDebtRow[],
  enrollment: number[],
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  _aRefs?: AssumptionRefs,
): number {
  ws.columns = [{ width: 42 }, ...Array(yearCount).fill({ width: 18 })];
  ws.getRow(1).values = yearHeaders;
  styleHeaderRow(ws, 1, cols);

  let r = 2;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "CAPITAL EXPENDITURES & DEBT SERVICE";

  const enabledRows = rows.filter(row => row.enabled);
  const firstDataRow = r + 1;

  for (const row of enabledRows) {
    r++;
    ws.getCell(r, 1).value = row.lineItem;
    ws.getCell(r, 1).font = NORMAL_FONT;

    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
        cell.value = computeAnnualDebtService(row.loanPrincipal, (row.loanRate || 0) / 100, row.loanTermYears || 0);
      } else {
        const amt = row.amounts?.[y] ?? 0;
        const studentsCell = _aRefs ? `Assumptions!B${_aRefs.enrollmentRows[y]}` : null;
        const cachedCapVal = computeDriverValue(row.amounts, y, row.driverType, enrollment[y] || 0);
        if (row.driverType === "per_student" && studentsCell) {
          cell.value = { formula: `${amt}*${studentsCell}`, result: safeResult(cachedCapVal) };
        } else if (row.driverType === "monthly") {
          cell.value = { formula: `${amt}*12`, result: safeResult(cachedCapVal) };
        } else {
          cell.value = amt;
        }
      }
      cell.numFmt = CURRENCY_FORMAT;
      styleDataCell(cell);
    }
  }

  if (enabledRows.length === 0) {
    r++;
    ws.getCell(r, 1).value = "(No capital or debt items)";
    ws.getCell(r, 1).font = NORMAL_FONT;
    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      cell.value = 0;
      cell.numFmt = CURRENCY_FORMAT;
      styleDataCell(cell);
    }
  }

  r++;
  ws.getCell(r, 1).value = "TOTAL CAPITAL & DEBT";
  ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    if (enabledRows.length > 0) {
      let capSum = 0;
      for (const erow of enabledRows) {
        if (erow.isLoan && erow.loanPrincipal && erow.loanPrincipal > 0) {
          capSum += computeAnnualDebtService(erow.loanPrincipal, (erow.loanRate || 0) / 100, erow.loanTermYears || 0);
        } else {
          capSum += computeDriverValue(erow.amounts, y, erow.driverType, enrollment[y] || 0);
        }
      }
      cell.value = { formula: `SUM(${c(firstDataRow, y + 2)}:${c(r - 1, y + 2)})`, result: safeResult(Math.round(capSum)) };
    } else {
      cell.value = 0;
    }
    cell.numFmt = CURRENCY_FORMAT;
    styleBoldDataCell(cell);
  }
  styleSectionRow(ws, r, cols);

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return r;
}

function buildPnLTab(
  ws: ExcelJS.Worksheet,
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  revTotalRow: number,
  staffTotalRow: number,
  expTotalRow: number,
  capTotalRow: number,
  entityType?: string,
  precomputed?: PrecomputedFinancials,
  hasManagementFee?: boolean,
  founderCompData?: ModelData,
) {
  const niLabel = profitLabel(entityType);
  const cumNiLabel = cumulativeProfitLabel(entityType);

  ws.columns = [{ width: 35 }, ...Array(yearCount).fill({ width: 18 })];
  const headers = [`${yearCount === 3 ? "3" : "5"}-Year Financial Model`, ...yearHeaders.slice(1)];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, cols);

  const ROW_TOTAL_REV = "Total Revenue";
  const ROW_PERSONNEL = "Personnel Costs";
  const ROW_OPEX = "Operating Expenses";
  const ROW_MGMT_FEE = "Authorizer / Management Fee";
  const ROW_CAPDEBT = "Capital & Debt";
  const ROW_TOTAL_EXP = "Total Expenses";
  const ROW_RESERVE = "Operating Reserve (Months)";

  const pnlRows: Array<{ label: string; bold: boolean; section?: boolean; key: string }> = [
    { label: ROW_TOTAL_REV, bold: false, key: "totalrev" },
    { label: ROW_PERSONNEL, bold: false, key: "personnel" },
    { label: ROW_OPEX, bold: false, key: "opex" },
    ...(hasManagementFee ? [{ label: ROW_MGMT_FEE, bold: false, key: "mgmtfee" }] : []),
    { label: ROW_CAPDEBT, bold: false, key: "capdebt" },
    { label: ROW_TOTAL_EXP, bold: true, section: true, key: "totalexp" },
    { label: niLabel, bold: true, section: true, key: "ni" },
    { label: cumNiLabel, bold: false, key: "cumni" },
    { label: ROW_RESERVE, bold: false, key: "reserve" },
  ];

  // Task #692: dedicated, clearly-labeled founder-compensation lines so
  // lenders and board members can see the founder-pay impact at a glance.
  // Surfaced as memo / "of which" rows under the existing Personnel line —
  // they don't sum into Total Expenses (founder pay is already inside
  // Personnel Costs above) but they make the choice explicit, including a
  // separate Lender Normalization Adjustment line that mirrors the
  // in-app dashboard's view (`computeFounderCompNormalization`).
  let fc: ReturnType<typeof computeFounderCompNormalization> | undefined;
  let fcNotPayingYet = false;
  if (founderCompData) {
    fc = computeFounderCompNormalization(founderCompData as FullModelData, yearCount);
    const stRaw = (founderCompData.staffing || {}) as Record<string, unknown>;
    fcNotPayingYet = stRaw.notPayingFounderYet === true;
  }
  const showFounderRows = !!fc && (fc.reported.some((v) => v > 0) || fcNotPayingYet || fc.hasAdjustment);

  const rowMap: Record<string, number> = {};
  for (let idx = 0; idx < pnlRows.length; idx++) {
    rowMap[pnlRows[idx].key] = idx + 2;
  }

  for (let idx = 0; idx < pnlRows.length; idx++) {
    const item = pnlRows[idx];
    const r = idx + 2;
    ws.getCell(r, 1).value = item.label;
    ws.getCell(r, 1).font = item.bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      const colLetter = String.fromCharCode(66 + y);

      switch (item.key) {
        case "totalrev":
          cell.value = { formula: `'Revenue Schedule'!${colLetter}${revTotalRow}`, result: safeResult(precomputed?.totalRevenue[y] ?? 0) };
          break;
        case "personnel":
          cell.value = { formula: `'Staffing & Personnel'!${colLetter}${staffTotalRow}`, result: safeResult(precomputed?.totalPersonnel[y] ?? 0) };
          break;
        case "opex": {
          if (hasManagementFee) {
            const opexVal = (precomputed?.totalExpenses[y] ?? 0) - (precomputed?.managementFee[y] ?? 0);
            cell.value = { formula: `'Operating Expenses'!${colLetter}${expTotalRow}-${c(rowMap["mgmtfee"], y + 2)}`, result: safeResult(opexVal) };
          } else {
            cell.value = { formula: `'Operating Expenses'!${colLetter}${expTotalRow}`, result: safeResult(precomputed?.totalExpenses[y] ?? 0) };
          }
          break;
        }
        case "mgmtfee":
          cell.value = precomputed?.managementFee[y] ?? 0;
          break;
        case "capdebt":
          cell.value = { formula: `'Capital & Debt'!${colLetter}${capTotalRow}`, result: safeResult(precomputed?.totalCapDebt[y] ?? 0) };
          break;
        case "totalexp": {
          const expParts = [rowMap["personnel"], rowMap["opex"], rowMap["capdebt"]];
          if (hasManagementFee) expParts.push(rowMap["mgmtfee"]);
          const formula = expParts.map(pr => c(pr, y + 2)).join("+");
          cell.value = { formula, result: safeResult(precomputed?.totalAllExpenses[y] ?? 0) };
          break;
        }
        case "ni":
          cell.value = { formula: `${c(rowMap["totalrev"], y + 2)}-${c(rowMap["totalexp"], y + 2)}`, result: safeResult(precomputed?.netIncome[y] ?? 0) };
          break;
        case "cumni": {
          const cumVal = precomputed?.cumulativeNI[y] ?? 0;
          if (y === 0) {
            cell.value = { formula: `${c(rowMap["ni"], y + 2)}`, result: safeResult(cumVal) };
          } else {
            cell.value = { formula: `${c(rowMap["cumni"], y + 1)}+${c(rowMap["ni"], y + 2)}`, result: safeResult(cumVal) };
          }
          break;
        }
        case "reserve": {
          const totalExp = precomputed?.totalAllExpenses[y] ?? 0;
          const cumNI = precomputed?.cumulativeNI[y] ?? 0;
          const reserveVal = totalExp === 0 ? 0 : (cumNI > 0 ? cumNI / (totalExp / 12) : 0);
          cell.value = { formula: `IF(${c(rowMap["totalexp"], y + 2)}=0,0,IF(${c(rowMap["cumni"], y + 2)}>0,${c(rowMap["cumni"], y + 2)}/(${c(rowMap["totalexp"], y + 2)}/12),0))`, result: safeResult(reserveVal) };
          break;
        }
      }

      if (item.label === "Operating Reserve (Months)") {
        cell.numFmt = "0.0";
      } else {
        cell.numFmt = CURRENCY_FORMAT;
      }

      if (item.bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }

    if (item.section) styleSectionRow(ws, r, cols);
  }

  let nextRow = pnlRows.length + 2;
  if (showFounderRows && fc) {
    // Extend the P&L table by one column for the founder block's N-year
    // total so the section header, per-row writes, and total all live in
    // the same well-formed table shape.
    const totalColIdx = yearCount + 2;
    ws.getColumn(totalColIdx).width = 18;
    const fcCols = cols + 1;

    nextRow += 1;
    const sectionRow = nextRow;
    styleSectionRow(ws, sectionRow, fcCols);
    ws.getCell(sectionRow, 1).value = "FOUNDER COMPENSATION (memo — already in Personnel above)";
    ws.getCell(sectionRow, totalColIdx).value = `${yearCount}-Year Total`;

    const memoRows: Array<{ label: string; values: number[]; bold?: boolean }> = [
      { label: "  Founder compensation (as planned)", values: fc.reportedLoaded },
      { label: "  Founder compensation (market rate, normalized)", values: fc.normalizedLoaded },
      { label: "  Lender Normalization Adjustment (market - planned)", values: fc.delta, bold: true },
    ];
    for (const item of memoRows) {
      nextRow += 1;
      ws.getCell(nextRow, 1).value = item.label;
      ws.getCell(nextRow, 1).font = item.bold ? BOLD_FONT : NORMAL_FONT;
      let total = 0;
      for (let y = 0; y < yearCount; y++) {
        const cell = ws.getCell(nextRow, y + 2);
        const v = Math.round(item.values[y] || 0);
        total += v;
        cell.value = v;
        cell.numFmt = CURRENCY_FORMAT;
        if (item.bold) styleBoldDataCell(cell); else styleDataCell(cell);
      }
      const lastYearColLetter = String.fromCharCode(65 + yearCount);
      const totalCell = ws.getCell(nextRow, totalColIdx);
      totalCell.value = { formula: `SUM(B${nextRow}:${lastYearColLetter}${nextRow})`, result: safeResult(total) };
      totalCell.numFmt = CURRENCY_FORMAT;
      if (item.bold) styleBoldDataCell(totalCell); else styleDataCell(totalCell);
    }

    nextRow += 1;
    const note = fcNotPayingYet
      ? "Note: Founder selected \"not paying yet\" — reported founder compensation is $0. Lenders underwrite to the market-rate line."
      : fc.hasAdjustment
      ? "Note: Founder is paying themselves below market (\"sweat equity\"). Lenders / boards underwrite to the market-rate line."
      : "Note: Reported and market-rate founder compensation match — no adjustment is applied.";
    ws.getCell(nextRow, 1).value = note;
    ws.getCell(nextRow, 1).font = { ...NORMAL_FONT, italic: true, color: { argb: "FF64748B" } };
    ws.mergeCells(nextRow, 1, nextRow, fcCols);
    ws.getRow(nextRow).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(nextRow).height = 30;

    nextRow += 1; // gap before break-even
  }

  const beRow = nextRow;
  ws.getCell(beRow, 1).value = "Break-even";
  ws.getCell(beRow, 1).font = BOLD_FONT;
  let beCumNI = 0;
  let beYearIdx = -1;
  for (let y = 0; y < yearCount; y++) {
    beCumNI += precomputed?.netIncome[y] ?? 0;
    if (beYearIdx < 0 && beCumNI >= 0) beYearIdx = y;
  }
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(beRow, y + 2);
    if (y === beYearIdx) {
      cell.value = "✓ Break-even";
      cell.font = { bold: true, size: 11, name: "Calibri", color: { argb: "FF16A34A" } };
    } else {
      cell.value = "";
    }
    cell.border = {
      top: { style: "thin", color: { argb: "FFD0D0D0" } },
      bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
      left: { style: "thin", color: { argb: "FFD0D0D0" } },
      right: { style: "thin", color: { argb: "FFD0D0D0" } },
    };
    cell.alignment = { horizontal: "center" };
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

interface SummaryLayout {
  fmRevenueRow: number;
  fmStaffRow: number;
  fmExpenseRow: number;
  fmCapDebtRow: number;
  fmTotalExpRow: number;
  fmNIRow: number;
  fmCumNIRow: number;
  fmReserveRow: number;
  studentsRef: (colLetter: string) => string;
  revenueMix?: { tuitionPct: number[]; publicPct: number[]; philanthropyPct: number[] };
}

function buildSummaryTabNew(ws: ExcelJS.Worksheet, sp: SchoolProfile, yearCount: number, cols: number, yearHeaders: string[], layout: SummaryLayout, consultant?: ConsultantSummary, precomputed?: PrecomputedFinancials, enrollment?: number[]) {
  ws.columns = [{ width: 35 }, ...Array(yearCount).fill({ width: 18 })];

  let r = 1;
  ws.getCell(r, 1).value = "Financial Model Summary";
  ws.getCell(r, 1).font = { bold: true, size: 16, color: { argb: "FF1E293B" }, name: "Calibri" };
  ws.mergeCells(r, 1, r, cols);
  ws.getRow(r).height = 36;

  r = 2;
  ws.getCell(r, 1).value = "Prepared by SchoolStack Budget";
  ws.getCell(r, 1).font = { italic: true, size: 11, color: { argb: "FF888888" }, name: "Calibri" };

  r = 4;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "SCHOOL INFORMATION";

  const infoItems: [string, string][] = [
    ["School Name", sp.schoolName || ""],
    ["School Type", schoolTypeDisplay(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityTypeDisplay(sp.entityType)],
    ...(sp.ein ? [["EIN", sp.ein] as [string, string]] : []),
    ["School Stage", sp.schoolStage === "operating_school" ? "Operating School" : "New School"],
    ["State", sp.state || ""],
    ["Fiscal Year Start", MONTH_NAMES[sp.fiscalYearStartMonth || 7] || "July"],
    ["Accounting Basis", accountingBasisLabel(sp.accountingBasis)],
    ["Max Student Capacity", String(sp.maxCapacity || "N/A")],
  ];
  for (const [label, value] of infoItems) {
    r++;
    ws.getCell(r, 1).value = label; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = value; ws.getCell(r, 2).font = BOLD_FONT;
  }

  const fmTab = "'Financial Model'";

  r += 2;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "ENROLLMENT TREND";

  r++;
  ws.getRow(r).values = yearHeaders;
  styleHeaderRow(ws, r, cols);

  r++;
  ws.getCell(r, 1).value = "Students"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    const studRef = layout.studentsRef(cl);
    const studVal = enrollment?.[y] ?? 0;
    cell.value = { formula: studRef, result: safeResult(studVal) };
    cell.numFmt = NUMBER_FORMAT; styleDataCell(cell);
  }
  const enrollRow = r;

  r++;
  ws.getCell(r, 1).value = "Enrollment Growth %"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    if (y === 0) {
      cell.value = "-"; cell.font = NORMAL_FONT;
    } else {
      const prev = enrollment?.[y - 1] ?? 0;
      const curr = enrollment?.[y] ?? 0;
      const growthResult = prev > 0 ? (curr - prev) / prev : 0;
      cell.value = { formula: `IF(${c(enrollRow, y + 1)}=0,0,(${c(enrollRow, y + 2)}-${c(enrollRow, y + 1)})/${c(enrollRow, y + 1)})`, result: safeResult(growthResult) };
      cell.numFmt = PERCENT_FORMAT;
    }
    styleDataCell(cell);
  }

  r += 2;
  ws.getRow(r).values = yearHeaders;
  styleHeaderRow(ws, r, cols);
  const financialHeaderRow = r;

  r++;
  ws.getCell(r, 1).value = "Total Revenue"; ws.getCell(r, 1).font = NORMAL_FONT;
  const revSumRow = r;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmRevenueRow}`, result: safeResult(precomputed?.totalRevenue[y] ?? 0) };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Personnel Costs"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmStaffRow}`, result: safeResult(precomputed?.totalPersonnel[y] ?? 0) };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Operating Expenses"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmExpenseRow}`, result: safeResult(precomputed?.totalExpenses[y] ?? 0) };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Total Expenses"; ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmTotalExpRow}`, result: safeResult(precomputed?.totalAllExpenses[y] ?? 0) };
    cell.numFmt = CURRENCY_FORMAT; styleBoldDataCell(cell);
  }
  styleSectionRow(ws, r, cols);

  r++;
  ws.getCell(r, 1).value = profitLabel(sp.entityType); ws.getCell(r, 1).font = BOLD_FONT;
  const niSumRow = r;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    const niVal = precomputed?.netIncome[y] ?? 0;
    cell.value = { formula: `${fmTab}!${cl}${layout.fmNIRow}`, result: safeResult(niVal) };
    cell.numFmt = CURRENCY_FORMAT;
    styleGrandTotalCell(cell);
    if (precomputed) {
      applyHealthFill(cell, niVal, { green: 0, amber: -50000 });
    }
  }

  r++;
  ws.getCell(r, 1).value = cumulativeProfitLabel(sp.entityType); ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmCumNIRow}`, result: safeResult(precomputed?.cumulativeNI[y] ?? 0) };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Operating Reserve (Months)"; ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    const totalExp = precomputed?.totalAllExpenses[y] ?? 0;
    const cumNI = precomputed?.cumulativeNI[y] ?? 0;
    const reserveVal = totalExp === 0 ? 0 : (cumNI > 0 ? cumNI / (totalExp / 12) : 0);
    cell.value = { formula: `${fmTab}!${cl}${layout.fmReserveRow}`, result: safeResult(reserveVal) };
    cell.numFmt = "0.0"; styleBoldDataCell(cell);
    if (precomputed) {
      applyHealthFill(cell, reserveVal, { green: 3, amber: 2 });
    }
  }

  r += 2;
  styleSectionRow(ws, r, cols);
  ws.getCell(r, 1).value = "KEY RATIOS";

  r++;
  ws.getCell(r, 1).value = "Revenue per Student"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    const studRef = layout.studentsRef(cl);
    const studVal = enrollment?.[y] ?? 0;
    const revPerStudent = studVal > 0 ? (precomputed?.totalRevenue[y] ?? 0) / studVal : 0;
    cell.value = { formula: `IF(${studRef}=0,0,${c(revSumRow, y + 2)}/${studRef})`, result: safeResult(revPerStudent) };
    cell.numFmt = CURRENCY_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Personnel Cost as % of Revenue"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    const revVal = precomputed?.totalRevenue[y] ?? 0;
    const staffPct = revVal > 0 ? (precomputed?.totalPersonnel[y] ?? 0) / revVal : 0;
    cell.value = { formula: `IF(${c(revSumRow, y + 2)}=0,0,${fmTab}!${cl}${layout.fmStaffRow}/${c(revSumRow, y + 2)})`, result: safeResult(staffPct) };
    cell.numFmt = PERCENT_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Operating Cost as % of Revenue"; ws.getCell(r, 1).font = NORMAL_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cl = String.fromCharCode(66 + y);
    const cell = ws.getCell(r, y + 2);
    const revVal = precomputed?.totalRevenue[y] ?? 0;
    const expPct = revVal > 0 ? (precomputed?.totalExpenses[y] ?? 0) / revVal : 0;
    cell.value = { formula: `IF(${c(revSumRow, y + 2)}=0,0,${fmTab}!${cl}${layout.fmExpenseRow}/${c(revSumRow, y + 2)})`, result: safeResult(expPct) };
    cell.numFmt = PERCENT_FORMAT; styleDataCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = profitMarginLabel(sp.entityType); ws.getCell(r, 1).font = BOLD_FONT;
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(r, y + 2);
    const revVal = precomputed?.totalRevenue[y] ?? 0;
    const niVal = precomputed?.netIncome[y] ?? 0;
    const margin = revVal > 0 ? niVal / revVal : 0;
    cell.value = { formula: `IF(${c(revSumRow, y + 2)}=0,0,${c(niSumRow, y + 2)}/${c(revSumRow, y + 2)})`, result: safeResult(margin) };
    cell.numFmt = PERCENT_FORMAT; styleBoldDataCell(cell);
    if (precomputed) {
      applyHealthFill(cell, margin, { green: 0.05, amber: 0 });
    }
  }

  if (layout.revenueMix) {
    r += 2;
    styleSectionRow(ws, r, cols);
    ws.getCell(r, 1).value = "REVENUE MIX TREND";

    const mixMetrics = [
      { label: "Tuition & Fees %", data: layout.revenueMix.tuitionPct },
      { label: "Public Funding %", data: layout.revenueMix.publicPct },
      { label: "Philanthropy %", data: layout.revenueMix.philanthropyPct },
    ];

    for (const metric of mixMetrics) {
      r++;
      ws.getCell(r, 1).value = metric.label; ws.getCell(r, 1).font = NORMAL_FONT;
      for (let y = 0; y < yearCount; y++) {
        const cell = ws.getCell(r, y + 2);
        cell.value = metric.data[y] ?? 0;
        cell.numFmt = PERCENT_FORMAT; styleDataCell(cell);
      }
    }
  }

  if (consultant) {
    r += 2;
    styleSectionRow(ws, r, cols);
    ws.getCell(r, 1).value = "LENDER READINESS ASSESSMENT";

    r++;
    ws.getCell(r, 1).value = "Readiness Status"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = lenderReadinessCoachingHeadline(consultant.lenderReadiness);
    ws.getCell(r, 2).font = {
      bold: true,
      size: 11,
      name: "Calibri",
      color: { argb: consultant.lenderReadiness === "Strong" ? "FF16A34A" : consultant.lenderReadiness === "Needs Work" ? "FFD97706" : "FFDC2626" },
    };

    r++;
    ws.getCell(r, 1).value = "Assessment"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = consultant.lenderReadinessExplanation || ""; ws.getCell(r, 2).font = NORMAL_FONT;
    ws.mergeCells(r, 2, r, cols);
    ws.getRow(r).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = 30;

    r++;
    ws.getCell(r, 1).value = "Biggest Strength"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = consultant.biggestStrength || ""; ws.getCell(r, 2).font = BOLD_FONT;
    ws.mergeCells(r, 2, r, cols);

    r++;
    ws.getCell(r, 1).value = "Biggest Risk"; ws.getCell(r, 1).font = NORMAL_FONT;
    ws.getCell(r, 2).value = consultant.biggestRisk || ""; ws.getCell(r, 2).font = BOLD_FONT;
    ws.mergeCells(r, 2, r, cols);
  }

  ws.views = [{ state: "frozen", ySplit: financialHeaderRow, xSplit: 1 }];
}

function buildLegacyPnLTab(
  ws: ExcelJS.Worksheet,
  data: ModelData,
  enrollment: number[],
  yearCount: number,
  cols: number,
  yearHeaders: string[],
  prorationFactor: number,
) {
  ws.columns = [{ width: 35 }, ...Array(yearCount).fill({ width: 18 })];
  const headers = [`${yearCount}-Year Financial Model`, ...yearHeaders.slice(1)];
  ws.getRow(1).values = headers;
  styleHeaderRow(ws, 1, cols);

  const rev = (data.revenue || {}) as Record<string, number>;
  const st = (data.staffing || {}) as Record<string, number>;
  const fac = (data.facilities || {}) as Record<string, number>;

  const tuitionIncrease = (rev.annualTuitionIncrease || 0) / 100;
  const salaryIncrease = (fac.annualSalaryIncrease || 0) / 100;
  const costInflation = (fac.generalCostInflation || 0) / 100;

  const entityType = (data.schoolProfile as SchoolProfile | undefined)?.entityType;
  const niLbl = profitLabel(entityType);
  const cumNiLbl = cumulativeProfitLabel(entityType);

  const rows = [
    "Students", "Net Revenue", "Staffing Costs", "Operating Expenses",
    "Total Expenses", niLbl, cumNiLbl, "Operating Reserve (Months)",
  ];

  const revenueByYr: number[] = [];
  const staffByYr: number[] = [];
  const expByYr: number[] = [];
  const niByYr: number[] = [];
  const cumNIByYr: number[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = idx + 2;
    const label = rows[idx];
    const bold = label === "Total Expenses" || label === niLbl;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = bold ? BOLD_FONT : NORMAL_FONT;

    for (let y = 0; y < yearCount; y++) {
      const cell = ws.getCell(r, y + 2);
      const students = enrollment[y];
      const pf = y === 0 ? prorationFactor : 1;
      const salEsc = Math.pow(1 + salaryIncrease, y);
      const infEsc = Math.pow(1 + costInflation, y);

      let val = 0;
      switch (idx) {
        case 0:
          val = students;
          cell.numFmt = NUMBER_FORMAT;
          break;
        case 1: {
          const tuition = students * (rev.tuitionPerStudent || 0) * Math.pow(1 + tuitionIncrease, y) * pf;
          const otherFees = students * (rev.otherRevenuePerStudent || 0) * Math.pow(1 + tuitionIncrease, y) * pf;
          const discount = tuition * ((rev.scholarshipRate || 0) / 100);
          const esa = students * (rev.esaRevenuePerStudent || 0) * infEsc * pf;
          const pubFund = students * (rev.publicFundingPerStudent || 0) * infEsc * pf;
          const donations = ((rev.annualDonations || 0)) * infEsc * pf;
          const grants = (rev.foundationGrants || 0) * infEsc * pf;
          const capGifts = y === 0 ? (rev.capitalGifts || 0) : 0;
          val = tuition + otherFees - discount + esa + pubFund + donations + grants + capGifts;
          revenueByYr[y] = Math.round(val);
          cell.numFmt = CURRENCY_FORMAT;
          break;
        }
        case 2: {
          const spt = st.studentsPerTeacher || 1;
          const tc = spt > 0 ? Math.ceil(students / spt) : 0;
          const tp = tc * (st.teacherSalary || 0) * salEsc * pf;
          const ap = (st.adminStaffCount || 0) * (st.adminSalary || 0) * salEsc * pf;
          // Task #685: prefer the per-year `reportedFounderComp[]` series so
          // friendly start-date inputs (year-of-start proration + COLA across
          // years) flow into the operating-budget export. Falls back to the
          // legacy single-value `founderSalary` for older models.
          const reportedArr = Array.isArray(st.reportedFounderComp)
            ? (st.reportedFounderComp as number[])
            : undefined;
          const reportedY =
            reportedArr && reportedArr.length > 0
              ? (typeof reportedArr[y] === "number"
                  ? reportedArr[y]
                  : reportedArr[reportedArr.length - 1] || 0)
              : undefined;
          const fs =
            reportedY !== undefined
              ? reportedY * pf
              : (st.founderSalary || 0) * salEsc * pf;
          const totalSal = tp + ap + fs;
          val = totalSal + totalSal * ((st.benefitsRate || 0) / 100);
          staffByYr[y] = Math.round(val);
          cell.numFmt = CURRENCY_FORMAT;
          break;
        }
        case 3: {
          const rentInc = (fac.annualRentIncrease || 0) / 100;
          const rent = (fac.monthlyRent || 0) * 12 * Math.pow(1 + rentInc, y) * pf;
          const utils = (fac.annualUtilities || 0) * infEsc * pf;
          const ins = (fac.annualInsurance || 0) * infEsc * pf;
          const maint = (fac.facilityMaintenance || 0) * infEsc * pf;
          const curr = (fac.curriculumCostPerStudent || 0) * students * infEsc * pf;
          const tech = (fac.techCostPerStudent || 0) * students * infEsc * pf;
          const food = (fac.foodServicePerStudent || 0) * students * infEsc * pf;
          const trans = (fac.transportationAnnual || 0) * infEsc * pf;
          const stSvc = (fac.studentServicesAnnual || 0) * infEsc * pf;
          const mktg = (fac.annualMarketing || 0) * infEsc * pf;
          const pd = (fac.professionalDevelopment || 0) * infEsc * pf;
          const other = (fac.otherAnnualExpenses || 0) * infEsc * pf;
          const ds = computeAnnualDebtService(fac.loanAmount || 0, (fac.annualInterestRate || 0) / 100, fac.loanTermYears || 0) * pf;
          val = rent + utils + ins + maint + curr + tech + food + trans + stSvc + mktg + pd + other + ds;
          expByYr[y] = Math.round(val);
          cell.numFmt = CURRENCY_FORMAT;
          break;
        }
        case 4: {
          const totalExpVal = Math.round((staffByYr[y] || 0) + (expByYr[y] || 0));
          cell.value = { formula: `${c(4, y + 2)}+${c(5, y + 2)}`, result: safeResult(totalExpVal) };
          cell.numFmt = CURRENCY_FORMAT;
          if (bold) styleBoldDataCell(cell); else styleDataCell(cell);
          continue;
        }
        case 5: {
          const niVal = Math.round((revenueByYr[y] || 0) - (staffByYr[y] || 0) - (expByYr[y] || 0));
          niByYr[y] = niVal;
          cumNIByYr[y] = (y === 0 ? 0 : (cumNIByYr[y - 1] || 0)) + niVal;
          cell.value = { formula: `${c(3, y + 2)}-${c(6, y + 2)}`, result: safeResult(niVal) };
          cell.numFmt = CURRENCY_FORMAT;
          if (bold) styleBoldDataCell(cell); else styleDataCell(cell);
          continue;
        }
        case 6: {
          const cumVal = cumNIByYr[y] || 0;
          if (y === 0) {
            cell.value = { formula: `${c(7, y + 2)}`, result: safeResult(cumVal) };
          } else {
            cell.value = { formula: `${c(8, y + 1)}+${c(7, y + 2)}`, result: safeResult(cumVal) };
          }
          cell.numFmt = CURRENCY_FORMAT;
          styleDataCell(cell);
          continue;
        }
        case 7: {
          const totalExpAll = (staffByYr[y] || 0) + (expByYr[y] || 0);
          const cumVal = cumNIByYr[y] || 0;
          const reserveRes = totalExpAll === 0 ? 0 : (cumVal > 0 ? cumVal / (totalExpAll / 12) : 0);
          cell.value = { formula: `IF(${c(6, y + 2)}=0,0,IF(${c(8, y + 2)}>0,${c(8, y + 2)}/(${c(6, y + 2)}/12),0))`, result: safeResult(reserveRes) };
          cell.numFmt = "0.0";
          styleDataCell(cell);
          continue;
        }
      }

      cell.value = val;
      if (bold) styleBoldDataCell(cell); else styleDataCell(cell);
    }
  }

  styleSectionRow(ws, 6, cols);
  styleSectionRow(ws, 7, cols);

  const beRow = rows.length + 2;
  ws.getCell(beRow, 1).value = "Break-even";
  ws.getCell(beRow, 1).font = BOLD_FONT;
  let beYear = -1;
  for (let y = 0; y < yearCount; y++) {
    if ((cumNIByYr[y] || 0) >= 0) { beYear = y; break; }
  }
  for (let y = 0; y < yearCount; y++) {
    const cell = ws.getCell(beRow, y + 2);
    if (y === 0) {
      cell.value = { formula: `IF(${c(8, y + 2)}>=0,"✓ Break-even","")`, result: safeResult(y === beYear ? "✓ Break-even" : "") };
    } else {
      cell.value = { formula: `IF(AND(${c(8, y + 2)}>=0,${c(8, y + 1)}<0),"✓ Break-even","")`, result: safeResult(y === beYear ? "✓ Break-even" : "") };
    }
    cell.font = y === beYear
      ? { bold: true, size: 11, name: "Calibri", color: { argb: "FF16A34A" } }
      : NORMAL_FONT;
    cell.alignment = { horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
  }

  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];

  return { revenueByYr, staffByYr, expByYr, niByYr, cumNIByYr };
}
