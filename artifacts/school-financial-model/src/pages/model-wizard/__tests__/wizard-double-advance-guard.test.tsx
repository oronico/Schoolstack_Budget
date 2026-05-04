import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Task #454 follow-up: regression guard for the wizard "Continue"
// double-advance race the architect flagged. The previous implementation
// cleared `advancingRef` in `finally` immediately after `setCurrentStep`
// was queued, which is BEFORE React's commit phase — a synchronous second
// click landing in that window would re-enter handleNext with a stale
// ref and fire `setCurrentStep(s => s + 1)` a second time, advancing
// two steps from a single user-perceived "double click".
//
// The strengthened guard adds (a) a commit-watching useEffect that
// releases the ref only after React commits the new step, and (b) a
// `startedFromStep` snapshot that gates the functional updater on
// identity equality so even a stale re-fire is at worst a no-op. This
// test fires two synchronous click events on Continue and asserts
// the wizard advances exactly one step.

vi.mock("@workspace/api-client-react", () => {
  const initialData = {
    id: 99,
    name: "Guard Test School",
    currentStep: 1,
    data: {
      schoolProfile: {
        // Story step's validateStep only requires schoolName + schoolType,
        // both supplied here so the click sequence advances cleanly.
        schoolName: "Guard Test School",
        schoolType: "private_school",
        state: "MA",
        fiscalYearStartMonth: 7,
        schoolStage: "yet_to_launch",
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

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    // persona fields are required so FounderPersonaPrompt early-returns
    // and the wizard chrome (Continue button + step indicator) actually
    // mounts. Without these the prompt overlays the wizard and Continue
    // is never clickable.
    user: {
      id: 1,
      email: "founder@test.school",
      name: "Founder",
      personaStage: "yet_to_launch",
      personaComfort: "comfortable",
      guidanceLevel: "balanced",
    },
    isLoading: false,
    login: () => {},
    logout: () => {},
    refetchUser: async () => {},
  });
  return { useAuth: ctx, useOptionalAuth: ctx };
});

// Belt-and-braces: even if the persona fields above don't dismiss the
// prompt for some reason, mocking it to null guarantees the wizard
// chrome renders. This test only exercises the Continue guard, not the
// persona-prompt UX.
vi.mock("@/components/coaching/FounderPersonaPrompt", () => ({
  FounderPersonaPrompt: () => null,
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

import { ModelWizardPage } from "../index";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom warns on smooth-scroll if window.scrollTo isn't a function.
  window.scrollTo = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderWizard() {
  const { hook, searchHook } = memoryLocation({
    path: "/model/99",
    searchPath: "step=1",
    static: true,
  });
  return render(
    <Router hook={hook} searchHook={searchHook}>
      <ModelWizardPage />
    </Router>,
  );
}

describe("ModelWizardPage — Continue double-advance guard", () => {
  it("two synchronous Continue clicks only advance one step", async () => {
    renderWizard();

    // Wait for the wizard to mount on Story (step 1). The Continue
    // button is named "Continue" via aria-label / text.
    const continueBtn = await waitFor(
      () => {
        const buttons = screen.getAllByRole("button");
        const btn = buttons.find(
          b => /^Continue/i.test(b.textContent || ""),
        );
        if (!btn) throw new Error("Continue button not yet rendered");
        return btn as HTMLButtonElement;
      },
      { timeout: 4000 },
    );

    // Find the step indicator so we can read the committed step number.
    // The wizard renders "Step N of M" somewhere in the chrome.
    const readStep = (): number => {
      const match = document.body.textContent?.match(/Step\s+(\d+)\s+of\s+\d+/i);
      if (!match) throw new Error("Could not find 'Step N of M' indicator");
      return parseInt(match[1]!, 10);
    };

    expect(readStep()).toBe(1);

    // Fire two synchronous click events on Continue. Without the guard,
    // both handleNext invocations would advance the step (1→2→3). With
    // the guard, the second click's handleNext bails on the ref check
    // OR the functional updater's identity check, so only one advance
    // is committed.
    await act(async () => {
      fireEvent.click(continueBtn);
      fireEvent.click(continueBtn);
      // Let any pending microtasks (validateStep is async) settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    // After settling, the wizard should be on step 2 — never 3. If this
    // test ever fails with `committed === 3`, the guard has regressed.
    await waitFor(
      () => {
        const committed = readStep();
        expect(committed).toBe(2);
      },
      { timeout: 2000 },
    );
  });

  it("a third click after the first advance lands on step 3, proving the guard releases after commit", async () => {
    renderWizard();

    const continueBtn = await waitFor(
      () => {
        const buttons = screen.getAllByRole("button");
        const btn = buttons.find(
          b => /^Continue/i.test(b.textContent || ""),
        );
        if (!btn) throw new Error("Continue button not yet rendered");
        return btn as HTMLButtonElement;
      },
      { timeout: 4000 },
    );

    const readStep = (): number => {
      const match = document.body.textContent?.match(/Step\s+(\d+)\s+of\s+\d+/i);
      if (!match) throw new Error("Could not find 'Step N of M' indicator");
      return parseInt(match[1]!, 10);
    };

    expect(readStep()).toBe(1);

    // First advance: 1 → 2.
    await act(async () => {
      fireEvent.click(continueBtn);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(readStep()).toBe(2));

    // Re-query Continue button — School Profile step renders a new one.
    const continueBtn2 = await waitFor(
      () => {
        const buttons = screen.getAllByRole("button");
        const btn = buttons.find(
          b => /^Continue/i.test(b.textContent || ""),
        );
        if (!btn) throw new Error("Continue button on step 2 not rendered");
        return btn as HTMLButtonElement;
      },
      { timeout: 4000 },
    );

    // Second advance: 2 → 3. This proves the commit-watching effect
    // released the guard cleanly — if it didn't, this click would be
    // dropped and the assertion below would time out.
    await act(async () => {
      fireEvent.click(continueBtn2);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(readStep()).toBe(3), { timeout: 2000 });
  });
});
