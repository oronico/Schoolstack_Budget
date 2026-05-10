/**
 * Task #615 — One-page "Lender Summary" PDF page.
 *
 * Renders the LenderSummaryData onto a single letter-portrait page (612 ×
 * 792 pts). Layout is intentionally tight: header + verdict, two columns
 * of headline metrics, revenue mix bar, top-3 risk grid, and key
 * assumptions table. The renderer never paginates — callers should call it
 * on a fresh page and follow with `doc.addPage()` for downstream content.
 */
import { BRAND, type PDFDoc } from "../pdf-utils.js";
import type { LenderSummaryData } from "./build-lender-summary.js";
import { lenderReadinessCoachingHeadline } from "../lender-readiness-coaching.js";

const BUCKET_COLORS: Record<keyof BucketShares, string> = {
  contracted: BRAND.green,
  projected: BRAND.teal,
  policyDependent: BRAND.amber,
  donorDependent: BRAND.red,
};

interface BucketShares {
  contracted: number;
  projected: number;
  policyDependent: number;
  donorDependent: number;
}

const BUCKET_LABELS: Record<keyof BucketShares, string> = {
  contracted: "Contracted",
  projected: "Projected",
  policyDependent: "Policy",
  donorDependent: "Donor",
};

const SEVERITY_COLORS: Record<"critical" | "high" | "medium", string> = {
  critical: BRAND.red,
  high: BRAND.amber,
  medium: BRAND.darkGray,
};

function fmtDscr(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  if (v >= 99) return "\u221e";
  return `${v.toFixed(2)}x`;
}

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

function fmtUtil(u: number | null): string {
  if (u === null) return "—";
  return `${(u * 100).toFixed(0)}%`;
}

function verdictColor(status: LenderSummaryData["verdict"]["status"]): string {
  if (status === "Strong") return BRAND.green;
  if (status === "Needs Work") return BRAND.amber;
  return BRAND.red;
}

export function drawLenderSummaryPage(doc: PDFDoc, data: LenderSummaryData): void {
  const pageW = doc.page.width;
  const margin = doc.page.margins.left;
  const contentW = pageW - margin * 2;

  // ── Top navy bar with title ────────────────────────────────────────────
  doc.save();
  doc.rect(0, 0, pageW, 70).fill(BRAND.navy);
  doc.font("Helvetica-Bold").fontSize(18).fillColor(BRAND.white);
  doc.text("Lender Conversation Snapshot", margin, 22, { width: contentW });
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.gray);
  doc.text("SchoolStack Budget — One-Page Lender Conversation Snapshot", margin, 46);
  doc.restore();

  doc.y = 84;

  // ── School name + generated date ───────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(15).fillColor(BRAND.navy);
  doc.text(data.schoolName, margin, doc.y, { width: contentW });
  doc.font("Helvetica").fontSize(8).fillColor(BRAND.gray);
  doc.text(
    `Prepared ${data.generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    margin,
    doc.y + 1,
    { width: contentW },
  );
  doc.y += 18;

  // ── Coaching headline + explanation ────────────────────────────────────
  // Task #751 — surface the same coaching phrasing the in-app Consultant
  // view shows ("Ready to share", "Almost there", "Worth another pass")
  // instead of leaking the raw verdict word ("Strong" / "Needs Work" /
  // "Not Yet Ready") as a small status pill.
  const verdictY = doc.y;
  const vColor = verdictColor(data.verdict.status);
  const headline = lenderReadinessCoachingHeadline(data.verdict.status);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(vColor);
  doc.text(headline, margin, verdictY, {
    width: contentW,
    lineBreak: false,
    ellipsis: true,
  });
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
  doc.text(data.verdict.line, margin, verdictY + 14, {
    width: contentW,
    height: 20,
    ellipsis: true,
  });
  doc.y = verdictY + 32;

  // ── Two-column headline metrics: DSCR-by-year + Runway/Break-even ─────
  const colGap = 14;
  const colW = (contentW - colGap) / 2;
  const colTop = doc.y;
  const colHeight = 148;

  drawDscrCard(doc, margin, colTop, colW, colHeight, data);
  drawRunwayBreakevenCard(
    doc,
    margin + colW + colGap,
    colTop,
    colW,
    colHeight,
    data,
  );

  doc.y = colTop + colHeight + 10;

  // ── Revenue quality mix ────────────────────────────────────────────────
  drawRevenueMix(doc, margin, doc.y, contentW, data.revenueQualityY1);
  doc.y += 6;

  // ── Top 3 risks + mitigants ────────────────────────────────────────────
  drawTopRisks(doc, margin, doc.y, contentW, data.topRisks);
  doc.y += 4;

  // ── Key assumptions table ──────────────────────────────────────────────
  drawKeyAssumptions(doc, margin, doc.y, contentW, data.keyAssumptions);

  // ── Footer (inside the bottom safe zone so we don't auto-paginate) ────
  // Temporarily drop the bottom margin to 0 — the footer is short enough
  // to live in the gutter without spilling, but PDFKit otherwise treats
  // any y past `pageH - bottom` as overflow and silently adds a 2nd page.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  try {
    doc.font("Helvetica-Oblique").fontSize(7).fillColor(BRAND.gray);
    const footerY = doc.page.height - savedBottom + 18;
    doc.text(
      "All figures generated by the SchoolStack canonical engine — same source as the dashboard and detailed packet.",
      margin,
      footerY,
      { width: contentW, align: "center", lineBreak: false },
    );
  } finally {
    doc.page.margins.bottom = savedBottom;
  }
}

function drawCardFrame(
  doc: PDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
): void {
  doc.save();
  doc.roundedRect(x, y, w, h, 4).lineWidth(0.5).strokeColor(BRAND.gray).stroke();
  doc.rect(x, y, w, 18).fill(BRAND.lightGray);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.navy);
  doc.text(title, x + 8, y + 5, { width: w - 16, lineBreak: false });
  doc.restore();
}

function drawDscrCard(
  doc: PDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  data: LenderSummaryData,
): void {
  drawCardFrame(doc, x, y, w, h, "Debt Service Coverage by Year");

  const innerX = x + 10;
  const innerW = w - 20;
  // Layout: label column (Planned / Normalized) + N year columns.
  const labelW = 60;
  const cells = data.dscrByYear.length;
  const yearW = (innerW - labelW) / cells;

  // Year header row.
  const headerY = y + 26;
  doc.font("Helvetica").fontSize(7).fillColor(BRAND.gray);
  for (let i = 0; i < cells; i++) {
    doc.text(`Y${data.dscrByYear[i].year}`, innerX + labelW + yearW * i, headerY, {
      width: yearW,
      align: "center",
      lineBreak: false,
    });
  }

  // Planned (as-planned) row.
  const plannedY = headerY + 11;
  doc.font("Helvetica-Bold").fontSize(7).fillColor(BRAND.darkGray);
  doc.text("Planned", innerX, plannedY + 2, { width: labelW, lineBreak: false });
  for (let i = 0; i < cells; i++) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.navy);
    doc.text(fmtDscr(data.dscrByYear[i].planned), innerX + labelW + yearW * i, plannedY, {
      width: yearW,
      align: "center",
      lineBreak: false,
    });
  }

  // Normalized (founder-comp at market) row.
  const normY = plannedY + 16;
  doc.font("Helvetica-Bold").fontSize(7).fillColor(BRAND.darkGray);
  doc.text("Normalized", innerX, normY + 2, { width: labelW, lineBreak: false });
  for (let i = 0; i < cells; i++) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.teal);
    doc.text(fmtDscr(data.dscrByYear[i].normalized), innerX + labelW + yearW * i, normY, {
      width: yearW,
      align: "center",
      lineBreak: false,
    });
  }

  doc.font("Helvetica-Oblique").fontSize(6.5).fillColor(BRAND.gray);
  doc.text(
    "Normalized = founder comp at market rate (lender-primary view).",
    innerX,
    normY + 16,
    { width: innerW, lineBreak: false },
  );

  const noteY = normY + 30;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.darkGray);
  doc.text("Cash Runway", innerX, noteY, { width: innerW });
  doc.font("Helvetica-Bold").fontSize(18).fillColor(BRAND.navy);
  doc.text(
    `${data.cashRunwayMonths.toFixed(1)} months`,
    innerX,
    noteY + 12,
    { width: innerW },
  );
}

function drawRunwayBreakevenCard(
  doc: PDFDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  data: LenderSummaryData,
): void {
  const cap = data.maxCapacity;
  const title = cap
    ? `Break-Even & Utilization (cap ${cap})`
    : "Break-Even Students by Year";
  drawCardFrame(doc, x, y, w, h, title);

  const innerX = x + 10;
  let rowY = y + 24;
  doc.font("Helvetica-Bold").fontSize(7).fillColor(BRAND.gray);
  doc.text("Year", innerX, rowY, { width: 36, lineBreak: false });
  doc.text("Planned", innerX + 36, rowY, { width: 56, lineBreak: false });
  doc.text("Break-Even", innerX + 92, rowY, { width: 64, lineBreak: false });
  doc.text("Utilization", innerX + 156, rowY, {
    width: w - 166,
    align: "right",
    lineBreak: false,
  });
  rowY += 11;
  doc.save();
  doc.moveTo(innerX, rowY).lineTo(innerX + w - 20, rowY).strokeColor(BRAND.lightGray).lineWidth(0.5).stroke();
  doc.restore();
  rowY += 3;

  for (const be of data.breakEven) {
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
    doc.text(`Y${be.year}`, innerX, rowY, { width: 36, lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.black);
    doc.text(`${be.plannedEnrollment}`, innerX + 36, rowY, { width: 56, lineBreak: false });
    const beStr = be.breakEvenStudents === null ? "N/A" : `${be.breakEvenStudents}`;
    doc.text(beStr, innerX + 92, rowY, { width: 64, lineBreak: false });
    const util = fmtUtil(be.utilization);
    const utilColor =
      be.utilization === null
        ? BRAND.gray
        : be.utilization > 1
          ? BRAND.red
          : be.utilization > 0.85
            ? BRAND.amber
            : BRAND.green;
    doc.fillColor(utilColor).font("Helvetica-Bold");
    doc.text(util, innerX + 156, rowY, {
      width: w - 166,
      align: "right",
      lineBreak: false,
    });
    rowY += 12;
  }
}

function drawRevenueMix(
  doc: PDFDoc,
  x: number,
  y: number,
  w: number,
  mix: LenderSummaryData["revenueQualityY1"],
): void {
  const shares: BucketShares = {
    contracted: mix.contractedPct,
    projected: mix.projectedPct,
    policyDependent: mix.policyDependentPct,
    donorDependent: mix.donorDependentPct,
  };

  doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.navy);
  doc.text("Year 1 Revenue Quality Mix", x, y, { width: w });
  const barY = y + 14;
  const barH = 14;

  let cursor = x;
  const total = shares.contracted + shares.projected + shares.policyDependent + shares.donorDependent;
  if (total <= 0) {
    doc.save();
    doc.rect(x, barY, w, barH).fill(BRAND.lightGray);
    doc.restore();
  } else {
    (Object.keys(shares) as Array<keyof BucketShares>).forEach((bucket) => {
      const segW = (shares[bucket] / total) * w;
      if (segW <= 0) return;
      doc.save();
      doc.rect(cursor, barY, segW, barH).fill(BUCKET_COLORS[bucket]);
      doc.restore();
      cursor += segW;
    });
  }

  // Legend row directly under the bar — color swatch + label + percent.
  const legendY = barY + barH + 4;
  const cellW = w / 4;
  let cx = x;
  (Object.keys(shares) as Array<keyof BucketShares>).forEach((bucket) => {
    doc.save();
    doc.rect(cx, legendY + 2, 7, 7).fill(BUCKET_COLORS[bucket]);
    doc.restore();
    doc.font("Helvetica").fontSize(7).fillColor(BRAND.darkGray);
    doc.text(`${BUCKET_LABELS[bucket]} ${fmtPct(shares[bucket])}`, cx + 11, legendY + 1, {
      width: cellW - 14,
      lineBreak: false,
    });
    cx += cellW;
  });
  doc.y = legendY + 14;
}

function drawTopRisks(
  doc: PDFDoc,
  x: number,
  y: number,
  w: number,
  risks: LenderSummaryData["topRisks"],
): void {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.navy);
  doc.text("Top Risks & Mitigants", x, y, { width: w });
  let cursorY = y + 14;

  if (risks.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.gray);
    doc.text("No critical or high-severity issues identified.", x, cursorY, {
      width: w,
    });
    doc.y = cursorY + 12;
    return;
  }

  for (const r of risks) {
    const color = SEVERITY_COLORS[r.severity];
    doc.save();
    doc.rect(x, cursorY, 3, 28).fill(color);
    doc.restore();
    const innerX = x + 8;
    const innerW = w - 8;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(color);
    doc.text(r.severity.toUpperCase(), innerX, cursorY, {
      width: 50,
      lineBreak: false,
      continued: true,
    });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.navy);
    doc.text(`  ${r.risk}`, { width: innerW - 50, lineBreak: false });
    doc.font("Helvetica").fontSize(7.5).fillColor(BRAND.darkGray);
    doc.text(`Mitigant: ${r.mitigant}`, innerX, cursorY + 11, {
      width: innerW,
      height: 18,
      ellipsis: true,
    });
    cursorY += 32;
  }
  doc.y = cursorY;
}

function drawKeyAssumptions(
  doc: PDFDoc,
  x: number,
  y: number,
  w: number,
  rows: LenderSummaryData["keyAssumptions"],
): void {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.navy);
  doc.text("Key Assumptions (with wizard step source)", x, y, { width: w });
  let cursorY = y + 14;

  // Header row.
  doc.save();
  doc.rect(x, cursorY, w, 14).fill(BRAND.lightGray);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(7).fillColor(BRAND.navy);
  doc.text("Assumption", x + 6, cursorY + 4, { width: w * 0.45, lineBreak: false });
  doc.text("Value", x + 6 + w * 0.45, cursorY + 4, {
    width: w * 0.25,
    align: "right",
    lineBreak: false,
  });
  doc.text("Wizard Step", x + 6 + w * 0.7, cursorY + 4, {
    width: w * 0.3 - 12,
    align: "right",
    lineBreak: false,
  });
  cursorY += 16;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (i % 2 === 1) {
      doc.save();
      doc.rect(x, cursorY - 2, w, 13).fill("#F8FAFC");
      doc.restore();
    }
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.black);
    doc.text(r.label, x + 6, cursorY, { width: w * 0.45, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.navy);
    doc.text(r.value, x + 6 + w * 0.45, cursorY, {
      width: w * 0.25,
      align: "right",
      lineBreak: false,
    });
    doc.font("Helvetica").fontSize(7.5).fillColor(BRAND.darkGray);
    doc.text(`Step ${r.stepNumber} · ${r.stepTitle}`, x + 6 + w * 0.7, cursorY + 0.5, {
      width: w * 0.3 - 12,
      align: "right",
      lineBreak: false,
    });
    cursorY += 12;
  }
  doc.y = cursorY + 4;
}
