// Golden-value snapshot test for the consultant engine
// (computeYearFinancialsFromData in src/lib/consultant-engine.ts).
//
// As of Task #274, the consultant engine no longer maintains a parallel
// calculation path: it delegates Y1-Y5 totals (revenue, staffing, facility,
// opex, capital & debt, net income, DSCR) to the canonical scenario engine
// in @workspace/finance. The CE adds three layered concerns on top of the
// canonical numbers:
//   1. tuition / public funding / philanthropy revenue split
//   2. straight-line depreciation + projected accounts receivable
//   3. SchoolProfile facility overlay (when the SP is the facility authority)
//
// This file freezes the consultant engine's Y1-Y5 outputs for the three
// shared fixtures so that any drift — either in the canonical engine or in
// the CE's overlay layer — surfaces as a snapshot diff that has to be
// signed off explicitly.
import { computeYearFinancialsFromData } from "../src/lib/consultant-engine.js";
import {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  homeschoolCoopFixture,
  chestertonAcademyFixture,
  tutoringCenterFixture,
  learningPodFixture,
  type TestModelPayload,
} from "@workspace/finance";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: number, expected: number, tolerancePct = 0.01) {
  const absTol = Math.max(Math.abs(expected) * (tolerancePct / 100), 1);
  const diff = Math.abs(actual - expected);
  if (diff <= absTol) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label} — expected ${Math.round(expected)}, got ${Math.round(actual)} (diff ${Math.round(diff)}, tol ${Math.round(absTol)})`);
  }
}

function checkArr(label: string, actual: number[], expected: number[]) {
  if (actual.length !== expected.length) {
    failed++;
    failures.push(`  FAIL: ${label} — length ${actual.length} != ${expected.length}`);
    return;
  }
  for (let i = 0; i < expected.length; i++) {
    check(`${label}[${i}]`, actual[i], expected[i]);
  }
}

interface CEGolden {
  totalRevenue: number[];
  tuitionRevenue: number[];
  publicRevenue: number[];
  philanthropyRevenue: number[];
  totalStaffingCost: number[];
  facilityCost: number[];
  totalOpex: number[];
  debtService: number[];
  loanDebtService: number[];
  totalExpenses: number[];
  netIncome: number[];
  depreciation: number[];
  projectedAR: number[];
}

// Goldens captured 2026-05-01 from computeYearFinancialsFromData with
// `skipFacilityOverlay: true` (matches production wiring — runConsultantEngine
// passes skipFacilityOverlay=true so the facility overlay is computed once
// downstream and not double-counted).

const microschoolGolden: CEGolden = {
  totalRevenue:    [184667, 340512, 427946, 500518, 516085],
  tuitionRevenue:  [110500, 204732, 257574, 301293, 310135],
  publicRevenue:   [70000, 129780, 163372, 191225, 196950],
  philanthropyRevenue:[4167, 6000, 7000, 8000, 9000],
  totalStaffingCost:[118934, 147003, 151413, 155955, 160634],
  facilityCost:    [30000, 37050, 38131, 39243, 40388],
  totalOpex:       [40500, 54885, 59774, 64012, 65776],
  debtService:     [0, 0, 0, 0, 0],
  loanDebtService: [0, 0, 0, 0, 0],
  totalExpenses:   [160148, 202602, 211901, 220681, 227124],
  netIncome:       [24518, 137910, 216045, 279836, 288961],
  depreciation:    [714, 714, 714, 714, 714],
  projectedAR:     [9082, 16827, 21170, 24764, 25491],
};

const privateGolden: CEGolden = {
  totalRevenue:    [1975000, 2612670, 3286760, 3895050, 4323000],
  tuitionRevenue:  [1030000, 1377740, 1744960, 2076255, 2309600],
  publicRevenue:   [870000, 1164930, 1476800, 1758795, 1958400],
  philanthropyRevenue:[75000, 70000, 65000, 60000, 55000],
  totalStaffingCost:[854772, 854772, 854772, 854772, 854772],
  facilityCost:    [136400, 140492, 144706, 149045, 153512],
  totalOpex:       [341964, 365766, 406675, 439319, 467465],
  debtService:     [59064, 44064, 44064, 39064, 39064],
  loanDebtService: [34064, 34064, 34064, 34064, 34064],
  totalExpenses:   [1222451, 1246253, 1287161, 1319805, 1347952],
  netIncome:       [752549, 1366417, 1999599, 2575245, 2975048],
  depreciation:    [25714, 25714, 25714, 25714, 25714],
  projectedAR:     [84658, 113239, 143421, 170651, 189830],
};

const charterGolden: CEGolden = {
  totalRevenue:    [1288333, 2522800, 3784600, 4759125, 5184400],
  tuitionRevenue:  [30000, 61800, 95400, 123000, 135200],
  publicRevenue:   [1150000, 2346000, 3589200, 4576125, 4979200],
  philanthropyRevenue:[108333, 115000, 100000, 60000, 70000],
  totalStaffingCost:[997040, 1478601, 1796022, 2042905, 2113443],
  facilityCost:    [235000, 290460, 299166, 308150, 317393],
  totalOpex:       [709825, 977685, 1280346, 1513914, 1624749],
  debtService:     [164825, 89825, 89825, 74825, 69825],
  loanDebtService: [49825, 49825, 49825, 49825, 49825],
  totalExpenses:   [1706865, 2456285, 3076368, 3556818, 3738191],
  netIncome:       [-418532, 66515, 708232, 1202307, 1446209],
  depreciation:    [0, 0, 0, 0, 0],
  projectedAR:     [2466, 5079, 7841, 10110, 11112],
};

// Homeschool co-op: AZ mixed-ESA + tuition + small fundraiser. 25 → 80
// students over 5 years, partial Y1 (10 months), no debt. See
// `homeschoolCoopFixture` in @workspace/finance for the underlying shape.
const homeschoolCoopGolden: CEGolden = {
  totalRevenue:    [260625, 576731, 790652, 975830, 1115824],
  tuitionRevenue:  [110625, 245781, 337092, 416102, 475584],
  publicRevenue:   [145833, 324450, 445560, 550728, 630240],
  philanthropyRevenue:[4167, 6500, 8000, 9000, 10000],
  totalStaffingCost:[149560, 215902, 254357, 278456, 303772],
  facilityCost:    [24500, 30255, 31135, 32041, 32973],
  totalOpex:       [43771, 66771, 78413, 88577, 96442],
  debtService:     [0, 0, 0, 0, 0],
  loanDebtService: [0, 0, 0, 0, 0],
  totalExpenses:   [193902, 283244, 333341, 367605, 400785],
  netIncome:       [66723, 293487, 457311, 608226, 715039],
  depreciation:    [571, 571, 571, 571, 571],
  projectedAR:     [9092, 20201, 27706, 34200, 39089],
};

// Chesterton Academy classical-Catholic high school. CSN template defaults
// (start tuition $8500 + 4% growth, financial aid 10%, $44k starting
// teacher salary). 20 → 120 student phased rollout (freshman class fills
// first), heavy philanthropy tail front-loaded by the gift chart. See
// `chestertonAcademyFixture` in @workspace/finance.
//
// Note on debtService/loanDebtService split: the engine's `debtService`
// field totals ALL cap-debt-row outflows (loan PMT + non-loan capex),
// while `loanDebtService` is the loan-PMT-only subset. Chesterton has
// `debtIncluded: false` and zero loan rows, so loanDebtService is zero,
// but `debtService` correctly reflects the classroom-furniture capex
// row [15000, 8000, 8000, 6000, 6000].
const chestertonAcademyGolden: CEGolden = {
  totalRevenue:    [551875, 712240, 921849, 1199466, 1460952],
  tuitionRevenue:  [165000, 342240, 576849, 874466, 1145952],
  publicRevenue:   [0, 0, 0, 0, 0],
  philanthropyRevenue:[386875, 370000, 345000, 325000, 315000],
  totalStaffingCost:[277359, 342624, 470208, 605140, 747744],
  facilityCost:    [69600, 71610, 73678, 75807, 77997],
  totalOpex:       [128100, 138565, 161514, 187035, 212254],
  debtService:     [15000, 8000, 8000, 6000, 6000], // = non-loan capex (FF&E)
  loanDebtService: [0, 0, 0, 0, 0],                  // no loan; debtIncluded:false
  totalExpenses:   [407601, 483332, 633865, 794317, 962141],
  netIncome:       [144274, 228908, 287984, 405148, 498811],
  depreciation:    [2143, 2143, 2143, 2143, 2143],
  projectedAR:     [13562, 28129, 47412, 71874, 94188],
};

// Task #454 — Tutoring center (AZ, fee-per-session storefront, partial Y1).
// 20 → 60 students; revenue from per-student annual tutoring fee + AZ ESA
// partial mix; staffing leans on a director + lead tutor + ratio-staffed
// contract tutors (1:10, capped at 6 FTE per the tutoring_center staffing
// benchmark "1 director + 2–6 contract tutors for 20–60 students"). The
// startup ramps from a ~$100k Y1 loss into break-even by Y5 — typical for
// a fee-per-session storefront in scale-up. Promoted from a microschool
// piggyback to a first-class persona. See `tutoringCenterFixture` in
// @workspace/finance.
const tutoringCenterGolden: CEGolden = {
  totalRevenue:    [105833, 227300, 300425, 377635, 424180],
  tuitionRevenue:  [61667, 133175, 176085, 221375, 248340],
  publicRevenue:   [41667, 90125, 119340, 150260, 168840],
  philanthropyRevenue:[2500, 4000, 5000, 6000, 7000],
  totalStaffingCost:[167268, 253093, 292512, 334070, 360974],
  facilityCost:    [25700, 31743, 32673, 33629, 34614],
  totalOpex:       [38700, 52346, 56942, 61736, 65080],
  debtService:     [0, 0, 0, 0, 0],
  loanDebtService: [0, 0, 0, 0, 0],
  totalExpenses:   [206396, 305867, 349883, 396234, 426482],
  netIncome:       [-100563, -78567, -49458, -18599, -2302],
  depreciation:    [429, 429, 429, 429, 429],
  projectedAR:     [5068, 10946, 14473, 18195, 20412],
};

// Task #454 — Learning pod (AZ, ESA-eligible premium small cohort, partial
// Y1). 8 → 15 students; per-student tuition (~$10k) + AZ ESA + small
// fundraiser; single full-time facilitator + part-time enrichment
// specialist. See `learningPodFixture` in @workspace/finance.
const learningPodGolden: CEGolden = {
  totalRevenue:    [111000, 171300, 211489, 253866, 280113],
  tuitionRevenue:  [62667, 96700, 119377, 143280, 157943],
  publicRevenue:   [46667, 72100, 89112, 107086, 118170],
  philanthropyRevenue:[1667, 2500, 3000, 3500, 4000],
  totalStaffingCost:[64913, 80233, 82640, 85119, 87673],
  facilityCost:    [15050, 18584, 19122, 19677, 20247],
  totalOpex:       [24633, 32319, 35197, 38199, 40281],
  debtService:     [0, 0, 0, 0, 0],
  loanDebtService: [0, 0, 0, 0, 0],
  totalExpenses:   [89761, 112766, 118051, 123533, 128168],
  netIncome:       [21239, 58534, 93438, 130334, 151944],
  depreciation:    [214, 214, 214, 214, 214],
  projectedAR:     [5151, 7948, 9812, 11776, 12982],
};

function runCE(fixture: TestModelPayload) {
  return computeYearFinancialsFromData({ ...fixture, skipFacilityOverlay: true } as unknown as Record<string, unknown>);
}

function checkCEGolden(label: string, fixture: TestModelPayload, g: CEGolden) {
  console.log(`\n— ${label} —`);
  const years = runCE(fixture);
  checkArr(`${label} totalRevenue`, years.map(y => y.totalRevenue), g.totalRevenue);
  checkArr(`${label} tuitionRevenue`, years.map(y => y.tuitionRevenue), g.tuitionRevenue);
  checkArr(`${label} publicRevenue`, years.map(y => y.publicRevenue), g.publicRevenue);
  checkArr(`${label} philanthropyRevenue`, years.map(y => y.philanthropyRevenue), g.philanthropyRevenue);
  checkArr(`${label} totalStaffingCost`, years.map(y => y.totalStaffingCost), g.totalStaffingCost);
  checkArr(`${label} facilityCost`, years.map(y => y.facilityCost), g.facilityCost);
  checkArr(`${label} totalOpex`, years.map(y => y.totalOpex), g.totalOpex);
  checkArr(`${label} debtService`, years.map(y => y.debtService), g.debtService);
  checkArr(`${label} loanDebtService`, years.map(y => y.loanDebtService ?? 0), g.loanDebtService);
  checkArr(`${label} totalExpenses`, years.map(y => y.totalExpenses), g.totalExpenses);
  checkArr(`${label} netIncome`, years.map(y => y.netIncome), g.netIncome);
  checkArr(`${label} depreciation`, years.map(y => y.depreciation), g.depreciation);
  checkArr(`${label} projectedAR`, years.map(y => y.projectedAR), g.projectedAR);

  // Identity: tuition + public + philanthropy ≈ totalRevenue
  for (let y = 0; y < 5; y++) {
    const split = g.tuitionRevenue[y] + g.publicRevenue[y] + g.philanthropyRevenue[y];
    check(`${label} Y${y + 1} revenue split sums to total`, split, g.totalRevenue[y], 1);
  }

  // Identity: totalExpenses == staffing + totalOpex + depreciation
  for (let y = 0; y < 5; y++) {
    const sum = g.totalStaffingCost[y] + g.totalOpex[y] + g.depreciation[y];
    check(`${label} Y${y + 1} totalExpenses identity`, sum, g.totalExpenses[y], 0.5);
  }
}

function main() {
  console.log("=== Consultant engine: Y1-Y5 golden snapshots ===");
  console.log("Engine: artifacts/api-server/src/lib/consultant-engine.ts → computeYearFinancialsFromData");
  console.log("Delegates totals to: lib/finance/src/decision-engine/scenario-engine.ts → computeBaseFinancials");
  console.log("Tolerance: 0.01% or $1 absolute minimum");

  checkCEGolden("Microschool", microschoolFixture, microschoolGolden);
  checkCEGolden("Private", privateSchoolFixture, privateGolden);
  checkCEGolden("Charter", charterFixture, charterGolden);
  checkCEGolden("HomeschoolCoop", homeschoolCoopFixture, homeschoolCoopGolden);
  checkCEGolden("ChestertonAcademy", chestertonAcademyFixture, chestertonAcademyGolden);
  checkCEGolden("TutoringCenter", tutoringCenterFixture, tutoringCenterGolden);
  checkCEGolden("LearningPod", learningPodFixture, learningPodGolden);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
  }
  if (failed > 0) process.exit(1);
}

main();
