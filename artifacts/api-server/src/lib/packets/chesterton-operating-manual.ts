// Chesterton Schools Network (CSN) Operating Manual export.
// Tabs mirror `3_Operating_Manual_2026_FV.xlsx`. Cross-sheet formulas use
// named ranges defined on GETTING STARTED so editing inputs cascades.
//
// Task #485 audit: this generator only consumes `data.chesterton.*`, which
// carries its own `year0..year5` schema (see ChestertonGradeRow below). It
// does NOT branch on `schoolProfile.modelDuration`, so a Chesterton founder
// in single-year mode still gets the full 5-year CSN template — unfilled
// future-year cells stay blank, matching the unmodified upstream workbook.
// Lender Packet PDF + Board Summary PDF were the deliverables that needed
// gating; this one is safe to export from single-year mode and the
// ExportStep card reflects that (no `isSingleYear` overlay).

import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import {
  hdr,
  sec,
  inputCell,
  setFormula,
  cn as cellName,
  CUR,
  PCT,
  NUM,
  NAVY,
  WHITE,
  CREAM,
  EVERGREEN,
  GREEN_BG,
  RED_BG,
} from "../workbook-helpers.js";

const TAB_GETTING_STARTED = "GETTING STARTED";
const TAB_PROJECTIONS = "1 - 5 YR FINANCIAL PROJECTIONS";
const TAB_SALARY = "2 - SALARY SCHEDULE";
const TAB_ASSUMPTIONS = "3 - KEY ASSUMPTIONS";
const TAB_FUNDRAISING = "4 - FUNDRAISING GOALS";
const TAB_GIFT_CHART = "5 - GIFT CHART";
const TAB_GIFT_CHART_AUTO = "5 - GIFT CHART AUTOMATIC";
const TAB_RECRUITING = "7 - RECRUITING PIPELINE";
const TAB_CADENCE = "Cadence";
const TAB_TRAINING = "CSN Training Schedule";
const TAB_PARENT_HANDOUT = "Parent Handout";

export const CHESTERTON_TAB_NAMES = [
  TAB_GETTING_STARTED,
  TAB_PROJECTIONS,
  TAB_SALARY,
  TAB_ASSUMPTIONS,
  TAB_FUNDRAISING,
  TAB_GIFT_CHART,
  TAB_GIFT_CHART_AUTO,
  TAB_RECRUITING,
  TAB_CADENCE,
  TAB_TRAINING,
  TAB_PARENT_HANDOUT,
] as const;

interface ChestertonGradeRow {
  grade: string;
  year0?: number;
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
}

interface ChestertonSubjectRow {
  id?: string;
  subject: string;
  periodsPerSection?: number;
  notes?: string;
}

interface ChestertonFundraisingRow {
  id?: string;
  category: string;
  goalAmount?: number;
  numberOfGifts?: number;
  averageGift?: number;
  notes?: string;
}

interface ChestertonGiftRow {
  id?: string;
  giftAmount?: number;
  numberOfGifts?: number;
  numberOfProspects?: number;
}

interface ChestertonRecruitingRow {
  id?: string;
  source: string;
  prospectiveStudents?: number;
  notes?: string;
}

export interface ChestertonModelInput {
  schoolName?: string;
  chesterton?: {
    planningYear?: number;
    startingTuition?: number;
    tuitionGrowthRate?: number;
    bookSupplyFee?: number;
    financialAidPct?: number;
    startingTeacherSalary?: number;
    benefitsFirstYearAmount?: number;
    attritionRate?: number;
    totalFundraisingGoal?: number;
    phaseEnrollment?: ChestertonGradeRow[];
    salarySchedule?: ChestertonSubjectRow[];
    fundraisingGoals?: ChestertonFundraisingRow[];
    giftChart?: ChestertonGiftRow[];
    recruitingPipeline?: ChestertonRecruitingRow[];
    prospectiveFacilities?: Array<{ id?: string; name: string; capacity?: number; location?: string }>;
    priestlyOutreach?: Array<{ id?: string; name: string; affiliation?: string; teamMember?: string }>;
    keyInfluencers?: Array<{ id?: string; name: string; affiliation?: string; teamMember?: string }>;
  };
}

const GRADE_LABELS: Record<string, string> = {
  freshman: "Freshman (9th)",
  sophomore: "Sophomore (10th)",
  junior: "Junior (11th)",
  senior: "Senior (12th)",
};

const PHASES = ["Discovery", "Preparation", "Activation", "Launch"] as const;

// Read a cell's cached numeric value. setFormula() coerces zero to the
// string "0" via safeFormulaValue so downstream subtotals can still
// roll up clean numbers; treat that case as numeric 0.
function readCachedNumber(ws: ExcelJS.Worksheet, r: number, c: number): number {
  const v = ws.getCell(r, c).value;
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const obj = v as { result?: unknown };
    if (typeof obj.result === "number") return obj.result;
    if (obj.result === "0" || obj.result === 0) return 0;
  }
  return 0;
}

function applyTitleStyle(cell: ExcelJS.Cell) {
  cell.font = { name: "Calibri", size: 16, bold: true, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
}

function applySubtitleStyle(cell: ExcelJS.Cell) {
  cell.font = { name: "Calibri", size: 11, italic: true, color: { argb: NAVY } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
  cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
}

function buildGettingStarted(
  wb: ExcelJS.Workbook,
  data: ChestertonModelInput,
  fundraisingRowCount: number,
): {
  schoolNameAddress: string;
  planYearAddress: string;
  avgSalaryAddress: string;
  tfgAddress: string;
} {
  const ws = wb.addWorksheet(TAB_GETTING_STARTED, {
    properties: { tabColor: { argb: EVERGREEN } },
    views: [{ showGridLines: false }],
  });

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 4;
  ws.getColumn(5).width = 60;

  ws.mergeCells("B2:E2");
  applyTitleStyle(ws.getCell("B2"));
  ws.getCell("B2").value = "CHESTERTON SCHOOLS NETWORK · OPERATING MANUAL";
  ws.getRow(2).height = 32;

  ws.mergeCells("B3:E3");
  applySubtitleStyle(ws.getCell("B3"));
  ws.getCell("B3").value = "Control panel — edit the blue cells below; every other tab updates automatically.";
  ws.getRow(3).height = 22;

  // ── School identity ──
  ws.getCell("B5").value = "School Name";
  ws.getCell("B5").font = { bold: true };
  const schoolNameCell = ws.getCell("C5");
  schoolNameCell.value = data.schoolName || "Your Chesterton Academy";
  inputCell(schoolNameCell);
  const schoolNameAddress = `'${TAB_GETTING_STARTED}'!$C$5`;
  wb.definedNames.add(schoolNameAddress, "School_Name");

  ws.getCell("B6").value = "Planning Year (school year start)";
  ws.getCell("B6").font = { bold: true };
  const planYearCell = ws.getCell("C6");
  planYearCell.value = data.chesterton?.planningYear || new Date().getFullYear() + 1;
  planYearCell.numFmt = NUM;
  inputCell(planYearCell);
  const planYearAddress = `'${TAB_GETTING_STARTED}'!$C$6`;
  wb.definedNames.add(planYearAddress, "Plan_Year");

  // ── Tuition controls ──
  ws.getCell("B8").value = "Tuition & Fees";
  ws.getCell("B8").font = { bold: true, size: 12, color: { argb: NAVY } };
  ws.mergeCells("B8:E8");

  // Each input gets a named range so PROJECTIONS formulas can reference
  // it by name and survive row-layout changes.
  const tuitionRows: Array<[string, unknown, string, string]> = [
    ["Starting Tuition (Year 1)", data.chesterton?.startingTuition ?? 8500, CUR, "Starting_Tuition"],
    ["Annual Tuition Growth Rate", data.chesterton?.tuitionGrowthRate ?? 0.04, PCT, "Tuition_Growth_Rate"],
    ["Book / Supply Fee", data.chesterton?.bookSupplyFee ?? 600, CUR, "Book_Supply_Fee"],
    ["Financial Aid (% of Gross Tuition)", data.chesterton?.financialAidPct ?? 0.10, PCT, "Financial_Aid_Pct"],
    ["Year-over-Year Attrition", data.chesterton?.attritionRate ?? 0.10, PCT, "Attrition_Rate"],
  ];
  let r = 9;
  for (const [label, value, fmt, name] of tuitionRows) {
    ws.getCell(`B${r}`).value = label;
    const c = ws.getCell(`C${r}`);
    c.value = value as number;
    c.numFmt = fmt;
    inputCell(c);
    wb.definedNames.add(`'${TAB_GETTING_STARTED}'!$C$${r}`, name);
    r += 1;
  }

  // ── Faculty controls ──
  r += 1;
  ws.getCell(`B${r}`).value = "Faculty Salary";
  ws.getCell(`B${r}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  ws.mergeCells(`B${r}:E${r}`);
  r += 1;

  const startingSalaryRow = r;
  ws.getCell(`B${r}`).value = "Starting Teacher Salary (Bachelors, FT, Yr 1)";
  ws.getCell(`B${r}`).font = { bold: true };
  const startSalaryCell = ws.getCell(`C${r}`);
  startSalaryCell.value = data.chesterton?.startingTeacherSalary ?? 44000;
  startSalaryCell.numFmt = CUR;
  inputCell(startSalaryCell);
  wb.definedNames.add(`'${TAB_GETTING_STARTED}'!$C$${r}`, "Starting_Teacher_Salary");
  r += 1;

  ws.getCell(`B${r}`).value = "Avg Salary per Period (5 periods = 1 FTE)";
  const avgSalaryCell = ws.getCell(`C${r}`);
  setFormula(avgSalaryCell, `=Starting_Teacher_Salary/5`, (data.chesterton?.startingTeacherSalary ?? 44000) / 5);
  avgSalaryCell.numFmt = CUR;
  avgSalaryCell.font = { italic: true };
  const avgSalaryAddress = `'${TAB_GETTING_STARTED}'!$C$${r}`;
  wb.definedNames.add(avgSalaryAddress, "AvgSalaryperPeriod");
  r += 1;

  ws.getCell(`B${r}`).value = "Benefits Stipend per FTE (Yr 1)";
  const benCell = ws.getCell(`C${r}`);
  benCell.value = data.chesterton?.benefitsFirstYearAmount ?? 0;
  benCell.numFmt = CUR;
  inputCell(benCell);
  wb.definedNames.add(`'${TAB_GETTING_STARTED}'!$C$${r}`, "Benefits_Stipend");
  r += 2;

  // ── Total Fundraising Goal ──
  ws.getCell(`B${r}`).value = "Total Fundraising Goal (TFG)";
  ws.getCell(`B${r}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  ws.mergeCells(`B${r}:E${r}`);
  r += 1;
  ws.getCell(`B${r}`).value = "Target raise for first freshman class";
  const tfgCell = ws.getCell(`C${r}`);
  // TFG = SUM of fundraising components, falling back to the static
  // input when the founder has no fundraising rows yet.
  if (fundraisingRowCount > 0) {
    const lastFundRow = 5 + fundraisingRowCount;
    // Cached result must match the SUM (not the input override) so it
    // stays in sync with the formula on first recalc.
    const componentSum = (data.chesterton?.fundraisingGoals ?? []).reduce((s, x) => s + (x.goalAmount ?? 0), 0);
    setFormula(
      tfgCell,
      `=SUM('${TAB_FUNDRAISING}'!$C$6:$C$${lastFundRow})`,
      componentSum,
    );
    tfgCell.font = { italic: true };
  } else {
    tfgCell.value = data.chesterton?.totalFundraisingGoal ?? 0;
    inputCell(tfgCell);
  }
  tfgCell.numFmt = CUR;
  const tfgAddress = `'${TAB_GETTING_STARTED}'!$C$${r}`;
  wb.definedNames.add(tfgAddress, "TFG");

  ws.getCell("E5").value = "Tip: every cell on a numbered tab pulls from the values you enter here. Update once and the whole workbook re-calculates.";
  ws.getCell("E5").alignment = { wrapText: true, vertical: "top" };

  // ── Verbatim content from the source workbook's GETTING STARTED tab. ──
  // We append BELOW the active inputs so the named-range positions used
  // by other tabs (and asserted by the test suite) stay fixed.
  let v = r + 2;

  // "About this workbook" intro and tutorial pointer.
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "About this workbook";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  for (const line of [
    "Successful Chesterton Academy member schools operate against a carefully-planned set of annual objectives and milestones.",
    "The CSN Operating Manual will help your team plan your year, set clear objectives, and track progress.",
    "This collaborative process of planning and shared accountability is designed to help your team meet CSN standards of excellence.",
  ]) {
    ws.mergeCells(`B${v}:E${v}`);
    ws.getCell(`B${v}`).value = line;
    ws.getCell(`B${v}`).alignment = { wrapText: true, vertical: "top" };
    v += 1;
  }
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "BEFORE YOU BEGIN: VIEW THE OPERATING MANUAL TUTORIAL PLAYLIST (SHORT VIDEOS)";
  ws.getCell(`B${v}`).font = { italic: true, color: { argb: NAVY } };
  v += 2;

  // Section I — Establish Objectives and Create Annual Plan.
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "I. ESTABLISH OBJECTIVES AND CREATE ANNUAL PLAN";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  const planSteps: Array<[string, string, string]> = [
    [
      "STEP I - ESTABLISH YOUR ANNUAL OBJECTIVES AND PRIORITIES [BOARD AND LEADERSHIP]",
      "Objective: Calculate fundraising goals based on projected tuition revenue, operating expenses, and other assumptions",
      "See Worksheets: 1 - Financial Projections Template; 2 - Salary Schedule; 3 - Key Assumptions",
    ],
    [
      "STEP II - ESTABLISH FUNDRAISING GOALS BY CAMPAIGN COMPONENT [LEADERSHIP, FUNDRAISING TEAM]",
      "Objective: Map out fundraising results required to meet goal by June 30; establish parent  participation in fundraising",
      "See Worksheets: 4 - Fundraising Goals, 5 - Gift Chart, 6 - Parent Handout",
    ],
    [
      "STEP III - ESTABLISH RECRUITING GOALS TO MEET ENROLLMENT TARGETS [LEADERSHIP, RECRUITING TEAM]",
      "Objective: Map out prospects and process required to meet enrollment goals.",
      "See Worksheet: 7 - Recruiting Pipeline",
    ],
    [
      "STEP IV - CREATE YOUR ANNUAL PLAN [ALL TEAMS]",
      "Objective: Map out annual plan to meet your objectives; review CSN training and resources for further support",
      "See Worksheet: 8 - Chesterton Cadence; 9 - CSN Seminars",
    ],
  ];
  for (const [step, objective, refs] of planSteps) {
    ws.mergeCells(`B${v}:E${v}`);
    ws.getCell(`B${v}`).value = step;
    ws.getCell(`B${v}`).font = { bold: true };
    ws.getCell(`B${v}`).alignment = { wrapText: true, vertical: "top" };
    v += 1;
    ws.mergeCells(`B${v}:E${v}`);
    ws.getCell(`B${v}`).value = objective;
    ws.getCell(`B${v}`).alignment = { wrapText: true, vertical: "top" };
    v += 1;
    ws.mergeCells(`B${v}:E${v}`);
    ws.getCell(`B${v}`).value = refs;
    ws.getCell(`B${v}`).font = { italic: true };
    ws.getCell(`B${v}`).alignment = { wrapText: true, vertical: "top" };
    v += 2;
  }

  // Section II — Customize This Template (verbatim labels from source rows
  // 30-36 of "GETTING STARTED"). The actual editable inputs live at the
  // top of this tab; we echo the source labels here for completeness.
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "II. CUSTOMIZE THIS TEMPLATE";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  for (const label of [
    "Enter school name >>",
    "Enter planning year >>",
    "Enter Starting Tuition>>",
    "Enter % Increase tuition Yr over Yr.>>",
    "Enter Starting Salary for Teacher>>",
    "Enter Student Fee (Book)>>",
    "Benefits first Year whole dollar",
    "Enter expected student enrollment>>",
  ]) {
    ws.mergeCells(`B${v}:E${v}`);
    ws.getCell(`B${v}`).value = label;
    ws.getCell(`B${v}`).alignment = { wrapText: true, vertical: "top" };
    v += 1;
  }
  v += 1;

  // Section III — Sustainability Drivers and Owners (table mirrors source).
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "III. SUSTAINABILITY DRIVERS AND OWNERS";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 2;
  ws.getCell(`B${v}`).value = "Drivers";
  ws.getCell(`C${v}`).value = "Primary Owner";
  ws.getCell(`D${v}`).value = "Secondary Owners";
  hdr(ws, v, 4);
  v += 1;
  const sustainability: Array<[string, string, string]> = [
    ["GOVERNANCE", "Board Chair", "Board/Committees"],
    ["TUITION REVENUE", "Executive Director", "Headmaster"],
    ["FUNDRAISING", "Executive Director", "Board"],
    ["SCHOOL OPERATIONS", "Executive Director", "Board"],
  ];
  for (const [driver, primary, secondary] of sustainability) {
    ws.getCell(`B${v}`).value = driver;
    ws.getCell(`B${v}`).font = { bold: true };
    ws.getCell(`C${v}`).value = primary;
    ws.getCell(`D${v}`).value = secondary;
    v += 1;
  }
  v += 1;

  // Section IV — Document Formatting (fonts + brand colors verbatim).
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "IV. DOCUMENT FORMATTING – FONTS AND COLORS";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 2;
  ws.getCell(`B${v}`).value = "Playfair Display";
  ws.getCell(`C${v}`).value = "Download font";
  ws.getCell(`C${v}`).font = { italic: true };
  v += 1;
  ws.getCell(`B${v}`).value = "Montserrat";
  ws.getCell(`C${v}`).value = "Download font";
  ws.getCell(`C${v}`).font = { italic: true };
  v += 2;
  const palette: Array<[string, string]> = [
    ["Spirit Blue", "#19435D"],
    ["Character Gold", "#A29061"],
    ["Intellect Blue", "#071F30"],
    ["Truth Red", "#933030"],
    ["Faith Ivory", "#EBE5D8"],
  ];
  for (const [name, hex] of palette) {
    ws.getCell(`B${v}`).value = name;
    ws.getCell(`C${v}`).value = hex;
    ws.getCell(`C${v}`).font = { name: "Consolas" };
    // Apply the brand color as a small swatch to the right of the hex.
    const swatch = ws.getCell(`D${v}`);
    swatch.value = "";
    const argb = `FF${hex.replace("#", "").toUpperCase()}`;
    swatch.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    v += 1;
  }
  v += 1;

  // Section V — Yearly Assumed Costs (freshman through senior).
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "V. Yearly Assumed Costs";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  const yearlyCosts: Array<[string, number]> = [
    ["Freshman", 937],
    ["Sophomore", 836.5],
    ["Junior", 530.95],
    ["Senior", 392],
  ];
  for (const [grade, cost] of yearlyCosts) {
    ws.getCell(`B${v}`).value = grade;
    ws.getCell(`C${v}`).value = cost;
    ws.getCell(`C${v}`).numFmt = CUR;
    v += 1;
  }
  v += 1;

  // Section VI — Admission Pipeline Conversion Percentages
  // (SHADOW / APPLY / ENROLL — matches the rates the Recruiting tab pulls in).
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "VI. Admission Pipeline Conversion Percentages";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 2;
  ws.getCell(`C${v}`).value = "Conversion %";
  ws.getCell(`C${v}`).font = { bold: true };
  v += 1;
  const conversionRates: Array<[string, number]> = [
    ["SHADOW CONVERSION RATE", 0.40],
    ["APPLY CONVERSION RATE", 0.80],
    ["ENROLL CONVERSION RATE", 0.90],
  ];
  for (const [label, rate] of conversionRates) {
    ws.getCell(`B${v}`).value = label;
    ws.getCell(`C${v}`).value = rate;
    ws.getCell(`C${v}`).numFmt = PCT;
    v += 1;
  }
  v += 1;

  // CSN copyright (verbatim).
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network, 2008-2026. All rights reserved.";
  ws.getCell(`B${v}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`B${v}`).alignment = { horizontal: "center" };

  return { schoolNameAddress, planYearAddress, avgSalaryAddress, tfgAddress };
}

function buildProjections(
  wb: ExcelJS.Workbook,
  data: ChestertonModelInput,
  refs: { planYearAddress: string; schoolNameAddress: string; avgSalaryAddress: string },
) {
  const ws = wb.addWorksheet(TAB_PROJECTIONS, {
    properties: { tabColor: { argb: NAVY } },
    views: [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 7 }],
  });

  ws.getColumn(1).width = 38;
  for (let c = 2; c <= 8; c++) ws.getColumn(c).width = 14;
  // Col I holds the per-subject Periods/Section input on FACULTY.
  ws.getColumn(9).width = 14;

  ws.mergeCells("A1:H1");
  applyTitleStyle(ws.getCell("A1"));
  ws.getCell("A1").value = { formula: `=School_Name & " — 5-Year Financial Projection"`, result: `${data.schoolName || "School"} — 5-Year Financial Projection` };
  ws.getRow(1).height = 30;

  ws.mergeCells("A2:H2");
  applySubtitleStyle(ws.getCell("A2"));
  ws.getCell("A2").value = "Phase I: Discovery (Year 0)  ·  Phase II: Preparation (Yr 1)  ·  Phase III: Activation (Yr 2)  ·  Phase IV: Launch (Yr 3+)";

  // Phase header row (row 4)
  hdr(ws, 4, 8);
  ws.getCell("A4").value = "PHASE";
  for (let i = 0; i < 4; i++) {
    const startCol = 2 + i * 2;
    if (i === 3) {
      ws.mergeCells(4, startCol, 4, 8);
    } else {
      ws.getCell(4, startCol).value = PHASES[i];
    }
  }
  ws.getCell(4, 2).value = PHASES[0];
  ws.getCell(4, 3).value = PHASES[1];
  ws.getCell(4, 4).value = PHASES[2];
  ws.getCell(4, 5).value = PHASES[3];
  ws.getCell(4, 6).value = PHASES[3];
  ws.getCell(4, 7).value = PHASES[3];
  ws.getCell(4, 8).value = PHASES[3];

  // Year header row (row 5)
  hdr(ws, 5, 8);
  ws.getCell("A5").value = "YEAR";
  for (let i = 0; i < 7; i++) {
    const cell = ws.getCell(5, 2 + i);
    if (i === 0) {
      cell.value = "Year 0";
    } else {
      cell.value = `Year ${i}`;
    }
  }

  // School-year label row pulls from Plan_Year (row 6)
  ws.getCell("A6").value = "School Year";
  ws.getCell("A6").font = { italic: true };
  for (let i = 0; i < 7; i++) {
    const c = ws.getCell(6, 2 + i);
    setFormula(
      c,
      `=Plan_Year+${i - 1} & "-" & RIGHT(Plan_Year+${i}, 2)`,
      `${(data.chesterton?.planningYear ?? new Date().getFullYear() + 1) + i - 1}-${String(((data.chesterton?.planningYear ?? new Date().getFullYear() + 1) + i) % 100).padStart(2, "0")}`,
    );
    c.alignment = { horizontal: "center" };
  }

  // ── ENROLLMENT BLOCK ──
  let row = 8;
  sec(ws, row, 8);
  ws.getCell(`A${row}`).value = "I. ENROLLMENT";
  row += 1;

  const enrollment = data.chesterton?.phaseEnrollment ?? [];
  const gradeKeys = ["freshman", "sophomore", "junior", "senior"];
  const enrollmentStart = row;
  for (const gradeKey of gradeKeys) {
    const found = enrollment.find(e => e.grade === gradeKey);
    ws.getCell(`A${row}`).value = GRADE_LABELS[gradeKey] || gradeKey;
    const yearKeys: Array<keyof ChestertonGradeRow> = ["year0", "year1", "year2", "year3", "year4", "year5"];
    yearKeys.forEach((yk, i) => {
      const c = ws.getCell(row, 2 + i);
      const v = (found?.[yk] as number) ?? 0;
      c.value = v;
      c.numFmt = NUM;
      inputCell(c);
    });
    // Year 6 mirrors Year 5 (+ small attrition assumption — keep simple as
    // a flat formula for now; the founder can edit).
    const c = ws.getCell(row, 8);
    setFormula(c, `=${cellName(row, 7)}`, (found?.year5 as number) ?? 0);
    c.numFmt = NUM;
    row += 1;
  }
  const enrollmentEnd = row - 1;

  // Total enrollment row
  ws.getCell(`A${row}`).value = "Total Enrollment";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let col = 2; col <= 8; col++) {
    const formula = `=SUM(${cellName(enrollmentStart, col)}:${cellName(enrollmentEnd, col)})`;
    let fallback = 0;
    for (let r = enrollmentStart; r <= enrollmentEnd; r++) {
      const cellVal = ws.getCell(r, col).value;
      if (typeof cellVal === "number") fallback += cellVal;
      else if (cellVal && typeof cellVal === "object" && "result" in cellVal && typeof cellVal.result === "number") fallback += cellVal.result;
    }
    setFormula(ws.getCell(row, col), formula, fallback);
    ws.getCell(row, col).numFmt = NUM;
    ws.getCell(row, col).font = { bold: true };
  }
  const totalEnrollmentRow = row;
  row += 2;

  // ── REVENUE BLOCK ──
  sec(ws, row, 8);
  ws.getCell(`A${row}`).value = "II. REVENUE";
  row += 1;

  // Tuition per student row uses Plan_Year baseline & growth rate from
  // GETTING STARTED. The CSN manual escalates tuition with CEILING(.,50).
  ws.getCell(`A${row}`).value = "Tuition per Student";
  const startingTuition = data.chesterton?.startingTuition ?? 8500;
  const growth = data.chesterton?.tuitionGrowthRate ?? 0.04;
  const tuitionRow = row;
  for (let i = 0; i < 7; i++) {
    const offset = i - 1; // year 0 is one year BEFORE planning year (open year)
    const c = ws.getCell(row, 2 + i);
    if (offset <= 0) {
      const v = startingTuition;
      setFormula(c, `=Starting_Tuition`, v);
    } else {
      const v = Math.ceil((startingTuition * Math.pow(1 + growth, offset)) / 50) * 50;
      setFormula(
        c,
        `=CEILING(Starting_Tuition*(1+Tuition_Growth_Rate)^${offset},50)`,
        v,
      );
    }
    c.numFmt = CUR;
  }
  row += 1;

  // Gross tuition revenue
  ws.getCell(`A${row}`).value = "Gross Tuition Revenue";
  for (let i = 0; i < 7; i++) {
    const col = 2 + i;
    const c = ws.getCell(row, col);
    const tuitionVal = ws.getCell(tuitionRow, col).value;
    const enrollVal = ws.getCell(totalEnrollmentRow, col).value;
    const tuitionNum = typeof tuitionVal === "object" && tuitionVal && "result" in tuitionVal && typeof tuitionVal.result === "number" ? tuitionVal.result : (typeof tuitionVal === "number" ? tuitionVal : 0);
    const enrollNum = typeof enrollVal === "object" && enrollVal && "result" in enrollVal && typeof enrollVal.result === "number" ? enrollVal.result : (typeof enrollVal === "number" ? enrollVal : 0);
    setFormula(c, `=${cellName(tuitionRow, col)}*${cellName(totalEnrollmentRow, col)}`, tuitionNum * enrollNum);
    c.numFmt = CUR;
  }
  const grossRow = row;
  row += 1;

  // Less: Financial Aid
  ws.getCell(`A${row}`).value = "Less: Financial Aid";
  for (let i = 0; i < 7; i++) {
    const col = 2 + i;
    const c = ws.getCell(row, col);
    const grossVal = ws.getCell(grossRow, col).value;
    const grossNum = typeof grossVal === "object" && grossVal && "result" in grossVal && typeof grossVal.result === "number" ? grossVal.result : 0;
    const aidPct = data.chesterton?.financialAidPct ?? 0.10;
    setFormula(c, `=-${cellName(grossRow, col)}*Financial_Aid_Pct`, -grossNum * aidPct);
    c.numFmt = CUR;
    c.font = { color: { argb: "FFB91C1C" } };
  }
  const aidRow = row;
  row += 1;

  // Book/supply fee revenue
  ws.getCell(`A${row}`).value = "Book / Supply Fee Revenue";
  for (let i = 0; i < 7; i++) {
    const col = 2 + i;
    const c = ws.getCell(row, col);
    const enrollVal = ws.getCell(totalEnrollmentRow, col).value;
    const enrollNum = typeof enrollVal === "object" && enrollVal && "result" in enrollVal && typeof enrollVal.result === "number" ? enrollVal.result : 0;
    const fee = data.chesterton?.bookSupplyFee ?? 600;
    setFormula(c, `=Book_Supply_Fee*${cellName(totalEnrollmentRow, col)}`, fee * enrollNum);
    c.numFmt = CUR;
  }
  const bookRow = row;
  row += 1;

  // Net revenue total — cached result mirrors the upstream rows so an
  // Excel-engine recalc returns the same number we stored.
  ws.getCell(`A${row}`).value = "Net Tuition + Fees";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    const grossVal = ws.getCell(grossRow, col).value;
    const aidVal = ws.getCell(aidRow, col).value;
    const bookVal = ws.getCell(bookRow, col).value;
    const grossNum = typeof grossVal === "object" && grossVal && "result" in grossVal && typeof grossVal.result === "number" ? grossVal.result : 0;
    const aidNum = typeof aidVal === "object" && aidVal && "result" in aidVal && typeof aidVal.result === "number" ? aidVal.result : 0;
    const bookNum = typeof bookVal === "object" && bookVal && "result" in bookVal && typeof bookVal.result === "number" ? bookVal.result : 0;
    setFormula(
      c,
      `=${cellName(grossRow, col)}+${cellName(aidRow, col)}+${cellName(bookRow, col)}`,
      grossNum + aidNum + bookNum,
    );
    c.numFmt = CUR;
    c.font = { bold: true };
  }
  const netRevenueRow = row;
  row += 2;

  // ── FACULTY SALARY (periods-based) ──
  // Per-year cost = AvgSalaryperPeriod * periods/section * sections-needed,
  // with the periods/section editable per row in col I.
  sec(ws, row, 9);
  ws.getCell(`A${row}`).value = "III. FACULTY SALARY (PERIODS-BASED)";
  row += 1;

  ws.getCell(`A${row}`).value = "Subject";
  for (let i = 0; i < 7; i++) ws.getCell(row, 2 + i).value = `Year ${i}`;
  ws.getCell(row, 9).value = "Periods/Sec";
  hdr(ws, row, 9);
  row += 1;

  const subjects = data.chesterton?.salarySchedule ?? [];
  const facultyStart = row;
  for (const subj of subjects) {
    ws.getCell(`A${row}`).value = subj.subject;
    const periods = subj.periodsPerSection ?? 0;
    const periodsCell = ws.getCell(row, 9);
    periodsCell.value = periods;
    periodsCell.numFmt = NUM;
    inputCell(periodsCell);
    for (let i = 0; i < 7; i++) {
      const col = 2 + i;
      const c = ws.getCell(row, col);
      const enrollVal = ws.getCell(totalEnrollmentRow, col).value;
      const enrollNum = typeof enrollVal === "object" && enrollVal && "result" in enrollVal && typeof enrollVal.result === "number" ? enrollVal.result : 0;
      const sectionsNeeded = enrollNum > 0 ? Math.max(1, Math.ceil(enrollNum / 25)) : 0;
      const cost = (data.chesterton?.startingTeacherSalary ?? 44000) / 5 * periods * sectionsNeeded;
      // IF guards against the MAX(1,…) clamp adding a phantom faculty cost
      // in years with zero enrollment, keeping the cached and recomputed
      // values aligned for an Excel-engine round-trip.
      const enrollAddr = cellName(totalEnrollmentRow, col);
      setFormula(
        c,
        `=IF(${enrollAddr}>0,AvgSalaryperPeriod*$I${row}*MAX(1,CEILING(${enrollAddr}/25,1)),0)`,
        cost,
      );
      c.numFmt = CUR;
    }
    row += 1;
  }
  const facultyEnd = row - 1;

  // Total Periods / FTE Equivalent / Total Faculty Cost summary.
  ws.getCell(`A${row}`).value = "Total Periods";
  ws.getCell(`A${row}`).font = { bold: true };
  const totalPeriods = subjects.reduce((s, x) => s + (x.periodsPerSection ?? 0), 0);
  const totalPeriodsCell = ws.getCell(row, 9);
  if (facultyEnd >= facultyStart) {
    setFormula(totalPeriodsCell, `=SUM(I${facultyStart}:I${facultyEnd})`, totalPeriods);
  } else {
    totalPeriodsCell.value = 0;
  }
  totalPeriodsCell.numFmt = NUM;
  totalPeriodsCell.font = { bold: true };
  const totalPeriodsRow = row;
  row += 1;

  ws.getCell(`A${row}`).value = "FTE Equivalent (5 periods = 1 FTE)";
  ws.getCell(`A${row}`).font = { italic: true };
  const fteCell = ws.getCell(row, 9);
  setFormula(fteCell, `=I${totalPeriodsRow}/5`, totalPeriods / 5);
  fteCell.numFmt = "0.00";
  fteCell.font = { italic: true };
  row += 1;

  ws.getCell(`A${row}`).value = "Total Faculty Cost";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    if (facultyEnd >= facultyStart) {
      // Sum the per-subject cached results so the recomputed SUM matches.
      let subjSum = 0;
      for (let r = facultyStart; r <= facultyEnd; r++) {
        const v = ws.getCell(r, col).value;
        if (v && typeof v === "object" && "result" in v && typeof (v as { result?: unknown }).result === "number") {
          subjSum += (v as { result: number }).result;
        }
      }
      setFormula(c, `=SUM(${cellName(facultyStart, col)}:${cellName(facultyEnd, col)})`, subjSum);
    } else {
      c.value = 0;
    }
    c.numFmt = CUR;
    c.font = { bold: true };
  }
  const totalFacultyCostRow = row;
  row += 2;

  // ── ADMINISTRATIVE SALARIES — verbatim role labels from source workbook
  // (rows 49-56 of "1 - 5 YR  FINANCIAL PROJECTIONS"). Cost cells are
  // founder-editable inputs (default 0) so a hiring plan rolls up into
  // the Total Admin Salaries subtotal that feeds Operating Expense.
  sec(ws, row, 8);
  ws.getCell(`A${row}`).value = "Administrative Salaries";
  row += 1;
  const adminStart = row;
  for (const role of [
    "Headmaster Admin Salary",
    "Executive Director",
    "Advancement Director",
    "School Administrator",
    "Marketing/Communications",
    "Business Manager / Accountant",
    "Admissions",
  ]) {
    ws.getCell(`A${row}`).value = role;
    for (let col = 2; col <= 8; col++) {
      const c = ws.getCell(row, col);
      c.value = 0;
      c.numFmt = CUR;
      inputCell(c);
    }
    row += 1;
  }
  const adminEnd = row - 1;

  // Total Admin Salaries subtotal (cols B-H = Year 0 - Year 6).
  ws.getCell(`A${row}`).value = "Total Admin Salaries";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    let sum = 0;
    for (let r = adminStart; r <= adminEnd; r++) sum += readCachedNumber(ws, r, col);
    setFormula(c, `=SUM(${cellName(adminStart, col)}:${cellName(adminEnd, col)})`, sum);
    c.numFmt = CUR;
    c.font = { bold: true };
  }
  const totalAdminRow = row;
  row += 2;

  // ── IV. OPERATING EXPENSE — General & Admin line items (verbatim
  // from "GENERAL & ADMIN" section of source projections tab). Each
  // line item's cost-per-student factor (col B) multiplies Total
  // Enrollment to fill cols C-H (Year 1-6).
  sec(ws, row, 8);
  ws.getCell(`A${row}`).value = "IV. OPERATING EXPENSE — GENERAL & ADMIN";
  row += 1;
  ws.getCell(`A${row}`).value = "Line Item";
  ws.getCell(`B${row}`).value = "Cost Per Student Factor";
  // Year columns (C-H) for the G&A block; col B is the per-student input.
  for (let i = 1; i < 7; i++) ws.getCell(row, 2 + i).value = `Year ${i}`;
  hdr(ws, row, 8);
  row += 1;
  const gaItems: Array<[string, number | null]> = [
    ["Facility Rental", 1700],
    ["Insurance", null],
    ["Administrative Expense", 400],
    ["Tech Expense Hardware/Software", 175],
    ["Marketing (Promo/Printing)", 125],
    ["Website", null],
    ["Curriculum Expense", null],
    ["Educational Materials", 125],
    ["Special Events, Retreats, House Shirts", 225],
    ["Facilities and Improvements", null],
    ["CSN Fees inclusive Y/Y Inflation", 675],
    ["CSN Accreditation", null],
    ["CSN Conferences", null],
  ];
  const gaStart = row;
  for (const [label, factor] of gaItems) {
    ws.getCell(`A${row}`).value = label;
    const f = ws.getCell(`B${row}`);
    // Items without a CSN-suggested factor still default to 0 so the
    // founder can fill in their local quote and the per-year formulas
    // below recompute automatically.
    f.value = factor ?? 0;
    f.numFmt = CUR;
    inputCell(f);
    for (let i = 1; i < 7; i++) {
      const col = 2 + i;
      const c = ws.getCell(row, col);
      const enrollAddr = cellName(totalEnrollmentRow, col);
      const enrollNum = readCachedNumber(ws, totalEnrollmentRow, col);
      const cost = (factor ?? 0) * enrollNum;
      setFormula(c, `=$B$${row}*${enrollAddr}`, cost);
      c.numFmt = CUR;
    }
    row += 1;
  }
  const gaEnd = row - 1;

  // Total G&A subtotal — col B left at 0 (the factor column has no
  // meaningful subtotal); cols C-H sum each year's line items.
  ws.getCell(`A${row}`).value = "Total G&A";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.getCell(`B${row}`).value = 0;
  ws.getCell(`B${row}`).numFmt = CUR;
  ws.getCell(`B${row}`).font = { bold: true };
  for (let i = 1; i < 7; i++) {
    const col = 2 + i;
    const c = ws.getCell(row, col);
    let sum = 0;
    for (let r = gaStart; r <= gaEnd; r++) sum += readCachedNumber(ws, r, col);
    setFormula(c, `=SUM(${cellName(gaStart, col)}:${cellName(gaEnd, col)})`, sum);
    c.numFmt = CUR;
    c.font = { bold: true };
  }
  const totalGaRow = row;
  row += 2;

  // Total Operating Expense — Admin + Faculty + G&A per year. Col B
  // (Year 0) Total G&A is structurally 0, so the same formula works
  // across all year columns.
  ws.getCell(`A${row}`).value = "Total Operating Expense";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    const adm = readCachedNumber(ws, totalAdminRow, col);
    const fac = readCachedNumber(ws, totalFacultyCostRow, col);
    const ga = readCachedNumber(ws, totalGaRow, col);
    setFormula(
      c,
      `=${cellName(totalAdminRow, col)}+${cellName(totalFacultyCostRow, col)}+${cellName(totalGaRow, col)}`,
      adm + fac + ga,
    );
    c.numFmt = CUR;
    c.font = { bold: true };
  }
  const operatingExpenseRow = row;
  row += 2;

  // ── V. FUNDRAISING GAP (verbatim header + footnote from source).
  // Computed gap = Total Operating Expense − Net Tuition + Fees per
  // year, exposed as the Fundraising_Gap named range (B:H, Year 0-6).
  sec(ws, row, 8);
  ws.getCell(`A${row}`).value = "V. FUNDRAISING GAP";
  row += 1;
  ws.mergeCells(`A${row}:H${row}`);
  ws.getCell(`A${row}`).value = "*This is the minimum amount to be raised in full by June 30 of the prior phase or academic year.";
  ws.getCell(`A${row}`).font = { italic: true };
  ws.getCell(`A${row}`).alignment = { wrapText: true };
  row += 1;

  ws.getCell(`A${row}`).value = "Fundraising Gap";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    const opEx = readCachedNumber(ws, operatingExpenseRow, col);
    const netRev = readCachedNumber(ws, netRevenueRow, col);
    setFormula(
      c,
      `=${cellName(operatingExpenseRow, col)}-${cellName(netRevenueRow, col)}`,
      opEx - netRev,
    );
    c.numFmt = CUR;
    c.font = { bold: true };
  }
  const fundraisingGapRow = row;
  wb.definedNames.add(
    `'${TAB_PROJECTIONS}'!$B$${row}:$H$${row}`,
    "Fundraising_Gap",
  );
  row += 2;

  // ── VI. KEY INDICATORS — verbatim labels from "V. KEY INDICATORS" in
  // source, each backed by a per-year formula that pulls from the new
  // totals so a recalc updates the dashboard automatically.
  sec(ws, row, 8);
  ws.getCell(`A${row}`).value = "VI. KEY INDICATORS";
  row += 1;

  // Avg Cost per Student = Operating Expense / Total Enrollment
  ws.getCell(`A${row}`).value = "Avg Cost per Student";
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    const opEx = readCachedNumber(ws, operatingExpenseRow, col);
    const enr = readCachedNumber(ws, totalEnrollmentRow, col);
    const v = enr > 0 ? opEx / enr : 0;
    setFormula(
      c,
      `=IFERROR(${cellName(operatingExpenseRow, col)}/${cellName(totalEnrollmentRow, col)},0)`,
      v,
    );
    c.numFmt = CUR;
  }
  row += 1;

  // Avg Tuition per Student = Net Tuition + Fees / Total Enrollment
  ws.getCell(`A${row}`).value = "Avg Tuition per Student";
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    const net = readCachedNumber(ws, netRevenueRow, col);
    const enr = readCachedNumber(ws, totalEnrollmentRow, col);
    const v = enr > 0 ? net / enr : 0;
    setFormula(
      c,
      `=IFERROR(${cellName(netRevenueRow, col)}/${cellName(totalEnrollmentRow, col)},0)`,
      v,
    );
    c.numFmt = CUR;
  }
  row += 1;

  // Fundraising Gap per Student = Fundraising Gap / Total Enrollment
  ws.getCell(`A${row}`).value = "Fundraising Gap per Student";
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    const gap = readCachedNumber(ws, fundraisingGapRow, col);
    const enr = readCachedNumber(ws, totalEnrollmentRow, col);
    const v = enr > 0 ? gap / enr : 0;
    setFormula(
      c,
      `=IFERROR(${cellName(fundraisingGapRow, col)}/${cellName(totalEnrollmentRow, col)},0)`,
      v,
    );
    c.numFmt = CUR;
  }
  row += 1;

  // Fundraising donations as % of budget = Fundraising Gap / Operating Expense
  ws.getCell(`A${row}`).value = "Fundraising donations as % of budget";
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    const gap = readCachedNumber(ws, fundraisingGapRow, col);
    const opEx = readCachedNumber(ws, operatingExpenseRow, col);
    const v = opEx > 0 ? gap / opEx : 0;
    setFormula(
      c,
      `=IFERROR(${cellName(fundraisingGapRow, col)}/${cellName(operatingExpenseRow, col)},0)`,
      v,
    );
    c.numFmt = PCT;
  }
  row += 1;

  // Tuition revenue as % of budget = Net Tuition + Fees / Operating Expense
  ws.getCell(`A${row}`).value = "Tuition revenue as % of budget";
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    const net = readCachedNumber(ws, netRevenueRow, col);
    const opEx = readCachedNumber(ws, operatingExpenseRow, col);
    const v = opEx > 0 ? net / opEx : 0;
    setFormula(
      c,
      `=IFERROR(${cellName(netRevenueRow, col)}/${cellName(operatingExpenseRow, col)},0)`,
      v,
    );
    c.numFmt = PCT;
  }
  row += 1;

  // Y/Y Enrollment +/- (# students) — col B is Year 0 with no prior
  // year, so it stays a flat 0; cols C-H emit the curr-prev formula.
  ws.getCell(`A${row}`).value = "Y/Y Enrollment % +/- (# students)";
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    if (col === 2) {
      c.value = 0;
      c.numFmt = NUM;
      continue;
    }
    const curr = readCachedNumber(ws, totalEnrollmentRow, col);
    const prev = readCachedNumber(ws, totalEnrollmentRow, col - 1);
    setFormula(
      c,
      `=${cellName(totalEnrollmentRow, col)}-${cellName(totalEnrollmentRow, col - 1)}`,
      curr - prev,
    );
    c.numFmt = NUM;
  }
  row += 1;

  // Y/Y Net Revenue $ +/-
  ws.getCell(`A${row}`).value = "Y/Y Net Revenue $ +/-";
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    if (col === 2) {
      c.value = 0;
      c.numFmt = CUR;
      continue;
    }
    const curr = readCachedNumber(ws, netRevenueRow, col);
    const prev = readCachedNumber(ws, netRevenueRow, col - 1);
    setFormula(
      c,
      `=${cellName(netRevenueRow, col)}-${cellName(netRevenueRow, col - 1)}`,
      curr - prev,
    );
    c.numFmt = CUR;
  }
  row += 1;

  // Y/Y Operating Cost $ +/-
  ws.getCell(`A${row}`).value = "Y/Y Operating Cost $ +/-";
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    if (col === 2) {
      c.value = 0;
      c.numFmt = CUR;
      continue;
    }
    const curr = readCachedNumber(ws, operatingExpenseRow, col);
    const prev = readCachedNumber(ws, operatingExpenseRow, col - 1);
    setFormula(
      c,
      `=${cellName(operatingExpenseRow, col)}-${cellName(operatingExpenseRow, col - 1)}`,
      curr - prev,
    );
    c.numFmt = CUR;
  }
  row += 2;

  // Verbatim Phase headers from source row 5-6 of the projections tab.
  // Source labels every column with the operating phase: Phase I "DISCOVERY",
  // Phase II "PREPARATION", Phase III "ACTIVATION", Phase IV "LAUNCH AND
  // ONGOING OPERATIONS" (used for years 1-6).
  sec(ws, row, 8);
  ws.getCell(`A${row}`).value = "Source Phase Headers (verbatim)";
  row += 1;
  for (const phase of [
    "Phase I — DISCOVERY",
    "Phase II — PREPARATION",
    "Phase III — ACTIVATION",
    "Phase IV — LAUNCH AND ONGOING OPERATIONS",
  ]) {
    ws.mergeCells(`A${row}:H${row}`);
    ws.getCell(`A${row}`).value = phase;
    row += 1;
  }
  row += 1;
  ws.mergeCells(`A${row}:H${row}`);
  ws.getCell(`A${row}`).value = "NOTE: This template is provided for guidance only.";
  ws.getCell(`A${row}`).font = { italic: true };
  row += 1;
  ws.mergeCells(`A${row}:H${row}`);
  ws.getCell(`A${row}`).value = "Last Updated: 11/23/2022";
  ws.getCell(`A${row}`).font = { italic: true, size: 9 };
  ws.getCell(`A${row}`).alignment = { horizontal: "right" };
  row += 1;
  ws.mergeCells(`A${row}:H${row}`);
  ws.getCell(`A${row}`).value = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network, 2008-2026. All rights reserved.";
  ws.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`A${row}`).alignment = { horizontal: "center" };
}

function buildSalarySchedule(wb: ExcelJS.Workbook, data: ChestertonModelInput) {
  const ws = wb.addWorksheet(TAB_SALARY, {
    properties: { tabColor: { argb: NAVY } },
    views: [{ showGridLines: false }],
  });

  ws.getColumn(1).width = 12;
  for (let c = 2; c <= 17; c++) ws.getColumn(c).width = 11;

  ws.mergeCells("A1:Q1");
  applyTitleStyle(ws.getCell("A1"));
  ws.getCell("A1").value = "Salary Schedule (Bachelors / Masters / Doctorate × FT / 3/4 / 1/2 / 1/4)";
  ws.getRow(1).height = 30;

  ws.getCell("A2").value = "Step Increase Y/Y";
  const stepCell = ws.getCell("B2");
  stepCell.value = 0.0275;
  stepCell.numFmt = PCT;
  inputCell(stepCell);

  // Header row 3
  ws.getCell("A3").value = "Years Exp";
  const fteLabels = ["Full Time", "Full Time", "Full Time", "Full Time", "", "1/4 Time", "1/4 Time", "1/4 Time", "", "1/2 Time", "1/2 Time", "1/2 Time", "", "3/4 Time", "3/4 Time", "3/4 Time"];
  for (let i = 0; i < fteLabels.length; i++) ws.getCell(3, 2 + i).value = fteLabels[i];
  hdr(ws, 3, 17);

  ws.getCell("A4").value = "";
  const degreeLabels = ["", "Bachelors", "Masters", "Doctorate", "", "Bachelors", "Masters", "Doctorate", "", "Bachelors", "Masters", "Doctorate", "", "Bachelors", "Masters", "Doctorate"];
  for (let i = 0; i < degreeLabels.length; i++) ws.getCell(4, 1 + i).value = degreeLabels[i];

  // Year 1 row uses GETTING STARTED start salary; subsequent rows compound.
  // Cached results are computed by mirroring the workbook's per-step ROUND
  // so an Excel-engine recalc matches every cell to the byte.
  const startingSalary = data.chesterton?.startingTeacherSalary ?? 44000;
  let bachPrev = 0;
  let mastPrev = 0;
  let docPrev = 0;
  for (let yearOffset = 0; yearOffset < 25; yearOffset++) {
    const r = 5 + yearOffset;
    ws.getCell(r, 1).value = yearOffset + 1;
    // Bachelors FT (col B)
    const bachFt = ws.getCell(r, 2);
    let bachVal: number;
    if (yearOffset === 0) {
      // Year-1 Bachelors FT = AvgSalaryperPeriod × 5 periods/FTE.
      bachVal = startingSalary;
      setFormula(bachFt, `=AvgSalaryperPeriod*5`, bachVal);
    } else {
      bachVal = Math.round(bachPrev * 1.0275);
      setFormula(bachFt, `=ROUND(${cellName(r - 1, 2)}*(1+$B$2),0)`, bachVal);
    }
    bachFt.numFmt = CUR;
    bachPrev = bachVal;

    // Masters FT (col C) = +$2000 over Bachelors at year 1, then compound
    let mastVal: number;
    if (yearOffset === 0) {
      mastVal = startingSalary + 2000;
      setFormula(ws.getCell(r, 3), `=B${r}+2000`, mastVal);
    } else {
      mastVal = Math.round(mastPrev * 1.0275);
      setFormula(ws.getCell(r, 3), `=ROUND(${cellName(r - 1, 3)}*(1+$B$2),0)`, mastVal);
    }
    ws.getCell(r, 3).numFmt = CUR;
    mastPrev = mastVal;

    // Doctorate FT (col D) = +$2000 over Masters at year 1, then compound
    let docVal: number;
    if (yearOffset === 0) {
      docVal = startingSalary + 4000;
      setFormula(ws.getCell(r, 4), `=C${r}+2000`, docVal);
    } else {
      docVal = Math.round(docPrev * 1.0275);
      setFormula(ws.getCell(r, 4), `=ROUND(${cellName(r - 1, 4)}*(1+$B$2),0)`, docVal);
    }
    ws.getCell(r, 4).numFmt = CUR;
    docPrev = docVal;

    // Quarter / Half / Three-quarter time blocks (cols F-H, J-L, N-P)
    const fteFractions: Array<{ block: number; mult: number }> = [
      { block: 6, mult: 0.25 },
      { block: 10, mult: 0.5 },
      { block: 14, mult: 0.75 },
    ];
    const ftVals = [bachVal, mastVal, docVal];
    for (const { block, mult } of fteFractions) {
      for (let degIdx = 0; degIdx < 3; degIdx++) {
        const sourceCol = 2 + degIdx; // B/C/D
        const targetCol = block + degIdx;
        const c = ws.getCell(r, targetCol);
        const sourceLetter = String.fromCharCode(64 + sourceCol);
        setFormula(c, `=ROUND(${sourceLetter}${r}*${mult},0)`, Math.round(ftVals[degIdx] * mult));
        c.numFmt = CUR;
      }
    }
  }

  // ── Verbatim Hours table (source rows 30-33 of "2 - SALARY SCHEDULE")
  // and the "Average Salary per Period Rate" label (source row 31, col 7).
  const hoursRow = 31;
  ws.getCell(`A${hoursRow}`).value = "Full Time";
  ws.getCell(`B${hoursRow}`).value = 24;
  ws.getCell(`C${hoursRow}`).value = "Hours";
  ws.getCell(`A${hoursRow + 1}`).value = "1/4 Time";
  ws.getCell(`B${hoursRow + 1}`).value = 6;
  ws.getCell(`C${hoursRow + 1}`).value = "Hours";
  ws.getCell(`A${hoursRow + 2}`).value = "1/2 Time";
  ws.getCell(`B${hoursRow + 2}`).value = 12;
  ws.getCell(`C${hoursRow + 2}`).value = "Hours";
  ws.getCell(`A${hoursRow + 3}`).value = "3/4 Time";
  ws.getCell(`B${hoursRow + 3}`).value = 18;
  ws.getCell(`C${hoursRow + 3}`).value = "Hours";
  for (let r = hoursRow; r < hoursRow + 4; r++) {
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`B${r}`).numFmt = NUM;
  }
  ws.getCell(`G${hoursRow}`).value = "Average Salary per Period Rate";
  ws.getCell(`G${hoursRow}`).font = { italic: true };

  // Verbatim copyright (source row 35).
  ws.mergeCells(`A${hoursRow + 5}:Q${hoursRow + 5}`);
  ws.getCell(`A${hoursRow + 5}`).value = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network, 2008-2025. All rights reserved.";
  ws.getCell(`A${hoursRow + 5}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`A${hoursRow + 5}`).alignment = { horizontal: "center" };
}

function buildKeyAssumptions(wb: ExcelJS.Workbook, data: ChestertonModelInput) {
  const ws = wb.addWorksheet(TAB_ASSUMPTIONS, {
    properties: { tabColor: { argb: NAVY } },
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 32;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 28;

  ws.mergeCells("B2:D2");
  applyTitleStyle(ws.getCell("B2"));
  ws.getCell("B2").value = "Key Assumptions & Network Outreach";

  ws.mergeCells("B4:D4");
  ws.getCell("B4").value = "Priestly Outreach";
  ws.getCell("B4").font = { bold: true, size: 12, color: { argb: NAVY } };

  ws.getCell("B5").value = "Priest";
  ws.getCell("C5").value = "Parish";
  ws.getCell("D5").value = "Team Member Assigned";
  hdr(ws, 5, 4);

  let row = 6;
  for (const p of data.chesterton?.priestlyOutreach ?? []) {
    ws.getCell(`B${row}`).value = p.name;
    ws.getCell(`C${row}`).value = p.affiliation || "";
    ws.getCell(`D${row}`).value = p.teamMember || "";
    row += 1;
  }
  row += 1;

  ws.mergeCells(`B${row}:D${row}`);
  ws.getCell(`B${row}`).value = "Prospective Future Facilities";
  ws.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  row += 1;

  ws.getCell(`B${row}`).value = "Phase / Facility";
  ws.getCell(`C${row}`).value = "Capacity";
  ws.getCell(`D${row}`).value = "Location";
  hdr(ws, row, 4);
  row += 1;
  for (const f of data.chesterton?.prospectiveFacilities ?? []) {
    ws.getCell(`B${row}`).value = f.name;
    ws.getCell(`C${row}`).value = f.capacity ?? 0;
    ws.getCell(`C${row}`).numFmt = NUM;
    ws.getCell(`D${row}`).value = f.location || "";
    row += 1;
  }
  row += 2;

  // ── Verbatim text reproduction of "3 - KEY ASSUMPTIONS" source tab.
  // Six numbered sections; every heading, table row, and bullet matches
  // the source workbook word-for-word so a side-by-side reader sees the
  // same content.
  ws.mergeCells(`B${row}:D${row}`);
  ws.getCell(`B${row}`).value = "(1) COMPOSITION OF FRESHMAN CLASS";
  ws.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  row += 2;
  ws.getCell(`B${row}`).value = "Recruiting Source";
  ws.getCell(`C${row}`).value = "# Students";
  ws.getCell(`D${row}`).value = "Notes";
  hdr(ws, row, 4);
  row += 1;
  // CSN-published placeholder table — the source workbook ships these
  // "XX" cells for the founder to overwrite by hand. There is no
  // GETTING STARTED input for freshman composition, so they stay static.
  const compositionRows: Array<[string, string, string]> = [
    ["Siblings of current students", "XX", "If applicable"],
    ["[Feeder school] graduates", "XX", "This is xx% of current [feeder school] 8th grade class"],
    ["Homeschool students", "XX", "Homeschool co-op name(s)"],
    ["Other source", "XX", "Describe here"],
    ["TOTAL", "XX", ""],
  ];
  for (const [src, count, note] of compositionRows) {
    ws.getCell(`B${row}`).value = src;
    ws.getCell(`C${row}`).value = count;
    ws.getCell(`D${row}`).value = note;
    ws.getCell(`D${row}`).alignment = { wrapText: true };
    if (src === "TOTAL") ws.getCell(`B${row}`).font = { bold: true };
    row += 1;
  }
  row += 1;

  ws.mergeCells(`B${row}:D${row}`);
  ws.getCell(`B${row}`).value = "(2) RECRUITING STRATEGY AND PROSPECTS";
  ws.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  row += 1;
  for (const bullet of [
    "- Recruiting team members will focus on specific geographic areas, including parochial and private K-8 schools, homeschool co-ops",
    "- The following data will be gathered for prospects: parent name - parish - student name - gender - current school - current grade",
  ]) {
    ws.mergeCells(`B${row}:D${row}`);
    ws.getCell(`B${row}`).value = bullet;
    ws.getCell(`B${row}`).alignment = { wrapText: true, vertical: "top" };
    row += 1;
  }
  row += 1;
  ws.getCell(`B${row}`).value = "School Recruiting Targets";
  ws.getCell(`B${row}`).font = { bold: true };
  ws.getCell(`D${row}`).value = "Current Student Enrolled";
  ws.getCell(`D${row}`).font = { bold: true };
  row += 1;
  ws.getCell(`B${row}`).value = "School";
  ws.getCell(`C${row}`).value = "Location";
  ws.getCell(`D${row}`).value = "7th";
  hdr(ws, row, 4);
  row += 1;
  // CSN-published placeholder table — feeder/homeschool/charter slots
  // for the founder to fill in by hand; not derivable from inputs.
  for (const target of [
    "School Name (K-8 parochial)",
    "School Name (K-8 parochial)",
    "School Name (K-8 parochial)",
    "School Name (K-8 parochial)",
    "Homeschool Co-op",
    "Homeschool Co-op",
    "Homeschool Co-op",
    "Homeschool Co-op",
    "School Name (charter)",
    "School Name (charter)",
    "School Name (charter)",
  ]) {
    ws.getCell(`B${row}`).value = target;
    ws.getCell(`C${row}`).value = "TBD";
    row += 1;
  }
  row += 1;

  ws.mergeCells(`B${row}:D${row}`);
  ws.getCell(`B${row}`).value = "(3) OTHER FINANCIAL ASSUMPTIONS";
  ws.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  row += 1;
  // Each bullet is either a static CSN-published policy line (no input
  // to reference) or a formula that recomputes from named ranges on
  // GETTING STARTED so editing those inputs cascades into the bullet text.
  const planYearFallback = data.chesterton?.planningYear ?? 2027;
  const tfgFallback = data.chesterton?.totalFundraisingGoal ?? 356526;
  const attritionFallback = data.chesterton?.attritionRate ?? 0.10;
  const otherFinancialBullets: Array<{ formula?: string; result: string; text?: string }> = [
    // Static CSN-published policy lines — no GETTING STARTED input to
    // reference, so they intentionally stay baked in.
    { text: "In order to limit costs associated with excess capacity, we will fill only one section per grade for a maximum of 23 students per grade", result: "" },
    {
      formula: `="Assume annual attrition of ~"&TEXT(Attrition_Rate,"0%")&" will be offset by incoming transfer students."`,
      result: `Assume annual attrition of ~${Math.round(attritionFallback * 100)}% will be offset by incoming transfer students.`,
    },
    { text: "Assume each student / parent will be trained in peer to peer fundraising to help cover fundraising gap per student", result: "" },
    {
      formula: `="Fundraising goal for "&Plan_Year&"-"&(Plan_Year+1)&" is $"&TEXT(TFG,"#,##0")&"; fundraising plan to be built around Gala, annual appeals, ongoing major gift fundraising"`,
      result: `Fundraising goal for ${planYearFallback}-${planYearFallback + 1} is $${tfgFallback.toLocaleString()}; fundraising plan to be built around Gala, annual appeals, ongoing major gift fundraising`,
    },
    { text: "Our current facility will accommodate projected enrollment growth through 20xx.", result: "" },
  ];
  for (const bullet of otherFinancialBullets) {
    ws.mergeCells(`B${row}:D${row}`);
    const cell = ws.getCell(`B${row}`);
    if (bullet.formula) {
      setFormula(cell, bullet.formula, bullet.result);
    } else {
      cell.value = bullet.text;
    }
    cell.alignment = { wrapText: true, vertical: "top" };
    row += 1;
  }
  row += 1;

  ws.mergeCells(`B${row}:D${row}`);
  ws.getCell(`B${row}`).value = "(4)  PROSPECTIVE FUTURE FACILITIES";
  ws.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  row += 2;
  ws.getCell(`B${row}`).value = "Facility";
  ws.getCell(`C${row}`).value = "Capacity";
  ws.getCell(`D${row}`).value = "Location";
  hdr(ws, row, 4);
  row += 1;
  // CSN-published placeholder facilities — capacity/location are
  // founder-curated property research, not derivable from any GETTING
  // STARTED input. We only render the fallback when the founder has not
  // entered their own prospectiveFacilities list.
  const facilityFallback: Array<[string, number, string]> = [
    ["Location 1", 70, "TBD"],
    ["Location 2", 100, "TBD"],
    ["Location 3", 250, "TBD"],
  ];
  for (const [name, cap, loc] of facilityFallback) {
    ws.getCell(`B${row}`).value = name;
    ws.getCell(`C${row}`).value = cap;
    ws.getCell(`C${row}`).numFmt = NUM;
    ws.getCell(`D${row}`).value = loc;
    row += 1;
  }
  row += 1;

  ws.mergeCells(`B${row}:D${row}`);
  ws.getCell(`B${row}`).value = "(5) PRIESTLY OUTREACH";
  ws.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  row += 2;
  ws.getCell(`B${row}`).value = "Father TBD";
  ws.getCell(`B${row}`).font = { bold: true };
  ws.getCell(`C${row}`).value = "Parish Name";
  ws.getCell(`D${row}`).value = "Team Member(s) Assigned";
  hdr(ws, row, 4);
  row += 1;
  // CSN-published placeholder priest contacts. The actual outreach list
  // is rendered above from data.chesterton.priestlyOutreach; these
  // "Father TBD" rows are the source workbook's empty starter rows and
  // are not derivable from any GETTING STARTED input.
  for (let i = 0; i < 7; i++) {
    ws.getCell(`B${row}`).value = "Father TBD";
    ws.getCell(`C${row}`).value = "Parish Name";
    ws.getCell(`D${row}`).value = "Team Member(s) Assigned";
    row += 1;
  }
  row += 1;

  ws.mergeCells(`B${row}:D${row}`);
  ws.getCell(`B${row}`).value = "(6) OTHER KEY INFLUENCERS / KEY STAKEHOLDERS";
  ws.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  row += 1;
  ws.getCell(`B${row}`).value = "Name";
  ws.getCell(`C${row}`).value = "Affiliation";
  ws.getCell(`D${row}`).value = "Team Member Assigned";
  hdr(ws, row, 4);
  row += 1;
  for (const k of data.chesterton?.keyInfluencers ?? []) {
    ws.getCell(`B${row}`).value = k.name;
    ws.getCell(`C${row}`).value = k.affiliation || "";
    ws.getCell(`D${row}`).value = k.teamMember || "";
    row += 1;
  }
  row += 1;

  ws.mergeCells(`B${row}:D${row}`);
  ws.getCell(`B${row}`).value = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network, 2008-2026. All rights reserved.";
  ws.getCell(`B${row}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`B${row}`).alignment = { horizontal: "center" };
}

function buildFundraisingGoals(wb: ExcelJS.Workbook, data: ChestertonModelInput) {
  const ws = wb.addWorksheet(TAB_FUNDRAISING, {
    properties: { tabColor: { argb: EVERGREEN } },
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 38;

  ws.mergeCells("B2:F2");
  applyTitleStyle(ws.getCell("B2"));
  ws.getCell("B2").value = "Fundraising Campaign Components";
  ws.getRow(2).height = 30;

  ws.mergeCells("B3:F3");
  applySubtitleStyle(ws.getCell("B3"));
  // Cached result mirrors the computed TFG SUM (when fundraising rows
  // exist) rather than the static input override, so the displayed value
  // matches what the formula evaluates to before Excel's first recalc.
  const fundraisingRows = data.chesterton?.fundraisingGoals ?? [];
  const cachedTFG = fundraisingRows.length > 0
    ? fundraisingRows.reduce((s, x) => s + (x.goalAmount ?? 0), 0)
    : (data.chesterton?.totalFundraisingGoal ?? 0);
  ws.getCell("B3").value = { formula: `="Total Goal: " & TEXT(TFG, "$#,##0")`, result: `Total Goal: $${cachedTFG.toLocaleString()}` };

  hdr(ws, 5, 6);
  ws.getCell("B5").value = "Component";
  ws.getCell("C5").value = "Goal Amount";
  ws.getCell("D5").value = "# of Gifts";
  ws.getCell("E5").value = "Avg Gift";
  ws.getCell("F5").value = "Notes";

  const rows = data.chesterton?.fundraisingGoals ?? [];
  let r = 6;
  const start = r;
  for (const row of rows) {
    ws.getCell(`B${r}`).value = row.category;
    const goal = ws.getCell(`C${r}`);
    goal.value = row.goalAmount ?? 0;
    goal.numFmt = CUR;
    inputCell(goal);
    const gifts = ws.getCell(`D${r}`);
    gifts.value = row.numberOfGifts ?? 0;
    gifts.numFmt = NUM;
    inputCell(gifts);
    // Avg gift = goal / # gifts (IFERROR guards against /0).
    const avg = ws.getCell(`E${r}`);
    const giftCount = row.numberOfGifts ?? 0;
    const avgComputed = giftCount > 0 ? (row.goalAmount ?? 0) / giftCount : 0;
    setFormula(avg, `=IFERROR(C${r}/D${r},0)`, avgComputed);
    avg.numFmt = CUR;
    avg.font = { italic: true };
    ws.getCell(`F${r}`).value = row.notes || "";
    r += 1;
  }
  ws.getCell(`B${r}`).value = "Total";
  ws.getCell(`B${r}`).font = { bold: true };
  if (rows.length > 0) {
    const totalGoal = rows.reduce((s, x) => s + (x.goalAmount ?? 0), 0);
    const totalGifts = rows.reduce((s, x) => s + (x.numberOfGifts ?? 0), 0);
    setFormula(ws.getCell(`C${r}`), `=SUM(C${start}:C${r - 1})`, totalGoal);
    setFormula(ws.getCell(`D${r}`), `=SUM(D${start}:D${r - 1})`, totalGifts);
    setFormula(ws.getCell(`E${r}`), `=IFERROR(C${r}/D${r},0)`, totalGifts > 0 ? totalGoal / totalGifts : 0);
    ws.getCell(`E${r}`).numFmt = CUR;
    ws.getCell(`E${r}`).font = { bold: true };
  }
  ws.getCell(`C${r}`).numFmt = CUR;
  ws.getCell(`C${r}`).font = { bold: true };
  ws.getCell(`D${r}`).numFmt = NUM;
  ws.getCell(`D${r}`).font = { bold: true };

  // ── Verbatim section headers + campaign descriptions from
  // "4 - FUNDRAISNG GOALS" source tab (note: source tab name has a typo
  // — preserved when noting the source, not in our cleaned tab name).
  let v = r + 2;
  ws.mergeCells(`B${v}:F${v}`);
  ws.getCell(`B${v}`).value = "I. FUNDRAISING GOAL";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  ws.mergeCells(`B${v}:F${v}`);
  ws.getCell(`B${v}`).value = { formula: `="Total fundraising goal: " & TEXT(TFG, "$#,##0")`, result: `Total fundraising goal: $${cachedTFG.toLocaleString()}` };
  ws.getCell(`B${v}`).alignment = { wrapText: true };
  v += 2;

  // ── Goal vs Gap comparison ──
  // Pull the Year-1 Fundraising_Gap (a single-row B:H named range on
  // PROJECTIONS where B=Year 0, C=Year 1) and compare it against the
  // Total Fundraising Goal so founders see at a glance whether their
  // fundraising plan covers the operating gap.
  const projWs = wb.getWorksheet(TAB_PROJECTIONS);
  let y1GapCached = 0;
  if (projWs) {
    let gapRow = -1;
    projWs.eachRow((row, idx) => {
      if (row.getCell(1).value === "Fundraising Gap") gapRow = idx;
    });
    if (gapRow > 0) {
      y1GapCached = readCachedNumber(projWs, gapRow, 3); // col C = Year 1
    }
  }
  const surplusCached = cachedTFG - y1GapCached;
  const statusCached = surplusCached >= 0
    ? "Surplus — TFG covers the operating gap"
    : "Shortfall — raise more to cover the operating gap";
  const statusFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: surplusCached >= 0 ? GREEN_BG : RED_BG },
  };

  ws.mergeCells(`B${v}:F${v}`);
  ws.getCell(`B${v}`).value = "Goal vs Operating Gap (Year 1)";
  ws.getCell(`B${v}`).font = { bold: true, color: { argb: NAVY } };
  v += 1;

  ws.getCell(`B${v}`).value = "Year-1 Operating Gap";
  const gapValueCell = ws.getCell(`C${v}`);
  setFormula(gapValueCell, `=INDEX(Fundraising_Gap,1,2)`, y1GapCached);
  gapValueCell.numFmt = CUR;
  v += 1;

  ws.getCell(`B${v}`).value = "Total Fundraising Goal";
  const tfgValueCell = ws.getCell(`C${v}`);
  setFormula(tfgValueCell, `=TFG`, cachedTFG);
  tfgValueCell.numFmt = CUR;
  v += 1;

  ws.getCell(`B${v}`).value = "Surplus / (Shortfall)";
  ws.getCell(`B${v}`).font = { bold: true };
  const surplusCell = ws.getCell(`C${v}`);
  setFormula(surplusCell, `=TFG-INDEX(Fundraising_Gap,1,2)`, surplusCached);
  surplusCell.numFmt = CUR;
  surplusCell.font = { bold: true };
  surplusCell.fill = statusFill;
  v += 1;

  ws.getCell(`B${v}`).value = "Status";
  ws.getCell(`B${v}`).font = { bold: true };
  ws.mergeCells(`C${v}:F${v}`);
  const statusCell = ws.getCell(`C${v}`);
  setFormula(
    statusCell,
    `=IF(TFG>=INDEX(Fundraising_Gap,1,2),"Surplus — TFG covers the operating gap","Shortfall — raise more to cover the operating gap")`,
    statusCached,
  );
  statusCell.font = { bold: true };
  statusCell.fill = statusFill;
  v += 2;

  ws.mergeCells(`B${v}:F${v}`);
  ws.getCell(`B${v}`).value = "II. FUNDRAISING GOAL - DETAIL";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  // Verbatim row labels from source rows 7-15, col 7 (SUMMARY) and the
  // adjoining "NOTES" label at col 10.
  for (const summaryLabel of [
    "SUMMARY",
    "A - Booster / Special Campaign",
    "B - Giving Tuesday",
    "C - Year-End Appeal",
    "D - Annual Gala",
    "E - Annual Appeal",
    "F - Major Gifts",
    "TOTAL, GROSS",
    "Less Gala expense",
    "TOTAL, NET",
  ]) {
    ws.mergeCells(`B${v}:F${v}`);
    ws.getCell(`B${v}`).value = summaryLabel;
    ws.getCell(`B${v}`).alignment = { wrapText: true };
    if (summaryLabel === "SUMMARY" || summaryLabel.startsWith("TOTAL")) {
      ws.getCell(`B${v}`).font = { bold: true };
    }
    v += 1;
  }
  v += 1;

  ws.mergeCells(`B${v}:F${v}`);
  ws.getCell(`B${v}`).value = "III. FUNDRAISING COMPONENTS";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  ws.getCell(`B${v}`).value = "Campaign";
  ws.getCell(`C${v}`).value = "Date";
  ws.getCell(`D${v}`).value = "Donors";
  ws.mergeCells(`E${v}:F${v}`);
  ws.getCell(`E${v}`).value = "Description / Event";
  hdr(ws, v, 6);
  v += 1;
  // Verbatim from source rows 19-22 (date) and 23-43 (event):
  //   A: "Launch: Ongoing (e.g., Scrip, special opp)"
  //   B: "Date: November xx, 20xx (Giving Tuesday)" / "Event: One Day, Online Fundraiser"
  //   C: "Date: November / December 20xx" / "Event: Direct Mail and Eblast"
  //   D: "Date:" (blank in source) / Annual Gala (assume table)
  //   E: "Date: February through June" / "Description: Coordinated fundraising appeal"
  //   F: "Date: October - June" / "Description: Gala challenge; private foundations; other major gifts"
  const campaigns: Array<[string, string, string, string]> = [
    ["A - BOOSTER OR SPECIAL CAMPAIGN", "Launch: Ongoing (e.g., Scrip, special opp)", "Assume:", ""],
    ["B - ONE-DAY CAMPAIGN", "Date: November xx, 20xx (Giving Tuesday)", "", "Event: One Day, Online Fundraiser"],
    ["C - YEAR-END CAMPAIGN", "Date: November / December 20xx", "", "Event: Direct Mail and Eblast"],
    ["D - ANNUAL GALA", "Date: ", "Assume:", "Price per Ticket / Cost per Ticket / Average Gift Per Guest / Average Sponsorship / Program Ads / Raffle Tickets / The Big Ask / Grand Raffle / Silent Auction"],
    ["E - ANNUAL APPEAL", "Date: February through June", "", "Description: Coordinated fundraising appeal"],
    ["F - MAJOR GIFTS", "Date: October - June", "", "Description: Gala challenge; private foundations; other major gifts"],
  ];
  for (const [code, date, donors, desc] of campaigns) {
    ws.getCell(`B${v}`).value = code;
    ws.getCell(`B${v}`).font = { bold: true };
    ws.getCell(`C${v}`).value = date;
    ws.getCell(`D${v}`).value = donors;
    ws.mergeCells(`E${v}:F${v}`);
    ws.getCell(`E${v}`).value = desc;
    ws.getCell(`E${v}`).alignment = { wrapText: true };
    v += 1;
  }
  v += 1;

  // Verbatim Annual Gala detail block (source rows 22-37, columns J-K
  // of "4 - FUNDRAISING GOALS"). Reproduces the price/cost assumptions
  // and the revenue line items the source tab uses to build the gala
  // budget.
  ws.mergeCells(`B${v}:F${v}`);
  ws.getCell(`B${v}`).value = "D - ANNUAL GALA — DETAIL";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  const galaAssumptions: Array<[string, number]> = [
    ["Price per Ticket", 125],
    ["Cost per Ticket", 92],
    ["Average Gift Per Guest", 200],
    ["Average Price Silent Auction Item", 150],
    ["Average Sponsorship Cost", 2500],
    ["Program Ads Page Goal", 400],
    ["Raffle Ticket Price", 50],
    ["Average Pre Event Gift", 3000],
  ];
  for (const [label, amt] of galaAssumptions) {
    ws.getCell(`B${v}`).value = label;
    ws.getCell(`E${v}`).value = amt;
    ws.getCell(`E${v}`).numFmt = CUR;
    v += 1;
  }
  v += 1;
  ws.getCell(`B${v}`).value = "Revenue Element";
  ws.getCell(`C${v}`).value = "#";
  ws.getCell(`D${v}`).value = "Notes";
  hdr(ws, v, 6);
  v += 1;
  const galaRevenue: Array<[string, string, string]> = [
    ["Paying Guests", "500", "Tickets x Price per Ticket"],
    ["Sponsorships", "22", "Sponsorships x Average Sponsorship Cost"],
    ["Program Ads", "42", "88 x Program Ads Page Goal"],
    ["Pre-Event Gifts", "4", "Pre-Event Gifts x Average Pre Event Gift"],
    ["The Big Ask", "Paying Guests x 30%", "Big Ask count x Average Gift Per Guest"],
    ["Grand Raffle", "1000", "Raffle tickets x Raffle Ticket Price"],
    ["Silent Auction", "40", "Silent Auction items x Average Price Silent Auction Item"],
  ];
  for (const [el, count, note] of galaRevenue) {
    ws.getCell(`B${v}`).value = el;
    ws.getCell(`C${v}`).value = count;
    ws.getCell(`D${v}`).value = note;
    ws.getCell(`D${v}`).alignment = { wrapText: true };
    v += 1;
  }
  v += 1;

  // Source workbook places "FUNDRAISNG PLAN FOR" (sic — missing 'I')
  // at row 3, column K of "4 - FUNDRAISING GOALS". Reproduce verbatim
  // in the same cell-position semantics: bold header label.
  ws.getCell(`B${v}`).value = "FUNDRAISNG PLAN FOR";
  ws.getCell(`B${v}`).font = { bold: true };
  v += 2;

  ws.mergeCells(`B${v}:F${v}`);
  ws.getCell(`B${v}`).value = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network, 2008-2026. All rights reserved.";
  ws.getCell(`B${v}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`B${v}`).alignment = { horizontal: "center" };
}

function buildGiftChart(wb: ExcelJS.Workbook, data: ChestertonModelInput) {
  const ws = wb.addWorksheet(TAB_GIFT_CHART, {
    properties: { tabColor: { argb: EVERGREEN } },
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 18;

  ws.mergeCells("B2:E2");
  applyTitleStyle(ws.getCell("B2"));
  ws.getCell("B2").value = "Sample Gift Chart (donor pyramid)";
  ws.getRow(2).height = 30;

  hdr(ws, 4, 5);
  ws.getCell("B4").value = "Gift Amount";
  ws.getCell("C4").value = "# Gifts";
  ws.getCell("D4").value = "# Prospects";
  ws.getCell("E4").value = "Tier Total";

  const rows = data.chesterton?.giftChart ?? [];
  let r = 5;
  const start = r;
  for (const row of rows) {
    const giftCell = ws.getCell(`B${r}`);
    giftCell.value = row.giftAmount ?? 0;
    giftCell.numFmt = CUR;
    inputCell(giftCell);

    const giftsCell = ws.getCell(`C${r}`);
    giftsCell.value = row.numberOfGifts ?? 0;
    giftsCell.numFmt = NUM;
    inputCell(giftsCell);

    const prospCell = ws.getCell(`D${r}`);
    prospCell.value = row.numberOfProspects ?? 0;
    prospCell.numFmt = NUM;
    inputCell(prospCell);

    const totalCell = ws.getCell(`E${r}`);
    setFormula(totalCell, `=B${r}*C${r}`, (row.giftAmount ?? 0) * (row.numberOfGifts ?? 0));
    totalCell.numFmt = CUR;
    r += 1;
  }
  // Total
  ws.getCell(`B${r}`).value = "Pyramid Total";
  ws.getCell(`B${r}`).font = { bold: true };
  if (rows.length > 0) {
    setFormula(ws.getCell(`E${r}`), `=SUM(E${start}:E${r - 1})`, rows.reduce((s, x) => s + ((x.giftAmount ?? 0) * (x.numberOfGifts ?? 0)), 0));
  }
  ws.getCell(`E${r}`).numFmt = CUR;
  ws.getCell(`E${r}`).font = { bold: true };

  // Goal vs pyramid comparison row
  r += 1;
  ws.getCell(`B${r}`).value = "Total Fundraising Goal (TFG)";
  // Mirror the GETTING STARTED resolution: TFG is the SUM of the
  // fundraising rows when present, otherwise the static override.
  const tfgRows = data.chesterton?.fundraisingGoals ?? [];
  const tfgCached = tfgRows.length > 0
    ? tfgRows.reduce((s, x) => s + (x.goalAmount ?? 0), 0)
    : (data.chesterton?.totalFundraisingGoal ?? 0);
  ws.getCell(`E${r}`).value = { formula: `=TFG`, result: tfgCached };
  ws.getCell(`E${r}`).numFmt = CUR;

  // ── Verbatim source rows from "5 - GIFT CHART".
  // The source tab carries a single instruction line on row 2 / col B
  // ("ENTER GIFT AMOUNTS AND # OF GIFTS") plus the standard 12-tier
  // donor pyramid. Reproduce both verbatim below the dynamic table so
  // the export round-trips every cell in the source.
  let v = r + 2;
  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "ENTER GIFT AMOUNTS AND # OF GIFTS";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 2;
  hdr(ws, v, 5);
  ws.getCell(`B${v}`).value = "Gift Amount";
  ws.getCell(`C${v}`).value = "# Gifts";
  ws.getCell(`D${v}`).value = "# Prospects";
  ws.getCell(`E${v}`).value = "Total";
  v += 1;
  // Standard 12-tier donor pyramid (source rows 5-16).
  const pyramidStart = v;
  const sourcePyramid: Array<[number, number, number]> = [
    [50000, 1, 4],
    [25000, 2, 8],
    [20000, 2, 8],
    [10000, 4, 16],
    [7500, 6, 24],
    [5000, 8, 32],
    [2500, 10, 40],
    [1000, 15, 60],
    [500, 20, 80],
    [250, 30, 120],
    [100, 40, 160],
    [25, 60, 240],
  ];
  for (const [gift, gifts, prospects] of sourcePyramid) {
    ws.getCell(`B${v}`).value = gift;
    ws.getCell(`B${v}`).numFmt = CUR;
    ws.getCell(`C${v}`).value = gifts;
    ws.getCell(`C${v}`).numFmt = NUM;
    ws.getCell(`D${v}`).value = prospects;
    ws.getCell(`D${v}`).numFmt = NUM;
    setFormula(ws.getCell(`E${v}`), `=B${v}*C${v}`, gift * gifts);
    ws.getCell(`E${v}`).numFmt = CUR;
    v += 1;
  }
  ws.getCell(`B${v}`).value = "Total";
  ws.getCell(`B${v}`).font = { bold: true };
  setFormula(
    ws.getCell(`E${v}`),
    `=SUM(E${pyramidStart}:E${v - 1})`,
    sourcePyramid.reduce((s, [g, n]) => s + g * n, 0),
  );
  ws.getCell(`E${v}`).numFmt = CUR;
  ws.getCell(`E${v}`).font = { bold: true };
  v += 2;

  ws.mergeCells(`B${v}:E${v}`);
  ws.getCell(`B${v}`).value = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network, 2008-2026. All rights reserved.";
  ws.getCell(`B${v}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`B${v}`).alignment = { horizontal: "center" };
}

// Source tab "5 - GIFT CHART AUTOMATIC" — formula-driven gift pyramid
// derived from TFG, Top Gift %, Number of Gifts, and Growth Factor.
// Reproduced verbatim from the source workbook (rows 2-28).
function buildGiftChartAutomatic(wb: ExcelJS.Workbook, data: ChestertonModelInput) {
  const ws = wb.addWorksheet(TAB_GIFT_CHART_AUTO, {
    properties: { tabColor: { argb: EVERGREEN } },
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 14;
  ws.getColumn(7).width = 14;
  ws.getColumn(8).width = 14;
  ws.getColumn(9).width = 14;

  // Row 2 — verbatim School_Name + Plan_Year banner from source.
  setFormula(
    ws.getCell("B2"),
    `=School_Name`,
    data.schoolName ?? "Chesterton Academy of [enter school name]",
  );
  setFormula(ws.getCell("H2"), `=Plan_Year`, data.chesterton?.planningYear ?? 2027);

  // Row 3 — verbatim "SAMPLE GIFT CHART" / "PLANNING FOR" headers.
  ws.getCell("B3").value = "SAMPLE GIFT CHART";
  ws.getCell("B3").font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.getCell("H3").value = "PLANNING FOR";
  ws.getCell("H3").font = { italic: true };

  // Row 7 — verbatim header row (with newlines preserved).
  const headerRow = 7;
  ws.getCell(`A${headerRow}`).value = "Level";
  ws.getCell(`B${headerRow}`).value = "Gift Amount ";
  ws.getCell(`C${headerRow}`).value = "# Gifts";
  ws.getCell(`D${headerRow}`).value = "# Prospects";
  ws.getCell(`E${headerRow}`).value = "Total\nGifts";
  ws.getCell(`F${headerRow}`).value = "Cumulative\n Total $";
  ws.getCell(`G${headerRow}`).value = "Cumulative\n Total %";
  ws.getCell(`H${headerRow}`).value = "Weight";
  hdr(ws, headerRow, 8);
  for (let c = 1; c <= 8; c++) {
    ws.getCell(headerRow, c).alignment = { wrapText: true, horizontal: "center" };
  }

  // Rows 9-20 — twelve gift levels exactly as in source.
  // E23/E24/E25/E26 = TFG / Top Gift % / Number of Gifts / Growth Factor.
  //
  // Source structure (verbatim):
  //   A: Level — A9=1 literal; A10..A20 = =A(N-1)+1
  //   B: Gift Amount —
  //     B9  = =(ROUND(TFG,-5)/1*$E$24)   (level-1 derived from TFG)
  //     B10 = =B9/2
  //     B11..B20 are LITERAL caps from the published manual:
  //       [15000, 12500, 10000, 7500, 5000, 2500, 1000, 500, 250, 100]
  //   C: # Gifts — distribution computed from column I (NOT from B):
  //     C9  = =IF(ROUND(I9/$E$26,0)*$E$26>0,ROUND(I9/$E$26,0)*$E$26,1)
  //     C10..C20 = =ROUND(I_N/$E$26,0)*$E$26
  //   D: # Prospects — D9=5 literal; D10..D20 = =C_N*3
  //   E: Total Gifts — =B_N*C_N
  //   F: Cumulative $ — F9=E9; F10..F20 = =F(N-1)+E_N
  //   G: Cumulative % — G9=F9/E23; G10..G20 = =F_N/$E$23
  //   H: Weight — =1/B_N
  //   I: Distribution — =($E$25*($H_N/SUM($H$9:$H$20)))
  const lvl1Row = 9;
  const lastLvlRow = 20;
  // TFG is the Fundraising tab's SUM(C6:C8); compute from per-row
  // goalAmount inputs (NOT data.chesterton.totalFundraisingGoal — the
  // source workbook's gift chart depends on the fundraising column sum).
  const goals = data.chesterton?.fundraisingGoals ?? [];
  const tfg = goals.reduce((s, g) => s + (Number(g.goalAmount) || 0), 0);
  // E25 (Number of Gifts) is the source-published default of 650 gifts.
  const numGiftsTotal = 650;
  // E26 (Growth Factor) is the source-published default of 1.
  const growthFactor = 1;
  // E24 (Top Gift %) is the source-published default of 12.5%.
  const topGiftPct = 0.125;
  // B11..B20 hardcoded gift-amount caps from the source manual.
  const bLiterals = [15000, 12500, 10000, 7500, 5000, 2500, 1000, 500, 250, 100];

  // Pre-compute cached values via HyperFormula on the exact same formula
  // chain we'll write to the cells. The probe uses columns A..I (0..8)
  // and rows 1..12 to mirror the workbook's column letters exactly.
  // Row 13 col E (column index 4) is set to TFG so G formulas can use
  // "=F_N/E13" as a stand-in for the workbook's "=F_N/$E$23".
  const probe: Array<Array<string | number | null>> = [];
  for (let i = 0; i < 12; i++) {
    const r = i + 1; // 1-indexed in formulas
    let bCell: string | number;
    if (i === 0) bCell = `=(ROUND(${tfg},-5)/1*${topGiftPct})`;
    else if (i === 1) bCell = `=B1/2`;
    else bCell = bLiterals[i - 2];
    const aCell: string | number = i === 0 ? 1 : `=A${r - 1}+1`;
    const cCell = i === 0
      ? `=IF(ROUND(I${r}/${growthFactor},0)*${growthFactor}>0,ROUND(I${r}/${growthFactor},0)*${growthFactor},1)`
      : `=ROUND(I${r}/${growthFactor},0)*${growthFactor}`;
    const dCell: string | number = i === 0 ? 5 : `=C${r}*3`;
    const eCell = `=B${r}*C${r}`;
    const fCell = i === 0 ? `=E${r}` : `=F${r - 1}+E${r}`;
    const gCell = `=F${r}/E13`;
    const hCell = `=1/B${r}`;
    const iCell = `=(${numGiftsTotal}*(H${r}/SUM(H1:H12)))`;
    probe.push([aCell, bCell, cCell, dCell, eCell, fCell, gCell, hCell, iCell]);
  }
  // Row 13 col E (index 4) = TFG (stand-in for the workbook's $E$23).
  probe.push([null, null, null, null, tfg]);
  const hf = HyperFormula.buildFromArray(probe, { licenseKey: "gpl-v3" });
  const num = (rIdx: number, cIdx: number): number => {
    const v = hf.getCellValue({ sheet: 0, col: cIdx, row: rIdx });
    return typeof v === "number" ? v : 0;
  };
  type Row = { b: number; c: number; d: number; e: number; f: number; g: number; h: number; i: number };
  const computed: Row[] = [];
  for (let i = 0; i < 12; i++) {
    // Probe columns: 0=A, 1=B, 2=C, 3=D, 4=E, 5=F, 6=G, 7=H, 8=I.
    computed.push({
      b: num(i, 1), c: num(i, 2), d: num(i, 3), e: num(i, 4),
      f: num(i, 5), g: num(i, 6), h: num(i, 7), i: num(i, 8),
    });
  }
  hf.destroy();

  // setFormula's safeFormulaValue quantizes results via
  // Math.round(result * 1e8) / 1e8, which corrupts numbers > ~9e7 (since
  // 1e8 * value exceeds 2^53). E and F can grow large for high TFG runs,
  // so write {formula, result} directly to skip that quantization.
  const setExactFormula = (cell: ExcelJS.Cell, formula: string, result: number) => {
    cell.value = { formula, result };
  };

  // ── Write column A (Level) ─────────────────────────────────────────
  ws.getCell(`A${lvl1Row}`).value = 1;
  for (let i = 1; i < 12; i++) {
    const r = lvl1Row + i;
    setFormula(ws.getCell(`A${r}`), `=A${r - 1}+1`, i + 1);
  }

  // ── Write column B (Gift Amount) ───────────────────────────────────
  setFormula(
    ws.getCell(`B${lvl1Row}`),
    `=(ROUND(TFG,-5)/1*$E$24)`,
    computed[0].b,
  );
  setFormula(
    ws.getCell(`B${lvl1Row + 1}`),
    `=B${lvl1Row}/2`,
    computed[1].b,
  );
  for (let i = 2; i < 12; i++) {
    ws.getCell(`B${lvl1Row + i}`).value = bLiterals[i - 2];
  }

  // ── Write column C (# Gifts) — depends on column I ────────────────
  setFormula(
    ws.getCell(`C${lvl1Row}`),
    `=IF(ROUND(I${lvl1Row}/$E$26,0)*$E$26>0,ROUND(I${lvl1Row}/$E$26,0)*$E$26,1)`,
    computed[0].c,
  );
  for (let i = 1; i < 12; i++) {
    const r = lvl1Row + i;
    setFormula(
      ws.getCell(`C${r}`),
      `=ROUND(I${r}/$E$26,0)*$E$26`,
      computed[i].c,
    );
  }

  // ── Write column D (# Prospects) ───────────────────────────────────
  ws.getCell(`D${lvl1Row}`).value = 5;
  for (let i = 1; i < 12; i++) {
    const r = lvl1Row + i;
    setFormula(ws.getCell(`D${r}`), `=C${r}*3`, computed[i].d);
  }

  // ── Write column E (Total Gifts = B*C) ─────────────────────────────
  for (let i = 0; i < 12; i++) {
    const r = lvl1Row + i;
    setExactFormula(ws.getCell(`E${r}`), `=B${r}*C${r}`, computed[i].e);
  }

  // ── Write column F (Cumulative $) ──────────────────────────────────
  setExactFormula(ws.getCell(`F${lvl1Row}`), `=E${lvl1Row}`, computed[0].f);
  for (let i = 1; i < 12; i++) {
    const r = lvl1Row + i;
    setExactFormula(
      ws.getCell(`F${r}`),
      `=F${r - 1}+E${r}`,
      computed[i].f,
    );
  }

  // ── Write column G (Cumulative %) ──────────────────────────────────
  // Source has G9 verbatim "=F9/E23" (no $ row anchor); G10..G20 use $E$23.
  setFormula(ws.getCell(`G${lvl1Row}`), `=F${lvl1Row}/E23`, computed[0].g);
  for (let i = 1; i < 12; i++) {
    const r = lvl1Row + i;
    setFormula(ws.getCell(`G${r}`), `=F${r}/$E$23`, computed[i].g);
  }

  // ── Write column H (Weight = 1/B) ──────────────────────────────────
  for (let i = 0; i < 12; i++) {
    const r = lvl1Row + i;
    setFormula(ws.getCell(`H${r}`), `=1/B${r}`, computed[i].h);
  }

  // ── Write column I (Distribution = E25*(H/SUM(H9:H20))) ────────────
  for (let i = 0; i < 12; i++) {
    const r = lvl1Row + i;
    setFormula(
      ws.getCell(`I${r}`),
      `=($E$25*($H${r}/SUM($H$${lvl1Row}:$H$${lastLvlRow})))`,
      computed[i].i,
    );
  }

  // Format columns
  for (let r = lvl1Row; r <= lastLvlRow; r++) {
    ws.getCell(`B${r}`).numFmt = CUR;
    ws.getCell(`C${r}`).numFmt = NUM;
    ws.getCell(`D${r}`).numFmt = NUM;
    ws.getCell(`E${r}`).numFmt = CUR;
    ws.getCell(`F${r}`).numFmt = CUR;
    ws.getCell(`G${r}`).numFmt = PCT;
    ws.getCell(`H${r}`).numFmt = "0.00000";
    ws.getCell(`I${r}`).numFmt = "0.00";
  }

  // Row 21 — verbatim subtotal row (SUMs of C, D, E).
  // Use HF on a dedicated probe so the SUM cached values match HF's
  // recompute exactly across both small and large totals.
  const subtotalRow = lastLvlRow + 1;
  const sumProbe: Array<Array<string | number | null>> = [];
  for (let i = 0; i < 12; i++) {
    sumProbe.push([computed[i].c, computed[i].d, computed[i].e]);
  }
  sumProbe.push(["=SUM(A1:A12)", "=SUM(B1:B12)", "=SUM(C1:C12)"]);
  const hfSum = HyperFormula.buildFromArray(sumProbe, { licenseKey: "gpl-v3" });
  const sumC = hfSum.getCellValue({ sheet: 0, col: 0, row: 12 });
  const sumD = hfSum.getCellValue({ sheet: 0, col: 1, row: 12 });
  const sumE = hfSum.getCellValue({ sheet: 0, col: 2, row: 12 });
  hfSum.destroy();
  setExactFormula(
    ws.getCell(`C${subtotalRow}`),
    `=SUM(C${lvl1Row}:C${lastLvlRow})`,
    typeof sumC === "number" ? sumC : 0,
  );
  setExactFormula(
    ws.getCell(`D${subtotalRow}`),
    `=SUM(D${lvl1Row}:D${lastLvlRow})`,
    typeof sumD === "number" ? sumD : 0,
  );
  setExactFormula(
    ws.getCell(`E${subtotalRow}`),
    `=SUM(E${lvl1Row}:E${lastLvlRow})`,
    typeof sumE === "number" ? sumE : 0,
  );
  ws.getCell(`C${subtotalRow}`).numFmt = NUM;
  ws.getCell(`D${subtotalRow}`).numFmt = NUM;
  ws.getCell(`E${subtotalRow}`).numFmt = CUR;
  ws.getCell(`C${subtotalRow}`).font = { bold: true };
  ws.getCell(`D${subtotalRow}`).font = { bold: true };
  ws.getCell(`E${subtotalRow}`).font = { bold: true };

  // Rows 23-26 — verbatim parameter block.
  ws.getCell("D23").value = "GOAL:";
  ws.getCell("D23").font = { bold: true };
  setFormula(ws.getCell("E23"), `=TFG`, tfg);
  ws.getCell("E23").numFmt = CUR;

  ws.getCell("D24").value = "Top Gift%";
  ws.getCell("E24").value = 0.125;
  ws.getCell("E24").numFmt = PCT;
  inputCell(ws.getCell("E24"));

  ws.getCell("D25").value = "Number of Gifts";
  ws.getCell("E25").value = 650;
  ws.getCell("E25").numFmt = NUM;
  inputCell(ws.getCell("E25"));

  ws.getCell("D26").value = "Growth Factor";
  ws.getCell("E26").value = 1;
  ws.getCell("E26").numFmt = NUM;
  inputCell(ws.getCell("E26"));

  // Row 28 — verbatim copyright text. (The source workbook references
  // 'GETTING STARTED'!A81; we inline the literal so the cached value is
  // self-contained and the recompute test stays clean.)
  ws.getCell("B28").value = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network, 2008-2026. All rights reserved.";
  ws.getCell("B28").font = { italic: true, size: 9, color: { argb: NAVY } };
}

function buildRecruitingPipeline(wb: ExcelJS.Workbook, data: ChestertonModelInput) {
  const ws = wb.addWorksheet(TAB_RECRUITING, {
    properties: { tabColor: { argb: EVERGREEN } },
    views: [{ showGridLines: false }],
  });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 50;

  ws.mergeCells("B2:D2");
  applyTitleStyle(ws.getCell("B2"));
  ws.getCell("B2").value = "Recruiting Pipeline";
  ws.getRow(2).height = 30;

  hdr(ws, 4, 4);
  ws.getCell("B4").value = "Source";
  ws.getCell("C4").value = "# Prospective Students";
  ws.getCell("D4").value = "Notes";

  const rows = data.chesterton?.recruitingPipeline ?? [];
  let r = 5;
  const start = r;
  for (const row of rows) {
    ws.getCell(`B${r}`).value = row.source;
    const cnt = ws.getCell(`C${r}`);
    cnt.value = row.prospectiveStudents ?? 0;
    cnt.numFmt = NUM;
    inputCell(cnt);
    ws.getCell(`D${r}`).value = row.notes || "";
    r += 1;
  }
  ws.getCell(`B${r}`).value = "Total";
  ws.getCell(`B${r}`).font = { bold: true };
  if (rows.length > 0) {
    setFormula(ws.getCell(`C${r}`), `=SUM(C${start}:C${r - 1})`, rows.reduce((s, x) => s + (x.prospectiveStudents ?? 0), 0));
  }
  ws.getCell(`C${r}`).numFmt = NUM;
  ws.getCell(`C${r}`).font = { bold: true };

  // ── Verbatim sections from "7 - RECRUITING PIPELINE" source tab.
  // The source workbook frames recruiting as a tracking worksheet with
  // four numbered sections: enrollment goals, prospect math, shadow-day
  // math, and live results tracking. We mirror those headers + key
  // labels (PIPELINE / SHADOW / APPLY / ENROLL) verbatim.
  let v = r + 2;
  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "RECRUITING PIPELINE | TRACKING WORKSHEET";
  ws.getCell(`B${v}`).font = { bold: true, size: 14, color: { argb: WHITE } };
  ws.getCell(`B${v}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getCell(`B${v}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(v).height = 26;
  v += 2;

  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "I. ENTER ENROLLMENT GOALS";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  // Verbatim PIPELINE PROCESS column headers from source row 7.
  for (const label of [
    "PIPELINE PROCESS",
    "Goal",
    "Current Students",
  ]) {
    ws.mergeCells(`B${v}:D${v}`);
    ws.getCell(`B${v}`).value = label;
    if (label === "PIPELINE PROCESS") ws.getCell(`B${v}`).font = { bold: true };
    v += 1;
  }
  v += 1;

  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "II. CALCULATE NUMBER OF PROSPECTS NEEDED TO MEET ENROLLMENT GOALS";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  ws.getCell(`B${v}`).value = "Stage";
  ws.getCell(`C${v}`).value = "Conversion %";
  ws.getCell(`D${v}`).value = "Notes";
  hdr(ws, v, 4);
  v += 1;
  // Source rows 16-19 (col 3 = "Conversion %"); the four stages and
  // their default rates are taken verbatim from the source.
  const recuritingStages: Array<[string, number | string, string]> = [
    ["PIPELINE QUALIFIED PROSPECTS", 1.00, ""],
    ["SHADOW CONVERSION RATE", 0.40, ""],
    ["APPLY CONVERSION RATE", 0.80, ""],
    ["ENROLL CONVERSION RATE", 0.90, ""],
  ];
  for (const [stage, rate, note] of recuritingStages) {
    ws.getCell(`B${v}`).value = stage;
    ws.getCell(`B${v}`).font = { bold: true };
    const rc = ws.getCell(`C${v}`);
    rc.value = rate;
    rc.numFmt = PCT;
    ws.getCell(`D${v}`).value = note;
    ws.getCell(`D${v}`).alignment = { wrapText: true };
    v += 1;
  }
  v += 1;

  // Verbatim "Freshman Class - Assumptions" block (source rows 21-26).
  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "Freshman Class - Assumptions";
  ws.getCell(`B${v}`).font = { bold: true };
  v += 1;
  const freshAssumptions: Array<[string, string]> = [
    ["PIPELINE QUALIFIED PROSPECTS", "Qualified, known contacts + open house attendees + siblings"],
    ["SHADOW CONVERSION RATE", "Shadows begin mid-September"],
    ["APPLY CONVERSION RATE", "Encourage early applications October 1 - December 8 "],
    ["ENROLL CONVERSION RATE", "Acceptance Day - January 27 - enrollment within 2 weeks"],
    ["", "(students who apply get free Gala ticket!)"],
  ];
  for (const [stage, note] of freshAssumptions) {
    ws.getCell(`B${v}`).value = stage;
    if (stage) ws.getCell(`B${v}`).font = { bold: true };
    ws.mergeCells(`C${v}:D${v}`);
    ws.getCell(`C${v}`).value = note;
    ws.getCell(`C${v}`).alignment = { wrapText: true };
    v += 1;
  }
  v += 1;

  // Verbatim "Prospective Student Information" headers (source row 28-31).
  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "Prospective Student Information";
  ws.getCell(`B${v}`).font = { bold: true };
  v += 1;
  ws.getCell(`B${v}`).value = "Student First / Student Last / Current Grade / Current School / Other Note";
  ws.mergeCells(`B${v}:D${v}`);
  v += 1;
  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "Enter prospective students and families into student information system / CRM";
  ws.getCell(`B${v}`).alignment = { wrapText: true };
  v += 2;

  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "III. CALCULATE NUMBER OF SHADOW DATES REQUIRED";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  ws.getCell(`B${v}`).value = "SHADOW SLOTS";
  ws.getCell(`B${v}`).font = { bold: true };
  ws.getCell(`C${v}`).value = "# Weeks";
  ws.getCell(`D${v}`).value = "ACTUAL";
  hdr(ws, v, 4);
  v += 1;
  // Verbatim month rows from source rows 36-42, including the typo on
  // "March (2 days per week; 2 per day))" (extra closing paren).
  const shadowMonths: Array<[string, number]> = [
    ["September (2 days per week; 2 per day)", 3],
    ["October (2 days per week; 2 per day)", 3],
    ["November (2 days per week; 2 per day)", 3],
    ["December (2 days per week; 2 per day)", 2],
    ["January (2 days per week; 2 per day)", 3],
    ["February (2 days per week; 2 per day)", 3],
    ["March (2 days per week; 2 per day))", 3],
  ];
  for (const [month, weeks] of shadowMonths) {
    ws.getCell(`B${v}`).value = month;
    ws.getCell(`C${v}`).value = weeks;
    ws.getCell(`C${v}`).numFmt = NUM;
    inputCell(ws.getCell(`C${v}`));
    v += 1;
  }
  v += 1;

  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "IV. TRACK RESULTS";
  ws.getCell(`B${v}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  v += 1;
  ws.getCell(`B${v}`).value = "ACTUAL RESULTS TO DATE";
  ws.getCell(`B${v}`).font = { bold: true };
  ws.getCell(`C${v}`).value = "# Students";
  ws.getCell(`D${v}`).value = "Notes";
  hdr(ws, v, 4);
  v += 1;
  // Verbatim stage labels from source rows 48-51 (with trailing spaces
  // preserved as in source: "PIPELINE (qualified prospects)", "SHADOW ",
  // "APPLY ", "ENROLL ").
  const trackStages: Array<[string]> = [
    ["PIPELINE (qualified prospects)"],
    ["SHADOW "],
    ["APPLY "],
    ["ENROLL "],
  ];
  for (const [stage] of trackStages) {
    ws.getCell(`B${v}`).value = stage;
    ws.getCell(`B${v}`).font = { bold: true };
    ws.getCell(`C${v}`).value = 0;
    ws.getCell(`C${v}`).numFmt = NUM;
    inputCell(ws.getCell(`C${v}`));
    v += 1;
  }
  v += 1;
  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "As of [Month/Date/Year]";
  ws.getCell(`B${v}`).font = { italic: true };
  v += 2;

  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = { formula: `="FINANCIAL PROJECTIONS - " & Plan_Year & " - " & RIGHT(Plan_Year+1, 2)`, result: "FINANCIAL PROJECTIONS - 2027 - 28" };
  ws.getCell(`B${v}`).font = { italic: true, color: { argb: NAVY } };
  ws.getCell(`B${v}`).alignment = { horizontal: "center" };
  v += 2;
  // Verbatim row labels from source rows 57-64 of the recruiting tab.
  for (const label of [
    "Academic Year",
    "Number of Students",
    "Operating Budget ** Projected **",
    "Tuition Revenue, Net",
    "Minimum Fundraising Need",
    "TARGET FUNDRAISING GOAL",
  ]) {
    ws.mergeCells(`B${v}:D${v}`);
    ws.getCell(`B${v}`).value = label;
    if (label === "TARGET FUNDRAISING GOAL") ws.getCell(`B${v}`).font = { bold: true };
    v += 1;
  }
  v += 1;
  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "NOTE: This template is provided for guidance only.";
  ws.getCell(`B${v}`).font = { italic: true };
  v += 1;

  ws.mergeCells(`B${v}:D${v}`);
  ws.getCell(`B${v}`).value = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network, 2008-2026. All rights reserved.";
  ws.getCell(`B${v}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`B${v}`).alignment = { horizontal: "center" };
}

// Static reference tabs (Cadence, Training, Parent Handout) mirror tabs
// 6, 8, 9 of the published manual verbatim.

// Cadence — source tab "8 - CHESTERTON CADENCE".

interface CadenceCategory {
  /** "(N) CATEGORY NAME" exactly as it appears in the source workbook. */
  label: string;
  /** Single-sentence mission, joined verbatim from the source workbook's
   *  multi-row description (e.g. "Meet enrollment goals and tuition
   *  revenue."). */
  mission: string;
  /** Quarterly headlines: [Q1 Jul–Sep, Q2 Oct–Dec, Q3 Jan–Mar, Q4 Apr–Jun]. */
  headlines: [string, string, string, string];
  /** Quarterly bullet lists; each bullet keeps the leading "- " from the
   *  source workbook so the export reads the same as the manual. */
  bullets: [string[], string[], string[], string[]];
}

const CADENCE_QUARTERS: [string, string, string, string] = [
  "FIRST QUARTER",
  "SECOND QUARTER",
  "THIRD QUARTER",
  "FOURTH QUARTER",
];

const CADENCE_QUARTER_MONTHS: [string, string, string, string] = [
  "JULY · AUGUST · SEPTEMBER",
  "OCTOBER · NOVEMBER · DECEMBER",
  "JANUARY · FEBRUARY · MARCH",
  "APRIL · MAY · JUNE",
];

const CADENCE_QUARTER_CYCLES: [string, string, string, string] = [
  "CYCLE 1",
  "CYCLE 2",
  "CYCLE 3",
  "CYCLE 4",
];

// All Cadence-tab content below — quarter banners, headlines, missions,
// and bullets — is verbatim CSN-published copy from the source workbook.
// None of these cells are derivable from a GETTING STARTED input, so they
// stay static (only the school-name and plan-year header cells on the
// Cadence/CSN Training Schedule tabs use formulas, see buildCadence).
const CADENCE_CATEGORIES: CadenceCategory[] = [
  {
    label: "(1) RECRUITING / ADMISSIONS",
    mission: "Meet enrollment goals and tuition revenue.",
    headlines: ["STILL TIME TO APPLY", "JOIN US NEXT YEAR I", "JOIN US NEXT YEAR II", "HEAD START ON HIGH SCHOOL"],
    bullets: [
      [
        "- Summer event / info session",
        "- Still Accepting Applications campaign",
      ],
      [
        "- Execute against Open House Schedule",
        "- Fall event invitation (school play, concert, shadow)",
      ],
      [
        "- Open House Schedule",
        "- Gala invitation (BOGO)",
      ],
      [
        "- Summer events targeting rising 8th graders",
        "- Still Accepting Applications campaign",
      ],
    ],
  },
  {
    label: "(2) FUNDRAISING / FRIENDRAISING",
    mission: "Meet fundraising goals ($ and #) throughout year.",
    headlines: ["BACK TO SCHOOL / CULTIVATION", "GALA MOMENTUM / END OF YEAR", "GALA", "SPRING APPEAL"],
    bullets: [
      [
        "- School by the Numbers / Thank-a-Thon",
        "- Calendar Save the Dates (Gala + Concerts + Plays)",
      ],
      [
        "- Gala invite + sponsorship",
        "- Year end card and solicitation",
      ],
      [
        "- School by the Numbers / Thank-a-Thon",
        "- Calendar Save the Dates (Gala + Concerts + Plays)",
      ],
      [
        "- State of the School email / direct mail",
        "- Spring gift / renewal",
      ],
    ],
  },
  {
    label: "(3) EVENTS / ENGAGEMENT",
    mission: "Keep your parents engaged and at the heart of your school.",
    headlines: ["BACK TO SCHOOL", "MOMENTUM BUILDS", "KEEP IT FUN", "SHOWCASE OUR STRENGTHS"],
    bullets: [
      [
        "- All School Picnic",
        "- Orientation (parents / students / freshmen)",
        "- House event (service / spiritual / social)",
        "- Mass of the Holy Spirit (September)",
      ],
      [
        "- Sophomore Play",
        "- Advent Concert",
      ],
      [
        "- Junior Play (January)",
        "- Gala (January)",
        "- March for Life (January)",
        "- House event (service / spiritual / social)",
      ],
      [
        "- Senior Play (May)",
        "- Choir Concert (May)",
        "- Commencement (May)",
        "- House event (service / spiritual / social)",
      ],
    ],
  },
  {
    label: "(4) ACADEMICS / STUDENT LIFE",
    mission: "Build a culture of life, fostering student outcomes and a joyful, high performing faculty and staff.",
    headlines: ["START OFF STRONG", "FOSTER THE CULTURE", "MAINTAIN MOMENTUM", "FINISH STRONG"],
    bullets: [
      [
        "- Summer reading",
        "- Faculty retreat",
        "- First day of school",
      ],
      [
        "- Parent / Teacher Conferences (October)",
        "- Semester I academic adherence",
        "- Classroom observations and feedback",
        "- Retreats / House activities / Extracurricular",
      ],
      [
        "- Parent / Teacher Conferences (March)",
        "- Semester II academic adherence",
        "- Contract renewals, recuriting, hiring",
        "- CSN confernce trainig",
      ],
      [
        "- Field Day and All-School Picnic",
        "- Gradebooks",
        "- Recruiting and hiring",
      ],
    ],
  },
  {
    label: "(5) SCHOOL OPERATIONS",
    mission: "Coordination of day-to-day, non-instructional activities that support an orderly, effective school enterprise.",
    headlines: ["SOLID SYSTEMS", "MAINTAIN MOMENTUM", "MAINTAIN MOMENTUM", "PLANNING AND PREP"],
    bullets: [
      [
        "- Facilities preparation",
        "- Student files and SIS",
        "- State, district requirements",
      ],
      [
        "- Parent directory",
        "- Parent-Student conferences coordination",
        "- Safety and emergency procedures",
      ],
      [
        "- Gala coordination",
        "- Rome pilgrimage support",
        "- Ongoing database maintenance",
      ],
      [
        "- Re-enrollment processes",
        "- Academic planning for next year",
        "- Summer preparatio",
      ],
    ],
  },
  {
    label: "(6) BOARD GOVERNANCE",
    mission: "Sustain the mission of the school and provide leadership, direction, and support.",
    headlines: ["PLANNING AND PREP", "TRACK PROGRESS", "INCREASE ENGAGEMENT", "PLANNING AND PREP"],
    bullets: [
      [
        "- Quarterly Board meeting (strategy focus)",
        "- Review plans for academic year",
        "- Committee meetings",
      ],
      [
        "- Quarterly Board Meeting (admissions focus)",
        "- Committee meetings; financial aid",
      ],
      [
        "- Quarterly Board Meeting (fundraising focus)",
        "- Review admissions / fundraising / effectiveness",
        "- Committee meetings",
      ],
      [
        "- Quarterly Board Meeting (budgeting, HR focus)",
      ],
    ],
  },
];

const CSN_COPYRIGHT_LONG = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network, 2008-2025. All rights reserved.";
const CSN_COPYRIGHT_SHORT = "© Copyright Society of G.K. Chesterton and the Chesterton Schools Network. All rights reserved.";

// CSN Training Support Framework — source tab "9 - CSN TRAINING".

interface TrainingSeminar {
  /** Stakeholder group label, e.g. "HEADMASTER SEMINAR". */
  title: string;
  /** Verbatim mission line from the source workbook. */
  mission: string;
  /** Bullet lists for the four quarterly seminars
   *  (July, October, January, April). */
  bullets: [string[], string[], string[], string[]];
}

const TRAINING_QUARTERLY_SEMINAR_LABELS: [string, string, string, string] = [
  "JULY SEMINAR",
  "OCTOBER SEMINAR",
  "JANUARY SEMINAR",
  "APRIL SEMINAR",
];

// (2) CSN MONTHLY OFFICE HOURS — by Stakeholder Group.
// The source workbook left this section as a banner-only summary, so the
// stakeholder groups mirror the quarterly seminar grouping and each agenda
// is explicitly marked "TBD by CSN" until CSN publishes monthly topics.
const TRAINING_OFFICE_HOURS_INTRO =
  "Monthly virtual office hours hosted by CSN for each stakeholder cohort. Specific monthly topics are published by CSN on a rolling basis — TBD by CSN.";

interface TrainingOfficeHourGroup {
  /** Stakeholder cohort label, e.g. "HEADMASTER OFFICE HOURS". */
  stakeholder: string;
  /** Cadence label, e.g. "Monthly". */
  cadence: string;
  /** Single-line bullet describing the cohort's standing call. */
  bullet: string;
}

const TRAINING_OFFICE_HOUR_GROUPS: TrainingOfficeHourGroup[] = [
  {
    stakeholder: "HEADMASTER OFFICE HOURS",
    cadence: "Monthly",
    bullet:
      "- Standing monthly call between CSN and the headmaster cohort to share leadership challenges, faculty development practices, and student formation strategies — specific monthly topics TBD by CSN",
  },
  {
    stakeholder: "MARKETING / FUNDRAISING / ADMISSIONS OFFICE HOURS",
    cadence: "Monthly",
    bullet:
      "- Standing monthly call between CSN and the marketing, fundraising, and admissions leads to share campaign tactics, gala planning, and recruiting funnel updates — specific monthly topics TBD by CSN",
  },
  {
    stakeholder: "SCHOOL OPERATIONS OFFICE HOURS",
    cadence: "Monthly",
    bullet:
      "- Standing monthly call between CSN and the operations leads to share calendar management, facilities, compliance, and database operations practice — specific monthly topics TBD by CSN",
  },
];

// (3) SCHOOL SUCCESS MANAGER — Monthly Check-Ins.
// Each CSN school is paired with a School Success Manager (SSM). The source
// workbook listed only the section banner, so the agenda is documented here
// as a recurring 1:1 with the cadence published by CSN.
const TRAINING_SUCCESS_MANAGER_INTRO =
  "Each CSN school is paired with a dedicated School Success Manager (SSM) who hosts a recurring 1:1 check-in with the headmaster. Specific monthly agenda topics are set by CSN — TBD by CSN.";

interface TrainingSuccessManagerCheckIn {
  /** Cadence label, e.g. "Monthly Standing 1:1". */
  cadence: string;
  /** Single-line bullet describing the check-in. */
  bullet: string;
}

const TRAINING_SUCCESS_MANAGER_CHECK_INS: TrainingSuccessManagerCheckIn[] = [
  {
    cadence: "Monthly Standing 1:1",
    bullet:
      "- Standing 1:1 between the School Success Manager and the headmaster covering enrollment, faculty, fundraising, and operations health — specific monthly agenda topics TBD by CSN",
  },
  {
    cadence: "Quarterly Goal Review",
    bullet:
      "- Quarterly review of progress against the school's annual objectives and CSN cadence milestones — specific quarterly agenda topics TBD by CSN",
  },
  {
    cadence: "Annual Health Check",
    bullet:
      "- End-of-year review covering enrollment, faculty retention, fundraising totals, and operations posture before next year's planning cycle — specific agenda topics TBD by CSN",
  },
];

const TRAINING_SEMINARS: TrainingSeminar[] = [
  {
    title: "HEADMASTER SEMINAR",
    mission: "School leadership, faculty oversight and development, school culture, student academic and character formation",
    bullets: [
      [
        "- Key objectives for academic year",
        "- Roles and responsibilities",
        "- Faculty fomation",
        "- Locker day / student, parent orientation",
      ],
      [
        "- Student check-ins and student support",
        "- Faculty observations",
        "- Parent-teacher conferences",
        "- Spirit Week and dances",
      ],
      [
        "- Gala preparations - all are involved",
        "- Hiring projections for coming year",
        "- Creating the calendar for the coming year",
        "- Checking in on House momentum",
      ],
      [
        "- Planning for year-end events",
        "- Selecting Prefects",
        "- Graduation prep and student awards",
        "- Summer reading / expectations",
      ],
    ],
  },
  {
    title: "MARKETING / FUNDRAISING / ADMISSIONS",
    mission: "Marketing, promotion, and core activity to support, admissions, enrollment, and fundraising",
    bullets: [
      [
        "- Key objectives for academic year",
        "- Roles and responsibilities",
        "- Integrated marketing calendar",
        "- Materials / website refesh for the year",
      ],
      [
        "- Track progress against annual objectives",
        "- Fundraising- Gala, Giving Tuesday, year-end",
        "- Open houses and shadows - best practices",
        "- Re-recruting your families",
      ],
      [
        "- Track progress against annual objectives",
        "- Student involvement for Gala success",
        "- Creative recruiting approaches",
        "- Showcasing your school",
      ],
      [
        "- Creative strategies for recruiting future families",
        "- Welcome new families to your school",
        "- Strong year-end appeals",
        "- Highlighting your gaduating seniors",
      ],
    ],
  },
  {
    title: "SCHOOL OPERATIONS SEMINAR",
    mission: "Coordination of day-to-day, non-instructional activites, including databases, financial management, facilities management",
    bullets: [
      [
        "- Key objectives for academic year",
        "- Roles and responsibilities",
        "- Academic calendar and planning",
        "- Update rosters, student info systems",
      ],
      [
        "- Track progress against annual objectives",
        "- Organizing student events - check-list",
        "- Preparing report cards",
        "- Student files checklist",
      ],
      [
        "- Track progress against annual objectives",
        "- Tracking against district, state requirements",
        "- Safety and emergency procedures",
        "- Database management",
      ],
      [
        "- Track progress against annual objectives",
        "- Graduation and other year-end events",
        "- Facilities plans for the summer",
        "- Planning your summer schedule",
      ],
    ],
  },
];

// Parent Handout — source tab "6 - PARENT HANDOUT" (Fundraising Action Plan).

interface ParentHandoutCampaign {
  code: string;        // e.g. "A - SPECIAL"
  timing: string;      // e.g. "Ongoing", "November 20xx"
  donors: string;      // e.g. "Scrip, Amazon, or other", "20 Major Gifts"
  description: string; // e.g. "designated campaign", "Describe campaign"
}

interface ParentHandoutFamilyAsk {
  /** Section label in column A, e.g. "CHESTERTON GALA". */
  label: string;
  /** Bullet list shown in column B. */
  bullets: string[];
}

const PARENT_HANDOUT_BANNER = "CHESTERTON ACADEMY FAMILIES — FUNDRAISING ACTION PLAN";
const PARENT_HANDOUT_EXAMPLE_BANNER = "EXAMPLE HANDOUT FOR PARENTS - FOR EXAMPLE ONLY";
const PARENT_HANDOUT_PLANNING_FOR = "PLANNING FOR";

const PARENT_HANDOUT_NEED_HEADING = "I. THE NEED";
// Static CSN-published copy. Bullet 4 is rewritten as a formula at
// emit time so the dollar goal and academic-year tag follow TFG and
// Plan_Year (see buildParentHandout); the rest are policy lines with
// no GETTING STARTED input to reference and stay baked in.
const PARENT_HANDOUT_NEED_BULLETS: string[] = [
  "- The actual cost to educate each student exceeds tuition revenue per student",
  "- Chesterton parents raise funds each year to cover the gap between tuition revenue and operating costs",
  "- We work to raise the projected fundraising goal by June 30 of the prior academic year",
  "- This year our goal is to raise $300,000 - the projected fundraising gap for the 2025-26 academic year",
  "- The fundraising total includes about $50,000 in cash reserves to enhance sustainability and financial health",
];
// Index of the bullet whose contents derive from Plan_Year + TFG. Kept as
// a constant so future reorderings don't silently break the formula swap.
const PARENT_HANDOUT_NEED_BULLET_DYNAMIC_IDX = 3;

const PARENT_HANDOUT_PROJECTIONS_TITLE = "2025-26 Projections - At a Glance";
const PARENT_HANDOUT_PROJECTIONS_ROWS: Array<{ label: string; placeholder: number }> = [
  { label: "Net tuition and fees", placeholder: 245700 },
  { label: "Projected operating expense", placeholder: 431102 },
  { label: "Mininum fundraising need", placeholder: 185402 },
  { label: "Cash reserves", placeholder: 37080 },
  { label: "TOTAL MINIMUM FUNDRAISING", placeholder: 222482 },
  { label: "TOTAL SET GOAL", placeholder: 426526 },
];

const PARENT_HANDOUT_GOAL_HEADING = "II. FUNDRAISING GOAL";
const PARENT_HANDOUT_GOAL_ROWS: Array<{ label: string; share?: number }> = [
  { label: "Board, school leadership will raise 50% of the goal", share: 0.5 },
  { label: "Chesterton parents will help raise the remaining 50%", share: 0.5 },
  { label: "TOTAL FUNDRAISING GOAL" },
];

const PARENT_HANDOUT_HOW_HEADING = "III. HERE'S HOW WE CAN DO IT!";

const PARENT_HANDOUT_CAMPAIGNS: ParentHandoutCampaign[] = [
  { code: "A - SPECIAL",        timing: "Ongoing",             donors: "Scrip, Amazon, or other", description: "designated campaign" },
  { code: "B - GIVING TUESDAY", timing: "November 20xx",       donors: "xx Donors",                description: "Describe campaign" },
  { code: "C - YEAR END APPEAL", timing: "December 20xx",      donors: "xx Donors",                description: "Describe campaign" },
  { code: "D - ANNUAL GALA",    timing: "Month xx, 20xx",      donors: "Various $ Sources",        description: "Describe event" },
  { code: "E - ANNUAL APPEAL",  timing: "February - June 20xx", donors: "xx Donors",               description: "Describe campaign" },
  { code: "F - MAJOR GIFTS",    timing: "Throughout Year",     donors: "20 Major Gifts",           description: "Describe campaign" },
];

const PARENT_HANDOUT_FAMILY_INTRO = "We ask each family to contribute in the following way:";

const PARENT_HANDOUT_FAMILY_ASKS: ParentHandoutFamilyAsk[] = [
  {
    label: "CHESTERTON GALA",
    bullets: [
      "- Fill a table of 10 @ $125 per seat (you may purchase a table or invite guests who purchase their own tickets)",
      "- Help us identify and approach prospective sponsors for our ThinkLocal Gala sponsorship campaign",
      "- Help us in other important ways: find sponsors, advertisers, gift-in-kind donations (wine, printing, decorations)",
    ],
  },
  {
    label: "YEAR-END AND ANNUAL APPEALS",
    bullets: [
      "- Participate in thank-a-thons and phone solicitations",
      "- Identify prospects and contact them to help meet our year end and annual appeal goals",
    ],
  },
];

function buildCadence(wb: ExcelJS.Workbook, data: ChestertonModelInput) {
  const ws = wb.addWorksheet(TAB_CADENCE, {
    properties: { tabColor: { argb: CREAM } },
    views: [{ showGridLines: false, state: "frozen", ySplit: 7 }],
  });
  // Column layout: A = category label, B-E = the four academic-year quarters.
  ws.getColumn(1).width = 38;
  for (let c = 2; c <= 5; c++) ws.getColumn(c).width = 38;

  ws.mergeCells("A2:E2");
  applyTitleStyle(ws.getCell("A2"));
  ws.getCell("A2").value = "The Chesterton Cadence";
  ws.getRow(2).height = 30;

  ws.mergeCells("A3:E3");
  applySubtitleStyle(ws.getCell("A3"));
  ws.getCell("A3").value = {
    formula: `=School_Name`,
    result: data.schoolName || "Your Chesterton Academy",
  };

  // Quarter banner rows ─ FIRST/SECOND/THIRD/FOURTH QUARTER, then the
  // months that make up each quarter, then the cycle label.
  ws.getCell("A5").value = "Academic Year";
  ws.getCell("A5").font = { bold: true };
  for (let i = 0; i < 4; i++) ws.getCell(5, 2 + i).value = CADENCE_QUARTERS[i];
  hdr(ws, 5, 5);

  ws.getCell("A6").value = {
    formula: `=Plan_Year`,
    result: data.chesterton?.planningYear || new Date().getFullYear() + 1,
  };
  ws.getCell("A6").font = { bold: true };
  for (let i = 0; i < 4; i++) {
    const c = ws.getCell(6, 2 + i);
    c.value = CADENCE_QUARTER_MONTHS[i];
    c.alignment = { horizontal: "center" };
    c.font = { italic: true };
  }

  ws.getCell("A7").value = "";
  for (let i = 0; i < 4; i++) {
    const c = ws.getCell(7, 2 + i);
    c.value = CADENCE_QUARTER_CYCLES[i];
    c.alignment = { horizontal: "center" };
    c.font = { bold: true, color: { argb: NAVY } };
  }

  // Summary grid ─ one row per category × four quarter columns.
  let r = 9;
  for (const cat of CADENCE_CATEGORIES) {
    ws.getCell(`A${r}`).value = cat.label;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } };
    ws.getCell(`A${r}`).alignment = { vertical: "middle", wrapText: true };
    for (let i = 0; i < 4; i++) {
      const c = ws.getCell(r, 2 + i);
      c.value = cat.headlines[i];
      c.font = { bold: true };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    ws.getRow(r).height = 24;
    r += 1;
  }

  // DETAIL section header
  r += 1;
  ws.mergeCells(`A${r}:E${r}`);
  sec(ws, r, 5);
  ws.getCell(`A${r}`).value = "DETAIL";
  r += 1;

  // Detail blocks ─ for each category, repeat the headline row, then a
  // mission line in column A and the bullet list per quarter in B-E.
  for (const cat of CADENCE_CATEGORIES) {
    // Quarter headline row (same as summary grid).
    ws.getCell(`A${r}`).value = cat.label;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } };
    ws.getCell(`A${r}`).alignment = { vertical: "middle", wrapText: true };
    for (let i = 0; i < 4; i++) {
      const c = ws.getCell(r, 2 + i);
      c.value = cat.headlines[i];
      c.font = { bold: true };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    ws.getRow(r).height = 22;
    r += 1;

    // Mission + per-quarter bullets row.
    ws.getCell(`A${r}`).value = cat.mission;
    ws.getCell(`A${r}`).font = { italic: true };
    ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };
    let maxBullets = 1;
    for (let i = 0; i < 4; i++) {
      const c = ws.getCell(r, 2 + i);
      const bullets = cat.bullets[i];
      c.value = bullets.join("\n");
      c.alignment = { wrapText: true, vertical: "top" };
      if (bullets.length > maxBullets) maxBullets = bullets.length;
    }
    ws.getRow(r).height = Math.max(38, 16 * maxBullets);
    r += 1;
  }

  // Copyright line.
  r += 1;
  ws.mergeCells(`A${r}:E${r}`);
  ws.getCell(`A${r}`).value = CSN_COPYRIGHT_LONG;
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
}

function buildTrainingSchedule(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet(TAB_TRAINING, {
    properties: { tabColor: { argb: CREAM } },
    views: [{ showGridLines: false, state: "frozen", ySplit: 7 }],
  });
  // Same A + B-E layout as Cadence so the two tabs read together.
  ws.getColumn(1).width = 38;
  for (let c = 2; c <= 5; c++) ws.getColumn(c).width = 38;

  ws.mergeCells("A2:E2");
  applyTitleStyle(ws.getCell("A2"));
  ws.getCell("A2").value = "The Chesterton Schools Network — Training Support Framework";
  ws.getRow(2).height = 30;

  ws.mergeCells("A3:E3");
  applySubtitleStyle(ws.getCell("A3"));
  ws.getCell("A3").value = "Quarterly seminars, monthly office hours, and School Success Manager check-ins for every CSN school.";

  // Cadence reference grid (identical to Cadence summary table).
  ws.getCell("A5").value = "CHESTERTON CADENCE";
  ws.getCell("A5").font = { bold: true };
  for (let i = 0; i < 4; i++) ws.getCell(5, 2 + i).value = CADENCE_QUARTERS[i];
  hdr(ws, 5, 5);

  ws.getCell("A6").value = "CHESTERTON CADENCE";
  ws.getCell("A6").font = { bold: true };
  for (let i = 0; i < 4; i++) {
    const c = ws.getCell(6, 2 + i);
    c.value = CADENCE_QUARTER_MONTHS[i];
    c.alignment = { horizontal: "center" };
    c.font = { italic: true };
  }

  ws.getCell("A7").value = "CHESTERTON CADENCE";
  ws.getCell("A7").font = { bold: true };
  for (let i = 0; i < 4; i++) {
    const c = ws.getCell(7, 2 + i);
    c.value = CADENCE_QUARTER_CYCLES[i];
    c.alignment = { horizontal: "center" };
    c.font = { bold: true, color: { argb: NAVY } };
  }

  let r = 9;
  for (const cat of CADENCE_CATEGORIES) {
    ws.getCell(`A${r}`).value = cat.label;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } };
    ws.getCell(`A${r}`).alignment = { vertical: "middle", wrapText: true };
    for (let i = 0; i < 4; i++) {
      const c = ws.getCell(r, 2 + i);
      c.value = cat.headlines[i];
      c.font = { bold: true };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    ws.getRow(r).height = 22;
    r += 1;
  }

  // (1) CSN QUARTERLY TRAINING section header
  r += 1;
  ws.mergeCells(`A${r}:E${r}`);
  sec(ws, r, 5);
  ws.getCell(`A${r}`).value = "(1) CSN QUARTERLY TRAINING — Topics by Stakeholder Group";
  r += 1;

  // Quarterly seminar header row (JULY/OCTOBER/JANUARY/APRIL SEMINAR).
  ws.getCell(`A${r}`).value = "";
  for (let i = 0; i < 4; i++) {
    const c = ws.getCell(r, 2 + i);
    c.value = TRAINING_QUARTERLY_SEMINAR_LABELS[i];
    c.font = { bold: true };
    c.alignment = { horizontal: "center" };
  }
  hdr(ws, r, 5);
  r += 1;

  // Each seminar: title row + mission/bullets row.
  for (const sem of TRAINING_SEMINARS) {
    ws.getCell(`A${r}`).value = sem.title;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } };
    ws.getCell(`A${r}`).alignment = { vertical: "middle", wrapText: true };
    for (let i = 0; i < 4; i++) {
      const c = ws.getCell(r, 2 + i);
      c.value = "OVERVIEW";
      c.font = { bold: true };
      c.alignment = { horizontal: "center" };
    }
    r += 1;

    ws.getCell(`A${r}`).value = sem.mission;
    ws.getCell(`A${r}`).font = { italic: true };
    ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };
    let maxBullets = 1;
    for (let i = 0; i < 4; i++) {
      const c = ws.getCell(r, 2 + i);
      const bullets = sem.bullets[i];
      c.value = bullets.join("\n");
      c.alignment = { wrapText: true, vertical: "top" };
      if (bullets.length > maxBullets) maxBullets = bullets.length;
    }
    ws.getRow(r).height = Math.max(48, 16 * maxBullets);
    r += 1;
  }

  // (2) CSN MONTHLY OFFICE HOURS section header.
  r += 1;
  ws.mergeCells(`A${r}:E${r}`);
  sec(ws, r, 5);
  ws.getCell(`A${r}`).value = "(2) CSN MONTHLY OFFICE HOURS — by Stakeholder Group";
  r += 1;
  ws.getCell(`A${r}`).value = "MONTHLY OFFICE HOURS / MEET-UPS";
  ws.getCell(`A${r}`).font = { italic: true, color: { argb: NAVY } };
  ws.mergeCells(`A${r}:E${r}`);
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
  r += 1;

  // Intro line explaining the office-hours cadence.
  ws.getCell(`A${r}`).value = TRAINING_OFFICE_HOURS_INTRO;
  ws.getCell(`A${r}`).font = { italic: true };
  ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(`A${r}:E${r}`);
  ws.getRow(r).height = 30;
  r += 1;

  // Stakeholder-group header row: STAKEHOLDER GROUP | CADENCE | TOPICS.
  ws.getCell(`A${r}`).value = "STAKEHOLDER GROUP";
  ws.getCell(`B${r}`).value = "CADENCE";
  ws.getCell(`C${r}`).value = "TOPICS";
  ws.mergeCells(`C${r}:E${r}`);
  hdr(ws, r, 5);
  r += 1;

  // One row per stakeholder cohort.
  for (const group of TRAINING_OFFICE_HOUR_GROUPS) {
    ws.getCell(`A${r}`).value = group.stakeholder;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } };
    ws.getCell(`A${r}`).alignment = { vertical: "top", wrapText: true };
    ws.getCell(`B${r}`).value = group.cadence;
    ws.getCell(`B${r}`).alignment = { vertical: "top", horizontal: "center" };
    const bulletCell = ws.getCell(`C${r}`);
    bulletCell.value = group.bullet;
    bulletCell.alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(`C${r}:E${r}`);
    ws.getRow(r).height = 48;
    r += 1;
  }

  // (3) SCHOOL SUCCESS MANAGER section header.
  r += 1;
  ws.mergeCells(`A${r}:E${r}`);
  sec(ws, r, 5);
  ws.getCell(`A${r}`).value = "(3) SCHOOL SUCCESS MANAGER — Monthly Check-Ins";
  r += 1;
  ws.getCell(`A${r}`).value = "SCHOOL SUCCESS MANAGER CHECK-IN";
  ws.getCell(`A${r}`).font = { italic: true, color: { argb: NAVY } };
  ws.mergeCells(`A${r}:E${r}`);
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
  r += 1;

  // Intro line describing the SSM partnership.
  ws.getCell(`A${r}`).value = TRAINING_SUCCESS_MANAGER_INTRO;
  ws.getCell(`A${r}`).font = { italic: true };
  ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(`A${r}:E${r}`);
  ws.getRow(r).height = 30;
  r += 1;

  // Cadence header row: CADENCE | AGENDA.
  ws.getCell(`A${r}`).value = "CADENCE";
  ws.getCell(`B${r}`).value = "AGENDA";
  ws.mergeCells(`B${r}:E${r}`);
  hdr(ws, r, 5);
  r += 1;

  // One row per check-in cadence.
  for (const checkIn of TRAINING_SUCCESS_MANAGER_CHECK_INS) {
    ws.getCell(`A${r}`).value = checkIn.cadence;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } };
    ws.getCell(`A${r}`).alignment = { vertical: "top", wrapText: true };
    const bulletCell = ws.getCell(`B${r}`);
    bulletCell.value = checkIn.bullet;
    bulletCell.alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(`B${r}:E${r}`);
    ws.getRow(r).height = 48;
    r += 1;
  }

  // Copyright line.
  r += 1;
  ws.mergeCells(`A${r}:E${r}`);
  ws.getCell(`A${r}`).value = CSN_COPYRIGHT_SHORT;
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
}

function buildParentHandout(wb: ExcelJS.Workbook, data: ChestertonModelInput, tfgValue: number) {
  const ws = wb.addWorksheet(TAB_PARENT_HANDOUT, {
    properties: { tabColor: { argb: CREAM } },
    views: [{ showGridLines: false }],
  });
  // Six-column layout (A-F) matches the source workbook's campaign grid.
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 22;
  ws.getColumn(5).width = 22;
  ws.getColumn(6).width = 22;

  // Title: school name in A2 (pulled from the GETTING STARTED named range)
  // with the example/planning labels matching the source workbook exactly.
  ws.mergeCells("A2:E2");
  applyTitleStyle(ws.getCell("A2"));
  ws.getCell("A2").value = {
    formula: `=School_Name`,
    result: data.schoolName || "Your Chesterton Academy",
  };
  ws.getRow(2).height = 30;
  ws.getCell("F2").value = {
    formula: `=Plan_Year`,
    result: data.chesterton?.planningYear || new Date().getFullYear() + 1,
  };
  ws.getCell("F2").alignment = { horizontal: "right", vertical: "middle" };
  ws.getCell("F2").font = { bold: true, color: { argb: NAVY } };

  ws.mergeCells("A3:E3");
  applySubtitleStyle(ws.getCell("A3"));
  ws.getCell("A3").value = PARENT_HANDOUT_EXAMPLE_BANNER;
  ws.getCell("F3").value = PARENT_HANDOUT_PLANNING_FOR;
  ws.getCell("F3").alignment = { horizontal: "right" };
  ws.getCell("F3").font = { italic: true, color: { argb: NAVY } };

  // Banner row.
  ws.mergeCells("A5:F5");
  ws.getCell("A5").value = PARENT_HANDOUT_BANNER;
  ws.getCell("A5").font = { bold: true, size: 14, color: { argb: WHITE } };
  ws.getCell("A5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getCell("A5").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(5).height = 26;

  // I. THE NEED — left column bullets, right two columns "At a Glance".
  ws.mergeCells("A7:D7");
  ws.getCell("A7").value = PARENT_HANDOUT_NEED_HEADING;
  ws.getCell("A7").font = { bold: true, size: 12, color: { argb: NAVY } };

  ws.mergeCells("E7:F7");
  // "<Plan_Year>-<YY> Projections - At a Glance" recomputes from
  // Plan_Year so editing the planning year on GETTING STARTED reflows
  // the section title automatically.
  {
    const planYear = data.chesterton?.planningYear ?? new Date().getFullYear() + 1;
    setFormula(
      ws.getCell("E7"),
      `=Plan_Year&"-"&RIGHT(Plan_Year+1,2)&" Projections - At a Glance"`,
      `${planYear}-${String((planYear + 1) % 100).padStart(2, "0")} Projections - At a Glance`,
    );
  }
  ws.getCell("E7").font = { bold: true, color: { argb: NAVY } };
  ws.getCell("E7").alignment = { horizontal: "center" };

  for (let i = 0; i < PARENT_HANDOUT_NEED_BULLETS.length; i++) {
    const r = 8 + i;
    ws.mergeCells(`A${r}:D${r}`);
    if (i === PARENT_HANDOUT_NEED_BULLET_DYNAMIC_IDX) {
      // Dollar goal + academic-year tag follow TFG and Plan_Year so
      // editing inputs on GETTING STARTED rewrites this bullet live.
      const planYear = data.chesterton?.planningYear ?? new Date().getFullYear() + 1;
      setFormula(
        ws.getCell(`A${r}`),
        `="- This year our goal is to raise $"&TEXT(TFG,"#,##0")&" - the projected fundraising gap for the "&Plan_Year&"-"&RIGHT(Plan_Year+1,2)&" academic year"`,
        `- This year our goal is to raise $${tfgValue.toLocaleString()} - the projected fundraising gap for the ${planYear}-${String((planYear + 1) % 100).padStart(2, "0")} academic year`,
      );
    } else {
      ws.getCell(`A${r}`).value = PARENT_HANDOUT_NEED_BULLETS[i];
    }
    ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = 22;
    if (i < PARENT_HANDOUT_PROJECTIONS_ROWS.length) {
      const proj = PARENT_HANDOUT_PROJECTIONS_ROWS[i];
      ws.getCell(`E${r}`).value = proj.label;
      ws.getCell(`E${r}`).alignment = { wrapText: true, vertical: "middle" };
      ws.getCell(`F${r}`).value = proj.placeholder;
      ws.getCell(`F${r}`).numFmt = CUR;
      ws.getCell(`F${r}`).alignment = { horizontal: "right", vertical: "middle" };
      if (proj.label.startsWith("TOTAL")) {
        ws.getCell(`E${r}`).font = { bold: true };
        ws.getCell(`F${r}`).font = { bold: true };
      }
    }
  }
  // Final TOTAL SET GOAL row sits one below the bullets.
  {
    const r = 8 + PARENT_HANDOUT_NEED_BULLETS.length;
    const proj = PARENT_HANDOUT_PROJECTIONS_ROWS[PARENT_HANDOUT_NEED_BULLETS.length];
    if (proj) {
      ws.getCell(`E${r}`).value = proj.label;
      ws.getCell(`E${r}`).font = { bold: true };
      ws.getCell(`E${r}`).alignment = { vertical: "middle" };
      ws.getCell(`F${r}`).value = { formula: `=TFG`, result: tfgValue };
      ws.getCell(`F${r}`).numFmt = CUR;
      ws.getCell(`F${r}`).font = { bold: true };
      ws.getCell(`F${r}`).alignment = { horizontal: "right", vertical: "middle" };
    }
  }

  // II. FUNDRAISING GOAL — TFG split 50/50 between board and parents.
  let r = 14;
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = PARENT_HANDOUT_GOAL_HEADING;
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  r += 2; // blank row between heading and detail (matches source row 16)

  // Goal block: A=TFG amount, D=label, F=share amount
  ws.getCell(`A${r}`).value = { formula: `=TFG`, result: tfgValue };
  ws.getCell(`A${r}`).numFmt = CUR;
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  ws.getCell(`B${r}`).value = "Fundraising goal";
  ws.getCell(`B${r}`).font = { italic: true };
  ws.mergeCells(`D${r}:E${r}`);
  ws.getCell(`D${r}`).value = PARENT_HANDOUT_GOAL_ROWS[0].label;
  ws.getCell(`D${r}`).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(`F${r}`).value = { formula: `=TFG*0.5`, result: tfgValue * 0.5 };
  ws.getCell(`F${r}`).numFmt = CUR;
  ws.getCell(`F${r}`).alignment = { horizontal: "right" };
  r += 1;

  ws.mergeCells(`D${r}:E${r}`);
  ws.getCell(`D${r}`).value = PARENT_HANDOUT_GOAL_ROWS[1].label;
  ws.getCell(`D${r}`).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(`F${r}`).value = { formula: `=TFG*0.5`, result: tfgValue * 0.5 };
  ws.getCell(`F${r}`).numFmt = CUR;
  ws.getCell(`F${r}`).alignment = { horizontal: "right" };
  r += 1;

  ws.mergeCells(`D${r}:E${r}`);
  ws.getCell(`D${r}`).value = PARENT_HANDOUT_GOAL_ROWS[2].label;
  ws.getCell(`D${r}`).font = { bold: true };
  ws.getCell(`D${r}`).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(`F${r}`).value = { formula: `=TFG`, result: tfgValue };
  ws.getCell(`F${r}`).numFmt = CUR;
  ws.getCell(`F${r}`).font = { bold: true };
  ws.getCell(`F${r}`).alignment = { horizontal: "right" };
  r += 2;

  // III. HERE'S HOW WE CAN DO IT! — six-column campaign grid.
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = PARENT_HANDOUT_HOW_HEADING;
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  r += 2;

  // Campaign grid: code row, timing row, donors row, description row.
  for (let i = 0; i < PARENT_HANDOUT_CAMPAIGNS.length; i++) {
    const c = ws.getCell(r, 1 + i);
    c.value = PARENT_HANDOUT_CAMPAIGNS[i].code;
    c.font = { bold: true, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  ws.getRow(r).height = 24;
  r += 1;
  for (let i = 0; i < PARENT_HANDOUT_CAMPAIGNS.length; i++) {
    const c = ws.getCell(r, 1 + i);
    c.value = PARENT_HANDOUT_CAMPAIGNS[i].timing;
    c.alignment = { horizontal: "center", wrapText: true };
    c.font = { italic: true };
  }
  r += 1;
  for (let i = 0; i < PARENT_HANDOUT_CAMPAIGNS.length; i++) {
    const c = ws.getCell(r, 1 + i);
    c.value = PARENT_HANDOUT_CAMPAIGNS[i].donors;
    c.alignment = { horizontal: "center", wrapText: true };
  }
  r += 1;
  for (let i = 0; i < PARENT_HANDOUT_CAMPAIGNS.length; i++) {
    const c = ws.getCell(r, 1 + i);
    c.value = PARENT_HANDOUT_CAMPAIGNS[i].description;
    c.alignment = { horizontal: "center", wrapText: true };
  }
  r += 2;

  // Family-ask intro line.
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = PARENT_HANDOUT_FAMILY_INTRO;
  ws.getCell(`A${r}`).font = { bold: true, italic: true, color: { argb: NAVY } };
  r += 2;

  for (const ask of PARENT_HANDOUT_FAMILY_ASKS) {
    ws.getCell(`A${r}`).value = ask.label;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: NAVY } };
    ws.getCell(`A${r}`).alignment = { vertical: "top", wrapText: true };
    ws.mergeCells(`B${r}:F${r}`);
    ws.getCell(`B${r}`).value = ask.bullets.join("\n");
    ws.getCell(`B${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(r).height = Math.max(48, 18 * ask.bullets.length);
    r += 1;
  }

  // Copyright line.
  r += 1;
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = CSN_COPYRIGHT_LONG;
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
}

export async function generateChestertonOperatingManual(
  data: ChestertonModelInput,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();

  const fundraisingRowCount = (data.chesterton?.fundraisingGoals ?? []).length;
  // Resolve TFG once so cached `=TFG` placeholders match the value an
  // Excel-engine recalc would produce from the GETTING STARTED named range.
  const tfgValue = fundraisingRowCount > 0
    ? (data.chesterton?.fundraisingGoals ?? []).reduce((s, x) => s + (x.goalAmount ?? 0), 0)
    : (data.chesterton?.totalFundraisingGoal ?? 0);
  const refs = buildGettingStarted(wb, data, fundraisingRowCount);
  buildProjections(wb, data, refs);
  buildSalarySchedule(wb, data);
  buildKeyAssumptions(wb, data);
  buildFundraisingGoals(wb, data);
  buildGiftChart(wb, data);
  buildGiftChartAutomatic(wb, data);
  buildRecruitingPipeline(wb, data);
  buildCadence(wb, data);
  buildTrainingSchedule(wb);
  buildParentHandout(wb, data, tfgValue);

  return wb;
}
