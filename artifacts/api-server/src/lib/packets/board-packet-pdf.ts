import {
  createDoc, drawHeader, sectionTitle, subSection, bodyText,
  drawTable, drawFooter, docToBuffer, statusBadge, labelValue,
  ensureSpace,
  renderDecisionHistorySection,
  renderPacketTable, renderPacketInsights, renderLinkedMetrics,
  drawActualVsProjectedPill,
  type PDFDoc, type TableColumn, BRAND,
} from "../pdf-utils.js";
import { financialOutlookBadgeLabel, type BoardPacket, type BoardRiskItem, type BoardFocusArea, type ScenarioSnapshot, type BoardNarrativeData, type BoardFlaggedAssumption, type BoardRecruitingProjections } from "./build-board-packet.js";
import type { CashRunwayView } from "./build-cash-runway";
import type { PacketSection, LinkedMetric } from "./packet-types";
import { renderForecastAccuracySection } from "./forecast-accuracy-pdf.js";
import { cashStatusBadgeLabel, renderCashRunwaySection } from "./cash-runway-pdf.js";
import { renderNarrativeCommentarySection } from "./lender-packet-pdf.js";
import { buildFounderSummary, type FounderSummary } from "./build-founder-summary.js";
import type { ConsultantOutput } from "../consultant-engine.js";
import type { ModelData } from "../workbook-helpers.js";

export async function generateBoardPacketPDF(
  packet: BoardPacket,
  founderSummary?: FounderSummary,
): Promise<Buffer> {
  const doc = createDoc();

  drawCoverPage(doc, packet);
  doc.addPage();

  // Task #660 - Plain-English founder summary leads the body of the
  // packet as a STANDALONE one-pager when supplied. Same canonical
  // engine that powers the in-app /summary route, so trustees see the
  // same six sections the founder reviewed. Wrapped in explicit page
  // boundaries so a board / funder reader can detach this single page
  // and share it without any other packet content trailing it.
  if (founderSummary) {
    renderFounderSummarySection(doc, founderSummary);
    doc.addPage();
  }

  // Task #617 - board-ready narrative commentary leads the body of the
  // packet. Same canonical-engine bundle the lender commentary uses, so
  // the two narratives can never disagree on a number.
  renderNarrativeCommentarySection(
    doc,
    "Board Commentary",
    packet.boardCommentary,
  );

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
      renderCashRunwaySection(doc, packet.cashRunway, section.title || "Cash & Runway Position");
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

  if (packet.recruitingProjections) {
    renderRecruitingProjections(doc, packet.recruitingProjections);
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

export function drawCoverPage(doc: PDFDoc, packet: BoardPacket) {
  const pageW = doc.page.width;
  const margin = doc.page.margins.left;
  const contentW = pageW - margin * 2;

  doc.save();
  doc.rect(0, 0, pageW, 100).fill(BRAND.navy);
  doc.font("Helvetica-Bold").fontSize(22).fillColor(BRAND.white);
  doc.text("SchoolStack Budget", margin, 25, { width: contentW });
  doc.font("Helvetica").fontSize(11).fillColor(BRAND.gray);
  doc.text("Board and Funder Summary", margin, 52);
  doc.restore();

  doc.y = 130;

  doc.font("Helvetica-Bold").fontSize(26).fillColor(BRAND.navy);
  doc.text(packet.schoolName, margin, doc.y, { width: contentW, align: "center" });
  doc.moveDown(0.6);

  doc.font("Helvetica").fontSize(12).fillColor(BRAND.darkGray);
  doc.text("5-Year Financial Overview for Board Review", { align: "center" });
  doc.moveDown(0.3);
  doc.text(`Prepared ${new Date(packet.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });
  // Task #657 — provenance label (see lender-packet-pdf.ts).
  doc.moveDown(0.3);
  doc.font("Helvetica-Oblique").fontSize(11).fillColor(BRAND.darkGray);
  doc.text(
    packet.provenance === "actuals" ? "Built from actuals" : "Built from assumptions",
    { align: "center" },
  );
  doc.font("Helvetica").fillColor(BRAND.darkGray);
  doc.moveDown(2);

  statusBadge(
    doc,
    `Financial Outlook: ${packet.financialOutlook.headline}`,
    financialOutlookBadgeLabel(packet.financialOutlook.status),
  );
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

export function drawOutlookSection(doc: PDFDoc, packet: BoardPacket) {
  sectionTitle(doc, "Financial Outlook at a Glance");

  const outlook = packet.financialOutlook;
  // Mirror the cover-page badge so a trustee skimming the section sees the
  // same color cue the cover gave them. Uses `financialOutlookBadgeLabel`
  // (Task #550) so the cover and section can't drift on the status →
  // color mapping. Task #556.
  statusBadge(
    doc,
    `Financial Outlook: ${outlook.headline}`,
    financialOutlookBadgeLabel(outlook.status),
  );
  // Task #710 — surface the same Actual / Projected indicator that founders
  // see on the wizard's Review step (and that the lender PDF now carries on
  // its assumption-confidence rollup) inline beside the outlook badge. The
  // 5-Year outlook is the board PDF's headline rollup surface, so this is
  // the right place to anchor the provenance signal for trustees.
  doc.x = doc.page.margins.left;
  drawActualVsProjectedPill(
    doc,
    packet.provenance === "actuals" ? "actual" : "projected",
  );
  doc.text("", doc.page.margins.left, doc.y);
  doc.moveDown(0.2);
  bodyText(doc, outlook.summary);

  if (packet.cashRunway.runwayMonths > 0) {
    doc.moveDown(0.2);
    const cash = packet.cashRunway;
    statusBadge(doc, `Cash Position: ${cash.runwayLabel}`, cashStatusBadgeLabel(cash.status));
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

/**
 * Render the best/expected/worst recruiting projection range so the board PDF
 * mirrors the same three-bucket picture trustees see on the wizard's
 * Chesterton recruiting step (Task #436). The "Expected" row is explicitly
 * labeled as the founder's chosen rate so trustees can tell at a glance which
 * scenario the rest of the budget assumes.
 */
function renderRecruitingProjections(
  doc: PDFDoc,
  projections: BoardRecruitingProjections,
) {
  sectionTitle(doc, "Recruiting Projection Range");

  bodyText(
    doc,
    `Year 1 enrollment goal of ${projections.year1Goal} student${projections.year1Goal === 1 ? "" : "s"} drawn from a prospect pool of ${projections.totalProspects}. Three conversion scenarios below show the implied enrolled student count and how much of the goal it covers.`,
  );

  const cols: TableColumn[] = [
    { header: "Scenario", width: 170 },
    { header: "Conversion Rate", width: 110, align: "center" },
    { header: "Projected Students", width: 110, align: "right" },
    { header: "Coverage of Goal", width: 110, align: "right" },
  ];

  const labelFor = (kind: "best" | "expected" | "worst", divisor: number): string => {
    if (kind === "best") return "Best (1 in 2)";
    if (kind === "worst") return "Worst (1 in 5)";
    return `Expected (founder's chosen rate, 1 in ${divisor})`;
  };

  const rows = projections.projections.map((p) => [
    labelFor(p.kind, p.divisor),
    `1 in ${p.divisor}`,
    String(p.projectedStudents),
    `${Math.round(p.coveragePct)}%`,
  ]);

  drawTable(doc, cols, rows, { zebra: true });
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

  // Task #456 — surface supporting assumptions (e.g. tuition collection
  // method + rate) so board readers see the cash-collection lever alongside
  // the revenue narrative. Mirrors the lender packet renderer. Restricted
  // to a small allow-list of sections so we don't flood unrelated sections
  // with source-field labels.
  if (section.linkedAssumptions && section.linkedAssumptions.length > 0 && shouldShowBoardAssumptions(section.id)) {
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

  // Task #455 — surface fragility footnotes attached to linked assumptions
  // beside the line items they qualify. Even when the Supporting Assumptions
  // block above isn't rendered for this section, the per-line legal-status
  // caveats are material to a 5-year forecast review and need to land in
  // the packet so the board sees the litigation risk inline with revenue.
  const noteAssumptions = (section.linkedAssumptions || []).filter((a) => !!a.note);
  if (noteAssumptions.length > 0) {
    doc.moveDown(0.2);
    const margin = doc.page.margins.left;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.amber);
    doc.text("Funding-status footnotes", margin, doc.y);
    for (const a of noteAssumptions) {
      const indent = margin + 8;
      const w = doc.page.width - doc.page.margins.right - indent;
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.amber);
      doc.text(`• ${a.label}: ${a.note}`, indent, doc.y, { width: w });
    }
    doc.fillColor(BRAND.black);
    doc.moveDown(0.3);
  }
}

function shouldShowBoardAssumptions(sectionId: string): boolean {
  return ["revenue_model", "staffing_plan", "capital_debt", "appendix_assumptions"].includes(sectionId);
}

function renderMetrics(doc: PDFDoc, metrics: LinkedMetric[]) {
  renderLinkedMetrics(doc, metrics, { limit: 6 });
}

/**
 * Task #660 - Render the plain-English founder summary as a lead block on
 * the Board and Funder Summary PDF. Six short sections with paragraphs and
 * (optional) bullets, in the same order the in-app /summary page renders.
 */
function renderFounderSummarySection(doc: PDFDoc, summary: FounderSummary) {
  if (!summary || summary.sections.length === 0) return;
  // Task #660 - Standalone one-pager. The caller wraps this with an
  // explicit doc.addPage() afterwards so subsequent packet sections do
  // not bleed onto the founder-summary page; here we only enforce the
  // start-of-page boundary and use compact typography so the six
  // sections fit on a single sheet for the typical model.
  sectionTitle(doc, "Plain-English Summary");
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.gray);
  doc.text(
    "A plain-language read of your model. Same six sections you see in the in-app summary view, sourced from the canonical engine.",
    doc.page.margins.left,
    doc.y,
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
  );
  doc.fillColor(BRAND.black);
  doc.moveDown(0.3);

  for (const sect of summary.sections) {
    // Compact subsection header so we do not page-break mid-summary.
    doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.darkGray);
    doc.text(sect.title, doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
    doc.fillColor(BRAND.black);
    doc.moveDown(0.15);

    for (const p of sect.paragraphs) {
      doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
      doc.text(p, doc.page.margins.left, doc.y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
    }
    if (sect.bullets && sect.bullets.length > 0) {
      doc.moveDown(0.1);
      const indent = doc.page.margins.left + 10;
      const w = doc.page.width - doc.page.margins.right - indent;
      for (const b of sect.bullets) {
        doc.font("Helvetica").fontSize(8.5).fillColor(BRAND.darkGray);
        doc.text(`\u2022 ${b}`, indent, doc.y, { width: w });
      }
      doc.fillColor(BRAND.black);
    }
    doc.moveDown(0.25);
  }
}

/**
 * Convenience entry point: build a founder summary from the canonical
 * engine and render the section in one call. Kept here so callers that
 * already have ModelData + ConsultantOutput in hand don't have to import
 * the builder separately.
 */
export function renderFounderSummaryFromEngine(
  doc: PDFDoc,
  modelData: ModelData,
  co: ConsultantOutput,
) {
  renderFounderSummarySection(doc, buildFounderSummary(modelData, co));
}
