// Helpers that turn category / row totals into the "$X / student / yr" lens
// the wizard surfaces next to numeric totals so founders can sanity-check
// against benchmarks (and so lenders can compare across schools).
//
// The helpers are pure and intentionally narrow — formatting concerns live
// alongside the math so callers don't have to re-derive Intl.NumberFormat
// or remember to short-circuit on zero enrollment. Used by the wizard step
// cards (Revenue, Staffing, Expenses) and unit-tested in
// `__tests__/per-student-lens.test.ts`.

const PLACEHOLDER = "—";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export interface PerStudentOptions {
  /** Suffix appended to the formatted currency. Defaults to ` / student / yr`. */
  suffix?: string;
  /** Allow negative values (e.g. tuition discounts). Defaults to true. */
  allowNegative?: boolean;
}

/**
 * Format a Year-1 total as a per-student figure.
 *
 * Returns the placeholder string ("—") when enrollment is zero / missing or
 * when the total is not a finite number. Negative totals are formatted as
 * negative currency unless `allowNegative` is `false` (in which case zero is
 * returned).
 */
export function formatPerStudent(
  total: number,
  y1Enrollment: number,
  opts: PerStudentOptions = {},
): string {
  if (!Number.isFinite(total) || !Number.isFinite(y1Enrollment)) return PLACEHOLDER;
  if (y1Enrollment <= 0) return PLACEHOLDER;
  const allowNegative = opts.allowNegative ?? true;
  const raw = total / y1Enrollment;
  if (!Number.isFinite(raw)) return PLACEHOLDER;
  const value = allowNegative ? raw : Math.max(0, raw);
  const rounded = Math.round(value);
  const suffix = opts.suffix ?? " / student / yr";
  return `${currencyFormatter.format(rounded)}${suffix}`;
}

/**
 * Format a Year-1 total as a per-FTE figure.
 *
 * A staffing-specific variant — when total FTE is zero the placeholder is
 * returned. Useful for the Staffing step's category-level "$X / FTE" lens
 * which is a more honest comparison for fixed-headcount roles than per
 * student.
 */
export function formatPerFte(total: number, totalFte: number): string {
  if (!Number.isFinite(total) || !Number.isFinite(totalFte)) return PLACEHOLDER;
  if (totalFte <= 0) return PLACEHOLDER;
  const value = total / totalFte;
  if (!Number.isFinite(value)) return PLACEHOLDER;
  const rounded = Math.round(value);
  return `${currencyFormatter.format(rounded)} / FTE`;
}

/**
 * Numeric per-student value (no formatting). Returns null when enrollment is
 * non-positive, total is non-finite, or the math yields a non-finite result.
 * Callers that want to surface their own copy / formatting can use this and
 * skip `formatPerStudent`.
 */
export function perStudentValue(
  total: number,
  y1Enrollment: number,
): number | null {
  if (!Number.isFinite(total) || !Number.isFinite(y1Enrollment)) return null;
  if (y1Enrollment <= 0) return null;
  const value = total / y1Enrollment;
  if (!Number.isFinite(value)) return null;
  return value;
}
