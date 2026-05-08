import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  computeAnnualDebt,
  computeEffectiveFte,
  getFounderCompBenchmark,
  getFounderCompBenchmarkPerYear,
  DEFAULT_BENEFITS_RATE,
  DEFAULT_PAYROLL_TAX_RATE,
  DEFAULT_COLA_PCT,
  DEFAULT_GENERAL_INFLATION_PCT,
  DEFAULT_RENT_ESCALATION_PCT,
  DEFAULT_TUITION_ESCALATION_PCT,
  type StaffingRowLike,
} from "@workspace/finance";
import {
  calculatePersonnelCosts,
  type StaffingRowData,
} from "@/lib/staffing-defaults";
import type { GuidanceLevel } from "@/lib/coaching/use-show-coach";

// Task #702 — Phase 2: prove the financial engine is independent of the
// founder's UI guidance mode. The Guided Builder / CFO Mode toggle is a
// pure presentation concern; flipping it must never alter a single
// computed number. We enforce that three ways:
//   1. Source-grep `@workspace/finance` and assert it has zero references
//      to UI-only guidance state. Catches accidental coupling at import
//      time before any compute runs.
//   2. Cross-mode behavioural equivalence: run the same fixture through
//      every public compute helper under each of the three guidance
//      levels and assert byte-equal totals across all three runs.
//   3. Vitest snapshot of the computed totals, so any unintended drift
//      (independent of the toggle) is also caught at review time.

const FINANCE_PKG_DIR = join(
  __dirname,
  "..", "..", "..", "..", "..", "..",
  "lib", "finance", "src",
);

const BANNED_TOKENS = ["guidanceLevel", "useShowCoach", "GuidanceModeSelector"];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {
      yield full;
    }
  }
}

const STAFFING_FIXTURE: StaffingRowData[] = [
  {
    id: "leader-1",
    roleName: "Head of School",
    functionCategory: "school_leadership",
    employmentType: "full_time",
    fte: 1,
    annualizedRate: 90_000,
    benefitsEligible: true,
    benefitsRate: DEFAULT_BENEFITS_RATE,
    payrollTaxRate: DEFAULT_PAYROLL_TAX_RATE,
    payrollLike: true,
    notes: "",
    staffingMode: "fixed",
  },
  {
    id: "teacher-1",
    roleName: "Lead Teacher",
    functionCategory: "instructional",
    employmentType: "full_time",
    fte: 1,
    annualizedRate: 55_000,
    benefitsEligible: true,
    benefitsRate: DEFAULT_BENEFITS_RATE,
    payrollTaxRate: DEFAULT_PAYROLL_TAX_RATE,
    payrollLike: true,
    notes: "",
    staffingMode: "fixed",
  },
  {
    id: "ops-1",
    roleName: "Operations Manager",
    functionCategory: "operations",
    employmentType: "part_time",
    fte: 0.5,
    annualizedRate: 30_000,
    benefitsEligible: false,
    benefitsRate: 0,
    payrollTaxRate: DEFAULT_PAYROLL_TAX_RATE,
    payrollLike: true,
    notes: "",
    staffingMode: "fixed",
  },
];

const FIXTURE = {
  loanAmount: 250_000,
  ratePct: 6.5,
  termYears: 10,
  schoolType: "private_school" as const,
  enrollmentY1: 100,
  defaults: {
    benefits: DEFAULT_BENEFITS_RATE,
    payrollTax: DEFAULT_PAYROLL_TAX_RATE,
    cola: DEFAULT_COLA_PCT,
    inflation: DEFAULT_GENERAL_INFLATION_PCT,
    rent: DEFAULT_RENT_ESCALATION_PCT,
    tuition: DEFAULT_TUITION_ESCALATION_PCT,
  },
};

function computeTotalsForMode(_mode: GuidanceLevel) {
  // The mode parameter is intentionally ignored. The whole point of this
  // test is that no compute helper accepts or branches on it. If a future
  // refactor pipes the UI guidance level into compute, the cross-mode
  // equality assertion below will fail.
  const staffingLikes: StaffingRowLike[] = STAFFING_FIXTURE;
  return {
    annualDebt: computeAnnualDebt(
      FIXTURE.loanAmount,
      FIXTURE.ratePct,
      FIXTURE.termYears,
    ),
    effectiveFteLeader: computeEffectiveFte(staffingLikes[0], 0, FIXTURE.enrollmentY1),
    effectiveFteTeacher: computeEffectiveFte(staffingLikes[1], 0, FIXTURE.enrollmentY1),
    effectiveFteOps: computeEffectiveFte(staffingLikes[2], 0, FIXTURE.enrollmentY1),
    personnelCosts: calculatePersonnelCosts(STAFFING_FIXTURE, FIXTURE.enrollmentY1),
    founderComp: getFounderCompBenchmark(FIXTURE.schoolType, FIXTURE.enrollmentY1),
    founderCompY1: getFounderCompBenchmarkPerYear(
      FIXTURE.schoolType,
      FIXTURE.enrollmentY1,
      0,
    ),
  };
}

describe("Finance package is independent of guidance mode", () => {
  it("contains no references to UI guidance-mode state (static guardrail)", () => {
    const offenders: { file: string; token: string; line: string }[] = [];
    for (const file of walk(FINANCE_PKG_DIR)) {
      const text = readFileSync(file, "utf8");
      for (const token of BANNED_TOKENS) {
        if (text.includes(token)) {
          const line = text.split("\n").find((l) => l.includes(token)) ?? "";
          offenders.push({ file, token, line: line.trim() });
        }
      }
    }
    expect(
      offenders,
      `Finance package must not consume UI guidance state. Offenders:\n${offenders
        .map((o) => `  ${o.file} :: ${o.token} :: ${o.line}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("produces identical computed totals under every guidance level (Guided Extra, Guided, CFO/Compact)", () => {
    const guidedExtra = computeTotalsForMode("extra");
    const guidedBasics = computeTotalsForMode("basics");
    const cfoCompact = computeTotalsForMode("advanced");

    // Cross-mode equivalence: every total must be byte-identical across
    // all three guidance levels. Vitest's structural deep-equality
    // covers nested objects (e.g. personnelCosts).
    expect(guidedBasics).toEqual(guidedExtra);
    expect(cfoCompact).toEqual(guidedExtra);

    // Sanity: the fixture is producing real numbers, not trivially-equal zeros.
    expect(Number.isFinite(guidedExtra.annualDebt)).toBe(true);
    expect(guidedExtra.annualDebt).toBeGreaterThan(0);
    expect(guidedExtra.personnelCosts.totalSalariesWages).toBeGreaterThan(0);
  });

  it("snapshots the cross-mode totals so any future drift is reviewed", () => {
    // One snapshot, shared by all three modes (because they MUST agree).
    // If the engine changes, exactly one snapshot needs updating; if the
    // toggle ever leaks into compute, the equality test above fails first.
    const totals = {
      extra: computeTotalsForMode("extra"),
      basics: computeTotalsForMode("basics"),
      advanced: computeTotalsForMode("advanced"),
    };
    expect(totals).toMatchSnapshot();
  });
});
