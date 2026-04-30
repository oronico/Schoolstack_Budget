// Chesterton Schools Network (CSN) Operating Manual export.
//
// Builds an ExcelJS workbook whose tabs mirror the CSN Operating Manual
// workbook (`3_Operating_Manual_2026_FV.xlsx`) so a Chesterton founder can
// hand it to their CSN regional director, board, or lender without having
// to re-keyboard the same numbers into another file. Sheet names match the
// source workbook exactly (including the leading numeric prefix) so existing
// CSN review checklists keep pointing to the same place.
//
// Cross-sheet formulas use named ranges defined on the GETTING STARTED tab
// so opening the workbook in Excel and editing e.g. Plan_Year cascades
// through every dependent sheet.

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

export const CHESTERTON_TAB_NAMES = [
  TAB_GETTING_STARTED,
  TAB_PROJECTIONS,
  TAB_SALARY,
  TAB_ASSUMPTIONS,
  TAB_FUNDRAISING,
  TAB_GIFT_CHART,
  TAB_RECRUITING,
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

  const tuitionRows: Array<[string, unknown, string]> = [
    ["Starting Tuition (Year 1)", data.chesterton?.startingTuition ?? 8500, CUR],
    ["Annual Tuition Growth Rate", data.chesterton?.tuitionGrowthRate ?? 0.04, PCT],
    ["Book / Supply Fee", data.chesterton?.bookSupplyFee ?? 600, CUR],
    ["Financial Aid (% of Gross Tuition)", data.chesterton?.financialAidPct ?? 0.10, PCT],
    ["Year-over-Year Attrition", data.chesterton?.attritionRate ?? 0.10, PCT],
  ];
  let r = 9;
  for (const [label, value, fmt] of tuitionRows) {
    ws.getCell(`B${r}`).value = label;
    const c = ws.getCell(`C${r}`);
    c.value = value as number;
    c.numFmt = fmt;
    inputCell(c);
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
  r += 1;

  ws.getCell(`B${r}`).value = "Avg Salary per Period (5 periods = 1 FTE)";
  const avgSalaryCell = ws.getCell(`C${r}`);
  // Periods per FTE is fixed at 5 in the CSN manual.
  setFormula(avgSalaryCell, `=C${startingSalaryRow}/5`, (data.chesterton?.startingTeacherSalary ?? 44000) / 5);
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
  r += 2;

  // ── Total Fundraising Goal ──
  ws.getCell(`B${r}`).value = "Total Fundraising Goal (TFG)";
  ws.getCell(`B${r}`).font = { bold: true, size: 12, color: { argb: NAVY } };
  ws.mergeCells(`B${r}:E${r}`);
  r += 1;
  ws.getCell(`B${r}`).value = "Target raise for first freshman class";
  const tfgCell = ws.getCell(`C${r}`);
  tfgCell.value = data.chesterton?.totalFundraisingGoal ?? 0;
  tfgCell.numFmt = CUR;
  inputCell(tfgCell);
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
      setFormula(c, `='${TAB_GETTING_STARTED}'!$C$9`, v);
    } else {
      const v = Math.ceil((startingTuition * Math.pow(1 + growth, offset)) / 50) * 50;
      setFormula(
        c,
        `=CEILING('${TAB_GETTING_STARTED}'!$C$9*(1+'${TAB_GETTING_STARTED}'!$C$10)^${offset},50)`,
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
    setFormula(c, `=-${cellName(grossRow, col)}*'${TAB_GETTING_STARTED}'!$C$12`, -grossNum * aidPct);
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
    setFormula(c, `='${TAB_GETTING_STARTED}'!$C$11*${cellName(totalEnrollmentRow, col)}`, fee * enrollNum);
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
  sec(ws, row, 8);
  ws.getCell(`A${row}`).value = "III. FACULTY SALARY (PERIODS-BASED)";
  row += 1;

  ws.getCell(`A${row}`).value = "Subject";
  for (let i = 0; i < 7; i++) hdr(ws, row, 8);
  ws.getCell(`A${row}`).value = "Subject (periods/section)";
  for (let i = 0; i < 7; i++) ws.getCell(row, 2 + i).value = `Year ${i}`;
  row += 1;

  const subjects = data.chesterton?.salarySchedule ?? [];
  const facultyStart = row;
  for (const subj of subjects) {
    ws.getCell(`A${row}`).value = `${subj.subject} (${subj.periodsPerSection ?? 0})`;
    for (let i = 0; i < 7; i++) {
      const col = 2 + i;
      const c = ws.getCell(row, col);
      const enrollVal = ws.getCell(totalEnrollmentRow, col).value;
      const enrollNum = typeof enrollVal === "object" && enrollVal && "result" in enrollVal && typeof enrollVal.result === "number" ? enrollVal.result : 0;
      const periods = subj.periodsPerSection ?? 0;
      const sectionsNeeded = enrollNum > 0 ? Math.max(1, Math.ceil(enrollNum / 25)) : 0;
      const cost = (data.chesterton?.startingTeacherSalary ?? 44000) / 5 * periods * sectionsNeeded;
      setFormula(
        c,
        `=AvgSalaryperPeriod*${periods}*MAX(1,CEILING(${cellName(totalEnrollmentRow, col)}/25,1))`,
        cost,
      );
      c.numFmt = CUR;
    }
    row += 1;
  }
  const facultyEnd = row - 1;

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
      // Year-1 Bachelors FT salary = AvgSalaryperPeriod (named range
      // defined on GETTING STARTED) × 5 periods/FTE. We deliberately
      // route through the named range instead of a hard-coded cell
      // address so that re-flowing rows on GETTING STARTED never
      // breaks this formula chain.
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
  ws.getCell("B3").value = { formula: `="Total Goal: " & TEXT(TFG, "$#,##0")`, result: `Total Goal: $${(data.chesterton?.totalFundraisingGoal ?? 0).toLocaleString()}` };

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
    const avg = ws.getCell(`E${r}`);
    avg.value = row.averageGift ?? 0;
    avg.numFmt = CUR;
    inputCell(avg);
    ws.getCell(`F${r}`).value = row.notes || "";
    r += 1;
  }
  // Subtotal
  ws.getCell(`B${r}`).value = "Total";
  ws.getCell(`B${r}`).font = { bold: true };
  if (rows.length > 0) {
    setFormula(ws.getCell(`C${r}`), `=SUM(C${start}:C${r - 1})`, rows.reduce((s, x) => s + (x.goalAmount ?? 0), 0));
    setFormula(ws.getCell(`D${r}`), `=SUM(D${start}:D${r - 1})`, rows.reduce((s, x) => s + (x.numberOfGifts ?? 0), 0));
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

export async function generateChestertonOperatingManual(
  data: ChestertonModelInput,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();

  const refs = buildGettingStarted(wb, data);
  buildProjections(wb, data, refs);
  buildSalarySchedule(wb, data);
  buildKeyAssumptions(wb, data);
  buildFundraisingGoals(wb, data);
  buildGiftChart(wb, data);
  buildRecruitingPipeline(wb, data);

  return wb;
}
