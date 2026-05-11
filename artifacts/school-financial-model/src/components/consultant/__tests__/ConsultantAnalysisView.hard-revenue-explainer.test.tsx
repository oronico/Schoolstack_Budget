import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { ConsultantAnalysisView } from "../ConsultantAnalysisView";
import type { ConsultantOutput } from "@workspace/api-client-react";

function makeFixture(
  hardRow: { reserveMonths: number | null; dscr: number | null; runwayMonths: number | null },
): ConsultantOutput {
  return {
    executiveSummary: "Test model.",
    biggestStrength: "Strength",
    biggestRisk: "Risk",
    recommendations: [],
    lenderReadiness: "Needs Work",
    lenderReadinessExplanation: "",
    keyMetrics: [],
    revenueComposition: [],
    revenueQuality: [],
    costComposition: [],
    cumulativeFinancials: [],
    stressTests: [
      {
        scenario: "Hard revenue only",
        y1NetIncome: -100000,
        y5NetIncome: -50000,
        breakEvenYear: null,
        reserveMonths: hardRow.reserveMonths,
        dscr: hardRow.dscr,
        runwayMonths: hardRow.runwayMonths,
      },
    ],
    sensitivityMatrix: [],
    expenseSensitivityMatrix: [],
    cashRunwayMonths: 12,
    enrollmentGuidance: [],
    topIssues: [],
    healthSignals: [],
    assumptionFlags: [],
    generatedAt: new Date("2026-01-01").toISOString(),
  } as unknown as ConsultantOutput;
}

const sampleModel = {
  revenueRows: [
    { id: "gross_tuition", category: "tuition_and_fees", enabled: true },
    { id: "annual_fund", category: "philanthropy", enabled: true },
    { id: "state_local_perpupil", category: "public_funding", enabled: true },
    { id: "esa_revenue", category: "school_choice", enabled: true },
    { id: "disabled_grant", category: "philanthropy", enabled: false },
  ],
};

describe("ConsultantAnalysisView — Hard revenue only explainer (Task #645)", () => {
  it("renders the explainer card with plain-language framing and threshold copy", () => {
    const { getByTestId, container } = render(
      <ConsultantAnalysisView
        data={makeFixture({ reserveMonths: 4, dscr: 1.4, runwayMonths: 18 })}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
        modelData={sampleModel}
      />,
    );

    const card = getByTestId("hard-revenue-only-explainer");
    expect(card).not.toBeNull();
    const text = card.textContent ?? "";
    expect(text).toMatch(/philanthropy/i);
    expect(text).toMatch(/policy/i);
    expect(text).toMatch(/Donor-Dependent/);
    expect(text).toMatch(/Policy-Dependent/);
    // Threshold guidance copy
    expect(text).toMatch(/Reserve/i);
    expect(text).toMatch(/DSCR/i);
    expect(text).toMatch(/runway/i);
    // The fixture passes all three thresholds
    expect(getByTestId("hard-revenue-only-overall").textContent).toMatch(/Passes/i);
    // The dropped-rows list lists donor + policy rows from the model data
    const dropped = container.querySelector("[data-testid='hard-revenue-only-dropped-rows']");
    expect(dropped).not.toBeNull();
    expect(dropped!.textContent).toMatch(/annual_fund/);
    expect(dropped!.textContent).toMatch(/state_local_perpupil/);
    expect(dropped!.textContent).toMatch(/esa_revenue/);
    // Disabled rows should not show up
    expect(dropped!.textContent).not.toMatch(/disabled_grant/);
    // Contracted tuition is not zeroed
    expect(dropped!.textContent).not.toMatch(/gross_tuition/);
  });

  it("flags 'Doesn't pass' when any threshold is in the alert range", () => {
    const { getByTestId } = render(
      <ConsultantAnalysisView
        data={makeFixture({ reserveMonths: 0.5, dscr: 1.5, runwayMonths: 24 })}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
        modelData={sampleModel}
      />,
    );
    expect(getByTestId("hard-revenue-only-overall").textContent).toMatch(/Doesn't pass/i);
  });

  it("jumps to the Revenue step when the founder clicks the edit link (default index)", () => {
    const jump = vi.fn();
    const { getByTestId } = render(
      <ConsultantAnalysisView
        data={makeFixture({ reserveMonths: 4, dscr: 1.4, runwayMonths: 18 })}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
        modelData={sampleModel}
        jumpToStep={jump}
      />,
    );
    fireEvent.click(getByTestId("hard-revenue-only-jump-to-revenue"));
    expect(jump).toHaveBeenCalledWith(4);
  });

  it("uses the dynamically-resolved Revenue step index when wizard layout shifts (e.g. Actuals Intake / Chesterton paths)", () => {
    // On founder paths that insert extra steps before Revenue (Actuals Intake,
    // Chesterton fundraising / gift chart / recruiting), Revenue is no longer
    // step 4. The button must follow the resolved index, not the default.
    const jump = vi.fn();
    const { getByTestId } = render(
      <ConsultantAnalysisView
        data={makeFixture({ reserveMonths: 4, dscr: 1.4, runwayMonths: 18 })}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
        modelData={sampleModel}
        jumpToStep={jump}
        revenueStepNumber={7}
      />,
    );
    fireEvent.click(getByTestId("hard-revenue-only-jump-to-revenue"));
    expect(jump).toHaveBeenCalledWith(7);
    expect(jump).not.toHaveBeenCalledWith(4);
  });

  it("hides the dropped-rows list (and gracefully notes it) when the model has no donor/policy revenue", () => {
    const { getByTestId, queryByTestId } = render(
      <ConsultantAnalysisView
        data={makeFixture({ reserveMonths: 4, dscr: 1.4, runwayMonths: 18 })}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
        modelData={{
          revenueRows: [
            { id: "gross_tuition", category: "tuition_and_fees", enabled: true },
            { id: "registration_fees", category: "tuition_and_fees", enabled: true },
          ],
        }}
      />,
    );
    expect(queryByTestId("hard-revenue-only-dropped-rows")).toBeNull();
    expect(getByTestId("hard-revenue-only-explainer").textContent).toMatch(
      /no revenue tagged Donor-Dependent or Policy-Dependent/i,
    );
  });

  it("renders nothing when the engine did not emit a Hard revenue only scenario", () => {
    const data = makeFixture({ reserveMonths: 4, dscr: 1.4, runwayMonths: 18 });
    (data as { stressTests: unknown }).stressTests = [];
    const { queryByTestId } = render(
      <ConsultantAnalysisView
        data={data}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
        modelData={sampleModel}
      />,
    );
    expect(queryByTestId("hard-revenue-only-explainer")).toBeNull();
  });
});
