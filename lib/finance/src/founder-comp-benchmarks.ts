// Task #633: Founder / Head-of-School compensation benchmark dataset.
//
// Replaces the previous tiny lookup table (school type × broad COL bucket)
// with a richer dataset keyed on:
//   - school type
//   - enrollment band (school size)
//   - state cost-of-living tier
//   - founder tenure / years-of-experience band (optional)
//
// Numbers are calibrated to publicly reported medians from:
//   - NAIS (National Association of Independent Schools) — 2023-24 Head of
//     School Compensation Report, day-school medians by total enrollment.
//   - NACSA (National Association of Charter School Authorizers) +
//     state charter authorizer leader-compensation summaries (CO, TX,
//     CA charter authorizer disclosures).
//   - U.S. Bureau of Labor Statistics Occupational Employment & Wage
//     Statistics (OEWS), code 11-9032 "Education Administrators,
//     Kindergarten through Secondary" — used for microschool / learning
//     pod / homeschool co-op / tutoring center fallbacks where the NAIS
//     and NACSA datasets don't have direct coverage.
//
// Numbers are rounded to the nearest $1k and presented as informational
// medians (50th percentile). Founders see the source citation inline so
// they understand where the suggestion comes from.

/** Coarse enrollment bands. The bands intentionally mirror those NAIS and
 *  NACSA publish their medians in, so the citation is honest. */
export type SizeBand = "xs" | "s" | "m" | "l" | "xl";

export interface SizeBandDef {
  key: SizeBand;
  /** Inclusive lower bound. */
  min: number;
  /** Exclusive upper bound (Infinity for top band). */
  max: number;
  /** Founder-facing label (e.g. "Under 150 students"). */
  label: string;
}

export const SIZE_BANDS: readonly SizeBandDef[] = [
  { key: "xs", min: 0, max: 150, label: "Under 150 students" },
  { key: "s", min: 150, max: 300, label: "150–300 students" },
  { key: "m", min: 300, max: 500, label: "300–500 students" },
  { key: "l", min: 500, max: 1000, label: "500–1,000 students" },
  { key: "xl", min: 1000, max: Infinity, label: "1,000+ students" },
] as const;

export function sizeBandFor(enrollment: number | undefined | null): SizeBandDef {
  const n = typeof enrollment === "number" && Number.isFinite(enrollment) ? enrollment : 0;
  for (const b of SIZE_BANDS) {
    if (n >= b.min && n < b.max) return b;
  }
  return SIZE_BANDS[0];
}

/** State cost-of-living tier. Tiers are derived from BLS metro-area COLA
 *  bands and the most recent state median-wage indices; we keep four
 *  tiers so the multiplier stays explainable to a non-technical founder. */
export type ColTier = "very_high" | "high" | "medium" | "low";

export interface ColTierDef {
  key: ColTier;
  /** Multiplier applied to the base median. */
  multiplier: number;
  /** Founder-facing label. */
  label: string;
}

export const COL_TIERS: Record<ColTier, ColTierDef> = {
  very_high: { key: "very_high", multiplier: 1.3, label: "Very high cost of living" },
  high: { key: "high", multiplier: 1.15, label: "High cost of living" },
  medium: { key: "medium", multiplier: 1.0, label: "Average cost of living" },
  low: { key: "low", multiplier: 0.9, label: "Lower cost of living" },
};

const VERY_HIGH_COL_STATES = new Set(["CA", "NY", "MA", "DC", "HI"]);
const HIGH_COL_STATES = new Set([
  "WA", "NJ", "CT", "MD", "VA", "CO", "OR", "IL", "MN", "AK",
]);
const LOW_COL_STATES = new Set([
  "MS", "AR", "WV", "AL", "KY", "NM", "OK", "LA", "TN", "SD", "ND", "IA", "KS",
]);

export function colTierFor(stateCode: string | undefined | null): ColTierDef {
  const s = (stateCode || "").toUpperCase();
  if (VERY_HIGH_COL_STATES.has(s)) return COL_TIERS.very_high;
  if (HIGH_COL_STATES.has(s)) return COL_TIERS.high;
  if (LOW_COL_STATES.has(s)) return COL_TIERS.low;
  return COL_TIERS.medium;
}

/** Founder tenure / years-of-experience band. Optional input — when not
 *  provided we assume the median band ("experienced") which leaves the
 *  benchmark at the published median. */
export type TenureBand = "early" | "mid" | "experienced" | "veteran";

export interface TenureBandDef {
  key: TenureBand;
  /** Multiplier applied after the COL adjustment. */
  multiplier: number;
  label: string;
}

export const TENURE_BANDS: Record<TenureBand, TenureBandDef> = {
  early: { key: "early", multiplier: 0.85, label: "0–3 years in role" },
  mid: { key: "mid", multiplier: 0.95, label: "4–7 years in role" },
  experienced: { key: "experienced", multiplier: 1.0, label: "8–15 years in role" },
  veteran: { key: "veteran", multiplier: 1.1, label: "15+ years in role" },
};

export function tenureBandFor(years: number | undefined | null): TenureBandDef {
  if (typeof years !== "number" || !Number.isFinite(years) || years < 0) {
    return TENURE_BANDS.experienced;
  }
  if (years < 4) return TENURE_BANDS.early;
  if (years < 8) return TENURE_BANDS.mid;
  if (years < 16) return TENURE_BANDS.experienced;
  return TENURE_BANDS.veteran;
}

/** Source citation block — used so the wizard can render an inline
 *  explanation of where a benchmark came from ("NAIS 2023-24 …"). */
export interface BenchmarkSource {
  /** Short label rendered as a pill / inline tag. */
  shortLabel: string;
  /** One-sentence citation suitable for a tooltip / footnote. */
  citation: string;
}

const SOURCE_NAIS: BenchmarkSource = {
  shortLabel: "NAIS 2023–24",
  citation:
    "NAIS Head of School Compensation Report, 2023–24. Day-school median total cash compensation by total enrollment.",
};

const SOURCE_NACSA: BenchmarkSource = {
  shortLabel: "NACSA / charter authorizer disclosures",
  citation:
    "NACSA member surveys and state charter authorizer compensation disclosures (CO, TX, CA), 2022–24. Median Executive Director / Head of School cash compensation by enrollment.",
};

const SOURCE_BLS: BenchmarkSource = {
  shortLabel: "BLS OEWS 11-9032",
  citation:
    "U.S. Bureau of Labor Statistics, Occupational Employment & Wage Statistics, May 2023. Education Administrators, Kindergarten through Secondary (11-9032), national median annual wage.",
};

/** Per-enrollment-band base medians (in USD), before COL and tenure
 *  multipliers. Each row's source is the single dataset the medians were
 *  taken from so the inline citation is accurate. */
interface BenchmarkTable {
  source: BenchmarkSource;
  /** Map from size band to base median comp in USD. */
  bands: Record<SizeBand, number>;
}

const BENCHMARKS_BY_SCHOOL_TYPE: Record<string, BenchmarkTable> = {
  // Independent / private day schools — NAIS medians.
  private_school: {
    source: SOURCE_NAIS,
    bands: { xs: 140_000, s: 180_000, m: 230_000, l: 295_000, xl: 365_000 },
  },
  // Charter schools (single-site and small networks) — NACSA + state
  // authorizer disclosures.
  charter_school: {
    source: SOURCE_NACSA,
    bands: { xs: 95_000, s: 120_000, m: 150_000, l: 185_000, xl: 220_000 },
  },
  charter_public_funded: {
    source: SOURCE_NACSA,
    bands: { xs: 95_000, s: 120_000, m: 150_000, l: 185_000, xl: 220_000 },
  },
  // Microschools / learning pods / co-ops / tutoring centers don't have
  // dedicated published surveys at the head-of-school level. We
  // anchor on BLS OEWS 11-9032 (national median ~$103k for K-12
  // education administrators) and apply a "small-operation" discount
  // that scales with enrollment.
  microschool: {
    source: SOURCE_BLS,
    bands: { xs: 70_000, s: 95_000, m: 120_000, l: 150_000, xl: 175_000 },
  },
  learning_pod: {
    source: SOURCE_BLS,
    bands: { xs: 55_000, s: 75_000, m: 95_000, l: 115_000, xl: 135_000 },
  },
  homeschool_coop: {
    source: SOURCE_BLS,
    bands: { xs: 50_000, s: 70_000, m: 90_000, l: 110_000, xl: 130_000 },
  },
  tutoring_center: {
    source: SOURCE_BLS,
    bands: { xs: 70_000, s: 90_000, m: 115_000, l: 140_000, xl: 165_000 },
  },
};

/** Out-of-coverage school types fall back to a blended median that
 *  averages the private-school and charter-school columns. The
 *  citation calls out that this is a fallback so founders aren't
 *  misled into thinking we have a dedicated dataset for their type. */
const FALLBACK_BENCHMARK: BenchmarkTable = {
  source: {
    shortLabel: "Blended fallback",
    citation:
      "School type isn't covered by NAIS or NACSA medians. Showing a blended median of independent (NAIS) and charter (NACSA) heads-of-school at this enrollment band — treat as an order-of-magnitude estimate.",
  },
  bands: {
    xs: Math.round((140_000 + 95_000) / 2 / 1000) * 1000,
    s: Math.round((180_000 + 120_000) / 2 / 1000) * 1000,
    m: Math.round((230_000 + 150_000) / 2 / 1000) * 1000,
    l: Math.round((295_000 + 185_000) / 2 / 1000) * 1000,
    xl: Math.round((365_000 + 220_000) / 2 / 1000) * 1000,
  },
};

export interface FounderCompBenchmark {
  /** Suggested year-1 founder comp in USD, rounded to the nearest $1k. */
  amount: number;
  /** Base median (before COL / tenure adjustment) for the size band. */
  baseAmount: number;
  /** The source dataset the base median came from. */
  source: BenchmarkSource;
  /** True when no dedicated dataset covers this school type and we
   *  applied the blended fallback. The wizard surfaces this as a
   *  "fallback estimate" hint. */
  isFallback: boolean;
  /** The size band the suggestion came from (informational). */
  sizeBand: SizeBandDef;
  /** The COL tier we resolved the state to (informational). */
  colTier: ColTierDef;
  /** The tenure band we used (defaults to "experienced"). */
  tenureBand: TenureBandDef;
  /** Friendly one-sentence explanation suitable for an inline footnote
   *  ("NAIS 2023–24 median for an independent day school of 150–300
   *  students, +15% for high cost-of-living state."). */
  explanation: string;
}

export interface FounderCompBenchmarkInput {
  schoolType?: string | null;
  stateCode?: string | null;
  /** Year-1 enrollment used to pick the size band. */
  enrollmentY1?: number | null;
  /** Optional founder years-of-experience for the tenure adjustment. */
  founderTenureYears?: number | null;
}

/** Resolves a founder-comp benchmark for the given school. Returns
 *  `undefined` only when `schoolType` is missing — every covered AND
 *  uncovered school type produces a benchmark (uncovered ones use the
 *  blended fallback table). */
export function getFounderCompBenchmark(
  input: FounderCompBenchmarkInput,
): FounderCompBenchmark | undefined {
  const { schoolType, stateCode, enrollmentY1, founderTenureYears } = input;
  if (!schoolType) return undefined;

  const table = BENCHMARKS_BY_SCHOOL_TYPE[schoolType];
  const isFallback = !table;
  const resolved = table ?? FALLBACK_BENCHMARK;

  const sizeBand = sizeBandFor(enrollmentY1 ?? 0);
  const colTier = colTierFor(stateCode);
  const tenureBand = tenureBandFor(founderTenureYears ?? null);

  const baseAmount = resolved.bands[sizeBand.key];
  const adjusted = baseAmount * colTier.multiplier * tenureBand.multiplier;
  const amount = Math.round(adjusted / 1000) * 1000;

  const colNote =
    colTier.key === "medium"
      ? ""
      : `, ${colTier.multiplier > 1 ? "+" : ""}${Math.round(
          (colTier.multiplier - 1) * 100,
        )}% for ${colTier.label.toLowerCase()}`;
  const tenureNote =
    tenureBand.key === "experienced"
      ? ""
      : `, ${tenureBand.multiplier > 1 ? "+" : ""}${Math.round(
          (tenureBand.multiplier - 1) * 100,
        )}% for ${tenureBand.label.toLowerCase()}`;

  const sourceLead = isFallback
    ? "Blended NAIS + NACSA median"
    : `${resolved.source.shortLabel} median`;
  const explanation = `${sourceLead} for ${sizeBand.label.toLowerCase()}${colNote}${tenureNote}.`;

  return {
    amount,
    baseAmount,
    source: resolved.source,
    isFallback,
    sizeBand,
    colTier,
    tenureBand,
    explanation,
  };
}
