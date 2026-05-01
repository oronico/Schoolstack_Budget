import { describe, expect, it } from "vitest";
import {
  computeDecisionImpact,
  type DecisionInputs,
} from "../decision-flows";
import type { FullModelData } from "@/pages/model-wizard/schema";

// --- Test model builder ----------------------------------------------------
//
// Mirrors the helper in decision-flows.test.ts / scenario-engine.test.ts so
// these specs exercise `computeDecisionImpact` end to end. We test the
// (private) `genDecisionNudges` helper through its only public caller — that
// way the assertions stay anchored on the warnings founders actually see in
// the planner.
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
    openingBalances: {
      cash: 50_000,
      ...(overrides.openingBalances as Record<string, unknown> || {}),
    },
    tuitionEscalation: overrides.tuitionEscalation || undefined,
  } as unknown as FullModelData;
}

type NudgeShape = { signal: string; label: string; message: string };
const findNudge = (nudges: NudgeShape[], substr: string) =>
  nudges.find((n) => n.label.includes(substr));
const hasNudge = (nudges: NudgeShape[], substr: string) =>
  nudges.some((n) => n.label.includes(substr));

// Models a flat-revenue / flat-expense school used by the year-5 net-income
// branches. Net income is steady and positive so we can isolate one branch
// at a time.
function flatProfitableModel(revenue: number, expense: number, openingCash = 50_000) {
  return buildBaseModel({
    openingBalances: { cash: openingCash },
    revenueRows: [
      {
        id: "r1",
        enabled: true,
        category: "other_revenue",
        driverType: "annual_fixed",
        amounts: [revenue, revenue, revenue, revenue, revenue],
      },
    ],
    expenseRows: [
      {
        id: "e1",
        enabled: true,
        category: "instructional_supplies",
        driverType: "annual_fixed",
        amounts: [expense, expense, expense, expense, expense],
      },
    ],
  });
}

// Helper for the DSCR-band tests: fixed revenue + a $1M / 0% / 10y loan
// (annual debt service of $100k) and a baseline rent. Tweaking the rent shifts
// adjusted DSCR into the band we want to exercise.
function dataWithDebt(monthlyRent = 5_000, openingCash = 500_000) {
  return buildBaseModel({
    openingBalances: { cash: openingCash },
    revenueRows: [
      {
        id: "r1",
        enabled: true,
        category: "other_revenue",
        driverType: "annual_fixed",
        amounts: [200_000, 200_000, 200_000, 200_000, 200_000],
      },
    ],
    expenseRows: [
      {
        id: "rent",
        enabled: true,
        category: "occupancy_facility",
        driverType: "monthly",
        amounts: [monthlyRent, monthlyRent, monthlyRent, monthlyRent, monthlyRent],
        escalationRate: 0,
      },
    ],
    capitalAndDebtRows: [
      {
        id: "cd1",
        enabled: true,
        isLoan: true,
        loanPrincipal: 1_000_000,
        loanRate: 0,
        loanTermYears: 10,
        driverType: "annual_fixed",
        amounts: [0, 0, 0, 0, 0],
      },
    ],
  });
}

// --- Year 5 net income branches ---------------------------------------------

describe("genDecisionNudges: year 5 net income branches", () => {
  it("adds a green 'Year 5 net income rises' nudge when add_program lifts year 5", () => {
    // Base NI = 500k/y; add_program adds +100k/y with no early cost so this
    // case isolates the positive-delta branch (no runway / break-even / red).
    const data = flatProfitableModel(1_000_000, 500_000);
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "STEM",
        annualTuition: 10_000,
        enrollment: [10, 10, 10, 10, 10],
      },
    };
    const { nudges, deltas } = computeDecisionImpact(data, decision);
    expect(deltas.netIncome[4]).toBe(100_000);
    const rises = findNudge(nudges, "Year 5 net income rises");
    expect(rises?.signal).toBe("green");
    expect(rises?.message).toContain("$100,000");
    // No "declines" or "negative" nudges in the same run.
    expect(hasNudge(nudges, "Year 5 net income declines")).toBe(false);
    expect(hasNudge(nudges, "Year 5 net income is negative")).toBe(false);
  });

  it("adds an amber 'Year 5 net income declines' nudge when year 5 falls but stays positive", () => {
    // Big buffer so adjusted Y5 stays positive even after the new cost.
    const data = flatProfitableModel(1_000_000, 500_000);
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "Atelier",
        annualTuition: 0,
        enrollment: [0, 0, 0, 0, 0],
        addedAnnualSpace: 50_000,
      },
    };
    const { nudges, adjusted } = computeDecisionImpact(data, decision);
    expect(adjusted.netIncome[4]).toBeGreaterThan(0);
    const decline = findNudge(nudges, "Year 5 net income declines");
    expect(decline?.signal).toBe("amber");
    // Message reports the absolute drop, e.g., "$50,000".
    expect(decline?.message).toContain("$50,000");
    expect(hasNudge(nudges, "Year 5 net income is negative")).toBe(false);
  });

  it("adds a red 'Year 5 net income is negative' nudge when adjusted year 5 dips below zero", () => {
    // Base NI = 50k/y, addedAnnualSpace = 100k/y → adjusted NI = -50k/y.
    const data = flatProfitableModel(100_000, 50_000);
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "Heavy",
        annualTuition: 0,
        enrollment: [0, 0, 0, 0, 0],
        addedAnnualSpace: 100_000,
      },
    };
    const { nudges, adjusted } = computeDecisionImpact(data, decision);
    expect(adjusted.netIncome[4]).toBeLessThan(0);
    const neg = findNudge(nudges, "Year 5 net income is negative");
    expect(neg?.signal).toBe("red");
    expect(neg?.message).toContain("$50,000");
  });
});

// --- Cash-runway shrinkage ---------------------------------------------------

describe("genDecisionNudges: cash-runway shrinkage", () => {
  it("emits an amber 'Cash runway shrinks' nudge when adjusted runway loses more than 3 months", () => {
    // Base NI is +100k/y → runway saturates at 60. Heavy added cost flips the
    // adjusted run negative so the runway delta is well under -3.
    const data = flatProfitableModel(200_000, 100_000, 50_000);
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "Burn",
        annualTuition: 0,
        enrollment: [0, 0, 0, 0, 0],
        addedAnnualSpace: 200_000,
      },
    };
    const { nudges, deltas } = computeDecisionImpact(data, decision);
    expect(deltas.cashRunwayDeltaMonths).toBeLessThan(-3);
    const shrink = findNudge(nudges, "Cash runway shrinks");
    expect(shrink?.signal).toBe("amber");
    expect(shrink?.message).toContain("months of cash cushion");
  });
});

// --- Break-even shifts -------------------------------------------------------

describe("genDecisionNudges: break-even shifts", () => {
  it("emits an amber 'Break-even pushes out' nudge when the added program delays break-even", () => {
    // Base profitable from Y1. Add a program whose space cost runs flat for
    // five years but whose enrollment ramps starting Y3 — that pushes early
    // years negative and break-even out to Y3.
    const data = flatProfitableModel(120_000, 100_000, 200_000);
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "Late bloomer",
        annualTuition: 500,
        enrollment: [0, 0, 100, 200, 200],
        addedAnnualSpace: 50_000,
      },
    };
    const { nudges, base, adjusted } = computeDecisionImpact(data, decision);
    expect(base.breakEvenYear).toBe(1);
    expect(adjusted.breakEvenYear).toBe(3);
    const push = findNudge(nudges, "Break-even pushes out");
    expect(push?.signal).toBe("amber");
    expect(push?.message).toContain("2 year");
  });

  it("emits a green 'Break-even arrives sooner' nudge when the added program closes the gap", () => {
    // Base limps to Y4 break-even (-50k for years 1-3, then 0). A strong
    // add_program covers the gap immediately so adjusted breaks even Y1.
    const data = buildBaseModel({
      openingBalances: { cash: 500_000 },
      revenueRows: [
        {
          id: "r1",
          enabled: true,
          category: "other_revenue",
          driverType: "annual_fixed",
          amounts: [50_000, 50_000, 50_000, 100_000, 100_000],
        },
      ],
      expenseRows: [
        {
          id: "e1",
          enabled: true,
          category: "instructional_supplies",
          driverType: "annual_fixed",
          amounts: [100_000, 100_000, 100_000, 100_000, 100_000],
        },
      ],
    });
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "Cash cow",
        annualTuition: 1_000,
        enrollment: [200, 200, 200, 200, 200],
      },
    };
    const { nudges, base, adjusted } = computeDecisionImpact(data, decision);
    expect(base.breakEvenYear).toBe(4);
    expect(adjusted.breakEvenYear).toBe(1);
    const pull = findNudge(nudges, "Break-even arrives sooner");
    expect(pull?.signal).toBe("green");
    expect(pull?.message).toContain("3 year");
  });
});

// --- Add-program-only branches ----------------------------------------------

describe("genDecisionNudges: add_program-only branches", () => {
  it("emits the 'Profitable, but watch year 1 cash' nudge when year 5 rises but cash dips", () => {
    // Big late revenue + heavy fixed annual space cost: Y1-3 dip negative,
    // Y4-5 surge so yr5Delta > 0 while cashRunwayDeltaMonths < 0.
    const data = flatProfitableModel(100_000, 0, 50_000);
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "Slow start",
        annualTuition: 5_000,
        enrollment: [0, 0, 0, 50, 100],
        addedAnnualSpace: 150_000,
      },
    };
    const { nudges, deltas } = computeDecisionImpact(data, decision);
    expect(deltas.netIncome[4]).toBeGreaterThan(0);
    expect(deltas.cashRunwayDeltaMonths).toBeLessThan(0);
    const watch = findNudge(nudges, "Profitable, but watch year 1 cash");
    expect(watch?.signal).toBe("amber");
    expect(watch?.message).toMatch(/draws down cash short term/);
  });

  it("emits 'Staffing not yet modeled' when add_program flags staffing as TBD", () => {
    const data = flatProfitableModel(500_000, 200_000);
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "Music",
        annualTuition: 5_000,
        enrollment: [10, 10, 10, 10, 10],
        addedFte: 2,
        addedFteSalary: 60_000,
        staffingTbd: true,
      },
    };
    const { nudges } = computeDecisionImpact(data, decision);
    const staff = findNudge(nudges, "Staffing not yet modeled");
    expect(staff?.signal).toBe("amber");
    expect(staff?.message).toMatch(/marked staffing as TBD/i);
  });
});

// --- Evaluate-site DSCR bands ------------------------------------------------

describe("genDecisionNudges: evaluate_site DSCR bands", () => {
  // Base model: revenue $200k/y, baseline rent $5k/mo ($60k/y), $100k/y debt
  // service → base NI = $40k → base DSCR = 1.40×. Each test bumps the rent so
  // the worst adjusted DSCR lands in the target band.

  it("emits a red 'DSCR falls below 1.00×' nudge when adjusted DSCR drops below 1.00", () => {
    const data = dataWithDebt(5_000);
    // newMonthlyRent $9k → +$36k/y rent → adj NI = -$8k → DSCR ≈ 0.92×.
    const { nudges, adjusted } = computeDecisionImpact(data, {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 9_000 },
    });
    expect(adjusted.dscr[0]).toBeLessThan(1.0);
    const dscr = findNudge(nudges, "DSCR falls below 1.00×");
    expect(dscr?.signal).toBe("red");
    expect(dscr?.label).toContain("Year 1");
    expect(dscr?.message).toMatch(/lenders see this as cash flow that can't service debt/);
    // Once we're in the < 1.00 branch the borderline / weakens variants
    // should not also fire.
    expect(hasNudge(nudges, "below most lender thresholds")).toBe(false);
    expect(hasNudge(nudges, "borderline for school lenders")).toBe(false);
    expect(hasNudge(nudges, "Site weakens DSCR")).toBe(false);
  });

  it("emits a red 'below most lender thresholds' nudge when DSCR sits between 1.00 and 1.20", () => {
    const data = dataWithDebt(5_000);
    // newMonthlyRent $7k → adj NI = $16k → DSCR = 1.16×.
    const { nudges, adjusted } = computeDecisionImpact(data, {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 7_000 },
    });
    expect(adjusted.dscr[0]).toBeGreaterThanOrEqual(1.0);
    expect(adjusted.dscr[0]).toBeLessThan(1.2);
    const dscr = findNudge(nudges, "below most lender thresholds");
    expect(dscr?.signal).toBe("red");
    expect(dscr?.label).toContain("1.16×");
    expect(dscr?.message).toMatch(/1\.20–1\.25× minimum DSCR/);
  });

  it("emits an amber 'borderline for school lenders' nudge when DSCR sits between 1.20 and 1.25", () => {
    const data = dataWithDebt(5_000);
    // newMonthlyRent $6,300 → adj NI = $24,400 → DSCR = 1.24×.
    const { nudges, adjusted } = computeDecisionImpact(data, {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 6_300 },
    });
    expect(adjusted.dscr[0]).toBeGreaterThanOrEqual(1.2);
    expect(adjusted.dscr[0]).toBeLessThan(1.25);
    const dscr = findNudge(nudges, "borderline for school lenders");
    expect(dscr?.signal).toBe("amber");
    expect(dscr?.label).toContain("1.24×");
    expect(dscr?.message).toMatch(/1\.25× or better/);
  });

  it("emits an amber 'Site weakens DSCR' nudge when adjusted DSCR stays above 1.25 but drops at least 0.05×", () => {
    const data = dataWithDebt(5_000);
    // newMonthlyRent $5,500 → adj NI = $34k → DSCR = 1.34× (drop = 0.06).
    const { nudges, adjusted, base } = computeDecisionImpact(data, {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 5_500 },
    });
    expect(adjusted.dscr[0]).toBeGreaterThanOrEqual(1.25);
    expect(base.dscr[0] - adjusted.dscr[0]).toBeGreaterThanOrEqual(0.05);
    const weaken = findNudge(nudges, "Site weakens DSCR");
    expect(weaken?.signal).toBe("amber");
    expect(weaken?.label).toContain("Year 1");
    expect(weaken?.message).toMatch(/Coverage holds above lender thresholds/);
  });
});

// --- Evaluate-site cash runway -----------------------------------------------

describe("genDecisionNudges: evaluate_site runway", () => {
  it("emits a red 'Cash runway under 6 months' nudge when adjusted runway dips below 6", () => {
    // Same DSCR fixture but with a thin opening cash buffer ($50k). Heavy
    // rent bump makes adjusted NI deeply negative so cash burns out fast.
    const data = dataWithDebt(5_000, 50_000);
    const { nudges, adjusted } = computeDecisionImpact(data, {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 20_000 },
    });
    expect(adjusted.cashRunwayMonths).toBeLessThan(6);
    const runway = findNudge(nudges, "Cash runway under 6 months");
    expect(runway?.signal).toBe("red");
    expect(runway?.message).toMatch(/60–90 days of operating cash/);
  });
});

// --- Change-enrollment staffing strain --------------------------------------

describe("genDecisionNudges: change_enrollment staffing strain", () => {
  it("emits an amber 'Enrollment shift may strain your staffing plan' nudge for a large positive shift", () => {
    // Base totals 700 students; threshold is max(20, 70) = 70. A +100-student
    // shift over five years exceeds it, and we have a baseline FTE count so
    // the message embeds a concrete students-per-FTE figure.
    const data = buildBaseModel({
      revenueRows: [
        {
          id: "r1",
          enabled: true,
          category: "tuition_and_fees",
          driverType: "per_student",
          amounts: [10_000, 10_000, 10_000, 10_000, 10_000],
        },
      ],
      staffingRows: [
        {
          id: "s1",
          roleName: "Teacher",
          functionCategory: "instructional",
          employmentType: "full_time",
          fte: 8,
          annualizedRate: 50_000,
        },
      ],
    });
    const { nudges } = computeDecisionImpact(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [20, 20, 20, 20, 20] },
    });
    const strain = findNudge(nudges, "Enrollment shift may strain your staffing plan");
    expect(strain?.signal).toBe("amber");
    expect(strain?.message).toContain("100 more students");
    expect(strain?.message).toContain("students per FTE");
  });
});

// --- Baseline fallback -------------------------------------------------------

describe("genDecisionNudges: baseline fallback", () => {
  it("falls back to the green 'No major shifts' nudge when nothing else triggers", () => {
    // change_enrollment with a zero delta is a no-op (overrides drop out and
    // applyWhatIfOverrides returns the same data reference), so the
    // adjusted metrics match the base exactly and every other branch passes.
    const data = flatProfitableModel(100_000, 50_000);
    const { nudges } = computeDecisionImpact(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    expect(nudges).toHaveLength(1);
    expect(nudges[0]).toMatchObject({
      signal: "green",
      label: "No major shifts",
    });
    expect(nudges[0].message).toMatch(/doesn't materially move/);
  });
});
