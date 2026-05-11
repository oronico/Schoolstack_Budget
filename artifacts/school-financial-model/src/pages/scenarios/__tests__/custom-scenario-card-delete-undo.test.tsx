import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// --- Hoisted fixture data ----------------------------------------------------
//
// Task #444 — Drives the page-level confirm → undo flow added on top of the
// inline delete confirmation from Task #369. We mount the real ScenarioPage
// (so the wired `removeCustom` handler runs) but stub the heavy dependencies
// the same way scenarios-page-single-year.test.tsx does.

const fiveYearMetrics = {
  enrollment: [50, 60, 70, 80, 90],
  revenue: [500_000, 600_000, 700_000, 800_000, 900_000],
  staffingCost: [300_000, 320_000, 340_000, 360_000, 380_000],
  facilityCost: [80_000, 80_000, 80_000, 80_000, 80_000],
  opex: [50_000, 50_000, 50_000, 50_000, 50_000],
  totalExpenses: [430_000, 450_000, 470_000, 490_000, 510_000],
  netIncome: [70_000, 150_000, 230_000, 310_000, 390_000],
  netMargin: [0.14, 0.25, 0.33, 0.39, 0.43],
  dscr: [1.4, 1.6, 1.8, 2.0, 2.2],
  staffingPctOfRevenue: [0.6, 0.55, 0.5, 0.45, 0.42],
  breakEvenYear: 1,
  breakEvenStudents: [null, null, null, null, null],
  breakEvenUtilization: [null, null, null, null, null],
  fixedOpex: [0, 0, 0, 0, 0],
  variableOpex: [0, 0, 0, 0, 0],
  cashRunwayMonths: 18,
  reserveMonths: 6,
  cashPosition: [100_000, 80_000, 60_000, 90_000, 130_000],
  contractedRevenue: [500_000, 600_000, 700_000, 800_000, 900_000],
  badDebt: [0, 0, 0, 0, 0],
  arBalance: [0, 0, 0, 0, 0],
  restrictedRevenue: [0, 0, 0, 0, 0],
  restrictedCash: [0, 0, 0, 0, 0],
  unrestrictedCash: [100_000, 80_000, 60_000, 90_000, 130_000],
  unrestrictedCashRunwayMonths: 18,
  tuitionDelinquencyRateApplied: 0,
};

const baseAdjustments = {
  name: "Base Model",
  enrollmentAdjustment: 0,
  tuitionAdjustment: 0,
  expenseAdjustment: 0,
  staffingAdjustment: 0,
  facilityAdjustment: 0,
};

// --- Mocks -------------------------------------------------------------------

const modelDataRef = { current: {} as Record<string, unknown> };
const mutateAsyncMock = vi.fn(async (args: { id: number; data: { data: Record<string, unknown> } }) => {
  // Mirror the server: persist the new shape into our shared modelData ref so
  // a subsequent readFreshData() call sees the post-delete (or post-restore)
  // state.
  modelDataRef.current = args.data.data;
  return {} as unknown;
});

vi.mock("@workspace/api-client-react", () => ({
  useGetModel: () => ({
    data: {
      id: 42,
      name: "Test Academy",
      currentStep: 9,
      data: modelDataRef.current,
    },
    isLoading: false,
    isError: false,
    refetch: () => Promise.resolve(),
  }),
  useUpdateModel: () => ({
    mutate: vi.fn(),
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    // Return the live ref so removeCustom's `readFreshData` always sees the
    // latest persisted shape (mirroring the real query cache after an
    // invalidation/refetch).
    getQueryData: () => ({ data: modelDataRef.current }),
    invalidateQueries: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: {
      id: 1,
      email: "founder@test.school",
      name: "Founder",
      personaComfort: "comfortable",
    },
    isLoading: false,
    login: () => {},
    logout: () => {},
    refetchUser: async () => {},
  });
  return { useAuth: ctx, useOptionalAuth: ctx };
});

vi.mock("@/components/layout/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="test-layout">{children}</div>
  ),
}));

// Capture every toast invocation so the test can locate the one with the
// "Undo" ToastAction and trigger its onClick.
type ToastCall = { title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode };
const toastCalls: ToastCall[] = [];
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (call: ToastCall) => {
      toastCalls.push(call);
    },
    dismiss: () => {},
  }),
}));

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

vi.mock("@/lib/scenario-engine", () => ({
  computeProgramBreakEven: () => [],
  computeScenarios: () => ({
    base: {
      name: "Base Model",
      adjustments: baseAdjustments,
      metrics: fiveYearMetrics,
      nudges: [],
    },
    scenarios: [],
    leverNudges: [],
  }),
}));

vi.mock("@/lib/forecast-accuracy", () => ({
  computeForecastAccuracy: () => ({ entries: [] }),
}));

// Stub heavy children so the page mounts cleanly.
vi.mock("@/components/whatif/WhatIfTrigger", () => ({
  WhatIfTrigger: () => null,
}));
vi.mock("@/components/consultant/ScenarioComparisonView", () => ({
  ScenarioComparisonView: () => null,
}));
vi.mock("@/components/scenarios/AdvisorPreviewPanel", () => ({
  AdvisorPreviewPanel: () => null,
}));
vi.mock("@/components/decision-flow/ImpactSummary", () => ({
  ImpactSummary: () => null,
}));
vi.mock("@/components/forecast-accuracy/ForecastAccuracyView", () => ({
  ForecastAccuracyView: () => null,
}));
vi.mock("@/components/coaching/WhyThisMatters", () => ({
  WhyThisMatters: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/coaching/GlossaryTerm", () => ({
  GlossaryTerm: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/coaching/WhatIfLink", () => ({
  WhatIfLink: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/coaching/FinancingInsight", () => ({
  FinancingInsight: () => null,
}));

import { ScenarioPage } from "../index";
import type { CustomScenario } from "@/pages/model-wizard/schema";

const fullScenario: CustomScenario = {
  name: "Smaller lease",
  createdAt: "2026-04-01T12:00:00.000Z",
  overrides: { enrollmentDelta: [-5, -3, 0, 0, 0] },
  outcomeStatus: "pursued",
  outcomeUpdatedAt: "2026-04-15T12:00:00.000Z",
  retrospective: "Signed the smaller lease — landlord wouldn't budge on TI.",
  appliedToModelAt: "2026-04-10T09:00:00.000Z",
  actuals: {
    asOfYear: 1,
    enrollmentActual: 118,
    revenueActual: 2_350_000,
    expenseActual: 2_080_000,
    netIncomeActual: 270_000,
  },
};

function renderPage() {
  const { hook, searchHook } = memoryLocation({
    path: "/model/42/scenarios",
    static: true,
  });
  return render(
    <Router hook={hook} searchHook={searchHook}>
      <ScenarioPage />
    </Router>,
  );
}

beforeEach(() => {
  modelDataRef.current = {
    schoolProfile: { modelDuration: "five_year" },
    customScenarios: [fullScenario],
  };
  toastCalls.length = 0;
  mutateAsyncMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScenarioPage — confirm-delete shows Undo toast (Task #444)", () => {
  it("snapshots the deleted scenario and re-persists it (with outcome, retrospective, actuals, appliedToModelAt) when Undo is clicked", async () => {
    renderPage();

    // Click the per-card delete affordance, then the inline confirmation.
    fireEvent.click(await screen.findByTestId("custom-scenario-delete-0"));
    fireEvent.click(screen.getByTestId("custom-scenario-delete-confirm-yes-0"));

    // The delete write goes through and removes the scenario from the list.
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    const deleteCall = mutateAsyncMock.mock.calls[0][0];
    expect(deleteCall.id).toBe(42);
    expect(deleteCall.data.data.customScenarios).toEqual([]);

    // The Undo toast surfaces with a ToastAction.
    await waitFor(() => expect(toastCalls.length).toBeGreaterThan(0));
    const undoToast = toastCalls.find((c) => !!c.action);
    expect(undoToast).toBeDefined();
    expect(undoToast!.title).toBe("Scenario deleted");

    // Render the toast action so we can click it (toasts are passed as
    // `action: <ToastAction onClick=...>` and never mounted in this isolated
    // test, so we render it standalone to exercise the handler).
    const { container } = render(<>{undoToast!.action}</>);
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    await act(async () => {
      fireEvent.click(button!);
    });

    // The undo write re-persists the scenario with every saved field intact.
    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(2));
    const undoCall = mutateAsyncMock.mock.calls[1][0];
    expect(undoCall.id).toBe(42);
    const restored = (undoCall.data.data.customScenarios as CustomScenario[]) || [];
    expect(restored).toHaveLength(1);
    // Full payload is restored — name, createdAt, overrides, outcomeStatus,
    // outcomeUpdatedAt, retrospective, appliedToModelAt, and actuals (the
    // fields a founder cannot reconstruct from memory).
    expect(restored[0]).toEqual(fullScenario);

    // A confirmation toast follows the undo write.
    await waitFor(() =>
      expect(toastCalls.some((c) => c.title === "Scenario restored")).toBe(true),
    );
  });
});
