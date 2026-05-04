import { describe, it, expect } from "vitest";
import { seedFiveYearFromYearOne, resolveSeedDefaults } from "./seed-five-year";
import type { FullModelData } from "@/pages/model-wizard/schema";

function freshSingleYear(): Partial<FullModelData> {
  return {
    schoolProfile: { schoolName: "Acme Microschool" } as FullModelData["schoolProfile"],
    enrollment: { year1: 80, year2: 0, year3: 0, year4: 0, year5: 0 } as FullModelData["enrollment"],
    programs: [
      {
        id: "p1",
        name: "K-5",
        annualTuition: 10000,
        year1: 60,
        year2: 0,
        year3: 0,
        year4: 0,
        year5: 0,
      },
      {
        id: "p2",
        name: "MS",
        annualTuition: 12000,
        year1: 20,
        year2: 0,
        year3: 0,
        year4: 0,
        year5: 0,
      },
    ],
    revenueRows: [
      {
        id: "r1",
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [800000, 0, 0, 0, 0],
      },
      {
        id: "r2",
        category: "philanthropy",
        lineItem: "Donations",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [50000, 0, 0, 0, 0],
      },
    ] as FullModelData["revenueRows"],
    expenseRows: [
      {
        id: "e1",
        category: "facility",
        lineItem: "Rent",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [120000, 0, 0, 0, 0],
        note: "",
      },
    ] as FullModelData["expenseRows"],
    staffingRows: [
      {
        id: "s1",
        roleName: "Teacher",
        functionCategory: "instructional",
        employmentType: "full_time",
        fte: 4,
        annualizedRate: 50000,
        benefitsEligible: true,
        benefitsRate: 20,
        payrollTaxRate: 8,
        payrollLike: true,
        notes: "",
        staffingMode: "fixed",
        startYear: 1,
        endYear: 1,
      },
    ] as FullModelData["staffingRows"],
  };
}

describe("seedFiveYearFromYearOne", () => {
  it("seeds Y2-Y5 across every domain when extending from a fresh single-year model", () => {
    const out = seedFiveYearFromYearOne(freshSingleYear());

    // enrollment — flat default growth (0%) preserves Y1 across all years
    expect(out.enrollment).toEqual({ year1: 80, year2: 80, year3: 80, year4: 80, year5: 80 });

    // programs — same flat ramp
    expect(out.programs?.[0].year1).toBe(60);
    expect(out.programs?.[0].year5).toBe(60);
    expect(out.programs?.[1].year5).toBe(20);

    // revenue tuition row — escalates at default 3%/yr
    const tuitionAmounts = out.revenueRows![0].amounts;
    expect(tuitionAmounts[0]).toBe(800000);
    expect(tuitionAmounts[1]).toBe(Math.round(800000 * 1.03));
    expect(tuitionAmounts[4]).toBe(Math.round(800000 * Math.pow(1.03, 4)));
    expect(tuitionAmounts.every((a) => a > 0)).toBe(true);

    // philanthropy — held flat (escalation 0)
    const phil = out.revenueRows![1].amounts;
    expect(phil).toEqual([50000, 50000, 50000, 50000, 50000]);

    // expense — escalates at default 3% inflation
    const expAmounts = out.expenseRows![0].amounts;
    expect(expAmounts[0]).toBe(120000);
    expect(expAmounts[1]).toBe(Math.round(120000 * 1.03));
    expect(expAmounts.every((a) => a > 0)).toBe(true);

    // staffing endYear bumped from 1 to 5
    expect(out.staffingRows?.[0].endYear).toBe(5);
  });

  it("only fills empty Y2-Y5 slots — never clobbers values the founder already entered", () => {
    const input = freshSingleYear();
    input.enrollment = { year1: 80, year2: 100, year3: 0, year4: 130, year5: 0 } as FullModelData["enrollment"];
    input.revenueRows![0].amounts = [800000, 900000, 0, 0, 0];

    const out = seedFiveYearFromYearOne(input);

    expect(out.enrollment).toMatchObject({
      year1: 80,
      year2: 100, // preserved
      year3: 80, // filled (flat)
      year4: 130, // preserved
      year5: 80, // filled (flat)
    });

    const amounts = out.revenueRows![0].amounts;
    expect(amounts[0]).toBe(800000);
    expect(amounts[1]).toBe(900000); // preserved
    expect(amounts[2]).toBe(Math.round(800000 * Math.pow(1.03, 2))); // filled from Y1
  });

  it("respects a custom enrollment growth rate set in the school profile", () => {
    const input = freshSingleYear();
    (input.schoolProfile as Record<string, unknown>).enrollmentGrowthRate = 10;
    (input.tuitionEscalation as unknown) = { rate: 5 };
    (input.facilities as unknown) = { generalCostInflation: 7 };

    const defaults = resolveSeedDefaults(input);
    expect(defaults.enrollmentGrowthPct).toBe(10);
    expect(defaults.tuitionEscalationPct).toBe(5);
    expect(defaults.costInflationPct).toBe(7);

    const out = seedFiveYearFromYearOne(input);

    // enrollment grows 10%/yr from 80
    expect(out.enrollment!.year2).toBe(Math.round(80 * 1.1));
    expect(out.enrollment!.year5).toBe(Math.round(80 * Math.pow(1.1, 4)));

    // tuition revenue escalates at 5%
    expect(out.revenueRows![0].amounts[1]).toBe(Math.round(800000 * 1.05));

    // expense escalates at 7%
    expect(out.expenseRows![0].amounts[2]).toBe(Math.round(120000 * Math.pow(1.07, 2)));
  });

  it("does not mutate the caller's form state", () => {
    const input = freshSingleYear();
    const snapshot = JSON.parse(JSON.stringify(input));
    seedFiveYearFromYearOne(input);
    expect(input).toEqual(snapshot);
  });

  it("preserves null cells in grade-band enrollment (didn't offer this band)", () => {
    const input: Partial<FullModelData> = {
      schoolProfile: {
        gradeBandEnrollment: {
          k5: [40, 0, 0, 0, 0],
          m68: [10, null, null, null, null],
        },
      } as unknown as FullModelData["schoolProfile"],
    };
    const out = seedFiveYearFromYearOne(input);
    const k5 = (out.schoolProfile as { gradeBandEnrollment: { k5: number[]; m68: Array<number | null> } }).gradeBandEnrollment.k5;
    const m68 = (out.schoolProfile as { gradeBandEnrollment: { k5: number[]; m68: Array<number | null> } }).gradeBandEnrollment.m68;
    expect(k5).toEqual([40, 40, 40, 40, 40]);
    expect(m68).toEqual([10, null, null, null, null]);
  });
});
