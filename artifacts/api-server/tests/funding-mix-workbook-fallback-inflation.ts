/**
 * Task #860 — Architect review r3 regression guard.
 *
 * `applyFundingMixCorrection` previously recomputed per-student choice
 * amounts from raw row config (`perStudentValue`), which only honored
 * `row.escalationRate`. Workbook / PDF / underwriting export paths
 * compute the per-row dollars via `driverVal(...fallbackInflation)`,
 * which adds fallback cost-inflation when a row has no explicit
 * escalation rate. The mismatch let combined tuition + per-student
 * school_choice revenue exceed the net seat cap in escalated years.
 *
 * Concrete repro from the architect review:
 *   gross_tuition $10K/student, esa $8K/student, 100 students, year 2,
 *   fallback inflation 3% → expected cap $1,030,000, actual was
 *   $1,054,000 before the fix.
 *
 * This test pins the fix in place using the real workbook helper.
 */
import { computeRevenueForYear } from "../src/lib/workbook-helpers.js";
import type { RevenueRow } from "@workspace/finance";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else failures.push(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

const rows: RevenueRow[] = [
  {
    id: "gross_tuition",
    label: "Tuition (sticker)",
    enabled: true,
    category: "tuition_and_fees",
    driverType: "per_student",
    amounts: [10000, 10000, 10000, 10000, 10000],
  },
  {
    id: "esa_revenue",
    label: "ESA",
    enabled: true,
    category: "school_choice",
    driverType: "per_student",
    amounts: [8000, 8000, 8000, 8000, 8000],
  },
] as unknown as RevenueRow[];

const students = 100;
const fallbackInflation = 3;

for (let y = 0; y < 5; y++) {
  const total = computeRevenueForYear(
    rows,
    y,
    students,
    undefined,
    fallbackInflation,
  );
  // No explicit row escalation → fallback cost-inflation is applied to
  // both tuition AND ESA. The cap basis (net per-student tuition) is
  // therefore also escalated by the same factor, so combined revenue
  // must equal exactly seat_y * students = 10_000 * 1.03^y * 100.
  const expectedCap = 10000 * Math.pow(1.03, y) * students;
  check(
    `year ${y + 1}: combined tuition + ESA <= net seat cap (~${expectedCap.toFixed(0)})`,
    total <= expectedCap + 1,
    `got ${total.toFixed(2)}, cap ${expectedCap.toFixed(2)}`,
  );
  check(
    `year ${y + 1}: combined revenue equals net seat cap (ESA fully covers)`,
    Math.abs(total - expectedCap) <= 1,
    `got ${total.toFixed(2)}, expected ${expectedCap.toFixed(2)}`,
  );
}

// Mixed: explicit escalation on tuition, fallback inflation on ESA.
const mixedRows: RevenueRow[] = [
  {
    id: "gross_tuition",
    label: "Tuition",
    enabled: true,
    category: "tuition_and_fees",
    driverType: "per_student",
    amounts: [10000, 10000, 10000, 10000, 10000],
    escalationRate: 5,
    escalationRateOverridden: true,
  },
  {
    id: "esa_revenue",
    label: "ESA",
    enabled: true,
    category: "school_choice",
    driverType: "per_student",
    amounts: [8000, 8000, 8000, 8000, 8000],
  },
] as unknown as RevenueRow[];
for (let y = 0; y < 5; y++) {
  const total = computeRevenueForYear(
    mixedRows,
    y,
    students,
    undefined,
    fallbackInflation,
  );
  // Tuition cap escalates at 5%; ESA still escalates at 3% fallback.
  const seatY = 10000 * Math.pow(1.05, y);
  const cap = seatY * students;
  check(
    `mixed escalation year ${y + 1}: combined revenue <= net seat cap`,
    total <= cap + 1,
    `got ${total.toFixed(2)}, cap ${cap.toFixed(2)}`,
  );
}

if (failures.length > 0) {
  console.error(`funding-mix workbook fallback-inflation: ${failures.length} failed:`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`funding-mix workbook fallback-inflation: ${passed} checks passed`);
