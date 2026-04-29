import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Hoisted mocks so they're set up before the module under test is imported.
const mockCustomFetch = vi.fn();
const refetchUser = vi.fn(async () => {});
let currentUser: Record<string, unknown> | null = null;

vi.mock("@workspace/api-client-react", () => ({
  customFetch: (...args: unknown[]) => mockCustomFetch(...args),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: currentUser,
    refetchUser,
    isLoading: false,
    login: () => {},
    logout: () => {},
  }),
}));

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { FounderPersonaPrompt } from "../FounderPersonaPrompt";

beforeEach(() => {
  mockCustomFetch.mockReset();
  refetchUser.mockReset();
  refetchUser.mockResolvedValue(undefined);
  currentUser = { id: 1, email: "founder@test.school", name: "Maya" };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FounderPersonaPrompt — picker + persistence", () => {
  it("renders four explicit bucket cards covering every stage × comfort combo", () => {
    render(<FounderPersonaPrompt />);
    // The four expected buckets — one per stage × comfort combo. If we ever
    // collapse this back to two stacked questions this test will fail and
    // catch the regression.
    expect(screen.getByTestId("persona-bucket-yet_to_launch-new_to_budgeting")).toBeTruthy();
    expect(screen.getByTestId("persona-bucket-yet_to_launch-comfortable")).toBeTruthy();
    expect(screen.getByTestId("persona-bucket-existing-new_to_budgeting")).toBeTruthy();
    expect(screen.getByTestId("persona-bucket-existing-comfortable")).toBeTruthy();
  });

  it("appears when persona is missing and disables submit until a bucket is picked", () => {
    render(<FounderPersonaPrompt />);
    expect(screen.getByTestId("founder-persona-prompt")).toBeTruthy();
    const submit = screen.getByTestId("persona-prompt-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("persona-bucket-yet_to_launch-new_to_budgeting"));
    expect(submit.disabled).toBe(false);
  });

  it("persists the picked bucket via PATCH /api/auth/persona and refetches the user", async () => {
    mockCustomFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const onComplete = vi.fn();

    render(<FounderPersonaPrompt onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("persona-bucket-existing-comfortable"));
    fireEvent.click(screen.getByTestId("persona-prompt-submit"));

    await waitFor(() => {
      expect(mockCustomFetch).toHaveBeenCalledTimes(1);
    });

    const [url, init] = mockCustomFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/persona");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ stage: "existing", comfort: "comfortable" });

    await waitFor(() => {
      expect(refetchUser).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("pre-selects the user's current persona in edit mode and shows a close button", () => {
    currentUser = {
      id: 1,
      email: "founder@test.school",
      name: "Maya",
      personaStage: "yet_to_launch",
      personaComfort: "new_to_budgeting",
    };
    const onClose = vi.fn();
    render(<FounderPersonaPrompt mode="edit" onClose={onClose} />);
    const preSelected = screen.getByTestId("persona-bucket-yet_to_launch-new_to_budgeting");
    expect(preSelected.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("persona-prompt-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("surfaces an error message when the PATCH fails", async () => {
    mockCustomFetch.mockRejectedValueOnce(new Error("network down"));
    render(<FounderPersonaPrompt />);
    fireEvent.click(screen.getByTestId("persona-bucket-yet_to_launch-new_to_budgeting"));
    fireEvent.click(screen.getByTestId("persona-prompt-submit"));
    await screen.findByRole("alert");
    expect(refetchUser).not.toHaveBeenCalled();
  });
});
