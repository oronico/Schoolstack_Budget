import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: { id: 1, email: "founder@test.school", name: "Founder", personaComfort: "comfortable" },
    isLoading: false,
    login: () => {},
    logout: () => {},
    refetchUser: async () => {},
  });
  return { useAuth: ctx, useOptionalAuth: ctx };
});
vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { CustomScenarioCard } from "../index";
import type { CustomScenario } from "@/pages/model-wizard/schema";
import type { ActualsSuggestion, ProjectedSnapshot } from "@/lib/decision-flows";

function makeScenario(overrides: Partial<CustomScenario> = {}): CustomScenario {
  return {
    name: "Slower lease ramp",
    createdAt: "2026-04-01T12:00:00.000Z",
    overrides: {
      enrollmentDelta: [-5, -3, 0, 0, 0],
    },
    ...overrides,
  };
}

const projectedSnapshot: ProjectedSnapshot = {
  asOfYear: 1,
  enrollment: 120,
  revenue: 2_400_000,
  expense: 2_100_000,
  netIncome: 300_000,
  monthlyRent: 12_500,
  programEnrollment: 0,
};

const emptySuggestion: ActualsSuggestion = {
  values: {},
  sources: {},
  sourceLabels: [],
  contributors: {},
};

type RemoveFn = (target: { name: string; createdAt: string }) => Promise<void>;

function renderCard(props: { onRemove?: RemoveFn; scenario?: CustomScenario } = {}) {
  const onRemove: RemoveFn = props.onRemove ?? (async () => {});
  render(
    <CustomScenarioCard
      scenario={props.scenario ?? makeScenario()}
      index={0}
      fmtDate={(iso) => new Date(iso).toLocaleDateString("en-US")}
      onRemove={onRemove}
      onPatch={async () => {}}
      onOpenInPlanner={() => {}}
      onApplyToModel={async () => {}}
      getProjectedSnapshot={() => projectedSnapshot}
      getActualsSuggestion={() => emptySuggestion}
      personaComfort={null}
    />,
  );
  return { onRemove };
}

describe("CustomScenarioCard — delete confirmation (Task #369)", () => {
  it("does not call onRemove on the first click of the delete affordance", () => {
    const onRemove = vi.fn<RemoveFn>(async () => {});
    renderCard({ onRemove });
    fireEvent.click(screen.getByTestId("custom-scenario-delete-0"));
    expect(onRemove).not.toHaveBeenCalled();
    // The inline confirmation prompt is shown in place of the icon button so
    // a misclicked close icon can no longer destroy a saved scenario carrying
    // outcome status, retrospective notes, or actuals snapshots.
    expect(screen.getByTestId("custom-scenario-delete-confirm-prompt-0"))
      .toHaveTextContent(/Delete this saved scenario/i);
    expect(screen.getByTestId("custom-scenario-delete-confirm-yes-0")).toBeInTheDocument();
    expect(screen.getByTestId("custom-scenario-delete-cancel-0")).toBeInTheDocument();
  });

  it("invokes onRemove only after the confirmation button is clicked", async () => {
    const onRemove = vi.fn<RemoveFn>(async () => {});
    renderCard({ onRemove });
    fireEvent.click(screen.getByTestId("custom-scenario-delete-0"));
    fireEvent.click(screen.getByTestId("custom-scenario-delete-confirm-yes-0"));
    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1));
    expect(onRemove).toHaveBeenCalledWith({
      name: "Slower lease ramp",
      createdAt: "2026-04-01T12:00:00.000Z",
    });
  });

  it("dismisses the prompt without calling onRemove when Cancel is clicked", () => {
    const onRemove = vi.fn<RemoveFn>(async () => {});
    renderCard({ onRemove });
    fireEvent.click(screen.getByTestId("custom-scenario-delete-0"));
    fireEvent.click(screen.getByTestId("custom-scenario-delete-cancel-0"));
    expect(onRemove).not.toHaveBeenCalled();
    // Prompt is gone and the original icon button is back.
    expect(screen.queryByTestId("custom-scenario-delete-confirm-prompt-0")).toBeNull();
    expect(screen.getByTestId("custom-scenario-delete-0")).toBeInTheDocument();
  });

  it("guards a Pursued scenario that already has actuals attached", async () => {
    // The whole point of the confirmation is to protect founder work that
    // can't be reconstructed — outcome status + retrospective notes +
    // recorded actuals. Render a card carrying all three and verify the
    // first click still only opens the prompt.
    const onRemove = vi.fn<RemoveFn>(async () => {});
    renderCard({
      onRemove,
      scenario: makeScenario({
        outcomeStatus: "pursued",
        outcomeUpdatedAt: "2026-04-15T12:00:00.000Z",
        retrospective: "Signed the smaller lease — landlord wouldn't budge on TI.",
        actuals: {
          asOfYear: 1,
          enrollmentActual: 118,
          revenueActual: 2_350_000,
          expenseActual: 2_080_000,
          netIncomeActual: 270_000,
        },
      }),
    });
    fireEvent.click(screen.getByTestId("custom-scenario-delete-0"));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByTestId("custom-scenario-delete-confirm-prompt-0")).toBeInTheDocument();
  });
});
