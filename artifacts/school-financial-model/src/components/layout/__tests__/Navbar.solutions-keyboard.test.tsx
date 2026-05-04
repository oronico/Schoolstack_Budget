import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: null,
    refetchUser: async () => {},
    isLoading: false,
    login: () => {},
    logout: () => {},
  });
  return { useAuth: ctx, useOptionalAuth: ctx };
});

vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

vi.mock("@/components/coaching/GuidanceModeSelector", () => ({
  GuidanceModeSelector: () => null,
}));

vi.mock("@/components/coaching/BudgetPrimer", () => ({
  BudgetPrimer: () => null,
}));

vi.mock("@/components/coaching/FounderPersonaPrompt", () => ({
  FounderPersonaPrompt: () => null,
}));

import { Navbar } from "../Navbar";
import { SOLUTION_LINK_SUMMARIES } from "@/data/solution-pages";

beforeEach(() => {
  document.body.innerHTML = "";
});

function getTrigger() {
  return screen.getByTestId("navbar-solutions-link");
}

function queryMenu() {
  return document.querySelector('[role="menu"]');
}

describe("Navbar Solutions menu — keyboard accessibility", () => {
  it("opens the dropdown when the user presses Enter on the trigger", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const trigger = getTrigger();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(queryMenu()).toBeNull();

    trigger.focus();
    await user.keyboard("{Enter}");

    expect(getTrigger()).toHaveAttribute("aria-expanded", "true");
    const menu = queryMenu();
    expect(menu).not.toBeNull();
    const firstItem = within(menu as HTMLElement).getByTestId(
      `navbar-solutions-item-${SOLUTION_LINK_SUMMARIES[0].slug}`,
    );
    expect(firstItem).toHaveFocus();
  });

  it("opens the dropdown when the user presses Space on the trigger", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const trigger = getTrigger();
    trigger.focus();
    await user.keyboard(" ");
    expect(getTrigger()).toHaveAttribute("aria-expanded", "true");
    expect(queryMenu()).not.toBeNull();
  });

  it("opens the dropdown and focuses the first item when the user presses ArrowDown", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const trigger = getTrigger();
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    const menu = queryMenu();
    expect(menu).not.toBeNull();
    const firstItem = within(menu as HTMLElement).getByTestId(
      `navbar-solutions-item-${SOLUTION_LINK_SUMMARIES[0].slug}`,
    );
    expect(firstItem).toHaveFocus();
  });

  it("cycles through every capability and the View all link with arrow keys", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const trigger = getTrigger();
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    const menu = queryMenu() as HTMLElement;
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(SOLUTION_LINK_SUMMARIES.length + 1);

    for (let i = 0; i < items.length; i++) {
      expect(items[i]).toHaveFocus();
      if (i < items.length - 1) {
        await user.keyboard("{ArrowDown}");
      }
    }

    expect(items[items.length - 1]).toHaveFocus();
    expect(within(menu).getByTestId("navbar-solutions-view-all")).toHaveFocus();
  });

  it("closes the dropdown and returns focus to the trigger when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const trigger = getTrigger();
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(queryMenu()).not.toBeNull();

    await user.keyboard("{Escape}");

    expect(queryMenu()).toBeNull();
    expect(getTrigger()).toHaveFocus();
    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the dropdown and returns focus to the trigger when Tab moves past the last item", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Navbar />
        <button data-testid="after">after</button>
      </div>,
    );
    const trigger = getTrigger();
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    const menu = queryMenu() as HTMLElement;
    const items = within(menu).getAllByRole("menuitem");
    items[items.length - 1].focus();
    expect(items[items.length - 1]).toHaveFocus();

    await user.tab();

    expect(queryMenu()).toBeNull();
    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
    expect(getTrigger()).toHaveFocus();
  });

  it("closes the dropdown and returns focus to the trigger when Shift+Tab leaves the first item", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const trigger = getTrigger();
    trigger.focus();
    await user.keyboard("{ArrowDown}");

    const menu = queryMenu() as HTMLElement;
    const items = within(menu).getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();

    await user.tab({ shift: true });

    expect(queryMenu()).toBeNull();
    expect(getTrigger()).toHaveFocus();
    expect(getTrigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps mouse hover behavior working", async () => {
    const user = userEvent.setup();
    render(<Navbar />);
    const trigger = getTrigger();
    expect(queryMenu()).toBeNull();

    const wrapper = trigger.parentElement as HTMLElement;
    await user.hover(wrapper);
    expect(queryMenu()).not.toBeNull();

    await user.unhover(wrapper);
    expect(queryMenu()).toBeNull();
  });
});
