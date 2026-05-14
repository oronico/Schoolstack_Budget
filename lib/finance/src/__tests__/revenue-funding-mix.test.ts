/**
 * Task #860 — "Tuition is just price." Funding-mix correction.
 *
 * Pins the new behavior so a future refactor that re-introduces the
 * tuition + ESA double-count tripping the model trips these assertions.
 *
 * Hand-rolled check()/passed/failures pattern (matches the other tests
 * in this package: scenario-engine-dscr.test.ts, lender-stress-tests.ts,
 * assumption-registry.test.ts) so it runs under `tsx` with no extra
 * test-framework dependency.
 */
import {
  computeRevenueRowAmountsForYear,
  detectFundingMixInconsistencies,
  type RevenueRowAmountsRowLike,
} from "../revenue-quality.js";

const tuitionRow = (amounts: number[]): RevenueRowAmountsRowLike => ({
  id: "gross_tuition",
  enabled: true,
  category: "tuition_and_fees",
  driverType: "per_student",
  amounts,
});

const choiceRow = (id: string, amounts: number[]): RevenueRowAmountsRowLike => ({
  id,
  enabled: true,
  category: "school_choice",
  driverType: "per_student",
  amounts,
});

function approxEqual(a: number, b: number, tol = 0.5): boolean {
  return Math.abs(a - b) <= tol;
}

function main() {
  const failures: string[] = [];
  let passed = 0;
  function check(label: string, ok: boolean, detail?: string) {
    if (ok) passed++;
    else failures.push(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }

  // --- ESA partially funds the seat (no double-count) ---
  {
    // Seat $10,000, ESA $8,000, 100 students.
    // Pre-fix: $10k + $8k = $18k/student * 100 = $1.8M (double-count).
    // Correct: 100 * $10k = $1.0M, ESA $800k, family $200k.
    const rows = [tuitionRow([10000]), choiceRow("esa_revenue", [8000])];
    const a = computeRevenueRowAmountsForYear(rows, 0, 100);
    check(
      "ESA partial: gross_tuition shows residual family-pay $200k",
      approxEqual(a.get("gross_tuition") || 0, 200000),
      `got ${a.get("gross_tuition")}`,
    );
    check(
      "ESA partial: esa_revenue shows the funder portion $800k",
      approxEqual(a.get("esa_revenue") || 0, 800000),
      `got ${a.get("esa_revenue")}`,
    );
    const total = (a.get("gross_tuition") || 0) + (a.get("esa_revenue") || 0);
    check(
      "ESA partial: combined tuition + choice == seat * students ($1M)",
      approxEqual(total, 1_000_000),
      `got ${total}`,
    );
  }

  // --- Stacked funders that exceed seat get capped ---
  {
    const rows = [
      tuitionRow([10000]),
      choiceRow("esa_revenue", [7000]),
      choiceRow("voucher_revenue", [6000]),
    ];
    const a = computeRevenueRowAmountsForYear(rows, 0, 50);
    const total =
      (a.get("gross_tuition") || 0) +
      (a.get("esa_revenue") || 0) +
      (a.get("voucher_revenue") || 0);
    check(
      "stacked overflow: combined revenue capped at seat * students ($500k)",
      approxEqual(total, 500_000),
      `got ${total}`,
    );
    check(
      "stacked overflow: gross_tuition residual is 0",
      approxEqual(a.get("gross_tuition") || 0, 0),
      `got ${a.get("gross_tuition")}`,
    );
  }

  // --- Ancillary tuition_and_fees rows stay additive ---
  {
    const rows = [
      tuitionRow([10000]),
      {
        id: "registration_fees",
        enabled: true,
        category: "tuition_and_fees",
        driverType: "per_student",
        amounts: [500],
      },
      choiceRow("esa_revenue", [8000]),
    ];
    const a = computeRevenueRowAmountsForYear(rows, 0, 100);
    check(
      "ancillary: registration_fees stays $50k (additive, not part of seat)",
      approxEqual(a.get("registration_fees") || 0, 50_000),
      `got ${a.get("registration_fees")}`,
    );
    check(
      "ancillary: gross_tuition residual still $200k",
      approxEqual(a.get("gross_tuition") || 0, 200_000),
      `got ${a.get("gross_tuition")}`,
    );
  }

  // --- annual_fixed school_choice (grant pot) is not a per-seat funder ---
  {
    const rows = [
      tuitionRow([10000]),
      {
        id: "esa_revenue",
        enabled: true,
        category: "school_choice",
        driverType: "annual_fixed",
        amounts: [50000],
      },
    ];
    const a = computeRevenueRowAmountsForYear(rows, 0, 100);
    check(
      "annual_fixed esa: gross_tuition unchanged at $1M",
      approxEqual(a.get("gross_tuition") || 0, 1_000_000),
      `got ${a.get("gross_tuition")}`,
    );
    check(
      "annual_fixed esa: amount additive at $50k",
      approxEqual(a.get("esa_revenue") || 0, 50_000),
      `got ${a.get("esa_revenue")}`,
    );
  }

  // --- No school_choice rows: no-op ---
  {
    const rows = [tuitionRow([10000])];
    const a = computeRevenueRowAmountsForYear(rows, 0, 100);
    check(
      "no choice rows: gross_tuition unchanged",
      approxEqual(a.get("gross_tuition") || 0, 1_000_000),
    );
  }

  // --- No gross_tuition (charter): no-op ---
  {
    const rows = [
      {
        id: "state_local_perpupil",
        enabled: true,
        category: "public_funding",
        driverType: "per_student",
        amounts: [9500],
      },
    ];
    const a = computeRevenueRowAmountsForYear(rows, 0, 200);
    check(
      "charter (no gross_tuition): public_funding unchanged",
      approxEqual(a.get("state_local_perpupil") || 0, 1_900_000),
    );
  }

  // --- Escalation honored on seat side ---
  {
    const rows = [
      { ...tuitionRow([10000]), escalationRate: 4 },
      // Provide amounts for each year so the flat ESA stays at $8000 in
      // year 3 — the per-year lookup honors amounts[yearIdx], not [0].
      { ...choiceRow("esa_revenue", [8000, 8000, 8000]), escalationRate: 0 },
    ];
    // Year 3 (yearIdx=2): seat = 10000 * 1.04^2 = 10816
    // ESA stays at 8000. Family per student = 2816.
    const a = computeRevenueRowAmountsForYear(rows, 2, 100);
    const expectedSeat = 10000 * Math.pow(1.04, 2);
    const expectedFamily = (expectedSeat - 8000) * 100;
    check(
      "escalation: gross_tuition residual reflects escalated seat",
      approxEqual(a.get("gross_tuition") || 0, expectedFamily, 2),
      `got ${a.get("gross_tuition")}, expected ~${expectedFamily}`,
    );
  }

  // --- detectFundingMixInconsistencies: clean ---
  {
    const rows = [
      tuitionRow([10000, 10500, 11000]),
      choiceRow("esa_revenue", [8000, 8000, 8000]),
    ];
    const out = detectFundingMixInconsistencies(rows, 3);
    check("detect: clean model returns empty", out.length === 0, `got ${out.length}`);
  }

  // --- detectFundingMixInconsistencies: stacked over seat ---
  {
    const rows = [
      tuitionRow([10000, 10000, 10000]),
      choiceRow("esa_revenue", [7000, 7000, 7000]),
      choiceRow("voucher_revenue", [4000, 4000, 4000]),
    ];
    const out = detectFundingMixInconsistencies(rows, 3);
    check("detect: flags 3 years of overflow", out.length === 3, `got ${out.length}`);
    if (out[0]) {
      check("detect: seat reported correctly", out[0].seatPerStudent === 10000);
      check("detect: funding sum reported correctly", out[0].fundingPerStudent === 11000);
      check("detect: excess reported correctly", out[0].excessPerStudent === 1000);
    }
  }

  // --- Tier discount: ESA cap is NET tuition, not sticker ---
  // Architect review round 2: with a 50% tier discount, an $8K ESA on a
  // $10K sticker seat must cap at the discounted $5K net charge — not
  // collect $8K and overstate revenue.
  {
    // 100 students; tier gives 100% of them a 50% discount.
    const tiers = [{ discountPercent: 50, studentCounts: [100, 100, 100] }];
    const rows = [tuitionRow([10000]), choiceRow("esa_revenue", [8000])];
    const a = computeRevenueRowAmountsForYear(rows, 0, 100, tiers);
    const total = (a.get("gross_tuition") || 0) + (a.get("esa_revenue") || 0);
    // Net per-student tuition after 50% discount = $5K. ESA caps at $5K.
    // Family residual = $0. Total program revenue = $500K.
    check(
      "tier discount: total tuition + ESA capped at net seat revenue ($500K)",
      approxEqual(total, 500000, 1),
      `got ${total}`,
    );
    check(
      "tier discount: ESA capped to net per-student ($500K, not $800K)",
      approxEqual(a.get("esa_revenue") || 0, 500000, 1),
      `got ${a.get("esa_revenue")}`,
    );
    check(
      "tier discount: gross_tuition zeroed since ESA covers full net seat",
      approxEqual(a.get("gross_tuition") || 0, 0, 1),
      `got ${a.get("gross_tuition")}`,
    );
  }

  // --- Tier discount with partial ESA: family pays the rest ---
  {
    // 50% discount → net $5K per student. ESA $3K → family $2K.
    const tiers = [{ discountPercent: 50, studentCounts: [100, 100, 100] }];
    const rows = [tuitionRow([10000]), choiceRow("esa_revenue", [3000])];
    const a = computeRevenueRowAmountsForYear(rows, 0, 100, tiers);
    check(
      "tier + small ESA: ESA reported at funder amount ($300K)",
      approxEqual(a.get("esa_revenue") || 0, 300000, 1),
      `got ${a.get("esa_revenue")}`,
    );
    check(
      "tier + small ESA: gross_tuition shows residual family-pay ($200K)",
      approxEqual(a.get("gross_tuition") || 0, 200000, 1),
      `got ${a.get("gross_tuition")}`,
    );
    check(
      "tier + small ESA: total = net seat revenue ($500K)",
      approxEqual(
        (a.get("gross_tuition") || 0) + (a.get("esa_revenue") || 0),
        500000,
        1,
      ),
    );
  }

  // --- detectFundingMixInconsistencies: ignores annual_fixed ---
  {
    const rows = [
      tuitionRow([10000]),
      {
        id: "esa_grant",
        enabled: true,
        category: "school_choice",
        driverType: "annual_fixed",
        amounts: [100000],
      },
    ];
    const out = detectFundingMixInconsistencies(rows, 1);
    check("detect: annual_fixed school_choice is ignored", out.length === 0);
  }

  const totalChecks = passed + failures.length;
  if (failures.length > 0) {
    console.error(
      `\nrevenue-funding-mix (Task #860): ${failures.length} of ${totalChecks} checks failed`,
    );
    for (const f of failures) console.error(f);
    process.exit(1);
  }
  console.log(`\nrevenue-funding-mix (Task #860): ${passed}/${totalChecks} checks passed`);
}

main();
