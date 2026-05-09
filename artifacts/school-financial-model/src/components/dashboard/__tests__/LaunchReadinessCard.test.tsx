import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { LaunchReadinessCard } from "../LaunchReadinessCard";

let mockData: Record<string, unknown> | null = null;

vi.mock("@workspace/api-client-react", () => ({
  useGetModel: () => ({
    data: mockData ? { id: 1, data: mockData } : null,
    isLoading: false,
  }),
}));

function renderCard(initial = "/") {
  const { hook } = memoryLocation({ path: initial, record: true });
  return render(
    <Router hook={hook}>
      <LaunchReadinessCard modelId={1} modelName="Test Academy" />
    </Router>,
  );
}

describe("LaunchReadinessCard (Task #711)", () => {
  beforeEach(() => {
    mockData = null;
  });

  it("renders nothing for operating schools", () => {
    mockData = { schoolProfile: { schoolStage: "operating_school" } };
    renderCard();
    expect(screen.queryByTestId("dashboard-launch-readiness")).toBeNull();
  });

  it("shows 0 of 9 with the headline missing item when nothing filled", () => {
    mockData = { schoolProfile: { schoolStage: "new_school" } };
    renderCard();
    expect(screen.getByTestId("dashboard-launch-readiness")).toBeInTheDocument();
    expect(screen.getByTestId("launch-readiness-progress")).toHaveTextContent(
      "0 of 9 launch-checklist items filled",
    );
    expect(screen.getByTestId("launch-readiness-missing")).toHaveTextContent(
      /Projected opening month/i,
    );
  });

  it("counts filled fields and surfaces the next missing one", () => {
    mockData = {
      schoolProfile: {
        schoolStage: "new_school",
        launchAssumptions: {
          projectedOpeningMonth: "Aug 2026",
          committedStudents: 12,
          signedEnrollmentAgreements: 5,
        },
      },
    };
    renderCard();
    expect(screen.getByTestId("launch-readiness-progress")).toHaveTextContent(
      "3 of 9 launch-checklist items filled",
    );
    expect(screen.getByTestId("launch-readiness-missing")).toHaveTextContent(
      /Deposits collected/i,
    );
  });

  it("shows the complete state when all 9 items are filled", () => {
    mockData = {
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
    };
    renderCard();
    expect(screen.getByTestId("launch-readiness-progress")).toHaveTextContent(
      "9 of 9",
    );
    expect(screen.getByTestId("launch-readiness-complete")).toBeInTheDocument();
    expect(screen.queryByTestId("launch-readiness-missing")).toBeNull();
  });

  it("deep-links to the Enrollment step's launch checklist on click", () => {
    mockData = { schoolProfile: { schoolStage: "new_school" } };
    const { hook, history } = memoryLocation({ path: "/", record: true });
    render(
      <Router hook={hook}>
        <LaunchReadinessCard modelId={42} modelName="Test Academy" />
      </Router>,
    );
    fireEvent.click(screen.getByTestId("dashboard-launch-readiness"));
    expect(history[history.length - 1]).toBe(
      "/model/42?step=3&focus=launch-checklist",
    );
  });
});
