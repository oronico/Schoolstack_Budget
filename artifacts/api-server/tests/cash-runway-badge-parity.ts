/**
 * Task #524 regression test — Cash runway badge color parity.
 *
 * The board PDF renders the cash runway status badge in two places:
 *
 *   1. The cover-page outlook block (`drawOutlookSection` in
 *      `board-packet-pdf.ts`), which prefixes the runway label with
 *      "Cash Position: " so trustees see the urgency on page 1.
 *   2. The dedicated Cash & Runway Position section
 *      (`renderCashRunwaySection` in `cash-runway-pdf.ts`), which
 *      surfaces the same status alongside the year-by-year table.
 *
 * Both call `statusBadge` with a label derived from the same
 * `CashRunwayView.status` ("good" / "warning" / "danger"). Each path
 * computes the badge's display label inline via the same ternary
 * mapping ("Strong" / "Needs Work" / "Not Yet Ready"), so a future
 * edit that tweaks one mapping but not the other would silently make
 * the cover badge and the section badge disagree on urgency for the
 * same scenario — a trustee glancing at page 1 would see one signal
 * and a careful reader of the section would see another.
 *
 * The PDF parity test in `cash-runway-pdf-parity.ts` covers the
 * trough-callout sentence and the year-by-year table cells, but not
 * the badge color logic specifically. This test fills that gap by
 * rendering both badge paths from a single `CashRunwayView` fixture
 * and asserting the badge color (the rounded-rect fill) and the
 * status label embedded in the badge text match for every status
 * value the runway can take.
 */
import { createDoc, BRAND, type PDFDoc } from "../src/lib/pdf-utils.js";
import { drawOutlookSection } from "../src/lib/packets/board-packet-pdf.js";
import { renderCashRunwaySection } from "../src/lib/packets/cash-runway-pdf.js";
import type { CashRunwayView } from "../src/lib/packets/build-cash-runway.js";
import type { BoardPacket } from "../src/lib/packets/build-board-packet.js";

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
 * `statusBadge` draws a 12x12 rounded-rect filled with the status
 * color and then `doc.text()`s the human-readable label next to it.
 * To capture badge events apples-to-apples between the two rendering
 * paths we wrap `roundedRect` and `fill` to spot the badge swatch
 * (the only 12x12 shape these renderers draw) and pair it with the
 * very next text() call, which `statusBadge` always emits as the
 * badge label.
 */
interface BadgeEvent {
  color: string;
  label: string;
}

function captureDoc(): { doc: PDFDoc; badges: BadgeEvent[] } {
  const doc = createDoc();
  doc.addPage();
  const badges: BadgeEvent[] = [];
  let pendingBadgeColor: string | null = null;
  let awaitingBadgeLabel = false;

  const origRoundedRect = doc.roundedRect.bind(doc);
  const origFill = doc.fill.bind(doc);
  const origText = doc.text.bind(doc);

  (doc as any).roundedRect = (...args: any[]) => {
    const [, , w, h] = args;
    if (w === 12 && h === 12) {
      pendingBadgeColor = "__pending__";
    }
    return (origRoundedRect as any)(...args);
  };
  (doc as any).fill = (...args: any[]) => {
    if (pendingBadgeColor === "__pending__" && typeof args[0] === "string") {
      pendingBadgeColor = args[0];
      awaitingBadgeLabel = true;
    }
    return (origFill as any)(...args);
  };
  (doc as any).text = (...args: any[]) => {
    const s = args[0];
    if (awaitingBadgeLabel && typeof s === "string" && pendingBadgeColor) {
      badges.push({ color: pendingBadgeColor, label: s });
      pendingBadgeColor = null;
      awaitingBadgeLabel = false;
    }
    return (origText as any)(...args);
  };

  return { doc, badges };
}

function makeCashRunway(
  status: CashRunwayView["status"],
  runwayMonths: number,
  runwayLabel: string,
): CashRunwayView {
  return {
    runwayMonths,
    runwayLabel,
    status,
    yearByYearCash: [
      { year: 1, cumulative: "$0K", reserveMonths: "3.0 mo", endingCash: "$100K", isTrough: false },
      { year: 2, cumulative: "$0K", reserveMonths: "3.0 mo", endingCash: "$100K", isTrough: true },
    ],
    troughCallout: { year: 2, endingCash: "$100K", isNegative: status === "danger" },
  };
}

/**
 * Build a minimal `BoardPacket`-shaped object for `drawOutlookSection`
 * — that renderer only reads `financialOutlook` and `cashRunway`, so we
 * cast the partial through `unknown` rather than constructing the full
 * interface. Keeps the fixture honest about what we're actually
 * exercising.
 */
function makePacket(cash: CashRunwayView): BoardPacket {
  return {
    financialOutlook: {
      headline: "Outlook headline.",
      status: cash.status === "good" ? "healthy" : cash.status === "warning" ? "watch" : "needs_attention",
      summary: "Outlook summary body.",
    },
    cashRunway: cash,
  } as unknown as BoardPacket;
}

interface Scenario {
  name: string;
  status: CashRunwayView["status"];
  expectedColor: string;
}

// One scenario per status value so a regression in any branch of the
// "good" / "warning" / "danger" → color mapping fails the test. The
// "Strong" / "Needs Work" / "Not Yet Ready" status word that each
// renderer derives inline is only fed into `statusBadge` for color
// lookup — it never appears in the rendered text — so the test asserts
// the resulting swatch color rather than the lookup-key string.
const scenarios: Scenario[] = [
  { name: "good",    status: "good",    expectedColor: BRAND.green },
  { name: "warning", status: "warning", expectedColor: BRAND.amber },
  { name: "danger",  status: "danger",  expectedColor: BRAND.red },
];

for (const sc of scenarios) {
  const cash = makeCashRunway(sc.status, 18, "Cash runway is approximately 18 months");
  const packet = makePacket(cash);

  const cover = captureDoc();
  drawOutlookSection(cover.doc, packet);

  const section = captureDoc();
  renderCashRunwaySection(section.doc, cash, "Cash & Runway Position");

  const coverBadge = cover.badges[cover.badges.length - 1];
  const sectionBadge = section.badges[0];

  check(
    `${sc.name}: cover-page outlook emitted a cash badge`,
    !!coverBadge,
    `badges captured: ${JSON.stringify(cover.badges)}`,
  );
  check(
    `${sc.name}: cash runway section emitted a badge`,
    !!sectionBadge,
    `badges captured: ${JSON.stringify(section.badges)}`,
  );

  if (!coverBadge || !sectionBadge) continue;

  check(
    `${sc.name}: cover badge color matches expected ${sc.expectedColor}`,
    coverBadge.color.toUpperCase() === sc.expectedColor.toUpperCase(),
    `cover color was ${coverBadge.color}`,
  );
  check(
    `${sc.name}: section badge color matches expected ${sc.expectedColor}`,
    sectionBadge.color.toUpperCase() === sc.expectedColor.toUpperCase(),
    `section color was ${sectionBadge.color}`,
  );
  check(
    `${sc.name}: cover and section badge colors match each other`,
    coverBadge.color.toUpperCase() === sectionBadge.color.toUpperCase(),
    `cover=${coverBadge.color} section=${sectionBadge.color}`,
  );

  // The "Strong" / "Needs Work" / "Not Yet Ready" status word is fed
  // into `statusBadge` only as the color-lookup key — it never lands in
  // the rendered text. What the reader actually sees is:
  //   - cover badge:   "Cash Position: <runwayLabel>"
  //   - section badge: "<runwayLabel>"
  // Assert both paths agree on the runway-label portion verbatim so a
  // future edit that, say, switches the cover to use a different label
  // source breaks the test alongside any color mismatch.
  const coverRunwayPortion = coverBadge.label.replace(/^Cash Position:\s*/, "");
  check(
    `${sc.name}: cover badge text starts with "Cash Position: " prefix`,
    coverBadge.label.startsWith("Cash Position: "),
    `cover label was "${coverBadge.label}"`,
  );
  check(
    `${sc.name}: cover and section badges share the runway label verbatim`,
    coverRunwayPortion === sectionBadge.label,
    `cover="${coverRunwayPortion}" section="${sectionBadge.label}"`,
  );
  check(
    `${sc.name}: section badge label is the runway label verbatim`,
    sectionBadge.label === cash.runwayLabel,
    `section label was "${sectionBadge.label}"`,
  );
}

// Sanity guard: if `drawOutlookSection` ever stops emitting the cash
// badge when `runwayMonths === 0` (the only condition under which the
// cover currently skips the badge), this test would silently pass with
// no parity coverage. Assert the skip path explicitly so a future edit
// that flips the threshold is caught.
{
  const cash = makeCashRunway("warning", 0, "Cash runway not yet projected");
  const packet = makePacket(cash);
  const cover = captureDoc();
  drawOutlookSection(cover.doc, packet);
  check(
    "runwayMonths=0: cover-page outlook skips the cash badge",
    cover.badges.length === 0,
    `badges captured: ${JSON.stringify(cover.badges)}`,
  );
}

console.log(`\ncash-runway-badge-parity: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
