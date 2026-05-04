import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, email: "founder@test.school", name: "Founder", personaComfort: "comfortable" },
    isLoading: false,
    login: () => {},
    logout: () => {},
    refetchUser: async () => {},
  }),
}));
vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { CustomScenarioCard } from "../index";
import type { CustomScenario } from "@/pages/model-wizard/schema";
import type { ActualsSuggestion, ProjectedSnapshot } from "@/lib/decision-flows";

function makeScenario(overrides: Partial<CustomScenario> = {}): CustomScenario {
  return {
    name: "New site at Maple St",
    createdAt: "2026-04-01T12:00:00.000Z",
    overrides: {},
    decisionType: "evaluate_site",
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

function renderCard(getAdjustedCashPosition?: () => readonly number[] | null) {
  render(
    <CustomScenarioCard
      scenario={makeScenario()}
      index={0}
      fmtDate={(iso) => new Date(iso).toLocaleDateString("en-US")}
      onRemove={vi.fn(async () => {})}
      onPatch={vi.fn(async () => {})}
      onOpenInPlanner={vi.fn()}
      onApplyToModel={vi.fn(async () => {})}
      getProjectedSnapshot={() => projectedSnapshot}
      getActualsSuggestion={() => emptySuggestion}
      getAdjustedCashPosition={getAdjustedCashPosition}
    />,
  );
}

describe("CustomScenarioCard — trough badge (Task #377)", () => {
  it("renders the lowest projected cash year as a rose-tinted badge when negative", () => {
    renderCard(() => [200_000, 50_000, -60_000, 10_000, 120_000]);
    const badge = screen.getByTestId("custom-scenario-trough-badge-0");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/rose/);
    expect(screen.getByTestId("custom-scenario-trough-label-0")).toHaveTextContent(
      /Y3 at \$-60K/,
    );
  });

  it("uses the amber tint when the trough is merely low (still positive)", () => {
    renderCard(() => [200_000, 50_000, 10_000, 80_000, 120_000]);
    const badge = screen.getByTestId("custom-scenario-trough-badge-0");
    expect(badge.className).toMatch(/amber/);
    expect(screen.getByTestId("custom-scenario-trough-label-0")).toHaveTextContent(
      /Y3 at \$10K/,
    );
  });

  it("silently omits the badge when the cash-position forecast has no finite values", () => {
    renderCard(() => [Number.NaN, Number.POSITIVE_INFINITY]);
    expect(screen.queryByTestId("custom-scenario-trough-badge-0")).not.toBeInTheDocument();
  });

  it("silently omits the badge when getAdjustedCashPosition returns null (legacy / non-decision saves)", () => {
    renderCard(() => null);
    expect(screen.queryByTestId("custom-scenario-trough-badge-0")).not.toBeInTheDocument();
  });

  it("silently omits the badge when no getAdjustedCashPosition prop is wired", () => {
    renderCard(undefined);
    expect(screen.queryByTestId("custom-scenario-trough-badge-0")).not.toBeInTheDocument();
  });
});
