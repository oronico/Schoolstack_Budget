import { describe, it, expect } from "vitest";
import {
  ASSUMPTION_REGISTRY,
  HEADLINE_METRIC_LABELS,
  METRIC_DRIVER_KEYS,
  computeMetricDrivers,
  isAssumptionKey,
  listAssumptionKeys,
  type HeadlineMetricKey,
  type AssumptionKey,
} from "@workspace/finance";

// Task #614 — every metric → assumption mapping must reference a key that
// lives in the registry. Without this guard, a renamed key (or a typo in a
// PDF appendix table) silently becomes an unlabeled "Unknown driver" row in
// the lender packet, defeating the whole point of assumption traceability.
describe("assumption registry — metric driver wiring", () => {
  it("every key listed in METRIC_DRIVER_KEYS is registered", () => {
    const unknown: Array<{ metric: HeadlineMetricKey; key: string }> = [];
    for (const metric of Object.keys(METRIC_DRIVER_KEYS) as HeadlineMetricKey[]) {
      for (const key of METRIC_DRIVER_KEYS[metric]) {
        if (!isAssumptionKey(key)) unknown.push({ metric, key });
      }
    }
    expect(unknown).toEqual([]);
  });

  it("every registered key has a label, step title, and format", () => {
    for (const key of listAssumptionKeys()) {
      const meta = ASSUMPTION_REGISTRY[key];
      expect(meta.key).toBe(key);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.stepTitle.length).toBeGreaterThan(0);
      expect(meta.defaultStepNumber).toBeGreaterThan(0);
      expect(meta.format.length).toBeGreaterThan(0);
    }
  });

  it("every headline metric has a label and at least one driver", () => {
    for (const metric of Object.keys(METRIC_DRIVER_KEYS) as HeadlineMetricKey[]) {
      expect(HEADLINE_METRIC_LABELS[metric].length).toBeGreaterThan(0);
      expect(METRIC_DRIVER_KEYS[metric].length).toBeGreaterThan(0);
    }
  });

  it("computeMetricDrivers populates a driver value for every metric", () => {
    // Minimal model — engine should still produce zeroed metric values
    // and emit a (possibly "Not entered") driver for each registered key.
    const drivers = computeMetricDrivers({
      schoolProfile: { schoolName: "Test", isPartialFirstYear: false },
      enrollment: { year1: 50, year2: 60, year3: 70, year4: 80, year5: 90, retentionRate: 85 },
      revenueRows: [
        {
          id: "r1",
          enabled: true,
          category: "tuition_and_fees",
          driverType: "per_student",
          amounts: [9500, 9500, 9500, 9500, 9500],
          collectionRate: 95,
          escalationRate: 3,
        } as never,
      ],
      staffingRows: [],
      expenseRows: [],
      capitalAndDebtRows: [],
      openingBalances: { cash: 50000 },
    });

    for (const metric of Object.keys(METRIC_DRIVER_KEYS) as HeadlineMetricKey[]) {
      const info = drivers[metric];
      expect(info.metricKey).toBe(metric);
      expect(info.drivers.length).toBe(METRIC_DRIVER_KEYS[metric].length);
      for (const d of info.drivers) {
        expect(isAssumptionKey(d.key as AssumptionKey)).toBe(true);
        expect(d.value.length).toBeGreaterThan(0);
      }
    }

    // Spot-check: enrollment_y1 driver for revenue should reflect the input.
    const revDrivers = drivers.y1_revenue.drivers;
    const enrollDriver = revDrivers.find((d) => d.key === "enrollment_y1")!;
    expect(enrollDriver.value).toBe("50");
    const tuition = revDrivers.find((d) => d.key === "tuition_per_student")!;
    expect(tuition.value).toBe("$9,500");
  });
});
