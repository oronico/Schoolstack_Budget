import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: { id: 1, email: "founder@test.school", name: "Founder", guidanceLevel: "advanced" },
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
import type {
  AccountingExportTotals,
  ActualsSuggestion,
  ProjectedSnapshot,
} from "@/lib/decision-flows";

function makeScenario(overrides: Partial<CustomScenario> = {}): CustomScenario {
  return {
    name: "New site in Brookline",
    createdAt: "2026-03-01T12:00:00.000Z",
    overrides: { monthlyRent: 12500 },
    decisionType: "evaluate_site",
    outcomeStatus: "pursued",
    outcomeUpdatedAt: "2026-03-15T12:00:00.000Z",
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

const exportLabel = "From quickbooks-2026Q1.csv uploaded Mar 14";
const baseSuggestion: ActualsSuggestion = {
  values: {
    revenueActual: 480_000,
    expenseActual: 420_000,
    netIncomeActual: 60_000,
  },
  sources: {
    revenueActual: exportLabel,
    expenseActual: exportLabel,
    netIncomeActual: exportLabel,
  },
  sourceLabels: [exportLabel],
  contributors: {},
};

function renderCard(props: {
  totals?: AccountingExportTotals;
  exportInfo?: { filename?: string; uploadedAt?: string; totals?: AccountingExportTotals };
} = {}) {
  const onPatch = vi.fn(async () => {});
  const onRemove = vi.fn(async () => {});
  const onOpenInPlanner = vi.fn();
  const onApplyToModel = vi.fn(async () => {});
  const getProjectedSnapshot = vi.fn(() => projectedSnapshot);
  const getActualsSuggestion = vi.fn(() => baseSuggestion);
  const exportInfo =
    props.exportInfo ?? {
      filename: "quickbooks-2026Q1.csv",
      uploadedAt: "2026-03-14T15:30:00.000Z",
      totals: props.totals,
    };
  render(
    <CustomScenarioCard
      scenario={makeScenario()}
      index={0}
      fmtDate={(iso) => new Date(iso).toLocaleDateString("en-US")}
      onRemove={onRemove}
      onPatch={onPatch}
      onOpenInPlanner={onOpenInPlanner}
      onApplyToModel={onApplyToModel}
      getProjectedSnapshot={getProjectedSnapshot}
      getActualsSuggestion={getActualsSuggestion}
      accountingExportInfo={exportInfo}
      replaceExportHref="/model/42?step=2&focus=accounting-export"
      onRemoveExport={vi.fn(async () => {})}
    />,
  );
}

describe("CustomScenarioCard — un-mapped revenue/expense gap chips (Task #495)", () => {
  it("renders Other revenue / Other expense chips when category subtotals fall short of the headline by 10%+", async () => {
    const user = userEvent.setup();
    renderCard({
      totals: {
        // Tuition (300k) + Philanthropy (50k) = 350k vs headline 600k → 41.7% gap.
        totalRevenue: 600_000,
        tuitionRevenue: 300_000,
        philanthropyRevenue: 50_000,
        // Payroll (200k) + Facility (40k) = 240k vs headline 500k → 52% gap.
        totalExpenses: 500_000,
        payrollExpense: 200_000,
        facilityExpense: 40_000,
      },
    });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));

    const gap = screen.getByTestId("custom-scenario-actuals-export-gap-0");
    expect(gap).toBeInTheDocument();
    expect(gap).toHaveTextContent(/Un-mapped/i);

    const revenueGap = screen.getByTestId(
      "custom-scenario-actuals-export-gap-revenue-0",
    );
    expect(revenueGap).toHaveTextContent(/Other revenue/i);
    // 600k - 350k = 250k → "$250K"
    expect(revenueGap).toHaveTextContent("$250K");

    const expenseGap = screen.getByTestId(
      "custom-scenario-actuals-export-gap-expense-0",
    );
    expect(expenseGap).toHaveTextContent(/Other expense/i);
    // 500k - 240k = 260k → "$260K"
    expect(expenseGap).toHaveTextContent("$260K");
  });

  it("does not render the gap chip row when category subtotals reconcile within 10% of the headline", async () => {
    const user = userEvent.setup();
    renderCard({
      totals: {
        // Tuition (520k) + Philanthropy (60k) = 580k vs headline 600k → ~3% gap.
        totalRevenue: 600_000,
        tuitionRevenue: 520_000,
        philanthropyRevenue: 60_000,
        // Payroll (450k) + Facility (40k) = 490k vs headline 500k → 2% gap.
        totalExpenses: 500_000,
        payrollExpense: 450_000,
        facilityExpense: 40_000,
      },
    });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));

    expect(
      screen.queryByTestId("custom-scenario-actuals-export-gap-0"),
    ).not.toBeInTheDocument();
  });

  it("does not fire when the parser found no categories at all (matches wizard behavior)", async () => {
    const user = userEvent.setup();
    renderCard({
      totals: {
        // Headline totals only — no curated category subtotals.
        totalRevenue: 600_000,
        totalExpenses: 500_000,
        netIncome: 100_000,
      },
    });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));

    expect(
      screen.queryByTestId("custom-scenario-actuals-export-gap-0"),
    ).not.toBeInTheDocument();
  });

  it("renders only the side that has a gap when the other side reconciles", async () => {
    const user = userEvent.setup();
    renderCard({
      totals: {
        // Revenue side has a 50% gap.
        totalRevenue: 400_000,
        tuitionRevenue: 200_000,
        // Expense side reconciles cleanly.
        totalExpenses: 300_000,
        payrollExpense: 250_000,
        facilityExpense: 40_000,
      },
    });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));

    expect(
      screen.getByTestId("custom-scenario-actuals-export-gap-revenue-0"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("custom-scenario-actuals-export-gap-expense-0"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when the export has no totals object at all", async () => {
    const user = userEvent.setup();
    renderCard({
      exportInfo: {
        filename: "books.csv",
        uploadedAt: "2026-03-14T15:30:00.000Z",
      },
    });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));

    expect(
      screen.queryByTestId("custom-scenario-actuals-export-gap-0"),
    ).not.toBeInTheDocument();
  });
});
