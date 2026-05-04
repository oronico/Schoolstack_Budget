import {
  sectionTitle, statusBadge, drawTable, ensureSpace,
  type PDFDoc, type TableColumn, BRAND,
} from "../pdf-utils.js";
import type { CashRunwayView } from "./build-cash-runway";

/**
 * Renders the trough-year callout sentence used at the bottom of every cash
 * runway block in both the lender and board packet PDFs. Centralized here so
 * a wording or color tweak only needs to happen in one place (Task #389 — the
 * lender and board PDFs each used to maintain their own copy of this drawing
 * logic, which silently drifted whenever a designer touched one).
 *
 * Pass `prependEnsureSpace` to reserve space for the callout before drawing it
 * (lender uses 24px because it follows directly after the section table; board
 * does not need it because the table renderer already placed the cursor).
 */
export function renderCashRunwayTroughCallout(
  doc: PDFDoc,
  cash: CashRunwayView,
  opts: { prependEnsureSpace?: number } = {},
): void {
  if (!cash.troughCallout) return;
  if (opts.prependEnsureSpace) ensureSpace(doc, opts.prependEnsureSpace);
  doc.moveDown(0.3);
  const calloutColor = cash.troughCallout.isNegative ? BRAND.red : BRAND.navy;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(calloutColor);
  doc.text(
    cash.troughCallout.isNegative
      ? `Tightest cash year: Year ${cash.troughCallout.year} dips to ${cash.troughCallout.endingCash} — additional funding or cost cuts needed before then.`
      : `Tightest cash year: Year ${cash.troughCallout.year} ends at ${cash.troughCallout.endingCash}.`,
    doc.page.margins.left,
    doc.y,
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
  );
  doc.moveDown(0.3);
}

/**
 * Maps a `CashRunwayView.status` ("good" / "warning" / "danger") to the
 * status word `statusBadge` uses for color lookup ("Strong" / "Needs Work" /
 * "Not Yet Ready"). Both the cover-page outlook block and the dedicated cash
 * section need the same word for the same status, so they share this helper
 * (Task #539 — they used to duplicate the inline ternary, which Task #524
 * caught drifting; the regression test in
 * `tests/cash-runway-badge-parity.ts` now backstops a single source of truth
 * rather than two parallel copies).
 */
export function cashStatusBadgeLabel(
  status: CashRunwayView["status"],
): "Strong" | "Needs Work" | "Not Yet Ready" {
  if (status === "good") return "Strong";
  if (status === "warning") return "Needs Work";
  return "Not Yet Ready";
}

/**
 * Renders the full Cash & Runway block used by the board packet PDF: section
 * title, runway status badge, year-by-year table, and the trough callout.
 * Lives here alongside `renderCashRunwayTroughCallout` so all cash-runway PDF
 * rendering is in one place (Task #389).
 */
export function renderCashRunwaySection(
  doc: PDFDoc,
  cash: CashRunwayView,
  title: string = "Cash & Runway Position",
): void {
  sectionTitle(doc, title);

  statusBadge(doc, cash.runwayLabel, cashStatusBadgeLabel(cash.status));
  doc.moveDown(0.3);

  if (cash.yearByYearCash.length > 0) {
    const cols: TableColumn[] = [
      { header: "Year", width: 70 },
      { header: "Ending Cash", width: 130, align: "right" },
      { header: "Cumulative Net Income", width: 150, align: "right" },
      { header: "Reserve", width: 90, align: "right" },
    ];
    const rows = cash.yearByYearCash.map((c) => [
      `Year ${c.year}${c.isTrough ? "  (trough)" : ""}`,
      c.endingCash,
      c.cumulative,
      c.reserveMonths,
    ]);
    drawTable(doc, cols, rows, { zebra: true });

    renderCashRunwayTroughCallout(doc, cash);
  }
}
