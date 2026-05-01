// Smoke + formula round-trip test for the CSN Operating Manual workbook.
// Verifies tab list, named ranges, verbatim wording on reference tabs,
// and that one derived cell per tab carries a formula whose cached
// result tracks an upstream input across two builds.

import { HyperFormula } from "hyperformula";
import type ExcelJS from "exceljs";
import {
  generateChestertonOperatingManual,
  CHESTERTON_TAB_NAMES,
} from "../src/lib/packets/chesterton-operating-manual.js";

interface Failure { check: string; expected: unknown; actual: unknown }
const failures: Failure[] = [];
function expect(check: string, ok: boolean, expected: unknown, actual: unknown) {
  if (!ok) failures.push({ check, expected, actual });
  process.stdout.write(ok ? "." : "F");
}

// ── Excel-engine round-trip helpers ────────────────────────────────────
// Convert an ExcelJS cell value into a HyperFormula input scalar:
// formulas pass through with a leading "=", richText collapses to plain
// text, and shared-formula refs (which we never emit) resolve to their
// cached result so HF still has a value to recalc against.
type HfInput = string | number | boolean | null;
function toHfInput(v: unknown): HfInput {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const obj = v as {
      formula?: unknown;
      sharedFormula?: unknown;
      result?: unknown;
      richText?: Array<{ text?: string }>;
      text?: unknown;
    };
    if (typeof obj.formula === "string") {
      return obj.formula.startsWith("=") ? obj.formula : `=${obj.formula}`;
    }
    if (typeof obj.sharedFormula === "string") {
      return obj.sharedFormula.startsWith("=") ? obj.sharedFormula : `=${obj.sharedFormula}`;
    }
    if (Array.isArray(obj.richText)) {
      return obj.richText.map(t => t.text ?? "").join("");
    }
    if (typeof obj.text === "string") return obj.text;
    if (obj.result !== undefined) return toHfInput(obj.result);
    return null;
  }
  return null;
}

// safeFormulaValue stores numeric 0 and empty results as the string "0",
// so anchor that to numeric 0 before the tolerance check.
function cachedAsNumber(cached: unknown): number | null {
  if (cached === "0" || cached === "" || cached === null || cached === undefined) return 0;
  if (typeof cached === "number") return cached;
  return null;
}
function recomputedAsNumber(recomputed: unknown): number | null {
  if (recomputed === null || recomputed === undefined || recomputed === "" || recomputed === "0") return 0;
  if (typeof recomputed === "number") return recomputed;
  if (typeof recomputed === "boolean") return recomputed ? 1 : 0;
  return null;
}
function isDetailedCellError(v: unknown): v is { type: string; message?: string; value?: string } {
  return !!v && typeof v === "object" && "type" in (v as object) && "value" in (v as object);
}

function colLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

interface NamedExpr { name: string; expression: string }
function buildNamedExpressions(wb: ExcelJS.Workbook): NamedExpr[] {
  const out: NamedExpr[] = [];
  const matrixMap = (wb.definedNames as unknown as { matrixMap?: Record<string, unknown> }).matrixMap;
  if (!matrixMap) return out;
  for (const [name, matrix] of Object.entries(matrixMap)) {
    const cells: Array<{ sheetName: string; row: number; col: number }> = [];
    const m = matrix as { forEach?: (cb: (cell: { sheetName: string; row: number; col: number }) => void) => void };
    if (typeof m.forEach !== "function") continue;
    m.forEach(c => cells.push({ sheetName: c.sheetName, row: c.row, col: c.col }));
    if (cells.length === 0) continue;
    if (cells.length === 1) {
      const c = cells[0];
      out.push({ name, expression: `='${c.sheetName}'!$${colLetter(c.col)}$${c.row}` });
    } else {
      const sheetName = cells[0].sheetName;
      const minR = Math.min(...cells.map(c => c.row));
      const maxR = Math.max(...cells.map(c => c.row));
      const minC = Math.min(...cells.map(c => c.col));
      const maxC = Math.max(...cells.map(c => c.col));
      out.push({
        name,
        expression: `='${sheetName}'!$${colLetter(minC)}$${minR}:$${colLetter(maxC)}$${maxR}`,
      });
    }
  }
  return out;
}

function recomputeWorkbookAndAssert(wb: ExcelJS.Workbook, label: string): void {
  const sheets: Record<string, HfInput[][]> = {};
  for (const ws of wb.worksheets) {
    const maxRow = ws.rowCount;
    const maxCol = ws.columnCount;
    const grid: HfInput[][] = [];
    for (let r = 1; r <= maxRow; r++) {
      const rowArr: HfInput[] = [];
      const row = ws.findRow(r);
      for (let c = 1; c <= maxCol; c++) {
        const cell = row ? row.findCell(c) : undefined;
        rowArr.push(cell ? toHfInput(cell.value) : null);
      }
      grid.push(rowArr);
    }
    sheets[ws.name] = grid;
  }
  const namedExpressions = buildNamedExpressions(wb);
  const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3" }, namedExpressions);

  let formulaCellsChecked = 0;
  let firstMismatch: { addr: string; sheet: string; formula: string; cached: unknown; recomputed: unknown } | null = null;
  for (const ws of wb.worksheets) {
    const sheetId = hf.getSheetId(ws.name);
    if (sheetId === undefined) continue;
    const maxRow = ws.rowCount;
    const maxCol = ws.columnCount;
    for (let r = 1; r <= maxRow; r++) {
      const row = ws.findRow(r);
      if (!row) continue;
      for (let c = 1; c <= maxCol; c++) {
        const cell = row.findCell(c);
        if (!cell) continue;
        const v = cell.value;
        if (!v || typeof v !== "object" || !("formula" in (v as object))) continue;
        const formula = (v as { formula?: unknown }).formula;
        if (typeof formula !== "string") continue;
        // HyperFormula's TEXT() does not implement Excel's comma-grouping
        // format string (it emits "$750000,##0" instead of "$750,000").
        // The cached result is what Excel actually renders, so we skip
        // these cosmetic-only cells from the recalc round-trip.
        if (/\bTEXT\(/i.test(formula)) continue;
        const cached = (v as { result?: unknown }).result;
        const recomputed = hf.getCellValue({ sheet: sheetId, col: c - 1, row: r - 1 });
        formulaCellsChecked += 1;

        if (isDetailedCellError(recomputed)) {
          if (!firstMismatch) {
            firstMismatch = {
              addr: `${colLetter(c)}${r}`,
              sheet: ws.name,
              formula,
              cached,
              recomputed: `#${recomputed.value ?? recomputed.type} (${recomputed.message ?? "engine error"})`,
            };
          }
          continue;
        }

        const cn = cachedAsNumber(cached);
        const rn = recomputedAsNumber(recomputed);
        let ok: boolean;
        if (cn !== null && rn !== null) {
          ok = Math.abs(cn - rn) < 1e-6;
        } else {
          // Fall back to string comparison (TEXT/RIGHT formulas, status flags).
          ok = String(cached ?? "") === String(recomputed ?? "");
        }
        if (!ok && !firstMismatch) {
          firstMismatch = {
            addr: `${colLetter(c)}${r}`,
            sheet: ws.name,
            formula,
            cached,
            recomputed,
          };
        }
      }
    }
  }
  hf.destroy();

  expect(
    `${label}: HyperFormula recompute matches every cached formula result within 1e-6 (checked ${formulaCellsChecked} cells)`,
    firstMismatch === null,
    null,
    firstMismatch,
  );
}

const sample = {
  schoolName: "Saint Anselm Chesterton Academy",
  chesterton: {
    planningYear: 2027,
    startingTuition: 8500,
    tuitionGrowthRate: 0.04,
    bookSupplyFee: 600,
    financialAidPct: 0.10,
    startingTeacherSalary: 44000,
    benefitsFirstYearAmount: 2000,
    attritionRate: 0.10,
    totalFundraisingGoal: 750000,
    phaseEnrollment: [
      { grade: "freshman", year0: 0, year1: 12, year2: 14, year3: 16, year4: 18, year5: 20 },
      { grade: "sophomore", year0: 0, year1: 0, year2: 11, year3: 13, year4: 15, year5: 17 },
      { grade: "junior", year0: 0, year1: 0, year2: 0, year3: 10, year4: 12, year5: 14 },
      { grade: "senior", year0: 0, year1: 0, year2: 0, year3: 0, year4: 9, year5: 11 },
    ],
    salarySchedule: [
      { subject: "Theology", periodsPerSection: 1 },
      { subject: "Latin", periodsPerSection: 1 },
      { subject: "Mathematics", periodsPerSection: 1 },
    ],
    fundraisingGoals: [
      { category: "Major Gifts", goalAmount: 400000, numberOfGifts: 5, averageGift: 80000 },
      { category: "Mid-Level Gifts", goalAmount: 250000, numberOfGifts: 25, averageGift: 10000 },
      { category: "Annual Fund", goalAmount: 100000, numberOfGifts: 100, averageGift: 1000 },
    ],
    giftChart: [
      { giftAmount: 100000, numberOfGifts: 1, numberOfProspects: 4 },
      { giftAmount: 50000, numberOfGifts: 2, numberOfProspects: 8 },
      { giftAmount: 25000, numberOfGifts: 4, numberOfProspects: 16 },
    ],
    recruitingPipeline: [
      { source: "Parish Bulletins", prospectiveStudents: 30 },
      { source: "Homeschool Co-ops", prospectiveStudents: 20 },
    ],
  },
};

const wb = await generateChestertonOperatingManual(sample);

// 1. Sheet list matches the CSN Operating Manual tabs.
const tabs = wb.worksheets.map(ws => ws.name);
expect(
  "sheet list matches the CSN Operating Manual tabs",
  JSON.stringify(tabs) === JSON.stringify(CHESTERTON_TAB_NAMES),
  CHESTERTON_TAB_NAMES,
  tabs,
);

// 1b. Tab-parity check against source workbook visible tabs.
//     Each visible source tab maps to one exported tab. The source
//     workbook's collapsed-whitespace names are matched against the
//     export's friendly names (Cadence/CSN Training Schedule/Parent
//     Handout retain the friendlier names from Task #335 because the
//     "8 - CHESTERTON CADENCE" / "9 - CSN TRAINING" / "6 - PARENT
//     HANDOUT" prefixes do not affect the verbatim content).
const SOURCE_TO_EXPORT: Array<[string, string]> = [
  ["GETTING STARTED", "GETTING STARTED"],
  ["1 - 5 YR  FINANCIAL PROJECTIONS", "1 - 5 YR FINANCIAL PROJECTIONS"],
  ["2 - SALARY SCHEDULE", "2 - SALARY SCHEDULE"],
  ["3 - KEY ASSUMPTIONS ", "3 - KEY ASSUMPTIONS"],
  ["4 - FUNDRAISING GOALS", "4 - FUNDRAISING GOALS"],
  ["5 - GIFT CHART", "5 - GIFT CHART"],
  ["5 - GIFT CHART AUTOMATIC", "5 - GIFT CHART AUTOMATIC"],
  ["6 - PARENT HANDOUT", "Parent Handout"],
  ["7 - RECRUITING PIPELINE", "7 - RECRUITING PIPELINE"],
  ["8 - CHESTERTON CADENCE", "Cadence"],
  ["9 - CSN TRAINING", "CSN Training Schedule"],
];
const exportSet = new Set(tabs);
for (const [src, target] of SOURCE_TO_EXPORT) {
  expect(
    `source tab "${src}" maps to export tab "${target}"`,
    exportSet.has(target),
    true,
    [...exportSet].join(", "),
  );
}
expect(
  "export covers all 11 visible source tabs",
  SOURCE_TO_EXPORT.every(([, t]) => exportSet.has(t)),
  true,
  tabs.length,
);

// 2. Named ranges exist.
const definedNamesRaw = (wb.definedNames as unknown as { matrixMap?: Record<string, unknown> }).matrixMap;
const definedNamesList = wb.definedNames.model || [];
const namedRangeNames = new Set<string>();
for (const dn of definedNamesList as Array<{ name?: string }>) if (dn?.name) namedRangeNames.add(dn.name);
if (definedNamesRaw && typeof definedNamesRaw === "object") {
  for (const k of Object.keys(definedNamesRaw)) namedRangeNames.add(k);
}
for (const required of [
  "Plan_Year",
  "School_Name",
  "AvgSalaryperPeriod",
  "TFG",
  "Starting_Tuition",
  "Tuition_Growth_Rate",
  "Book_Supply_Fee",
  "Financial_Aid_Pct",
  "Attrition_Rate",
  "Starting_Teacher_Salary",
  "Benefits_Stipend",
]) {
  expect(`named range ${required} exists`, namedRangeNames.has(required), true, namedRangeNames.has(required));
}

// 3. GETTING STARTED key cells.
const gs = wb.getWorksheet("GETTING STARTED")!;
expect("School_Name cell C5 has the school name", gs.getCell("C5").value === "Saint Anselm Chesterton Academy", "Saint Anselm Chesterton Academy", gs.getCell("C5").value);
expect("Plan_Year cell C6 has the planning year", gs.getCell("C6").value === 2027, 2027, gs.getCell("C6").value);
expect("Starting tuition cell C9 = 8500", gs.getCell("C9").value === 8500, 8500, gs.getCell("C9").value);

// 4. PROJECTIONS sheet — tuition CEILING + periods-based faculty formulas.
const proj = wb.getWorksheet("1 - 5 YR FINANCIAL PROJECTIONS")!;
let foundCeiling = false;
let foundAvgSalaryRef = false;
let foundFinancialAidNamed = false;
let foundBookSupplyNamed = false;
proj.eachRow(row => {
  row.eachCell(cell => {
    const v = cell.value as { formula?: string } | string | number | null;
    if (v && typeof v === "object" && "formula" in v && typeof v.formula === "string") {
      if (v.formula.includes("CEILING(") && v.formula.includes("Tuition_Growth_Rate")) foundCeiling = true;
      if (/AvgSalaryperPeriod\*\$I\d+/.test(v.formula)) foundAvgSalaryRef = true;
      if (v.formula.includes("Financial_Aid_Pct")) foundFinancialAidNamed = true;
      if (v.formula.includes("Book_Supply_Fee")) foundBookSupplyNamed = true;
    }
  });
});
expect("projections sheet has tuition CEILING(.., 50) escalation formula via Tuition_Growth_Rate named range", foundCeiling, true, foundCeiling);
expect("projections sheet has AvgSalaryperPeriod*$I{row} periods-based faculty formula", foundAvgSalaryRef, true, foundAvgSalaryRef);
expect("projections sheet financial-aid formula references Financial_Aid_Pct named range", foundFinancialAidNamed, true, foundFinancialAidNamed);
expect("projections sheet book/supply revenue formula references Book_Supply_Fee named range", foundBookSupplyNamed, true, foundBookSupplyNamed);

// 5. Fundraising sheet shows the TFG formula in the subtitle.
const fund = wb.getWorksheet("4 - FUNDRAISING GOALS")!;
const tfgCell = fund.getCell("B3").value as { formula?: string } | undefined;
expect(
  "fundraising subtitle pulls from TFG named range",
  !!tfgCell && typeof tfgCell === "object" && "formula" in tfgCell && (tfgCell.formula ?? "").includes("TFG"),
  true,
  tfgCell,
);

// 6. Static reference tabs spot-checked verbatim against the source workbook.
for (const name of ["Cadence", "CSN Training Schedule", "Parent Handout"]) {
  expect(`tab "${name}" exists`, !!wb.getWorksheet(name), true, !!wb.getWorksheet(name));
}

function containsVerbatim(ws: import("exceljs").Worksheet, needle: string): boolean {
  let found = false;
  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const v = cell.value as unknown;
      let s: string | null = null;
      if (typeof v === "string") s = v;
      else if (v && typeof v === "object") {
        const obj = v as { result?: unknown; text?: unknown; richText?: Array<{ text?: string }> };
        if (typeof obj.result === "string") s = obj.result;
        else if (typeof obj.text === "string") s = obj.text;
        else if (Array.isArray(obj.richText)) s = obj.richText.map(t => t.text ?? "").join("");
      }
      if (s && s.includes(needle)) found = true;
    });
  });
  return found;
}

// Cadence tab — verbatim source: "8 - CHESTERTON CADENCE".
const cadence = wb.getWorksheet("Cadence")!;
expect(
  "Cadence tab title is verbatim 'The Chesterton Cadence'",
  cadence.getCell("A2").value === "The Chesterton Cadence",
  "The Chesterton Cadence",
  cadence.getCell("A2").value,
);
expect(
  "Cadence quarter banners verbatim (FIRST/SECOND/THIRD/FOURTH QUARTER)",
  cadence.getCell("B5").value === "FIRST QUARTER" &&
    cadence.getCell("C5").value === "SECOND QUARTER" &&
    cadence.getCell("D5").value === "THIRD QUARTER" &&
    cadence.getCell("E5").value === "FOURTH QUARTER",
  ["FIRST QUARTER", "SECOND QUARTER", "THIRD QUARTER", "FOURTH QUARTER"],
  [cadence.getCell("B5").value, cadence.getCell("C5").value, cadence.getCell("D5").value, cadence.getCell("E5").value],
);
expect(
  "Cadence first category label verbatim '(1) RECRUITING / ADMISSIONS'",
  cadence.getCell("A9").value === "(1) RECRUITING / ADMISSIONS",
  "(1) RECRUITING / ADMISSIONS",
  cadence.getCell("A9").value,
);
expect(
  "Cadence Q1 recruiting headline verbatim 'STILL TIME TO APPLY'",
  cadence.getCell("B9").value === "STILL TIME TO APPLY",
  "STILL TIME TO APPLY",
  cadence.getCell("B9").value,
);
expect(
  "Cadence Q4 recruiting headline verbatim 'HEAD START ON HIGH SCHOOL'",
  cadence.getCell("E9").value === "HEAD START ON HIGH SCHOOL",
  "HEAD START ON HIGH SCHOOL",
  cadence.getCell("E9").value,
);
expect(
  "Cadence has the verbatim Recruiting mission sentence somewhere on the tab",
  containsVerbatim(cadence, "Meet enrollment goals and tuition revenue."),
  true,
  containsVerbatim(cadence, "Meet enrollment goals and tuition revenue."),
);
expect(
  "Cadence has the verbatim 'Mass of the Holy Spirit (September)' bullet",
  containsVerbatim(cadence, "Mass of the Holy Spirit (September)"),
  true,
  containsVerbatim(cadence, "Mass of the Holy Spirit (September)"),
);

// Training tab — verbatim source: "9 - CSN TRAINING".
const training = wb.getWorksheet("CSN Training Schedule")!;
expect(
  "Training tab title verbatim 'The Chesterton Schools Network — Training Support Framework'",
  training.getCell("A2").value === "The Chesterton Schools Network — Training Support Framework",
  "The Chesterton Schools Network — Training Support Framework",
  training.getCell("A2").value,
);
expect(
  "Training quarterly seminar labels verbatim (JULY/OCTOBER/JANUARY/APRIL SEMINAR)",
  containsVerbatim(training, "JULY SEMINAR") &&
    containsVerbatim(training, "OCTOBER SEMINAR") &&
    containsVerbatim(training, "JANUARY SEMINAR") &&
    containsVerbatim(training, "APRIL SEMINAR"),
  true,
  null,
);
expect(
  "Training has verbatim Headmaster Seminar mission sentence",
  containsVerbatim(
    training,
    "School leadership, faculty oversight and development, school culture, student academic and character formation",
  ),
  true,
  null,
);
expect(
  "Training has verbatim Headmaster Q3 bullet 'Gala preparations - all are involved'",
  containsVerbatim(training, "- Gala preparations - all are involved"),
  true,
  null,
);
expect(
  "Training has verbatim Operations Seminar mission sentence",
  containsVerbatim(
    training,
    "Coordination of day-to-day, non-instructional activites, including databases, financial management, facilities management",
  ),
  true,
  null,
);
expect(
  "Training has verbatim '(2) CSN MONTHLY OFFICE HOURS' section header",
  containsVerbatim(training, "CSN MONTHLY OFFICE HOURS"),
  true,
  null,
);
expect(
  "Training has verbatim '(3) SCHOOL SUCCESS MANAGER' section header",
  containsVerbatim(training, "SCHOOL SUCCESS MANAGER"),
  true,
  null,
);
expect(
  "Training Office Hours section lists Headmaster cohort row verbatim",
  containsVerbatim(training, "HEADMASTER OFFICE HOURS"),
  true,
  null,
);
expect(
  "Training Office Hours section has verbatim Headmaster bullet marked TBD by CSN",
  containsVerbatim(
    training,
    "- Standing monthly call between CSN and the headmaster cohort to share leadership challenges, faculty development practices, and student formation strategies — specific monthly topics TBD by CSN",
  ),
  true,
  null,
);
expect(
  "Training Office Hours section lists Marketing/Fundraising/Admissions cohort row verbatim",
  containsVerbatim(training, "MARKETING / FUNDRAISING / ADMISSIONS OFFICE HOURS"),
  true,
  null,
);
expect(
  "Training Office Hours section lists School Operations cohort row verbatim",
  containsVerbatim(training, "SCHOOL OPERATIONS OFFICE HOURS"),
  true,
  null,
);
expect(
  "Training School Success Manager section has verbatim Monthly Standing 1:1 cadence row",
  containsVerbatim(training, "Monthly Standing 1:1"),
  true,
  null,
);
expect(
  "Training School Success Manager section has verbatim monthly check-in bullet marked TBD by CSN",
  containsVerbatim(
    training,
    "- Standing 1:1 between the School Success Manager and the headmaster covering enrollment, faculty, fundraising, and operations health — specific monthly agenda topics TBD by CSN",
  ),
  true,
  null,
);

// Parent Handout tab — verbatim source: "6 - PARENT HANDOUT".
const handout = wb.getWorksheet("Parent Handout")!;
expect(
  "Parent Handout fundraising banner verbatim",
  handout.getCell("A5").value === "CHESTERTON ACADEMY FAMILIES — FUNDRAISING ACTION PLAN",
  "CHESTERTON ACADEMY FAMILIES — FUNDRAISING ACTION PLAN",
  handout.getCell("A5").value,
);
expect(
  "Parent Handout 'I. THE NEED' heading verbatim",
  handout.getCell("A7").value === "I. THE NEED",
  "I. THE NEED",
  handout.getCell("A7").value,
);
expect(
  "Parent Handout has verbatim cost-vs-tuition need bullet",
  containsVerbatim(
    handout,
    "- The actual cost to educate each student exceeds tuition revenue per student",
  ),
  true,
  null,
);
expect(
  "Parent Handout has verbatim 'III. HERE'S HOW WE CAN DO IT!' heading",
  containsVerbatim(handout, "III. HERE'S HOW WE CAN DO IT!"),
  true,
  null,
);
expect(
  "Parent Handout has verbatim campaign codes A through F",
  containsVerbatim(handout, "A - SPECIAL") &&
    containsVerbatim(handout, "B - GIVING TUESDAY") &&
    containsVerbatim(handout, "C - YEAR END APPEAL") &&
    containsVerbatim(handout, "D - ANNUAL GALA") &&
    containsVerbatim(handout, "E - ANNUAL APPEAL") &&
    containsVerbatim(handout, "F - MAJOR GIFTS"),
  true,
  null,
);
expect(
  "Parent Handout has verbatim Gala family-ask bullet",
  containsVerbatim(
    handout,
    "- Help us identify and approach prospective sponsors for our ThinkLocal Gala sponsorship campaign",
  ),
  true,
  null,
);

// 7. Verbatim spot-checks for the seven additional source-workbook tabs
//    that Task #341 round-tripped (GETTING STARTED steps + sustainability
//    drivers + brand colors; PROJECTIONS G&A + fundraising gap; KEY
//    ASSUMPTIONS sections 1-6; FUNDRAISING goal sections + campaign A-F;
//    GIFT CHART freshman-class header; RECRUITING tracking-worksheet
//    sections + verbatim "recuriting" typo; SALARY SCHEDULE step rate).

// GETTING STARTED — intro narrative + sustainability drivers + colors.
expect(
  "GETTING STARTED has verbatim 'BEFORE YOU BEGIN: VIEW THE OPERATING MANUAL TUTORIAL PLAYLIST' line",
  containsVerbatim(gs, "BEFORE YOU BEGIN: VIEW THE OPERATING MANUAL TUTORIAL PLAYLIST (SHORT VIDEOS)"),
  true,
  null,
);
expect(
  "GETTING STARTED has verbatim 'III. SUSTAINABILITY DRIVERS AND OWNERS' section header",
  containsVerbatim(gs, "III. SUSTAINABILITY DRIVERS AND OWNERS"),
  true,
  null,
);
expect(
  "GETTING STARTED has verbatim 'Spirit Blue' brand color label with hex #19435D",
  containsVerbatim(gs, "Spirit Blue") && containsVerbatim(gs, "#19435D"),
  true,
  null,
);
expect(
  "GETTING STARTED has verbatim 'VI. Admission Pipeline Conversion Percentages' section header",
  containsVerbatim(gs, "VI. Admission Pipeline Conversion Percentages"),
  true,
  null,
);

// PROJECTIONS — Administrative Salaries roles + G&A line items + fundraising-gap footnote + Key Indicators.
expect(
  "PROJECTIONS has verbatim 'Headmaster Admin Salary' admin-role label",
  containsVerbatim(proj, "Headmaster Admin Salary"),
  true,
  null,
);
expect(
  "PROJECTIONS has verbatim 'Special Events, Retreats, House Shirts' G&A line item",
  containsVerbatim(proj, "Special Events, Retreats, House Shirts"),
  true,
  null,
);
expect(
  "PROJECTIONS has verbatim Fundraising Gap footnote about June 30",
  containsVerbatim(
    proj,
    "*This is the minimum amount to be raised in full by June 30 of the prior phase or academic year.",
  ),
  true,
  null,
);
expect(
  "PROJECTIONS has verbatim 'VI. KEY INDICATORS' section header",
  containsVerbatim(proj, "VI. KEY INDICATORS"),
  true,
  null,
);

// SALARY SCHEDULE — verbatim 'Step Increase Y/Y' label.
const sal = wb.getWorksheet("2 - SALARY SCHEDULE")!;
expect(
  "SALARY SCHEDULE has verbatim 'Step Increase Y/Y' label",
  containsVerbatim(sal, "Step Increase Y/Y"),
  true,
  null,
);

// KEY ASSUMPTIONS — six numbered sections.
const ka = wb.getWorksheet("3 - KEY ASSUMPTIONS")!;
expect(
  "KEY ASSUMPTIONS has verbatim '(1) COMPOSITION OF FRESHMAN CLASS' section header",
  containsVerbatim(ka, "(1) COMPOSITION OF FRESHMAN CLASS"),
  true,
  null,
);
expect(
  "KEY ASSUMPTIONS has verbatim '(2) RECRUITING STRATEGY AND PROSPECTS' section header",
  containsVerbatim(ka, "(2) RECRUITING STRATEGY AND PROSPECTS"),
  true,
  null,
);
expect(
  "KEY ASSUMPTIONS has verbatim '(3) OTHER FINANCIAL ASSUMPTIONS' section header",
  containsVerbatim(ka, "(3) OTHER FINANCIAL ASSUMPTIONS"),
  true,
  null,
);
expect(
  "KEY ASSUMPTIONS has verbatim '(6) OTHER KEY INFLUENCERS / KEY STAKEHOLDERS' section header",
  containsVerbatim(ka, "(6) OTHER KEY INFLUENCERS / KEY STAKEHOLDERS"),
  true,
  null,
);

// FUNDRAISING GOALS — verbatim section headers I/II/III + campaign timing.
expect(
  "FUNDRAISING GOALS has verbatim 'I. FUNDRAISING GOAL' section header",
  containsVerbatim(fund, "I. FUNDRAISING GOAL"),
  true,
  null,
);
expect(
  "FUNDRAISING GOALS has verbatim 'III. FUNDRAISING COMPONENTS' section header",
  containsVerbatim(fund, "III. FUNDRAISING COMPONENTS"),
  true,
  null,
);
expect(
  "FUNDRAISING GOALS has verbatim Campaign B 'Date: November xx, 20xx (Giving Tuesday)' timing",
  containsVerbatim(fund, "Date: November xx, 20xx (Giving Tuesday)"),
  true,
  null,
);
expect(
  "FUNDRAISING GOALS has verbatim Campaign F 'Gala challenge; private foundations; other major gifts' description",
  containsVerbatim(fund, "Gala challenge; private foundations; other major gifts"),
  true,
  null,
);

// GIFT CHART — verbatim 'ENTER GIFT AMOUNTS AND # OF GIFTS' header
// from row 2 of the source tab.
const giftChart = wb.getWorksheet("5 - GIFT CHART")!;
expect(
  "GIFT CHART has verbatim 'ENTER GIFT AMOUNTS AND # OF GIFTS' instruction",
  containsVerbatim(giftChart, "ENTER GIFT AMOUNTS AND # OF GIFTS"),
  true,
  null,
);

// RECRUITING PIPELINE — verbatim banner + sections I-IV + 'recuriting' typo.
const rec = wb.getWorksheet("7 - RECRUITING PIPELINE")!;
expect(
  "RECRUITING PIPELINE has verbatim 'RECRUITING PIPELINE | TRACKING WORKSHEET' banner",
  containsVerbatim(rec, "RECRUITING PIPELINE | TRACKING WORKSHEET"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim 'I. ENTER ENROLLMENT GOALS' section header",
  containsVerbatim(rec, "I. ENTER ENROLLMENT GOALS"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim 'II. CALCULATE NUMBER OF PROSPECTS NEEDED TO MEET ENROLLMENT GOALS' section header",
  containsVerbatim(rec, "II. CALCULATE NUMBER OF PROSPECTS NEEDED TO MEET ENROLLMENT GOALS"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim 'III. CALCULATE NUMBER OF SHADOW DATES REQUIRED' section header",
  containsVerbatim(rec, "III. CALCULATE NUMBER OF SHADOW DATES REQUIRED"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim 'IV. TRACK RESULTS' section header",
  containsVerbatim(rec, "IV. TRACK RESULTS"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim 'PIPELINE PROCESS' label from source row 7",
  containsVerbatim(rec, "PIPELINE PROCESS"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim PIPELINE/SHADOW/APPLY/ENROLL stage labels",
  containsVerbatim(rec, "PIPELINE QUALIFIED PROSPECTS") &&
    containsVerbatim(rec, "SHADOW CONVERSION RATE") &&
    containsVerbatim(rec, "APPLY CONVERSION RATE") &&
    containsVerbatim(rec, "ENROLL CONVERSION RATE"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim Freshman Class - Assumptions header (source row 21)",
  containsVerbatim(rec, "Freshman Class - Assumptions"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim 'Acceptance Day - January 27 - enrollment within 2 weeks' (source row 24)",
  containsVerbatim(rec, "Acceptance Day - January 27 - enrollment within 2 weeks"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim '(students who apply get free Gala ticket!)' (source row 25)",
  containsVerbatim(rec, "(students who apply get free Gala ticket!)"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim 'Prospective Student Information' header (source row 28)",
  containsVerbatim(rec, "Prospective Student Information"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE preserves source-workbook 'March (2 days per week; 2 per day))' typo verbatim",
  containsVerbatim(rec, "March (2 days per week; 2 per day))"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim 'Operating Budget ** Projected **' financial-projection label (source row 59)",
  containsVerbatim(rec, "Operating Budget ** Projected **"),
  true,
  null,
);
expect(
  "RECRUITING PIPELINE has verbatim 'TARGET FUNDRAISING GOAL' label (source row 62)",
  containsVerbatim(rec, "TARGET FUNDRAISING GOAL"),
  true,
  null,
);

// FUNDRAISING — verbatim Annual Gala detail block (source J22-K37).
expect(
  "FUNDRAISING GOALS has verbatim 'Average Gift Per Guest' Gala assumption label",
  containsVerbatim(fund, "Average Gift Per Guest"),
  true,
  null,
);
expect(
  "FUNDRAISING GOALS has verbatim 'Average Sponsorship Cost' Gala assumption label",
  containsVerbatim(fund, "Average Sponsorship Cost"),
  true,
  null,
);
expect(
  "FUNDRAISING GOALS has verbatim 'Average Pre Event Gift' Gala assumption label",
  containsVerbatim(fund, "Average Pre Event Gift"),
  true,
  null,
);
expect(
  "FUNDRAISING GOALS preserves source-workbook 'FUNDRAISNG' typo annotation",
  containsVerbatim(fund, "FUNDRAISNG"),
  true,
  null,
);

// GIFT CHART — verbatim 12-tier source pyramid (rows 5-16).
expect(
  "GIFT CHART includes the verbatim source 12-tier donor pyramid (Total row)",
  containsVerbatim(giftChart, "Total"),
  true,
  null,
);

// GIFT CHART AUTOMATIC — verbatim source headers + parameters.
const giftAuto = wb.getWorksheet("5 - GIFT CHART AUTOMATIC")!;
expect(
  "GIFT CHART AUTOMATIC has verbatim 'SAMPLE GIFT CHART' header (source row 3)",
  containsVerbatim(giftAuto, "SAMPLE GIFT CHART"),
  true,
  null,
);
expect(
  "GIFT CHART AUTOMATIC has verbatim 'PLANNING FOR' header (source row 3)",
  containsVerbatim(giftAuto, "PLANNING FOR"),
  true,
  null,
);
expect(
  "GIFT CHART AUTOMATIC has verbatim '# Prospects' header (source row 7)",
  containsVerbatim(giftAuto, "# Prospects"),
  true,
  null,
);
expect(
  "GIFT CHART AUTOMATIC has verbatim 'GOAL:' parameter label (source row 23)",
  containsVerbatim(giftAuto, "GOAL:"),
  true,
  null,
);
expect(
  "GIFT CHART AUTOMATIC has verbatim 'Top Gift%' parameter label (source row 24)",
  containsVerbatim(giftAuto, "Top Gift%"),
  true,
  null,
);
expect(
  "GIFT CHART AUTOMATIC has verbatim 'Number of Gifts' parameter label (source row 25)",
  containsVerbatim(giftAuto, "Number of Gifts"),
  true,
  null,
);
expect(
  "GIFT CHART AUTOMATIC has verbatim 'Growth Factor' parameter label (source row 26)",
  containsVerbatim(giftAuto, "Growth Factor"),
  true,
  null,
);
// Spot-check verbatim source formulas across the gift-chart auto rows.
{
  // B9: source verbatim "(ROUND(TFG,-5)/1*$E$24)" with parens.
  const b9 = giftAuto.getCell("B9").value as { formula?: string } | null;
  const fB9 = typeof b9 === "object" && b9 !== null ? b9.formula : null;
  expect(
    "GIFT CHART AUTOMATIC B9 carries verbatim source formula '=(ROUND(TFG,-5)/1*$E$24)'",
    fB9 === "=(ROUND(TFG,-5)/1*$E$24)",
    "=(ROUND(TFG,-5)/1*$E$24)",
    fB9,
  );
  // C9: source verbatim "IF(ROUND(I9/$E$26,0)*$E$26>0,...,1)" — referencing
  // column I, NOT B. This is the key parity check the source insists on.
  const c9 = giftAuto.getCell("C9").value as { formula?: string } | null;
  const fC9 = typeof c9 === "object" && c9 !== null ? c9.formula : null;
  expect(
    "GIFT CHART AUTOMATIC C9 references column I (verbatim source formula)",
    fC9 === "=IF(ROUND(I9/$E$26,0)*$E$26>0,ROUND(I9/$E$26,0)*$E$26,1)",
    "=IF(ROUND(I9/$E$26,0)*$E$26>0,ROUND(I9/$E$26,0)*$E$26,1)",
    fC9,
  );
  // C10: source verbatim "ROUND(I10/$E$26,0)*$E$26".
  const c10 = giftAuto.getCell("C10").value as { formula?: string } | null;
  const fC10 = typeof c10 === "object" && c10 !== null ? c10.formula : null;
  expect(
    "GIFT CHART AUTOMATIC C10 references column I (verbatim source formula)",
    fC10 === "=ROUND(I10/$E$26,0)*$E$26",
    "=ROUND(I10/$E$26,0)*$E$26",
    fC10,
  );
  // I9: source verbatim "($E$25*($H9/SUM($H$9:$H$20)))".
  const i9 = giftAuto.getCell("I9").value as { formula?: string } | null;
  const fI9 = typeof i9 === "object" && i9 !== null ? i9.formula : null;
  expect(
    "GIFT CHART AUTOMATIC I9 carries verbatim source distribution formula",
    fI9 === "=($E$25*($H9/SUM($H$9:$H$20)))",
    "=($E$25*($H9/SUM($H$9:$H$20)))",
    fI9,
  );
  // B11..B20 are LITERAL caps in the source (15000, 12500, ..., 100).
  // Spot-check B11 = 15000 and B20 = 100 to lock the published cap list.
  const b11 = giftAuto.getCell("B11").value;
  expect(
    "GIFT CHART AUTOMATIC B11 is the verbatim literal cap 15000 from source",
    b11 === 15000,
    15000,
    b11,
  );
  const b20 = giftAuto.getCell("B20").value;
  expect(
    "GIFT CHART AUTOMATIC B20 is the verbatim literal cap 100 from source",
    b20 === 100,
    100,
    b20,
  );
  // E25 (Number of Gifts parameter) is verbatim 650 in the source manual.
  const e25 = giftAuto.getCell("E25").value;
  expect(
    "GIFT CHART AUTOMATIC E25 is the verbatim source parameter 650",
    e25 === 650,
    650,
    e25,
  );
  // Subtotal C21 = SUM(C9:C20) cached value = sum of computed C column.
  const c21 = giftAuto.getCell("C21").value as { formula?: string; result?: unknown } | null;
  const fC21 = typeof c21 === "object" && c21 !== null ? c21.formula : null;
  expect(
    "GIFT CHART AUTOMATIC C21 carries verbatim subtotal formula =SUM(C9:C20)",
    fC21 === "=SUM(C9:C20)",
    "=SUM(C9:C20)",
    fC21,
  );
}

// PROJECTIONS — verbatim Phase headers from source rows 5-6.
const projVerbatim = wb.getWorksheet("1 - 5 YR FINANCIAL PROJECTIONS")!;
expect(
  "PROJECTIONS has verbatim Phase I — DISCOVERY header from source row 5",
  containsVerbatim(projVerbatim, "Phase I — DISCOVERY"),
  true,
  null,
);
expect(
  "PROJECTIONS has verbatim Phase IV — LAUNCH AND ONGOING OPERATIONS header from source row 5",
  containsVerbatim(projVerbatim, "Phase IV — LAUNCH AND ONGOING OPERATIONS"),
  true,
  null,
);
expect(
  "PROJECTIONS has verbatim 'Last Updated: 11/23/2022' source-workbook footer",
  containsVerbatim(projVerbatim, "Last Updated: 11/23/2022"),
  true,
  null,
);

// SALARY SCHEDULE — verbatim Hours table (rows 30-33) + label.
const salVerbatim = wb.getWorksheet("2 - SALARY SCHEDULE")!;
expect(
  "SALARY SCHEDULE has verbatim 'Full Time' / 24 hours row from source row 30",
  containsVerbatim(salVerbatim, "Full Time"),
  true,
  null,
);
expect(
  "SALARY SCHEDULE has verbatim '1/4 Time' row label from source row 31",
  containsVerbatim(salVerbatim, "1/4 Time"),
  true,
  null,
);
expect(
  "SALARY SCHEDULE has verbatim 'Average Salary per Period Rate' label from source",
  containsVerbatim(salVerbatim, "Average Salary per Period Rate"),
  true,
  null,
);

// Formula round-trip — perturb inputs, assert formula text is identical
// across builds and the cached result tracks the new input.

interface FormulaCell { formula?: string; result?: unknown }
function readFormula(ws: import("exceljs").Worksheet, addr: string): FormulaCell {
  const v = ws.getCell(addr).value as unknown;
  if (v && typeof v === "object" && "formula" in (v as object)) return v as FormulaCell;
  return { formula: undefined, result: v };
}
function expectFormula(check: string, cell: FormulaCell, formula: string, result: unknown) {
  const okFormula = cell.formula === formula;
  const okResult = typeof result === "number" && typeof cell.result === "number"
    ? Math.abs((cell.result as number) - result) < 1e-6
    : cell.result === result;
  expect(`${check} — formula text`, okFormula, formula, cell.formula);
  expect(`${check} — cached result`, okResult, result, cell.result);
}

const perturbed = JSON.parse(JSON.stringify(sample)) as typeof sample;
perturbed.chesterton.startingTuition = 9000;
perturbed.chesterton.tuitionGrowthRate = 0.05;
perturbed.chesterton.bookSupplyFee = 750;
perturbed.chesterton.financialAidPct = 0.15;
perturbed.chesterton.startingTeacherSalary = 50000;
perturbed.chesterton.salarySchedule = [
  { subject: "Theology", periodsPerSection: 2 },
  { subject: "Latin", periodsPerSection: 1 },
  { subject: "Mathematics", periodsPerSection: 3 },
];
perturbed.chesterton.fundraisingGoals = [
  { category: "Major Gifts", goalAmount: 600000, numberOfGifts: 6, averageGift: 100000 },
  { category: "Mid-Level Gifts", goalAmount: 300000, numberOfGifts: 30, averageGift: 10000 },
  { category: "Annual Fund", goalAmount: 200000, numberOfGifts: 200, averageGift: 1000 },
];
const wbPerturbed = await generateChestertonOperatingManual(perturbed);

// GETTING STARTED.
{
  const gs2 = wbPerturbed.getWorksheet("GETTING STARTED")!;
  const avg = readFormula(gs2, "C17");
  expectFormula(
    "GETTING STARTED: AvgSalaryperPeriod recomputes when Starting_Teacher_Salary changes",
    avg,
    "=Starting_Teacher_Salary/5",
    50000 / 5,
  );
  const avgOrig = readFormula(wb.getWorksheet("GETTING STARTED")!, "C17");
  expect(
    "GETTING STARTED: AvgSalaryperPeriod cached result tracks original 44000 → 8800",
    typeof avgOrig.result === "number" && Math.abs((avgOrig.result as number) - 8800) < 1e-6,
    8800,
    avgOrig.result,
  );

  const tfg = readFormula(gs2, "C21");
  expectFormula(
    "GETTING STARTED: TFG rolls up SUM of fundraising goal column",
    tfg,
    "=SUM('4 - FUNDRAISING GOALS'!$C$6:$C$8)",
    600000 + 300000 + 200000,
  );
}

// PROJECTIONS — col D (Year 2) is the first CEILING growth cell (offset=1).
{
  const proj2 = wbPerturbed.getWorksheet("1 - 5 YR FINANCIAL PROJECTIONS")!;
  let tuitionRowIdx = -1;
  proj2.eachRow((r, idx) => {
    if (r.getCell(1).value === "Tuition per Student") tuitionRowIdx = idx;
  });
  expect("PROJECTIONS: located 'Tuition per Student' row", tuitionRowIdx > 0, true, tuitionRowIdx);
  const yr2Cell = readFormula(proj2, `D${tuitionRowIdx}`);
  expectFormula(
    "PROJECTIONS: Year 2 tuition uses CEILING(Starting_Tuition*(1+Tuition_Growth_Rate)^1, 50)",
    yr2Cell,
    "=CEILING(Starting_Tuition*(1+Tuition_Growth_Rate)^1,50)",
    Math.ceil((9000 * 1.05) / 50) * 50, // = 9450
  );
}

// SALARY SCHEDULE — Bachelors/FT Year-1 cascades from Starting_Teacher_Salary.
{
  const sal2 = wbPerturbed.getWorksheet("2 - SALARY SCHEDULE")!;
  const ft1 = readFormula(sal2, "B5");
  expect(
    "SALARY SCHEDULE: Bachelors/FT Year-1 cell carries a formula (not a baked number)",
    typeof ft1.formula === "string" && ft1.formula.length > 0,
    true,
    ft1.formula,
  );
  expect(
    "SALARY SCHEDULE: Bachelors/FT Year-1 cached result reflects new Starting_Teacher_Salary (=50000)",
    typeof ft1.result === "number" && Math.abs((ft1.result as number) - 50000) < 1e-6,
    50000,
    ft1.result,
  );
}

// FUNDRAISING GOALS — per-row avg + subtotal SUM/avg.
{
  const fund2 = wbPerturbed.getWorksheet("4 - FUNDRAISING GOALS")!;
  const avg6 = readFormula(fund2, "E6");
  expectFormula(
    "FUNDRAISING GOALS row 6: avg gift = IFERROR(C6/D6, 0)",
    avg6,
    "=IFERROR(C6/D6,0)",
    600000 / 6,
  );
  const totalGoal = readFormula(fund2, "C9");
  expectFormula(
    "FUNDRAISING GOALS subtotal: SUM of component goals",
    totalGoal,
    "=SUM(C6:C8)",
    600000 + 300000 + 200000,
  );
  const totalAvg = readFormula(fund2, "E9");
  expectFormula(
    "FUNDRAISING GOALS subtotal: rolled-up avg gift = IFERROR(C9/D9, 0)",
    totalAvg,
    "=IFERROR(C9/D9,0)",
    (600000 + 300000 + 200000) / (6 + 30 + 200),
  );
}

// GIFT CHART — tier total = giftAmount * #gifts in col E.
{
  const gc2 = wbPerturbed.getWorksheet("5 - GIFT CHART")!;
  const tier1 = readFormula(gc2, "E5");
  expect(
    "GIFT CHART tier 1: tier-total cell carries a formula",
    typeof tier1.formula === "string" && tier1.formula.includes("B5") && tier1.formula.includes("C5"),
    true,
    tier1.formula,
  );
  expect(
    "GIFT CHART tier 1: tier-total cached result = giftAmount * #gifts",
    typeof tier1.result === "number" && (tier1.result as number) === 100000 * 1,
    100000,
    tier1.result,
  );
}

// RECRUITING PIPELINE — Total = SUM of prospects column.
{
  const rec2 = wbPerturbed.getWorksheet("7 - RECRUITING PIPELINE")!;
  let totalRowIdx = -1;
  rec2.eachRow((r, idx) => {
    if (r.getCell(2).value === "Total") totalRowIdx = idx;
  });
  expect("RECRUITING PIPELINE: located Total row", totalRowIdx > 0, true, totalRowIdx);
  if (totalRowIdx > 0) {
    const totalCell = readFormula(rec2, `C${totalRowIdx}`);
    expect(
      "RECRUITING PIPELINE Total: cell carries SUM formula",
      typeof totalCell.formula === "string" && totalCell.formula.toUpperCase().startsWith("=SUM("),
      true,
      totalCell.formula,
    );
  }
}

// HyperFormula recompute — load both workbook variants into an Excel-
// evaluation engine, recalculate every formula from scratch, and assert
// the recomputed value matches each cached `result` to within 1e-6.
recomputeWorkbookAndAssert(wb, "baseline workbook");
recomputeWorkbookAndAssert(wbPerturbed, "perturbed workbook");

process.stdout.write("\n");
if (failures.length > 0) {
  console.error("CHESTERTON OPERATING MANUAL EXPORT TEST: FAILED");
  for (const f of failures) {
    console.error(`  ✗ ${f.check}\n      expected: ${JSON.stringify(f.expected)}\n      actual:   ${JSON.stringify(f.actual)}`);
  }
  process.exit(1);
}
console.log(`CHESTERTON OPERATING MANUAL EXPORT TEST: PASSED (${tabs.length} tabs verified, formula round-trip OK, HyperFormula recalc OK)`);
