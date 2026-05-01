import type { ConsultantOutput } from "../consultant-engine";
import type { ModelData } from "../workbook-helpers";

export interface CashRunwayView {
  runwayMonths: number;
  runwayLabel: string;
  status: "good" | "warning" | "danger";
  yearByYearCash: {
    year: number;
    cumulative: string;
    reserveMonths: string;
    /** Year-end cash position (opening cash + cumulative net income through this year), formatted. */
    endingCash: string;
    /** True for the year with the lowest ending cash — the runway crunch year lenders zero in on. */
    isTrough: boolean;
  }[];
  /**
   * Callout for the tightest cash year. Null when there is no per-year cash data.
   * Surfaced so reviewers immediately see when the school is closest to running out of cash.
   */
  troughCallout: { year: number; endingCash: string; isNegative: boolean } | null;
}

/**
 * Builds the year-by-year ending cash + trough view used in both the board
 * (lender-facing summary) and lender packets. Centralizing this keeps the
 * numbers identical between deliverables (Tasks #196, #213).
 */
export function buildCashRunway(co: ConsultantOutput, md: ModelData): CashRunwayView {
  const months = co.cashRunwayMonths;
  const status: "good" | "warning" | "danger" =
    months >= 36 ? "good" : months >= 18 ? "warning" : "danger";

  const runwayLabel = months >= 60
    ? "Cash remains positive through the full 5-year projection"
    : `Cash runway is approximately ${months} months`;

  // Year-end cash position = opening cash + cumulative net income through the year.
  // Lenders ask for this directly — it surfaces the runway crunch year at a glance.
  const openingCash = md.openingBalances?.cash ?? 0;
  const endingCashByYear = co.cumulativeFinancials.map((cf) => ({
    year: cf.year,
    endingCashRaw: openingCash + cf.cumulativeNetIncome,
    cumulativeNetIncome: cf.cumulativeNetIncome,
    reserveMonths: cf.reserveMonths,
  }));

  let troughIdx = -1;
  let troughValue = Infinity;
  for (let i = 0; i < endingCashByYear.length; i++) {
    if (endingCashByYear[i].endingCashRaw < troughValue) {
      troughValue = endingCashByYear[i].endingCashRaw;
      troughIdx = i;
    }
  }

  const yearByYearCash = endingCashByYear.map((y, i) => ({
    year: y.year,
    cumulative: fmt(y.cumulativeNetIncome),
    reserveMonths: `${y.reserveMonths.toFixed(1)} mo`,
    endingCash: fmt(y.endingCashRaw),
    isTrough: i === troughIdx,
  }));

  const troughCallout = troughIdx >= 0
    ? {
        year: endingCashByYear[troughIdx].year,
        endingCash: fmt(troughValue),
        isNegative: troughValue < 0,
      }
    : null;

  return { runwayMonths: months, runwayLabel, status, yearByYearCash, troughCallout };
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
