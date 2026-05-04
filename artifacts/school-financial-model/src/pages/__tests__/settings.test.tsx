import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Hoisted mocks so the auth-context and the picker's network call are
// stubbed before the page module loads.
const mockCustomFetch = vi.fn();
const refetchUser = vi.fn(async () => {});
let currentUser: Record<string, unknown> | null = null;

vi.mock("@workspace/api-client-react", () => ({
  customFetch: (...args: unknown[]) => mockCustomFetch(...args),
}));

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: currentUser,
    refetchUser,
    isLoading: false,
    login: () => {},
    logout: () => {},
  });
  return { useAuth: ctx, useOptionalAuth: ctx };
});

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

// Layout + SEOHead pull in app-wide chrome + helmet logic that we don't need
// here. Stub them so the test only exercises the settings card itself.
vi.mock("@/components/layout/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/SEOHead", () => ({
  SEOHead: () => null,
}));

import { SettingsPage } from "../settings";

beforeEach(() => {
  mockCustomFetch.mockReset();
  refetchUser.mockReset();
  refetchUser.mockResolvedValue(undefined);
  currentUser = {
    id: 1,
    email: "founder@test.school",
    name: "Maya",
    personaStage: "yet_to_launch",
    personaComfort: "new_to_budgeting",
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingsPage — Your founder profile card", () => {
  it("renders the founder profile card with the user's current persona", () => {
    render(<SettingsPage />);
    const card = screen.getByTestId("settings-founder-profile-card");
    expect(card).toBeTruthy();
    const current = screen.getByTestId("settings-founder-profile-current");
    expect(current.getAttribute("data-stage")).toBe("yet_to_launch");
    expect(current.getAttribute("data-comfort")).toBe("new_to_budgeting");
  });

  it("opens the FounderPersonaPrompt in edit mode when the update button is clicked", () => {
    render(<SettingsPage />);
    expect(screen.queryByTestId("founder-persona-prompt")).toBeNull();
    fireEvent.click(screen.getByTestId("settings-founder-profile-edit"));
    const prompt = screen.getByTestId("founder-persona-prompt");
    expect(prompt).toBeTruthy();
    // Edit mode pre-selects the current persona — we should see the close (X)
    // button (only present in edit mode) and the user's existing pick.
    expect(screen.getByTestId("persona-prompt-close")).toBeTruthy();
    const preSelected = screen.getByTestId(
      "persona-bucket-yet_to_launch-new_to_budgeting",
    );
    expect(preSelected.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders an empty-state pick CTA when the user has no persona yet", () => {
    currentUser = {
      id: 1,
      email: "founder@test.school",
      name: "Maya",
    };
    render(<SettingsPage />);
    const current = screen.getByTestId("settings-founder-profile-current");
    expect(current.getAttribute("data-stage")).toBe("");
    expect(current.getAttribute("data-comfort")).toBe("");
    const cta = screen.getByTestId("settings-founder-profile-edit");
    expect(cta.textContent).toMatch(/pick founder profile/i);
  });

  it("renders a Coaching tone card that wraps the GuidanceModeSelector", () => {
    currentUser = {
      id: 1,
      email: "founder@test.school",
      name: "Maya",
      guidanceLevel: "basics",
    };
    render(<SettingsPage />);
    const card = screen.getByTestId("settings-coaching-tone-card");
    expect(card).toBeTruthy();
    expect(card.getAttribute("id")).toBe("coaching-tone");
    // The card should contain all three guidance level options.
    expect(card.textContent).toMatch(/Compact/);
    expect(card.textContent).toMatch(/Guided/);
    expect(card.textContent).toMatch(/Extra help/);
  });

  it("renders the existing+comfortable summary when the user runs a school", () => {
    currentUser = {
      id: 1,
      email: "founder@test.school",
      name: "Maya",
      personaStage: "existing",
      personaComfort: "comfortable",
    };
    render(<SettingsPage />);
    const current = screen.getByTestId("settings-founder-profile-current");
    expect(current.getAttribute("data-stage")).toBe("existing");
    expect(current.getAttribute("data-comfort")).toBe("comfortable");
  });
});
