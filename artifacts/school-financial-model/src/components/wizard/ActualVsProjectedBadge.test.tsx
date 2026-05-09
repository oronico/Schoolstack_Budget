import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActualVsProjectedBadge } from "./ActualVsProjectedBadge";
import { LaunchChecklistCard } from "./LaunchChecklistCard";
import { AssumptionConfidenceRollupCard } from "./AssumptionConfidenceRollupCard";
import { PATHWAY_FRAMING_COPY, LAUNCH_CHECKLIST_ITEMS } from "@workspace/finance";

describe("ActualVsProjectedBadge — Task #703", () => {
  it("renders an Actual chip", () => {
    render(<ActualVsProjectedBadge kind="actual" />);
    const el = screen.getByTestId("actual-vs-projected-badge-actual");
    expect(el.textContent).toMatch(/Actual/);
  });

  it("renders a Projected chip", () => {
    render(<ActualVsProjectedBadge kind="projected" />);
    const el = screen.getByTestId("actual-vs-projected-badge-projected");
    expect(el.textContent).toMatch(/Projected/);
  });
});

describe("LaunchChecklistCard — Task #703", () => {
  it("renders the verbatim assumptions framing copy", () => {
    render(<LaunchChecklistCard />);
    const framing = screen.getByTestId("launch-checklist-framing");
    expect(framing.textContent).toBe(PATHWAY_FRAMING_COPY.assumptions);
  });

  it("renders one row per checklist item", () => {
    render(<LaunchChecklistCard />);
    for (const item of LAUNCH_CHECKLIST_ITEMS) {
      expect(screen.getByTestId(`launch-checklist-item-${item.id}`)).toBeInTheDocument();
    }
  });
});

describe("AssumptionConfidenceRollupCard — Task #703", () => {
  it("renders the verbatim Needs Support copy when nothing is tagged", () => {
    render(<AssumptionConfidenceRollupCard data={{ assumptionConfidence: {} }} />);
    const card = screen.getByTestId("assumption-confidence-rollup");
    expect(card.getAttribute("data-status")).toBe("Needs Support");
    const message = screen.getByTestId("assumption-confidence-rollup-message");
    expect(message.textContent).toBe(
      "This does not mean your plan is weak. It means this part needs more clarity.",
    );
  });
});
