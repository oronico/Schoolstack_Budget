/**
 * Local / city business-license starter values.
 *
 * Most US cities and states do NOT require a general business license for a
 * small private school — especially nonprofit schools, which are exempt from
 * many municipal taxes (B&O, gross-receipts, business-income) by statute.
 * Many cities also have a flat license fee that's $0 for educational
 * institutions or 501(c)(3) entities. The honest default for the vast
 * majority of founders is "$0 — no city license needed."
 *
 * This curated table is intentionally narrow. We only include a `(state,
 * city)` profile when ALL of the following are true:
 *   1. The city imposes a mandatory annual fee or tax that genuinely applies
 *      to a small operating school (for-profit OR nonprofit, unless noted).
 *   2. The fee is documentable from the city's own published rate schedule
 *      so the `basisNote` citation stays trustworthy.
 *   3. The starter amount is conservative for a small school (typically
 *      <100 students) and clearly overrideable.
 *
 * Founders in any other city — which is most of them — keep the existing
 * free-text path with the toggle still defaulting to $0. We deliberately
 * choose under-suggesting over over-suggesting so we never plant a
 * misleading recurring expense in someone's budget.
 */

export interface LocalBusinessLicenseProfile {
  /** Two-letter state code (uppercase). */
  state: string;
  /** Display-cased city name (e.g. "San Francisco"). */
  city: string;
  /** Starter annual cost in whole dollars. Founders can override. */
  suggestedAnnual: number;
  /** One-line citation explaining where the number comes from. */
  basisNote: string;
}

const PROFILES: LocalBusinessLicenseProfile[] = [
  {
    state: "DC",
    city: "Washington",
    suggestedAnnual: 300,
    basisNote: "DC requires a Basic Business License for private schools. The General Business endorsement runs about $200–$540 every two years (~$150–$270/yr equivalent), with a small biennial endorsement fee on top. Verify the exact category with the DC Department of Licensing and Consumer Protection.",
  },
  {
    state: "WA",
    city: "Seattle",
    suggestedAnnual: 110,
    basisNote: "Seattle requires a Business License Tax Certificate for everyone operating in the city: $59/yr if your worldwide revenue is under $20k, $110/yr at the standard tier, and higher at larger revenue tiers. Seattle B&O tax is separate; many nonprofit and educational activities qualify for exemptions, so don't double-count.",
  },
  {
    state: "CA",
    city: "San Francisco",
    suggestedAnnual: 100,
    basisNote: "All businesses operating in SF - including nonprofits - must hold a Business Registration Certificate from the Office of the Treasurer. The annual fee scales with gross receipts; small schools typically land in the $54–$200 range. SF gross receipts tax is a separate filing with its own small-business exemption thresholds.",
  },
  {
    state: "CA",
    city: "Los Angeles",
    suggestedAnnual: 153,
    basisNote: "LA requires a Business Tax Registration Certificate. The minimum annual tax for most service classifications is around $153/yr. Educational nonprofits can apply for an exemption under LAMC §21.22, but registration itself is still required.",
  },
];

const PROFILE_INDEX: Map<string, LocalBusinessLicenseProfile> = new Map(
  PROFILES.map((p) => [makeKey(p.state, p.city), p])
);

function makeKey(state: string | undefined | null, city: string | undefined | null): string {
  return `${(state ?? "").trim().toUpperCase()}::${(city ?? "").trim().toLowerCase()}`;
}

/**
 * Look up a curated starter profile for a given (state, city) pair.
 *
 * Matching is case-insensitive and trims whitespace on the city. Returns
 * `null` when either field is missing or the jurisdiction isn't curated —
 * callers should fall back to the existing free-text/$0 path.
 */
export function getLocalBusinessLicenseProfile(
  stateCode: string | undefined | null,
  city: string | undefined | null,
): LocalBusinessLicenseProfile | null {
  if (!stateCode || !city) return null;
  if (!city.trim()) return null;
  return PROFILE_INDEX.get(makeKey(stateCode, city)) ?? null;
}

/** All curated profiles, exposed so callers can build typeaheads or display
 *  the supported-cities list. Order is preserved (DC first). */
export const LOCAL_BUSINESS_LICENSE_PROFILES: ReadonlyArray<LocalBusinessLicenseProfile> = PROFILES;
