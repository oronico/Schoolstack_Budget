import {
  buildDecisionHistory,
  buildDecisionHistoryNarrative,
  type DecisionHistoryItem,
} from "../src/lib/packets/build-decision-history.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { LENDER_SECTIONS, BOARD_SECTIONS } from "../src/lib/packets/packet-types.js";
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

function eq<T>(label: string, actual: T, expected: T) {
  check(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function makeModel(customScenarios: unknown[]): ModelData {
  return { customScenarios } as unknown as ModelData;
}

// ---------------------------------------------------------------------------
// buildDecisionHistory: outcome filtering
// ---------------------------------------------------------------------------
function testOutcomeFiltering() {
  console.log("\n— buildDecisionHistory: outcome filtering —");

  const md = makeModel([
    { name: "No outcome yet", overrides: {} }, // no outcomeStatus
    { name: "Bad outcome", outcomeStatus: "maybe", overrides: {} }, // invalid
    { name: "Pursued one", outcomeStatus: "pursued", overrides: {} },
    { name: "Declined one", outcomeStatus: "declined", overrides: {} },
    { name: "On hold one", outcomeStatus: "on_hold", overrides: {} },
    "not an object",
    null,
  ]);

  const items = buildDecisionHistory(md);
  eq("filters to only valid outcomes (3 items)", items.length, 3);
  const names = new Set(items.map((i) => i.name));
  check("contains pursued", names.has("Pursued one"));
  check("contains declined", names.has("Declined one"));
  check("contains on hold", names.has("On hold one"));
  check("excludes missing outcomeStatus", !names.has("No outcome yet"));
  check("excludes invalid outcomeStatus", !names.has("Bad outcome"));

  eq("returns [] when no customScenarios", buildDecisionHistory({} as ModelData).length, 0);
  eq("returns [] when customScenarios not array", buildDecisionHistory({ customScenarios: "x" } as unknown as ModelData).length, 0);
}

// ---------------------------------------------------------------------------
// buildDecisionHistory: sorting
// ---------------------------------------------------------------------------
function testSorting() {
  console.log("\n— buildDecisionHistory: sorting —");

  const md = makeModel([
    { name: "Old declined", outcomeStatus: "declined", outcomeUpdatedAt: "2025-01-01T00:00:00Z", overrides: {} },
    { name: "New pursued", outcomeStatus: "pursued", outcomeUpdatedAt: "2025-06-01T00:00:00Z", overrides: {} },
    { name: "Recent on hold", outcomeStatus: "on_hold", outcomeUpdatedAt: "2025-04-01T00:00:00Z", overrides: {} },
    { name: "Old pursued", outcomeStatus: "pursued", outcomeUpdatedAt: "2025-02-01T00:00:00Z", overrides: {} },
    { name: "New declined", outcomeStatus: "declined", outcomeUpdatedAt: "2025-05-01T00:00:00Z", overrides: {} },
  ]);

  const items = buildDecisionHistory(md);
  const order = items.map((i) => i.name);

  // Pursued group first (newest first), then on_hold, then declined (newest first).
  eq("position 0", order[0], "New pursued");
  eq("position 1", order[1], "Old pursued");
  eq("position 2", order[2], "Recent on hold");
  eq("position 3", order[3], "New declined");
  eq("position 4", order[4], "Old declined");

  // Falls back to createdAt when outcomeUpdatedAt missing
  const md2 = makeModel([
    { name: "A", outcomeStatus: "pursued", createdAt: "2025-03-01T00:00:00Z", overrides: {} },
    { name: "B", outcomeStatus: "pursued", createdAt: "2025-08-01T00:00:00Z", overrides: {} },
  ]);
  const items2 = buildDecisionHistory(md2);
  eq("uses createdAt fallback", items2[0].name, "B");
}

// ---------------------------------------------------------------------------
// buildDecisionHistory: applied vs pending pursued logic
// ---------------------------------------------------------------------------
function testAppliedNote() {
  console.log("\n— buildDecisionHistory: applied vs pending —");

  const md = makeModel([
    {
      name: "Pursued + applied",
      outcomeStatus: "pursued",
      appliedToModelAt: "2025-03-15T12:00:00Z",
      overrides: {},
    },
    {
      name: "Pursued + pending",
      outcomeStatus: "pursued",
      overrides: {},
    },
    {
      name: "Declined",
      outcomeStatus: "declined",
      appliedToModelAt: "2025-03-15T12:00:00Z", // ignored — declined isn't applied
      overrides: {},
    },
    {
      name: "On hold",
      outcomeStatus: "on_hold",
      overrides: {},
    },
  ]);

  const items = buildDecisionHistory(md);
  const byName = (n: string): DecisionHistoryItem => items.find((i) => i.name === n)!;

  const applied = byName("Pursued + applied");
  check("applied: appliedNote contains 'Folded'", !!applied.appliedNote && applied.appliedNote.includes("Folded into the base model"));
  check("applied: appliedNote contains a date string", !!applied.appliedNote && /\b\d{4}\b/.test(applied.appliedNote));
  eq("applied: isPendingApply false", applied.isPendingApply, false);

  const pending = byName("Pursued + pending");
  eq("pending: appliedNote text", pending.appliedNote, "Pending apply to base model");
  eq("pending: isPendingApply true", pending.isPendingApply, true);

  const declined = byName("Declined");
  eq("declined: no appliedNote", declined.appliedNote, undefined);
  eq("declined: no isPendingApply", declined.isPendingApply, undefined);

  const onHold = byName("On hold");
  eq("on_hold: no appliedNote", onHold.appliedNote, undefined);
  eq("on_hold: no isPendingApply", onHold.isPendingApply, undefined);
}

// ---------------------------------------------------------------------------
// buildDecisionHistory: bullet generation per decision type
// ---------------------------------------------------------------------------
function testBullets() {
  console.log("\n— buildDecisionHistory: bullets per decision type —");

  // add_program
  const addProgram = buildDecisionHistory(
    makeModel([
      {
        name: "New middle school",
        outcomeStatus: "pursued",
        decisionType: "add_program",
        overrides: {
          addProgramName: "Middle School",
          addProgramGradeBand: "6-8",
          addProgramTuition: 14000,
          addProgramEnrollment: [10, 20, 30, 30, 30],
          addProgramAddedFte: 2.5,
          addProgramStaffingTbd: true,
        },
      },
    ]),
  )[0];
  eq("add_program: decisionTypeLabel", addProgram.decisionTypeLabel, "Add a program");
  check("add_program: name + band bullet", addProgram.bullets.includes("Program: Middle School (6-8)"));
  check("add_program: tuition bullet", addProgram.bullets.includes("Tuition $14,000/yr"));
  check("add_program: enrollment total bullet", addProgram.bullets.includes("Adds 120 cumulative students (5 yrs)"));
  check("add_program: FTE bullet", addProgram.bullets.includes("+2.5 FTE"));
  check("add_program: staffing TBD bullet", addProgram.bullets.includes("Staffing: TBD"));

  // evaluate_site
  const site = buildDecisionHistory(
    makeModel([
      {
        name: "New facility",
        outcomeStatus: "on_hold",
        decisionType: "evaluate_site",
        overrides: {
          monthlyRent: 8500,
          rentEscalation: 3,
          sqftDelta: 1500,
          siteFitOutCost: 75000,
        },
      },
    ]),
  )[0];
  eq("evaluate_site: decisionTypeLabel", site.decisionTypeLabel, "Evaluate a site");
  check("evaluate_site: rent bullet", site.bullets.includes("Rent $8,500/mo"));
  check("evaluate_site: rent escalation bullet", site.bullets.includes("Rent escalation 3%"));
  check("evaluate_site: sqft delta bullet (positive)", site.bullets.includes("Sqft +1500"));
  check("evaluate_site: fit-out bullet", site.bullets.includes("Fit-out $75,000 (Y1)"));

  // change_enrollment
  const enroll = buildDecisionHistory(
    makeModel([
      {
        name: "Enrollment shift",
        outcomeStatus: "declined",
        decisionType: "change_enrollment",
        overrides: {
          enrollmentDelta: [5, -3, 2, 0, 0],
          retentionRate: 88,
          tuitionDeltaPerStudent: -250,
        },
      },
    ]),
  )[0];
  eq("change_enrollment: decisionTypeLabel", enroll.decisionTypeLabel, "Change enrollment");
  check("change_enrollment: enrollment cumulative bullet", enroll.bullets.includes("Enrollment +4 cumulative"));
  check("change_enrollment: retention bullet", enroll.bullets.includes("Retention 88%"));
  check("change_enrollment: negative tuition delta bullet", enroll.bullets.includes("Tuition -$250/student"));

  // No decisionType — falls into the generic branch and yields []
  const empty = buildDecisionHistory(
    makeModel([
      { name: "Bare", outcomeStatus: "pursued", overrides: {} },
    ]),
  )[0];
  eq("no decisionType: label is Custom scenario", empty.decisionTypeLabel, "Custom scenario");
  eq("no decisionType: empty bullets", empty.bullets.length, 0);
}

// ---------------------------------------------------------------------------
// buildDecisionHistoryNarrative
// ---------------------------------------------------------------------------
function testNarrative() {
  console.log("\n— buildDecisionHistoryNarrative —");

  const empty = buildDecisionHistoryNarrative([]);
  check("empty: mentions decisions tracked", empty.includes("No decisions have been tracked"));
  check("empty: mentions outcome states", /Pursued|Declined|On hold/.test(empty));

  const items = buildDecisionHistory(
    makeModel([
      { name: "a", outcomeStatus: "pursued", overrides: {} },
      { name: "b", outcomeStatus: "pursued", overrides: {} },
      { name: "c", outcomeStatus: "on_hold", overrides: {} },
      { name: "d", outcomeStatus: "declined", overrides: {} },
    ]),
  );
  const narr = buildDecisionHistoryNarrative(items);
  check("counts total decisions", narr.includes("4 tracked decisions"));
  check("counts pursued", narr.includes("2 pursued"));
  check("counts on hold", narr.includes("1 on hold"));
  check("counts declined", narr.includes("1 declined"));

  const single = buildDecisionHistoryNarrative(
    buildDecisionHistory(makeModel([{ name: "solo", outcomeStatus: "pursued", overrides: {} }])),
  );
  check("single uses singular 'decision'", /1 tracked decision\b/.test(single));
}

// ---------------------------------------------------------------------------
// LENDER_SECTIONS / BOARD_SECTIONS contain decision_history in correct slot
// ---------------------------------------------------------------------------
function testSectionLists() {
  console.log("\n— LENDER_SECTIONS / BOARD_SECTIONS —");

  check("LENDER_SECTIONS contains decision_history", LENDER_SECTIONS.includes("decision_history"));
  // Should sit just before the appendix.
  const lenderIdx = LENDER_SECTIONS.indexOf("decision_history");
  const lenderAppendixIdx = LENDER_SECTIONS.indexOf("appendix_assumptions");
  check("LENDER: decision_history immediately precedes appendix_assumptions", lenderIdx === lenderAppendixIdx - 1);

  check("BOARD_SECTIONS contains decision_history", BOARD_SECTIONS.includes("decision_history"));
  const boardIdx = BOARD_SECTIONS.indexOf("decision_history");
  const boardAppendixIdx = BOARD_SECTIONS.indexOf("appendix_assumptions");
  check("BOARD: decision_history immediately precedes appendix_assumptions", boardIdx === boardAppendixIdx - 1);
}

// ---------------------------------------------------------------------------
// Packet-level test: lender + board both populate decisionHistory and include
// the decision_history section.
// ---------------------------------------------------------------------------
async function testPacketIntegration() {
  console.log("\n— Packet integration: lender + board —");

  const customScenarios = [
    {
      name: "Add MS",
      outcomeStatus: "pursued",
      decisionType: "add_program",
      appliedToModelAt: "2025-03-15T12:00:00Z",
      overrides: { addProgramName: "Middle School", addProgramTuition: 14000 },
    },
    {
      name: "Evaluate downtown site",
      outcomeStatus: "on_hold",
      decisionType: "evaluate_site",
      overrides: { monthlyRent: 8500 },
    },
    {
      name: "Reduce K cohort",
      outcomeStatus: "declined",
      decisionType: "change_enrollment",
      overrides: { enrollmentDelta: [-5, 0, 0, 0, 0] },
    },
  ];

  const modelInput = {
    ...(microschoolStartup as Record<string, unknown>),
    customScenarios,
  };

  const consultantOutput = await runConsultantEngine(modelInput);
  const modelData = modelInput as unknown as ModelData;

  const lender = buildLenderPacket(modelData, consultantOutput, 1);
  eq("lender: 3 decision history items", lender.decisionHistory.length, 3);
  const lenderApplied = lender.decisionHistory.find((d) => d.name === "Add MS");
  eq("lender: pursued+applied has isPendingApply false", lenderApplied?.isPendingApply, false);
  const lenderSection = lender.sections.find((s) => s.id === "decision_history");
  check("lender: decision_history section present", !!lenderSection);
  check("lender: decision_history section narrative non-empty", !!lenderSection && lenderSection.narrative.length > 0);
  check("lender: decision_history narrative mentions counts", !!lenderSection && lenderSection.narrative.includes("3 tracked"));

  const board = buildBoardPacket(modelData, consultantOutput, 1);
  eq("board: 3 decision history items", board.decisionHistory.length, 3);
  const boardSection = board.sections.find((s) => s.id === "decision_history");
  check("board: decision_history section present", !!boardSection);
  check("board: decision_history section narrative non-empty", !!boardSection && boardSection.narrative.length > 0);

  // Empty-state packet: no customScenarios → empty decisionHistory but section
  // still present with empty-state copy.
  const emptyInput = { ...(microschoolStartup as Record<string, unknown>) };
  delete (emptyInput as Record<string, unknown>).customScenarios;
  const emptyConsultant = await runConsultantEngine(emptyInput);
  const emptyModel = emptyInput as unknown as ModelData;

  const lenderEmpty = buildLenderPacket(emptyModel, emptyConsultant, 1);
  eq("lender (empty): decisionHistory empty", lenderEmpty.decisionHistory.length, 0);
  const lenderEmptySec = lenderEmpty.sections.find((s) => s.id === "decision_history");
  check("lender (empty): decision_history section still present", !!lenderEmptySec);
  check("lender (empty): empty-state copy", !!lenderEmptySec && lenderEmptySec.narrative.includes("No decisions have been tracked"));

  const boardEmpty = buildBoardPacket(emptyModel, emptyConsultant, 1);
  eq("board (empty): decisionHistory empty", boardEmpty.decisionHistory.length, 0);
  const boardEmptySec = boardEmpty.sections.find((s) => s.id === "decision_history");
  check("board (empty): decision_history section still present", !!boardEmptySec);
  check("board (empty): empty-state copy", !!boardEmptySec && boardEmptySec.narrative.includes("No decisions have been tracked"));
}

// ---------------------------------------------------------------------------
// buildDecisionHistory: appliedFieldChanges (Task #375)
// ---------------------------------------------------------------------------
function testAppliedFieldChanges() {
  console.log("\n— buildDecisionHistory: appliedFieldChanges —");

  const md = makeModel([
    {
      // Captured at apply time and persisted on the entry. Should be surfaced
      // verbatim on the DecisionHistoryItem so the PDF renderer can show it.
      name: "Site with diff",
      outcomeStatus: "pursued",
      decisionType: "evaluate_site",
      appliedToModelAt: "2025-03-15T12:00:00Z",
      overrides: { monthlyRent: 8500 },
      appliedFieldChanges: [
        { label: "Facility rent (monthly)", before: "$9,500/mo", after: "$8,500/mo", kind: "modified" },
        { label: 'Expense row "Site fit-out (one-time)"', before: "Not in model", after: "$75,000 in Year 1", kind: "added" },
      ],
    },
    {
      // Older saved scenario — no appliedFieldChanges field at all. Should
      // degrade gracefully to an empty array.
      name: "Legacy scenario",
      outcomeStatus: "pursued",
      decisionType: "add_program",
      appliedToModelAt: "2025-02-15T12:00:00Z",
      overrides: { addProgramName: "Pre-K" },
    },
    {
      // Hand-edited / corrupt entries should be filtered out individually
      // rather than crashing the whole list.
      name: "Mixed valid/invalid",
      outcomeStatus: "on_hold",
      decisionType: "change_enrollment",
      overrides: {},
      appliedFieldChanges: [
        { label: "Retention rate", before: "85%", after: "92%", kind: "modified" },
        { label: "", before: "x", after: "y", kind: "modified" }, // empty label → dropped
        { label: "Bad kind", before: "x", after: "y", kind: "deleted" }, // unknown kind → dropped
        "not an object", // non-object → dropped
        { label: "Tuition", before: 100, after: "$120", kind: "modified" }, // non-string before → dropped
      ],
    },
    {
      // Wrong shape entirely (string instead of array) — coerce to [].
      name: "Garbage shape",
      outcomeStatus: "declined",
      decisionType: "change_enrollment",
      overrides: {},
      appliedFieldChanges: "oops not an array",
    },
  ]);

  const items = buildDecisionHistory(md);
  const byName = (n: string): DecisionHistoryItem => items.find((i) => i.name === n)!;

  const withDiff = byName("Site with diff");
  eq("with-diff: count", withDiff.appliedFieldChanges.length, 2);
  eq("with-diff: first label", withDiff.appliedFieldChanges[0].label, "Facility rent (monthly)");
  eq("with-diff: first before", withDiff.appliedFieldChanges[0].before, "$9,500/mo");
  eq("with-diff: first after", withDiff.appliedFieldChanges[0].after, "$8,500/mo");
  eq("with-diff: first kind", withDiff.appliedFieldChanges[0].kind, "modified");
  eq("with-diff: second kind (added)", withDiff.appliedFieldChanges[1].kind, "added");

  const legacy = byName("Legacy scenario");
  check(
    "legacy: appliedFieldChanges is array",
    Array.isArray(legacy.appliedFieldChanges),
  );
  eq("legacy: appliedFieldChanges empty", legacy.appliedFieldChanges.length, 0);

  const mixed = byName("Mixed valid/invalid");
  eq("mixed: only the valid entry survives coercion", mixed.appliedFieldChanges.length, 1);
  eq("mixed: surviving label", mixed.appliedFieldChanges[0].label, "Retention rate");

  const garbage = byName("Garbage shape");
  eq("garbage: non-array → empty", garbage.appliedFieldChanges.length, 0);
}

async function main() {
  console.log("=== Decision History Tests ===");
  testOutcomeFiltering();
  testSorting();
  testAppliedNote();
  testBullets();
  testAppliedFieldChanges();
  testNarrative();
  testSectionLists();
  await testPacketIntegration();

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
