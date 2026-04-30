import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import {
  isYetToLaunch,
  shouldShowActualsSurfaces,
  getPersonaTone,
  getFounderPersona,
} from "@/lib/coaching/founder-persona";

// Words/phrases that yet-to-launch founders should NEVER see anywhere in the
// wizard. Task #302 explicitly forbids actuals/prior-year/QuickBooks/variance
// language for the pre-opening persona — it sets the wrong expectations and
// surfaces tooling for books they don't have yet.
const FORBIDDEN_TERMS = [
  /actuals?/i,
  /prior[\s-]?year/i,
  /quickbooks/i,
  /variance/i,
  /forecast accuracy/i,
];

function expectNoForbiddenTerms(text: string, label: string): void {
  for (const re of FORBIDDEN_TERMS) {
    if (re.test(text)) {
      const idx = text.search(re);
      const window = text.slice(Math.max(0, idx - 40), idx + 60);
      throw new Error(
        `${label} unexpectedly contains forbidden term ${re}: …${window}…`,
      );
    }
  }
}

describe("founder-persona helpers", () => {
  it("isYetToLaunch returns true only when stage is yet_to_launch", () => {
    expect(isYetToLaunch({ personaStage: "yet_to_launch" } as never)).toBe(true);
    expect(isYetToLaunch({ personaStage: "existing" } as never)).toBe(false);
    expect(isYetToLaunch({ personaStage: null } as never)).toBe(false);
    expect(isYetToLaunch(null)).toBe(false);
    expect(isYetToLaunch(undefined)).toBe(false);
  });

  it("shouldShowActualsSurfaces hides surfaces only for yet_to_launch", () => {
    expect(shouldShowActualsSurfaces({ personaStage: "yet_to_launch" } as never)).toBe(false);
    // Defaults to showing for existing, unknown, and legacy users so we never
    // accidentally hide surfaces from operating schools that need them.
    expect(shouldShowActualsSurfaces({ personaStage: "existing" } as never)).toBe(true);
    expect(shouldShowActualsSurfaces(null)).toBe(true);
    expect(shouldShowActualsSurfaces(undefined)).toBe(true);
  });

  it("getFounderPersona reads stage and comfort from the user payload", () => {
    expect(
      getFounderPersona({
        personaStage: "yet_to_launch",
        personaComfort: "new_to_budgeting",
      } as never),
    ).toEqual({ stage: "yet_to_launch", comfort: "new_to_budgeting" });
    expect(getFounderPersona(null)).toEqual({ stage: null, comfort: null });
  });

  it("getPersonaTone for yet_to_launch + new_to_budgeting uses plain-English copy", () => {
    const tone = getPersonaTone({
      personaStage: "yet_to_launch",
      personaComfort: "new_to_budgeting",
    } as never);
    expect(tone.greeting("Maya")).toContain("Maya");
    // Critically: tone copy itself must not use any forbidden term either.
    const all = `${tone.greeting("Maya")} ${tone.emptyStateTitle} ${tone.emptyStateBody} ${tone.newModelCta}`;
    expectNoForbiddenTerms(all, "yet_to_launch + new_to_budgeting tone");
  });

  it("getPersonaTone for yet_to_launch + comfortable also avoids forbidden terms", () => {
    const tone = getPersonaTone({
      personaStage: "yet_to_launch",
      personaComfort: "comfortable",
    } as never);
    const all = `${tone.greeting("Maya")} ${tone.emptyStateTitle} ${tone.emptyStateBody} ${tone.newModelCta}`;
    expectNoForbiddenTerms(all, "yet_to_launch + comfortable tone");
  });
});

// The wizard render checks below mount the real ModelWizardPage with a
// `yet_to_launch` user and a brand-new model whose seeded `schoolStage` is
// `new_school`. We then sweep the rendered text for any of the FORBIDDEN
// terms — this catches regressions where someone adds an actuals/QuickBooks
// callout to a step without persona-gating it.

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      email: "founder@test.school",
      name: "Maya",
      personaStage: "yet_to_launch",
      personaComfort: "new_to_budgeting",
      guidanceLevel: "extra",
    },
    isLoading: false,
    login: () => {},
    logout: () => {},
    refetchUser: async () => {},
  }),
}));

vi.mock("@/components/layout/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "test-layout" }, children),
}));
vi.mock("@/components/whatif/WhatIfTrigger", () => ({
  WhatIfTrigger: () => null,
}));
vi.mock("@/components/coaching/MicroLessonCard", () => ({
  MicroLessonContainer: () => null,
  MicroLessonCardInner: () => null,
}));
vi.mock("@/components/coaching/WizardPrepChecklist", () => ({
  WizardPrepChecklist: () => null,
}));
vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: () => {}, dismiss: () => {} }),
}));

vi.mock("@workspace/api-client-react", () => {
  const initialData = {
    id: 99,
    name: "Future Academy",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "Future Academy",
        schoolType: "private_school",
        state: "MA",
        fiscalYearStartMonth: 7,
        // The yet_to_launch persona always seeds new_school here — this is the
        // condition that hides the prior-year/actuals/QuickBooks panels.
        schoolStage: "new_school",
      },
    },
  };
  return {
    useGetModel: () => ({
      data: initialData,
      isLoading: false,
      isError: false,
      refetch: () => Promise.resolve({ data: initialData }),
    }),
    useUpdateModel: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(async () => initialData),
      isPending: false,
    }),
  };
});

import { ModelWizardPage } from "../index";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function renderWizardAtStep(step: number): Promise<HTMLElement> {
  const { hook, searchHook } = memoryLocation({
    path: "/model/99",
    searchPath: `step=${step}`,
    static: true,
  });
  const { container } = render(
    <Router hook={hook} searchHook={searchHook}>
      <ModelWizardPage />
    </Router>,
  );
  // Wait for the lazy step (Expense, Review, etc.) to actually mount.
  await waitFor(
    () => {
      expect(container.textContent?.length ?? 0).toBeGreaterThan(200);
    },
    { timeout: 4000 },
  );
  return container;
}

describe("ModelWizardPage — yet_to_launch founder", () => {
  it("step 2 (School Details) hides prior-year/actuals/QuickBooks panels", async () => {
    const container = await renderWizardAtStep(2);
    expectNoForbiddenTerms(container.textContent || "", "Wizard step 2");
  });

  it("step 6 (Expenses) drops the QuickBooks/Xero name-drop in the Chart of Accounts callout", async () => {
    const container = await renderWizardAtStep(6);
    // We allow "Xero" in the comfortable persona, but yet_to_launch must not
    // see either accounting-software brand. Sweep everything.
    const text = container.textContent || "";
    expectNoForbiddenTerms(text, "Wizard step 6");
    expect(text).not.toMatch(/xero/i);
  });

  it("step 9 (Review) suppresses the budget-to-books / variance lesson", async () => {
    const container = await renderWizardAtStep(9);
    const text = container.textContent || "";
    expectNoForbiddenTerms(text, "Wizard step 9");
    // The lesson card itself is gated — it should never render for this user.
    expect(container.querySelector('[data-testid="budget-to-books-lesson"]')).toBeNull();
  });
});
