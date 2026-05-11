/**
 * Task #615 — One-page (landscape) "Lender Summary" Excel tab.
 *
 * Single worksheet that mirrors the lender-summary PDF page: verdict,
 * DSCR by year, runway, break-even + utilization, revenue quality mix,
 * top-3 risks + mitigants, and key assumptions with wizard-step source.
 * The page is configured to print to one landscape page so a lender can
 * print it directly without re-formatting.
 */
import type ExcelJS from "exceljs";
import {
  NAVY,
  WHITE,
  HEADER_FILL,
  GREEN_BG,
  AMBER_BG,
  RED_BG,
  BORDER,
  CUR,
  PCT,
  NUM,
  BENCHMARK_DSCR_GREEN,
  BENCHMARK_DSCR_AMBER,
} from "../workbook-helpers.js";
import type { LenderSummaryData } from "./build-lender-summary.js";
import { lenderReadinessCoachingHeadline } from "../lender-readiness-coaching.js";

const TITLE_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 16,
  bold: true,
  color: { argb: NAVY },
};
const SECTION_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11,
  bold: true,
  color: { argb: WHITE },
};
const LABEL_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 10,
  color: { argb: "FF374151" },
};
const VALUE_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 10,
  color: { argb: "FF1E293B" },
};
const BIG_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 14,
  bold: true,
  color: { argb: NAVY },
};

function dscrFill(v: number | null): ExcelJS.Fill {
  if (v === null || !Number.isFinite(v)) {
    return { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
  }
  const argb =
    v >= BENCHMARK_DSCR_GREEN
      ? GREEN_BG
      : v >= BENCHMARK_DSCR_AMBER
        ? AMBER_BG
        : RED_BG;
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function utilFill(u: number | null): ExcelJS.Fill {
  const argb =
    u === null
      ? "FFEEEEEE"
      : u > 1
        ? RED_BG
        : u > 0.85
          ? AMBER_BG
          : GREEN_BG;
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function verdictFill(status: LenderSummaryData["verdict"]["status"]): ExcelJS.Fill {
  const argb =
    status === "Strong" ? GREEN_BG : status === "Needs Work" ? AMBER_BG : RED_BG;
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function sectionRow(ws: ExcelJS.Worksheet, row: number, span: string, label: string): void {
  ws.mergeCells(`${span.split(":")[0].replace(/\d+/, String(row))}:${span.split(":")[1].replace(/\d+/, String(row))}`);
  const cell = ws.getCell(`${span.split(":")[0].replace(/\d+/, String(row))}`);
  cell.value = label;
  cell.fill = HEADER_FILL;
  cell.font = SECTION_FONT;
  cell.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(row).height = 22;
}

export function buildLenderSummarySheet(
  wb: ExcelJS.Workbook,
  data: LenderSummaryData,
): void {
  const ws = wb.addWorksheet("Lender Summary", {
    properties: { tabColor: { argb: NAVY } },
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      // 1 == Letter — exceljs accepts the numeric PaperSize enum value.
      paperSize: 1 as unknown as ExcelJS.PaperSize,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  // 11 columns total — matches the DSCR row (label + 5 years + 5 break-even cells).
  // Widths chosen so the whole layout fits one landscape Letter page.
  const widths = [3, 26, 12, 12, 12, 12, 12, 16, 18, 22, 3];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // ── Title row ───────────────────────────────────────────────────────────
  ws.mergeCells("B2:J2");
  const title = ws.getCell("B2");
  title.value = `Lender Summary — ${data.schoolName}`;
  title.font = TITLE_FONT;
  title.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(2).height = 22;

  ws.mergeCells("B3:J3");
  const subtitle = ws.getCell("B3");
  subtitle.value = `Generated ${data.generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · SchoolStack Budget`;
  subtitle.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF6B7280" } };

  // ── Verdict row ─────────────────────────────────────────────────────────
  // Task #755 — surface the same coaching phrasing the in-app Consultant
  // view and the lender packet PDF show ("Ready to share — keep polishing
  // the narrative.") instead of leaking the raw verdict noun ("Strong" /
  // "Needs Work" / "Not Yet Ready") into the workbook cell. The coaching
  // helper is shared with excel-export.ts, the loan-readiness PDF, the
  // lender-summary PDF, and the mailer so every founder-facing surface
  // reads the same phrasing.
  const verdictRow = 5;
  ws.getCell(`B${verdictRow}`).value = "Lender Verdict";
  ws.getCell(`B${verdictRow}`).font = { ...LABEL_FONT, bold: true };
  ws.mergeCells(`C${verdictRow}:J${verdictRow}`);
  const verdictHeadlineCell = ws.getCell(`C${verdictRow}`);
  verdictHeadlineCell.value = lenderReadinessCoachingHeadline(data.verdict.status);
  verdictHeadlineCell.font = { ...VALUE_FONT, bold: true };
  verdictHeadlineCell.fill = verdictFill(data.verdict.status);
  verdictHeadlineCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  ws.getRow(verdictRow).height = 24;
  // Supporting one-liner sits directly underneath the coaching headline,
  // mirroring the lender-summary PDF layout (headline + small explanatory
  // line below).
  const verdictLineRow = verdictRow + 1;
  ws.mergeCells(`C${verdictLineRow}:J${verdictLineRow}`);
  const verdictLine = ws.getCell(`C${verdictLineRow}`);
  verdictLine.value = data.verdict.line;
  verdictLine.font = VALUE_FONT;
  verdictLine.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  ws.getRow(verdictLineRow).height = 22;

  // ── DSCR by Year ────────────────────────────────────────────────────────
  const dscrSectionRow = 7;
  ws.mergeCells(`B${dscrSectionRow}:J${dscrSectionRow}`);
  const dscrSection = ws.getCell(`B${dscrSectionRow}`);
  dscrSection.value = "DEBT SERVICE COVERAGE BY YEAR";
  dscrSection.fill = HEADER_FILL;
  dscrSection.font = SECTION_FONT;
  ws.getRow(dscrSectionRow).height = 20;

  const dscrHdrRow = dscrSectionRow + 1;
  ws.getCell(`B${dscrHdrRow}`).value = "Year";
  ws.getCell(`B${dscrHdrRow}`).font = { ...LABEL_FONT, bold: true };
  for (let i = 0; i < data.dscrByYear.length; i++) {
    const c = ws.getCell(dscrHdrRow, 3 + i);
    c.value = `Year ${data.dscrByYear[i].year}`;
    c.font = { ...LABEL_FONT, bold: true };
    c.alignment = { horizontal: "center" };
  }

  // Planned (as-planned) DSCR row.
  const dscrPlannedRow = dscrHdrRow + 1;
  ws.getCell(`B${dscrPlannedRow}`).value = "DSCR — Planned";
  ws.getCell(`B${dscrPlannedRow}`).font = { ...LABEL_FONT, bold: true };
  for (let i = 0; i < data.dscrByYear.length; i++) {
    const cell = ws.getCell(dscrPlannedRow, 3 + i);
    const dscr = data.dscrByYear[i].planned;
    cell.value = dscr === null || !Number.isFinite(dscr) ? "N/A" : dscr;
    cell.numFmt = "0.00\"x\"";
    cell.font = BIG_FONT;
    cell.alignment = { horizontal: "center" };
    cell.border = BORDER;
    cell.fill = dscrFill(dscr);
  }
  ws.getRow(dscrPlannedRow).height = 20;

  // Normalized (founder-comp at market) DSCR row — lender-primary view.
  const dscrNormRow = dscrPlannedRow + 1;
  ws.getCell(`B${dscrNormRow}`).value = "DSCR — Normalized";
  ws.getCell(`B${dscrNormRow}`).font = { ...LABEL_FONT, bold: true };
  for (let i = 0; i < data.dscrByYear.length; i++) {
    const cell = ws.getCell(dscrNormRow, 3 + i);
    const dscr = data.dscrByYear[i].normalized;
    cell.value = dscr === null || !Number.isFinite(dscr) ? "N/A" : dscr;
    cell.numFmt = "0.00\"x\"";
    cell.font = { ...BIG_FONT, color: { argb: "FF0D9488" } };
    cell.alignment = { horizontal: "center" };
    cell.border = BORDER;
    cell.fill = dscrFill(dscr);
  }
  ws.getRow(dscrNormRow).height = 20;

  // Footnote explaining the two DSCR series.
  const dscrNoteRow = dscrNormRow + 1;
  ws.mergeCells(`B${dscrNoteRow}:H${dscrNoteRow}`);
  const dscrNote = ws.getCell(`B${dscrNoteRow}`);
  dscrNote.value =
    "Normalized = founder compensation marked to market (lender-primary view).";
  dscrNote.font = { name: "Calibri", size: 8, italic: true, color: { argb: "FF6B7280" } };

  // Runway tile (right of DSCR rows).
  ws.getCell(`I${dscrHdrRow}`).value = "Cash Runway";
  ws.getCell(`I${dscrHdrRow}`).font = { ...LABEL_FONT, bold: true };
  ws.getCell(`I${dscrHdrRow}`).alignment = { horizontal: "center" };
  ws.mergeCells(`I${dscrPlannedRow}:J${dscrNormRow}`);
  const runway = ws.getCell(`I${dscrPlannedRow}`);
  runway.value = `${data.cashRunwayMonths.toFixed(1)} months`;
  runway.font = BIG_FONT;
  runway.alignment = { horizontal: "center", vertical: "middle" };
  runway.border = BORDER;

  // ── Break-Even & Utilization ────────────────────────────────────────────
  const beSectionRow = dscrNoteRow + 2;
  ws.mergeCells(`B${beSectionRow}:J${beSectionRow}`);
  const beSec = ws.getCell(`B${beSectionRow}`);
  beSec.value = data.maxCapacity
    ? `BREAK-EVEN STUDENTS & UTILIZATION (max capacity ${data.maxCapacity})`
    : "BREAK-EVEN STUDENTS BY YEAR";
  beSec.fill = HEADER_FILL;
  beSec.font = SECTION_FONT;
  ws.getRow(beSectionRow).height = 20;

  const beHdrRow = beSectionRow + 1;
  const beHeaders = ["Year", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  for (let i = 0; i < beHeaders.length; i++) {
    const c = ws.getCell(beHdrRow, 2 + i);
    c.value = beHeaders[i];
    c.font = { ...LABEL_FONT, bold: true };
    c.alignment = { horizontal: i === 0 ? "left" : "center" };
  }

  const planRow = beHdrRow + 1;
  ws.getCell(`B${planRow}`).value = "Planned Enrollment";
  ws.getCell(`B${planRow}`).font = LABEL_FONT;
  for (let i = 0; i < data.breakEven.length; i++) {
    const c = ws.getCell(planRow, 3 + i);
    c.value = data.breakEven[i].plannedEnrollment;
    c.numFmt = NUM;
    c.font = VALUE_FONT;
    c.alignment = { horizontal: "center" };
    c.border = BORDER;
  }

  const beValRow = planRow + 1;
  ws.getCell(`B${beValRow}`).value = "Break-Even Students";
  ws.getCell(`B${beValRow}`).font = { ...LABEL_FONT, bold: true };
  for (let i = 0; i < data.breakEven.length; i++) {
    const c = ws.getCell(beValRow, 3 + i);
    const v = data.breakEven[i].breakEvenStudents;
    c.value = v === null ? "N/A" : v;
    c.numFmt = NUM;
    c.font = { ...VALUE_FONT, bold: true };
    c.alignment = { horizontal: "center" };
    c.border = BORDER;
  }

  const utilRow = beValRow + 1;
  ws.getCell(`B${utilRow}`).value = "Utilization";
  ws.getCell(`B${utilRow}`).font = LABEL_FONT;
  for (let i = 0; i < data.breakEven.length; i++) {
    const c = ws.getCell(utilRow, 3 + i);
    const u = data.breakEven[i].utilization;
    c.value = u === null ? "—" : u;
    c.numFmt = u === null ? "@" : "0%";
    c.font = VALUE_FONT;
    c.alignment = { horizontal: "center" };
    c.border = BORDER;
    c.fill = utilFill(u);
  }

  // ── Revenue Quality Mix (Year 1) ────────────────────────────────────────
  const rqSectionRow = utilRow + 2;
  ws.mergeCells(`B${rqSectionRow}:J${rqSectionRow}`);
  const rqSec = ws.getCell(`B${rqSectionRow}`);
  rqSec.value = "YEAR 1 REVENUE QUALITY MIX";
  rqSec.fill = HEADER_FILL;
  rqSec.font = SECTION_FONT;
  ws.getRow(rqSectionRow).height = 20;

  const rqHdrRow = rqSectionRow + 1;
  const rqLabels = ["Contracted", "Projected", "Policy-Dependent", "Donor-Dependent"];
  const rqValues = [
    data.revenueQualityY1.contractedPct,
    data.revenueQualityY1.projectedPct,
    data.revenueQualityY1.policyDependentPct,
    data.revenueQualityY1.donorDependentPct,
  ];
  const rqColors = [GREEN_BG, "FFE0F2FE", AMBER_BG, RED_BG];
  for (let i = 0; i < rqLabels.length; i++) {
    const colSpanStart = 2 + i * 2; // B, D, F, H
    const labelCellAddr = `${columnLetter(colSpanStart)}${rqHdrRow}`;
    const valueCellAddr = `${columnLetter(colSpanStart + 1)}${rqHdrRow}`;
    ws.getCell(labelCellAddr).value = rqLabels[i];
    ws.getCell(labelCellAddr).font = { ...LABEL_FONT, bold: true };
    ws.getCell(labelCellAddr).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: rqColors[i] },
    };
    ws.getCell(labelCellAddr).border = BORDER;
    ws.getCell(valueCellAddr).value = rqValues[i];
    ws.getCell(valueCellAddr).numFmt = PCT;
    ws.getCell(valueCellAddr).font = { ...VALUE_FONT, bold: true };
    ws.getCell(valueCellAddr).alignment = { horizontal: "right" };
    ws.getCell(valueCellAddr).border = BORDER;
  }
  ws.getRow(rqHdrRow).height = 18;

  // ── Top Risks & Mitigants ───────────────────────────────────────────────
  const riskSectionRow = rqHdrRow + 2;
  ws.mergeCells(`B${riskSectionRow}:J${riskSectionRow}`);
  const riskSec = ws.getCell(`B${riskSectionRow}`);
  riskSec.value = "TOP RISKS & MITIGANTS";
  riskSec.fill = HEADER_FILL;
  riskSec.font = SECTION_FONT;
  ws.getRow(riskSectionRow).height = 20;

  const riskHdrRow = riskSectionRow + 1;
  ["Severity", "Risk"].forEach((h, i) => {
    const c = ws.getCell(riskHdrRow, 2 + i);
    c.value = h;
    c.font = { ...LABEL_FONT, bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    c.border = BORDER;
  });
  ws.mergeCells(`D${riskHdrRow}:J${riskHdrRow}`);
  const mitHdr = ws.getCell(`D${riskHdrRow}`);
  mitHdr.value = "Mitigant";
  mitHdr.font = { ...LABEL_FONT, bold: true };
  mitHdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
  mitHdr.border = BORDER;

  let nextRow = riskHdrRow + 1;
  if (data.topRisks.length === 0) {
    ws.mergeCells(`B${nextRow}:J${nextRow}`);
    const c = ws.getCell(`B${nextRow}`);
    c.value = "No critical or high-severity issues identified.";
    c.font = { ...LABEL_FONT, italic: true };
    c.alignment = { horizontal: "left" };
    nextRow += 1;
  } else {
    for (const r of data.topRisks) {
      const sevCell = ws.getCell(`B${nextRow}`);
      sevCell.value = r.severity.toUpperCase();
      sevCell.font = {
        ...VALUE_FONT,
        bold: true,
        color: {
          argb:
            r.severity === "critical"
              ? "FFB91C1C"
              : r.severity === "high"
                ? "FFB45309"
                : "FF475569",
        },
      };
      sevCell.alignment = { horizontal: "left" };
      sevCell.border = BORDER;
      const riskCell = ws.getCell(`C${nextRow}`);
      riskCell.value = r.risk;
      riskCell.font = { ...VALUE_FONT, bold: true };
      riskCell.alignment = { wrapText: true };
      riskCell.border = BORDER;
      ws.mergeCells(`D${nextRow}:J${nextRow}`);
      const mitCell = ws.getCell(`D${nextRow}`);
      mitCell.value = r.mitigant;
      mitCell.font = VALUE_FONT;
      mitCell.alignment = { wrapText: true, vertical: "top" };
      mitCell.border = BORDER;
      ws.getRow(nextRow).height = 30;
      nextRow += 1;
    }
  }

  // ── Key Assumptions ─────────────────────────────────────────────────────
  const kaSectionRow = nextRow + 1;
  ws.mergeCells(`B${kaSectionRow}:J${kaSectionRow}`);
  const kaSec = ws.getCell(`B${kaSectionRow}`);
  kaSec.value = "KEY ASSUMPTIONS (with wizard step source)";
  kaSec.fill = HEADER_FILL;
  kaSec.font = SECTION_FONT;
  ws.getRow(kaSectionRow).height = 20;

  const kaHdrRow = kaSectionRow + 1;
  const headerFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEEEEE" },
  };
  ws.mergeCells(`B${kaHdrRow}:E${kaHdrRow}`);
  const asHdr = ws.getCell(`B${kaHdrRow}`);
  asHdr.value = "Assumption";
  asHdr.font = { ...LABEL_FONT, bold: true };
  asHdr.fill = headerFill;
  asHdr.border = BORDER;
  ws.mergeCells(`F${kaHdrRow}:G${kaHdrRow}`);
  const valHdr = ws.getCell(`F${kaHdrRow}`);
  valHdr.value = "Value";
  valHdr.font = { ...LABEL_FONT, bold: true };
  valHdr.alignment = { horizontal: "right" };
  valHdr.fill = headerFill;
  valHdr.border = BORDER;
  ws.mergeCells(`H${kaHdrRow}:J${kaHdrRow}`);
  const stepHdr = ws.getCell(`H${kaHdrRow}`);
  stepHdr.value = "Wizard Step";
  stepHdr.font = { ...LABEL_FONT, bold: true };
  stepHdr.alignment = { horizontal: "right" };
  stepHdr.fill = headerFill;
  stepHdr.border = BORDER;

  let kRow = kaHdrRow + 1;
  for (let i = 0; i < data.keyAssumptions.length; i++) {
    const a = data.keyAssumptions[i];
    ws.mergeCells(`B${kRow}:E${kRow}`);
    const labelC = ws.getCell(`B${kRow}`);
    labelC.value = a.label;
    labelC.font = VALUE_FONT;
    labelC.border = BORDER;
    if (i % 2 === 1) {
      labelC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    }
    ws.mergeCells(`F${kRow}:G${kRow}`);
    const valC = ws.getCell(`F${kRow}`);
    valC.value = a.value;
    valC.font = { ...VALUE_FONT, bold: true };
    valC.alignment = { horizontal: "right" };
    valC.border = BORDER;
    if (i % 2 === 1) {
      valC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    }
    ws.mergeCells(`H${kRow}:J${kRow}`);
    const stepC = ws.getCell(`H${kRow}`);
    stepC.value = `Step ${a.stepNumber} · ${a.stepTitle}`;
    stepC.font = { name: "Calibri", size: 9, color: { argb: "FF6B7280" } };
    stepC.alignment = { horizontal: "right" };
    stepC.border = BORDER;
    if (i % 2 === 1) {
      stepC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    }
    kRow += 1;
  }

  // Footer note.
  const footerRow = kRow + 1;
  ws.mergeCells(`B${footerRow}:J${footerRow}`);
  const fc = ws.getCell(`B${footerRow}`);
  fc.value =
    "All figures generated by the SchoolStack canonical engine — same source as the dashboard and detailed packet.";
  fc.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF6B7280" } };
  fc.alignment = { horizontal: "center" };

  ws.pageSetup.printArea = `A1:K${footerRow}`;
  void CUR;
}

// Maps a 1-indexed column number to its letter (handles A–Z; we only use A–K).
function columnLetter(col: number): string {
  return String.fromCharCode(64 + col);
}
