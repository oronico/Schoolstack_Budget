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

process.stdout.write("\n");
if (failures.length > 0) {
  console.error("CHESTERTON OPERATING MANUAL EXPORT TEST: FAILED");
  for (const f of failures) {
    console.error(`  ✗ ${f.check}\n      expected: ${JSON.stringify(f.expected)}\n      actual:   ${JSON.stringify(f.actual)}`);
  }
  process.exit(1);
}
console.log(`CHESTERTON OPERATING MANUAL EXPORT TEST: PASSED (${tabs.length} tabs verified)`);
