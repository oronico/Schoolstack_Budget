// Maps the founder-facing KPI labels surfaced on the dashboard to their
// lender / accounting equivalents. The toggle in the dashboard "Lender
// language" preference swaps the *label* only - the underlying numeric value
// is never modified. Each lender label points at a glossary `termKey` so the
// translated word can be hovered/tapped for a definition in place.
export interface LenderLabelEntry {
  /** Stable id used by the dashboard tile */
  id: string;
  /** Default founder-facing label */
  founder: string;
  /** Lender / accounting equivalent label */
  lender: string;
  /** Glossary entry key for the lender label tooltip */
  glossaryKey: string;
}

export const LENDER_LABELS: Record<string, LenderLabelEntry> = {
  operatingSurplus: {
    id: "operatingSurplus",
    founder: "Operating Surplus",
    lender: "Net Operating Income (NOI)",
    glossaryKey: "noi",
  },
  netIncome: {
    id: "netIncome",
    founder: "Net Income",
    lender: "EBITDA",
    glossaryKey: "ebitda",
  },
  coverageRatio: {
    id: "coverageRatio",
    founder: "Coverage Ratio",
    lender: "Debt Service Coverage Ratio (DSCR)",
    glossaryKey: "dscr",
  },
  cashReserve: {
    id: "cashReserve",
    founder: "Cash Reserve",
    lender: "Working Capital (months)",
    glossaryKey: "working_capital",
  },
};

export function lenderLabelFor(
  id: string,
  enabled: boolean,
): { label: string; glossaryKey: string | null } {
  const entry = LENDER_LABELS[id];
  if (!entry) return { label: id, glossaryKey: null };
  if (enabled) return { label: entry.lender, glossaryKey: entry.glossaryKey };
  return { label: entry.founder, glossaryKey: null };
}
