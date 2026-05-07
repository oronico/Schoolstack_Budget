import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Task #597: SectionExplainers used to filter forbidden actuals/QuickBooks/
// variance/forecast-accuracy explainers using the founder's onboarding
// persona (`isYetToLaunch(user)`). The gate now follows the *model's*
// `schoolStage`, mirroring the operating-school describe block in
// `pages/model-wizard/__tests__/persona-yet-to-launch.test.tsx`. These
// tests pin that behaviour using the real explainer catalog so a future
// content change that quietly adds a new actuals/variance explainer to
// the `review` section would still surface the regression here.

vi.mock("@/lib/coaching/use-show-coach", () => ({
  useShowCoach: () => ({ guidanceLevel: "extra", showCoach: true }),
}));

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

vi.mock("@/components/coaching/InlineHelpCard", () => ({
  InlineHelpCard: ({ explainer }: { explainer: { id: string; title: string } }) => (
    <div data-testid={`inline-help-${explainer.id}`}>{explainer.title}</div>
  ),
}));

import { SectionExplainers } from "../SectionExplainers";

describe("SectionExplainers — schoolStage gating (Task #597)", () => {
  it("hides the variance-flavored 'Budget vs Actual' explainer on the review section when the model is new_school", () => {
    render(<SectionExplainers section="review" schoolStage="new_school" />);
    expect(screen.queryByTestId("inline-help-budget_vs_actual")).toBeNull();
  });

  it("renders the variance-flavored 'Budget vs Actual' explainer on the review section when the model is operating_school", () => {
    render(<SectionExplainers section="review" schoolStage="operating_school" />);
    expect(screen.getByTestId("inline-help-budget_vs_actual")).toBeInTheDocument();
  });

  it("renders the variance-flavored 'Budget vs Actual' explainer when schoolStage is unknown (legacy models)", () => {
    // Default behaviour for legacy models with no `schoolStage` saved is to
    // show every explainer — matching the helper convention that we never
    // accidentally hide content from operating schools.
    render(<SectionExplainers section="review" />);
    expect(screen.getByTestId("inline-help-budget_vs_actual")).toBeInTheDocument();
  });
});
