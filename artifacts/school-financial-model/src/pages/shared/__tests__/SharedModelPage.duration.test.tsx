import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Stub wouter's useParams so the shared page sees a token without
// us needing to wire the Route/Switch matcher.
const tokenRef = { current: "a".repeat(64) };
vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useParams: () => ({ token: tokenRef.current }) };
});

import { SharedModelPage } from "../SharedModelPage";

function basePayload(overrides: Partial<Record<string, unknown>> = {}) {
  // Five-element arrays mirror what the engine returns regardless of mode;
  // the shared page is responsible for capping visible columns to Y1 only
  // when modelDuration === "single_year".
  return {
    schoolName: "Test Academy",
    state: "TX",
    schoolType: "private_independent",
    entityType: "non_profit",
    enrollment: [50, 0, 0, 0, 0],
    revenue: [500_000, 0, 0, 0, 0],
    expenses: [450_000, 0, 0, 0, 0],
    netIncome: [50_000, 0, 0, 0, 0],
    staffingCost: [300_000, 0, 0, 0, 0],
    facilityCost: [80_000, 0, 0, 0, 0],
    debtService: [0, 0, 0, 0, 0],
    netMargin: [0.1, 0, 0, 0, 0],
    dscr: [0, 0, 0, 0, 0],
    reserveMonths: 0,
    cashRunwayMonths: 0,
    daysCashOnHand: 60,
    revenueBreakdown: Array.from({ length: 5 }, () => ({
      tuition: 400_000,
      public: 0,
      philanthropy: 100_000,
    })),
    executiveSummary: null,
    lenderReadiness: null,
    createdAt: new Date().toISOString(),
    decisionScenarios: [],
    ...overrides,
  };
}

function renderWithToken(token: string) {
  tokenRef.current = token;
  return render(<SharedModelPage />);
}

describe("SharedModelPage — single-year column gating", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a single Y1 column in single-year mode", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => basePayload({ modelDuration: "single_year" }),
    });

    renderWithToken("a".repeat(64));

    await waitFor(() => expect(screen.getByText("Test Academy")).toBeInTheDocument());

    // Header label flips to single-year copy.
    expect(screen.getByTestId("shared-header-label")).toHaveTextContent(/Single-Year Financial Model/i);
    expect(screen.getByTestId("shared-summary-heading")).toHaveTextContent(/Year 1 Financial Summary/i);

    // Each table renders exactly one Year column header.
    const headers = screen.getAllByRole("columnheader");
    const yearHeaders = headers.filter((h) => /^Year [1-5]$/.test(h.textContent || ""));
    // 3 tables × 1 Y1 column = 3 year-column headers total.
    expect(yearHeaders).toHaveLength(3);
    yearHeaders.forEach((h) => expect(h.textContent).toBe("Year 1"));

    // Enrollment chart renders exactly one bar (one inner div per year).
    const chart = screen.getByTestId("shared-enrollment-chart");
    expect(chart.querySelectorAll(":scope > div")).toHaveLength(1);
  });

  it("renders all five year columns in 5-year mode", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => basePayload({
        modelDuration: "five_year",
        enrollment: [50, 100, 150, 200, 250],
        revenue: [500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000],
        netIncome: [50_000, 100_000, 150_000, 200_000, 300_000],
      }),
    });

    renderWithToken("b".repeat(64));

    await waitFor(() => expect(screen.getByText("Test Academy")).toBeInTheDocument());

    expect(screen.getByTestId("shared-header-label")).toHaveTextContent(/5-Year Financial Model/i);
    expect(screen.getByTestId("shared-summary-heading")).toHaveTextContent(/5-Year Financial Summary/i);

    const headers = screen.getAllByRole("columnheader");
    const yearHeaders = headers.filter((h) => /^Year [1-5]$/.test(h.textContent || ""));
    // 3 tables × 5 columns = 15 year-column headers total.
    expect(yearHeaders).toHaveLength(15);

    const chart = screen.getByTestId("shared-enrollment-chart");
    expect(chart.querySelectorAll(":scope > div")).toHaveLength(5);
  });

  it("treats a payload missing modelDuration as 5-year (back-compat)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => basePayload(),
    });

    renderWithToken("c".repeat(64));

    await waitFor(() => expect(screen.getByText("Test Academy")).toBeInTheDocument());
    expect(screen.getByTestId("shared-summary-heading")).toHaveTextContent(/5-Year Financial Summary/i);
    const chart = screen.getByTestId("shared-enrollment-chart");
    expect(chart.querySelectorAll(":scope > div")).toHaveLength(5);
  });
});
