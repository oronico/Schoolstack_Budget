// Chesterton Schools Network (CSN) Operating Manual export.
// Tabs mirror `3_Operating_Manual_2026_FV.xlsx`. Cross-sheet formulas use
// named ranges defined on GETTING STARTED so editing inputs cascades.

import ExcelJS from "exceljs";
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
} from "../workbook-helpers.js";

const TAB_GETTING_STARTED = "GETTING STARTED";
const TAB_PROJECTIONS = "1 - 5 YR FINANCIAL PROJECTIONS";
const TAB_SALARY = "2 - SALARY SCHEDULE";
const TAB_ASSUMPTIONS = "3 - KEY ASSUMPTIONS";
const TAB_FUNDRAISING = "4 - FUNDRAISING GOALS";
const TAB_GIFT_CHART = "5 - GIFT CHART";
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

  // Net revenue total
  ws.getCell(`A${row}`).value = "Net Tuition + Fees";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(row, col);
    setFormula(
      c,
      `=${cellName(grossRow, col)}+${cellName(aidRow, col)}+${cellName(bookRow, col)}`,
      0,
    );
    c.numFmt = CUR;
    c.font = { bold: true };
  }
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
      setFormula(
        c,
        `=AvgSalaryperPeriod*$I${row}*MAX(1,CEILING(${cellName(totalEnrollmentRow, col)}/25,1))`,
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
      setFormula(c, `=SUM(${cellName(facultyStart, col)}:${cellName(facultyEnd, col)})`, 0);
    } else {
      c.value = 0;
    }
    c.numFmt = CUR;
    c.font = { bold: true };
  }
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
  const startingSalary = data.chesterton?.startingTeacherSalary ?? 44000;
  for (let yearOffset = 0; yearOffset < 25; yearOffset++) {
    const r = 5 + yearOffset;
    ws.getCell(r, 1).value = yearOffset + 1;
    // Bachelors FT (col B)
    const bachFt = ws.getCell(r, 2);
    if (yearOffset === 0) {
      // Year-1 Bachelors FT = AvgSalaryperPeriod × 5 periods/FTE.
      setFormula(bachFt, `=AvgSalaryperPeriod*5`, startingSalary);
    } else {
      const prev = startingSalary * Math.pow(1.0275, yearOffset);
      setFormula(bachFt, `=ROUND(${cellName(r - 1, 2)}*(1+$B$2),0)`, Math.round(prev));
    }
    bachFt.numFmt = CUR;

    // Masters FT (col C) = +$2000 over Bachelors at year 1, then compound
    if (yearOffset === 0) {
      setFormula(ws.getCell(r, 3), `=B${r}+2000`, startingSalary + 2000);
    } else {
      const prev = (startingSalary + 2000) * Math.pow(1.0275, yearOffset);
      setFormula(ws.getCell(r, 3), `=ROUND(${cellName(r - 1, 3)}*(1+$B$2),0)`, Math.round(prev));
    }
    ws.getCell(r, 3).numFmt = CUR;

    // Doctorate FT (col D) = +$2000 over Masters at year 1, then compound
    if (yearOffset === 0) {
      setFormula(ws.getCell(r, 4), `=C${r}+2000`, startingSalary + 4000);
    } else {
      const prev = (startingSalary + 4000) * Math.pow(1.0275, yearOffset);
      setFormula(ws.getCell(r, 4), `=ROUND(${cellName(r - 1, 4)}*(1+$B$2),0)`, Math.round(prev));
    }
    ws.getCell(r, 4).numFmt = CUR;

    // Quarter / Half / Three-quarter time blocks (cols F-H, J-L, N-P)
    const fteFractions: Array<{ block: number; mult: number }> = [
      { block: 6, mult: 0.25 },
      { block: 10, mult: 0.5 },
      { block: 14, mult: 0.75 },
    ];
    for (const { block, mult } of fteFractions) {
      for (let degIdx = 0; degIdx < 3; degIdx++) {
        const sourceCol = 2 + degIdx; // B/C/D
        const targetCol = block + degIdx;
        const c = ws.getCell(r, targetCol);
        const sourceLetter = String.fromCharCode(64 + sourceCol);
        const baseVal = (startingSalary + degIdx * 2000) * Math.pow(1.0275, yearOffset);
        setFormula(c, `=ROUND(${sourceLetter}${r}*${mult},0)`, Math.round(baseVal * mult));
        c.numFmt = CUR;
      }
    }
  }
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
  ws.getCell(`E${r}`).value = { formula: `=TFG`, result: data.chesterton?.totalFundraisingGoal ?? 0 };
  ws.getCell(`E${r}`).numFmt = CUR;
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
const PARENT_HANDOUT_NEED_BULLETS: string[] = [
  "- The actual cost to educate each student exceeds tuition revenue per student",
  "- Chesterton parents raise funds each year to cover the gap between tuition revenue and operating costs",
  "- We work to raise the projected fundraising goal by June 30 of the prior academic year",
  "- This year our goal is to raise $300,000 - the projected fundraising gap for the 2025-26 academic year",
  "- The fundraising total includes about $50,000 in cash reserves to enhance sustainability and financial health",
];

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

function buildCadence(wb: ExcelJS.Workbook) {
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
  ws.getCell("A3").value = { formula: `=School_Name`, result: "Your Chesterton Academy" };

  // Quarter banner rows ─ FIRST/SECOND/THIRD/FOURTH QUARTER, then the
  // months that make up each quarter, then the cycle label.
  ws.getCell("A5").value = "Academic Year";
  ws.getCell("A5").font = { bold: true };
  for (let i = 0; i < 4; i++) ws.getCell(5, 2 + i).value = CADENCE_QUARTERS[i];
  hdr(ws, 5, 5);

  ws.getCell("A6").value = { formula: `=Plan_Year`, result: 2027 };
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

  // Copyright line.
  r += 1;
  ws.mergeCells(`A${r}:E${r}`);
  ws.getCell(`A${r}`).value = CSN_COPYRIGHT_SHORT;
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: NAVY } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
}

function buildParentHandout(wb: ExcelJS.Workbook) {
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
  ws.getCell("A2").value = { formula: `=School_Name`, result: "Your Chesterton Academy" };
  ws.getRow(2).height = 30;
  ws.getCell("F2").value = { formula: `=Plan_Year`, result: 2027 };
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
  ws.getCell("E7").value = PARENT_HANDOUT_PROJECTIONS_TITLE;
  ws.getCell("E7").font = { bold: true, color: { argb: NAVY } };
  ws.getCell("E7").alignment = { horizontal: "center" };

  for (let i = 0; i < PARENT_HANDOUT_NEED_BULLETS.length; i++) {
    const r = 8 + i;
    ws.mergeCells(`A${r}:D${r}`);
    ws.getCell(`A${r}`).value = PARENT_HANDOUT_NEED_BULLETS[i];
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
      ws.getCell(`F${r}`).value = { formula: `=TFG`, result: proj.placeholder };
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
  ws.getCell(`A${r}`).value = { formula: `=TFG`, result: 0 };
  ws.getCell(`A${r}`).numFmt = CUR;
  ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  ws.getCell(`B${r}`).value = "Fundraising goal";
  ws.getCell(`B${r}`).font = { italic: true };
  ws.mergeCells(`D${r}:E${r}`);
  ws.getCell(`D${r}`).value = PARENT_HANDOUT_GOAL_ROWS[0].label;
  ws.getCell(`D${r}`).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(`F${r}`).value = { formula: `=TFG*0.5`, result: 0 };
  ws.getCell(`F${r}`).numFmt = CUR;
  ws.getCell(`F${r}`).alignment = { horizontal: "right" };
  r += 1;

  ws.mergeCells(`D${r}:E${r}`);
  ws.getCell(`D${r}`).value = PARENT_HANDOUT_GOAL_ROWS[1].label;
  ws.getCell(`D${r}`).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(`F${r}`).value = { formula: `=TFG*0.5`, result: 0 };
  ws.getCell(`F${r}`).numFmt = CUR;
  ws.getCell(`F${r}`).alignment = { horizontal: "right" };
  r += 1;

  ws.mergeCells(`D${r}:E${r}`);
  ws.getCell(`D${r}`).value = PARENT_HANDOUT_GOAL_ROWS[2].label;
  ws.getCell(`D${r}`).font = { bold: true };
  ws.getCell(`D${r}`).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(`F${r}`).value = { formula: `=TFG`, result: 0 };
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
  const refs = buildGettingStarted(wb, data, fundraisingRowCount);
  buildProjections(wb, data, refs);
  buildSalarySchedule(wb, data);
  buildKeyAssumptions(wb, data);
  buildFundraisingGoals(wb, data);
  buildGiftChart(wb, data);
  buildRecruitingPipeline(wb, data);
  buildCadence(wb);
  buildTrainingSchedule(wb);
  buildParentHandout(wb);

  return wb;
}
