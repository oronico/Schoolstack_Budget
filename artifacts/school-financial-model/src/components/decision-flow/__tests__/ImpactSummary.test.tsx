import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: { id: 1, guidanceLevel: "advanced" },
    refetchUser: async () => {},
    isLoading: false,
    login: () => {},
    logout: () => {},
  });
  return { useAuth: ctx, useOptionalAuth: ctx };
});

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

describe("ImpactSummary — comparison view phone responsive layout", () => {
  // These tests pin the mobile-friendly class hooks on the comparison view
  // so a regression that drops the sticky-first-column or the phone scroll
  // hint surfaces in unit tests rather than in a manual phone-width pass.
  // We assert on the class strings the renderer emits because Tailwind
  // utility classes are how the responsive contract is expressed in this
  // codebase (no plain CSS counterpart to query against jsdom).
  function renderTwoColComparison() {
    const impactA = makeImpact({ cashPosition: [80000, 40000, -50000, 30000, 120000] });
    const impactB = makeImpact({ cashPosition: [120000, 90000, 60000, 20000, 100000] });
    render(
      <ImpactSummary
        impact={impactA}
        columns={[
          { impact: impactA, label: "Site A — long descriptive name that may overflow" },
          { impact: impactB, label: "Site B" },
        ]}
      />,
    );
  }

  it("pins the metric column with sticky positioning so it stays visible while scrolling years", () => {
    renderTwoColComparison();
    const table = screen.getByTestId("comparison-year-table");
    // The Metric header cell + every per-metric rowSpan cell must carry the
    // sticky/left-0/bg classes; otherwise horizontal scroll on phones
    // detaches the row label from its values.
    const stickyCells = table.querySelectorAll<HTMLElement>("th.sticky, td.sticky");
    expect(stickyCells.length).toBeGreaterThanOrEqual(6); // 1 thead + 5 metric rows
    stickyCells.forEach((cell) => {
      expect(cell.className).toMatch(/\bsticky\b/);
      expect(cell.className).toMatch(/\bleft-0\b/);
      // An opaque background is required so the year cells don't bleed
      // through the sticky cell as they scroll under it.
      expect(cell.className).toMatch(/\bbg-(card|slate-50)\b/);
    });
  });

  it("renders a phone-only swipe hint as a visual scroll affordance", () => {
    renderTwoColComparison();
    const hint = screen.getByTestId("comparison-year-table-scroll-hint");
    // Hidden on sm+ so desktop founders don't see a redundant "swipe"
    // instruction; on phones it surfaces because the seven-column table
    // overflows the viewport.
    expect(hint.className).toMatch(/\bsm:hidden\b/);
    expect(hint.textContent).toMatch(/Swipe/i);
  });

  it("keeps the table wider than the smallest phone viewport so overflow scroll engages", () => {
    renderTwoColComparison();
    const table = screen.getByTestId("comparison-year-table");
    // Scoped guard so a future "make the table fluid" change has to
    // intentionally touch this — the sticky-first-column UX only makes
    // sense when the table actually overflows on phones.
    expect(table.className).toMatch(/min-w-\[\d{3,}px\]/);
    const scroller = screen.getByTestId("comparison-year-table-scroller");
    expect(scroller.className).toMatch(/\boverflow-x-auto\b/);
  });

  it("keeps the column header strip color-coded with letter pills on phones", () => {
    renderTwoColComparison();
    const strip = screen.getByTestId("comparison-header-strip");
    const cardA = within(strip).getByTestId("comparison-label-col-0");
    const cardB = within(strip).getByTestId("comparison-label-col-1");
    // Inline (flex) layout below sm so the strip stays compact when 4
    // columns stack vertically on phones; switches to a stacked block on
    // sm+ so the letter sits above the label like a column header.
    expect(cardA.className).toMatch(/\bflex\b/);
    expect(cardA.className).toMatch(/\bsm:block\b/);
    // The A/B color cue must survive the inline layout — the letter still
    // gets the palette text color so founders can match the strip back to
    // the headline tiles and the per-side trough chips.
    const letterA = within(cardA).getByText("A");
    expect(letterA.className).toMatch(/text-primary/);
    const letterB = within(cardB).getByText("B");
    expect(letterB.className).toMatch(/text-teal-700/);
  });

  it("stacks headline tile inner cells into a single column at <480px for n=2 and n=3", () => {
    // n=2 case
    const { unmount } = render(
      <ImpactSummary
        impact={makeImpact()}
        columns={[
          { impact: makeImpact(), label: "Site A" },
          { impact: makeImpact(), label: "Site B" },
        ]}
      />,
    );
    // Each headline tile contains an inner grid; at the smallest phone
    // size these need to be a single column so money values + "→ $X"
    // subtext don't get crushed into 90px-wide cells.
    const tile2 = screen.getByTestId("cmp-y5-net-col-0").parentElement;
    expect(tile2?.className).toMatch(/grid-cols-1/);
    expect(tile2?.className).toMatch(/min-\[480px\]:grid-cols-2/);
    unmount();

    // n=3 case
    render(
      <ImpactSummary
        impact={makeImpact()}
        columns={[
          { impact: makeImpact(), label: "Site A" },
          { impact: makeImpact(), label: "Site B" },
          { impact: makeImpact(), label: "Site C" },
        ]}
      />,
    );
    const tile3 = screen.getByTestId("cmp-y5-net-col-0").parentElement;
    expect(tile3?.className).toMatch(/grid-cols-1/);
    expect(tile3?.className).toMatch(/min-\[480px\]:grid-cols-3/);
  });
});

describe("ImpactSummary — single view, single-year mode (Task #483)", () => {
  // When `isSingleYear` is true the headline tile, per-year table, and
  // section title all collapse to Y1 so a founder who only modeled Year 1
  // never sees a Y5 number they didn't actually project.
  it("renders a Y1 headline label and a single-column 'Year 1 impact' table", () => {
    const impact = makeImpact();
    render(<ImpactSummary impact={impact} isSingleYear={true} />);

    // The headline net-income tile labels itself "Y1 net income Δ" and not
    // "Y5 net income Δ".
    expect(
      screen.getByText(/^Y1 net income Δ$/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/^Y5 net income Δ$/i),
    ).toBeNull();

    // Section title flips from "5-year impact" to "Year 1 impact".
    expect(screen.getByText("Year 1 impact")).toBeInTheDocument();
    expect(screen.queryByText("5-year impact")).toBeNull();

    // The per-year table shows exactly one Year column header (Year 1) —
    // not Year 1..5.
    const table = screen.getByTestId("impact-year-table");
    const yearHeaders = within(table)
      .getAllByRole("columnheader")
      .filter((h) => /^Year [1-5]$/.test(h.textContent || ""));
    expect(yearHeaders).toHaveLength(1);
    expect(yearHeaders[0].textContent).toBe("Year 1");
  });

  it("falls back to the Y5 headline + 5-year table when isSingleYear is false", () => {
    const impact = makeImpact();
    render(<ImpactSummary impact={impact} isSingleYear={false} />);

    expect(screen.getByText(/^Y5 net income Δ$/i)).toBeInTheDocument();
    expect(screen.getByText("5-year impact")).toBeInTheDocument();

    const table = screen.getByTestId("impact-year-table");
    const yearHeaders = within(table)
      .getAllByRole("columnheader")
      .filter((h) => /^Year [1-5]$/.test(h.textContent || ""));
    expect(yearHeaders).toHaveLength(5);
  });
});

describe("ImpactSummary — comparison view, single-year mode (Task #483)", () => {
  function renderTwoColComparison(isSingleYear: boolean) {
    const impactA = makeImpact();
    const impactB = makeImpact();
    render(
      <ImpactSummary
        impact={impactA}
        isSingleYear={isSingleYear}
        columns={[
          { impact: impactA, label: "Site A" },
          { impact: impactB, label: "Site B" },
        ]}
      />,
    );
  }

  it("flips the comparison headline to Y1 and the table title to 'Year 1 impact, side-by-side'", () => {
    renderTwoColComparison(true);

    // Headline tiles use the "Y1" prefix instead of "Y5".
    expect(screen.getByText(/^Y1 net income Δ$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Y5 net income Δ$/i)).toBeNull();

    // Section title.
    expect(
      screen.getByText("Year 1 impact, side-by-side"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("5-year impact, side-by-side"),
    ).toBeNull();

    // The comparison table collapses to a single Year 1 column header.
    const table = screen.getByTestId("comparison-year-table");
    const yearHeaders = within(table)
      .getAllByRole("columnheader")
      .filter((h) => /^Year [1-5]$/.test(h.textContent || ""));
    expect(yearHeaders).toHaveLength(1);
    expect(yearHeaders[0].textContent).toBe("Year 1");
  });

  it("renders the full Y5 headline + 5-column table when isSingleYear is false", () => {
    renderTwoColComparison(false);

    expect(screen.getByText(/^Y5 net income Δ$/i)).toBeInTheDocument();
    expect(
      screen.getByText("5-year impact, side-by-side"),
    ).toBeInTheDocument();

    const table = screen.getByTestId("comparison-year-table");
    const yearHeaders = within(table)
      .getAllByRole("columnheader")
      .filter((h) => /^Year [1-5]$/.test(h.textContent || ""));
    expect(yearHeaders).toHaveLength(5);
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
