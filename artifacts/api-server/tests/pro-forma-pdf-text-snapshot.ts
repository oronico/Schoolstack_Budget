/**
 * Task #896 — Pro-forma PDF text-rendering snapshot tests.
 *
 * Sibling of `tests/lender-pdf-text-snapshot.ts` (Task #893). Pins the
 * exact rendered string fragments PDFKit emits into the Pro Forma
 * Financial Model PDF for each of the three seeded demo personas
 * against a per-persona file under `__snapshots__/pro-forma-pdf-<persona>.txt`.
 *
 * The pro-forma PDF takes raw model data directly (no canonical-engine
 * pre-pass), so the test only needs to call `generateProFormaPDF` with
 * each persona's seeded model.
 *
 * To intentionally update snapshots after a deliberate formatter
 * change, run:
 *
 *     UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run \
 *       test:pro-forma-pdf-text-snapshot
 *
 * Hermetic: no DB, no network, no env vars beyond `UPDATE_SNAPSHOTS`.
 */
import fs from "node:fs";
import path from "node:path";

import { generateProFormaPDF } from "../src/lib/pdf-proforma.js";
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
  const pdf = await generateProFormaPDF(data);
  const fragments = extractPdfFragments(pdf);

  const snapPath = path.join(SNAP_DIR, `pro-forma-pdf-${c.label}.txt`);
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
      `    Snapshot file is missing. Generate it with:\n      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:pro-forma-pdf-text-snapshot`);
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
    `      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:pro-forma-pdf-text-snapshot`,
    diffLines(actualLines, expectedLines),
  ].join("\n");
  check(`${tag} pro-forma PDF text matches snapshot`, false, detail);
}

async function main(): Promise<void> {
  for (const c of CASES) {
    await runOne(c);
  }
  console.log(`pro-forma-pdf-text-snapshot: ${passed} passed, ${failed} failed${UPDATE ? " (UPDATE_SNAPSHOTS)" : ""}`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("pro-forma-pdf-text-snapshot: unexpected error", err);
  process.exit(1);
});
