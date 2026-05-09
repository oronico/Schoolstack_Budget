/**
 * Task #704 (Phases 6–9): per-step ratio + flag helpers used by the
 * wizard's RevenueStep, EnrollmentStep, StaffingStep, and ExpenseStep
 * polish panels. Pure functions so the wizard, tests, and exports can
 * share the same math without duplicating thresholds.
 *
 * NOTE: these intentionally do *not* duplicate scenario-engine break-even
 * math. They are lightweight founder-facing approximations the wizard
 * uses to surface in-context coaching while the canonical engine
 * remains the source of truth for dashboards and lender packets.
 */

/** Result type for {@link assessGrowthReasonable}. */
export type GrowthReasonableness = "ok" | "aggressive" | "very_aggressive";

/**
 * Compute the enrollment headcount needed to cover a fixed cost block
 * (staffing OR facility) at a given average revenue per student. Returns
 * `null` when revenue per student is missing or non-positive — the caller
 * should render a "set tuition / per-pupil to see this" placeholder.
 *
 * Always rounds *up* — covering a $100k staffing block at $10k/student is
 * 10 students, but $100,001 needs 11 (you can't enroll a fractional kid).
 */
export function enrollmentToCoverCost(
  costAnnual: number,
  revenuePerStudent: number,
): number | null {
  if (!Number.isFinite(costAnnual) || costAnnual <= 0) return 0;
  if (!Number.isFinite(revenuePerStudent) || revenuePerStudent <= 0) return null;
  return Math.ceil(costAnnual / revenuePerStudent);
}

/**
 * Compute capacity utilization as a 0-1 fraction. Returns null when
 * capacity is unset/zero so the UI can render a "set max capacity"
 * placeholder rather than NaN.
 */
export function utilizationFraction(
  enrollment: number,
  capacity: number,
): number | null {
  if (!Number.isFinite(capacity) || capacity <= 0) return null;
  if (!Number.isFinite(enrollment) || enrollment < 0) return 0;
  return enrollment / capacity;
}

/**
 * Year-over-year growth reasonableness flag. The brief asks the wizard
 * to "flag aggressive growth gently" — we use the same 25% threshold the
 * existing EnrollmentStep warning already uses so the new ratios panel
 * doesn't disagree with the inline alert. >50% YoY is the "very
 * aggressive" tier (a doubling-every-2-years pace).
 */
export function assessGrowthReasonable(
  prev: number,
  curr: number,
): GrowthReasonableness {
  if (!Number.isFinite(prev) || prev <= 0) return "ok";
  if (!Number.isFinite(curr) || curr <= 0) return "ok";
  const growth = (curr - prev) / prev;
  if (growth > 0.5) return "very_aggressive";
  if (growth > 0.25) return "aggressive";
  return "ok";
}

/**
 * Staffing as a fraction of revenue (0-1). Returns null when revenue is
 * zero so the UI can show a placeholder instead of Infinity.
 */
export function staffingFractionOfRevenue(
  staffingCost: number,
  revenue: number,
): number | null {
  if (!Number.isFinite(revenue) || revenue <= 0) return null;
  return Math.max(0, staffingCost) / revenue;
}

/**
 * Facility burden as a fraction of revenue (0-1). Same null semantics as
 * {@link staffingFractionOfRevenue} — covers rent + utilities + insurance
 * + maintenance + occupancy line items the founder has captured.
 */
export function facilityBurdenFractionOfRevenue(
  facilityCost: number,
  revenue: number,
): number | null {
  if (!Number.isFinite(revenue) || revenue <= 0) return null;
  return Math.max(0, facilityCost) / revenue;
}

/**
 * Effective students-per-teacher ratio. Returns null when teacher FTE is
 * zero (a school with zero teachers has no meaningful ratio). Rounded to
 * one decimal for display.
 */
export function studentsPerTeacherActual(
  students: number,
  teacherFte: number,
): number | null {
  if (!Number.isFinite(teacherFte) || teacherFte <= 0) return null;
  if (!Number.isFinite(students) || students < 0) return 0;
  return Math.round((students / teacherFte) * 10) / 10;
}

/**
 * Loaded personnel cost = base salary × (1 + benefitsRate + payrollTaxRate).
 * Both rates are expected as 0-1 fractions (e.g. 0.18 for 18%). The 4-step
 * polish panels show this so a founder sees the true cost of a hire vs.
 * the headline salary number.
 */
export function loadedPersonnelCost(
  salary: number,
  benefitsRate: number,
  payrollTaxRate: number,
): number {
  if (!Number.isFinite(salary) || salary <= 0) return 0;
  const benefits = Number.isFinite(benefitsRate) ? Math.max(0, benefitsRate) : 0;
  const tax = Number.isFinite(payrollTaxRate) ? Math.max(0, payrollTaxRate) : 0;
  return salary * (1 + benefits + tax);
}

/**
 * Whether the model includes any founder compensation. The brief says
 * lenders/boards underwrite to the *market* cost of running the school,
 * so the wizard surfaces a "founder comp included / not included" badge
 * — this returns the boolean that drives that badge.
 */
export function founderCompIsIncluded(
  reportedFounderCompByYear: ReadonlyArray<number | undefined> | undefined,
): boolean {
  if (!reportedFounderCompByYear || reportedFounderCompByYear.length === 0) return false;
  return reportedFounderCompByYear.some((v) => Number.isFinite(v) && (v ?? 0) > 0);
}
