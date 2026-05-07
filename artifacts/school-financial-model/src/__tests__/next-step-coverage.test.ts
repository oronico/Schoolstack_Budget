import { describe, it, expect } from "vitest";
import {
  runDiagnostics,
  type DiagnosticFinding,
} from "@/lib/coaching/diagnostics-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";

// Task #658 — every flag the diagnostics engine can emit must include a
// non-empty, coach-voice `nextStep`. We synthesize a handful of model
// fixtures that, together, trip every diagnostic rule and then assert
// (a) `nextStep` is present and non-empty on every finding, and
// (b) it does not contain any banned credit-verdict words.

// Banned words taken from the existing founder-voice style guide. Kept in
// sync with __tests__/founder-voice.test.ts.
const BANNED_WORDS = [
  /\bapproved\b/i,
  /\bdeclined\b/i,
  /\bfailed\b/i,
  /\brejected\b/i,
  /\brejection\b/i,
  /\bineligible\b/i,
  /loan\s+approval/i,
  /\b(you|your|the)\s+(model|plan|application)\s+(passed|failed)\b/i,
];

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
  } as unknown as FullModelData;
}

const fixtures: Record<string, FullModelData> = {
  // Healthy-ish model so any rules that still fire will be exercised.
  baseline: buildBaseModel(),

  // Cash crunch / negative reserves / short runway.
  starvedCash: buildBaseModel({
    openingBalances: { cash: 1_000 },
    expenseRows: [
      { id: "e1", category: "operating", label: "Operating", amount: 1_500_000, escalationRate: 0, enabled: true },
    ],
    revenueRows: [
      { id: "r1", category: "tuition", label: "Tuition", amount: 50_000, escalationRate: 0, enabled: true },
    ],
  }),

  // High staffing burden and high facility cost.
  topHeavy: buildBaseModel({
    staffingRows: [
      { id: "s1", role: "Teacher", functionCategory: "instruction", fte: 20, annualizedRate: 80_000, startYear: 1 },
    ],
    expenseRows: [
      { id: "e1", category: "facility", label: "Lease", amount: 500_000, escalationRate: 0, enabled: true },
    ],
    revenueRows: [
      { id: "r1", category: "tuition", label: "Tuition", amount: 1_000_000, escalationRate: 0, enabled: true },
    ],
  }),

  // Aggressive enrollment + grant-heavy revenue mix.
  grantHeavy: buildBaseModel({
    enrollment: { year1: 50, year2: 90, year3: 150, year4: 220, year5: 300, retentionRate: 85 },
    revenueRows: [
      { id: "r1", category: "philanthropy", label: "Foundation grant", amount: 800_000, escalationRate: 0, enabled: true },
      { id: "r2", category: "tuition", label: "Tuition", amount: 200_000, escalationRate: 0, enabled: true },
    ],
  }),

  // Heavy debt / weak DSCR.
  debtLoaded: buildBaseModel({
    capitalAndDebtRows: [
      { id: "d1", label: "Building loan", principal: 5_000_000, rate: 0.08, termMonths: 240, startYear: 1 },
    ],
    revenueRows: [
      { id: "r1", category: "tuition", label: "Tuition", amount: 600_000, escalationRate: 0, enabled: true },
    ],
  }),
};

describe("Task #658 — next-step coverage", () => {
  it("every diagnostic finding from every fixture has a non-empty nextStep", () => {
    const allFindings: { fixture: string; finding: DiagnosticFinding }[] = [];
    for (const [name, model] of Object.entries(fixtures)) {
      // maxResults large enough to capture every emitted rule.
      const findings = runDiagnostics(model, 50);
      for (const f of findings) {
        allFindings.push({ fixture: name, finding: f });
      }
    }

    // We expect to have actually exercised the engine (otherwise the test
    // is silently a no-op).
    expect(allFindings.length).toBeGreaterThan(0);

    for (const { fixture, finding } of allFindings) {
      expect(
        finding.nextStep,
        `${fixture} → ${finding.id} is missing nextStep`,
      ).toBeTruthy();
      expect(
        (finding.nextStep ?? "").trim().length,
        `${fixture} → ${finding.id} nextStep is empty`,
      ).toBeGreaterThan(0);
    }
  });

  it("no nextStep contains banned credit-verdict vocabulary", () => {
    for (const [name, model] of Object.entries(fixtures)) {
      const findings = runDiagnostics(model, 50);
      for (const f of findings) {
        const ns = f.nextStep ?? "";
        for (const re of BANNED_WORDS) {
          expect(
            re.test(ns),
            `${name} → ${f.id} nextStep contains banned pattern ${re}: "${ns}"`,
          ).toBe(false);
        }
      }
    }
  });
});
