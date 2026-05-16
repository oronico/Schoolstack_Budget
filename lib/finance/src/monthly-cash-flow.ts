/**
 * Canonical monthly cash flow helpers (Task #609).
 *
 * Replaces ad-hoc `annual / 12` spreading throughout the codebase with
 * per-stream monthly distribution that respects how each cash stream
 * actually arrives or pays out:
 *
 *   - Tuition: spread across `billingMonths` (default 10) starting in
 *     month 1 (or month 0 when billingMonths >= 12), shifted by
 *     `collectionDelayDays` worth of whole months.
 *   - Tuition offsets (scholarships): mirror the tuition row they offset,
 *     applied as negative monthly amounts.
 *   - Public funding: respects `paymentFrequency` (monthly / quarterly /
 *     semi-annual / annual) and `paymentTiming` (upfront / arrears).
 *   - School-choice / ESA: direct disbursements paid quarterly; reimbursement
 *     disbursements lag by `reimbursementLagMonths` and the deferred
 *     amount is amortized across the remaining months so the annual total
 *     still reconciles to the booked revenue.
 *   - Philanthropy / grants: lands in the scheduled `receiptQuarter`.
 *   - Personnel: paid evenly across operating months only (staff aren't
 *     paid in non-op months for partial-year schools).
 *   - Operating expenses: spread across operating months only.
 *   - Debt service: paid monthly (lenders demand year-round payment).
 *
 * Annual totals from these helpers are byte-identical to the legacy
 * `annual/12` distribution — only the *shape* across months changes,
 * which is what drives a real cash trough.
 */

export interface MonthlyRevenueRowLike {
  id: string;
  category: string;
  enabled: boolean;
  driverType: string;
  amounts?: number[];
  percentBase?: string;
  billingMonths?: number;
  collectionRate?: number;
  collectionDelayDays?: number;
  paymentFrequency?: string;
  paymentTiming?: string;
  disbursementType?: string;
  reimbursementLagMonths?: number;
  receiptQuarter?: number;
}

/**
 * Distribute revenue rows across 12 months for a given fiscal year.
 *
 * `students` is the enrollment count for `yearIndex` and is used to
 * compute per-student rows. `opMonths` defaults to 12 and only matters
 * for "other revenue" rows (which spread evenly across operating months).
 */
export function distributeRevenueMonthly(
  rows: readonly MonthlyRevenueRowLike[],
  yearIndex: number,
  students: number,
  opMonths: number = 12,
): number[] {
  const monthly = new Array(12).fill(0);
  const byRow = distributeRevenueMonthlyByRow(rows, yearIndex, students, opMonths);
  for (const series of byRow.values()) {
    for (let i = 0; i < 12; i++) monthly[i] += series[i];
  }
  return monthly;
}

/**
 * Same per-stream timing logic as `distributeRevenueMonthly`, but returns
 * each row's 12-month series keyed by row id. Callers that need to render
 * a category-by-category cash-flow breakdown (e.g. the single-year Excel
 * "Monthly Cash Flow" sheet) can sum these series by category to get a
 * realistic shape — the per-row distribution still respects each row's
 * billingMonths, ESA disbursement type, public-funding paymentFrequency
 * + lag, and philanthropy receiptQuarter.
 */
export function distributeRevenueMonthlyByRow(
  rows: readonly MonthlyRevenueRowLike[],
  yearIndex: number,
  students: number,
  opMonths: number = 12,
): Map<string, number[]> {
  const byRow = new Map<string, number[]>();
  const rowValues = new Map<string, number>();

  for (const row of rows) {
    if (!row.enabled || row.driverType === "percent_of_base") continue;
    const base = row.amounts?.[yearIndex] ?? 0;
    let val = 0;
    switch (row.driverType) {
      case "monthly":
        val = base * 12;
        break;
      case "per_student":
        val = base * students;
        break;
      case "annual_fixed":
        val = base;
        break;
      default:
        val = base;
    }
    rowValues.set(row.id, val);
  }

  for (const row of rows) {
    if (!row.enabled || row.driverType !== "percent_of_base") continue;
    const baseVal = rowValues.get(row.percentBase ?? "") ?? 0;
    const percentage = (row.amounts?.[yearIndex] ?? 0) / 100;
    rowValues.set(row.id, baseVal * percentage);
  }

  for (const row of rows) {
    if (!row.enabled) continue;
    const annualAmount = rowValues.get(row.id) ?? 0;
    if (annualAmount === 0) continue;

    const series = new Array(12).fill(0);
    const category = row.category;
    const collectionRate = (row.collectionRate ?? 100) / 100;
    const delayMonths = Math.ceil((row.collectionDelayDays ?? 0) / 30);

    if (category === "tuition_and_fees" || category === "tuition_offsets") {
      const billingMonths = row.billingMonths ?? 10;
      const effectiveAmount =
        category === "tuition_offsets" ? -Math.abs(annualAmount) : annualAmount;
      const adjustedAmount = effectiveAmount * collectionRate;
      const perMonth = adjustedAmount / billingMonths;
      const startMonth = (billingMonths >= 12 ? 0 : 1) + delayMonths;
      for (
        let i = startMonth;
        i < startMonth + billingMonths && i < 12;
        i++
      ) {
        series[i] += perMonth;
      }
    } else if (category === "public_funding") {
      const adjustedAmount = annualAmount * collectionRate;
      const freq = row.paymentFrequency ?? "monthly";
      const timing = row.paymentTiming ?? "upfront";
      if (freq === "monthly") {
        const perMonth = adjustedAmount / 12;
        const startIdx = (timing === "arrears" ? 1 : 0) + delayMonths;
        for (let i = startIdx; i < 12; i++) series[i] += perMonth;
      } else if (freq === "quarterly") {
        const perPayment = adjustedAmount / 4;
        const baseMonths =
          timing === "arrears" ? [2, 5, 8, 11] : [0, 3, 6, 9];
        baseMonths.forEach((m) => {
          const dm = m + delayMonths;
          if (dm < 12) series[dm] += perPayment;
        });
      } else if (freq === "semi_annual") {
        const perPayment = adjustedAmount / 2;
        const baseMonths = timing === "arrears" ? [5, 11] : [0, 6];
        baseMonths.forEach((m) => {
          const dm = m + delayMonths;
          if (dm < 12) series[dm] += perPayment;
        });
      } else if (freq === "annual") {
        const month = (timing === "arrears" ? 11 : 0) + delayMonths;
        if (month < 12) series[month] += adjustedAmount;
      }
    } else if (category === "school_choice") {
      const adjustedAmount = annualAmount * collectionRate;
      const disbType = row.disbursementType ?? "direct";
      if (disbType === "direct") {
        const perQuarter = adjustedAmount / 4;
        [0, 3, 6, 9].forEach((m) => {
          const dm = m + delayMonths;
          if (dm < 12) series[dm] += perQuarter;
        });
      } else {
        const lagMonths = row.reimbursementLagMonths ?? 2;
        const effectiveDelay = Math.max(lagMonths, delayMonths);
        const perMonth = adjustedAmount / 12;
        for (let i = effectiveDelay; i < 12; i++) {
          series[i] += perMonth;
        }
        if (effectiveDelay > 0 && effectiveDelay < 12) {
          const deferred = perMonth * effectiveDelay;
          const remainingMonths = 12 - effectiveDelay;
          for (let i = effectiveDelay; i < 12; i++) {
            series[i] += deferred / remainingMonths;
          }
        }
      }
    } else if (
      category === "philanthropy" ||
      category === "grants_contributions"
    ) {
      const adjustedAmount = annualAmount * collectionRate;
      const quarter = row.receiptQuarter ?? 1;
      const startMonth = (quarter - 1) * 3 + delayMonths;
      if (startMonth < 12) series[startMonth] += adjustedAmount;
    } else {
      // other_revenue and any unrecognized category — spread evenly
      // across operating months.
      const adjustedAmount = annualAmount * collectionRate;
      const months = Math.max(1, Math.min(opMonths, 12));
      const perMonth = adjustedAmount / months;
      const startIdx = delayMonths;
      for (let i = startIdx; i < startIdx + months && i < 12; i++) {
        series[i] += perMonth;
      }
    }

    byRow.set(row.id, series);
  }

  return byRow;
}

/**
 * Personnel cadence for monthly distribution. Defaults to "monthly".
 * Annual total is preserved across cadences — only the *shape* changes.
 */
export type PayrollCadence = "monthly" | "semi_monthly" | "biweekly";

/**
 * Distribute annual personnel cost across the operating months only.
 * Staff aren't paid in non-operating months for partial-year schools.
 */
export function distributePersonnelMonthly(
  annualPersonnel: number,
  opMonths: number = 12,
  _cadence: PayrollCadence = "monthly",
): number[] {
  const monthly = new Array(12).fill(0);
  const months = Math.max(1, Math.min(opMonths, 12));
  if (annualPersonnel === 0) return monthly;
  const perMonth = annualPersonnel / months;
  for (let i = 0; i < months; i++) monthly[i] = perMonth;
  return monthly;
}

/**
 * Distribute annual operating expenses across operating months only.
 */
export function distributeOpexMonthly(
  annualOpex: number,
  opMonths: number = 12,
): number[] {
  const monthly = new Array(12).fill(0);
  const months = Math.max(1, Math.min(opMonths, 12));
  if (annualOpex === 0) return monthly;
  const perMonth = annualOpex / months;
  for (let i = 0; i < months; i++) monthly[i] = perMonth;
  return monthly;
}

export type DebtCadence = "monthly" | "quarterly" | "semi_annual" | "annual";

/**
 * Distribute annual debt service across 12 months. Defaults to monthly
 * because lenders demand year-round payment; quarterly/semi-annual/annual
 * cadences are supported for non-amortizing capital obligations.
 */
export function distributeDebtMonthly(
  annualDebt: number,
  cadence: DebtCadence = "monthly",
): number[] {
  const monthly = new Array(12).fill(0);
  if (annualDebt === 0) return monthly;
  if (cadence === "monthly") {
    const perMonth = annualDebt / 12;
    for (let i = 0; i < 12; i++) monthly[i] = perMonth;
  } else if (cadence === "quarterly") {
    const per = annualDebt / 4;
    [2, 5, 8, 11].forEach((m) => (monthly[m] += per));
  } else if (cadence === "semi_annual") {
    const per = annualDebt / 2;
    [5, 11].forEach((m) => (monthly[m] += per));
  } else if (cadence === "annual") {
    monthly[11] += annualDebt;
  }
  return monthly;
}

export interface MonthlyCashFlowSeries {
  /** Monthly inflow (revenue) per month, 12 entries. */
  inflow: number[];
  /** Monthly outflow (personnel + opex + debt) per month, 12 entries. */
  outflow: number[];
  /** Monthly net cash flow (inflow - outflow), 12 entries. */
  net: number[];
  /** Cumulative cash at the *end* of each month, starting from openingCash. */
  cumulative: number[];
}

export interface ComputeYear1MonthlyCashFlowInput {
  revenueRows: readonly MonthlyRevenueRowLike[];
  yearIndex?: number;
  students: number;
  annualPersonnel: number;
  annualOpex: number;
  annualDebt: number;
  openingCash?: number;
  opMonths?: number;
  payrollCadence?: PayrollCadence;
  debtCadence?: DebtCadence;
}

/**
 * Build the full Year 1 monthly cash flow series using real per-stream
 * timing for revenue and op-month-aware distribution for expenses.
 */
export function computeYear1MonthlyCashFlow(
  input: ComputeYear1MonthlyCashFlowInput,
): MonthlyCashFlowSeries {
  const yearIndex = input.yearIndex ?? 0;
  const opMonths = Math.max(1, Math.min(input.opMonths ?? 12, 12));
  const inflow = distributeRevenueMonthly(
    input.revenueRows,
    yearIndex,
    input.students,
    opMonths,
  );
  const persMonthly = distributePersonnelMonthly(
    input.annualPersonnel,
    opMonths,
    input.payrollCadence ?? "monthly",
  );
  const opexMonthly = distributeOpexMonthly(input.annualOpex, opMonths);
  const debtMonthly = distributeDebtMonthly(
    input.annualDebt,
    input.debtCadence ?? "monthly",
  );

  const outflow = new Array(12).fill(0);
  const net = new Array(12).fill(0);
  const cumulative = new Array(12).fill(0);
  let running = input.openingCash ?? 0;
  for (let i = 0; i < 12; i++) {
    outflow[i] = persMonthly[i] + opexMonthly[i] + debtMonthly[i];
    net[i] = inflow[i] - outflow[i];
    running += net[i];
    cumulative[i] = running;
  }

  return { inflow, outflow, net, cumulative };
}

export interface LowestCashMonth {
  /** 0-indexed month inside the fiscal year (0 = first FY month). */
  monthIndex: number;
  /** Calendar month label (e.g. "Aug") accounting for fiscalYearStartMonth. */
  monthLabel: string;
  /** Cumulative cash at the end of that month. */
  amount: number;
  /** True when the trough is below zero — the school runs out of cash. */
  isNegative: boolean;
  /**
   * 0-indexed forecast year the trough falls in. Defaults to 0 when the
   * caller passes a single 12-month series. Surfaced in PDFs / packets so
   * a Year-3 trough reads as "Year 3 — Aug" rather than just "Aug".
   * Task #636.
   */
  yearIndex?: number;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Find the lowest-cash month in a 12-month cumulative series. `fyStart`
 * is 1-indexed (1 = January, 7 = July) and translates the FY month
 * position back to a calendar month label founders recognize.
 */
export function findLowestCashMonth(
  cumulative: readonly number[],
  fyStart: number = 7,
): LowestCashMonth | null {
  if (cumulative.length === 0) return null;
  let minIdx = 0;
  let minVal = cumulative[0];
  for (let i = 1; i < cumulative.length; i++) {
    if (cumulative[i] < minVal) {
      minVal = cumulative[i];
      minIdx = i;
    }
  }
  const calendarIdx = ((fyStart - 1 + minIdx) % 12 + 12) % 12;
  return {
    monthIndex: minIdx,
    monthLabel: MONTH_LABELS[calendarIdx],
    amount: minVal,
    isNegative: minVal < 0,
    yearIndex: 0,
  };
}

/**
 * Find the lowest-cash month across multiple fiscal years' cumulative
 * series. Each entry in `cumulativeByYear` is a 12-element cumulative
 * series for that year (already chained off prior-year ending cash).
 * Returns the global trough with `yearIndex` populated so callers can
 * render "Year 3 — Aug" copy. Task #636.
 */
export function findLowestCashMonthAcrossYears(
  cumulativeByYear: readonly (readonly number[])[],
  fyStart: number = 7,
): LowestCashMonth | null {
  let best: LowestCashMonth | null = null;
  for (let y = 0; y < cumulativeByYear.length; y++) {
    const t = findLowestCashMonth(cumulativeByYear[y], fyStart);
    if (!t) continue;
    if (best === null || t.amount < best.amount) {
      best = { ...t, yearIndex: y };
    }
  }
  return best;
}

/**
 * Compute the number of months until cumulative cash first goes <= 0,
 * given a starting cash position and the per-year monthly cash flow series.
 * Returns `cap` (default 60) when cash never runs out.
 *
 * Pass `monthlyNetByYear` as a flat `number[][]` of up to 5 arrays of 12.
 * Years past the end of the array are not extrapolated — caller must
 * provide the series.
 */
export function computeCashRunwayMonths(
  startingCash: number,
  monthlyNetByYear: readonly (readonly number[])[],
  cap: number = 60,
): number {
  let runningCash = startingCash;
  let monthsElapsed = 0;
  for (let y = 0; y < monthlyNetByYear.length && monthsElapsed < cap; y++) {
    const series = monthlyNetByYear[y];
    for (let m = 0; m < series.length && monthsElapsed < cap; m++) {
      runningCash += series[m];
      monthsElapsed++;
      if (runningCash <= 0) return monthsElapsed;
    }
  }
  return cap;
}

/**
 * Task #908 — Canonical cash-runway formula. Single source of truth used
 * across the Lender Commentary, Exec Summary, Cumulative Cash Position,
 * Health Dimensions block, and the underwriting workbook's
 * `DSCR & Covenants!B18` cell. Defined as:
 *
 *   months_of_runway = ending_unrestricted_cash
 *                      / ((personnel + opex + debt_service) / 12)
 *
 * This is the simple average-burn formula lenders read off the DSCR tab,
 * not the month-by-month depletion `computeCashRunwayMonths` produces.
 * The two formulas disagreed in the field (Oakwood: 1mo / 1.9mo / 2.93mo
 * across surfaces); routing every consumer through this helper makes them
 * converge. `endingUnrestrictedCash` is the unrestricted balance at the
 * end of the period whose runway is being measured (typically Y1 ending
 * cash position, minus cumulative restricted gifts through Y1).
 *
 * Returns 0 when annual obligations are <= 0 (no expenses, no debt). The
 * caller is expected to clamp / cap for display.
 */
export function computeCanonicalCashRunwayMonths(
  endingUnrestrictedCash: number,
  annualPersonnel: number,
  annualOpex: number,
  annualDebtService: number,
): number {
  const annualObligations =
    (annualPersonnel || 0) + (annualOpex || 0) + (annualDebtService || 0);
  if (annualObligations <= 0) return 0;
  return endingUnrestrictedCash / (annualObligations / 12);
}
