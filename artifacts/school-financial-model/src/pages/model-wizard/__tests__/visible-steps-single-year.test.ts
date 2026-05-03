import { describe, expect, it } from "vitest";
import { computeVisibleSteps } from "../index";

describe("computeVisibleSteps — Lender Narrative gating", () => {
  it("hides the Lender Narrative step when modelDuration === 'single_year'", () => {
    const steps = computeVisibleSteps(undefined, true);
    expect(steps.some(s => s.title === "Lender Narrative")).toBe(false);
    expect(steps).toHaveLength(11);
  });

  it("includes the Lender Narrative step in 5-year mode", () => {
    const steps = computeVisibleSteps(undefined, false);
    expect(steps.some(s => s.title === "Lender Narrative")).toBe(true);
    expect(steps).toHaveLength(12);
    expect(steps[10].title).toBe("Lender Narrative");
  });

  it("hides the Lender Narrative step in single-year Chesterton mode too", () => {
    const single = computeVisibleSteps("chesterton_academy", true);
    const five = computeVisibleSteps("chesterton_academy", false);
    expect(single.some(s => s.title === "Lender Narrative")).toBe(false);
    expect(five.some(s => s.title === "Lender Narrative")).toBe(true);
    expect(single).toHaveLength(five.length - 1);
  });

  it("reassigns contiguous 1-based ids after filtering so the rail stays aligned", () => {
    // The wizard rail uses step.id as identity and currentStep as a 1-based
    // positional index. After filtering, IDs must be 1..N contiguous, with
    // Export landing at the final position.
    for (const schoolType of [undefined, "chesterton_academy"]) {
      const steps = computeVisibleSteps(schoolType, true);
      steps.forEach((s, i) => expect(s.id).toBe(i + 1));
      expect(steps[steps.length - 1].title).toBe("Export");
      expect(steps[steps.length - 1].id).toBe(steps.length);
    }
  });

  it("preserves the 5-year ids exactly (no reindexing in 5-year mode)", () => {
    const steps = computeVisibleSteps(undefined, false);
    steps.forEach((s, i) => expect(s.id).toBe(i + 1));
    expect(steps[steps.length - 1].title).toBe("Export");
  });
});
