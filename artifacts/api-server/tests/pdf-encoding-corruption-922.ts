/**
 * Task #922 — PDF character-encoding corruption regression.
 *
 * What this guards
 * ----------------
 * Before #922, PDFKit's built-in Standard 14 Helvetica fonts (Type1,
 * WinAnsiEncoding only) silently mangled every non-WinAnsi codepoint
 * emitted by the packet renderers. The canonical case: `Target: ≤ 85% of
 * revenue` from `consultant-engine.ts` rendered as `Target: "d 85% of
 * revenue` in every reader; `(≈ 3 months delay)` rendered as `("H 3
 * months delay)`. Four signature corruption tokens (`"H`, `!"`, `!'`,
 * `"d`) appeared throughout the lender and board PDFs.
 *
 * #922 fixes the root cause by registering a Unicode-capable DejaVu
 * Sans TTF family under the `Helvetica*` PostScript names in
 * `pdf-utils.ts:createDoc` — see the header comment there for the
 * full rationale and Option (a)-vs-(b) trade-off.
 *
 * Pattern C regression assertion (per Verification Protocol Addendum
 * from #919): for every demo persona + founder-shaped fixture, the
 * rendered packet PDF MUST satisfy BOTH directions:
 *
 *   1. Corruption tokens absent — `"H`, `!"`, `!'`, `"d` MUST NOT
 *      appear in extracted text. A regression to the broken WinAnsi
 *      path re-introduces all four.
 *   2. Canonical Unicode glyphs present — the swing glyphs that the
 *      renderers actually emit (≤, ≥, ≈, →, ↓) MUST appear in at
 *      least one rendered PDF. An accidental return to ASCII
 *      substitution (option b from the task spec) silently rewrites
 *      them and this assertion catches it.
 *
 * The extractor goes through MuPDF so the rendered Unicode text is
 * read via the embedded ToUnicode CMap, exactly as a PDF reader
 * would show the user. This is the same extractor used by the
 * shared snapshot tests (`_pdf-text-snapshot-util.ts`).
 *
 * Sibling-bug coverage
 * --------------------
 * The audit in `pdf-utils.ts` header comment enumerates the full
 * non-ASCII inventory across the packet renderers. The four named
 * corruption tokens are the most-visible casualties of WinAnsi; the
 * fix (Unicode font) covers every glyph DejaVu Sans supports
 * (essentially all BMP except colour emoji). Pinning the swing
 * glyphs above is sufficient because they all share the same
 * rendering path through `doc.font("Helvetica*")` — a regression
 * affects all of them simultaneously.
 *
 * Scope
 * -----
 * - 3 seeded demos: microschool / private_school / charter_school
 *   (`MICROSCHOOL_MODEL` / `PRIVATE_SCHOOL_MODEL` /
 *   `CHARTER_SCHOOL_MODEL` from `seed-preview-data.ts`).
 * - 4 founder-shaped fixtures from `LENDER_PDF_FIXTURES`
 *   (`tests/fixtures/lender-pdf-fixtures.ts`):
 *   `multi_debt_stack`, `restricted_gifts_heavy`,
 *   `capital_campaign_mid_cycle`, `voucher_scholarship_combo`.
 * - Both packet PDFs (lender + board) are rendered for each case so
 *   every renderer is exercised.
 *
 * Hermetic: no DB, no network, no env vars.
 */
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
import {
  MICROSCHOOL_MODEL,
  PRIVATE_SCHOOL_MODEL,
  CHARTER_SCHOOL_MODEL,
} from "../src/lib/seed-preview-data.js";
import { LENDER_PDF_FIXTURES } from "./fixtures/lender-pdf-fixtures.js";
import { extractPdfText } from "./_pdf-text-snapshot-util.js";

// Direction 1: extracted-text tokens that WERE present pre-#922 when
// PDFKit's WinAnsi Helvetica corrupted ≤, ↓, →, and ≈ respectively.
// Adding a new entry here documents another regression class.
const CORRUPTION_TOKENS: ReadonlyArray<{ token: string; intendedGlyph: string }> = [
  { token: '"H', intendedGlyph: "\u2248" }, // ≈
  { token: '!"', intendedGlyph: "\u2193" }, // ↓
  { token: "!'", intendedGlyph: "\u2192" }, // →
  { token: '"d', intendedGlyph: "\u2264" }, // ≤
];

// Direction 2: canonical Unicode glyphs the renderers actually emit
// today. At least one of these MUST appear in at least one rendered
// PDF across the suite — that proves PDFKit is honouring the
// Unicode-capable font rather than the WinAnsi fallback or an ASCII
// substitution. We assert across the suite rather than per-fixture
// because not every fixture exercises every swing glyph.
const REQUIRED_UNICODE_GLYPHS: readonly string[] = [
  "\u2264", // ≤
  "\u2265", // ≥
  "\u2248", // ≈
  "\u2192", // →
  "\u2193", // ↓
];

interface FixtureCase {
  label: string;
  data: Record<string, unknown>;
}

const CASES: FixtureCase[] = [
  { label: "microschool",    data: MICROSCHOOL_MODEL.data    as unknown as Record<string, unknown> },
  { label: "private_school", data: PRIVATE_SCHOOL_MODEL.data as unknown as Record<string, unknown> },
  { label: "charter_school", data: CHARTER_SCHOOL_MODEL.data as unknown as Record<string, unknown> },
  ...LENDER_PDF_FIXTURES.map((f) => ({
    label: f.label,
    data: f.data as unknown as Record<string, unknown>,
  })),
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? `\n${detail}` : ""}`);
  }
}

function snippetAround(text: string, needle: string, span = 60): string {
  const idx = text.indexOf(needle);
  if (idx < 0) return "";
  const start = Math.max(0, idx - span);
  const end = Math.min(text.length, idx + needle.length + span);
  return text.slice(start, end);
}

function assertNoCorruption(
  pdfText: string,
  packetTag: string,
  fixtureLabel: string,
  collectedGlyphs: Set<string>,
): void {
  for (const { token, intendedGlyph } of CORRUPTION_TOKENS) {
    const present = pdfText.includes(token);
    const detail = present
      ? `    Found corruption token ${JSON.stringify(token)} in ${packetTag} PDF\n` +
        `    for fixture ${fixtureLabel}. This token appears when PDFKit's WinAnsi\n` +
        `    Helvetica encounters Unicode codepoint U+${intendedGlyph.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} (${intendedGlyph}).\n` +
        `    Context: ${JSON.stringify(snippetAround(pdfText, token))}\n` +
        `    Fix regressed: pdf-utils.ts createDoc must register a Unicode-capable\n` +
        `    font under the Helvetica* names (see task #922).`
      : "";
    check(`${packetTag} ${fixtureLabel}: no corruption token ${JSON.stringify(token)}`, !present, detail);
  }
  for (const g of REQUIRED_UNICODE_GLYPHS) {
    if (pdfText.includes(g)) collectedGlyphs.add(g);
  }
}

async function runOne(c: FixtureCase, collectedGlyphs: Set<string>): Promise<void> {
  const consultant = await runConsultantEngine(c.data);

  const lenderPacket = buildLenderPacket(
    c.data as unknown as Parameters<typeof buildLenderPacket>[0],
    consultant,
    0,
  );
  (lenderPacket as unknown as { generatedAt: Date }).generatedAt = new Date("2026-01-01T00:00:00Z");
  const lenderPdf = await generateLenderPacketPDF(lenderPacket);
  assertNoCorruption(extractPdfText(lenderPdf), "lender", c.label, collectedGlyphs);

  const boardPacket = buildBoardPacket(
    c.data as unknown as Parameters<typeof buildBoardPacket>[0],
    consultant,
    0,
  );
  (boardPacket as unknown as { generatedAt: Date }).generatedAt = new Date("2026-01-01T00:00:00Z");
  const boardPdf = await generateBoardPacketPDF(boardPacket);
  assertNoCorruption(extractPdfText(boardPdf), "board", c.label, collectedGlyphs);
}

async function main(): Promise<void> {
  const collectedGlyphs = new Set<string>();
  for (const c of CASES) {
    await runOne(c, collectedGlyphs);
  }

  // Suite-wide presence assertion (Pattern C, direction 2).
  const present = REQUIRED_UNICODE_GLYPHS.filter((g) => collectedGlyphs.has(g));
  const cond = present.length > 0;
  const detail = cond
    ? ""
    : `    None of the canonical Unicode glyphs (${REQUIRED_UNICODE_GLYPHS.join(" ")}) appeared\n` +
      `    in any rendered packet across ${CASES.length} fixtures × 2 packet kinds.\n` +
      `    Either the renderers no longer emit these glyphs, or pdf-utils.ts\n` +
      `    silently fell back to ASCII substitution (option b from #922 spec).`;
  check(
    `suite-wide presence: at least one of ${REQUIRED_UNICODE_GLYPHS.join(", ")} appears in some rendered PDF`,
    cond,
    detail,
  );
  console.log(
    `pdf-encoding-corruption-922: ${passed} passed, ${failed} failed (canonical glyphs observed: ${[...collectedGlyphs].join(" ") || "<none>"})`,
  );
  if (failed > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("pdf-encoding-corruption-922: unexpected error", err);
  process.exit(1);
});
