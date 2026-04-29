import { describe, expect, it } from "vitest";
import {
  computeDecisionImpact,
  computeDecisionImpactFromPersisted,
  decisionToPersistedOverrides,
} from "../decision-flows";
import type { FullModelData } from "@/pages/model-wizard/schema";

function buildBaseModel(overrides: Record<string, unknown> = {}): FullModelData {
  return {
    schoolProfile: {
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      debtIncluded: true,
      ...(overrides.schoolProfile as Record<string, unknown> || {}),
    },
    enrollment: {
      year1: 100,
      year2: 120,
      year3: 140,
      year4: 160,
      year5: 180,
      retentionRate: 85,
      ...(overrides.enrollment as Record<string, unknown> || {}),
    },
    facilities: {
      annualSalaryIncrease: 0,
      generalCostInflation: 0,
      ...(overrides.facilities as Record<string, unknown> || {}),
    },
    revenueRows: (overrides.revenueRows as unknown[]) || [
      {
        id: "rev1",
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "per_student",
        amount: 12000,
      },
    ],
    staffingRows: (overrides.staffingRows as unknown[]) || [
      {
        id: "s1",
        roleName: "Head",
        functionCategory: "instructional",
        employmentType: "full_time",
        fte: 1,
        annualizedRate: 60000,
        benefitsEligible: true,
        benefitsRate: 22,
        payrollTaxRate: 8,
        payrollLike: true,
      },
    ],
    expenseRows: (overrides.expenseRows as unknown[]) || [],
    capitalAndDebtRows: (overrides.capitalAndDebtRows as unknown[]) || [],
    tuitionTiers: (overrides.tuitionTiers as unknown[]) || [],
    openingBalances: {
      cash: 50000,
      ...(overrides.openingBalances as Record<string, unknown> || {}),
    },
  } as FullModelData;
}

describe("computeDecisionImpactFromPersisted — round-trip math", () => {
  it("change_enrollment: persisted overrides reproduce direct computation", () => {
    const data = buildBaseModel();
    const direct = computeDecisionImpact(data, {
      type: "change_enrollment",
      inputs: {
        enrollmentDelta: [10, 10, 10, 10, 10],
        tuitionDeltaPerStudent: 500,
      },
    });
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: {
        enrollmentDelta: [10, 10, 10, 10, 10],
        tuitionDeltaPerStudent: 500,
      },
    });
    const replayed = computeDecisionImpactFromPersisted(
      data,
      "change_enrollment",
      persisted,
    );
    expect(replayed.adjusted.netIncome).toEqual(direct.adjusted.netIncome);
    expect(replayed.adjusted.revenue).toEqual(direct.adjusted.revenue);
    expect(replayed.deltas.netIncome).toEqual(direct.deltas.netIncome);
  });

  it("add_program: persisted overrides reproduce direct computation", () => {
    const data = buildBaseModel();
    const direct = computeDecisionImpact(data, {
      type: "add_program",
      inputs: {
        name: "After-school",
        annualTuition: 3000,
        enrollment: [20, 25, 30, 35, 40],
        addedFte: 1,
        addedFteSalary: 40000,
      },
    });
    const persisted = decisionToPersistedOverrides(data, {
      type: "add_program",
      inputs: {
        name: "After-school",
        annualTuition: 3000,
        enrollment: [20, 25, 30, 35, 40],
        addedFte: 1,
        addedFteSalary: 40000,
      },
    });
    const replayed = computeDecisionImpactFromPersisted(
      data,
      "add_program",
      persisted,
    );
    expect(replayed.adjusted.netIncome).toEqual(direct.adjusted.netIncome);
    expect(replayed.adjusted.revenue).toEqual(direct.adjusted.revenue);
    expect(replayed.deltas.revenue).toEqual(direct.deltas.revenue);
  });

  it("evaluate_site: persisted overrides reproduce direct computation (incl. one-time fit-out)", () => {
    const data = buildBaseModel({
      schoolProfile: {
        facilityPhases: [{ squareFootage: 5000 }],
      },
    });
    const direct = computeDecisionImpact(data, {
      type: "evaluate_site",
      inputs: {
        newMonthlyRent: 8000,
        newRentEscalation: 3,
        startYear: 1,
        oneTimeFitOut: 25000,
      },
    });
    const persisted = decisionToPersistedOverrides(data, {
      type: "evaluate_site",
      inputs: {
        newMonthlyRent: 8000,
        newRentEscalation: 3,
        startYear: 1,
        oneTimeFitOut: 25000,
      },
    });
    const replayed = computeDecisionImpactFromPersisted(
      data,
      "evaluate_site",
      persisted,
    );
    expect(replayed.adjusted.netIncome).toEqual(direct.adjusted.netIncome);
    expect(replayed.adjusted.totalExpenses).toEqual(direct.adjusted.totalExpenses);
    expect(replayed.deltas.cashRunwayDeltaMonths).toBe(
      direct.deltas.cashRunwayDeltaMonths,
    );
  });

  it("produces the same nudges shape (length and signals) as direct compute", () => {
    const data = buildBaseModel();
    const inputs = {
      enrollmentDelta: [50, 50, 50, 50, 50] as [number, number, number, number, number],
    };
    const direct = computeDecisionImpact(data, {
      type: "change_enrollment",
      inputs,
    });
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs,
    });
    const replayed = computeDecisionImpactFromPersisted(
      data,
      "change_enrollment",
      persisted,
    );
    expect(replayed.nudges.length).toBe(direct.nudges.length);
    expect(replayed.nudges.map((n) => n.signal)).toEqual(
      direct.nudges.map((n) => n.signal),
    );
  });
});
