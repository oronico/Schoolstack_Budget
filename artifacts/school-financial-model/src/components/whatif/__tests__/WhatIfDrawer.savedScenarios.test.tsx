import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { WhatIfDrawer } from "../WhatIfDrawer";
import type { CustomScenario, FullModelData } from "@/pages/model-wizard/schema";

// jsdom doesn't implement matchMedia, which Radix's Dialog touches.
beforeEach(() => {
  if (!("matchMedia" in window)) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }
  window.location.hash = "";
});

const baseModel: FullModelData = {
  enrollment: { year1: 100, year2: 110, year3: 120, year4: 130, year5: 140 } as never,
} as unknown as FullModelData;

function makeScenario(overrides: Partial<CustomScenario>): CustomScenario {
  return {
    name: "Slower lease ramp",
    createdAt: "2026-03-14T12:00:00.000Z",
    overrides: { retentionRate: 75 },
    ...overrides,
  } as CustomScenario;
}

describe("WhatIfDrawer — saved scenarios picker", () => {
  it("shows an empty-state hint pointing at the footer Save action when there are no saved scenarios", async () => {
    render(
      <WhatIfDrawer
        open
        onOpenChange={() => {}}
        data={baseModel}
        modelId={1}
        customScenarios={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("whatif-saved-scenarios-trigger"));
    const empty = await screen.findByTestId("whatif-saved-scenarios-empty");
    expect(empty).toHaveTextContent(/no saved scenarios yet/i);
    expect(empty).toHaveTextContent(/save as scenario/i);
    // Count badge is hidden when there's nothing to count.
    expect(screen.queryByTestId("whatif-saved-scenarios-count")).toBeNull();
  });

  it("renders saved scenarios with their saved date and re-hydrates overrides on click", async () => {
    const scenarios: CustomScenario[] = [
      makeScenario({
        name: "Slower lease ramp",
        createdAt: "2026-03-14T12:00:00.000Z",
        overrides: { retentionRate: 72 },
      }),
      makeScenario({
        name: "Bigger Y1 cohort",
        createdAt: "2026-04-02T15:00:00.000Z",
        overrides: { enrollmentDelta: [10, 0, 0, 0, 0] },
      }),
    ];

    render(
      <WhatIfDrawer
        open
        onOpenChange={() => {}}
        data={baseModel}
        modelId={1}
        customScenarios={scenarios}
      />,
    );

    expect(screen.getByTestId("whatif-saved-scenarios-count")).toHaveTextContent("2");

    fireEvent.click(screen.getByTestId("whatif-saved-scenarios-trigger"));
    const menu = await screen.findByTestId("whatif-saved-scenarios-menu");
    expect(menu).toHaveTextContent("Slower lease ramp");
    expect(menu).toHaveTextContent("Bigger Y1 cohort");
    // Date format: "Mar 14, 2026"
    expect(menu).toHaveTextContent(/Mar 14, 2026/);
    expect(menu).toHaveTextContent(/Apr 2, 2026/);

    // Click the second scenario — it has an enrollmentDelta override that
    // should land in the drawer's Y1 input as 110 (base 100 + 10).
    await act(async () => {
      fireEvent.click(screen.getByTestId("whatif-saved-scenario-1"));
    });

    await waitFor(
      () => {
        const y1 = screen.getByTestId("whatif-enrollment-Y1") as HTMLInputElement;
        expect(y1.value).toBe("110");
      },
      // The drawer's controlled-input rehydration runs through a few
      // queued microtasks (form reset → input commit). Default 1s
      // timeout occasionally trips on slow CI machines; 5s is safe
      // and still fast on healthy runs.
      { timeout: 5000 },
    );

    // Picker closes after a selection.
    expect(screen.queryByTestId("whatif-saved-scenarios-menu")).toBeNull();
  }, 15000);

  it("loading a saved scenario replaces any pending overrides instead of merging them", async () => {
    const scenarios: CustomScenario[] = [
      makeScenario({
        name: "Smaller cohort",
        createdAt: "2026-02-01T12:00:00.000Z",
        // Saved scenario only touches enrollment — it must *not* preserve
        // the Y2 enrollment delta the founder typed in before loading,
        // and it has no monthly-rent override either.
        overrides: { enrollmentDelta: [-5, 0, 0, 0, 0] },
      }),
    ];

    render(
      <WhatIfDrawer
        open
        onOpenChange={() => {}}
        data={baseModel}
        modelId={1}
        customScenarios={scenarios}
      />,
    );

    // Seed pending overrides the saved scenario does NOT touch:
    // 1) bump Y2 enrollment from 110 -> 125 (a +15 enrollmentDelta on Y2)
    // 2) override the monthly rent.
    // Both should be wiped after we load the saved scenario.
    fireEvent.change(screen.getByTestId("whatif-enrollment-Y2"), {
      target: { value: "125" },
    });
    fireEvent.change(screen.getByTestId("whatif-monthly-rent"), {
      target: { value: "9999" },
    });
    await waitFor(() => {
      const y2 = screen.getByTestId("whatif-enrollment-Y2") as HTMLInputElement;
      expect(y2.value).toBe("125");
      const rent = screen.getByTestId("whatif-monthly-rent") as HTMLInputElement;
      expect(rent.value).toBe("9999");
    });

    // Open the picker and select the scenario.
    fireEvent.click(screen.getByTestId("whatif-saved-scenarios-trigger"));
    await act(async () => {
      fireEvent.click(await screen.findByTestId("whatif-saved-scenario-0"));
    });

    // Y1 enrollment input should reflect the saved scenario (100 - 5 = 95).
    await waitFor(() => {
      const y1 = screen.getByTestId("whatif-enrollment-Y1") as HTMLInputElement;
      expect(y1.value).toBe("95");
    });
    // Y2 enrollment must drop back to the base value (110) — i.e. the
    // pending +15 was discarded, not merged onto the saved scenario's
    // (Y2 = 0 delta) override.
    const y2After = screen.getByTestId("whatif-enrollment-Y2") as HTMLInputElement;
    expect(y2After.value).toBe("110");
    // Monthly rent override is gone too — the input falls back to the
    // detected/base value (or 0 when none is detected) rather than the
    // 9999 we typed in.
    const rentAfter = screen.getByTestId("whatif-monthly-rent") as HTMLInputElement;
    expect(rentAfter.value).not.toBe("9999");
  });
});
