import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
  exportInfo?: { filename?: string; uploadedAt?: string } | null;
  replaceExportHref?: string;
  suggestion?: ActualsSuggestion;
  onRemoveExport?: () => Promise<void>;
} = {}) {
  const scenario = props.scenario ?? makeScenario();
  const onPatch = vi.fn(async () => {});
  const onRemove = vi.fn(async () => {});
  const onOpenInPlanner = vi.fn();
  const onApplyToModel = vi.fn(async () => {});
  const getProjectedSnapshot = vi.fn(() => projectedSnapshot);
  const getActualsSuggestion = vi.fn(() => props.suggestion ?? exportSuggestion);
  const onRemoveExport = props.onRemoveExport;
  const exportInfo =
    props.exportInfo === undefined
      ? { filename: "quickbooks-2026Q1.csv", uploadedAt: "2026-03-14T15:30:00.000Z" }
      : props.exportInfo === null
        ? undefined
        : props.exportInfo;
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
      accountingExportInfo={exportInfo}
      replaceExportHref={
        props.replaceExportHref ?? "/model/42?step=2&focus=accounting-export"
      }
      onRemoveExport={onRemoveExport}
    />,
  );
  return { onPatch, onRemove, onOpenInPlanner, onApplyToModel, onRemoveExport };
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

describe("CustomScenarioCard — upload-removed inline notice (Task #288)", () => {
  // Helper: render a card via React Testing Library's `rerender` so we can
  // simulate the parent dropping `accountingExportInfo` after the founder
  // confirms the remove (which is what the real scenarios page does once
  // the export is cleared from server state).
  function renderRemovableCard(props: {
    suggestion?: ActualsSuggestion;
    initialExport?: { filename?: string; uploadedAt?: string };
  } = {}) {
    const onPatch = vi.fn(async () => {});
    const onRemove = vi.fn(async () => {});
    const onOpenInPlanner = vi.fn();
    const onApplyToModel = vi.fn(async () => {});
    const getProjectedSnapshot = vi.fn(() => projectedSnapshot);
    const getActualsSuggestion = vi.fn(() => props.suggestion ?? exportSuggestion);
    const onRemoveExport = vi.fn(async () => {});
    const initialExport = props.initialExport ?? {
      filename: "quickbooks-2026Q1.csv",
      uploadedAt: "2026-03-14T15:30:00.000Z",
    };
    const renderWith = (
      exportInfo: { filename?: string; uploadedAt?: string } | undefined,
    ) => (
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
        onRemoveExport={onRemoveExport}
      />
    );
    const utils = render(renderWith(initialExport));
    return {
      ...utils,
      rerenderWithoutExport: () => utils.rerender(renderWith(undefined)),
      onPatch,
      onRemoveExport,
    };
  }

  it("surfaces a dismissable inline notice when the upload is removed mid-edit", async () => {
    const user = userEvent.setup();
    const { rerenderWithoutExport } = renderRemovableCard();

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));

    // No notice yet — the upload is still attached.
    expect(
      screen.queryByTestId("custom-scenario-actuals-upload-removed-notice-0"),
    ).not.toBeInTheDocument();

    // Parent drops the export (mirrors the real onRemoveExport handler
    // clearing the server-side accounting export).
    rerenderWithoutExport();

    const notice = screen.getByTestId(
      "custom-scenario-actuals-upload-removed-notice-0",
    );
    expect(notice).toHaveTextContent(
      /upload removed.*editable as plain entries/i,
    );

    // Dismiss button hides the notice without reopening anything.
    await user.click(
      screen.getByTestId("custom-scenario-actuals-upload-removed-dismiss-0"),
    );
    expect(
      screen.queryByTestId("custom-scenario-actuals-upload-removed-notice-0"),
    ).not.toBeInTheDocument();
  });

  it("clears the 'Suggested' pill on previously book-sourced fields after removal", async () => {
    const user = userEvent.setup();
    const { rerenderWithoutExport } = renderRemovableCard();

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));

    // Sanity-check: book-sourced fields render with a "Suggested" pill
    // before removal (one pill per book-sourced field — three in our
    // suggestion fixture: revenue, expense, net income).
    expect(
      screen.getByTestId("custom-scenario-actuals-revenue-0-suggested"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("custom-scenario-actuals-expense-0-suggested"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("custom-scenario-actuals-netincome-0-suggested"),
    ).toBeInTheDocument();

    rerenderWithoutExport();

    // After the upload is dropped the pills should be gone — the UI no
    // longer claims a books-sourced provenance the export can't back.
    expect(
      screen.queryByTestId("custom-scenario-actuals-revenue-0-suggested"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("custom-scenario-actuals-expense-0-suggested"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("custom-scenario-actuals-netincome-0-suggested"),
    ).not.toBeInTheDocument();

    // The "Pulled from your books" callout should have disappeared too
    // (this is the existing behaviour we're complementing, not changing).
    expect(
      screen.queryByTestId("custom-scenario-actuals-export-source-0"),
    ).not.toBeInTheDocument();
  });

  it("auto-clears the notice on save", async () => {
    const user = userEvent.setup();
    const { rerenderWithoutExport, onPatch } = renderRemovableCard();

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));
    rerenderWithoutExport();

    expect(
      screen.getByTestId("custom-scenario-actuals-upload-removed-notice-0"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("custom-scenario-actuals-save-0"));
    expect(onPatch).toHaveBeenCalled();
    expect(
      screen.queryByTestId("custom-scenario-actuals-upload-removed-notice-0"),
    ).not.toBeInTheDocument();
  });

  it("auto-clears the notice on cancel", async () => {
    const user = userEvent.setup();
    const { rerenderWithoutExport } = renderRemovableCard();

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));
    rerenderWithoutExport();

    expect(
      screen.getByTestId("custom-scenario-actuals-upload-removed-notice-0"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("custom-scenario-actuals-cancel-0"));
    expect(
      screen.queryByTestId("custom-scenario-actuals-upload-removed-notice-0"),
    ).not.toBeInTheDocument();
  });

  it("does not surface the notice on initial mount when no upload was ever attached", async () => {
    const user = userEvent.setup();
    renderCard({ exportInfo: null });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));

    expect(
      screen.queryByTestId("custom-scenario-actuals-upload-removed-notice-0"),
    ).not.toBeInTheDocument();
  });
});

describe("CustomScenarioCard — uploaded export controls panel", () => {
  it("shows the uploaded-export controls panel as soon as the editor opens (no suggest click required)", async () => {
    const user = userEvent.setup();
    renderCard({ onRemoveExport: vi.fn(async () => {}) });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));

    const panel = screen.getByTestId("custom-scenario-actuals-export-controls-0");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(/Uploaded export/i);
    expect(
      within(panel).getByTestId("custom-scenario-actuals-export-controls-filename-0"),
    ).toHaveTextContent("quickbooks-2026Q1.csv");
    expect(panel).toHaveTextContent(/uploaded\s+\w+\s+\d+/i);
  });

  it("hides the controls panel when no upload exists on the model", async () => {
    const user = userEvent.setup();
    renderCard({ exportInfo: null });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));

    expect(
      screen.queryByTestId("custom-scenario-actuals-export-controls-0"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("custom-scenario-actuals-remove-export-0"),
    ).not.toBeInTheDocument();
  });

  it("requires a confirmation step before invoking onRemoveExport", async () => {
    const user = userEvent.setup();
    const onRemoveExport = vi.fn(async () => {});
    renderCard({ onRemoveExport });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-remove-export-0"));

    // First click only opens the confirmation prompt — no removal yet.
    expect(onRemoveExport).not.toHaveBeenCalled();
    expect(
      screen.getByTestId("custom-scenario-actuals-remove-export-confirm-prompt-0"),
    ).toHaveTextContent(/remove this upload/i);

    // Cancel returns to the default state without removing.
    await user.click(screen.getByTestId("custom-scenario-actuals-remove-export-cancel-0"));
    expect(onRemoveExport).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("custom-scenario-actuals-remove-export-confirm-0"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("custom-scenario-actuals-remove-export-0"),
    ).toBeInTheDocument();

    // Re-arm and confirm — now onRemoveExport fires exactly once.
    await user.click(screen.getByTestId("custom-scenario-actuals-remove-export-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-remove-export-confirm-0"));
    expect(onRemoveExport).toHaveBeenCalledTimes(1);
  });

  it("hides the remove button when the page didn't pass an onRemoveExport handler", async () => {
    const user = userEvent.setup();
    renderCard({ onRemoveExport: undefined });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));

    expect(
      screen.getByTestId("custom-scenario-actuals-export-controls-0"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("custom-scenario-actuals-remove-export-0"),
    ).not.toBeInTheDocument();
    // Replace link still shown so founders can swap uploads via the wizard.
    expect(
      screen.getByTestId("custom-scenario-actuals-replace-export-0"),
    ).toBeInTheDocument();
  });
});
