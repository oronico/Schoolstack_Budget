/**
 * Task #930 / M2 — Output extraction tooling: smoke tests.
 *
 * One smoke test per extractor (workbook, PDF, component-state,
 * json-export) against the Oakwood persona fixture. Each test
 * exercises the extractor end-to-end and asserts the result is
 * non-empty AND well-shaped. M4/M5 will layer mapping + integrity
 * assertions on top of these contracts.
 *
 * Hermetic: no DB, no network. The "json-export" smoke runs the
 * lender packet builder in-process (the same builder the export
 * endpoint invokes) and walks the resulting object, which is exactly
 * what the HTTP response would carry.
 */
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { generateLenderProFormaWorkbook } from "../src/lib/lender-proforma-export.js";
import {
  extractWorkbook,
  extractPdf,
  extractComponentState,
  extractJsonExport,
  type ExtractedValue,
} from "../src/lib/integrity/extract/index.js";
import { OAKWOOD_CEO_SEED } from "./fixtures/oakwood-ceo-seed.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

function assertWellShaped(records: ExtractedValue[], surface: string): void {
  let bad = 0;
  let withLabel = 0;
  for (const r of records) {
    if (
      typeof r.value !== "number" ||
      !Number.isFinite(r.value) ||
      typeof r.location !== "string" ||
      r.location.length === 0 ||
      typeof r.producer !== "string" ||
      r.producer.length === 0 ||
      r.surface !== surface
    ) {
      bad++;
    }
    if (r.label && r.label.length > 0) withLabel++;
  }
  check(`[${surface}] every record is well-shaped`, bad === 0, `${bad}/${records.length} malformed`);
  // At least HALF the records should carry a label hint; otherwise the
  // extractor isn't doing its job and M4 will be flying blind.
  check(
    `[${surface}] >=50% of records carry a label hint`,
    records.length === 0 || withLabel / records.length >= 0.5,
    `${withLabel}/${records.length} labelled`,
  );
}

async function smokeWorkbook(): Promise<void> {
  console.log("\n— workbook extractor —");
  const buf = await generateLenderProFormaWorkbook(OAKWOOD_CEO_SEED);
  const records = await extractWorkbook(buf, { producer: "lender-proforma-workbook" });
  check("[workbook] returns a non-empty list", records.length > 0, `got ${records.length}`);
  assertWellShaped(records, "workbook");
  // Location must be `<sheet>!<cellRef>`.
  const sample = records[0];
  check(
    `[workbook] location matches <sheet>!<cellRef>`,
    /^.+![A-Z]+\d+$/.test(sample?.location ?? ""),
    `got ${JSON.stringify(sample?.location)}`,
  );
  // M4 needs formula-derived cells (DSCR, totals, growth %) extracted
  // identically to literal cells. The Lender Pro Forma workbook
  // surfaces multiple cross-sheet formulas — every row in the
  // "5-Year P&L" tab carries computed totals — so we assert each of
  // its expected sheets returned at least one numeric record.
  const PROFORMA_NUMERIC_SHEETS = [
    "Assumptions",
    "Drivers",
    "5-Year P&L",
    "Cash Flow & DSCR",
    "Staffing",
    "Loan Snapshot",
    "Summary",
    "Financial Health",
  ];
  const sheetsSeen = new Set(
    records.map((r) => r.location.split("!")[0]),
  );
  for (const sheet of PROFORMA_NUMERIC_SHEETS) {
    check(
      `[workbook] sheet "${sheet}" surfaces >=1 numeric cell (covers formula-derived values)`,
      sheetsSeen.has(sheet),
      `available: ${JSON.stringify([...sheetsSeen])}`,
    );
  }
  // At least one record should carry the "DSCR" or "Coverage" label
  // hint, proving the row-label lookup walks left correctly on the
  // Cash Flow & DSCR tab (canonical metric `dscr-y1` lives there).
  const dscrLabelled = records.some((r) =>
    /dscr|coverage|service/i.test(r.label ?? ""),
  );
  check(
    `[workbook] at least one record carries a DSCR-shaped label hint`,
    dscrLabelled,
  );
}

async function smokePdf(): Promise<void> {
  console.log("\n— pdf extractor —");
  const data = OAKWOOD_CEO_SEED;
  const consultant = await runConsultantEngine(data);
  const packet = buildLenderPacket(
    data as unknown as Parameters<typeof buildLenderPacket>[0],
    consultant,
    0,
  );
  const pdf = await generateLenderPacketPDF(packet);
  const records = extractPdf(pdf, { producer: "lender-packet-pdf" });
  check("[pdf] returns a non-empty list", records.length > 0, `got ${records.length}`);
  assertWellShaped(records, "pdf");
  // Location must be `page=N:line=N:token=N` with at least one currency
  // and one percent token surfaced — every lender packet emits both.
  const hasCurrency = records.some((r) => /\$/.test(r.rawToken ?? ""));
  const hasPercent = records.some((r) => /%$/.test((r.rawToken ?? "").trim()));
  check("[pdf] surfaces at least one currency token", hasCurrency);
  check("[pdf] surfaces at least one percent token", hasPercent);
  const sample = records[0];
  check(
    `[pdf] location matches page=N:line=N:token=N`,
    /^page=\d+:line=\d+:token=\d+$/.test(sample?.location ?? ""),
    `got ${JSON.stringify(sample?.location)}`,
  );
  // Locations are globally unique within a single extraction (token
  // index is per-line, line index is per-page) — M4 keys on
  // `(producer, location)` so duplicates would silently shadow each
  // other in the mapping table.
  const locs = records.map((r) => r.location);
  check(
    `[pdf] locations are unique within the document`,
    new Set(locs).size === locs.length,
    `${locs.length - new Set(locs).size} duplicate(s)`,
  );
}

async function smokeComponentState(): Promise<void> {
  console.log("\n— component-state extractor —");
  const consultant = await runConsultantEngine(OAKWOOD_CEO_SEED);
  const records = extractComponentState(consultant, {
    componentName: "ConsultantAnalysisView",
  });
  check("[component-state] returns a non-empty list", records.length > 0, `got ${records.length}`);
  assertWellShaped(records, "component-state");
  // Location must be a dotted JSON path (not a sheet ref).
  const sample = records[0];
  check(
    `[component-state] location is a dotted JSON path`,
    !!sample?.location && !sample.location.includes("!"),
    `got ${JSON.stringify(sample?.location)}`,
  );
  // Per the file header: component-state is a SUPERSET of what gets
  // rendered. The two anchor metrics ConsultantAnalysisView renders
  // for every persona — Y1 DSCR and lender readiness — are present
  // on the engine output, so the extractor MUST surface them. These
  // two assertions codify the contract M4 will lean on.
  const hasDscrPath = records.some((r) =>
    /\bdscr\b/i.test(r.location) || /dscr/i.test(r.label ?? ""),
  );
  check(
    `[component-state] surfaces a DSCR-shaped leaf (location or label)`,
    hasDscrPath,
  );
  const hasReadinessPath = records.some((r) =>
    /readiness/i.test(r.location) || /readiness/i.test(r.label ?? ""),
  );
  // Readiness rating is a string status, not a number — but its
  // structured cap result carries pendingEvidenceCount, taggedCount,
  // taggedFraction, all numeric. Assert at least one of those leaves
  // landed under a readiness-shaped path. A miss here would mean the
  // walker stopped at a non-leaf object (regression worth surfacing).
  check(
    `[component-state] surfaces a lenderReadiness-shaped numeric leaf`,
    hasReadinessPath,
  );
}

async function smokeJsonExport(): Promise<void> {
  console.log("\n— json-export extractor —");
  const data = OAKWOOD_CEO_SEED;
  const consultant = await runConsultantEngine(data);
  const packet = buildLenderPacket(
    data as unknown as Parameters<typeof buildLenderPacket>[0],
    consultant,
    0,
  );
  // The export endpoint serializes the packet via JSON.stringify before
  // shipping it, so we round-trip here too: that drops Date instances
  // and other non-JSON-safe fields, matching exactly what the HTTP
  // client deserializes.
  const wireShape = JSON.parse(JSON.stringify(packet)) as unknown;
  const records = extractJsonExport(wireShape, { producer: "export/lender-packet" });
  check("[json-export] returns a non-empty list", records.length > 0, `got ${records.length}`);
  assertWellShaped(records, "json-export");
}

async function main(): Promise<void> {
  console.log("=== Integrity extractor smoke tests (Oakwood persona) ===");
  await smokeWorkbook();
  await smokePdf();
  await smokeComponentState();
  await smokeJsonExport();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("integrity-extract-smoke: unexpected error", err);
  process.exit(1);
});
