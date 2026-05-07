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

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
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
  });
  return { useAuth: ctx, useOptionalAuth: ctx };
});

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

// Task #594: the model's `schoolStage` is mutable per-test so we can verify
// that toggling a model to `operating_school` surfaces the operating-school
// panels for a `yet_to_launch` founder (i.e. structural gating follows the
// model, not the persona). The default seed remains `new_school` so the
// forbidden-term sweeps below stay green for the original persona scenarios.
const modelStageHolder = vi.hoisted(() => ({
  schoolStage: "new_school" as "new_school" | "operating_school",
  operatingYear: undefined as undefined | "first_year" | "second_year_plus",
}));

vi.mock("@workspace/api-client-react", () => {
  // Cache the built model and only rebuild when the holder values
  // change between tests. Returning a fresh object reference on every
  // `useGetModel` call would trigger infinite re-renders in any wizard
  // effect that depends on `data`, which previously OOM-ed the worker.
  let cachedKey = "";
  let cachedModel: ReturnType<typeof buildModel> | null = null;
  const buildModel = () => ({
    id: 99,
    name: "Future Academy",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "Future Academy",
        schoolType: "private_school",
        state: "MA",
        fiscalYearStartMonth: 7,
        schoolStage: modelStageHolder.schoolStage,
        ...(modelStageHolder.operatingYear
          ? { operatingYear: modelStageHolder.operatingYear }
          : {}),
      },
      // Seed a single program so the EnrollmentStep matrix table renders
      // when this test fixture is used to verify operating-school
      // surfaces (the table only mounts once `programs` is non-empty).
      programs: [
        {
          id: "prog_seed",
          name: "Full Day",
          annualTuition: 10000,
          priorYear: 0,
          currentYear: 0,
          year1: 0,
          year2: 0,
          year3: 0,
          year4: 0,
          year5: 0,
        },
      ],
    },
  });
  const getModel = () => {
    const key = `${modelStageHolder.schoolStage}|${modelStageHolder.operatingYear ?? ""}`;
    if (key !== cachedKey || cachedModel === null) {
      cachedKey = key;
      cachedModel = buildModel();
    }
    return cachedModel;
  };
  return {
    useGetModel: () => {
      const data = getModel();
      return {
        data,
        isLoading: false,
        isError: false,
        refetch: () => Promise.resolve({ data }),
      };
    },
    useUpdateModel: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(async () => getModel()),
      isPending: false,
    }),
  };
});

import { ModelWizardPage } from "../index";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // Reset the per-test model-stage holder so each test starts from the
  // default `new_school` seed unless it explicitly opts in to the
  // `operating_school` scenario.
  modelStageHolder.schoolStage = "new_school";
  modelStageHolder.operatingYear = undefined;
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

  // Task #593: stage belongs to the model, not the persona. Even a
  // yet_to_launch founder must see BOTH stage options on School Profile
  // so a planned-school-that-opens (or a consultant managing multiple
  // schools) can mark a model as Already Operating without changing
  // their account-wide persona. The previous gate hid the toggle and
  // silently force-reset saved operating_school models — both removed.
  it("step 2 shows both stage options to a yet_to_launch founder", async () => {
    const container = await renderWizardAtStep(2);
    const newSchoolBtn = container.querySelector(
      '[data-testid="school-stage-option-new_school"]',
    );
    const operatingBtn = container.querySelector(
      '[data-testid="school-stage-option-operating_school"]',
    );
    expect(newSchoolBtn).not.toBeNull();
    expect(operatingBtn).not.toBeNull();
    expect(newSchoolBtn?.textContent).toMatch(/New School/i);
    expect(operatingBtn?.textContent).toMatch(/Already Operating/i);
  });

  it("step 4 (Revenue) reframes the source picker for opening-year founders", async () => {
    const container = await renderWizardAtStep(4);
    const text = container.textContent || "";
    // No actuals/prior-year/variance/QuickBooks language anywhere in the
    // Revenue step copy, including the per-pupil ADA ratio annotations.
    expectNoForbiddenTerms(text, "Wizard step 4");
    // Defensive: the "(adjusted for X% attendance ratio)" annotation on the
    // Y1 per-pupil estimate card depends on prior-year ADA data the founder
    // can never enter. It must never render for this persona, even if a
    // future code path tries to surface a non-1.0 default ratio.
    expect(text).not.toMatch(/attendance ratio/i);
    // The "ADA inputs are configured…" clause in the Assumptions-step
    // pointer also references inputs hidden from this persona — it should
    // be dropped from the copy.
    expect(text).not.toMatch(/ADA inputs/);
  });

  it("step 5 (Staffing) softens the roster + benchmark callouts to opening-year framing", async () => {
    const container = await renderWizardAtStep(5);
    const text = container.textContent || "";
    expectNoForbiddenTerms(text, "Wizard step 5");
  });

  it("step 6 (Expenses) drops the QuickBooks/Xero name-drop in the Chart of Accounts callout", async () => {
    const container = await renderWizardAtStep(6);
    // We allow "Xero" in the comfortable persona, but yet_to_launch must not
    // see either accounting-software brand. Sweep everything.
    const text = container.textContent || "";
    expectNoForbiddenTerms(text, "Wizard step 6");
    expect(text).not.toMatch(/xero/i);
  });

  it("step 8 (Assumptions & Sensitivity) hides the prior-year ADA inputs and softens the dial-tuning copy", async () => {
    const container = await renderWizardAtStep(8);
    const text = container.textContent || "";
    expectNoForbiddenTerms(text, "Wizard step 8");
    // Defensive: the prior-year ADM/ADA inputs should never render for this
    // persona. Their input ids would only mount when the gate opens.
    expect(text).not.toMatch(/Prior-Year ADM/i);
    expect(text).not.toMatch(/Prior-Year ADA/i);
  });

  it("step 9 (Review) suppresses the budget-to-books / variance lesson", async () => {
    const container = await renderWizardAtStep(9);
    const text = container.textContent || "";
    expectNoForbiddenTerms(text, "Wizard step 9");
    // The lesson card itself is gated — it should never render for this user.
    expect(container.querySelector('[data-testid="budget-to-books-lesson"]')).toBeNull();
  });
});

// Task #594: structural gating across the wizard must follow the *model's*
// `schoolStage`, not the founder's account-wide persona. This block keeps
// the same yet_to_launch / new_to_budgeting founder mocked above but flips
// the underlying model to `operating_school` + `second_year_plus` and
// verifies that operating-school surfaces (prior-year / current-year
// columns on Enrollment, prior-year ADM/ADA inputs on Assumptions) are now
// rendered. Before #594 these were silently hidden behind a persona check.
describe("ModelWizardPage — yet_to_launch founder with an operating-school model", () => {
  beforeEach(() => {
    modelStageHolder.schoolStage = "operating_school";
    modelStageHolder.operatingYear = "second_year_plus";
  });

  it("step 3 (Enrollment) surfaces prior-year + current-year columns", async () => {
    const container = await renderWizardAtStep(3);
    const text = container.textContent || "";
    // The Enrollment column header strings include "(Prior)" and
    // "(Current)" markers that only render when showPriorYear /
    // showCurrentYear are true. Those gates now follow schoolStage.
    expect(text).toMatch(/\(Prior\)/);
    expect(text).toMatch(/\(Current\)/);
  });
});
