/**
 * Task #896 — Loan-readiness PDF text-rendering snapshot tests.
 *
 * Sibling of `tests/lender-pdf-text-snapshot.ts` (Task #893). Pins the
 * exact rendered string fragments PDFKit emits into the Loan Readiness
 * Report PDF for each of the three seeded demo personas against a
 * per-persona file under `__snapshots__/loan-readiness-pdf-<persona>.txt`.
 *
 * The loan-readiness PDF takes a ConsultantOutput plus the school
 * name + entity type, so we run the canonical engine on each persona
 * and pass the school identity straight through from the seeded model.
 *
 * To intentionally update snapshots after a deliberate formatter
 * change, run:
 *
 *     UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run \
 *       test:loan-readiness-pdf-text-snapshot
 *
 * Hermetic: no DB, no network, no env vars beyond `UPDATE_SNAPSHOTS`.
 */
import fs from "node:fs";
import path from "node:path";

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { generateLoanReadinessPDF } from "../src/lib/pdf-loan-readiness.js";
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
  const sp = (data.schoolProfile as Record<string, unknown> | undefined) || {};
  const schoolName = (sp.schoolName as string | undefined) || "School";
  const entityType = sp.entityType as string | undefined;
  const consultant = await runConsultantEngine(data);

  const pdf = await generateLoanReadinessPDF(consultant, schoolName, entityType);
  const fragments = extractPdfFragments(pdf);

  const snapPath = path.join(SNAP_DIR, `loan-readiness-pdf-${c.label}.txt`);
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
      `    Snapshot file is missing. Generate it with:\n      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:loan-readiness-pdf-text-snapshot`);
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
    `      UPDATE_SNAPSHOTS=1 pnpm --filter @workspace/api-server run test:loan-readiness-pdf-text-snapshot`,
    diffLines(actualLines, expectedLines),
  ].join("\n");
  check(`${tag} loan-readiness PDF text matches snapshot`, false, detail);
}

async function main(): Promise<void> {
  for (const c of CASES) {
    await runOne(c);
  }
  console.log(`loan-readiness-pdf-text-snapshot: ${passed} passed, ${failed} failed${UPDATE ? " (UPDATE_SNAPSHOTS)" : ""}`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("loan-readiness-pdf-text-snapshot: unexpected error", err);
  process.exit(1);
});
