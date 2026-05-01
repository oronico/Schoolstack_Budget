// PDF renderer for the "Forecast Accuracy" section shared by the lender and
// board packets (Task #216). Both PDFs invoke `renderForecastAccuracySection`
// after their decision-history block — the helper is responsible for the full
// section: title, optional intro, aggregate tendency callouts, and a per-
// scenario table of projected vs. actual headline metrics.
//
// The section is intentionally omitted (returns immediately, draws nothing)
// when no Pursued saved scenarios with comparable actuals exist, so the PDF
// stays clean for founders who haven't logged outcomes yet.

import {
  sectionTitle,
  bodyText,
  drawTable,
  drawInsightCallout,
  fmtCurrency,
  fmtNumber,
  ensureSpace,
  BRAND,
  type PDFDoc,
  type TableColumn,
} from "../pdf-utils.js";
import {
  ACCURACY_METRICS,
  describeTendency,
  type AccuracyMetricMeta,
  type ForecastAccuracyEntry,
  type ForecastAccuracyRollup,
  type MetricDelta,
} from "@workspace/finance";

// Audience tweak — the lender wants strict variance language; the board wants
// the founder-friendly framing. Same data, slightly different intro copy.
type Audience = "lender" | "board";

const INTRO_COPY: Record<Audience, string> = {
  lender:
    "How prior projections have compared to realized actuals on saved scenarios marked Pursued.",
  board:
    "Where our prior plans have landed vs. what actually happened on decisions we pursued. Helps the board calibrate trust in the current forecast.",
};

const EMPTY_COPY: Record<Audience, string> = {
  lender:
    "No pursued scenarios with realized actuals have been captured yet, so a variance roll-up is not available.",
  board:
    "We have not yet logged actuals on any pursued decisions, so there are no comparisons to report this period.",
};

/**
 * Render the full Forecast Accuracy section into the PDF document. Skips the
 * section entirely (no title, no copy) when there are no comparable entries
 * — callers can invoke this unconditionally and let the helper decide.
 *
 * `omitWhenEmpty` (default `true`, used by both the lender and board packets
 * per Task #216) suppresses the section completely when no eligible
 * scenarios exist. Pass `false` to render an audience-specific empty-state
 * note instead — kept as an escape hatch for future surfaces (e.g. a
 * forecast-accuracy-only export) where a placeholder is preferable to a
 * silently missing section. The text used in that branch lives in
 * `EMPTY_COPY` above.
 */
export function renderForecastAccuracySection(
  doc: PDFDoc,
  rollup: ForecastAccuracyRollup,
  audience: Audience,
  omitWhenEmpty = true,
): void {
  if (rollup.entries.length === 0) {
    if (omitWhenEmpty) return;
    sectionTitle(doc, "Forecast Accuracy");
    bodyText(doc, EMPTY_COPY[audience]);
    return;
  }

  sectionTitle(doc, "Forecast Accuracy");
  bodyText(doc, INTRO_COPY[audience]);

  // Aggregate tendency callouts — the plain-English insights the founder
  // would tell themselves ("you tend to over-project enrollment by 5%").
  // Only render aggregates that span at least two scenarios; a single data
  // point would mislead the reader into seeing a "tendency" that isn't one.
  const meaningfulAggregates = rollup.aggregates.filter((agg) => agg.count >= 2);
  if (meaningfulAggregates.length > 0) {
    doc.moveDown(0.2);
    for (const agg of meaningfulAggregates) {
      const meta = ACCURACY_METRICS.find((m) => m.key === agg.metric);
      if (!meta) continue;
      const tendency = describeTendency(meta, agg.meanDeltaPct);
      const tone =
        tendency.tone === "good"
          ? "success"
          : tendency.tone === "bad"
            ? "warning"
            : "info";
      // Suffix the sample size so a careful reader can tell this isn't a
      // one-off — "across 3 scenarios" makes the average meaningful.
      const body = `${tendency.text}. Based on ${agg.count} pursued scenarios with logged actuals.`;
      drawInsightCallout(doc, meta.label, body, tone);
    }
  }

  // Per-scenario detail. Each scenario gets its own subtitle + small table so
  // a reader can audit which scenario produced which delta.
  doc.moveDown(0.4);
  for (const entry of rollup.entries) {
    renderEntry(doc, entry);
  }
}

function renderEntry(doc: PDFDoc, entry: ForecastAccuracyEntry): void {
  ensureSpace(doc, 60);
  const margin = doc.page.margins.left;
  const w = doc.page.width - margin - doc.page.margins.right;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.navy);
  doc.text(entry.scenario.name, margin, doc.y, { width: w });

  // Subtitle: "Year N actuals · updated <date>" where available. Keeps the
  // reader oriented as to *when* the actuals were captured.
  const subParts: string[] = [`Year ${entry.asOfYear} actuals`];
  const updatedAt = entry.scenario.actuals?.updatedAt;
  if (updatedAt) {
    const d = new Date(updatedAt);
    if (!Number.isNaN(d.getTime())) {
      subParts.push(`updated ${d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`);
    }
  }
  doc.font("Helvetica").fontSize(8).fillColor(BRAND.gray);
  doc.text(subParts.join("  ·  "), margin, doc.y, { width: w });
  doc.moveDown(0.2);

  // Build the rows. Skip metrics with no captured actual (sparse map).
  const rows: string[][] = [];
  for (const meta of ACCURACY_METRICS) {
    const delta = entry.metrics[meta.key];
    if (!delta) continue;
    rows.push([
      meta.label,
      formatValue(meta, delta.projected),
      formatValue(meta, delta.actual),
      formatDelta(delta),
    ]);
  }

  if (rows.length === 0) {
    // Defensive: shouldn't happen because `selectAccuracyScenarios` filters
    // out scenarios with no actuals, but bail cleanly just in case.
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.gray);
    doc.text("No comparable metrics captured.", margin, doc.y, { width: w });
    doc.moveDown(0.4);
    return;
  }

  const colCount = 4;
  const labelW = Math.min(170, w * 0.35);
  const numericW = Math.floor((w - labelW) / (colCount - 1));
  const columns: TableColumn[] = [
    { header: "Metric", width: labelW, align: "left" },
    { header: "Projected", width: numericW, align: "right" },
    { header: "Actual", width: numericW, align: "right" },
    { header: "Delta", width: numericW, align: "right" },
  ];

  drawTable(doc, columns, rows, { zebra: true });

  // Surface the founder's notes if they captured any — that's the qualitative
  // context behind the numeric variance.
  const notes = entry.scenario.actuals?.notes?.trim();
  if (notes) {
    doc.moveDown(0.1);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.navy);
    doc.text("Notes: ", margin, doc.y, { continued: true, width: w });
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
    doc.text(notes);
  }

  doc.moveDown(0.5);
}

function formatValue(meta: AccuracyMetricMeta, value: number): string {
  return meta.kind === "money" ? fmtCurrency(value) : fmtNumber(value);
}

// Delta cell: signed percentage when defined, plain "n/a" when projection
// was zero (no meaningful percent). Sign retained ("+12%" / "-8%") so the
// direction of the miss is unambiguous.
function formatDelta(delta: MetricDelta): string {
  if (delta.deltaPct === null || !isFinite(delta.deltaPct)) {
    return "n/a";
  }
  const sign = delta.deltaPct >= 0 ? "+" : "";
  return `${sign}${delta.deltaPct.toFixed(1)}%`;
}
