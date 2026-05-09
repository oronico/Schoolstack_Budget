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
import zlib from "node:zlib";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import { privateSchoolWithESA } from "./sample-payloads.js";

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
function extractPDFText(pdf: Buffer): string {
  const out: string[] = [];
  let cursor = 0;
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
    out.push(extractStringLiterals(body));
    cursor = eIdx + "endstream".length;
  }
  return out.join("\n");
}

function extractStringLiterals(content: string): string {
  let result = "";
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
          str += c;
          i++;
          continue;
        }
        str += c;
        i++;
      }
      result += str;
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
      result += str;
      continue;
    }
    i++;
  }
  return result;
}

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
  const actualsPdfText = extractPDFText(actualsPdf);
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
  const assumptionsPdfText = extractPDFText(assumptionsPdf);
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
