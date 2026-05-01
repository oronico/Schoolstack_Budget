import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
import type { CustomScenario } from "@/pages/model-wizard/schema";
import type {
  ActualsSuggestion,
  ProjectedSnapshot,
} from "@/lib/decision-flows";

// Lock in the "From <provider> tag <name>" subtitle the actuals editor
// renders on the enrollment row whenever `liveSnapshot.enrollment` was
// the source of the suggestion. The subtitle's text + tooltip are the
// only signal the founder gets that the count came from a live sync
// rather than a typed-in prior-year value, so a silent regression here
// would land them back at "is this number current?".

function makeScenario(overrides: Partial<CustomScenario> = {}): CustomScenario {
  return {
    name: "FY26 enrollment plan",
    createdAt: "2026-03-01T12:00:00.000Z",
    overrides: { enrollmentDelta: [0, 0, 0, 0, 0] },
    decisionType: "change_enrollment",
    outcomeStatus: "pursued",
    outcomeUpdatedAt: "2026-03-15T12:00:00.000Z",
    ...overrides,
  };
}

const projectedSnapshot: ProjectedSnapshot = {
  asOfYear: 1,
  enrollment: 100,
  revenue: 1_000_000,
  expense: 900_000,
  netIncome: 100_000,
  monthlyRent: 0,
  programEnrollment: 0,
};

const liveLabel = "From QuickBooks tag 'Students FY26'";
const liveSuggestion: ActualsSuggestion = {
  values: { enrollmentActual: 82 },
  sources: { enrollmentActual: liveLabel },
  sourceLabels: [liveLabel],
  contributors: {},
};

function renderCard(props: { suggestion?: ActualsSuggestion } = {}) {
  const scenario = makeScenario();
  const onPatch = vi.fn(async () => {});
  const onRemove = vi.fn(async () => {});
  const onOpenInPlanner = vi.fn();
  const onApplyToModel = vi.fn(async () => {});
  const getProjectedSnapshot = vi.fn(() => projectedSnapshot);
  const getActualsSuggestion = vi.fn(
    () => props.suggestion ?? liveSuggestion,
  );
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
    />,
  );
}

describe("CustomScenarioCard — live-snapshot enrollment subtitle", () => {
  it("renders the From <provider> tag <name> subtitle after suggesting from a live sync", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));

    const subtitle = screen.getByTestId(
      "custom-scenario-actuals-enrollment-0-live-snapshot",
    );
    expect(subtitle).toBeInTheDocument();
    expect(
      within(subtitle).getByTestId(
        "custom-scenario-actuals-enrollment-0-live-snapshot-provider",
      ),
    ).toHaveTextContent("QuickBooks");
    expect(
      within(subtitle).getByTestId(
        "custom-scenario-actuals-enrollment-0-live-snapshot-tag",
      ),
    ).toHaveTextContent("Students FY26");
    // Tooltip points the founder at the AccountingConnectionCard so
    // they can disconnect the tag when they don't want it driving the
    // suggestion anymore.
    expect(subtitle).toHaveAttribute(
      "title",
      expect.stringContaining("Accounting Connection card") as unknown as string,
    );
    expect(subtitle.getAttribute("title")).toMatch(/QuickBooks/);
    expect(subtitle.getAttribute("title")).toMatch(/disconnect/i);
  });

  it("does not render the live-snapshot subtitle for prior-year sourced suggestions", async () => {
    const user = userEvent.setup();
    const priorSuggestion: ActualsSuggestion = {
      values: { enrollmentActual: 95 },
      sources: { enrollmentActual: "Prior-year actuals from setup" },
      sourceLabels: ["Prior-year actuals from setup"],
      contributors: {},
    };
    renderCard({ suggestion: priorSuggestion });

    await user.click(screen.getByTestId("custom-scenario-actuals-edit-0"));
    await user.click(screen.getByTestId("custom-scenario-actuals-suggest-0"));

    expect(
      screen.queryByTestId(
        "custom-scenario-actuals-enrollment-0-live-snapshot",
      ),
    ).not.toBeInTheDocument();
  });
});
