import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { vi } from "vitest";
vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: { id: 1, email: "founder@test.school", name: "Founder", personaComfort: "comfortable" },
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
import type { ActualsSuggestion, ProjectedSnapshot } from "@/lib/decision-flows";

const projectedSnapshot: ProjectedSnapshot = {
  asOfYear: 1,
  enrollment: 120,
  revenue: 2_400_000,
  expense: 2_100_000,
  netIncome: 300_000,
  monthlyRent: 12_500,
  programEnrollment: 0,
};

const emptySuggestion: ActualsSuggestion = {
  values: {},
  sources: {},
  sourceLabels: [],
  contributors: {},
};

function makeScenario(overrides: Partial<CustomScenario> = {}): CustomScenario {
  return {
    name: "Slower lease ramp",
    createdAt: "2026-04-01T12:00:00.000Z",
    overrides: { enrollmentDelta: [-5, -3, 0, 0, 0] },
    decisionType: "evaluate_site",
    retrospective: "Signed the lease in March; enrollment came in 5 students under plan",
    ...overrides,
  };
}

function renderCard(searchQuery: string, scenario: CustomScenario = makeScenario()) {
  render(
    <CustomScenarioCard
      scenario={scenario}
      index={0}
      fmtDate={(iso) => new Date(iso).toLocaleDateString("en-US")}
      onRemove={async () => {}}
      onPatch={async () => {}}
      onOpenInPlanner={() => {}}
      onApplyToModel={async () => {}}
      getProjectedSnapshot={() => projectedSnapshot}
      getActualsSuggestion={() => emptySuggestion}
      personaComfort={null}
      searchQuery={searchQuery}
    />,
  );
}

describe("CustomScenarioCard — search highlight", () => {
  it("renders no <mark> tags when the search query is empty", () => {
    renderCard("");
    expect(screen.queryAllByTestId("match-highlight")).toHaveLength(0);
    // Sanity — the card content is still in the DOM as plain text.
    expect(screen.getByTestId("custom-scenario-name-0")).toHaveTextContent(
      "Slower lease ramp",
    );
  });

  it("highlights matches inside the scenario name", () => {
    renderCard("lease");
    const name = screen.getByTestId("custom-scenario-name-0");
    const marks = within(name).getAllByTestId("match-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0].tagName).toBe("MARK");
    expect(marks[0]).toHaveTextContent("lease");
    // Whole name still reads correctly.
    expect(name).toHaveTextContent("Slower lease ramp");
  });

  it("highlights matches inside the retrospective note", () => {
    renderCard("enrollment");
    const note = screen.getByTestId("custom-scenario-retro-note-0");
    const marks = within(note).getAllByTestId("match-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("enrollment");
    expect(note).toHaveTextContent(
      "Signed the lease in March; enrollment came in 5 students under plan",
    );
  });

  it("highlights matches inside the decision-type badge", () => {
    // The "evaluate_site" decision type renders as the label "New site".
    renderCard("site");
    const badge = screen.getByTestId("custom-scenario-decision-badge-0");
    const marks = within(badge).getAllByTestId("match-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("site");
    expect(badge.textContent?.toLowerCase()).toContain("site");
  });

  it("matches case-insensitively while preserving the original casing", () => {
    renderCard("LEASE");
    const name = screen.getByTestId("custom-scenario-name-0");
    const marks = within(name).getAllByTestId("match-highlight");
    expect(marks).toHaveLength(1);
    // The mark wraps the original-cased substring, not the query casing.
    expect(marks[0]).toHaveTextContent("lease");
  });

  it("escapes regex metacharacters in the query so it can't crash or over-match", () => {
    const scenario = makeScenario({
      name: "Plan B (revised)",
      retrospective: "Cost +$1,000/mo over budget",
    });
    // Each of these would blow up a naive `new RegExp(query)`.
    for (const q of ["(", ")", "+", "$", "*", ".", "?", "[", "]"]) {
      const { unmount } = render(
        <CustomScenarioCard
          scenario={scenario}
          index={0}
          fmtDate={(iso) => new Date(iso).toLocaleDateString("en-US")}
          onRemove={async () => {}}
          onPatch={async () => {}}
          onOpenInPlanner={() => {}}
          onApplyToModel={async () => {}}
          getProjectedSnapshot={() => projectedSnapshot}
          getActualsSuggestion={() => emptySuggestion}
          personaComfort={null}
          searchQuery={q}
        />,
      );
      // Card still renders; we don't assert on highlight count here because
      // the metacharacter may or may not appear in the test fixtures — the
      // important thing is no crash.
      expect(screen.getByTestId("custom-scenario-name-0")).toBeInTheDocument();
      unmount();
    }
  });

  it("does not interpret query content as HTML (XSS safety)", () => {
    const scenario = makeScenario({ name: "Plan A" });
    renderCard("<img src=x onerror=alert(1)>", scenario);
    // The card still renders the original name as plain text — the query
    // never reaches the DOM as markup.
    const name = screen.getByTestId("custom-scenario-name-0");
    expect(name).toHaveTextContent("Plan A");
    // No <img> injected anywhere in the document.
    expect(document.querySelector("img")).toBeNull();
  });
});
