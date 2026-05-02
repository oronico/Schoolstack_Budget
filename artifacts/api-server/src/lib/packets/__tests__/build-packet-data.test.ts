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
  type PayrollTaxComponent,
} from "@workspace/finance";
import { runConsultantEngine } from "../../consultant-engine.js";
import type { ModelData } from "../../workbook-helpers.js";
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
