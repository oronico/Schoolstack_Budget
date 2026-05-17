/**
 * Task #893 — Lender PDF text-rendering snapshot tests.
 *
 * The sibling `demo-math-smoke` test asserts that the printed Y1
 * revenue and Y1 net-income figures land within ±5% of their truth
 * sources, which absorbs K/M-rounding noise but tolerates real
 * formatter regressions: switching "$166K" to "$0.2M" or dropping a
 * digit would still pass. This snapshot test pins the EXACT rendered
 * fragments — every printed string-literal that PDFKit emits into the
 * lender packet PDF for each of the three seeded demo personas —
 * against a per-persona file under `__snapshots__/`. Any change to a
 * dollar figure, a section heading, a label, the order they print in,
 * or the formatter that produces them surfaces here as an actionable
 * line-by-line diff.
 *
 * Snapshots are intentionally text-only (extracted PDF string
 * literals, not bytes), so font/object/xref churn does not cause
 * spurious failures.
 *
 * To intentionally update snapshots after a deliberate formatter
 * change, run:
 *
 *     UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run \
 *       test:lender-pdf-text-snapshot
 *
 * Hermetic: no DB, no network, no env vars beyond `UPDATE_SNAPSHOTS`.
 */
import fs from "node:fs";
import path from "node:path";

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import { LENDER_PDF_FIXTURES } from "./fixtures/lender-pdf-fixtures.js";

import { extractPdfFragments } from "./_pdf-text-snapshot-util.js";
const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";
const SNAP_DIR = path.join(import.meta.dirname ?? __dirname, "__snapshots__");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? `\n${detail}` : ""}`);
  }
}

// ── PDF text extractor ─────────────────────────────────────────────────
// Yields one entry per `(...)` literal / `<...>` hex string inside each
// FlateDecode-compressed content stream. Per-literal granularity (rather
// than per-page concatenation) makes the resulting snapshot a stable,
// human-readable record where each label / dollar figure is its own
// line, so a diff points at the exact regressed token.
// Redact non-deterministic tokens so re-running the test on a different
// day produces the same snapshot. The lender PDF renders a long-form
// `Month DD, YYYY` date in two places:
//   1. The cover page's "Prepared <date>" line, sourced from
//      `packet.generatedAt` (which we pin to a fixed date below).
//   2. The page footer's "Generated <date>" line, which `pdf-utils.ts`
//      `drawFooter` builds from a raw `new Date()` and which we cannot
//      override from the test. PDFKit kerning often splits this date
//      across multiple `(...)` literals (e.g. `"ated Ma"` + `"y 15,
//      2026"`), so naive per-fragment regex redaction misses it. We
//      therefore detect the date span on the JOINED page text, then
//      collapse the run of fragments covering each match to a single
//      `<DATE>` token. This keeps the per-fragment granularity that
//      makes diffs precise while making the snapshot date-independent.
const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`(${MONTHS})\\s+\\d{1,2},\\s+\\d{4}`, "g");

function redactDatesAcrossFragments(fragments: string[]): string[] {
  if (fragments.length === 0) return fragments;
  // Build the joined string and a parallel map from joined-string char
  // index → fragment index.
  const offsets: number[] = new Array(fragments.length);
  let joined = "";
  for (let i = 0; i < fragments.length; i++) {
    offsets[i] = joined.length;
    joined += fragments[i];
  }
  // For each char position in `joined`, the fragment index it came from.
  const owner = new Int32Array(joined.length);
  for (let i = 0; i < fragments.length; i++) {
    const start = offsets[i];
    const end = i + 1 < fragments.length ? offsets[i + 1] : joined.length;
    for (let k = start; k < end; k++) owner[k] = i;
  }
  // Mutable copy we will edit.
  const out = fragments.slice();
  const matches = Array.from(joined.matchAll(DATE_RE));
  // Walk matches in reverse so earlier indices stay valid.
  for (let m = matches.length - 1; m >= 0; m--) {
    const match = matches[m];
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const firstFrag = owner[start];
    const lastFrag = owner[end - 1];
    // Slice the matched span out of each covered fragment, then drop
    // it into the first fragment as a single `<DATE>` token.
    for (let f = firstFrag; f <= lastFrag; f++) {
      const fStart = offsets[f];
      const fEnd = f + 1 < fragments.length ? offsets[f + 1] : joined.length;
      const localStart = Math.max(0, start - fStart);
      const localEnd = Math.min(fEnd - fStart, end - fStart);
      const cur = out[f];
      const replacement = f === firstFrag ? "<DATE>" : "";
      out[f] = cur.slice(0, localStart) + replacement + cur.slice(localEnd);
    }
  }
  // Drop any fragments that were emptied by the redaction, but keep
  // page markers (which are added later, not present here yet).
  return out.filter((s) => s.length > 0);
}

interface SnapshotCase {
  label: string;
  data: Record<string, unknown>;
}

// Three seeded demo personas (microschool / private / charter) plus
// the real-founder-shaped fixtures from task #895 (multi-debt stack,
// restricted-gift-heavy, capital-campaign mid-cycle, voucher +
// scholarship combo) — see tests/fixtures/lender-pdf-fixtures.ts.
const CASES: SnapshotCase[] = [
  { label: "microschool",    data: MICROSCHOOL_MODEL.data    as unknown as Record<string, unknown> },
  { label: "private_school", data: PRIVATE_SCHOOL_MODEL.data as unknown as Record<string, unknown> },
  { label: "charter_school", data: CHARTER_SCHOOL_MODEL.data as unknown as Record<string, unknown> },
  ...LENDER_PDF_FIXTURES.map((f) => ({
    label: f.label,
    data: f.data as unknown as Record<string, unknown>,
  })),
];

function diffLines(actual: string[], expected: string[], maxShown = 25): string {
  const lines: string[] = [];
  const max = Math.max(actual.length, expected.length);
  let shown = 0;
  let differingCount = 0;
  for (let i = 0; i < max; i++) {
    const a = actual[i];
    const e = expected[i];
    if (a !== e) {
      differingCount++;
      if (shown < maxShown) {
        lines.push(`    line ${i + 1}:`);
        lines.push(`      expected: ${e === undefined ? "<eof>" : JSON.stringify(e)}`);
        lines.push(`      actual:   ${a === undefined ? "<eof>" : JSON.stringify(a)}`);
        shown++;
      }
    }
  }
  if (differingCount > shown) {
    lines.push(`    ... and ${differingCount - shown} more differing lines`);
  }
  if (actual.length !== expected.length) {
    lines.push(`    length mismatch: expected ${expected.length} lines, got ${actual.length}`);
  }
  return lines.join("\n");
}

async function runOne(c: SnapshotCase): Promise<void> {
  const tag = `[${c.label}]`;
  const data = c.data;
  const consultant = await runConsultantEngine(data);
  const packet = buildLenderPacket(
    data as unknown as Parameters<typeof buildLenderPacket>[0],
    consultant,
    0,
  );
  // Pin generatedAt so the "Prepared <date>" line normalizes
  // identically across runs even before DATE_RE redaction.
  (packet as unknown as { generatedAt: Date }).generatedAt = new Date(
    "2026-01-01T00:00:00Z",
  );

  const pdf = await generateLenderPacketPDF(packet);
  const fragments = extractPdfFragments(pdf);

  const snapPath = path.join(SNAP_DIR, `lender-pdf-${c.label}.txt`);
  const actual = fragments.join("\n") + "\n";

  if (UPDATE) {
    fs.mkdirSync(SNAP_DIR, { recursive: true });
    fs.writeFileSync(snapPath, actual);
    console.log(`${tag} wrote snapshot ${path.relative(process.cwd(), snapPath)} (${fragments.length} fragments)`);
    passed++;
    return;
  }

  if (!fs.existsSync(snapPath)) {
    check(`${tag} snapshot exists at ${path.relative(process.cwd(), snapPath)}`,
      false,
      `    Snapshot file is missing. Generate it with:\n      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:lender-pdf-text-snapshot`);
    return;
  }

  const expected = fs.readFileSync(snapPath, "utf8");
  if (actual === expected) {
    passed++;
    console.log(`${tag} snapshot OK (${fragments.length} fragments)`);
    return;
  }

  const expectedLines = expected.replace(/\n$/, "").split("\n");
  const actualLines = actual.replace(/\n$/, "").split("\n");
  const detail = [
    `    Snapshot mismatch for ${path.relative(process.cwd(), snapPath)}.`,
    `    If this change is intentional, refresh with:`,
    `      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:lender-pdf-text-snapshot`,
    diffLines(actualLines, expectedLines),
  ].join("\n");
  check(`${tag} lender PDF text matches snapshot`, false, detail);
}

async function main(): Promise<void> {
  for (const c of CASES) {
    await runOne(c);
  }
  console.log(`lender-pdf-text-snapshot: ${passed} passed, ${failed} failed${UPDATE ? " (UPDATE_SNAPSHOTS)" : ""}`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("lender-pdf-text-snapshot: unexpected error", err);
  process.exit(1);
});
