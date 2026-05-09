import { describe, it, expect } from "vitest";
import {
  computeAssumptionConfidenceRollup,
  ASSUMPTION_CONFIDENCE_STATUS_COPY,
  PATHWAY_FRAMING_COPY,
  LAUNCH_CHECKLIST_ITEMS,
  HIGH_IMPACT_CONFIDENCE_KEYS,
  listAssumptionKeys,
  type AssumptionConfidenceEntry,
} from "@workspace/finance";

// Task #703 — Assumptions Confidence rollup + verbatim copy guards.
//
// These tests pin the founder-facing copy strings so the brief's verbatim
// language ("This does not mean your plan is weak…", the actuals/assumptions
// framing blurbs) cannot be paraphrased away by a future edit, and lock in
// the Strong/Moderate/Needs Support thresholds + high-impact 2x weighting.

describe("computeAssumptionConfidenceRollup — Task #703", () => {
  it("returns Needs Support with verbatim brief copy when nothing is tagged", () => {
    const r = computeAssumptionConfidenceRollup({});
    expect(r.status).toBe("Needs Support");
    expect(r.taggedKeys).toBe(0);
    expect(r.evidenceRatio).toBe(0);
    // Verbatim brief copy — must not be paraphrased.
    expect(r.message).toBe(
      "This does not mean your plan is weak. It means this part needs more clarity.",
    );
    expect(ASSUMPTION_CONFIDENCE_STATUS_COPY["Needs Support"]).toBe(r.message);
  });

  it("treats bare estimates as un-evidenced but estimate-with-note as evidenced", () => {
    const allKeys = listAssumptionKeys();
    const map: Record<string, AssumptionConfidenceEntry> = {};
    // Tag every key as bare estimate.
    for (const k of allKeys) map[k] = { confidence: "estimate" };
    expect(computeAssumptionConfidenceRollup({ assumptionConfidence: map }).status).toBe(
      "Needs Support",
    );
    // Same map, but every estimate carries a one-line note → evidenced.
    for (const k of allKeys) map[k] = { confidence: "estimate", evidenceNote: "Per NAIS 2024" };
    const r = computeAssumptionConfidenceRollup({ assumptionConfidence: map });
    expect(r.status).toBe("Strong");
    expect(r.taggedKeys).toBe(allKeys.length);
  });

  it("weights high-impact keys 2x in the evidence ratio", () => {
    const map: Record<string, AssumptionConfidenceEntry> = {};
    // Anchor only the high-impact keys.
    for (const k of HIGH_IMPACT_CONFIDENCE_KEYS) {
      map[k] = { confidence: "signed_agreement" };
    }
    const r = computeAssumptionConfidenceRollup({ assumptionConfidence: map });
    const allKeys = listAssumptionKeys();
    const totalWeight = allKeys.length + HIGH_IMPACT_CONFIDENCE_KEYS.length; // 1x normal, +1 extra for high-impact
    const earnedWeight = HIGH_IMPACT_CONFIDENCE_KEYS.length * 2;
    expect(r.totalWeight).toBe(totalWeight);
    expect(r.earnedWeight).toBe(earnedWeight);
    expect(r.evidenceRatio).toBeCloseTo(earnedWeight / totalWeight, 5);
    // No high-impact key should be flagged weak.
    expect(r.weakHighImpactKeys.length).toBe(0);
  });

  it("flags untagged high-impact keys as weak so the founder knows what to firm up", () => {
    const r = computeAssumptionConfidenceRollup({});
    expect(r.weakHighImpactKeys.sort()).toEqual([...HIGH_IMPACT_CONFIDENCE_KEYS].sort());
  });

  it("crosses the Moderate / Strong thresholds at the documented ratios", () => {
    const allKeys = listAssumptionKeys();
    // Anchor 50% of plain (non-high-impact) keys with signed agreements →
    // earnedRatio sits in the Moderate band (≥ 0.40 but < 0.70).
    const plain = allKeys.filter((k) => !HIGH_IMPACT_CONFIDENCE_KEYS.includes(k));
    const half = Math.ceil(plain.length / 2);
    // For "Strong" we anchor every high-impact key (weight 2 each) plus
    // enough plain keys (weight 1) to push earned/total above 0.70.
    const strongPlainTarget = Math.ceil(plain.length * 0.8);
    const map: Record<string, AssumptionConfidenceEntry> = {};
    for (let i = 0; i < strongPlainTarget; i++) map[plain[i]] = { confidence: "signed_agreement" };
    for (const k of HIGH_IMPACT_CONFIDENCE_KEYS) map[k] = { confidence: "signed_agreement" };
    const strong = computeAssumptionConfidenceRollup({ assumptionConfidence: map });
    expect(strong.evidenceRatio).toBeGreaterThanOrEqual(0.7);
    expect(strong.status).toBe("Strong");

    // Moderate-only sample: half of plain keys, no high-impact keys.
    const modMap: Record<string, AssumptionConfidenceEntry> = {};
    for (let i = 0; i < half; i++) modMap[plain[i]] = { confidence: "signed_agreement" };
    const mod = computeAssumptionConfidenceRollup({ assumptionConfidence: modMap });
    expect(["Moderate", "Needs Support"]).toContain(mod.status);
    if (mod.evidenceRatio >= 0.4) expect(mod.status).toBe("Moderate");
  });
});

describe("PATHWAY_FRAMING_COPY — verbatim brief copy", () => {
  it("actuals pathway copy starts with the brief's lead phrase", () => {
    expect(PATHWAY_FRAMING_COPY.actuals).toMatch(/^Your actuals are the best starting point/);
  });

  it("assumptions pathway copy contains the brief's lead phrase", () => {
    expect(PATHWAY_FRAMING_COPY.assumptions).toMatch(/Since you do not have actuals yet/);
  });
});

describe("LAUNCH_CHECKLIST_ITEMS — assumptions-first launch checklist", () => {
  it("covers the items called out in the Task #703 brief", () => {
    const ids = LAUNCH_CHECKLIST_ITEMS.map((i) => i.id);
    for (const required of [
      "opening_month",
      "year1_operating_months",
      "committed_students",
      "waitlist",
      "pre_opening_cash",
      "first_revenue_month",
      "first_payroll_month",
      "first_rent_month",
      "startup_costs",
    ] as const) {
      expect(ids).toContain(required);
    }
  });
});
