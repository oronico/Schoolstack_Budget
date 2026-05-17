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

import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import { MICROSCHOOL_MODEL } from "../src/lib/seed-preview-data.js";

import { extractPdfFragments } from "./_pdf-text-snapshot-util.js";
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
  const pagesA = extractPdfFragments(pdfA);
  // Cover page lists "Decision History" as a numbered TOC entry. Body
  // pages start after the TOC. Task #922 — the MuPDF-backed
  // `extractPdfFragments` returns a flat `string[]` with `--- PAGE N ---`
  // markers (the legacy WinAnsi extractor concatenated the cover + TOC
  // into a single content stream, but MuPDF surfaces them as separate
  // pages). Slice past the `--- PAGE 3 ---` marker so the assertion
  // ignores BOTH the cover (page 1) and the TOC (page 2).
  const tocEndIdx = pagesA.indexOf("--- PAGE 3 ---");
  const bodyA = (tocEndIdx >= 0 ? pagesA.slice(tocEndIdx) : pagesA.slice(1)).join("\n");
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
  const pagesB = extractPdfFragments(pdfB);
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
