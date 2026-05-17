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
    taggedFractionMax: 0.25,
    capAt: "Needs Work",
    rationale:
      "Below 25% evidence tagging, the model has not demonstrated assumption rigor to a lender-credible threshold. Underlying metrics may be strong but unverified inputs undermine the analysis.",
    source: "[citation pending — internal heuristic, calibrate against Lending Lab Cycle 1 outcomes]",
    lastValidated: "2026-05-17",
  },
  {
    taggedFractionMin: 0.25,
    taggedFractionMax: 0.5,
    capAt: "Almost There",
    rationale:
      "Between 25% and 50% evidence tagging, the founder has begun demonstrating rigor but has not reached the level where a lender can reasonably trust the full input set.",
    source: "[citation pending]",
    lastValidated: "2026-05-17",
  },
  {
    taggedFractionMin: 0.5,
    taggedFractionMax: 1.01,
    capAt: null,
    rationale:
      "At 50%+ evidence tagging, the cap is removed; the underlying metric quality drives the rating without confidence override.",
    source: "[citation pending]",
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
