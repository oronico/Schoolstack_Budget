import ExcelJS from "exceljs";
import { computeStraightLineDepreciation, computeProjectedAR } from "@workspace/finance";
import {
  NAVY, WHITE, LIGHT_GRAY, GREEN_BG, EVERGREEN, CREAM, INPUT_CELL_FILL, DASHBOARD_GREEN,
  HEADER_FILL, HEADER_FONT, SECTION_FILL, SECTION_FONT, NF, BF,
  CUR, PCT, NUM, BORDER, SUBTOTAL_BORDER, MONTH_NAMES,
  hdr, sec, dc, bc, gc, cn, colLetter, setFormula, inputCell, outputCell, printSetup,
  addInstructionsSheet, addDashboardSheet,
  schoolYearLabel, yearLabels, schoolTypeLabel, entityLabel, funcLabel, catLabel, expCatLabel, driverLabel,
  fundingLabel, stageLabel, accountingBasisLabel, schoolModelFromType, isNonprofit, netIncomeLabel, equityLabel,
  normalizeStaffingRow, getEnrollmentArray,
  computeAnnualDebt, computeAnnualDebtForYear, computeInterestPortion, computePrincipalPortion, computeRemainingBalance, computeDaysCashOnHand,
  computeRevLineItem, computeRevenueForYear, computePersonnelForYear, computeStaffingLoaded,
  computeExpenseForYear, computeFacilityCostByYear, computeInstructionalCostByYear, computeCapDebtForYear, computeDebtServiceForYear,
  driverVal, resolveEsc, tuitionWithTiers, computeNewStudents, computeReturningStudents, computeTotalFTE,
  buildPhaseTimelineData, buildPhaseDetails,
  OWNERSHIP_COLORS, OWNERSHIP_BG_COLORS,
  ModelData, SchoolProfile, RevenueRow, StaffingRow, ExpenseRow, CapitalDebtRow, TuitionTier,
  BENCHMARK_DSCR_GREEN,
} from "./workbook-helpers.js";
import { BENCHMARK_CURRENT_RATIO } from "./benchmark-thresholds.js";
import { addDecisionHistorySheet } from "./packets/build-decision-history.js";

const TAB_NAMES = [
  "Instructions", "Cover", "Assumptions", "Program Profile",
  "Enrollment Drivers", "Tuition & Funding", "Staffing Drivers", "OpEx Drivers", "Capital Stack",
  "Enrollment Tuition Fcst", "Staffing Costs Fcst", "Budget Detail", "Budget Summary",
  "Monthly Cash Flow Y1", "5-Year Operating Stmt", "Debt Schedule", "Balance Sheet",
  "DSCR & Covenants", "Sources & Uses", "Scenarios", "Underwriting Snapshot", "Financial Health",
  "Budget Narrative",
];

function resolveRowEscalation(escalationRate: number | undefined, fallback: number, overridden?: boolean): number {
  return overridden ? (escalationRate ?? 0) : resolveEsc(escalationRate, fallback);
}

function getProrationFactor(sp: SchoolProfile): number {
  if (sp.isPartialFirstYear) return (sp.year1OperatingMonths || 10) / 12;
  return 1;
}

function getOpMonths(sp: SchoolProfile): number {
  if (sp.isPartialFirstYear) return sp.year1OperatingMonths || 10;
  return 12;
}

function buildCover(wb: ExcelJS.Workbook, data: ModelData) {
  const ws = wb.addWorksheet("Cover");
  const sp = data.schoolProfile || {};
  ws.columns = [{ width: 4 }, { width: 40 }, { width: 40 }, { width: 4 }];
  printSetup(ws);

  let r = 3;
  ws.mergeCells(r, 2, r, 3);
  ws.getCell(r, 2).value = "SchoolStack Budget";
  ws.getCell(r, 2).font = { bold: true, size: 22, name: "Calibri", color: { argb: EVERGREEN } };
  ws.getCell(r, 2).alignment = { horizontal: "center" };

  r += 2;
  ws.mergeCells(r, 2, r, 3);
  ws.getCell(r, 2).value = "5-Year Financial Model & Underwriting Workbook";
  ws.getCell(r, 2).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };
  ws.getCell(r, 2).alignment = { horizontal: "center" };

  r += 3;
  const info = [
    ["School Name", sp.schoolName || "-"],
    ["School Type", schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityLabel(sp.entityType)],
    ["State", sp.state || "-"],
    ["Fiscal Year Start", sp.fiscalYearStartMonth ? `Month ${sp.fiscalYearStartMonth}` : "July"],
    ["Model Date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
    ["Stage", stageLabel(sp.schoolStage)],
    ["Funding Profile", fundingLabel(sp.fundingProfile)],
    ...(sp.accountingBasis ? [["Accounting Basis", accountingBasisLabel(sp.accountingBasis)] as [string, string]] : []),
  ];
  for (const [label, val] of info) {
    ws.getCell(r, 2).value = label; ws.getCell(r, 2).font = { ...NF, bold: true };
    ws.getCell(r, 3).value = val; ws.getCell(r, 3).font = NF;
    ws.getCell(r, 2).border = BORDER; ws.getCell(r, 3).border = BORDER;
    r++;
  }

  r += 2;
  ws.mergeCells(r, 2, r, 3);
  ws.getCell(r, 2).value = "Table of Contents";
  ws.getCell(r, 2).font = { bold: true, size: 13, name: "Calibri", color: { argb: NAVY } };
  r++;

  for (let i = 0; i < TAB_NAMES.length; i++) {
    ws.getCell(r, 2).value = `${i + 1}.`;
    ws.getCell(r, 2).font = NF;
    ws.getCell(r, 3).value = { text: TAB_NAMES[i], hyperlink: `#'${TAB_NAMES[i]}'!A1` };
    ws.getCell(r, 3).font = { ...NF, color: { argb: EVERGREEN }, underline: true };
    r++;
  }

  r += 2;
  ws.mergeCells(r, 2, r, 3);
  ws.getCell(r, 2).value = "CONFIDENTIAL - Prepared by SchoolStack Budget (budget.schoolstack.ai)";
  ws.getCell(r, 2).font = { size: 11, name: "Calibri", color: { argb: "FF999999" }, italic: true };
  ws.getCell(r, 2).alignment = { horizontal: "center" };
}

function buildInstructions(wb: ExcelJS.Workbook, data: ModelData) {
  const sp = data.schoolProfile || {} as SchoolProfile;
  addInstructionsSheet(wb, {
    workbookType: "underwriting",
    tabNames: TAB_NAMES,
    schoolName: sp.schoolName || undefined,
    schoolType: sp.entityType || undefined,
  });
}

interface AsmReg {
  enrollRow: number;
  revStartRow: number;
  staffStartRow: number;
  expStartRow: number;
  capStartRow: number;
  salaryEscRow: number;
  costInflRow: number;
  prorationRow: number;
  startCashRow: number;
  maxCapRow: number;
  debtIncRow: number;
  spedRow?: number;
  ellRow?: number;
  ecoDisRow?: number;
}

function buildAssumptions(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], salaryEsc: number, costInflation: number, prorationFactor: number, startingCash: number): AsmReg {
  const ws = wb.addWorksheet("Assumptions");
  const sp = data.schoolProfile || {};
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = (data.expenseRows || []).filter(r => r.enabled);
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const yLabels = yearLabels(sp.openingYear);
  ws.columns = [{ width: 36 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 7);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} - Assumptions`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };
  ws.getRow(r).height = 32;

  r++;
  ws.getCell(r, 1).fill = INPUT_CELL_FILL;
  ws.getCell(r, 1).value = "";
  ws.getCell(r, 2).value = "Editable assumption \u2014 change this value";
  ws.getCell(r, 2).font = { size: 11, name: "Calibri", italic: true, color: { argb: "FF666666" } };
  ws.getCell(r, 4).value = "";
  ws.getCell(r, 4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
  ws.getCell(r, 4).border = { bottom: { style: "thin", color: { argb: "FFD0D0D0" } } };
  ws.getCell(r, 5).value = "Calculated \u2014 driven by formula";
  ws.getCell(r, 5).font = { size: 11, name: "Calibri", italic: true, color: { argb: "FF666666" } };

  r += 2;
  sec(ws, r, 7); ws.getCell(r, 1).value = "SCHOOL PROFILE";
  const profileData: [string, string | number][] = [
    ["School Name", sp.schoolName || ""],
    ["School Type", schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityLabel(sp.entityType)],
    ["State", sp.state || ""],
    ["EIN", sp.ein || ""],
    ["Stage", stageLabel(sp.schoolStage)],
    ["Funding Profile", fundingLabel(sp.fundingProfile)],
    ...(sp.accountingBasis ? [["Accounting Basis", accountingBasisLabel(sp.accountingBasis)] as [string, string | number]] : []),
    ["Fiscal Year Start Month", sp.fiscalYearStartMonth || 7],
    ["Max Capacity", sp.maxCapacity || 0],
  ];
  for (const [label, val] of profileData) {
    r++;
    ws.getCell(r, 1).value = label; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = val; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  }
  const maxCapRow = r;

  r += 2;
  sec(ws, r, 7); ws.getCell(r, 1).value = "ENROLLMENT";
  r++;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);
  r++;
  ws.getCell(r, 1).value = "Total Students"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = enrollment[y]; cell.numFmt = NUM; dc(cell); inputCell(cell);
  }
  const enrollRow = r;

  r += 2;
  sec(ws, r, 7); ws.getCell(r, 1).value = "REVENUE DRIVERS";
  r++;
  ws.getRow(r).values = ["Line Item", "Category", "Driver", "Amount", "Escalation %", "Timing"];
  hdr(ws, r, 6);
  const revStartRow = r + 1;
  for (const rv of revenueRows) {
    r++;
    ws.getCell(r, 1).value = rv.lineItem || "Unnamed"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = catLabel(rv.category); dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = driverLabel(rv.driverType); dc(ws.getCell(r, 3));
    ws.getCell(r, 4).value = rv.amounts?.[0] ?? 0; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = (rv.escalationRate ?? 0) / 100; ws.getCell(r, 5).numFmt = PCT; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
    const timingStatus = (rv as unknown as Record<string, unknown>).timingOverridden ? "Custom" : "Default";
    ws.getCell(r, 6).value = timingStatus; dc(ws.getCell(r, 6));
    if ((rv as unknown as Record<string, unknown>).timingOverridden) {
      ws.getCell(r, 6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
    }
  }

  if (tiers.length > 0) {
    r += 2;
    sec(ws, r, 7); ws.getCell(r, 1).value = "TUITION TIERS";
    r++;
    ws.getRow(r).values = ["Tier", "Discount %", ...yLabels.slice(0, 5).map((_, i) => `Yr ${i + 1} Students`)];
    hdr(ws, r, 7);
    for (const t of tiers) {
      r++;
      ws.getCell(r, 1).value = t.label || t.tierType; dc(ws.getCell(r, 1));
      ws.getCell(r, 2).value = (t.discountPercent || 0) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
      for (let y = 0; y < 5; y++) {
        const cell = ws.getCell(r, y + 3);
        cell.value = t.studentCounts?.[y] ?? 0; cell.numFmt = NUM; dc(cell); inputCell(cell);
      }
    }
  }

  r += 2;
  sec(ws, r, 7); ws.getCell(r, 1).value = "STAFFING";
  r++;
  ws.getRow(r).values = ["Role", "Category", "Type", "FTE", "Rate", "Benefits %", "Tax %"];
  hdr(ws, r, 7);
  const staffStartRow = r + 1;
  for (const sr of staffingRows) {
    r++;
    ws.getCell(r, 1).value = sr.roleName; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = funcLabel(sr.functionCategory); dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = sr.employmentType; dc(ws.getCell(r, 3));
    ws.getCell(r, 4).value = sr.fte; ws.getCell(r, 4).numFmt = "0.00"; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = sr.annualizedRate; ws.getCell(r, 5).numFmt = CUR; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
    ws.getCell(r, 6).value = sr.benefitsRate / 100; ws.getCell(r, 6).numFmt = PCT; dc(ws.getCell(r, 6)); inputCell(ws.getCell(r, 6));
    ws.getCell(r, 7).value = sr.payrollTaxRate / 100; ws.getCell(r, 7).numFmt = PCT; dc(ws.getCell(r, 7)); inputCell(ws.getCell(r, 7));
  }

  r += 2;
  sec(ws, r, 7); ws.getCell(r, 1).value = "OPERATING EXPENSES";
  r++;
  ws.getRow(r).values = ["Line Item", "Category", "Driver", "Amount", "Escalation %"];
  hdr(ws, r, 5);
  const expStartRow = r + 1;
  for (const ex of expenseRows) {
    r++;
    ws.getCell(r, 1).value = ex.lineItem || "Unnamed"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = expCatLabel(ex.category, data.customCategoryLabels); dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = driverLabel(ex.driverType); dc(ws.getCell(r, 3));
    ws.getCell(r, 4).value = ex.amounts?.[0] ?? 0; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = (ex.escalationRate ?? 0) / 100; ws.getCell(r, 5).numFmt = PCT; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
  }

  r += 2;
  sec(ws, r, 7); ws.getCell(r, 1).value = "CAPITAL & DEBT";
  r++;
  ws.getRow(r).values = ["Instrument", "Type", "Principal", "Rate", "Term (Yrs)"];
  hdr(ws, r, 5);
  const capStartRow = r + 1;
  for (const cd of capDebtRows) {
    r++;
    ws.getCell(r, 1).value = cd.lineItem || "Unnamed"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = cd.isLoan ? "Loan" : "Capital"; dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = cd.isLoan ? (cd.loanPrincipal || 0) : (cd.amounts?.[0] ?? 0);
    ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));
    ws.getCell(r, 4).value = cd.isLoan ? ((cd.loanRate || 0) / 100) : 0;
    ws.getCell(r, 4).numFmt = PCT; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = cd.isLoan ? (cd.loanTermYears || 0) : 0;
    ws.getCell(r, 5).numFmt = NUM; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
  }

  r += 2;
  sec(ws, r, 7); ws.getCell(r, 1).value = "GROWTH & TIMING";
  r++;
  ws.getCell(r, 1).value = "Salary Escalation Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = salaryEsc; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  ws.getCell(r, 3).value = "Salary input or tuition escalation fallback"; ws.getCell(r, 3).font = { ...NF, italic: true, color: { argb: "FF808080" } };
  const salaryEscRow = r;

  r++;
  ws.getCell(r, 1).value = "Cost Inflation Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = costInflation; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  ws.getCell(r, 3).value = "Cost inflation input or tuition escalation fallback"; ws.getCell(r, 3).font = { ...NF, italic: true, color: { argb: "FF808080" } };
  const costInflRow = r;

  r++;
  ws.getCell(r, 1).value = "Year 1 Proration Factor"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = prorationFactor; ws.getCell(r, 2).numFmt = "0.00"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  const prorationRow = r;

  r++;
  ws.getCell(r, 1).value = "Starting Cash"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  const startCashRow = r;

  r++;
  ws.getCell(r, 1).value = "Debt Included"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = sp.debtIncluded !== false ? "Yes" : "No"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  const debtIncRow = r;

  r++;
  ws.getCell(r, 1).value = "Enrollment Growth Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = (sp.enrollmentGrowthRate ?? 0) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++;
  ws.getCell(r, 1).value = "Rent Escalation Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = (Number(data.facilities?.annualRentIncrease ?? 3)) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++;
  ws.getCell(r, 1).value = "Tuition Escalation Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = (data.tuitionEscalation?.rate ?? 3) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++;
  ws.getCell(r, 1).value = "Default Benefits Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = (Number(data.staffing?.benefitsRate ?? 25)) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++;
  ws.getCell(r, 1).value = "Default Payroll Tax Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = (Number(data.staffing?.payrollTaxRate ?? 8)) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++;
  ws.getCell(r, 1).value = "Student Retention Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = (data.enrollment?.retentionRate ?? 85) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  const revDefaults = (data as Record<string, unknown>).revenueDefaults as { billingMonths?: number; collectionMethod?: string; collectionRate?: number; collectionDelayDays?: number } | undefined;
  r += 2;
  sec(ws, r, 7); ws.getCell(r, 1).value = "REVENUE COLLECTION DEFAULTS";
  const BILLING_LABELS: Record<number, string> = { 9: "9 months (Sep-May)", 10: "10 months (Aug-May)", 12: "12 months (year-round)" };
  const COLL_LABELS: Record<string, string> = { autopay: "Autopay", invoiced: "Invoiced", mixed: "Mixed" };
  r++;
  ws.getCell(r, 1).value = "Default Billing Months"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = BILLING_LABELS[revDefaults?.billingMonths ?? 10] || "10 months"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  r++;
  ws.getCell(r, 1).value = "Default Collection Method"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = COLL_LABELS[revDefaults?.collectionMethod ?? "autopay"] || "Autopay"; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  r++;
  ws.getCell(r, 1).value = "Default Collection Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = (revDefaults?.collectionRate ?? 100) / 100; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
  r++;
  ws.getCell(r, 1).value = "Default Collection Delay"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = `${revDefaults?.collectionDelayDays ?? 0} days`; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

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
    const adaRatio = (sp.priorYearADM || 0) > 0 ? Math.min((sp.priorYearADA || 0) / (sp.priorYearADM || 1), 1) : 0.95;
    ws.getCell(r, 1).value = "Attendance Ratio (ADA ÷ ADM)"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = adaRatio; ws.getCell(r, 2).numFmt = "0.00%"; dc(ws.getCell(r, 2));
    r += 2;
    ws.getRow(r).values = ["Per-Pupil Rate", ...yLabels.slice(0, 3).map((_, i) => ["K-5", "6-8", "9-12"][i])];
    hdr(ws, r, 4);
    r++;
    ws.getCell(r, 1).value = "Rate per Student"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = gbp.k5 || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = gbp.m68 || 0; ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));
    ws.getCell(r, 4).value = gbp.h912 || 0; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    r += 2;
    ws.getRow(r).values = ["Grade-Band Enrollment", ...yLabels];
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

  let spedRow: number | undefined;
  let ellRow: number | undefined;
  let ecoDisRow: number | undefined;

  const hasWeighted = (sp.spedCount?.some(v => v > 0)) || (sp.ellCount?.some(v => v > 0)) || (sp.ecoDisCount?.some(v => v > 0));
  if (hasWeighted) {
    r += 2;
    sec(ws, r, 7); ws.getCell(r, 1).value = "WEIGHTED ENROLLMENT POPULATIONS";
    r++;
    ws.getRow(r).values = ["Population", ...yLabels];
    hdr(ws, r, 6);
    const weightedGroups: { label: string; data: number[] | undefined; setRow: (row: number) => void }[] = [
      { label: "Special Education (SPED)", data: sp.spedCount, setRow: (row: number) => { spedRow = row; } },
      { label: "English Language Learners (ELL)", data: sp.ellCount, setRow: (row: number) => { ellRow = row; } },
      { label: "Economically Disadvantaged", data: sp.ecoDisCount, setRow: (row: number) => { ecoDisRow = row; } },
    ];
    for (const group of weightedGroups) {
      if (!group.data?.some(v => v > 0)) continue;
      r++;
      group.setRow(r);
      ws.getCell(r, 1).value = group.label; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const cell = ws.getCell(r, y + 2);
        cell.value = group.data?.[y] ?? 0; cell.numFmt = NUM; dc(cell); inputCell(cell);
      }
    }
  }

  return { enrollRow, revStartRow, staffStartRow, expStartRow, capStartRow, salaryEscRow, costInflRow, prorationRow, startCashRow, maxCapRow, debtIncRow, spedRow, ellRow, ecoDisRow };
}

function buildProgramProfile(wb: ExcelJS.Workbook, data: ModelData) {
  const ws = wb.addWorksheet("Program Profile");
  const sp = data.schoolProfile || {};
  const hasPhases = sp.facilityPhases && sp.facilityPhases.length > 0;
  ws.columns = hasPhases
    ? [{ width: 36 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }]
    : [{ width: 36 }, { width: 30 }];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 2);
  ws.getCell(r, 1).value = "Program Profile";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  const entries: [string, string][] = [
    ["School Model", schoolModelFromType(sp.schoolType)],
    ["School Type", schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityLabel(sp.entityType)],
    ["Financial Label Convention", isNonprofit(sp.entityType) ? "Nonprofit (Change in Net Assets / Net Assets)" : "For-Profit (Profit & Loss / Equity)"],
    ["Stage", stageLabel(sp.schoolStage)],
    ["Funding Mix", fundingLabel(sp.fundingProfile)],
    ["Fiscal Year Start Month", String(sp.fiscalYearStartMonth || 7)],
    ["Year 1 Operating Months", String(sp.isPartialFirstYear ? (sp.year1OperatingMonths || 10) : 12)],
    ["Proration Factor", `${(getProrationFactor(sp) * 100).toFixed(1)}%`],
    ["Debt Included", sp.debtIncluded !== false ? "Yes" : "No"],
    ["Max Capacity", String(sp.maxCapacity || "N/A")],
    ["Accredited", sp.isAccredited ? `Yes - ${sp.accreditingBody || ""}` : "No"],
    ["Location", sp.locationSecured ? `${sp.facilityStreet || ""}, ${sp.facilityCity || ""}, ${sp.facilityState || ""} ${sp.facilityZip || ""}`.trim() : "Not yet secured"],
    ["Facility", ({ own: "Owned", rent: "Leased", donated: "Donated / No-Cost", home_based: "Home-Based" } as Record<string, string>)[sp.ownershipType || ""] || (sp.locationSecured ? "Secured" : "Not yet secured")],
  ];
  if (sp.facilityPhases && sp.facilityPhases.length > 0) {
    entries.pop();
    entries.push(["Facility Timeline", `${sp.facilityPhases.length} phase(s)`]);
  }
  for (const [label, val] of entries) {
    ws.getCell(r, 1).value = label; bc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = val; dc(ws.getCell(r, 2));
    r++;
  }

  if (sp.facilityPhases && sp.facilityPhases.length > 0) {
    const yLabelsUW = yearLabels(sp.openingYear);
    const timeline = buildPhaseTimelineData(sp.facilityPhases);
    const phaseDetails = buildPhaseDetails(sp.facilityPhases);

    r++;
    ws.getCell(r, 1).value = "";
    for (let yi = 0; yi < 5; yi++) {
      ws.getCell(r, yi + 2).value = yLabelsUW[yi];
      ws.getCell(r, yi + 2).font = SECTION_FONT;
      ws.getCell(r, yi + 2).alignment = { horizontal: "center" };
    }
    for (let c = 1; c <= 6; c++) { ws.getCell(r, c).fill = SECTION_FILL; ws.getCell(r, c).border = BORDER; }
    ws.getRow(r).height = 24;

    r++;
    ws.getCell(r, 1).value = "Arrangement"; bc(ws.getCell(r, 1));
    for (let yi = 0; yi < 5; yi++) {
      const cell = ws.getCell(r, yi + 2);
      const yearData = timeline.get(yi + 1);
      if (yearData) {
        cell.value = yearData.label;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: OWNERSHIP_BG_COLORS[yearData.ownershipType] || LIGHT_GRAY } };
        cell.font = { ...BF, color: { argb: OWNERSHIP_COLORS[yearData.ownershipType] || NAVY } };
      } else {
        cell.value = "—";
        cell.font = NF;
      }
      cell.alignment = { horizontal: "center" };
      cell.border = BORDER;
    }

    r++;
    ws.getCell(r, 1).value = "Monthly Cost"; dc(ws.getCell(r, 1));
    for (let yi = 0; yi < 5; yi++) {
      const cell = ws.getCell(r, yi + 2);
      const yearData = timeline.get(yi + 1);
      if (!yearData) {
        cell.value = "—";
      } else if (yearData.monthlyCost > 0) {
        cell.value = yearData.monthlyCost;
        cell.numFmt = CUR;
      } else {
        cell.value = "—";
      }
      cell.alignment = { horizontal: "center" };
      dc(cell);
    }

    r++;
    ws.getCell(r, 1).value = "Key Terms"; dc(ws.getCell(r, 1));
    for (let yi = 0; yi < 5; yi++) {
      const cell = ws.getCell(r, yi + 2);
      const yearData = timeline.get(yi + 1);
      cell.value = !yearData ? "—" : (yearData.keyTerms || "");
      cell.alignment = { horizontal: "center", wrapText: true };
      dc(cell);
    }

    for (const pd of phaseDetails) {
      r++;
      ws.getCell(r, 1).value = `${pd.label} (${pd.yearRange})`;
      ws.getCell(r, 1).font = { ...BF, color: { argb: pd.color } };
      for (let c = 1; c <= 6; c++) {
        ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: pd.bgColor } };
        ws.getCell(r, c).border = BORDER;
      }

      for (const [label, value, fmt] of pd.details) {
        r++;
        ws.getCell(r, 1).value = `  ${label}`; dc(ws.getCell(r, 1));
        ws.getCell(r, 2).value = value;
        if (fmt) ws.getCell(r, 2).numFmt = fmt;
        dc(ws.getCell(r, 2));
      }
    }
  }
}

interface EnrollmentDriverRefs {
  programRows: Map<string, number>;
  startCol: number;
  sheetName: string;
}

function buildEnrollmentDrivers(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], asmReg: AsmReg): EnrollmentDriverRefs {
  const ws = wb.addWorksheet("Enrollment Drivers");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const programs = data.programs || [];
  ws.columns = [{ width: 32 }, ...Array(7).fill({ width: 14 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 7);
  ws.getCell(r, 1).value = "Enrollment Drivers";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  const hasHistory = sp.schoolStage === "operating_school";
  const headers = hasHistory ? ["", "Prior Year", "Current Year", ...yLabels] : ["", ...yLabels];
  const cols = headers.length;
  ws.getRow(r).values = headers;
  hdr(ws, r, cols);

  let programFirstRow = 0;
  let programLastRow = 0;
  const programRows = new Map<string, number>();
  if (programs.length > 0) {
    r++;
    sec(ws, r, cols); ws.getCell(r, 1).value = "BY PROGRAM";
    programFirstRow = r + 1;
    for (let pi = 0; pi < programs.length; pi++) {
      const p = programs[pi];
      r++;
      programRows.set(String(pi), r);
      ws.getCell(r, 1).value = p.name || "Program"; dc(ws.getCell(r, 1));
      let c = 2;
      if (hasHistory) {
        ws.getCell(r, c).value = p.priorYear ?? 0; ws.getCell(r, c).numFmt = NUM; dc(ws.getCell(r, c)); c++;
        ws.getCell(r, c).value = p.currentYear ?? 0; ws.getCell(r, c).numFmt = NUM; dc(ws.getCell(r, c)); c++;
      }
      for (let y = 0; y < 5; y++) {
        const v = [p.year1, p.year2, p.year3, p.year4, p.year5][y];
        ws.getCell(r, c).value = v; ws.getCell(r, c).numFmt = NUM; dc(ws.getCell(r, c)); inputCell(ws.getCell(r, c));
        c++;
      }
    }
    programLastRow = r;
  }

  r += 2;
  sec(ws, r, cols); ws.getCell(r, 1).value = "TOTAL ENROLLMENT";
  r++;
  const totalStudentsRow = r;
  ws.getCell(r, 1).value = "Total Students"; bc(ws.getCell(r, 1));
  const startCol = hasHistory ? 4 : 2;
  let c = 2;
  if (hasHistory) {
    ws.getCell(r, c).value = data.priorYearSnapshot?.endingEnrollment ?? 0; ws.getCell(r, c).numFmt = NUM; bc(ws.getCell(r, c)); c++;
    ws.getCell(r, c).value = data.currentYearProjection?.currentEnrollment ?? 0; ws.getCell(r, c).numFmt = NUM; bc(ws.getCell(r, c)); c++;
  }
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(r, c);
    if (programs.length > 0 && programFirstRow > 0 && programLastRow > 0) {
      setFormula(cell, `SUM(${cn(programFirstRow, c)}:${cn(programLastRow, c)})`, enrollment[y]);
    } else {
      cell.value = enrollment[y];
    }
    cell.numFmt = NUM; gc(cell); outputCell(cell);
    c++;
  }

  r++;
  ws.getCell(r, 1).value = "Max Capacity"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = sp.maxCapacity || 0; ws.getCell(r, 2).numFmt = NUM; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  r++;
  ws.getCell(r, 1).value = "Capacity Utilization"; dc(ws.getCell(r, 1));
  const cap = sp.maxCapacity || 0;
  const capCellAddr = `$${colLetter(2)}$${r - 1}`;
  for (let y = 0; y < 5; y++) {
    const col = startCol + y;
    const cell = ws.getCell(r, col);
    const totalAddr = cn(totalStudentsRow, col);
    if (cap > 0) {
      setFormula(cell, `${totalAddr}/${capCellAddr}`, enrollment[y] / cap);
    } else {
      cell.value = 0;
    }
    cell.numFmt = PCT; dc(cell); outputCell(cell);
  }

  r += 2;
  ws.getCell(r, 1).value = "Enrollment Growth Rate"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const col = startCol + y;
    const cell = ws.getCell(r, col);
    if (y === 0) {
      cell.value = "-"; dc(cell);
    } else {
      const prevAddr = cn(totalStudentsRow, col - 1);
      const curAddr = cn(totalStudentsRow, col);
      const prev = enrollment[y - 1];
      setFormula(cell, `IF(${prevAddr}=0,0,(${curAddr}-${prevAddr})/${prevAddr})`, prev > 0 ? (enrollment[y] - prev) / prev : 0);
      cell.numFmt = PCT; dc(cell);
    }
  }

  const hasWeightedEnrollment = asmReg.spedRow || asmReg.ellRow || asmReg.ecoDisRow;
  if (hasWeightedEnrollment) {
    r += 2;
    sec(ws, r, cols); ws.getCell(r, 1).value = "WEIGHTED ENROLLMENT POPULATIONS";
    r++;
    const weightedGroups: { label: string; asmRow: number | undefined; data: number[] | undefined }[] = [
      { label: "Special Education (SPED)", asmRow: asmReg.spedRow, data: sp.spedCount as number[] | undefined },
      { label: "English Language Learners (ELL)", asmRow: asmReg.ellRow, data: sp.ellCount as number[] | undefined },
      { label: "Economically Disadvantaged", asmRow: asmReg.ecoDisRow, data: sp.ecoDisCount as number[] | undefined },
    ];
    const weightedPopRows: number[] = [];
    for (const group of weightedGroups) {
      if (!group.asmRow) continue;
      r++;
      weightedPopRows.push(r);
      ws.getCell(r, 1).value = group.label; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const col = startCol + y;
        const cell = ws.getCell(r, col);
        const asmCol = y + 2;
        const val = group.data?.[y] ?? 0;
        setFormula(cell, `Assumptions!${cn(group.asmRow, asmCol)}`, val);
        cell.numFmt = NUM; dc(cell); outputCell(cell);
      }
    }
    if (weightedPopRows.length > 0) {
      r++;
      ws.getCell(r, 1).value = "Total Weighted Population"; bc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const col = startCol + y;
        const cell = ws.getCell(r, col);
        const sumParts = weightedPopRows.map(wr => cn(wr, col)).join("+");
        const total = (sp.spedCount?.[y] ?? 0) + (sp.ellCount?.[y] ?? 0) + (sp.ecoDisCount?.[y] ?? 0);
        setFormula(cell, sumParts, total);
        cell.numFmt = NUM; gc(cell); outputCell(cell);
      }
      const totalRow = r;
      r++;
      ws.getCell(r, 1).value = "Weighted % of Total"; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const col = startCol + y;
        const cell = ws.getCell(r, col);
        const enrollAddr = cn(totalStudentsRow, col);
        const totalAddr = cn(totalRow, col);
        const pct = enrollment[y] > 0 ? ((sp.spedCount?.[y] ?? 0) + (sp.ellCount?.[y] ?? 0) + (sp.ecoDisCount?.[y] ?? 0)) / enrollment[y] : 0;
        setFormula(cell, `IF(${enrollAddr}=0,0,${totalAddr}/${enrollAddr})`, pct);
        cell.numFmt = PCT; dc(cell); outputCell(cell);
      }
    }
  }

  return { programRows, startCol, sheetName: "Enrollment Drivers" };
}

function buildTuitionFunding(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], edRefs: EnrollmentDriverRefs) {
  const ws = wb.addWorksheet("Tuition & Funding");
  const sp = data.schoolProfile || {};
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const programs = data.programs || [];
  const yLabels = yearLabels(sp.openingYear);
  const costInflPct = (data.tuitionEscalation?.rate ?? 3);
  const hasProgramBreakdown = programs.length > 0;
  ws.columns = [{ width: 36 }, ...Array(6).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "Tuition & Funding Drivers";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  const CATEGORY_ORDER = [
    "tuition_and_fees", "tuition_offsets", "school_choice",
    "public_funding", "grants_contributions", "philanthropy",
    "other_revenue",
  ];

  const catMap = new Map<string, RevenueRow[]>();
  for (const rv of revenueRows) {
    const cat = rv.category || "other_revenue";
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat)!.push(rv);
  }

  const orderedCats = [...CATEGORY_ORDER];
  for (const cat of catMap.keys()) {
    if (!orderedCats.includes(cat)) orderedCats.push(cat);
  }

  const isPerStudent = (dt: string) => dt === "per_student" || dt === "percent_of_base";
  const categorySubtotalRows: number[] = [];

  for (const cat of orderedCats) {
    const rows = catMap.get(cat);
    if (!rows || rows.length === 0) continue;

    r++;
    sec(ws, r, 6);
    ws.getCell(r, 1).value = catLabel(cat).toUpperCase();

    const catLineFirstRow = r + 1;
    const lineSubtotalRows: number[] = [];

    for (const rv of rows) {
      const sign = cat === "tuition_offsets" ? -1 : 1;

      if (hasProgramBreakdown && isPerStudent(rv.driverType) && rv.driverType !== "percent_of_base") {
        r++;
        ws.getCell(r, 1).value = rv.lineItem;
        ws.getCell(r, 1).font = { ...BF, italic: true, color: { argb: NAVY } };

        const rateRow = r + 1;
        r++;
        ws.getCell(r, 1).value = "  Rate / Student"; dc(ws.getCell(r, 1));
        const esc = resolveRowEscalation(rv.escalationRate, costInflPct, rv.escalationRateOverridden);
        const base = rv.amounts?.[0] ?? 0;
        const hasEsc = esc > 0;
        const escRow = hasEsc ? rateRow + 1 : 0;
        for (let y = 0; y < 5; y++) {
          const cell = ws.getCell(rateRow, y + 2);
          const rate = y === 0 ? base : base * Math.pow(1 + esc / 100, y);
          if (y === 0) {
            cell.value = Math.round(rate); inputCell(cell);
          } else if (hasEsc) {
            const prevRateAddr = cn(rateRow, y + 1);
            const escAddr = `$B$${escRow}`;
            setFormula(cell, `ROUND(${prevRateAddr}*(1+${escAddr}),0)`, Math.round(rate));
          } else {
            cell.value = Math.round(rate); dc(cell);
          }
          cell.numFmt = CUR; dc(cell);
        }

        if (hasEsc) {
          r++;
          ws.getCell(r, 1).value = "  Escalation Rate"; dc(ws.getCell(r, 1));
          const displayEsc = resolveRowEscalation(rv.escalationRate, costInflPct, rv.escalationRateOverridden);
          ws.getCell(r, 2).value = displayEsc / 100;
          ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
        }

        const progDetailFirstRow = r + 1;
        for (let pi = 0; pi < programs.length; pi++) {
          const p = programs[pi];
          r++;
          ws.getCell(r, 1).value = `  ${p.name || "Program"}`; dc(ws.getCell(r, 1));
          const edProgRow = edRefs.programRows.get(String(pi));
          for (let y = 0; y < 5; y++) {
            const cell = ws.getCell(r, y + 2);
            const progEnroll = [p.year1, p.year2, p.year3, p.year4, p.year5][y] ?? 0;
            const rateAddr = cn(rateRow, y + 2);
            const escalated = y === 0 ? (progEnroll * base) : (progEnroll * base * Math.pow(1 + esc / 100, y));
            if (edProgRow) {
              const enrollCol = edRefs.startCol + y;
              const enrollAddr = `'${edRefs.sheetName}'!${colLetter(enrollCol)}${edProgRow}`;
              setFormula(cell, `${rateAddr}*${enrollAddr}`, Math.round(escalated * sign));
            } else {
              setFormula(cell, `${rateAddr}*${progEnroll}`, Math.round(escalated * sign));
            }
            cell.numFmt = CUR; dc(cell);
          }
        }
        const progDetailLastRow = r;

        r++;
        ws.getCell(r, 1).value = `  Subtotal: ${rv.lineItem}`; bc(ws.getCell(r, 1));
        lineSubtotalRows.push(r);
        for (let y = 0; y < 5; y++) {
          const col = y + 2;
          const cell = ws.getCell(r, col);
          const students = enrollment[y];
          const val = computeRevLineItem(rv, y, students, tiers, costInflPct, sp);
          setFormula(cell, `SUM(${cn(progDetailFirstRow, col)}:${cn(progDetailLastRow, col)})`, Math.round(val * sign));
          cell.numFmt = CUR; gc(cell);
        }
      } else {
        r++;
        ws.getCell(r, 1).value = rv.lineItem; dc(ws.getCell(r, 1));
        lineSubtotalRows.push(r);
        for (let y = 0; y < 5; y++) {
          const students = enrollment[y];
          const val = computeRevLineItem(rv, y, students, tiers, costInflPct, sp);
          const cell = ws.getCell(r, y + 2);
          cell.value = Math.round(val * sign); cell.numFmt = CUR; dc(cell);
          if (rv.driverType === "annual_fixed" && y === 0) inputCell(cell);
        }
      }
    }

    r++;
    const catTotalLabel = `Total ${catLabel(cat)}`;
    ws.getCell(r, 1).value = catTotalLabel; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const cell = ws.getCell(r, col);
      let catTotal = 0;
      for (const rv of rows) {
        const s = cat === "tuition_offsets" ? -1 : 1;
        catTotal += computeRevLineItem(rv, y, enrollment[y], tiers, costInflPct, sp) * s;
      }
      const sumParts = lineSubtotalRows.map(sr => cn(sr, col)).join(",");
      setFormula(cell, `SUM(${sumParts})`, Math.round(catTotal));
      cell.numFmt = CUR; gc(cell);
    }
    categorySubtotalRows.push(r);
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "GRAND TOTAL REVENUE";
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    const cell = ws.getCell(r, col);
    const val = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
    const sumParts = categorySubtotalRows.map(sr => cn(sr, col)).join(",");
    setFormula(cell, `SUM(${sumParts})`, Math.round(val));
    cell.numFmt = CUR; gc(cell); outputCell(cell);
  }

  if (tiers.length > 0) {
    r += 2;
    sec(ws, r, 6); ws.getCell(r, 1).value = "TUITION TIERS";
    for (const t of tiers) {
      r++;
      ws.getCell(r, 1).value = `${t.label} (${t.discountPercent}% discount)`; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        ws.getCell(r, y + 2).value = t.studentCounts?.[y] ?? 0; ws.getCell(r, y + 2).numFmt = NUM; dc(ws.getCell(r, y + 2));
      }
    }
  }
}

function buildStaffingDrivers(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], salaryEsc: number, prorationFactor: number) {
  const ws = wb.addWorksheet("Staffing Drivers");
  const sp = data.schoolProfile || {};
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const yLabels = yearLabels(sp.openingYear);
  ws.columns = [{ width: 28 }, { width: 16 }, { width: 10 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 8);
  ws.getCell(r, 1).value = "Staffing Drivers";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["Role", "Category", "FTE", "Base Rate", "Benefits %", "Tax %", "Loaded Cost", "Rates"];
  hdr(ws, r, 8);
  for (const sr of staffingRows) {
    r++;
    ws.getCell(r, 1).value = sr.roleName; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = funcLabel(sr.functionCategory); dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = sr.fte; ws.getCell(r, 3).numFmt = "0.00"; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));
    ws.getCell(r, 4).value = sr.annualizedRate; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = sr.benefitsRate / 100; ws.getCell(r, 5).numFmt = PCT; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
    ws.getCell(r, 6).value = sr.payrollTaxRate / 100; ws.getCell(r, 6).numFmt = PCT; dc(ws.getCell(r, 6)); inputCell(ws.getCell(r, 6));
    ws.getCell(r, 7).value = Math.round(computeStaffingLoaded(sr, 0, enrollment[0])); ws.getCell(r, 7).numFmt = CUR; bc(ws.getCell(r, 7));
    const hasOverride = sr.benefitsRateOverridden || sr.payrollTaxRateOverridden;
    ws.getCell(r, 8).value = hasOverride ? "Custom" : "Default"; dc(ws.getCell(r, 8));
    if (hasOverride) {
      ws.getCell(r, 8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
    }
  }

  r += 2;
  sec(ws, r, 7); ws.getCell(r, 1).value = "5-YEAR TOTAL PERSONNEL COST";
  r++;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);
  r++;
  ws.getCell(r, 1).value = "Total Personnel"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const val = computePersonnelForYear(staffingRows, salaryEsc, pf, y, enrollment[y]);
    const cell = ws.getCell(r, y + 2);
    cell.value = Math.round(val); cell.numFmt = CUR; gc(cell); outputCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Personnel as % of Revenue"; dc(ws.getCell(r, 1));
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const costInflPct = (data.tuitionEscalation?.rate ?? 3);
  for (let y = 0; y < 5; y++) {
    const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
    const pf = y === 0 ? prorationFactor : 1;
    const pers = computePersonnelForYear(staffingRows, salaryEsc, pf, y, enrollment[y]);
    const cell = ws.getCell(r, y + 2);
    cell.value = rev > 0 ? pers / rev : 0;
    cell.numFmt = PCT; dc(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Students per FTE"; dc(ws.getCell(r, 1));
  const totalFte = staffingRows.reduce((s, sr) => s + sr.fte, 0);
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(r, y + 2);
    cell.value = totalFte > 0 ? Math.round(enrollment[y] / totalFte * 10) / 10 : 0;
    cell.numFmt = "0.0"; dc(cell);
  }
}

function buildOpExDrivers(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[]) {
  const ws = wb.addWorksheet("OpEx Drivers");
  const sp = data.schoolProfile || {};
  const oeRR = data.enrollment?.retentionRate ?? 85;
  const expenseRows = (data.expenseRows || []).filter(r => r.enabled);
  const staffingRows = data.staffingRows || [];
  const yLabels = yearLabels(sp.openingYear);
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const costInflPct = (data.tuitionEscalation?.rate ?? 3);
  ws.columns = [{ width: 32 }, ...Array(6).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "Operating Expense Drivers";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  const uwBaseCats = ["instructional_program", "technology", "occupancy_facility", "administrative_general"];
  const uwCustomCats = [...new Set(expenseRows.map(e => e.category).filter(c => !uwBaseCats.includes(c) && c !== "personnel" && c !== "capital_financing"))];
  const categories = [...uwBaseCats, ...uwCustomCats];
  const uwCcLabels = data.customCategoryLabels || {};
  const catTotalRows: number[] = [];
  for (const cat of categories) {
    const catRows = expenseRows.filter(e => e.category === cat);
    if (catRows.length === 0) continue;
    r++;
    sec(ws, r, 6); ws.getCell(r, 1).value = expCatLabel(cat, uwCcLabels);
    const catFirstRow = r + 1;
    for (const ex of catRows) {
      r++;
      ws.getCell(r, 1).value = `  ${ex.lineItem}`; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
        let val: number;
        if (ex.driverType === "percent_of_revenue") {
          const esc = resolveRowEscalation(ex.escalationRate, costInflPct, ex.escalationRateOverridden);
          let pct = esc !== 0 && y > 0 ? (ex.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y) : (ex.amounts?.[y] ?? 0);
          val = (pct / 100) * rev;
        } else {
          val = driverVal(ex.amounts, y, ex.driverType, enrollment[y], ex.escalationRate, costInflPct, computeNewStudents(enrollment, oeRR, y), computeReturningStudents(enrollment, oeRR, y), ex.escalationRateOverridden);
        }
        const cell = ws.getCell(r, y + 2);
        cell.value = Math.round(val); cell.numFmt = CUR; dc(cell);
      }
    }
    const catLastRow = r;
    r++;
    catTotalRows.push(r);
    ws.getCell(r, 1).value = `Total ${expCatLabel(cat, uwCcLabels)}`; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
      let catTotal = 0;
      for (const ex of catRows) {
        if (ex.driverType === "percent_of_revenue") {
          const esc = resolveRowEscalation(ex.escalationRate, costInflPct, ex.escalationRateOverridden);
          let pct = esc !== 0 && y > 0 ? (ex.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y) : (ex.amounts?.[y] ?? 0);
          catTotal += (pct / 100) * rev;
        } else {
          catTotal += driverVal(ex.amounts, y, ex.driverType, enrollment[y], ex.escalationRate, costInflPct, computeNewStudents(enrollment, oeRR, y), computeReturningStudents(enrollment, oeRR, y), ex.escalationRateOverridden);
        }
      }
      const col = y + 2;
      const cell = ws.getCell(r, col);
      if (catRows.length > 0) {
        setFormula(cell, `SUM(${cn(catFirstRow, col)}:${cn(catLastRow, col)})`, Math.round(catTotal));
      } else {
        cell.value = 0;
      }
      cell.numFmt = CUR; gc(cell);
    }
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL OPERATING EXPENSES";
  for (let y = 0; y < 5; y++) {
    const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
    const oeFTE = computeTotalFTE(staffingRows, y, enrollment[y]);
    const val = computeExpenseForYear(expenseRows, y, enrollment[y], rev, costInflPct, computeNewStudents(enrollment, oeRR, y), computeReturningStudents(enrollment, oeRR, y), oeFTE);
    const col = y + 2;
    const cell = ws.getCell(r, col);
    if (catTotalRows.length > 0) {
      const sumParts = catTotalRows.map(tr => cn(tr, col)).join("+");
      setFormula(cell, sumParts, Math.round(val));
    } else {
      cell.value = Math.round(val);
    }
    cell.numFmt = CUR; gc(cell); outputCell(cell);
  }
}

function buildCapitalStack(wb: ExcelJS.Workbook, data: ModelData) {
  const ws = wb.addWorksheet("Capital Stack");
  const sp = data.schoolProfile || {};
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  ws.columns = [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "Capital Stack & Loan Terms";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["Instrument", "Type", "Principal", "Rate", "Term (Yrs)", "Annual Payment"];
  hdr(ws, r, 6);

  for (const cd of capDebtRows) {
    r++;
    ws.getCell(r, 1).value = cd.lineItem || "Unnamed"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = cd.isLoan ? "Loan" : "Capital Expense"; dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = cd.isLoan ? (cd.loanPrincipal || 0) : (cd.amounts?.[0] ?? 0);
    ws.getCell(r, 3).numFmt = CUR; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));
    ws.getCell(r, 4).value = cd.isLoan ? ((cd.loanRate || 0) / 100) : 0;
    ws.getCell(r, 4).numFmt = PCT; dc(ws.getCell(r, 4)); if (cd.isLoan) inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = cd.isLoan ? (cd.loanTermYears || 0) : 0;
    ws.getCell(r, 5).numFmt = NUM; dc(ws.getCell(r, 5)); if (cd.isLoan) inputCell(ws.getCell(r, 5));
    const annual = cd.isLoan ? computeAnnualDebt(cd.loanPrincipal || 0, (cd.loanRate || 0) / 100, cd.loanTermYears || 0) : (cd.amounts?.[0] ?? 0);
    ws.getCell(r, 6).value = Math.round(annual); ws.getCell(r, 6).numFmt = CUR; bc(ws.getCell(r, 6));
  }

  r += 2;
  ws.getCell(r, 1).value = "Total Annual Debt Service"; bc(ws.getCell(r, 1));
  let totalDS = 0;
  for (const cd of capDebtRows) {
    if (cd.isLoan) totalDS += computeAnnualDebt(cd.loanPrincipal || 0, (cd.loanRate || 0) / 100, cd.loanTermYears || 0);
  }
  ws.getCell(r, 6).value = Math.round(totalDS); ws.getCell(r, 6).numFmt = CUR; gc(ws.getCell(r, 6)); outputCell(ws.getCell(r, 6));

  r++;
  ws.getCell(r, 1).value = "Total Loan Principal"; bc(ws.getCell(r, 1));
  let totalPrincipal = 0;
  for (const cd of capDebtRows) {
    if (cd.isLoan) totalPrincipal += cd.loanPrincipal || 0;
  }
  ws.getCell(r, 6).value = Math.round(totalPrincipal); ws.getCell(r, 6).numFmt = CUR; gc(ws.getCell(r, 6));
}

function buildEnrollmentTuitionForecast(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[]) {
  const ws = wb.addWorksheet("Enrollment Tuition Fcst");
  const sp = data.schoolProfile || {};
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const costInflPct = (data.tuitionEscalation?.rate ?? 3);
  const yLabels = yearLabels(sp.openingYear);
  ws.columns = [{ width: 36 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "Enrollment & Tuition Forecast";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  r++;
  ws.getCell(r, 1).value = "Total Students"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = enrollment[y]; ws.getCell(r, y + 2).numFmt = NUM; bc(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "REVENUE FORECAST";
  const etfFirstRow = r + 1;
  for (const rv of revenueRows) {
    r++;
    ws.getCell(r, 1).value = rv.lineItem; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const val = computeRevLineItem(rv, y, enrollment[y], tiers, costInflPct, sp);
      const sign = rv.category === "tuition_offsets" ? -1 : 1;
      ws.getCell(r, y + 2).value = Math.round(val * sign); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }
  }
  const etfLastRow = r;

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL REVENUE";
  for (let y = 0; y < 5; y++) {
    const val = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
    const col = y + 2;
    setFormula(ws.getCell(r, col), `SUM(${cn(etfFirstRow, col)}:${cn(etfLastRow, col)})`, Math.round(val));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col)); outputCell(ws.getCell(r, col));
  }

  r += 2;
  ws.getCell(r, 1).value = "Revenue per Student"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp);
    ws.getCell(r, y + 2).value = enrollment[y] > 0 ? Math.round(rev / enrollment[y]) : 0;
    ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
}

function buildStaffingCostsForecast(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], salaryEsc: number, prorationFactor: number) {
  const ws = wb.addWorksheet("Staffing Costs Fcst");
  const sp = data.schoolProfile || {};
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const yLabels = yearLabels(sp.openingYear);
  ws.columns = [{ width: 30 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "Staffing Costs Forecast";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  const categories = ["instructional", "school_leadership", "student_support", "operations", "administrative", "other"];
  const scfCatTotalRows: number[] = [];
  for (const cat of categories) {
    const catRows = staffingRows.filter(s => s.functionCategory === cat);
    if (catRows.length === 0) continue;
    r++;
    sec(ws, r, 6); ws.getCell(r, 1).value = funcLabel(cat);
    const catFirstRow = r + 1;
    for (const sr of catRows) {
      r++;
      const ratioTag = sr.staffingMode === "ratio" && sr.studentRatio
        ? ` [1:${sr.studentRatio}]`
        : ` [${sr.fte} FTE]`;
      ws.getCell(r, 1).value = `  ${sr.roleName}${ratioTag}`; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const pf = y === 0 ? prorationFactor : 1;
        const loaded = computeStaffingLoaded(sr, y, enrollment[y]);
        const val = loaded * Math.pow(1 + salaryEsc, y) * pf;
        ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
      }
    }
    const catLastRow = r;
    r++;
    scfCatTotalRows.push(r);
    ws.getCell(r, 1).value = `Total ${funcLabel(cat)}`; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      let catTotal = 0;
      for (const sr of catRows) {
        const pf = y === 0 ? prorationFactor : 1;
        catTotal += computeStaffingLoaded(sr, y, enrollment[y]) * Math.pow(1 + salaryEsc, y) * pf;
      }
      const col = y + 2;
      setFormula(ws.getCell(r, col), `SUM(${cn(catFirstRow, col)}:${cn(catLastRow, col)})`, Math.round(catTotal));
      ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
    }
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL PERSONNEL";
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const val = computePersonnelForYear(staffingRows, salaryEsc, pf, y, enrollment[y]);
    const col = y + 2;
    if (scfCatTotalRows.length > 0) {
      const sumParts = scfCatTotalRows.map(tr => cn(tr, col)).join("+");
      setFormula(ws.getCell(r, col), sumParts, Math.round(val));
    } else {
      ws.getCell(r, col).value = Math.round(val);
    }
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col)); outputCell(ws.getCell(r, col));
  }
}

function buildBudgetDetail(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], salaryEsc: number, costInflPct: number, prorationFactor: number) {
  const bdRR = data.enrollment?.retentionRate ?? 85;
  const ws = wb.addWorksheet("Budget Detail");
  const sp = data.schoolProfile || {};
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = (data.expenseRows || []).filter(r => r.enabled);
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const yLabels = yearLabels(sp.openingYear);
  ws.columns = [{ width: 36 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} - Budget Detail`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "REVENUE";
  const revFirstRow = r + 1;
  for (const rv of revenueRows) {
    r++;
    ws.getCell(r, 1).value = `  ${rv.lineItem}`; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const val = computeRevLineItem(rv, y, enrollment[y], tiers, costInflPct, sp);
      const sign = rv.category === "tuition_offsets" ? -1 : 1;
      const pf = y === 0 ? prorationFactor : 1;
      ws.getCell(r, y + 2).value = Math.round(val * sign * pf); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }
  }
  const revLastRow = r;
  r++;
  const revTotalRow = r;
  ws.getCell(r, 1).value = "Total Revenue"; bc(ws.getCell(r, 1));
  const revByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const val = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct, sp) * pf;
    revByYear.push(val);
    const col = y + 2;
    setFormula(ws.getCell(r, col), `SUM(${cn(revFirstRow, col)}:${cn(revLastRow, col)})`, Math.round(val));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "PERSONNEL";
  const persFirstRow = r + 1;
  for (const sr of staffingRows) {
    r++;
    ws.getCell(r, 1).value = `  ${sr.roleName}`; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const pf = y === 0 ? prorationFactor : 1;
      const loaded = computeStaffingLoaded(sr, y, enrollment[y]);
      ws.getCell(r, y + 2).value = Math.round(loaded * Math.pow(1 + salaryEsc, y) * pf);
      ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }
  }
  const persLastRow = r;
  r++;
  const persTotalRow = r;
  ws.getCell(r, 1).value = "Total Personnel"; bc(ws.getCell(r, 1));
  const persByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const val = computePersonnelForYear(staffingRows, salaryEsc, pf, y, enrollment[y]);
    persByYear.push(val);
    const col = y + 2;
    setFormula(ws.getCell(r, col), `SUM(${cn(persFirstRow, col)}:${cn(persLastRow, col)})`, Math.round(val));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "OPERATING EXPENSES";
  const bdBaseCats = ["instructional_program", "technology", "occupancy_facility", "administrative_general"];
  const bdCustomCats = [...new Set(expenseRows.map(e => e.category).filter(c => !bdBaseCats.includes(c) && c !== "personnel" && c !== "capital_financing"))];
  const expCategories = [...bdBaseCats, ...bdCustomCats];
  const bdCcLabels = data.customCategoryLabels || {};
  const bdCatSumRows: number[] = [];
  for (const cat of expCategories) {
    const catRows = expenseRows.filter(e => e.category === cat);
    if (catRows.length === 0) continue;
    r++;
    ws.getCell(r, 1).value = expCatLabel(cat, bdCcLabels); ws.getCell(r, 1).font = BF;
    const catFirstRow = r + 1;
    for (const ex of catRows) {
      r++;
      ws.getCell(r, 1).value = `    ${ex.lineItem}`; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const rev = revByYear[y];
        let val: number;
        if (ex.driverType === "percent_of_revenue") {
          const esc = resolveRowEscalation(ex.escalationRate, costInflPct, ex.escalationRateOverridden);
          let pct = esc !== 0 && y > 0 ? (ex.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y) : (ex.amounts?.[y] ?? 0);
          val = (pct / 100) * rev;
        } else {
          const pf = y === 0 ? prorationFactor : 1;
          val = driverVal(ex.amounts, y, ex.driverType, enrollment[y], ex.escalationRate, costInflPct, computeNewStudents(enrollment, bdRR, y), computeReturningStudents(enrollment, bdRR, y), ex.escalationRateOverridden) * pf;
        }
        ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
      }
    }
    const catLastRow = r;
    if (catRows.length > 1) {
      r++;
      ws.getCell(r, 1).value = `  Total ${expCatLabel(cat, bdCcLabels)}`; bc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const col = y + 2;
        const catTotal = catRows.reduce((sum, ex) => {
          const rev = revByYear[y];
          if (ex.driverType === "percent_of_revenue") {
            const esc = resolveRowEscalation(ex.escalationRate, costInflPct, ex.escalationRateOverridden);
            const pct = esc !== 0 && y > 0 ? (ex.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y) : (ex.amounts?.[y] ?? 0);
            return sum + (pct / 100) * rev;
          }
          const pf = y === 0 ? prorationFactor : 1;
          return sum + driverVal(ex.amounts, y, ex.driverType, enrollment[y], ex.escalationRate, costInflPct, computeNewStudents(enrollment, bdRR, y), computeReturningStudents(enrollment, bdRR, y), ex.escalationRateOverridden) * pf;
        }, 0);
        setFormula(ws.getCell(r, col), `SUM(${cn(catFirstRow, col)}:${cn(catLastRow, col)})`, Math.round(catTotal));
        ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
      }
      bdCatSumRows.push(r);
    } else {
      bdCatSumRows.push(catFirstRow);
    }
  }
  r++;
  const opexTotalRow = r;
  ws.getCell(r, 1).value = "Total Operating Expenses"; bc(ws.getCell(r, 1));
  const opexByYear: number[] = [];
  const unproRev = revByYear.map((r, y) => y === 0 && prorationFactor !== 1 ? r / prorationFactor : r);
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const bdFTE = computeTotalFTE(staffingRows, y, enrollment[y]);
    const val = computeExpenseForYear(expenseRows, y, enrollment[y], unproRev[y], costInflPct, computeNewStudents(enrollment, bdRR, y), computeReturningStudents(enrollment, bdRR, y), bdFTE) * pf;
    opexByYear.push(val);
    const col = y + 2;
    if (bdCatSumRows.length > 0) {
      const sumParts = bdCatSumRows.map(tr => cn(tr, col)).join("+");
      setFormula(ws.getCell(r, col), sumParts, Math.round(val));
    } else {
      ws.getCell(r, col).value = Math.round(val);
    }
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "CAPITAL & DEBT SERVICE";
  const cdFirstRow = r + 1;
  for (const cd of capDebtRows) {
    r++;
    ws.getCell(r, 1).value = `  ${cd.lineItem}`; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const val = cd.isLoan
        ? computeAnnualDebtForYear(cd.loanPrincipal || 0, (cd.loanRate || 0) / 100, cd.loanTermYears || 0, y)
        : driverVal(cd.amounts, y, cd.driverType, enrollment[y]);
      ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }
  }
  const cdLastRow = r;
  r++;
  const cdTotalRow = r;
  ws.getCell(r, 1).value = "Total Capital & Debt"; bc(ws.getCell(r, 1));
  const cdByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const val = computeCapDebtForYear(capDebtRows, y, enrollment[y]);
    cdByYear.push(val);
    const col = y + 2;
    setFormula(ws.getCell(r, col), `SUM(${cn(cdFirstRow, col)}:${cn(cdLastRow, col)})`, Math.round(val));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
  }

  return { revByYear, persByYear, opexByYear, cdByYear, revTotalRow, persTotalRow, opexTotalRow, cdTotalRow };
}

interface BudgetDetailRefs {
  revTotalRow: number;
  persTotalRow: number;
  opexTotalRow: number;
  cdTotalRow: number;
}

function buildBudgetSummary(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], revByYear: number[], persByYear: number[], opexByYear: number[], cdByYear: number[], bdRefs?: BudgetDetailRefs) {
  const ws = wb.addWorksheet("Budget Summary");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const niLabel = netIncomeLabel(sp.entityType);
  ws.columns = [{ width: 36 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} - Budget Summary`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  const bdSheet = "'Budget Detail'";
  const refRows: [string, number[], number | undefined][] = [
    ["Total Revenue", revByYear, bdRefs?.revTotalRow],
    ["Total Personnel", persByYear, bdRefs?.persTotalRow],
    ["Total Operating Expenses", opexByYear, bdRefs?.opexTotalRow],
    ["Total Capital & Debt Service", cdByYear, bdRefs?.cdTotalRow],
  ];
  const persRow = r + 2;
  const opexRow = r + 3;
  const cdRow = r + 4;
  for (const [label, arr, bdRowRef] of refRows) {
    r++;
    ws.getCell(r, 1).value = label; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      if (bdRowRef) {
        setFormula(ws.getCell(r, col), `${bdSheet}!${cn(bdRowRef, col)}`, Math.round(arr[y]));
      } else {
        ws.getCell(r, col).value = Math.round(arr[y]);
      }
      ws.getCell(r, col).numFmt = CUR; bc(ws.getCell(r, col));
    }
  }

  r++;
  const totalExpRow = r;
  ws.getCell(r, 1).value = "Total Expenses"; bc(ws.getCell(r, 1));
  const totalExpByYear = persByYear.map((p, y) => p + opexByYear[y] + cdByYear[y]);
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    setFormula(ws.getCell(r, col), `SUM(${cn(persRow, col)}:${cn(cdRow, col)})`, Math.round(totalExpByYear[y]));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
  }

  const revRow = persRow - 1;
  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "KEY METRICS";

  r++;
  const niRow = r;
  ws.getCell(r, 1).value = niLabel; bc(ws.getCell(r, 1));
  const niByYear = revByYear.map((rev, y) => rev - totalExpByYear[y]);
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    setFormula(ws.getCell(r, col), `${cn(revRow, col)}-${cn(totalExpRow, col)}`, Math.round(niByYear[y]));
    ws.getCell(r, col).numFmt = CUR;
    gc(ws.getCell(r, col)); outputCell(ws.getCell(r, col));
  }

  r++;
  ws.getCell(r, 1).value = "Net Margin %"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    setFormula(ws.getCell(r, col), `IF(${cn(revRow, col)}=0,0,${cn(niRow, col)}/${cn(revRow, col)})`, revByYear[y] > 0 ? niByYear[y] / revByYear[y] : 0);
    ws.getCell(r, col).numFmt = PCT; dc(ws.getCell(r, col));
  }

  r++;
  ws.getCell(r, 1).value = "Cumulative " + niLabel; dc(ws.getCell(r, 1));
  let cumNI = 0;
  for (let y = 0; y < 5; y++) {
    cumNI += niByYear[y];
    ws.getCell(r, y + 2).value = Math.round(cumNI); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }

  r++;
  ws.getCell(r, 1).value = "Revenue per Student"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = enrollment[y] > 0 ? Math.round(revByYear[y] / enrollment[y]) : 0;
    ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }

  r++;
  ws.getCell(r, 1).value = "Cost per Student"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = enrollment[y] > 0 ? Math.round(totalExpByYear[y] / enrollment[y]) : 0;
    ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }

  return { niByYear, totalExpByYear };
}

function buildMonthlyCashFlowY1(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], salaryEsc: number, costInflPct: number, prorationFactor: number, startingCash: number) {
  const ws = wb.addWorksheet("Monthly Cash Flow Y1");
  const sp = data.schoolProfile || {};
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const staffingRows = (data.staffingRows || []).map(r => normalizeStaffingRow(r as unknown as Record<string, unknown>));
  const expenseRows = (data.expenseRows || []).filter(r => r.enabled);
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const opMonths = getOpMonths(sp);
  const fyStart = sp.fiscalYearStartMonth || 7;
  const students = enrollment[0];

  ws.columns = [{ width: 28 }, ...Array(12).fill({ width: 14 }), { width: 16 }];
  printSetup(ws);

  const monthLabels = [""];
  for (let i = 0; i < 12; i++) {
    const mIdx = ((fyStart - 1 + i) % 12) + 1;
    monthLabels.push(MONTH_NAMES[mIdx]);
  }

  let r = 1;
  ws.mergeCells(r, 1, r, 14);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} - Year 1 Monthly Cash Flow`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r++;
  ws.getRow(r).values = [...monthLabels, "Annual Total"];
  hdr(ws, r, 14);

  // MONTHLY TIMING MODEL:
  // Annual totals are computed first, then spread into months:
  //   - Revenue: tuition spread over billingMonths (default 10, starting month 1);
  //     non-tuition revenue spread evenly over opMonths.
  //   - Personnel: spread evenly over opMonths (not 12 — staff aren't paid in non-operating months).
  //   - OpEx: spread evenly over opMonths.
  //   - Debt service: spread over 12 months (lenders require year-round payments).
  //   - Cumulative cash starts from startingCash and compounds monthly.
  const rev0 = computeRevenueForYear(revenueRows, 0, students, tiers, costInflPct, sp);
  const pers0 = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, 0, students);
  const mcfRR = data.enrollment?.retentionRate ?? 85;
  const mcfFTE = computeTotalFTE(staffingRows, 0, students);
  const opex0 = computeExpenseForYear(expenseRows, 0, students, rev0, costInflPct, computeNewStudents(enrollment, mcfRR, 0), computeReturningStudents(enrollment, mcfRR, 0), mcfFTE) * prorationFactor;
  const cd0 = computeCapDebtForYear(capDebtRows, 0, students);
  const monthlyPers = pers0 / (opMonths || 12);
  const monthlyOps = opex0 / (opMonths || 12);
  const monthlyDebt = cd0 / 12;

  const computeMonthlyRev = (): number[] => {
    const monthly = new Array(12).fill(0);
    const rowValues = new Map<string, number>();
    for (const rv of revenueRows) {
      if (!rv.enabled || rv.driverType === "percent_of_base") continue;
      if (rv.id === "gross_tuition" && rv.driverType === "per_student" && tiers.length > 0) {
        rowValues.set(rv.id, tuitionWithTiers(rv.amounts?.[0] ?? 0, 0, students, tiers));
      } else {
        rowValues.set(rv.id, driverVal(rv.amounts, 0, rv.driverType, students));
      }
    }
    for (const rv of revenueRows) {
      if (!rv.enabled || rv.driverType !== "percent_of_base") continue;
      const baseVal = rowValues.get(rv.percentBase || "") || 0;
      rowValues.set(rv.id, baseVal * ((rv.amounts?.[0] ?? 0) / 100));
    }
    for (const rv of revenueRows) {
      if (!rv.enabled) continue;
      const annualAmount = rowValues.get(rv.id) || 0;
      if (annualAmount === 0) continue;
      const collectionRate = (rv.collectionRate ?? 100) / 100;
      const delayMonths = Math.ceil((rv.collectionDelayDays ?? 0) / 30);
      if (rv.category === "tuition_and_fees" || rv.category === "tuition_offsets") {
        const bm = rv.billingMonths ?? 10;
        const effectiveAmount = rv.category === "tuition_offsets" ? -Math.abs(annualAmount) : annualAmount;
        const adjustedAmount = effectiveAmount * collectionRate;
        const perMonth = adjustedAmount / bm;
        const startMonth = (bm >= 12 ? 0 : 1) + delayMonths;
        for (let i = startMonth; i < startMonth + bm && i < 12; i++) monthly[i] += perMonth;
      } else {
        const adjustedAmount = annualAmount * collectionRate;
        const perMonth = adjustedAmount / opMonths;
        for (let m = delayMonths; m < opMonths + delayMonths && m < 12; m++) monthly[m] += perMonth;
      }
    }
    return monthly;
  };

  const monthlyRevArr = computeMonthlyRev();

  r++;
  sec(ws, r, 14); ws.getCell(r, 1).value = "REVENUE";
  r++;
  const revRow = r;
  ws.getCell(r, 1).value = "Total Revenue"; bc(ws.getCell(r, 1));
  let revTotal = 0;
  for (let m = 0; m < 12; m++) {
    const v = Math.round(monthlyRevArr[m]);
    revTotal += v;
    ws.getCell(r, m + 2).value = v; ws.getCell(r, m + 2).numFmt = CUR; gc(ws.getCell(r, m + 2));
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, revTotal);
  ws.getCell(r, 14).numFmt = CUR; gc(ws.getCell(r, 14));

  r += 2;
  sec(ws, r, 14); ws.getCell(r, 1).value = "EXPENSES";
  r++;
  const persRow = r;
  ws.getCell(r, 1).value = "Personnel"; dc(ws.getCell(r, 1));
  for (let m = 0; m < 12; m++) {
    ws.getCell(r, m + 2).value = m < opMonths ? Math.round(monthlyPers) : 0;
    ws.getCell(r, m + 2).numFmt = CUR; dc(ws.getCell(r, m + 2));
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(pers0));
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r++;
  const opexRow = r;
  ws.getCell(r, 1).value = "Operating Expenses"; dc(ws.getCell(r, 1));
  for (let m = 0; m < 12; m++) {
    ws.getCell(r, m + 2).value = m < opMonths ? Math.round(monthlyOps) : 0;
    ws.getCell(r, m + 2).numFmt = CUR; dc(ws.getCell(r, m + 2));
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(opex0));
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r++;
  const debtRow = r;
  ws.getCell(r, 1).value = "Debt Service"; dc(ws.getCell(r, 1));
  for (let m = 0; m < 12; m++) {
    ws.getCell(r, m + 2).value = Math.round(monthlyDebt);
    ws.getCell(r, m + 2).numFmt = CUR; dc(ws.getCell(r, m + 2));
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, Math.round(cd0));
  ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r += 2;
  sec(ws, r, 14); ws.getCell(r, 1).value = "CASH FLOW";
  r++;
  const totExpRow = r;
  ws.getCell(r, 1).value = "Total Expenses"; bc(ws.getCell(r, 1));
  const totalExpMonthly: number[] = [];
  for (let m = 0; m < 12; m++) {
    const col = m + 2;
    const p = m < opMonths ? Math.round(monthlyPers) : 0;
    const o = m < opMonths ? Math.round(monthlyOps) : 0;
    const d = Math.round(monthlyDebt);
    const total = p + o + d;
    totalExpMonthly.push(total);
    setFormula(ws.getCell(r, col), `${cn(persRow, col)}+${cn(opexRow, col)}+${cn(debtRow, col)}`, total);
    ws.getCell(r, col).numFmt = CUR; bc(ws.getCell(r, col));
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, totalExpMonthly.reduce((a, b) => a + b, 0));
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r++;
  const netCfRow = r;
  ws.getCell(r, 1).value = "Net Cash Flow"; bc(ws.getCell(r, 1));
  const netCashMonthly: number[] = [];
  for (let m = 0; m < 12; m++) {
    const col = m + 2;
    const net = Math.round(monthlyRevArr[m]) - totalExpMonthly[m];
    netCashMonthly.push(net);
    setFormula(ws.getCell(r, col), `${cn(revRow, col)}-${cn(totExpRow, col)}`, net);
    ws.getCell(r, col).numFmt = CUR; bc(ws.getCell(r, col));
  }
  setFormula(ws.getCell(r, 14), `SUM(${cn(r, 2)}:${cn(r, 13)})`, netCashMonthly.reduce((a, b) => a + b, 0));
  ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r++;
  const cumCashRow = r;
  ws.getCell(r, 1).value = "Cumulative Cash"; bc(ws.getCell(r, 1));
  const cumCashMonthly: number[] = [];

  r += 2;
  sec(ws, r, 3); ws.getCell(r, 1).value = "CASH FLOW METRICS";
  r++;
  const startCashRow = r;
  ws.getCell(r, 1).value = "Starting Cash"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));

  for (let m = 0; m < 12; m++) {
    const col = m + 2;
    const cum = m === 0 ? startingCash + netCashMonthly[0] : cumCashMonthly[m - 1] + netCashMonthly[m];
    cumCashMonthly.push(cum);
    if (m === 0) {
      setFormula(ws.getCell(cumCashRow, col), `${cn(startCashRow, 2)}+${cn(netCfRow, col)}`, Math.round(cum));
    } else {
      setFormula(ws.getCell(cumCashRow, col), `${cn(cumCashRow, col - 1)}+${cn(netCfRow, col)}`, Math.round(cum));
    }
    ws.getCell(cumCashRow, col).numFmt = CUR; bc(ws.getCell(cumCashRow, col));
    outputCell(ws.getCell(cumCashRow, col));
  }
  setFormula(ws.getCell(cumCashRow, 14), `${cn(cumCashRow, 13)}`, Math.round(cumCashMonthly[11]));
  ws.getCell(cumCashRow, 14).numFmt = CUR; gc(ws.getCell(cumCashRow, 14)); outputCell(ws.getCell(cumCashRow, 14));

  r++;
  ws.getCell(r, 1).value = "Ending Cash (Month 12)"; dc(ws.getCell(r, 1));
  setFormula(ws.getCell(r, 2), `${cn(cumCashRow, 13)}`, Math.round(cumCashMonthly[11]));
  ws.getCell(r, 2).numFmt = CUR; bc(ws.getCell(r, 2)); outputCell(ws.getCell(r, 2));
  r++;
  const minCash = Math.min(...cumCashMonthly);
  const minCashMonthIdx = cumCashMonthly.indexOf(minCash);
  const minCashMonthLabel = MONTH_NAMES[((fyStart - 1 + minCashMonthIdx) % 12) + 1];
  ws.getCell(r, 1).value = "Minimum Cash Month"; dc(ws.getCell(r, 1));
  setFormula(ws.getCell(r, 2), `MIN(${cn(cumCashRow, 2)}:${cn(cumCashRow, 13)})`, Math.round(minCash));
  ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
  if (minCash < 0) {
    ws.getCell(r, 2).font = { ...(ws.getCell(r, 2).font || {}), color: { argb: "FFDC2626" } };
    ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
  } else if (minCash < startingCash * 0.25) {
    ws.getCell(r, 2).font = { ...(ws.getCell(r, 2).font || {}), color: { argb: "FFD97706" } };
    ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
  }
  r++;
  ws.getCell(r, 1).value = `Cash Trough: ${minCashMonthLabel} (Month ${minCashMonthIdx + 1})`;
  ws.getCell(r, 1).font = { italic: true, size: 10, name: "Calibri", color: { argb: "FF6B7280" } };
  ws.mergeCells(r, 1, r, 6);
  r++;
  ws.getCell(r, 1).value = "Your lowest cash point is the month lenders focus on to ensure you won't run out of money before collections start. Plan reserves to cover this trough.";
  ws.getCell(r, 1).font = { italic: true, size: 9, name: "Calibri", color: { argb: "FF9CA3AF" } };
  ws.mergeCells(r, 1, r, 8);

  return { endingCashY1: cumCashMonthly[11], cumCashRow, minCashMonth: minCashMonthIdx + 1, minCashAmount: Math.round(minCash), minCashMonthLabel };
}

function buildOperatingStatement(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], revByYear: number[], persByYear: number[], opexByYear: number[], cdByYear: number[], niByYear: number[], depreciationByYear?: number[]) {
  const ws = wb.addWorksheet("5-Year Operating Stmt");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const niLabel = netIncomeLabel(sp.entityType);
  ws.columns = [{ width: 36 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} - 5-Year Operating Statement`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r++;
  ws.mergeCells(r, 1, r, 6);
  const currentBasis = sp.accountingBasis ? accountingBasisLabel(sp.accountingBasis).toLowerCase() : "undetermined";
  const basisNote = `Projections prepared on an accrual basis. School currently keeps books on a ${currentBasis} basis.`;
  ws.getCell(r, 1).value = basisNote;
  ws.getCell(r, 1).font = { italic: true, size: 10, name: "Calibri", color: { argb: "FF64748B" } };

  r += 1;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "REVENUE";
  r++;
  const revRow = r;
  ws.getCell(r, 1).value = "Total Revenue"; gc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(revByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
  }

  r++;
  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "EXPENSES";
  r++;
  const persRow = r;
  ws.getCell(r, 1).value = "Personnel"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(persByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; bc(ws.getCell(r, y + 2));
  }
  r++;
  const opRow = r;
  ws.getCell(r, 1).value = "Operating Expenses"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(opexByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; bc(ws.getCell(r, y + 2));
  }
  r++;
  const cdRow = r;
  ws.getCell(r, 1).value = "Capital & Debt Service"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(cdByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; bc(ws.getCell(r, y + 2));
  }
  r++;
  const deprRow = r;
  ws.getCell(r, 1).value = "Depreciation"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(depreciationByYear?.[y] ?? 0); ws.getCell(r, y + 2).numFmt = CUR; bc(ws.getCell(r, y + 2));
  }
  r++;
  const totExpRow = r;
  ws.getCell(r, 1).value = "Total Expenses"; gc(ws.getCell(r, 1));
  const totalExpByYear = persByYear.map((p, y) => p + opexByYear[y] + cdByYear[y] + (depreciationByYear?.[y] ?? 0));
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    setFormula(ws.getCell(r, col), `SUM(${cn(persRow, col)}:${cn(deprRow, col)})`, Math.round(totalExpByYear[y]));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
  }

  r++;
  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "BOTTOM LINE";
  const niWithDepr = niByYear.map((ni, y) => ni - (depreciationByYear?.[y] ?? 0));
  r++;
  const niRow = r;
  ws.getCell(r, 1).value = niLabel; gc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    setFormula(ws.getCell(r, col), `${cn(revRow, col)}-${cn(totExpRow, col)}`, Math.round(niWithDepr[y]));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col)); outputCell(ws.getCell(r, col));
  }

  r++;
  ws.getCell(r, 1).value = "Net Margin %"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    setFormula(ws.getCell(r, col), `IF(${cn(revRow, col)}=0,0,${cn(niRow, col)}/${cn(revRow, col)})`, revByYear[y] > 0 ? niWithDepr[y] / revByYear[y] : 0);
    ws.getCell(r, col).numFmt = PCT; dc(ws.getCell(r, col));
  }

  r++;
  const cumNIRow = r;
  ws.getCell(r, 1).value = niLabel.includes("Net Income") ? "Cumulative Net Income" : "Cumulative Profit"; bc(ws.getCell(r, 1));
  let cumNIVal = 0;
  for (let y = 0; y < 5; y++) {
    cumNIVal += niWithDepr[y];
    const col = y + 2;
    const cell = ws.getCell(r, col);
    if (y === 0) setFormula(cell, cn(niRow, col), Math.round(cumNIVal));
    else setFormula(cell, `${cn(cumNIRow, col - 1)}+${cn(niRow, col)}`, Math.round(cumNIVal));
    cell.numFmt = CUR; bc(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Break-even"; bc(ws.getCell(r, 1));
  let beYear = -1;
  let cumCheck = 0;
  for (let y = 0; y < 5; y++) {
    cumCheck += niWithDepr[y];
    if (beYear < 0 && cumCheck >= 0) beYear = y;
  }
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    const cell = ws.getCell(r, col);
    if (y === beYear) {
      cell.value = "✓ Break-even";
      cell.font = { ...BF, color: { argb: DASHBOARD_GREEN } };
    } else {
      cell.value = "";
    }
    cell.border = BORDER;
    cell.alignment = { horizontal: "center" };
  }

  return { niRow, cumNIRow };
}

function buildDebtSchedule(wb: ExcelJS.Workbook, data: ModelData) {
  const ws = wb.addWorksheet("Debt Schedule");
  const sp = data.schoolProfile || {};
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  const loans = capDebtRows.filter(r => r.isLoan);
  const yLabels = yearLabels(sp.openingYear);
  ws.columns = [{ width: 28 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "Debt Schedule";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "LOAN TERMS";
  r++;
  ws.getCell(r, 1).value = "Loan Name"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = "Principal"; dc(ws.getCell(r, 2)); ws.getCell(r, 2).numFmt = CUR;
  ws.getCell(r, 3).value = "Annual Rate"; dc(ws.getCell(r, 3)); ws.getCell(r, 3).numFmt = PCT;
  ws.getCell(r, 4).value = "Term (Years)"; dc(ws.getCell(r, 4));
  ws.getCell(r, 5).value = "Annual Payment"; dc(ws.getCell(r, 5)); ws.getCell(r, 5).numFmt = CUR;
  for (let c = 1; c <= 5; c++) { ws.getCell(r, c).font = { ...BF, color: { argb: NAVY } }; ws.getCell(r, c).border = BORDER; }

  const loanTermRows: { nameRow: number; principalCol: number; rateCol: number; termCol: number; pmtCol: number }[] = [];
  for (const loan of loans) {
    r++;
    const principal = loan.loanPrincipal || 0;
    const rate = (loan.loanRate || 0) / 100;
    const term = loan.loanTermYears || 0;
    const annualPmt = computeAnnualDebt(principal, rate, term);

    ws.getCell(r, 1).value = loan.lineItem || "Loan"; dc(ws.getCell(r, 1)); inputCell(ws.getCell(r, 1));
    ws.getCell(r, 2).value = principal; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
    ws.getCell(r, 3).value = rate; ws.getCell(r, 3).numFmt = PCT; dc(ws.getCell(r, 3)); inputCell(ws.getCell(r, 3));
    ws.getCell(r, 4).value = term; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    const pmtFormula = `IF(OR(${cn(r, 2)}=0,${cn(r, 4)}=0),0,IF(${cn(r, 3)}=0,${cn(r, 2)}/${cn(r, 4)},-PMT(${cn(r, 3)}/12,${cn(r, 4)}*12,${cn(r, 2)})*12))`;
    setFormula(ws.getCell(r, 5), pmtFormula, Math.round(annualPmt));
    ws.getCell(r, 5).numFmt = CUR; dc(ws.getCell(r, 5));
    loanTermRows.push({ nameRow: r, principalCol: 2, rateCol: 3, termCol: 4, pmtCol: 5 });
  }

  const debtByYear: number[] = [0, 0, 0, 0, 0];
  const interestByYear: number[] = [0, 0, 0, 0, 0];
  const principalByYear: number[] = [0, 0, 0, 0, 0];
  const balanceByYear: number[] = [0, 0, 0, 0, 0];

  const loanBlocks: { bbRow: number; intRow: number; prinRow: number; pmtRow: number; ebRow: number }[] = [];

  for (let li = 0; li < loans.length; li++) {
    const loan = loans[li];
    const loanPrincipal = loan.loanPrincipal || 0;
    const loanRate = (loan.loanRate || 0) / 100;
    const loanTerm = loan.loanTermYears || 0;
    const termRef = loanTermRows[li];
    const pRef = cn(termRef.nameRow, termRef.principalCol);
    const rRef = cn(termRef.nameRow, termRef.rateCol);
    const tRef = cn(termRef.nameRow, termRef.termCol);
    const pmtRef = cn(termRef.nameRow, termRef.pmtCol);

    r += 2;
    sec(ws, r, 6); ws.getCell(r, 1).value = `AMORTIZATION: ${loan.lineItem || "Loan"}`;

    r++;
    const bbRow = r;
    ws.getCell(r, 1).value = "Beginning Balance"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const bal = y === 0 ? loanPrincipal : computeRemainingBalance(loanPrincipal, loanRate, loanTerm, y - 1);
      if (y === 0) {
        setFormula(ws.getCell(r, col), `${pRef}`, Math.round(bal));
      } else {
        const prevEbCol = col - 1;
        setFormula(ws.getCell(r, col), `${cn(bbRow + 4, prevEbCol)}`, Math.round(bal));
      }
      ws.getCell(r, col).numFmt = CUR; dc(ws.getCell(r, col));
    }

    r++;
    const intRow = r;
    ws.getCell(r, 1).value = "Interest"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const interest = computeInterestPortion(loanPrincipal, loanRate, loanTerm, y);
      interestByYear[y] += interest;
      const startPeriod = y * 12 + 1;
      const endPeriod = (y + 1) * 12;
      const formula = `IF(OR(${tRef}=0,${startPeriod}>${tRef}*12),0,IF(${rRef}=0,0,-CUMIPMT(${rRef}/12,${tRef}*12,${pRef},${startPeriod},${endPeriod},0)))`;
      setFormula(ws.getCell(r, col), formula, Math.round(interest));
      ws.getCell(r, col).numFmt = CUR; dc(ws.getCell(r, col));
    }

    r++;
    const prinRow = r;
    ws.getCell(r, 1).value = "Principal Payment"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const prinPay = computePrincipalPortion(loanPrincipal, loanRate, loanTerm, y);
      principalByYear[y] += prinPay;
      const startPeriod = y * 12 + 1;
      const endPeriod = (y + 1) * 12;
      const formula = `IF(OR(${tRef}=0,${startPeriod}>${tRef}*12),0,IF(${rRef}=0,${pRef}/${tRef},-CUMPRINC(${rRef}/12,${tRef}*12,${pRef},${startPeriod},${endPeriod},0)))`;
      setFormula(ws.getCell(r, col), formula, Math.round(prinPay));
      ws.getCell(r, col).numFmt = CUR; dc(ws.getCell(r, col));
    }

    r++;
    const pmtRow = r;
    ws.getCell(r, 1).value = "Total Payment"; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const total = computeAnnualDebtForYear(loanPrincipal, loanRate, loanTerm, y);
      debtByYear[y] += total;
      setFormula(ws.getCell(r, col), `${cn(intRow, col)}+${cn(prinRow, col)}`, Math.round(total));
      ws.getCell(r, col).numFmt = CUR; bc(ws.getCell(r, col));
    }

    r++;
    const ebRow = r;
    ws.getCell(r, 1).value = "Ending Balance"; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const bal = computeRemainingBalance(loanPrincipal, loanRate, loanTerm, y);
      balanceByYear[y] += bal;
      setFormula(ws.getCell(r, col), `MAX(0,${cn(bbRow, col)}-${cn(prinRow, col)})`, Math.round(bal));
      ws.getCell(r, col).numFmt = CUR; bc(ws.getCell(r, col)); outputCell(ws.getCell(r, col));
    }

    loanBlocks.push({ bbRow, intRow, prinRow, pmtRow, ebRow });
  }

  if (loans.length > 1) {
    r += 2;
    sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL ALL LOANS";
    r++;
    ws.getCell(r, 1).value = "Total Debt Service"; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const parts = loanBlocks.map(lb => cn(lb.pmtRow, col));
      setFormula(ws.getCell(r, col), parts.join("+"), Math.round(debtByYear[y]));
      ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
    }
    r++;
    ws.getCell(r, 1).value = "Total Outstanding Debt"; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const col = y + 2;
      const parts = loanBlocks.map(lb => cn(lb.ebRow, col));
      setFormula(ws.getCell(r, col), parts.join("+"), Math.round(balanceByYear[y]));
      ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col)); outputCell(ws.getCell(r, col));
    }
  }

  let debtBalanceRow: number;
  if (loans.length > 1) {
    debtBalanceRow = r;
  } else if (loanBlocks.length === 1) {
    debtBalanceRow = loanBlocks[0].ebRow;
  } else {
    debtBalanceRow = -1;
  }

  return { debtByYear, interestByYear, principalByYear, balanceByYear, debtBalanceRow };
}

interface CrossTabRefs {
  cfCumCashRow: number;
  opStmtNiRow: number;
  debtBalanceRow: number;
}

function buildBalanceSheet(wb: ExcelJS.Workbook, data: ModelData, niByYear: number[], balanceByYear: number[], startingCash: number, crossRefs: CrossTabRefs, endingCashY1?: number, depreciationByYear?: number[], projectedARByYear?: number[]) {
  const ws = wb.addWorksheet("Balance Sheet");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const eqLabel = equityLabel(sp.entityType);
  const ob = data.openingBalances || {};
  ws.columns = [{ width: 36 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  const cfTab = "'Monthly Cash Flow Y1'";
  const osTab = "'5-Year Operating Stmt'";
  const dsTab = "'Debt Schedule'";
  const hasCfRef = crossRefs.cfCumCashRow > 0;
  const hasNiRef = crossRefs.opStmtNiRow > 0;
  const hasDebtRef = crossRefs.debtBalanceRow > 0;

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} - Balance Sheet`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  const openCash = ob.cash ?? startingCash;
  const openAR = ob.accountsReceivable ?? 0;
  const openFA = ob.fixedAssets ?? 0;
  const openOA = ob.otherAssets ?? 0;
  const openAP = ob.accountsPayable ?? 0;

  const cashByYear: number[] = [];
  if (endingCashY1 !== undefined) {
    cashByYear.push(endingCashY1);
    let cumNI = 0;
    for (let y = 1; y < 5; y++) {
      cumNI += niByYear[y];
      cashByYear.push(endingCashY1 + cumNI);
    }
  } else {
    let cumNI = 0;
    for (let y = 0; y < 5; y++) {
      cumNI += niByYear[y];
      cashByYear.push(openCash + cumNI);
    }
  }

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "ASSETS";
  r++;
  const cashRow = r;
  ws.getCell(r, 1).value = "Cash & Equivalents"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    if (y === 0 && hasCfRef) {
      setFormula(ws.getCell(r, col), `${cfTab}!${cn(crossRefs.cfCumCashRow, 13)}`, Math.round(cashByYear[y]));
    } else if (y > 0 && hasCfRef && hasNiRef) {
      const niRefs: string[] = [];
      for (let yi = 1; yi <= y; yi++) {
        niRefs.push(`${osTab}!${cn(crossRefs.opStmtNiRow, yi + 2)}`);
      }
      setFormula(ws.getCell(r, col), `${cn(cashRow, 2)}+${niRefs.join("+")}`, Math.round(cashByYear[y]));
    } else {
      ws.getCell(r, col).value = Math.round(cashByYear[y]);
    }
    ws.getCell(r, col).numFmt = CUR; dc(ws.getCell(r, col)); outputCell(ws.getCell(r, col));
  }
  r++;
  const arRow = r;
  ws.getCell(r, 1).value = "Accounts Receivable"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const arVal = projectedARByYear?.[y] ?? openAR;
    ws.getCell(r, y + 2).value = Math.round(arVal); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  const faRow = r;
  ws.getCell(r, 1).value = "Fixed Assets (Net of Depreciation)"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const cumDepr = depreciationByYear ? depreciationByYear.slice(0, y + 1).reduce((a, b) => a + b, 0) : 0;
    const netFA = Math.max(0, openFA - cumDepr);
    ws.getCell(r, y + 2).value = Math.round(netFA); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  const oaRow = r;
  ws.getCell(r, 1).value = "Other Assets"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(openOA); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  const taRow = r;
  ws.getCell(r, 1).value = "Total Assets"; bc(ws.getCell(r, 1));
  const totalAssets: number[] = [];
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    const arVal = projectedARByYear?.[y] ?? openAR;
    const cumDepr = depreciationByYear ? depreciationByYear.slice(0, y + 1).reduce((a, b) => a + b, 0) : 0;
    const netFA = Math.max(0, openFA - cumDepr);
    const ta = cashByYear[y] + arVal + netFA + openOA;
    totalAssets.push(ta);
    setFormula(ws.getCell(r, col), `SUM(${cn(cashRow, col)}:${cn(oaRow, col)})`, Math.round(ta));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "LIABILITIES";
  r++;
  const apRow = r;
  ws.getCell(r, 1).value = "Accounts Payable"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(openAP); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  const ltdRow = r;
  ws.getCell(r, 1).value = "Long-Term Debt"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    if (hasDebtRef) {
      setFormula(ws.getCell(r, col), `${dsTab}!${cn(crossRefs.debtBalanceRow, col)}`, Math.round(balanceByYear[y]));
    } else {
      ws.getCell(r, col).value = Math.round(balanceByYear[y]);
    }
    ws.getCell(r, col).numFmt = CUR; dc(ws.getCell(r, col));
  }
  r++;
  const tlRow = r;
  ws.getCell(r, 1).value = "Total Liabilities"; bc(ws.getCell(r, 1));
  const totalLiabilities: number[] = [];
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    const tl = openAP + balanceByYear[y];
    totalLiabilities.push(tl);
    setFormula(ws.getCell(r, col), `SUM(${cn(apRow, col)}:${cn(ltdRow, col)})`, Math.round(tl));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = eqLabel.toUpperCase();
  r++;
  const eqRow = r;
  ws.getCell(r, 1).value = eqLabel; bc(ws.getCell(r, 1));
  const equityByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    const eq = totalAssets[y] - totalLiabilities[y];
    equityByYear.push(eq);
    setFormula(ws.getCell(r, col), `${cn(taRow, col)}-${cn(tlRow, col)}`, Math.round(eq));
    ws.getCell(r, col).numFmt = CUR; gc(ws.getCell(r, col)); outputCell(ws.getCell(r, col));
  }

  r += 2;
  ws.getCell(r, 1).value = "Balance Check (should = 0)"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const col = y + 2;
    const check = Math.round(totalAssets[y]) - Math.round(totalLiabilities[y]) - Math.round(equityByYear[y]);
    setFormula(ws.getCell(r, col), `${cn(taRow, col)}-${cn(tlRow, col)}-${cn(eqRow, col)}`, check);
    ws.getCell(r, col).numFmt = CUR;
    ws.getCell(r, col).font = { ...BF, color: { argb: check === 0 ? EVERGREEN : "FFFF0000" } };
    ws.getCell(r, col).border = BORDER;
  }

  return { cashByYear, totalAssets, totalLiabilities, equityByYear };
}

function buildDSCRCovenants(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], revByYear: number[], persByYear: number[], opexByYear: number[], cdByYear: number[], niByYear: number[], cashByYear: number[], depreciationByYear?: number[], projectedARByYear?: number[]) {
  const ws = wb.addWorksheet("DSCR & Covenants");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const ct = data.covenantThresholds || {};
  const minDSCR = ct.minDSCR ?? BENCHMARK_DSCR_GREEN;
  const minDaysCash = ct.minDaysCashOnHand ?? 45;
  const minMonths = ct.minMonthsRunway ?? 2;
  const minCapUtil = ct.minCapacityUtil ?? 0.7;
  const cap = sp.maxCapacity || 0;
  ws.columns = [{ width: 36 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "DSCR & Covenant Checks";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "CASH FLOW & DEBT";
  r++;
  ws.getCell(r, 1).value = "Revenue"; dc(ws.getCell(r, 1));
  const dscrRevRow = r;
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(revByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Personnel"; dc(ws.getCell(r, 1));
  const dscrPersRow = r;
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(persByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Operating Expenses"; dc(ws.getCell(r, 1));
  const dscrOpexRow = r;
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(opexByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Net Income"; bc(ws.getCell(r, 1));
  const niRow = r;
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(niByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; bc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Depreciation Add-Back"; dc(ws.getCell(r, 1));
  const deprRow = r;
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(depreciationByYear?.[y] ?? 0); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Debt Service (Loan)"; dc(ws.getCell(r, 1));
  const dsRow = r;
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(cdByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "CFADS (NI + Depr + DS)"; bc(ws.getCell(r, 1));
  const cfadsRow = r;
  const cfads: number[] = [];
  for (let y = 0; y < 5; y++) {
    const depr = depreciationByYear?.[y] ?? 0;
    const v = niByYear[y] + depr + cdByYear[y];
    cfads.push(v);
    const col = y + 2;
    setFormula(ws.getCell(r, col), `${cn(niRow, col)}+${cn(deprRow, col)}+${cn(dsRow, col)}`, Math.round(v));
    ws.getCell(r, col).numFmt = CUR; bc(ws.getCell(r, col));
  }

  r++;
  ws.getCell(r, 1).value = "DSCR"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const dscr = cdByYear[y] > 0 ? cfads[y] / cdByYear[y] : 0;
    const col = y + 2;
    if (cdByYear[y] > 0) {
      setFormula(ws.getCell(r, col), `IF(${cn(dsRow, col)}=0,"N/A",${cn(cfadsRow, col)}/${cn(dsRow, col)})`, Math.round(dscr * 100) / 100);
    } else {
      ws.getCell(r, col).value = "N/A";
    }
    ws.getCell(r, col).numFmt = "0.00x"; bc(ws.getCell(r, col)); outputCell(ws.getCell(r, col));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "LIQUIDITY METRICS";
  const totalExp = revByYear.map((rev, y) => rev - niByYear[y]);

  r++;
  ws.getCell(r, 1).value = "Ending Cash"; dc(ws.getCell(r, 1));
  const cashRow = r;
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(cashByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }

  r++;
  ws.getCell(r, 1).value = "Days Cash on Hand"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const days = totalExp[y] > 0 ? (cashByYear[y] / totalExp[y]) * 365 : 0;
    const col = y + 2;
    const totalExpFormula = `${cn(dscrRevRow, col)}-${cn(niRow, col)}`;
    setFormula(ws.getCell(r, col), `IF((${totalExpFormula})=0,0,(${cn(cashRow, col)}/(${totalExpFormula}))*365)`, Math.round(days));
    ws.getCell(r, col).numFmt = NUM; dc(ws.getCell(r, col));
  }

  r++;
  ws.getCell(r, 1).value = "Months of Runway"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const months = totalExp[y] > 0 ? cashByYear[y] / (totalExp[y] / 12) : 0;
    const col = y + 2;
    const totalExpFormula = `${cn(dscrRevRow, col)}-${cn(niRow, col)}`;
    setFormula(ws.getCell(r, col), `IF((${totalExpFormula})=0,0,${cn(cashRow, col)}/((${totalExpFormula})/12))`, Math.round(months * 10) / 10);
    ws.getCell(r, col).numFmt = "0.0"; dc(ws.getCell(r, col));
  }

  r++;
  ws.getCell(r, 1).value = "Capacity Utilization"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = cap > 0 ? enrollment[y] / cap : 0;
    ws.getCell(r, y + 2).numFmt = PCT; dc(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "BREAK-EVEN ANALYSIS";
  r++;
  ws.getCell(r, 1).value = "Revenue per Student"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = enrollment[y] > 0 ? Math.round(revByYear[y] / enrollment[y]) : 0;
    ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Fixed Costs (Pers + Debt)"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(persByYear[y] + cdByYear[y]);
    ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Variable Cost per Student (OpEx)"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = enrollment[y] > 0 ? Math.round(opexByYear[y] / enrollment[y]) : 0;
    ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Break-Even Enrollment"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const rps = enrollment[y] > 0 ? revByYear[y] / enrollment[y] : 0;
    const vcps = enrollment[y] > 0 ? opexByYear[y] / enrollment[y] : 0;
    const cm = rps - vcps;
    const fc = persByYear[y] + cdByYear[y];
    const be = cm > 0 ? Math.ceil(fc / cm) : 0;
    ws.getCell(r, y + 2).value = cm > 0 ? be : "N/A"; ws.getCell(r, y + 2).numFmt = NUM;
    bc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "COVENANT CHECKS";

  const ob = data.openingBalances || {};
  const openAP = ob.accountsPayable ?? 0;
  const minCurrentRatio = ct.minCurrentRatio ?? BENCHMARK_CURRENT_RATIO;

  const dscrStepUp = ct.dscrByYear && ct.dscrByYear.length === 5 ? ct.dscrByYear : null;

  const checks: [string, (y: number) => string][] = [
    [dscrStepUp ? `DSCR Step-Up (${dscrStepUp.map(v => v.toFixed(2) + "x").join(" → ")})` : `DSCR ≥ ${minDSCR}x`, (y) => {
      if (cdByYear[y] <= 0) return "N/A";
      const threshold = dscrStepUp ? dscrStepUp[y] : minDSCR;
      return cfads[y] / cdByYear[y] >= threshold ? "PASS" : "FAIL";
    }],
    ["Positive Net Income", (y) => niByYear[y] > 0 ? "PASS" : "FAIL"],
    [`Current Ratio ≥ ${minCurrentRatio}x`, (y) => {
      const currentLiab = openAP + cdByYear[y];
      if (currentLiab <= 0) return "N/A";
      const ar = projectedARByYear?.[y] ?? (ob.accountsReceivable ?? 0);
      const currentAssets = cashByYear[y] + ar;
      return currentAssets / currentLiab >= minCurrentRatio ? "PASS" : "FAIL";
    }],
    [`Capacity ≥ ${(minCapUtil * 100).toFixed(0)}%`, (y) => cap <= 0 ? "N/A" : (enrollment[y] / cap >= minCapUtil ? "PASS" : "FAIL")],
    [`Cash Reserve ≥ ${minMonths} months`, (y) => {
      const te = totalExp[y];
      if (te <= 0) return "N/A";
      return cashByYear[y] / (te / 12) >= minMonths ? "PASS" : "FAIL";
    }],
    [`Days Cash ≥ ${minDaysCash}`, (y) => {
      const te = totalExp[y];
      if (te <= 0) return "N/A";
      return computeDaysCashOnHand(cashByYear[y], te) >= minDaysCash ? "PASS" : "FAIL";
    }],
  ];

  for (const [label, fn] of checks) {
    r++;
    ws.getCell(r, 1).value = label; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const result = fn(y);
      ws.getCell(r, y + 2).value = result;
      ws.getCell(r, y + 2).font = { ...BF, color: { argb: result === "PASS" ? EVERGREEN : result === "FAIL" ? "FFFF0000" : "FF999999" } };
      ws.getCell(r, y + 2).border = BORDER;
      ws.getCell(r, y + 2).alignment = { horizontal: "center" };
    }
  }
}

function buildSourcesAndUses(wb: ExcelJS.Workbook, data: ModelData, startingCash: number) {
  const ws = wb.addWorksheet("Sources & Uses");
  const sp = data.schoolProfile || {};
  const capDebtRows = (data.capitalAndDebtRows || []).filter(r => r.enabled);
  const su = data.sourcesAndUses;
  ws.columns = [{ width: 36 }, { width: 20 }, { width: 8 }, { width: 36 }, { width: 20 }];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 5);
  ws.getCell(r, 1).value = "Sources & Uses";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getCell(r, 1).value = "SOURCES"; ws.getCell(r, 1).font = { ...HEADER_FONT }; ws.getCell(r, 1).fill = HEADER_FILL; ws.getCell(r, 1).border = BORDER;
  ws.getCell(r, 2).value = "Amount"; ws.getCell(r, 2).font = { ...HEADER_FONT }; ws.getCell(r, 2).fill = HEADER_FILL; ws.getCell(r, 2).border = BORDER;
  ws.getCell(r, 4).value = "USES"; ws.getCell(r, 4).font = { ...HEADER_FONT }; ws.getCell(r, 4).fill = HEADER_FILL; ws.getCell(r, 4).border = BORDER;
  ws.getCell(r, 5).value = "Amount"; ws.getCell(r, 5).font = { ...HEADER_FONT }; ws.getCell(r, 5).fill = HEADER_FILL; ws.getCell(r, 5).border = BORDER;

  let totalSources = 0;
  let totalUses = 0;

  if (su && su.sources && su.sources.length > 0) {
    for (const s of su.sources) {
      r++;
      ws.getCell(r, 1).value = s.lineItem; dc(ws.getCell(r, 1));
      ws.getCell(r, 2).value = s.amount; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
      totalSources += s.amount;
    }
  } else {
    for (const cd of capDebtRows) {
      if (cd.isLoan) {
        r++;
        ws.getCell(r, 1).value = cd.lineItem || "Loan"; dc(ws.getCell(r, 1));
        ws.getCell(r, 2).value = cd.loanPrincipal || 0; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
        totalSources += cd.loanPrincipal || 0;
      }
    }
    if (startingCash > 0) {
      r++;
      ws.getCell(r, 1).value = "Starting Cash / Equity"; dc(ws.getCell(r, 1));
      ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
      totalSources += startingCash;
    }
  }

  const usesStartRow = r + 1;
  r = usesStartRow - 1;

  let ur = 3;
  if (su && su.uses && su.uses.length > 0) {
    for (const u of su.uses) {
      ur++;
      ws.getCell(ur, 4).value = u.lineItem; dc(ws.getCell(ur, 4));
      ws.getCell(ur, 5).value = u.amount; ws.getCell(ur, 5).numFmt = CUR; dc(ws.getCell(ur, 5));
      totalUses += u.amount;
    }
  } else {
    ur++;
    ws.getCell(ur, 4).value = "Working Capital"; dc(ws.getCell(ur, 4));
    ws.getCell(ur, 5).value = totalSources; ws.getCell(ur, 5).numFmt = CUR; dc(ws.getCell(ur, 5));
    totalUses = totalSources;
  }

  const maxR = Math.max(r, ur) + 2;
  ws.getCell(maxR, 1).value = "Total Sources"; bc(ws.getCell(maxR, 1));
  ws.getCell(maxR, 2).value = Math.round(totalSources); ws.getCell(maxR, 2).numFmt = CUR; gc(ws.getCell(maxR, 2)); outputCell(ws.getCell(maxR, 2));
  ws.getCell(maxR, 4).value = "Total Uses"; bc(ws.getCell(maxR, 4));
  ws.getCell(maxR, 5).value = Math.round(totalUses); ws.getCell(maxR, 5).numFmt = CUR; gc(ws.getCell(maxR, 5)); outputCell(ws.getCell(maxR, 5));

  const checkRow = maxR + 1;
  ws.getCell(checkRow, 1).value = "Sources - Uses (should = 0)"; bc(ws.getCell(checkRow, 1));
  const diff = Math.round(totalSources - totalUses);
  ws.getCell(checkRow, 2).value = diff; ws.getCell(checkRow, 2).numFmt = CUR;
  ws.getCell(checkRow, 2).font = { ...BF, color: { argb: diff === 0 ? EVERGREEN : "FFFF0000" } };
  ws.getCell(checkRow, 2).border = BORDER;
}

function buildScenarios(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], revByYear: number[], persByYear: number[], opexByYear: number[], cdByYear: number[]) {
  const ws = wb.addWorksheet("Scenarios");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const niLabel = netIncomeLabel(sp.entityType);
  ws.columns = [{ width: 28 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);
  const prorationFactor = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 10) / 12 : 1;
  const scRR = data.enrollment?.retentionRate ?? 85;
  // Use single escalation rate consistent with generateWorkbook() policy
  const costInflPct = data.tuitionEscalation?.rate ?? 3;
  const expenseRows = data.expenseRows || [];

  const facByYear: number[] = [];
  const otherOpexByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    let facTotal = 0;
    let otherTotal = 0;
    for (const r of expenseRows) {
      if (!r.enabled) continue;
      let val: number;
      if (r.driverType === "percent_of_revenue") {
        const esc = r.escalationRate ?? costInflPct ?? 0;
        let pct: number;
        if (esc !== 0 && y > 0) {
          pct = (r.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y);
        } else {
          pct = r.amounts?.[y] ?? 0;
        }
        val = (pct / 100) * revByYear[y];
      } else {
        val = driverVal(r.amounts, y, r.driverType, enrollment[y], r.escalationRate, costInflPct, computeNewStudents(enrollment, scRR, y), computeReturningStudents(enrollment, scRR, y), r.escalationRateOverridden);
      }
      val *= pf;
      if (r.category === "occupancy_facility") {
        facTotal += val;
      } else {
        otherTotal += val;
      }
    }
    facByYear.push(facTotal);
    otherOpexByYear.push(otherTotal);
  }

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "Scenario Analysis";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  const scenarios = data.scenarios && data.scenarios.length > 0
    ? data.scenarios
    : [
        { name: "Base Case", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0 },
        { name: "Stress Case", enrollmentAdjustment: -20, tuitionAdjustment: -10, expenseAdjustment: 0 },
        { name: "Optimistic Case", enrollmentAdjustment: 15, tuitionAdjustment: 5, expenseAdjustment: -5 },
      ];

  for (const scenario of scenarios) {
    r += 2;
    sec(ws, r, 6); ws.getCell(r, 1).value = scenario.name.toUpperCase();
    r++;
    const staffAdj = scenario.staffingAdjustment || 0;
    const facAdj = scenario.facilityAdjustment || 0;
    const parts = [
      `Enrollment: ${scenario.enrollmentAdjustment >= 0 ? "+" : ""}${scenario.enrollmentAdjustment}%`,
      `Revenue: ${scenario.tuitionAdjustment >= 0 ? "+" : ""}${scenario.tuitionAdjustment}%`,
      `Staffing: ${staffAdj >= 0 ? "+" : ""}${staffAdj}%`,
      `Facility: ${facAdj >= 0 ? "+" : ""}${facAdj}%`,
      `Expenses: ${scenario.expenseAdjustment >= 0 ? "+" : ""}${scenario.expenseAdjustment}%`,
    ];
    ws.getCell(r, 1).value = parts.join("  |  ");
    ws.getCell(r, 1).font = { ...NF, italic: true, color: { argb: "FF666666" } };

    r++;
    ws.getRow(r).values = ["", ...yLabels];
    hdr(ws, r, 6);

    const enrollFactor = 1 + scenario.enrollmentAdjustment / 100;
    const revFactor = 1 + scenario.tuitionAdjustment / 100;
    const adjEnroll = enrollment.map(e => Math.round(e * enrollFactor));
    const adjRev = revByYear.map(v => v * enrollFactor * revFactor);
    const adjPers = persByYear.map(v => v * (1 + staffAdj / 100));
    const adjFac = facByYear.map(v => v * (1 + facAdj / 100));
    const adjOther = otherOpexByYear.map(v => v * (1 + scenario.expenseAdjustment / 100));
    const adjOpex = adjFac.map((f, y) => f + adjOther[y]);
    const adjTotalExp = adjPers.map((p, y) => p + adjOpex[y] + cdByYear[y]);
    const adjNI = adjRev.map((rev, y) => rev - adjTotalExp[y]);

    r++;
    ws.getCell(r, 1).value = "Revenue"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) { ws.getCell(r, y + 2).value = Math.round(adjRev[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2)); }

    r++;
    ws.getCell(r, 1).value = "Total Expenses"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) { ws.getCell(r, y + 2).value = Math.round(adjTotalExp[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2)); }

    r++;
    ws.getCell(r, 1).value = niLabel; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) { ws.getCell(r, y + 2).value = Math.round(adjNI[y]); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2)); }

    r++;
    ws.getCell(r, 1).value = "Net Margin %"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      ws.getCell(r, y + 2).value = adjRev[y] > 0 ? adjNI[y] / adjRev[y] : 0;
      ws.getCell(r, y + 2).numFmt = PCT; dc(ws.getCell(r, y + 2));
    }

    r++;
    ws.getCell(r, 1).value = "DSCR"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const scenCfads = adjNI[y] + cdByYear[y];
      ws.getCell(r, y + 2).value = cdByYear[y] > 0 ? Math.round(scenCfads / cdByYear[y] * 100) / 100 : "N/A";
      ws.getCell(r, y + 2).numFmt = "0.00x"; dc(ws.getCell(r, y + 2));
    }

    r++;
    ws.getCell(r, 1).value = "Break-Even Enrollment"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const rps = adjEnroll[y] > 0 ? adjRev[y] / adjEnroll[y] : 0;
      const vcps = adjEnroll[y] > 0 ? adjOpex[y] / adjEnroll[y] : 0;
      const cm = rps - vcps;
      const fc = adjPers[y] + cdByYear[y];
      ws.getCell(r, y + 2).value = cm > 0 ? Math.ceil(fc / cm) : "N/A"; ws.getCell(r, y + 2).numFmt = NUM; dc(ws.getCell(r, y + 2));
    }
  }
}

function buildUnderwritingSnapshot(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], revByYear: number[], persByYear: number[], opexByYear: number[], cdByYear: number[], niByYear: number[], cashByYear: number[], balanceByYear: number[]) {
  const ws = wb.addWorksheet("Underwriting Snapshot");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const niLabel = netIncomeLabel(sp.entityType);
  ws.columns = [{ width: 28 }, { width: 30 }, { width: 4 }, ...Array(5).fill({ width: 14 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 8);
  ws.getCell(r, 1).value = "Underwriting Snapshot - Loan Committee Summary";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  sec(ws, r, 2); ws.getCell(r, 1).value = "SCHOOL PROFILE";
  const profileInfo: [string, string][] = [
    ["School Name", sp.schoolName || "-"],
    ["Type", schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)],
    ["Entity", entityLabel(sp.entityType)],
    ["Stage", stageLabel(sp.schoolStage)],
    ["State", sp.state || "-"],
    ["Funding", fundingLabel(sp.fundingProfile)],
  ];
  for (const [label, val] of profileInfo) {
    r++;
    ws.getCell(r, 1).value = label; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = val; dc(ws.getCell(r, 2));
  }

  r += 2;
  sec(ws, r, 8); ws.getCell(r, 1).value = "5-YEAR FINANCIAL TREND";
  r++;
  ws.getRow(r).values = ["", "", "", ...yLabels];
  for (let c = 4; c <= 8; c++) { ws.getCell(r, c).font = HEADER_FONT; ws.getCell(r, c).fill = HEADER_FILL; ws.getCell(r, c).border = BORDER; ws.getCell(r, c).alignment = { horizontal: "center" }; }

  const trendLines: [string, number[]][] = [
    ["Revenue", revByYear],
    ["Total Expenses", persByYear.map((p, y) => p + opexByYear[y] + cdByYear[y])],
    [niLabel, niByYear],
    ["Cash Position", cashByYear],
    ["Outstanding Debt", balanceByYear],
  ];
  for (const [label, arr] of trendLines) {
    r++;
    ws.getCell(r, 1).value = label; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      ws.getCell(r, y + 4).value = Math.round(arr[y]); ws.getCell(r, y + 4).numFmt = CUR; dc(ws.getCell(r, y + 4));
    }
  }

  r += 2;
  sec(ws, r, 8); ws.getCell(r, 1).value = "KEY RATIOS";
  r++;
  ws.getRow(r).values = ["", "", "", ...yLabels];
  for (let c = 4; c <= 8; c++) { ws.getCell(r, c).font = HEADER_FONT; ws.getCell(r, c).fill = HEADER_FILL; ws.getCell(r, c).border = BORDER; ws.getCell(r, c).alignment = { horizontal: "center" }; }

  r++;
  ws.getCell(r, 1).value = "Net Margin"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 4).value = revByYear[y] > 0 ? niByYear[y] / revByYear[y] : 0;
    ws.getCell(r, y + 4).numFmt = PCT; dc(ws.getCell(r, y + 4));
  }

  r++;
  ws.getCell(r, 1).value = "DSCR"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const snapCfads = niByYear[y] + cdByYear[y];
    ws.getCell(r, y + 4).value = cdByYear[y] > 0 ? Math.round(snapCfads / cdByYear[y] * 100) / 100 : "N/A";
    ws.getCell(r, y + 4).numFmt = "0.00x"; dc(ws.getCell(r, y + 4));
  }

  r++;
  ws.getCell(r, 1).value = "Capacity Utilization"; dc(ws.getCell(r, 1));
  const cap = sp.maxCapacity || 0;
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 4).value = cap > 0 ? enrollment[y] / cap : 0;
    ws.getCell(r, y + 4).numFmt = PCT; dc(ws.getCell(r, y + 4));
  }

  r++;
  ws.getCell(r, 1).value = "Enrollment"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 4).value = enrollment[y]; ws.getCell(r, y + 4).numFmt = NUM; dc(ws.getCell(r, y + 4));
  }

  r += 2;
  ws.mergeCells(r, 1, r, 8);
  ws.getCell(r, 1).value = "Prepared by SchoolStack Budget - budget.schoolstack.ai";
  ws.getCell(r, 1).font = { size: 11, name: "Calibri", italic: true, color: { argb: "FF999999" } };
  ws.getCell(r, 1).alignment = { horizontal: "center" };
}

interface ComputedFlag {
  field: string;
  flagType: string;
  severity: string;
  message: string;
  currentValue?: string;
}

export async function generateUnderwritingWorkbook(data: Record<string, unknown>, computedFlags?: ComputedFlag[]): Promise<ExcelJS.Workbook> {
  return generateWorkbook(data as ModelData, computedFlags);
}

async function generateWorkbook(data: ModelData, computedFlags?: ComputedFlag[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const sp = data.schoolProfile || {};
  const enrollment = getEnrollmentArray(data.enrollment);
  // ESCALATION SOURCE RESOLUTION
  // Each category resolves its own field, falling back to the shared rate:
  //   salary  → data.salaryEscalationRate  ?? data.tuitionEscalation.rate ?? 3
  //   opCost  → data.costInflationRate     ?? data.tuitionEscalation.rate ?? 3
  //   revenue → data.tuitionEscalation.rate ?? 3
  // Today the UI only exposes tuitionEscalation.rate, so all three resolve to
  // the same value. When the UI adds per-category inputs, the math is ready.
  // Per-line overrides are always respected via resolveEsc().
  const sharedRate = data.tuitionEscalation?.rate ?? 3;
  const salaryEscPct = data.salaryEscalationRate ?? sharedRate;
  const costInflPct = data.costInflationRate ?? sharedRate;
  const salaryEsc = salaryEscPct / 100;
  const costInflation = costInflPct / 100;
  const prorationFactor = getProrationFactor(sp);
  const startingCash = data.priorYearSnapshot?.endingCash ?? data.currentYearProjection?.currentCash ?? 0;
  const debtIncluded = sp.debtIncluded !== false;

  // When debtIncluded is false, filter out loan rows from the data object so
  // every downstream function (Budget Detail, Monthly Cash Flow, Operating
  // Statement, DSCR, Balance Sheet, Scenarios) consistently excludes loan
  // debt service. Non-loan capital expenditure rows are always kept.
  const effectiveData = debtIncluded ? data : {
    ...data,
    capitalAndDebtRows: (data.capitalAndDebtRows || []).filter(r => !r.isLoan),
  };

  buildInstructions(wb, data);
  buildCover(wb, data);
  const asmReg = buildAssumptions(wb, data, enrollment, salaryEsc, costInflation, prorationFactor, startingCash);
  buildProgramProfile(wb, data);
  const edRefs = buildEnrollmentDrivers(wb, data, enrollment, asmReg);
  buildTuitionFunding(wb, data, enrollment, edRefs);
  buildStaffingDrivers(wb, data, enrollment, salaryEsc, prorationFactor);
  buildOpExDrivers(wb, data, enrollment);
  buildCapitalStack(wb, data);
  buildEnrollmentTuitionForecast(wb, data, enrollment);
  buildStaffingCostsForecast(wb, data, enrollment, salaryEsc, prorationFactor);

  const { revByYear, persByYear, opexByYear, cdByYear, revTotalRow, persTotalRow, opexTotalRow, cdTotalRow } = buildBudgetDetail(wb, effectiveData, enrollment, salaryEsc, costInflPct, prorationFactor);
  const bdRefs: BudgetDetailRefs = { revTotalRow, persTotalRow, opexTotalRow, cdTotalRow };
  const { niByYear } = buildBudgetSummary(wb, effectiveData, enrollment, revByYear, persByYear, opexByYear, cdByYear, bdRefs);

  const openFA = data.openingBalances?.fixedAssets ?? 0;
  const usefulLife = data.openingBalances?.fixedAssetUsefulLife ?? 7;
  const depreciationByYear: number[] = [];
  const projectedARByYear: number[] = [];
  const tuitionRows = (data.revenueRows || []).filter(r => r.enabled && (r.category === "tuition_and_fees"));
  const tuitionByYear: number[] = Array(5).fill(0);
  for (const row of tuitionRows) {
    for (let y = 0; y < 5; y++) {
      tuitionByYear[y] += (row.amounts?.[y] ?? 0);
    }
  }
  for (let y = 0; y < 5; y++) {
    const depr = computeStraightLineDepreciation(openFA, usefulLife, y);
    depreciationByYear.push(depr.annualDepreciation);
    const tuitionRev = tuitionByYear[y] > 0 ? tuitionByYear[y] : revByYear[y] * 0.7;
    projectedARByYear.push(computeProjectedAR(tuitionRev, 30));
  }

  const { endingCashY1, cumCashRow: cfCumCashRow } = buildMonthlyCashFlowY1(wb, effectiveData, enrollment, salaryEsc, costInflPct, prorationFactor, startingCash);
  const { niRow: opStmtNiRow, cumNIRow: opStmtCumNIRow } = buildOperatingStatement(wb, effectiveData, enrollment, revByYear, persByYear, opexByYear, cdByYear, niByYear, depreciationByYear);

  const debtResult = buildDebtSchedule(wb, effectiveData);
  const debtServiceByYear = debtResult.debtByYear;
  const balanceByYear = debtResult.balanceByYear;
  const debtBalanceRow = debtResult.debtBalanceRow;

  const crossRefs: CrossTabRefs = { cfCumCashRow, opStmtNiRow, debtBalanceRow };
  const { cashByYear } = buildBalanceSheet(wb, data, niByYear, balanceByYear, startingCash, crossRefs, endingCashY1, depreciationByYear, projectedARByYear);

  buildDSCRCovenants(wb, data, enrollment, revByYear, persByYear, opexByYear, debtServiceByYear, niByYear, cashByYear, depreciationByYear, projectedARByYear);
  buildSourcesAndUses(wb, data, startingCash);
  buildScenarios(wb, data, enrollment, revByYear, persByYear, opexByYear, debtServiceByYear);
  buildUnderwritingSnapshot(wb, data, enrollment, revByYear, persByYear, opexByYear, debtServiceByYear, niByYear, cashByYear, balanceByYear);

  const hasDebt = debtIncluded && (data.capitalAndDebtRows || []).some(r => r.isLoan && r.enabled !== false);

  const revCatsUW: Record<string, number[]> = {};
  for (const rv of (effectiveData.revenueRows || []).filter(r => r.enabled)) {
    const cat = rv.category || "other";
    if (!revCatsUW[cat]) revCatsUW[cat] = new Array(5).fill(0);
    for (let y = 0; y < 5; y++) {
      const students = enrollment[y];
      const val = computeRevLineItem(rv, y, students, effectiveData.tuitionTiers || [], costInflPct, sp);
      revCatsUW[cat][y] += rv.category === "tuition_offsets" ? -Math.abs(val) : val;
    }
  }

  const dashRR = effectiveData.enrollment?.retentionRate ?? 85;
  const facCostByYearUW = computeFacilityCostByYear(effectiveData.expenseRows || [], enrollment, revByYear, 5, costInflPct, dashRR);
  const instrCostByYearUW = computeInstructionalCostByYear(effectiveData.expenseRows || [], enrollment, revByYear, 5, costInflPct);

  await addDashboardSheet(wb, {
    schoolName: sp.schoolName || "School",
    entityType: sp.entityType || "",
    enrollment,
    revenueByYear: revByYear,
    personnelByYear: persByYear,
    opexByYear: opexByYear,
    facilityCostByYear: facCostByYearUW,
    instructionalByYear: instrCostByYearUW,
    debtServiceByYear: debtServiceByYear,
    netIncomeByYear: niByYear,
    cashByYear,
    startingCash,
    hasDebt,
    revenueCategories: revCatsUW,
    cumNIRef: { sheetName: "5-Year Operating Stmt", row: opStmtCumNIRow, startCol: 2 },
  });

  buildNarrativeTab(wb, data, computedFlags);
  addDecisionHistorySheet(wb, data);

  return wb;
}

function buildNarrativeTab(wb: ExcelJS.Workbook, data: ModelData, computedFlags?: ComputedFlag[]) {
  const ws = wb.addWorksheet("Budget Narrative");
  printSetup(ws);
  ws.columns = [{ width: 30 }, { width: 70 }];

  const raw = data as unknown as Record<string, unknown>;
  const narrative = (raw.budgetNarrative || {}) as Record<string, string>;
  const flagResponses = (raw.assumptionFlagResponses || []) as Array<{ field: string; flagType: string; reason: string }>;

  let row = 1;
  ws.getRow(row).values = ["Budget Narrative", ""];
  hdr(ws, row, 2);
  ws.mergeCells(row, 1, row, 2);
  row += 2;

  const sections = [
    ["Enrollment Strategy", narrative.enrollmentStrategy],
    ["Retention Plan", narrative.retentionPlan],
    ["Risk Mitigation", narrative.riskMitigation],
    ["Mission & Vision", narrative.missionAndVision],
    ["Revenue Assumptions", narrative.revenueAssumptions],
    ["Staffing Philosophy", narrative.staffingPhilosophy],
    ["Expense Assumptions", narrative.expenseAssumptions],
    ["Growth Strategy", narrative.growthStrategy],
    ["Additional Context", narrative.additionalContext],
  ] as const;

  for (const [label, text] of sections) {
    sec(ws, row, 2);
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { ...BF, color: { argb: NAVY } };
    row++;
    const content = text?.trim() || "(Not provided)";
    ws.getCell(row, 1).value = content;
    ws.getCell(row, 1).font = NF;
    ws.getCell(row, 1).alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(row, 1, row, 2);
    row += 2;
  }

  const responseMap = new Map<string, string>();
  for (const resp of flagResponses) {
    responseMap.set(`${resp.flagType}:${resp.field}`, resp.reason || "");
  }

  const flagsToShow = computedFlags && computedFlags.length > 0 ? computedFlags : null;

  if (flagsToShow) {
    row++;
    ws.columns = [{ width: 12 }, { width: 22 }, { width: 30 }, { width: 20 }, { width: 35 }];
    ws.getRow(row).values = ["Severity", "Flag Type", "Description", "Current Value", "Explanation"];
    hdr(ws, row, 5);
    row++;

    for (const flag of flagsToShow) {
      const sevLabel = flag.severity.charAt(0).toUpperCase() + flag.severity.slice(1);
      const explanation = responseMap.get(`${flag.flagType}:${flag.field}`) || "(Not addressed)";

      ws.getCell(row, 1).value = sevLabel;
      ws.getCell(row, 1).font = NF;
      ws.getCell(row, 2).value = flag.flagType;
      ws.getCell(row, 2).font = NF;
      ws.getCell(row, 3).value = flag.message;
      ws.getCell(row, 3).font = NF;
      ws.getCell(row, 3).alignment = { wrapText: true };
      ws.getCell(row, 4).value = flag.currentValue || "";
      ws.getCell(row, 4).font = NF;
      ws.getCell(row, 5).value = explanation;
      ws.getCell(row, 5).font = NF;
      ws.getCell(row, 5).alignment = { wrapText: true };
      row++;
    }
  } else if (flagResponses.length > 0) {
    row++;
    ws.columns = [{ width: 15 }, { width: 25 }, { width: 25 }, { width: 35 }];
    ws.getRow(row).values = ["Severity", "Flag", "Current Value", "Explanation"];
    hdr(ws, row, 4);
    row++;

    for (const resp of flagResponses) {
      ws.getCell(row, 1).value = resp.flagType;
      ws.getCell(row, 1).font = NF;
      ws.getCell(row, 2).value = resp.field;
      ws.getCell(row, 2).font = NF;
      ws.getCell(row, 3).value = "";
      ws.getCell(row, 3).font = NF;
      ws.getCell(row, 4).value = resp.reason || "(Not addressed)";
      ws.getCell(row, 4).font = NF;
      ws.getCell(row, 4).alignment = { wrapText: true };
      row++;
    }
  }
}
