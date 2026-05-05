/**
 * Task #556 regression test — Financial outlook badge color parity.
 *
 * The board PDF renders the financial-outlook status badge in two
 * places:
 *
 *   1. The cover page (`drawCoverPage` in `board-packet-pdf.ts`),
 *      which prefixes the headline with "Financial Outlook: " so
 *      trustees see the headline urgency on page 1.
 *   2. The dedicated "Financial Outlook at a Glance" section
 *      (`drawOutlookSection` in `board-packet-pdf.ts`), which
 *      surfaces the same status a few pages later alongside the
 *      summary body.
 *
 * Both call `statusBadge` with the label produced by the shared
 * `financialOutlookBadgeLabel` helper (Task #550), so the cover
 * and the section can't drift on the status → color mapping today
 * — but they could in the future if either renderer switched to a
 * locally-computed label. This test fills that gap by rendering
 * both badge paths from a single `BoardPacket` fixture and
 * asserting the badge color (the rounded-rect fill) and the
 * status label embedded in the badge text match for every
 * `FinancialOutlook.status` value.
 *
 * Modeled on `cash-runway-badge-parity.ts` (Task #524 / #539).
 */
import { createDoc, BRAND, type PDFDoc } from "../src/lib/pdf-utils.js";
import { drawCoverPage, drawOutlookSection } from "../src/lib/packets/board-packet-pdf.js";
import type { CashRunwayView } from "../src/lib/packets/build-cash-runway.js";
import type { BoardPacket, FinancialOutlook } from "../src/lib/packets/build-board-packet.js";

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

function makeCashRunway(): CashRunwayView {
  // The outlook section also emits a cash badge when runwayMonths > 0.
  // Force runwayMonths = 0 so only the financial-outlook badge fires
  // from `drawOutlookSection`, keeping the badge stream unambiguous.
  return {
    runwayMonths: 0,
    runwayLabel: "Cash runway not yet projected",
    status: "warning",
    yearByYearCash: [
      { year: 1, cumulative: "$0K", reserveMonths: "3.0 mo", endingCash: "$100K", isTrough: false },
    ],
    troughCallout: { year: 1, endingCash: "$100K", isNegative: false },
  };
}

/**
 * Build a minimal `BoardPacket`-shaped object for the renderers.
 * `drawCoverPage` reads `schoolName`, `generatedAt`, `financialOutlook`
 * and `scenarioSnapshots`; `drawOutlookSection` reads
 * `financialOutlook` and `cashRunway`. We cast through `unknown`
 * rather than constructing the full interface so the fixture stays
 * honest about what we're actually exercising.
 */
function makePacket(outlook: FinancialOutlook): BoardPacket {
  return {
    schoolName: "Parity Test Academy",
    generatedAt: new Date("2026-05-05T00:00:00Z").toISOString(),
    financialOutlook: outlook,
    cashRunway: makeCashRunway(),
    scenarioSnapshots: [],
  } as unknown as BoardPacket;
}

interface Scenario {
  name: string;
  status: FinancialOutlook["status"];
  expectedColor: string;
  expectedStatusLabel: "Strong" | "Needs Work" | "Not Yet Ready";
}

// One scenario per status value so a regression in any branch of the
// "healthy" / "watch" / "needs_attention" → color mapping fails the
// test. `financialOutlookBadgeLabel` derives the lookup-key string
// ("Strong" / "Needs Work" / "Not Yet Ready") which is fed into
// `statusBadge` only for color selection — it never lands in the
// rendered text — so the test asserts the resulting swatch color
// rather than the lookup-key string.
const scenarios: Scenario[] = [
  { name: "healthy",         status: "healthy",         expectedColor: BRAND.green, expectedStatusLabel: "Strong" },
  { name: "watch",           status: "watch",           expectedColor: BRAND.amber, expectedStatusLabel: "Needs Work" },
  { name: "needs_attention", status: "needs_attention", expectedColor: BRAND.red,   expectedStatusLabel: "Not Yet Ready" },
];

for (const sc of scenarios) {
  const headline = `Outlook headline for ${sc.name}.`;
  const outlook: FinancialOutlook = {
    headline,
    status: sc.status,
    summary: "Outlook summary body.",
  };
  const packet = makePacket(outlook);

  const cover = captureDoc();
  drawCoverPage(cover.doc, packet);

  const section = captureDoc();
  drawOutlookSection(section.doc, packet);

  // The cover page may emit other badges in the future; our renderer
  // currently only emits the financial-outlook badge, which is the
  // one we care about. Pick it out by label prefix to be robust.
  const coverBadge = cover.badges.find((b) => b.label.startsWith("Financial Outlook: "));
  const sectionBadge = section.badges.find((b) => b.label.startsWith("Financial Outlook: "));

  check(
    `${sc.name}: cover page emitted a financial-outlook badge`,
    !!coverBadge,
    `badges captured: ${JSON.stringify(cover.badges)}`,
  );
  check(
    `${sc.name}: at-a-glance section emitted a financial-outlook badge`,
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

  // What the reader actually sees in both badges is:
  //   "Financial Outlook: <headline>"
  // Assert both paths agree on the visible text verbatim so a future
  // edit that, say, switches the section to use a different label
  // source breaks the test alongside any color mismatch.
  const expectedLabel = `Financial Outlook: ${headline}`;
  check(
    `${sc.name}: cover badge label is "Financial Outlook: <headline>"`,
    coverBadge.label === expectedLabel,
    `cover label was "${coverBadge.label}"`,
  );
  check(
    `${sc.name}: section badge label is "Financial Outlook: <headline>"`,
    sectionBadge.label === expectedLabel,
    `section label was "${sectionBadge.label}"`,
  );
  check(
    `${sc.name}: cover and section badges share the visible label verbatim`,
    coverBadge.label === sectionBadge.label,
    `cover="${coverBadge.label}" section="${sectionBadge.label}"`,
  );

  // Sanity: assert the helper's expected status word resolves to the
  // expected color via `statusBadge`'s color table. This catches a
  // future edit that, say, renames the helper's output to "Healthy"
  // without updating the `statusBadge` color map.
  check(
    `${sc.name}: financialOutlookBadgeLabel is expected to map to "${sc.expectedStatusLabel}"`,
    // Imported lazily via require so a refactor that drops the helper
    // export fails this assertion cleanly.
    (await import("../src/lib/packets/build-board-packet.js"))
      .financialOutlookBadgeLabel(sc.status) === sc.expectedStatusLabel,
  );
}

console.log(`\nfinancial-outlook-badge-parity: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
