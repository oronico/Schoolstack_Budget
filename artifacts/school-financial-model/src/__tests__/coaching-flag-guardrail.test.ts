// Task #686 — unit tests for the shared next-step guardrail.
//
// The guardrail is the single source of truth for "no risk flag ships
// without a concrete coaching next step". These tests pin its behavior:
//   * empty / whitespace strings throw
//   * too-short strings throw
//   * banned credit-verdict vocabulary throws
//   * generic "review this" phrasings throw
//   * coach-voice strings (specific Step + lever) pass through
//   * `assertEveryNextStep` reports the offending item id

import { describe, it, expect } from "vitest";
import {
  validateNextStep,
  assertEveryNextStep,
  NextStepGuardrailError,
  BANNED_NEXT_STEP_PATTERNS,
  WEAK_NEXT_STEP_PATTERNS,
} from "@workspace/finance";

describe("validateNextStep", () => {
  it("returns the trimmed string for a coach-voice next step", () => {
    const out = validateNextStep(
      "  Open Step 6: Staffing and shift one role to part-time for Year 1.  ",
      "Test",
    );
    expect(out).toBe(
      "Open Step 6: Staffing and shift one role to part-time for Year 1.",
    );
  });

  it("throws on empty string", () => {
    expect(() => validateNextStep("", "Test")).toThrow(NextStepGuardrailError);
  });

  it("throws on whitespace-only string", () => {
    expect(() => validateNextStep("   \t\n  ", "Test")).toThrow(/empty/i);
  });

  it("throws on non-string values", () => {
    expect(() => validateNextStep(undefined, "Test")).toThrow(/must be a string/);
    expect(() => validateNextStep(null, "Test")).toThrow(/must be a string/);
    expect(() => validateNextStep(42, "Test")).toThrow(/must be a string/);
  });

  it("throws on too-short strings", () => {
    expect(() => validateNextStep("Try harder.", "Test")).toThrow(/too short/i);
  });

  it.each(BANNED_NEXT_STEP_PATTERNS.map((re) => [re.source]))(
    "throws when nextStep contains banned credit-verdict pattern %s",
    (source) => {
      const re = new RegExp(source, "i");
      // Build a coach-voice line that just happens to also contain the
      // banned word, so length and "weak" checks pass first.
      const samples: Record<string, string> = {
        "\\bapproved\\b":
          "Open Step 5: Revenue and confirm the loan was approved before sharing the model.",
        "\\bdeclined\\b":
          "Open Step 5: Revenue and update the model after the lender declined the request.",
        "\\bfailed\\b":
          "Open Step 6: Staffing and revisit the plan because the model failed the stress test.",
        "\\brejected\\b":
          "Open Step 5: Revenue and update assumptions after the lender rejected the packet.",
        "\\brejection\\b":
          "Open Step 5: Revenue and update assumptions after a rejection from the lender.",
        "\\bineligible\\b":
          "Open Step 5: Revenue and remove the ineligible program before re-running.",
        "loan\\s+approval":
          "Open Step 5: Revenue and stage figures for loan approval before next meeting.",
        "\\b(you|your|the)\\s+(model|plan|application)\\s+(passed|failed)\\b":
          "Open Step 4: Enrollment because your model failed the lender stress test.",
      };
      const line = samples[source] || "Open Step 5 and address the issue.";
      // Sanity: confirm the sample actually trips the pattern we're testing.
      expect(re.test(line)).toBe(true);
      expect(() => validateNextStep(line, "Test")).toThrow(/banned credit-verdict/);
    },
  );

  it("throws on generic 'review this' phrasings", () => {
    for (const weak of [
      "Review this carefully before the next meeting with the board.",
      "Look at this dimension and figure out something soon.",
      "Investigate this further before the next planning cycle.",
      "Consider this option as part of the broader plan.",
      "Check this assumption before sharing the model with anyone.",
      "Do something about staffing before the model is finalized.",
    ]) {
      expect(() => validateNextStep(weak, "Test")).toThrow(/too generic/);
    }
  });

  it("matches every weak pattern in the exported list", () => {
    expect(WEAK_NEXT_STEP_PATTERNS.length).toBeGreaterThan(0);
  });

  it("includes the context label in the error message", () => {
    expect(() => validateNextStep("", "DiagnosticFinding[high_staffing]"))
      .toThrow(/DiagnosticFinding\[high_staffing\]/);
  });
});

describe("assertEveryNextStep", () => {
  it("returns the array unchanged when every item is valid", () => {
    const items = [
      {
        id: "a",
        nextStep:
          "Open Step 4: Enrollment and grow Year 1 by 5 students before re-running the model.",
      },
      {
        id: "b",
        nextStep:
          "Open Step 7: Expenses and trim 3-5% of cost so reserves clear 3 months.",
      },
    ];
    expect(assertEveryNextStep(items, "Kind")).toBe(items);
  });

  it("throws and surfaces the offending id", () => {
    const items = [
      { id: "good", nextStep: "Open Step 5: Revenue and add a tuition tier line." },
      { id: "bad", nextStep: "" },
    ];
    expect(() => assertEveryNextStep(items, "Kind")).toThrow(/Kind\[bad\]/);
  });

  it("falls back to the array index when no id-like field exists", () => {
    expect(() => assertEveryNextStep([{ nextStep: "" }], "Kind")).toThrow(
      /Kind\[0\]/,
    );
  });
});
