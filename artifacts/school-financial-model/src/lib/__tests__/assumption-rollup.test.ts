import { describe, it, expect } from "vitest";
import {
  rollupAssumptionConfidence,
  HIGH_IMPACT_CONFIDENCE_KEYS,
  listAssumptionKeys,
  type AssumptionConfidenceEntry,
} from "@workspace/finance";

// Task #703 — confidence rollup must (a) match the per-step
// AssumptionConfidenceCard's "X of Y with evidence" definition,
// (b) bake in a high-impact-gap floor so a bare-estimate tuition or
// enrollment number always pushes the posture down to Needs Support.

const allKeys = listAssumptionKeys();

function makeMap(level: AssumptionConfidenceEntry["confidence"], note?: string) {
  const out: Record<string, AssumptionConfidenceEntry> = {};
  for (const k of allKeys) out[k] = { confidence: level, evidenceNote: note };
  return out;
}

describe("rollupAssumptionConfidence (Task #703)", () => {
  it("empty map → Needs Support, zero evidence", () => {
    const r = rollupAssumptionConfidence({});
    expect(r.posture).toBe("Needs Support");
    expect(r.withEvidence).toBe(0);
    expect(r.total).toBe(allKeys.length);
    expect(r.highImpactGap).toBe(false);
  });

  it("undefined map is treated as empty", () => {
    const r = rollupAssumptionConfidence(undefined);
    expect(r.posture).toBe("Needs Support");
    expect(r.withEvidence).toBe(0);
  });

  it("all actuals → Strong with full evidence count", () => {
    const r = rollupAssumptionConfidence(makeMap("actuals"));
    expect(r.posture).toBe("Strong");
    expect(r.withEvidence).toBe(allKeys.length);
    expect(r.breakdown.actuals).toBe(allKeys.length);
    expect(r.highImpactGap).toBe(false);
  });

  it("all bare estimates → Needs Support and high-impact gap", () => {
    const r = rollupAssumptionConfidence(makeMap("estimate"));
    expect(r.posture).toBe("Needs Support");
    expect(r.withEvidence).toBe(0);
    expect(r.highImpactGap).toBe(true);
  });

  it("estimate with evidence note counts as evidence", () => {
    const r = rollupAssumptionConfidence(makeMap("estimate", "Backed by board vote"));
    expect(r.withEvidence).toBe(allKeys.length);
    expect(r.highImpactGap).toBe(false);
    // 100% with evidence + no high-impact gap → Strong.
    expect(r.posture).toBe("Strong");
  });

  it("≥40% but <70% with evidence and no high-impact gap → Moderate", () => {
    // Mark every key as a bare estimate first, then upgrade ~50% (excluding
    // high-impact keys, which we set to "research" so the floor doesn't trip).
    const map: Record<string, AssumptionConfidenceEntry> = {};
    for (const k of allKeys) map[k] = { confidence: "estimate" };
    for (const hk of HIGH_IMPACT_CONFIDENCE_KEYS) map[hk] = { confidence: "research" };
    const half = Math.ceil(allKeys.length * 0.5);
    let upgraded = 0;
    for (const k of allKeys) {
      if (HIGH_IMPACT_CONFIDENCE_KEYS.includes(k as typeof HIGH_IMPACT_CONFIDENCE_KEYS[number])) continue;
      if (upgraded >= half - HIGH_IMPACT_CONFIDENCE_KEYS.length) break;
      map[k] = { confidence: "quote" };
      upgraded += 1;
    }
    const r = rollupAssumptionConfidence(map);
    expect(r.highImpactGap).toBe(false);
    expect(r.posture).toBe("Moderate");
  });

  it("high-impact gap forces Needs Support even with otherwise strong evidence", () => {
    const map = makeMap("actuals");
    // Knock just one high-impact key down to bare estimate.
    map[HIGH_IMPACT_CONFIDENCE_KEYS[0]] = { confidence: "estimate" };
    const r = rollupAssumptionConfidence(map);
    expect(r.highImpactGap).toBe(true);
    expect(r.posture).toBe("Needs Support");
  });

  it("breakdown sums never exceed total", () => {
    const r = rollupAssumptionConfidence(makeMap("research"));
    const sum = Object.values(r.breakdown).reduce((s, n) => s + n, 0);
    expect(sum).toBeLessThanOrEqual(r.total);
  });
});
