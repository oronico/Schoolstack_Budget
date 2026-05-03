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
  accountingBasisLabel,
  driverVal,
  computeMonthlyCashInflow,
  computeRevenueForYear,
  computePersonnelForYear,
  computeExpenseForYear,
  computeCapDebtForYear,
  computeDebtServiceForYear,
  normalizeStaffingRow,
  netIncomeLabel,
  computeTotalFTE,
  computeNewStudents,
  computeReturningStudents,
} from "../workbook-helpers";
import { buildNarrative } from "./build-narrative";
import { buildDecisionHistory, buildDecisionHistoryNarrative } from "./build-decision-history";
import {
  aggregateRosterCapSavings,
  buildRosterCapInsightText,
  CAP_INSIGHT_MIN_SAVINGS,
  detectFragileFunding,
  type FragileFundingReport,
  type SchoolType,
  defaultCollectionRateForMethod,
} from "@workspace/finance";
import {
  type PacketData,
  type PacketInput,
  type PacketSection,
  type PacketInsight,
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
  const { modelData, consultantOutput, modelId, packetType, personaComfort } = input;
  const sp = modelData.schoolProfile || ({} as SchoolProfile);
  const schoolName = sp.schoolName || "Untitled School";
  const narrative = buildNarrative(consultantOutput);
  const sectionIds = packetType === "lender" ? LENDER_SECTIONS : BOARD_SECTIONS;
  const niLabel = netIncomeLabel(sp.entityType);

  const enrollment = getEnrollmentArray(modelData.enrollment);
  const yearCount = 5;

  const yearlyData = computeYearlyData(modelData, enrollment, yearCount);

  const sections = sectionIds.map((id, idx) =>
    buildSection(id, idx, modelData, consultantOutput, yearlyData, enrollment, niLabel, personaComfort ?? null),
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
  const fac = (md as Record<string, unknown>).facilities as Record<string, unknown> | undefined;
  const salaryEsc = ((fac?.annualSalaryIncrease as number | undefined) ?? 0) / 100;
  const costInflPct = (fac?.generalCostInflation as number | undefined);
  const pktRR = (md.enrollment as Record<string, unknown> | undefined)?.retentionRate as number | undefined ?? 85;

  for (let y = 0; y < yearCount; y++) {
    const students = enrollment[y] || 0;
    const ns = computeNewStudents(enrollment, pktRR, y);
    const rs = computeReturningStudents(enrollment, pktRR, y);
    const totalRevenue = computeRevenueForYear(md.revenueRows || [], y, students, md.tuitionTiers, costInflPct, sp);
    const totalStaffing = computePersonnelForYear(normalized, salaryEsc, prorationFactor, y, students);
    const fte = computeTotalFTE(normalized, y, students);
    const opex = computeExpenseForYear(md.expenseRows || [], y, students, totalRevenue, costInflPct, ns, rs, fte);
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
  personaComfort: "new_to_budgeting" | "comfortable" | null,
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
      return buildStaffingPlan(base, md, co, yearlyData, personaComfort);
    case "expense_summary":
      return buildExpenseSummary(base, co, yearlyData);
    case "capital_debt":
      return buildCapitalDebt(base, md, co);
    case "five_year_projection":
      return buildFiveYearProjection(base, co, yearlyData, niLabel, md);
    case "prior_year_actuals":
      return buildPriorYearActuals(base, md, yearlyData, enrollment);
    case "opening_balance_sheet":
      return buildOpeningBalanceSheet(base, md);
    case "facility_kpis":
      return buildFacilityKPIs(base, md, yearlyData);
    case "cash_flow":
      return buildCashFlow(base, co, md, yearlyData);
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
    case "decision_history":
      return buildDecisionHistorySection(base, md);
    default:
      return base;
  }
}

function buildDecisionHistorySection(s: PacketSection, md: ModelData): PacketSection {
  // Detailed item list lives on the packet (LenderPacket.decisionHistory /
  // BoardPacket.decisionHistory) so the PDF renderers can lay it out richly.
  // Keep the JSON section narrative useful for non-PDF consumers and to keep
  // the empty-state copy here too.
  const items = buildDecisionHistory(md);
  return {
    ...s,
    narrative: buildDecisionHistoryNarrative(items),
  };
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
      ...(sp.accountingBasis ? [{ label: "Accounting Basis", value: accountingBasisLabel(sp.accountingBasis), sourceField: "schoolProfile.accountingBasis" }] : []),
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

  // Task #455 — surface a footnote whenever the revenue forecast leans on
  // a school-choice program whose legal status is unsettled. Without this,
  // a lender or board member reading the Revenue Model section sees the
  // headline numbers but no signal that, e.g., the OH EdChoice voucher line
  // is currently in litigation. We render litigated/blocked entries as a
  // warning-tone section callout (`insights[]`) AND attach an inline `note`
  // to the affected `linkedAssumptions` row so the caveat sits visually
  // next to the dollar value the lender is reading.
  const sp = (md.schoolProfile as SchoolProfile | undefined);
  const fragilityReport = detectFragileFunding(
    (md.revenueRows || []) as Array<{ id: string; lineItem?: string; enabled?: boolean; amounts?: number[] }>,
    sp?.state,
    sp?.schoolType as SchoolType | undefined,
    sp?.openingYear,
  );
  const revenueInsights: PacketInsight[] = buildFragilityInsights(fragilityReport);
  const fragilityByRowId = new Map<string, ReturnType<typeof buildFragilityNote>>();
  for (const m of fragilityReport.all) {
    fragilityByRowId.set(m.rowId, buildFragilityNote(m));
  }

  // Build the per-line "Revenue Lines" table the board PDF leans on (it
  // doesn't render `linkedAssumptions`). Including a Note column means the
  // fragility footnote shows up directly beside the line item the board
  // is reviewing, not just as a separate callout up top.
  const fragileRows = (md.revenueRows || []).filter((r) => r.enabled !== false);
  const lineRows: PacketTableRow[] = fragileRows.map((r) => {
    const note = fragilityByRowId.get(r.id);
    const value = fmt(driverVal(r.amounts, 0, r.driverType || "annual", yearlyData[0]?.students || 0, r.escalationRate));
    return {
      label: r.lineItem || "Revenue Line",
      // Render the note in the Y1 cell only when the table has a Note
      // column (i.e. fragilityReport has any matches). If we always added
      // a third column the lender PDF would gain a perpetually-empty
      // "Note" header for every model — undesired noise.
      values: fragilityReport.all.length > 0 ? [value, note?.short ?? ""] : [value],
    };
  });
  const tables: PacketTable[] = [{
    title: "Revenue by Year",
    headers: ["Year", "Total Revenue"],
    rows,
  }];
  if (lineRows.length > 0) {
    tables.push({
      title: "Revenue Lines (Year 1)",
      headers: fragilityReport.all.length > 0 ? ["Line Item", "Year 1", "Note"] : ["Line Item", "Year 1"],
      rows: lineRows,
    });
  }

  // Task #456: surface collection method & rate on the gross-tuition row in
  // the lender + board PDF revenue model section so reviewers can see the
  // assumption driving Y1 tuition cash without diving into the appendix.
  // Prepended to `linkedAssumptions` below so the cash-collection lever
  // sits at the top of the Supporting Assumptions block, ahead of the
  // per-line revenue rows (which already carry Task #455 fragility notes).
  const grossTuitionRow = (md.revenueRows || []).find(
    (r) => r.enabled !== false && (r.id === "gross_tuition" || r.category === "tuition_and_fees"),
  );
  const collectionAssumptions: LinkedAssumption[] = grossTuitionRow
    ? [
        {
          label: "Tuition Collection Method",
          value: collectionMethodLabel(grossTuitionRow.collectionMethod),
          sourceField: `revenueRows[${grossTuitionRow.id}].collectionMethod`,
        },
        {
          label: "Tuition Collection Rate",
          value: `${(grossTuitionRow.collectionRate ?? defaultCollectionRateForMethod(grossTuitionRow.collectionMethod)).toFixed(1)}%`,
          sourceField: `revenueRows[${grossTuitionRow.id}].collectionRate`,
        },
      ]
    : [];

  return {
    ...s,
    narrative,
    linkedMetrics,
    linkedAssumptions: [
      ...collectionAssumptions,
      ...fragileRows.map((r) => {
        const note = fragilityByRowId.get(r.id);
        return {
          label: r.lineItem || "Revenue Line",
          value: fmt(driverVal(r.amounts, 0, r.driverType || "annual", yearlyData[0]?.students || 0, r.escalationRate)),
          sourceField: `revenueRows[${r.id}]`,
          ...(note ? { note: note.full } : {}),
        };
      }),
    ],
    tables,
    ...(revenueInsights.length > 0 ? { insights: revenueInsights } : {}),
  };
}

function collectionMethodLabel(method?: string | null): string {
  if (!method) return "Autopay";
  if (method === "autopay") return "Autopay";
  if (method === "invoiced") return "Invoiced";
  if (method === "mixed") return "Mixed (autopay + invoiced)";
  return method;
}

/**
 * Two flavors of the fragility note:
 *  - `short` is intended for narrow table cells (board PDF Note column);
 *    just the program.notes string (or a status fallback) so it fits in
 *    the table layout.
 *  - `full` is the longer sentence rendered inline under the lender PDF
 *    linked-assumption row. Includes the year span when known so the
 *    lender immediately sees how many forecast years depend on the
 *    fragile dollars.
 */
function buildFragilityNote(m: import("@workspace/finance").FragileProgramMatch): { short: string; full: string } {
  const statusVerb =
    m.status === "litigated"
      ? "is currently in litigation"
      : m.status === "blocked"
        ? "is currently blocked by court order"
        : "is authorized but not yet disbursing funds";
  const yearSpan = m.yearRange
    ? m.yearRange.firstYear === m.yearRange.lastYear
      ? ` (Year ${m.yearRange.firstYear})`
      : ` (Years ${m.yearRange.firstYear}–${m.yearRange.lastYear})`
    : "";
  const noteSuffix = m.notes ? ` ${m.notes}` : "";
  return {
    short: m.notes ?? `${m.status[0].toUpperCase()}${m.status.slice(1)}`,
    full: `${m.stateCode} ${m.programLabel} ${statusVerb}${yearSpan}.${noteSuffix}`,
  };
}

function buildFragilityInsights(report: FragileFundingReport): PacketInsight[] {
  const insights: PacketInsight[] = [];
  // Group by status so a state with multiple fragile programs (e.g. OH with
  // both an active EdChoice and a litigated expansion) collapses into one
  // callout per tone instead of cluttering the section with one chip each.
  if (report.litigated.length > 0 || report.blocked.length > 0) {
    const items = [...report.litigated, ...report.blocked]
      .map((m) => {
        const verb = m.status === "litigated" ? "in active litigation" : "blocked by court order";
        const note = m.notes ? ` — ${m.notes}` : "";
        return `${m.stateCode} ${m.programLabel} (${verb})${note}`;
      })
      .join("; ");
    insights.push({
      label: "Funding source under legal challenge",
      body: `This 5-year forecast counts on revenue from: ${items}. Lenders and the board should review the school's backstop plan if these programs are paused or struck down.`,
      tone: "warning",
    });
  }
  if (report.pending.length > 0) {
    const items = report.pending
      .map((m) => {
        const note = m.notes ? ` — ${m.notes}` : "";
        return `${m.stateCode} ${m.programLabel}${note}`;
      })
      .join("; ");
    insights.push({
      label: "Funding source pending go-live",
      body: `Revenue is forecast from programs authorized but not yet disbursing: ${items}. Confirm the program's expected start date with the state before relying on Year 1 dollars.`,
      tone: "info",
    });
  }
  return insights;
}

function buildStaffingPlan(
  s: PacketSection,
  md: ModelData,
  co: ConsultantOutput,
  yearlyData: YearData[],
  personaComfort: "new_to_budgeting" | "comfortable" | null,
): PacketSection {
  const y1Staff = yearlyData[0]?.totalStaffing || 0;
  const y1Rev = yearlyData[0]?.totalRevenue || 0;
  const staffPct = y1Rev > 0 ? y1Staff / y1Rev : 0;

  const costComp = co.costComposition[0];
  const narrative = `Staffing costs are ${fmt(y1Staff)} in Year 1, representing ${pct(staffPct)} of revenue. ${staffPct > 0.6 ? "This is above the typical 50-60% benchmark and may need monitoring." : staffPct > 0.5 ? "This is within the typical 50-60% range." : "This leaves healthy room for other operating costs."}`;

  // Surface the wage-base cap savings insight (Task #322 → promoted to a
  // dedicated callout in #326): aggregate every staffing row that has a
  // per-component breakdown + an annualized salary, then push a structured
  // insight onto the section so renderers can style it as a callout (icon +
  // bordered card) instead of appending a sentence to the staffing paragraph.
  // Rows missing `payrollTaxComponents` (e.g. legacy models saved before
  // Task #319 / contractors that opt out of payroll-like math) are skipped
  // inside `aggregateRosterCapSavings`.
  const normalized = normalizeStaffingRows(md);
  const capAggregate = aggregateRosterCapSavings(
    normalized.map((r) => ({
      annualizedRate: r.annualizedRate,
      fte: r.fte,
      payrollTaxComponents: r.payrollTaxComponents,
      // Forward the exclusion-relevant fields so the shared aggregator can
      // skip rows that should not contribute (manual blended-rate overrides
      // and contract-not-payroll-like rows). Dropping these would cause the
      // PDF callout to overstate savings vs. the wizard.
      payrollTaxRateOverridden: r.payrollTaxRateOverridden,
      employmentType: r.employmentType,
      payrollLike: r.payrollLike,
    })),
  );
  const insights: PacketInsight[] = [];
  if (capAggregate && capAggregate.totalSavings >= CAP_INSIGHT_MIN_SAVINGS) {
    insights.push({
      label: "Wage-base savings",
      body: buildRosterCapInsightText(capAggregate, personaComfort),
      tone: "info",
    });
  }

  const linkedMetrics: LinkedMetric[] = costComp
    ? [{ label: "Staffing % of Revenue", value: pct(costComp.staffingPctOfRevenue), status: costComp.staffingPctOfRevenue > 0.6 ? "warning" as const : "good" as const, sourceEngine: "consultant" as const }]
    : [];

  return {
    ...s,
    narrative,
    linkedMetrics,
    linkedAssumptions: normalized.map((nr) => ({
      label: nr.roleName || "Staff Position",
      value: `$${nr.annualizedRate.toLocaleString()}, ${nr.fte} FTE`,
      sourceField: `staffingRows[${nr.id}]`,
    })),
    ...(insights.length > 0 ? { insights } : {}),
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
  md: ModelData,
): PacketSection {
  const rows: PacketTableRow[] = yearlyData.map((yd) => ({
    label: yearLabel(yd.year),
    values: [yd.students.toString(), fmt(yd.totalRevenue), fmt(yd.totalExpenses), fmt(yd.netIncome), pct(yd.netMargin)],
  }));

  const breakEvenYear = yearlyData.findIndex((yd) => yd.netIncome >= 0);
  const breakEvenText = breakEvenYear >= 0
    ? `The model reaches break-even in Year ${breakEvenYear + 1}.`
    : "The model does not reach break-even within the 5-year projection.";

  const y1 = yearlyData[0];

  // Task #362: surface the breakeven enrollment + cushion sentence as its own
  // structured callout instead of gluing it onto the narrative paragraph.
  // Lenders and board members scan for this number, so it deserves its own
  // bordered card via `drawInsightCallout` rather than being buried mid-
  // sentence after the break-even-year line.
  const insights: PacketInsight[] = [];
  if (y1 && y1.students > 0 && y1.totalRevenue > 0) {
    const revPerStudent = y1.totalRevenue / y1.students;
    let y1VarCostPerStudent = 0;
    let y1FixedCosts = y1.totalStaffing;
    for (const e of (md.expenseRows || [])) {
      if (e.enabled === false) continue;
      const dt = e.driverType;
      if (dt === "per_student" || dt === "per_new_student" || dt === "per_returning_student") {
        y1VarCostPerStudent += e.amounts?.[0] ?? 0;
      } else if (dt !== "percent_of_revenue") {
        y1FixedCosts += driverVal(e.amounts, 0, dt, y1.students);
      }
    }
    y1FixedCosts += y1.debtService;
    const contribMargin = revPerStudent - y1VarCostPerStudent;
    const breakevenEnroll = contribMargin > 0 ? Math.ceil(y1FixedCosts / contribMargin) : 0;
    if (breakevenEnroll > 0 && breakevenEnroll !== Infinity) {
      const cushionPct = ((y1.students - breakevenEnroll) / breakevenEnroll * 100).toFixed(0);
      insights.push({
        label: "Breakeven enrollment",
        body: `Breakeven enrollment is ${breakevenEnroll} students (${y1.students >= breakevenEnroll ? `${cushionPct}% above` : `${Math.abs(Number(cushionPct))}% below`} Year 1 enrollment).`,
        tone: "info",
      });
    }
  }

  // Task #362: prior-year revenue variance graduates from the narrative to
  // its own callout. A large swing (>=20% in either direction) flips the
  // tone to "warning" so the amber accent flags an unusual jump or drop for
  // the reader.
  const priorYear = md.priorYearSnapshot;
  if (priorYear?.totalRevenue && y1) {
    const revVarianceNum = (y1.totalRevenue - priorYear.totalRevenue) / priorYear.totalRevenue * 100;
    const revVariance = revVarianceNum.toFixed(1);
    insights.push({
      label: "Prior-year comparison",
      body: `Prior-year revenue was ${fmt(priorYear.totalRevenue)}; Year 1 projections represent a ${revVariance}% change.`,
      tone: Math.abs(revVarianceNum) >= 20 ? "warning" : "info",
    });
  }

  const metrics: LinkedMetric[] = co.keyMetrics.map((m) => ({
    label: m.name,
    value: m.value,
    status: m.status,
    benchmark: m.benchmark,
    sourceEngine: "consultant" as const,
  }));

  const sp = md.schoolProfile || {};
  const currentBasis = sp.accountingBasis ? accountingBasisLabel(sp.accountingBasis).toLowerCase() : "undetermined";
  const basisNote = ` All projections are prepared on an accrual basis; the school currently keeps books on a ${currentBasis} basis.`;

  return {
    ...s,
    narrative: `${breakEvenText} Year 5 ${niLabel.toLowerCase()} is projected at ${fmt(yearlyData[4]?.netIncome || 0)} (${pct(yearlyData[4]?.netMargin || 0)} margin).${basisNote}`,
    tables: [{
      title: `5-Year ${niLabel} Projection`,
      headers: ["Year", "Students", "Revenue", "Expenses", niLabel, "Margin"],
      rows,
    }],
    linkedMetrics: metrics,
    ...(insights.length > 0 ? { insights } : {}),
  };
}

function buildPriorYearActuals(s: PacketSection, md: ModelData, yearlyData: YearData[], enrollment: number[]): PacketSection {
  const py = md.priorYearSnapshot;
  if (!py) return { ...s, included: false, narrative: "No prior-year data provided." };

  const y1 = yearlyData[0];
  const y1Rev = y1?.totalRevenue ?? 0;
  const y1Exp = y1?.totalExpenses ?? 0;

  const pyTuition = py.tuitionRevenue ?? 0;
  const pyPublicFunding = py.publicFundingRevenue ?? 0;
  const pyPhilanthropy = py.philanthropyRevenue ?? 0;
  const pyOtherRev = py.otherRevenue ?? 0;
  const pyTotalRev = py.totalRevenue ?? (pyTuition + pyPublicFunding + pyPhilanthropy + pyOtherRev);

  const pyPersonnel = py.personnelExpenses ?? 0;
  const pyFacility = py.facilityExpenses ?? 0;
  const pyInstructional = py.instructionalExpenses ?? 0;
  const pyAdmin = py.adminExpenses ?? 0;
  const pyTotalExp = py.totalExpenses ?? (pyPersonnel + pyFacility + pyInstructional + pyAdmin);

  const students0 = enrollment[0] || 0;
  const sp = md.schoolProfile || ({} as SchoolProfile);
  const costInflPct = (sp as Record<string, unknown>).costInflationPct as number | undefined;
  const rRows = md.revenueRows || [];
  const revById = new Map<string, number>();
  for (const r of rRows) {
    if (!r.enabled || r.driverType === "percent_of_base") continue;
    revById.set(r.id, driverVal(r.amounts, 0, r.driverType, students0, undefined, costInflPct));
  }
  for (const r of rRows) {
    if (!r.enabled || r.driverType !== "percent_of_base") continue;
    const base = revById.get(r.percentBase || "") || 0;
    revById.set(r.id, base * ((r.amounts?.[0] ?? 0) / 100));
  }
  const revByCat = new Map<string, number>();
  for (const r of rRows) {
    if (!r.enabled) continue;
    const v = revById.get(r.id) || 0;
    const cat = r.category || "other_revenue";
    const sign = cat === "tuition_offsets" ? -1 : 1;
    revByCat.set(cat, (revByCat.get(cat) || 0) + v * sign);
  }
  const projTuition = (revByCat.get("tuition_and_fees") || 0) + (revByCat.get("tuition_offsets") || 0);
  const projPublic = (revByCat.get("public_funding") || 0) + (revByCat.get("school_choice") || 0);
  const projPhil = (revByCat.get("philanthropy") || 0) + (revByCat.get("grants_contributions") || 0);
  const projOther = revByCat.get("other_revenue") || 0;

  const eRows = md.expenseRows || [];
  const expByCat = new Map<string, number>();
  for (const e of eRows) {
    if (!e.enabled) continue;
    const val = e.driverType === "percent_of_revenue"
      ? ((e.amounts?.[0] ?? 0) / 100) * y1Rev
      : driverVal(e.amounts, 0, e.driverType, students0, undefined, costInflPct);
    expByCat.set(e.category, (expByCat.get(e.category) || 0) + val);
  }
  const salaryEsc = (sp as Record<string, unknown>).salaryEscalation as number | undefined;
  const prorationFactor = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 12) / 12 : 1;
  const normalized = normalizeStaffingRows(md);
  const projPersonnel = computePersonnelForYear(normalized, salaryEsc || 0, prorationFactor, 0, students0);
  const projFacility = expByCat.get("occupancy_facility") || 0;
  const projInstructional = expByCat.get("instructional_program") || 0;
  const projAdmin = (expByCat.get("administrative_general") || 0) + (expByCat.get("technology") || 0);

  const fmtVar = (py: number, proj: number) => py > 0 ? `${((proj - py) / py * 100) >= 0 ? "+" : ""}${((proj - py) / py * 100).toFixed(1)}%` : "—";

  const revRows: PacketTableRow[] = [
    { label: "Tuition & Fees", values: [fmt(pyTuition), fmt(projTuition), fmtVar(pyTuition, projTuition)] },
    { label: "Public Funding", values: [fmt(pyPublicFunding), fmt(projPublic), fmtVar(pyPublicFunding, projPublic)] },
    { label: "Philanthropy", values: [fmt(pyPhilanthropy), fmt(projPhil), fmtVar(pyPhilanthropy, projPhil)] },
    { label: "Other Revenue", values: [fmt(pyOtherRev), fmt(projOther), fmtVar(pyOtherRev, projOther)] },
    { label: "Total Revenue", values: [fmt(pyTotalRev), fmt(y1Rev), fmtVar(pyTotalRev, y1Rev)], isBold: true },
  ];

  const expRows: PacketTableRow[] = [
    { label: "Personnel & Benefits", values: [fmt(pyPersonnel), fmt(projPersonnel), fmtVar(pyPersonnel, projPersonnel)] },
    { label: "Facilities & Occupancy", values: [fmt(pyFacility), fmt(projFacility), fmtVar(pyFacility, projFacility)] },
    { label: "Instructional Supplies", values: [fmt(pyInstructional), fmt(projInstructional), fmtVar(pyInstructional, projInstructional)] },
    { label: "Admin & Operations", values: [fmt(pyAdmin), fmt(projAdmin), fmtVar(pyAdmin, projAdmin)] },
    { label: "Total Expenses", values: [fmt(pyTotalExp), fmt(y1Exp), fmtVar(pyTotalExp, y1Exp)], isBold: true },
  ];

  const pyNet = pyTotalRev - pyTotalExp;
  const varianceRows: PacketTableRow[] = [];
  if (y1Rev > 0) {
    varianceRows.push(
      { label: "Net Income", values: [fmt(pyNet), fmt(y1Rev - y1Exp), ""], isBold: true },
    );
  }

  const tables: PacketTable[] = [
    { title: "Prior-Year Revenue vs Year 1", headers: ["Category", "Prior Year", "Year 1", "Variance"], rows: revRows },
    { title: "Prior-Year Expenses vs Year 1", headers: ["Category", "Prior Year", "Year 1", "Variance"], rows: expRows },
  ];
  if (varianceRows.length > 0) {
    tables.push({ title: "Net Income Comparison", headers: ["", "Prior Year", "Year 1", ""], rows: varianceRows });
  }

  return {
    ...s,
    narrative: `Prior-year net income was ${fmt(pyNet)} on revenue of ${fmt(pyTotalRev)}.`,
    tables,
  };
}

function buildOpeningBalanceSheet(s: PacketSection, md: ModelData): PacketSection {
  const ob = md.openingBalances;
  if (!ob) return { ...s, included: false, narrative: "No opening balance sheet provided." };

  const cash = ob.cash ?? 0;
  const ar = ob.accountsReceivable ?? 0;
  const fixedAssets = ob.fixedAssets ?? 0;
  const otherAssets = ob.otherAssets ?? 0;
  const totalAssets = cash + ar + fixedAssets + otherAssets;

  const ap = ob.accountsPayable ?? 0;
  const currentDebt = ob.currentDebtPortion ?? 0;
  const longTermDebt = ob.longTermDebt ?? 0;
  const totalLiabilities = ap + currentDebt + longTermDebt;
  const netPosition = totalAssets - totalLiabilities;

  const assetRows: PacketTableRow[] = [
    { label: "Cash & Equivalents", values: [fmt(cash)] },
    { label: "Accounts Receivable", values: [fmt(ar)] },
    { label: "Fixed Assets", values: [fmt(fixedAssets)] },
    { label: "Other Assets", values: [fmt(otherAssets)] },
    { label: "Total Assets", values: [fmt(totalAssets)], isBold: true },
  ];
  const liabRows: PacketTableRow[] = [
    { label: "Accounts Payable", values: [fmt(ap)] },
    { label: "Current Debt Portion", values: [fmt(currentDebt)] },
    { label: "Long-Term Debt", values: [fmt(longTermDebt)] },
    { label: "Total Liabilities", values: [fmt(totalLiabilities)], isBold: true },
  ];

  return {
    ...s,
    narrative: `Net position at model start: ${fmt(netPosition)}.`,
    tables: [
      { title: "Assets", headers: ["Item", "Amount"], rows: assetRows },
      { title: "Liabilities", headers: ["Item", "Amount"], rows: liabRows },
    ],
    linkedMetrics: [
      { label: "Total Assets", value: fmt(totalAssets), sourceEngine: "workbook-helpers" },
      { label: "Total Liabilities", value: fmt(totalLiabilities), sourceEngine: "workbook-helpers" },
      { label: "Net Position", value: fmt(netPosition), sourceEngine: "workbook-helpers" },
    ],
  };
}

function buildFacilityKPIs(s: PacketSection, md: ModelData, yearlyData: YearData[]): PacketSection {
  const y1 = yearlyData[0];
  if (!y1 || y1.students === 0) return { ...s, included: false, narrative: "No Year 1 data available." };

  const facilityPhases = md.schoolProfile?.facilityPhases || (md as Record<string, unknown>).facilityPhases as Array<Record<string, unknown>> | undefined;
  let sqft = 0;
  let hasRenewalOption = false;
  let earliestExpiry: string | undefined;
  for (const fp of (facilityPhases || [])) {
    const sq = (fp as Record<string, unknown>).squareFootage as number | undefined;
    if (sq) sqft += sq;
    if ((fp as Record<string, unknown>).hasRenewalOption) hasRenewalOption = true;
    const endDate = (fp as Record<string, unknown>).facilityArrangementEndDate as string | undefined;
    if (endDate && (!earliestExpiry || endDate < earliestExpiry)) earliestExpiry = endDate;
  }
  let leaseTermMonths: number | undefined;
  if (earliestExpiry) {
    const end = new Date(earliestExpiry);
    const now = new Date();
    leaseTermMonths = Math.max(0, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  }

  const occupancyExpense = (md.expenseRows || [])
    .filter(e => e.enabled !== false && e.category === "occupancy_facility")
    .reduce((sum, e) => {
      if (e.driverType === "percent_of_revenue") {
        return sum + ((e.amounts?.[0] ?? 0) / 100) * y1.totalRevenue;
      }
      return sum + driverVal(e.amounts, 0, e.driverType, y1.students);
    }, 0);

  const costPerStudent = occupancyExpense / y1.students;
  const costPerSqft = sqft > 0 ? occupancyExpense / sqft : 0;

  let y1VarCostPerStudent = 0;
  let y1FixedCosts = y1.totalStaffing;
  for (const e of (md.expenseRows || [])) {
    if (e.enabled === false) continue;
    const dt = e.driverType;
    if (dt === "per_student" || dt === "per_new_student" || dt === "per_returning_student") {
      y1VarCostPerStudent += e.amounts?.[0] ?? 0;
    } else if (dt !== "percent_of_revenue") {
      y1FixedCosts += driverVal(e.amounts, 0, dt, y1.students);
    }
  }
  y1FixedCosts += y1.debtService;
  const revPerStudent = y1.totalRevenue / y1.students;
  const contribMargin = revPerStudent - y1VarCostPerStudent;
  const breakevenEnroll = contribMargin > 0 ? Math.ceil(y1FixedCosts / contribMargin) : 0;

  const kpiRows: PacketTableRow[] = [
    { label: "Facility Cost / Student", values: [fmt(costPerStudent)] },
  ];
  if (sqft > 0) kpiRows.push({ label: "Facility Cost / Sq Ft", values: [`$${costPerSqft.toFixed(2)}`] });
  if (sqft > 0) kpiRows.push({ label: "Total Square Footage", values: [sqft.toLocaleString()] });
  if (leaseTermMonths !== undefined) kpiRows.push({ label: "Lease Term Remaining", values: [`${leaseTermMonths} months`] });
  kpiRows.push({ label: "Renewal Option", values: [hasRenewalOption ? "Yes" : "No"] });
  kpiRows.push({ label: "Breakeven Enrollment", values: [breakevenEnroll > 0 ? `${breakevenEnroll} students` : "N/A"] });
  if (breakevenEnroll > 0) {
    const cushion = ((y1.students - breakevenEnroll) / breakevenEnroll) * 100;
    kpiRows.push({ label: "Enrollment Cushion", values: [`${cushion >= 0 ? "+" : ""}${cushion.toFixed(1)}%`], isBold: cushion < 0 });
  }

  return {
    ...s,
    narrative: breakevenEnroll > 0
      ? `Breakeven enrollment is ${breakevenEnroll} students. Year 1 projects ${y1.students} students, providing a ${(((y1.students - breakevenEnroll) / breakevenEnroll) * 100).toFixed(1)}% cushion.`
      : "Unable to compute breakeven with current model assumptions.",
    tables: [{ title: "Key Performance Indicators", headers: ["Metric", "Value"], rows: kpiRows }],
    linkedMetrics: [
      { label: "Breakeven Enrollment", value: breakevenEnroll > 0 ? `${breakevenEnroll}` : "N/A", sourceEngine: "workbook-helpers" },
      { label: "Facility Cost/Student", value: fmt(costPerStudent), sourceEngine: "workbook-helpers" },
    ],
  };
}

function buildCashFlow(s: PacketSection, co: ConsultantOutput, md: ModelData, yearlyData: YearData[]): PacketSection {
  const runwayText = co.cashRunwayMonths >= 60
    ? "Cash stays positive throughout the entire 5-year projection."
    : `Cash goes negative in month ${co.cashRunwayMonths}. The school will need additional funding or cost adjustments.`;

  const rows: PacketTableRow[] = co.cumulativeFinancials.map((cf) => ({
    label: yearLabel(cf.year - 1),
    values: [fmt(cf.cumulativeNetIncome), `${cf.reserveMonths.toFixed(1)} months`],
  }));

  const y1 = yearlyData[0];
  const ob = md.openingBalances;
  let openingNote = "";
  if (ob && ((ob.cash || 0) > 0)) {
    const totalAssets = (ob.cash || 0) + (ob.accountsReceivable || 0) + (ob.fixedAssets || 0) + (ob.otherAssets || 0);
    const totalLiabilities = (ob.accountsPayable || 0) + (ob.currentDebtPortion || 0) + (ob.longTermDebt || 0);
    openingNote = ` Opening balance: ${fmt(totalAssets)} total assets, ${fmt(totalLiabilities)} total liabilities, ${fmt(totalAssets - totalLiabilities)} net position.`;
  }

  const monthlyTable: PacketTable | undefined = y1 && y1.totalRevenue > 0 ? {
    title: "Year 1 Monthly Cash Flow Summary",
    headers: ["Month", "Beginning", "Inflows", "Outflows", "Net Cash Flow", "Ending"],
    rows: (() => {
      const calendarMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const fyStart = ((md.schoolProfile?.fiscalYearStartMonth || 7) - 1);
      const monthlyInflows = computeMonthlyCashInflow(md.revenueRows || [], 0, y1.students);
      const monthlyOutflow = y1.totalExpenses / 12;
      const startingCash = ob?.cash ?? 0;
      let running = startingCash;
      const monthRows: PacketTableRow[] = [];
      for (let i = 0; i < 12; i++) {
        const mIdx = (fyStart + i) % 12;
        const begin = running;
        const netCash = monthlyInflows[i] - monthlyOutflow;
        const end = begin + netCash;
        monthRows.push({
          label: calendarMonths[mIdx],
          values: [fmt(begin), fmt(monthlyInflows[i]), `(${fmt(monthlyOutflow)})`, fmt(netCash), fmt(end)],
          isBold: end < 0,
        });
        running = end;
      }
      return monthRows;
    })(),
  } : undefined;

  const tables: PacketTable[] = [
    { title: "Cumulative Cash Position", headers: ["Year", "Cumulative Net Income", "Reserve Months"], rows },
  ];
  if (monthlyTable) tables.push(monthlyTable);

  return {
    ...s,
    narrative: `${runwayText}${openingNote}`,
    linkedMetrics: [
      { label: "Cash Runway", value: co.cashRunwayMonths >= 60 ? "60+ months" : `${co.cashRunwayMonths} months`, sourceEngine: "consultant" },
    ],
    tables,
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
    // Task #456: include collection method + rate next to each tuition-flavored
    // line so the appendix carries the same assumption surface area in lender
    // and board packets.
    if (row.category === "tuition_and_fees" || row.category === "tuition_offsets") {
      const methodLabel = collectionMethodLabel(row.collectionMethod);
      const rateValue = (row.collectionRate ?? defaultCollectionRateForMethod(row.collectionMethod)).toFixed(1);
      assumptions.push({
        label: `  ↳ ${row.lineItem || "Line Item"} — Collection`,
        value: `${methodLabel} @ ${rateValue}%`,
        sourceField: `revenueRows[${row.id}].collectionMethod`,
      });
    }
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
