/**
 * Task #894 — Lender pro-forma vs underwriting Operating Statement tie-out.
 *
 * The lender packet ships TWO Excel workbooks: the underwriting workbook
 * (full driver engine, canonical accounting bottom line) and the lender
 * pro-forma (simplified per-student / per-row comparator that lenders
 * use to re-run sensitivities). On the same payload their Y1 Net Income
 * figures DO NOT tie, and that divergence is intentional — see the
 * file-level doc comment on `buildPnL` in
 * `src/lib/lender-proforma-export.ts`.
 *
 * The smoke test in `tests/demo-math-smoke.ts` carries a `void truthNi`
 * hand-off pointing at this file as the place that enforces the
 * documented invariants. This test pins them down so a future change
 * can't silently re-converge the two surfaces (which would change the
 * meaning of one of them) OR drop the disclosure that warns a reader
 * about the divergence.
 *
 * Hermetic: no DB, no network, no env vars.
 */
import ExcelJS from "exceljs";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { generateLenderProFormaWorkbook } from "../src/lib/lender-proforma-export.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import zlib from "node:zlib";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) passed++;
  else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function cellNumber(ws: ExcelJS.Worksheet, row: number, col: number): number {
  const v = ws.getCell(row, col).value as unknown;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in (v as object)) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
  }
  return 0;
}
function cellString(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getCell(row, col).value as unknown;
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "object" && "result" in (v as object)) {
    return String((v as { result: unknown }).result ?? "");
  }
  return String(v);
}
function findRow(ws: ExcelJS.Worksheet, label: string, col = 1): number {
  let f = -1;
  ws.eachRow((_r, n) => { if (f > 0) return; if (cellString(ws, n, col) === label) f = n; });
  return f;
}

type AnyBuf = Parameters<ExcelJS.Xlsx["load"]>[0];

// Minimal PDF text extractor (mirror of demo-math-smoke). Good enough to
// assert the methodology callout copy ships in the rendered bytes.
function extractStringLiterals(content: string): string {
  let result = ""; let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "(") {
      i++; let depth = 1; let str = "";
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
            let oct = ""; i++;
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
      result += str; continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      i++; let hex = "";
      while (i < content.length && content[i] !== ">") {
        const c = content[i];
        if ((c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")) hex += c;
        i++;
      }
      if (content[i] === ">") i++;
      if (hex.length % 2 === 1) hex += "0";
      let str = "";
      for (let h = 0; h < hex.length; h += 2) str += String.fromCharCode(parseInt(hex.substr(h, 2), 16));
      result += str; continue;
    }
    i++;
  }
  return result;
}
function extractPdfText(pdf: Buffer): string {
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
    try { body = zlib.inflateSync(raw).toString("binary"); }
    catch { body = raw.toString("binary"); }
    out.push(extractStringLiterals(body));
    cursor = eIdx + "endstream".length;
  }
  return out.join("\n");
}

interface DemoCase {
  label: string;
  model: typeof MICROSCHOOL_MODEL;
}
const CASES: DemoCase[] = [
  { label: "microschool",    model: MICROSCHOOL_MODEL },
  { label: "private_school", model: PRIVATE_SCHOOL_MODEL },
  { label: "charter_school", model: CHARTER_SCHOOL_MODEL },
];

async function runOne(c: DemoCase): Promise<void> {
  const tag = `[${c.label}]`;
  const data = c.model.data as unknown as Record<string, unknown>;

  // ── Underwriting workbook ─────────────────────────────────────────
  const uw = await generateUnderwritingWorkbook(data);
  const op = uw.getWorksheet("Year 1 Operating Stmt") || uw.getWorksheet("5-Year Operating Stmt");
  check(`${tag} underwriting Operating Statement sheet exists`, !!op);
  if (!op) return;
  let opNiRow = findRow(op, "Net Income");
  if (opNiRow <= 0) opNiRow = findRow(op, "Change in Net Assets");
  const opRevRow = findRow(op, "Total Revenue");
  check(`${tag} Operating Statement NI row found`, opNiRow > 0);
  check(`${tag} Operating Statement Total Revenue row found`, opRevRow > 0);
  const opNi = cellNumber(op, opNiRow, 2);
  const opRev = cellNumber(op, opRevRow, 2);
  check(`${tag} Operating Statement Y1 NI > 0`, opNi > 0, `got ${opNi}`);
  check(`${tag} Operating Statement Y1 Revenue > 0`, opRev > 0, `got ${opRev}`);

  // ── Lender Pro-Forma workbook ─────────────────────────────────────
  const pfBuf = await generateLenderProFormaWorkbook(data);
  const pf = new ExcelJS.Workbook();
  await pf.xlsx.load(pfBuf as unknown as AnyBuf);
  const pnl = pf.getWorksheet("5-Year P&L");
  check(`${tag} Lender PF 5-Year P&L sheet exists`, !!pnl);
  if (!pnl) return;

  // Invariant 1 — the workbook ships the documented reading-note
  // disclaimer at B2 (above the data). Strings searched for are stable
  // anchors from the actual copy in `lender-proforma-export.ts`.
  const noteB2 = cellString(pnl, 2, 2).toLowerCase();
  check(`${tag} 5-Year P&L B2 reading-note mentions "simplified comparator"`,
    noteB2.includes("simplified comparator"), `B2="${noteB2.slice(0, 120)}"`);
  check(`${tag} 5-Year P&L B2 reading-note mentions "operating statement"`,
    noteB2.includes("operating statement"), `B2="${noteB2.slice(0, 120)}"`);
  check(`${tag} 5-Year P&L B2 reading-note warns "will not tie"`,
    noteB2.includes("will not tie"), `B2="${noteB2.slice(0, 120)}"`);

  // Invariant 2 — Net Income on the lender PF P&L is GAAP-style:
  // NOI − Interest only. This is the documented bottom-line
  // definition that separates the two surfaces.
  const noiRow = findRow(pnl, "Net Operating Income (NOI)", 2);
  const intRow = findRow(pnl, "Interest Expense", 2);
  const niRow = findRow(pnl, "Net Income", 2);
  check(`${tag} Lender PF NOI / Interest / NI rows found`,
    noiRow > 0 && intRow > 0 && niRow > 0,
    `noi=${noiRow}, int=${intRow}, ni=${niRow}`);
  let pfNiY1 = 0;
  if (noiRow > 0 && intRow > 0 && niRow > 0) {
    for (let y = 0; y < 5; y++) {
      const col = 3 + y;
      const noi = cellNumber(pnl, noiRow, col);
      const intr = cellNumber(pnl, intRow, col);
      const ni = cellNumber(pnl, niRow, col);
      check(`${tag} Lender PF Y${y + 1} NI = NOI − Interest (GAAP-style)`,
        Math.abs(ni - (noi - intr)) <= 2,
        `NOI=${noi}, Int=${intr}, NI=${ni}`);
      if (y === 0) pfNiY1 = ni;
    }
  }

  // Invariant 3 — the two surfaces report different Y1 NI on at least
  // one of the seeded demos (this is the divergence the disclosure
  // warns about). If a future change ever makes them tie within
  // rounding for ALL three demos, the disclosure becomes misleading
  // and either the disclosure or the test should be revisited; this
  // assertion is what catches a silent re-convergence. We use a
  // generous $100 tolerance so true rounding noise doesn't trip it.
  const delta = Math.abs(pfNiY1 - opNi);
  check(`${tag} lender PF Y1 NI diverges from Operating Statement Y1 NI by > $100 (documented)`,
    delta > 100,
    `PF NI=${pfNiY1}, OpStmt NI=${opNi}, |Δ|=${delta}`);

  // ── Lender packet PDF ─────────────────────────────────────────────
  const consultant = await runConsultantEngine(data);
  const packet = buildLenderPacket(
    data as unknown as Parameters<typeof buildLenderPacket>[0],
    consultant,
    0,
  );
  const pdfBytes = await generateLenderPacketPDF(packet);
  const pdfText = extractPdfText(pdfBytes);

  // Invariant 4 — the methodology callout copy ships in the rendered
  // PDF. PDFKit can split glyphs across draw calls (smoke uses a
  // permissive whitespace match for the school name); we anchor on
  // shorter substrings here that are unlikely to be split.
  const compact = pdfText.replace(/\s+/g, " ").toLowerCase();
  check(`${tag} lender PDF prints "Reading the Two Workbooks" section title`,
    compact.includes("reading the two workbooks"));
  check(`${tag} lender PDF mentions "simplified comparator"`,
    compact.includes("simplified comparator"));
  check(`${tag} lender PDF mentions both workbooks will not tie`,
    compact.includes("will not tie"));
}

async function main(): Promise<void> {
  for (const c of CASES) await runOne(c);
  console.log(`lender-pf-vs-operating-statement-tieout: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("lender-pf-vs-operating-statement-tieout: unexpected error", err);
  process.exit(1);
});
