/**
 * Task #920 (Pattern D regression) — Suppress empty Decision History section.
 *
 * Canonical source:
 *   `buildLenderPacket` / `buildBoardPacket` always emit a `decision_history`
 *   PacketSection (see `build-packet-data.ts` :296). The packet object also
 *   carries `decisionHistory: DecisionHistoryItem[]` populated from
 *   `customScenarios` filtered to those with an outcome.
 *
 *   Until #920 the section heading + an "empty-state hint" line rendered
 *   even when `decisionHistory.length === 0`. That telegraphed unbuilt
 *   functionality to lenders / board readers. Fix lives at the render-time
 *   gate in:
 *     - artifacts/api-server/src/lib/packets/lender-packet-pdf.ts (~L987)
 *     - artifacts/api-server/src/lib/packets/board-packet-pdf.ts  (~L91)
 *
 * Sibling bug search:
 *   `rg "section.id === \"decision_history\"" artifacts/api-server` → only
 *   the two render-time gates above. The pro-forma + loan-readiness
 *   packets do not include the section in their PacketSection lists, so
 *   no sibling fix is required.
 *
 * Assertions (Pattern D — both branches pinned):
 *   For each renderer (lender, board):
 *     Branch A — zero decisions:
 *       extracted body-page text contains NEITHER "Decision History"
 *       (heading) NOR the empty-state hint "Once decisions are saved".
 *     Branch B — synthetic decision:
 *       extracted body-page text DOES contain "Decision History" past
 *       the cover/TOC page AND a recognizable token from the synthetic
 *       decision's rendered card.
 *
 * Hermetic: no DB, no network, no env vars.
 */
import zlib from "node:zlib";

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { MICROSCHOOL_MODEL } from "../src/lib/seed-preview-data.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; return; }
  failed++;
  failures.push(`  FAIL: ${label}${detail ? `\n${detail}` : ""}`);
}

// Same per-stream extractor used by lender-pdf-text-snapshot.ts — handles
// both `(literal)` strings AND `<hex>` strings (PDFKit emits the latter
// for kerned runs in body text). Returns one fragment-array per page
// (each PDF page is a separate FlateDecoded content stream).
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
              oct += content[i]; i++;
            }
            str += String.fromCharCode(parseInt(oct, 8));
            continue;
          }
          str += n; i += 2; continue;
        }
        if (c === "(") { depth++; str += c; i++; continue; }
        if (c === ")") { depth--; if (depth === 0) { i++; break; } str += c; i++; continue; }
        str += c; i++;
      }
      if (str.length > 0) out.push(str);
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      i++;
      let hex = "";
      while (i < content.length && content[i] !== ">") {
        const c = content[i];
        if ((c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")) hex += c;
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

function extractPagesText(pdf: Buffer): string[] {
  const pages: string[] = [];
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
    try { body = zlib.inflateSync(raw).toString("binary"); }
    catch { body = raw.toString("binary"); }
    const frags: string[] = [];
    extractStringLiterals(body, frags);
    if (frags.length > 0) pages.push(frags.join(""));
    cursor = eIdx + "endstream".length;
  }
  return pages;
}

const EMPTY_HINT = "Once decisions are saved";

// PDFKit Helvetica-Bold kerns the section heading "Decision History" as
// two `(...)` literals — "Decision Histor" + "y". We accept either the
// joined or the heading-prefix form so kerning churn doesn't false-fail.
function hasDecisionHistoryHeading(body: string): boolean {
  return body.includes("Decision History") || body.includes("Decision Histor");
}

async function runFor(
  label: string,
  build: (model: unknown, consultant: unknown, idx: number) => { decisionHistory: unknown[] },
  render: (packet: unknown) => Promise<Buffer>,
): Promise<void> {
  // ── Branch A: zero decisions ─────────────────────────────────────
  const base = { ...(MICROSCHOOL_MODEL.data as Record<string, unknown>) };
  delete (base as Record<string, unknown>).customScenarios;
  const consultantA = await runConsultantEngine(base);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const packetA = (build as any)(base, consultantA, 0);
  check(`${label} branch A: decisionHistory empty`, packetA.decisionHistory.length === 0);
  const pdfA = await render(packetA);
  const pagesA = extractPagesText(pdfA);
  // Cover/TOC is page 1 — it legitimately lists "Decision History" as a
  // numbered TOC entry. Body pages start at page 2.
  const bodyA = pagesA.slice(1).join("\n");
  check(
    `${label} branch A: body has no "Decision History" heading`,
    !hasDecisionHistoryHeading(bodyA),
    `    Found "Decision History" text past the cover/TOC.`,
  );
  check(
    `${label} branch A: body has no empty-state hint`,
    !bodyA.includes(EMPTY_HINT),
    `    Found "${EMPTY_HINT}" — empty-state body still rendering.`,
  );

  // ── Branch B: synthetic decision ─────────────────────────────────
  const withDecision = {
    ...base,
    customScenarios: [
      {
        name: "ZZSyntheticDecisionMarker920",
        outcomeStatus: "pursued",
        decisionType: "add_program",
        appliedToModelAt: "2025-03-15T12:00:00Z",
        overrides: { addProgramName: "Middle School", addProgramTuition: 14000 },
      },
    ],
  };
  const consultantB = await runConsultantEngine(withDecision);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const packetB = (build as any)(withDecision, consultantB, 0);
  check(`${label} branch B: decisionHistory has 1 item`, packetB.decisionHistory.length === 1);
  const pdfB = await render(packetB);
  const pagesB = extractPagesText(pdfB);
  const bodyB = pagesB.slice(1).join("\n");
  check(
    `${label} branch B: body contains "Decision History" heading`,
    hasDecisionHistoryHeading(bodyB),
    `    Expected the section to render when decisionHistory is non-empty.`,
  );
  // The renderDecisionHistoryItem card prints the outcome label
  // "PURSUED" (Helvetica caps) and the type label "Add a program" — both
  // are distinct fingerprints of a rendered decision card that won't
  // appear when the section is suppressed. We assert at least one.
  check(
    `${label} branch B: body contains rendered decision card`,
    bodyB.includes("PURSUED") || bodyB.includes("Add a program"),
    `    Expected "PURSUED" or "Add a program" in rendered body — no decision card detected.`,
  );
}

async function main(): Promise<void> {
  await runFor(
    "lender",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildLenderPacket as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generateLenderPacketPDF as any,
  );
  await runFor(
    "board",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildBoardPacket as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generateBoardPacketPDF as any,
  );
  console.log(`decision-history-suppression-920: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("decision-history-suppression-920: unexpected error", err);
  process.exit(1);
});
