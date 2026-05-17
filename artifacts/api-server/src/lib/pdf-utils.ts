import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DecisionHistoryItem } from "./packets/build-decision-history.js";
import type { LinkedMetric, PacketInsight, PacketSection, PacketTable } from "./packets/packet-types.js";

export const BRAND = {
  green: "#16A34A",
  navy: "#1E293B",
  teal: "#0D9488",
  amber: "#D97706",
  cream: "#FAF9F7",
  white: "#FFFFFF",
  lightGray: "#F1F5F9",
  gray: "#94A3B8",
  darkGray: "#475569",
  red: "#E11D48",
  black: "#0F172A",
};

export type PDFDoc = InstanceType<typeof PDFDocument>;

// Task #922 — PDFKit's built-in Standard 14 fonts (Helvetica family used
// throughout the packet renderers) are Type1 fonts pinned to
// WinAnsiEncoding, which only covers the legacy Windows-1252 codepage.
// When a string containing a non-WinAnsi codepoint (≤, ≥, ≈, →, ↓, ↑,
// ↔, ─, ✓, ✗, ⚠, Σ, Δ, et al.) is passed to `doc.text()`, PDFKit
// silently maps each unsupported codepoint to a substitute byte that
// renders as gibberish in every reader. The canonical case study:
// `Target: ≤ 85% of revenue` from `consultant-engine.ts:1941`
// rendered as `Target: "d 85% of revenue` throughout the lender PDF;
// `(≈ 3 months delay)` rendered as `("H 3 months delay)`.
//
// Fix (Option A, chosen over render-time ASCII substitution per the
// task reviewer's guidance on #922): vendor a Unicode-capable TTF
// family (DejaVu Sans regular + bold under
// `artifacts/api-server/assets/fonts/`) and register it under the
// "Helvetica*" PostScript names so every existing
// `doc.font("Helvetica")` / `doc.font("Helvetica-Bold")` /
// `doc.font("Helvetica-Oblique")` / `doc.font("Helvetica-BoldOblique")`
// call site picks up the Unicode-capable face with zero per-call-site
// changes. PDFKit's `registerFont(name, buffer)` shadows the standard
// 14 fonts when the name collides — proven by the regression test
// `tests/pdf-encoding-corruption-922.ts`, which renders every demo +
// founder fixture and asserts BOTH directions: corruption tokens
// (`"H`, `!"`, `!'`, `"d`) are absent AND the canonical Unicode
// glyphs (≤, ≥, ≈, →, ↓) are present.
//
// Trade-offs:
//   - Italics: the DejaVu Sans Oblique faces are not present on the
//     base image we vendor from; we register the regular face under
//     `Helvetica-Oblique` and the bold face under
//     `Helvetica-BoldOblique` so all existing call sites render
//     correctly (text stays upright instead of italicized). This is
//     acceptable because italic is used for notes/footers only, and
//     the cost (no italic) is paid in exchange for the benefit
//     (every Unicode codepoint renders). When DejaVu Oblique is
//     added to the build image this code picks it up automatically
//     — see FONT_DIR fallbacks below.
//   - Build: `build.ts` copies `assets/fonts` into `dist/assets/fonts`
//     so the bundled CJS server resolves the same relative path in
//     production. Tests resolve the source path via `import.meta`.
//   - File size: ~1.4 MB of vendored TTFs. License: Bitstream Vera /
//     DejaVu Free License — see assets/fonts/LICENSE.txt.
//
// Sibling-bug search (per Verification Protocol Addendum from #919):
// The full inventory of non-ASCII codepoints emitted by the packet
// renderers is captured by `scripts/audit-pdf-unicode.ts`; the
// regression test pins both the no-corruption assertion and the
// presence assertion for the most commonly emitted swing glyphs (≤,
// ≥, ≈, →, ↓). Adding a new Unicode glyph to a renderer requires no
// code change here as long as DejaVu Sans covers it; if it does not
// (true colour emoji), the regression test will surface the
// corruption on the next snapshot refresh.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve a vendored font file. We look first at the source-tree
 * location (`artifacts/api-server/assets/fonts/<name>`) used by
 * `tsx` in dev and tests, then at the bundled location next to
 * `index.cjs` (`dist/assets/fonts/<name>`) used by the production
 * build. Returns `null` when neither resolves so the caller can fall
 * back gracefully instead of crashing at module load on a fresh
 * checkout that hasn't been re-cloned yet.
 */
function resolveFontPath(file: string): string | null {
  const candidates = [
    // Source tree: artifacts/api-server/src/lib/pdf-utils.ts → ../../assets/fonts/
    path.resolve(__dirname, "..", "..", "assets", "fonts", file),
    // Bundled: dist/index.cjs → ./assets/fonts/
    path.resolve(__dirname, "assets", "fonts", file),
    // Legacy/test fallback: process.cwd() based
    path.resolve(process.cwd(), "artifacts/api-server/assets/fonts", file),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const FONT_REGULAR_PATH = resolveFontPath("DejaVuSans.ttf");
const FONT_BOLD_PATH = resolveFontPath("DejaVuSans-Bold.ttf");

/**
 * Register the vendored DejaVu Sans family under the Helvetica*
 * PostScript names so every existing `doc.font("Helvetica…")` call
 * site picks up the Unicode-capable face. Italic variants fall back
 * to the upright face because DejaVu Oblique is not bundled (see
 * trade-off note above).
 *
 * IMPORTANT: PDFKit's `PDFDocument` constructor calls
 * `initFonts(options.font)` which eagerly opens the built-in
 * StandardFont 'Helvetica' and caches it in `this._fontFamilies`
 * (see pdfkit.js initFonts → font → line 2666 `_fontFamilies[cacheKey]`).
 * That cache is consulted BEFORE `_registeredFonts`, so subsequent
 * `doc.font("Helvetica")` calls would silently return the cached
 * StandardFont (WinAnsi) and ignore our registration. We therefore
 * register AND evict the corresponding cache entries so the next
 * `doc.font(name)` call re-resolves through `_registeredFonts` and
 * loads the TTF. Without this eviction the registration is a no-op
 * — verified empirically against pdfkit@0.17.2 while writing #922.
 */
function registerUnicodeFonts(doc: PDFDoc): void {
  if (!FONT_REGULAR_PATH || !FONT_BOLD_PATH) {
    // Missing assets: fall through to PDFKit's built-in Helvetica.
    // Renderers continue to produce a PDF; the corruption regression
    // test surfaces the gap loudly on next snapshot refresh.
    return;
  }
  doc.registerFont("Helvetica", FONT_REGULAR_PATH);
  doc.registerFont("Helvetica-Bold", FONT_BOLD_PATH);
  doc.registerFont("Helvetica-Oblique", FONT_REGULAR_PATH);
  doc.registerFont("Helvetica-BoldOblique", FONT_BOLD_PATH);
  // Evict the pre-cached built-in StandardFont entries so the next
  // doc.font("Helvetica*") call re-resolves through _registeredFonts.
  const cache = (doc as unknown as { _fontFamilies: Record<string, unknown> })._fontFamilies;
  if (cache) {
    delete cache["Helvetica"];
    delete cache["Helvetica-Bold"];
    delete cache["Helvetica-Oblique"];
    delete cache["Helvetica-BoldOblique"];
  }
  // Force the document's currently-active font (set by initFonts to
  // the built-in StandardFont) to switch to the registered TTF so
  // any `doc.text(...)` call issued before an explicit `doc.font(...)`
  // also gets the Unicode-capable face.
  doc.font("Helvetica");
}

export function createDoc(): PDFDoc {
  // Test hook: when SCHOOLSTACK_PDF_TEST_UNCOMPRESSED=1, disable PDF
  // content-stream deflate compression so render-time tests can grep the
  // emitted text. Production PDFs always run compressed (default true).
  const testUncompressed = process.env.SCHOOLSTACK_PDF_TEST_UNCOMPRESSED === "1";
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: "SchoolStack Budget Report",
      Author: "SchoolStack.ai",
      Creator: "SchoolStack Budget",
    },
    bufferPages: true,
    compress: !testUncompressed,
  });
  registerUnicodeFonts(doc);
  return doc;
}

export function drawHeader(doc: PDFDoc, title: string, subtitle?: string) {
  const pageW = doc.page.width;
  const margin = doc.page.margins.left;
  const barH = 60;

  doc.save();
  doc.rect(0, 0, pageW, barH).fill(BRAND.navy);

  doc.font("Helvetica-Bold").fontSize(18).fillColor(BRAND.white);
  doc.text("SchoolStack Budget", margin, 20, { continued: false });

  const rightText = "by SchoolStack.ai";
  const rtW = doc.widthOfString(rightText);
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.gray);
  doc.text(rightText, pageW - margin - rtW, 26);
  doc.restore();

  doc.y = barH + 20;
  doc.font("Helvetica-Bold").fontSize(20).fillColor(BRAND.navy);
  doc.text(title, margin, doc.y, { align: "left" });
  if (subtitle) {
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(11).fillColor(BRAND.darkGray);
    doc.text(subtitle, { align: "left" });
  }
  doc.moveDown(1);
}

export function sectionTitle(doc: PDFDoc, text: string) {
  const margin = doc.page.margins.left;
  const w = doc.page.width - margin * 2;

  ensureSpace(doc, 45);
  doc.moveDown(0.3);
  doc.save();
  doc.rect(margin, doc.y, w, 22).fill(BRAND.navy);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.white);
  doc.text(text, margin + 8, doc.y + 5, { width: w - 16, lineBreak: false });
  doc.restore();
  doc.y += 26;
}

export function subSection(doc: PDFDoc, text: string) {
  ensureSpace(doc, 30);
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.navy);
  doc.text(text);
  doc.moveDown(0.3);
}

export function bodyText(doc: PDFDoc, text: string) {
  doc.font("Helvetica").fontSize(10).fillColor(BRAND.black);
  doc.text(text, { lineGap: 3 });
  doc.moveDown(0.3);
}

/**
 * Task #710 — small inline pill matching the wizard's
 * `ActualVsProjectedBadge` so reviewers see the same Actual / Projected
 * indicator next to prior-year-vs-Year-1 figures and the assumption-
 * confidence rollup that the founder sees on the wizard Review screen.
 *
 * Drawn at the current cursor (`doc.x`, `doc.y`) and advances `doc.x`
 * past the pill so callers can keep writing on the same line. Caller is
 * responsible for resetting fonts/colors afterwards.
 */
export function drawActualVsProjectedPill(
  doc: PDFDoc,
  kind: "actual" | "projected",
): void {
  const label = kind === "actual" ? "ACTUAL" : "PROJECTED";
  const fill = kind === "actual" ? "#D1FAE5" : BRAND.lightGray;
  const text = kind === "actual" ? "#065F46" : BRAND.darkGray;
  const padX = 4;
  const padY = 2;
  doc.font("Helvetica-Bold").fontSize(7);
  const w = doc.widthOfString(label) + padX * 2;
  const h = doc.currentLineHeight() + padY;
  const x = doc.x;
  const y = doc.y;
  doc.save();
  doc.roundedRect(x, y, w, h, 2).fill(fill);
  doc.restore();
  doc.fillColor(text);
  doc.text(label, x + padX, y + padY / 2 + 0.5, { lineBreak: false });
  doc.x = x + w + 4;
  doc.y = y;
  doc.fillColor(BRAND.black);
}

export function labelValue(doc: PDFDoc, label: string, value: string) {
  const margin = doc.page.margins.left;
  ensureSpace(doc, 16);
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(label, margin, doc.y, { continued: true, width: 200 });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.black);
  doc.text(`  ${value}`, { align: "left" });
}

export interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
}

export function drawTable(doc: PDFDoc, columns: TableColumn[], rows: string[][], options?: { highlightLastRow?: boolean; zebra?: boolean }) {
  const margin = doc.page.margins.left;
  const rowH = 20;
  const headerH = 22;
  const totalW = columns.reduce((s, c) => s + c.width, 0);

  ensureSpace(doc, headerH + rowH * Math.min(rows.length, 3));

  let x = margin;
  const startY = doc.y;

  doc.save();
  doc.rect(x, startY, totalW, headerH).fill(BRAND.lightGray);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.navy);
  for (const col of columns) {
    doc.text(col.header, x + 4, startY + 6, { width: col.width - 8, align: col.align || "left", lineBreak: false });
    x += col.width;
  }
  doc.restore();

  let y = startY + headerH;
  for (let r = 0; r < rows.length; r++) {
    ensureSpace(doc, rowH + 4);
    if (doc.y > y + 5) {
      y = doc.y;
    }

    const isLast = r === rows.length - 1 && options?.highlightLastRow;
    const isZebra = options?.zebra && r % 2 === 1;

    if (isLast || isZebra) {
      doc.save();
      doc.rect(margin, y, totalW, rowH).fill(isLast ? BRAND.lightGray : "#F8FAFC");
      doc.restore();
    }

    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    try {
      x = margin;
      const row = rows[r];
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        doc.font(isLast ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(BRAND.black);
        const cellVal = row[c] || "";
        if (cellVal.startsWith("-") || cellVal.startsWith("(")) {
          doc.fillColor(BRAND.red);
        }
        doc.text(cellVal, x + 4, y + 5, { width: col.width - 8, align: col.align || "left" });
        x += col.width;
      }
    } finally {
      doc.page.margins.bottom = savedBottom;
    }
    y += rowH;
  }
  doc.y = y + 4;
}

/**
 * Render a structured "coaching" insight as a callout block: a left accent
 * stripe, a soft cream background, a colored bold label, and a body sentence.
 *
 * Mirrors the wizard's `FinancingInsight` styling so the same insight surfaced
 * in-product also reads as a distinct coaching note inside the lender / board
 * PDFs (Task #326). The PDFKit standard fonts (WinAnsi) don't carry the bank
 * glyph the wizard uses, so we lean on the accent color + bullet marker for
 * visual identity instead of trying to embed an icon font.
 */
export function drawInsightCallout(
  doc: PDFDoc,
  label: string,
  body: string,
  tone: "info" | "success" | "warning" = "info",
) {
  const accentColor = tone === "warning" ? BRAND.amber : tone === "success" ? BRAND.green : BRAND.teal;
  const margin = doc.page.margins.left;
  const pageW = doc.page.width;
  const contentW = pageW - margin * 2;
  const padding = 8;
  const stripeW = 4;
  const innerW = contentW - stripeW - padding * 2;

  // Pre-measure to size the callout box and trigger a page break if needed.
  doc.font("Helvetica-Bold").fontSize(9);
  const labelText = `\u2022 ${label}`;
  const labelH = doc.heightOfString(labelText, { width: innerW });
  doc.font("Helvetica").fontSize(9);
  const bodyH = doc.heightOfString(body, { width: innerW });
  const totalH = padding * 2 + labelH + 3 + bodyH;

  ensureSpace(doc, totalH + 6);
  const startY = doc.y;

  doc.save();
  doc.roundedRect(margin, startY, contentW, totalH, 3).fill(BRAND.cream);
  doc.restore();

  doc.save();
  doc.rect(margin, startY, stripeW, totalH).fill(accentColor);
  doc.restore();

  const textX = margin + stripeW + padding;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(accentColor);
  doc.text(labelText, textX, startY + padding, { width: innerW });

  doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(body, textX, startY + padding + labelH + 3, { width: innerW });

  doc.y = startY + totalH + 6;
}

export function statusBadge(doc: PDFDoc, label: string, status: "good" | "warning" | "danger" | "Strong" | "Needs Work" | "Not Yet Ready") {
  const colors: Record<string, string> = {
    good: BRAND.green,
    Strong: BRAND.green,
    warning: BRAND.amber,
    "Needs Work": BRAND.amber,
    danger: BRAND.red,
    "Not Yet Ready": BRAND.red,
  };
  const color = colors[status] || BRAND.gray;
  const margin = doc.page.margins.left;

  ensureSpace(doc, 24);
  const y = doc.y;

  doc.save();
  doc.roundedRect(margin, y, 12, 12, 2).fill(color);
  doc.restore();

  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.black);
  doc.text(label, margin + 18, y + 1);
  doc.moveDown(0.2);
}

export function drawFooter(doc: PDFDoc, opts?: { date?: Date }) {
  const pages = doc.bufferedPageRange();
  // Callers that need byte-deterministic output (e.g. the prep-guide
  // build) can pin a fixed `date`; everyone else gets today's date.
  const dateStr = (opts?.date ?? new Date()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    const pageW = doc.page.width;
    const margin = doc.page.margins.left;
    const bottomY = doc.page.height - 30;
    const contentW = pageW - margin * 2;

    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    try {
      doc.save();
      doc.font("Helvetica").fontSize(7).fillColor(BRAND.gray);
      doc.text(`SchoolStack Budget - Generated ${dateStr}`, margin, bottomY, { width: contentW, align: "left", lineBreak: false });
      doc.text(`Page ${i + 1} of ${pages.count}`, margin, bottomY, { width: contentW, align: "right", lineBreak: false });
      doc.restore();
    } finally {
      doc.page.margins.bottom = savedBottom;
    }
  }
}

export function ensureSpace(doc: PDFDoc, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom - 30;
  if (doc.y + needed > bottom) {
    doc.addPage();
    doc.y = doc.page.margins.top;
  }
}

export function fmtCurrency(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function fmtPct(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtNumber(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function isNonprofit(entityType?: string): boolean {
  return entityType === "nonprofit_501c3";
}

export function profitLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Income" : "Profit";
}

export function profitMarginLabel(entityType?: string): string {
  return isNonprofit(entityType) ? "Net Margin" : "Profit Margin";
}

export function entityTypeDisplay(entityType?: string): string {
  switch (entityType) {
    case "sole_practitioner": return "Sole Practitioner";
    case "llc_single": return "LLC - Single Member";
    case "llc_partnership": return "LLC - Partnership";
    case "c_corp": return "C Corporation";
    case "s_corp": return "S Corporation";
    case "nonprofit_501c3": return "501(c)(3) Nonprofit";
    case "undetermined": return "Undetermined";
    default: return entityType || "";
  }
}

export function schoolTypeDisplay(type?: string, otherLabel?: string): string {
  switch (type) {
    case "charter_school": return "Charter School";
    case "homeschool_coop": return "Homeschool Co-Op";
    case "learning_pod": return "Learning Pod";
    case "microschool": return "Microschool";
    case "private_school": return "Private School";
    case "tutoring_center": return "Tutoring Center";
    case "other": return otherLabel || "Other";
    default: return type || "";
  }
}

/**
 * Render a single decision-history "card" (accent bar, name + outcome label,
 * applied/pending badge, bullets, retrospective, outcome-logged stamp).
 *
 * Shared by the lender and board packets so any visual or copy change happens
 * in one place (Task #210).
 */
export function renderDecisionHistoryItem(doc: PDFDoc, item: DecisionHistoryItem) {
  // Reserve enough room for the card header + accent bar + (potential) diff
  // block. Without this hint, pdfkit can split the accent bar from the body
  // when the diff has 4+ lines. ~110pt fits header + 6 diff lines + retrospective.
  ensureSpace(doc, 110);

  const accent = item.outcomeStatus === "pursued"
    ? BRAND.teal
    : item.outcomeStatus === "declined"
      ? BRAND.darkGray
      : BRAND.amber;
  const indent = doc.page.margins.left + 12;
  const w = doc.page.width - doc.page.margins.right - indent;

  doc.save();
  doc.roundedRect(doc.page.margins.left, doc.y, 4, 50, 1).fill(accent);
  doc.restore();

  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.navy);
  doc.text(item.name, indent, doc.y, { width: w });

  doc.font("Helvetica").fontSize(8).fillColor(accent);
  doc.text(`${item.outcomeLabel.toUpperCase()}  \u00b7  ${item.decisionTypeLabel}`, indent, doc.y, { width: w });

  if (item.outcomeStatus === "pursued" && item.appliedNote) {
    const noteColor = item.isPendingApply ? BRAND.amber : BRAND.green;
    const prefix = item.isPendingApply ? "[ PENDING ] " : "[ APPLIED ] ";
    doc.font("Helvetica-Bold").fontSize(8).fillColor(noteColor);
    doc.text(prefix, indent, doc.y, { continued: true, width: w });
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
    doc.text(item.appliedNote);
  }

  if (item.bullets.length > 0) {
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
    doc.text(item.bullets.map((b) => `\u2022 ${b}`).join("    "), indent, doc.y, { width: w });
  }

  // Field-level before/after diff (Task #375). Captured at apply time and
  // persisted on the scenario, so reviewers see exactly which model fields
  // each decision moved (e.g. "Facility rent (monthly): $9,500/mo →
  // $8,500/mo"). Cap at 6 lines and surface a "+N more" tail when there are
  // additional changes; older saved scenarios with no captured diff fall
  // through this block silently and the rest of the card renders unchanged.
  if (item.appliedFieldChanges.length > 0) {
    const MAX_LINES = 6;
    const visible = item.appliedFieldChanges.slice(0, MAX_LINES);
    const overflow = item.appliedFieldChanges.length - visible.length;

    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.navy);
    doc.text("Modeled change:", indent, doc.y, { width: w });

    doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
    for (const change of visible) {
      // ASCII "->" instead of U+2192 — pdfkit's standard Helvetica font ships
      // with WinAnsi encoding, which doesn't include the right-arrow glyph
      // (it would silently drop). "->" is unambiguous in a "before -> after"
      // context and renders identically across all PDF viewers.
      const line = `\u2022 ${change.label}: ${change.before} -> ${change.after}`;
      doc.text(line, indent, doc.y, { width: w });
    }
    if (overflow > 0) {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.gray);
      doc.text(`+${overflow} more change${overflow === 1 ? "" : "s"}`, indent, doc.y, { width: w });
    }
  }

  if (item.retrospective) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.navy);
    doc.text("What happened: ", indent, doc.y, { continued: true, width: w });
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.black);
    doc.text(item.retrospective, { width: w - 70 });
  }

  // Trough year callout (Task #378). Surfaces the lowest projected
  // ending-cash year of this decision's adjusted forecast so reviewers see
  // the runway crunch year per decision without flipping back to the
  // planner's ImpactSummary. Styling mirrors the top-level CashRunway
  // trough callout: red copy when negative, navy otherwise.
  if (item.troughCallout) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.navy);
    doc.text("Trough year: ", indent, doc.y, { continued: true, width: w });
    const calloutColor = item.troughCallout.isNegative ? BRAND.red : BRAND.navy;
    doc.font("Helvetica").fontSize(8).fillColor(calloutColor);
    const verb = item.troughCallout.isNegative ? "dips to" : "ends at";
    doc.text(
      `Year ${item.troughCallout.year} ${verb} ${item.troughCallout.endingCash} (lowest projected cash year after this decision).`,
      { width: w - 70 },
    );
  }

  if (item.outcomeUpdatedAt) {
    const d = new Date(item.outcomeUpdatedAt);
    if (!Number.isNaN(d.getTime())) {
      doc.font("Helvetica").fontSize(7).fillColor(BRAND.gray);
      doc.text(
        `Outcome logged ${d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`,
        indent,
        doc.y,
        { width: w },
      );
    }
  }

  doc.moveDown(0.5);
}

/**
 * Render the full decision-history section: section title, optional narrative,
 * either an empty-state hint or a stack of decision cards. Used by both the
 * lender and board packet renderers (Task #210).
 */
export function renderDecisionHistorySection(
  doc: PDFDoc,
  section: PacketSection,
  items: DecisionHistoryItem[],
  options: { emptyStateHint: string },
) {
  sectionTitle(doc, section.title);

  if (section.narrative) {
    bodyText(doc, section.narrative);
  }

  if (items.length === 0) {
    doc.moveDown(0.3);
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.gray);
    doc.text(
      options.emptyStateHint,
      doc.page.margins.left,
      doc.y,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
    );
    doc.moveDown(0.5);
    return;
  }

  doc.moveDown(0.2);

  for (const item of items) {
    renderDecisionHistoryItem(doc, item);
  }
}

/**
 * Render a {@link PacketTable} as a packet section table: section sub-heading,
 * a 30%-wide left "label" column, evenly-divided right-aligned value columns,
 * zebra striping. Shared by the lender and board packet renderers so any
 * visual change to packet tables happens in one place (Task #387).
 */
export function renderPacketTable(doc: PDFDoc, table: PacketTable) {
  if (table.rows.length === 0) return;

  ensureSpace(doc, 50);
  doc.moveDown(0.3);
  subSection(doc, table.title);

  const availW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colCount = table.headers.length;
  const firstColWidth = Math.min(150, availW * 0.3);
  const remainingW = availW - firstColWidth;
  const otherColWidth = Math.floor(remainingW / Math.max(colCount - 1, 1));

  const columns: TableColumn[] = table.headers.map((h, i) => ({
    header: h,
    width: i === 0 ? firstColWidth : otherColWidth,
    align: (i === 0 ? "left" : "right") as "left" | "right",
  }));

  const rows = table.rows.map((row) => [row.label, ...row.values]);
  drawTable(doc, columns, rows, { zebra: true });
}

/**
 * Render the coaching-insight callout loop for a packet section. Shared by
 * the lender and board packet renderers (Task #387).
 */
export function renderPacketInsights(doc: PDFDoc, insights: PacketInsight[]) {
  doc.moveDown(0.2);
  for (const insight of insights) {
    drawInsightCallout(doc, insight.label, insight.body, insight.tone ?? "info");
  }
}

export interface RenderLinkedMetricsOptions {
  /** Maximum number of metrics to render (lender uses 8, board uses 6). */
  limit: number;
  /**
   * When true, append `(benchmark: …)` to the metric line whenever the metric
   * carries a `benchmark` value. Lender packets show benchmarks; board packets
   * intentionally omit them for a more digestible board-room read.
   */
  showBenchmark?: boolean;
  /**
   * Icon used when a metric has no `status` set. Lender packets use a single
   * space (visually blank), board packets use `"~"` so neutral metrics still
   * carry a status glyph alongside their warning siblings.
   */
  neutralIcon?: string;
  /**
   * When true, reserve ~30pt of vertical space before drawing the first
   * metric line so the metrics block stays attached to its parent section
   * heading. Lender packets opt in; the board packet relies on its tighter
   * surrounding layout instead.
   */
  reserveInitialSpace?: boolean;
}

/**
 * Render the linked-metrics list for a packet section. The lender and board
 * packets share the same per-row layout (status glyph + label + value); the
 * options here cover the small differences between them so callers don't keep
 * their own copy (Task #387).
 */
export function renderLinkedMetrics(
  doc: PDFDoc,
  metrics: LinkedMetric[],
  options: RenderLinkedMetricsOptions,
) {
  const neutralIcon = options.neutralIcon ?? "~";
  const showBenchmark = options.showBenchmark ?? false;

  if (options.reserveInitialSpace) {
    ensureSpace(doc, 30);
  }

  for (const m of metrics.slice(0, options.limit)) {
    const statusIcon = m.status === "good"
      ? "+"
      : m.status === "danger"
        ? "!"
        : m.status === "warning"
          ? "~"
          : neutralIcon;
    const statusColor = m.status === "good"
      ? BRAND.green
      : m.status === "danger"
        ? BRAND.red
        : m.status === "warning"
          ? BRAND.amber
          : BRAND.darkGray;

    ensureSpace(doc, 16);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(statusColor);
    doc.text(`[${statusIcon}] `, doc.page.margins.left, doc.y, { continued: true });
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
    const benchmarkSuffix = showBenchmark && m.benchmark ? ` (benchmark: ${m.benchmark})` : "";
    doc.text(`${m.label}: ${m.value}${benchmarkSuffix}`);
  }
  doc.moveDown(0.3);
}

export function docToBuffer(doc: PDFDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
