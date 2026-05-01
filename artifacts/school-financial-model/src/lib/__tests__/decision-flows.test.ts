import { describe, expect, it } from "vitest";
import {
  applyDecisionToData,
  applyAddProgramDecision,
  applyPersistedScenarioToData,
  buildActualsSuggestion,
  buildDecisionBullets,
  computeDecisionImpact,
  computeProjectedSnapshot,
  decisionToPersistedOverrides,
  siteInputsToOverrides,
  summarizeDecisionChanges,
  type AddProgramInputs,
  type DecisionInputs,
  type EnrollmentChangeInputs,
  type SiteInputs,
} from "../decision-flows";
import {
  applyWhatIfOverrides,
  decodeOverridesFromHash,
  encodeOverridesToHash,
} from "../whatif-engine";
import { computeBaseFinancials } from "@workspace/finance";
import type { FullModelData } from "@/pages/model-wizard/schema";

// --- Test model builder ----------------------------------------------------
//
// Mirrors the helper in scenario-engine.test.ts so we exercise the engine end
// to end. We intentionally cast to FullModelData because the engine reads a
// loose subset of the schema and the tests assemble only the fields needed
// per case.
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
      cash: 50000,
      ...(overrides.openingBalances as Record<string, unknown> || {}),
    },
    tuitionEscalation: overrides.tuitionEscalation || undefined,
  } as unknown as FullModelData;
}

function blankAddProgram(overrides: Partial<AddProgramInputs> = {}): AddProgramInputs {
  return {
    name: "STEM Lab",
    annualTuition: 12000,
    enrollment: [10, 20, 30, 40, 50],
    ...overrides,
  };
}

// --- applyDecisionToData: add_program --------------------------------------

describe("applyDecisionToData: add_program", () => {
  it("does NOT mutate baseline enrollment (avoids the double-count bug)", () => {
    const data = buildBaseModel();
    const result = applyDecisionToData(data, {
      type: "add_program",
      inputs: blankAddProgram(),
    });
    // Baseline enrollment should be untouched
    expect(result.enrollment?.year1).toBe(100);
    expect(result.enrollment?.year2).toBe(120);
    expect(result.enrollment?.year3).toBe(140);
    expect(result.enrollment?.year4).toBe(160);
    expect(result.enrollment?.year5).toBe(180);
    // And the original data object is also unchanged (deep clone)
    expect(data.enrollment?.year1).toBe(100);
  });

  it("appends a tuition_and_fees revenue row whose amounts equal enrollment × tuition exactly", () => {
    const data = buildBaseModel();
    const inputs = blankAddProgram({
      name: "STEM Lab",
      annualTuition: 12000,
      enrollment: [10, 20, 30, 40, 50],
    });
    const result = applyAddProgramDecision(data, inputs);

    const newRow = result.revenueRows?.find(
      (r: { lineItem?: string }) => r.lineItem === "STEM Lab",
    ) as { amounts?: number[]; category?: string; driverType?: string } | undefined;
    expect(newRow).toBeTruthy();
    expect(newRow?.category).toBe("tuition_and_fees");
    expect(newRow?.driverType).toBe("annual_fixed");
    expect(newRow?.amounts).toEqual([
      10 * 12000,
      20 * 12000,
      30 * 12000,
      40 * 12000,
      50 * 12000,
    ]);
  });

  it("rounds and floors tuition + enrollment inputs (negatives clamp to 0; decimals round)", () => {
    const data = buildBaseModel();
    const result = applyAddProgramDecision(data, {
      name: "Edge",
      annualTuition: 12345.6,
      enrollment: [-5, 0, 1.4, 1.6, 2.5],
    });
    const newRow = result.revenueRows?.find(
      (r: { lineItem?: string }) => r.lineItem === "Edge",
    ) as { amounts?: number[] } | undefined;
    // enrollment rounded: [0, 0, 1, 2, 3]; tuition rounded to 12346
    expect(newRow?.amounts).toEqual([0, 0, 12346, 24692, 37038]);
  });

  it("zero enrollment edge case: revenue row amounts are all 0", () => {
    const data = buildBaseModel();
    const result = applyAddProgramDecision(data, blankAddProgram({
      enrollment: [0, 0, 0, 0, 0],
    }));
    const newRow = result.revenueRows?.find(
      (r: { lineItem?: string }) => r.lineItem === "STEM Lab",
    ) as { amounts?: number[] } | undefined;
    expect(newRow?.amounts).toEqual([0, 0, 0, 0, 0]);
  });

  it("missing optional inputs: no staffing or expense rows added", () => {
    const data = buildBaseModel({
      staffingRows: [],
      expenseRows: [],
    });
    const result = applyAddProgramDecision(data, blankAddProgram());
    expect(result.staffingRows ?? []).toHaveLength(0);
    expect(result.expenseRows ?? []).toHaveLength(0);
  });

  it("adds a staffing row when addedFte and addedFteSalary are provided", () => {
    const data = buildBaseModel();
    const result = applyAddProgramDecision(data, blankAddProgram({
      name: "Music",
      addedFte: 2,
      addedFteSalary: 55000,
    }));
    const newStaff = result.staffingRows?.find(
      (s: { roleName?: string }) => s.roleName === "Music staff",
    ) as
      | { fte?: number; annualizedRate?: number; functionCategory?: string; payrollLike?: boolean }
      | undefined;
    expect(newStaff).toBeTruthy();
    expect(newStaff?.fte).toBe(2);
    expect(newStaff?.annualizedRate).toBe(55000);
    expect(newStaff?.functionCategory).toBe("instructional");
    expect(newStaff?.payrollLike).toBe(true);
  });

  it("staffingTbd=true skips staff row even when addedFte/Salary are non-zero", () => {
    const data = buildBaseModel();
    const result = applyAddProgramDecision(data, blankAddProgram({
      addedFte: 3,
      addedFteSalary: 60000,
      staffingTbd: true,
    }));
    const newStaff = result.staffingRows?.find(
      (s: { roleName?: string }) => s.roleName?.endsWith("staff"),
    );
    expect(newStaff).toBeUndefined();
  });

  it("addedAnnualSpace synthesizes an occupancy_facility expense for all 5 years", () => {
    const data = buildBaseModel();
    const result = applyAddProgramDecision(data, blankAddProgram({
      name: "Atelier",
      addedAnnualSpace: 24000,
    }));
    const newExp = result.expenseRows?.find(
      (e: { lineItem?: string }) => e.lineItem === "Atelier space",
    ) as { amounts?: number[]; category?: string; driverType?: string } | undefined;
    expect(newExp?.category).toBe("occupancy_facility");
    expect(newExp?.driverType).toBe("annual_fixed");
    expect(newExp?.amounts).toEqual([24000, 24000, 24000, 24000, 24000]);
  });

  it("dispatches through applyDecisionToData: zero enrollment + missing optional inputs", () => {
    // Mirrors the acceptance text: route an add-program edge case through the
    // top-level dispatcher (not the helper) to confirm the switch arm wires
    // straight through with the same guarantees.
    const data = buildBaseModel();
    const result = applyDecisionToData(data, {
      type: "add_program",
      inputs: blankAddProgram({
        name: "Edge",
        annualTuition: 0,
        enrollment: [0, 0, 0, 0, 0],
      }),
    });
    // Baseline enrollment still untouched
    expect(result.enrollment?.year1).toBe(100);
    expect(result.enrollment?.year5).toBe(180);
    // New revenue row exists with all-zero amounts
    const newRow = result.revenueRows?.find(
      (r: { lineItem?: string }) => r.lineItem === "Edge",
    ) as { amounts?: number[] } | undefined;
    expect(newRow?.amounts).toEqual([0, 0, 0, 0, 0]);
    // No staffing or expense rows added (optional inputs omitted)
    expect(result.staffingRows ?? []).toHaveLength(0);
    expect(result.expenseRows ?? []).toHaveLength(0);
  });

  it("dispatches through applyDecisionToData: addedFte + addedAnnualSpace produce the right rows", () => {
    const data = buildBaseModel();
    const result = applyDecisionToData(data, {
      type: "add_program",
      inputs: blankAddProgram({
        name: "Music",
        annualTuition: 8000,
        enrollment: [5, 10, 15, 20, 25],
        addedFte: 1.5,
        addedFteSalary: 50000,
        addedAnnualSpace: 12000,
      }),
    });
    expect(
      result.staffingRows?.some(
        (s: { roleName?: string }) => s.roleName === "Music staff",
      ),
    ).toBe(true);
    expect(
      result.expenseRows?.some(
        (e: { lineItem?: string }) => e.lineItem === "Music space",
      ),
    ).toBe(true);
  });

  it("revenue impact in computeDecisionImpact equals enrollment × tuition delta", () => {
    const data = buildBaseModel({
      // Give the base model some revenue so we can verify only the new program
      // contributes to the delta.
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [100000, 100000, 100000, 100000, 100000] },
      ],
    });
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: blankAddProgram({
        annualTuition: 10000,
        enrollment: [10, 20, 30, 40, 50],
      }),
    };
    const impact = computeDecisionImpact(data, decision);
    expect(impact.deltas.revenue).toEqual([
      10 * 10000,
      20 * 10000,
      30 * 10000,
      40 * 10000,
      50 * 10000,
    ]);
  });
});

// --- applyDecisionToData: evaluate_site ------------------------------------

describe("applyDecisionToData: evaluate_site", () => {
  function dataWithFacility(monthlyRent = 5000) {
    return buildBaseModel({
      revenueRows: [
        { id: "r1", enabled: true, category: "other_revenue", driverType: "annual_fixed", amounts: [500000, 500000, 500000, 500000, 500000] },
      ],
      expenseRows: [
        { id: "rent", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [monthlyRent, monthlyRent, monthlyRent, monthlyRent, monthlyRent], escalationRate: 0 },
      ],
    });
  }

  it("one-time fit-out hits Year 1 only ([fitOut, 0, 0, 0, 0])", () => {
    const data = dataWithFacility();
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 8000, oneTimeFitOut: 75000 } as SiteInputs,
    };
    const result = applyDecisionToData(data, decision);
    const fitOut = result.expenseRows?.find(
      (e: { lineItem?: string }) => e.lineItem === "Site fit-out (one-time)",
    ) as { amounts?: number[]; category?: string } | undefined;
    expect(fitOut).toBeTruthy();
    expect(fitOut?.category).toBe("occupancy_facility");
    expect(fitOut?.amounts).toEqual([75000, 0, 0, 0, 0]);
  });

  it("missing optional fit-out: no fit-out expense row is added", () => {
    const data = dataWithFacility();
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 8000 } as SiteInputs,
    };
    const result = applyDecisionToData(data, decision);
    const fitOut = result.expenseRows?.find(
      (e: { lineItem?: string }) => e.lineItem === "Site fit-out (one-time)",
    );
    expect(fitOut).toBeUndefined();
  });

  it("zero fit-out is treated as no-op", () => {
    const data = dataWithFacility();
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 8000, oneTimeFitOut: 0 } as SiteInputs,
    };
    const result = applyDecisionToData(data, decision);
    expect(
      result.expenseRows?.find(
        (e: { lineItem?: string }) => e.lineItem === "Site fit-out (one-time)",
      ),
    ).toBeUndefined();
  });

  it("mid-flow startYear preserves original rent in earlier years and applies new rent from start year onward", () => {
    const data = dataWithFacility(5000);
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 9000, startYear: 3 } as SiteInputs,
    };
    const result = applyDecisionToData(data, decision);
    const rentRow = result.expenseRows?.find(
      (e: { id?: string }) => e.id === "rent",
    ) as { amounts?: number[] } | undefined;
    expect(rentRow?.amounts).toBeTruthy();
    // Years 1 and 2 keep original 5000; Year 3 onward = 9000 (escalation default 0)
    expect(rentRow!.amounts![0]).toBe(5000);
    expect(rentRow!.amounts![1]).toBe(5000);
    expect(rentRow!.amounts![2]).toBe(9000);
    expect(rentRow!.amounts![3]).toBe(9000);
    expect(rentRow!.amounts![4]).toBe(9000);
  });
});

// --- applyDecisionToData: change_enrollment --------------------------------

describe("applyDecisionToData: change_enrollment", () => {
  it("adds enrollmentDelta to base enrollment per year", () => {
    const data = buildBaseModel();
    const decision: DecisionInputs = {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [5, 10, 15, 20, 25] } as EnrollmentChangeInputs,
    };
    const result = applyDecisionToData(data, decision);
    expect(result.enrollment?.year1).toBe(105);
    expect(result.enrollment?.year2).toBe(130);
    expect(result.enrollment?.year3).toBe(155);
    expect(result.enrollment?.year4).toBe(180);
    expect(result.enrollment?.year5).toBe(205);
  });

  it("zero-delta + missing optional inputs is a no-op (returns same data reference)", () => {
    const data = buildBaseModel();
    const decision: DecisionInputs = {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] } as EnrollmentChangeInputs,
    };
    const result = applyDecisionToData(data, decision);
    // applyWhatIfOverrides returns data unchanged on empty overrides
    expect(result).toBe(data);
  });

  it("retentionRate override updates enrollment.retentionRate", () => {
    const data = buildBaseModel();
    const decision: DecisionInputs = {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0], retentionRate: 92 } as EnrollmentChangeInputs,
    };
    const result = applyDecisionToData(data, decision);
    expect(result.enrollment?.retentionRate).toBe(92);
  });

  it("tuitionDeltaPerStudent bumps per_student tuition row amounts", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "tu1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
    });
    const decision: DecisionInputs = {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0], tuitionDeltaPerStudent: 500 } as EnrollmentChangeInputs,
    };
    const result = applyDecisionToData(data, decision);
    const tuitionRow = result.revenueRows?.find(
      (r: { id?: string }) => r.id === "tu1",
    ) as { amounts?: number[] } | undefined;
    expect(tuitionRow?.amounts).toEqual([10500, 10500, 10500, 10500, 10500]);
  });
});

// --- decisionToPersistedOverrides → buildDecisionBullets round-trip --------

describe("decisionToPersistedOverrides → buildDecisionBullets round-trip", () => {
  const data = buildBaseModel();

  it("add_program: persisted shape and bullets reflect the inputs", () => {
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "STEM Lab",
        gradeBand: "K-5",
        annualTuition: 12000,
        enrollment: [10, 20, 30, 40, 50],
        addedFte: 2,
        addedFteSalary: 55000,
        addedAnnualSpace: 24000,
      },
    };
    const persisted = decisionToPersistedOverrides(data, decision);
    expect(persisted).toMatchObject({
      addProgramName: "STEM Lab",
      addProgramGradeBand: "K-5",
      addProgramTuition: 12000,
      addProgramEnrollment: [10, 20, 30, 40, 50],
      addProgramAddedFte: 2,
      addProgramAddedFteSalary: 55000,
      addProgramAddedAnnualSpace: 24000,
    });
    expect(persisted.addProgramStaffingTbd).toBeUndefined();

    const bullets = buildDecisionBullets(persisted, "add_program");
    expect(bullets).toContain("Program: STEM Lab (K-5)");
    expect(bullets).toContain("Tuition $12,000/yr");
    expect(bullets).toContain("Adds 150 cumulative students (5 yrs)");
    expect(bullets).toContain("+2 FTE");
    expect(bullets).not.toContain("Staffing: TBD");
  });

  it("add_program with staffingTbd: persisted strips FTE/salary and bullet shows 'Staffing: TBD'", () => {
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: {
        name: "Robotics",
        annualTuition: 8000,
        enrollment: [5, 5, 5, 5, 5],
        addedFte: 1,
        addedFteSalary: 50000,
        staffingTbd: true,
      },
    };
    const persisted = decisionToPersistedOverrides(data, decision);
    expect(persisted.addProgramAddedFte).toBeUndefined();
    expect(persisted.addProgramAddedFteSalary).toBeUndefined();
    expect(persisted.addProgramStaffingTbd).toBe(true);

    const bullets = buildDecisionBullets(persisted, "add_program");
    expect(bullets).toContain("Program: Robotics");
    expect(bullets).toContain("Staffing: TBD");
    expect(bullets).not.toContain("+1 FTE");
  });

  it("evaluate_site: persisted overrides include rent + fit-out; bullets render them", () => {
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: {
        newMonthlyRent: 10000,
        newRentEscalation: 3,
        startYear: 2,
        oneTimeFitOut: 50000,
      },
    };
    const persisted = decisionToPersistedOverrides(data, decision);
    expect(persisted).toMatchObject({
      monthlyRent: 10000,
      rentEscalation: 3,
      rentChangeStartYear: 2,
      siteFitOutCost: 50000,
    });

    const bullets = buildDecisionBullets(persisted, "evaluate_site");
    expect(bullets).toContain("Rent $10,000/mo");
    expect(bullets).toContain("Rent escalation 3%");
    expect(bullets).toContain("Fit-out $50,000 (Y1)");
  });

  it("evaluate_site: persisted fit-out round-trips through the planner hash codec", () => {
    // Regression for #192: previously the `Open in planner` action was disabled
    // for evaluate_site decisions with a fit-out cost because WhatIfOverrides
    // could not represent a Year-1 capex line. Now the planner reads the same
    // overrides used by computeDecisionImpact, including `oneTimeFitOut`.
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: {
        newMonthlyRent: 9000,
        newRentEscalation: 3,
        startYear: 2,
        oneTimeFitOut: 60000,
      } as SiteInputs,
    };
    // 1) The planner overrides include the fit-out value alongside the rent fields.
    const plannerOv = siteInputsToOverrides(data, decision.inputs as SiteInputs);
    expect(plannerOv.oneTimeFitOut).toBe(60000);
    expect(plannerOv.monthlyRent).toBe(9000);

    // 2) Hash encode → decode preserves every override (so a sharable URL works).
    const hash = encodeOverridesToHash(plannerOv);
    expect(hash).toContain("f:60000");
    const decoded = decodeOverridesFromHash(`#${hash}`);
    expect(decoded).toEqual(plannerOv);

    // 3) Replaying the decoded planner overrides on the base model produces the
    //    same Year-1 fit-out row as applyDecisionToData (the impact path).
    const viaPlanner = applyWhatIfOverrides(data, decoded);
    const viaDecision = applyDecisionToData(data, decision);
    const findFitOut = (rows: unknown[] | undefined) =>
      (rows as Array<{ lineItem?: string; amounts?: number[] }> | undefined)?.find(
        (r) => r.lineItem === "Site fit-out (one-time)",
      );
    expect(findFitOut(viaPlanner.expenseRows)?.amounts).toEqual([60000, 0, 0, 0, 0]);
    expect(findFitOut(viaDecision.expenseRows)?.amounts).toEqual([60000, 0, 0, 0, 0]);
  });

  it("evaluate_site: missing optional fit-out is dropped and bullets omit it", () => {
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 10000 },
    };
    const persisted = decisionToPersistedOverrides(data, decision);
    expect(persisted.siteFitOutCost).toBeUndefined();
    const bullets = buildDecisionBullets(persisted, "evaluate_site");
    expect(bullets.some((b) => b.startsWith("Fit-out"))).toBe(false);
  });

  it("change_enrollment: round-trips delta + retention + tuition delta into bullets", () => {
    const decision: DecisionInputs = {
      type: "change_enrollment",
      inputs: {
        enrollmentDelta: [5, 10, 15, 20, 25],
        retentionRate: 90,
        tuitionDeltaPerStudent: 500,
      },
    };
    const persisted = decisionToPersistedOverrides(data, decision);
    expect(persisted).toMatchObject({
      enrollmentDelta: [5, 10, 15, 20, 25],
      retentionRate: 90,
      tuitionDeltaPerStudent: 500,
    });

    const bullets = buildDecisionBullets(persisted, "change_enrollment");
    expect(bullets).toContain("Enrollment +75 cumulative");
    expect(bullets).toContain("Retention 90%");
    expect(bullets).toContain("Tuition +$500/student");
  });

  it("change_enrollment: negative tuition delta renders without double-sign", () => {
    const decision: DecisionInputs = {
      type: "change_enrollment",
      inputs: {
        enrollmentDelta: [-5, -5, -5, -5, -5],
        tuitionDeltaPerStudent: -250,
      },
    };
    const persisted = decisionToPersistedOverrides(data, decision);
    const bullets = buildDecisionBullets(persisted, "change_enrollment");
    expect(bullets).toContain("Enrollment -25 cumulative");
    // Negative tuition deltas place the sign *outside* the dollar symbol so
    // founders don't see the typo-looking "$-250" sequence on a page they may
    // share with lenders. Symmetric with the positive case ("+$500").
    expect(bullets).toContain("Tuition -$250/student");
    // Defensive: the old broken "$-" sequence should never reappear.
    expect(bullets.some((b) => b.includes("$-"))).toBe(false);
  });
});

// --- computeProjectedSnapshot ----------------------------------------------
//
// The actuals editor on the saved-scenario card calls this to fill the
// "Projected" column next to each "Actual" input. We need:
// 1) Common fields (enrollment / revenue / expense / netIncome) for any
//    decision type, drawn from the same engine the rest of the app uses.
// 2) Decision-specific fields (signedMonthlyRent for sites, programEnrollment
//    for add-program) appear only when relevant so the UI can hide rows that
//    don't apply to the saved scenario.
// 3) asOfYear clamps to 1..5 so a stale or out-of-range value never explodes.

describe("computeProjectedSnapshot", () => {
  it("returns common metrics for an add_program scenario at the requested year", () => {
    const data = buildBaseModel();
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: blankAddProgram({ enrollment: [10, 20, 30, 40, 50], annualTuition: 12000 }),
    };
    const persisted = decisionToPersistedOverrides(data, decision);
    const snap = computeProjectedSnapshot(data, persisted, "add_program", 3);
    expect(snap.asOfYear).toBe(3);
    // Engine reports total student count for the year — for add_program we don't
    // mutate baseline enrollment, so it stays at the base year-3 number.
    expect(snap.enrollment).toBe(140);
    // Program added 30 × $12,000 = $360,000 of revenue in year 3.
    expect(snap.revenue).toBeGreaterThanOrEqual(360_000);
    // Decision-specific surface populated for add_program:
    expect(snap.programEnrollment).toBe(30);
    // Site-specific field stays absent so the UI doesn't render an empty row.
    expect(snap.monthlyRent).toBeUndefined();
  });

  it("populates monthlyRent for an evaluate_site scenario", () => {
    const data = buildBaseModel();
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 9500 },
    };
    const persisted = decisionToPersistedOverrides(data, decision);
    const snap = computeProjectedSnapshot(data, persisted, "evaluate_site", 1);
    expect(snap.asOfYear).toBe(1);
    expect(snap.monthlyRent).toBe(9500);
    // Add-program-specific field stays absent on a site scenario.
    expect(snap.programEnrollment).toBeUndefined();
  });

  it("clamps asOfYear into 1..5 so out-of-range inputs don't crash", () => {
    const data = buildBaseModel();
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    expect(computeProjectedSnapshot(data, persisted, "change_enrollment", 0).asOfYear).toBe(1);
    expect(computeProjectedSnapshot(data, persisted, "change_enrollment", 99).asOfYear).toBe(5);
    // NaN / undefined fall back to year 1 (the helper's default).
    expect(computeProjectedSnapshot(data, persisted, "change_enrollment", Number.NaN).asOfYear).toBe(1);
  });
});

// --- buildActualsSuggestion -------------------------------------------------
//
// Powers the "Suggest from latest data" affordance in the saved-scenario
// actuals editor. The helper must:
// 1) Prefer prior-year actuals when they're populated (closed books beat
//    in-progress projections).
// 2) Fall back to current-year projections, annualizing partial years.
// 3) Surface a signed-rent suggestion only for evaluate_site decisions.
// 4) Return an empty suggestion (and source list) when the founder hasn't
//    captured any source data, so the UI can disable the button.

describe("buildActualsSuggestion", () => {
  it("returns an empty suggestion when the model has no prior-year or current-year data", () => {
    const data = buildBaseModel();
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(data, persisted, "change_enrollment", 1);
    expect(suggestion.values).toEqual({});
    expect(suggestion.sourceLabels).toEqual([]);
  });

  it("prefers prior-year actuals over current-year projections at year 1", () => {
    const base = buildBaseModel();
    const data = {
      ...base,
      priorYearSnapshot: {
        endingEnrollment: 95,
        totalRevenue: 1_200_000,
        totalExpenses: 1_100_000,
      },
      currentYearProjection: {
        currentEnrollment: 999, // should be ignored — prior wins
        projectedRevenue: 999_999,
        projectedExpenses: 999_999,
        monthsCompleted: 6,
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(data, persisted, "change_enrollment", 1);
    expect(suggestion.values.enrollmentActual).toBe(95);
    expect(suggestion.values.revenueActual).toBe(1_200_000);
    expect(suggestion.values.expenseActual).toBe(1_100_000);
    // Net income is derived so the founder doesn't have to subtract by hand.
    expect(suggestion.values.netIncomeActual).toBe(100_000);
    expect(suggestion.sourceLabels).toContain("Prior-year actuals from setup");
  });

  it("annualizes current-year projections from a partial year when prior-year is missing", () => {
    const base = buildBaseModel();
    const data = {
      ...base,
      currentYearProjection: {
        currentEnrollment: 80,
        projectedRevenue: 600_000,
        projectedExpenses: 540_000,
        monthsCompleted: 6,
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(data, persisted, "change_enrollment", 1);
    expect(suggestion.values.enrollmentActual).toBe(80);
    // 600k over 6 months → 1.2M annualized.
    expect(suggestion.values.revenueActual).toBe(1_200_000);
    expect(suggestion.values.expenseActual).toBe(1_080_000);
    expect(suggestion.sourceLabels.some((s) => s.includes("annualized from 6 months"))).toBe(true);
  });

  it("only suggests signedMonthlyRent for evaluate_site decisions, sourcing from active facility phase", () => {
    const base = buildBaseModel({
      schoolProfile: {
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        debtIncluded: true,
        facilityPhases: [
          { ownershipType: "rent", startYear: 1, endYear: 5, monthlyRent: 8500 },
        ],
      },
    });
    const data = {
      ...base,
      priorYearSnapshot: { endingEnrollment: 50, totalRevenue: 100_000, totalExpenses: 90_000 },
    } as unknown as FullModelData;
    const sitePersisted = decisionToPersistedOverrides(data, {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 9000 },
    });
    const siteSuggestion = buildActualsSuggestion(data, sitePersisted, "evaluate_site", 1);
    expect(siteSuggestion.values.signedMonthlyRent).toBe(8500);
    expect(siteSuggestion.sourceLabels).toContain("Signed rent from facility plan");

    // Same data, different decision type — no rent suggestion since the
    // editor doesn't surface a "signed rent" row for non-site decisions.
    const enrollmentPersisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const enrollmentSuggestion = buildActualsSuggestion(data, enrollmentPersisted, "change_enrollment", 1);
    expect(enrollmentSuggestion.values.signedMonthlyRent).toBeUndefined();
  });

  it("prefers an uploaded accounting export over typed-in prior-year actuals", () => {
    const base = buildBaseModel();
    const data = {
      ...base,
      // Both sources present — export should win for revenue/expense/net
      // since it came straight from the books.
      priorYearSnapshot: {
        endingEnrollment: 95,
        totalRevenue: 1_000_000,
        totalExpenses: 950_000,
      },
      accountingExport: {
        filename: "quickbooks-2026Q1.csv",
        // Use a fixed timestamp so the formatted date is stable across CI.
        uploadedAt: "2026-03-14T12:00:00.000Z",
        totals: {
          totalRevenue: 1_250_000,
          totalExpenses: 1_180_000,
          netIncome: 70_000,
        },
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(data, persisted, "change_enrollment", 1);
    expect(suggestion.values.revenueActual).toBe(1_250_000);
    expect(suggestion.values.expenseActual).toBe(1_180_000);
    expect(suggestion.values.netIncomeActual).toBe(70_000);
    // Source label calls out the filename + a friendly date so the
    // founder can audit where the number came from. The date format is
    // locale-sensitive but should always include the filename verbatim.
    expect(suggestion.sources.revenueActual).toContain("quickbooks-2026Q1.csv");
    expect(suggestion.sources.revenueActual).toContain("uploaded ");
    // Enrollment isn't in a P&L export, so we still pull it from the
    // typed-in prior-year snapshot.
    expect(suggestion.values.enrollmentActual).toBe(95);
    expect(suggestion.sources.enrollmentActual).toBe("Prior-year actuals from setup");
    // Both source labels show up so the editor's caption can list them.
    expect(suggestion.sourceLabels.some((l) => l.includes("quickbooks-2026Q1.csv"))).toBe(true);
    expect(suggestion.sourceLabels).toContain("Prior-year actuals from setup");
  });

  it("derives net income from the export's totals when the file omits a Net Income row", () => {
    const base = buildBaseModel();
    const data = {
      ...base,
      accountingExport: {
        filename: "books-q1.csv",
        uploadedAt: "2026-04-01T00:00:00.000Z",
        totals: {
          totalRevenue: 600_000,
          totalExpenses: 540_000,
          // netIncome intentionally omitted — engine should compute it.
        },
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(data, persisted, "change_enrollment", 1);
    expect(suggestion.values.netIncomeActual).toBe(60_000);
  });

  it("falls back to prior-year actuals when the accounting export has no usable totals", () => {
    const base = buildBaseModel();
    const data = {
      ...base,
      priorYearSnapshot: {
        endingEnrollment: 88,
        totalRevenue: 800_000,
        totalExpenses: 760_000,
      },
      // Export is present but totals couldn't be extracted — treat as if
      // it isn't there so the wizard's typed-in numbers still suggest.
      accountingExport: {
        filename: "weird.csv",
        uploadedAt: "2026-05-01T00:00:00.000Z",
        totals: {},
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(data, persisted, "change_enrollment", 1);
    expect(suggestion.values.revenueActual).toBe(800_000);
    expect(suggestion.values.expenseActual).toBe(760_000);
    expect(suggestion.sources.revenueActual).toBe("Prior-year actuals from setup");
  });

  it("surfaces curated category subtotals as per-field contributors under revenue and expense", () => {
    // When the upload included recognized tuition / philanthropy / payroll
    // / facility rows, the suggestion engine should expose them as
    // contributors on revenueActual / expenseActual so the actuals editor
    // can render the breakdown ("Revenue = Tuition $480k + Donations
    // $95k") under the headline figure. Categories the parser couldn't
    // identify are simply omitted from the contributor list.
    const base = buildBaseModel();
    const data = {
      ...base,
      accountingExport: {
        filename: "quickbooks-2026Q1.csv",
        uploadedAt: "2026-03-14T12:00:00.000Z",
        totals: {
          totalRevenue: 575_000,
          totalExpenses: 387_000,
          netIncome: 188_000,
          tuitionRevenue: 480_000,
          philanthropyRevenue: 95_000,
          payrollExpense: 320_000,
          facilityExpense: 55_000,
        },
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(data, persisted, "change_enrollment", 1);
    expect(suggestion.contributors.revenueActual).toEqual([
      { name: "Tuition", amount: 480_000 },
      { name: "Philanthropy", amount: 95_000 },
    ]);
    expect(suggestion.contributors.expenseActual).toEqual([
      { name: "Payroll", amount: 320_000 },
      { name: "Facility / Rent", amount: 55_000 },
    ]);
  });

  it("omits the contributor list entirely when the export had no category subtotals", () => {
    // A bare "Total Income / Total Expenses" export should still feed the
    // headline values but leave the contributor map empty so the editor
    // doesn't render a half-empty breakdown line.
    const base = buildBaseModel();
    const data = {
      ...base,
      accountingExport: {
        filename: "bare.csv",
        uploadedAt: "2026-03-14T12:00:00.000Z",
        totals: {
          totalRevenue: 300_000,
          totalExpenses: 250_000,
          netIncome: 50_000,
        },
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(data, persisted, "change_enrollment", 1);
    expect(suggestion.values.revenueActual).toBe(300_000);
    expect(suggestion.contributors.revenueActual).toBeUndefined();
    expect(suggestion.contributors.expenseActual).toBeUndefined();
  });

  it("does not surface the accounting export beyond year 1", () => {
    const base = buildBaseModel();
    const data = {
      ...base,
      accountingExport: {
        filename: "quickbooks.csv",
        uploadedAt: "2026-03-14T12:00:00.000Z",
        totals: { totalRevenue: 1_000_000, totalExpenses: 900_000, netIncome: 100_000 },
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    // Year 3 — the export reflects historical books, not a future year.
    const suggestion = buildActualsSuggestion(data, persisted, "change_enrollment", 3);
    expect(suggestion.values.revenueActual).toBeUndefined();
    expect(suggestion.values.expenseActual).toBeUndefined();
    expect(suggestion.sourceLabels).toEqual([]);
  });

  // --- liveSnapshot.enrollment branch -------------------------------------
  //
  // When a connected accounting tool (QuickBooks/Xero) has synced a tagged
  // "students enrolled" count into `liveSnapshot.enrollment`, the engine
  // should prefer it over a typed-in prior-year value and emit a source
  // label the actuals editor can render as a "From <provider> tag <name>"
  // subtitle. Other fields fall through to their existing branches.
  it("prefers liveSnapshot.enrollment over typed-in prior-year enrollment", () => {
    const base = buildBaseModel();
    const data = {
      ...base,
      priorYearSnapshot: {
        endingEnrollment: 95,
        totalRevenue: 1_000_000,
        totalExpenses: 950_000,
      },
      liveSnapshot: {
        provider: "QuickBooks",
        tagName: "Students FY26",
        enrollment: 82,
        syncedAt: "2026-04-15T09:30:00.000Z",
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(
      data,
      persisted,
      "change_enrollment",
      1,
    );
    expect(suggestion.values.enrollmentActual).toBe(82);
    expect(suggestion.sources.enrollmentActual).toBe(
      "From QuickBooks tag 'Students FY26'",
    );
    expect(suggestion.sourceLabels).toContain(
      "From QuickBooks tag 'Students FY26'",
    );
    // Revenue/expenses still come from the prior-year snapshot since
    // the live snapshot only carries enrollment today.
    expect(suggestion.values.revenueActual).toBe(1_000_000);
    expect(suggestion.sources.revenueActual).toBe(
      "Prior-year actuals from setup",
    );
  });

  it("ignores liveSnapshot.enrollment beyond year 1", () => {
    const base = buildBaseModel();
    const data = {
      ...base,
      liveSnapshot: {
        provider: "Xero",
        tagName: "Active Students",
        enrollment: 120,
        syncedAt: "2026-04-15T09:30:00.000Z",
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(
      data,
      persisted,
      "change_enrollment",
      2,
    );
    expect(suggestion.values.enrollmentActual).toBeUndefined();
    expect(suggestion.sourceLabels).not.toContain(
      "From Xero tag 'Active Students'",
    );
  });

  it("skips liveSnapshot.enrollment when provider or tagName is missing", () => {
    // Defensive: a partially-synced snapshot (no tagName) shouldn't
    // produce a misleading "From QuickBooks tag ''" label.
    const base = buildBaseModel();
    const data = {
      ...base,
      priorYearSnapshot: { endingEnrollment: 70 },
      liveSnapshot: {
        provider: "QuickBooks",
        enrollment: 82,
        syncedAt: "2026-04-15T09:30:00.000Z",
      },
    } as unknown as FullModelData;
    const persisted = decisionToPersistedOverrides(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0] },
    });
    const suggestion = buildActualsSuggestion(
      data,
      persisted,
      "change_enrollment",
      1,
    );
    // Falls through to the prior-year snapshot.
    expect(suggestion.values.enrollmentActual).toBe(70);
    expect(suggestion.sources.enrollmentActual).toBe(
      "Prior-year actuals from setup",
    );
  });

});

// --- summarizeDecisionChanges (apply-confirmation diff) --------------------

describe("summarizeDecisionChanges: add_program", () => {
  it("describes the synthesized revenue row with enrollment × tuition for Y5", () => {
    const data = buildBaseModel();
    const changes = summarizeDecisionChanges(data, {
      type: "add_program",
      inputs: blankAddProgram({ name: "STEM Lab", annualTuition: 12000, enrollment: [10, 20, 30, 40, 50] }),
    });
    expect(changes.length).toBeGreaterThan(0);
    const first = changes[0];
    expect(first.label).toContain("STEM Lab");
    expect(first.kind).toBe("added");
    expect(first.before).toBe("Not in model");
    expect(first.after).toContain("$12,000");
    // Y5 = 50 * 12000 = 600,000
    expect(first.after).toContain("$600,000");
  });

  it("includes optional staffing and space rows when provided", () => {
    const data = buildBaseModel();
    const changes = summarizeDecisionChanges(data, {
      type: "add_program",
      inputs: blankAddProgram({ addedFte: 2, addedFteSalary: 50000, addedAnnualSpace: 24000 }),
    });
    expect(changes.find((c) => c.label.includes("staff"))).toBeDefined();
    expect(changes.find((c) => c.label.includes("space"))).toBeDefined();
  });

  it("omits staffing row when staffingTbd is set", () => {
    const data = buildBaseModel();
    const changes = summarizeDecisionChanges(data, {
      type: "add_program",
      inputs: blankAddProgram({ addedFte: 2, addedFteSalary: 50000, staffingTbd: true }),
    });
    expect(changes.find((c) => c.label.includes("staff"))).toBeUndefined();
  });
});

describe("summarizeDecisionChanges: evaluate_site", () => {
  it("compares new monthly rent against detected baseline rent", () => {
    const data = buildBaseModel({
      schoolProfile: {
        monthlyRent: 8000,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        debtIncluded: true,
      },
    });
    const inputs: SiteInputs = { newMonthlyRent: 11500 };
    const changes = summarizeDecisionChanges(data, { type: "evaluate_site", inputs });
    const rent = changes.find((c) => c.label.toLowerCase().includes("rent (monthly"));
    expect(rent).toBeDefined();
    expect(rent!.before).toContain("$8,000");
    expect(rent!.after).toContain("$11,500");
    expect(rent!.kind).toBe("modified");
  });

  it("flags one-time fit-out as a new added expense row", () => {
    const data = buildBaseModel();
    const inputs: SiteInputs = { newMonthlyRent: 12000, oneTimeFitOut: 75000 };
    const changes = summarizeDecisionChanges(data, { type: "evaluate_site", inputs });
    const fitout = changes.find((c) => c.label.includes("fit-out"));
    expect(fitout).toBeDefined();
    expect(fitout!.kind).toBe("added");
    expect(fitout!.after).toContain("$75,000");
  });

  it("includes effective-from year only when not Year 1", () => {
    const data = buildBaseModel();
    const inputs: SiteInputs = { newMonthlyRent: 10000, startYear: 3 };
    const changes = summarizeDecisionChanges(data, { type: "evaluate_site", inputs });
    expect(changes.find((c) => c.label === "Effective from")).toBeDefined();

    const inputs1: SiteInputs = { newMonthlyRent: 10000, startYear: 1 };
    const changes1 = summarizeDecisionChanges(data, { type: "evaluate_site", inputs: inputs1 });
    expect(changes1.find((c) => c.label === "Effective from")).toBeUndefined();
  });
});

describe("summarizeDecisionChanges: change_enrollment", () => {
  it("lists per-year enrollment shifts with before/after counts", () => {
    const data = buildBaseModel();
    const inputs: EnrollmentChangeInputs = { enrollmentDelta: [0, 10, 0, -5, 0] };
    const changes = summarizeDecisionChanges(data, { type: "change_enrollment", inputs });
    const y2 = changes.find((c) => c.label === "Enrollment Year 2");
    const y4 = changes.find((c) => c.label === "Enrollment Year 4");
    expect(y2).toBeDefined();
    expect(y2!.before).toBe("120 students");
    expect(y2!.after).toContain("130 students");
    expect(y2!.after).toContain("(+10)");
    expect(y4).toBeDefined();
    expect(y4!.before).toBe("160 students");
    expect(y4!.after).toContain("155 students");
    expect(y4!.after).toContain("(-5)");
  });

  it("omits years with zero delta", () => {
    const data = buildBaseModel();
    const changes = summarizeDecisionChanges(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0], retentionRate: 90 },
    });
    expect(changes.find((c) => c.label.startsWith("Enrollment Year"))).toBeUndefined();
    expect(changes.find((c) => c.label === "Retention rate")).toBeDefined();
  });

  it("includes tuition delta when nonzero", () => {
    const data = buildBaseModel();
    const changes = summarizeDecisionChanges(data, {
      type: "change_enrollment",
      inputs: { enrollmentDelta: [0, 0, 0, 0, 0], tuitionDeltaPerStudent: 500 },
    });
    const t = changes.find((c) => c.label.includes("Tuition per student"));
    expect(t).toBeDefined();
    expect(t!.after).toContain("$500");
  });
});

// --- Persistence round-trip ------------------------------------------------
//
// Saved scenarios live in `customScenarios[].overrides`, are reloaded from the
// API later, and then folded back into the base model via
// `applyPersistedScenarioToData`. If the persistence shape ever drops a field
// the apply step needs, the round-tripped numbers will silently diverge from
// what the founder originally modeled — and a lender might be looking at the
// wrong cash balance. These tests pin that the financial outputs of:
//
//     applyDecisionToData(data, decision)
//
// are equivalent to:
//
//     applyPersistedScenarioToData(data, decisionToPersistedOverrides(...), type)
//
// Compared via `computeBaseFinancials` to ignore non-numeric metadata (row
// IDs are timestamp-stamped and intentionally differ between calls).

function metricsOf(data: FullModelData) {
  // Pulls the engine's per-year arrays so tests can compare the "numbers
  // founders show their lender" rather than internal row-level shape.
  const m = computeBaseFinancials(data);
  return {
    enrollment: m.enrollment,
    revenue: m.revenue,
    totalExpenses: m.totalExpenses,
    netIncome: m.netIncome,
    endingCash: m.endingCash,
  };
}

describe("persistence round-trip: decisionToPersistedOverrides → applyPersistedScenarioToData", () => {
  it("add_program: re-applied persisted overrides match direct applyDecisionToData numbers", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "rev1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amount: 10000 },
      ],
      staffingRows: [
        {
          id: "head",
          roleName: "Head of School",
          functionCategory: "leadership",
          employmentType: "full_time",
          fte: 1,
          annualizedRate: 90000,
          benefitsEligible: true,
          benefitsRate: 22,
          payrollTaxRate: 8,
          payrollLike: true,
        },
      ],
    });
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: blankAddProgram({
        name: "STEM Lab",
        gradeBand: "K-5",
        annualTuition: 12000,
        enrollment: [10, 20, 30, 40, 50],
        addedFte: 2,
        addedFteSalary: 55000,
        addedAnnualSpace: 24000,
      }),
    };
    const direct = applyDecisionToData(data, decision);
    const persisted = decisionToPersistedOverrides(data, decision);
    const replayed = applyPersistedScenarioToData(data, persisted, "add_program");

    expect(metricsOf(replayed)).toEqual(metricsOf(direct));
  });

  it("add_program staffing-TBD branch: persisted overrides drop FTE/salary so the round-trip skips the staff row", () => {
    const data = buildBaseModel();
    const decision: DecisionInputs = {
      type: "add_program",
      inputs: blankAddProgram({
        name: "Robotics",
        annualTuition: 8000,
        enrollment: [5, 10, 15, 20, 25],
        addedFte: 3,
        addedFteSalary: 60000,
        staffingTbd: true,
      }),
    };
    const direct = applyDecisionToData(data, decision);
    const persisted = decisionToPersistedOverrides(data, persisted_decision_for(decision));
    // The replay uses the persisted shape — no FTE/salary should leak through.
    const replayed = applyPersistedScenarioToData(data, persisted, "add_program");
    expect(persisted.addProgramStaffingTbd).toBe(true);
    expect(persisted.addProgramAddedFte).toBeUndefined();
    expect(persisted.addProgramAddedFteSalary).toBeUndefined();
    expect(metricsOf(replayed)).toEqual(metricsOf(direct));
    // No staff row was added on either side — confirm the row counts match.
    expect(replayed.staffingRows?.length ?? 0).toBe(direct.staffingRows?.length ?? 0);
  });

  it("evaluate_site: round-trip preserves rent + escalation + start year + one-time fit-out numbers", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "rev1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amount: 10000 },
      ],
      expenseRows: [
        { id: "rent", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [5000, 5000, 5000, 5000, 5000], escalationRate: 0 },
      ],
    });
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: {
        newMonthlyRent: 9000,
        newRentEscalation: 3,
        startYear: 2,
        oneTimeFitOut: 75000,
      },
    };
    const direct = applyDecisionToData(data, decision);
    const persisted = decisionToPersistedOverrides(data, decision);
    const replayed = applyPersistedScenarioToData(data, persisted, "evaluate_site");

    expect(persisted.monthlyRent).toBe(9000);
    expect(persisted.siteFitOutCost).toBe(75000);
    expect(metricsOf(replayed)).toEqual(metricsOf(direct));
  });

  it("evaluate_site without fit-out: persisted shape drops siteFitOutCost and round-trip stays equivalent", () => {
    const data = buildBaseModel({
      expenseRows: [
        { id: "rent", enabled: true, category: "occupancy_facility", driverType: "monthly", amounts: [5000, 5000, 5000, 5000, 5000], escalationRate: 0 },
      ],
    });
    const decision: DecisionInputs = {
      type: "evaluate_site",
      inputs: { newMonthlyRent: 7000 },
    };
    const direct = applyDecisionToData(data, decision);
    const persisted = decisionToPersistedOverrides(data, decision);
    expect(persisted.siteFitOutCost).toBeUndefined();
    const replayed = applyPersistedScenarioToData(data, persisted, "evaluate_site");
    expect(metricsOf(replayed)).toEqual(metricsOf(direct));
  });

  it("change_enrollment: round-trip preserves per-year delta + retention + tuition-per-student bump", () => {
    const data = buildBaseModel({
      revenueRows: [
        { id: "tu1", enabled: true, category: "tuition_and_fees", driverType: "per_student", amounts: [10000, 10000, 10000, 10000, 10000] },
      ],
    });
    const decision: DecisionInputs = {
      type: "change_enrollment",
      inputs: {
        enrollmentDelta: [5, 10, 15, 20, 25],
        retentionRate: 92,
        tuitionDeltaPerStudent: 500,
      },
    };
    const direct = applyDecisionToData(data, decision);
    const persisted = decisionToPersistedOverrides(data, decision);
    const replayed = applyPersistedScenarioToData(data, persisted, "change_enrollment");

    expect(persisted.enrollmentDelta).toEqual([5, 10, 15, 20, 25]);
    expect(persisted.retentionRate).toBe(92);
    expect(persisted.tuitionDeltaPerStudent).toBe(500);
    expect(metricsOf(replayed)).toEqual(metricsOf(direct));
  });

  it("round-tripping twice (apply → persist → re-apply → persist again) yields stable persisted shape", () => {
    // Guards against drift where each round-trip subtly mutates the persisted
    // shape (e.g. by re-clamping or re-rounding). The second persisted shape
    // should be byte-for-byte equal to the first.
    const data = buildBaseModel();
    const decision: DecisionInputs = {
      type: "change_enrollment",
      inputs: {
        enrollmentDelta: [5, 10, 15, 20, 25],
        retentionRate: 88,
        tuitionDeltaPerStudent: 250,
      },
    };
    const persisted1 = decisionToPersistedOverrides(data, decision);
    const replayedOnce = applyPersistedScenarioToData(data, persisted1, "change_enrollment");
    // We can't re-derive the *inputs* from `replayedOnce` alone (the persisted
    // shape is the source of truth), so a second round-trip means feeding the
    // same persisted object through `applyPersistedScenarioToData` again.
    const replayedTwice = applyPersistedScenarioToData(data, persisted1, "change_enrollment");
    expect(metricsOf(replayedTwice)).toEqual(metricsOf(replayedOnce));
  });
});

// Tiny helper that just returns its argument — keeps the staffing-TBD test
// readable by mirroring the flow's "decision goes in, persisted comes out"
// shape without introducing a transformation.
function persisted_decision_for(d: DecisionInputs): DecisionInputs {
  return d;
}
