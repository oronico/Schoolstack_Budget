// Task #549 — smoke test for the canonical demo schools.
// Task #560 — extended to cover the fifth (CSN Operating Manual View)
//             demo, including a round-trip through the dedicated
//             generateChestertonOperatingManual export when the demo
//             carries a `data.chesterton.*` block.
//
// The five demo schools live in a single shared module
// (src/lib/demo-models/) consumed by the PR-preview seed (and, for
// the original three, the legislator-samples script). If a future
// tweak to the canonical data
// uses a field shape the consultant engine, workbook generator, or PDF
// packet builders don't expect, the only signal today is either a
// broken PR preview or someone manually running the legislator script.
//
// This test loads each demo school and runs it end-to-end through:
//   - runConsultantEngine
//   - generateWorkbook (formula workbook)
//   - generateUnderwritingWorkbook (legislator-samples underwriting xlsx)
//   - buildLenderPacket + generateLenderPacketPDF
//   - buildBoardPacket + generateBoardPacketPDF
//   - generateChestertonOperatingManual (only for demos that carry
//     a `data.chesterton.*` block — task #560)
//
// asserting the bytes look like valid xlsx / PDF so shape drift in the
// canonical data is caught the moment it lands.

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { generateWorkbook } from "../src/lib/excel-export.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { generateChestertonOperatingManual } from "../src/lib/packets/chesterton-operating-manual.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import {
  CHARTER_SCHOOL_DEMO,
  CHESTERTON_ACADEMY_DEMO,
  CHESTERTON_ACADEMY_CSN_WIZARD_DEMO,
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

// `underwriting` toggles the legislator-samples-only underwriting
// workbook check. Only the three schools that ship in the legislator
// samples script (microschool / private / charter) are exported as an
// underwriting package, so we only smoke-test that path for those
// three. The CSN-shaped Chesterton demo isn't part of the legislator
// run and doesn't need to be covered here.
const DEMO_MODELS = [
  { label: "CHARTER_SCHOOL_DEMO", model: CHARTER_SCHOOL_DEMO, underwriting: true },
  { label: "CHESTERTON_ACADEMY_DEMO", model: CHESTERTON_ACADEMY_DEMO, underwriting: false },
  { label: "CHESTERTON_ACADEMY_CSN_WIZARD_DEMO", model: CHESTERTON_ACADEMY_CSN_WIZARD_DEMO, underwriting: false },
  { label: "MICROSCHOOL_DEMO", model: MICROSCHOOL_DEMO, underwriting: true },
  { label: "PRIVATE_SCHOOL_DEMO", model: PRIVATE_SCHOOL_DEMO, underwriting: true },
];

// Task #558 / #560 — pin the canonical inventory size so a future
// change that drops a demo (e.g. one of the CSN-shaped Chesterton
// demos) without removing it from this list, or adds a new demo
// without registering it here, fails this smoke test loudly. The
// seed test (tests/seed-preview-data.ts) pins the same number on
// the insert side; keeping both in sync is the contract.
const EXPECTED_DEMO_COUNT = 5;

async function smokeTestModel(
  label: string,
  data: Record<string, unknown>,
  underwriting: boolean,
) {
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

  if (underwriting) {
    try {
      const uwWorkbook = await generateUnderwritingWorkbook(data);
      const uwBuffer = Buffer.from(await uwWorkbook.xlsx.writeBuffer());
      check(
        `${label}: underwriting workbook generates non-empty buffer`,
        uwBuffer.length > 1024,
        `bytes=${uwBuffer.length}`,
      );
      check(
        `${label}: underwriting workbook bytes look like a valid xlsx`,
        looksLikeXlsx(uwBuffer),
      );
    } catch (err) {
      check(
        `${label}: generateUnderwritingWorkbook completes`,
        false,
        err instanceof Error ? err.message : String(err),
      );
    }
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

  // Task #560 — if the demo carries a `data.chesterton.*` block,
  // round-trip it through the dedicated CSN Operating Manual export
  // so the Chesterton-only branch is also smoke-tested. Demos that
  // don't carry the block (the standard microschool / private school
  // / charter / private_school-shaped Chesterton demo) are skipped
  // because the export would fail by design — the route requires a
  // populated chesterton block.
  const dataObj = data as { chesterton?: unknown };
  if (
    dataObj.chesterton &&
    typeof dataObj.chesterton === "object" &&
    Array.isArray(
      (dataObj.chesterton as { phaseEnrollment?: unknown }).phaseEnrollment,
    )
  ) {
    try {
      const wb = await generateChestertonOperatingManual(
        data as Parameters<typeof generateChestertonOperatingManual>[0],
      );
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      check(
        `${label}: CSN Operating Manual generates non-empty buffer`,
        buf.length > 1024,
        `bytes=${buf.length}`,
      );
      check(
        `${label}: CSN Operating Manual bytes look like a valid xlsx`,
        looksLikeXlsx(buf),
      );
    } catch (err) {
      check(
        `${label}: CSN Operating Manual export completes`,
        false,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

async function run() {
  check(
    `DEMO_MODELS contains exactly ${EXPECTED_DEMO_COUNT} demos`,
    DEMO_MODELS.length === EXPECTED_DEMO_COUNT,
    `got=${DEMO_MODELS.length}`,
  );

  for (const { label, model, underwriting } of DEMO_MODELS) {
    check(
      `${label}: shared module exposes a data record`,
      model && typeof model.data === "object" && model.data !== null,
    );
    await smokeTestModel(
      label,
      model.data as Record<string, unknown>,
      underwriting,
    );
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
