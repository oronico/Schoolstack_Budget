// Forecast Accuracy PDF render tests (Task #216).
//
// Verifies that the "Forecast Accuracy" section renders correctly in the
// lender and board PDFs:
//   - When pursued scenarios with comparable actuals exist:
//       * section title appears
//       * each scenario name + per-metric table renders
//       * column headers (Metric / Projected / Actual / Delta) appear
//       * delta percentages appear with sign
//       * aggregate tendency callouts render when count >= 2
//   - When no pursued scenarios with actuals exist:
//       * board PDF omits the section entirely (no title)
//       * lender PDF prints the empty-state explanation
//   - Pursued-only filter: declined / on-hold scenarios with actuals do
//     not contribute to the roll-up.
//
// The PDF text-extraction helpers (zlib + PDF string-literal parsing) are
// duplicated from `decision-history-pdf.ts` to keep each test file
// self-contained and easy to run in isolation.

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

// Task #922 — the MuPDF-backed extractor preserves PDFKit's soft line
// breaks, so a long phrase rendered inside a narrow callout column
// surfaces as e.g. "with \nlogged actuals" instead of the one-line
// "with logged actuals" the legacy WinAnsi parser concatenated. Make
// the content-level assertions whitespace-tolerant so they match
// regardless of where MuPDF wrapped the line.
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ");
}
function contains(label: string, haystack: string, needle: string) {
  check(
    label,
    normalizeWs(haystack).includes(normalizeWs(needle)),
    `expected to find ${JSON.stringify(needle)}`,
  );
}

function notContains(label: string, haystack: string, needle: string) {
  check(
    label,
    !normalizeWs(haystack).includes(normalizeWs(needle)),
    `expected NOT to find ${JSON.stringify(needle)}`,
  );
}

// ---------------------------------------------------------------------------
// Minimal PDF text extraction — same approach as `decision-history-pdf.ts`.
// PDFKit emits FlateDecode-compressed content streams; we inflate each one
// and harvest both literal `(...)` strings and `<...>` hex strings, since
// PDFKit may use either depending on glyph/font situation.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Scenario fixtures
// ---------------------------------------------------------------------------

// Two pursued scenarios with rich actuals, plus one pursued without actuals
// (to confirm the "comparable actuals" gate filters it out) and one declined
// scenario *with* actuals (to confirm the "pursued" gate filters it out).
function pursuedWithActuals() {
  return [
    {
      name: "Add Middle School wing",
      outcomeStatus: "pursued",
      decisionType: "add_program",
      appliedToModelAt: "2025-03-15T12:00:00Z",
      outcomeUpdatedAt: "2025-03-15T12:00:00Z",
      overrides: {
        addProgramName: "Middle School",
        addProgramGradeBand: "6-8",
        addProgramTuition: 14000,
        addProgramEnrollment: [10, 20, 30, 30, 30],
        addProgramAddedFte: 2.5,
      },
      actuals: {
        asOfYear: 1,
        enrollmentActual: 42,
        revenueActual: 720000,
        expenseActual: 690000,
        netIncomeActual: 30000,
        programEnrollmentActual: 8,
        notes: "Enrollment opened slow but caught up by January.",
        updatedAt: "2025-09-01T10:00:00Z",
      },
    },
    {
      name: "Lease downtown facility",
      outcomeStatus: "pursued",
      decisionType: "evaluate_site",
      appliedToModelAt: "2025-04-15T12:00:00Z",
      outcomeUpdatedAt: "2025-04-15T12:00:00Z",
      overrides: {
        monthlyRent: 8500,
        rentEscalation: 3,
        sqftDelta: 1500,
        siteFitOutCost: 75000,
      },
      actuals: {
        asOfYear: 1,
        enrollmentActual: 38,
        revenueActual: 650000,
        expenseActual: 720000,
        netIncomeActual: -70000,
        signedMonthlyRent: 9200,
        notes: "Landlord raised rent during negotiations.",
        updatedAt: "2025-09-15T10:00:00Z",
      },
    },
    {
      name: "Hire reading specialist",
      outcomeStatus: "pursued",
      decisionType: "change_enrollment",
      outcomeUpdatedAt: "2025-05-01T12:00:00Z",
      overrides: {
        enrollmentDelta: [3, 4, 5, 6, 7],
        retentionRate: 92,
      },
      // No actuals captured yet — should be excluded from the roll-up.
    },
    {
      name: "Cut Pre-K cohort (rejected)",
      outcomeStatus: "declined",
      decisionType: "change_enrollment",
      outcomeUpdatedAt: "2025-01-10T14:00:00Z",
      overrides: {
        enrollmentDelta: [-5, -5, 0, 0, 0],
      },
      actuals: {
        asOfYear: 1,
        // Even with actuals, declined scenarios must be excluded.
        enrollmentActual: 99,
        revenueActual: 999999,
        notes: "Should not appear in the roll-up.",
        updatedAt: "2025-09-15T10:00:00Z",
      },
    },
  ];
}

// All declined / on-hold — no eligible scenarios, exercises empty-state path.
function noPursuedScenarios() {
  return [
    {
      name: "Evaluate downtown facility",
      outcomeStatus: "on_hold",
      decisionType: "evaluate_site",
      outcomeUpdatedAt: "2025-02-20T10:00:00Z",
      overrides: { monthlyRent: 8500 },
    },
    {
      name: "Cut Pre-K cohort",
      outcomeStatus: "declined",
      decisionType: "change_enrollment",
      outcomeUpdatedAt: "2025-01-10T14:00:00Z",
      overrides: { enrollmentDelta: [-5, -5, 0, 0, 0] },
    },
  ];
}

async function makeLenderPDF(
  scenarios: unknown[] | null,
  forecastFilter?: import("@workspace/finance").ForecastAccuracyFilter | null,
): Promise<string> {
  const input = { ...(microschoolStartup as Record<string, unknown>) };
  if (scenarios === null) {
    delete (input as Record<string, unknown>).customScenarios;
  } else {
    (input as Record<string, unknown>).customScenarios = scenarios;
  }
  const consultant = await runConsultantEngine(input);
  const packet = buildLenderPacket(
    input as unknown as ModelData,
    consultant,
    1,
    null,
    forecastFilter ?? null,
  );
  const pdf = await generateLenderPacketPDF(packet);
  check(`lender PDF (${scenarios ? "scenarios" : "none"}): non-zero buffer`, pdf.length > 0);
  return extractPdfText(pdf);
}

async function makeBoardPDF(
  scenarios: unknown[] | null,
  forecastFilter?: import("@workspace/finance").ForecastAccuracyFilter | null,
): Promise<string> {
  const input = { ...(microschoolStartup as Record<string, unknown>) };
  if (scenarios === null) {
    delete (input as Record<string, unknown>).customScenarios;
  } else {
    (input as Record<string, unknown>).customScenarios = scenarios;
  }
  const consultant = await runConsultantEngine(input);
  const packet = buildBoardPacket(
    input as unknown as ModelData,
    consultant,
    1,
    null,
    forecastFilter ?? null,
  );
  const pdf = await generateBoardPacketPDF(packet);
  check(`board PDF (${scenarios ? "scenarios" : "none"}): non-zero buffer`, pdf.length > 0);
  return extractPdfText(pdf);
}

// Returns the substring starting at the Forecast Accuracy section title,
// so we can assert that downstream text was generated by THIS section
// (not e.g. by some upstream "Total enrollment" label in another table).
function sliceForecastSection(text: string): string {
  const idx = text.indexOf("Forecast Accuracy");
  return idx === -1 ? "" : text.slice(idx);
}

// ---------------------------------------------------------------------------
// Lender PDF — populated forecast accuracy
// ---------------------------------------------------------------------------
async function testLenderPopulated() {
  console.log("\n— Lender PDF: forecast accuracy with pursued + actuals —");
  const text = await makeLenderPDF(pursuedWithActuals());

  contains("lender: section title", text, "Forecast Accuracy");
  contains("lender: lender intro copy", text, "How prior projections have compared to realized actuals");

  const section = sliceForecastSection(text);

  // Eligible scenarios appear; ineligible ones do not.
  contains("lender: pursued scenario A", section, "Add Middle School wing");
  contains("lender: pursued scenario B", section, "Lease downtown facility");
  notContains("lender: pursued-without-actuals excluded", section, "Hire reading specialist");
  notContains("lender: declined-with-actuals excluded", section, "Cut Pre-K cohort (rejected)");
  // The "should not appear" note from the declined scenario must not bleed in.
  notContains("lender: declined notes excluded", section, "Should not appear in the roll-up.");

  // Per-scenario subtitle (Year + updated date).
  contains("lender: per-scenario year subtitle", section, "Year 1 actuals");

  // Table column headers.
  contains("lender: column header Metric", section, "Metric");
  contains("lender: column header Projected", section, "Projected");
  contains("lender: column header Actual", section, "Actual");
  contains("lender: column header Delta", section, "Delta");

  // Metric labels show up.
  contains("lender: metric Total enrollment", section, "Total enrollment");
  contains("lender: metric Revenue", section, "Revenue");
  contains("lender: metric Expenses", section, "Expenses");
  contains("lender: metric Net income", section, "Net income");
  contains("lender: metric Signed rent", section, "Signed rent (mo)");
  contains("lender: metric Program enrollment", section, "Program enrollment");

  // Delta cells: every populated metric should produce a "%" cell. The
  // exact percentage depends on the projection engine, but every entry
  // row should have at least one signed percentage (e.g. "+12.5%" or
  // "-7.3%"). We just verify the "%" sigil shows up in this section.
  check(
    "lender: at least one delta percentage rendered",
    /[+\-]\d+(?:\.\d+)?%/.test(section),
    "expected a signed percentage like '+12.5%' or '-7.3%'",
  );

  // Founder's notes surface under each scenario.
  contains("lender: scenario A note", section, "Enrollment opened slow but caught up by January.");
  contains("lender: scenario B note", section, "Landlord raised rent during negotiations.");

  // Aggregate tendency callout — with 2 pursued scenarios sharing several
  // metrics, at least one metric should produce an aggregate (count >= 2).
  // The callout body always ends with "Based on N pursued scenarios with
  // logged actuals.", so that phrase is the most reliable presence test.
  contains("lender: aggregate callout copy", section, "pursued scenarios with logged actuals");
}

// ---------------------------------------------------------------------------
// Lender PDF — no eligible scenarios → section omitted entirely
// Per Task #216 the section must be omitted gracefully when no Pursued
// scenarios with comparable actuals exist (first-time founders with no
// track record shouldn't see a half-empty placeholder section).
// ---------------------------------------------------------------------------
async function testLenderEmptyOmitted() {
  console.log("\n— Lender PDF: no pursued scenarios with actuals — section omitted —");
  const text = await makeLenderPDF(noPursuedScenarios());

  notContains("lender (empty): section title omitted", text, "Forecast Accuracy");
  notContains("lender (empty): no lender intro copy", text, "How prior projections have compared to realized actuals");
  notContains("lender (empty): no aggregate callout", text, "pursued scenarios with logged actuals");
}

// ---------------------------------------------------------------------------
// Lender PDF — totally absent customScenarios → section omitted, no crash
// ---------------------------------------------------------------------------
async function testLenderMissingOmitted() {
  console.log("\n— Lender PDF: customScenarios omitted — section omitted —");
  const text = await makeLenderPDF(null);
  notContains("lender (missing): section title omitted", text, "Forecast Accuracy");
  notContains("lender (missing): no lender intro copy", text, "How prior projections have compared to realized actuals");
}

// ---------------------------------------------------------------------------
// Board PDF — populated forecast accuracy
// ---------------------------------------------------------------------------
async function testBoardPopulated() {
  console.log("\n— Board PDF: forecast accuracy with pursued + actuals —");
  const text = await makeBoardPDF(pursuedWithActuals());

  contains("board: section title", text, "Forecast Accuracy");
  contains("board: board intro copy", text, "Where our prior plans have landed");

  const section = sliceForecastSection(text);

  contains("board: pursued scenario A", section, "Add Middle School wing");
  contains("board: pursued scenario B", section, "Lease downtown facility");
  notContains("board: pursued-without-actuals excluded", section, "Hire reading specialist");
  notContains("board: declined-with-actuals excluded", section, "Cut Pre-K cohort (rejected)");

  contains("board: column header Metric", section, "Metric");
  contains("board: column header Projected", section, "Projected");
  contains("board: column header Actual", section, "Actual");
  contains("board: column header Delta", section, "Delta");

  check(
    "board: at least one delta percentage rendered",
    /[+\-]\d+(?:\.\d+)?%/.test(section),
    "expected a signed percentage like '+12.5%' or '-7.3%'",
  );

  contains("board: aggregate callout copy", section, "pursued scenarios with logged actuals");
}

// ---------------------------------------------------------------------------
// Board PDF — no eligible scenarios → section omitted entirely
// ---------------------------------------------------------------------------
async function testBoardEmptyOmitted() {
  console.log("\n— Board PDF: no pursued scenarios with actuals — section omitted —");
  const text = await makeBoardPDF(noPursuedScenarios());

  notContains("board (empty): section title omitted", text, "Forecast Accuracy");
  notContains("board (empty): no intro copy", text, "Where our prior plans have landed");
  notContains("board (empty): no aggregate callout", text, "pursued scenarios with logged actuals");
}

async function testBoardMissingOmitted() {
  console.log("\n— Board PDF: customScenarios omitted — section omitted —");
  const text = await makeBoardPDF(null);
  notContains("board (missing): section title omitted", text, "Forecast Accuracy");
}

// ---------------------------------------------------------------------------
// Lender PDF — filter applied (Task #391)
//
// When the founder triggered the export with a metric/asOfYear slice active
// on the on-screen Forecast Accuracy view, the printable packet must mirror
// that view: only matching scenarios survive, and an italic "Filtered to ..."
// caption beneath the section title tells the lender exactly what slice
// they're looking at.
// ---------------------------------------------------------------------------
async function testLenderMetricFilter() {
  console.log("\n— Lender PDF: filter by metric (Signed rent) —");
  // `signedMonthlyRent` only exists on the "Lease downtown facility" scenario,
  // so a `monthlyRent` filter must keep that scenario and drop the
  // "Add Middle School wing" one.
  const text = await makeLenderPDF(pursuedWithActuals(), {
    metric: "monthlyRent",
    asOfYear: null,
  });
  const section = sliceForecastSection(text);

  contains("lender (metric filter): kept matching scenario", section, "Lease downtown facility");
  notContains("lender (metric filter): dropped non-matching scenario", section, "Add Middle School wing");
  contains("lender (metric filter): caption present", section, "Filtered to");
  contains("lender (metric filter): caption metric label", section, "Signed rent (mo)");
  // Both fixtures had matching `pursued + actuals`; one survives the filter.
  contains("lender (metric filter): caption count", section, "1 of 2 scenarios");
}

async function testLenderYearFilter() {
  console.log("\n— Lender PDF: filter by asOfYear (Year 1) —");
  // Both eligible fixtures use `asOfYear: 1`, so an `asOfYear: 1` filter
  // keeps both and the count reads "2 of 2".
  const text = await makeLenderPDF(pursuedWithActuals(), {
    metric: null,
    asOfYear: 1,
  });
  const section = sliceForecastSection(text);

  contains("lender (year filter): kept scenario A", section, "Add Middle School wing");
  contains("lender (year filter): kept scenario B", section, "Lease downtown facility");
  contains("lender (year filter): caption present", section, "Filtered to");
  contains("lender (year filter): caption year label", section, "Year 1 actuals");
  // When the filter happens to keep every scenario, the renderer
  // intentionally omits the "(N of M scenarios)" suffix — the count would
  // be redundant noise. Verify the suppression rather than asserting "2 of 2".
  notContains("lender (year filter): no count suffix when all kept", section, "2 of 2 scenarios");
}

async function testLenderYearFilterNoMatch() {
  console.log("\n— Lender PDF: filter by asOfYear (Year 3) drops everything —");
  // Neither fixture used `asOfYear: 3`, so the filter empties the section
  // and we fall through to the lender empty-state path (section omitted).
  const text = await makeLenderPDF(pursuedWithActuals(), {
    metric: null,
    asOfYear: 3,
  });
  // Section is omitted entirely when filter empties the roll-up — same
  // behavior as having zero pursued scenarios with actuals.
  notContains("lender (year filter empty): section omitted", text, "Forecast Accuracy");
}

async function testBoardMetricFilter() {
  console.log("\n— Board PDF: filter by metric (Signed rent) —");
  const text = await makeBoardPDF(pursuedWithActuals(), {
    metric: "monthlyRent",
    asOfYear: null,
  });
  const section = sliceForecastSection(text);

  contains("board (metric filter): kept matching scenario", section, "Lease downtown facility");
  notContains("board (metric filter): dropped non-matching scenario", section, "Add Middle School wing");
  contains("board (metric filter): caption present", section, "Filtered to");
  contains("board (metric filter): caption metric label", section, "Signed rent (mo)");
  contains("board (metric filter): caption count", section, "1 of 2 scenarios");
}

async function testBoardNoFilterNoCaption() {
  console.log("\n— Board PDF: no filter → no caption —");
  // Sanity check: when no filter is forwarded the "Filtered to" caption
  // must NOT appear (boards shouldn't see a confusing caption when they're
  // looking at the unfiltered roll-up).
  const text = await makeBoardPDF(pursuedWithActuals());
  const section = sliceForecastSection(text);
  contains("board (no filter): section title still present", section, "Forecast Accuracy");
  notContains("board (no filter): no caption", section, "Filtered to");
}

async function main() {
  console.log("=== Forecast Accuracy PDF Render Tests ===");
  await testLenderPopulated();
  await testLenderEmptyOmitted();
  await testLenderMissingOmitted();
  await testBoardPopulated();
  await testBoardEmptyOmitted();
  await testBoardMissingOmitted();
  await testLenderMetricFilter();
  await testLenderYearFilter();
  await testLenderYearFilterNoMatch();
  await testBoardMetricFilter();
  await testBoardNoFilterNoCaption();

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
