import type {
  ChestertonData,
  ChestertonGradeRow,
  ChestertonSubjectRow,
} from "../../pages/model-wizard/schema";

export const CHESTERTON_YEAR_COUNT = 7;

export interface ChestertonProjectionRow {
  yearIndex: number;
  yearLabel: string;
  schoolYearLabel: string;
  enrollment: number;
  netRevenue: number;
  operatingExpense: number;
  fundraisingGap: number;
}

export interface ChestertonProjections {
  rows: ChestertonProjectionRow[];
  totalFundraisingGoal: number;
}

const GA_DEFAULT_FACTORS: number[] = [
  1700, 0, 400, 175, 125, 0, 0, 125, 225, 0, 675, 0, 0,
];
const GA_DEFAULT_TOTAL_PER_STUDENT = GA_DEFAULT_FACTORS.reduce((s, x) => s + x, 0);

// CSN-recommended Year 1 starting salaries for each admin role, mirroring
// `chesterton-operating-manual.ts`. Year 0 = $0 (pre-launch, no payroll).
// Years 2-6 escalate per-role by `adminSalaryGrowthRate` (default 3%) and
// each role is rounded to whole dollars before summing — matching the
// workbook's `=ROUND(C*(1+g)^offset, 0)` formula and `SUM(...)` subtotal.
const ADMIN_RECOMMENDED_Y1: number[] = [
  65000, // Headmaster Admin Salary
  60000, // Executive Director
  50000, // Advancement Director
  40000, // School Administrator
  40000, // Marketing/Communications
  45000, // Business Manager / Accountant
  40000, // Admissions
];
const ADMIN_GROWTH_DEFAULT = 0.03;

function totalAdminSalariesForYear(yearIndex: number, growth: number): number {
  if (yearIndex <= 0) return 0;
  if (yearIndex === 1) return ADMIN_RECOMMENDED_Y1.reduce((s, x) => s + x, 0);
  const offset = yearIndex - 1;
  return ADMIN_RECOMMENDED_Y1.reduce(
    (s, base) => s + Math.round(base * Math.pow(1 + growth, offset)),
    0,
  );
}

const YEAR_KEYS: Array<keyof Omit<ChestertonGradeRow, "grade">> = [
  "year0", "year1", "year2", "year3", "year4", "year5",
];

function totalEnrollment(rows: ChestertonGradeRow[] | undefined, yearKey: keyof Omit<ChestertonGradeRow, "grade">): number {
  if (!rows) return 0;
  return rows.reduce((sum, r) => sum + (Number(r[yearKey]) || 0), 0);
}

function tuitionForYear(yearIndex: number, startingTuition: number, growth: number): number {
  // Year 0 (offset -1) and Year 1 (offset 0) both = startingTuition.
  // Year 2+ escalate by CEILING(.,50) per the CSN manual.
  const offset = yearIndex - 1;
  if (offset <= 0) return startingTuition;
  return Math.ceil((startingTuition * Math.pow(1 + growth, offset)) / 50) * 50;
}

function facultyCostForYear(
  enrollment: number,
  subjects: ChestertonSubjectRow[] | undefined,
  startingTeacherSalary: number,
): number {
  if (enrollment <= 0 || !subjects?.length) return 0;
  const perPeriod = startingTeacherSalary / 5;
  const sectionsNeeded = Math.max(1, Math.ceil(enrollment / 25));
  return subjects.reduce((sum, s) => sum + perPeriod * (Number(s.periodsPerSection) || 0) * sectionsNeeded, 0);
}

export function computeChestertonProjections(data: ChestertonData | undefined): ChestertonProjections {
  const planningYear = Number(data?.planningYear) || new Date().getFullYear() + 1;
  const startingTuition = Number(data?.startingTuition) || 0;
  const growth = Number(data?.tuitionGrowthRate) || 0;
  const bookFee = Number(data?.bookSupplyFee) || 0;
  const aidPct = Number(data?.financialAidPct) || 0;
  const startingTeacherSalary = Number(data?.startingTeacherSalary) || 0;
  const phaseEnrollment = data?.phaseEnrollment;
  const subjects = data?.salarySchedule;

  const rows: ChestertonProjectionRow[] = [];
  for (let i = 0; i < CHESTERTON_YEAR_COUNT; i++) {
    // Year 6 mirrors Year 5 in the source workbook (no schema field for it).
    const enrollment = i < YEAR_KEYS.length
      ? totalEnrollment(phaseEnrollment, YEAR_KEYS[i])
      : totalEnrollment(phaseEnrollment, YEAR_KEYS[YEAR_KEYS.length - 1]);

    const tuition = tuitionForYear(i, startingTuition, growth);
    const gross = tuition * enrollment;
    const aid = -gross * aidPct;
    const bookRev = bookFee * enrollment;
    const netRevenue = gross + aid + bookRev;

    const faculty = facultyCostForYear(enrollment, subjects, startingTeacherSalary);
    // The wizard schema does not surface an admin growth override, so we
    // mirror the workbook's default of 3%/yr (`adminSalaryGrowthRate ?? 0.03`
    // in `chesterton-operating-manual.ts`). When no chesterton data is loaded
    // yet, leave the dashboard fully zeroed — defaulted admin salaries would
    // be misleading without the rest of the inputs in place.
    const adminSalaries = data ? totalAdminSalariesForYear(i, ADMIN_GROWTH_DEFAULT) : 0;
    // G&A only populates Year 1+ in the workbook; Year 0 = 0.
    const ga = i === 0 ? 0 : GA_DEFAULT_TOTAL_PER_STUDENT * enrollment;
    const operatingExpense = adminSalaries + faculty + ga;
    const fundraisingGap = operatingExpense - netRevenue;

    const yearStart = planningYear + (i - 1);
    const yearEnd = String((yearStart + 1) % 100).padStart(2, "0");
    rows.push({
      yearIndex: i,
      yearLabel: `Year ${i}`,
      schoolYearLabel: `${yearStart}-${yearEnd}`,
      enrollment,
      netRevenue,
      operatingExpense,
      fundraisingGap,
    });
  }

  return {
    rows,
    totalFundraisingGoal: Number(data?.totalFundraisingGoal) || 0,
  };
}
