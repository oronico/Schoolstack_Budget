export {
  computeAnnualDebt,
  computeMonthlyDebt,
  computeAnnualDebtForYear,
  computeInterestPortion,
  computePrincipalPortion,
  computeRemainingBalance,
} from "./amortization.js";

export {
  DEFAULT_BENEFITS_RATE,
  DEFAULT_PAYROLL_TAX_RATE,
  DEFAULT_COLA_PCT,
  DEFAULT_GENERAL_INFLATION_PCT,
  DEFAULT_RENT_ESCALATION_PCT,
  DEFAULT_TUITION_ESCALATION_PCT,
  DEFAULT_RETENTION_RATE,
  LOADED_COST_MULTIPLIER,
  YEAR_COUNT,
  BENCHMARK_DSCR_GREEN,
  BENCHMARK_DSCR_AMBER,
} from "./constants.js";

export {
  computeEffectiveFte,
  resolveEsc,
  type StaffingRowLike,
} from "./staffing.js";

export function computeStraightLineDepreciation(
  fixedAssets: number,
  usefulLifeYears: number,
  yearIndex: number,
): { annualDepreciation: number; accumulatedDepreciation: number; netBookValue: number } {
  if (fixedAssets <= 0 || usefulLifeYears <= 0) {
    return { annualDepreciation: 0, accumulatedDepreciation: 0, netBookValue: fixedAssets };
  }
  const annual = fixedAssets / usefulLifeYears;
  const yearsDepreciated = Math.min(yearIndex + 1, usefulLifeYears);
  const accumulated = annual * yearsDepreciated;
  const nbv = Math.max(0, fixedAssets - accumulated);
  const actualAnnual = yearIndex < usefulLifeYears ? annual : 0;
  return { annualDepreciation: actualAnnual, accumulatedDepreciation: accumulated, netBookValue: nbv };
}

export function computeProjectedAR(
  annualTuitionRevenue: number,
  collectionDelayDays: number,
): number {
  if (annualTuitionRevenue <= 0 || collectionDelayDays <= 0) return 0;
  return annualTuitionRevenue * (collectionDelayDays / 365);
}
