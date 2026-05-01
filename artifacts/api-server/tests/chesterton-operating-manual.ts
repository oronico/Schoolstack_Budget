// Smoke test for the CSN Operating Manual workbook export.
// Builds the workbook in-memory, asserts the sheet list matches the
// CSN Operating Manual tabs, and spot-checks a handful of named ranges
// + key cells (Plan_Year, School_Name, AvgSalaryperPeriod, TFG, the
// tuition CEILING formula, the periods-based faculty AvgSalaryperPeriod
// reference). Failures throw so the script exits non-zero — same pattern
// as the other tsx-based qa:* scripts in this folder.

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

// 2. Named ranges Plan_Year / School_Name / AvgSalaryperPeriod / TFG exist.
const definedNamesRaw = (wb.definedNames as unknown as { matrixMap?: Record<string, unknown> }).matrixMap;
const definedNamesList = wb.definedNames.model || [];
const namedRangeNames = new Set<string>();
for (const dn of definedNamesList as Array<{ name?: string }>) if (dn?.name) namedRangeNames.add(dn.name);
// Some ExcelJS versions store definedNames as a flat Map under matrixMap;
// also walk those keys defensively.
if (definedNamesRaw && typeof definedNamesRaw === "object") {
  for (const k of Object.keys(definedNamesRaw)) namedRangeNames.add(k);
}
for (const required of ["Plan_Year", "School_Name", "AvgSalaryperPeriod", "TFG"]) {
  expect(`named range ${required} exists`, namedRangeNames.has(required), true, namedRangeNames.has(required));
}

// 3. GETTING STARTED key cells.
const gs = wb.getWorksheet("GETTING STARTED")!;
expect("School_Name cell C5 has the school name", gs.getCell("C5").value === "Saint Anselm Chesterton Academy", "Saint Anselm Chesterton Academy", gs.getCell("C5").value);
expect("Plan_Year cell C6 has the planning year", gs.getCell("C6").value === 2027, 2027, gs.getCell("C6").value);
expect("Starting tuition cell C9 = 8500", gs.getCell("C9").value === 8500, 8500, gs.getCell("C9").value);

// 4. PROJECTIONS sheet has the tuition CEILING formula and periods-based faculty formula.
const proj = wb.getWorksheet("1 - 5 YR FINANCIAL PROJECTIONS")!;
let foundCeiling = false;
let foundAvgSalaryRef = false;
proj.eachRow(row => {
  row.eachCell(cell => {
    const v = cell.value as { formula?: string } | string | number | null;
    if (v && typeof v === "object" && "formula" in v && typeof v.formula === "string") {
      if (v.formula.includes("CEILING(") && v.formula.includes("'GETTING STARTED'!$C$10")) foundCeiling = true;
      if (v.formula.includes("AvgSalaryperPeriod*")) foundAvgSalaryRef = true;
    }
  });
});
expect("projections sheet has tuition CEILING(.., 50) escalation formula", foundCeiling, true, foundCeiling);
expect("projections sheet has AvgSalaryperPeriod periods-based faculty formula", foundAvgSalaryRef, true, foundAvgSalaryRef);

// 5. Fundraising sheet shows the TFG formula in the subtitle.
const fund = wb.getWorksheet("4 - FUNDRAISING GOALS")!;
const tfgCell = fund.getCell("B3").value as { formula?: string } | undefined;
expect(
  "fundraising subtitle pulls from TFG named range",
  !!tfgCell && typeof tfgCell === "object" && "formula" in tfgCell && (tfgCell.formula ?? "").includes("TFG"),
  true,
  tfgCell,
);

// 6. Static reference tabs (Cadence, CSN Training Schedule, Parent Handout)
//    are present and mirror the published CSN Operating Manual workbook
//    word-for-word. Each tab is spot-checked against at least one verbatim
//    sentence/headline from the source workbook
//    (`3_Operating_Manual_2026_FV.xlsx`) so future edits cannot silently
//    drift from the published wording.
for (const name of ["Cadence", "CSN Training Schedule", "Parent Handout"]) {
  expect(`tab "${name}" exists`, !!wb.getWorksheet(name), true, !!wb.getWorksheet(name));
}

// Helper: walk every cell of a worksheet and return true if any cell value
// (string or formula result) contains the given verbatim substring.
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

// ── Cadence tab — verbatim from source tab "8 - CHESTERTON CADENCE" ──
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

// ── Training tab — verbatim from source tab "9 - CSN TRAINING" ──
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

// ── Parent Handout tab — verbatim from source tab "6 - PARENT HANDOUT" ──
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

process.stdout.write("\n");
if (failures.length > 0) {
  console.error("CHESTERTON OPERATING MANUAL EXPORT TEST: FAILED");
  for (const f of failures) {
    console.error(`  ✗ ${f.check}\n      expected: ${JSON.stringify(f.expected)}\n      actual:   ${JSON.stringify(f.actual)}`);
  }
  process.exit(1);
}
console.log(`CHESTERTON OPERATING MANUAL EXPORT TEST: PASSED (${tabs.length} tabs verified)`);
