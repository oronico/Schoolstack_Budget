/**
 * Task #724 regression test — Prior-Year vs Year 1 comparison tables on the
 * board PDF.
 *
 * Until Task #724, `BOARD_PACKET_SECTIONS` in `build-board-packet.ts` omitted
 * the `prior_year_actuals` section id, so the section produced by
 * `buildPriorYearActuals` was filtered out of the board PDF even though the
 * lender PDF rendered it. Trustees of an operating school benefit from the
 * same side-by-side picture lenders see — especially now that the wizard's
 * Actual / Projected pill (Task #721) tells them the rollup is built from
 * real numbers — so the section now flows through to the board renderer.
 *
 * This test pins both halves of the contract:
 *   1. An operating-school model with `priorYearSnapshot` populated produces
 *      a board PDF that contains the section title and the "(Actual)" /
 *      "(Projected)" column headers added in Task #710.
 *   2. A pre-opening model with `priorYearSnapshot` removed gracefully omits
 *      the section instead of printing an empty block.
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

// PDF text extractor — same approach as
// `board-actual-projected-indicator.ts`. PDFKit emits text via both literal
// `(...)` strings AND `<...>` hex strings, so we handle both forms.
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

async function run(): Promise<void> {
  // ---- operating-school model: prior-year section reaches the board PDF --
  const operatingModel = JSON.parse(JSON.stringify(privateSchoolWithESA)) as Record<string, unknown>;
  const py = (operatingModel as { priorYearSnapshot?: unknown }).priorYearSnapshot;
  check(
    "sample model carries a priorYearSnapshot (precondition)",
    !!py,
    "the privateSchoolWithESA fixture must seed priorYearSnapshot for this test to be meaningful",
  );

  const consultantOperating = await runConsultantEngine(operatingModel);
  const operatingBoard = buildBoardPacket(
    operatingModel as unknown as ModelData,
    consultantOperating,
    1,
    "comfortable",
  );
  const operatingSection = operatingBoard.sections.find((s) => s.id === "prior_year_actuals");
  check(
    "buildBoardPacket includes the prior_year_actuals section for an operating school",
    !!operatingSection && operatingSection.included !== false,
    operatingSection
      ? `section.included was ${operatingSection.included}`
      : "section was filtered out of BOARD_PACKET_SECTIONS",
  );

  const operatingPdf = await generateBoardPacketPDF(operatingBoard);
  check("board PDF (operating) builds without error", operatingPdf.length > 0);
  const operatingText = extractPDFText(operatingPdf);
  check(
    "rendered board PDF (operating) prints the Prior-Year Revenue vs Year 1 table title",
    operatingText.includes("Prior-Year Revenue vs Year 1"),
    "section title missing — prior_year_actuals is no longer reaching the board renderer",
  );
  check(
    "rendered board PDF (operating) prints the Prior-Year Expenses vs Year 1 table title",
    operatingText.includes("Prior-Year Expenses vs Year 1"),
    "expense comparison title missing from board PDF",
  );
  check(
    'rendered board PDF (operating) prints the "(Actual)" column header (Task #710)',
    operatingText.includes("Prior Year (Actual)"),
    "the Task #710 Actual / Projected column headers must reach the board PDF",
  );
  check(
    'rendered board PDF (operating) prints the "(Projected)" column header (Task #710)',
    operatingText.includes("Year 1 (Projected)"),
    "the Task #710 Actual / Projected column headers must reach the board PDF",
  );

  // ---- pre-opening model: section is gracefully omitted ------------------
  const preOpeningModel = JSON.parse(JSON.stringify(privateSchoolWithESA)) as Record<string, unknown>;
  delete (preOpeningModel as { priorYearSnapshot?: unknown }).priorYearSnapshot;

  const consultantPreOpening = await runConsultantEngine(preOpeningModel);
  const preOpeningBoard = buildBoardPacket(
    preOpeningModel as unknown as ModelData,
    consultantPreOpening,
    1,
    "comfortable",
  );
  const preOpeningSection = preOpeningBoard.sections.find((s) => s.id === "prior_year_actuals");
  check(
    "pre-opening model marks prior_year_actuals as included=false",
    !!preOpeningSection && preOpeningSection.included === false,
    preOpeningSection
      ? `section.included was ${preOpeningSection.included}`
      : "section is missing from the packet entirely (expected included=false stub)",
  );

  const preOpeningPdf = await generateBoardPacketPDF(preOpeningBoard);
  check("board PDF (pre-opening) builds without error", preOpeningPdf.length > 0);
  const preOpeningText = extractPDFText(preOpeningPdf);
  check(
    "rendered board PDF (pre-opening) does NOT print the prior-year section title",
    !preOpeningText.includes("Prior-Year Revenue vs Year 1"),
    "pre-opening models must omit the prior-year-vs-Year-1 block instead of printing an empty placeholder",
  );

  console.log(`\nboard-prior-year-actuals-section: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
