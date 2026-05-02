import {
  createDoc, drawHeader, sectionTitle, subSection, bodyText,
  drawTable, drawFooter, docToBuffer, statusBadge, labelValue,
  ensureSpace,
  renderDecisionHistorySection,
  renderPacketTable, renderPacketInsights, renderLinkedMetrics,
  type PDFDoc, type TableColumn, BRAND,
} from "../pdf-utils.js";
import type { BoardPacket, BoardRiskItem, BoardFocusArea, ScenarioSnapshot, CashRunwayView, BoardNarrativeData, BoardFlaggedAssumption } from "./build-board-packet";
import type { PacketSection, LinkedMetric } from "./packet-types";
import { renderForecastAccuracySection } from "./forecast-accuracy-pdf.js";

export async function generateBoardPacketPDF(packet: BoardPacket): Promise<Buffer> {
  const doc = createDoc();

  drawCoverPage(doc, packet);
  doc.addPage();

  drawOutlookSection(doc, packet);

  renderBoardNarrativeSection(doc, packet.boardNarrative, packet.boardFlaggedAssumptions);

  for (const section of packet.sections) {
    if (!section.included) continue;
    if (section.id === "cover") continue;
    if (section.id === "key_risks") {
      renderRisksSection(doc, packet.topRisks, section);
      continue;
    }
    if (section.id === "board_action_items") {
      renderFocusAreas(doc, packet.focusAreas, section);
      continue;
    }
    if (section.id === "cash_flow") {
      renderCashRunway(doc, packet.cashRunway, section);
      continue;
    }
    if (section.id === "decision_history") {
      renderDecisionHistorySection(doc, section, packet.decisionHistory, {
        emptyStateHint:
          "Once decisions are saved with a Pursued / Declined / On hold outcome inside the planner, they will be summarized here for the board.",
      });
      continue;
    }

    renderSection(doc, section);
  }

  if (packet.scenarioSnapshots.length > 0) {
    renderScenarioComparison(doc, packet.scenarioSnapshots);
  }

  // Forecast accuracy roll-up for the board: shows projected vs. actual on
  // the decisions we pursued so trustees can calibrate confidence in the
  // current forecast. Omitted entirely when there are no comparable
  // scenarios — boards don't need a "no data" placeholder cluttering the
  // packet.
  renderForecastAccuracySection(
    doc,
    packet.forecastAccuracy,
    "board",
    true,
    packet.forecastAccuracyFilter,
    packet.forecastAccuracyUnfilteredCount,
  );

  drawFooter(doc);
  return docToBuffer(doc);
}

function drawCoverPage(doc: PDFDoc, packet: BoardPacket) {
  const pageW = doc.page.width;
  const margin = doc.page.margins.left;
  const contentW = pageW - margin * 2;

  doc.save();
  doc.rect(0, 0, pageW, 100).fill(BRAND.navy);
  doc.font("Helvetica-Bold").fontSize(22).fillColor(BRAND.white);
  doc.text("SchoolStack Budget", margin, 25, { width: contentW });
  doc.font("Helvetica").fontSize(11).fillColor(BRAND.gray);
  doc.text("Board Financial Summary", margin, 52);
  doc.restore();

  doc.y = 130;

  doc.font("Helvetica-Bold").fontSize(26).fillColor(BRAND.navy);
  doc.text(packet.schoolName, margin, doc.y, { width: contentW, align: "center" });
  doc.moveDown(0.6);

  doc.font("Helvetica").fontSize(12).fillColor(BRAND.darkGray);
  doc.text("5-Year Financial Overview for Board Review", { align: "center" });
  doc.moveDown(0.3);
  doc.text(`Prepared ${new Date(packet.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });
  doc.moveDown(2);

  const outlookColor = packet.financialOutlook.status === "healthy" ? "Strong"
    : packet.financialOutlook.status === "watch" ? "Needs Work" : "Not Yet Ready";
  statusBadge(doc, `Financial Outlook: ${packet.financialOutlook.headline}`, outlookColor as any);
  doc.moveDown(0.5);
  bodyText(doc, packet.financialOutlook.summary);

  doc.moveDown(1.5);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND.navy);
  doc.text("In This Report", margin, doc.y);
  doc.moveDown(0.5);

  const items = [
    "Financial Overview & Key Metrics",
    "5-Year Projection",
    "What to Watch (Top Risks)",
    "Cash & Runway Position",
    ...(packet.scenarioSnapshots.length > 0 ? ["Scenario Comparison"] : []),
    "Recommended Next Steps",
  ];

  for (let i = 0; i < items.length; i++) {
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
    doc.text(`${i + 1}.  ${items[i]}`, margin + 10, doc.y, { width: contentW - 20 });
    doc.moveDown(0.15);
  }

  doc.moveDown(1);
  doc.font("Helvetica").fontSize(8).fillColor(BRAND.gray);
  doc.text("This summary is generated from the school's financial model for board discussion purposes.", { align: "center" });
}

function drawOutlookSection(doc: PDFDoc, packet: BoardPacket) {
  sectionTitle(doc, "Financial Outlook at a Glance");

  const outlook = packet.financialOutlook;
  bodyText(doc, `${outlook.headline} ${outlook.summary}`);

  if (packet.cashRunway.runwayMonths > 0) {
    doc.moveDown(0.2);
    const cash = packet.cashRunway;
    const cashStatus = cash.status === "good" ? "Strong" : cash.status === "warning" ? "Needs Work" : "Not Yet Ready";
    statusBadge(doc, `Cash Position: ${cash.runwayLabel}`, cashStatus as any);
  }
  doc.moveDown(0.3);
}

function renderRisksSection(doc: PDFDoc, risks: BoardRiskItem[], section: PacketSection) {
  sectionTitle(doc, section.title || "What to Watch");

  if (risks.length === 0) {
    bodyText(doc, "No significant financial risks have been identified at this time.");
    return;
  }

  bodyText(doc, `The board should be aware of ${risks.length} key area${risks.length > 1 ? "s" : ""}:`);

  for (let i = 0; i < risks.length; i++) {
    const risk = risks[i];
    ensureSpace(doc, 50);

    const indent = doc.page.margins.left + 8;
    const w = doc.page.width - doc.page.margins.right - indent;

    const severityColor = risk.severity === "critical" ? BRAND.red : risk.severity === "high" ? BRAND.amber : BRAND.darkGray;

    doc.font("Helvetica-Bold").fontSize(10).fillColor(severityColor);
    doc.text(`${i + 1}. ${risk.risk}`, indent, doc.y, { width: w });

    doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
    doc.text(risk.plainLanguage, indent + 12, doc.y, { width: w - 12 });

    doc.font("Helvetica-Bold").fontSize(8).fillColor(BRAND.teal);
    doc.text("Action: ", indent + 12, doc.y, { continued: true, width: w - 12 });
    doc.font("Helvetica").fontSize(8).fillColor(BRAND.black);
    doc.text(risk.suggestedAction, { width: w - 50 });

    doc.moveDown(0.4);
  }
}

function renderFocusAreas(doc: PDFDoc, areas: BoardFocusArea[], section: PacketSection) {
  sectionTitle(doc, section.title || "Recommended Next Steps");

  if (areas.length === 0) {
    bodyText(doc, "Continue developing the financial model and monitoring key metrics.");
    return;
  }

  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];
    ensureSpace(doc, 40);

    const indent = doc.page.margins.left + 8;
    const w = doc.page.width - doc.page.margins.right - indent;
    const priorityColor = area.priority === "high" ? BRAND.amber : BRAND.darkGray;

    doc.font("Helvetica-Bold").fontSize(10).fillColor(priorityColor);
    doc.text(`${i + 1}. ${area.title}`, indent, doc.y, { width: w });

    doc.font("Helvetica").fontSize(9).fillColor(BRAND.darkGray);
    doc.text(area.description, indent + 12, doc.y, { width: w - 12 });

    doc.font("Helvetica").fontSize(8).fillColor(BRAND.teal);
    doc.text(area.impact, indent + 12, doc.y, { width: w - 12 });

    doc.moveDown(0.4);
  }
}

function renderCashRunway(doc: PDFDoc, cash: CashRunwayView, section: PacketSection) {
  sectionTitle(doc, "Cash & Runway Position");

  const cashStatus = cash.status === "good" ? "Strong" : cash.status === "warning" ? "Needs Work" : "Not Yet Ready";
  statusBadge(doc, cash.runwayLabel, cashStatus as any);
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

    if (cash.troughCallout) {
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
    }
  }
}

function renderScenarioComparison(doc: PDFDoc, snapshots: ScenarioSnapshot[]) {
  sectionTitle(doc, "Scenario Comparison");

  bodyText(doc, `The model includes ${snapshots.length} scenario${snapshots.length > 1 ? "s" : ""} showing how changes in key assumptions affect Year 5 outcomes.`);

  const cols: TableColumn[] = [
    { header: "Scenario", width: 160 },
    { header: "Y5 Revenue", width: 110, align: "right" },
    { header: "Y5 Net Income", width: 110, align: "right" },
    { header: "Y5 Margin", width: 80, align: "right" },
  ];

  const rows = snapshots.map((s) => [s.name, s.y5Revenue, s.y5NetIncome, s.y5Margin]);
  drawTable(doc, cols, rows, { zebra: true });
}

function renderBoardNarrativeSection(doc: PDFDoc, narrative: BoardNarrativeData, flaggedAssumptions: BoardFlaggedAssumption[]) {
  const sections: Array<[string, string | undefined]> = [
    ["Enrollment Strategy", narrative.enrollmentStrategy],
    ["Retention Plan", narrative.retentionPlan],
    ["Risk Mitigation", narrative.riskMitigation],
    ["Mission & Vision", narrative.missionAndVision],
  ];
  const hasContent = sections.some(([, text]) => text?.trim());
  const hasFlags = flaggedAssumptions.length > 0;
  if (!hasContent && !hasFlags) return;

  sectionTitle(doc, "Founder's Narrative");
  for (const [label, text] of sections) {
    if (!text?.trim()) continue;
    ensureSpace(doc, 30);
    subSection(doc, label);
    bodyText(doc, text);
    doc.moveDown(0.2);
  }

  if (hasFlags) {
    ensureSpace(doc, 30);
    subSection(doc, "Flagged Assumptions");
    for (const fa of flaggedAssumptions) {
      ensureSpace(doc, 25);
      const color = fa.severity === "critical" ? BRAND.red : BRAND.amber;
      const label = fa.severity.charAt(0).toUpperCase() + fa.severity.slice(1);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(color);
      doc.text(`[${label}] `, doc.page.margins.left, doc.y, { continued: true });
      doc.font("Helvetica").fontSize(8).fillColor(BRAND.black);
      doc.text(fa.description);
      if (fa.explanation) {
        doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
        doc.text(`  Response: ${fa.explanation}`, doc.page.margins.left + 10, doc.y, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 10,
        });
      }
      doc.moveDown(0.15);
    }
  }
  doc.moveDown(0.3);
}

function renderSection(doc: PDFDoc, section: PacketSection) {
  sectionTitle(doc, section.title);

  if (section.narrative) {
    bodyText(doc, section.narrative);
  }

  if (section.insights && section.insights.length > 0) {
    renderPacketInsights(doc, section.insights);
  }

  if (section.linkedMetrics.length > 0) {
    renderMetrics(doc, section.linkedMetrics);
  }

  if (section.tables && section.tables.length > 0) {
    for (const table of section.tables) {
      renderPacketTable(doc, table);
    }
  }
}

function renderMetrics(doc: PDFDoc, metrics: LinkedMetric[]) {
  renderLinkedMetrics(doc, metrics, { limit: 6 });
}
