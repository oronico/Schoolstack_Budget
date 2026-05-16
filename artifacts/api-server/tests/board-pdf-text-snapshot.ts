/**
 * Task #896 — Board packet PDF text-rendering snapshot tests.
 *
 * Sibling of `tests/lender-pdf-text-snapshot.ts` (Task #893). Pins the
 * exact rendered string fragments PDFKit emits into the Board and Funder
 * Summary PDF for each of the three seeded demo personas against a
 * per-persona file under `__snapshots__/board-pdf-<persona>.txt`. Any
 * change to a dollar figure, section heading, label, the order they
 * print in, or the formatter that produces them surfaces here as an
 * actionable line-by-line diff.
 *
 * To intentionally update snapshots after a deliberate formatter
 * change, run:
 *
 *     UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run \
 *       test:board-pdf-text-snapshot
 *
 * Hermetic: no DB, no network, no env vars beyond `UPDATE_SNAPSHOTS`.
 */
import fs from "node:fs";
import path from "node:path";

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import { extractPdfFragments, diffLines } from "./_pdf-text-snapshot-util.js";

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

interface PersonaCase {
  label: string;
  model: typeof MICROSCHOOL_MODEL;
}

const CASES: PersonaCase[] = [
  { label: "microschool",    model: MICROSCHOOL_MODEL },
  { label: "private_school", model: PRIVATE_SCHOOL_MODEL },
  { label: "charter_school", model: CHARTER_SCHOOL_MODEL },
];

async function runOne(c: PersonaCase): Promise<void> {
  const tag = `[${c.label}]`;
  const data = c.model.data as unknown as Record<string, unknown>;
  const consultant = await runConsultantEngine(data);
  const packet = buildBoardPacket(
    data as unknown as Parameters<typeof buildBoardPacket>[0],
    consultant,
    0,
  );
  // Pin generatedAt so the cover page's "Prepared <date>" line is
  // identical across runs even before the footer-date redaction step.
  (packet as unknown as { generatedAt: Date }).generatedAt = new Date(
    "2026-01-01T00:00:00Z",
  );

  const pdf = await generateBoardPacketPDF(packet);
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
      `    Snapshot file is missing. Generate it with:\n      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:board-pdf-text-snapshot`);
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
    `      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:board-pdf-text-snapshot`,
    diffLines(actualLines, expectedLines),
  ].join("\n");
  check(`${tag} board PDF text matches snapshot`, false, detail);
}

async function main(): Promise<void> {
  for (const c of CASES) {
    await runOne(c);
  }
  console.log(`board-pdf-text-snapshot: ${passed} passed, ${failed} failed${UPDATE ? " (UPDATE_SNAPSHOTS)" : ""}`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("board-pdf-text-snapshot: unexpected error", err);
  process.exit(1);
});
