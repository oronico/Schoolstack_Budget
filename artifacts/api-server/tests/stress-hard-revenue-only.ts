/**
 * Task #630 — unit test for the "Hard revenue only" stress scenario.
 *
 * The consultant engine adds a built-in stress that zeroes donor-dependent
 * and policy-dependent revenue rows so lenders can see what cash + DSCR +
 * runway look like when those revenue streams evaporate. This test pins
 * three behaviours so the scenario can't silently regress:
 *
 *   1. The scenario is present in `consultantOutput.stressTests` with the
 *      label "Hard revenue only".
 *   2. The scenario zeros ONLY donor + policy buckets — contracted (gross
 *      tuition + scholarship offsets) and projected (fees, other) revenue
 *      survive. We verify by re-deriving Y1 net income from the stress's
 *      contracted+projected baseline and checking that it matches the
 *      reported `y1NetIncome` net of removed donor/policy revenue.
 *   3. The new resilience metrics (`reserveMonths`, `dscr`, `runwayMonths`)
 *      are populated on the stress entry.
 */
import { runConsultantEngine } from "../src/lib/consultant-engine.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function buildModel(): Record<string, unknown> {
  return {
    schoolProfile: {
      schoolName: "Hard Revenue Test School",
      state: "TX",
      schoolType: "private_school",
      entityType: "nonprofit_501c3",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 200,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      ownershipType: "rent",
      monthlyRent: 5000,
      annualRentEscalation: 3,
      debtIncluded: false,
    },
    enrollment: { year1: 100, year2: 120, year3: 140, year4: 160, year5: 180 },
    revenueRows: [
      // Contracted — must survive
      {
        id: "gross_tuition",
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "per_student",
        amounts: [10000, 10300, 10609, 10927, 11255],
        billingMonths: 12,
      },
      // Projected — must survive
      {
        id: "registration_fees",
        category: "tuition_and_fees",
        lineItem: "Registration Fees",
        enabled: true,
        driverType: "per_student",
        amounts: [200, 200, 200, 200, 200],
      },
      // Donor-dependent — must be zeroed
      {
        id: "annual_fund",
        category: "philanthropy",
        lineItem: "Annual Fund",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [50000, 60000, 70000, 80000, 90000],
      },
      {
        id: "grants",
        category: "grants_contributions",
        lineItem: "Foundation Grants",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [25000, 25000, 25000, 25000, 25000],
      },
      // Policy-dependent — must be zeroed
      {
        id: "esa_funding",
        category: "school_choice",
        lineItem: "ESA",
        enabled: true,
        driverType: "per_student",
        amounts: [5000, 5000, 5000, 5000, 5000],
      },
      {
        id: "state_local_perpupil",
        category: "public_funding",
        lineItem: "State Per-Pupil",
        enabled: true,
        driverType: "per_student",
        amounts: [3000, 3000, 3000, 3000, 3000],
      },
    ],
    staffingRows: [
      {
        id: "teacher",
        roleName: "Teacher",
        functionCategory: "instructional",
        employmentType: "full_time",
        fte: 5,
        annualizedRate: 50000,
        benefitsEligible: true,
        benefitsRate: 20,
        payrollTaxRate: 7.65,
        payrollLike: true,
        notes: "",
        staffingMode: "fixed",
      },
    ],
    expenseRows: [
      {
        id: "rent",
        category: "occupancy_facility",
        lineItem: "Rent",
        enabled: true,
        driverType: "monthly",
        amounts: [5000, 5150, 5305, 5464, 5628],
      },
    ],
    capitalAndDebtRows: [],
    facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
  };
}

async function run() {
  const model = buildModel();
  const co = await runConsultantEngine(model);

  // 1. Scenario present
  const hardOnly = co.stressTests.find((s) => s.scenario === "Hard revenue only");
  check("'Hard revenue only' scenario exists in stressTests", !!hardOnly);
  if (!hardOnly) {
    console.log(`stress scenarios: ${co.stressTests.map((s) => s.scenario).join(", ")}`);
    console.log(`\nstress-hard-revenue-only: ${passed} passed, ${failed} failed`);
    console.log(failures.join("\n"));
    process.exit(1);
  }

  // 2. Donor + policy revenue is zeroed; contracted + projected survive.
  // Compare against the "Loss of Philanthropy" baseline for sanity:
  // hard-revenue-only should be strictly more punitive than loss-of-
  // philanthropy because it also drops policy_dependent rows on top.
  const lossPhil = co.stressTests.find((s) => s.scenario === "Loss of Philanthropy");
  check(
    "Loss of Philanthropy scenario still exists",
    !!lossPhil,
  );
  if (lossPhil) {
    check(
      "Hard revenue only Y1 net income < Loss of Philanthropy (policy revenue is also dropped)",
      hardOnly.y1NetIncome < lossPhil.y1NetIncome,
      `hardOnly.y1=${hardOnly.y1NetIncome}, lossPhil.y1=${lossPhil.y1NetIncome}`,
    );
  }

  // The fixture's contracted+projected Y1 revenue is:
  //   100 * 10000 (gross_tuition)         = 1,000,000
  //   100 * 200 (registration_fees)       =    20,000
  //   ----------------------------------------------
  //   1,020,000
  // Donor+policy that should be zeroed in the stress:
  //   50,000 + 25,000 (philanthropy/grants)
  //   100 * 5000 (ESA) + 100 * 3000 (state per-pupil) = 800,000
  //   total dropped: 875,000
  // The baseline (no stress) Y1 net income includes all of this; the
  // hard-revenue-only Y1 should be (baseline Y1) - 875,000.
  const baselineY1 = co.cumulativeFinancials[0]?.cumulativeNetIncome ?? 0;
  const expectedDelta = 50_000 + 25_000 + 100 * 5_000 + 100 * 3_000;
  const actualDelta = baselineY1 - hardOnly.y1NetIncome;
  check(
    "Hard revenue only Y1 drops EXACTLY donor + policy revenue (no contracted/projected casualties)",
    Math.abs(actualDelta - expectedDelta) < 1,
    `expected delta ≈ ${expectedDelta}, actual delta = ${actualDelta} (baselineY1=${baselineY1}, hardOnly.y1=${hardOnly.y1NetIncome})`,
  );

  // 3. Resilience metrics populated
  check(
    "Hard revenue only exposes reserveMonths",
    typeof hardOnly.reserveMonths === "number",
    `got: ${typeof hardOnly.reserveMonths}`,
  );
  check(
    "Hard revenue only exposes runwayMonths",
    typeof hardOnly.runwayMonths === "number",
    `got: ${typeof hardOnly.runwayMonths}`,
  );
  // dscr is null when there's no debt — this fixture has none, so we
  // expect explicit null (not undefined).
  check(
    "Hard revenue only dscr is null when fixture has no debt",
    hardOnly.dscr === null,
    `got: ${hardOnly.dscr}`,
  );

  // Summary
  console.log(`\nstress-hard-revenue-only: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
