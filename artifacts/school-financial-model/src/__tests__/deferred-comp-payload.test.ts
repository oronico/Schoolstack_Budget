// Task #604 — Unit-test the deferred-comp payload math.
//
// The UI for deferred founder compensation already has an e2e test that
// asserts the lender readiness flag flips to "caution" (Task #600). The
// per-year cost rollout — i.e. that buildModelDataPayload emits a founder
// staff row with the right startYear and notes, and that no founder cost
// lands in Year 1 when comp is deferred — was not directly covered.
//
// This test exercises buildModelDataPayload across the deferral range
// (beginsYear=2..5) and pins the contract:
//   - founderIsPaidYear1=false + comp > 0 emits a staff_founder row.
//   - The row's startYear matches founderCompensationBeginsYear.
//   - The row's notes read "Deferred to Year N".
//   - No staff row places founder cost in Year 1 (no other row carries the
//     founder's annualizedRate, and the founder row itself starts > 1).

import { describe, it, expect } from "vitest";
import { buildModelDataPayload, EMPTY_MODEL, type GuestModel } from "@/pages/underwriting";

type StaffRow = {
  id: string;
  roleName: string;
  annualizedRate: number;
  startYear?: number;
  notes?: string;
};

function deferredModel(beginsYear: number, comp = 90000): GuestModel {
  return {
    ...EMPTY_MODEL,
    founderIsPaidYear1: false,
    founderAnnualCompensation: comp,
    founderCompensationBeginsYear: beginsYear,
  };
}

function staffingRows(payload: Record<string, unknown>): StaffRow[] {
  return (payload.staffingRows as StaffRow[]) ?? [];
}

describe("buildModelDataPayload — deferred founder compensation", () => {
  for (const beginsYear of [2, 3, 4, 5] as const) {
    it(`emits a founder row that starts in Year ${beginsYear} with the right note`, () => {
      const payload = buildModelDataPayload(deferredModel(beginsYear));
      const rows = staffingRows(payload);
      const founder = rows.find((r) => r.id === "staff_founder");

      expect(founder, "expected a founder staff row when comp > 0").toBeDefined();
      expect(founder!.startYear).toBe(beginsYear);
      expect(founder!.notes).toBe(`Deferred to Year ${beginsYear}`);
      expect(founder!.annualizedRate).toBe(90000);
    });
  }

  it("keeps founder cost out of Year 1 when deferred", () => {
    const payload = buildModelDataPayload(deferredModel(3, 120000));
    const rows = staffingRows(payload);
    const founder = rows.find((r) => r.id === "staff_founder");

    expect(founder).toBeDefined();
    expect(founder!.startYear).toBeGreaterThan(1);

    // No other staff row should be carrying the founder's compensation in
    // Year 1 — i.e. the deferred amount must not leak onto another role.
    const leaked = rows.filter(
      (r) => r.id !== "staff_founder" && r.annualizedRate === 120000,
    );
    expect(leaked).toEqual([]);
  });

  it("when founderIsPaidYear1=true, the row starts in Year 1 with no deferral note", () => {
    const payload = buildModelDataPayload({
      ...EMPTY_MODEL,
      founderIsPaidYear1: true,
      founderAnnualCompensation: 80000,
      founderCompensationBeginsYear: 1,
    });
    const founder = staffingRows(payload).find((r) => r.id === "staff_founder");

    expect(founder).toBeDefined();
    expect(founder!.startYear).toBe(1);
    expect(founder!.notes).toBe("");
  });

  it("clamps an out-of-range beginsYear into the 1..5 window", () => {
    const payload = buildModelDataPayload(deferredModel(99));
    const founder = staffingRows(payload).find((r) => r.id === "staff_founder");

    expect(founder).toBeDefined();
    expect(founder!.startYear).toBe(5);
  });

  it("omits the founder row entirely when compensation is 0", () => {
    const payload = buildModelDataPayload({
      ...EMPTY_MODEL,
      founderIsPaidYear1: false,
      founderAnnualCompensation: 0,
      founderCompensationBeginsYear: 2,
    });
    const founder = staffingRows(payload).find((r) => r.id === "staff_founder");
    expect(founder).toBeUndefined();
  });
});
