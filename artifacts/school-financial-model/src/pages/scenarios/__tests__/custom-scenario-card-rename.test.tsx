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

type PatchFn = (
  target: { name: string; createdAt: string },
  updates: Partial<CustomScenario>,
) => Promise<void>;
type OpenFn = (overrides: CustomScenario["overrides"]) => void;

function renderCard(props: {
  onPatch?: PatchFn;
  onOpenInPlanner?: OpenFn;
  scenario?: CustomScenario;
} = {}) {
  const onPatch: PatchFn = props.onPatch ?? (async () => {});
  const onOpenInPlanner: OpenFn = props.onOpenInPlanner ?? (() => {});
  render(
    <CustomScenarioCard
      scenario={props.scenario ?? makeScenario()}
      index={0}
      fmtDate={(iso) => new Date(iso).toLocaleDateString("en-US")}
      onRemove={async () => {}}
      onPatch={onPatch}
      onOpenInPlanner={onOpenInPlanner}
      onApplyToModel={async () => {}}
      getProjectedSnapshot={() => projectedSnapshot}
      getActualsSuggestion={() => emptySuggestion}
      personaComfort={null}
    />,
  );
  return { onPatch, onOpenInPlanner };
}

describe("CustomScenarioCard — rename", () => {
  it("shows the saved scenario name and a rename affordance", () => {
    renderCard();
    expect(screen.getByTestId("custom-scenario-name-0")).toHaveTextContent(
      "Slower lease ramp",
    );
    expect(screen.getByTestId("custom-scenario-rename-0")).toBeInTheDocument();
  });

  it("opens an inline editor when the rename affordance is clicked", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("custom-scenario-rename-0"));
    const input = screen.getByTestId("custom-scenario-rename-input-0") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    // Pre-filled with the current name so the founder edits in place.
    expect(input.value).toBe("Slower lease ramp");
  });

  it("patches the persisted scenario name when the founder saves a new name", async () => {
    const onPatch = vi.fn<PatchFn>(async () => {});
    renderCard({ onPatch });
    fireEvent.click(screen.getByTestId("custom-scenario-rename-0"));
    const input = screen.getByTestId("custom-scenario-rename-input-0");
    fireEvent.change(input, { target: { value: "Stretch lease — Plan B" } });
    fireEvent.click(screen.getByTestId("custom-scenario-rename-save-0"));
    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    expect(onPatch).toHaveBeenCalledWith(
      { name: "Slower lease ramp", createdAt: "2026-04-01T12:00:00.000Z" },
      { name: "Stretch lease — Plan B" },
    );
  });

  it("treats an empty / whitespace-only name as a no-op", async () => {
    const onPatch = vi.fn<PatchFn>(async () => {});
    renderCard({ onPatch });
    fireEvent.click(screen.getByTestId("custom-scenario-rename-0"));
    const input = screen.getByTestId("custom-scenario-rename-input-0");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("custom-scenario-rename-save-0"));
    // No persistence write — the editor closes silently and the original
    // name keeps showing.
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.getByTestId("custom-scenario-name-0")).toHaveTextContent(
      "Slower lease ramp",
    );
  });

  it("cancels the rename without writing when Escape is pressed", () => {
    const onPatch = vi.fn<PatchFn>(async () => {});
    renderCard({ onPatch });
    fireEvent.click(screen.getByTestId("custom-scenario-rename-0"));
    const input = screen.getByTestId("custom-scenario-rename-input-0");
    fireEvent.change(input, { target: { value: "Should be discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("custom-scenario-rename-input-0")).toBeNull();
    expect(screen.getByTestId("custom-scenario-name-0")).toHaveTextContent(
      "Slower lease ramp",
    );
  });

  it("submits the rename when Enter is pressed", async () => {
    const onPatch = vi.fn<PatchFn>(async () => {});
    renderCard({ onPatch });
    fireEvent.click(screen.getByTestId("custom-scenario-rename-0"));
    const input = screen.getByTestId("custom-scenario-rename-input-0");
    fireEvent.change(input, { target: { value: "Conservative ramp" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    expect(onPatch).toHaveBeenCalledWith(
      { name: "Slower lease ramp", createdAt: "2026-04-01T12:00:00.000Z" },
      { name: "Conservative ramp" },
    );
  });
});

describe("CustomScenarioCard — open in planner", () => {
  it("forwards the saved overrides to the planner handler", () => {
    const onOpenInPlanner = vi.fn<OpenFn>();
    const scenario = makeScenario({
      overrides: {
        enrollmentDelta: [-5, -3, 0, 0, 0],
        retentionRate: 80,
      },
    });
    renderCard({ onOpenInPlanner, scenario });
    fireEvent.click(screen.getByTestId("custom-scenario-open-0"));
    expect(onOpenInPlanner).toHaveBeenCalledTimes(1);
    expect(onOpenInPlanner).toHaveBeenCalledWith({
      enrollmentDelta: [-5, -3, 0, 0, 0],
      retentionRate: 80,
    });
  });
});
