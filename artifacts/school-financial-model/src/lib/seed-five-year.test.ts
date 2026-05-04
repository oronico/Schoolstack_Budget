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

  it("uses caller-supplied rate overrides over the form's resolved defaults", () => {
    // Simulates the Extend-to-5-year modal: founder leaves the form fields
    // at their defaults but edits the rates inside the confirmation modal.
    const input = freshSingleYear();
    (input.schoolProfile as Record<string, unknown>).enrollmentGrowthRate = 0;
    (input.tuitionEscalation as unknown) = { rate: 3 };
    (input.facilities as unknown) = { generalCostInflation: 3, annualSalaryIncrease: 3 };

    const out = seedFiveYearFromYearOne(input, {
      enrollmentGrowthPct: 5,
      tuitionEscalationPct: 4,
      costInflationPct: 2,
    });

    // enrollment grows 5% — the modal override, not the form's 0%
    expect(out.enrollment!.year2).toBe(Math.round(80 * 1.05));
    expect(out.enrollment!.year5).toBe(Math.round(80 * Math.pow(1.05, 4)));

    // tuition revenue escalates at the overridden 4%
    expect(out.revenueRows![0].amounts[1]).toBe(Math.round(800000 * 1.04));
    expect(out.revenueRows![0].amounts[4]).toBe(Math.round(800000 * Math.pow(1.04, 4)));

    // expense escalates at the overridden 2% inflation
    expect(out.expenseRows![0].amounts[2]).toBe(Math.round(120000 * Math.pow(1.02, 2)));
  });

  it("does not mutate the caller's form state", () => {
    const input = freshSingleYear();
    const snapshot = JSON.parse(JSON.stringify(input));
    seedFiveYearFromYearOne(input);
    expect(input).toEqual(snapshot);
  });

  // Task #493: lock in *every* documented rule from the seed so an accidental
  // tweak (rate change, rounding swap, default fallback rewire, category
  // re-bucket, etc.) trips a unit test instead of silently drifting the
  // projection. The e2e test only validates that Y2-Y5 become non-zero;
  // these assertions verify the actual math.
  describe("documented growth/inflation rules (Task #493 regression lock)", () => {
    it("documented default fallbacks haven't changed", () => {
      // Drift in these numbers means every existing model that didn't set an
      // explicit rate will silently re-project. Lock them in.
      const defaults = resolveSeedDefaults(undefined);
      expect(defaults).toEqual({
        enrollmentGrowthPct: 0,
        tuitionEscalationPct: 3,
        salaryEscalationPct: 3,
        costInflationPct: 3,
      });
    });

    it("revenue: tuition_offsets and school_choice categories also follow tuitionEscalationPct", () => {
      const out = seedFiveYearFromYearOne({
        revenueRows: [
          {
            id: "ro",
            category: "tuition_offsets",
            lineItem: "Sibling Discount",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [-20000, 0, 0, 0, 0],
          },
          {
            id: "rc",
            category: "school_choice",
            lineItem: "ESA",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [100000, 0, 0, 0, 0],
          },
        ] as FullModelData["revenueRows"],
      });
      // Negative Y1 → escalate() short-circuits to 0 for empty cells (the
      // current contract: only positive Y1 baselines extrapolate).
      expect(out.revenueRows![0].amounts).toEqual([-20000, 0, 0, 0, 0]);
      // school_choice escalates at the documented 3% tuition default.
      expect(out.revenueRows![1].amounts).toEqual([
        100000,
        Math.round(100000 * 1.03),
        Math.round(100000 * Math.pow(1.03, 2)),
        Math.round(100000 * Math.pow(1.03, 3)),
        Math.round(100000 * Math.pow(1.03, 4)),
      ]);
      expect(out.revenueRows![1].amounts).toEqual([100000, 103000, 106090, 109273, 112551]);
    });

    it("revenue: public_funding and other_revenue follow costInflationPct", () => {
      const out = seedFiveYearFromYearOne({
        revenueRows: [
          {
            id: "rp",
            category: "public_funding",
            lineItem: "State per-pupil",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [200000, 0, 0, 0, 0],
          },
          {
            id: "ro",
            category: "other_revenue",
            lineItem: "Misc",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [10000, 0, 0, 0, 0],
          },
        ] as FullModelData["revenueRows"],
      });
      expect(out.revenueRows![0].amounts).toEqual([200000, 206000, 212180, 218545, 225102]);
      expect(out.revenueRows![1].amounts).toEqual([10000, 10300, 10609, 10927, 11255]);
    });

    it("revenue: grants_contributions are held flat (rate = 0)", () => {
      const out = seedFiveYearFromYearOne({
        revenueRows: [
          {
            id: "rg",
            category: "grants_contributions",
            lineItem: "Foundation grant",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [75000, 0, 0, 0, 0],
          },
        ] as FullModelData["revenueRows"],
      });
      expect(out.revenueRows![0].amounts).toEqual([75000, 75000, 75000, 75000, 75000]);
    });

    it("revenue: an explicit per-row escalationRate overrides category defaults", () => {
      const out = seedFiveYearFromYearOne({
        revenueRows: [
          {
            id: "rt",
            category: "tuition_and_fees",
            lineItem: "Tuition",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [400000, 0, 0, 0, 0],
            escalationRate: 8,
            escalationRateOverridden: true,
          },
        ] as unknown as FullModelData["revenueRows"],
      });
      expect(out.revenueRows![0].amounts).toEqual([
        400000,
        Math.round(400000 * 1.08),
        Math.round(400000 * Math.pow(1.08, 2)),
        Math.round(400000 * Math.pow(1.08, 3)),
        Math.round(400000 * Math.pow(1.08, 4)),
      ]);
      expect(out.revenueRows![0].amounts).toEqual([400000, 432000, 466560, 503885, 544196]);
    });

    it("expense: an explicit per-row escalationRate overrides costInflationPct", () => {
      const out = seedFiveYearFromYearOne({
        expenseRows: [
          {
            id: "ex",
            category: "instructional_program",
            lineItem: "Curriculum",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [10000, 0, 0, 0, 0],
            escalationRate: 5,
          },
        ] as unknown as FullModelData["expenseRows"],
      });
      expect(out.expenseRows![0].amounts).toEqual([
        10000,
        Math.round(10000 * 1.05),
        Math.round(10000 * Math.pow(1.05, 2)),
        Math.round(10000 * Math.pow(1.05, 3)),
        Math.round(10000 * Math.pow(1.05, 4)),
      ]);
      expect(out.expenseRows![0].amounts).toEqual([10000, 10500, 11025, 11576, 12155]);
    });

    it("stamps the resolved per-row escalationRate onto each seeded revenue row (Task #514)", () => {
      // Mirrors the expense-row stamping rule: rows whose rate the seeder
      // filled in get marked with escalationRateSeeded so RevenueStep can
      // render the indigo "seeded from Extend-to-5-Year" badge. Rows whose
      // rate the founder explicitly overrode are left untouched.
      const out = seedFiveYearFromYearOne({
        tuitionEscalation: { rate: 4 } as unknown as FullModelData["tuitionEscalation"],
        facilities: { generalCostInflation: 5 } as unknown as FullModelData["facilities"],
        revenueRows: [
          {
            id: "r_tuition",
            category: "tuition_and_fees",
            lineItem: "Tuition",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [800000, 0, 0, 0, 0],
          },
          {
            id: "r_public",
            category: "public_funding",
            lineItem: "State per-pupil",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [200000, 0, 0, 0, 0],
          },
          {
            id: "r_phil",
            category: "philanthropy",
            lineItem: "Donations",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [50000, 0, 0, 0, 0],
          },
          {
            id: "r_overridden",
            category: "tuition_and_fees",
            lineItem: "Founder-set",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [100000, 0, 0, 0, 0],
            escalationRate: 8,
            escalationRateOverridden: true,
          },
        ] as unknown as FullModelData["revenueRows"],
      });

      // Tuition row: stamped with the resolved tuition rate (4%) and seeded.
      expect(out.revenueRows![0].escalationRate).toBe(4);
      expect(
        (out.revenueRows![0] as { escalationRateSeeded?: boolean }).escalationRateSeeded,
      ).toBe(true);

      // Public funding follows costInflationPct (5%).
      expect(out.revenueRows![1].escalationRate).toBe(5);
      expect(
        (out.revenueRows![1] as { escalationRateSeeded?: boolean }).escalationRateSeeded,
      ).toBe(true);

      // Philanthropy is held flat at rate 0 — still stamped because the
      // seeder is the one that picked the rate.
      expect(out.revenueRows![2].escalationRate).toBe(0);
      expect(
        (out.revenueRows![2] as { escalationRateSeeded?: boolean }).escalationRateSeeded,
      ).toBe(true);

      // Founder-overridden row keeps its rate and is NOT marked as seeded.
      expect(out.revenueRows![3].escalationRate).toBe(8);
      expect(
        (out.revenueRows![3] as { escalationRateSeeded?: boolean }).escalationRateSeeded,
      ).toBeUndefined();
    });

    it("stamps the resolved per-row escalationRate onto each seeded expense row (Task #498)", () => {
      // Without this, ExpenseStep's getEscalationRule would fall back to its
      // category default and silently overwrite the seeded Y2-Y5 cells when
      // the wizard re-renders.
      const out = seedFiveYearFromYearOne({
        facilities: { generalCostInflation: 5 } as unknown as FullModelData["facilities"],
        expenseRows: [
          {
            id: "ex1",
            category: "instructional_program",
            lineItem: "Curriculum",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [10000, 0, 0, 0, 0],
          },
          {
            id: "ex2",
            category: "instructional_program",
            lineItem: "Already-set rate",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [10000, 0, 0, 0, 0],
            escalationRate: 8,
          },
        ] as unknown as FullModelData["expenseRows"],
      });
      // Row with no prior rate gets the resolved costInflationPct (5%) stamped.
      expect(out.expenseRows![0].escalationRate).toBe(5);
      expect(out.expenseRows![0].amounts[1]).toBe(Math.round(10000 * 1.05));
      // …and is marked as seeded so the wizard can show a "seeded from
      // Extend-to-5-Year" tooltip next to the escalation label (Task #510).
      expect(
        (out.expenseRows![0] as { escalationRateSeeded?: boolean }).escalationRateSeeded,
      ).toBe(true);
      // A row that already had an escalationRate keeps it (idempotent) and is
      // NOT marked as seeded — the rate came from the founder, not the seeder.
      expect(out.expenseRows![1].escalationRate).toBe(8);
      expect(out.expenseRows![1].amounts[1]).toBe(Math.round(10000 * 1.08));
      expect(
        (out.expenseRows![1] as { escalationRateSeeded?: boolean }).escalationRateSeeded,
      ).toBeUndefined();
    });

    it("capitalAndDebtRows are held flat at Y1 (debt service convention)", () => {
      const out = seedFiveYearFromYearOne({
        capitalAndDebtRows: [
          {
            id: "d1",
            category: "debt_service",
            lineItem: "Loan payment",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [36000, 0, 0, 0, 0],
          },
        ] as unknown as FullModelData["capitalAndDebtRows"],
      });
      expect(
        (out.capitalAndDebtRows as Array<{ amounts: number[] }>)[0].amounts,
      ).toEqual([36000, 36000, 36000, 36000, 36000]);
    });

    it("enrollment uses the documented compound-growth formula at the resolved rate", () => {
      // Custom 7% growth, Y1 = 50 → Y2..Y5 = round(50 * 1.07^n).
      const out = seedFiveYearFromYearOne({
        schoolProfile: { enrollmentGrowthRate: 7 } as unknown as FullModelData["schoolProfile"],
        enrollment: { year1: 50, year2: 0, year3: 0, year4: 0, year5: 0 } as FullModelData["enrollment"],
      });
      expect(out.enrollment).toEqual({
        year1: 50,
        year2: Math.round(50 * 1.07),
        year3: Math.round(50 * Math.pow(1.07, 2)),
        year4: Math.round(50 * Math.pow(1.07, 3)),
        year5: Math.round(50 * Math.pow(1.07, 4)),
      });
      expect(out.enrollment).toEqual({ year1: 50, year2: 54, year3: 57, year4: 61, year5: 66 });
    });

    it("revenue.annualTuitionIncrease falls through as the tuition default when tuitionEscalation is unset", () => {
      const defaults = resolveSeedDefaults({
        revenue: { annualTuitionIncrease: 4 } as unknown as FullModelData["revenue"],
      });
      expect(defaults.tuitionEscalationPct).toBe(4);
    });

    it("preserves null cells in grade-level enrollment (didn't offer this grade)", () => {
      const input: Partial<FullModelData> = {
        schoolProfile: {
          gradeEnrollment: {
            k: [12, 0, 0, 0, 0],
            "1": [10, null, 12, null, 14],
          },
        } as unknown as FullModelData["schoolProfile"],
      };
      const out = seedFiveYearFromYearOne(input);
      const ge = (
        out.schoolProfile as { gradeEnrollment: Record<string, Array<number | null>> }
      ).gradeEnrollment;
      // Default growth = 0 → flat
      expect(ge.k).toEqual([12, 12, 12, 12, 12]);
      // Nulls preserved, founder-entered values preserved
      expect(ge["1"]).toEqual([10, null, 12, null, 14]);
    });
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
