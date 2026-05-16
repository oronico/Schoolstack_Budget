/**
 * Task #937 — Centralized formatter for `cashRunwayMonths`.
 *
 * `cashRunwayMonths` is a fractional coverage ratio (year-end cash /
 * monthly fixed costs) so raw template-literal interpolation leaks
 * values like `11.122823375736088 months` into lender/board PDFs.
 *
 * Every packet narrative, KPI row, stress-test table, and email
 * template that renders the runway should go through this helper so
 * the surface always shows a clean 1-decimal number, with the
 * "60+ months" cap applied consistently.
 */
export function formatRunwayMonths(months: number): string {
  if (!Number.isFinite(months)) return "0.0 months";
  if (months >= 60) return "60+ months";
  return `${months.toFixed(1)} months`;
}

/**
 * Short variant that drops the " months" suffix — useful inside table
 * cells where the column header already says "Runway (mo)".
 */
export function formatRunwayMonthsShort(months: number): string {
  if (!Number.isFinite(months)) return "0.0";
  if (months >= 60) return "60+";
  return months.toFixed(1);
}
