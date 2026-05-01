import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { WhatIfTrigger } from "../WhatIfTrigger";
import { encodeOverridesToHash } from "@/lib/whatif-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";

const baseModel: FullModelData = {
  enrollment: { year1: 100, year2: 110, year3: 120, year4: 130, year5: 140 } as never,
} as unknown as FullModelData;

function setHash(hash: string) {
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}

beforeEach(() => {
  setHash("");
});

describe("WhatIfTrigger — saved scenario open-in-planner handshake", () => {
  it("opens the drawer when an encoded whatif hash appears via hashchange", async () => {
    render(<WhatIfTrigger data={baseModel} modelId={1} />);
    expect(screen.queryByTestId("whatif-drawer")).toBeNull();

    const hash = encodeOverridesToHash({ enrollmentDelta: [-5, 0, 0, 0, 0] });
    expect(hash).toBeTruthy();
    await act(async () => {
      window.location.hash = `#${hash}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    await waitFor(
      () => {
        expect(screen.getByTestId("whatif-drawer")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("opens (and remounts) the drawer when a `whatif:open` custom event fires, even if the hash hasn't changed", async () => {
    // Pre-set the hash so we can simulate "click open-in-planner twice on
    // the same scenario" — the second click writes the same hash, no
    // hashchange fires, but the custom event still flips the drawer.
    const hash = encodeOverridesToHash({ retentionRate: 75 });
    expect(hash).toBeTruthy();
    window.location.hash = `#${hash}`;

    render(<WhatIfTrigger data={baseModel} modelId={1} />);
    // First mount auto-opens because the hash has overrides on it.
    await waitFor(() => {
      expect(screen.getByTestId("whatif-drawer")).toBeInTheDocument();
    });

    // Now dispatch the custom event — the trigger should close + re-open
    // the drawer so it re-hydrates from the (unchanged) hash. We assert
    // the drawer is visible after the round trip.
    act(() => {
      window.dispatchEvent(
        new CustomEvent("whatif:open", { detail: { hash } }),
      );
    });
    // requestAnimationFrame schedules the re-open; flush a frame.
    await act(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(undefined)),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("whatif-drawer")).toBeInTheDocument();
    });
  });
});
