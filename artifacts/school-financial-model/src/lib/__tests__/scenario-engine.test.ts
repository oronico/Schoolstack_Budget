import { describe, expect, it } from "vitest";
import { computeScenarios, type ScenarioAdjustments } from "../scenario-engine";

function buildBaseModel() {
  return {
    schoolProfile: {
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
    },
    enrollment: {
      year1: 10,
      year2: 10,
      year3: 10,
      year4: 10,
      year5: 10,
      retentionRate: 90,
    },
    facilities: {
      annualSalaryIncrease: 0,
      generalCostInflation: 0,
    },
    revenueRows: [
      {
        id: "rev-fixed",
        enabled: true,
        category: "other_revenue",
        driverType: "annual_fixed",
        amounts: [12000, 12000, 12000, 12000, 12000],
      },
    ],
    staffingRows: [],
    expenseRows: [
      {
        id: "exp-fixed",
        enabled: true,
        category: "admin_general",
        driverType: "annual_fixed",
        amounts: [24000, 24000, 24000, 24000, 24000],
      },
    ],
    capitalAndDebtRows: [],
    tuitionTiers: [],
    openingBalances: {
      cash: 1000,
    },
  } as any;
}

describe("scenario-engine cash runway month counting", () => {
  it("counts first depletion month as month 1 for base model", () => {
    const data = buildBaseModel();
    const result = computeScenarios(data, []);
    expect(result.base.metrics.cashRunwayMonths).toBe(1);
  });

  it("keeps month indexing consistent after scenario adjustments", () => {
    const data = buildBaseModel();
    const scenarios: ScenarioAdjustments[] = [
      {
        name: "Lower tuition",
        enrollmentAdjustment: 0,
        tuitionAdjustment: -50,
        expenseAdjustment: 0,
        staffingAdjustment: 0,
        facilityAdjustment: 0,
      },
    ];
    const result = computeScenarios(data, scenarios);
    expect(result.scenarios[0]?.metrics.cashRunwayMonths).toBe(1);
  });
});
