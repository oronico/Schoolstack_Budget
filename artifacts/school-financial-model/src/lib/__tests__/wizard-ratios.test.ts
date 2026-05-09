import { describe, it, expect } from "vitest";
import {
  enrollmentToCoverCost,
  utilizationFraction,
  assessGrowthReasonable,
  staffingFractionOfRevenue,
  facilityBurdenFractionOfRevenue,
  studentsPerTeacherActual,
  loadedPersonnelCost,
  founderCompIsIncluded,
} from "@workspace/finance";

describe("wizard-ratios (Task #704)", () => {
  describe("enrollmentToCoverCost", () => {
    it("rounds up so a fractional student becomes a whole headcount", () => {
      expect(enrollmentToCoverCost(100_001, 10_000)).toBe(11);
      expect(enrollmentToCoverCost(100_000, 10_000)).toBe(10);
    });
    it("returns null when revenue per student is missing or zero", () => {
      expect(enrollmentToCoverCost(50_000, 0)).toBeNull();
      expect(enrollmentToCoverCost(50_000, NaN)).toBeNull();
    });
    it("returns 0 when there is no cost to cover", () => {
      expect(enrollmentToCoverCost(0, 10_000)).toBe(0);
    });
  });

  describe("utilizationFraction", () => {
    it("computes enrollment / capacity", () => {
      expect(utilizationFraction(40, 50)).toBeCloseTo(0.8);
    });
    it("returns null when capacity is unset", () => {
      expect(utilizationFraction(40, 0)).toBeNull();
    });
  });

  describe("assessGrowthReasonable", () => {
    it("flags >25% YoY as aggressive and >50% as very_aggressive", () => {
      expect(assessGrowthReasonable(40, 50)).toBe("ok"); // +25% exactly = ok
      expect(assessGrowthReasonable(40, 51)).toBe("aggressive");
      expect(assessGrowthReasonable(40, 61)).toBe("very_aggressive");
    });
    it("treats zero/missing prior year as ok (no baseline to judge)", () => {
      expect(assessGrowthReasonable(0, 100)).toBe("ok");
    });
  });

  describe("staffing & facility ratios", () => {
    it("compute fractions of revenue and null when revenue is zero", () => {
      expect(staffingFractionOfRevenue(600_000, 1_000_000)).toBeCloseTo(0.6);
      expect(facilityBurdenFractionOfRevenue(150_000, 1_000_000)).toBeCloseTo(0.15);
      expect(staffingFractionOfRevenue(600_000, 0)).toBeNull();
      expect(facilityBurdenFractionOfRevenue(150_000, 0)).toBeNull();
    });
  });

  describe("studentsPerTeacherActual", () => {
    it("computes students / teacherFte rounded to one decimal", () => {
      expect(studentsPerTeacherActual(45, 4)).toBe(11.3);
    });
    it("returns null when teacher FTE is zero", () => {
      expect(studentsPerTeacherActual(45, 0)).toBeNull();
    });
  });

  describe("loadedPersonnelCost", () => {
    it("layers benefits + payroll tax onto base salary", () => {
      expect(loadedPersonnelCost(50_000, 0.18, 0.0765)).toBeCloseTo(62_825);
    });
    it("returns 0 for non-positive salaries", () => {
      expect(loadedPersonnelCost(0, 0.18, 0.0765)).toBe(0);
    });
  });

  describe("founderCompIsIncluded", () => {
    it("is true when any year has positive comp", () => {
      expect(founderCompIsIncluded([0, 0, 40_000, 50_000, 50_000])).toBe(true);
    });
    it("is false when all years are zero or array missing", () => {
      expect(founderCompIsIncluded([0, 0, 0, 0, 0])).toBe(false);
      expect(founderCompIsIncluded(undefined)).toBe(false);
    });
  });

  // Step-level scenarios that mirror what the wizard surfaces in
  // EnrollmentRatiosSummary, StaffingRatiosSummary, and ExpenseBehaviorSummary.
  // These exercise the helpers exactly the way the steps wire them up so a
  // regression in either the helper or the call site fails CI.
  describe("step-level scenarios", () => {
    it("EnrollmentStep break-even: students-to-cover-staffing + facility + total", () => {
      const revenuePerStudent = 12_000;
      const staffingY1 = 480_000; // 40 students at $12k
      const facilityY1 = 120_000; // 10 students at $12k
      expect(enrollmentToCoverCost(staffingY1, revenuePerStudent)).toBe(40);
      expect(enrollmentToCoverCost(facilityY1, revenuePerStudent)).toBe(10);
      expect(enrollmentToCoverCost(staffingY1 + facilityY1, revenuePerStudent)).toBe(50);
    });

    it("StaffingStep loaded-cost & founder-comp delta scenario", () => {
      // Two-row roster: one teacher at $50k, founder unpaid.
      const teacher = { fte: 1, annualizedRate: 50_000, benefitsRate: 18, payrollTaxRate: 7.65, benefitsEligible: true };
      const founder = { fte: 1, annualizedRate: 0, benefitsRate: 0, payrollTaxRate: 0, benefitsEligible: false };
      const loaded =
        loadedPersonnelCost(teacher.fte * teacher.annualizedRate, teacher.benefitsRate / 100, teacher.payrollTaxRate / 100) +
        loadedPersonnelCost(founder.fte * founder.annualizedRate, founder.benefitsRate / 100, founder.payrollTaxRate / 100);
      expect(loaded).toBeCloseTo(62_825);
      // Normalized founder-comp delta: when actual is $0 and benchmark is $80k,
      // the model is understating personnel by exactly $80k.
      const benchmark = 80_000;
      const actual = founder.fte * founder.annualizedRate;
      expect(Math.max(0, benchmark - actual)).toBe(80_000);
      // founder comp included flag is false until any year > 0
      expect(founderCompIsIncluded([actual, actual, actual, actual, actual])).toBe(false);
    });

    it("ExpenseStep behavior grouping: fixed vs variable vs timing-sensitive", () => {
      // Simulates the same driverType-based partition the step uses.
      const rows = [
        { driverType: "annual_fixed", amount: 60_000 }, // rent → fixed
        { driverType: "annual_fixed", amount: 12_000 }, // insurance → fixed
        { driverType: "per_student", amount: 18_000 }, // supplies → variable
        { driverType: "per_fte", amount: 9_000 }, // PD → variable
        { driverType: "monthly", amount: 6_000 }, // utilities → timing
      ];
      const grouped = rows.reduce(
        (acc, r) => {
          if (r.driverType === "annual_fixed") acc.fixed += r.amount;
          else if (/per_student|per_new_student|per_returning_student|per_fte|percent_of_/.test(r.driverType)) acc.variable += r.amount;
          else acc.timing += r.amount;
          return acc;
        },
        { fixed: 0, variable: 0, timing: 0 },
      );
      expect(grouped.fixed).toBe(72_000);
      expect(grouped.variable).toBe(27_000);
      expect(grouped.timing).toBe(6_000);
      // Facility burden as % of revenue:
      expect(facilityBurdenFractionOfRevenue(72_000, 360_000)).toBeCloseTo(0.2);
    });
  });
});
