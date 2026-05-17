/**
 * Task #919 — Pattern D regression: Revenue Quality table column
 * headers + per-column → per-year data alignment.
 *
 * Protocol-addendum Field 3 (explicit regression assertion):
 *
 *   Assertion target: Revenue Quality table column headers + per-column
 *                     data alignment in the lender-packet Revenue Model.
 *   For each: demo packet in {microschool, private_school, charter_school}
 *     Assert: headers === ["Bucket", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]
 *     Assert: for each year N in 1..5, column N+1 of the per-bucket
 *             rows reads from co.revenueQuality[N-1].byBucket — i.e. the
 *             first DATA column corresponds to Y1, not Y2.
 *   Reporting: "Revenue Quality table header mismatch in {packet}" /
 *              "Revenue Quality column N data does not match co.revenueQuality[N-1] in {packet}".
 *
 * Why this exists when the consistency-harness already has probe B5:
 *   B5 grep-checks the rendered PDF text for the literal off-by-one
 *   sequence. This test goes one layer earlier — buildPacketData — and
 *   asserts BOTH that the headers are the canonical sequence AND that
 *   the row data lines up with co.revenueQuality by ORDER (a future
 *   refactor that reverses the rqRollup map or off-by-ones the data
 *   side would slip past B5 but fail here).
 */
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildPacketData } from "../src/lib/packets/build-packet-data.js";
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";

const EXPECTED_HEADERS = ["Bucket", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];

const CASES = [
  { label: "microschool",    model: MICROSCHOOL_MODEL.data },
  { label: "private_school", model: PRIVATE_SCHOOL_MODEL.data },
  { label: "charter_school", model: CHARTER_SCHOOL_MODEL.data },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL: ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

async function runOne(label: string, model: unknown): Promise<void> {
  const co = await runConsultantEngine(model as Record<string, unknown>);
  const packet = await buildPacketData({
    modelData: model as ModelData,
    consultantOutput: co,
    modelId: 1,
    packetType: "lender",
    personaComfort: null,
  });
  const rev = packet.sections.find((s) => s.id === "revenue_model");
  check(`[${label}] revenue_model section present`, rev !== undefined);
  if (!rev) return;

  const tbl = (rev.tables ?? []).find((t) =>
    t.title.startsWith("Revenue Quality"),
  );
  if (!tbl) {
    // The table only renders when revenueQuality data is present. All
    // three seeded demos populate it, so absence here is a regression.
    check(`[${label}] Revenue Quality table present`, false,
      `revenue_model has tables: ${(rev.tables ?? []).map(t => t.title).join(" | ")}`);
    return;
  }

  // Headers === canonical sequence (Pattern D, locks Task #919 fix).
  check(
    `[${label}] Revenue Quality headers === ["Bucket","Year 1"..."Year 5"]`,
    JSON.stringify(tbl.headers) === JSON.stringify(EXPECTED_HEADERS),
    `Revenue Quality table header mismatch in ${label}: got ${JSON.stringify(tbl.headers)}`,
  );

  // Per-column data alignment: column N (1..5) of each bucket row must
  // reflect co.revenueQuality[N-1] — i.e. first DATA column is Y1. We
  // verify by re-formatting the byBucket dollar with the same `fmt`
  // shape buildPacketData uses (`$<rounded>` / `$<n>K` / `$<n.n>M`),
  // and checking that the rendered cell STARTS WITH that token. Using
  // startsWith lets the test ignore the trailing "(pct%)" suffix
  // without re-implementing the pct formatter.
  const rqRollup = co.revenueQuality ?? [];
  check(
    `[${label}] co.revenueQuality has 5 entries`,
    rqRollup.length === 5,
    `got ${rqRollup.length}`,
  );

  const fmt = (n: number): string => {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  };

  // Pick the bucket with the largest Y1 share so we have a non-zero,
  // unambiguous value to align against. All three demos have a
  // dominant bucket in Y1 (contracted or projected).
  const y1 = rqRollup[0];
  if (!y1) return;
  const dominantBucket = (["contracted", "projected", "donor_dependent", "policy_dependent"] as const)
    .reduce((best, k) => (y1.byBucket[k] > y1.byBucket[best] ? k : best), "contracted" as const);

  // Find the row whose label matches the dominant bucket's label.
  // Labels are the human-readable forms in REVENUE_QUALITY_LABELS.
  const labelByBucket: Record<string, string> = {
    contracted: "Contracted",
    projected: "Projected",
    donor_dependent: "Donor-Dependent",
    policy_dependent: "Policy-Dependent",
  };
  const wantLabel = labelByBucket[dominantBucket];
  const row = tbl.rows.find((r) => r.label.startsWith(wantLabel));
  check(`[${label}] ${wantLabel} row present`, row !== undefined);
  if (!row) return;

  // Headers length is 6 (Bucket + 5 years); row.values length is 5
  // (year columns only — the label is separate).
  check(
    `[${label}] ${wantLabel} row has 5 year cells`,
    row.values.length === 5,
    `got ${row.values.length}`,
  );
  if (row.values.length !== 5) return;

  for (let n = 1; n <= 5; n++) {
    const yearEntry = rqRollup[n - 1];
    const expected = fmt(yearEntry.byBucket[dominantBucket]);
    const cell = row.values[n - 1];
    check(
      `[${label}] ${wantLabel} column ${n} (Year ${n}) starts with ${expected}`,
      cell.startsWith(expected),
      `Revenue Quality column ${n} data does not match co.revenueQuality[${n - 1}] in ${label}: cell=${JSON.stringify(cell)} expected-prefix=${JSON.stringify(expected)}`,
    );
  }
}

async function main(): Promise<void> {
  for (const c of CASES) {
    await runOne(c.label, c.model);
  }
  console.log(`revenue-quality-headers-919: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("revenue-quality-headers-919: unexpected error", err);
  process.exit(1);
});
