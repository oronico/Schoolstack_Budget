import {
  createDoc, drawHeader, sectionTitle, subSection, bodyText,
  drawTable, drawFooter, docToBuffer, statusBadge, labelValue,
  fmtCurrency, ensureSpace,
  type PDFDoc, type TableColumn, BRAND,
} from "../pdf-utils.js";
import type { LenderPacket, RiskMitigant } from "./build-lender-packet";
import type { PacketSection, PacketTable, LinkedMetric } from "./packet-types";

export async function generateLenderPacketPDF(packet: LenderPacket): Promise<Buffer> {
  const doc = createDoc();

  drawCoverPage(doc, packet);
  doc.addPage();

  for (const section of packet.sections) {
    if (!section.included) continue;
    if (section.id === "cover") continue;

    renderSection(doc, section, packet);
  }

  drawFooter(doc);
  return docToBuffer(doc);
}

function drawCoverPage(doc: PDFDoc, packet: LenderPacket) {
  const pageW = doc.page.width;
  const margin = doc.page.margins.left;
  const contentW = pageW - margin * 2;

  doc.save();
  doc.rect(0, 0, pageW, 120).fill(BRAND.navy);
  doc.font("Helvetica-Bold").fontSize(24).fillColor(BRAND.white);
  doc.text("SchoolStack Budget", margin, 30, { width: contentW });
  doc.font("Helvetica").fontSize(11).fillColor(BRAND.gray);
  doc.text("Lender-Ready Financial Packet", margin, 60);
  doc.restore();

  doc.y = 150;

  doc.font("Helvetica-Bold").fontSize(28).fillColor(BRAND.navy);
  doc.text(packet.schoolName, margin, doc.y, { width: contentW, align: "center" });
  doc.moveDown(0.8);

  doc.font("Helvetica").fontSize(12).fillColor(BRAND.darkGray);
  doc.text("5-Year Financial Model", { align: "center" });
  doc.moveDown(0.3);
  doc.text(`Prepared ${new Date(packet.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });
  doc.moveDown(2);

  statusBadge(doc, `Lender Readiness: ${packet.lenderReadiness.status}`, packet.lenderReadiness.status);
  doc.moveDown(0.5);
  bodyText(doc, packet.lenderReadiness.explanation);

  doc.moveDown(1.5);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.navy);
  doc.text("Packet Contents", margin, doc.y);
  doc.moveDown(0.5);

  const includedSections = packet.sections.filter((s) => s.included && s.id !== "cover");
  for (let i = 0; i < includedSections.length; i++) {
    const s = includedSections[i];
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
    doc.text(`${i + 1}.  ${s.title}`, margin + 10, doc.y, { width: contentW - 20 });
    doc.moveDown(0.15);
  }

  doc.moveDown(1);
  doc.font("Helvetica").fontSize(8).fillColor(BRAND.gray);
  doc.text("This packet is generated from the school's financial model and is intended for lender review.", { align: "center" });
  doc.text("All projections are based on assumptions entered by the school founder.", { align: "center" });
}

function renderSection(doc: PDFDoc, section: PacketSection, packet: LenderPacket) {
  sectionTitle(doc, section.title);

  if (section.narrative) {
    bodyText(doc, section.narrative);
  }

  if (section.linkedMetrics.length > 0) {
    renderMetrics(doc, section.linkedMetrics);
  }

  if (section.id === "key_risks" && packet.riskMitigants.length > 0) {
    renderRiskMitigants(doc, packet.riskMitigants);
    if (section.linkedMetrics.length > 0) {
      renderMetrics(doc, section.linkedMetrics);
    }
    drawFooterNote(doc, "See Appendix for complete assumption details.");
    return;
  }

  if (section.id === "debt_service" && packet.dscrSummary) {
    doc.moveDown(0.3);
    subSection(doc, "DSCR Summary");
    labelValue(doc, "Current DSCR:", packet.dscrSummary.currentDSCR);
    labelValue(doc, "Benchmark:", packet.dscrSummary.benchmark);
    labelValue(doc, "Trend:", packet.dscrSummary.trendDescription);
    doc.moveDown(0.3);
  }

  if (section.tables && section.tables.length > 0) {
    for (const table of section.tables) {
      renderTable(doc, table);
    }
  }

  if (section.linkedAssumptions.length > 0 && shouldShowAssumptions(section.id)) {
    doc.moveDown(0.3);
    subSection(doc, "Supporting Assumptions");
    for (const a of section.linkedAssumptions.slice(0, 10)) {
      labelValue(doc, a.label, a.value);
    }
    if (section.linkedAssumptions.length > 10) {
      doc.font("Helvetica").fontSize(8).fillColor(BRAND.gray);
      doc.text(`  ... and ${section.linkedAssumptions.length - 10} more (see Appendix)`);
    }
    doc.moveDown(0.3);
  }
}

function shouldShowAssumptions(sectionId: string): boolean {
  return ["school_overview", "enrollment_plan", "revenue_model", "staffing_plan", "capital_debt", "appendix_assumptions"].includes(sectionId);
}

function renderMetrics(doc: PDFDoc, metrics: LinkedMetric[]) {
  ensureSpace(doc, 30);
  const displayMetrics = metrics.slice(0, 8);

  for (const m of displayMetrics) {
    const statusIcon = m.status === "good" ? "+" : m.status === "danger" ? "!" : m.status === "warning" ? "~" : " ";
    const statusColor = m.status === "good" ? BRAND.green : m.status === "danger" ? BRAND.red : m.status === "warning" ? BRAND.amber : BRAND.darkGray;

    ensureSpace(doc, 16);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(statusColor);
    doc.text(`[${statusIcon}] `, doc.page.margins.left, doc.y, { continued: true });
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
    doc.text(`${m.label}: ${m.value}${m.benchmark ? ` (benchmark: ${m.benchmark})` : ""}`);
  }
  doc.moveDown(0.3);
}

function renderRiskMitigants(doc: PDFDoc, riskMitigants: RiskMitigant[]) {
  doc.moveDown(0.3);

  for (const rm of riskMitigants) {
    ensureSpace(doc, 60);

    const severityColor = rm.severity === "critical" ? BRAND.red : rm.severity === "high" ? BRAND.amber : BRAND.darkGray;

    doc.save();
    doc.roundedRect(doc.page.margins.left, doc.y, 4, 40, 1).fill(severityColor);
    doc.restore();

    const indent = doc.page.margins.left + 12;
    const w = doc.page.width - doc.page.margins.right - indent;

    doc.font("Helvetica-Bold").fontSize(9).fillColor(severityColor);
    doc.text(`${rm.severity.toUpperCase()}`, indent, doc.y);

    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.navy);
    doc.text(rm.risk, indent, doc.y, { width: w });

    doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
    doc.text(rm.whyItMatters, indent, doc.y, { width: w });

    if (rm.supportingMetrics.length > 0) {
      doc.font("Helvetica").fontSize(7).fillColor(BRAND.gray);
      const evidence = rm.supportingMetrics.map((sm) => `${sm.label}: ${sm.value}`).join("  |  ");
      doc.text(`Evidence: ${evidence}`, indent, doc.y, { width: w });
    }

    doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.teal);
    doc.text("Mitigation: ", indent, doc.y, { continued: true, width: w });
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.black);
    doc.text(rm.mitigant, { width: w - 60 });

    doc.moveDown(0.5);
  }
}

function drawFooterNote(doc: PDFDoc, text: string) {
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(7).fillColor(BRAND.gray);
  doc.text(text, doc.page.margins.left, doc.y, { align: "left" });
  doc.moveDown(0.3);
}

function renderTable(doc: PDFDoc, table: PacketTable) {
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
