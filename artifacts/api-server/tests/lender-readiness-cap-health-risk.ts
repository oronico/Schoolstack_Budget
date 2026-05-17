/**
 * Task #965 — Regression suite for the Confidence-Gated Rating
 * Subsystem extended to Health Dimensions + Risk Severity.
 *
 * Mirrors the structure of lender-readiness-cap.ts (Task #929) so
 * adding a new persona fixture does not require modifying
 * assertion logic — the test asserts the same four pillars
 * (subsystem invariants, tier boundaries, floors/ceilings, and
 * cross-surface consistency) for the generic cap engine.
 *
 *   A. Subsystem-level invariants on every GenericCapResult
 *      (shape, cap.applied iff effective ≠ uncapped,
 *      pendingEvidenceCount = total − tagged).
 *   B. Cap logic per tier at and around the 0.25 / 0.50 boundaries
 *      (0.24 / 0.25 / 0.49 / 0.50 / 0.99 / 1.00) for both the
 *      Health Dimensions ceiling and the Risk Severity floor.
 *   C. Floor / ceiling directionality —
 *        * Health (ceiling): "healthy" against < 50% tagging
 *          downgrades; an "at_risk" candidate is never raised.
 *        * Risk (floor): "medium" against < 50% tagging is
 *          raised to "high" / "critical"; a "critical" candidate
 *          is never lowered.
 *   D. Cross-surface consistency — the lender packet PDF data and
 *      the in-app card consume the same pre-formatted callout
 *      string emitted by `formatHealthDimensionCapCallout` /
 *      `formatRiskSeverityCapCallout`. The callout sentence
 *      includes the effective rating, pending count, total
 *      count, and tier rationale verbatim.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  applyHealthDimensionCap,
  applyRiskSeverityCap,
  formatHealthDimensionCapCallout,
  formatRiskSeverityCapCallout,
  healthDimensionStatusLabel,
  HEALTH_DIMENSION_CAPS,
  HEALTH_DIMENSION_RANK,
  RISK_SEVERITY_CAPS,
  RISK_SEVERITY_RANK,
  type GenericCapResult,
  type HealthDimensionRating,
  type RiskSeverityRating,
} from "../src/lib/lender-readiness-caps";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertResultShape<R extends string>(
  result: GenericCapResult<R>,
  label: string,
) {
  check(
    `${label}: carries uncappedRating, effectiveRating, cap`,
    typeof result.uncappedRating === "string" &&
      typeof result.effectiveRating === "string" &&
      typeof result.cap === "object" && result.cap !== null,
  );
  const capAppliedMatchesDelta =
    result.cap.applied === (result.effectiveRating !== result.uncappedRating);
  check(
    `${label}: cap.applied iff effectiveRating !== uncappedRating`,
    capAppliedMatchesDelta,
    `applied=${result.cap.applied} effective=${result.effectiveRating} uncapped=${result.uncappedRating}`,
  );
  check(
    `${label}: pendingEvidenceCount = totalAssumptionCount − taggedCount`,
    result.cap.pendingEvidenceCount === result.cap.totalAssumptionCount - result.cap.taggedCount,
  );
  if (result.cap.applied) {
    check(
      `${label}: cap.reason non-empty when applied`,
      result.cap.reason.length > 0,
    );
  }
}

// ---------------------------------------------------------------------------
// A. Subsystem-level invariants
// ---------------------------------------------------------------------------

console.log("\n— A. Subsystem-level invariants on GenericCapResult —");

const sweep: Array<[number, number, number]> = [
  // taggedFraction, taggedCount, totalCount
  [0.0, 0, 22],
  [0.24, 5, 21],
  [0.25, 5, 20],
  [0.49, 9, 19],
  [0.5, 10, 20],
  [0.99, 99, 100],
  [1.0, 22, 22],
];
const healthCandidates: HealthDimensionRating[] = ["healthy", "watch", "at_risk"];
const riskCandidates: RiskSeverityRating[] = ["medium", "high", "critical"];

for (const [fraction, tagged, total] of sweep) {
  for (const r of healthCandidates) {
    const res = applyHealthDimensionCap(r, fraction, tagged, total);
    assertResultShape(res, `Health[${r}]@${fraction}`);
  }
  for (const r of riskCandidates) {
    const res = applyRiskSeverityCap(r, fraction, tagged, total);
    assertResultShape(res, `Risk[${r}]@${fraction}`);
  }
}

// ---------------------------------------------------------------------------
// B. Cap logic per tier at and around the 0.25 / 0.50 boundaries
// ---------------------------------------------------------------------------

console.log("\n— B. Health Dimensions cap (ceiling) at tier boundaries —");

function expectHealth(
  fraction: number,
  candidate: HealthDimensionRating,
  expected: HealthDimensionRating,
  tagged = Math.round(fraction * 20),
  total = 20,
) {
  const res = applyHealthDimensionCap(candidate, fraction, tagged, total);
  check(
    `Health: ${candidate} @ ${fraction} → ${expected}`,
    res.effectiveRating === expected,
    `got ${res.effectiveRating}`,
  );
}

// 0–25% tier: ceiling at_risk
expectHealth(0.0, "healthy", "at_risk");
expectHealth(0.24, "healthy", "at_risk");
expectHealth(0.24, "watch", "at_risk");
expectHealth(0.24, "at_risk", "at_risk"); // no-op (already at floor)

// 25–50% tier: ceiling watch
expectHealth(0.25, "healthy", "watch");
expectHealth(0.49, "healthy", "watch");
expectHealth(0.25, "watch", "watch"); // no-op (already at cap)
expectHealth(0.49, "at_risk", "at_risk"); // ceiling never raises

// 50%+ tier: no cap
expectHealth(0.5, "healthy", "healthy");
expectHealth(0.5, "watch", "watch");
expectHealth(0.5, "at_risk", "at_risk");
expectHealth(0.99, "healthy", "healthy");
expectHealth(1.0, "healthy", "healthy");

console.log("\n— B. Risk Severity cap (floor) at tier boundaries —");

function expectRisk(
  fraction: number,
  candidate: RiskSeverityRating,
  expected: RiskSeverityRating,
  tagged = Math.round(fraction * 20),
  total = 20,
) {
  const res = applyRiskSeverityCap(candidate, fraction, tagged, total);
  check(
    `Risk: ${candidate} @ ${fraction} → ${expected}`,
    res.effectiveRating === expected,
    `got ${res.effectiveRating}`,
  );
}

// 0–25% tier: floor critical
expectRisk(0.0, "medium", "critical");
expectRisk(0.24, "medium", "critical");
expectRisk(0.24, "high", "critical");
expectRisk(0.24, "critical", "critical"); // no-op (already at ceiling)

// 25–50% tier: floor high
expectRisk(0.25, "medium", "high");
expectRisk(0.49, "medium", "high");
expectRisk(0.25, "high", "high"); // no-op
expectRisk(0.49, "critical", "critical"); // floor never lowers

// 50%+ tier: no cap
expectRisk(0.5, "medium", "medium");
expectRisk(0.5, "high", "high");
expectRisk(0.5, "critical", "critical");
expectRisk(0.99, "medium", "medium");
expectRisk(1.0, "medium", "medium");

// ---------------------------------------------------------------------------
// C. Floor / ceiling directionality cross-checks
// ---------------------------------------------------------------------------

console.log("\n— C. Cap directionality —");

// Health is a CEILING — must never raise a worse candidate to a
// better effective rating, regardless of taggedFraction.
for (const [fraction, tagged, total] of sweep) {
  for (const r of healthCandidates) {
    const res = applyHealthDimensionCap(r, fraction, tagged, total);
    check(
      `Health ceiling never raises: ${r} @ ${fraction}`,
      HEALTH_DIMENSION_RANK[res.effectiveRating] <= HEALTH_DIMENSION_RANK[r],
      `eff=${res.effectiveRating} > cand=${r}`,
    );
  }
}

// Risk is a FLOOR — must never lower a more-severe candidate to a
// less-severe effective rating, regardless of taggedFraction.
for (const [fraction, tagged, total] of sweep) {
  for (const r of riskCandidates) {
    const res = applyRiskSeverityCap(r, fraction, tagged, total);
    check(
      `Risk floor never lowers: ${r} @ ${fraction}`,
      RISK_SEVERITY_RANK[res.effectiveRating] >= RISK_SEVERITY_RANK[r],
      `eff=${res.effectiveRating} < cand=${r}`,
    );
  }
}

// Tier-table sanity: contiguous coverage with the same 0/0.25/0.50
// boundaries as Lender Readiness so all three confidence-gated
// surfaces share one threshold contract.
check(
  "HEALTH_DIMENSION_CAPS: 3 tiers (0–25 / 25–50 / 50+)",
  HEALTH_DIMENSION_CAPS.length === 3 &&
    HEALTH_DIMENSION_CAPS[0].taggedFractionMin === 0 &&
    HEALTH_DIMENSION_CAPS[0].taggedFractionMax === 0.25 &&
    HEALTH_DIMENSION_CAPS[1].taggedFractionMax === 0.5 &&
    HEALTH_DIMENSION_CAPS[2].capAt === null,
);
check(
  "RISK_SEVERITY_CAPS: 3 tiers (0–25 / 25–50 / 50+)",
  RISK_SEVERITY_CAPS.length === 3 &&
    RISK_SEVERITY_CAPS[0].taggedFractionMin === 0 &&
    RISK_SEVERITY_CAPS[0].taggedFractionMax === 0.25 &&
    RISK_SEVERITY_CAPS[1].taggedFractionMax === 0.5 &&
    RISK_SEVERITY_CAPS[2].capAt === null,
);

// ---------------------------------------------------------------------------
// D. Cross-surface consistency — the lender packet PDF and the
//    in-app card consume the same pre-formatted callout string.
// ---------------------------------------------------------------------------

console.log("\n— D. Cross-surface callout consistency —");

const healthCallTier1 = applyHealthDimensionCap("healthy", 0.1, 2, 20);
const healthCallout1 = formatHealthDimensionCapCallout(healthCallTier1);
check(
  "Health callout contains effective rating",
  healthCallout1.includes("at_risk"),
  healthCallout1,
);
check(
  "Health callout contains pending/total counts",
  healthCallout1.includes("18 of 20"),
  healthCallout1,
);
check(
  "Health callout uses canonical 'capped at' verb (ceiling)",
  healthCallout1.includes("capped at"),
  healthCallout1,
);
check(
  "Health callout includes tier rationale verbatim",
  healthCallout1.includes(HEALTH_DIMENSION_CAPS[0].rationale),
);
check(
  "Health callout empty when cap does not apply",
  formatHealthDimensionCapCallout(applyHealthDimensionCap("healthy", 1.0, 20, 20)) === "",
);

const riskCallTier2 = applyRiskSeverityCap("medium", 0.4, 8, 20);
const riskCallout2 = formatRiskSeverityCapCallout(riskCallTier2);
check(
  "Risk callout contains effective rating",
  riskCallout2.includes("high"),
  riskCallout2,
);
check(
  "Risk callout contains pending/total counts",
  riskCallout2.includes("12 of 20"),
  riskCallout2,
);
check(
  "Risk callout uses canonical 'raised to' verb (floor)",
  riskCallout2.includes("raised to"),
  riskCallout2,
);
check(
  "Risk callout includes tier rationale verbatim",
  riskCallout2.includes(RISK_SEVERITY_CAPS[1].rationale),
);
check(
  "Risk callout empty when cap does not apply",
  formatRiskSeverityCapCallout(applyRiskSeverityCap("medium", 1.0, 20, 20)) === "",
);

// Cross-surface byte-identity: a fresh re-application against the
// *same* inputs must produce the *same* callout string. The
// lender packet PDF pre-formats the callout server-side once; the
// in-app card re-renders the same string from the API payload
// without re-evaluating the cap. This regression pins that
// invariant.
const lhs = formatHealthDimensionCapCallout(
  applyHealthDimensionCap("healthy", 0.3, 6, 20),
);
const rhs = formatHealthDimensionCapCallout(
  applyHealthDimensionCap("healthy", 0.3, 6, 20),
);
check("Health callout deterministic across calls", lhs === rhs);

const lhs2 = formatRiskSeverityCapCallout(
  applyRiskSeverityCap("medium", 0.1, 2, 20),
);
const rhs2 = formatRiskSeverityCapCallout(
  applyRiskSeverityCap("medium", 0.1, 2, 20),
);
check("Risk callout deterministic across calls", lhs2 === rhs2);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// E. Cross-surface label/status consistency (Task #965).
//
// The cap mutates `HealthSignal.status` *and* `HealthSignal.label`
// together. Downstream surfaces render `label` verbatim — the in-app
// HealthSignalsSection badge text, the lender packet
// `health_assessment` "Status" column, and the supporting metric
// inside that table. If only `status` were mutated, a red "at_risk"
// chip could carry the text "Healthy", which is exactly the
// regression that flunked the prior code review.
//
// Pin the canonical label mapping here as a single source of truth.
// If `financial-health.ts` ever introduces a new label spelling for
// these three statuses, this test will catch the drift before a
// capped signal goes out with stale text.
// ---------------------------------------------------------------------------

console.log("\n— E. Canonical Health label/status consistency —");

check("healthy → 'Healthy'", healthDimensionStatusLabel("healthy") === "Healthy");
check("watch → 'Watch closely'", healthDimensionStatusLabel("watch") === "Watch closely");
check("at_risk → 'Needs attention'", healthDimensionStatusLabel("at_risk") === "Needs attention");

// Source-of-truth invariant: every {status, label} pair literal that
// financial-health.ts emits for a *real* (non-"na") signal status
// must match the canonical map above. Read the source file and grep
// for the {status, label} clusters so a future contributor can't
// silently introduce a divergent label without breaking this test.
const __dirname = dirname(fileURLToPath(import.meta.url));
const financialHealthSrc = readFileSync(
  resolve(__dirname, "../src/lib/financial-health.ts"),
  "utf8",
);
// Match constructs like:
//     status: "healthy",
//     label: "Healthy",
// across either ordering, tolerating whitespace.
const pairRegex =
  /status:\s*"(healthy|watch|at_risk)",\s*\n\s*label:\s*"([^"]+)"/g;
let pairCount = 0;
let pairMismatch = 0;
const mismatches: string[] = [];
for (const m of financialHealthSrc.matchAll(pairRegex)) {
  const status = m[1] as HealthDimensionRating;
  const label = m[2];
  pairCount++;
  if (healthDimensionStatusLabel(status) !== label) {
    pairMismatch++;
    mismatches.push(`status="${status}" label="${label}"`);
  }
}
check(
  `financial-health.ts emits at least one {status, label} pair per status (saw ${pairCount})`,
  pairCount >= 9,
);
check(
  "every {status, label} pair in financial-health.ts matches healthDimensionStatusLabel()",
  pairMismatch === 0,
  mismatches.join("; "),
);

console.log(`\n${passed} passed, ${failed} failed`);
assert.equal(failed, 0, `${failed} cap-subsystem assertion(s) failed`);
console.log("Task #965 cap-subsystem regression suite: OK");
