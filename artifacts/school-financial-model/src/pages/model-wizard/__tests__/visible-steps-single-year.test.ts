import { describe, expect, it } from "vitest";
import { clampStep, computeVisibleSteps, isGatedStep } from "../index";

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

describe("clampStep — render-frame bounds clamp", () => {
  it("returns the input when it is already in range", () => {
    expect(clampStep(1, 12)).toBe(1);
    expect(clampStep(7, 12)).toBe(7);
    expect(clampStep(12, 12)).toBe(12);
  });

  it("clamps a too-high index back to the last visible step", () => {
    // The exact scenario the bug describes: founder is on Step 12 in 5-year
    // mode, toggles to single-year (length=11). For one frame currentStep
    // is still 12 — clampStep absorbs it so the rail header shows
    // "Step 11 of 11", not "Step 12 of 11".
    expect(clampStep(12, 11)).toBe(11);
    // Chesterton 5-year (15) → Chesterton single-year (14)
    expect(clampStep(15, 14)).toBe(14);
  });

  it("clamps a too-low / non-finite / zero index up to step 1", () => {
    expect(clampStep(0, 12)).toBe(1);
    expect(clampStep(-3, 12)).toBe(1);
    expect(clampStep(Number.NaN, 12)).toBe(1);
  });

  it("falls back to 1 when the visible list is empty", () => {
    // Defensive: should never happen at runtime, but `Math.max(0 - 1, 1)`
    // in the progress bar math would still divide by 1, so we want a
    // valid index returned regardless.
    expect(clampStep(5, 0)).toBe(1);
  });

  it("keeps the progress bar formula at <= 100% width when on the last step", () => {
    // Reproduces the visual bug: width = ((step - 1) / max(length - 1, 1)) * 100.
    // With raw currentStep=12 against length=11 you get 110%. With safeStep
    // it must stay at <= 100%.
    const length = 11;
    const safeStep = clampStep(12, length);
    const width = ((safeStep - 1) / Math.max(length - 1, 1)) * 100;
    expect(width).toBeLessThanOrEqual(100);
    expect(width).toBe(100);
  });

  it("safely indexes the visible step list after a duration toggle", () => {
    // Simulates the actual crash: visibleSteps[currentStep - 1].component
    // would dereference undefined if the index isn't clamped.
    const fiveYear = computeVisibleSteps(undefined, false);
    const singleYear = computeVisibleSteps(undefined, true);
    const carriedStep = fiveYear.length; // founder was on the last 5-year step
    // Naive read would crash:
    expect(singleYear[carriedStep - 1]).toBeUndefined();
    // Clamped read returns the actual last step:
    const safe = clampStep(carriedStep, singleYear.length);
    expect(singleYear[safe - 1]).toBeDefined();
    expect(singleYear[safe - 1].title).toBe("Export");
  });
});

describe("isGatedStep — rail-gate hardening for missing anchor", () => {
  it("returns true when stepId is at or past a valid anchor", () => {
    // Normal case: REVIEW_STEP_ID is 9, clicking step 9, 10, 11, 12 fires
    // the gate so we run the core-fields completeness check.
    expect(isGatedStep(9, 9)).toBe(true);
    expect(isGatedStep(10, 9)).toBe(true);
    expect(isGatedStep(12, 9)).toBe(true);
  });

  it("returns false when stepId is before the anchor", () => {
    expect(isGatedStep(1, 9)).toBe(false);
    expect(isGatedStep(8, 9)).toBe(false);
  });

  it("returns false for every stepId when the anchor is -1 (missing title)", () => {
    // The fragility being hardened: if `stepIdByTitle("Review")` ever
    // returns -1 (typo, refactor, mode that hides Review), the previous
    // code did `step.id >= -1` which matched every step in the rail and
    // every click would trigger the alert. Now the gate degrades to
    // "no match" so the rail keeps working even with a broken anchor.
    for (let i = 1; i <= 15; i++) {
      expect(isGatedStep(i, -1)).toBe(false);
    }
  });

  it("returns false when the anchor is 0", () => {
    // Zero is also an invalid 1-based step id; treat it the same as -1.
    expect(isGatedStep(5, 0)).toBe(false);
  });
});
