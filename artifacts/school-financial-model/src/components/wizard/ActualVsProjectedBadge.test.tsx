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

  // Task #839 — the rollup card mirrors the lender / board PDF
  // appendix's evidence-file previews so the founder sees the same
  // first-page thumbnails (image and PDF) before exporting.
  it("renders an evidence files preview block when attachments exist", () => {
    render(
      <AssumptionConfidenceRollupCard
        data={{
          assumptionConfidence: {
            tuition_per_student: {
              confidence: "signed_agreement",
              evidenceFiles: [
                {
                  id: "f1",
                  name: "tuition-policy.pdf",
                  mimeType: "application/pdf",
                  size: 1024,
                  uploadedAt: "2026-01-01T00:00:00Z",
                  objectPath: "/objects/dev/u/1/abc",
                },
                {
                  id: "f2",
                  name: "fee-schedule.png",
                  mimeType: "image/png",
                  size: 2048,
                  uploadedAt: "2026-01-02T00:00:00Z",
                  objectPath: "/objects/dev/u/1/def",
                },
              ],
            },
          },
        }}
      />,
    );
    const block = screen.getByTestId("assumption-confidence-rollup-evidence-files");
    expect(block.textContent).toMatch(/2 files attached/);
    expect(
      screen.getByTestId(
        "assumption-confidence-rollup-evidence-file-tuition_per_student-f1",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(
        "assumption-confidence-rollup-evidence-file-tuition_per_student-f2",
      ),
    ).toBeInTheDocument();
  });

  it("does not render the evidence files block when nothing is attached", () => {
    render(<AssumptionConfidenceRollupCard data={{ assumptionConfidence: {} }} />);
    expect(
      screen.queryByTestId("assumption-confidence-rollup-evidence-files"),
    ).not.toBeInTheDocument();
  });
});
