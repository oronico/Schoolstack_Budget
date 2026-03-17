import ExcelJS from "exceljs";
import {
  NAVY, WHITE, LIGHT_GRAY, YELLOW_INPUT, GREEN_BG, RED_BG, AMBER_BG,
  EVERGREEN, CREAM, TEAL,
  HEADER_FILL, HEADER_FONT, SECTION_FILL, SECTION_FONT,
  NF, BF, BORDER, SUBTOTAL_BORDER,
  CUR, PCT, NUM,
  hdr, sec, dc, bc, gc, cn, colLetter,
  setFormula, inputCell, printSetup,
  computeAnnualDebt,
  driverVal,
  computeGradeBandRevenue,
  hasGradeBandData,
  computeRevenueForYear as computeRevenueForYearShared,
  type SchoolProfile as SharedSchoolProfile,
  type RevenueRow as SharedRevenueRow,
} from "./workbook-helpers.js";

const SCHOOL_TYPE_DISPLAY: Record<string, string> = {
  charter_school: "Charter School",
  homeschool_coop: "Homeschool Co-Op",
  learning_pod: "Learning Pod",
  microschool: "Microschool",
  private_school: "Private School",
  tutoring_center: "Tutoring Center",
  other: "Other",
};

const PAYMENT_TIMING_RATES: Record<string, number> = {
  upfront: 1.0,
  monthly: 0.95,
  quarterly: 0.97,
  semester: 0.98,
  annual: 1.0,
};

interface SchoolProfile {
  schoolName?: string;
  state?: string;
  schoolType?: string;
  schoolTypeOther?: string;
  openingYear?: number;
  gradeBandEnrollment?: { k5: number[]; m68: number[]; h912: number[] };
  gradeBandPerPupil?: { k5: number; m68: number; h912: number };
  enrollmentRevenueMethod?: string;
  charterDepositTiming?: string;
  priorYearADM?: number;
  priorYearADA?: number;
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
  retentionRate?: number;
  applicationsReceived?: number;
  waitlistCount?: number;
}

interface RevenueRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  percentBase?: string;
  collectionRate?: number;
  paymentTiming?: string;
}

interface StaffingRow {
  id: string;
  roleName: string;
  functionCategory: string;
  employmentType: string;
  fte: number;
  annualizedRate: number;
  benefitsEligible: boolean;
  benefitsRate: number;
  payrollTaxRate: number;
  payrollLike: boolean;
}

interface ExpenseRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
}

interface CapitalDebtRow {
  id: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  isLoan?: boolean;
  loanPrincipal?: number;
  loanRate?: number;
  loanTermYears?: number;
}

interface PriorYearSnapshot {
  endingCash?: number;
}

interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  revenueRows?: RevenueRow[];
  staffingRows?: StaffingRow[];
  expenseRows?: ExpenseRow[];
  capitalAndDebtRows?: CapitalDebtRow[];
  priorYearSnapshot?: PriorYearSnapshot;
}

function inferGrowthRate(amounts: number[], yearIdx0: number, yearIdx1: number): number {
  const v0 = amounts?.[yearIdx0] ?? 0;
  const v1 = amounts?.[yearIdx1] ?? 0;
  if (v0 <= 0 || v1 <= 0) return 0;
  return (v1 - v0) / v0;
}

// computeDriverValue delegates to shared driverVal from workbook-helpers.
// The lender-proforma version intentionally omits escalation (no escalationRate / fallback
// params) because each call site in mapModelToTemplateInput only reads Y0 values.
function computeDriverValue(amounts: number[] | undefined, yearIdx: number, driverType: string, students: number): number {
  return driverVal(amounts, yearIdx, driverType, students);
}

function sumExpenseCategoryY1(rows: ExpenseRow[], category: string, students: number, totalRevenue: number): number {
  let total = 0;
  for (const row of rows) {
    if (!row.enabled || row.category !== category) continue;
    if (row.driverType === "percent_of_revenue") {
      total += ((row.amounts?.[0] ?? 0) / 100) * totalRevenue;
    } else {
      total += computeDriverValue(row.amounts, 0, row.driverType, students);
    }
  }
  return total;
}

function avgExpenseGrowth(rows: ExpenseRow[], categories: string[], students1: number, students2: number, rev1: number, rev2: number): number {
  let sum0 = 0, sum1 = 0;
  for (const row of rows) {
    if (!row.enabled || !categories.includes(row.category)) continue;
    if (row.driverType === "percent_of_revenue") {
      sum0 += ((row.amounts?.[0] ?? 0) / 100) * rev1;
      sum1 += ((row.amounts?.[1] ?? 0) / 100) * rev2;
    } else {
      sum0 += computeDriverValue(row.amounts, 0, row.driverType, students1);
      sum1 += computeDriverValue(row.amounts, 1, row.driverType, students2);
    }
  }
  if (sum0 <= 0 || sum1 <= 0) return 0.03;
  return (sum1 - sum0) / sum0;
}

function computeGradeBandRevenueLocal(sp: SchoolProfile, y: number): number {
  return computeGradeBandRevenue(sp as SharedSchoolProfile, y);
}

function hasGradeBandDataLocal(sp?: SchoolProfile): boolean {
  return hasGradeBandData(sp as SharedSchoolProfile | undefined);
}

function computeRevenueY(rows: RevenueRow[], yearIdx: number, students: number, sp?: SchoolProfile): number {
  return computeRevenueForYearShared(rows as SharedRevenueRow[], yearIdx, students, undefined, undefined, sp as SharedSchoolProfile | undefined);
}

const FACILITY_CATEGORIES = ["occupancy_facility"];
const PROGRAM_CATEGORIES = ["instructional_program"];

// Delegates to shared computeAnnualDebt from workbook-helpers.ts.
function computeAnnualDebtService(principal: number, annualRate: number, termYears: number): number {
  return computeAnnualDebt(principal, annualRate, termYears);
}

export function mapModelToTemplateInput(rawData: Record<string, unknown>): Record<string, string | number> {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const revenueRows = data.revenueRows || [];
  const staffingRows = data.staffingRows || [];
  const expenseRows = data.expenseRows || [];
  const capDebtRows = data.capitalAndDebtRows || [];
  const prior = data.priorYearSnapshot;

  const enrollY1 = en.year1 || 0;
  const enrollY2 = en.year2 || 0;

  const result: Record<string, string | number> = {};

  result.schoolName = sp.schoolName || "";
  result.state = sp.state || "";
  result.schoolType = SCHOOL_TYPE_DISPLAY[sp.schoolType || ""] || sp.schoolTypeOther || sp.schoolType || "";
  result.firstOperatingYear = sp.openingYear || new Date().getFullYear();

  result.enrollmentY1 = en.year1 || 0;
  result.enrollmentY2 = en.year2 || 0;
  result.enrollmentY3 = en.year3 || 0;
  result.enrollmentY4 = en.year4 || 0;
  result.enrollmentY5 = en.year5 || 0;
  result.retentionRate = en.retentionRate ?? "";
  result.applicationsReceived = en.applicationsReceived ?? "";
  result.waitlistCount = en.waitlistCount ?? "";

  const grossTuitionRow = revenueRows.find(r => r.id === "gross_tuition" && r.enabled);
  const tuitionY1PerStudent = grossTuitionRow?.driverType === "per_student"
    ? (grossTuitionRow.amounts?.[0] ?? 0)
    : (grossTuitionRow && enrollY1 > 0
      ? computeDriverValue(grossTuitionRow.amounts, 0, grossTuitionRow.driverType, enrollY1) / enrollY1
      : 0);
  result.tuitionPerStudentY1 = tuitionY1PerStudent;

  if (grossTuitionRow && grossTuitionRow.amounts?.length >= 2) {
    result.tuitionGrowthPct = inferGrowthRate(grossTuitionRow.amounts, 0, 1);
  } else {
    result.tuitionGrowthPct = 0.03;
  }

  const esaRows = revenueRows.filter(r =>
    r.enabled && (r.category === "public_funding" || r.category === "school_choice") && r.driverType === "per_student"
  );
  if (hasGradeBandDataLocal(sp as SchoolProfile)) {
    const nonGbEsa = esaRows.filter(r => r.id !== "state_local_perpupil");
    const enrollments = [en.year1 || 0, en.year2 || 0, en.year3 || 0, en.year4 || 0, en.year5 || 0];
    for (let y = 0; y < 5; y++) {
      const gbRev = computeGradeBandRevenueLocal(sp as SchoolProfile, y);
      let nonGbRev = 0;
      for (const row of nonGbEsa) nonGbRev += computeDriverValue(row.amounts, y, row.driverType, enrollments[y]);
      result[`gbEsaRevenueY${y + 1}`] = gbRev + nonGbRev;
    }
    result.esaPerStudentY1 = 0;
    result.esaGrowthPct = 0;
  } else {
    let esaTotal = 0;
    for (const row of esaRows) esaTotal += (row.amounts?.[0] ?? 0);
    result.esaPerStudentY1 = esaTotal;
    if (esaRows.length > 0 && esaTotal > 0) {
      let esaY2 = 0;
      for (const row of esaRows) esaY2 += (row.amounts?.[1] ?? row.amounts?.[0] ?? 0);
      result.esaGrowthPct = esaTotal > 0 ? (esaY2 - esaTotal) / esaTotal : 0;
    } else {
      result.esaGrowthPct = 0;
    }
  }

  const otherEarnedRows = revenueRows.filter(r =>
    r.enabled && r.category === "other_revenue" && r.driverType === "per_student"
  );
  let otherTotal = 0;
  for (const row of otherEarnedRows) otherTotal += (row.amounts?.[0] ?? 0);
  result.otherEarnedPerStudentY1 = otherTotal;
  if (otherEarnedRows.length > 0 && otherTotal > 0) {
    let otherY2 = 0;
    for (const row of otherEarnedRows) otherY2 += (row.amounts?.[1] ?? row.amounts?.[0] ?? 0);
    result.otherEarnedGrowthPct = otherTotal > 0 ? (otherY2 - otherTotal) / otherTotal : 0;
  } else {
    result.otherEarnedGrowthPct = 0.02;
  }

  if (grossTuitionRow?.paymentTiming && PAYMENT_TIMING_RATES[grossTuitionRow.paymentTiming] !== undefined) {
    result.collectionRatePct = PAYMENT_TIMING_RATES[grossTuitionRow.paymentTiming];
  } else if ((grossTuitionRow as RevenueRow)?.collectionRate) {
    result.collectionRatePct = (grossTuitionRow as RevenueRow).collectionRate! / 100;
  } else {
    result.collectionRatePct = 0.95;
  }

  let grantsY1 = 0;
  for (const row of revenueRows) {
    if (!row.enabled || (row.category !== "grants_contributions" && row.category !== "philanthropy")) continue;
    if (row.driverType === "percent_of_base") {
      const baseRow = revenueRows.find(r => r.id === row.percentBase);
      const baseVal = baseRow ? computeDriverValue(baseRow.amounts, 0, baseRow.driverType, enrollY1) : 0;
      grantsY1 += baseVal * ((row.amounts?.[0] ?? 0) / 100);
    } else {
      grantsY1 += computeDriverValue(row.amounts, 0, row.driverType, enrollY1);
    }
  }
  result.grantsY1 = grantsY1;
  result.grantsGrowthPct = 0;

  const instructionalRows = staffingRows.filter(r => r.functionCategory === "instructional");
  const nonInstructionalRows = staffingRows.filter(r => r.functionCategory !== "instructional");

  const totalInstructionalFte = instructionalRows.reduce((sum, r) => sum + r.fte, 0);
  result.studentsPerTeacher = totalInstructionalFte > 0 ? Math.round(enrollY1 / totalInstructionalFte) : 12;

  const avgTeacherSalary = instructionalRows.length > 0
    ? instructionalRows.reduce((sum, r) => sum + r.annualizedRate, 0) / instructionalRows.length
    : 0;
  result.teacherSalaryY1 = Math.round(avgTeacherSalary);
  result.teacherSalaryGrowthPct = 0.03;

  const totalAdminFte = nonInstructionalRows.reduce((sum, r) => sum + r.fte, 0);
  result.adminFteY1 = totalAdminFte;
  result.adminFteY2 = totalAdminFte;
  result.adminFteY3 = totalAdminFte;
  result.adminFteY4 = totalAdminFte;
  result.adminFteY5 = totalAdminFte;

  const avgAdminSalary = nonInstructionalRows.length > 0
    ? nonInstructionalRows.reduce((sum, r) => sum + r.annualizedRate, 0) / nonInstructionalRows.length
    : 0;
  result.adminSalaryY1 = Math.round(avgAdminSalary);
  result.adminSalaryGrowthPct = 0.03;

  const allBenefitsRates = staffingRows.filter(r => r.benefitsEligible).map(r => r.benefitsRate);
  const avgBenefits = allBenefitsRates.length > 0
    ? allBenefitsRates.reduce((a, b) => a + b, 0) / allBenefitsRates.length
    : 10;
  result.benefitsBurdenPct = avgBenefits / 100;

  const revY1 = revenueRows.length > 0 ? computeRevenueY(revenueRows, 0, enrollY1, sp) : 0;
  const revY2 = revenueRows.length > 0 ? computeRevenueY(revenueRows, 1, enrollY2, sp) : 0;

  const facilityY1 = sumExpenseCategoryY1(expenseRows, "occupancy_facility", enrollY1, revY1);
  const rentRow = expenseRows.find(r => r.enabled && r.category === "occupancy_facility" && r.lineItem.toLowerCase().includes("rent"));
  result.annualRentY1 = rentRow
    ? computeDriverValue(rentRow.amounts, 0, rentRow.driverType, enrollY1)
    : facilityY1;
  const otherFacility = rentRow ? facilityY1 - (result.annualRentY1 as number) : 0;
  result.otherFacilityCostY1 = Math.max(0, otherFacility);

  if (expenseRows.some(r => r.enabled && r.category === "occupancy_facility" && r.amounts?.length >= 2)) {
    result.rentGrowthPct = avgExpenseGrowth(expenseRows, ["occupancy_facility"], enrollY1, enrollY2, revY1, revY2);
    result.otherFacilityCostGrowthPct = result.rentGrowthPct as number;
  } else {
    result.rentGrowthPct = 0.03;
    result.otherFacilityCostGrowthPct = 0.03;
  }

  const programY1 = sumExpenseCategoryY1(expenseRows, "instructional_program", enrollY1, revY1);
  result.programCostPerStudentY1 = enrollY1 > 0 ? Math.round(programY1 / enrollY1) : 0;
  if (expenseRows.some(r => r.enabled && r.category === "instructional_program" && r.amounts?.length >= 2)) {
    result.programCostGrowthPct = avgExpenseGrowth(expenseRows, ["instructional_program"], enrollY1, enrollY2, revY1, revY2);
  } else {
    result.programCostGrowthPct = 0.03;
  }

  const excludedCategories = new Set([...FACILITY_CATEGORIES, ...PROGRAM_CATEGORIES]);
  const allExpenseCategories = new Set(expenseRows.filter(r => r.enabled).map(r => r.category));
  const fixedOpsCategories = [...allExpenseCategories].filter(c => !excludedCategories.has(c));

  let fixedOpsY1 = 0;
  for (const cat of fixedOpsCategories) {
    fixedOpsY1 += sumExpenseCategoryY1(expenseRows, cat, enrollY1, revY1);
  }
  result.fixedOperatingCostY1 = Math.round(fixedOpsY1);

  if (fixedOpsCategories.length > 0 && expenseRows.some(r => r.enabled && fixedOpsCategories.includes(r.category) && r.amounts?.length >= 2)) {
    result.fixedOperatingCostGrowthPct = avgExpenseGrowth(expenseRows, fixedOpsCategories, enrollY1, enrollY2, revY1, revY2);
  } else {
    result.fixedOperatingCostGrowthPct = 0.03;
  }

  result.startingCash = prior?.endingCash ?? 0;

  let existingDebt = 0;
  let proposedLoanAmount = 0;
  let proposedRate = 0.08;
  let proposedTerm = 5;
  let foundProposedLoan = false;

  for (const row of capDebtRows) {
    if (!row.enabled) continue;
    if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
      if (!foundProposedLoan) {
        proposedLoanAmount = row.loanPrincipal;
        proposedRate = (row.loanRate || 8) / 100;
        proposedTerm = row.loanTermYears || 5;
        foundProposedLoan = true;
      } else {
        const rate = (row.loanRate || 0) / 100;
        const term = row.loanTermYears || 0;
        existingDebt += computeAnnualDebtService(row.loanPrincipal, rate, term);
      }
    } else {
      existingDebt += computeDriverValue(row.amounts, 0, row.driverType, enrollY1);
    }
  }

  result.existingAnnualDebtService = Math.round(existingDebt);
  result.proposedLoanAmount = proposedLoanAmount;
  result.interestRatePct = proposedRate;
  result.termYears = proposedTerm;

  const gbe = sp.gradeBandEnrollment;
  const gbp = sp.gradeBandPerPupil;
  if (gbe && gbp && ((gbe.k5?.[0] ?? 0) + (gbe.m68?.[0] ?? 0) + (gbe.h912?.[0] ?? 0) > 0)) {
    result.hasGradeBand = 1;
    result.enrollmentRevenueMethod = sp.enrollmentRevenueMethod || "count_days";
    result.charterDepositTiming = sp.charterDepositTiming || "monthly";
    result.priorYearADM = sp.priorYearADM || 0;
    result.priorYearADA = sp.priorYearADA || 0;
    result.gbK5PerPupil = gbp.k5 || 0;
    result.gbM68PerPupil = gbp.m68 || 0;
    result.gbH912PerPupil = gbp.h912 || 0;
    for (let y = 0; y < 5; y++) {
      result[`gbK5Y${y + 1}`] = gbe.k5?.[y] ?? 0;
      result[`gbM68Y${y + 1}`] = gbe.m68?.[y] ?? 0;
      result[`gbH912Y${y + 1}`] = gbe.h912?.[y] ?? 0;
    }
  } else {
    result.hasGradeBand = 0;
  }

  return result;
}

interface LenderResults {
  enrollment: number[];
  tuitionRevNet: number[];
  tuitionCollected: number[];
  esaRevenue: number[];
  otherRevenue: number[];
  grants: number[];
  totalRevenue: number[];
  teacherFte: number[];
  teacherSalaries: number[];
  adminSalaries: number[];
  benefits: number[];
  totalStaffing: number[];
  rent: number[];
  otherFacility: number[];
  programCost: number[];
  gaAndTech: number[];
  totalOpEx: number[];
  totalExpenses: number[];
  noi: number[];
  operatingMargin: number[];
  existingDebtService: number;
  proposedDebtService: number;
  totalDebtService: number;
  dscr: number[];
  netIncomeAfterDebt: number[];
  cumulativeCash: number[];
  adminFte: number[];
}

function computeLenderResults(input: Record<string, string | number>): LenderResults {
  const n = (k: string) => Number(input[k]) || 0;
  const enrollment = [n("enrollmentY1"), n("enrollmentY2"), n("enrollmentY3"), n("enrollmentY4"), n("enrollmentY5")];
  const tuitionPerStudent = n("tuitionPerStudentY1");
  const tuitionGrowth = n("tuitionGrowthPct");
  const esaPerStudent = n("esaPerStudentY1");
  const esaGrowth = n("esaGrowthPct");
  const otherPerStudent = n("otherEarnedPerStudentY1");
  const otherGrowth = n("otherEarnedGrowthPct");
  const collectionRate = n("collectionRatePct");
  const grantsY1 = n("grantsY1");
  const grantsGrowth = n("grantsGrowthPct");
  const studentsPerTeacher = n("studentsPerTeacher") || 12;
  const teacherSalary = n("teacherSalaryY1");
  const teacherSalaryGrowth = n("teacherSalaryGrowthPct");
  const adminSalary = n("adminSalaryY1");
  const adminGrowth = n("adminSalaryGrowthPct");
  const benefitsPct = n("benefitsBurdenPct");
  const rentY1 = n("annualRentY1");
  const rentGrowth = n("rentGrowthPct");
  const otherFacilityY1 = n("otherFacilityCostY1");
  const otherFacilityGrowth = n("otherFacilityCostGrowthPct");
  const programPerStudent = n("programCostPerStudentY1");
  const programGrowth = n("programCostGrowthPct");
  const fixedOps = n("fixedOperatingCostY1");
  const fixedGrowth = n("fixedOperatingCostGrowthPct");
  const startingCash = n("startingCash");
  const existingDebt = n("existingAnnualDebtService");
  const loanAmount = n("proposedLoanAmount");
  const loanRate = n("interestRatePct");
  const loanTerm = n("termYears");
  const adminFte = [n("adminFteY1"), n("adminFteY2"), n("adminFteY3"), n("adminFteY4"), n("adminFteY5")];

  const tuitionRevNet: number[] = [];
  const tuitionCollected: number[] = [];
  const esaRevenue: number[] = [];
  const otherRevenue: number[] = [];
  const grants: number[] = [];
  const totalRevenue: number[] = [];
  const teacherFte: number[] = [];
  const teacherSalaries: number[] = [];
  const adminSalaries: number[] = [];
  const benefits: number[] = [];
  const totalStaffing: number[] = [];
  const rent: number[] = [];
  const otherFacility: number[] = [];
  const programCost: number[] = [];
  const gaAndTech: number[] = [];
  const totalOpEx: number[] = [];
  const totalExpenses: number[] = [];
  const noi: number[] = [];
  const operatingMargin: number[] = [];

  const hasGradeBand = n("hasGradeBand") === 1;
  const gbEsaOverrides: number[] = [];
  if (hasGradeBand) {
    for (let y = 0; y < 5; y++) {
      gbEsaOverrides.push(n(`gbEsaRevenueY${y + 1}`));
    }
  }

  for (let y = 0; y < 5; y++) {
    const e = enrollment[y];
    const tuition = e * tuitionPerStudent * Math.pow(1 + tuitionGrowth, y);
    tuitionRevNet.push(tuition);
    tuitionCollected.push(tuition * collectionRate);
    esaRevenue.push(hasGradeBand ? gbEsaOverrides[y] : e * esaPerStudent * Math.pow(1 + esaGrowth, y));
    otherRevenue.push(e * otherPerStudent * Math.pow(1 + otherGrowth, y));
    grants.push(grantsY1 * Math.pow(1 + grantsGrowth, y));
    totalRevenue.push(tuition * collectionRate + esaRevenue[y] + otherRevenue[y] + grants[y]);

    const tFte = Math.ceil(e / studentsPerTeacher);
    teacherFte.push(tFte);
    const tSal = tFte * teacherSalary * Math.pow(1 + teacherSalaryGrowth, y);
    teacherSalaries.push(tSal);
    const aSal = adminFte[y] * adminSalary * Math.pow(1 + adminGrowth, y);
    adminSalaries.push(aSal);
    const ben = (tSal + aSal) * benefitsPct;
    benefits.push(ben);
    totalStaffing.push(tSal + aSal + ben);

    const r = rentY1 * Math.pow(1 + rentGrowth, y);
    rent.push(r);
    const of_ = otherFacilityY1 * Math.pow(1 + otherFacilityGrowth, y);
    otherFacility.push(of_);
    const pc = e * programPerStudent * Math.pow(1 + programGrowth, y);
    programCost.push(pc);
    const ga = fixedOps * Math.pow(1 + fixedGrowth, y);
    gaAndTech.push(ga);
    totalOpEx.push(r + of_ + pc + ga);

    totalExpenses.push(totalStaffing[y] + totalOpEx[y]);
    noi.push(totalRevenue[y] - totalExpenses[y]);
    operatingMargin.push(totalRevenue[y] > 0 ? noi[y] / totalRevenue[y] : 0);
  }

  const proposedDebtService = loanAmount > 0 ? computeAnnualDebtService(loanAmount, loanRate, loanTerm) : 0;
  const totalDebtService = existingDebt + proposedDebtService;

  const dscr: number[] = [];
  const netIncomeAfterDebt: number[] = [];
  const cumulativeCash: number[] = [];
  for (let y = 0; y < 5; y++) {
    if (totalDebtService > 0) {
      dscr.push(noi[y] / totalDebtService);
    } else {
      dscr.push(noi[y] > 0 ? 99.9 : 0);
    }
    netIncomeAfterDebt.push(noi[y] - totalDebtService);
    cumulativeCash.push(y === 0 ? startingCash + netIncomeAfterDebt[0] : cumulativeCash[y - 1] + netIncomeAfterDebt[y]);
  }

  return {
    enrollment, tuitionRevNet, tuitionCollected, esaRevenue, otherRevenue, grants, totalRevenue,
    teacherFte, teacherSalaries, adminSalaries, benefits, totalStaffing,
    rent, otherFacility, programCost, gaAndTech, totalOpEx, totalExpenses, noi, operatingMargin,
    existingDebtService: existingDebt, proposedDebtService, totalDebtService,
    dscr, netIncomeAfterDebt, cumulativeCash, adminFte,
  };
}

const ACELLS: Record<string, string> = {
  schoolName: "D5", state: "D6", schoolType: "D7", firstOperatingYear: "D8",
  enrollmentY1: "D12", enrollmentY2: "D13", enrollmentY3: "D14", enrollmentY4: "D15", enrollmentY5: "D16",
  tuitionPerStudentY1: "D20", tuitionGrowthPct: "D21",
  esaPerStudentY1: "D22", esaGrowthPct: "D23",
  otherEarnedPerStudentY1: "D24", otherEarnedGrowthPct: "D25",
  collectionRatePct: "D26", grantsY1: "D27", grantsGrowthPct: "D28",
  studentsPerTeacher: "D32", teacherSalaryY1: "D33", teacherSalaryGrowthPct: "D34",
  adminFteY1: "D35", adminFteY2: "D36", adminFteY3: "D37", adminFteY4: "D38", adminFteY5: "D39",
  adminSalaryY1: "D40", adminSalaryGrowthPct: "D41", benefitsBurdenPct: "D42",
  annualRentY1: "D46", rentGrowthPct: "D47",
  otherFacilityCostY1: "D48", otherFacilityCostGrowthPct: "D49",
  programCostPerStudentY1: "D50", programCostGrowthPct: "D51",
  fixedOperatingCostY1: "D52", fixedOperatingCostGrowthPct: "D53",
  startingCash: "D57", existingAnnualDebtService: "D58",
  proposedLoanAmount: "D59", interestRatePct: "D60", termYears: "D61",
};

const ENROLLMENT_CELLS = ["D12", "D13", "D14", "D15", "D16"];
const ADMIN_FTE_CELLS = ["D35", "D36", "D37", "D38", "D39"];

const YEAR_COLS = ["C", "D", "E", "F", "G"];

function buildCover(wb: ExcelJS.Workbook, schoolName: string) {
  const ws = wb.addWorksheet("Cover", { properties: { tabColor: { argb: NAVY } } });
  printSetup(ws);
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 35;
  ws.getColumn(3).width = 30;
  ws.getColumn(4).width = 5;

  let r = 3;
  ws.getCell(`B${r}`).value = "SCHOOLSTACK BUDGET";
  ws.getCell(`B${r}`).font = { name: "Calibri", size: 22, bold: true, color: { argb: "FF1E293B" } };
  ws.mergeCells(`B${r}:C${r}`);

  r++;
  ws.getCell(`B${r}`).value = "Lender-Ready Pro Forma";
  ws.getCell(`B${r}`).font = { name: "Calibri", size: 14, color: { argb: "FF328555" } };
  ws.mergeCells(`B${r}:C${r}`);

  r += 2;
  ws.getCell(`B${r}`).value = schoolName || "Financial Model";
  ws.getCell(`B${r}`).font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF1E293B" } };
  ws.mergeCells(`B${r}:C${r}`);

  r += 2;
  ws.getCell(`B${r}`).value = "TABLE OF CONTENTS";
  ws.getCell(`B${r}`).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1E293B" } };
  ws.getCell(`B${r}`).border = { bottom: { style: "medium", color: { argb: "FF328555" } } };
  ws.mergeCells(`B${r}:C${r}`);

  const tabs = ["Assumptions", "Drivers", "5-Year P&L", "Cash Flow & DSCR", "Staffing", "Loan Snapshot", "Summary"];
  for (const tab of tabs) {
    r++;
    ws.getCell(`B${r}`).value = { text: tab, hyperlink: `#'${tab}'!A1` };
    ws.getCell(`B${r}`).font = { name: "Calibri", size: 11, color: { argb: "FF0563C1" }, underline: true };
  }

  r += 3;
  ws.getCell(`B${r}`).value = `Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
  ws.getCell(`B${r}`).font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF6B7280" } };
  ws.mergeCells(`B${r}:C${r}`);

  r++;
  ws.getCell(`B${r}`).value = "Generated by SchoolStack Budget  •  budget.schoolstack.ai";
  ws.getCell(`B${r}`).font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF6B7280" } };
  ws.mergeCells(`B${r}:C${r}`);
}

function buildAssumptions(wb: ExcelJS.Workbook, input: Record<string, string | number>) {
  const ws = wb.addWorksheet("Assumptions", { properties: { tabColor: { argb: "FFD97706" } } });
  printSetup(ws);

  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 5;
  ws.getColumn(3).width = 38;
  ws.getColumn(4).width = 22;

  const titleFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1E293B" } };
  const sectionFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  const sectionFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  const labelFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, color: { argb: "FF374151" } };
  const valueFont: Partial<ExcelJS.Font> = { name: "Calibri", size: 11, color: { argb: "FF1E293B" } };
  const inputFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFDE8" } };
  const thinBorder: Partial<ExcelJS.Borders> = {
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  };

  ws.getCell("B1").value = "SchoolStack Budget - Lender Pro Forma Assumptions";
  ws.getCell("B1").font = titleFont;
  ws.mergeCells("B1:D1");

  const sections: { row: number; label: string }[] = [
    { row: 3, label: "SCHOOL PROFILE" },
    { row: 10, label: "ENROLLMENT FORECAST" },
    { row: 18, label: "REVENUE ASSUMPTIONS" },
    { row: 30, label: "STAFFING ASSUMPTIONS" },
    { row: 44, label: "OPERATING EXPENSE ASSUMPTIONS" },
    { row: 55, label: "CAPITAL & DEBT" },
  ];
  for (const s of sections) {
    ws.mergeCells(`B${s.row}:D${s.row}`);
    ws.getCell(`B${s.row}`).value = s.label;
    ws.getCell(`B${s.row}`).font = sectionFont;
    ws.getCell(`B${s.row}`).fill = sectionFill;
    ws.getCell(`B${s.row}`).alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(s.row).height = 24;
  }

  const rows: { row: number; label: string; key: string; fmt?: string }[] = [
    { row: 5, label: "School Name", key: "schoolName" },
    { row: 6, label: "State", key: "state" },
    { row: 7, label: "School Type", key: "schoolType" },
    { row: 8, label: "First Operating Year", key: "firstOperatingYear" },
    { row: 12, label: "Year 1 Enrollment", key: "enrollmentY1", fmt: NUM },
    { row: 13, label: "Year 2 Enrollment", key: "enrollmentY2", fmt: NUM },
    { row: 14, label: "Year 3 Enrollment", key: "enrollmentY3", fmt: NUM },
    { row: 15, label: "Year 4 Enrollment", key: "enrollmentY4", fmt: NUM },
    { row: 16, label: "Year 5 Enrollment", key: "enrollmentY5", fmt: NUM },
    { row: 20, label: "Tuition per Student (Year 1)", key: "tuitionPerStudentY1", fmt: CUR },
    { row: 21, label: "Tuition Annual Growth %", key: "tuitionGrowthPct", fmt: PCT },
    { row: 22, label: "ESA per Student (Year 1)", key: "esaPerStudentY1", fmt: CUR },
    { row: 23, label: "ESA Annual Growth %", key: "esaGrowthPct", fmt: PCT },
    { row: 24, label: "Other Per-Student Revenue (Year 1)", key: "otherEarnedPerStudentY1", fmt: CUR },
    { row: 25, label: "Other Revenue Growth %", key: "otherEarnedGrowthPct", fmt: PCT },
    { row: 26, label: "Collection Rate %", key: "collectionRatePct", fmt: PCT },
    { row: 27, label: "Grants & Contributions (Year 1)", key: "grantsY1", fmt: CUR },
    { row: 28, label: "Grants Growth %", key: "grantsGrowthPct", fmt: PCT },
    { row: 32, label: "Students per Teacher", key: "studentsPerTeacher", fmt: NUM },
    { row: 33, label: "Avg Teacher Salary (Year 1)", key: "teacherSalaryY1", fmt: CUR },
    { row: 34, label: "Teacher Salary Growth %", key: "teacherSalaryGrowthPct", fmt: PCT },
    { row: 35, label: "Admin FTE - Year 1", key: "adminFteY1", fmt: NUM },
    { row: 36, label: "Admin FTE - Year 2", key: "adminFteY2", fmt: NUM },
    { row: 37, label: "Admin FTE - Year 3", key: "adminFteY3", fmt: NUM },
    { row: 38, label: "Admin FTE - Year 4", key: "adminFteY4", fmt: NUM },
    { row: 39, label: "Admin FTE - Year 5", key: "adminFteY5", fmt: NUM },
    { row: 40, label: "Avg Admin Salary (Year 1)", key: "adminSalaryY1", fmt: CUR },
    { row: 41, label: "Admin Salary Growth %", key: "adminSalaryGrowthPct", fmt: PCT },
    { row: 42, label: "Benefits Burden %", key: "benefitsBurdenPct", fmt: PCT },
    { row: 46, label: "Annual Rent (Year 1)", key: "annualRentY1", fmt: CUR },
    { row: 47, label: "Rent Growth %", key: "rentGrowthPct", fmt: PCT },
    { row: 48, label: "Other Facility Cost (Year 1)", key: "otherFacilityCostY1", fmt: CUR },
    { row: 49, label: "Other Facility Growth %", key: "otherFacilityCostGrowthPct", fmt: PCT },
    { row: 50, label: "Program Cost per Student (Year 1)", key: "programCostPerStudentY1", fmt: CUR },
    { row: 51, label: "Program Cost Growth %", key: "programCostGrowthPct", fmt: PCT },
    { row: 52, label: "Fixed Operating Costs (Year 1)", key: "fixedOperatingCostY1", fmt: CUR },
    { row: 53, label: "Fixed Operating Growth %", key: "fixedOperatingCostGrowthPct", fmt: PCT },
    { row: 57, label: "Starting Cash", key: "startingCash", fmt: CUR },
    { row: 58, label: "Existing Annual Debt Service", key: "existingAnnualDebtService", fmt: CUR },
    { row: 59, label: "Proposed Loan Amount", key: "proposedLoanAmount", fmt: CUR },
    { row: 60, label: "Interest Rate %", key: "interestRatePct", fmt: PCT },
    { row: 61, label: "Term (Years)", key: "termYears", fmt: NUM },
  ];

  for (const r of rows) {
    const labelCell = ws.getCell(`C${r.row}`);
    labelCell.value = r.label;
    labelCell.font = labelFont;
    labelCell.border = thinBorder;

    const valCell = ws.getCell(`D${r.row}`);
    valCell.value = input[r.key] ?? "";
    valCell.font = valueFont;
    valCell.fill = inputFill;
    valCell.border = thinBorder;
    if (r.fmt) valCell.numFmt = r.fmt;
    valCell.alignment = { horizontal: "right" };
  }

  const hasRetentionDemand = (input.retentionRate !== "" && input.retentionRate !== undefined) ||
    (input.applicationsReceived !== "" && input.applicationsReceived !== undefined) ||
    (input.waitlistCount !== "" && input.waitlistCount !== undefined);

  if (hasRetentionDemand) {
    const rdStartRow = 63;
    ws.mergeCells(`B${rdStartRow}:D${rdStartRow}`);
    ws.getCell(`B${rdStartRow}`).value = "RETENTION & DEMAND SIGNALS";
    ws.getCell(`B${rdStartRow}`).font = sectionFont;
    ws.getCell(`B${rdStartRow}`).fill = sectionFill;
    ws.getCell(`B${rdStartRow}`).alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(rdStartRow).height = 24;

    const rdRows: { row: number; label: string; key: string; fmt?: string }[] = [];
    if (input.retentionRate !== "" && input.retentionRate !== undefined) {
      rdRows.push({ row: rdStartRow + 2, label: "Student Retention Rate", key: "retentionRate", fmt: "0.0%" });
    }
    if (input.applicationsReceived !== "" && input.applicationsReceived !== undefined) {
      rdRows.push({ row: rdStartRow + 3, label: "Applications Received (2026-27)", key: "applicationsReceived", fmt: NUM });
    }
    if (input.waitlistCount !== "" && input.waitlistCount !== undefined) {
      rdRows.push({ row: rdStartRow + 4, label: "Waitlist Count (2026-27)", key: "waitlistCount", fmt: NUM });
    }
    const pipeline = (Number(input.applicationsReceived) || 0) + (Number(input.waitlistCount) || 0);
    const y1Enroll = Number(input.enrollmentY1) || 0;
    if (pipeline > 0 && y1Enroll > 0) {
      const coveragePct = pipeline / y1Enroll;
      const nextRow = rdStartRow + 5;
      ws.getCell(`C${nextRow}`).value = "Pipeline Coverage (Apps + Waitlist ÷ Y1)";
      ws.getCell(`C${nextRow}`).font = labelFont;
      ws.getCell(`C${nextRow}`).border = thinBorder;
      ws.getCell(`D${nextRow}`).value = coveragePct;
      ws.getCell(`D${nextRow}`).font = { ...valueFont, bold: true, color: { argb: coveragePct >= 1 ? "FF16A34A" : "FFD97706" } };
      ws.getCell(`D${nextRow}`).numFmt = "0.0%";
      ws.getCell(`D${nextRow}`).border = thinBorder;
      ws.getCell(`D${nextRow}`).alignment = { horizontal: "right" };
    }
    for (const r of rdRows) {
      ws.getCell(`C${r.row}`).value = r.label;
      ws.getCell(`C${r.row}`).font = labelFont;
      ws.getCell(`C${r.row}`).border = thinBorder;
      const val = input[r.key];
      const displayVal = r.fmt === "0.0%" && typeof val === "number" ? val / 100 : val;
      ws.getCell(`D${r.row}`).value = displayVal;
      ws.getCell(`D${r.row}`).font = valueFont;
      ws.getCell(`D${r.row}`).fill = inputFill;
      ws.getCell(`D${r.row}`).border = thinBorder;
      if (r.fmt) ws.getCell(`D${r.row}`).numFmt = r.fmt;
      ws.getCell(`D${r.row}`).alignment = { horizontal: "right" };
    }
  }

  if (input.hasGradeBand === 1) {
    const METHOD_LABELS: Record<string, string> = { count_days: "Count Days", adm: "ADM (Avg Daily Membership)", ada: "ADA (Avg Daily Attendance)" };
    const TIMING_LABELS: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual", semi_annual: "Semi-Annual" };
    const gbStartRow = hasRetentionDemand ? 70 : 64;
    ws.mergeCells(`B${gbStartRow}:D${gbStartRow}`);
    ws.getCell(`B${gbStartRow}`).value = "CHARTER FUNDING DETAILS";
    ws.getCell(`B${gbStartRow}`).font = sectionFont;
    ws.getCell(`B${gbStartRow}`).fill = sectionFill;
    ws.getCell(`B${gbStartRow}`).alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(gbStartRow).height = 24;

    const gbRows: { row: number; label: string; value: string | number; fmt?: string }[] = [
      { row: gbStartRow + 2, label: "Enrollment Revenue Method", value: METHOD_LABELS[String(input.enrollmentRevenueMethod)] || String(input.enrollmentRevenueMethod) },
      { row: gbStartRow + 3, label: "Charter Deposit Timing", value: TIMING_LABELS[String(input.charterDepositTiming)] || String(input.charterDepositTiming) },
      { row: gbStartRow + 4, label: "Prior-Year ADM", value: Number(input.priorYearADM) || 0, fmt: NUM },
      { row: gbStartRow + 5, label: "Prior-Year ADA", value: Number(input.priorYearADA) || 0, fmt: NUM },
      { row: gbStartRow + 6, label: "Attendance Ratio (ADA ÷ ADM)", value: (Number(input.priorYearADM) || 0) > 0 ? Math.min((Number(input.priorYearADA) || 0) / (Number(input.priorYearADM) || 1), 1) : 0.95, fmt: "0.00%" },
      { row: gbStartRow + 7, label: "Per-Pupil Rate - K-5", value: Number(input.gbK5PerPupil) || 0, fmt: CUR },
      { row: gbStartRow + 8, label: "Per-Pupil Rate - 6-8", value: Number(input.gbM68PerPupil) || 0, fmt: CUR },
      { row: gbStartRow + 9, label: "Per-Pupil Rate - 9-12", value: Number(input.gbH912PerPupil) || 0, fmt: CUR },
    ];
    for (const gr of gbRows) {
      ws.getCell(`C${gr.row}`).value = gr.label;
      ws.getCell(`C${gr.row}`).font = labelFont;
      ws.getCell(`C${gr.row}`).border = thinBorder;
      ws.getCell(`D${gr.row}`).value = gr.value;
      ws.getCell(`D${gr.row}`).font = valueFont;
      ws.getCell(`D${gr.row}`).fill = inputFill;
      ws.getCell(`D${gr.row}`).border = thinBorder;
      if (gr.fmt) ws.getCell(`D${gr.row}`).numFmt = gr.fmt;
      ws.getCell(`D${gr.row}`).alignment = { horizontal: "right" };
    }

    const gbEnrollStart = gbStartRow + 11;
    ws.mergeCells(`C${gbEnrollStart}:D${gbEnrollStart}`);
    ws.getCell(`C${gbEnrollStart}`).value = "Grade-Band Enrollment by Year";
    ws.getCell(`C${gbEnrollStart}`).font = { ...labelFont, bold: true };

    const gbBands = [
      { label: "K-5", prefix: "gbK5" },
      { label: "6-8", prefix: "gbM68" },
      { label: "9-12", prefix: "gbH912" },
    ];
    let gbr = gbEnrollStart + 1;
    for (const band of gbBands) {
      ws.getCell(`C${gbr}`).value = `  ${band.label}`;
      ws.getCell(`C${gbr}`).font = labelFont;
      ws.getCell(`C${gbr}`).border = thinBorder;
      const vals = [];
      for (let y = 1; y <= 5; y++) vals.push(Number(input[`${band.prefix}Y${y}`]) || 0);
      ws.getCell(`D${gbr}`).value = vals.join("  /  ");
      ws.getCell(`D${gbr}`).font = valueFont;
      ws.getCell(`D${gbr}`).fill = inputFill;
      ws.getCell(`D${gbr}`).border = thinBorder;
      gbr++;
    }
  }

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
}

function buildDrivers(wb: ExcelJS.Workbook, input: Record<string, string | number>, res: LenderResults) {
  const ws = wb.addWorksheet("Drivers", { properties: { tabColor: { argb: "FF0D9488" } } });
  printSetup(ws);

  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 34;
  for (let c = 3; c <= 7; c++) ws.getColumn(c).width = 16;

  ws.getCell("B1").value = "Revenue & Expense Drivers";
  ws.getCell("B1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1E293B" } };
  ws.mergeCells("B1:G1");

  for (let c = 3; c <= 7; c++) {
    const cell = ws.getCell(3, c);
    cell.value = `Year ${c - 2}`;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center" };
    cell.border = BORDER;
  }
  ws.getCell("B3").fill = HEADER_FILL;
  ws.getCell("B3").border = BORDER;
  ws.getRow(3).height = 24;

  const labelCell = (r: number, label: string, isSection = false, isBold = false) => {
    const c = ws.getCell(`B${r}`);
    c.value = label;
    if (isSection) {
      c.font = SECTION_FONT;
      c.fill = SECTION_FILL;
      for (let col = 2; col <= 7; col++) {
        ws.getCell(r, col).fill = SECTION_FILL;
        ws.getCell(r, col).font = SECTION_FONT;
        ws.getCell(r, col).border = BORDER;
      }
    } else {
      c.font = isBold ? BF : NF;
      c.border = BORDER;
    }
  };

  const enrollRef = (y: number) => `Assumptions!${ENROLLMENT_CELLS[y]}`;
  const adminRef = (y: number) => `Assumptions!${ADMIN_FTE_CELLS[y]}`;

  const formulaRow = (r: number, formulas: string[], results: number[], fmt: string, bold = false) => {
    for (let y = 0; y < 5; y++) {
      const cell = ws.getCell(r, y + 3);
      setFormula(cell, formulas[y], results[y]);
      cell.numFmt = fmt;
      cell.font = bold ? BF : NF;
      cell.border = bold ? SUBTOTAL_BORDER : BORDER;
      cell.alignment = { horizontal: "right" };
    }
  };

  labelCell(4, "Enrollment");
  formulaRow(4,
    [0, 1, 2, 3, 4].map(y => `${enrollRef(y)}`),
    res.enrollment, NUM);

  labelCell(5, "Tuition Revenue (Net)");
  formulaRow(5,
    [0, 1, 2, 3, 4].map(y =>
      y === 0
        ? `${enrollRef(0)}*Assumptions!D20`
        : `${enrollRef(y)}*Assumptions!D20*(1+Assumptions!D21)^${y}`
    ),
    res.tuitionRevNet, CUR);

  labelCell(6, "  × Collection Rate Applied");
  formulaRow(6,
    [0, 1, 2, 3, 4].map(y => `${YEAR_COLS[y]}5*Assumptions!D26`),
    res.tuitionCollected, CUR);

  labelCell(7, "ESA / School Choice Revenue");
  if (Number(input.hasGradeBand) === 1) {
    for (let y = 0; y < 5; y++) {
      const cell = ws.getCell(7, y + 3);
      cell.value = res.esaRevenue[y];
      cell.numFmt = CUR;
      cell.font = NF;
      cell.border = BORDER;
      cell.alignment = { horizontal: "right" };
    }
  } else {
    formulaRow(7,
      [0, 1, 2, 3, 4].map(y =>
        y === 0
          ? `${enrollRef(0)}*Assumptions!D22`
          : `${enrollRef(y)}*Assumptions!D22*(1+Assumptions!D23)^${y}`
      ),
      res.esaRevenue, CUR);
  }

  labelCell(8, "Other Earned Revenue");
  formulaRow(8,
    [0, 1, 2, 3, 4].map(y =>
      y === 0
        ? `${enrollRef(0)}*Assumptions!D24`
        : `${enrollRef(y)}*Assumptions!D24*(1+Assumptions!D25)^${y}`
    ),
    res.otherRevenue, CUR);

  labelCell(9, "Grants & Contributions");
  formulaRow(9,
    [0, 1, 2, 3, 4].map(y =>
      y === 0
        ? "Assumptions!D27"
        : `Assumptions!D27*(1+Assumptions!D28)^${y}`
    ),
    res.grants, CUR);

  labelCell(10, "Total Revenue", false, true);
  formulaRow(10,
    [0, 1, 2, 3, 4].map(y => `${YEAR_COLS[y]}6+${YEAR_COLS[y]}7+${YEAR_COLS[y]}8+${YEAR_COLS[y]}9`),
    res.totalRevenue, CUR, true);

  labelCell(12, "Teacher FTE (Enrollment ÷ Ratio)");
  formulaRow(12,
    [0, 1, 2, 3, 4].map(y => `CEILING(${enrollRef(y)}/Assumptions!D32,1)`),
    res.teacherFte, NUM);

  labelCell(13, "Teacher Salaries");
  formulaRow(13,
    [0, 1, 2, 3, 4].map(y =>
      y === 0
        ? `${YEAR_COLS[0]}12*Assumptions!D33`
        : `${YEAR_COLS[y]}12*Assumptions!D33*(1+Assumptions!D34)^${y}`
    ),
    res.teacherSalaries, CUR);

  labelCell(14, "Admin Salaries");
  formulaRow(14,
    [0, 1, 2, 3, 4].map(y =>
      y === 0
        ? `${adminRef(0)}*Assumptions!D40`
        : `${adminRef(y)}*Assumptions!D40*(1+Assumptions!D41)^${y}`
    ),
    res.adminSalaries, CUR);

  labelCell(15, "Benefits & Payroll Taxes");
  formulaRow(15,
    [0, 1, 2, 3, 4].map(y => `(${YEAR_COLS[y]}13+${YEAR_COLS[y]}14)*Assumptions!D42`),
    res.benefits, CUR);

  labelCell(16, "Total Staffing Cost", false, true);
  formulaRow(16,
    [0, 1, 2, 3, 4].map(y => `${YEAR_COLS[y]}13+${YEAR_COLS[y]}14+${YEAR_COLS[y]}15`),
    res.totalStaffing, CUR, true);

  labelCell(18, "Rent / Lease");
  formulaRow(18,
    [0, 1, 2, 3, 4].map(y =>
      y === 0
        ? "Assumptions!D46"
        : `Assumptions!D46*(1+Assumptions!D47)^${y}`
    ),
    res.rent, CUR);

  labelCell(19, "Other Facility Costs");
  formulaRow(19,
    [0, 1, 2, 3, 4].map(y =>
      y === 0
        ? "Assumptions!D48"
        : `Assumptions!D48*(1+Assumptions!D49)^${y}`
    ),
    res.otherFacility, CUR);

  labelCell(20, "Program / Curriculum");
  formulaRow(20,
    [0, 1, 2, 3, 4].map(y =>
      y === 0
        ? `${enrollRef(0)}*Assumptions!D50`
        : `${enrollRef(y)}*Assumptions!D50*(1+Assumptions!D51)^${y}`
    ),
    res.programCost, CUR);

  labelCell(21, "G&A / Technology");
  formulaRow(21,
    [0, 1, 2, 3, 4].map(y =>
      y === 0
        ? "Assumptions!D52"
        : `Assumptions!D52*(1+Assumptions!D53)^${y}`
    ),
    res.gaAndTech, CUR);

  labelCell(22, "Total Operating Expenses", false, true);
  formulaRow(22,
    [0, 1, 2, 3, 4].map(y => `${YEAR_COLS[y]}18+${YEAR_COLS[y]}19+${YEAR_COLS[y]}20+${YEAR_COLS[y]}21`),
    res.totalOpEx, CUR, true);

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
}

function buildPnL(wb: ExcelJS.Workbook, res: LenderResults) {
  const ws = wb.addWorksheet("5-Year P&L", { properties: { tabColor: { argb: "FF328555" } } });
  printSetup(ws);

  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 34;
  for (let c = 3; c <= 7; c++) ws.getColumn(c).width = 16;

  ws.getCell("B1").value = "5-Year Pro Forma Profit & Loss";
  ws.getCell("B1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1E293B" } };
  ws.mergeCells("B1:G1");

  for (let c = 3; c <= 7; c++) {
    const cell = ws.getCell(3, c);
    cell.value = `Year ${c - 2}`;
    cell.font = HEADER_FONT; cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center" }; cell.border = BORDER;
  }
  ws.getCell("B3").fill = HEADER_FILL; ws.getCell("B3").border = BORDER;
  ws.getRow(3).height = 24;

  const lbl = (r: number, text: string, bold = false) => {
    const c = ws.getCell(`B${r}`);
    c.value = text; c.font = bold ? BF : NF; c.border = BORDER;
  };

  const fRow = (r: number, sheetRef: string, rowRef: number, results: number[], fmt: string, bold = false) => {
    for (let y = 0; y < 5; y++) {
      const cell = ws.getCell(r, y + 3);
      setFormula(cell, `${sheetRef}!${YEAR_COLS[y]}${rowRef}`, results[y]);
      cell.numFmt = fmt; cell.font = bold ? BF : NF;
      cell.border = bold ? SUBTOTAL_BORDER : BORDER;
      cell.alignment = { horizontal: "right" };
    }
  };

  const localFormula = (r: number, formulas: string[], results: number[], fmt: string, bold = false, conditional = false) => {
    for (let y = 0; y < 5; y++) {
      const cell = ws.getCell(r, y + 3);
      setFormula(cell, formulas[y], results[y]);
      cell.numFmt = fmt; cell.font = bold ? BF : NF;
      cell.border = bold ? SUBTOTAL_BORDER : BORDER;
      cell.alignment = { horizontal: "right" };
      if (conditional) {
        const v = results[y];
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: v >= 0 ? GREEN_BG : RED_BG } };
      }
    }
  };

  lbl(5, "Enrollment");
  fRow(5, "Drivers", 4, res.enrollment, NUM);

  lbl(6, "Tuition Revenue (Net)");
  fRow(6, "Drivers", 6, res.tuitionCollected, CUR);

  lbl(7, "ESA / School Choice");
  fRow(7, "Drivers", 7, res.esaRevenue, CUR);

  lbl(8, "Other Revenue");
  fRow(8, "Drivers", 8, res.otherRevenue, CUR);

  lbl(9, "Grants & Contributions");
  fRow(9, "Drivers", 9, res.grants, CUR);

  lbl(10, "Total Revenue", true);
  fRow(10, "Drivers", 10, res.totalRevenue, CUR, true);

  lbl(12, "Total Staffing");
  fRow(12, "Drivers", 16, res.totalStaffing, CUR);

  lbl(13, "Total Operating Expenses");
  fRow(13, "Drivers", 22, res.totalOpEx, CUR);

  lbl(15, "Total Expenses", true);
  localFormula(15,
    [0, 1, 2, 3, 4].map(y => `${YEAR_COLS[y]}12+${YEAR_COLS[y]}13`),
    res.totalExpenses, CUR, true);

  lbl(16, "Net Operating Income (NOI)", true);
  localFormula(16,
    [0, 1, 2, 3, 4].map(y => `${YEAR_COLS[y]}10-${YEAR_COLS[y]}15`),
    res.noi, CUR, true, true);

  lbl(17, "Operating Margin");
  localFormula(17,
    [0, 1, 2, 3, 4].map(y => `IF(${YEAR_COLS[y]}10>0,${YEAR_COLS[y]}16/${YEAR_COLS[y]}10,0)`),
    res.operatingMargin, PCT);

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
}

function buildCashFlow(wb: ExcelJS.Workbook, res: LenderResults) {
  const ws = wb.addWorksheet("Cash Flow & DSCR", { properties: { tabColor: { argb: "FFD97706" } } });
  printSetup(ws);

  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 34;
  for (let c = 3; c <= 7; c++) ws.getColumn(c).width = 16;

  ws.getCell("B1").value = "Cash Flow & Debt Service Coverage";
  ws.getCell("B1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1E293B" } };
  ws.mergeCells("B1:G1");

  for (let c = 3; c <= 7; c++) {
    const cell = ws.getCell(3, c);
    cell.value = `Year ${c - 2}`;
    cell.font = HEADER_FONT; cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center" }; cell.border = BORDER;
  }
  ws.getCell("B3").fill = HEADER_FILL; ws.getCell("B3").border = BORDER;
  ws.getRow(3).height = 24;

  const lbl = (r: number, text: string, bold = false) => {
    const c = ws.getCell(`B${r}`);
    c.value = text; c.font = bold ? BF : NF; c.border = BORDER;
  };

  const pmtFormula = "IF(Assumptions!D59>0,PMT(Assumptions!D60/12,Assumptions!D61*12,-Assumptions!D59)*12,0)";

  lbl(4, "Net Operating Income");
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(4, y + 3);
    setFormula(cell, `'5-Year P&L'!${YEAR_COLS[y]}16`, res.noi[y]);
    cell.numFmt = CUR; cell.font = NF; cell.border = BORDER;
    cell.alignment = { horizontal: "right" };
  }

  lbl(6, "Existing Debt Service");
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(6, y + 3);
    setFormula(cell, "Assumptions!D58", res.existingDebtService);
    cell.numFmt = CUR; cell.font = NF; cell.border = BORDER;
    cell.alignment = { horizontal: "right" };
  }

  lbl(7, "Proposed Loan Debt Service");
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(7, y + 3);
    setFormula(cell, pmtFormula, res.proposedDebtService);
    cell.numFmt = CUR; cell.font = NF; cell.border = BORDER;
    cell.alignment = { horizontal: "right" };
  }

  lbl(8, "Total Debt Service", true);
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(8, y + 3);
    setFormula(cell, `${YEAR_COLS[y]}6+${YEAR_COLS[y]}7`, res.totalDebtService);
    cell.numFmt = CUR; cell.font = BF; cell.border = SUBTOTAL_BORDER;
    cell.alignment = { horizontal: "right" };
  }

  lbl(10, "DSCR (NOI ÷ Total Debt Service)", true);
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(10, y + 3);
    setFormula(cell,
      `IF(${YEAR_COLS[y]}8>0,${YEAR_COLS[y]}4/${YEAR_COLS[y]}8,IF(${YEAR_COLS[y]}4>0,99.9,0))`,
      res.dscr[y]);
    cell.numFmt = "0.00x";
    cell.font = BF; cell.border = BORDER;
    cell.alignment = { horizontal: "right" };
    const v = res.dscr[y];
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: v >= 1.2 ? GREEN_BG : v >= 1.0 ? AMBER_BG : RED_BG } };
  }

  lbl(12, "Net Income After Debt");
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(12, y + 3);
    setFormula(cell, `${YEAR_COLS[y]}4-${YEAR_COLS[y]}8`, res.netIncomeAfterDebt[y]);
    cell.numFmt = CUR; cell.font = NF; cell.border = BORDER;
    cell.alignment = { horizontal: "right" };
  }

  lbl(14, "Cumulative Cash", true);
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(14, y + 3);
    const f = y === 0
      ? `Assumptions!D57+${YEAR_COLS[0]}12`
      : `${YEAR_COLS[y - 1]}14+${YEAR_COLS[y]}12`;
    setFormula(cell, f, res.cumulativeCash[y]);
    cell.numFmt = CUR; cell.font = BF; cell.border = BORDER;
    cell.alignment = { horizontal: "right" };
    const v = res.cumulativeCash[y];
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: v >= 0 ? GREEN_BG : RED_BG } };
  }

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
}

function buildStaffing(wb: ExcelJS.Workbook, res: LenderResults) {
  const ws = wb.addWorksheet("Staffing", { properties: { tabColor: { argb: "FF0D9488" } } });
  printSetup(ws);

  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 34;
  for (let c = 3; c <= 7; c++) ws.getColumn(c).width = 16;

  ws.getCell("B1").value = "Staffing Detail";
  ws.getCell("B1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1E293B" } };
  ws.mergeCells("B1:G1");

  for (let c = 3; c <= 7; c++) {
    const cell = ws.getCell(3, c);
    cell.value = `Year ${c - 2}`;
    cell.font = HEADER_FONT; cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center" }; cell.border = BORDER;
  }
  ws.getCell("B3").fill = HEADER_FILL; ws.getCell("B3").border = BORDER;
  ws.getRow(3).height = 24;

  const lbl = (r: number, text: string, bold = false) => {
    const c = ws.getCell(`B${r}`);
    c.value = text; c.font = bold ? BF : NF; c.border = BORDER;
  };

  lbl(4, "Teacher FTE");
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(4, y + 3);
    setFormula(cell, `Drivers!${YEAR_COLS[y]}12`, res.teacherFte[y]);
    cell.numFmt = NUM; cell.font = NF; cell.border = BORDER;
    cell.alignment = { horizontal: "right" };
  }

  lbl(5, "Admin FTE");
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(5, y + 3);
    setFormula(cell, `Assumptions!${ADMIN_FTE_CELLS[y]}`, res.adminFte[y]);
    cell.numFmt = NUM; cell.font = NF; cell.border = BORDER;
    cell.alignment = { horizontal: "right" };
  }

  lbl(6, "Total FTE", true);
  for (let y = 0; y < 5; y++) {
    const cell = ws.getCell(6, y + 3);
    setFormula(cell, `${YEAR_COLS[y]}4+${YEAR_COLS[y]}5`, res.teacherFte[y] + res.adminFte[y]);
    cell.numFmt = NUM; cell.font = BF; cell.border = SUBTOTAL_BORDER;
    cell.alignment = { horizontal: "right" };
  }

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
}

function buildLoanSnapshot(wb: ExcelJS.Workbook, input: Record<string, string | number>, res: LenderResults) {
  const ws = wb.addWorksheet("Loan Snapshot", { properties: { tabColor: { argb: "FFD97706" } } });
  printSetup(ws);

  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 22;

  ws.getCell("B1").value = "Proposed Loan Summary";
  ws.getCell("B1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1E293B" } };
  ws.mergeCells("B1:C1");

  const lbl = (r: number, text: string) => {
    const c = ws.getCell(`B${r}`);
    c.value = text; c.font = NF; c.border = BORDER;
  };

  lbl(3, "Loan Amount");
  const c3 = ws.getCell("C3");
  setFormula(c3, "Assumptions!D59", Number(input.proposedLoanAmount) || 0);
  c3.numFmt = CUR; c3.font = NF; c3.border = BORDER; c3.alignment = { horizontal: "right" };

  lbl(4, "Interest Rate");
  const c4 = ws.getCell("C4");
  setFormula(c4, "Assumptions!D60", Number(input.interestRatePct) || 0);
  c4.numFmt = PCT; c4.font = NF; c4.border = BORDER; c4.alignment = { horizontal: "right" };

  lbl(5, "Term (Years)");
  const c5 = ws.getCell("C5");
  setFormula(c5, "Assumptions!D61", Number(input.termYears) || 0);
  c5.numFmt = NUM; c5.font = NF; c5.border = BORDER; c5.alignment = { horizontal: "right" };

  lbl(6, "Annual Debt Service");
  const c6 = ws.getCell("C6");
  setFormula(c6, "IF(Assumptions!D59>0,PMT(Assumptions!D60/12,Assumptions!D61*12,-Assumptions!D59)*12,0)", res.proposedDebtService);
  c6.numFmt = CUR; c6.font = BF; c6.border = BORDER; c6.alignment = { horizontal: "right" };

  lbl(8, "Year 1 DSCR");
  const c8 = ws.getCell("C8");
  setFormula(c8, "'Cash Flow & DSCR'!C10", res.dscr[0]);
  c8.numFmt = "0.00x"; c8.font = BF; c8.border = BORDER; c8.alignment = { horizontal: "right" };
  const v = res.dscr[0];
  c8.fill = { type: "pattern", pattern: "solid", fgColor: { argb: v >= 1.2 ? GREEN_BG : v >= 1.0 ? AMBER_BG : RED_BG } };
}

function buildSummary(wb: ExcelJS.Workbook, input: Record<string, string | number>, res: LenderResults) {
  const ws = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FF328555" } } });
  printSetup(ws);

  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 34;
  ws.getColumn(3).width = 30;

  ws.getCell("B1").value = "Model Summary";
  ws.getCell("B1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF1E293B" } };
  ws.mergeCells("B1:C1");

  const lbl = (r: number, text: string) => {
    const c = ws.getCell(`B${r}`);
    c.value = text; c.font = NF; c.border = BORDER;
  };

  lbl(3, "School Name");
  const s3 = ws.getCell("C3");
  setFormula(s3, "Assumptions!D5", String(input.schoolName || ""));
  s3.font = NF; s3.border = BORDER;

  lbl(4, "School Type");
  const s4 = ws.getCell("C4");
  setFormula(s4, "Assumptions!D7", String(input.schoolType || ""));
  s4.font = NF; s4.border = BORDER;

  lbl(5, "State");
  const s5 = ws.getCell("C5");
  setFormula(s5, "Assumptions!D6", String(input.state || ""));
  s5.font = NF; s5.border = BORDER;

  lbl(6, "Opening Year");
  const s6 = ws.getCell("C6");
  setFormula(s6, "Assumptions!D8", Number(input.firstOperatingYear) || 0);
  s6.font = NF; s6.border = BORDER;

  lbl(8, "Year 5 Enrollment");
  const s8 = ws.getCell("C8");
  setFormula(s8, "Assumptions!D16", res.enrollment[4]);
  s8.numFmt = NUM; s8.font = NF; s8.border = BORDER; s8.alignment = { horizontal: "right" };

  lbl(9, "Year 5 Revenue");
  const s9 = ws.getCell("C9");
  setFormula(s9, "Drivers!G10", res.totalRevenue[4]);
  s9.numFmt = CUR; s9.font = NF; s9.border = BORDER; s9.alignment = { horizontal: "right" };

  lbl(10, "Year 5 NOI");
  const s10 = ws.getCell("C10");
  setFormula(s10, "'5-Year P&L'!G16", res.noi[4]);
  s10.numFmt = CUR; s10.font = BF; s10.border = BORDER; s10.alignment = { horizontal: "right" };
  s10.fill = { type: "pattern", pattern: "solid", fgColor: { argb: res.noi[4] >= 0 ? GREEN_BG : RED_BG } };

  ws.getCell("B12").value = "Generated by SchoolStack Budget (budget.schoolstack.ai)";
  ws.getCell("B12").font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF6B7280" } };
  ws.mergeCells("B12:C12");
}

export async function generateLenderProFormaWorkbook(rawData: Record<string, unknown>): Promise<Buffer> {
  const input = mapModelToTemplateInput(rawData);
  const res = computeLenderResults(input);

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolStack Budget";
  wb.created = new Date();

  buildCover(wb, String(input.schoolName || ""));
  buildAssumptions(wb, input);
  buildDrivers(wb, input, res);
  buildPnL(wb, res);
  buildCashFlow(wb, res);
  buildStaffing(wb, res);
  buildLoanSnapshot(wb, input, res);
  buildSummary(wb, input, res);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
