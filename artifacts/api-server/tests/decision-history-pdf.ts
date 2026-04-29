import zlib from "node:zlib";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import { microschoolStartup } from "./sample-payloads.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function contains(label: string, haystack: string, needle: string) {
  check(label, haystack.includes(needle), `expected to find ${JSON.stringify(needle)}`);
}

function notContains(label: string, haystack: string, needle: string) {
  check(label, !haystack.includes(needle), `expected NOT to find ${JSON.stringify(needle)}`);
}

// ---------------------------------------------------------------------------
// Minimal PDF text extraction.
// pdfkit emits FlateDecode-compressed content streams. We locate each
// `stream\n...\nendstream` block, try to inflate it, then collect all
// PDF string literals (`(...)`) which is where the rendered text lives.
// We handle PDF string escapes including 3-digit octal codes used by WinAnsi
// for high-bit chars like `·` (\267) and `•` (\225).
// ---------------------------------------------------------------------------
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
      // PDF literal string with balanced parens + escapes.
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
      // PDF hex string. Two-hex-digit pairs map directly to byte values.
      // For PDFKit + Helvetica/standard fonts this is WinAnsi (≈ ISO-8859-1)
      // so byte → charCode mapping recovers ASCII text.
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
      // Pad odd-length per PDF spec.
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

// ---------------------------------------------------------------------------
// Build a model with a representative mix of decision outcomes.
// ---------------------------------------------------------------------------
function mixedScenarios() {
  return [
    {
      name: "Add Middle School wing",
      outcomeStatus: "pursued",
      decisionType: "add_program",
      appliedToModelAt: "2025-03-15T12:00:00Z",
      outcomeUpdatedAt: "2025-03-15T12:00:00Z",
      retrospective: "Folded the new program into the base plan.",
      overrides: {
        addProgramName: "Middle School",
        addProgramGradeBand: "6-8",
        addProgramTuition: 14000,
        addProgramEnrollment: [10, 20, 30, 30, 30],
        addProgramAddedFte: 2.5,
      },
    },
    {
      name: "Hire Spanish immersion lead",
      outcomeStatus: "pursued",
      decisionType: "change_enrollment",
      // No appliedToModelAt -> pending
      outcomeUpdatedAt: "2025-04-01T09:00:00Z",
      overrides: {
        enrollmentDelta: [3, 4, 5, 6, 7],
        retentionRate: 92,
      },
    },
    {
      name: "Evaluate downtown facility",
      outcomeStatus: "on_hold",
      decisionType: "evaluate_site",
      outcomeUpdatedAt: "2025-02-20T10:00:00Z",
      overrides: {
        monthlyRent: 8500,
        rentEscalation: 3,
        sqftDelta: 1500,
        siteFitOutCost: 75000,
      },
    },
    {
      name: "Cut Pre-K cohort",
      outcomeStatus: "declined",
      decisionType: "change_enrollment",
      outcomeUpdatedAt: "2025-01-10T14:00:00Z",
      overrides: {
        enrollmentDelta: [-5, -5, 0, 0, 0],
        tuitionDeltaPerStudent: -250,
      },
    },
  ];
}

async function makeLenderPDF(scenarios: unknown[] | null): Promise<string> {
  const input = { ...(microschoolStartup as Record<string, unknown>) };
  if (scenarios === null) {
    delete (input as Record<string, unknown>).customScenarios;
  } else {
    (input as Record<string, unknown>).customScenarios = scenarios;
  }
  const consultant = await runConsultantEngine(input);
  const packet = buildLenderPacket(input as unknown as ModelData, consultant, 1);
  const pdf = await generateLenderPacketPDF(packet);
  check(`lender PDF (${scenarios ? "populated" : "empty"}): non-zero buffer`, pdf.length > 0);
  return extractPDFText(pdf);
}

async function makeBoardPDF(scenarios: unknown[] | null): Promise<string> {
  const input = { ...(microschoolStartup as Record<string, unknown>) };
  if (scenarios === null) {
    delete (input as Record<string, unknown>).customScenarios;
  } else {
    (input as Record<string, unknown>).customScenarios = scenarios;
  }
  const consultant = await runConsultantEngine(input);
  const packet = buildBoardPacket(input as unknown as ModelData, consultant, 1);
  const pdf = await generateBoardPacketPDF(packet);
  check(`board PDF (${scenarios ? "populated" : "empty"}): non-zero buffer`, pdf.length > 0);
  return extractPDFText(pdf);
}

// ---------------------------------------------------------------------------
// Lender PDF — populated decision history
// ---------------------------------------------------------------------------
async function testLenderPopulated() {
  console.log("\n— Lender PDF: populated decision history —");
  const text = await makeLenderPDF(mixedScenarios());

  // Decision names render
  contains("lender: pursued+applied name", text, "Add Middle School wing");
  contains("lender: pursued+pending name", text, "Hire Spanish immersion lead");
  contains("lender: on hold name", text, "Evaluate downtown facility");
  contains("lender: declined name", text, "Cut Pre-K cohort");

  // Outcome labels (rendered uppercase by the PDF)
  contains("lender: PURSUED label", text, "PURSUED");
  contains("lender: ON HOLD label", text, "ON HOLD");
  contains("lender: DECLINED label", text, "DECLINED");

  // Decision-type labels
  contains("lender: add a program label", text, "Add a program");
  contains("lender: evaluate a site label", text, "Evaluate a site");
  contains("lender: change enrollment label", text, "Change enrollment");

  // Applied / pending notes for pursued items
  contains("lender: APPLIED prefix", text, "[ APPLIED ]");
  contains("lender: applied note text", text, "Folded into the base model");
  contains("lender: PENDING prefix", text, "[ PENDING ]");
  contains("lender: pending note text", text, "Pending apply to base model");

  // Bullets
  contains("lender: program bullet", text, "Program: Middle School (6-8)");
  contains("lender: tuition bullet", text, "Tuition $14,000/yr");
  contains("lender: rent bullet", text, "Rent $8,500/mo");
  contains("lender: fit-out bullet", text, "Fit-out $75,000 (Y1)");
  contains("lender: retention bullet", text, "Retention 92%");
  contains("lender: negative tuition delta bullet", text, "Tuition $-250/student");

  // Retrospective copy
  contains("lender: 'What happened' label", text, "What happened:");
  contains("lender: retrospective text", text, "Folded the new program into the base plan.");

  // Outcome-logged stamp
  contains("lender: outcome logged stamp", text, "Outcome logged");

  // Section narrative summary mentions counts
  contains("lender: narrative count phrase", text, "4 tracked decisions");

  // Pursued+pending must NOT be marked applied (and applied note for declined items must not appear)
  // We can't easily test "pending item lacks APPLIED prefix" globally because the
  // applied item legitimately uses APPLIED, but we can confirm no spurious applied
  // label appears for the declined or on-hold rows by checking their note text:
  notContains("lender: declined doesn't get applied note", text, "Folded into the base model on Jan");
}

// ---------------------------------------------------------------------------
// Lender PDF — empty decision history
// ---------------------------------------------------------------------------
async function testLenderEmpty() {
  console.log("\n— Lender PDF: empty decision history —");
  const text = await makeLenderPDF(null);

  contains("lender (empty): narrative empty-state", text, "No decisions have been tracked");
  contains(
    "lender (empty): hint copy",
    text,
    "Once decisions are saved with a Pursued / Declined / On hold outcome inside the planner, they will be summarized here.",
  );
  // Should not have any outcome labels
  notContains("lender (empty): no PURSUED label", text, "PURSUED");
  notContains("lender (empty): no DECLINED label", text, "DECLINED");
  notContains("lender (empty): no APPLIED note", text, "[ APPLIED ]");
}

// ---------------------------------------------------------------------------
// Board PDF — populated decision history
// ---------------------------------------------------------------------------
async function testBoardPopulated() {
  console.log("\n— Board PDF: populated decision history —");
  const text = await makeBoardPDF(mixedScenarios());

  // Names
  contains("board: pursued+applied name", text, "Add Middle School wing");
  contains("board: pursued+pending name", text, "Hire Spanish immersion lead");
  contains("board: on hold name", text, "Evaluate downtown facility");
  contains("board: declined name", text, "Cut Pre-K cohort");

  // Outcome labels
  contains("board: PURSUED label", text, "PURSUED");
  contains("board: ON HOLD label", text, "ON HOLD");
  contains("board: DECLINED label", text, "DECLINED");

  // Decision-type labels
  contains("board: add a program label", text, "Add a program");
  contains("board: evaluate a site label", text, "Evaluate a site");
  contains("board: change enrollment label", text, "Change enrollment");

  // Applied / pending notes
  contains("board: APPLIED prefix", text, "[ APPLIED ]");
  contains("board: applied note text", text, "Folded into the base model");
  contains("board: PENDING prefix", text, "[ PENDING ]");
  contains("board: pending note text", text, "Pending apply to base model");

  // Bullets (board renders the same item content)
  contains("board: program bullet", text, "Program: Middle School (6-8)");
  contains("board: rent bullet", text, "Rent $8,500/mo");
  contains("board: fit-out bullet", text, "Fit-out $75,000 (Y1)");

  // Retrospective + stamp
  contains("board: 'What happened' label", text, "What happened:");
  contains("board: outcome logged stamp", text, "Outcome logged");

  // Narrative count
  contains("board: narrative count phrase", text, "4 tracked decisions");
}

// ---------------------------------------------------------------------------
// Board PDF — empty decision history
// ---------------------------------------------------------------------------
async function testBoardEmpty() {
  console.log("\n— Board PDF: empty decision history —");
  const text = await makeBoardPDF(null);

  contains("board (empty): narrative empty-state", text, "No decisions have been tracked");
  contains(
    "board (empty): hint copy",
    text,
    "Once decisions are saved with a Pursued / Declined / On hold outcome inside the planner, they will be summarized here for the board.",
  );
  notContains("board (empty): no PURSUED label", text, "PURSUED");
  notContains("board (empty): no APPLIED note", text, "[ APPLIED ]");
}

// ---------------------------------------------------------------------------
// Page-break safety: many decisions still render every name without the
// renderer crashing.
// ---------------------------------------------------------------------------
async function testManyDecisionsPageBreak() {
  console.log("\n— Lender + Board PDF: many decisions (page-break safety) —");

  const many: unknown[] = [];
  for (let i = 1; i <= 20; i++) {
    many.push({
      name: `Stress decision ${i}`,
      outcomeStatus: i % 3 === 0 ? "declined" : i % 3 === 1 ? "pursued" : "on_hold",
      decisionType: "add_program",
      appliedToModelAt: i % 6 === 1 ? "2025-03-15T12:00:00Z" : undefined,
      outcomeUpdatedAt: `2025-03-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
      overrides: {
        addProgramName: `Program ${i}`,
        addProgramGradeBand: "K-5",
        addProgramTuition: 10000 + i * 100,
      },
    });
  }

  const lenderText = await makeLenderPDF(many);
  contains("lender (many): first decision name", lenderText, "Stress decision 1");
  contains("lender (many): last decision name", lenderText, "Stress decision 20");
  contains("lender (many): mid decision name", lenderText, "Stress decision 10");

  const boardText = await makeBoardPDF(many);
  contains("board (many): first decision name", boardText, "Stress decision 1");
  contains("board (many): last decision name", boardText, "Stress decision 20");
  contains("board (many): mid decision name", boardText, "Stress decision 10");
}

async function main() {
  console.log("=== Decision History PDF Render Tests ===");
  await testLenderPopulated();
  await testLenderEmpty();
  await testBoardPopulated();
  await testBoardEmpty();
  await testManyDecisionsPageBreak();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
