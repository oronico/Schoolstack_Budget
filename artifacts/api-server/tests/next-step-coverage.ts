// Task #658 — server-side next-step coverage test.
//
// Asserts that every emittable server flag (DecisionIssue from
// generateTopIssues, HealthSignal from generateHealthSignals, AssumptionFlag
// from detectUnusualAssumptions, NudgeItem from computeScenarios) has a
// non-empty `nextStep` and contains none of the banned credit-verdict words
// (matching the founder-voice style guide).

import { generateTopIssues } from "../src/lib/decision-rules.js";
import { generateHealthSignals } from "../src/lib/financial-health.js";
import { detectUnusualAssumptions } from "../src/lib/assumption-flags.js";
import { computeScenarios } from "@workspace/finance";

const BANNED = [
  /\bapproved\b/i,
  /\bdeclined\b/i,
  /\bfailed\b/i,
  /\brejected\b/i,
  /\brejection\b/i,
  /\bineligible\b/i,
  /loan\s+approval/i,
  /\b(you|your|the)\s+(model|plan|application)\s+(passed|failed)\b/i,
];

let passed = 0;
let failed = 0;
const fail = (msg: string) => { console.error(`  ✗ ${msg}`); failed++; };
const pass = (msg: string) => { console.log(`  ✓ ${msg}`); passed++; };

function checkNextStep(label: string, ns: unknown) {
  if (typeof ns !== "string" || ns.trim().length === 0) {
    fail(`${label} missing or empty nextStep`);
    return;
  }
  for (const re of BANNED) {
    if (re.test(ns)) {
      fail(`${label} banned pattern ${re}: "${ns}"`);
      return;
    }
  }
  pass(`${label}: nextStep ok`);
}

// Synthetic stressed FY shape. Negative net income, growing enrollment but
// not breaking even, weak DSCR, and high philanthropy share — designed to
// trip many decision rules, health signals, and nudges.
const yearFinancials = [1, 2, 3, 4, 5].map((y) => {
  const students = [30, 80, 150, 220, 300][y - 1];
  const totalRevenue = 1_000_000 + 200_000 * (y - 1);
  const totalExpenses = 2_500_000;
  return {
    year: y,
    students,
    totalRevenue,
    tuitionRevenue: 200_000,
    publicRevenue: 0,
    philanthropyRevenue: 800_000,
    totalStaffingCost: 1_500_000,
    facilityCost: 600_000,
    totalOpex: 400_000,
    debtService: 500_000,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
    netMargin: (totalRevenue - totalExpenses) / totalRevenue,
  };
});
const cumulativeFinancials = yearFinancials.map((y, i) => ({
  year: y.year,
  cumulativeNetIncome: yearFinancials.slice(0, i + 1).reduce((s, x) => s + x.netIncome, 0),
  reserveMonths: 0,
}));

// Synthetic FullModelData for assumption flags + scenario engine. Mirrors
// shapes from artifacts/api-server/src/lib/consultant-engine.ts callers.
const stressedModel = {
  schoolProfile: {
    schoolType: "charter",
    fundingProfile: "charter",
    entityType: "nonprofit",
    isPartialFirstYear: false,
    year1OperatingMonths: 12,
    debtIncluded: true,
    maxCapacity: 200,
  },
  enrollment: { year1: 30, year2: 80, year3: 150, year4: 220, year5: 300, retentionRate: 70 },
  facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
  revenueRows: [
    { id: "r1", category: "philanthropy", label: "Foundation grant", amount: 800_000, escalationRate: 0, enabled: true },
    { id: "r2", category: "tuition", label: "Tuition", amount: 200_000, escalationRate: 0.10, enabled: true },
  ],
  staffingRows: [
    { id: "s1", roleName: "Teacher", functionCategory: "instructional", fte: 25, annualizedRate: 75_000, startYear: 1, employmentType: "full_time", benefitsRate: 0, payrollTaxRate: 0, payrollLike: true, staffingMode: "fixed", notes: "" },
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
  assumptionFlagResponses: [],
};

async function main() {
  // 1) DecisionIssue[]
  const decisionIssues = generateTopIssues({
    yearFinancials,
    cumulativeFinancials,
    enrollmentByYear: yearFinancials.map((y) => y.students),
    cashRunwayMonths: 2,
    maxCapacity: 200,
    schoolType: "charter",
    fundingProfile: "charter",
    entityType: "nonprofit",
    hasDebt: true,
    dscr: 0.7,
    retentionRate: 70,
  });
  if (decisionIssues.length === 0) fail("expected at least one DecisionIssue");
  for (const iss of decisionIssues) checkNextStep(`DecisionIssue ${iss.id}`, iss.nextStep);

  // 2) HealthSignal[]
  const healthSignals = generateHealthSignals({
    y1NetMargin: -1.5,
    lastYearNetMargin: -0.7,
    breakEvenYear: 0,
    yearCount: 5,
    cashRunwayMonths: 2,
    reserveMonths: 0,
    staffingCostPct: 1.5,
    facilityCostPct: 0.6,
    dscr: 0.7,
    hasDebt: true,
    philanthropyPct: 0.8,
    publicRevenuePct: 0.0,
    tuitionPct: 0.2,
    entityType: "nonprofit",
  } as Parameters<typeof generateHealthSignals>[0]);
  if (healthSignals.length === 0) fail("expected at least one HealthSignal");
  for (const s of healthSignals) checkNextStep(`HealthSignal ${s.dimension}/${s.status}`, s.nextStep);

  // 3) AssumptionFlag[]
  const assumptionFlags = await detectUnusualAssumptions(stressedModel as unknown as Record<string, unknown>);
  if (assumptionFlags.length === 0) fail("expected at least one AssumptionFlag");
  for (const f of assumptionFlags) checkNextStep(`AssumptionFlag ${f.flagType}`, f.nextStep);

  // 4) NudgeItem[] from base + a couple of stress scenarios
  const scenarioOut = computeScenarios(stressedModel as never, [
    { name: "Enrollment -10%", enrollmentAdjustment: -10, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
    { name: "Tuition +5%", enrollmentAdjustment: 0, tuitionAdjustment: 5, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
  ]);
  const allResults = [scenarioOut.base, ...scenarioOut.scenarios];
  let nudgeCount = 0;
  for (const sc of allResults) {
    for (const n of sc.nudges) {
      nudgeCount++;
      checkNextStep(`Nudge ${sc.name}/${n.label}`, n.nextStep);
    }
  }
  if (nudgeCount === 0) fail("expected at least one NudgeItem across base + scenarios");

  console.log(`\nnext-step-coverage: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
