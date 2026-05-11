/**
 * Task #328 — unit coverage for the wage-base savings sentence in the
 * Personnel section of the lender and board packet PDFs.
 *
 * Task #322 added a persona-aware "wage-base savings" callout to the
 * Staffing Plan section of `buildPacketData`. The callout is surfaced as a
 * structured `PacketInsight` (`insights[]`) so renderers can draw it as a
 * bordered card; the prose itself comes from `buildRosterCapInsightText`
 * in `@workspace/finance`.
 *
 * The end-to-end board test (`tests/board-packet-cap-insight.ts`) already
 * walks the full Build → PDF pipeline. This module asserts the upstream
 * wiring directly against `buildPacketData` so a refactor that drops the
 * insight from the lender packet (or only from one persona variant) is
 * caught before it reaches the PDF layer.
 *
 * Coverage:
 *   1. Lender + board packets both surface the wage-base insight on the
 *      `staffing_plan` section when the roster has a high-salary role
 *      with per-component breakdowns, with the expected dollar figure.
 *   2. The insight is absent for a low-salary roster that doesn't clear
 *      any wage-base cap.
 *   3. The `comfortable` and `new_to_budgeting` personas use distinct,
 *      persona-correct wording for the same roster.
 */
import {
  aggregateRosterCapSavings,
  buildRosterCapInsightText,
  computeYear1MonthlyCashFlow,
  findLowestCashMonth,
  type MonthlyRevenueRowLike,
  type PayrollTaxComponent,
} from "@workspace/finance";
import { runConsultantEngine } from "../../consultant-engine.js";
import {
  computeCapDebtForYear,
  computeDebtServiceForYear,
  computeExpenseForYear,
  computeNewStudents,
  computePersonnelForYear,
  computeReturningStudents,
  computeRevenueForYear,
  computeTotalFTE,
  getEnrollmentArray,
  normalizeStaffingRow,
  type ModelData,
} from "../../workbook-helpers.js";
import { buildPacketData } from "../build-packet-data.js";
import type { PacketInsight, PacketType } from "../packet-types.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// Realistic Washington-state component set: FICA SS + WA SUI + WA PFML all
// have wage-base caps, so a $200k salary clears multiple caps and the
// resulting savings number is non-trivial. Keeping this in sync with the
// fixture used in tests/board-packet-cap-insight.ts.
const WA_COMPONENTS: PayrollTaxComponent[] = [
  { label: "FICA SS", rate: 6.2, wageBase: 176_100 },
  { label: "Medicare", rate: 1.45 },
  { label: "FUTA", rate: 0.6, wageBase: 7_000 },
  { label: "WA SUI", rate: 1.22, wageBase: 72_800 },
  { label: "WA PFML", rate: 0.28, wageBase: 176_100 },
];

function highSalaryRow(id: string, roleName: string): Record<string, unknown> {
  return {
    id,
    roleName,
    functionCategory: "school_leadership",
    employmentType: "full_time",
    fte: 1,
    annualizedRate: 200_000,
    benefitsEligible: true,
    benefitsRate: 25,
    payrollTaxRate: 9.95,
    payrollLike: true,
    payrollTaxComponents: WA_COMPONENTS,
    notes: "",
    staffingMode: "fixed",
  };
}

function lowSalaryRow(id: string, roleName: string): Record<string, unknown> {
  return {
    id,
    roleName,
    functionCategory: "instructional",
    // Below the lowest cap (FUTA $7k) so no component is "capped" by the
    // helper and the insight should be suppressed.
    employmentType: "full_time",
    fte: 1,
    annualizedRate: 6_500,
    benefitsEligible: false,
    benefitsRate: 0,
    payrollTaxRate: 7.65,
    payrollLike: true,
    payrollTaxComponents: WA_COMPONENTS,
    notes: "",
    staffingMode: "fixed",
  };
}

// Minimal but valid model fixture: just enough revenue + enrollment for the
// consultant engine to produce a usable ConsultantOutput. The cap-savings
// math only depends on `staffingRows`, so everything else can stay small.
function buildModel(staffingRows: Record<string, unknown>[]): Record<string, unknown> {
  return {
    schoolProfile: {
      schoolName: "Wage Base Test School",
      state: "WA",
      schoolType: "microschool",
      entityType: "llc_single",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 25,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      ownershipType: "rent",
      monthlyRent: 2000,
      annualRentEscalation: 3,
      debtIncluded: false,
    },
    enrollment: { year1: 12, year2: 18, year3: 22, year4: 25, year5: 25 },
    revenueRows: [
      {
        id: "r1",
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "per_student",
        amounts: [12000, 12360, 12731, 13113, 13506],
        billingMonths: 12,
      },
    ],
    staffingRows,
    expenseRows: [
      {
        id: "e1",
        category: "occupancy_facility",
        lineItem: "Rent",
        enabled: true,
        driverType: "monthly",
        amounts: [2000, 2060, 2122, 2186, 2251],
      },
    ],
    capitalAndDebtRows: [],
    facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
  };
}

async function buildPacketWith(
  staffingRows: Record<string, unknown>[],
  packetType: PacketType,
  personaComfort: "new_to_budgeting" | "comfortable" | null,
) {
  const model = buildModel(staffingRows);
  const consultantOutput = await runConsultantEngine(model);
  return buildPacketData({
    modelData: model as unknown as ModelData,
    consultantOutput,
    modelId: 1,
    packetType,
    personaComfort,
  });
}

function findStaffingInsight(
  insights: PacketInsight[] | undefined,
): PacketInsight | undefined {
  return (insights ?? []).find((i) => i.label === "Wage-base savings");
}

async function run(): Promise<void> {
  // Compute the expected savings dollars from the shared finance helper so
  // this test breaks loudly if the helper math drifts (rather than
  // silently asserting against a stale literal).
  const aggregate = aggregateRosterCapSavings([
    {
      annualizedRate: 200_000,
      fte: 1,
      payrollTaxComponents: WA_COMPONENTS,
      payrollLike: true,
      employmentType: "full_time",
    },
  ]);
  if (!aggregate) {
    console.error("FAIL: aggregateRosterCapSavings returned null for a high-salary fixture");
    process.exit(1);
  }
  const expectedSavings = `$${aggregate.totalSavings.toLocaleString()}/yr`;
  const expectedComfortableBody = buildRosterCapInsightText(aggregate, "comfortable");
  const expectedNewToBudgetingBody = buildRosterCapInsightText(aggregate, "new_to_budgeting");

  // ---- 1a. Lender PDF + comfortable persona surfaces the insight ----------
  const lenderComfortable = await buildPacketWith(
    [highSalaryRow("s1", "Head of School")],
    "lender",
    "comfortable",
  );
  const lenderStaffing = lenderComfortable.sections.find((s) => s.id === "staffing_plan");
  check(
    "lender packet includes the staffing_plan section",
    !!lenderStaffing,
    "LENDER_SECTIONS dropped 'staffing_plan' — the cap-savings sentence cannot reach the lender PDF without it",
  );
  const lenderInsight = findStaffingInsight(lenderStaffing?.insights);
  check(
    "lender (comfortable) staffing_plan exposes a 'Wage-base savings' insight",
    !!lenderInsight,
    `insights were: ${JSON.stringify(lenderStaffing?.insights ?? [])}`,
  );
  check(
    "lender (comfortable) insight body includes the expected savings dollars",
    !!lenderInsight && lenderInsight.body.includes(expectedSavings),
    `expected to find "${expectedSavings}" in: ${lenderInsight?.body ?? "(missing)"}`,
  );
  check(
    "lender (comfortable) insight body matches the shared comfortable copy",
    !!lenderInsight && lenderInsight.body === expectedComfortableBody,
    `expected: ${expectedComfortableBody}\n         got: ${lenderInsight?.body ?? "(missing)"}`,
  );

  // ---- 1b. Board PDF + comfortable persona surfaces the insight ----------
  const boardComfortable = await buildPacketWith(
    [highSalaryRow("s1", "Head of School")],
    "board",
    "comfortable",
  );
  const boardStaffing = boardComfortable.sections.find((s) => s.id === "staffing_plan");
  check(
    "board packet includes the staffing_plan section",
    !!boardStaffing,
    "BOARD_SECTIONS dropped 'staffing_plan' — the cap-savings sentence cannot reach the board PDF without it",
  );
  const boardInsight = findStaffingInsight(boardStaffing?.insights);
  check(
    "board (comfortable) staffing_plan exposes a 'Wage-base savings' insight",
    !!boardInsight,
    `insights were: ${JSON.stringify(boardStaffing?.insights ?? [])}`,
  );
  check(
    "board (comfortable) insight body includes the expected savings dollars",
    !!boardInsight && boardInsight.body.includes(expectedSavings),
    `expected to find "${expectedSavings}" in: ${boardInsight?.body ?? "(missing)"}`,
  );

  // ---- 2. Low-salary roster suppresses the insight on both packet types ---
  for (const packetType of ["lender", "board"] as PacketType[]) {
    const lowPacket = await buildPacketWith(
      [lowSalaryRow("s1", "Aide")],
      packetType,
      "comfortable",
    );
    const lowStaffing = lowPacket.sections.find((s) => s.id === "staffing_plan");
    const lowInsight = findStaffingInsight(lowStaffing?.insights);
    check(
      `${packetType} packet emits no wage-base insight when no role clears a cap`,
      !lowInsight,
      `insights were: ${JSON.stringify(lowStaffing?.insights ?? [])}`,
    );
    check(
      `${packetType} narrative does not leak the wage-base sentence either`,
      !!lowStaffing && !lowStaffing.narrative.includes("Wage-base caps hit on") &&
        !lowStaffing.narrative.includes("earn above the wage-base cap"),
      `narrative was: ${lowStaffing?.narrative ?? "(missing section)"}`,
    );
  }

  // ---- 3. Persona variants produce distinct wording for the same roster ---
  // Re-run lender packet with the new_to_budgeting persona and confirm the
  // body switches to the plain-English variant. Doing this on the lender
  // side complements the comfortable assertions above for the board side.
  const lenderNewToBudgeting = await buildPacketWith(
    [highSalaryRow("s1", "Head of School")],
    "lender",
    "new_to_budgeting",
  );
  const lenderNewToBudgetingInsight = findStaffingInsight(
    lenderNewToBudgeting.sections.find((s) => s.id === "staffing_plan")?.insights,
  );
  check(
    "lender (new_to_budgeting) insight body matches the shared plain-English copy",
    !!lenderNewToBudgetingInsight &&
      lenderNewToBudgetingInsight.body === expectedNewToBudgetingBody,
    `expected: ${expectedNewToBudgetingBody}\n         got: ${lenderNewToBudgetingInsight?.body ?? "(missing)"}`,
  );
  check(
    "lender (new_to_budgeting) wording uses 'earn above the wage-base cap'",
    !!lenderNewToBudgetingInsight &&
      lenderNewToBudgetingInsight.body.includes("earn above the wage-base cap"),
    `body was: ${lenderNewToBudgetingInsight?.body ?? "(missing)"}`,
  );
  check(
    "lender (new_to_budgeting) wording uses the 'saves about $X/yr' phrasing",
    !!lenderNewToBudgetingInsight &&
      /saves about \$[\d,]+\/yr/.test(lenderNewToBudgetingInsight.body),
    `body was: ${lenderNewToBudgetingInsight?.body ?? "(missing)"}`,
  );
  check(
    "comfortable wording uses the technical 'flat blended rate' phrasing",
    !!lenderInsight && lenderInsight.body.includes("flat blended rate"),
    `comfortable body was: ${lenderInsight?.body ?? "(missing)"}`,
  );
  check(
    "comfortable and new_to_budgeting bodies differ for the same roster",
    !!lenderInsight && !!lenderNewToBudgetingInsight &&
      lenderInsight.body !== lenderNewToBudgetingInsight.body,
    "personas produced identical copy — the persona switch isn't being threaded into buildPacketData",
  );

  // ---- 4. Task #455 — fragility footnotes on revenue_model section -------
  // Build a minimal OH private-school payload that references the
  // litigated EdChoice voucher row and assert the resulting packet (a)
  // surfaces a `Funding source under legal challenge`-style insight, (b)
  // attaches an inline `note` to the affected linkedAssumption with the
  // year range derived from amounts + openingYear, and (c) adds the
  // per-line "Revenue Lines" table the board PDF leans on (board
  // renderer ignores `linkedAssumptions`).
  const ohModel: Record<string, unknown> = {
    schoolProfile: {
      schoolName: "Buckeye Prep",
      state: "OH",
      schoolType: "private_school",
      entityType: "llc_single",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 200,
      fiscalYearStartMonth: 7,
      ownershipType: "rent",
      monthlyRent: 5000,
      annualRentEscalation: 3,
      debtIncluded: false,
    },
    enrollment: { year1: 50, year2: 80, year3: 120, year4: 160, year5: 200 },
    revenueRows: [
      { id: "voucher_revenue", category: "school_choice", lineItem: "OH EdChoice Voucher", enabled: true, driverType: "per_student", amounts: [6000, 6180, 6365, 6556, 6753], billingMonths: 12 },
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Gross Tuition", enabled: true, driverType: "per_student", amounts: [4000, 4120, 4244, 4371, 4502], billingMonths: 12 },
    ],
    staffingRows: [],
    expenseRows: [{ id: "e1", category: "occupancy_facility", lineItem: "Rent", enabled: true, driverType: "monthly", amounts: [5000, 5150, 5305, 5464, 5628] }],
    capitalAndDebtRows: [],
    facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
  };
  for (const packetType of ["lender", "board"] as PacketType[]) {
    const consultantOutput = await runConsultantEngine(ohModel);
    const packet = await buildPacketData({
      modelData: ohModel as unknown as ModelData,
      consultantOutput,
      modelId: 1,
      packetType,
      personaComfort: "comfortable",
    });
    const revenue = packet.sections.find((s) => s.id === "revenue_model");
    check(`${packetType} revenue_model section is present`, !!revenue);
    if (!revenue) continue;

    // (a) section-level insight callout exists
    const fragInsight = (revenue.insights ?? []).find((i) =>
      i.label.toLowerCase().includes("legal") || i.label.toLowerCase().includes("litigation") || i.label.toLowerCase().includes("funding"),
    );
    check(
      `${packetType} revenue_model surfaces a fragility insight callout`,
      !!fragInsight,
      `insights were: ${JSON.stringify(revenue.insights ?? [])}`,
    );

    // (b) inline `note` on the matching linkedAssumption + year range
    const voucherAssumption = revenue.linkedAssumptions.find((a) =>
      a.sourceField.includes("voucher_revenue"),
    );
    check(
      `${packetType} voucher linkedAssumption carries an inline note`,
      !!voucherAssumption?.note,
      `linkedAssumption was: ${JSON.stringify(voucherAssumption)}`,
    );
    check(
      `${packetType} voucher note embeds the year range (2026–2030)`,
      !!voucherAssumption?.note && voucherAssumption.note.includes("2026") && voucherAssumption.note.includes("2030"),
      `note was: ${voucherAssumption?.note ?? "(missing)"}`,
    );
    check(
      `${packetType} voucher note mentions OH and the program label`,
      !!voucherAssumption?.note && voucherAssumption.note.includes("OH") && voucherAssumption.note.toLowerCase().includes("voucher"),
      `note was: ${voucherAssumption?.note ?? "(missing)"}`,
    );

    // The non-fragile (gross_tuition) line should NOT carry a note.
    const tuitionAssumption = revenue.linkedAssumptions.find((a) =>
      a.sourceField.includes("gross_tuition"),
    );
    check(
      `${packetType} active line (gross_tuition) does not carry a fragility note`,
      !!tuitionAssumption && tuitionAssumption.note === undefined,
      `tuition note was: ${tuitionAssumption?.note ?? "(undefined)"}`,
    );

    // (c) per-line table with a Note column exists for the board renderer.
    const lineTable = (revenue.tables ?? []).find((t) => t.title.includes("Revenue Lines"));
    check(
      `${packetType} revenue_model includes a per-line "Revenue Lines" table`,
      !!lineTable,
      `tables were: ${JSON.stringify((revenue.tables ?? []).map((t) => t.title))}`,
    );
    check(
      `${packetType} per-line table has a Note column when fragility matches exist`,
      !!lineTable && lineTable.headers.includes("Note"),
      `headers were: ${JSON.stringify(lineTable?.headers ?? [])}`,
    );
    const voucherTableRow = (lineTable?.rows ?? []).find((r) => r.label.includes("Voucher"));
    check(
      `${packetType} per-line table row for voucher carries a non-empty Note cell`,
      // values[] holds the cells *after* the label column, so a 3-header
      // table ("Line Item" + "Year 1" + "Note") gives a 2-element values
      // array with the note in the trailing slot.
      !!voucherTableRow && voucherTableRow.values.length === 2 && voucherTableRow.values[1].length > 0,
      `voucher row was: ${JSON.stringify(voucherTableRow)}`,
    );
  }

  // ---- 5. Task #455 — Active-only payload should not add a Note column ---
  // Regression: an OH model that uses only `tax_credit_scholarship_revenue`
  // (active in OH) must NOT decorate the per-line table with a Note column,
  // otherwise every healthy private-school packet gets an empty column.
  const ohActiveOnly: Record<string, unknown> = {
    ...ohModel,
    revenueRows: [
      { id: "tax_credit_scholarship_revenue", category: "school_choice", lineItem: "OH Tax Credit Scholarship", enabled: true, driverType: "per_student", amounts: [3000, 3090, 3183, 3278, 3377], billingMonths: 12 },
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Gross Tuition", enabled: true, driverType: "per_student", amounts: [4000, 4120, 4244, 4371, 4502], billingMonths: 12 },
    ],
  };
  const consultantActive = await runConsultantEngine(ohActiveOnly);
  const activePacket = await buildPacketData({
    modelData: ohActiveOnly as unknown as ModelData,
    consultantOutput: consultantActive,
    modelId: 1,
    packetType: "lender",
    personaComfort: "comfortable",
  });
  const activeRevenue = activePacket.sections.find((s) => s.id === "revenue_model");
  const activeLineTable = (activeRevenue?.tables ?? []).find((t) => t.title.includes("Revenue Lines"));
  check(
    "active-only OH payload omits the Note column from the per-line table",
    !!activeLineTable && !activeLineTable.headers.includes("Note"),
    `headers were: ${JSON.stringify(activeLineTable?.headers ?? [])}`,
  );
  check(
    "active-only OH payload emits no fragility insight",
    (activeRevenue?.insights ?? []).every(
      (i) => !i.label.toLowerCase().includes("legal") && !i.label.toLowerCase().includes("litigation") && !i.label.toLowerCase().includes("funding-source"),
    ),
    `insights were: ${JSON.stringify(activeRevenue?.insights ?? [])}`,
  );
  check(
    "active-only OH payload emits no inline notes on linkedAssumptions",
    (activeRevenue?.linkedAssumptions ?? []).every((a) => a.note === undefined),
    `linkedAssumptions were: ${JSON.stringify(activeRevenue?.linkedAssumptions ?? [])}`,
  );

  // ---- 6. Task #677 — per-year "Lowest Cash Month by Year" table ---------
  // Task #662 added a per-year trough table to the cash_flow section so
  // lenders can see the cash low point in every modeled year, not just
  // the global trough. Lock that table down with structural assertions
  // (one row per modeled year, expected month + amount) and a parity
  // check that re-derives each row using the same dashboard helpers
  // (`computeYear1MonthlyCashFlow` + `findLowestCashMonth`) buildCashFlow
  // calls internally — so a refactor that swaps in a different helper or
  // drops a year is caught here.
  function lowestCashFixture(enrollment: {
    year1: number; year2: number; year3: number; year4: number; year5: number;
  }, schoolName: string): Record<string, unknown> {
    return {
      schoolProfile: {
        schoolName,
        state: "WA",
        schoolType: "microschool",
        entityType: "llc_single",
        schoolStage: "new_school",
        fundingProfile: "tuition_based",
        openingYear: 2026,
        currentStudents: 0,
        maxCapacity: 50,
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        ownershipType: "rent",
        monthlyRent: 2000,
        annualRentEscalation: 3,
        debtIncluded: false,
      },
      enrollment,
      revenueRows: [
        {
          id: "r1",
          category: "tuition_and_fees",
          lineItem: "Tuition",
          enabled: true,
          driverType: "per_student",
          amounts: [12000, 12360, 12731, 13113, 13506],
          billingMonths: 12,
        },
      ],
      staffingRows: [],
      expenseRows: [
        {
          id: "e1",
          category: "occupancy_facility",
          lineItem: "Rent",
          enabled: true,
          driverType: "monthly",
          amounts: [2000, 2060, 2122, 2186, 2251],
        },
      ],
      capitalAndDebtRows: [],
      facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
      openingBalances: { cash: 0 },
    };
  }

  // Mirror of build-packet-data's `computeYearlyData` — kept locally so
  // this test exercises the same helpers (`computePersonnelForYear`,
  // `computeExpenseForYear`, ...) the dashboard + packet share rather
  // than asserting against the values buildCashFlow itself produced.
  function deriveExpectedTroughs(model: Record<string, unknown>): {
    year: number; monthLabel: string; amount: number;
  }[] {
    const md = model as unknown as ModelData;
    const enrollment = getEnrollmentArray(md.enrollment);
    const sp = md.schoolProfile!;
    const fyStart = sp.fiscalYearStartMonth || 7;
    const opMonths = sp.isPartialFirstYear ? (sp.year1OperatingMonths || 10) : 12;
    const normalized = (md.staffingRows || []).map(
      (r) => normalizeStaffingRow(r as unknown as Record<string, unknown>),
    );
    const fac = (md as unknown as { facilities?: Record<string, unknown> }).facilities;
    const salaryEsc = ((fac?.annualSalaryIncrease as number | undefined) ?? 0) / 100;
    const costInflPct = fac?.generalCostInflation as number | undefined;
    const pktRR = (md.enrollment as Record<string, unknown> | undefined)?.retentionRate as number | undefined ?? 85;
    const startingCash = md.openingBalances?.cash ?? 0;

    const out: { year: number; monthLabel: string; amount: number }[] = [];
    let runningOpening = startingCash;
    for (let y = 0; y < 5; y++) {
      const students = enrollment[y] || 0;
      const ns = computeNewStudents(enrollment, pktRR, y);
      const rs = computeReturningStudents(enrollment, pktRR, y);
      const totalRevenue = computeRevenueForYear(md.revenueRows || [], y, students, md.tuitionTiers, costInflPct, sp);
      if (totalRevenue <= 0) break;
      const totalStaffing = computePersonnelForYear(normalized, salaryEsc, 1, y, students);
      const fte = computeTotalFTE(normalized, y, students);
      const opex = computeExpenseForYear(md.expenseRows || [], y, students, totalRevenue, costInflPct, ns, rs, fte);
      const capDebt = computeCapDebtForYear(md.capitalAndDebtRows || [], y, students);
      const debtService = computeDebtServiceForYear(md.capitalAndDebtRows || [], y);
      const totalExpenses = totalStaffing + opex + capDebt;
      const series = computeYear1MonthlyCashFlow({
        revenueRows: (md.revenueRows || []) as unknown as MonthlyRevenueRowLike[],
        yearIndex: y,
        students,
        annualPersonnel: totalStaffing,
        annualOpex: totalExpenses - totalStaffing - debtService,
        annualDebt: debtService,
        openingCash: runningOpening,
        opMonths: y === 0 ? opMonths : 12,
      });
      const t = findLowestCashMonth(series.cumulative, fyStart);
      if (t) out.push({ year: y, monthLabel: t.monthLabel, amount: t.amount });
      runningOpening = series.cumulative[series.cumulative.length - 1];
    }
    return out;
  }

  // (a) Full 5-year model — table has 5 rows, one per modeled year, and
  // each row's month + amount matches the dashboard helpers.
  const full5Year = lowestCashFixture(
    { year1: 12, year2: 18, year3: 22, year4: 25, year5: 25 },
    "Trough Test School",
  );
  const full5ConsultantOutput = await runConsultantEngine(full5Year);
  const full5Packet = buildPacketData({
    modelData: full5Year as unknown as ModelData,
    consultantOutput: full5ConsultantOutput,
    modelId: 1,
    packetType: "lender",
    personaComfort: "comfortable",
  });
  const full5CashFlow = full5Packet.sections.find((s) => s.id === "cash_flow");
  check(
    "lender packet cash_flow section is present",
    !!full5CashFlow,
    "the cash_flow section is required for the per-year trough table to exist",
  );
  const full5Table = (full5CashFlow?.tables ?? []).find(
    (t) => t.title === "Lowest Cash Month by Year",
  );
  check(
    "cash_flow surfaces a 'Lowest Cash Month by Year' table",
    !!full5Table,
    `tables were: ${JSON.stringify((full5CashFlow?.tables ?? []).map((t) => t.title))}`,
  );
  check(
    "Lowest Cash Month by Year table headers are [Year, Month, Ending Cash]",
    !!full5Table &&
      full5Table.headers.length === 3 &&
      full5Table.headers[0] === "Year" &&
      full5Table.headers[1] === "Month" &&
      full5Table.headers[2] === "Ending Cash",
    `headers were: ${JSON.stringify(full5Table?.headers ?? [])}`,
  );

  const expectedFull5 = deriveExpectedTroughs(full5Year);
  check(
    "per-year trough table has one row per modeled year (5)",
    !!full5Table && full5Table.rows.length === expectedFull5.length && full5Table.rows.length === 5,
    `expected 5 rows, got ${full5Table?.rows.length ?? 0}; derived ${expectedFull5.length}`,
  );
  if (full5Table && expectedFull5.length === full5Table.rows.length) {
    for (let i = 0; i < expectedFull5.length; i++) {
      const exp = expectedFull5[i];
      const row = full5Table.rows[i];
      check(
        `Year ${exp.year + 1} row label is "Year ${exp.year + 1}"`,
        row.label === `Year ${exp.year + 1}`,
        `row label was "${row.label}"`,
      );
      check(
        `Year ${exp.year + 1} row month matches dashboard helper (${exp.monthLabel})`,
        row.values[0] === exp.monthLabel,
        `row month was "${row.values[0]}"`,
      );
      // The packet renders amounts via the local `fmt()` helper, so
      // re-derive its formatting here rather than re-importing it.
      const fmtAmount = (n: number): string => {
        if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
        if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
        return `$${n.toFixed(0)}`;
      };
      const expectedAmount = fmtAmount(exp.amount);
      check(
        `Year ${exp.year + 1} row ending-cash matches dashboard helper (${expectedAmount})`,
        row.values[1] === expectedAmount,
        `row amount was "${row.values[1]}"`,
      );
      check(
        `Year ${exp.year + 1} row isBold flag matches negative-cash signal`,
        row.isBold === (exp.amount < 0),
        `isBold was ${row.isBold} for amount ${exp.amount}`,
      );
    }
  }

  // (b) Negative case: years 4–5 have no enrollment / revenue, so they
  // must be omitted from the per-year table — never rendered as zeros.
  const partial3Year = lowestCashFixture(
    { year1: 12, year2: 18, year3: 22, year4: 0, year5: 0 },
    "Three-Year-Only Trough School",
  );
  const partial3ConsultantOutput = await runConsultantEngine(partial3Year);
  const partial3Packet = buildPacketData({
    modelData: partial3Year as unknown as ModelData,
    consultantOutput: partial3ConsultantOutput,
    modelId: 1,
    packetType: "lender",
    personaComfort: "comfortable",
  });
  const partial3CashFlow = partial3Packet.sections.find((s) => s.id === "cash_flow");
  const partial3Table = (partial3CashFlow?.tables ?? []).find(
    (t) => t.title === "Lowest Cash Month by Year",
  );
  check(
    "partial-model cash_flow still surfaces the per-year trough table",
    !!partial3Table,
    `tables were: ${JSON.stringify((partial3CashFlow?.tables ?? []).map((t) => t.title))}`,
  );
  check(
    "unmodeled years (no revenue) are omitted from the per-year table",
    !!partial3Table && partial3Table.rows.length === 3,
    `expected 3 rows for years 1-3, got ${partial3Table?.rows.length ?? 0}: ${JSON.stringify(
      partial3Table?.rows.map((r) => r.label) ?? [],
    )}`,
  );
  check(
    "partial-model row labels are exactly Year 1, Year 2, Year 3",
    !!partial3Table &&
      partial3Table.rows[0]?.label === "Year 1" &&
      partial3Table.rows[1]?.label === "Year 2" &&
      partial3Table.rows[2]?.label === "Year 3",
    `labels were: ${JSON.stringify(partial3Table?.rows.map((r) => r.label) ?? [])}`,
  );
  check(
    "partial-model table never includes a Year 4 / Year 5 row zeroed out",
    !!partial3Table &&
      !partial3Table.rows.some((r) => r.label === "Year 4" || r.label === "Year 5"),
    `labels were: ${JSON.stringify(partial3Table?.rows.map((r) => r.label) ?? [])}`,
  );

  // ---- summary -----------------------------------------------------------
  console.log(`\nbuild-packet-data wage-base insight: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
