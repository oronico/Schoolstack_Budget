import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// --- Hoisted fixture data ----------------------------------------------------
//
// The scenarios-page test renders the real ScenarioPage but stubs the heavy
// dependencies (api-client, query cache, layout shell, downstream charts /
// PDF panels) so the only behaviour under test is the Y5-section gate added
// by Task #478:
//
//   {!isSingleYearModel(modelData) && (<>Year 5 Summary / Net Income by Year /
//     DSCR by Year ...</>)}
//
// We give the engine canned five-year metrics so the per-year rows would
// render if (and only if) the gate didn't fire.

const fiveYearMetrics = {
  enrollment: [50, 60, 70, 80, 90],
  revenue: [500_000, 600_000, 700_000, 800_000, 900_000],
  staffingCost: [300_000, 320_000, 340_000, 360_000, 380_000],
  facilityCost: [80_000, 80_000, 80_000, 80_000, 80_000],
  opex: [50_000, 50_000, 50_000, 50_000, 50_000],
  totalExpenses: [430_000, 450_000, 470_000, 490_000, 510_000],
  netIncome: [70_000, 150_000, 230_000, 310_000, 390_000],
  netMargin: [0.14, 0.25, 0.33, 0.39, 0.43],
  // Non-zero DSCR triggers the optional "DSCR by Year" sub-table.
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

// --- Mocks -------------------------------------------------------------------

const modelDataRef = { current: {} as Record<string, unknown> };

vi.mock("@workspace/api-client-react", () => ({
  useGetModel: () => ({
    data: {
      id: 42,
      name: "Test Academy",
      // Scenarios page redirects to the wizard when currentStep < 9.
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

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
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
  }),
}));

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

// Real engine is heavy and requires a fully-shaped FullModelData. Stub it
// with deterministic metrics so the Side-by-Side Comparison table renders
// past the `results && scenarios.length > 0` gate.
vi.mock("@/lib/scenario-engine", () => ({
  computeScenarios: () => ({
    base: {
      name: "Base Model",
      adjustments: baseAdjustments,
      metrics: fiveYearMetrics,
      nudges: [],
    },
    scenarios: [
      {
        name: "Optimistic",
        adjustments: {
          ...baseAdjustments,
          name: "Optimistic",
          enrollmentAdjustment: 10,
        },
        metrics: fiveYearMetrics,
        nudges: [],
      },
    ],
    leverNudges: [],
  }),
}));

vi.mock("@/lib/forecast-accuracy", () => ({
  computeForecastAccuracy: () => ({ entries: [] }),
}));

// Heavy / unrelated children pulled in by ScenarioPage. Stub them so the
// page mounts cleanly without dragging in chart libs, PDF generators, or
// the WhatIf bottom-sheet.
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
  // Reset modelData before each test; individual tests fill it in.
  modelDataRef.current = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScenarioPage — Y5 sections gated by single-year mode (Task #483)", () => {
  it("renders Year 5 Summary, Net Income by Year, and DSCR by Year for a 5-year model", async () => {
    modelDataRef.current = {
      schoolProfile: { modelDuration: "five_year" },
      scenarios: [
        {
          name: "Optimistic",
          enrollmentAdjustment: 10,
          tuitionAdjustment: 0,
          expenseAdjustment: 0,
          staffingAdjustment: 0,
          facilityAdjustment: 0,
        },
      ],
    };

    renderPage();

    // The Side-by-Side Comparison table is what carries the gated rows;
    // wait for it to mount before asserting.
    await waitFor(() =>
      expect(screen.getByText(/Side-by-Side Comparison/i)).toBeInTheDocument(),
    );

    // All three Y5/per-year section headers render in 5-year mode.
    expect(screen.getByText("Year 5 Summary")).toBeInTheDocument();
    expect(screen.getByText("Net Income by Year")).toBeInTheDocument();
    expect(screen.getByText("DSCR by Year")).toBeInTheDocument();
  });

  it("hides Year 5 Summary, Net Income by Year, and DSCR by Year for a single-year model", async () => {
    modelDataRef.current = {
      schoolProfile: { modelDuration: "single_year" },
      scenarios: [
        {
          name: "Optimistic",
          enrollmentAdjustment: 10,
          tuitionAdjustment: 0,
          expenseAdjustment: 0,
          staffingAdjustment: 0,
          facilityAdjustment: 0,
        },
      ],
    };

    renderPage();

    // The "Year 1 Summary" header always renders, so the comparison block
    // mounted — wait on it instead of the Y5 header (which is the thing we
    // expect to be absent).
    await waitFor(() =>
      expect(screen.getByText("Year 1 Summary")).toBeInTheDocument(),
    );

    // Single-year founders never modeled Y2..Y5, so these per-year /
    // Y5-only sections must collapse out of the comparison table entirely.
    expect(screen.queryByText("Year 5 Summary")).toBeNull();
    expect(screen.queryByText("Net Income by Year")).toBeNull();
    expect(screen.queryByText("DSCR by Year")).toBeNull();
  });
});
