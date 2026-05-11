import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LaunchEvidenceSection } from "../LaunchEvidenceSection";
import type { FullModelData } from "@/pages/model-wizard/schema";

function asData(d: unknown): FullModelData {
  return d as FullModelData;
}

describe("LaunchEvidenceSection (Task #718)", () => {
  it("renders nothing for operating schools", () => {
    const { container } = render(
      <LaunchEvidenceSection
        data={asData({ schoolProfile: { schoolStage: "operating_school" } })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no model data is available", () => {
    const { container } = render(<LaunchEvidenceSection data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 0 of 9 for an empty new-school plan and lists every item as missing", () => {
    render(
      <LaunchEvidenceSection
        data={asData({ schoolProfile: { schoolStage: "new_school" } })}
      />,
    );
    expect(
      screen.getByTestId("launch-evidence-section-count"),
    ).toHaveTextContent("0 of 9 filled");
    expect(
      screen.getByTestId("launch-evidence-section-missing-projectedOpeningMonth"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("launch-evidence-section-complete"),
    ).toBeNull();
  });

  it("counts filled items and surfaces them as filled", () => {
    render(
      <LaunchEvidenceSection
        data={asData({
          schoolProfile: {
            schoolStage: "new_school",
            launchAssumptions: {
              projectedOpeningMonth: "Aug 2026",
              committedStudents: 12,
              signedEnrollmentAgreements: 5,
            },
          },
        })}
      />,
    );
    expect(
      screen.getByTestId("launch-evidence-section-count"),
    ).toHaveTextContent("3 of 9 filled");
    expect(
      screen.getByTestId(
        "launch-evidence-section-filled-projectedOpeningMonth",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("launch-evidence-section-missing-depositsCollected"),
    ).toBeInTheDocument();
  });

  it("shows the complete state when every item is filled", () => {
    render(
      <LaunchEvidenceSection
        data={asData({
          schoolProfile: {
            schoolStage: "new_school",
            launchAssumptions: {
              projectedOpeningMonth: "Aug 2026",
              committedStudents: 12,
              signedEnrollmentAgreements: 5,
              depositsCollected: 1000,
              firstMonthWithRevenue: "Aug 2026",
              firstMonthWithPayroll: "Jul 2026",
              firstMonthWithRent: "Jun 2026",
              preOpeningCashNeeds: 50000,
              startupCosts: 25000,
            },
          },
        })}
      />,
    );
    expect(
      screen.getByTestId("launch-evidence-section-count"),
    ).toHaveTextContent("9 of 9 filled");
    expect(
      screen.getByTestId("launch-evidence-section-complete"),
    ).toBeInTheDocument();
  });

  it("uses a custom testId so multiple instances can coexist", () => {
    render(
      <LaunchEvidenceSection
        data={asData({ schoolProfile: { schoolStage: "new_school" } })}
        testId="narrative-launch-evidence"
      />,
    );
    expect(
      screen.getByTestId("narrative-launch-evidence"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("narrative-launch-evidence-count"),
    ).toHaveTextContent("0 of 9 filled");
  });
});
