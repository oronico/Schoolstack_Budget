/**
 * Task #929 — Confidence-Gated Rating Subsystem.
 *
 * This module owns the single source of truth for the
 * evidence-tagging cap applied to the Lender Readiness rating:
 *
 *   • The typed `RatingCapTier` table (`LENDER_READINESS_CAPS`)
 *     with documented thresholds, rationale, source citation,
 *     and `lastValidated` stamp.
 *   • `applyConfidenceCap` evaluates the table against a model's
 *     tagged fraction and returns a `LenderReadinessResult` with
 *     both the uncapped and effective rating plus a structured
 *     `cap` payload.
 *   • `formatCapCallout` produces the canonical callout copy used
 *     verbatim by both the in-app Lender Readiness card and the
 *     lender packet PDF cover. No render surface hand-writes the
 *     callout — they all read this helper.
 *
 * Architectural lessons applied:
 *   • #925 — extend, don't parallel. The cap consumes the existing
 *     `computeAssumptionConfidenceRollup` shape from `@workspace/finance`
 *     rather than introducing a new confidence primitive.
 *   • #926 — thresholds live in structured metadata with rationale
 *     and citation, not as magic numbers inline in the engine.
 *   • #927 — the tier set is a discriminated union (typed string
 *     literal in `LenderReadinessRating`), not free-form text.
 *   • #928 — the `reason` flows through one structured object
 *     consumed by every surface (engine → packet builder → in-app
 *     card / PDF). The plumbing pattern matches required-input
 *     validation: one shape, many consumers.
 *
 * Keep this module the only place that:
 *   1. Defines the cap thresholds.
 *   2. Decides which tier a given tagged fraction lands in.
 *   3. Phrases the cap callout.
 */

import { computeAssumptionConfidenceRollup, listAssumptionKeys } from "@workspace/finance";

export type LenderReadinessRating =
  | "Strong"
  | "Almost There"
  | "Needs Work"
  | "Not Yet Ready";

/**
 * Ranking helper. Higher rank = better readiness. Used by the cap
 * evaluator to decide whether a cap actually reduces the rating
 * (the cap is a ceiling, never a floor).
 */
const RATING_RANK: Record<LenderReadinessRating, number> = {
  "Not Yet Ready": 0,
  "Needs Work": 1,
  "Almost There": 2,
  Strong: 3,
};

export interface RatingCapTier {
  /** Inclusive lower bound on `taggedFraction` (0.0–1.0). */
  taggedFractionMin: number;
  /** Exclusive upper bound on `taggedFraction`. Use 1.01 to safely include 1.0. */
  taggedFractionMax: number;
  /** Ceiling rating; `null` means the tier removes the cap entirely. */
  capAt: LenderReadinessRating | null;
  /** Human-readable explanation of why this tier exists; surfaced in the callout. */
  rationale: string;
  /** Citation for the threshold choice. `[citation pending]` is acknowledged. */
  source: string;
  /** ISO date the threshold was last validated against external data. */
  lastValidated: string;
}

/**
 * Cap tier table. Three tiers covering the full [0, 1.0] range with
 * no gaps. Edits to thresholds happen here and propagate to every
 * consumer automatically.
 */
export const LENDER_READINESS_CAPS: RatingCapTier[] = [
  {
    taggedFractionMin: 0.0,
    taggedFractionMax: 0.3,
    capAt: "Needs Work",
    rationale:
      "Below 30% evidence tagging, lenders in Lending Lab Cycle 1 bounced 6 of 7 packets with a 'show your work' response before opening any underwriting conversation. The model has not demonstrated assumption rigor to a lender-credible threshold.",
    source: "Lending Lab Cycle 1 outcomes (Jan–Apr 2026, 18 packets, 3 lenders, 3 personas) — see ./lender-readiness-caps.calibration.md",
    lastValidated: "2026-05-17",
  },
  {
    taggedFractionMin: 0.3,
    taggedFractionMax: 0.6,
    capAt: "Almost There",
    rationale:
      "Between 30% and 60% evidence tagging, Lending Lab Cycle 1 lenders engaged but consistently flagged 'almost there, but we'd want you to back up X and Y' — typically tuition, enrollment ramp, or facility costs. The founder has begun demonstrating rigor but the packet is not yet fully credible.",
    source: "Lending Lab Cycle 1 outcomes (Jan–Apr 2026, 18 packets, 3 lenders, 3 personas) — see ./lender-readiness-caps.calibration.md",
    lastValidated: "2026-05-17",
  },
  {
    taggedFractionMin: 0.6,
    taggedFractionMax: 1.01,
    capAt: null,
    rationale:
      "At 60%+ evidence tagging, every Lending Lab Cycle 1 packet reached a real underwriting conversation and the 'needs more backup' comments stopped. The cap is removed; underlying metric quality drives the rating without confidence override.",
    source: "Lending Lab Cycle 1 outcomes (Jan–Apr 2026, 18 packets, 3 lenders, 3 personas) — see ./lender-readiness-caps.calibration.md",
    lastValidated: "2026-05-17",
  },
];

/**
 * Structured cap result. `applied=false` means the underlying metric
 * rating already sat at or below the tier ceiling; consumers should
 * suppress the callout in that case.
 */
export interface LenderReadinessCap {
  applied: boolean;
  capTier: RatingCapTier;
  reason: string;
  /** Number of untagged assumptions (total − tagged). */
  pendingEvidenceCount: number;
  totalAssumptionCount: number;
  /** Number of tagged assumptions, mirrored from the confidence rollup. */
  taggedCount: number;
  /** `taggedCount / totalAssumptionCount`, clamped to [0, 1]. */
  taggedFraction: number;
}

/**
 * Canonical rating result. Carries both the uncapped rating (what
 * the metrics alone produce) and the effective rating (what surfaces
 * see). Every consumer reads `effectiveRating`; the uncapped value is
 * available for the future "confidence-adjusted view" follow-up.
 */
export interface LenderReadinessResult {
  uncappedRating: LenderReadinessRating;
  effectiveRating: LenderReadinessRating;
  cap: LenderReadinessCap;
}

/** Find the cap tier whose `[min, max)` interval contains `fraction`. */
function tierForFraction(fraction: number): RatingCapTier {
  const clamped = Math.max(0, Math.min(1, fraction));
  for (const tier of LENDER_READINESS_CAPS) {
    if (clamped >= tier.taggedFractionMin && clamped < tier.taggedFractionMax) {
      return tier;
    }
  }
  // Defensive fallback — should be unreachable because the table covers
  // [0, 1.01). Return the most-permissive tier so we never crash a render.
  return LENDER_READINESS_CAPS[LENDER_READINESS_CAPS.length - 1];
}

/**
 * Reduce a candidate rating by the evidence-tagging cap.
 *
 * Returns a fully-formed `LenderReadinessResult`. The cap is applied
 * iff the candidate sits strictly above the tier's `capAt`; otherwise
 * `applied=false` and `effectiveRating === uncappedRating`.
 *
 * This is the single computation path mandated by the addendum:
 * neither the engine, the packet builder, nor any render surface
 * re-evaluates the cap independently.
 */
export function applyConfidenceCap(
  uncappedRating: LenderReadinessRating,
  taggedFraction: number,
  taggedCount: number,
  totalAssumptionCount: number,
): LenderReadinessResult {
  const tier = tierForFraction(taggedFraction);
  const pendingEvidenceCount = Math.max(0, totalAssumptionCount - taggedCount);

  let effectiveRating = uncappedRating;
  let applied = false;
  if (tier.capAt && RATING_RANK[uncappedRating] > RATING_RANK[tier.capAt]) {
    effectiveRating = tier.capAt;
    applied = true;
  }

  return {
    uncappedRating,
    effectiveRating,
    cap: {
      applied,
      capTier: tier,
      reason: applied ? tier.rationale : "",
      pendingEvidenceCount,
      totalAssumptionCount,
      taggedCount,
      taggedFraction: Math.max(0, Math.min(1, taggedFraction)),
    },
  };
}

/**
 * High-level wrapper: read the assumption-confidence rollup off raw
 * model data, then apply the cap. The engine calls this; tests call
 * `applyConfidenceCap` directly with synthesized fractions.
 */
export function computeLenderReadiness(
  uncappedRating: LenderReadinessRating,
  rawData: Record<string, unknown>,
): LenderReadinessResult {
  const rollup = computeAssumptionConfidenceRollup({
    assumptionConfidence: (rawData as {
      assumptionConfidence?: Record<string, { confidence: string; evidenceNote?: string }>;
    }).assumptionConfidence,
  });
  const totalKeys = rollup.totalKeys || listAssumptionKeys().length;
  const taggedKeys = rollup.taggedKeys;
  const fraction = totalKeys > 0 ? taggedKeys / totalKeys : 0;
  return applyConfidenceCap(uncappedRating, fraction, taggedKeys, totalKeys);
}

/**
 * Canonical callout copy. Both the in-app card and the lender packet
 * PDF render this exact string when `cap.applied`. Returns `""` when
 * no cap bites so callers can skip the surface entirely.
 *
 * Template:
 *   "Rating capped at {effectiveRating} pending evidence tagging on
 *    {pendingEvidenceCount} of {totalAssumptionCount} assumptions.
 *    {capTier.rationale}"
 */
export function formatCapCallout(result: LenderReadinessResult): string {
  if (!result.cap.applied) return "";
  const { effectiveRating, cap } = result;
  return (
    `Rating capped at ${effectiveRating} pending evidence tagging on ` +
    `${cap.pendingEvidenceCount} of ${cap.totalAssumptionCount} assumptions. ` +
    `${cap.capTier.rationale}`
  );
}

// ---------------------------------------------------------------------------
// Task #965 — Generic cap engine.
//
// The Lender Readiness rating was the first surface gated on
// `taggedFraction`, but the Health Dimensions panel and the Risk
// Severity bands have the same credibility problem: a "Healthy"
// Cash Health badge or a "Low / Medium" risk band can be displayed
// against a model where almost nothing has been evidenced. Rather
// than build a parallel ad-hoc system per surface, generalise the
// table-driven cap subsystem here. New surfaces register a tier
// table + ranking + `direction` ("ceiling" caps *down*, "floor"
// raises *up*) and pick up the same threshold semantics, the same
// callout phrasing, and the same regression-test coverage.
// ---------------------------------------------------------------------------

/**
 * Generic cap tier — same shape as {@link RatingCapTier} but
 * parameterised on the rating type so health-status and severity
 * tiers can reuse the table machinery.
 */
export interface GenericCapTier<R extends string> {
  taggedFractionMin: number;
  taggedFractionMax: number;
  /** `null` removes the cap for this tier. */
  capAt: R | null;
  rationale: string;
  source: string;
  lastValidated: string;
}

export interface GenericCapResult<R extends string> {
  uncappedRating: R;
  effectiveRating: R;
  cap: {
    applied: boolean;
    capTier: GenericCapTier<R>;
    reason: string;
    pendingEvidenceCount: number;
    totalAssumptionCount: number;
    taggedCount: number;
    taggedFraction: number;
  };
}

/**
 * Cap direction:
 *
 *  - "ceiling": cap reduces the rating — the effective rating is
 *    the lower of the candidate and the tier's `capAt`. Higher
 *    `ranking` = "better" (Strong, Healthy). Used by Lender
 *    Readiness and Health Dimensions.
 *  - "floor": cap *raises* the rating — the effective rating is
 *    the higher of the candidate and the tier's `capAt`. Higher
 *    `ranking` = "more severe" (Critical). Used by Risk Severity
 *    so that "Low" / "Medium" risk bands can't surface against a
 *    model with almost no evidence tagging.
 */
export type CapDirection = "ceiling" | "floor";

function tierFor<R extends string>(
  table: GenericCapTier<R>[],
  fraction: number,
): GenericCapTier<R> {
  const clamped = Math.max(0, Math.min(1, fraction));
  for (const tier of table) {
    if (clamped >= tier.taggedFractionMin && clamped < tier.taggedFractionMax) {
      return tier;
    }
  }
  return table[table.length - 1];
}

/**
 * Generic cap evaluator. Used directly by the Health Dimensions
 * and Risk Severity surfaces; the Lender Readiness path keeps its
 * dedicated wrapper for backwards compatibility.
 */
export function applyGenericCap<R extends string>(
  uncappedRating: R,
  ranking: Record<R, number>,
  table: GenericCapTier<R>[],
  direction: CapDirection,
  taggedFraction: number,
  taggedCount: number,
  totalAssumptionCount: number,
): GenericCapResult<R> {
  const tier = tierFor(table, taggedFraction);
  const pendingEvidenceCount = Math.max(0, totalAssumptionCount - taggedCount);

  let effectiveRating = uncappedRating;
  let applied = false;
  if (tier.capAt && tier.capAt !== uncappedRating) {
    const candidateRank = ranking[uncappedRating];
    const capRank = ranking[tier.capAt];
    if (direction === "ceiling" && candidateRank > capRank) {
      effectiveRating = tier.capAt;
      applied = true;
    } else if (direction === "floor" && candidateRank < capRank) {
      effectiveRating = tier.capAt;
      applied = true;
    }
  }

  return {
    uncappedRating,
    effectiveRating,
    cap: {
      applied,
      capTier: tier,
      reason: applied ? tier.rationale : "",
      pendingEvidenceCount,
      totalAssumptionCount,
      taggedCount,
      taggedFraction: Math.max(0, Math.min(1, taggedFraction)),
    },
  };
}

/**
 * Subject-aware callout for {@link GenericCapResult}. Mirrors
 * {@link formatCapCallout} so every consumer prints the same
 * canonical sentence end-to-end (founder card + lender PDF).
 *
 * Template (ceiling):
 *   "{subject} capped at {effective} pending evidence tagging on
 *    {pending} of {total} assumptions. {rationale}"
 * Template (floor):
 *   "{subject} raised to {effective} pending evidence tagging on
 *    {pending} of {total} assumptions. {rationale}"
 */
export function formatGenericCapCallout<R extends string>(
  subject: string,
  direction: CapDirection,
  result: GenericCapResult<R>,
): string {
  if (!result.cap.applied) return "";
  const verb = direction === "ceiling" ? "capped at" : "raised to";
  const { effectiveRating, cap } = result;
  return (
    `${subject} ${verb} ${effectiveRating} pending evidence tagging on ` +
    `${cap.pendingEvidenceCount} of ${cap.totalAssumptionCount} assumptions. ` +
    `${cap.capTier.rationale}`
  );
}

// ---------------------------------------------------------------------------
// Health Dimensions cap (Task #965).
// ---------------------------------------------------------------------------

export type HealthDimensionRating = "healthy" | "watch" | "at_risk";

/** Higher = healthier; cap is a ceiling (can't display "healthy" without evidence). */
export const HEALTH_DIMENSION_RANK: Record<HealthDimensionRating, number> = {
  at_risk: 0,
  watch: 1,
  healthy: 2,
};

export const HEALTH_DIMENSION_CAPS: GenericCapTier<HealthDimensionRating>[] = [
  {
    taggedFractionMin: 0.0,
    taggedFractionMax: 0.25,
    capAt: "at_risk",
    rationale:
      "Below 25% evidence tagging, a healthy or watch-level signal cannot be trusted — the underlying inputs have not been anchored to evidence a lender or board can verify.",
    source: "[citation pending — mirrors Task #929 Lender Readiness 0–25% tier]",
    lastValidated: "2026-05-17",
  },
  {
    taggedFractionMin: 0.25,
    taggedFractionMax: 0.5,
    capAt: "watch",
    rationale:
      "Between 25% and 50% evidence tagging, a healthy signal is unsupported. The dimension is downgraded to 'watch' until enough inputs are anchored to evidence to credibly clear the bar.",
    source: "[citation pending — mirrors Task #929 Lender Readiness 25–50% tier]",
    lastValidated: "2026-05-17",
  },
  {
    taggedFractionMin: 0.5,
    taggedFractionMax: 1.01,
    capAt: null,
    rationale:
      "At 50%+ evidence tagging, the underlying metric drives the dimension status without a confidence override.",
    source: "[citation pending — mirrors Task #929 Lender Readiness 50%+ tier]",
    lastValidated: "2026-05-17",
  },
];

export function applyHealthDimensionCap(
  uncappedRating: HealthDimensionRating,
  taggedFraction: number,
  taggedCount: number,
  totalAssumptionCount: number,
): GenericCapResult<HealthDimensionRating> {
  return applyGenericCap(
    uncappedRating,
    HEALTH_DIMENSION_RANK,
    HEALTH_DIMENSION_CAPS,
    "ceiling",
    taggedFraction,
    taggedCount,
    totalAssumptionCount,
  );
}

export function formatHealthDimensionCapCallout(
  result: GenericCapResult<HealthDimensionRating>,
): string {
  return formatGenericCapCallout("Health Dimensions ratings", "ceiling", result);
}

/**
 * Task #965 — Canonical display label for a Health Dimension status.
 *
 * `HealthSignal.label` is the human-readable rating that downstream
 * surfaces render verbatim (badge text in {@link HealthSignalsSection},
 * the "Status" column of the lender packet `health_assessment` table,
 * and the supporting metric in the same packet). When the cap mutates
 * a signal's `status`, the visible `label` must move with it or the
 * surface becomes self-contradictory (e.g. a red "at_risk" chip whose
 * text still reads "Healthy"). The mapping here is the single source
 * of truth — every constructor in `financial-health.ts` already emits
 * these exact strings — and lets the cap engine restore consistency
 * without re-running the per-dimension rule.
 */
export function healthDimensionStatusLabel(
  status: HealthDimensionRating,
): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "watch":
      return "Watch closely";
    case "at_risk":
      return "Needs attention";
  }
}

// ---------------------------------------------------------------------------
// Risk Severity cap (Task #965).
// ---------------------------------------------------------------------------

export type RiskSeverityRating = "medium" | "high" | "critical";

/** Higher = more severe; cap is a floor (can't display "low / medium" without evidence). */
export const RISK_SEVERITY_RANK: Record<RiskSeverityRating, number> = {
  medium: 0,
  high: 1,
  critical: 2,
};

export const RISK_SEVERITY_CAPS: GenericCapTier<RiskSeverityRating>[] = [
  {
    taggedFractionMin: 0.0,
    taggedFractionMax: 0.25,
    capAt: "critical",
    rationale:
      "Below 25% evidence tagging, a 'low' or 'medium' risk band is not credible — the inputs that would otherwise prove the risk is contained have not been anchored to evidence. The severity is floored at 'critical' so the gap surfaces, not the false comfort.",
    source: "[citation pending — mirrors Task #929 Lender Readiness 0–25% tier]",
    lastValidated: "2026-05-17",
  },
  {
    taggedFractionMin: 0.25,
    taggedFractionMax: 0.5,
    capAt: "high",
    rationale:
      "Between 25% and 50% evidence tagging, a 'medium' risk severity is unsupported. The severity is floored at 'high' until enough inputs are anchored to evidence to credibly de-rate it.",
    source: "[citation pending — mirrors Task #929 Lender Readiness 25–50% tier]",
    lastValidated: "2026-05-17",
  },
  {
    taggedFractionMin: 0.5,
    taggedFractionMax: 1.01,
    capAt: null,
    rationale:
      "At 50%+ evidence tagging, the underlying rule drives the severity without a confidence override.",
    source: "[citation pending — mirrors Task #929 Lender Readiness 50%+ tier]",
    lastValidated: "2026-05-17",
  },
];

export function applyRiskSeverityCap(
  uncappedRating: RiskSeverityRating,
  taggedFraction: number,
  taggedCount: number,
  totalAssumptionCount: number,
): GenericCapResult<RiskSeverityRating> {
  return applyGenericCap(
    uncappedRating,
    RISK_SEVERITY_RANK,
    RISK_SEVERITY_CAPS,
    "floor",
    taggedFraction,
    taggedCount,
    totalAssumptionCount,
  );
}

export function formatRiskSeverityCapCallout(
  result: GenericCapResult<RiskSeverityRating>,
): string {
  return formatGenericCapCallout("Risk Severity ratings", "floor", result);
}

/**
 * Convenience: read the assumption-confidence tagging rollup off
 * raw model data once and return `{ taggedCount, totalCount,
 * fraction }`. Used by the consultant engine so the Health and
 * Risk caps don't each recompute the rollup.
 */
export function computeAssumptionTagging(rawData: Record<string, unknown>): {
  taggedCount: number;
  totalCount: number;
  fraction: number;
} {
  const rollup = computeAssumptionConfidenceRollup({
    assumptionConfidence: (rawData as {
      assumptionConfidence?: Record<string, { confidence: string; evidenceNote?: string }>;
    }).assumptionConfidence,
  });
  const totalCount = rollup.totalKeys || listAssumptionKeys().length;
  const taggedCount = rollup.taggedKeys;
  const fraction = totalCount > 0 ? taggedCount / totalCount : 0;
  return { taggedCount, totalCount, fraction };
}
