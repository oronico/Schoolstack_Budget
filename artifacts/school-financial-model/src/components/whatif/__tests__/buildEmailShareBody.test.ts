import { describe, expect, it } from "vitest";
import { buildEmailShareBody } from "../WhatIfDrawer";
import type { WhatIfImpact, WhatIfOverrides } from "@/lib/whatif-engine";

const SHARE_URL = "https://example.test/#wi=abc";
const BASE_ENROLLMENT = [100, 120, 140, 160, 180];
const BASE_RETENTION = 85;

function makeImpact(overrides: Partial<WhatIfImpact> = {}): WhatIfImpact {
  const baseDscr = [1.5, 1.5, 1.5, 1.5, 1.5];
  const adjDscr = [1.5, 1.5, 1.5, 1.5, 1.5];
  return {
    base: {
      enrollment: [],
      revenue: [],
      staffingCost: [],
      facilityCost: [],
      opex: [],
      totalExpenses: [],
      netIncome: [],
      netMargin: [],
      dscr: baseDscr,
      staffingPctOfRevenue: [],
      breakEvenYear: null,
      cashRunwayMonths: 12,
      reserveMonths: 3,
      cashPosition: [],
    },
    adjusted: {
      enrollment: [],
      revenue: [],
      staffingCost: [],
      facilityCost: [],
      opex: [],
      totalExpenses: [],
      netIncome: [],
      netMargin: [],
      dscr: adjDscr,
      staffingPctOfRevenue: [],
      breakEvenYear: null,
      cashRunwayMonths: 12,
      reserveMonths: 3,
      cashPosition: [],
    },
    deltas: {
      revenue: [],
      netIncome: [],
      netIncomePct: [],
      dscr: [],
      breakEvenYearShift: 0,
      cashRunwayDeltaMonths: 0,
      fitOutYear1: 0,
    },
    detectedRentRowId: null,
    detectedBaseMonthlyRent: null,
    ...overrides,
  };
}

function build(
  overrides: WhatIfOverrides,
  impact: WhatIfImpact = makeImpact(),
): string {
  return buildEmailShareBody({
    shareUrl: SHARE_URL,
    overrides,
    impact,
    baseEnrollment: BASE_ENROLLMENT,
    baseRetention: BASE_RETENTION,
  });
}

describe("buildEmailShareBody — overrides branches", () => {
  it("falls back to a friendly placeholder when no overrides are applied", () => {
    const body = build({});
    expect(body).toContain(
      "No overrides applied yet — opening the link will show the live planner.",
    );
    expect(body).not.toContain("Changes in this what-if:");
    expect(body).not.toContain("Headline impact:");
    expect(body.trim().endsWith(`Open the live planner: ${SHARE_URL}`)).toBe(
      true,
    );
  });

  it("renders the monthly-rent override with the detected base rent", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({ detectedBaseMonthlyRent: 5500 }),
    );
    expect(body).toContain("Changes in this what-if:");
    expect(body).toContain("- Monthly rent: $7,000 (was $5,500)");
  });

  it("omits the 'was' suffix when no base rent was detected", () => {
    const body = build({ monthlyRent: 7000 });
    expect(body).toContain("- Monthly rent: $7,000");
    expect(body).not.toContain("(was");
  });

  it("renders enrollment deltas only for years that changed and shows base→new", () => {
    const body = build({ enrollmentDelta: [10, 0, -5, 0, 0] });
    expect(body).toContain(
      "- Enrollment: Y1 +10 (100 → 110), Y3 -5 (140 → 135) students",
    );
  });

  it("ignores an enrollment override that is all zeros", () => {
    const body = build({ enrollmentDelta: [0, 0, 0, 0, 0] });
    expect(body).toContain(
      "No overrides applied yet — opening the link will show the live planner.",
    );
  });

  it("renders the retention override with the previous rate", () => {
    const body = build({ retentionRate: 75 });
    expect(body).toContain("- Retention: 75% (was 85%)");
  });

  it("renders a positive tuition delta with a + sign", () => {
    const body = build({ tuitionDeltaPerStudent: 500 });
    expect(body).toContain("- Tuition: +$500/student");
  });

  it("renders a negative tuition delta with a - sign and absolute amount", () => {
    const body = build({ tuitionDeltaPerStudent: -250 });
    expect(body).toContain("- Tuition: -$250/student");
  });

  it("skips a tuition override that is exactly zero", () => {
    const body = build({ tuitionDeltaPerStudent: 0 });
    expect(body).toContain(
      "No overrides applied yet — opening the link will show the live planner.",
    );
  });

  it("renders the one-time fit-out override on its own line", () => {
    const body = build({ oneTimeFitOut: 75000 });
    expect(body).toContain("- One-time fit-out (Y1): $75,000");
  });

  it("skips a fit-out override that is exactly zero", () => {
    const body = build({ oneTimeFitOut: 0 });
    expect(body).toContain(
      "No overrides applied yet — opening the link will show the live planner.",
    );
  });

  it("combines multiple override branches in one summary", () => {
    const body = build(
      {
        monthlyRent: 8000,
        enrollmentDelta: [5, 0, 0, 0, 0],
        retentionRate: 90,
        tuitionDeltaPerStudent: 300,
        oneTimeFitOut: 25000,
      },
      makeImpact({ detectedBaseMonthlyRent: 6000 }),
    );
    expect(body).toContain("- Monthly rent: $8,000 (was $6,000)");
    expect(body).toContain("- Enrollment: Y1 +5 (100 → 105) students");
    expect(body).toContain("- Retention: 90% (was 85%)");
    expect(body).toContain("- Tuition: +$300/student");
    expect(body).toContain("- One-time fit-out (Y1): $25,000");
  });
});

describe("buildEmailShareBody — headline impact", () => {
  it("surfaces the worst-affected DSCR year, not just Y1", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        base: {
          ...makeImpact().base,
          dscr: [1.5, 1.4, 1.3, 1.2, 1.1],
        },
        adjusted: {
          ...makeImpact().adjusted,
          dscr: [1.48, 1.35, 1.1, 1.18, 1.09],
        },
      }),
    );
    // Year 3 has the largest absolute swing (1.3 → 1.1 = 0.20).
    expect(body).toContain("Headline impact:");
    expect(body).toContain("- DSCR Y3: 1.30 → 1.10");
    expect(body).not.toContain("DSCR Y1:");
  });

  it("suppresses the DSCR line when the swing is below the 0.05 threshold", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        base: { ...makeImpact().base, dscr: [1.5, 1.5, 1.5, 1.5, 1.5] },
        adjusted: {
          ...makeImpact().adjusted,
          dscr: [1.51, 1.49, 1.5, 1.5, 1.5],
        },
      }),
    );
    expect(body).not.toContain("DSCR Y");
  });

  it("ignores non-finite DSCR values when picking the worst year", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        base: {
          ...makeImpact().base,
          dscr: [Number.NaN, 1.4, 1.3, 1.2, 1.1],
        },
        adjusted: {
          ...makeImpact().adjusted,
          dscr: [Number.POSITIVE_INFINITY, 1.25, 1.28, 1.18, 1.09],
        },
      }),
    );
    // Year 2 has the largest finite swing (1.4 → 1.25 = 0.15).
    expect(body).toContain("- DSCR Y2: 1.40 → 1.25");
  });

  it("renders a positive break-even shift with a + sign and pluralizes years", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        deltas: {
          ...makeImpact().deltas,
          breakEvenYearShift: 2,
        },
      }),
    );
    expect(body).toContain("- Break-even shifts +2 years");
  });

  it("renders a single-year break-even shift in the singular", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        deltas: { ...makeImpact().deltas, breakEvenYearShift: 1 },
      }),
    );
    expect(body).toContain("- Break-even shifts +1 year");
  });

  it("renders a negative break-even shift without a leading + sign", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        deltas: { ...makeImpact().deltas, breakEvenYearShift: -1 },
      }),
    );
    expect(body).toContain("- Break-even shifts -1 year");
  });

  it("omits the break-even line when the shift is null or zero", () => {
    const nullBody = build(
      { monthlyRent: 7000 },
      makeImpact({
        deltas: { ...makeImpact().deltas, breakEvenYearShift: null },
      }),
    );
    const zeroBody = build(
      { monthlyRent: 7000 },
      makeImpact({
        deltas: { ...makeImpact().deltas, breakEvenYearShift: 0 },
      }),
    );
    expect(nullBody).not.toContain("Break-even shifts");
    expect(zeroBody).not.toContain("Break-even shifts");
  });

  it("renders a positive cash-runway delta with a + sign and 'mo' suffix", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        deltas: { ...makeImpact().deltas, cashRunwayDeltaMonths: 3.4 },
      }),
    );
    expect(body).toContain("- Cash runway: +3 mo");
  });

  it("renders a negative cash-runway delta without a + sign", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        deltas: { ...makeImpact().deltas, cashRunwayDeltaMonths: -4.6 },
      }),
    );
    // toFixed(0) on -4.6 rounds to "-5".
    expect(body).toContain("- Cash runway: -5 mo");
  });

  it("suppresses the cash-runway line when the delta is below 1 month", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        deltas: { ...makeImpact().deltas, cashRunwayDeltaMonths: 0.4 },
      }),
    );
    expect(body).not.toContain("Cash runway:");
  });

  it("renders the Y1 fit-out outlay as its own headline impact line", () => {
    const body = build(
      { oneTimeFitOut: 50000 },
      makeImpact({
        deltas: { ...makeImpact().deltas, fitOutYear1: 50000 },
      }),
    );
    expect(body).toContain("- Y1 fit-out outlay: $50,000");
  });

  it("includes a 'Headline impact:' header only when at least one impact line fires", () => {
    const body = build({ monthlyRent: 7000 });
    // Default impact has zero deltas everywhere → no headline section.
    expect(body).not.toContain("Headline impact:");
    expect(body).toContain("- Monthly rent: $7,000");
    expect(body.trim().endsWith(`Open the live planner: ${SHARE_URL}`)).toBe(
      true,
    );
  });

  it("always closes with the share URL on its own line", () => {
    const body = build(
      { monthlyRent: 7000 },
      makeImpact({
        deltas: {
          ...makeImpact().deltas,
          breakEvenYearShift: 1,
          cashRunwayDeltaMonths: -2,
        },
      }),
    );
    const lines = body.split("\n");
    expect(lines[lines.length - 1]).toBe(`Open the live planner: ${SHARE_URL}`);
  });
});
