/**
 * Task #717 regression test — Actual / Projected indicator on the lender packet.
 *
 * Task #710 added an "Actual / Projected" indicator to the lender PDF in two
 * places:
 *   1. Column headers on the prior-year vs Year-1 tables produced by
 *      `buildPriorYearActuals` ("Prior Year (Actual)" / "Year 1 (Projected)").
 *   2. A pill on the Assumptions Confidence rollup, drawn by
 *      `drawActualVsProjectedPill` from `renderAssumptionsConfidenceSection`,
 *      that prints "ACTUAL" or "PROJECTED" depending on `packet.provenance`.
 *
 * Neither signal had an automated guard, so a future PDF refactor could
 * silently drop the indicator. This test pins both:
 *   - upstream data: `buildPacketData` → prior_year_actuals section tables
 *     carry the "(Actual)" / "(Projected)" headers, and
 *   - rendered output: `generateLenderPacketPDF` for an actuals-provenance
 *     model emits "ACTUAL" in the rollup pill, while an
 *     assumptions-provenance model emits "PROJECTED".
 */
import zlib from "node:zlib";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildPacketData } from "../src/lib/packets/build-packet-data.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
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

// PDF text extractor copied from tests/lender-five-year-callouts.ts.
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

// Clone the operating-school sample payload (which has a priorYearSnapshot
// wired in) so we can flip wizardPathway between runs without mutating the
// shared fixture.
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
  // ---- 1. buildPacketData → prior_year_actuals section headers carry
  //         "(Actual)" / "(Projected)" markers. -------------------------------
  const actualsModel = cloneWithPathway("actuals");
  const consultantActuals = await runConsultantEngine(actualsModel);
  const actualsPacket = buildPacketData({
    modelData: actualsModel as unknown as ModelData,
    consultantOutput: consultantActuals,
    modelId: 1,
    packetType: "lender",
    personaComfort: "comfortable",
  });

  check(
    "buildPacketData stamps provenance='actuals' for an actuals-pathway model",
    actualsPacket.provenance === "actuals",
    `provenance was: ${actualsPacket.provenance}`,
  );

  const priorYearSection = actualsPacket.sections.find((s) => s.id === "prior_year_actuals");
  check(
    "prior_year_actuals section is present on the lender packet",
    !!priorYearSection,
    "section disappeared — buildPriorYearActuals wiring or section list may be broken",
  );

  const tables = priorYearSection?.tables ?? [];
  const revenueTable = tables.find((t) => t.title === "Prior-Year Revenue vs Year 1");
  const expenseTable = tables.find((t) => t.title === "Prior-Year Expenses vs Year 1");
  check(
    "prior-year revenue table is present",
    !!revenueTable,
    `tables were: ${JSON.stringify(tables.map((t) => t.title))}`,
  );
  check(
    "prior-year expense table is present",
    !!expenseTable,
    `tables were: ${JSON.stringify(tables.map((t) => t.title))}`,
  );

  for (const table of [revenueTable, expenseTable]) {
    if (!table) continue;
    check(
      `${table.title}: header includes "Prior Year (Actual)"`,
      table.headers.includes("Prior Year (Actual)"),
      `headers were: ${JSON.stringify(table.headers)}`,
    );
    check(
      `${table.title}: header includes "Year 1 (Projected)"`,
      table.headers.includes("Year 1 (Projected)"),
      `headers were: ${JSON.stringify(table.headers)}`,
    );
  }

  // The Net Income Comparison table is only emitted when Year-1 revenue is
  // non-zero, but the operating-school fixture always clears that bar — so
  // pin its headers too.
  const netIncomeTable = tables.find((t) => t.title === "Net Income Comparison");
  check(
    "Net Income Comparison table is present for the operating-school fixture",
    !!netIncomeTable,
    `tables were: ${JSON.stringify(tables.map((t) => t.title))}`,
  );
  if (netIncomeTable) {
    check(
      'Net Income Comparison header includes "Prior Year (Actual)"',
      netIncomeTable.headers.includes("Prior Year (Actual)"),
      `headers were: ${JSON.stringify(netIncomeTable.headers)}`,
    );
    check(
      'Net Income Comparison header includes "Year 1 (Projected)"',
      netIncomeTable.headers.includes("Year 1 (Projected)"),
      `headers were: ${JSON.stringify(netIncomeTable.headers)}`,
    );
  }

  // ---- 2. Rendered lender PDF: actuals-provenance model emits the
  //         "ACTUAL" rollup pill, assumptions model emits "PROJECTED". -------
  const actualsLender = buildLenderPacket(
    actualsModel as unknown as ModelData,
    consultantActuals,
    1,
    "comfortable",
  );
  check(
    "buildLenderPacket preserves provenance='actuals'",
    actualsLender.provenance === "actuals",
    `provenance was: ${actualsLender.provenance}`,
  );
  const actualsPdf = await generateLenderPacketPDF(actualsLender);
  check("lender PDF (actuals) builds without error", actualsPdf.length > 0);
  const actualsPdfText = extractPDFText(actualsPdf);
  check(
    'rendered lender PDF (actuals) contains the "ACTUAL" rollup pill text',
    actualsPdfText.includes("ACTUAL"),
    "pill missing — drawActualVsProjectedPill is no longer wired into the Assumptions Confidence rollup",
  );
  check(
    'rendered lender PDF (actuals) does NOT print the "PROJECTED" pill',
    !actualsPdfText.includes("PROJECTED"),
    "pill text is wrong — actuals-provenance packets should not surface the PROJECTED pill on the rollup",
  );
  // The header strings should also reach the rendered PDF.
  check(
    'rendered lender PDF (actuals) prints the "Prior Year (Actual)" column header',
    actualsPdfText.includes("Prior Year (Actual)"),
    "column header missing — buildPriorYearActuals headers are not reaching the PDF",
  );
  check(
    'rendered lender PDF (actuals) prints the "Year 1 (Projected)" column header',
    actualsPdfText.includes("Year 1 (Projected)"),
    "column header missing — buildPriorYearActuals headers are not reaching the PDF",
  );

  const assumptionsModel = cloneWithPathway("assumptions");
  const consultantAssumptions = await runConsultantEngine(assumptionsModel);
  const assumptionsLender = buildLenderPacket(
    assumptionsModel as unknown as ModelData,
    consultantAssumptions,
    1,
    "comfortable",
  );
  check(
    "buildLenderPacket honors wizardPathway='assumptions' override",
    assumptionsLender.provenance === "assumptions",
    `provenance was: ${assumptionsLender.provenance}`,
  );
  const assumptionsPdf = await generateLenderPacketPDF(assumptionsLender);
  check("lender PDF (assumptions) builds without error", assumptionsPdf.length > 0);
  const assumptionsPdfText = extractPDFText(assumptionsPdf);
  check(
    'rendered lender PDF (assumptions) contains the "PROJECTED" rollup pill text',
    assumptionsPdfText.includes("PROJECTED"),
    "pill missing — drawActualVsProjectedPill is no longer wired into the Assumptions Confidence rollup",
  );
  check(
    'rendered lender PDF (assumptions) does NOT print the "ACTUAL" pill',
    !assumptionsPdfText.includes("ACTUAL"),
    "pill text is wrong — assumptions-provenance packets should not surface the ACTUAL pill on the rollup",
  );

  // ---- summary -----------------------------------------------------------
  console.log(`\nlender-actual-projected-indicator: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
