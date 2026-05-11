import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const tokenRef = { current: "a".repeat(64) };
vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, useParams: () => ({ token: tokenRef.current }) };
});

import { SharedModelPage } from "../SharedModelPage";

function basePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schoolName: "Test Academy",
    state: "TX",
    schoolType: "private_independent",
    entityType: "non_profit",
    modelDuration: "five_year" as const,
    enrollment: [50, 60, 70, 80, 90],
    revenue: [500_000, 600_000, 700_000, 800_000, 900_000],
    expenses: [450_000, 540_000, 630_000, 720_000, 810_000],
    netIncome: [50_000, 60_000, 70_000, 80_000, 90_000],
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

describe("SharedModelPage — Break-even & downside (Task #626)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the break-even & downside card from the precomputed payload", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () =>
        basePayload({
          breakEvenDownside: {
            breakEvenStudents: [45, 54, 63, 72, 81],
            breakEvenUtilization: [0.45, 0.54, 0.63, 0.72, 0.81],
            maxCapacity: 100,
            enrollment: [50, 60, 70, 80, 90],
            downsideBand: {
              minus10: {
                enrollment: [45, 54, 63, 72, 81],
                dscr: [1.2, 1.3, 1.4, 1.5, 1.6],
                endingCash: [10_000, 20_000, 30_000, 40_000, 50_000],
              },
              minus20: {
                enrollment: [40, 48, 56, 64, 72],
                dscr: [0.8, 0.9, 1.0, 1.1, 1.2],
                endingCash: [-5_000, 5_000, 15_000, 25_000, 35_000],
              },
            },
          },
        }),
    });

    renderWithToken("a".repeat(64));

    await waitFor(() => expect(screen.getByText("Test Academy")).toBeInTheDocument());

    const card = await screen.findByTestId("shared-break-even-downside");
    expect(card).toBeInTheDocument();

    expect(screen.getByTestId("shared-break-even-students-y1")).toHaveTextContent("45");
    expect(screen.getByTestId("shared-break-even-utilization-y1")).toHaveTextContent("45%");
    expect(screen.getByTestId("shared-break-even-status-above")).toBeInTheDocument();

    const table = screen.getByTestId("shared-downside-band-table");
    expect(table).toHaveTextContent("If 10% fewer");
    expect(table).toHaveTextContent("1.20x");
    expect(table).toHaveTextContent("If 20% fewer");
    expect(table).toHaveTextContent("0.80x");
  });

  it("hides the section when the payload omits breakEvenDownside (legacy share links)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => basePayload(),
    });

    renderWithToken("b".repeat(64));

    await waitFor(() => expect(screen.getByText("Test Academy")).toBeInTheDocument());

    expect(screen.queryByTestId("shared-break-even-downside")).toBeNull();
  });
});
