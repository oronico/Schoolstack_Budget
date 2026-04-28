import { describe, expect, it } from "vitest";
import {
  applyWhatIfOverrides,
  computeWhatIfImpact,
  detectFacilityRent,
  encodeOverridesToHash,
  decodeOverridesFromHash,
  isEmptyOverrides,
  type WhatIfOverrides,
} from "../whatif-engine";
import { computeBaseFinancials } from "../scenario-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";

function buildBaseModel(overrides: Record<string, unknown> = {}): FullModelData {
  return {
    schoolProfile: {
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      debtIncluded: true,
      ...(overrides.schoolProfile as Record<string, unknown> || {}),
    },
    enrollment: {
      year1: 100,
      year2: 120,
      year3: 140,
      year4: 160,
      year5: 180,
      retentionRate: 85,
      ...(overrides.enrollment as Record<string, unknown> || {}),
    },
    facilities: {
      annualSalaryIncrease: 0,
      generalCostInflation: 0,
      ...(overrides.facilities as Record<string, unknown> || {}),
    },
    revenueRows: (overrides.revenueRows as unknown[]) || [],
    staffingRows: (overrides.staffingRows as unknown[]) || [],
    expenseRows: (overrides.expenseRows as unknown[]) || [],
    capitalAndDebtRows: (overrides.capitalAndDebtRows as unknown[]) || [],
    tuitionTiers: (overrides.tuitionTiers as unknown[]) || [],
    openingBalances: { cash: 50000, ...(overrides.openingBalances as Record<string, unknown> || {}) },
  } as FullModelData;
}

describe("whatif-engine: isEmptyOverrides", () => {
  it("returns true for null/undefined/empty", () => {
    expect(isEmptyOverrides(undefined)).toBe(true);
    expect(isEmptyOverrides(null)).toBe(true);
    expect(isEmptyOverrides({})).toBe(true);
  });

  it("returns true when all deltas are zero", () => {
    expect(
      isEmptyOverrides({
        enrollmentDelta: [0, 0, 0, 0, 0],
        tuitionDeltaPerStudent: 0,
        sqftDelta: 0,
      })
    ).toBe(true);
  });

  it("returns false when any override is set", () => {
    expect(isEmptyOverrides({ retentionRate: 85 })).toBe(false);
    expect(isEmptyOverrides({ enrollmentDelta: [0, 0, 5, 0, 0] })).toBe(false);
    expect(isEmptyOverrides({ monthlyRent: 5000 })).toBe(false);
  });
});

describe("whatif-engine: applyWhatIfOverrides — enrollment", () => {
  it("adds positive student deltas per year", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
    });
    const overrides: WhatIfOverrides = { enrollmentDelta: [10, 5, 0, -5, -10] };
    const adjusted = applyWhatIfOverrides(data, overrides);
    const en = adjusted.enrollment as Record<string, number>;
    expect(en.year1).toBe(110);
    expect(en.year2).toBe(125);
    expect(en.year3).toBe(140);
    expect(en.year4).toBe(155);
    expect(en.year5).toBe(170);
  });

  it("clamps enrollment to >= 0", () => {
    const data = buildBaseModel();
    const adjusted = applyWhatIfOverrides(data, { enrollmentDelta: [-9999, 0, 0, 0, 0] });
    const en = adjusted.enrollment as Record<string, number>;
    expect(en.year1).toBe(0);
  });

  it("does not mutate the input data", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
    });
    const before = JSON.stringify(data);
    applyWhatIfOverrides(data, { enrollmentDelta: [50, 0, 0, 0, 0] });
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("whatif-engine: applyWhatIfOverrides — retention rate", () => {
  it("overrides retention rate", () => {
    const data = buildBaseModel();
    const adjusted = applyWhatIfOverrides(data, { retentionRate: 75 });
    expect((adjusted.enrollment as Record<string, unknown>).retentionRate).toBe(75);
  });

  it("clamps retention to 0..100", () => {
    const data = buildBaseModel();
    const high = applyWhatIfOverrides(data, { retentionRate: 150 });
    const low = applyWhatIfOverrides(data, { retentionRate: -10 });
    expect((high.enrollment as Record<string, unknown>).retentionRate).toBe(100);
    expect((low.enrollment as Record<string, unknown>).retentionRate).toBe(0);
  });
});

describe("whatif-engine: applyWhatIfOverrides — tuition delta", () => {
  it("adds tuition delta to per_student tuition rows only", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000], escalationRate: 0 },
        { id: "r2", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [50000, 50000, 50000, 50000, 50000] },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { tuitionDeltaPerStudent: 500 });
    const rows = adjusted.revenueRows as Array<Record<string, unknown>>;
    expect((rows[0].amounts as number[])[0]).toBe(10500);
    expect((rows[0].amounts as number[])[4]).toBe(10500);
    expect((rows[1].amounts as number[])[0]).toBe(50000);
  });

  it("with row escalation set, bumps amounts[0] only and lets engine escalate", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000], escalationRate: 5 },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { tuitionDeltaPerStudent: 500 });
    const rows = adjusted.revenueRows as Array<Record<string, unknown>>;
    const amts = rows[0].amounts as number[];
    // Engine reads amounts[0] and applies (1+esc)^y. We bump just amounts[0].
    expect(amts[0]).toBe(10500);
    expect(amts[1]).toBe(10000);
    expect(amts[4]).toBe(10000);
    // Escalation is preserved so the engine still escalates the bumped base.
    expect(rows[0].escalationRate).toBe(5);
  });

  it("with global tuitionEscalation set, bumps amounts[0] only (tier-mode aware)", () => {
    const base = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [12000, 12000, 12000, 12000, 12000], escalationRate: 0 },
      ],
    });
    const data = { ...(base as Record<string, unknown>), tuitionEscalation: { rate: 4 } } as FullModelData;
    const adjusted = applyWhatIfOverrides(data, { tuitionDeltaPerStudent: 1000 });
    const rows = adjusted.revenueRows as Array<Record<string, unknown>>;
    const amts = rows[0].amounts as number[];
    expect(amts[0]).toBe(13000);
    expect(amts[1]).toBe(12000);
  });

  it("clamps tuition rows to 0 if delta is more negative than base", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [1000, 1000, 1000, 1000, 1000] },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { tuitionDeltaPerStudent: -5000 });
    const rows = adjusted.revenueRows as Array<Record<string, unknown>>;
    expect((rows[0].amounts as number[])[0]).toBe(0);
  });

  it("adds tuition delta to per_new_student tuition rows (no escalation bumps every year)", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "rn", enabled: true, category: "tuition_and_fees", driverType: "per_new_student", amounts: [9000, 9200, 9400, 9600, 9800], escalationRate: 0 },
        { id: "ro", enabled: true, category: "tuition_and_fees", driverType: "per_returning_student", amounts: [8000, 8200, 8400, 8600, 8800], escalationRate: 0 },
        { id: "other", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { tuitionDeltaPerStudent: 500 });
    const rows = adjusted.revenueRows as Array<Record<string, unknown>>;
    const newAmts = rows[0].amounts as number[];
    const retAmts = rows[1].amounts as number[];
    expect(newAmts[0]).toBe(9500);
    expect(newAmts[2]).toBe(9900);
    expect(newAmts[4]).toBe(10300);
    expect(retAmts[0]).toBe(8500);
    expect(retAmts[4]).toBe(9300);
    // Untouched non-tuition row stays the same.
    expect((rows[2].amounts as number[])[0]).toBe(10000);
  });

  it("with row escalation set on per_new_student / per_returning_student, bumps amounts[0] only", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "rn", enabled: true, category: "tuition_and_fees", driverType: "per_new_student", amounts: [9000, 9000, 9000, 9000, 9000], escalationRate: 5 },
        { id: "ro", enabled: true, category: "tuition_and_fees", driverType: "per_returning_student", amounts: [8000, 8000, 8000, 8000, 8000], escalationRate: 3 },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { tuitionDeltaPerStudent: 250 });
    const rows = adjusted.revenueRows as Array<Record<string, unknown>>;
    const newAmts = rows[0].amounts as number[];
    const retAmts = rows[1].amounts as number[];
    expect(newAmts[0]).toBe(9250);
    expect(newAmts[1]).toBe(9000);
    expect(newAmts[4]).toBe(9000);
    expect(rows[0].escalationRate).toBe(5);
    expect(retAmts[0]).toBe(8250);
    expect(retAmts[1]).toBe(8000);
    expect(retAmts[4]).toBe(8000);
    expect(rows[1].escalationRate).toBe(3);
  });

  it("with global tuitionEscalation set, bumps amounts[0] for per_new_student / per_returning_student rows", () => {
    const base = buildBaseModel({
      revenueRows: [
        { id: "rn", enabled: true, category: "tuition_and_fees", driverType: "per_new_student", amounts: [12000, 12000, 12000, 12000, 12000], escalationRate: 0 },
        { id: "ro", enabled: true, category: "tuition_and_fees", driverType: "per_returning_student", amounts: [11000, 11000, 11000, 11000, 11000], escalationRate: 0 },
      ],
    });
    const data = { ...(base as Record<string, unknown>), tuitionEscalation: { rate: 4 } } as FullModelData;
    const adjusted = applyWhatIfOverrides(data, { tuitionDeltaPerStudent: 1000 });
    const rows = adjusted.revenueRows as Array<Record<string, unknown>>;
    expect((rows[0].amounts as number[])[0]).toBe(13000);
    expect((rows[0].amounts as number[])[1]).toBe(12000);
    expect((rows[1].amounts as number[])[0]).toBe(12000);
    expect((rows[1].amounts as number[])[1]).toBe(11000);
  });

  it("clamps per_new_student / per_returning_student rows to 0 if delta is more negative than base", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "rn", enabled: true, category: "tuition_and_fees", driverType: "per_new_student", amounts: [800, 800, 800, 800, 800] },
        { id: "ro", enabled: true, category: "tuition_and_fees", driverType: "per_returning_student", amounts: [600, 600, 600, 600, 600] },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { tuitionDeltaPerStudent: -5000 });
    const rows = adjusted.revenueRows as Array<Record<string, unknown>>;
    expect((rows[0].amounts as number[])[0]).toBe(0);
    expect((rows[0].amounts as number[])[4]).toBe(0);
    expect((rows[1].amounts as number[])[0]).toBe(0);
    expect((rows[1].amounts as number[])[4]).toBe(0);
  });
});

describe("whatif-engine: detectFacilityRent", () => {
  it("returns the largest monthly occupancy_facility row", () => {
    const data = buildBaseModel({
      expenseRows: [
        { id: "e1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [3000, 3000, 3000, 3000, 3000] },
        { id: "e2", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [7500, 7500, 7500, 7500, 7500] },
        { id: "e3", enabled: true, category: "occupancy_facility", driverType: "annual_fixed", amounts: [20000, 20000, 20000, 20000, 20000] },
      ],
    });
    const det = detectFacilityRent(data);
    expect(det.rowId).toBe("e2");
    expect(det.monthlyRent).toBe(7500);
  });

  it("falls back to facilityPhases when no expense row exists", () => {
    const data = buildBaseModel({
      schoolProfile: {
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        debtIncluded: true,
        facilityPhases: [
          { id: "p1", ownershipType: "rent", startYear: 1, endYear: 5, monthlyRent: 6500 },
        ],
      },
    });
    const det = detectFacilityRent(data);
    expect(det.rowId).toBeNull();
    expect(det.monthlyRent).toBe(6500);
  });

  it("returns nulls when nothing detectable", () => {
    const data = buildBaseModel();
    const det = detectFacilityRent(data);
    expect(det.rowId).toBeNull();
    expect(det.monthlyRent).toBeNull();
  });
});

describe("whatif-engine: applyWhatIfOverrides — lease overrides", () => {
  it("replaces monthly rent on the detected row from year 1", () => {
    const data = buildBaseModel({
      expenseRows: [
        { id: "e1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [5000, 5000, 5000, 5000, 5000], escalationRate: 3 },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { monthlyRent: 7000, rentEscalation: 0 });
    const rows = adjusted.expenseRows as Array<Record<string, unknown>>;
    const amts = rows[0].amounts as number[];
    expect(amts[0]).toBe(7000);
    expect(amts[4]).toBe(7000);
    expect(rows[0].escalationRate).toBe(0);
    expect(rows[0].escalationRateOverridden).toBe(true);
  });

  it("respects rentChangeStartYear — preserves projected rent before start", () => {
    const data = buildBaseModel({
      expenseRows: [
        { id: "e1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [5000, 5000, 5000, 5000, 5000], escalationRate: 3 },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { monthlyRent: 7000, rentEscalation: 0, rentChangeStartYear: 3 });
    const rows = adjusted.expenseRows as Array<Record<string, unknown>>;
    const amts = rows[0].amounts as number[];
    expect(amts[0]).toBeCloseTo(5000, 0);
    expect(amts[1]).toBeCloseTo(5000 * 1.03, 0);
    expect(amts[2]).toBe(7000);
    expect(amts[3]).toBe(7000);
    expect(amts[4]).toBe(7000);
  });

  it("preserves projected rent basis when only escalation is overridden mid-stream", () => {
    // Regression: when rentEscalation is overridden with a start year > 1
    // and no monthlyRent is given, the basis at the start year should be the
    // *projected* original rent at that year — not Y1 — so the trajectory
    // continues smoothly instead of resetting to Y1's value.
    const data = buildBaseModel({
      expenseRows: [
        { id: "e1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [10000, 10000, 10000, 10000, 10000], escalationRate: 5 },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { rentEscalation: 10, rentChangeStartYear: 3 });
    const rows = adjusted.expenseRows as Array<Record<string, unknown>>;
    const amts = rows[0].amounts as number[];
    // Years 1 & 2 unchanged from original projection (5% escalation).
    expect(amts[0]).toBeCloseTo(10000, 2);
    expect(amts[1]).toBeCloseTo(10000 * 1.05, 2);
    // Year 3 picks up the projected basis (10000 * 1.05^2), not 10000.
    const projY3 = 10000 * Math.pow(1.05, 2);
    expect(amts[2]).toBeCloseTo(projY3, 2);
    // Years 4 & 5 escalate from Y3 basis at the new 10% rate.
    expect(amts[3]).toBeCloseTo(projY3 * 1.10, 2);
    expect(amts[4]).toBeCloseTo(projY3 * Math.pow(1.10, 2), 2);
  });

  it("compounds rent escalation override from start year", () => {
    const data = buildBaseModel({
      expenseRows: [
        { id: "e1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [5000, 5000, 5000, 5000, 5000], escalationRate: 0 },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { monthlyRent: 6000, rentEscalation: 4 });
    const rows = adjusted.expenseRows as Array<Record<string, unknown>>;
    const amts = rows[0].amounts as number[];
    expect(amts[0]).toBe(6000);
    expect(amts[1]).toBeCloseTo(6000 * 1.04, 5);
    expect(amts[4]).toBeCloseTo(6000 * Math.pow(1.04, 4), 5);
  });

  it("synthesizes a facility row when none exists", () => {
    const data = buildBaseModel();
    const adjusted = applyWhatIfOverrides(data, { monthlyRent: 4000 });
    const rows = (adjusted.expenseRows || []) as Array<Record<string, unknown>>;
    const synthesized = rows.find((r) => r.id === "__whatif_rent__");
    expect(synthesized).toBeDefined();
    expect((synthesized!.amounts as number[])[0]).toBe(4000);
  });

  it("clamps monthly rent to 0", () => {
    const data = buildBaseModel({
      expenseRows: [
        { id: "e1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [5000, 5000, 5000, 5000, 5000] },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { monthlyRent: -200 });
    const rows = adjusted.expenseRows as Array<Record<string, unknown>>;
    expect((rows[0].amounts as number[])[0]).toBe(0);
  });
});

describe("whatif-engine: applyWhatIfOverrides — sqft delta", () => {
  it("scales facility rows proportionally based on phase sqft", () => {
    const data = buildBaseModel({
      schoolProfile: {
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        debtIncluded: true,
        facilityPhases: [
          { id: "p1", ownershipType: "rent", startYear: 1, endYear: 5, monthlyRent: 5000, squareFootage: 5000 },
        ],
      },
      expenseRows: [
        { id: "u1", enabled: true, category: "occupancy_facility", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { sqftDelta: 1000 });
    const rows = adjusted.expenseRows as Array<Record<string, unknown>>;
    const factor = 1 + 1000 / 5000;
    expect((rows[0].amounts as number[])[0]).toBeCloseTo(10000 * factor, 0);
  });

  it("does nothing when no base sqft is set", () => {
    const data = buildBaseModel({
      expenseRows: [
        { id: "u1", enabled: true, category: "occupancy_facility", driverType: "annual_fixed", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
    });
    const adjusted = applyWhatIfOverrides(data, { sqftDelta: 1000 });
    const rows = adjusted.expenseRows as Array<Record<string, unknown>>;
    expect((rows[0].amounts as number[])[0]).toBe(10000);
  });
});

describe("whatif-engine: computeWhatIfImpact", () => {
  it("returns equal base and adjusted when overrides are empty", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [200000, 200000, 200000, 200000, 200000] },
      ],
    });
    const impact = computeWhatIfImpact(data, {});
    expect(impact.adjusted.netIncome[0]).toBe(impact.base.netIncome[0]);
    expect(impact.deltas.netIncome).toEqual([0, 0, 0, 0, 0]);
  });

  it("computes deltas correctly for rent override", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [200000, 200000, 200000, 200000, 200000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [5000, 5000, 5000, 5000, 5000] },
      ],
    });
    const impact = computeWhatIfImpact(data, { monthlyRent: 7000, rentEscalation: 0 });
    // Expected delta: -(2000 * 12) per year = -24000
    expect(impact.deltas.netIncome[0]).toBeCloseTo(-24000, 0);
    expect(impact.deltas.netIncome[4]).toBeCloseTo(-24000, 0);
  });

  it("computes break-even shift when adjusted defers profitability", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [120000, 120000, 120000, 120000, 120000] },
      ],
      expenseRows: [
        { id: "e1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [5000, 5000, 5000, 5000, 5000] },
      ],
    });
    // Base: 120k - 60k = 60k, breakEvenYear = 1
    const impact = computeWhatIfImpact(data, { monthlyRent: 12000 });
    // Adjusted: 120k - 144k = -24k, never breaks even
    expect(impact.base.breakEvenYear).toBe(1);
    expect(impact.adjusted.breakEvenYear).toBeNull();
    expect(impact.deltas.breakEvenYearShift).toBeNull();
  });

  it("detects rent row id and base monthly rent in result", () => {
    const data = buildBaseModel({
      expenseRows: [
        { id: "ex1", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [4500, 4500, 4500, 4500, 4500] },
      ],
    });
    const impact = computeWhatIfImpact(data, {});
    expect(impact.detectedRentRowId).toBe("ex1");
    expect(impact.detectedBaseMonthlyRent).toBe(4500);
  });

  it("matches base when applying empty overrides via applyWhatIfOverrides", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
    });
    const baseDirect = computeBaseFinancials(data);
    const adjustedData = applyWhatIfOverrides(data, {});
    const adjustedDirect = computeBaseFinancials(adjustedData);
    expect(adjustedDirect.netIncome[0]).toBe(baseDirect.netIncome[0]);
  });
});

describe("whatif-engine: hash codec round-trip", () => {
  it("encodes and decodes all fields", () => {
    const overrides: WhatIfOverrides = {
      enrollmentDelta: [5, 10, -3, 0, 12],
      retentionRate: 88,
      tuitionDeltaPerStudent: 750,
      monthlyRent: 6500,
      rentEscalation: 4,
      rentChangeStartYear: 3,
      sqftDelta: 250,
    };
    const encoded = encodeOverridesToHash(overrides);
    const decoded = decodeOverridesFromHash(`#${encoded}`);
    expect(decoded.enrollmentDelta).toEqual([5, 10, -3, 0, 12]);
    expect(decoded.retentionRate).toBe(88);
    expect(decoded.tuitionDeltaPerStudent).toBe(750);
    expect(decoded.monthlyRent).toBe(6500);
    expect(decoded.rentEscalation).toBe(4);
    expect(decoded.rentChangeStartYear).toBe(3);
    expect(decoded.sqftDelta).toBe(250);
  });

  it("returns empty for missing or malformed hash", () => {
    expect(decodeOverridesFromHash("")).toEqual({});
    expect(decodeOverridesFromHash("#other=stuff")).toEqual({});
    expect(encodeOverridesToHash({})).toBe("");
  });

  it("ignores unknown keys gracefully", () => {
    const decoded = decodeOverridesFromHash("#whatif=r:80|junk:abc|m:5000");
    expect(decoded.retentionRate).toBe(80);
    expect(decoded.monthlyRent).toBe(5000);
  });

  it("omits zeroed fields in encoded payload", () => {
    const encoded = encodeOverridesToHash({
      enrollmentDelta: [0, 0, 0, 0, 0],
      tuitionDeltaPerStudent: 0,
      sqftDelta: 0,
    });
    expect(encoded).toBe("");
  });
});
