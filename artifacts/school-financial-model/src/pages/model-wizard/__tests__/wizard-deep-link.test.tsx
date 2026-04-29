import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

vi.mock("@workspace/api-client-react", () => {
  const initialData = {
    id: 42,
    name: "Test Academy",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "Test Academy",
        schoolType: "private",
        state: "MA",
        fiscalYearStartMonth: 7,
        // The accounting-export uploader only renders for operating schools.
        schoolStage: "operating_school",
      },
      accountingExport: {
        filename: "quickbooks-2026Q1.csv",
        uploadedAt: "2026-03-14T15:30:00.000Z",
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

import { ModelWizardPage } from "../index";

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView; the uploader calls it on focus.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("ModelWizardPage — ?step=2&focus=accounting-export deep-link", () => {
  it("mounts SchoolProfileStep on step 2 and highlights the accounting export uploader", async () => {
    const { hook, searchHook } = memoryLocation({
      path: "/model/42",
      searchPath: "step=2&focus=accounting-export",
      static: true,
    });

    render(
      <Router hook={hook} searchHook={searchHook}>
        <ModelWizardPage />
      </Router>,
    );

    const uploader = await waitFor(
      () => screen.getByTestId("accounting-export-uploader"),
      { timeout: 4000 },
    );

    await waitFor(() => {
      expect(uploader).toHaveAttribute("data-focused", "true");
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
