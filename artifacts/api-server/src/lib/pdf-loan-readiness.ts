import {
  createDoc, drawHeader, sectionTitle, subSection, bodyText,
  drawTable, drawFooter, docToBuffer, statusBadge,
  fmtCurrency, fmtPct, ensureSpace,
  type PDFDoc, type TableColumn, BRAND,
} from "./pdf-utils.js";
import type { ConsultantOutput, KeyMetric, Recommendation, StressScenario } from "./consultant-engine.js";

export async function generateLoanReadinessPDF(consultantData: ConsultantOutput, schoolName: string, entityType?: string): Promise<Buffer> {
  const doc = createDoc();

  drawHeader(doc, `${schoolName} - Loan Readiness Report`, "SchoolStack Budget Consultant Analysis");

  sectionTitle(doc, "Executive Summary");
  bodyText(doc, consultantData.executiveSummary);

  sectionTitle(doc, "Lender Readiness Assessment");
  statusBadge(doc, `Status: ${consultantData.lenderReadiness}`, consultantData.lenderReadiness);
  doc.moveDown(0.3);
  bodyText(doc, consultantData.lenderReadinessExplanation);

  sectionTitle(doc, "Key Financial Metrics");
  const metricCols: TableColumn[] = [
    { header: "Metric", width: 160 },
    { header: "Value", width: 100, align: "right" },
    { header: "Status", width: 80, align: "center" },
    { header: "Interpretation", width: 170 },
  ];
  const statusLabels: Record<string, string> = { good: "✓ Good", warning: "⚠ Warning", danger: "✗ At Risk" };
  const metricRows = consultantData.keyMetrics.map((m: KeyMetric) => [
    m.name,
    m.value,
    statusLabels[m.status] || m.status,
    m.interpretation,
  ]);
  drawTable(doc, metricCols, metricRows, { zebra: true });

  sectionTitle(doc, "Strengths & Risks");
  ensureSpace(doc, 60);
  subSection(doc, "Biggest Strength");
  bodyText(doc, consultantData.biggestStrength);
  subSection(doc, "Biggest Risk");
  bodyText(doc, consultantData.biggestRisk);

  if (consultantData.recommendations.length > 0) {
    sectionTitle(doc, "Recommendations");
    const recCols: TableColumn[] = [
      { header: "Priority", width: 70, align: "center" },
      { header: "Recommendation", width: 160 },
      { header: "Details", width: 280 },
    ];
    const priorityLabels: Record<string, string> = { high: "HIGH", medium: "MEDIUM", low: "LOW" };
    const recRows = consultantData.recommendations.map((r: Recommendation) => [
      priorityLabels[r.priority] || r.priority,
      r.title,
      r.description,
    ]);
    drawTable(doc, recCols, recRows, { zebra: true });
  }

  if (consultantData.revenueComposition.length > 0) {
    sectionTitle(doc, "Revenue Composition");
    const revCompCols: TableColumn[] = [
      { header: "Year", width: 80 },
      { header: "Tuition & Fees", width: 120, align: "right" },
      { header: "Public Funding", width: 120, align: "right" },
      { header: "Philanthropy", width: 120, align: "right" },
    ];
    const revCompRows = consultantData.revenueComposition.map((rc, i) => [
      `Year ${i + 1}`,
      fmtPct(rc.tuitionPct),
      fmtPct(rc.publicPct),
      fmtPct(rc.philanthropyPct),
    ]);
    drawTable(doc, revCompCols, revCompRows, { zebra: true });
  }

  if (consultantData.costComposition.length > 0) {
    sectionTitle(doc, "Cost Structure");
    const costCols: TableColumn[] = [
      { header: "Year", width: 80 },
      { header: "Staffing % of Rev", width: 130, align: "right" },
      { header: "Facility % of Rev", width: 130, align: "right" },
      { header: "Total OpEx % of Rev", width: 130, align: "right" },
    ];
    const costRows = consultantData.costComposition.map((cc, i) => [
      `Year ${i + 1}`,
      fmtPct(cc.staffingPctOfRevenue),
      fmtPct(cc.facilityPctOfRevenue),
      fmtPct(cc.totalOpexPctOfRevenue),
    ]);
    drawTable(doc, costCols, costRows, { zebra: true });
  }

  if (consultantData.cumulativeFinancials.length > 0) {
    const niLabel = entityType === "nonprofit_501c3" ? "Net Income" : "Profit";
    sectionTitle(doc, "Cumulative Financial Trajectory");
    const cumCols: TableColumn[] = [
      { header: "Year", width: 80 },
      { header: `Cumulative ${niLabel}`, width: 180, align: "right" },
      { header: "Reserve (Months)", width: 130, align: "right" },
    ];
    const cumRows = consultantData.cumulativeFinancials.map(cf => [
      `Year ${cf.year}`,
      fmtCurrency(cf.cumulativeNetIncome),
      `${cf.reserveMonths.toFixed(1)} months`,
    ]);
    drawTable(doc, cumCols, cumRows, { zebra: true });
  }

  if (consultantData.stressTests.length > 0) {
    const niLabel = entityType === "nonprofit_501c3" ? "Net Income" : "Profit";
    sectionTitle(doc, "Stress Test Scenarios");
    // Task #630 — surface reserve months / DSCR / runway alongside the
    // existing net-income trajectory so lenders can see resilience under
    // each stress (especially "Hard revenue only").
    const stressCols: TableColumn[] = [
      { header: "Scenario", width: 130 },
      { header: `Y1 ${niLabel}`, width: 80, align: "right" },
      { header: `Final ${niLabel}`, width: 80, align: "right" },
      { header: "Break-Even", width: 60, align: "center" },
      { header: "Reserve (mo)", width: 60, align: "right" },
      { header: "Y1 DSCR", width: 50, align: "right" },
      { header: "Runway (mo)", width: 60, align: "right" },
    ];
    const stressRows = consultantData.stressTests.map((s: StressScenario) => [
      s.scenario,
      fmtCurrency(s.y1NetIncome),
      fmtCurrency(s.y5NetIncome),
      s.breakEvenYear ? `Y${s.breakEvenYear}` : "None",
      s.reserveMonths !== undefined ? s.reserveMonths.toFixed(1) : "—",
      s.dscr === null || s.dscr === undefined ? "N/A" : `${s.dscr.toFixed(2)}x`,
      s.runwayMonths !== undefined ? (s.runwayMonths >= 60 ? "60+" : s.runwayMonths.toString()) : "—",
    ]);
    drawTable(doc, stressCols, stressRows, { zebra: true });
  }

  drawFooter(doc);
  return docToBuffer(doc);
}
