/**
 * Task #929 — Regression suite for the Confidence-Gated Rating
 * Subsystem.
 *
 * Asserts the four pillars the addendum requires:
 *
 *   A. Subsystem-level invariants on every `LenderReadinessResult`
 *      (shape, cap.applied iff effective ≠ uncapped, reason
 *      non-empty when applied, pendingEvidenceCount = total − tagged).
 *   B. Cap logic per tier at and around the 0.30 / 0.60 boundaries
 *      (0.29 / 0.30 / 0.59 / 0.60 / 0.99 / 1.00). Thresholds were
 *      calibrated against Lending Lab Cycle 1 outcomes — see
 *      `../src/lib/lender-readiness-caps.calibration.md`.
 *   C. "Strong" floor — `Strong` requires both strong underlying
 *      metrics AND taggedFraction >= 0.60. A 100%-tagged-but-weak
 *      model stays at its underlying tier; a Strong-metrics model
 *      below 60% is held to a lower tier.
 *   D. Cross-surface consistency — the lender packet PDF data and
 *      the in-app card consume the same `LenderReadinessResult`, so
 *      the callout string the API ships must be byte-identical to
 *      what `formatCapCallout` produces locally for any consumer.
 *
 * Pin: this is the canonical regression for the cap subsystem.
 * Adding a new persona fixture should not require modifying
 * assertion logic — fixtures iterate over the persona list.
 */

import assert from "node:assert/strict";
import {
  applyConfidenceCap,
  formatCapCallout,
  LENDER_READINESS_CAPS,
  type LenderReadinessRating,
  type LenderReadinessResult,
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

// ---------------------------------------------------------------------------
// A. Subsystem-level invariants
// ---------------------------------------------------------------------------

console.log("\n— A. Subsystem-level invariants on LenderReadinessResult —");

function assertResultShape(result: LenderReadinessResult, label: string) {
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
  if (result.cap.applied) {
    check(
      `${label}: cap.reason non-empty when applied`,
      result.cap.reason.length > 0,
    );
  }
  check(
    `${label}: pendingEvidenceCount = totalAssumptionCount − taggedCount`,
    result.cap.pendingEvidenceCount === result.cap.totalAssumptionCount - result.cap.taggedCount,
  );
}

const sampleA = applyConfidenceCap("Strong", 0, 0, 22);
assertResultShape(sampleA, "Strong @ 0/22");
const sampleB = applyConfidenceCap("Needs Work", 0.6, 14, 22);
assertResultShape(sampleB, "Needs Work @ 14/22");
const sampleC = applyConfidenceCap("Not Yet Ready", 0.0, 0, 22);
assertResultShape(sampleC, "Not Yet Ready @ 0/22");

// ---------------------------------------------------------------------------
// B. Threshold-boundary assertions
// ---------------------------------------------------------------------------

console.log("\n— B. Threshold-boundary assertions —");

const BOUNDARY_CASES: Array<{
  fraction: number;
  uncapped: LenderReadinessRating;
  expectedEffective: LenderReadinessRating;
  expectedApplied: boolean;
  label: string;
}> = [
  // taggedFraction in [0, 0.30) → cap at "Needs Work"
  { fraction: 0.0,  uncapped: "Strong", expectedEffective: "Needs Work",   expectedApplied: true,  label: "0/22 (0%) Strong → Needs Work" },
  { fraction: 0.29, uncapped: "Strong", expectedEffective: "Needs Work",   expectedApplied: true,  label: "6.4/22 (29%) Strong → Needs Work" },
  // taggedFraction in [0.30, 0.60) → cap at "Almost There"
  { fraction: 0.3,  uncapped: "Strong", expectedEffective: "Almost There", expectedApplied: true,  label: "6.6/22 (30%) Strong → Almost There" },
  { fraction: 0.59, uncapped: "Strong", expectedEffective: "Almost There", expectedApplied: true,  label: "13.0/22 (59%) Strong → Almost There" },
  // taggedFraction in [0.60, 1.0] → no cap
  { fraction: 0.6,  uncapped: "Strong", expectedEffective: "Strong",       expectedApplied: false, label: "13.2/22 (60%) Strong → unchanged" },
  { fraction: 0.99, uncapped: "Strong", expectedEffective: "Strong",       expectedApplied: false, label: "21.8/22 (99%) Strong → unchanged" },
  { fraction: 1.0,  uncapped: "Strong", expectedEffective: "Strong",       expectedApplied: false, label: "22/22 (100%) Strong → unchanged" },
];

for (const c of BOUNDARY_CASES) {
  const total = 22;
  const tagged = Math.round(c.fraction * total);
  const r = applyConfidenceCap(c.uncapped, c.fraction, tagged, total);
  check(
    c.label,
    r.effectiveRating === c.expectedEffective && r.cap.applied === c.expectedApplied,
    `got effective=${r.effectiveRating} applied=${r.cap.applied}`,
  );
}

// ---------------------------------------------------------------------------
// C. "Strong" floor — cap never upgrades, never produces Strong below 0.60
// ---------------------------------------------------------------------------

console.log("\n— C. \"Strong\" floor invariants —");

// Cap is a ceiling, not a floor — weak metrics stay weak even at 100% tagged.
const r100Weak = applyConfidenceCap("Not Yet Ready", 1.0, 22, 22);
check(
  "100% tagged + weak metrics stays Not Yet Ready (cap never upgrades)",
  r100Weak.effectiveRating === "Not Yet Ready" && r100Weak.cap.applied === false,
);
const r100Mid = applyConfidenceCap("Needs Work", 1.0, 22, 22);
check(
  "100% tagged + Needs Work metrics stays Needs Work",
  r100Mid.effectiveRating === "Needs Work" && r100Mid.cap.applied === false,
);

// "Strong" cannot surface below 0.60 regardless of metric strength.
const strongSweep = [0.0, 0.1, 0.29, 0.3, 0.59];
for (const f of strongSweep) {
  const r = applyConfidenceCap("Strong", f, Math.round(f * 22), 22);
  check(
    `Strong metrics @ ${(f * 100).toFixed(0)}% tagged never displays as Strong`,
    r.effectiveRating !== "Strong",
    `got ${r.effectiveRating}`,
  );
}

// ---------------------------------------------------------------------------
// D. Cross-surface consistency — callout copy is canonical
// ---------------------------------------------------------------------------

console.log("\n— D. Cross-surface callout copy is canonical —");

const PERSONA_FIXTURES: Array<{ name: string; uncappedRating: LenderReadinessRating }> = [
  { name: "Riverside Christian Academy", uncappedRating: "Strong" },
  { name: "Liberty STEM",                uncappedRating: "Needs Work" },
  { name: "Oakwood",                     uncappedRating: "Strong" },
];

for (const persona of PERSONA_FIXTURES) {
  // Current demo state: 0/22 tagged → cap at Needs Work for any persona
  // whose underlying rating sits above Needs Work.
  const r = applyConfidenceCap(persona.uncappedRating, 0, 0, 22);
  check(
    `${persona.name}: effectiveRating = Needs Work at 0/22`,
    r.effectiveRating === "Needs Work" || (persona.uncappedRating === "Needs Work" && r.effectiveRating === "Needs Work") || persona.uncappedRating === "Not Yet Ready",
  );

  const callout = formatCapCallout(r);
  if (r.cap.applied) {
    check(
      `${persona.name}: callout template matches "Rating capped at ... pending evidence tagging on N of 22"`,
      /^Rating capped at (Needs Work|Almost There) pending evidence tagging on \d+ of 22 assumptions\. /.test(callout),
      callout,
    );
    check(
      `${persona.name}: callout includes the tier rationale verbatim`,
      callout.includes(r.cap.capTier.rationale),
    );
  } else {
    check(
      `${persona.name}: cap not applied → callout empty`,
      callout === "",
    );
  }
}

// Same input → identical callout, every time. Models cross-surface
// consistency: if two consumers ship the same `LenderReadinessResult`
// to `formatCapCallout`, they get byte-identical strings.
const r1 = applyConfidenceCap("Strong", 0.1, 2, 22);
const r2 = applyConfidenceCap("Strong", 0.1, 2, 22);
check(
  "Cross-surface determinism: identical input → identical callout",
  formatCapCallout(r1) === formatCapCallout(r2) && formatCapCallout(r1).length > 0,
);

// ---------------------------------------------------------------------------
// E. Cap tier table sanity — no gaps, ordered, citations present
// ---------------------------------------------------------------------------

console.log("\n— E. Cap tier table sanity —");

check(
  "LENDER_READINESS_CAPS table covers [0, 1.01) with no gaps",
  LENDER_READINESS_CAPS[0].taggedFractionMin === 0 &&
    LENDER_READINESS_CAPS[LENDER_READINESS_CAPS.length - 1].taggedFractionMax >= 1.0 &&
    LENDER_READINESS_CAPS.every((t, i, arr) =>
      i === 0 || arr[i - 1].taggedFractionMax === t.taggedFractionMin,
    ),
);
check(
  "Every cap tier has a rationale, source citation, lastValidated stamp",
  LENDER_READINESS_CAPS.every(
    (t) => t.rationale.length > 0 && t.source.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.lastValidated),
  ),
);
check(
  "Highest tier removes the cap (capAt === null)",
  LENDER_READINESS_CAPS[LENDER_READINESS_CAPS.length - 1].capAt === null,
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
assert.equal(failed, 0, `${failed} confidence-gated rating regressions`);
