import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { ScenarioComparisonView } from "../ScenarioComparisonView";
import type { ComparisonResult } from "@/lib/scenario-compare";
import type { StaffingRowData } from "@/lib/staffing-defaults";
import {
  aggregateRosterCapSavings,
  type PayrollTaxComponent,
} from "@workspace/finance";

const WA_COMPONENTS: PayrollTaxComponent[] = [
  { label: "FICA SS", rate: 6.2, wageBase: 176_100 },
  { label: "Medicare", rate: 1.45 },
  { label: "FUTA", rate: 0.6, wageBase: 7_000 },
  { label: "WA SUI", rate: 1.22, wageBase: 72_800 },
  { label: "WA PFML", rate: 0.28, wageBase: 176_100 },
  { label: "WA Comp", rate: 0.4 },
];

function makeStaffingRow(
  partial: Partial<StaffingRowData> & Pick<StaffingRowData, "id" | "roleName" | "annualizedRate">,
): StaffingRowData {
  return {
    functionCategory: "school_leadership",
    employmentType: "full_time",
    fte: 1,
    benefitsEligible: true,
    benefitsRate: 25,
    payrollTaxRate: 9.95,
    payrollLike: true,
    notes: "",
    staffingMode: "fixed",
    payrollTaxComponents: WA_COMPONENTS,
    ...partial,
  };
}

const BASE_COMPARISON: ComparisonResult = {
  verdict: "stronger",
  verdictExplanation: "Test verdict.",
  biggestImprovement: null,
  biggestRisk: null,
  metricDeltas: [],
  assumptionChanges: [],
  improvementCount: 1,
  worsenedCount: 0,
};

describe("ScenarioComparisonView — wage-base cap savings insight", () => {
  it("renders the persona-aware insight for both compared scenarios when each clears the floor", () => {
    render(
      <ScenarioComparisonView
        comparison={BASE_COMPARISON}
        baseName="Base Model"
        compareName="-10% Staffing"
        staffingRows={[
          makeStaffingRow({ id: "1", roleName: "Head of School", annualizedRate: 200_000 }),
        ]}
        personaComfort="comfortable"
        baseStaffingAdjustment={0}
        compareStaffingAdjustment={-10}
      />,
    );

    const insight = screen.getByTestId("scenario-comparison-cap-insight");
    expect(insight).toBeInTheDocument();

    const baseSide = screen.getByTestId("scenario-comparison-cap-insight-base");
    const compareSide = screen.getByTestId("scenario-comparison-cap-insight-compare");

    // Both labels appear above their respective insights.
    expect(within(baseSide).getByText("Base Model")).toBeInTheDocument();
    expect(within(compareSide).getByText("-10% Staffing")).toBeInTheDocument();

    // Technical (comfortable) variant for both.
    expect(baseSide).toHaveTextContent(/Wage-base caps hit on/i);
    expect(compareSide).toHaveTextContent(/Wage-base caps hit on/i);
    expect(baseSide).toHaveTextContent(/saves \$[\d,]+\/yr/i);
    expect(compareSide).toHaveTextContent(/saves \$[\d,]+\/yr/i);
  });

  it("uses the plain-language variant for new_to_budgeting founders", () => {
    render(
      <ScenarioComparisonView
        comparison={BASE_COMPARISON}
        baseName="Base Model"
        compareName="+5% Staffing"
        staffingRows={[
          makeStaffingRow({ id: "1", roleName: "Head of School", annualizedRate: 200_000 }),
        ]}
        personaComfort="new_to_budgeting"
        baseStaffingAdjustment={0}
        compareStaffingAdjustment={5}
      />,
    );

    const baseSide = screen.getByTestId("scenario-comparison-cap-insight-base");
    const compareSide = screen.getByTestId("scenario-comparison-cap-insight-compare");
    expect(baseSide).toHaveTextContent(/earn above the wage-base cap/i);
    expect(baseSide).toHaveTextContent(/saves about \$[\d,]+\/yr/i);
    expect(compareSide).toHaveTextContent(/earn above the wage-base cap/i);
    expect(compareSide).toHaveTextContent(/saves about \$[\d,]+\/yr/i);
  });

  it("scales each side's roster by its staffingAdjustment so the displayed dollars match the engine math", () => {
    const row = makeStaffingRow({ id: "1", roleName: "Head of School", annualizedRate: 200_000 });

    render(
      <ScenarioComparisonView
        comparison={BASE_COMPARISON}
        baseName="Base Model"
        compareName="+10% Staffing"
        staffingRows={[row]}
        personaComfort="comfortable"
        baseStaffingAdjustment={0}
        compareStaffingAdjustment={10}
      />,
    );

    const expectedBase = aggregateRosterCapSavings([
      { annualizedRate: 200_000, fte: 1, payrollTaxComponents: WA_COMPONENTS },
    ]);
    const expectedCompare = aggregateRosterCapSavings([
      { annualizedRate: 200_000 * 1.1, fte: 1, payrollTaxComponents: WA_COMPONENTS },
    ]);
    expect(expectedBase).not.toBeNull();
    expect(expectedCompare).not.toBeNull();
    if (!expectedBase || !expectedCompare) return;

    const baseSide = screen.getByTestId("scenario-comparison-cap-insight-base");
    const compareSide = screen.getByTestId("scenario-comparison-cap-insight-compare");

    expect(baseSide).toHaveTextContent(`$${expectedBase.totalSavings.toLocaleString()}/yr`);
    expect(compareSide).toHaveTextContent(`$${expectedCompare.totalSavings.toLocaleString()}/yr`);
    // Sanity: a +10% staffing scenario should produce strictly larger savings.
    expect(expectedCompare.totalSavings).toBeGreaterThan(expectedBase.totalSavings);
  });

  it("hides the wage-base section entirely for legacy models without per-component breakdowns", () => {
    render(
      <ScenarioComparisonView
        comparison={BASE_COMPARISON}
        baseName="Base Model"
        compareName="-10% Staffing"
        staffingRows={[
          makeStaffingRow({
            id: "1",
            roleName: "Head of School",
            annualizedRate: 200_000,
            payrollTaxComponents: undefined,
          }),
        ]}
        personaComfort="comfortable"
        baseStaffingAdjustment={0}
        compareStaffingAdjustment={-10}
      />,
    );

    expect(screen.queryByTestId("scenario-comparison-cap-insight")).not.toBeInTheDocument();
  });

  it("hides the wage-base section when there is no roster at all", () => {
    render(
      <ScenarioComparisonView
        comparison={BASE_COMPARISON}
        baseName="Base Model"
        compareName="-10% Staffing"
        staffingRows={[]}
        personaComfort="comfortable"
        baseStaffingAdjustment={0}
        compareStaffingAdjustment={-10}
      />,
    );

    expect(screen.queryByTestId("scenario-comparison-cap-insight")).not.toBeInTheDocument();
  });

  it("excludes contract-not-payroll-like and rate-overridden rows from the aggregate (math integrity)", () => {
    const rows: StaffingRowData[] = [
      makeStaffingRow({ id: "real", roleName: "Head of School", annualizedRate: 200_000 }),
      makeStaffingRow({
        id: "contractor",
        roleName: "1099 Curriculum Consultant",
        annualizedRate: 200_000,
        employmentType: "contract",
        payrollLike: false,
      }),
      makeStaffingRow({
        id: "overridden",
        roleName: "Director of Operations",
        annualizedRate: 200_000,
        payrollTaxRateOverridden: true,
      }),
    ];

    render(
      <ScenarioComparisonView
        comparison={BASE_COMPARISON}
        baseName="Base Model"
        compareName="+5% Staffing"
        staffingRows={rows}
        personaComfort="comfortable"
        baseStaffingAdjustment={0}
        compareStaffingAdjustment={5}
      />,
    );

    const expected = aggregateRosterCapSavings([
      { annualizedRate: 200_000, fte: 1, payrollTaxComponents: WA_COMPONENTS },
    ]);
    expect(expected).not.toBeNull();
    if (!expected) return;

    const baseSide = screen.getByTestId("scenario-comparison-cap-insight-base");
    expect(baseSide).toHaveTextContent(`$${expected.totalSavings.toLocaleString()}/yr`);
    // Only the one real payroll-like, non-overridden row should count.
    expect(baseSide).toHaveTextContent(/across 1 role/i);
  });
});
