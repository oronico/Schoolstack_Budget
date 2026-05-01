import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, email: "founder@test.school", name: "Founder", guidanceLevel: "advanced" },
    isLoading: false,
    login: () => {},
    logout: () => {},
    refetchUser: async () => {},
  }),
}));
vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { CustomScenarioCard } from "../index";
import type {
  CustomScenario,
  CustomScenarioActuals,
} from "@/pages/model-wizard/schema";
import type {
  ActualsSuggestion,
  ProjectedSnapshot,
} from "@/lib/decision-flows";

// End-to-end behavior under test: a Pursued saved scenario whose model has
// an uploaded CSV export. The founder opens the actuals editor, clicks
// "Suggest from latest data", saves, and lands back in the read-only
// summary. The saved-actuals summary must render the same "Pulled from your
// books" caption the editor showed — that's the books-vs-typed provenance
// guarantee the source-label parser was added to support, and it spans
// `buildActualsSuggestion`, the editor's clear-on-edit / persist-on-save
// state machine, and the summary's `parseExportSourceLabel` re-render.

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

// Matches the label shape produced by the uploaded-CSV branch of
// `buildActualsSuggestion` ("From <filename> uploaded <Mon D>"), which is
// what `parseExportSourceLabel` keys off of in the saved-actuals summary.
const exportLabel = "From quickbooks-2026Q1.csv uploaded Mar 14";

const exportInfo = {
  filename: "quickbooks-2026Q1.csv",
  uploadedAt: "2026-03-14T15:30:00.000Z",
};

const allFromExport: ActualsSuggestion = {
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

interface RenderProps {
  scenario?: CustomScenario;
  suggestion?: ActualsSuggestion;
}

// Renders CustomScenarioCard with a controlled `scenario.actuals` so a
// save-then-reload cycle can be simulated by `reload()`: onPatch records
// the persisted shape, `reload()` re-renders the card with that shape as
// `scenario.actuals` (just like a page-refresh fetch from the server
// would).
function renderCardWithReload(props: RenderProps = {}) {
  let patched: CustomScenarioActuals | undefined;
  const onPatch = vi.fn(async (_target, updates: Partial<CustomScenario>) => {
    patched = updates.actuals;
  });
  const onRemove = vi.fn(async () => {});
  const onOpenInPlanner = vi.fn();
  const onApplyToModel = vi.fn(async () => {});
  const getProjectedSnapshot = vi.fn(() => projectedSnapshot);
  const getActualsSuggestion = vi.fn(() => props.suggestion ?? allFromExport);
  const initialScenario = props.scenario ?? makeScenario();

  const commonProps = {
    index: 0,
    fmtDate: (iso: string) => new Date(iso).toLocaleDateString("en-US"),
    onRemove,
    onPatch,
    onOpenInPlanner,
    onApplyToModel,
    getProjectedSnapshot,
    getActualsSuggestion,
    accountingExportInfo: exportInfo,
    replaceExportHref: "/model/42?step=2&focus=accounting-export",
  };

  const { rerender } = render(
    <CustomScenarioCard scenario={initialScenario} {...commonProps} />,
  );

  const reload = () => {
    rerender(
      <CustomScenarioCard
        scenario={{ ...initialScenario, actuals: patched }}
        {...commonProps}
      />,
    );
  };

  return { onPatch, reload, getPatched: () => patched };
}

describe("CustomScenarioCard — books-sourced provenance survives save and reload", () => {
  it("re-renders the 'Pulled from your books' caption (with filename + upload date) after Suggest → Save → reload", async () => {
    const user = userEvent.setup();
    const { reload, getPatched } = renderCardWithReload();

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-save-0"));

    // Sanity check: the per-field provenance the editor built should have
    // been forwarded into the persisted shape, otherwise no amount of
    // re-rendering would surface the caption.
    const saved = getPatched();
    expect(saved?.sourceByField?.revenueActual).toBe(exportLabel);
    expect(saved?.sourceByField?.expenseActual).toBe(exportLabel);
    expect(saved?.sourceByField?.netIncomeActual).toBe(exportLabel);

    // Re-render with the freshly saved actuals as the persisted prop.
    // This is the "reload" that the unit test for the parser couldn't
    // exercise — the read-only summary code path has to find the export
    // label and render the caption.
    reload();

    const caption = screen.getByTestId(
      "custom-scenario-actuals-summary-export-source-0",
    );
    expect(caption).toHaveTextContent(/Pulled from your books/i);
    expect(
      screen.getByTestId("custom-scenario-actuals-summary-export-filename-0"),
    ).toHaveTextContent("quickbooks-2026Q1.csv");
    expect(
      screen.getByTestId("custom-scenario-actuals-summary-export-date-0"),
    ).toHaveTextContent(/uploaded\s+Mar\s+14/i);
  });

  it("drops the export caption from the saved summary when the only books-sourced field is manually edited before save", async () => {
    const user = userEvent.setup();
    // One-field suggestion so editing that single field is enough to
    // remove every export-shaped source label from the persisted shape.
    // (The summary surfaces the caption when *any* saved field still
    // carries an export label, so a multi-field setup wouldn't isolate
    // the "manual edit clears provenance for the edited field"
    // guarantee.)
    const oneFieldFromExport: ActualsSuggestion = {
      values: { revenueActual: 480_000 },
      sources: { revenueActual: exportLabel },
      sourceLabels: [exportLabel],
      contributors: {},
    };
    const { reload, getPatched } = renderCardWithReload({
      suggestion: oneFieldFromExport,
    });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));

    // Manually overtype the prefilled value. `setActualsField` strips
    // the per-field source the moment a founder edits the input, so the
    // saved shape should no longer carry a books-sourced label for this
    // field.
    const revenueInput = screen.getByTestId("custom-scenario-actuals-revenue-0");
    await user.clear(revenueInput);
    await user.type(revenueInput, "500000");

    await user.click(screen.getByTestId("custom-scenario-actuals-save-0"));

    const saved = getPatched();
    expect(saved?.revenueActual).toBe(500_000);
    // sourceByField should have been pruned entirely — the only entry
    // (revenueActual) was stripped on edit, leaving nothing to persist.
    expect(saved?.sourceByField).toBeUndefined();

    reload();

    // No export-shaped label survived, so the read-only summary must
    // not claim books-sourced provenance.
    expect(
      screen.queryByTestId("custom-scenario-actuals-summary-export-source-0"),
    ).not.toBeInTheDocument();
  });
});
