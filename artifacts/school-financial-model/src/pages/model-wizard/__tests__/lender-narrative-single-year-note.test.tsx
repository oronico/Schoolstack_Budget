import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Stub the heavy ConsultantStep so the wizard shell can mount on the
// Consultant step without firing the consultant-analysis fetch. The note
// under test renders in the wizard shell *outside* the lazy step boundary,
// so a placeholder body is sufficient to assert against.
vi.mock("../steps/ConsultantStep", () => ({
  ConsultantStep: () => <div data-testid="consultant-step-stub" />,
}));

function buildModel(modelDuration: "single_year" | "five_year") {
  return {
    id: 42,
    name: "Test Academy",
    // currentStep=1 is overridden by the ?step=10 deep-link below; we keep it
    // small so we don't depend on the persisted-progress branch.
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "Test Academy",
        schoolType: "private",
        state: "MA",
        fiscalYearStartMonth: 7,
        schoolStage: "operating_school",
        modelDuration,
      },
    },
  };
}

let currentModel = buildModel("single_year");

vi.mock("@workspace/api-client-react", () => ({
  useGetModel: () => ({
    data: currentModel,
    isLoading: false,
    isError: false,
    refetch: () => Promise.resolve({ data: currentModel }),
  }),
  useUpdateModel: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(async () => currentModel),
    isPending: false,
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, email: "founder@test.school", name: "Founder" },
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

import { ModelWizardPage, computeVisibleSteps } from "../index";

function renderAt(modelDuration: "single_year" | "five_year") {
  currentModel = buildModel(modelDuration);
  const consultantStepId = computeVisibleSteps(undefined, modelDuration === "single_year")
    .findIndex(s => s.title === "Consultant") + 1;
  const { hook, searchHook } = memoryLocation({
    path: "/model/42",
    searchPath: `step=${consultantStepId}`,
    static: true,
  });
  return render(
    <Router hook={hook} searchHook={searchHook}>
      <ModelWizardPage />
    </Router>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ModelWizardPage — Lender Narrative single-year explainer note (task #463)", () => {
  it("renders the inline note on the Consultant step in single-year mode", async () => {
    renderAt("single_year");
    const note = await waitFor(
      () => screen.getByTestId("lender-narrative-single-year-note"),
      { timeout: 4000 },
    );
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/Lender Narrative/i);
    expect(screen.getByTestId("consultant-extend-to-five-year")).toBeInTheDocument();
  });

  it("opens the Extend-to-5-year modal when the inline button is clicked", async () => {
    renderAt("single_year");
    const button = await waitFor(
      () => screen.getByTestId("consultant-extend-to-five-year"),
      { timeout: 4000 },
    );
    // Modal title is not rendered until the button is clicked.
    expect(screen.queryByText(/Extend to a 5-year projection/i)).not.toBeInTheDocument();
    fireEvent.click(button);
    // ExtendToFiveYearModal's <h2> proves the wiring is intact. The wizard
    // can have other dialogs mounted (e.g. WhatIf, persona prompts) so we
    // target the modal by its labelledby title rather than role alone.
    const dialog = await waitFor(() =>
      screen.getByRole("dialog", { name: /Extend to a 5-year projection/i }),
    );
    expect(dialog).toBeInTheDocument();
    // The modal's primary CTA lives inside the dialog — scope the lookup so
    // we don't collide with the wizard's persistent "Extend to 5-year" banner
    // button that's also visible to single-year founders.
    expect(
      within(dialog).getByRole("button", { name: /Extend to 5-Year/i }),
    ).toBeInTheDocument();
  });

  it("does not render the note on the Consultant step in 5-year mode", async () => {
    renderAt("five_year");
    // Wait for the wizard to mount the consultant step so we know the
    // render pass that *would* have included the note has happened.
    await waitFor(
      () => expect(screen.getByTestId("consultant-step-stub")).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.queryByTestId("lender-narrative-single-year-note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("consultant-extend-to-five-year")).not.toBeInTheDocument();
  });
});
