import { describe, it, expect } from "vitest";
import { hasActualsSeedData, seedY1FromActuals } from "../seed-from-actuals";
import type { FullModelData } from "@/pages/model-wizard/schema";

// Task #657 — Operating-pathway founders fill in last year's actuals on
// the Actuals Intake step; seedY1FromActuals translates those numbers into
// a Y1 baseline so the Enrollment / Revenue / Expense steps don't start
// at zero. These tests pin the contract so the wizard's seed-on-continue
// behaviour stays aligned with the seeder helper.

function emptyModel(): FullModelData {
  return {
    schoolProfile: {
      schoolName: "Actuals School",
      wizardPathway: "actuals",
      schoolStage: "operating_school",
    },
    enrollment: {},
    openingBalances: {},
    revenueRows: [],
    expenseRows: [],
    priorYearSnapshot: {},
  } as unknown as FullModelData;
}

describe("hasActualsSeedData", () => {
  it("returns false for an empty / missing snapshot", () => {
    expect(hasActualsSeedData(undefined)).toBe(false);
    expect(hasActualsSeedData({} as never)).toBe(false);
  });

  it("returns true when at least one numeric headline is set", () => {
    expect(hasActualsSeedData({ totalRevenue: 250_000 } as never)).toBe(true);
    expect(hasActualsSeedData({ endingEnrollment: 42 } as never)).toBe(true);
  });
});

describe("seedY1FromActuals", () => {
  it("seeds Y1 enrollment and opening cash from the snapshot", () => {
    const input = emptyModel();
    input.priorYearSnapshot = {
      endingEnrollment: 60,
      endingCash: 75_000,
    } as never;
    const out = seedY1FromActuals(input);
    expect((out.enrollment as { year1?: number }).year1).toBe(60);
    expect((out.openingBalances as { cash?: number }).cash).toBe(75_000);
  });

  it("seeds Y1 revenue rows by category when a breakdown is provided", () => {
    const input = emptyModel();
    input.priorYearSnapshot = {
      tuitionRevenue: 400_000,
      publicFundingRevenue: 50_000,
      philanthropyRevenue: 25_000,
    } as never;
    const out = seedY1FromActuals(input);
    const tuition = (out.revenueRows as Array<{ category: string; amounts: number[] }>).find(r => r.category === "tuition_and_fees");
    const publicF = (out.revenueRows as Array<{ category: string; amounts: number[] }>).find(r => r.category === "public_funding");
    const phil = (out.revenueRows as Array<{ category: string; amounts: number[] }>).find(r => r.category === "philanthropy");
    expect(tuition?.amounts[0]).toBe(400_000);
    expect(publicF?.amounts[0]).toBe(50_000);
    expect(phil?.amounts[0]).toBe(25_000);
  });

  it("falls back to tuition_and_fees when only top-line totalRevenue is set", () => {
    const input = emptyModel();
    input.priorYearSnapshot = { totalRevenue: 600_000 } as never;
    const out = seedY1FromActuals(input);
    const tuition = (out.revenueRows as Array<{ category: string; amounts: number[] }>).find(r => r.category === "tuition_and_fees");
    expect(tuition?.amounts[0]).toBe(600_000);
  });

  it("seeds Y1 expense rows by category when a breakdown is provided", () => {
    const input = emptyModel();
    input.priorYearSnapshot = {
      personnelExpenses: 300_000,
      facilityExpenses: 60_000,
      instructionalExpenses: 30_000,
      adminExpenses: 20_000,
    } as never;
    const out = seedY1FromActuals(input);
    const rows = out.expenseRows as Array<{ category: string; amounts: number[] }>;
    expect(rows.find(r => r.category === "personnel")?.amounts[0]).toBe(300_000);
    expect(rows.find(r => r.category === "facility")?.amounts[0]).toBe(60_000);
    expect(rows.find(r => r.category === "instructional")?.amounts[0]).toBe(30_000);
    expect(rows.find(r => r.category === "admin")?.amounts[0]).toBe(20_000);
  });

  it("is idempotent — never overwrites a non-zero Y1 cell", () => {
    const input = emptyModel();
    input.enrollment = { year1: 88 } as never;
    input.openingBalances = { cash: 12_345 } as never;
    input.revenueRows = [{
      id: "existing-tuition",
      category: "tuition_and_fees",
      lineItem: "Tuition",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [123_000, 0, 0, 0, 0],
    }] as never;
    input.priorYearSnapshot = {
      endingEnrollment: 60,
      endingCash: 75_000,
      tuitionRevenue: 400_000,
    } as never;

    const once = seedY1FromActuals(input);
    const twice = seedY1FromActuals(once);

    expect((twice.enrollment as { year1?: number }).year1).toBe(88);
    expect((twice.openingBalances as { cash?: number }).cash).toBe(12_345);
    const tuition = (twice.revenueRows as Array<{ category: string; amounts: number[] }>).find(r => r.category === "tuition_and_fees");
    expect(tuition?.amounts[0]).toBe(123_000);
  });

  it("returns the input untouched when there is no actuals data", () => {
    const input = emptyModel();
    const out = seedY1FromActuals(input);
    expect(out).toBe(input);
  });
});
