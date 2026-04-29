import { describe, expect, it } from "vitest";
import {
  applyDecisionToData,
  applyAddProgramDecision,
  buildDecisionBullets,
  computeDecisionImpact,
  decisionToPersistedOverrides,
  type AddProgramInputs,
  type DecisionInputs,
  type EnrollmentChangeInputs,
  type SiteInputs,
} from "../decision-flows";
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
    // Current behavior: negative deltas drop the "+" prefix and let the number
    // carry its own sign, so a -$250 delta renders as "Tuition $-250/student".
    // Locked in so any future formatting change is intentional.
    expect(bullets).toContain("Tuition $-250/student");
  });
});
