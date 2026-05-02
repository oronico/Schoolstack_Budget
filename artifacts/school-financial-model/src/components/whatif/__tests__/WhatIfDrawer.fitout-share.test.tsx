import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import { WhatIfDrawer } from "../WhatIfDrawer";
import {
  encodeOverridesToHash,
  decodeOverridesFromHash,
} from "@/lib/whatif-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";

function buildBaseModel(): FullModelData {
  return {
    schoolProfile: {
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      debtIncluded: true,
    },
    enrollment: {
      year1: 100,
      year2: 120,
      year3: 140,
      year4: 160,
      year5: 180,
      retentionRate: 85,
    },
    facilities: {
      annualSalaryIncrease: 0,
      generalCostInflation: 0,
    },
    revenueRows: [
      {
        id: "r1",
        enabled: true,
        category: "other_revenue",
        driverType: "annual_fixed",
        amounts: [200000, 200000, 200000, 200000, 200000],
      },
    ],
    staffingRows: [],
    expenseRows: [],
    capitalAndDebtRows: [],
    tuitionTiers: [],
    openingBalances: { cash: 50000 },
  } as unknown as FullModelData;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("WhatIfDrawer — oneTimeFitOut share-link round-trip", () => {
  it("hydrates the fit-out input and impact panel from a hash containing f:NNNN", async () => {
    const encoded = encodeOverridesToHash({ oneTimeFitOut: 60000 });
    expect(encoded).toBe("whatif=f:60000");
    window.history.replaceState(null, "", `/#${encoded}`);

    render(
      <WhatIfDrawer
        open
        onOpenChange={() => {}}
        data={buildBaseModel()}
        modelId={1}
      />,
    );

    const fitoutInput = (await screen.findByTestId(
      "whatif-fitout",
    )) as HTMLInputElement;

    await waitFor(() => {
      expect(fitoutInput.value).toBe("60000");
    });

    // The impact panel re-runs computeWhatIfImpact through the debounced
    // overrides — Year 1 net income should drop by exactly the fit-out
    // amount, and later years should be unchanged. fmtMoneyDelta renders
    // 60_000 as "-$60K" / 0 as "$0".
    await waitFor(
      () => {
        expect(screen.getByTestId("whatif-ni-delta-Y1")).toHaveTextContent(
          "-$60K",
        );
      },
      { timeout: 1000 },
    );
    expect(screen.getByTestId("whatif-ni-delta-Y2")).toHaveTextContent("$0");
    expect(screen.getByTestId("whatif-ni-delta-Y5")).toHaveTextContent("$0");
  });

  it("writes f:NNNN into the URL hash after typing into the fit-out input", async () => {
    render(
      <WhatIfDrawer
        open
        onOpenChange={() => {}}
        data={buildBaseModel()}
        modelId={1}
      />,
    );

    expect(window.location.hash).toBe("");

    const fitoutInput = (await screen.findByTestId(
      "whatif-fitout",
    )) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fitoutInput, { target: { value: "42000" } });
    });

    // The drawer debounces hash writes (~80ms). Wait for the encoded
    // payload to reach window.location.hash and decode round-trips.
    await waitFor(
      () => {
        expect(window.location.hash).toContain("f:42000");
      },
      { timeout: 1000 },
    );

    const decoded = decodeOverridesFromHash(window.location.hash);
    expect(decoded.oneTimeFitOut).toBe(42000);
  });
});
