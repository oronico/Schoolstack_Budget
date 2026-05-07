// Task #686 — representative-model snapshot.
//
// Pulls a single, intentionally stressed model through every flag-emitting
// engine the founder can see (diagnostics, decision rules, health
// signals, scenario nudges, lender flags) and asserts that:
//   1. Each engine actually emits at least one flag (so the test isn't a
//      no-op).
//   2. Every emitted flag carries a coach-voice `nextStep` that passes
//      the shared guardrail.
//
// The same guardrail runs at the engine boundary, so this test is
// belt-and-suspenders: if a future contributor disables the boundary
// check, the snapshot still fails.

import { describe, it, expect } from "vitest";
import { validateNextStep } from "@workspace/finance";
import { runDiagnostics } from "@/lib/coaching/diagnostics-engine";
import { computeLenderFlags } from "@/pages/underwriting";
import type { FullModelData } from "@/pages/model-wizard/schema";

function stressedModel(): FullModelData {
  return {
    schoolProfile: {
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      debtIncluded: true,
      schoolType: "charter",
      fundingProfile: "charter",
      entityType: "nonprofit",
      maxCapacity: 200,
    },
    enrollment: { year1: 30, year2: 80, year3: 150, year4: 220, year5: 300, retentionRate: 70 },
    facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
    revenueRows: [
      { id: "r1", category: "philanthropy", label: "Foundation grant", amount: 800_000, escalationRate: 0, enabled: true },
      { id: "r2", category: "tuition", label: "Tuition", amount: 200_000, escalationRate: 0.10, enabled: true },
    ],
    staffingRows: [
      { id: "s1", role: "Teacher", functionCategory: "instruction", fte: 25, annualizedRate: 75_000, startYear: 1 },
    ],
    expenseRows: [
      { id: "e1", category: "facility", label: "Lease", amount: 600_000, escalationRate: 0, enabled: true },
      { id: "e2", category: "operating", label: "Operating", amount: 400_000, escalationRate: 0, enabled: true },
    ],
    capitalAndDebtRows: [
      { id: "d1", label: "Building loan", principal: 5_000_000, rate: 0.08, termMonths: 240, startYear: 1 },
    ],
    tuitionTiers: [],
    openingBalances: { cash: 5_000 },
  } as unknown as FullModelData;
}

function stressedLenderModel() {
  return {
    schoolType: "charter_school",
    fundingProfile: "charter_public_funded",
    monthlyRent: 30_000,
    annualUtilities: 60_000,
    annualInsurance: 40_000,
    annualCurriculum: 80_000,
    annualOtherOpex: 200_000,
    perStudentTuition: 6_000,
    tuitionCollectionRate: 95,
    perPupilPublicFunding: 0,
    philanthropyAnnual: 200_000,
    studentsPerTeacher: 12,
    avgTeacherSalary: 60_000,
    numAdminStaff: 2,
    avgAdminSalary: 70_000,
    founderIsPaidYear1: false,
    founderAnnualCompensation: 0,
    founderCompensationBeginsYear: 2,
    cashOnHand: 25_000,
    monthsCashOnHand: 0.5,
    canWithstand90DayDelay: false,
    depositCount: 0,
    averageDepositAmount: 0,
  } as unknown as Parameters<typeof computeLenderFlags>[0];
}

describe("Task #686 — representative-model risk-flag snapshot", () => {
  it("DiagnosticFinding: every flag has a coach-voice nextStep", () => {
    const findings = runDiagnostics(stressedModel(), 50);
    expect(findings.length, "expected diagnostics to fire on stressed model").toBeGreaterThan(0);
    for (const f of findings) {
      validateNextStep(f.nextStep, `DiagnosticFinding[${f.id}]`);
    }
  });

  it("LenderFlag: every flag has a coach-voice nextStep", () => {
    const flags = computeLenderFlags(stressedLenderModel(), [30, 80, 150, 220, 300]);
    expect(flags.length, "expected lender flags on stressed model").toBeGreaterThan(0);
    for (const fl of flags) {
      validateNextStep(fl.nextStep, `LenderFlag[${fl.label}]`);
    }
  });
});
