import {
  createDoc, drawHeader, sectionTitle, subSection, bodyText,
  drawFooter, docToBuffer, statusBadge, labelValue,
  fmtCurrency, ensureSpace,
  renderDecisionHistorySection,
  renderPacketTable, renderPacketInsights, renderLinkedMetrics,
  type PDFDoc, BRAND,
} from "../pdf-utils.js";
import type { LenderPacket, RiskMitigant, BudgetNarrativeData, FlaggedAssumptionExport, BreakEvenDownsideExport } from "./build-lender-packet";
import type { PacketSection, LinkedMetric } from "./packet-types";
import { renderForecastAccuracySection } from "./forecast-accuracy-pdf.js";
import { renderCashRunwayTroughCallout } from "./cash-runway-pdf.js";
import { drawLenderSummaryPage } from "./lender-summary-pdf.js";
import type { LenderSummaryData } from "./build-lender-summary.js";

export async function generateLenderPacketPDF(
  packet: LenderPacket,
  lenderSummary?: LenderSummaryData,
): Promise<Buffer> {
  const doc = createDoc();

  // Task #615 — one-page Lender Summary leads the packet, on letter
  // portrait. Only rendered when the route supplies the canonical-engine
  // summary; otherwise we keep the legacy cover-first layout for callers /
  // tests that still build the packet without the summary.
  if (lenderSummary) {
    drawLenderSummaryPage(doc, lenderSummary);
    doc.addPage();
  }

  drawCoverPage(doc, packet);
  doc.addPage();

  const execSection = packet.sections.find(s => s.id === "executive_summary" && s.included);
  if (execSection) {
    renderSection(doc, execSection, packet);
  }

  const execSummary = packet.sections.find(s => s.id === "executive_summary");
  renderBudgetNarrativeSection(doc, packet.budgetNarrative, packet.flaggedAssumptions, execSummary?.narrative);

  for (const section of packet.sections) {
    if (!section.included) continue;
    if (section.id === "cover") continue;
    if (section.id === "executive_summary") continue;

    renderSection(doc, section, packet);
  }

  // Forecast accuracy lives after the listed sections — it summarizes the
  // founder's track record across decisions and complements the decision
  // history block. Per Task #216 the section is omitted gracefully (no
  // title, no placeholder copy) when no Pursued saved scenarios with
  // realized actuals exist — first-time founders without a track record
  // shouldn't get a half-empty section in their lender packet.
  renderBreakEvenDownsideSection(doc, packet.breakEvenDownside);

  renderForecastAccuracySection(
    doc,
    packet.forecastAccuracy,
    "lender",
    true,
    packet.forecastAccuracyFilter,
    packet.forecastAccuracyUnfilteredCount,
  );

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
  doc.text("Lender Conversation Snapshot", margin, 60);
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

const NARRATIVE_LABELS: Array<[keyof BudgetNarrativeData, string]> = [
  ["enrollmentStrategy", "Enrollment Strategy"],
  ["retentionPlan", "Retention Plan"],
  ["riskMitigation", "Risk Mitigation"],
  ["missionAndVision", "Mission & Vision"],
  ["revenueAssumptions", "Revenue Assumptions"],
  ["staffingPhilosophy", "Staffing Philosophy"],
  ["expenseAssumptions", "Expense Assumptions"],
  ["growthStrategy", "Growth Strategy"],
  ["additionalContext", "Additional Context"],
];

function renderBudgetNarrativeSection(doc: PDFDoc, narrative: BudgetNarrativeData, flagged: FlaggedAssumptionExport[], autoNarrative?: string) {
  const hasNarrative = NARRATIVE_LABELS.some(([key]) => narrative[key]?.trim());
  const hasFlags = flagged.length > 0;

  sectionTitle(doc, "Budget Narrative");

  if (!hasNarrative) {
    if (autoNarrative?.trim()) {
      bodyText(doc, autoNarrative);
    } else {
      bodyText(doc, "The school founder has not yet provided narrative context for this financial model. Lenders should request clarification on enrollment strategy, retention plans, and risk mitigation before underwriting.");
    }
    if (!hasFlags) {
      doc.moveDown(0.5);
      return;
    }
  }

  if (hasNarrative) {
    for (const [key, label] of NARRATIVE_LABELS) {
      const text = narrative[key]?.trim();
      if (!text) continue;
      const isPrimary = key === "enrollmentStrategy" || key === "retentionPlan" || key === "riskMitigation";
      ensureSpace(doc, 40);
      if (isPrimary) {
        doc.save();
        doc.rect(doc.page.margins.left, doc.y, 3, 14).fill(BRAND.amber);
        doc.restore();
        doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.navy);
        doc.text(label, doc.page.margins.left + 10, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 10 });
      } else {
        subSection(doc, label);
      }
      bodyText(doc, text);
      doc.moveDown(0.3);
    }
  }

  if (hasFlags) {
    ensureSpace(doc, 30);
    subSection(doc, "Flagged Assumptions");
    for (const fa of flagged) {
      ensureSpace(doc, 30);
      const severityLabel = fa.flag.severity.charAt(0).toUpperCase() + fa.flag.severity.slice(1);
      const color = fa.flag.severity === "critical" ? BRAND.red : fa.flag.severity === "warning" ? BRAND.amber : BRAND.teal;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(color);
      doc.text(`[${severityLabel}] `, doc.page.margins.left, doc.y, { continued: true });
      doc.font("Helvetica").fontSize(8).fillColor(BRAND.black);
      doc.text(fa.flag.currentValue);
      if (fa.userExplanation.trim()) {
        doc.font("Helvetica").fontSize(8).fillColor(BRAND.darkGray);
        doc.text(`  Explanation: ${fa.userExplanation}`, doc.page.margins.left + 10, doc.y, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 10,
        });
      }
      doc.moveDown(0.2);
    }
  }

  doc.moveDown(0.5);
}

function renderSection(doc: PDFDoc, section: PacketSection, packet: LenderPacket) {
  if (section.id === "decision_history") {
    renderDecisionHistorySection(doc, section, packet.decisionHistory, {
      emptyStateHint:
        "Once decisions are saved with a Pursued / Declined / On hold outcome inside the planner, they will be summarized here.",
    });
    return;
  }

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
      renderPacketTable(doc, table);
    }
  }

  // After the operating reserve / ending cash table, surface a one-line
  // callout for the trough year so lenders see the runway crunch year at
  // a glance — same wording used in the board packet (Task #213).
  if (section.id === "debt_service" && packet.cashRunway?.troughCallout) {
    renderCashRunwayTroughCallout(doc, packet.cashRunway, { prependEnsureSpace: 24 });
  }

  if (section.linkedAssumptions.length > 0 && shouldShowAssumptions(section.id)) {
    doc.moveDown(0.3);
    subSection(doc, "Supporting Assumptions");
    for (const a of section.linkedAssumptions.slice(0, 10)) {
      labelValue(doc, a.label, a.value);
      // Task #455 — when an assumption carries a fragility footnote (e.g. a
      // litigated voucher program), render it as a small italic line right
      // under the value so the caveat sits next to the dollar amount.
      if (a.note) {
        renderAssumptionNote(doc, a.note);
      }
    }
    if (section.linkedAssumptions.length > 10) {
      doc.font("Helvetica").fontSize(8).fillColor(BRAND.gray);
      doc.text(`  ... and ${section.linkedAssumptions.length - 10} more (see Appendix)`);
    }
    doc.moveDown(0.3);
  }
}

// Task #455 — render the small italic footnote attached to a linked
// assumption (e.g. "OH EdChoice voucher is currently in litigation.").
// Indented to visually associate with the labelValue line above and
// colored amber so a quick skim spots the caveat next to the dollars.
function renderAssumptionNote(doc: PDFDoc, note: string): void {
  const margin = doc.page.margins.left;
  const indent = margin + 8;
  const w = doc.page.width - doc.page.margins.right - indent;
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(BRAND.amber);
  doc.text(note, indent, doc.y, { width: w });
  doc.fillColor(BRAND.black);
}

function shouldShowAssumptions(sectionId: string): boolean {
  return ["school_overview", "enrollment_plan", "revenue_model", "staffing_plan", "capital_debt", "appendix_assumptions"].includes(sectionId);
}

function renderMetrics(doc: PDFDoc, metrics: LinkedMetric[]) {
  renderLinkedMetrics(doc, metrics, {
    limit: 8,
    showBenchmark: true,
    neutralIcon: " ",
    reserveInitialSpace: true,
  });
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

function renderBreakEvenDownsideSection(doc: PDFDoc, bed: BreakEvenDownsideExport) {
  ensureSpace(doc, 60);
  sectionTitle(doc, "Break-Even & Downside Sensitivity");
  bodyText(
    doc,
    bed.maxCapacity
      ? `Break-even student counts assume current revenue and cost mix. Utilization compares break-even to the stated max capacity of ${bed.maxCapacity} students.`
      : "Break-even student counts assume current revenue and cost mix. Set max capacity in the wizard to see utilization %.",
  );
  doc.moveDown(0.3);

  subSection(doc, "Per-Year Break-Even");
  for (let y = 0; y < 5; y++) {
    const be = bed.breakEvenStudents[y];
    const util = bed.breakEvenUtilization[y];
    const planned = bed.enrollment[y] ?? 0;
    const beStr = be === null ? "N/A" : `${be} students`;
    const utilStr = util === null ? "" : ` · ${(util * 100).toFixed(0)}% of capacity`;
    labelValue(doc, `Year ${y + 1} (planned ${planned}):`, `${beStr}${utilStr}`);
  }
  doc.moveDown(0.3);

  subSection(doc, "Downside Enrollment Band");
  for (const [label, ds] of [
    ["If 10% fewer students enroll", bed.downsideBand.minus10] as const,
    ["If 20% fewer students enroll", bed.downsideBand.minus20] as const,
  ]) {
    ensureSpace(doc, 30);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND.amber);
    doc.text(label, doc.page.margins.left, doc.y);
    doc.font("Helvetica").fontSize(9).fillColor(BRAND.black);
    for (let y = 0; y < 5; y++) {
      const dscrStr = ds.dscr[y] > 0 ? `${ds.dscr[y].toFixed(2)}x` : "N/A";
      labelValue(
        doc,
        `  Year ${y + 1} (${ds.enrollment[y]} students):`,
        `DSCR ${dscrStr} · Ending cash ${fmtCurrency(ds.endingCash[y])}`,
      );
    }
    doc.moveDown(0.3);
  }
}

function drawFooterNote(doc: PDFDoc, text: string) {
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(7).fillColor(BRAND.gray);
  doc.text(text, doc.page.margins.left, doc.y, { align: "left" });
  doc.moveDown(0.3);
}

