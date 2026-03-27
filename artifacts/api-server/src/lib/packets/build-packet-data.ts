import type { ConsultantOutput } from "../consultant-engine";
import {
  type ModelData,
  type SchoolProfile,
  type StaffingRow,
  getEnrollmentArray,
  schoolTypeLabel,
  entityLabel,
  fundingLabel,
  stageLabel,
  driverVal,
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeCapDebtForYear,
  computeDebtServiceForYear,
  normalizeStaffingRow,
  netIncomeLabel,
  computeNewStudents,
  computeReturningStudents,
} from "../workbook-helpers";
import { buildNarrative } from "./build-narrative";
import {
  type PacketData,
  type PacketInput,
  type PacketSection,
  type PacketTable,
  type PacketTableRow,
  type LinkedAssumption,
  type LinkedMetric,
  type SectionId,
  type FormatRules,
  LENDER_SECTIONS,
  BOARD_SECTIONS,
  SECTION_META,
} from "./packet-types";

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function yearLabel(y: number): string {
  return `Year ${y + 1}`;
}

export function buildPacketData(input: PacketInput): PacketData {
  const { modelData, consultantOutput, modelId, packetType } = input;
  const sp = modelData.schoolProfile || ({} as SchoolProfile);
  const schoolName = sp.schoolName || "Untitled School";
  const narrative = buildNarrative(consultantOutput);
  const sectionIds = packetType === "lender" ? LENDER_SECTIONS : BOARD_SECTIONS;
  const niLabel = netIncomeLabel(sp.entityType);

  const enrollment = getEnrollmentArray(modelData.enrollment);
  const yearCount = 5;

  const yearlyData = computeYearlyData(modelData, enrollment, yearCount);

  const sections = sectionIds.map((id, idx) =>
    buildSection(id, idx, modelData, consultantOutput, yearlyData, enrollment, niLabel),
  );

  const formatRules: FormatRules = {
    currencyFormat: '$#,##0',
    percentFormat: '0.0%',
    dateFormat: 'MMMM d, yyyy',
    showBenchmarks: packetType === "lender",
    includeAssumptionSources: true,
    pageBreakAfterSections: ["executive_summary", "five_year_projection", "stress_tests"],
  };

  return {
    packetType,
    schoolName,
    generatedAt: new Date().toISOString(),
    modelId,
    narrative,
    sections,
    formatRules,
  };
}

interface YearData {
  year: number;
  students: number;
  totalRevenue: number;
  totalStaffing: number;
  totalExpenses: number;
  debtService: number;
  netIncome: number;
  netMargin: number;
}

function normalizeStaffingRows(md: ModelData): StaffingRow[] {
  return (md.staffingRows || []).map(
    (r) => normalizeStaffingRow(r as unknown as Record<string, unknown>),
  );
}

function computeYearlyData(
  md: ModelData,
  enrollment: number[],
  yearCount: number,
): YearData[] {
  const result: YearData[] = [];
  const sp = md.schoolProfile || ({} as SchoolProfile);
  const normalized = normalizeStaffingRows(md);
  const prorationFactor = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 12) / 12 : 1;
  const salaryEsc = (sp as Record<string, unknown>).salaryEscalation as number | undefined;
  const costInflPct = (sp as Record<string, unknown>).costInflationPct as number | undefined;
  const pktRR = (md.enrollment as Record<string, unknown> | undefined)?.retentionRate as number | undefined ?? 85;

  for (let y = 0; y < yearCount; y++) {
    const students = enrollment[y] || 0;
    const ns = computeNewStudents(enrollment, pktRR, y);
    const rs = computeReturningStudents(enrollment, pktRR, y);
    const totalRevenue = computeRevenueForYear(md.revenueRows || [], y, students, md.tuitionTiers, costInflPct, sp);
    const totalStaffing = computePersonnelForYear(normalized, salaryEsc || 0, prorationFactor, y, students);
    const opex = computeExpenseForYear(md.expenseRows || [], y, students, totalRevenue, costInflPct, ns, rs);
    const capDebt = computeCapDebtForYear(md.capitalAndDebtRows || [], y, students);
    const debtService = computeDebtServiceForYear(md.capitalAndDebtRows || [], y);
    const totalExpenses = totalStaffing + opex + capDebt;
    const netIncome = totalRevenue - totalExpenses;
    const netMargin = totalRevenue > 0 ? netIncome / totalRevenue : 0;

    result.push({
      year: y,
      students,
      totalRevenue,
      totalStaffing,
      totalExpenses,
      debtService,
      netIncome,
      netMargin,
    });
  }

  return result;
}

function buildSection(
  id: SectionId,
  order: number,
  md: ModelData,
  co: ConsultantOutput,
  yearlyData: YearData[],
  enrollment: number[],
  niLabel: string,
): PacketSection {
  const meta = SECTION_META[id];
  const base: PacketSection = {
    id,
    title: meta.title,
    order,
    included: true,
    narrative: "",
    linkedAssumptions: [],
    linkedMetrics: [],
  };

  switch (id) {
    case "cover":
      return buildCover(base, md);
    case "executive_summary":
      return buildExecutiveSummary(base, co);
    case "school_overview":
      return buildSchoolOverview(base, md);
    case "enrollment_plan":
      return buildEnrollmentPlan(base, md, enrollment);
    case "revenue_model":
      return buildRevenueModel(base, md, co, yearlyData);
    case "staffing_plan":
      return buildStaffingPlan(base, md, co, yearlyData);
    case "expense_summary":
      return buildExpenseSummary(base, co, yearlyData);
    case "capital_debt":
      return buildCapitalDebt(base, md, co);
    case "five_year_projection":
      return buildFiveYearProjection(base, co, yearlyData, niLabel);
    case "cash_flow":
      return buildCashFlow(base, co);
    case "debt_service":
      return buildDebtService(base, co, yearlyData);
    case "stress_tests":
      return buildStressTests(base, co);
    case "health_assessment":
      return buildHealthAssessment(base, co);
    case "key_risks":
      return buildKeyRisks(base, co);
    case "key_strengths":
      return buildKeyStrengths(base, co);
    case "lender_readiness":
      return buildLenderReadiness(base, co);
    case "board_action_items":
      return buildBoardActionItems(base, co);
    case "appendix_assumptions":
      return buildAppendixAssumptions(base, md, enrollment);
    default:
      return base;
  }
}

function buildCover(s: PacketSection, md: ModelData): PacketSection {
  const sp = md.schoolProfile || ({} as SchoolProfile);
  return {
    ...s,
    narrative: `Financial model prepared for ${sp.schoolName || "the school"}.`,
    linkedAssumptions: [
      { label: "School Name", value: sp.schoolName || "—", sourceField: "schoolProfile.schoolName" },
      { label: "School Type", value: schoolTypeLabel(sp.schoolType), sourceField: "schoolProfile.schoolType" },
      { label: "Entity Type", value: entityLabel(sp.entityType), sourceField: "schoolProfile.entityType" },
      { label: "State", value: sp.state || "—", sourceField: "schoolProfile.state" },
    ],
  };
}

function buildExecutiveSummary(s: PacketSection, co: ConsultantOutput): PacketSection {
  return {
    ...s,
    narrative: co.executiveSummary,
    linkedMetrics: [
      { label: "Lender Readiness", value: co.lenderReadiness, sourceEngine: "consultant" },
      { label: "Biggest Strength", value: co.biggestStrength, sourceEngine: "consultant" },
      { label: "Biggest Risk", value: co.biggestRisk, sourceEngine: "consultant" },
      { label: "Cash Runway", value: co.cashRunwayMonths >= 60 ? "60+ months" : `${co.cashRunwayMonths} months`, sourceEngine: "consultant" },
    ],
  };
}

function buildSchoolOverview(s: PacketSection, md: ModelData): PacketSection {
  const sp = md.schoolProfile || ({} as SchoolProfile);
  return {
    ...s,
    narrative: `${sp.schoolName || "The school"} is a ${stageLabel(sp.schoolStage)} ${schoolTypeLabel(sp.schoolType)} organized as a ${entityLabel(sp.entityType)} with a ${fundingLabel(sp.fundingProfile)} funding profile.`,
    linkedAssumptions: [
      { label: "School Stage", value: stageLabel(sp.schoolStage), sourceField: "schoolProfile.schoolStage" },
      { label: "School Type", value: schoolTypeLabel(sp.schoolType), sourceField: "schoolProfile.schoolType" },
      { label: "Funding Profile", value: fundingLabel(sp.fundingProfile), sourceField: "schoolProfile.fundingProfile" },
      { label: "Entity Type", value: entityLabel(sp.entityType), sourceField: "schoolProfile.entityType" },
      { label: "State", value: sp.state || "—", sourceField: "schoolProfile.state" },
      { label: "Opening Year", value: sp.openingYear?.toString() || "—", sourceField: "schoolProfile.openingYear" },
    ],
  };
}

function buildEnrollmentPlan(
  s: PacketSection,
  md: ModelData,
  enrollment: number[],
): PacketSection {
  const y1 = enrollment[0] || 0;
  const y5 = enrollment[4] || enrollment[enrollment.length - 1] || 0;
  const growth = y1 > 0 ? ((y5 / y1 - 1) * 100).toFixed(0) : "—";

  const rows: PacketTableRow[] = enrollment.map((e, i) => ({
    label: yearLabel(i),
    values: [e.toString()],
  }));

  return {
    ...s,
    narrative: `Enrollment starts at ${y1} students in Year 1 and grows to ${y5} by Year 5 (${growth}% growth). ${md.enrollment ? "" : "No enrollment data has been entered."}`,
    linkedAssumptions: enrollment.map((e, i) => ({
      label: `Year ${i + 1} Enrollment`,
      value: e.toString(),
      sourceField: `enrollment.year${i + 1}`,
    })),
    tables: [{
      title: "Enrollment by Year",
      headers: ["Year", "Students"],
      rows,
    }],
  };
}

function buildRevenueModel(
  s: PacketSection,
  md: ModelData,
  co: ConsultantOutput,
  yearlyData: YearData[],
): PacketSection {
  const revComp = co.revenueComposition[0];
  const parts: string[] = [];

  if (revComp) {
    if (revComp.tuitionPct > 0.5) parts.push(`tuition-driven (${pct(revComp.tuitionPct)} of Year 1 revenue)`);
    if (revComp.publicPct > 0.5) parts.push(`primarily publicly funded (${pct(revComp.publicPct)} of Year 1 revenue)`);
    if (revComp.philanthropyPct > 0.3) parts.push(`with significant philanthropic support (${pct(revComp.philanthropyPct)})`);
  }

  const narrative = `The revenue model is ${parts.length > 0 ? parts.join(", ") : "anchored to enrollment-driven income"}. Year 1 total revenue is projected at ${fmt(yearlyData[0]?.totalRevenue || 0)}, growing to ${fmt(yearlyData[4]?.totalRevenue || 0)} by Year 5.`;

  const rows: PacketTableRow[] = yearlyData.map((yd) => ({
    label: yearLabel(yd.year),
    values: [fmt(yd.totalRevenue)],
  }));

  const linkedMetrics: LinkedMetric[] = co.revenueComposition.length > 0
    ? [
        { label: "Tuition %", value: pct(revComp?.tuitionPct || 0), sourceEngine: "consultant" as const },
        { label: "Public Funding %", value: pct(revComp?.publicPct || 0), sourceEngine: "consultant" as const },
        { label: "Philanthropy %", value: pct(revComp?.philanthropyPct || 0), sourceEngine: "consultant" as const },
      ]
    : [];

  return {
    ...s,
    narrative,
    linkedMetrics,
    linkedAssumptions: (md.revenueRows || []).filter((r) => r.enabled !== false).map((r) => ({
      label: r.lineItem || "Revenue Line",
      value: fmt(driverVal(r.amounts, 0, r.driverType || "annual", yearlyData[0]?.students || 0, r.escalationRate)),
      sourceField: `revenueRows[${r.id}]`,
    })),
    tables: [{
      title: "Revenue by Year",
      headers: ["Year", "Total Revenue"],
      rows,
    }],
  };
}

function buildStaffingPlan(
  s: PacketSection,
  md: ModelData,
  co: ConsultantOutput,
  yearlyData: YearData[],
): PacketSection {
  const y1Staff = yearlyData[0]?.totalStaffing || 0;
  const y1Rev = yearlyData[0]?.totalRevenue || 0;
  const staffPct = y1Rev > 0 ? y1Staff / y1Rev : 0;

  const costComp = co.costComposition[0];
  const narrative = `Staffing costs are ${fmt(y1Staff)} in Year 1, representing ${pct(staffPct)} of revenue. ${staffPct > 0.6 ? "This is above the typical 50-60% benchmark and may need monitoring." : staffPct > 0.5 ? "This is within the typical 50-60% range." : "This leaves healthy room for other operating costs."}`;

  const linkedMetrics: LinkedMetric[] = costComp
    ? [{ label: "Staffing % of Revenue", value: pct(costComp.staffingPctOfRevenue), status: costComp.staffingPctOfRevenue > 0.6 ? "warning" as const : "good" as const, sourceEngine: "consultant" as const }]
    : [];

  return {
    ...s,
    narrative,
    linkedMetrics,
    linkedAssumptions: normalizeStaffingRows(md).map((nr) => ({
      label: nr.roleName || "Staff Position",
      value: `$${nr.annualizedRate.toLocaleString()}, ${nr.fte} FTE`,
      sourceField: `staffingRows[${nr.id}]`,
    })),
  };
}

function buildExpenseSummary(
  s: PacketSection,
  co: ConsultantOutput,
  yearlyData: YearData[],
): PacketSection {
  const y1 = yearlyData[0];
  const y5 = yearlyData[4] || yearlyData[yearlyData.length - 1];

  const rows: PacketTableRow[] = yearlyData.map((yd) => ({
    label: yearLabel(yd.year),
    values: [fmt(yd.totalStaffing), fmt(yd.totalExpenses - yd.totalStaffing - yd.debtService), fmt(yd.debtService), fmt(yd.totalExpenses)],
  }));

  return {
    ...s,
    narrative: `Total expenses grow from ${fmt(y1?.totalExpenses || 0)} in Year 1 to ${fmt(y5?.totalExpenses || 0)} by Year 5.`,
    tables: [{
      title: "Expenses by Year",
      headers: ["Year", "Staffing", "Operating", "Debt Service", "Total"],
      rows,
    }],
  };
}

function buildCapitalDebt(
  s: PacketSection,
  md: ModelData,
  co: ConsultantOutput,
): PacketSection {
  const debtRows = (md.capitalAndDebtRows || []).filter((r) => r.enabled !== false);
  const hasDebt = debtRows.length > 0;

  if (!hasDebt) {
    return { ...s, narrative: "No debt or capital financing is included in this model." };
  }

  const loanRows = debtRows.filter((r) => r.isLoan);
  const totalDebt = loanRows.reduce((sum, r) => sum + (r.loanPrincipal || 0), 0);
  const narrative = `The model includes ${loanRows.length} debt instrument${loanRows.length > 1 ? "s" : ""} totaling ${fmt(totalDebt)}.`;

  return {
    ...s,
    narrative,
    linkedAssumptions: loanRows.map((r) => ({
      label: r.lineItem || "Loan",
      value: `${fmt(r.loanPrincipal || 0)} at ${((r.loanRate || 0)).toFixed(1)}% for ${r.loanTermYears || 0} years`,
      sourceField: `capitalAndDebtRows[${r.id}]`,
    })),
  };
}

function buildFiveYearProjection(
  s: PacketSection,
  co: ConsultantOutput,
  yearlyData: YearData[],
  niLabel: string,
): PacketSection {
  const rows: PacketTableRow[] = yearlyData.map((yd) => ({
    label: yearLabel(yd.year),
    values: [yd.students.toString(), fmt(yd.totalRevenue), fmt(yd.totalExpenses), fmt(yd.netIncome), pct(yd.netMargin)],
  }));

  const breakEvenYear = yearlyData.findIndex((yd) => yd.netIncome >= 0);
  const breakEvenText = breakEvenYear >= 0
    ? `The model reaches break-even in Year ${breakEvenYear + 1}.`
    : "The model does not reach break-even within the 5-year projection.";

  return {
    ...s,
    narrative: `${breakEvenText} Year 5 ${niLabel.toLowerCase()} is projected at ${fmt(yearlyData[4]?.netIncome || 0)} (${pct(yearlyData[4]?.netMargin || 0)} margin).`,
    tables: [{
      title: `5-Year ${niLabel} Projection`,
      headers: ["Year", "Students", "Revenue", "Expenses", niLabel, "Margin"],
      rows,
    }],
    linkedMetrics: co.keyMetrics.map((m) => ({
      label: m.name,
      value: m.value,
      status: m.status,
      benchmark: m.benchmark,
      sourceEngine: "consultant" as const,
    })),
  };
}

function buildCashFlow(s: PacketSection, co: ConsultantOutput): PacketSection {
  const runwayText = co.cashRunwayMonths >= 60
    ? "Cash stays positive throughout the entire 5-year projection."
    : `Cash goes negative in month ${co.cashRunwayMonths}. The school will need additional funding or cost adjustments.`;

  const rows: PacketTableRow[] = co.cumulativeFinancials.map((cf) => ({
    label: yearLabel(cf.year - 1),
    values: [fmt(cf.cumulativeNetIncome), `${cf.reserveMonths.toFixed(1)} months`],
  }));

  return {
    ...s,
    narrative: runwayText,
    linkedMetrics: [
      { label: "Cash Runway", value: co.cashRunwayMonths >= 60 ? "60+ months" : `${co.cashRunwayMonths} months`, sourceEngine: "consultant" },
    ],
    tables: [{
      title: "Cumulative Cash Position",
      headers: ["Year", "Cumulative Net Income", "Reserve Months"],
      rows,
    }],
  };
}

function buildDebtService(
  s: PacketSection,
  co: ConsultantOutput,
  yearlyData: YearData[],
): PacketSection {
  const hasDebt = yearlyData.some((yd) => yd.debtService > 0);
  if (!hasDebt) {
    return { ...s, narrative: "No debt service obligations are present in this model.", included: true };
  }

  const dscrMetric = co.keyMetrics.find((m) => m.name.toLowerCase().includes("dscr") || m.name.toLowerCase().includes("debt service"));

  return {
    ...s,
    narrative: dscrMetric
      ? `${dscrMetric.interpretation} Current DSCR is ${dscrMetric.value}. ${dscrMetric.benchmark ? `Benchmark: ${dscrMetric.benchmark}.` : ""}`
      : "Debt service coverage should be monitored as the model matures.",
    linkedMetrics: dscrMetric
      ? [{ label: dscrMetric.name, value: dscrMetric.value, status: dscrMetric.status, benchmark: dscrMetric.benchmark, sourceEngine: "consultant" }]
      : [],
  };
}

function buildStressTests(s: PacketSection, co: ConsultantOutput): PacketSection {
  if (co.stressTests.length === 0) {
    return { ...s, narrative: "No stress test scenarios were generated." };
  }

  const failedTests = co.stressTests.filter((st) => st.y5NetIncome < 0);
  const narrative = failedTests.length === 0
    ? `All ${co.stressTests.length} stress scenarios maintain positive Year 5 net income, indicating financial resilience.`
    : `${failedTests.length} of ${co.stressTests.length} stress scenarios result in negative Year 5 net income, suggesting the model has limited cushion against adverse conditions.`;

  const rows: PacketTableRow[] = co.stressTests.map((st) => ({
    label: st.scenario,
    values: [fmt(st.y1NetIncome), fmt(st.y5NetIncome), st.breakEvenYear !== null ? `Year ${st.breakEvenYear}` : "Never"],
  }));

  return {
    ...s,
    narrative,
    tables: [{
      title: "Stress Test Results",
      headers: ["Scenario", "Y1 Net Income", "Y5 Net Income", "Break-Even"],
      rows,
    }],
  };
}

function buildHealthAssessment(s: PacketSection, co: ConsultantOutput): PacketSection {
  const healthy = co.healthSignals.filter((hs) => hs.status === "healthy").length;
  const watch = co.healthSignals.filter((hs) => hs.status === "watch").length;
  const atRisk = co.healthSignals.filter((hs) => hs.status === "at_risk").length;
  const total = co.healthSignals.length;

  const narrative = total === 0
    ? "Financial health assessment data is not available."
    : `Across ${total} health dimensions: ${healthy} healthy, ${watch} on watch, ${atRisk} at risk.`;

  const rows: PacketTableRow[] = co.healthSignals.map((hs) => ({
    label: hs.dimension.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    values: [hs.label, hs.explanation],
  }));

  return {
    ...s,
    narrative,
    linkedMetrics: co.healthSignals.map((hs) => ({
      label: hs.dimension.replace(/_/g, " "),
      value: hs.label,
      status: hs.status === "healthy" ? "good" as const : hs.status === "at_risk" ? "danger" as const : "warning" as const,
      sourceEngine: "consultant" as const,
    })),
    tables: total > 0 ? [{
      title: "Health Dimensions",
      headers: ["Dimension", "Status", "Details"],
      rows,
    }] : undefined,
  };
}

function buildKeyRisks(s: PacketSection, co: ConsultantOutput): PacketSection {
  const risks: string[] = [];

  if (co.biggestRisk) risks.push(co.biggestRisk);

  for (const issue of co.topIssues) {
    if (risks.length < 5) {
      risks.push(`${issue.title}: ${issue.summary}`);
    }
  }

  return {
    ...s,
    narrative: risks.length > 0
      ? `The model has ${risks.length} identified risk${risks.length > 1 ? "s" : ""} that should be addressed.`
      : "No critical risks have been identified.",
    linkedMetrics: co.topIssues.map((issue) => ({
      label: issue.title,
      value: issue.severity,
      status: issue.severity === "critical" ? "danger" as const : issue.severity === "high" ? "warning" as const : "good" as const,
      sourceEngine: "consultant" as const,
    })),
  };
}

function buildKeyStrengths(s: PacketSection, co: ConsultantOutput): PacketSection {
  const strengths: string[] = [];

  if (co.biggestStrength) strengths.push(co.biggestStrength);

  const goodMetrics = co.keyMetrics.filter((m) => m.status === "good");
  for (const m of goodMetrics) {
    if (strengths.length < 5) strengths.push(`${m.name}: ${m.value}`);
  }

  return {
    ...s,
    narrative: strengths.length > 0
      ? `The model demonstrates ${strengths.length} notable strength${strengths.length > 1 ? "s" : ""}.`
      : "Strengths will emerge as the model develops further.",
    linkedMetrics: goodMetrics.map((m) => ({
      label: m.name,
      value: m.value,
      status: "good" as const,
      benchmark: m.benchmark,
      sourceEngine: "consultant" as const,
    })),
  };
}

function buildLenderReadiness(s: PacketSection, co: ConsultantOutput): PacketSection {
  return {
    ...s,
    narrative: `Lender Readiness: ${co.lenderReadiness}. ${co.lenderReadinessExplanation}`,
    linkedMetrics: [
      { label: "Readiness Level", value: co.lenderReadiness, status: co.lenderReadiness === "Strong" ? "good" : co.lenderReadiness === "Needs Work" ? "warning" : "danger", sourceEngine: "consultant" },
    ],
  };
}

function buildBoardActionItems(s: PacketSection, co: ConsultantOutput): PacketSection {
  const highPriority = co.recommendations.filter((r) => r.priority === "high");
  const medPriority = co.recommendations.filter((r) => r.priority === "medium");

  const items = [...highPriority, ...medPriority].slice(0, 5);
  const narrative = items.length > 0
    ? `There are ${items.length} recommended action item${items.length > 1 ? "s" : ""} for board consideration.`
    : "No specific board action items have been identified.";

  const rows: PacketTableRow[] = items.map((r) => ({
    label: r.title,
    values: [r.priority, r.description],
    isBold: r.priority === "high",
  }));

  return {
    ...s,
    narrative,
    tables: items.length > 0 ? [{
      title: "Recommended Actions",
      headers: ["Action", "Priority", "Details"],
      rows,
    }] : undefined,
  };
}

function buildAppendixAssumptions(
  s: PacketSection,
  md: ModelData,
  enrollment: number[],
): PacketSection {
  const sp = md.schoolProfile || ({} as SchoolProfile);
  const assumptions: LinkedAssumption[] = [];

  assumptions.push({ label: "School Name", value: sp.schoolName || "—", sourceField: "schoolProfile.schoolName" });
  assumptions.push({ label: "School Type", value: schoolTypeLabel(sp.schoolType), sourceField: "schoolProfile.schoolType" });
  assumptions.push({ label: "Entity Type", value: entityLabel(sp.entityType), sourceField: "schoolProfile.entityType" });
  assumptions.push({ label: "Funding Profile", value: fundingLabel(sp.fundingProfile), sourceField: "schoolProfile.fundingProfile" });
  assumptions.push({ label: "State", value: sp.state || "—", sourceField: "schoolProfile.state" });

  for (let i = 0; i < enrollment.length; i++) {
    assumptions.push({ label: `Year ${i + 1} Enrollment`, value: enrollment[i].toString(), sourceField: `enrollment.year${i + 1}` });
  }

  for (const row of (md.revenueRows || []).filter((r) => r.enabled !== false)) {
    assumptions.push({
      label: `Revenue: ${row.lineItem || "Line Item"}`,
      value: `${row.driverType || "annual"}, Y1: ${fmt(driverVal(row.amounts, 0, row.driverType || "annual", enrollment[0] || 0, row.escalationRate))}`,
      sourceField: `revenueRows[${row.id}]`,
    });
  }

  for (const nr of normalizeStaffingRows(md)) {
    assumptions.push({
      label: `Staff: ${nr.roleName || "Position"}`,
      value: `$${nr.annualizedRate.toLocaleString()}, ${nr.fte} FTE`,
      sourceField: `staffingRows[${nr.id}]`,
    });
  }

  return {
    ...s,
    narrative: `Complete list of ${assumptions.length} assumptions used in this financial model.`,
    linkedAssumptions: assumptions,
  };
}
