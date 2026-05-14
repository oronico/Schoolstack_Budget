/**
 * Task #860 expanded scope — Per-Seat Funding Mix view model.
 *
 * Founder mantra: "Tuition is just price." This module builds the
 * canonical, founder-readable view of how each seat is paid for in a
 * given year, using the engine's already-corrected revenue numbers so
 * the surface always matches the workbook / PDF totals.
 *
 * Output is rendered in:
 *   - Lender Packet PDF
 *   - Board Packet PDF
 *   - Dashboard (PerSeatFundingMixCard)
 *   - Consultant view
 *
 * The math reuses `computeRevenueRowAmountsForYear` so there is exactly
 * one source of truth for the funding-mix correction.
 */
import {
  computeRevenueRowAmountsForYear,
  type RevenueRowAmountsRowLike,
  type TuitionTierLike,
} from "./revenue-quality.js";

export interface PerSeatFunder {
  rowId: string;
  label: string;
  perSeat: number;
  totalDollars: number;
  programType: "esa" | "voucher" | "tax_credit" | "other_choice";
}

export interface PerSeatFundingMix {
  yearIdx: number;
  students: number;
  /** Pre-discount sticker price per seat. */
  stickerPerSeat: number;
  /** Net per-seat price after tuition tier discounts. The cap basis. */
  netPerSeat: number;
  /** Each per-student school_choice funder, post-cap. */
  funders: PerSeatFunder[];
  /** Residual per-seat amount paid by families after funders apply. */
  familyPayPerSeat: number;
  /** Residual total in dollars across all enrolled students. */
  familyPayTotal: number;
  /** Combined recognized revenue per seat (= netPerSeat when funders fully cover). */
  recognizedPerSeat: number;
  /** Sum of per-seat funder dollars (post-cap). */
  funderTotalPerSeat: number;
}

const FUNDER_TYPE_BY_ID: Record<string, PerSeatFunder["programType"]> = {
  esa_revenue: "esa",
  voucher_revenue: "voucher",
  tax_credit_revenue: "tax_credit",
};

function classifyFunderProgram(rowId: string): PerSeatFunder["programType"] {
  if (FUNDER_TYPE_BY_ID[rowId]) return FUNDER_TYPE_BY_ID[rowId];
  if (rowId.includes("esa")) return "esa";
  if (rowId.includes("voucher")) return "voucher";
  if (rowId.includes("tax_credit") || rowId.includes("scholarship_tax"))
    return "tax_credit";
  return "other_choice";
}

export function buildPerSeatFundingMix(
  rows: readonly RevenueRowAmountsRowLike[],
  yearIdx: number,
  students: number,
  tuitionTiers?: TuitionTierLike[],
): PerSeatFundingMix | null {
  const grossTuitionRow = rows.find(
    (r) => r.enabled && r.id === "gross_tuition" && r.driverType === "per_student",
  );
  if (!grossTuitionRow || students <= 0) return null;

  const stickerPerSeat = (() => {
    const base = grossTuitionRow.amounts?.[0] ?? 0;
    const esc = grossTuitionRow.escalationRate;
    if (esc !== undefined && esc !== 0 && yearIdx > 0) {
      return base * Math.pow(1 + esc / 100, yearIdx);
    }
    return grossTuitionRow.amounts?.[yearIdx] ?? 0;
  })();
  if (stickerPerSeat <= 0) return null;

  // Reuse the engine: returns per-row dollars POST funding-mix correction.
  const vals = computeRevenueRowAmountsForYear(rows, yearIdx, students, tuitionTiers);
  const grossDollars = vals.get("gross_tuition") || 0;
  const netPerSeat = grossDollars > 0
    ? // After correction, gross_tuition is residual family-pay. To recover
      // the net seat basis we add back funder dollars per seat.
      0 // placeholder; we compute below
    : 0;

  const choiceRows = rows.filter(
    (r) => r.enabled && r.category === "school_choice" && r.driverType === "per_student",
  );
  const funders: PerSeatFunder[] = choiceRows.map((r) => {
    const totalDollars = vals.get(r.id) || 0;
    return {
      rowId: r.id || "",
      label: (r as { label?: string }).label || (r as { lineItem?: string }).lineItem || r.id || "",
      perSeat: totalDollars / students,
      totalDollars,
      programType: classifyFunderProgram(r.id || ""),
    };
  });

  const funderTotalPerSeat = funders.reduce((s, f) => s + f.perSeat, 0);
  const familyPayPerSeat = grossDollars / students;
  const familyPayTotal = grossDollars;
  const recognizedPerSeat = funderTotalPerSeat + familyPayPerSeat;

  return {
    yearIdx,
    students,
    stickerPerSeat,
    // After the engine cap, recognizedPerSeat IS the net seat basis.
    netPerSeat: recognizedPerSeat,
    funders,
    familyPayPerSeat,
    familyPayTotal,
    recognizedPerSeat,
    funderTotalPerSeat,
  };
}

export const PER_SEAT_FUNDER_LABELS: Record<PerSeatFunder["programType"], string> = {
  esa: "ESA",
  voucher: "Voucher",
  tax_credit: "Tax-Credit Scholarship",
  other_choice: "Other School-Choice",
};
