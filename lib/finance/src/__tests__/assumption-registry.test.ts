/**
 * Task #703 — T1 / T6 regression test for `rollupAssumptionConfidence`.
 *
 * Pins the legacy posture-with-breakdown shape the wizard's Review step
 * and the assumptions-confidence card both consume:
 *   {
 *     posture: "Strong" | "Moderate" | "Needs Support",
 *     evidenceCount: number,        // (read from `withEvidence`)
 *     total: number,
 *     breakdown: Record<level, number>,
 *     highImpactGap: boolean,
 *   }
 *
 * The high-impact-gap floor is the trickiest invariant — a single
 * bare-estimate tuition or enrollment number must drag the posture to
 * "Needs Support" even when the weighted ratio looks healthy. Any future
 * refactor that drops that override will trip these assertions.
 *
 * Mirrors the hand-rolled check()/passed/failures pattern used by the
 * other tests in this package (scenario-engine-dscr.test.ts,
 * lender-stress-tests.test.ts) so it runs under `tsx` with no extra
 * test-framework dependency in the finance workspace.
 */
import {
  rollupAssumptionConfidence,
  listAssumptionKeys,
  type AssumptionConfidenceEntry,
  type AssumptionConfidenceLevel,
} from "../assumption-registry.js";

const failures: string[] = [];
let passed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function entry(
  level: AssumptionConfidenceLevel,
  withEvidence = true,
): AssumptionConfidenceEntry {
  // entryHasEvidence (in assumption-registry.ts) returns true when either
  // (a) evidenceFiles is non-empty, (b) confidence !== "estimate", or
  // (c) evidenceNote is a non-empty string. We use evidenceNote to opt
  // in, and an empty string to opt out — that keeps the "estimate +
  // no anchor" path testable for the high-impact-gap floor.
  return {
    confidence: level,
    evidenceNote: withEvidence ? "anchored" : "",
    evidenceFiles: [],
  };
}

function main() {
  const allKeys = listAssumptionKeys();
  const total = allKeys.length;

  // --- empty / null / undefined input ---
  for (const empty of [undefined, null, {}]) {
    const r = rollupAssumptionConfidence(empty as Record<string, AssumptionConfidenceEntry | undefined> | undefined);
    check(`empty input (${empty === undefined ? "undefined" : empty === null ? "null" : "{}"}) returns total=${total}`, r.total === total);
    check(`empty input withEvidence=0`, r.withEvidence === 0);
    check(`empty input evidenceCount mirrors withEvidence`, r.evidenceCount === r.withEvidence);
    check(`empty input posture is one of the three legal values`, ["Strong", "Moderate", "Needs Support"].includes(r.posture));
    check(`empty input breakdown has all five levels`, ["actuals", "signed_agreement", "quote", "research", "estimate"].every(k => k in r.breakdown));
    check(`empty input breakdown all zero`, Object.values(r.breakdown).every(v => v === 0));
  }

  // --- all keys anchored with actuals → Strong, no high-impact gap ---
  {
    const map: Record<string, AssumptionConfidenceEntry> = {};
    for (const k of allKeys) map[k] = entry("actuals", true);
    const r = rollupAssumptionConfidence(map);
    check("all-actuals: posture=Strong", r.posture === "Strong", `got ${r.posture}`);
    check("all-actuals: highImpactGap=false", r.highImpactGap === false);
    check("all-actuals: withEvidence == total", r.withEvidence === total, `got ${r.withEvidence}/${total}`);
    check("all-actuals: breakdown.actuals == total", r.breakdown.actuals === total);
  }

  // --- HIGH-IMPACT FLOOR: weighted ratio looks healthy, but a single
  //     bare-estimate tuition row drags posture down to "Needs Support" ---
  {
    const map: Record<string, AssumptionConfidenceEntry> = {};
    for (const k of allKeys) map[k] = entry("actuals", true);
    // Bare estimate, no evidence, on a high-impact key.
    map.tuition_per_student = entry("estimate", false);
    const r = rollupAssumptionConfidence(map);
    check("high-impact floor: highImpactGap=true", r.highImpactGap === true);
    check(
      "high-impact floor: posture forced to Needs Support",
      r.posture === "Needs Support",
      `got ${r.posture}`,
    );
  }

  // --- High-impact estimate WITH evidence does NOT trigger the floor ---
  {
    const map: Record<string, AssumptionConfidenceEntry> = {};
    for (const k of allKeys) map[k] = entry("actuals", true);
    map.tuition_per_student = entry("estimate", true); // anchored estimate
    const r = rollupAssumptionConfidence(map);
    check(
      "anchored high-impact estimate does not trip the floor",
      r.highImpactGap === false,
    );
    check(
      "anchored high-impact estimate posture stays Strong/Moderate (not Needs Support)",
      r.posture !== "Needs Support",
      `got ${r.posture}`,
    );
  }

  // --- Mixed levels are counted by breakdown ---
  {
    const map: Record<string, AssumptionConfidenceEntry> = {
      enrollment_y1: entry("actuals", true),
      enrollment_y5: entry("estimate", true),
      tuition_per_student: entry("signed_agreement", true),
      facility_rent_y1: entry("quote", true),
      operating_expenses_y1: entry("research", true),
    };
    const r = rollupAssumptionConfidence(map);
    check("mixed: breakdown.actuals == 1", r.breakdown.actuals === 1);
    check("mixed: breakdown.estimate == 1", r.breakdown.estimate === 1);
    check("mixed: breakdown.signed_agreement == 1", r.breakdown.signed_agreement === 1);
    check("mixed: breakdown.quote == 1", r.breakdown.quote === 1);
    check("mixed: breakdown.research == 1", r.breakdown.research === 1);
    check("mixed: total still == registry size", r.total === total);
    check("mixed: withEvidence counts only entries with evidence (5)", r.withEvidence === 5, `got ${r.withEvidence}`);
    check("mixed: evidenceCount alias mirrors withEvidence", r.evidenceCount === r.withEvidence, `evidenceCount=${r.evidenceCount}`);
  }

  // --- Unknown key in input is ignored, doesn't crash, doesn't inflate counts ---
  {
    const map: Record<string, AssumptionConfidenceEntry> = {
      not_a_real_key: entry("actuals", true),
    };
    const r = rollupAssumptionConfidence(map);
    check("unknown key ignored: withEvidence stays 0", r.withEvidence === 0);
    check("unknown key ignored: total still == registry size", r.total === total);
  }

  // --- Output report ---
  const totalChecks = passed + failures.length;
  if (failures.length > 0) {
    console.error(`\nrollupAssumptionConfidence: ${failures.length} of ${totalChecks} checks failed`);
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(`\nrollupAssumptionConfidence: ${passed}/${totalChecks} checks passed`);
}

main();
