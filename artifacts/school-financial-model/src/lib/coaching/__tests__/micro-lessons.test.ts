import { describe, it, expect, beforeEach } from "vitest";
import { MICRO_LESSONS, getTriggeredLessons } from "../micro-lessons";
import { computeVisibleSteps } from "@/pages/model-wizard/index";
import type { FullModelData } from "@/pages/model-wizard/schema";

function makeData(overrides: Partial<FullModelData> = {}): FullModelData {
  const base = {
    schoolProfile: {},
    enrollment: { year1: 50 },
    programs: [],
    revenueRows: [
      { id: "r1", category: "tuition", lineItem: "Tuition", enabled: true, driverType: "amount", amounts: [500_000, 600_000, 700_000, 800_000, 900_000] },
      { id: "r2", category: "philanthropy", lineItem: "Grants", enabled: true, driverType: "amount", amounts: [50_000, 50_000, 50_000, 50_000, 50_000] },
    ],
    staffingRows: [
      { id: "s1", roleName: "Teacher", functionCategory: "instruction", employmentType: "full_time", fte: 1, annualizedRate: 50_000, benefitsEligible: true, benefitsRate: 0.2, payrollTaxRate: 0.08, payrollLike: false, notes: "" },
      { id: "s2", roleName: "Aide", functionCategory: "instruction", employmentType: "full_time", fte: 1, annualizedRate: 35_000, benefitsEligible: true, benefitsRate: 0.2, payrollTaxRate: 0.08, payrollLike: false, notes: "" },
      { id: "s3", roleName: "Director", functionCategory: "leadership", employmentType: "full_time", fte: 1, annualizedRate: 80_000, benefitsEligible: true, benefitsRate: 0.2, payrollTaxRate: 0.08, payrollLike: false, notes: "" },
    ],
    expenseRows: [
      { id: "e1", category: "facilities", lineItem: "Rent", enabled: true, driverType: "amount", amounts: [120_000, 120_000, 120_000, 120_000, 120_000] },
      { id: "e2", category: "supplies", lineItem: "Supplies", enabled: true, driverType: "amount", amounts: [10_000, 10_000, 10_000, 10_000, 10_000] },
    ],
  } as unknown as FullModelData;
  return { ...base, ...overrides } as FullModelData;
}

beforeEach(() => {
  localStorage.clear();
});

describe("micro-lessons title-based triggering", () => {
  it("every lesson's triggerStepTitle resolves to a visible step in default 5-year mode", () => {
    const visible = computeVisibleSteps(undefined, false);
    const titles = new Set(visible.map((s) => s.title));
    for (const lesson of MICRO_LESSONS) {
      expect(titles.has(lesson.triggerStepTitle), `lesson ${lesson.id} -> ${lesson.triggerStepTitle}`).toBe(true);
    }
  });

  it("fires the negative-cash lesson on Expenses regardless of mode", () => {
    const data = makeData({
      revenueRows: [
        { id: "r1", category: "tuition", lineItem: "Tuition", enabled: true, driverType: "amount", amounts: [10_000, 10_000, 10_000, 10_000, 10_000] },
      ],
      staffingRows: [
        { id: "s1", roleName: "Teacher", functionCategory: "instruction", employmentType: "full_time", fte: 5, annualizedRate: 60_000, benefitsEligible: true, benefitsRate: 0.2, payrollTaxRate: 0.08, payrollLike: false, notes: "" },
      ],
      expenseRows: [
        { id: "e1", category: "facilities", lineItem: "Rent", enabled: true, driverType: "amount", amounts: [200_000, 0, 0, 0, 0] },
      ],
    } as unknown as Partial<FullModelData>);
    const lessons = getTriggeredLessons(data, "Expenses", "basics");
    expect(lessons.find((l) => l.id === "negative_cash_detected")).toBeTruthy();
  });

  it("resolves Expenses correctly in Chesterton mode (where Expenses is not step 6)", () => {
    const visible = computeVisibleSteps("chesterton_academy", false);
    const expensesStep = visible.find((s) => s.title === "Expenses");
    expect(expensesStep, "Chesterton flow has Expenses").toBeTruthy();
    expect(expensesStep!.id).not.toBe(6); // Chesterton inserts Fundraising/Gift Chart/Recruiting before Expenses
    const data = makeData();
    const lessons = getTriggeredLessons(data, "Expenses", "extra");
    expect(lessons.some((l) => l.id === "breakeven_math_extra")).toBe(true);
    expect(lessons.every((l) => l.triggerStepTitle === "Expenses")).toBe(true);
  });

  it("skips Lender Narrative-tied lessons in single-year mode without throwing", () => {
    const visible = computeVisibleSteps(undefined, true);
    const titles = new Set(visible.map((s) => s.title));
    expect(titles.has("Lender Narrative")).toBe(false);
    const data = makeData();
    // Iterating every visible step in single-year mode should never surface
    // a lesson tied to a hidden title, and should never throw.
    for (const step of visible) {
      const lessons = getTriggeredLessons(data, step.title, "extra");
      for (const lesson of lessons) {
        expect(lesson.triggerStepTitle).toBe(step.title);
        expect(titles.has(lesson.triggerStepTitle)).toBe(true);
      }
    }
  });

  it("misconfigured triggerStepTitle is silently skipped", () => {
    const data = makeData();
    expect(() => getTriggeredLessons(data, "Totally Nonexistent Step", "extra")).not.toThrow();
    const lessons = getTriggeredLessons(data, "Totally Nonexistent Step", "extra");
    expect(lessons).toEqual([]);
  });

  it("returns empty when currentStepTitle is empty", () => {
    const data = makeData();
    expect(getTriggeredLessons(data, "", "basics")).toEqual([]);
  });

  it("respects the extraOnly gate (only fires when level is 'extra')", () => {
    const data = makeData();
    const basics = getTriggeredLessons(data, "Revenue", "basics");
    expect(basics.some((l) => l.id === "staffing_pct_extra")).toBe(false);
    const extra = getTriggeredLessons(data, "Revenue", "extra");
    expect(extra.some((l) => l.id === "staffing_pct_extra")).toBe(true);
  });
});
