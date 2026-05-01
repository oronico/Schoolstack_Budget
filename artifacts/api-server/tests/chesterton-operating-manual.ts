// Smoke + formula round-trip test for the CSN Operating Manual workbook.
// Verifies tab list, named ranges, verbatim wording on reference tabs,
// and that one derived cell per tab carries a formula whose cached
// result tracks an upstream input across two builds.

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

process.stdout.write("\n");
if (failures.length > 0) {
  console.error("CHESTERTON OPERATING MANUAL EXPORT TEST: FAILED");
  for (const f of failures) {
    console.error(`  ✗ ${f.check}\n      expected: ${JSON.stringify(f.expected)}\n      actual:   ${JSON.stringify(f.actual)}`);
  }
  process.exit(1);
}
console.log(`CHESTERTON OPERATING MANUAL EXPORT TEST: PASSED (${tabs.length} tabs verified, formula round-trip OK)`);
