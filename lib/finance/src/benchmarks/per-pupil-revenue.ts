// Task #926 — Per-pupil revenue benchmark validation subsystem.
//
// Canonical source of truth for Year-1 revenue-per-student sanity
// ranges keyed by (state, schoolType[, fundingProfile]). Lives in its
// own module (not inline in revenue-quality.ts) so future calibration
// tasks and citation work have a single home. Mirrors the citation
// discipline already established by `founder-comp-benchmarks.ts`:
// every entry carries a `source` and `lastValidated` field at the
// type level so the table cannot drift into unsourced data without a
// compiler failure.
//
// Liberty (AZ charter) demo at task-time produced $24,375 Y1 revenue
// per student — far above any AZ charter published per-pupil rate —
// and the engine silently passed it through to the lender packet.
// This subsystem catches that class of input for any current OR
// future persona, not just Liberty. See `evaluatePerPupilRevenue`
// for the typed evaluation contract and `findPerPupilBenchmark`
// for the lookup-with-wildcard-fallback semantics.

import type { SchoolType } from "../state-funding-data.js";

/**
 * Funding-profile refinement key. Mirrors the `schoolProfile.fundingProfile`
 * union as it is stored on `ModelData`; benchmarks may pin to a specific
 * profile (e.g., FL private + voucher-eligible) or leave it unset, in
 * which case the entry applies to any fundingProfile for the
 * (state, schoolType) pair.
 */
export type FundingProfile =
  | "tuition_based"
  | "voucher_eligible"
  | "charter_public_funded"
  | "donor_supported"
  | "hybrid"
  | string; // tolerant: legacy / new profiles not yet typed elsewhere

export interface PerPupilBenchmark {
  /**
   * ISO state code (e.g., "AZ", "FL"). A `*` wildcard applies when no
   * state-specific entry matches — used for state-agnostic benchmarks
   * such as microschool tuition-based revenue.
   */
  state: string;
  schoolType: SchoolType;
  /**
   * Optional fundingProfile refinement. When set, only models whose
   * `schoolProfile.fundingProfile` matches will resolve to this entry.
   * When omitted, the entry applies to any fundingProfile.
   */
  fundingProfile?: FundingProfile;
  /** Bottom of the typical published per-pupil revenue range, USD. */
  typicalLow: number;
  /** Top of the typical published per-pupil revenue range, USD. */
  typicalHigh: number;
  /**
   * Threshold above which the warning fires. Distinct from `typicalHigh`
   * so models slightly above the published band are not noisy — only
   * implausible outliers trigger the warning.
   */
  ceiling: number;
  /**
   * Human-readable citation. Required at the type level. Entries that
   * have not yet been pinned to an authoritative source carry the
   * literal text "internal estimate, calibration pending" so the
   * absence is visible (rather than silently empty).
   */
  source: string;
  /** Optional permalink to the cited source. */
  sourceUrl?: string;
  /** ISO date (YYYY-MM-DD) the benchmark was last reviewed. */
  lastValidated: string;
  /** Free-text context — weighting, SPED, exceptions. */
  notes?: string;
}

/**
 * Seeded benchmark entries. Citations are marked
 * "internal estimate, calibration pending" until the citation
 * calibration follow-up task lands; the numbers themselves are
 * anchored to publicly reported ranges per the task spec.
 */
export const PER_PUPIL_BENCHMARKS: readonly PerPupilBenchmark[] = [
  {
    state: "AZ",
    schoolType: "charter_school",
    typicalLow: 9_000,
    typicalHigh: 15_000,
    ceiling: 18_000,
    source: "internal estimate, calibration pending (AZ DOE Equalization Assistance Schedule)",
    lastValidated: "2026-05-17",
    notes: "Base equalization + classroom site fund typical; ceiling allows for SPED weighting and federal supplements.",
  },
  {
    state: "FL",
    schoolType: "private_school",
    // Intentionally omits fundingProfile so the entry applies to both
    // tuition-only and voucher-eligible FL private schools (the
    // Riverside demo seeds `tuition_based` even though the model
    // includes FES-EO voucher rows — the lookup must still resolve).
    typicalLow: 10_000,
    typicalHigh: 18_000,
    ceiling: 20_000,
    source: "internal estimate, calibration pending (FES-EO voucher schedule + FL private tuition surveys)",
    lastValidated: "2026-05-17",
    notes: "FES-EO voucher + tuition mix typical; ceiling allows headroom for high-tuition independent schools.",
  },
  {
    state: "*",
    schoolType: "microschool",
    fundingProfile: "tuition_based",
    typicalLow: 7_000,
    typicalHigh: 15_000,
    ceiling: 18_000,
    source: "internal estimate, calibration pending (National Microschooling Center pricing surveys)",
    lastValidated: "2026-05-17",
    notes: "Microschool tuition-based; ceiling allows for premium-positioned schools.",
  },
];

/**
 * Lookup with most-specific-first / wildcard-fallback semantics.
 * Resolution order:
 *   1. exact (state, schoolType, fundingProfile)
 *   2. (state, schoolType) — benchmark has no fundingProfile constraint
 *   3. wildcard (*, schoolType, fundingProfile)
 *   4. wildcard (*, schoolType) — benchmark has no fundingProfile
 * Returns `null` when no entry matches; callers must treat null as a
 * coverage gap and emit the `no_per_pupil_benchmark` informational
 * flag (see `evaluatePerPupilRevenue`).
 */
export function findPerPupilBenchmark(
  state: string | undefined,
  schoolType: SchoolType | undefined,
  fundingProfile?: string,
): PerPupilBenchmark | null {
  if (!schoolType) return null;
  const stateKey = (state || "").toUpperCase();
  const candidates = PER_PUPIL_BENCHMARKS.filter((b) => b.schoolType === schoolType);
  const tries: Array<(b: PerPupilBenchmark) => boolean> = [
    (b) => b.state.toUpperCase() === stateKey && !!b.fundingProfile && b.fundingProfile === fundingProfile,
    (b) => b.state.toUpperCase() === stateKey && !b.fundingProfile,
    (b) => b.state === "*" && !!b.fundingProfile && b.fundingProfile === fundingProfile,
    (b) => b.state === "*" && !b.fundingProfile,
  ];
  for (const pred of tries) {
    const hit = candidates.find(pred);
    if (hit) return hit;
  }
  return null;
}

/**
 * Typed evaluation result. Callers branch on the union — no
 * stringly-typed checks. `no_benchmark` means the lookup returned
 * null; the caller is expected to emit the informational
 * `no_per_pupil_benchmark` flag so coverage gaps are honest, not
 * silent.
 */
export type PerPupilEvaluation =
  | { outcome: "within_typical"; benchmark: PerPupilBenchmark; perPupil: number }
  | { outcome: "above_typical_below_ceiling"; benchmark: PerPupilBenchmark; perPupil: number }
  | { outcome: "above_ceiling"; benchmark: PerPupilBenchmark; perPupil: number }
  | { outcome: "below_typical"; benchmark: PerPupilBenchmark; perPupil: number }
  | { outcome: "no_benchmark"; perPupil: number };

export function evaluatePerPupilRevenue(
  perPupil: number,
  benchmark: PerPupilBenchmark | null,
): PerPupilEvaluation {
  if (!benchmark) return { outcome: "no_benchmark", perPupil };
  if (perPupil > benchmark.ceiling)
    return { outcome: "above_ceiling", benchmark, perPupil };
  if (perPupil > benchmark.typicalHigh)
    return { outcome: "above_typical_below_ceiling", benchmark, perPupil };
  if (perPupil < benchmark.typicalLow)
    return { outcome: "below_typical", benchmark, perPupil };
  return { outcome: "within_typical", benchmark, perPupil };
}

/** Format helper used by the flag-emission layer to keep copy canonical. */
export function formatPerPupilUSD(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Canonical copy template for the per-pupil revenue flag family.
 *
 * Single source of truth for the strings that surface on the lender
 * packet, board packet, wizard, and any future surface that renders
 * an AssumptionFlag derived from `evaluatePerPupilRevenue`. Centralising
 * the copy here (rather than building it inline at the flag-emission
 * site) prevents drift across surfaces and makes it possible to swap
 * tone/wording without touching every consumer.
 *
 * Returns `null` for the `within_typical` and `below_typical` outcomes:
 * `within_typical` is the happy path and should not emit a flag, and
 * `below_typical` is intentionally suppressed today because most
 * legitimately-low models are tuition-discount or scholarship-heavy
 * scenarios where a sub-typical band is expected; adding that as a
 * flag would be noise. Surfaces that want to render a positive
 * confirmation for `within_typical` should do so from a different
 * code path (e.g., the lender Revenue Quality table already shows
 * the per-student figure alongside the band).
 */
export type PerPupilFlagSeverity = "warning" | "info";
export interface PerPupilFlagCopy {
  flagType:
    | "per_pupil_revenue_above_benchmark"
    | "per_pupil_revenue_above_typical"
    | "no_per_pupil_benchmark";
  severity: PerPupilFlagSeverity;
  field: "year1.perPupilRevenue";
  currentValue: string;
  benchmark: string;
  defaultPrompt: string;
  nextStep: string;
}

function schoolTypeLabel(schoolType: SchoolType | undefined): string {
  return schoolType === "charter_school"
    ? "charter"
    : schoolType === "private_school"
      ? "private"
      : schoolType === "microschool"
        ? "microschool"
        : "school";
}

export function buildPerPupilFlagCopy(
  evaluation: PerPupilEvaluation,
  context: { state?: string; schoolType?: SchoolType },
): PerPupilFlagCopy | null {
  const stateLabel = context.state || "your state";
  const typeLabel = schoolTypeLabel(context.schoolType);
  const ppFmt = formatPerPupilUSD(evaluation.perPupil);

  if (evaluation.outcome === "above_ceiling") {
    const b = evaluation.benchmark;
    const lowFmt = formatPerPupilUSD(b.typicalLow);
    const highFmt = formatPerPupilUSD(b.typicalHigh);
    const ceilFmt = formatPerPupilUSD(b.ceiling);
    return {
      flagType: "per_pupil_revenue_above_benchmark",
      severity: "warning",
      field: "year1.perPupilRevenue",
      currentValue: `Y1 revenue per student of ${ppFmt} is above the typical ${stateLabel} ${typeLabel} range. Verify per-pupil rate breakdown.`,
      benchmark: `${lowFmt}–${highFmt} typical, ${ceilFmt} ceiling (${b.source})`,
      defaultPrompt: `Year 1 revenue per student computes to ${ppFmt}, above the ${ceilFmt} ceiling for ${stateLabel} ${typeLabel} schools (${b.source}; typical range ${lowFmt}–${highFmt}). Either confirm the per-pupil rate breakdown lender-side or trim Step 5: Revenue lines that are stacking on the same seat.`,
      nextStep: `Open Step 5: Revenue and confirm each per-pupil rate against ${b.source}; if the stack is intentional, capture the rate-build narrative in Step 1: Story.`,
    };
  }
  if (evaluation.outcome === "above_typical_below_ceiling") {
    const b = evaluation.benchmark;
    const lowFmt = formatPerPupilUSD(b.typicalLow);
    const highFmt = formatPerPupilUSD(b.typicalHigh);
    const ceilFmt = formatPerPupilUSD(b.ceiling);
    return {
      flagType: "per_pupil_revenue_above_typical",
      severity: "info",
      field: "year1.perPupilRevenue",
      currentValue: `Y1 revenue per student of ${ppFmt} is above the typical ${stateLabel} ${typeLabel} range (${lowFmt}–${highFmt}) but below the ${ceilFmt} ceiling.`,
      benchmark: `${lowFmt}–${highFmt} typical, ${ceilFmt} ceiling (${b.source})`,
      defaultPrompt: `Year 1 revenue per student computes to ${ppFmt}, above the typical ${lowFmt}–${highFmt} band for ${stateLabel} ${typeLabel} schools (${b.source}) but below the ${ceilFmt} ceiling. Worth a one-line note for the lender on what positions you above the median.`,
      nextStep: `Open Step 1: Story and add a short pricing-position note explaining why ${ppFmt}/student is defensible for your ${stateLabel} ${typeLabel} model.`,
    };
  }
  if (evaluation.outcome === "no_benchmark") {
    return {
      flagType: "no_per_pupil_benchmark",
      severity: "info",
      field: "year1.perPupilRevenue",
      currentValue: `Y1 revenue per student of ${ppFmt}; no published per-pupil benchmark available for ${stateLabel} ${typeLabel}.`,
      benchmark: "No benchmark available — verify against state appropriation schedule",
      defaultPrompt: `No per-pupil benchmark is on file for ${stateLabel} ${typeLabel}; the engine is not validating your ${ppFmt}/student input. Cite the state appropriation schedule (or comparable tuition survey) in your assumptions so the lender can verify the rate independently.`,
      nextStep: `Open Step 5: Revenue and attach a citation (state appropriation schedule or tuition survey) to your per-pupil rate so the lender can verify it.`,
    };
  }
  // within_typical and below_typical intentionally suppressed (see jsdoc).
  return null;
}
