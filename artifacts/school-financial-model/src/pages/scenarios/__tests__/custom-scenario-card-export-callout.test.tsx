import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomScenarioCard } from "../index";
import type { CustomScenario } from "@/pages/model-wizard/schema";
import type {
  ActualsSuggestion,
  ProjectedSnapshot,
} from "@/lib/decision-flows";

function makeScenario(overrides: Partial<CustomScenario> = {}): CustomScenario {
  return {
    name: "New site in Brookline",
    createdAt: "2026-03-01T12:00:00.000Z",
    overrides: {
      monthlyRent: 12500,
    },
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
const exportSuggestion: ActualsSuggestion = {
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
  scenario?: CustomScenario;
  exportInfo?: { filename?: string; uploadedAt?: string };
  replaceExportHref?: string;
  suggestion?: ActualsSuggestion;
} = {}) {
  const scenario = props.scenario ?? makeScenario();
  const onPatch = vi.fn(async () => {});
  const onRemove = vi.fn(async () => {});
  const onOpenInPlanner = vi.fn();
  const onApplyToModel = vi.fn(async () => {});
  const getProjectedSnapshot = vi.fn(() => projectedSnapshot);
  const getActualsSuggestion = vi.fn(() => props.suggestion ?? exportSuggestion);
  render(
    <CustomScenarioCard
      scenario={scenario}
      index={0}
      fmtDate={(iso) => new Date(iso).toLocaleDateString("en-US")}
      onRemove={onRemove}
      onPatch={onPatch}
      onOpenInPlanner={onOpenInPlanner}
      onApplyToModel={onApplyToModel}
      getProjectedSnapshot={getProjectedSnapshot}
      getActualsSuggestion={getActualsSuggestion}
      accountingExportInfo={
        props.exportInfo ?? {
          filename: "quickbooks-2026Q1.csv",
          uploadedAt: "2026-03-14T15:30:00.000Z",
        }
      }
      replaceExportHref={
        props.replaceExportHref ?? "/model/42?step=2&focus=accounting-export"
      }
    />,
  );
  return { onPatch, onRemove, onOpenInPlanner, onApplyToModel };
}

describe("CustomScenarioCard — export callout & replace-export deep-link", () => {
  it("renders the callout with filename + upload date after suggesting from the export", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));

    const callout = screen.getByTestId("custom-scenario-actuals-export-source-0");
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveTextContent(/Pulled from your books/i);

    expect(
      within(callout).getByTestId("custom-scenario-actuals-export-filename-0"),
    ).toHaveTextContent("quickbooks-2026Q1.csv");

    const dateNode = within(callout).getByTestId(
      "custom-scenario-actuals-export-date-0",
    );
    expect(dateNode).toHaveTextContent(/uploaded\s+\w+\s+\d+/i);
  });

  it("points the replace-export link at the wizard's school-profile step with the focus hint", async () => {
    const user = userEvent.setup();
    renderCard({ replaceExportHref: "/model/42?step=2&focus=accounting-export" });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));

    const link = screen.getByTestId("custom-scenario-actuals-replace-export-0");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute(
      "href",
      "/model/42?step=2&focus=accounting-export",
    );
  });

  it("hides the callout when no suggestion field came from the export", async () => {
    const user = userEvent.setup();
    const nonExportSuggestion: ActualsSuggestion = {
      values: { revenueActual: 480_000 },
      sources: { revenueActual: "From your prior-year snapshot" },
      sourceLabels: ["From your prior-year snapshot"],
      contributors: {},
    };
    renderCard({ suggestion: nonExportSuggestion });
    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));

    expect(
      screen.queryByTestId("custom-scenario-actuals-export-source-0"),
    ).not.toBeInTheDocument();
  });

  it("renders the callout without a date node when uploadedAt is missing", async () => {
    const user = userEvent.setup();
    renderCard({
      exportInfo: { filename: "books.csv" },
      suggestion: {
        values: { revenueActual: 100 },
        sources: { revenueActual: "From books.csv" },
        sourceLabels: ["From books.csv"],
        contributors: {},
      },
    });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));

    const callout = screen.getByTestId("custom-scenario-actuals-export-source-0");
    expect(callout).toHaveTextContent("books.csv");
    expect(
      screen.queryByTestId("custom-scenario-actuals-export-date-0"),
    ).not.toBeInTheDocument();
  });
});
