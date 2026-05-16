import type { ConsultantOutput } from "../consultant-engine";
import type { ModelData } from "../workbook-helpers";
import { formatRunwayMonths } from "./format-runway";

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
    /**
     * Year-end **unrestricted** cash — this is the headline figure (Task #610).
     * Strips capital/program-restricted gifts so DSCR + runway aren't propped up
     * by money the school can't legally spend on operations or debt service.
     */
    unrestrictedCash: string;
    /** True for the year with the lowest ending cash — the runway crunch year lenders zero in on. */
    isTrough: boolean;
  }[];
  /**
   * Callout for the tightest cash year. Null when there is no per-year cash data.
   * Surfaced so reviewers immediately see when the school is closest to running out of cash.
   */
  troughCallout: { year: number; endingCash: string; isNegative: boolean } | null;
  /**
   * Task #610 — accrual-vs-cash toggle context shown alongside the headline.
   * `unrestrictedCashLabel` is the figure DSCR/runway are computed off; the
   * "vs accrual" label exposes the all-in cash number for comparison.
   */
  accrualToggle: {
    unrestrictedCashLabel: string;
    accrualCashLabel: string;
    deltaLabel: string;
  };
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
    : `Cash runway is approximately ${formatRunwayMonths(months)}`;

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

  // Task #610 — strip cumulative restricted revenue out of cash to derive
  // unrestricted cash. The consultant engine doesn't yet thread restricted
  // recognition through, so we read it off the raw model when available
  // (revenueRows flagged isRestricted or with a `restricted_*` id) and fall
  // back to zero — which means unrestricted == accrual for legacy data.
  const restrictedByYear = computeRestrictedRevenueByYear(md);
  let cumRestricted = 0;
  const restrictedCumByYear = restrictedByYear.map((r) => (cumRestricted += r));

  const yearByYearCash = endingCashByYear.map((y, i) => ({
    year: y.year,
    cumulative: fmt(y.cumulativeNetIncome),
    reserveMonths: `${y.reserveMonths.toFixed(1)} mo`,
    endingCash: fmt(y.endingCashRaw),
    unrestrictedCash: fmt(y.endingCashRaw - (restrictedCumByYear[i] ?? 0)),
    isTrough: i === troughIdx,
  }));

  const troughCallout = troughIdx >= 0
    ? {
        year: endingCashByYear[troughIdx].year,
        endingCash: fmt(troughValue - (restrictedCumByYear[troughIdx] ?? 0)),
        isNegative: troughValue - (restrictedCumByYear[troughIdx] ?? 0) < 0,
      }
    : null;

  // Y5 figures power the headline + toggle row.
  const lastIdx = endingCashByYear.length - 1;
  const accrualHeadline = lastIdx >= 0 ? endingCashByYear[lastIdx].endingCashRaw : 0;
  const restrictedHeadline = lastIdx >= 0 ? (restrictedCumByYear[lastIdx] ?? 0) : 0;
  const unrestrictedHeadline = accrualHeadline - restrictedHeadline;
  const accrualToggle = {
    unrestrictedCashLabel: fmt(unrestrictedHeadline),
    accrualCashLabel: fmt(accrualHeadline),
    deltaLabel: restrictedHeadline > 0 ? `−${fmt(restrictedHeadline)} restricted` : "no restricted gifts",
  };

  return { runwayMonths: months, runwayLabel, status, yearByYearCash, troughCallout, accrualToggle };
}

/**
 * Estimates restricted revenue per modeled year by walking the model's
 * revenueRows for `isRestricted === true` or ids prefixed with `restricted_`.
 * Mirrors `lib/finance/src/restricted-revenue.ts` so consultant + lender
 * packets agree on which dollars are restricted.
 */
function computeRestrictedRevenueByYear(md: ModelData): number[] {
  const out = [0, 0, 0, 0, 0];
  const rows = (md as { revenueRows?: Array<Record<string, unknown>> }).revenueRows ?? [];
  for (const row of rows) {
    if (!row || row.enabled === false) continue;
    const id = typeof row.id === "string" ? row.id : "";
    const isRestricted = row.isRestricted === true || id.startsWith("restricted_");
    if (!isRestricted) continue;
    const amounts = Array.isArray(row.amounts) ? row.amounts : [];
    for (let y = 0; y < 5; y++) {
      const v = Number(amounts[y]);
      if (Number.isFinite(v)) out[y] += v;
    }
  }
  return out;
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
