import { describe, expect, it } from "vitest";
import {
  buildSectionRollup,
  ROLLUP_SECTION_KEYS,
  STEP_IDS,
} from "../lender-narrative-rollup";

describe("buildSectionRollup", () => {
  it("exposes the five Task #331 sections", () => {
    expect(ROLLUP_SECTION_KEYS).toEqual([
      "enrollmentStrategy",
      "revenueAssumptions",
      "staffingPhilosophy",
      "expenseAssumptions",
      "riskMitigation",
    ]);
  });

  it("returns empty rollups when no rationales are present", () => {
    for (const k of ROLLUP_SECTION_KEYS) {
      const r = buildSectionRollup(k, {}, {});
      expect(r.text).toBe("");
      expect(r.sources).toEqual([]);
    }
  });

  it("rolls up the enrollment programs rationale verbatim", () => {
    const r = buildSectionRollup(
      "enrollmentStrategy",
      { "enrollment:programs": "We grow K→3 in year 1 and add a grade per year." },
      {},
    );
    expect(r.text).toBe("We grow K→3 in year 1 and add a grade per year.");
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0].sourceStep).toBe(STEP_IDS.enrollment);
    expect(r.sources[0].categoryLabel).toBe("Enrollment Strategy");
  });

  it("concatenates revenue rationales in canonical order with category labels", () => {
    const r = buildSectionRollup(
      "revenueAssumptions",
      {
        "revenue:other_revenue": "After-care fees ramp in year 2.",
        "revenue:tuition_and_fees": "Tuition rises 3% per year.",
        "revenue:philanthropy": "Annual fund grows from $25k to $100k.",
      },
      {},
    );
    // Canonical order: tuition_and_fees → philanthropy → other_revenue
    expect(r.text).toBe(
      [
        "Tuition & Student Fees: Tuition rises 3% per year.",
        "Philanthropy: Annual fund grows from $25k to $100k.",
        "Other Revenue: After-care fees ramp in year 2.",
      ].join("\n\n"),
    );
    expect(r.sources.map((s) => s.rationaleKey)).toEqual([
      "revenue:tuition_and_fees",
      "revenue:philanthropy",
      "revenue:other_revenue",
    ]);
    for (const s of r.sources) {
      expect(s.sourceStep).toBe(STEP_IDS.revenue);
    }
  });

  it("rolls up staffing rationales", () => {
    const r = buildSectionRollup(
      "staffingPhilosophy",
      {
        "staffing:instructional": "Lower student:teacher ratio in K–2.",
        "staffing:school_leadership": "Principal + dean of students from year 1.",
      },
      {},
    );
    expect(r.text).toContain("School Leadership: Principal + dean of students from year 1.");
    expect(r.text).toContain("Instructional: Lower student:teacher ratio in K–2.");
    expect(r.sources.every((s) => s.sourceStep === STEP_IDS.staffing)).toBe(true);
  });

  it("includes named expense categories but excludes capital_financing", () => {
    const r = buildSectionRollup(
      "expenseAssumptions",
      {
        "expenses:instructional_program": "Curriculum & supplies budgeted at $500/student.",
        "expenses:capital_financing": "Loan fees flow through P&L.",
      },
      {},
    );
    expect(r.text).toContain("Curriculum & supplies");
    expect(r.text).not.toContain("Loan fees");
    expect(r.sources.map((s) => s.rationaleKey)).toEqual([
      "expenses:instructional_program",
    ]);
  });

  it("supports custom expense categories with their custom labels", () => {
    const r = buildSectionRollup(
      "expenseAssumptions",
      { "expenses:custom_athletics": "Athletics is a brand differentiator." },
      { custom_athletics: "Athletics" },
    );
    // Single-entry rollups render the rationale verbatim (no "Label: " prefix).
    expect(r.text).toBe("Athletics is a brand differentiator.");
    expect(r.sources[0].categoryLabel).toBe("Athletics");
  });

  it("rolls up risk-mitigation rationales from capital financing AND the capital_financing expense", () => {
    const r = buildSectionRollup(
      "riskMitigation",
      {
        "capitalFinancing:debtTerms": "20-year amortization, 6.5% rate.",
        "capitalFinancing:dscrCovenants": "1.20x DSCR covenant, tested annually.",
        "expenses:capital_financing": "Loan fees flow through P&L.",
      },
      {},
    );
    expect(r.text).toContain("Debt Terms: 20-year amortization");
    expect(r.text).toContain("DSCR Covenants: 1.20x DSCR");
    expect(r.text).toContain("Capital & Debt Expense: Loan fees");
    const steps = r.sources.map((s) => s.sourceStep);
    expect(steps).toContain(STEP_IDS.capitalFinancing);
    expect(steps).toContain(STEP_IDS.expenses);
  });

  it("ignores blank/whitespace-only rationale strings", () => {
    const r = buildSectionRollup(
      "revenueAssumptions",
      { "revenue:tuition_and_fees": "   " },
      {},
    );
    expect(r.text).toBe("");
    expect(r.sources).toEqual([]);
  });
});
