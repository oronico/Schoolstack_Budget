import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { ConsultantAnalysisView } from "../ConsultantAnalysisView";
import type { ConsultantOutput } from "@workspace/api-client-react";

const STUB_CAP_TIER = {
  taggedFractionMin: 0,
  taggedFractionMax: 0.25,
  capAt: "Needs Work",
  rationale: "Below 25% evidence tagging…",
  source: "[citation pending]",
  lastValidated: "2026-05-17",
} as const;

function makeFixture(
  overrides?: Partial<ConsultantOutput["lenderReadinessResult"]>,
  readiness: ConsultantOutput["lenderReadiness"] = "Needs Work",
): ConsultantOutput {
  const base = {
    executiveSummary: "Steady plan with a few areas to tighten.",
    biggestStrength: "Tuition revenue holds.",
    biggestRisk: "Cash dips in Year 2 if enrollment slips.",
    recommendations: [],
    lenderReadiness: readiness,
    lenderReadinessExplanation:
      "Here is how this would read against the Lending Lab benchmarks today.",
    keyMetrics: [],
    revenueComposition: [],
    revenueQuality: [],
    costComposition: [],
    cumulativeFinancials: [],
    stressTests: [],
    sensitivityMatrix: [],
    expenseSensitivityMatrix: [],
    cashRunwayMonths: 24,
    enrollmentGuidance: [],
    topIssues: [],
    healthSignals: [],
    assumptionFlags: [],
    generatedAt: new Date("2026-01-01").toISOString(),
    lenderReadinessResult: {
      uncappedRating: "Strong",
      effectiveRating: "Needs Work",
      callout:
        "Rating capped at Needs Work pending evidence tagging on 22 of 22 assumptions.",
      cap: {
        applied: true,
        capTier: STUB_CAP_TIER,
        reason: "Below 25% evidence tagging…",
        pendingEvidenceCount: 22,
        totalAssumptionCount: 22,
        taggedCount: 0,
        taggedFraction: 0,
      },
      ...overrides,
    },
  } as unknown as ConsultantOutput;
  return base;
}

describe("ConsultantAnalysisView — Task #966 evidence-cap rating preview", () => {
  it("shows the uncapped rating preview and CTA when the cap lifts the rating", () => {
    const jumpToStep = vi.fn();
    const { container } = render(
      <ConsultantAnalysisView
        data={makeFixture()}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
        jumpToStep={jumpToStep}
        assumptionsStepNumber={8}
      />,
    );

    const preview = container.querySelector<HTMLElement>(
      "[data-testid='readiness-cap-preview']",
    );
    expect(preview, "preview row should render when the cap lifts the rating").not.toBeNull();

    const text = preview!.textContent ?? "";
    expect(text).toMatch(/Currently:/);
    expect(text).toMatch(/Needs Work/);
    expect(text).toMatch(/After evidence tagging:/);
    expect(text).toMatch(/Strong/);

    const cta = within(preview!).getByTestId("readiness-cap-preview-cta");
    expect(cta.textContent ?? "").toMatch(/Tag the remaining 22 to preview Strong/);
    fireEvent.click(cta);
    expect(jumpToStep).toHaveBeenCalledWith(8);
  });

  it("hides the preview when no cap is applied", () => {
    const { container } = render(
      <ConsultantAnalysisView
        data={makeFixture(
          {
            uncappedRating: "Strong",
            effectiveRating: "Strong",
            cap: {
              applied: false,
              capTier: STUB_CAP_TIER,
              reason: "",
              pendingEvidenceCount: 0,
              totalAssumptionCount: 22,
              taggedCount: 22,
              taggedFraction: 1,
            },
          },
          "Strong",
        )}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
        jumpToStep={vi.fn()}
        assumptionsStepNumber={8}
      />,
    );
    expect(
      container.querySelector("[data-testid='readiness-cap-preview']"),
    ).toBeNull();
  });

  it("hides the preview when uncapped equals effective (cap bites but doesn't lift the rating)", () => {
    const { container } = render(
      <ConsultantAnalysisView
        data={makeFixture({
          uncappedRating: "Needs Work",
          effectiveRating: "Needs Work",
          cap: {
            applied: true,
            capTier: STUB_CAP_TIER,
            reason: "Below 25% evidence tagging…",
            pendingEvidenceCount: 22,
            totalAssumptionCount: 22,
            taggedCount: 0,
            taggedFraction: 0,
          },
        })}
        niLabel="Net Income"
        cumNiLabel="Cumulative Net Income"
        jumpToStep={vi.fn()}
        assumptionsStepNumber={8}
      />,
    );
    expect(
      container.querySelector("[data-testid='readiness-cap-preview']"),
    ).toBeNull();
  });
});
