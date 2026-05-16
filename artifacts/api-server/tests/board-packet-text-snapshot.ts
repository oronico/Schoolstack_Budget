/**
 * Task #899 — Board packet PDF text-rendering snapshot tests.
 *
 * Mirror of `lender-pdf-text-snapshot.ts` (Task #893 / Task #895) for
 * the board-and-funder packet PDF. The board packet has its own
 * per-literal coverage in `board-packet-pdf-route.ts`, but those
 * assertions only pin the seeded demo personas. A board-only formatter
 * change that mishandles a multi-loan cap table, a restricted-gift
 * heavy revenue mix, a mid-cycle capital campaign with a Y2 facility
 * step-up, or a stacked voucher + scholarship cohort would still slip
 * past CI.
 *
 * This test reuses the founder-shaped fixtures from
 * `tests/fixtures/lender-pdf-fixtures.ts` (multi_debt_stack,
 * restricted_gifts_heavy, capital_campaign_mid_cycle,
 * voucher_scholarship_combo) plus the three seeded demo personas
 * (microschool / private / charter) and produces a per-fixture
 * per-literal snapshot under `tests/__snapshots__/board-pdf-<label>.txt`.
 *
 * To intentionally update snapshots after a deliberate formatter
 * change, run:
 *
 *     UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run \
 *       test:board-packet-text-snapshot
 *
 * Hermetic: no DB, no network, no env vars beyond `UPDATE_SNAPSHOTS`.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { buildFounderSummary } from "../src/lib/packets/build-founder-summary.js";
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import { LENDER_PDF_FIXTURES } from "./fixtures/lender-pdf-fixtures.js";

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
// See lender-pdf-text-snapshot.ts for the rationale behind per-literal
// (rather than per-page concatenation) granularity and the
// across-fragment date redaction. Keeping the two implementations in
// sync makes it easy to update one when PDFKit changes its emission
// shape.
function extractStringLiterals(content: string, out: string[]): void {
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "(") {
      i++;
      let depth = 1;
      let str = "";
      while (i < content.length && depth > 0) {
        const c = content[i];
        if (c === "\\") {
          const n = content[i + 1];
          if (n === undefined) { i++; break; }
          if (n === "n") { str += "\n"; i += 2; continue; }
          if (n === "r") { str += "\r"; i += 2; continue; }
          if (n === "t") { str += "\t"; i += 2; continue; }
          if (n === "b" || n === "f") { i += 2; continue; }
          if (n === "(" || n === ")" || n === "\\") { str += n; i += 2; continue; }
          if (n >= "0" && n <= "7") {
            let oct = "";
            i++;
            while (oct.length < 3 && i < content.length && content[i] >= "0" && content[i] <= "7") {
              oct += content[i];
              i++;
            }
            str += String.fromCharCode(parseInt(oct, 8));
            continue;
          }
          str += n;
          i += 2;
          continue;
        }
        if (c === "(") { depth++; str += c; i++; continue; }
        if (c === ")") {
          depth--;
          if (depth === 0) { i++; break; }
          str += c; i++; continue;
        }
        str += c;
        i++;
      }
      if (str.length > 0) out.push(str);
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      i++;
      let hex = "";
      while (i < content.length && content[i] !== ">") {
        const c = content[i];
        if ((c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")) {
          hex += c;
        }
        i++;
      }
      if (content[i] === ">") i++;
      if (hex.length % 2 === 1) hex += "0";
      let str = "";
      for (let h = 0; h < hex.length; h += 2) {
        str += String.fromCharCode(parseInt(hex.substr(h, 2), 16));
      }
      if (str.length > 0) out.push(str);
      continue;
    }
    i++;
  }
}

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`(${MONTHS})\\s+\\d{1,2},\\s+\\d{4}`, "g");

function redactDatesAcrossFragments(fragments: string[]): string[] {
  if (fragments.length === 0) return fragments;
  const offsets: number[] = new Array(fragments.length);
  let joined = "";
  for (let i = 0; i < fragments.length; i++) {
    offsets[i] = joined.length;
    joined += fragments[i];
  }
  const owner = new Int32Array(joined.length);
  for (let i = 0; i < fragments.length; i++) {
    const start = offsets[i];
    const end = i + 1 < fragments.length ? offsets[i + 1] : joined.length;
    for (let k = start; k < end; k++) owner[k] = i;
  }
  const out = fragments.slice();
  const matches = Array.from(joined.matchAll(DATE_RE));
  for (let m = matches.length - 1; m >= 0; m--) {
    const match = matches[m];
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const firstFrag = owner[start];
    const lastFrag = owner[end - 1];
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
  return out.filter((s) => s.length > 0);
}

function extractPdfFragments(pdf: Buffer): string[] {
  const out: string[] = [];
  let cursor = 0;
  let page = 0;
  while (cursor < pdf.length) {
    const sIdx = pdf.indexOf("stream", cursor);
    if (sIdx === -1) break;
    let dataStart = sIdx + "stream".length;
    if (pdf[dataStart] === 0x0d) dataStart++;
    if (pdf[dataStart] === 0x0a) dataStart++;
    const eIdx = pdf.indexOf("endstream", dataStart);
    if (eIdx === -1) break;
    let dataEnd = eIdx;
    if (pdf[dataEnd - 1] === 0x0a) dataEnd--;
    if (pdf[dataEnd - 1] === 0x0d) dataEnd--;
    const raw = pdf.subarray(dataStart, dataEnd);
    let body: string;
    try {
      body = zlib.inflateSync(raw).toString("binary");
    } catch {
      body = raw.toString("binary");
    }
    const pageFragments: string[] = [];
    extractStringLiterals(body, pageFragments);
    if (pageFragments.length > 0) {
      page++;
      const redacted = redactDatesAcrossFragments(pageFragments);
      out.push(`--- PAGE ${page} ---`, ...redacted);
    }
    cursor = eIdx + "endstream".length;
  }
  return out;
}

interface SnapshotCase {
  label: string;
  data: Record<string, unknown>;
}

// Three seeded demo personas (microschool / private / charter) plus
// the real-founder-shaped fixtures from task #895.
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
  const packet = buildBoardPacket(
    data as unknown as Parameters<typeof buildBoardPacket>[0],
    consultant,
    0,
  );
  // Pin generatedAt so the "Prepared <date>" line normalizes
  // identically across runs even before DATE_RE redaction.
  (packet as unknown as { generatedAt: Date }).generatedAt = new Date(
    "2026-01-01T00:00:00Z",
  );

  // The HTTP route passes a founderSummary as the second argument so
  // the plain-English one-pager leads the packet body. Mirror that
  // call shape here so the snapshot covers the same surface the
  // founder actually downloads.
  const founderSummary = buildFounderSummary(
    data as unknown as Parameters<typeof buildFounderSummary>[0],
    consultant,
  );
  const pdf = await generateBoardPacketPDF(packet, founderSummary);
  const fragments = extractPdfFragments(pdf);

  const snapPath = path.join(SNAP_DIR, `board-pdf-${c.label}.txt`);
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
      `    Snapshot file is missing. Generate it with:\n      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:board-packet-text-snapshot`);
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
    `      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:board-packet-text-snapshot`,
    diffLines(actualLines, expectedLines),
  ].join("\n");
  check(`${tag} board PDF text matches snapshot`, false, detail);
}

async function main(): Promise<void> {
  for (const c of CASES) {
    await runOne(c);
  }
  console.log(`board-packet-text-snapshot: ${passed} passed, ${failed} failed${UPDATE ? " (UPDATE_SNAPSHOTS)" : ""}`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("board-packet-text-snapshot: unexpected error", err);
  process.exit(1);
});
