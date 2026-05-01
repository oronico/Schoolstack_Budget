import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, guidanceLevel: "advanced" },
    refetchUser: async () => {},
    isLoading: false,
    login: () => {},
    logout: () => {},
  }),
}));

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

vi.mock("@/components/coaching/WhatIfLink", () => ({
  WhatIfLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { ImpactSummary } from "../ImpactSummary";
import type { DecisionImpact } from "@/lib/decision-flows";

type ScenarioMetricsLike = DecisionImpact["adjusted"];

function metrics(overrides: Partial<ScenarioMetricsLike> = {}): ScenarioMetricsLike {
  return {
    enrollment: [50, 60, 70, 80, 90],
    revenue: [500000, 600000, 700000, 800000, 900000],
    staffingCost: [300000, 320000, 340000, 360000, 380000],
    facilityCost: [80000, 80000, 80000, 80000, 80000],
    opex: [50000, 50000, 50000, 50000, 50000],
    totalExpenses: [430000, 450000, 470000, 490000, 510000],
    netIncome: [70000, 150000, 230000, 310000, 390000],
    netMargin: [0.14, 0.25, 0.33, 0.39, 0.43],
    dscr: [1.4, 1.6, 1.8, 2.0, 2.2],
    staffingPctOfRevenue: [0.6, 0.55, 0.5, 0.45, 0.42],
    breakEvenYear: 1,
    cashRunwayMonths: 18,
    reserveMonths: 6,
    cashPosition: [100000, 80000, 60000, 90000, 130000],
    ...overrides,
  };
}

function makeImpact(
  adjustedOverrides: Partial<ScenarioMetricsLike> = {},
  baseOverrides: Partial<ScenarioMetricsLike> = {},
): DecisionImpact {
  const base = metrics(baseOverrides);
  const adjusted = metrics(adjustedOverrides);
  return {
    base,
    adjusted,
    deltas: {
      revenue: adjusted.revenue.map((v, i) => v - base.revenue[i]),
      netIncome: adjusted.netIncome.map((v, i) => v - base.netIncome[i]),
      netIncomePct: adjusted.netMargin.map((v, i) => v - base.netMargin[i]),
      dscr: adjusted.dscr.map((v, i) => v - base.dscr[i]),
      breakEvenYearShift:
        base.breakEvenYear !== null && adjusted.breakEvenYear !== null
          ? adjusted.breakEvenYear - base.breakEvenYear
          : null,
      cashRunwayDeltaMonths: adjusted.cashRunwayMonths - base.cashRunwayMonths,
    },
    nudges: [],
  };
}

describe("ImpactSummary — single view trough callout", () => {
  it("marks the lowest cash year and renders a trough summary", () => {
    // Year 3 ($60k) is the trough.
    const impact = makeImpact({
      cashPosition: [100000, 80000, 60000, 90000, 130000],
    });

    render(<ImpactSummary impact={impact} />);

    // The Year 3 cell gets the trough mark; other years do not.
    expect(screen.getByTestId("impact-cash-position-y3-trough")).toBeInTheDocument();
    expect(screen.queryByTestId("impact-cash-position-y1-trough")).toBeNull();
    expect(screen.queryByTestId("impact-cash-position-y4-trough")).toBeNull();

    // The summary callout names the trough year and amount.
    const callout = screen.getByTestId("impact-cash-trough-callout");
    expect(callout).toBeInTheDocument();
    expect(within(callout).getByTestId("impact-cash-trough-label")).toHaveTextContent(
      /Year 3 at -?\$60.0k/,
    );
  });

  it("picks the earliest year on ties so the first crunch surfaces", () => {
    // Years 2 and 4 tie at $40k — earliest (Year 2) wins.
    const impact = makeImpact({
      cashPosition: [100000, 40000, 80000, 40000, 120000],
    });

    render(<ImpactSummary impact={impact} />);

    expect(screen.getByTestId("impact-cash-position-y2-trough")).toBeInTheDocument();
    expect(screen.queryByTestId("impact-cash-position-y4-trough")).toBeNull();
    expect(screen.getByTestId("impact-cash-trough-label")).toHaveTextContent(/Year 2/);
  });

  it("omits the callout when no finite cash years are available", () => {
    const impact = makeImpact({ cashPosition: [] });
    render(<ImpactSummary impact={impact} />);
    expect(screen.queryByTestId("impact-cash-trough-callout")).toBeNull();
  });
});

describe("ImpactSummary — comparison view trough highlights", () => {
  it("marks each side's lowest cash year independently and lists them in the summary", () => {
    // A's trough is Y3 (-$50k); B's trough is Y4 ($20k).
    const impactA = makeImpact({
      cashPosition: [80000, 40000, -50000, 30000, 120000],
    });
    const impactB = makeImpact({
      cashPosition: [120000, 90000, 60000, 20000, 100000],
    });

    render(
      <ImpactSummary
        impact={impactA}
        columns={[
          { impact: impactA, label: "Site A" },
          { impact: impactB, label: "Site B" },
        ]}
      />,
    );

    // Per-cell trough marks — one per side, in different year columns.
    expect(
      screen.getByTestId("cmp-cash-position-col-0-y3-trough"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("cmp-cash-position-col-0-y4-trough"),
    ).toBeNull();
    expect(
      screen.getByTestId("cmp-cash-position-col-1-y4-trough"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("cmp-cash-position-col-1-y3-trough"),
    ).toBeNull();

    // Per-side summary chips with year + amount.
    const summary = screen.getByTestId("comparison-cash-trough-summary");
    expect(within(summary).getByTestId("comparison-cash-trough-col-0")).toHaveTextContent(
      /Y3 at -\$50.0k/,
    );
    expect(within(summary).getByTestId("comparison-cash-trough-col-1")).toHaveTextContent(
      /Y4 at \$20.0k/,
    );
  });
});
