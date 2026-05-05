// Task #549 — smoke test for the canonical demo schools.
//
// The three demo schools live in a single shared module
// (src/lib/demo-models/) consumed by both the PR-preview seed and the
// legislator-samples script. If a future tweak to the canonical data
// uses a field shape the consultant engine, workbook generator, or PDF
// packet builders don't expect, the only signal today is either a
// broken PR preview or someone manually running the legislator script.
//
// This test loads each demo school and runs it end-to-end through:
//   - runConsultantEngine
//   - generateWorkbook (formula workbook)
//   - buildLenderPacket + generateLenderPacketPDF
//   - buildBoardPacket + generateBoardPacketPDF
//
// asserting the bytes look like valid xlsx / PDF so shape drift in the
// canonical data is caught the moment it lands.

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { generateWorkbook } from "../src/lib/excel-export.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import {
  CHARTER_SCHOOL_DEMO,
  MICROSCHOOL_DEMO,
  PRIVATE_SCHOOL_DEMO,
} from "../src/lib/demo-models/index.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// xlsx files are zip archives, which always start with the ZIP local
// file header magic bytes "PK\x03\x04".
function looksLikeXlsx(buf: Buffer): boolean {
  return (
    buf.length > 4 &&
    buf[0] === 0x50 && // P
    buf[1] === 0x4b && // K
    buf[2] === 0x03 &&
    buf[3] === 0x04
  );
}

// PDF files always start with the "%PDF-" header and end with "%%EOF".
function looksLikePdf(buf: Buffer): boolean {
  if (buf.length < 10) return false;
  const header = buf.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") return false;
  // PDF readers are tolerant of trailing whitespace after %%EOF.
  const tail = buf.subarray(Math.max(0, buf.length - 16)).toString("ascii");
  return tail.includes("%%EOF");
}

const DEMO_MODELS = [
  { label: "CHARTER_SCHOOL_DEMO", model: CHARTER_SCHOOL_DEMO },
  { label: "MICROSCHOOL_DEMO", model: MICROSCHOOL_DEMO },
  { label: "PRIVATE_SCHOOL_DEMO", model: PRIVATE_SCHOOL_DEMO },
];

async function smokeTestModel(label: string, data: Record<string, unknown>) {
  let consultantOutput: Awaited<ReturnType<typeof runConsultantEngine>> | null =
    null;
  try {
    consultantOutput = await runConsultantEngine(data);
    check(`${label}: runConsultantEngine completes`, true);
  } catch (err) {
    check(
      `${label}: runConsultantEngine completes`,
      false,
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  check(
    `${label}: consultant output has keyMetrics`,
    Array.isArray(consultantOutput.keyMetrics) &&
      consultantOutput.keyMetrics.length > 0,
  );
  check(
    `${label}: consultant output has cumulativeFinancials`,
    Array.isArray(consultantOutput.cumulativeFinancials) &&
      consultantOutput.cumulativeFinancials.length > 0,
  );

  const typedData = data as unknown as ModelData;

  try {
    const workbookBuf = await generateWorkbook(data, consultantOutput);
    check(
      `${label}: formula workbook generates non-empty buffer`,
      workbookBuf.length > 1024,
      `bytes=${workbookBuf.length}`,
    );
    check(
      `${label}: formula workbook bytes look like a valid xlsx`,
      looksLikeXlsx(workbookBuf),
    );
  } catch (err) {
    check(
      `${label}: generateWorkbook completes`,
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  try {
    const lenderPacket = buildLenderPacket(typedData, consultantOutput, 1);
    const lenderPdf = await generateLenderPacketPDF(lenderPacket);
    check(
      `${label}: lender packet PDF generates non-empty buffer`,
      lenderPdf.length > 1024,
      `bytes=${lenderPdf.length}`,
    );
    check(
      `${label}: lender packet bytes look like a valid PDF`,
      looksLikePdf(lenderPdf),
    );
  } catch (err) {
    check(
      `${label}: lender packet PDF generates`,
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  try {
    const boardPacket = buildBoardPacket(typedData, consultantOutput, 1);
    const boardPdf = await generateBoardPacketPDF(boardPacket);
    check(
      `${label}: board packet PDF generates non-empty buffer`,
      boardPdf.length > 1024,
      `bytes=${boardPdf.length}`,
    );
    check(
      `${label}: board packet bytes look like a valid PDF`,
      looksLikePdf(boardPdf),
    );
  } catch (err) {
    check(
      `${label}: board packet PDF generates`,
      false,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function run() {
  for (const { label, model } of DEMO_MODELS) {
    check(
      `${label}: shared module exposes a data record`,
      model && typeof model.data === "object" && model.data !== null,
    );
    await smokeTestModel(label, model.data as Record<string, unknown>);
  }

  console.log(`\ndemo-models-smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("Failures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
