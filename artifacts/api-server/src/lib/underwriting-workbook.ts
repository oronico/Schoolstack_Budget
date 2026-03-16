import ExcelJS from "exceljs";
import {
  NAVY, WHITE, LIGHT_GRAY, GREEN_BG, YELLOW_INPUT, EVERGREEN, CREAM,
  HEADER_FILL, HEADER_FONT, SECTION_FILL, SECTION_FONT, NF, BF,
  CUR, PCT, NUM, BORDER, SUBTOTAL_BORDER, MONTH_NAMES,
  hdr, sec, dc, bc, gc, cn, colLetter, setFormula, inputCell, outputCell, printSetup,
  schoolYearLabel, yearLabels, schoolTypeLabel, entityLabel, funcLabel, catLabel, expCatLabel, driverLabel,
  fundingLabel, stageLabel, schoolModelFromType, isNonprofit, netIncomeLabel, equityLabel,
  normalizeStaffingRow, getEnrollmentArray,
  computeAnnualDebt, computeAnnualDebtForYear, computeInterestPortion, computePrincipalPortion, computeRemainingBalance,
  computeRevLineItem, computeRevenueForYear, computePersonnelForYear, computeStaffingLoaded,
  computeExpenseForYear, computeCapDebtForYear,
  driverVal, resolveEsc, tuitionWithTiers,
  ModelData, SchoolProfile, RevenueRow, StaffingRow, ExpenseRow, CapitalDebtRow, TuitionTier,
} from "./workbook-helpers.js";

const TAB_NAMES = [
  "Cover", "Instructions", "Assumptions", "Program Profile",
  "Enrollment Drivers", "Tuition & Funding", "Staffing Drivers", "OpEx Drivers", "Capital Stack",
  "Enrollment Tuition Fcst", "Staffing Costs Fcst", "Budget Detail", "Budget Summary",
  "Monthly Cash Flow Y1", "5-Year Operating Stmt", "Debt Schedule", "Balance Sheet",
  "DSCR & Covenants", "Sources & Uses", "Scenarios", "Underwriting Snapshot",
];

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
    ["School Name", sp.schoolName || "—"],
    ["School Type", schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)],
    ["Entity Type", entityLabel(sp.entityType)],
    ["State", sp.state || "—"],
    ["Fiscal Year Start", sp.fiscalYearStartMonth ? `Month ${sp.fiscalYearStartMonth}` : "July"],
    ["Model Date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
    ["Stage", stageLabel(sp.schoolStage)],
    ["Funding Profile", fundingLabel(sp.fundingProfile)],
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
  ws.getCell(r, 2).value = "CONFIDENTIAL — Prepared by SchoolStack Budget (budget.schoolstack.ai)";
  ws.getCell(r, 2).font = { size: 9, name: "Calibri", color: { argb: "FF999999" }, italic: true };
  ws.getCell(r, 2).alignment = { horizontal: "center" };
}

function buildInstructions(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Instructions");
  ws.columns = [{ width: 4 }, { width: 80 }];
  printSetup(ws);

  let r = 2;
  ws.getCell(r, 2).value = "How to Use This Workbook";
  ws.getCell(r, 2).font = { bold: true, size: 16, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  const instructions = [
    ["Color Legend", ""],
    ["", "Yellow cells are editable inputs — change these to update your model."],
    ["", "Gray cells contain formulas — do not edit."],
    ["", "Green cells are key outputs and summary metrics."],
    ["", ""],
    ["Navigation", "Use the Cover tab's Table of Contents to jump between sheets."],
    ["", "The Assumptions tab is the central control panel — all other tabs reference it."],
    ["", ""],
    ["Structure", "Tabs 1-4: Profile & setup"],
    ["", "Tabs 5-9: Drivers & inputs"],
    ["", "Tabs 10-13: Forecasts & budgets"],
    ["", "Tabs 14-17: Financial statements"],
    ["", "Tabs 18-21: Analysis & underwriting"],
    ["", ""],
    ["Tips", "Start with the Assumptions tab to verify your inputs."],
    ["", "Review the Budget Summary for a high-level view."],
    ["", "Check DSCR & Covenants for lender readiness."],
    ["", "The Underwriting Snapshot provides a one-page summary."],
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
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} — Assumptions`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };
  ws.getRow(r).height = 32;

  r++;
  ws.getCell(r, 1).value = "Yellow cells are editable inputs. All other cells are formulas.";
  ws.getCell(r, 1).font = { size: 10, name: "Calibri", italic: true, color: { argb: "FF666666" } };

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
  ws.getRow(r).values = ["Line Item", "Category", "Driver", "Amount", "Escalation %"];
  hdr(ws, r, 5);
  const revStartRow = r + 1;
  for (const rv of revenueRows) {
    r++;
    ws.getCell(r, 1).value = rv.lineItem || "Unnamed"; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = catLabel(rv.category); dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = driverLabel(rv.driverType); dc(ws.getCell(r, 3));
    ws.getCell(r, 4).value = rv.amounts?.[0] ?? 0; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4)); inputCell(ws.getCell(r, 4));
    ws.getCell(r, 5).value = (rv.escalationRate ?? 0) / 100; ws.getCell(r, 5).numFmt = PCT; dc(ws.getCell(r, 5)); inputCell(ws.getCell(r, 5));
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
    ws.getCell(r, 2).value = expCatLabel(ex.category); dc(ws.getCell(r, 2));
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
  const salaryEscRow = r;

  r++;
  ws.getCell(r, 1).value = "Cost Inflation Rate"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = costInflation; ws.getCell(r, 2).numFmt = PCT; dc(ws.getCell(r, 2)); inputCell(ws.getCell(r, 2));
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

  return { enrollRow, revStartRow, staffStartRow, expStartRow, capStartRow, salaryEscRow, costInflRow, prorationRow, startCashRow, maxCapRow, debtIncRow };
}

function buildProgramProfile(wb: ExcelJS.Workbook, data: ModelData) {
  const ws = wb.addWorksheet("Program Profile");
  const sp = data.schoolProfile || {};
  ws.columns = [{ width: 36 }, { width: 30 }];
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
    ["Accredited", sp.isAccredited ? `Yes — ${sp.accreditingBody || ""}` : "No"],
    ["Location", sp.locationSecured ? `${sp.facilityStreet || ""}, ${sp.facilityCity || ""}, ${sp.facilityState || ""} ${sp.facilityZip || ""}`.trim() : "Not yet secured"],
    ["Facility", sp.ownershipType === "own" ? "Owned" : "Leased"],
  ];
  for (const [label, val] of entries) {
    ws.getCell(r, 1).value = label; bc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = val; dc(ws.getCell(r, 2));
    r++;
  }
}

function buildEnrollmentDrivers(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[]) {
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

  if (programs.length > 0) {
    r++;
    sec(ws, r, cols); ws.getCell(r, 1).value = "BY PROGRAM";
    for (const p of programs) {
      r++;
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
  }

  r += 2;
  sec(ws, r, cols); ws.getCell(r, 1).value = "TOTAL ENROLLMENT";
  r++;
  ws.getCell(r, 1).value = "Total Students"; bc(ws.getCell(r, 1));
  let c = 2;
  if (hasHistory) {
    ws.getCell(r, c).value = data.priorYearSnapshot?.endingEnrollment ?? 0; ws.getCell(r, c).numFmt = NUM; bc(ws.getCell(r, c)); c++;
    ws.getCell(r, c).value = data.currentYearProjection?.currentEnrollment ?? 0; ws.getCell(r, c).numFmt = NUM; bc(ws.getCell(r, c)); c++;
  }
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, c).value = enrollment[y]; ws.getCell(r, c).numFmt = NUM; gc(ws.getCell(r, c)); outputCell(ws.getCell(r, c));
    c++;
  }

  r++;
  ws.getCell(r, 1).value = "Max Capacity"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = sp.maxCapacity || 0; ws.getCell(r, 2).numFmt = NUM; dc(ws.getCell(r, 2));

  r++;
  ws.getCell(r, 1).value = "Capacity Utilization"; dc(ws.getCell(r, 1));
  const cap = sp.maxCapacity || 0;
  const startCol = hasHistory ? 4 : 2;
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(r, startCol + y);
    cell.value = cap > 0 ? enrollment[y] / cap : 0;
    cell.numFmt = PCT; dc(cell); outputCell(cell);
  }

  r += 2;
  ws.getCell(r, 1).value = "Enrollment Growth Rate"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(r, startCol + y);
    if (y === 0) {
      cell.value = "—"; dc(cell);
    } else {
      const prev = enrollment[y - 1];
      cell.value = prev > 0 ? (enrollment[y] - prev) / prev : 0;
      cell.numFmt = PCT; dc(cell);
    }
  }
}

function buildTuitionFunding(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[]) {
  const ws = wb.addWorksheet("Tuition & Funding");
  const sp = data.schoolProfile || {};
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const yLabels = yearLabels(sp.openingYear);
  const costInflPct = (data.tuitionEscalation?.rate ?? 3);
  ws.columns = [{ width: 32 }, ...Array(6).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = "Tuition & Funding Drivers";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "REVENUE BY LINE ITEM";
  for (const rv of revenueRows) {
    r++;
    ws.getCell(r, 1).value = `${rv.lineItem} (${catLabel(rv.category)})`; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const students = enrollment[y];
      const val = computeRevLineItem(rv, y, students, tiers, costInflPct);
      const sign = rv.category === "tuition_offsets" ? -1 : 1;
      const cell = ws.getCell(r, y + 2);
      cell.value = Math.round(val * sign); cell.numFmt = CUR; dc(cell);
    }
  }

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL REVENUE";
  for (let y = 0; y < 5; y++) {
    const val = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct);
    const cell = ws.getCell(r, y + 2);
    cell.value = Math.round(val); cell.numFmt = CUR; gc(cell); outputCell(cell);
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
  ws.columns = [{ width: 28 }, { width: 16 }, { width: 10 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 7);
  ws.getCell(r, 1).value = "Staffing Drivers";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["Role", "Category", "FTE", "Base Rate", "Benefits %", "Tax %", "Loaded Cost"];
  hdr(ws, r, 7);
  for (const sr of staffingRows) {
    r++;
    ws.getCell(r, 1).value = sr.roleName; dc(ws.getCell(r, 1));
    ws.getCell(r, 2).value = funcLabel(sr.functionCategory); dc(ws.getCell(r, 2));
    ws.getCell(r, 3).value = sr.fte; ws.getCell(r, 3).numFmt = "0.00"; dc(ws.getCell(r, 3));
    ws.getCell(r, 4).value = sr.annualizedRate; ws.getCell(r, 4).numFmt = CUR; dc(ws.getCell(r, 4));
    ws.getCell(r, 5).value = sr.benefitsRate / 100; ws.getCell(r, 5).numFmt = PCT; dc(ws.getCell(r, 5));
    ws.getCell(r, 6).value = sr.payrollTaxRate / 100; ws.getCell(r, 6).numFmt = PCT; dc(ws.getCell(r, 6));
    ws.getCell(r, 7).value = Math.round(computeStaffingLoaded(sr)); ws.getCell(r, 7).numFmt = CUR; bc(ws.getCell(r, 7));
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
    const val = computePersonnelForYear(staffingRows, salaryEsc, pf, y);
    const cell = ws.getCell(r, y + 2);
    cell.value = Math.round(val); cell.numFmt = CUR; gc(cell); outputCell(cell);
  }

  r++;
  ws.getCell(r, 1).value = "Personnel as % of Revenue"; dc(ws.getCell(r, 1));
  const revenueRows = (data.revenueRows || []).filter(r => r.enabled);
  const tiers = data.tuitionTiers || [];
  const costInflPct = (data.tuitionEscalation?.rate ?? 3);
  for (let y = 0; y < 5; y++) {
    const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct);
    const pf = y === 0 ? prorationFactor : 1;
    const pers = computePersonnelForYear(staffingRows, salaryEsc, pf, y);
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
  const expenseRows = (data.expenseRows || []).filter(r => r.enabled);
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

  const categories = ["instructional_program", "technology", "occupancy_facility", "administrative_general"];
  for (const cat of categories) {
    const catRows = expenseRows.filter(e => e.category === cat);
    r++;
    sec(ws, r, 6); ws.getCell(r, 1).value = expCatLabel(cat);
    for (const ex of catRows) {
      r++;
      ws.getCell(r, 1).value = `  ${ex.lineItem}`; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct);
        let val: number;
        if (ex.driverType === "percent_of_revenue") {
          const esc = resolveEsc(ex.escalationRate, costInflPct);
          let pct = esc !== 0 && y > 0 ? (ex.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y) : (ex.amounts?.[y] ?? 0);
          val = (pct / 100) * rev;
        } else {
          val = driverVal(ex.amounts, y, ex.driverType, enrollment[y], ex.escalationRate, costInflPct);
        }
        const cell = ws.getCell(r, y + 2);
        cell.value = Math.round(val); cell.numFmt = CUR; dc(cell);
      }
    }
    r++;
    ws.getCell(r, 1).value = `Total ${expCatLabel(cat)}`; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct);
      let catTotal = 0;
      for (const ex of catRows) {
        if (ex.driverType === "percent_of_revenue") {
          const esc = resolveEsc(ex.escalationRate, costInflPct);
          let pct = esc !== 0 && y > 0 ? (ex.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y) : (ex.amounts?.[y] ?? 0);
          catTotal += (pct / 100) * rev;
        } else {
          catTotal += driverVal(ex.amounts, y, ex.driverType, enrollment[y], ex.escalationRate, costInflPct);
        }
      }
      const cell = ws.getCell(r, y + 2);
      cell.value = Math.round(catTotal); cell.numFmt = CUR; gc(cell);
    }
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL OPERATING EXPENSES";
  for (let y = 0; y < 5; y++) {
    const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct);
    const val = computeExpenseForYear(expenseRows, y, enrollment[y], rev, costInflPct);
    const cell = ws.getCell(r, y + 2);
    cell.value = Math.round(val); cell.numFmt = CUR; gc(cell); outputCell(cell);
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
    ws.getCell(r, 4).numFmt = PCT; dc(ws.getCell(r, 4));
    ws.getCell(r, 5).value = cd.isLoan ? (cd.loanTermYears || 0) : 0;
    ws.getCell(r, 5).numFmt = NUM; dc(ws.getCell(r, 5));
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
  for (const rv of revenueRows) {
    r++;
    ws.getCell(r, 1).value = rv.lineItem; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const val = computeRevLineItem(rv, y, enrollment[y], tiers, costInflPct);
      const sign = rv.category === "tuition_offsets" ? -1 : 1;
      ws.getCell(r, y + 2).value = Math.round(val * sign); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }
  }

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL REVENUE";
  for (let y = 0; y < 5; y++) {
    const val = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct);
    ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2));
  }

  r += 2;
  ws.getCell(r, 1).value = "Revenue per Student"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const rev = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct);
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
  for (const cat of categories) {
    const catRows = staffingRows.filter(s => s.functionCategory === cat);
    if (catRows.length === 0) continue;
    r++;
    sec(ws, r, 6); ws.getCell(r, 1).value = funcLabel(cat);
    for (const sr of catRows) {
      r++;
      ws.getCell(r, 1).value = `  ${sr.roleName}`; dc(ws.getCell(r, 1));
      const loaded = computeStaffingLoaded(sr);
      for (let y = 0; y < 5; y++) {
        const pf = y === 0 ? prorationFactor : 1;
        const val = loaded * Math.pow(1 + salaryEsc, y) * pf;
        ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
      }
    }
    r++;
    ws.getCell(r, 1).value = `Total ${funcLabel(cat)}`; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      let catTotal = 0;
      for (const sr of catRows) {
        const pf = y === 0 ? prorationFactor : 1;
        catTotal += computeStaffingLoaded(sr) * Math.pow(1 + salaryEsc, y) * pf;
      }
      ws.getCell(r, y + 2).value = Math.round(catTotal); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
    }
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL PERSONNEL";
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const val = computePersonnelForYear(staffingRows, salaryEsc, pf, y);
    ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2));
  }
}

function buildBudgetDetail(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], salaryEsc: number, costInflPct: number, prorationFactor: number) {
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
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} — Budget Detail`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "REVENUE";
  for (const rv of revenueRows) {
    r++;
    ws.getCell(r, 1).value = `  ${rv.lineItem}`; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const val = computeRevLineItem(rv, y, enrollment[y], tiers, costInflPct);
      const sign = rv.category === "tuition_offsets" ? -1 : 1;
      const pf = y === 0 ? prorationFactor : 1;
      ws.getCell(r, y + 2).value = Math.round(val * sign * pf); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }
  }
  r++;
  ws.getCell(r, 1).value = "Total Revenue"; bc(ws.getCell(r, 1));
  const revByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const val = computeRevenueForYear(revenueRows, y, enrollment[y], tiers, costInflPct) * pf;
    revByYear.push(val);
    ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "PERSONNEL";
  for (const sr of staffingRows) {
    r++;
    ws.getCell(r, 1).value = `  ${sr.roleName}`; dc(ws.getCell(r, 1));
    const loaded = computeStaffingLoaded(sr);
    for (let y = 0; y < 5; y++) {
      const pf = y === 0 ? prorationFactor : 1;
      ws.getCell(r, y + 2).value = Math.round(loaded * Math.pow(1 + salaryEsc, y) * pf);
      ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }
  }
  r++;
  ws.getCell(r, 1).value = "Total Personnel"; bc(ws.getCell(r, 1));
  const persByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const val = computePersonnelForYear(staffingRows, salaryEsc, pf, y);
    persByYear.push(val);
    ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "OPERATING EXPENSES";
  const expCategories = ["instructional_program", "technology", "occupancy_facility", "administrative_general"];
  for (const cat of expCategories) {
    const catRows = expenseRows.filter(e => e.category === cat);
    if (catRows.length === 0) continue;
    r++;
    ws.getCell(r, 1).value = expCatLabel(cat); ws.getCell(r, 1).font = BF;
    for (const ex of catRows) {
      r++;
      ws.getCell(r, 1).value = `    ${ex.lineItem}`; dc(ws.getCell(r, 1));
      for (let y = 0; y < 5; y++) {
        const rev = revByYear[y];
        let val: number;
        if (ex.driverType === "percent_of_revenue") {
          const esc = resolveEsc(ex.escalationRate, costInflPct);
          let pct = esc !== 0 && y > 0 ? (ex.amounts?.[0] ?? 0) * Math.pow(1 + esc / 100, y) : (ex.amounts?.[y] ?? 0);
          val = (pct / 100) * rev;
        } else {
          const pf = y === 0 ? prorationFactor : 1;
          val = driverVal(ex.amounts, y, ex.driverType, enrollment[y], ex.escalationRate, costInflPct) * pf;
        }
        ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
      }
    }
  }
  r++;
  ws.getCell(r, 1).value = "Total Operating Expenses"; bc(ws.getCell(r, 1));
  const opexByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const pf = y === 0 ? prorationFactor : 1;
    const val = computeExpenseForYear(expenseRows, y, enrollment[y], revByYear[y], costInflPct) * pf;
    opexByYear.push(val);
    ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "CAPITAL & DEBT SERVICE";
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
  r++;
  ws.getCell(r, 1).value = "Total Capital & Debt"; bc(ws.getCell(r, 1));
  const cdByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const val = computeCapDebtForYear(capDebtRows, y, enrollment[y]);
    cdByYear.push(val);
    ws.getCell(r, y + 2).value = Math.round(val); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
  }

  return { revByYear, persByYear, opexByYear, cdByYear };
}

function buildBudgetSummary(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], revByYear: number[], persByYear: number[], opexByYear: number[], cdByYear: number[]) {
  const ws = wb.addWorksheet("Budget Summary");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const niLabel = netIncomeLabel(sp.entityType);
  ws.columns = [{ width: 36 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} — Budget Summary`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  const rows: [string, number[], boolean][] = [
    ["Total Revenue", revByYear, false],
    ["Total Personnel", persByYear, false],
    ["Total Operating Expenses", opexByYear, false],
    ["Total Capital & Debt Service", cdByYear, false],
  ];
  for (const [label, arr, isOutput] of rows) {
    r++;
    ws.getCell(r, 1).value = label; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      ws.getCell(r, y + 2).value = Math.round(arr[y]); ws.getCell(r, y + 2).numFmt = CUR;
      if (isOutput) { gc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2)); } else bc(ws.getCell(r, y + 2));
    }
  }

  r++;
  ws.getCell(r, 1).value = "Total Expenses"; bc(ws.getCell(r, 1));
  const totalExpByYear = persByYear.map((p, y) => p + opexByYear[y] + cdByYear[y]);
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(totalExpByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "KEY METRICS";

  r++;
  ws.getCell(r, 1).value = niLabel; bc(ws.getCell(r, 1));
  const niByYear = revByYear.map((rev, y) => rev - totalExpByYear[y]);
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(niByYear[y]); ws.getCell(r, y + 2).numFmt = CUR;
    gc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2));
  }

  r++;
  ws.getCell(r, 1).value = "Net Margin %"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = revByYear[y] > 0 ? niByYear[y] / revByYear[y] : 0;
    ws.getCell(r, y + 2).numFmt = PCT; dc(ws.getCell(r, y + 2));
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
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} — Year 1 Monthly Cash Flow`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r++;
  ws.getRow(r).values = [...monthLabels, "Annual Total"];
  hdr(ws, r, 14);

  const rev0 = computeRevenueForYear(revenueRows, 0, students, tiers, costInflPct);
  const pers0 = computePersonnelForYear(staffingRows, salaryEsc, prorationFactor, 0);
  const opex0 = computeExpenseForYear(expenseRows, 0, students, rev0, costInflPct) * prorationFactor;
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
      if (rv.category === "tuition_and_fees" || rv.category === "tuition_offsets") {
        const bm = rv.billingMonths ?? 10;
        const effectiveAmount = rv.category === "tuition_offsets" ? -Math.abs(annualAmount) : annualAmount;
        const perMonth = effectiveAmount / bm;
        const startMonth = bm >= 12 ? 0 : 1;
        for (let i = startMonth; i < startMonth + bm && i < 12; i++) monthly[i] += perMonth;
      } else {
        const perMonth = annualAmount / opMonths;
        for (let m = 0; m < opMonths; m++) monthly[m] += perMonth;
      }
    }
    return monthly;
  };

  const monthlyRevArr = computeMonthlyRev();

  r++;
  sec(ws, r, 14); ws.getCell(r, 1).value = "REVENUE";
  r++;
  ws.getCell(r, 1).value = "Total Revenue"; bc(ws.getCell(r, 1));
  let revTotal = 0;
  for (let m = 0; m < 12; m++) {
    const v = Math.round(monthlyRevArr[m]);
    revTotal += v;
    ws.getCell(r, m + 2).value = v; ws.getCell(r, m + 2).numFmt = CUR; gc(ws.getCell(r, m + 2));
  }
  ws.getCell(r, 14).value = revTotal; ws.getCell(r, 14).numFmt = CUR; gc(ws.getCell(r, 14));

  r += 2;
  sec(ws, r, 14); ws.getCell(r, 1).value = "EXPENSES";
  r++;
  ws.getCell(r, 1).value = "Personnel"; dc(ws.getCell(r, 1));
  for (let m = 0; m < 12; m++) {
    ws.getCell(r, m + 2).value = m < opMonths ? Math.round(monthlyPers) : 0;
    ws.getCell(r, m + 2).numFmt = CUR; dc(ws.getCell(r, m + 2));
  }
  ws.getCell(r, 14).value = Math.round(pers0); ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r++;
  ws.getCell(r, 1).value = "Operating Expenses"; dc(ws.getCell(r, 1));
  for (let m = 0; m < 12; m++) {
    ws.getCell(r, m + 2).value = m < opMonths ? Math.round(monthlyOps) : 0;
    ws.getCell(r, m + 2).numFmt = CUR; dc(ws.getCell(r, m + 2));
  }
  ws.getCell(r, 14).value = Math.round(opex0); ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r++;
  ws.getCell(r, 1).value = "Debt Service"; dc(ws.getCell(r, 1));
  for (let m = 0; m < 12; m++) {
    ws.getCell(r, m + 2).value = Math.round(monthlyDebt);
    ws.getCell(r, m + 2).numFmt = CUR; dc(ws.getCell(r, m + 2));
  }
  ws.getCell(r, 14).value = Math.round(cd0); ws.getCell(r, 14).numFmt = CUR; dc(ws.getCell(r, 14));

  r += 2;
  sec(ws, r, 14); ws.getCell(r, 1).value = "CASH FLOW";
  r++;
  ws.getCell(r, 1).value = "Total Expenses"; bc(ws.getCell(r, 1));
  const totalExpMonthly: number[] = [];
  for (let m = 0; m < 12; m++) {
    const p = m < opMonths ? Math.round(monthlyPers) : 0;
    const o = m < opMonths ? Math.round(monthlyOps) : 0;
    const d = Math.round(monthlyDebt);
    const total = p + o + d;
    totalExpMonthly.push(total);
    ws.getCell(r, m + 2).value = total; ws.getCell(r, m + 2).numFmt = CUR; bc(ws.getCell(r, m + 2));
  }
  ws.getCell(r, 14).value = totalExpMonthly.reduce((a, b) => a + b, 0); ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r++;
  ws.getCell(r, 1).value = "Net Cash Flow"; bc(ws.getCell(r, 1));
  const netCashMonthly: number[] = [];
  for (let m = 0; m < 12; m++) {
    const net = Math.round(monthlyRevArr[m]) - totalExpMonthly[m];
    netCashMonthly.push(net);
    ws.getCell(r, m + 2).value = net; ws.getCell(r, m + 2).numFmt = CUR; bc(ws.getCell(r, m + 2));
  }
  ws.getCell(r, 14).value = netCashMonthly.reduce((a, b) => a + b, 0); ws.getCell(r, 14).numFmt = CUR; bc(ws.getCell(r, 14));

  r++;
  ws.getCell(r, 1).value = "Cumulative Cash"; bc(ws.getCell(r, 1));
  const cumCashMonthly: number[] = [];
  for (let m = 0; m < 12; m++) {
    const cum = m === 0 ? startingCash + netCashMonthly[0] : cumCashMonthly[m - 1] + netCashMonthly[m];
    cumCashMonthly.push(cum);
    ws.getCell(r, m + 2).value = Math.round(cum); ws.getCell(r, m + 2).numFmt = CUR; bc(ws.getCell(r, m + 2));
    outputCell(ws.getCell(r, m + 2));
  }
  ws.getCell(r, 14).value = Math.round(cumCashMonthly[11]); ws.getCell(r, 14).numFmt = CUR; gc(ws.getCell(r, 14)); outputCell(ws.getCell(r, 14));

  r += 2;
  sec(ws, r, 3); ws.getCell(r, 1).value = "CASH FLOW METRICS";
  r++;
  ws.getCell(r, 1).value = "Starting Cash"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = startingCash; ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));
  r++;
  ws.getCell(r, 1).value = "Ending Cash (Month 12)"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = Math.round(cumCashMonthly[11]); ws.getCell(r, 2).numFmt = CUR; bc(ws.getCell(r, 2)); outputCell(ws.getCell(r, 2));
  r++;
  ws.getCell(r, 1).value = "Minimum Cash Month"; dc(ws.getCell(r, 1));
  ws.getCell(r, 2).value = Math.round(Math.min(...cumCashMonthly)); ws.getCell(r, 2).numFmt = CUR; dc(ws.getCell(r, 2));

  return { endingCashY1: cumCashMonthly[11] };
}

function buildOperatingStatement(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], revByYear: number[], persByYear: number[], opexByYear: number[], cdByYear: number[], niByYear: number[]) {
  const ws = wb.addWorksheet("5-Year Operating Stmt");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const niLabel = netIncomeLabel(sp.entityType);
  ws.columns = [{ width: 36 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} — 5-Year Operating Statement`;
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  ws.getRow(r).values = ["", ...yLabels];
  hdr(ws, r, 6);

  const lines: [string, number[], "dc" | "bc" | "gc" | "sec"][] = [
    ["REVENUE", [], "sec"],
    ["Total Revenue", revByYear, "gc"],
    ["", [], "dc"],
    ["EXPENSES", [], "sec"],
    ["Personnel", persByYear, "bc"],
    ["Operating Expenses", opexByYear, "bc"],
    ["Capital & Debt Service", cdByYear, "bc"],
    ["Total Expenses", persByYear.map((p, y) => p + opexByYear[y] + cdByYear[y]), "gc"],
    ["", [], "dc"],
    ["BOTTOM LINE", [], "sec"],
    [niLabel, niByYear, "gc"],
  ];

  for (const [label, arr, style] of lines) {
    r++;
    if (style === "sec") { sec(ws, r, 6); ws.getCell(r, 1).value = label; continue; }
    ws.getCell(r, 1).value = label;
    const styleFn = style === "gc" ? gc : style === "bc" ? bc : dc;
    styleFn(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      if (arr.length > 0) {
        ws.getCell(r, y + 2).value = Math.round(arr[y]); ws.getCell(r, y + 2).numFmt = CUR;
      }
      styleFn(ws.getCell(r, y + 2));
      if (label === niLabel) outputCell(ws.getCell(r, y + 2));
    }
  }

  r++;
  ws.getCell(r, 1).value = "Net Margin %"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = revByYear[y] > 0 ? niByYear[y] / revByYear[y] : 0;
    ws.getCell(r, y + 2).numFmt = PCT; dc(ws.getCell(r, y + 2));
  }
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

  const debtByYear: number[] = [0, 0, 0, 0, 0];
  const interestByYear: number[] = [0, 0, 0, 0, 0];
  const principalByYear: number[] = [0, 0, 0, 0, 0];
  const balanceByYear: number[] = [0, 0, 0, 0, 0];

  for (const loan of loans) {
    const principal = loan.loanPrincipal || 0;
    const rate = (loan.loanRate || 0) / 100;
    const term = loan.loanTermYears || 0;

    r++;
    sec(ws, r, 6); ws.getCell(r, 1).value = loan.lineItem || "Loan";

    r++;
    ws.getCell(r, 1).value = "Beginning Balance"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const bal = y === 0 ? principal : computeRemainingBalance(principal, rate, term, y - 1);
      ws.getCell(r, y + 2).value = Math.round(bal); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }

    r++;
    ws.getCell(r, 1).value = "Interest"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const interest = computeInterestPortion(principal, rate, term, y);
      interestByYear[y] += interest;
      ws.getCell(r, y + 2).value = Math.round(interest); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }

    r++;
    ws.getCell(r, 1).value = "Principal Payment"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const prinPay = computePrincipalPortion(principal, rate, term, y);
      principalByYear[y] += prinPay;
      ws.getCell(r, y + 2).value = Math.round(prinPay); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
    }

    r++;
    ws.getCell(r, 1).value = "Total Payment"; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const total = computeAnnualDebtForYear(principal, rate, term, y);
      debtByYear[y] += total;
      ws.getCell(r, y + 2).value = Math.round(total); ws.getCell(r, y + 2).numFmt = CUR; bc(ws.getCell(r, y + 2));
    }

    r++;
    ws.getCell(r, 1).value = "Ending Balance"; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const bal = computeRemainingBalance(principal, rate, term, y);
      balanceByYear[y] += bal;
      ws.getCell(r, y + 2).value = Math.round(bal); ws.getCell(r, y + 2).numFmt = CUR; bc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2));
    }
  }

  if (loans.length > 1) {
    r += 2;
    sec(ws, r, 6); ws.getCell(r, 1).value = "TOTAL ALL LOANS";
    r++;
    ws.getCell(r, 1).value = "Total Debt Service"; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      ws.getCell(r, y + 2).value = Math.round(debtByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
    }
    r++;
    ws.getCell(r, 1).value = "Total Outstanding Debt"; bc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      ws.getCell(r, y + 2).value = Math.round(balanceByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2));
    }
  }

  return { debtByYear, interestByYear, principalByYear, balanceByYear };
}

function buildBalanceSheet(wb: ExcelJS.Workbook, data: ModelData, niByYear: number[], balanceByYear: number[], startingCash: number) {
  const ws = wb.addWorksheet("Balance Sheet");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const eqLabel = equityLabel(sp.entityType);
  const ob = data.openingBalances || {};
  ws.columns = [{ width: 36 }, ...Array(5).fill({ width: 16 })];
  printSetup(ws);

  let r = 1;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = `${sp.schoolName || "School"} — Balance Sheet`;
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
  let cumNI = 0;
  for (let y = 0; y < 5; y++) {
    cumNI += niByYear[y];
    cashByYear.push(openCash + cumNI);
  }

  r++;
  sec(ws, r, 6); ws.getCell(r, 1).value = "ASSETS";
  r++;
  ws.getCell(r, 1).value = "Cash & Equivalents"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(cashByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Accounts Receivable"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(openAR); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Fixed Assets"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(openFA); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Other Assets"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(openOA); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Total Assets"; bc(ws.getCell(r, 1));
  const totalAssets: number[] = [];
  for (let y = 0; y < 5; y++) {
    const ta = cashByYear[y] + openAR + openFA + openOA;
    totalAssets.push(ta);
    ws.getCell(r, y + 2).value = Math.round(ta); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "LIABILITIES";
  r++;
  ws.getCell(r, 1).value = "Accounts Payable"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(openAP); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Long-Term Debt"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(balanceByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }
  r++;
  ws.getCell(r, 1).value = "Total Liabilities"; bc(ws.getCell(r, 1));
  const totalLiabilities: number[] = [];
  for (let y = 0; y < 5; y++) {
    const tl = openAP + balanceByYear[y];
    totalLiabilities.push(tl);
    ws.getCell(r, y + 2).value = Math.round(tl); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = eqLabel.toUpperCase();
  r++;
  const openEquity = (openCash + openAR + openFA + openOA) - (openAP + (ob.longTermDebt ?? 0));
  ws.getCell(r, 1).value = eqLabel; bc(ws.getCell(r, 1));
  const equityByYear: number[] = [];
  for (let y = 0; y < 5; y++) {
    const eq = totalAssets[y] - totalLiabilities[y];
    equityByYear.push(eq);
    ws.getCell(r, y + 2).value = Math.round(eq); ws.getCell(r, y + 2).numFmt = CUR; gc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2));
  }

  r += 2;
  ws.getCell(r, 1).value = "Balance Check (should = 0)"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const check = Math.round(totalAssets[y]) - Math.round(totalLiabilities[y]) - Math.round(equityByYear[y]);
    ws.getCell(r, y + 2).value = check; ws.getCell(r, y + 2).numFmt = CUR;
    ws.getCell(r, y + 2).font = { ...BF, color: { argb: check === 0 ? EVERGREEN : "FFFF0000" } };
    ws.getCell(r, y + 2).border = BORDER;
  }

  return { cashByYear, totalAssets, totalLiabilities, equityByYear };
}

function buildDSCRCovenants(wb: ExcelJS.Workbook, data: ModelData, enrollment: number[], revByYear: number[], persByYear: number[], opexByYear: number[], cdByYear: number[], niByYear: number[], cashByYear: number[]) {
  const ws = wb.addWorksheet("DSCR & Covenants");
  const sp = data.schoolProfile || {};
  const yLabels = yearLabels(sp.openingYear);
  const ct = data.covenantThresholds || {};
  const minDSCR = ct.minDSCR ?? 1.25;
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
  ws.getCell(r, 1).value = "CFADS (Rev - Pers - OpEx)"; dc(ws.getCell(r, 1));
  const cfads: number[] = [];
  for (let y = 0; y < 5; y++) {
    const v = revByYear[y] - persByYear[y] - opexByYear[y];
    cfads.push(v);
    ws.getCell(r, y + 2).value = Math.round(v); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }

  r++;
  ws.getCell(r, 1).value = "Debt Service"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(cdByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }

  r++;
  ws.getCell(r, 1).value = "DSCR"; bc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const dscr = cdByYear[y] > 0 ? cfads[y] / cdByYear[y] : 0;
    ws.getCell(r, y + 2).value = cdByYear[y] > 0 ? Math.round(dscr * 100) / 100 : "N/A";
    ws.getCell(r, y + 2).numFmt = "0.00x"; bc(ws.getCell(r, y + 2)); outputCell(ws.getCell(r, y + 2));
  }

  r += 2;
  sec(ws, r, 6); ws.getCell(r, 1).value = "LIQUIDITY METRICS";
  const totalExp = persByYear.map((p, y) => p + opexByYear[y] + cdByYear[y]);

  r++;
  ws.getCell(r, 1).value = "Ending Cash"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    ws.getCell(r, y + 2).value = Math.round(cashByYear[y]); ws.getCell(r, y + 2).numFmt = CUR; dc(ws.getCell(r, y + 2));
  }

  r++;
  ws.getCell(r, 1).value = "Days Cash on Hand"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const days = totalExp[y] > 0 ? (cashByYear[y] / totalExp[y]) * 365 : 0;
    ws.getCell(r, y + 2).value = Math.round(days); ws.getCell(r, y + 2).numFmt = NUM; dc(ws.getCell(r, y + 2));
  }

  r++;
  ws.getCell(r, 1).value = "Months of Runway"; dc(ws.getCell(r, 1));
  for (let y = 0; y < 5; y++) {
    const months = totalExp[y] > 0 ? cashByYear[y] / (totalExp[y] / 12) : 0;
    ws.getCell(r, y + 2).value = Math.round(months * 10) / 10; ws.getCell(r, y + 2).numFmt = "0.0"; dc(ws.getCell(r, y + 2));
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

  const checks: [string, (y: number) => string][] = [
    [`DSCR ≥ ${minDSCR}x`, (y) => cdByYear[y] <= 0 ? "N/A" : (cfads[y] / cdByYear[y] >= minDSCR ? "PASS" : "FAIL")],
    ["Positive Net Income", (y) => niByYear[y] > 0 ? "PASS" : "FAIL"],
    [`Capacity ≥ ${(minCapUtil * 100).toFixed(0)}%`, (y) => cap <= 0 ? "N/A" : (enrollment[y] / cap >= minCapUtil ? "PASS" : "FAIL")],
    [`Cash Reserve ≥ ${minMonths} months`, (y) => {
      const te = totalExp[y];
      if (te <= 0) return "N/A";
      return cashByYear[y] / (te / 12) >= minMonths ? "PASS" : "FAIL";
    }],
    [`Days Cash ≥ ${minDaysCash}`, (y) => {
      const te = totalExp[y];
      if (te <= 0) return "N/A";
      return (cashByYear[y] / te) * 365 >= minDaysCash ? "PASS" : "FAIL";
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
    ws.getCell(r, 1).value = `Enrollment: ${scenario.enrollmentAdjustment >= 0 ? "+" : ""}${scenario.enrollmentAdjustment}%  |  Revenue: ${scenario.tuitionAdjustment >= 0 ? "+" : ""}${scenario.tuitionAdjustment}%  |  Expenses: ${scenario.expenseAdjustment >= 0 ? "+" : ""}${scenario.expenseAdjustment}%`;
    ws.getCell(r, 1).font = { ...NF, italic: true, color: { argb: "FF666666" } };

    r++;
    ws.getRow(r).values = ["", ...yLabels];
    hdr(ws, r, 6);

    const adjEnroll = enrollment.map(e => Math.round(e * (1 + scenario.enrollmentAdjustment / 100)));
    const adjRev = revByYear.map(v => v * (1 + scenario.tuitionAdjustment / 100));
    const adjOpex = opexByYear.map(v => v * (1 + scenario.expenseAdjustment / 100));
    const adjTotalExp = persByYear.map((p, y) => p + adjOpex[y] + cdByYear[y]);
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
      const cfads = adjRev[y] - persByYear[y] - adjOpex[y];
      ws.getCell(r, y + 2).value = cdByYear[y] > 0 ? Math.round(cfads / cdByYear[y] * 100) / 100 : "N/A";
      ws.getCell(r, y + 2).numFmt = "0.00x"; dc(ws.getCell(r, y + 2));
    }

    r++;
    ws.getCell(r, 1).value = "Break-Even Enrollment"; dc(ws.getCell(r, 1));
    for (let y = 0; y < 5; y++) {
      const rps = adjEnroll[y] > 0 ? adjRev[y] / adjEnroll[y] : 0;
      const vcps = adjEnroll[y] > 0 ? adjOpex[y] / adjEnroll[y] : 0;
      const cm = rps - vcps;
      const fc = persByYear[y] + cdByYear[y];
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
  ws.getCell(r, 1).value = "Underwriting Snapshot — Loan Committee Summary";
  ws.getCell(r, 1).font = { bold: true, size: 14, name: "Calibri", color: { argb: NAVY } };

  r += 2;
  sec(ws, r, 2); ws.getCell(r, 1).value = "SCHOOL PROFILE";
  const profileInfo: [string, string][] = [
    ["School Name", sp.schoolName || "—"],
    ["Type", schoolTypeLabel(sp.schoolType, sp.schoolTypeOther)],
    ["Entity", entityLabel(sp.entityType)],
    ["Stage", stageLabel(sp.schoolStage)],
    ["State", sp.state || "—"],
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
    const cfads = revByYear[y] - persByYear[y] - opexByYear[y];
    ws.getCell(r, y + 4).value = cdByYear[y] > 0 ? Math.round(cfads / cdByYear[y] * 100) / 100 : "N/A";
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
  ws.getCell(r, 1).value = "Prepared by SchoolStack Budget — budget.schoolstack.ai";
  ws.getCell(r, 1).font = { size: 9, name: "Calibri", italic: true, color: { argb: "FF999999" } };
  ws.getCell(r, 1).alignment = { horizontal: "center" };
}

export async function generateUnderwritingWorkbook(data: Record<string, unknown>): Promise<ExcelJS.Workbook> {
  return generateWorkbook(data as ModelData);
}

async function generateWorkbook(data: ModelData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();

  const sp = data.schoolProfile || {};
  const enrollment = getEnrollmentArray(data.enrollment);
  const salaryEsc = (data.tuitionEscalation?.rate ?? 3) / 100;
  const costInflation = (data.tuitionEscalation?.rate ?? 3) / 100;
  const costInflPct = data.tuitionEscalation?.rate ?? 3;
  const prorationFactor = getProrationFactor(sp);
  const startingCash = data.priorYearSnapshot?.endingCash ?? data.currentYearProjection?.currentCash ?? 0;

  buildCover(wb, data);
  buildInstructions(wb);
  buildAssumptions(wb, data, enrollment, salaryEsc, costInflation, prorationFactor, startingCash);
  buildProgramProfile(wb, data);
  buildEnrollmentDrivers(wb, data, enrollment);
  buildTuitionFunding(wb, data, enrollment);
  buildStaffingDrivers(wb, data, enrollment, salaryEsc, prorationFactor);
  buildOpExDrivers(wb, data, enrollment);
  buildCapitalStack(wb, data);
  buildEnrollmentTuitionForecast(wb, data, enrollment);
  buildStaffingCostsForecast(wb, data, enrollment, salaryEsc, prorationFactor);

  const { revByYear, persByYear, opexByYear, cdByYear } = buildBudgetDetail(wb, data, enrollment, salaryEsc, costInflPct, prorationFactor);
  const { niByYear } = buildBudgetSummary(wb, data, enrollment, revByYear, persByYear, opexByYear, cdByYear);

  buildMonthlyCashFlowY1(wb, data, enrollment, salaryEsc, costInflPct, prorationFactor, startingCash);
  buildOperatingStatement(wb, data, enrollment, revByYear, persByYear, opexByYear, cdByYear, niByYear);

  const { debtByYear: debtServiceByYear, balanceByYear } = buildDebtSchedule(wb, data);
  const { cashByYear } = buildBalanceSheet(wb, data, niByYear, balanceByYear, startingCash);

  buildDSCRCovenants(wb, data, enrollment, revByYear, persByYear, opexByYear, debtServiceByYear, niByYear, cashByYear);
  buildSourcesAndUses(wb, data, startingCash);
  buildScenarios(wb, data, enrollment, revByYear, persByYear, opexByYear, debtServiceByYear);
  buildUnderwritingSnapshot(wb, data, enrollment, revByYear, persByYear, opexByYear, debtServiceByYear, niByYear, cashByYear, balanceByYear);

  return wb;
}
