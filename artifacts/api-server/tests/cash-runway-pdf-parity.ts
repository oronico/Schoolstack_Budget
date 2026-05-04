/**
 * Task #515 regression test — Lender vs. board PDF cash runway parity.
 *
 * Task #389 unified the PDF rendering of the cash runway via the shared
 * helpers `renderCashRunwayTroughCallout` (used directly by the lender PDF
 * after its debt-service table) and `renderCashRunwaySection` (used by the
 * board PDF, which itself wraps `renderCashRunwayTroughCallout` after the
 * year-by-year table). Task #500 pinned the React `CashRunwayCard` so its
 * rendered DOM stays deduplicated, but there was no equivalent guard for
 * the actual PDF bytes lenders and boards download.
 *
 * This test renders the cash runway portions of both PDFs from a single
 * shared `CashRunwayView` fixture and asserts:
 *
 *   1. The trough-year callout sentence is byte-identical between the
 *      lender and board PDF rendering paths (negative-variant copy).
 *   2. The same parity holds for the positive-variant copy.
 *   3. The board section's year-by-year table emits the same per-year
 *      ending-cash cells the lender packet renders via its own table —
 *      i.e. founders see the same dollar amounts in both deliverables.
 *
 * If a future edit changes wording or color in only one of the two PDF
 * builders (e.g. tweaks the lender callout but forgets the board path,
 * or vice versa), the parity assertions below will fail loudly.
 */
import { createDoc, type PDFDoc } from "../src/lib/pdf-utils.js";
import {
  renderCashRunwayTroughCallout,
  renderCashRunwaySection,
} from "../src/lib/packets/cash-runway-pdf.js";
import type { CashRunwayView } from "../src/lib/packets/build-cash-runway.js";

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

/**
 * Wrap a fresh PDFDocument so every `.text()` call records the exact
 * string drawn alongside the active font + fill color. This gives the
 * test a deterministic, parser-free view of what each rendering path
 * actually emitted to the page so we can compare them apples-to-apples.
 */
interface DrawnText {
  text: string;
  font: string;
  fillColor: string;
  fontSize: number;
}

function captureDoc(): { doc: PDFDoc; calls: DrawnText[] } {
  const doc = createDoc();
  const calls: DrawnText[] = [];
  let activeFont = "Helvetica";
  let activeFill = "#000000";
  let activeSize = 12;

  const origFont = doc.font.bind(doc);
  const origFill = doc.fillColor.bind(doc);
  const origSize = doc.fontSize.bind(doc);
  const origText = doc.text.bind(doc);

  (doc as any).font = (...args: any[]) => {
    if (typeof args[0] === "string") activeFont = args[0];
    return (origFont as any)(...args);
  };
  (doc as any).fillColor = (...args: any[]) => {
    if (typeof args[0] === "string") activeFill = args[0];
    return (origFill as any)(...args);
  };
  (doc as any).fontSize = (...args: any[]) => {
    if (typeof args[0] === "number") activeSize = args[0];
    return (origSize as any)(...args);
  };
  (doc as any).text = (...args: any[]) => {
    const s = args[0];
    if (typeof s === "string") {
      calls.push({
        text: s,
        font: activeFont,
        fillColor: activeFill,
        fontSize: activeSize,
      });
    }
    return (origText as any)(...args);
  };

  // Start a page so `doc.page` / `doc.y` are valid for the renderers.
  doc.addPage();
  return { doc, calls };
}

function fixture(troughIsNegative: boolean): CashRunwayView {
  if (troughIsNegative) {
    // Year 3 dips to -$100K — must use the negative-variant callout copy.
    return {
      runwayMonths: 24,
      runwayLabel: "Cash runway is approximately 24 months",
      status: "warning",
      yearByYearCash: [
        { year: 1, cumulative: "$-50K", reserveMonths: "4.0 mo", endingCash: "$150K", isTrough: false },
        { year: 2, cumulative: "$-200K", reserveMonths: "0.0 mo", endingCash: "$0K", isTrough: false },
        { year: 3, cumulative: "$-300K", reserveMonths: "0.0 mo", endingCash: "$-100K", isTrough: true },
        { year: 4, cumulative: "$-150K", reserveMonths: "1.0 mo", endingCash: "$50K", isTrough: false },
        { year: 5, cumulative: "$100K", reserveMonths: "5.0 mo", endingCash: "$300K", isTrough: false },
      ],
      troughCallout: { year: 3, endingCash: "$-100K", isNegative: true },
    };
  }
  // Monotonically growing cash — uses the positive-variant copy.
  return {
    runwayMonths: 60,
    runwayLabel: "Cash remains positive through the full 5-year projection",
    status: "good",
    yearByYearCash: [
      { year: 1, cumulative: "$25K", reserveMonths: "6.0 mo", endingCash: "$125K", isTrough: true },
      { year: 2, cumulative: "$80K", reserveMonths: "9.0 mo", endingCash: "$180K", isTrough: false },
      { year: 3, cumulative: "$180K", reserveMonths: "12.0 mo", endingCash: "$280K", isTrough: false },
      { year: 4, cumulative: "$320K", reserveMonths: "15.0 mo", endingCash: "$420K", isTrough: false },
      { year: 5, cumulative: "$500K", reserveMonths: "18.0 mo", endingCash: "$600K", isTrough: false },
    ],
    troughCallout: { year: 1, endingCash: "$125K", isNegative: false },
  };
}

/**
 * Pull only the trough-callout draw call out of the captured stream.
 * Distinguished from the rest of the section by the bold 9pt font the
 * shared `renderCashRunwayTroughCallout` helper uses.
 */
function findCalloutCall(calls: DrawnText[]): DrawnText | undefined {
  return calls.find(
    (c) =>
      c.font === "Helvetica-Bold" &&
      c.fontSize === 9 &&
      c.text.startsWith("Tightest cash year:"),
  );
}

function calloutsMatch(a: DrawnText, b: DrawnText): boolean {
  return (
    a.text === b.text &&
    a.font === b.font &&
    a.fillColor === b.fillColor &&
    a.fontSize === b.fontSize
  );
}

// ---- Scenario 1: negative-variant callout parity ----------------------
{
  const view = fixture(true);

  const lender = captureDoc();
  // Mirrors `lender-packet-pdf.ts` line ~229 — the lender packet renders
  // the trough callout standalone after its own debt-service table.
  renderCashRunwayTroughCallout(lender.doc, view, { prependEnsureSpace: 24 });

  const board = captureDoc();
  // Mirrors `board-packet-pdf.ts` line ~37 — the board packet renders the
  // full section, which internally calls `renderCashRunwayTroughCallout`.
  renderCashRunwaySection(board.doc, view, "Cash & Runway Position");

  const lenderCallout = findCalloutCall(lender.calls);
  const boardCallout = findCalloutCall(board.calls);

  check(
    "scenario 1: lender path emits the trough-callout sentence",
    !!lenderCallout,
    `lender drew: ${JSON.stringify(lender.calls.map((c) => c.text))}`,
  );
  check(
    "scenario 1: board path emits the trough-callout sentence",
    !!boardCallout,
    `board drew: ${JSON.stringify(board.calls.map((c) => c.text))}`,
  );

  if (lenderCallout && boardCallout) {
    check(
      "scenario 1: callout text/font/color/size match between lender and board PDFs",
      calloutsMatch(lenderCallout, boardCallout),
      `lender=${JSON.stringify(lenderCallout)} board=${JSON.stringify(boardCallout)}`,
    );
    check(
      "scenario 1: negative-variant copy mentions Year 3 dipping to $-100K",
      lenderCallout.text.includes("Year 3") &&
        lenderCallout.text.includes("$-100K") &&
        lenderCallout.text.includes("dips to") &&
        lenderCallout.text.includes("additional funding or cost cuts needed"),
      `text was: ${lenderCallout.text}`,
    );
    check(
      "scenario 1: negative-variant uses BRAND.red (#E11D48)",
      lenderCallout.fillColor.toUpperCase() === "#E11D48",
      `color was: ${lenderCallout.fillColor}`,
    );
  }
}

// ---- Scenario 2: positive-variant callout parity ----------------------
{
  const view = fixture(false);

  const lender = captureDoc();
  renderCashRunwayTroughCallout(lender.doc, view, { prependEnsureSpace: 24 });

  const board = captureDoc();
  renderCashRunwaySection(board.doc, view, "Cash & Runway Position");

  const lenderCallout = findCalloutCall(lender.calls);
  const boardCallout = findCalloutCall(board.calls);

  check(
    "scenario 2: both paths emit the positive-variant trough callout",
    !!lenderCallout && !!boardCallout,
    `lender=${!!lenderCallout} board=${!!boardCallout}`,
  );

  if (lenderCallout && boardCallout) {
    check(
      "scenario 2: callout text/font/color/size match between lender and board PDFs",
      calloutsMatch(lenderCallout, boardCallout),
      `lender=${JSON.stringify(lenderCallout)} board=${JSON.stringify(boardCallout)}`,
    );
    check(
      "scenario 2: positive-variant copy mentions Year 1 ending at $125K",
      lenderCallout.text === "Tightest cash year: Year 1 ends at $125K.",
      `text was: ${lenderCallout.text}`,
    );
    check(
      "scenario 2: positive-variant uses BRAND.navy (#1E293B)",
      lenderCallout.fillColor.toUpperCase() === "#1E293B",
      `color was: ${lenderCallout.fillColor}`,
    );
  }
}

// ---- Scenario 3: per-year ending-cash cells parity --------------------
// The lender packet renders its year-by-year cash table via the generic
// `renderPacketTable` helper from packet-table data, while the board PDF
// renders it inside `renderCashRunwaySection` via `drawTable`. Both
// ultimately read the SAME `CashRunwayView.yearByYearCash` rows, so the
// per-year ending-cash strings must appear in both paths verbatim. This
// guards against a future edit that, say, reformats only the board table
// (e.g. drops the trough marker or changes "$" prefix) and silently makes
// lender and board readers see different numbers for the same scenario.
{
  const view = fixture(true);
  const board = captureDoc();
  renderCashRunwaySection(board.doc, view, "Cash & Runway Position");

  const drawnText = board.calls.map((c) => c.text).join("\n");

  for (const row of view.yearByYearCash) {
    check(
      `scenario 3: board table includes ending cash ${row.endingCash} for Year ${row.year}`,
      drawnText.includes(row.endingCash),
      `not found in: ${drawnText}`,
    );
  }
  check(
    "scenario 3: board table flags the trough year inline (Year 3)",
    drawnText.includes("Year 3  (trough)"),
    `drawn: ${drawnText}`,
  );
  check(
    "scenario 3: board section title rendered",
    drawnText.includes("Cash & Runway Position"),
    `drawn: ${drawnText}`,
  );
  check(
    "scenario 3: board status badge mirrors runwayLabel",
    drawnText.includes("Cash runway is approximately 24 months"),
    `drawn: ${drawnText}`,
  );
}

console.log(`\ncash-runway-pdf-parity: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
