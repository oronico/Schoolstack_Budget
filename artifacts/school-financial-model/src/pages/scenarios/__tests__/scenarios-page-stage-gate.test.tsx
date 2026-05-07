import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Task #597: the scenarios page used to gate its actuals / variance /
// QuickBooks / forecast-accuracy surfaces on the founder's onboarding
// persona (`personaIsYetToLaunch(authUser)`). That mis-hid these
// surfaces for an existing-school founder spinning up a `new_school`
// model and conversely surfaced them for a yet_to_launch founder
// editing an `operating_school` model — the same stage-vs-tone
// regression that #594/#595 fixed inside the wizard. The gate now
// follows the model's `schoolProfile.schoolStage`, exposed on the page
// as `hideActualsForStage`. This test mirrors the operating-school
// describe block in
// `pages/model-wizard/__tests__/persona-yet-to-launch.test.tsx`.

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
  cashRunwayMonths: 18,
  reserveMonths: 6,
  cashPosition: [100_000, 80_000, 60_000, 90_000, 130_000],
};

const baseAdjustments = {
  name: "Base Model",
  enrollmentAdjustment: 0,
  tuitionAdjustment: 0,
  expenseAdjustment: 0,
  staffingAdjustment: 0,
  facilityAdjustment: 0,
};

const modelDataRef = { current: {} as Record<string, unknown> };

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
    mutateAsync: vi.fn(async () => ({})),
    isPending: false,
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: () => undefined,
    invalidateQueries: vi.fn(async () => undefined),
  }),
}));

// Critically: this test pins the founder persona to `yet_to_launch`. Pre-#597
// the page would have hidden the forecast-accuracy roll-up purely because of
// this persona, regardless of the model's stage. After #597 the gate must
// follow the *model's* schoolStage, so this persona should have no bearing on
// the assertions below.
vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: {
      id: 1,
      email: "founder@test.school",
      name: "Founder",
      personaStage: "yet_to_launch",
      personaComfort: "new_to_budgeting",
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

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: () => {}, dismiss: () => {} }),
}));

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

vi.mock("@/lib/scenario-engine", () => ({
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

// Stub `computeForecastAccuracy` to return a non-empty entries array so the
// roll-up's `forecastAccuracyRollup.entries.length > 0` check passes —
// otherwise the section would always be empty and the schoolStage gate
// would be invisible.
vi.mock("@/lib/forecast-accuracy", () => ({
  computeForecastAccuracy: () => ({
    entries: [
      {
        scenarioName: "Optimistic",
        createdAt: new Date().toISOString(),
        decisionType: "add_program",
        deltaNetIncomeY1Pct: 0.04,
        deltaCashY1Pct: -0.02,
        verdict: "on_track",
      },
    ],
  }),
}));

// Render the gated section so we can assert by `data-testid`. The real
// view is heavy (charts, downloads, etc.) and we only care that the
// schoolStage gate decides whether it mounts.
vi.mock("@/components/forecast-accuracy/ForecastAccuracyView", () => ({
  ForecastAccuracyView: () => (
    <div data-testid="forecast-accuracy-view">forecast accuracy</div>
  ),
}));

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
  modelDataRef.current = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A minimally-shaped Pursued saved scenario so CustomScenarioCard's
// `showActualsSurface` branch turns on (it requires either a Pursued
// outcomeStatus or pre-existing actuals). Used to assert the page
// propagates `hideActualsForStage` down as `hideActualsSurfaces`.
const pursuedCustomScenario = {
  name: "Signed lease",
  createdAt: "2024-01-01T00:00:00.000Z",
  overrides: {},
  outcomeStatus: "pursued" as const,
};

describe("ScenarioPage — actuals / forecast-accuracy gate follows schoolStage (Task #597)", () => {
  it("renders the Forecast Accuracy roll-up and CustomScenarioCard actuals surface for an operating_school model even when the founder persona is yet_to_launch", async () => {
    modelDataRef.current = {
      schoolProfile: {
        modelDuration: "five_year",
        schoolStage: "operating_school",
      },
      customScenarios: [pursuedCustomScenario],
    };

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("forecast-accuracy-view")).toBeInTheDocument(),
    );
    // CustomScenarioCard renders its actuals snapshot block when
    // hideActualsSurfaces is falsy AND the scenario is Pursued. The
    // first card on the page uses index 0.
    expect(screen.getByTestId("custom-scenario-actuals-0")).toBeInTheDocument();
  });

  it("hides the Forecast Accuracy roll-up and propagates hideActualsSurfaces to CustomScenarioCard for a new_school model", async () => {
    modelDataRef.current = {
      schoolProfile: {
        modelDuration: "five_year",
        schoolStage: "new_school",
      },
      customScenarios: [pursuedCustomScenario],
    };

    renderPage();

    // The page's Side-by-Side comparison block always renders, so wait on
    // it before asserting absence of the gated sections.
    await waitFor(() =>
      expect(screen.getByText(/Side-by-Side Comparison/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("forecast-accuracy-view")).toBeNull();
    // hideActualsSurfaces={hideActualsForStage} propagates down so the
    // CustomScenarioCard suppresses its actuals snapshot block even
    // though the scenario is Pursued.
    expect(screen.queryByTestId("custom-scenario-actuals-0")).toBeNull();
  });

  it("renders the Forecast Accuracy roll-up for legacy models with no schoolStage (default to operating-school behaviour)", async () => {
    modelDataRef.current = {
      schoolProfile: { modelDuration: "five_year" },
    };

    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("forecast-accuracy-view")).toBeInTheDocument(),
    );
  });
});
