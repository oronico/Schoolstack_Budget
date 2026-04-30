/**
 * State business entity fees: annual filing fees, franchise taxes, and one-time
 * year-1 publication / formation fees that vary by state and entity type.
 *
 * Each state, for each entity type we model, has:
 *   - `annual`:     the recurring fee (annual report, franchise tax minimum)
 *   - `oneTimeY1`:  optional one-time year-1 fee (e.g. NY LLC publication, NV
 *                   initial business license, formation filing if not collected
 *                   pre-launch)
 *   - `notes`:      a one-line founder-facing explanation of what the fee is
 *                   for and any caveats (e.g. "first $1.23M revenue exempt").
 *
 * 2025 figures from each state's Secretary of State / Department of Revenue
 * fee schedules. Where a state charges by share count or revenue, we use the
 * **minimum statutory amount** that a small startup school will face — anyone
 * issuing $10M+ in stock should expect to override.
 *
 * The audit doc at docs/math-trigger-audit.md walks through which states have
 * the largest gotchas (CA $800 LLC franchise tax, NY LLC publication ~$1,500,
 * DE LLC $300, MA LLC $500).
 */

import type { EntityType } from "@/pages/model-wizard/schema";

export interface EntityFeeProfile {
  /** Recurring annual fee (annual report + minimum franchise tax). */
  annual: number;
  /** Optional one-time year-1 surcharge layered on top of the annual fee. */
  oneTimeY1?: number;
  /** Founder-facing description shown next to the row in the wizard. */
  notes: string;
}

/** Entity types we generate explicit fee data for. `sole_practitioner` and
 *  `undetermined` skip the row entirely (sole props don't owe entity fees;
 *  undetermined defers the question until the founder picks a structure). */
type FeeEntityType = Exclude<EntityType, "sole_practitioner" | "undetermined">;

const NONE_NONPROFIT: EntityFeeProfile = { annual: 0, notes: "No annual filing fee for nonprofits in this state." };

// Helper: same fee for both LLC variants
const llcSame = (annual: number, notes: string, oneTimeY1?: number): Pick<Record<FeeEntityType, EntityFeeProfile>, "llc_single" | "llc_partnership"> => ({
  llc_single: { annual, oneTimeY1, notes },
  llc_partnership: { annual, oneTimeY1, notes },
});

// Helper: same fee for both corp variants
const corpSame = (annual: number, notes: string): Pick<Record<FeeEntityType, EntityFeeProfile>, "c_corp" | "s_corp"> => ({
  c_corp: { annual, notes },
  s_corp: { annual, notes },
});

export const STATE_ENTITY_FEES: Record<string, Record<FeeEntityType, EntityFeeProfile>> = {
  AL: {
    ...llcSame(100, "$100 annual report (BPT-V) + Business Privilege Tax (min $50, exempt 2025)."),
    ...corpSame(100, "$100 annual report + Business Privilege Tax (min $50, exempt 2025)."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit annual report." },
  },
  AK: {
    ...llcSame(100, "$100 LLC biennial report (≈$50/yr equivalent)."),
    ...corpSame(100, "$100 corp biennial report (≈$50/yr equivalent)."),
    nonprofit_501c3: { annual: 25, notes: "$25 nonprofit biennial report (≈$12.50/yr equivalent, posted as $25 in renewal year)." },
  },
  AZ: {
    ...llcSame(0, "Arizona has no annual LLC report or franchise tax."),
    ...corpSame(45, "$45 corporation annual report."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit annual report." },
  },
  AR: {
    ...llcSame(150, "$150 annual franchise tax (LLC)."),
    ...corpSame(150, "$150 minimum franchise tax."),
    nonprofit_501c3: { annual: 0, notes: "No franchise tax for nonprofits." },
  },
  CA: {
    ...llcSame(800, "$800 minimum franchise tax (annual). Plus LLC fee tiered above $250k revenue.", 70),
    ...corpSame(800, "$800 minimum franchise tax (waived first year for new corps formed 2020+; budget for years 2+)."),
    nonprofit_501c3: { annual: 25, notes: "$25 biennial Statement of Information (≈$12.50/yr) + RRF-1 fee tiered by gross revenue (often $0–$300)." },
  },
  CO: {
    ...llcSame(25, "$25 periodic report (annual)."),
    ...corpSame(25, "$25 periodic report (annual)."),
    nonprofit_501c3: { annual: 25, notes: "$25 nonprofit periodic report (annual)." },
  },
  CT: {
    ...llcSame(80, "$80 annual report."),
    ...corpSame(150, "$150 corp annual report + $250 Business Entity Tax (every 2 yrs, ~$125/yr equivalent)."),
    nonprofit_501c3: { annual: 50, notes: "$50 nonprofit annual report." },
  },
  DE: {
    ...llcSame(300, "$300 annual franchise tax (LLC). No DE income tax if no DE-source income."),
    c_corp: { annual: 225, notes: "$50 annual report + $175 minimum franchise tax (Authorized Shares method)." },
    s_corp: { annual: 225, notes: "$50 annual report + $175 minimum franchise tax (Authorized Shares method)." },
    nonprofit_501c3: { annual: 25, notes: "$25 nonprofit annual report." },
  },
  FL: {
    ...llcSame(138.75, "$138.75 LLC annual report (due May 1; $400 late fee)."),
    ...corpSame(150, "$150 corporation annual report (due May 1)."),
    nonprofit_501c3: { annual: 61.25, notes: "$61.25 nonprofit annual report." },
  },
  GA: {
    ...llcSame(50, "$50 annual registration."),
    ...corpSame(50, "$50 annual registration."),
    nonprofit_501c3: { annual: 30, notes: "$30 nonprofit annual registration." },
  },
  HI: {
    ...llcSame(15, "$15 annual report (LLC)."),
    ...corpSame(15, "$15 annual report (corp)."),
    nonprofit_501c3: { annual: 5, notes: "$5 nonprofit annual report." },
  },
  ID: {
    ...llcSame(0, "Idaho annual report has no fee."),
    ...corpSame(0, "Idaho annual report has no fee."),
    nonprofit_501c3: { annual: 0, notes: "Idaho nonprofit annual report has no fee." },
  },
  IL: {
    ...llcSame(75, "$75 LLC annual report."),
    ...corpSame(75, "$75 corp annual report + minimum $25 franchise tax (franchise tax phased out 2024)."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit annual report." },
  },
  IN: {
    ...llcSame(31, "$31 LLC business entity report (biennial, ~$15.50/yr equivalent)."),
    ...corpSame(30, "$30 corp business entity report (biennial, ~$15/yr equivalent)."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit business entity report (biennial, ~$5/yr equivalent)." },
  },
  IA: {
    ...llcSame(30, "$30 LLC biennial report (~$15/yr equivalent)."),
    ...corpSame(30, "$30 corp biennial report (~$15/yr equivalent)."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit biennial report (~$5/yr equivalent)." },
  },
  KS: {
    ...llcSame(50, "$50 LLC annual report."),
    ...corpSame(50, "$50 corp annual report."),
    nonprofit_501c3: { annual: 40, notes: "$40 nonprofit annual report." },
  },
  KY: {
    ...llcSame(15, "$15 annual report."),
    ...corpSame(15, "$15 annual report."),
    nonprofit_501c3: { annual: 15, notes: "$15 nonprofit annual report." },
  },
  LA: {
    ...llcSame(35, "$35 LLC annual report."),
    ...corpSame(30, "$30 corporation annual report."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit annual report." },
  },
  ME: {
    ...llcSame(85, "$85 LLC annual report."),
    ...corpSame(85, "$85 corp annual report."),
    nonprofit_501c3: { annual: 35, notes: "$35 nonprofit annual report." },
  },
  MD: {
    ...llcSame(300, "$300 annual report + Personal Property Return."),
    ...corpSame(300, "$300 annual report + Personal Property Return."),
    nonprofit_501c3: { annual: 0, notes: "Maryland nonprofits exempt from $300 annual report (still file Personal Property Return; usually $0)." },
  },
  MA: {
    ...llcSame(500, "$500 LLC annual report."),
    ...corpSame(125, "$125 corp annual report + $456 minimum corporate excise tax (paid via DOR)."),
    nonprofit_501c3: { annual: 18.50, notes: "$18.50 nonprofit annual report (filed online)." },
  },
  MI: {
    ...llcSame(25, "$25 LLC annual statement."),
    ...corpSame(25, "$25 corp annual report."),
    nonprofit_501c3: { annual: 20, notes: "$20 nonprofit annual report." },
  },
  MN: {
    ...llcSame(0, "Minnesota annual renewal has no fee (must file annually)."),
    ...corpSame(0, "Minnesota annual renewal has no fee (must file annually)."),
    nonprofit_501c3: NONE_NONPROFIT,
  },
  MS: {
    ...llcSame(25, "$25 LLC annual report."),
    ...corpSame(25, "$25 corp annual report."),
    nonprofit_501c3: { annual: 0, notes: "Mississippi nonprofit annual report has no fee." },
  },
  MO: {
    ...llcSame(0, "Missouri does not require LLC annual reports."),
    ...corpSame(45, "$45 corp annual registration ($20 if filed online)."),
    nonprofit_501c3: { annual: 15, notes: "$15 nonprofit annual report ($10 if filed online)." },
  },
  MT: {
    ...llcSame(20, "$20 LLC annual report."),
    ...corpSame(20, "$20 corp annual report."),
    nonprofit_501c3: { annual: 20, notes: "$20 nonprofit annual report." },
  },
  NE: {
    ...llcSame(13, "$13 LLC biennial report (~$6.50/yr equivalent)."),
    ...corpSame(26, "$26 corp biennial report (varies by paid-in capital, ~$13/yr equivalent for small orgs)."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit biennial report (~$5/yr equivalent)." },
  },
  NV: {
    llc_single: { annual: 350, oneTimeY1: 75, notes: "$150 annual list + $200 state business license = $350/yr. Plus $75 initial filing." },
    llc_partnership: { annual: 350, oneTimeY1: 75, notes: "$150 annual list + $200 state business license = $350/yr. Plus $75 initial filing." },
    c_corp: { annual: 650, notes: "$150 annual list + $500 state business license = $650/yr (corp business license is higher)." },
    s_corp: { annual: 650, notes: "$150 annual list + $500 state business license = $650/yr." },
    nonprofit_501c3: { annual: 50, notes: "$50 nonprofit annual list (state business license fee waived)." },
  },
  NH: {
    ...llcSame(100, "$100 LLC annual report."),
    ...corpSame(100, "$100 corp annual report."),
    nonprofit_501c3: { annual: 25, notes: "$25 nonprofit annual report (5-year period)." },
  },
  NJ: {
    ...llcSame(75, "$75 LLC annual report."),
    ...corpSame(75, "$75 corp annual report."),
    nonprofit_501c3: { annual: 30, notes: "$30 nonprofit annual report." },
  },
  NM: {
    ...llcSame(0, "New Mexico does not require LLC annual reports."),
    ...corpSame(25, "$25 minimum corporate franchise tax + $25 annual report."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit annual report." },
  },
  NY: {
    llc_single: { annual: 9, oneTimeY1: 1500, notes: "$9 LLC biennial fee (~$4.50/yr) + ~$1,500 one-time NY publication requirement (Y1; varies $400–$2,000+ by county)." },
    llc_partnership: { annual: 9, oneTimeY1: 1500, notes: "$9 LLC biennial fee (~$4.50/yr) + ~$1,500 one-time NY publication requirement (Y1; varies $400–$2,000+ by county)." },
    c_corp: { annual: 9, notes: "$9 corp biennial statement (~$4.50/yr) + NY state corp franchise tax (separate, revenue-based)." },
    s_corp: { annual: 9, notes: "$9 corp biennial statement (~$4.50/yr) + NY state corp franchise tax (separate)." },
    nonprofit_501c3: { annual: 25, notes: "$25 NY CHAR500 annual filing (varies by revenue; can be $25–$1,500)." },
  },
  NC: {
    ...llcSame(202, "$200 LLC annual report (online) + $2 fee = $202."),
    ...corpSame(225, "$25 corp annual report + $200 minimum franchise tax = $225."),
    nonprofit_501c3: { annual: 0, notes: "North Carolina nonprofits do not file an annual report." },
  },
  ND: {
    ...llcSame(50, "$50 LLC annual report."),
    ...corpSame(25, "$25 corp annual report."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit annual report." },
  },
  OH: {
    ...llcSame(0, "Ohio does not require LLC annual reports."),
    ...corpSame(0, "Ohio does not require corp annual reports (CAT tax for revenue >$3M)."),
    nonprofit_501c3: { annual: 0, notes: "Ohio nonprofit statement of continued existence is free (every 5 yrs)." },
  },
  OK: {
    ...llcSame(25, "$25 LLC annual certificate."),
    ...corpSame(25, "$25 corp annual franchise tax (min)."),
    nonprofit_501c3: { annual: 0, notes: "Oklahoma nonprofit annual certificate has no fee." },
  },
  OR: {
    ...llcSame(100, "$100 LLC annual report."),
    ...corpSame(100, "$100 corp annual report."),
    nonprofit_501c3: { annual: 50, notes: "$50 nonprofit annual report." },
  },
  PA: {
    ...llcSame(7, "$7 LLC annual report (new for 2025; previously decennial)."),
    ...corpSame(7, "$7 corp annual report (new for 2025)."),
    nonprofit_501c3: { annual: 0, notes: "Pennsylvania nonprofit annual report has no fee (new for 2025)." },
  },
  RI: {
    ...llcSame(50, "$50 LLC annual report."),
    ...corpSame(50, "$50 corp annual report + $400 minimum franchise tax."),
    nonprofit_501c3: { annual: 20, notes: "$20 nonprofit annual report." },
  },
  SC: {
    ...llcSame(0, "South Carolina does not require LLC annual reports."),
    ...corpSame(25, "$25 corp annual license fee (min) + $15 annual report."),
    nonprofit_501c3: { annual: 0, notes: "South Carolina nonprofit annual report has no fee." },
  },
  SD: {
    ...llcSame(50, "$50 LLC annual report."),
    ...corpSame(50, "$50 corp annual report."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit annual report." },
  },
  TN: {
    ...llcSame(300, "$300 LLC annual report ($50/member, min $300, max $3,000) + Excise & Franchise Tax."),
    ...corpSame(20, "$20 corp annual report + Excise & Franchise Tax (min $100/yr franchise)."),
    nonprofit_501c3: { annual: 20, notes: "$20 nonprofit annual report." },
  },
  TX: {
    ...llcSame(0, "Texas LLC has no annual report fee. Franchise tax $0 if revenue < $2.47M (No-Tax-Due threshold)."),
    ...corpSame(0, "Texas corp has no annual report fee. Franchise tax $0 if revenue < $2.47M."),
    nonprofit_501c3: { annual: 5, notes: "$5 Texas nonprofit periodic report (every 4 yrs, ~$1.25/yr equivalent)." },
  },
  UT: {
    ...llcSame(20, "$20 LLC annual report."),
    ...corpSame(20, "$20 corp annual report."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit annual report." },
  },
  VT: {
    ...llcSame(35, "$35 LLC annual report."),
    ...corpSame(45, "$45 corp annual report + $300 minimum corporate income tax."),
    nonprofit_501c3: { annual: 20, notes: "$20 nonprofit biennial report (~$10/yr equivalent)." },
  },
  VA: {
    ...llcSame(50, "$50 LLC annual registration fee."),
    ...corpSame(100, "$100 corp annual registration fee (min, scales with stock)."),
    nonprofit_501c3: { annual: 25, notes: "$25 nonprofit annual report." },
  },
  WA: {
    ...llcSame(160, "$70 LLC annual report + $90 BLS renewal = $160 total."),
    ...corpSame(160, "$70 corp annual report + $90 BLS renewal = $160 total."),
    nonprofit_501c3: { annual: 60, notes: "$60 nonprofit annual report ($10 + $50 charity registration if soliciting donations)." },
  },
  WV: {
    ...llcSame(25, "$25 LLC annual report."),
    ...corpSame(25, "$25 corp annual report."),
    nonprofit_501c3: { annual: 25, notes: "$25 nonprofit annual report." },
  },
  WI: {
    ...llcSame(25, "$25 LLC annual report ($40 if filed by paper)."),
    ...corpSame(25, "$25 corp annual report ($40 if filed by paper)."),
    nonprofit_501c3: { annual: 10, notes: "$10 nonprofit annual report." },
  },
  WY: {
    ...llcSame(60, "$60 LLC annual report (min, scales with WY-located assets)."),
    ...corpSame(60, "$60 corp annual report (min, scales with WY-located assets)."),
    nonprofit_501c3: { annual: 25, notes: "$25 nonprofit annual report." },
  },
  DC: {
    ...llcSame(300, "$300 biennial report (~$150/yr equivalent)."),
    ...corpSame(300, "$300 biennial report (~$150/yr equivalent)."),
    nonprofit_501c3: { annual: 80, notes: "$80 biennial nonprofit report (~$40/yr equivalent)." },
  },
};

/**
 * Look up the entity-fee profile for a given (state, entityType) pair.
 *
 * Returns `null` for sole_practitioner / undetermined / unknown states —
 * callers should skip the row rather than show a $0 misleading entry.
 *
 * For `oneTimeY1`, the engine should add this on top of the recurring annual
 * fee in year 1 only (e.g. NY LLC: $9/yr recurring + $1,500 publication in Y1).
 */
export function getStateEntityFeeProfile(
  stateCode: string | undefined,
  entityType: EntityType | undefined,
): EntityFeeProfile | null {
  if (!stateCode || !entityType) return null;
  if (entityType === "sole_practitioner" || entityType === "undetermined") return null;
  const stateEntry = STATE_ENTITY_FEES[stateCode.toUpperCase()];
  if (!stateEntry) return null;
  return stateEntry[entityType as FeeEntityType] ?? null;
}

/** Convenience for the wizard: build the per-year amount array (year 1 layered
 *  with `oneTimeY1` if present). */
export function buildEntityFeeAmounts(profile: EntityFeeProfile, yearCount: number): number[] {
  const amounts = new Array(yearCount).fill(profile.annual);
  if (profile.oneTimeY1 && amounts.length > 0) {
    amounts[0] = profile.annual + profile.oneTimeY1;
  }
  return amounts;
}
