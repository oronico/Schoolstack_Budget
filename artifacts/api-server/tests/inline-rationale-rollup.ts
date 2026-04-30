/**
 * Task #331 — verifies the inline-rationale roll-up reaches the lender and
 * board packets and the underwriting workbook's "Assumptions Memo" tab.
 *
 *   1. The rollup adapter groups rationales into the five canonical sections
 *      and excludes `expenses:capital_financing` from `expenseAssumptions`.
 *   2. The lender packet appends a "Founder's reasoning:" footer to each
 *      target section's narrative when a rationale exists.
 *   3. The board packet does the same for the sections it surfaces.
 *   4. Sections without a corresponding rationale stay untouched (no
 *      stub footer like "Founder's reasoning: " is leaked).
 *   5. The underwriting workbook contains an "Assumptions Memo" tab that
 *      lists every captured rationale verbatim.
 */
import ExcelJS from "exceljs";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildLenderPacket } from "../src/lib/packets/build-lender-packet.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import {
  buildAllRollups,
  buildSectionRollup,
  withFounderReasoning,
} from "../src/lib/packets/inline-rationale-rollup.js";
import type { ModelData } from "../src/lib/workbook-helpers.js";
import { microschoolStartup } from "./sample-payloads.js";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const RATIONALES = {
  "enrollment:programs": "We grow K to 3 in year 1 and add a grade per year.",
  "revenue:tuition_and_fees": "Tuition rises 3 percent per year tied to CPI.",
  "revenue:philanthropy": "Annual fund grows from 25k to 100k as parent base scales.",
  "staffing:school_leadership": "Head of School plus dean of students from year 1.",
  "staffing:instructional": "Lower student-to-teacher ratio in K-2 to drive retention.",
  "expenses:instructional_program": "Curriculum and supplies budgeted at 500 dollars per student.",
  "expenses:capital_financing": "Loan fees flow through the operating P and L.",
  "capitalFinancing:debtTerms": "Twenty year amortization at 6.5 percent.",
  "capitalFinancing:dscrCovenants": "1.20x DSCR covenant tested annually.",
};

function withRationales(): Record<string, unknown> {
  const base = JSON.parse(JSON.stringify(microschoolStartup)) as Record<string, unknown>;
  const narrative = (base.budgetNarrative || {}) as Record<string, unknown>;
  base.budgetNarrative = {
    ...narrative,
    inlineRationales: { ...RATIONALES },
  };
  return base;
}

async function run() {
  // ---- 1. Adapter behaviour ---------------------------------------------
  const rollups = buildAllRollups(withRationales() as unknown as ModelData);
  check(
    "enrollmentStrategy rollup carries the verbatim enrollment rationale",
    rollups.enrollmentStrategy.text.includes("K to 3 in year 1"),
    `text was: ${rollups.enrollmentStrategy.text}`,
  );
  check(
    "revenueAssumptions rollup includes tuition and philanthropy entries",
    rollups.revenueAssumptions.entries.some((e) => e.key === "revenue:tuition_and_fees") &&
      rollups.revenueAssumptions.entries.some((e) => e.key === "revenue:philanthropy"),
    `entries were: ${rollups.revenueAssumptions.entries.map((e) => e.key).join(", ")}`,
  );
  check(
    "expenseAssumptions rollup excludes the capital_financing rationale",
    !rollups.expenseAssumptions.entries.some((e) => e.key === "expenses:capital_financing"),
    `entries were: ${rollups.expenseAssumptions.entries.map((e) => e.key).join(", ")}`,
  );
  check(
    "riskMitigation rollup folds in capital_financing AND debtTerms/dscrCovenants",
    rollups.riskMitigation.entries.some((e) => e.key === "expenses:capital_financing") &&
      rollups.riskMitigation.entries.some((e) => e.key === "capitalFinancing:debtTerms") &&
      rollups.riskMitigation.entries.some((e) => e.key === "capitalFinancing:dscrCovenants"),
    `entries were: ${rollups.riskMitigation.entries.map((e) => e.key).join(", ")}`,
  );

  // ---- 2. Lender packet enrichment --------------------------------------
  const input = withRationales();
  const consultant = await runConsultantEngine(input);
  const lender = buildLenderPacket(input as unknown as ModelData, consultant, 1, "comfortable");

  const findSection = (sections: typeof lender.sections, id: string) =>
    sections.find((s) => s.id === id);

  const lenderRevenue = findSection(lender.sections, "revenue_model");
  check(
    "lender revenue_model section appends the founder's reasoning footer",
    !!lenderRevenue && lenderRevenue.narrative.includes("Founder's reasoning:") &&
      lenderRevenue.narrative.includes("Tuition rises 3 percent per year"),
    `narrative was: ${lenderRevenue?.narrative ?? "(missing)"}`,
  );

  const lenderStaffing = findSection(lender.sections, "staffing_plan");
  check(
    "lender staffing_plan section carries the staffing rationale",
    !!lenderStaffing && lenderStaffing.narrative.includes("Founder's reasoning:") &&
      lenderStaffing.narrative.includes("dean of students from year 1"),
    `narrative was: ${lenderStaffing?.narrative ?? "(missing)"}`,
  );

  const lenderExpense = findSection(lender.sections, "expense_summary");
  check(
    "lender expense_summary section carries instructional/program rationale",
    !!lenderExpense && lenderExpense.narrative.includes("Curriculum and supplies"),
    `narrative was: ${lenderExpense?.narrative ?? "(missing)"}`,
  );
  check(
    "lender expense_summary section does NOT leak capital_financing rationale",
    !!lenderExpense && !lenderExpense.narrative.includes("Loan fees flow through"),
    `narrative was: ${lenderExpense?.narrative ?? "(missing)"}`,
  );

  const lenderDebtService = findSection(lender.sections, "debt_service");
  check(
    "lender debt_service section carries DSCR covenant + debt-term rationale",
    !lenderDebtService ||
      (lenderDebtService.narrative.includes("DSCR covenant tested annually") &&
        lenderDebtService.narrative.includes("Twenty year amortization")),
    `narrative was: ${lenderDebtService?.narrative ?? "(missing)"}`,
  );

  // ---- 3. Board packet enrichment ---------------------------------------
  const board = buildBoardPacket(input as unknown as ModelData, consultant, 1, "comfortable");
  const boardRevenue = findSection(board.sections, "revenue_model");
  check(
    "board revenue_model section appends the founder's reasoning footer",
    !boardRevenue || boardRevenue.narrative.includes("Tuition rises 3 percent per year"),
    `narrative was: ${boardRevenue?.narrative ?? "(missing)"}`,
  );

  // ---- 4. Empty-rationale safety: nothing is appended when missing ------
  const cleanInput = JSON.parse(JSON.stringify(microschoolStartup)) as Record<string, unknown>;
  const cleanConsultant = await runConsultantEngine(cleanInput);
  const cleanLender = buildLenderPacket(
    cleanInput as unknown as ModelData,
    cleanConsultant,
    1,
    "comfortable",
  );
  const stubFooter = cleanLender.sections.find((s) =>
    /Founder's reasoning:\s*$/.test(s.narrative),
  );
  check(
    "no section gets a stub 'Founder's reasoning:' footer when rationales are absent",
    !stubFooter,
    `section ${stubFooter?.id ?? ""} narrative ended with stub footer`,
  );

  // ---- 5. Workbook "Assumptions Memo" tab -------------------------------
  const wb = await generateUnderwritingWorkbook(input as unknown as Record<string, unknown>);
  const memo = wb.getWorksheet("Assumptions Memo");
  check("workbook contains an 'Assumptions Memo' worksheet", !!memo);
  if (memo) {
    let memoText = "";
    memo.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (typeof v === "string") memoText += `${v}\n`;
      });
    });
    check(
      "memo lists the enrollment rationale verbatim",
      memoText.includes("K to 3 in year 1 and add a grade per year."),
      `memo text excerpt: ${memoText.slice(0, 400)}`,
    );
    check(
      "memo lists the DSCR covenant rationale",
      memoText.includes("DSCR covenant tested annually."),
      `memo text excerpt: ${memoText.slice(0, 400)}`,
    );
    check(
      "memo includes the five section titles",
      memoText.includes("Enrollment Strategy") &&
        memoText.includes("Revenue Assumptions") &&
        memoText.includes("Staffing Philosophy") &&
        memoText.includes("Expense Assumptions") &&
        memoText.includes("Risk Mitigation & Capital"),
      `memo text excerpt: ${memoText.slice(0, 600)}`,
    );
  }

  // ---- 6. withFounderReasoning helper unit checks -----------------------
  check(
    "withFounderReasoning preserves the base and appends the footer",
    withFounderReasoning("Base.", "rationale text") ===
      "Base. Founder's reasoning: rationale text",
  );
  check(
    "withFounderReasoning returns the base unchanged when rationale is empty",
    withFounderReasoning("Base.", "   ") === "Base.",
  );
  check(
    "buildSectionRollup returns no entries for a section with no inputs",
    buildSectionRollup("staffingPhilosophy", {}, {}).entries.length === 0,
  );

  // ---- summary ----------------------------------------------------------
  console.log(`\ninline-rationale-rollup: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
