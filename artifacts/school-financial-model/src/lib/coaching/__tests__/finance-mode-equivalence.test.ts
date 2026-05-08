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
} from "@workspace/finance";
import { calculatePersonnelCosts } from "@/lib/staffing-defaults";

// Task #702 — Phase 2: prove the financial engine is independent of the
// founder's UI guidance mode. The Guided Builder / CFO Mode toggle is a
// pure presentation concern; flipping it must never alter a single
// computed number. We enforce that two ways:
//   1. Source-grep the entire `@workspace/finance` package and assert it
//      has zero references to UI-only guidance state. If any future
//      refactor accidentally couples compute to the toggle, this fails.
//   2. Behavioural equivalence: run a fixture through the same compute
//      helpers the wizard / api-server / review step rely on, and assert
//      the outputs are deeply equal across separate invocations. This
//      guards against any non-deterministic / level-aware side-effects
//      that a static grep might miss (e.g. module-level state).

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

  it("produces identical compute outputs regardless of how often it is invoked (behavioural equivalence)", () => {
    // Compute the same fixture twice. Because none of the helpers read
    // `guidanceLevel`, every result must be deep-equal across runs.
    // (This stands in for "compute under each guidance level" — there is
    // no level parameter to thread through, which is precisely the
    // invariant we want enforced.)
    const fixture = {
      loanAmount: 250_000,
      ratePct: 6.5,
      termYears: 10,
      schoolType: "private_school" as const,
      defaults: {
        benefits: DEFAULT_BENEFITS_RATE,
        payrollTax: DEFAULT_PAYROLL_TAX_RATE,
        cola: DEFAULT_COLA_PCT,
        inflation: DEFAULT_GENERAL_INFLATION_PCT,
        rent: DEFAULT_RENT_ESCALATION_PCT,
        tuition: DEFAULT_TUITION_ESCALATION_PCT,
      },
      staffingRows: [
        {
          id: "leader-1",
          functionCategory: "school_leadership" as const,
          employmentType: "full_time" as const,
          annualizedRate: 90_000,
          startMonth: 0,
          ftePercent: 100,
          weeksWorked: 52,
        },
        {
          id: "teacher-1",
          functionCategory: "instructional_staff" as const,
          employmentType: "full_time" as const,
          annualizedRate: 55_000,
          startMonth: 0,
          ftePercent: 100,
          weeksWorked: 40,
        },
        {
          id: "ops-1",
          functionCategory: "operations_support" as const,
          employmentType: "part_time" as const,
          annualizedRate: 30_000,
          startMonth: 2,
          ftePercent: 50,
          weeksWorked: 40,
        },
      ],
    };

    const runOnce = () => ({
      annualDebt: computeAnnualDebt(
        fixture.loanAmount,
        fixture.ratePct,
        fixture.termYears,
      ),
      effectiveFteLeader: computeEffectiveFte(fixture.staffingRows[0] as never),
      effectiveFteTeacher: computeEffectiveFte(fixture.staffingRows[1] as never),
      effectiveFteOps: computeEffectiveFte(fixture.staffingRows[2] as never),
      personnelCosts: calculatePersonnelCosts(
        fixture.staffingRows as never,
      ),
      founderComp: getFounderCompBenchmark(fixture.schoolType, 100),
      founderCompY1: getFounderCompBenchmarkPerYear(fixture.schoolType, 100, 0),
      defaults: { ...fixture.defaults },
    });

    const runA = runOnce();
    const runB = runOnce();

    expect(runB).toEqual(runA);
    expect(Number.isFinite(runA.annualDebt)).toBe(true);
    expect(runA.annualDebt).toBeGreaterThan(0);
    expect(runA.personnelCosts.totalSalariesWages).toBeGreaterThan(0);
  });
});
