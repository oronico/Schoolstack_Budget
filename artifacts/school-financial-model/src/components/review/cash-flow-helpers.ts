// Task #705 — Cash flow truth layer.
//
// Pure helpers for the Review-step cash flow subsection. Kept separate
// from the React component so they're easy to unit-test and so the
// canonical `@workspace/finance` distribution helpers stay the single
// source of truth for monthly cash math.
//
// `applyDelayedPublicFunding` clones the revenue rows and pushes every
// `public_funding` line further out by N days. This lets a founder model
// "what if our state pays us 60 / 90 / 120 days late?" without touching
// their saved revenue rows. The shift goes through the row's existing
// `collectionDelayDays` field, so the canonical
// `distributeRevenueMonthly` helper handles the cadence math the same
// way it would for any other delayed stream.

import type { MonthlyRevenueRowLike } from "@workspace/finance";

export const PUBLIC_FUNDING_DELAY_OPTIONS: readonly {
  days: number;
  label: string;
}[] = [
  { days: 0, label: "On time" },
  { days: 60, label: "60 days late" },
  { days: 90, label: "90 days late" },
  { days: 120, label: "120 days late" },
];

export type PublicFundingDelayDays = 0 | 60 | 90 | 120;

/**
 * Return a shallow-cloned revenue-row array where every public-funding
 * row has its `collectionDelayDays` increased by `delayDays`. Other
 * categories are passed through unchanged so tuition/philanthropy
 * timing stays exactly as the founder entered it.
 */
export function applyDelayedPublicFunding(
  rows: readonly MonthlyRevenueRowLike[],
  delayDays: number,
): MonthlyRevenueRowLike[] {
  if (!rows || rows.length === 0) return [];
  if (!delayDays || delayDays <= 0) return rows.slice();
  return rows.map((row) => {
    if (row.category !== "public_funding") return row;
    const existing = row.collectionDelayDays ?? 0;
    return { ...row, collectionDelayDays: existing + delayDays };
  });
}

const SUMMER_MONTHS = new Set(["Jun", "Jul", "Aug", "Sep"]);

/**
 * The "summer gap" pattern: the cash trough lands in the
 * Jun/Jul/Aug/Sep window because tuition stops billing while payroll
 * and facility costs keep going out. We surface a different annotation
 * when the trough falls inside that window so the founder reads the
 * structural pattern, not just the dollar amount.
 */
export function isSummerGapMonth(monthLabel: string | undefined): boolean {
  if (!monthLabel) return false;
  return SUMMER_MONTHS.has(monthLabel.slice(0, 3));
}
