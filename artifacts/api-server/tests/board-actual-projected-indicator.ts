/**
 * Task #721 regression test — Actual / Projected indicator on the board packet.
 *
 * Task #716 added the shared `renderAssumptionsConfidenceSection` helper to
 * the board PDF and wired `packet.provenance` through, so trustees see the
 * same "ACTUAL" / "PROJECTED" pill on the Assumptions Confidence rollup that
 * lenders already see. No automated guard pinned that wiring on the board
 * surface, so a future BoardPacket refactor (e.g. dropping `provenance` from
 * the spread, or rewiring the renderer) could silently regress trustees back
 * to a hard-coded "PROJECTED" pill.
 *
 * Mirrors `lender-actual-projected-indicator.ts` for the board surface:
 *   - `buildBoardPacket` preserves `provenance` from `buildPacketData`, and
 *   - `generateBoardPacketPDF` emits "ACTUAL" for an actuals-pathway model
 *     and "PROJECTED" for an assumptions-pathway model.
 */
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import { privateSchoolWithESA } from "./sample-payloads.js";

import { extractPdfText } from "./_pdf-text-snapshot-util.js";
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// PDF text extractor copied from lender-actual-projected-indicator.ts.
// PDFKit emits text via both literal `(...)` strings AND `<...>` hex strings,
// so we handle both forms to reliably find the indicator pill text.
function cloneWithPathway(pathway: "actuals" | "assumptions" | undefined): Record<string, unknown> {
  const base = JSON.parse(JSON.stringify(privateSchoolWithESA)) as Record<string, unknown>;
  const sp = base.schoolProfile as Record<string, unknown>;
  if (pathway) {
    sp.wizardPathway = pathway;
  } else {
    delete sp.wizardPathway;
  }
  return base;
}

async function run(): Promise<void> {
  // ---- actuals-provenance board PDF emits the "ACTUAL" rollup pill ------
  const actualsModel = cloneWithPathway("actuals");
  const consultantActuals = await runConsultantEngine(actualsModel);
  const actualsBoard = buildBoardPacket(
    actualsModel as unknown as ModelData,
    consultantActuals,
    1,
    "comfortable",
  );
  check(
    "buildBoardPacket preserves provenance='actuals' from buildPacketData",
    actualsBoard.provenance === "actuals",
    `provenance was: ${actualsBoard.provenance}`,
  );
  const actualsPdf = await generateBoardPacketPDF(actualsBoard);
  check("board PDF (actuals) builds without error", actualsPdf.length > 0);
  const actualsPdfText = extractPdfText(actualsPdf);
  check(
    'rendered board PDF (actuals) contains the "ACTUAL" rollup pill text',
    actualsPdfText.includes("ACTUAL"),
    "pill missing — packet.provenance is no longer reaching renderAssumptionsConfidenceSection on the board PDF",
  );
  check(
    'rendered board PDF (actuals) does NOT print the "PROJECTED" pill',
    !actualsPdfText.includes("PROJECTED"),
    "pill text is wrong — actuals-provenance board packets should not surface the PROJECTED pill",
  );

  // ---- assumptions-provenance board PDF emits the "PROJECTED" rollup pill
  const assumptionsModel = cloneWithPathway("assumptions");
  const consultantAssumptions = await runConsultantEngine(assumptionsModel);
  const assumptionsBoard = buildBoardPacket(
    assumptionsModel as unknown as ModelData,
    consultantAssumptions,
    1,
    "comfortable",
  );
  check(
    "buildBoardPacket honors wizardPathway='assumptions' override",
    assumptionsBoard.provenance === "assumptions",
    `provenance was: ${assumptionsBoard.provenance}`,
  );
  const assumptionsPdf = await generateBoardPacketPDF(assumptionsBoard);
  check("board PDF (assumptions) builds without error", assumptionsPdf.length > 0);
  const assumptionsPdfText = extractPdfText(assumptionsPdf);
  check(
    'rendered board PDF (assumptions) contains the "PROJECTED" rollup pill text',
    assumptionsPdfText.includes("PROJECTED"),
    "pill missing — packet.provenance is no longer reaching renderAssumptionsConfidenceSection on the board PDF",
  );
  check(
    'rendered board PDF (assumptions) does NOT print the "ACTUAL" pill',
    !assumptionsPdfText.includes("ACTUAL"),
    "pill text is wrong — assumptions-provenance board packets should not surface the ACTUAL pill",
  );

  console.log(`\nboard-actual-projected-indicator: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
