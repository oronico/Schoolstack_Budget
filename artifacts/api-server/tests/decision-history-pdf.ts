import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import { microschoolStartup } from "./sample-payloads.js";

import { extractPdfText } from "./_pdf-text-snapshot-util.js";
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
      // Snapshot of the apply-time diff captured by `summarizeDecisionChanges`
      // and persisted on the scenario (Task #375). The PDF should render these
      // lines under the "Modeled change:" subhead.
      appliedFieldChanges: [
        {
          label: 'Revenue row "Middle School"',
          before: "Not in model",
          after: "Y1:10 / Y2:20 / Y3:30 / Y4:30 / Y5:30 students × $14,000/yr tuition",
          kind: "added",
        },
        {
          label: 'Staffing row "Middle School staff"',
          before: "Not in model",
          after: "2.5 FTE × $55,000/yr (instructional, full-time)",
          kind: "added",
        },
      ],
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

// Eight changes — exercises the 6-line cap + "+N more changes" overflow tail.
function manyDiffScenarios() {
  return [
    {
      name: "Big enrollment refactor",
      outcomeStatus: "pursued",
      decisionType: "change_enrollment",
      appliedToModelAt: "2025-05-01T12:00:00Z",
      outcomeUpdatedAt: "2025-05-01T12:00:00Z",
      overrides: {},
      appliedFieldChanges: [
        { label: "Enrollment Year 1", before: "40 students", after: "45 students (+5)", kind: "modified" },
        { label: "Enrollment Year 2", before: "55 students", after: "60 students (+5)", kind: "modified" },
        { label: "Enrollment Year 3", before: "70 students", after: "78 students (+8)", kind: "modified" },
        { label: "Enrollment Year 4", before: "80 students", after: "90 students (+10)", kind: "modified" },
        { label: "Enrollment Year 5", before: "90 students", after: "100 students (+10)", kind: "modified" },
        { label: "Retention rate", before: "85%", after: "92%", kind: "modified" },
        { label: "Tuition per student adjustment", before: "Base tuition (no shift)", after: "+$250/yr per student", kind: "modified" },
        { label: "Eighth change (overflow)", before: "x", after: "y", kind: "modified" },
      ],
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
  return extractPdfText(pdf);
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
  return extractPdfText(pdf);
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
  contains("lender: negative tuition delta bullet", text, "Tuition -$250/student");

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

  // Field-level diff (Task #375): the persisted appliedFieldChanges from the
  // applied "Add Middle School wing" decision should render under a "Modeled
  // change:" subhead with each change as a "Label: before \u2192 after" line.
  contains("lender: modeled change subhead", text, "Modeled change:");
  contains("lender: diff revenue label", text, 'Revenue row "Middle School"');
  contains("lender: diff before token", text, "Not in model");
  contains(
    "lender: diff after token (revenue)",
    text,
    "Y1:10 / Y2:20 / Y3:30 / Y4:30 / Y5:30 students",
  );
  contains("lender: diff staffing label", text, 'Staffing row "Middle School staff"');
  contains("lender: diff arrow separator", text, " -> ");

  // Trough year callout (Task #378): each typed decision's adjusted forecast
  // gets the lowest-cash year called out per row, mirroring the in-app
  // ImpactSummary trough.
  contains("lender: trough year subhead", text, "Trough year:");
  contains(
    "lender: trough callout phrasing",
    text,
    "lowest projected cash year after this decision",
  );
}

// ---------------------------------------------------------------------------
// Lender PDF — empty decision history
// ---------------------------------------------------------------------------
async function testLenderEmpty() {
  console.log("\n— Lender PDF: empty decision history —");
  const text = await makeLenderPDF(null);

  // Task #920 — the whole Decision History section (heading AND body) is
  // suppressed when no decisions with an outcome exist. The dedicated
  // `decision-history-suppression-920.ts` test asserts the suppression
  // contract end-to-end. Here we just re-confirm the empty-state copy
  // never leaks through the suppression gate. These two assertions were
  // pre-#920 expectations that asserted the empty copy; they were left
  // in place when #920 inverted the renderer behaviour and are now
  // corrected to match the supported product behaviour.
  notContains("lender (empty): empty-state copy suppressed", text, "No decisions have been tracked");
  notContains(
    "lender (empty): empty-state hint suppressed",
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

  // Field-level diff (Task #375)
  contains("board: modeled change subhead", text, "Modeled change:");
  contains("board: diff revenue label", text, 'Revenue row "Middle School"');
  contains("board: diff staffing label", text, 'Staffing row "Middle School staff"');
  contains("board: diff arrow separator", text, " -> ");

  // Trough year callout (Task #378): the board packet decision-history rows
  // mirror the lender packet by surfacing the lowest projected cash year per
  // saved decision so trustees see the runway crunch without flipping back to
  // the planner's ImpactSummary.
  contains("board: trough year subhead", text, "Trough year:");
  contains(
    "board: trough callout phrasing",
    text,
    "lowest projected cash year after this decision",
  );
}

// ---------------------------------------------------------------------------
// Diff overflow / graceful degradation (Task #375)
// ---------------------------------------------------------------------------
async function testDiffOverflowAndGracefulDegradation() {
  console.log("\n— Lender + Board PDF: diff overflow + graceful degradation —");

  // 8 changes → first 6 render, "+2 more changes" tail follows.
  const lenderText = await makeLenderPDF(manyDiffScenarios());
  contains("lender (overflow): 1st change renders", lenderText, "Enrollment Year 1");
  contains("lender (overflow): 6th change renders", lenderText, "Retention rate");
  notContains("lender (overflow): 7th change suppressed", lenderText, "Tuition per student adjustment");
  notContains("lender (overflow): 8th change suppressed", lenderText, "Eighth change");
  contains("lender (overflow): overflow tail", lenderText, "+2 more changes");

  const boardText = await makeBoardPDF(manyDiffScenarios());
  contains("board (overflow): 1st change renders", boardText, "Enrollment Year 1");
  contains("board (overflow): 6th change renders", boardText, "Retention rate");
  notContains("board (overflow): 7th change suppressed", boardText, "Tuition per student adjustment");
  contains("board (overflow): overflow tail", boardText, "+2 more changes");

  // Graceful degradation: a scenario without appliedFieldChanges (older saved
  // scenarios pre-this feature) must NOT render the "Modeled change:" subhead
  // and the rest of the card should still render correctly.
  const legacyOnly = [
    {
      name: "Legacy applied decision",
      outcomeStatus: "pursued",
      decisionType: "add_program",
      appliedToModelAt: "2025-01-15T12:00:00Z",
      outcomeUpdatedAt: "2025-01-15T12:00:00Z",
      overrides: { addProgramName: "Pre-K", addProgramTuition: 9000 },
      // no appliedFieldChanges
    },
  ];
  const legacyLender = await makeLenderPDF(legacyOnly);
  contains("legacy: name still renders", legacyLender, "Legacy applied decision");
  contains("legacy: APPLIED stamp still renders", legacyLender, "[ APPLIED ]");
  contains("legacy: bullet still renders", legacyLender, "Program: Pre-K");
  notContains("legacy: NO modeled change subhead", legacyLender, "Modeled change:");
  notContains("legacy: NO diff arrow separator", legacyLender, " -> ");
}

// ---------------------------------------------------------------------------
// Board PDF — empty decision history
// ---------------------------------------------------------------------------
async function testBoardEmpty() {
  console.log("\n— Board PDF: empty decision history —");
  const text = await makeBoardPDF(null);

  // Task #920 — see testLenderEmpty above. The board packet uses the
  // same suppression gate; we re-confirm the empty copy never leaks.
  notContains("board (empty): empty-state copy suppressed", text, "No decisions have been tracked");
  notContains(
    "board (empty): empty-state hint suppressed",
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
  await testDiffOverflowAndGracefulDegradation();
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
