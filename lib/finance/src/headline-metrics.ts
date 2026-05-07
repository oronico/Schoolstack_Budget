/**
 * Canonical helpers for the two headline lender / board ratios that
 * historically drifted across surfaces (Task #618 / #684).
 *
 * Both helpers operate on already-computed annual `YearFinancials`-like
 * inputs (whatever shape a caller has — `consultant-engine`'s
 * `YearFinancials`, the canonical `ScenarioMetrics.netIncome[]`, etc.) so
 * downstream code never has to re-implement the formulas inline.
 *
 * If you need the headline numbers off a model directly, prefer
 * `computeBaseFinancials(data)` from `./decision-engine/scenario-engine`
 * — it returns `breakEvenYear` and `dscr[]` already wired through these
 * same definitions.
 */

/** Year-financials shape needed to derive a year's DSCR. */
export interface DscrYearLike {
  netIncome: number;
  /** Annual loan-only debt service if available (preferred), else total. */
  loanDebtService?: number;
  debtService: number;
}

/**
 * DSCR for a single year using the canonical (NetIncome + DebtService) /
 * DebtService definition. Returns `null` when the year carries no debt
 * (lender DSCR is undefined without a denominator). Callers that want a
 * 0 fallback in that case (e.g. response payloads that always emit a
 * number) can `?? 0` at the call site.
 *
 * Prefers `loanDebtService` over `debtService` when both are present so
 * the DSCR matches the canonical lender stress-test definition (loans
 * only, excluding lease/cap-ex spend that already lives in opex).
 */
export function computeAnnualDscr(yf: DscrYearLike): number | null {
  const ds = yf.loanDebtService ?? yf.debtService;
  if (!ds || ds <= 0) return null;
  return (yf.netIncome + ds) / ds;
}

/** Year-financials shape needed to find break-even year. */
export interface BreakEvenYearLike {
  netIncome: number;
}

/**
 * Index-based break-even year: the 1-indexed first year whose net income
 * is non-negative, or `null` if no modeled year breaks even. Mirrors the
 * `breakEvenYear` field on `ScenarioMetrics` from
 * `computeBaseFinancials`.
 */
export function breakEvenYearFromAnnual(
  yearFinancials: ReadonlyArray<BreakEvenYearLike>,
): number | null {
  for (let i = 0; i < yearFinancials.length; i++) {
    if (yearFinancials[i].netIncome >= 0) return i + 1;
  }
  return null;
}
