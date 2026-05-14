/**
 * Task #860 EXPANDED — golden numbers for the per-seat funding mix
 * across all three canonical demo models (Liberty STEM Charter,
 * Riverside Christian, Oakwood Microschool). These numbers are the
 * founder-visible truth on the dashboard, lender PDF, and board PDF —
 * if they ever drift, every downstream surface drifts with them.
 *
 * For each demo we also assert that the funding-mix v2 migration
 * produces a deterministic outcome (either no-op when already correct,
 * or a recorded changelog entry when the legacy stacked pattern was
 * present).
 */
import {
  buildPerSeatFundingMix,
  migrateLegacyFundingMix,
  CURRENT_REVENUE_MODEL_VERSION,
} from "@workspace/finance";
import { CHARTER_SCHOOL_DEMO } from "../src/lib/demo-models/charter-school.js";
import { PRIVATE_SCHOOL_DEMO } from "../src/lib/demo-models/private-school.js";
import { MICROSCHOOL_DEMO } from "../src/lib/demo-models/microschool.js";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}
function near(a: number, b: number, tol = 1): boolean {
  return Math.abs(a - b) <= tol;
}

// --- Liberty STEM Charter — public-funded, NO per-student tuition row.
// perSeatFundingMixY1 is null by design (the lender PDF / dashboard
// renderer treats `null` as "no tuition seat to decompose").
{
  const d = CHARTER_SCHOOL_DEMO.data;
  const mix = buildPerSeatFundingMix(
    d.revenueRows as unknown as Parameters<typeof buildPerSeatFundingMix>[0],
    0,
    d.enrollment.year1,
  );
  check(
    "Liberty STEM Charter — perSeatFundingMixY1 is null (no per-student tuition)",
    mix === null,
    `got ${JSON.stringify(mix)}`,
  );
  const mig = migrateLegacyFundingMix(d as unknown as Parameters<typeof migrateLegacyFundingMix>[0]);
  check(
    "Liberty STEM Charter — migration is no-op (no stacked pattern)",
    mig.applied === false,
  );
  check(
    "Liberty STEM Charter — migration stamps revenueModelVersion to current",
    mig.data.revenueModelVersion === CURRENT_REVENUE_MODEL_VERSION,
    `got ${mig.data.revenueModelVersion}`,
  );
}

// --- Riverside Christian (private-school demo) — has gross_tuition +
// FL FES-EO voucher_revenue. The voucher row represents what FES pays
// toward the SAME seat as gross_tuition, and the engine collapses
// gross_tuition to the residual family-pay portion.
//
// Y1: enrollment 200, sticker 12500/student, scholarships_aid 12% of
// gross_tuition (counted as a tuition_offsets discount), voucher 8000
// /student. After the engine cap the recognized per-seat = sticker
// 12500 (or net after tier discounts), with funder per-seat 8000 and
// the residual as family pay.
{
  const d = PRIVATE_SCHOOL_DEMO.data;
  const mix = buildPerSeatFundingMix(
    d.revenueRows as unknown as Parameters<typeof buildPerSeatFundingMix>[0],
    0,
    d.enrollment.year1,
    d.tuitionTiers as unknown as Parameters<typeof buildPerSeatFundingMix>[3],
  );
  check("Riverside Christian — mix is not null", mix !== null);
  if (mix) {
    check(
      "Riverside Christian — sticker per seat = 12500",
      near(mix.stickerPerSeat, 12500, 1),
      `got ${mix.stickerPerSeat}`,
    );
    check(
      "Riverside Christian — exactly one funder (FL FES-EO voucher)",
      mix.funders.length === 1 && mix.funders[0].programType === "voucher",
      `got ${mix.funders.length} funder(s); types=${mix.funders.map((f) => f.programType).join(",")}`,
    );
    check(
      "Riverside Christian — voucher per seat = 8000",
      mix.funders[0] !== undefined && near(mix.funders[0].perSeat, 8000, 5),
      `got ${mix.funders[0]?.perSeat}`,
    );
    check(
      "Riverside Christian — recognized per seat does not double-count (≤ sticker)",
      mix.recognizedPerSeat <= 12500 + 1,
      `recognizedPerSeat=${mix.recognizedPerSeat}`,
    );
    check(
      "Riverside Christian — recognized = funder + family pay",
      near(mix.recognizedPerSeat, mix.funderTotalPerSeat + mix.familyPayPerSeat, 1),
    );
  }
  const mig = migrateLegacyFundingMix(d as unknown as Parameters<typeof migrateLegacyFundingMix>[0]);
  // Riverside has voucher (8000) ≤ tuition (12500) so no stacked pattern.
  check(
    "Riverside Christian — migration is no-op (voucher ≤ tuition)",
    mig.applied === false,
  );
  check(
    "Riverside Christian — migration stamps revenueModelVersion to current",
    mig.data.revenueModelVersion === CURRENT_REVENUE_MODEL_VERSION,
  );
}

// --- Oakwood Microschool — gross_tuition with a discount-tier ladder
// and NO school_choice rows. Mix should report sticker, no funders,
// and family-pay equal to the net seat after tier discounts.
//
// Y1: 20 students, sticker 10000, mixed full-pay + sibling-discount
// (15%) + need-based scholarship (40%) tiers. Net per seat after the
// blend is computed by the engine.
{
  const d = MICROSCHOOL_DEMO.data;
  const mix = buildPerSeatFundingMix(
    d.revenueRows as unknown as Parameters<typeof buildPerSeatFundingMix>[0],
    0,
    d.enrollment.year1,
    d.tuitionTiers as unknown as Parameters<typeof buildPerSeatFundingMix>[3],
  );
  check("Oakwood Microschool — mix is not null", mix !== null);
  if (mix) {
    check(
      "Oakwood Microschool — sticker per seat = 10000",
      near(mix.stickerPerSeat, 10000, 1),
      `got ${mix.stickerPerSeat}`,
    );
    check(
      "Oakwood Microschool — no school_choice funders",
      mix.funders.length === 0,
      `got ${mix.funders.length} funder(s)`,
    );
    check(
      "Oakwood Microschool — family pay > 0 (residual = full net seat)",
      mix.familyPayPerSeat > 0,
      `familyPayPerSeat=${mix.familyPayPerSeat}`,
    );
    check(
      "Oakwood Microschool — family pay ≤ sticker (tier discounts apply)",
      mix.familyPayPerSeat <= 10000 + 1,
      `familyPayPerSeat=${mix.familyPayPerSeat}`,
    );
  }
  const mig = migrateLegacyFundingMix(d as unknown as Parameters<typeof migrateLegacyFundingMix>[0]);
  check(
    "Oakwood Microschool — migration is no-op (no school_choice rows)",
    mig.applied === false,
  );
  check(
    "Oakwood Microschool — migration stamps revenueModelVersion to current",
    mig.data.revenueModelVersion === CURRENT_REVENUE_MODEL_VERSION,
  );
}

if (failures.length > 0) {
  console.error(`funding-mix-demos-golden: ${failures.length} failed:`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`funding-mix-demos-golden: ${passed} checks passed`);
