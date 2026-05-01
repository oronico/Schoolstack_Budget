/**
 * Task #322 + #326 regression test — board packet wage-base cap savings insight.
 *
 * Verifies that:
 *   1. The `staffing_plan` section is included in the board packet (regression
 *      guard against `BOARD_PACKET_SECTIONS` losing the entry).
 *   2. When the roster carries `payrollTaxComponents` and at least one row
 *      clears a wage-base cap, the persona-aware sentence is exposed as a
 *      structured `PacketInsight` on the Personnel section — for both
 *      `comfortable` and `new_to_budgeting`. (Task #326 promoted this from a
 *      sentence appended to the staffing narrative to a dedicated callout.)
 *   3. No insight is emitted for rosters that don't qualify (no components,
 *      or all rows below every cap), so we never leak a stub callout.
 *   4. Manual blended-rate overrides + contract-not-payroll-like rows are
 *      excluded from the displayed savings (they would otherwise inflate the
 *      board's headline number vs. the wizard).
 *   5. The insight body reaches the rendered PDF (i.e. the staffing_plan
 *      section + its insights actually flow through `generateBoardPacketPDF`
 *      and `drawInsightCallout`).
 *   6. The base staffing-cost paragraph in `narrative` is no longer carrying
 *      the wage-base sentence, so we don't double-render it.
 */
import zlib from "node:zlib";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { buildBoardPacket } from "../src/lib/packets/build-board-packet.js";
import { generateBoardPacketPDF } from "../src/lib/packets/board-packet-pdf.js";
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

// PDF text extraction. Mirrors `decision-history-pdf.ts`'s extractor —
// PDFKit emits text via both literal `(...)` strings AND `<...>` hex strings
// (the latter when TJ is used with standard fonts), so a literal-only
// extractor misses the section narratives we need to assert on. Inlined
// here so this test stays self-contained.
function extractPDFText(pdf: Buffer): string {
  const out: string[] = [];
  let cursor = 0;
  while (cursor < pdf.length) {
    const sIdx = pdf.indexOf("stream", cursor);
    if (sIdx === -1) break;
    let dataStart = sIdx + "stream".length;
    if (pdf[dataStart] === 0x0d) dataStart++;
    if (pdf[dataStart] === 0x0a) dataStart++;
    const eIdx = pdf.indexOf("endstream", dataStart);
    if (eIdx === -1) break;
    let dataEnd = eIdx;
    if (pdf[dataEnd - 1] === 0x0a) dataEnd--;
    if (pdf[dataEnd - 1] === 0x0d) dataEnd--;
    const raw = pdf.subarray(dataStart, dataEnd);
    let body: string;
    try {
      body = zlib.inflateSync(raw).toString("binary");
    } catch {
      body = raw.toString("binary");
    }
    out.push(extractStringLiterals(body));
    cursor = eIdx + "endstream".length;
  }
  return out.join("\n");
}

function extractStringLiterals(content: string): string {
  let result = "";
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "(") {
      i++;
      let depth = 1;
      let str = "";
      while (i < content.length && depth > 0) {
        const c = content[i];
        if (c === "\\") {
          const n = content[i + 1];
          if (n === undefined) { i++; break; }
          if (n === "n") { str += "\n"; i += 2; continue; }
          if (n === "r") { str += "\r"; i += 2; continue; }
          if (n === "t") { str += "\t"; i += 2; continue; }
          if (n === "b" || n === "f") { i += 2; continue; }
          if (n === "(" || n === ")" || n === "\\") { str += n; i += 2; continue; }
          if (n >= "0" && n <= "7") {
            let oct = "";
            i++;
            while (oct.length < 3 && i < content.length && content[i] >= "0" && content[i] <= "7") {
              oct += content[i];
              i++;
            }
            str += String.fromCharCode(parseInt(oct, 8));
            continue;
          }
          str += n;
          i += 2;
          continue;
        }
        if (c === "(") { depth++; str += c; i++; continue; }
        if (c === ")") {
          depth--;
          if (depth === 0) { i++; break; }
          str += c;
          i++;
          continue;
        }
        str += c;
        i++;
      }
      result += str;
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      i++;
      let hex = "";
      while (i < content.length && content[i] !== ">") {
        const c = content[i];
        if ((c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")) {
          hex += c;
        }
        i++;
      }
      if (content[i] === ">") i++;
      if (hex.length % 2 === 1) hex += "0";
      let str = "";
      for (let h = 0; h < hex.length; h += 2) {
        str += String.fromCharCode(parseInt(hex.substr(h, 2), 16));
      }
      result += str;
      continue;
    }
    i++;
  }
  return result;
}

const WA_COMPONENTS = [
  { label: "FICA SS", rate: 6.2, wageBase: 176_100 },
  { label: "Medicare", rate: 1.45 },
  { label: "FUTA", rate: 0.6, wageBase: 7_000 },
  { label: "WA SUI", rate: 1.22, wageBase: 72_800 },
  { label: "WA PFML", rate: 0.28, wageBase: 176_100 },
];

function withRoster(rows: unknown[]): Record<string, unknown> {
  // Build on top of the microschool fixture (small, fast) but swap in our
  // cap-savings-relevant roster + raise the founder/teacher salaries on the
  // base staffing block so consultant-engine derived numbers stay sane.
  const base = JSON.parse(JSON.stringify(microschoolStartup)) as Record<string, unknown>;
  base.staffingRows = rows;
  return base;
}

function highSalaryRow(id: string, roleName: string, extra: Record<string, unknown> = {}) {
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
    ...extra,
  };
}

function lowSalaryRow(id: string, roleName: string) {
  return {
    id,
    roleName,
    functionCategory: "instructional",
    employmentType: "full_time",
    fte: 1,
    annualizedRate: 6_500, // below the lowest cap (FUTA $7k)
    benefitsEligible: false,
    benefitsRate: 0,
    payrollTaxRate: 7.65,
    payrollLike: true,
    payrollTaxComponents: WA_COMPONENTS,
    notes: "",
    staffingMode: "fixed",
  };
}

async function buildBoardWith(
  rows: unknown[],
  comfort: "new_to_budgeting" | "comfortable" | null,
) {
  const input = withRoster(rows);
  const consultant = await runConsultantEngine(input);
  return buildBoardPacket(input as unknown as ModelData, consultant, 1, comfort);
}

async function run() {
  // ---- 1. staffing_plan section is included in the board packet ----------
  const includedPacket = await buildBoardWith(
    [highSalaryRow("s1", "Head of School")],
    "comfortable",
  );
  const staffingPlan = includedPacket.sections.find((s) => s.id === "staffing_plan");
  check(
    "board packet includes the staffing_plan section",
    !!staffingPlan,
    "BOARD_PACKET_SECTIONS dropped 'staffing_plan' — the cap-savings sentence cannot reach the board PDF without it",
  );

  // ---- 2a. comfortable persona surfaces the technical sentence as an insight
  if (staffingPlan) {
    const insights = staffingPlan.insights ?? [];
    const wageInsight = insights.find((i) => i.label === "Wage-base savings");
    check(
      "comfortable section exposes a 'Wage-base savings' insight callout",
      !!wageInsight,
      `insights were: ${JSON.stringify(insights)}`,
    );
    check(
      "comfortable insight body contains 'Wage-base caps hit on'",
      !!wageInsight && wageInsight.body.includes("Wage-base caps hit on"),
      `insight body was: ${wageInsight?.body ?? "(missing)"}`,
    );
    check(
      "comfortable insight body contains the savings dollar phrase",
      !!wageInsight && /saves \$[\d,]+\/yr vs\. a flat blended rate/.test(wageInsight.body),
      `insight body was: ${wageInsight?.body ?? "(missing)"}`,
    );
    // Task #326: the wage-base sentence must NOT also live in narrative
    // (otherwise the PDF would render it twice — once in the paragraph, once
    // in the callout).
    check(
      "comfortable narrative no longer carries the wage-base sentence",
      !staffingPlan.narrative.includes("Wage-base caps hit on") &&
        !staffingPlan.narrative.includes("saves $"),
      `narrative was: ${staffingPlan.narrative}`,
    );
    check(
      "comfortable insight defaults to tone='info' (teal accent in PDF)",
      !!wageInsight && (wageInsight.tone ?? "info") === "info",
      `tone was: ${wageInsight?.tone ?? "(none)"}`,
    );
  }

  // ---- 2b. new_to_budgeting persona uses the plain-language variant ------
  const newToBudgetingPacket = await buildBoardWith(
    [highSalaryRow("s1", "Head of School")],
    "new_to_budgeting",
  );
  const newToBudgetingPlan = newToBudgetingPacket.sections.find(
    (s) => s.id === "staffing_plan",
  );
  const newToBudgetingInsight = newToBudgetingPlan?.insights?.find(
    (i) => i.label === "Wage-base savings",
  );
  check(
    "new_to_budgeting insight uses 'earn above the wage-base cap'",
    !!newToBudgetingInsight && newToBudgetingInsight.body.includes("earn above the wage-base cap"),
    `insight body was: ${newToBudgetingInsight?.body ?? "(missing section/insight)"}`,
  );
  check(
    "new_to_budgeting insight uses the 'saves about $X/yr' phrasing",
    !!newToBudgetingInsight && /saves about \$[\d,]+\/yr/.test(newToBudgetingInsight.body),
    `insight body was: ${newToBudgetingInsight?.body ?? "(missing section/insight)"}`,
  );

  // ---- 3. no insight when no row clears a cap ----------------------------
  const noQualifyingPacket = await buildBoardWith(
    [lowSalaryRow("s1", "Aide")],
    "comfortable",
  );
  const noQualifyingPlan = noQualifyingPacket.sections.find(
    (s) => s.id === "staffing_plan",
  );
  const noQualifyingInsights = noQualifyingPlan?.insights ?? [];
  check(
    "no wage-base insight emitted when nothing crosses a wage-base cap",
    !noQualifyingInsights.some((i) => i.label === "Wage-base savings"),
    `insights were: ${JSON.stringify(noQualifyingInsights)}`,
  );
  check(
    "no cap-insight sentence leaked into narrative either",
    !!noQualifyingPlan && !noQualifyingPlan.narrative.includes("Wage-base caps hit on"),
    `narrative was: ${noQualifyingPlan?.narrative ?? "(missing section)"}`,
  );

  // ---- 4. exclusion fields keep overrides + contractors out of the math --
  // Single payroll-like row contributes; contractor + override rows must NOT
  // bump the headline savings number.
  const onlyRealRolePacket = await buildBoardWith(
    [highSalaryRow("real", "Head of School")],
    "comfortable",
  );
  const realOnlyInsight = onlyRealRolePacket.sections
    .find((s) => s.id === "staffing_plan")
    ?.insights?.find((i) => i.label === "Wage-base savings");
  const realOnlyMatch = realOnlyInsight?.body.match(/saves \$([\d,]+)\/yr/)?.[1];
  const realOnlyDollars = realOnlyMatch ? Number(realOnlyMatch.replace(/,/g, "")) : NaN;

  const mixedRosterPacket = await buildBoardWith(
    [
      highSalaryRow("real", "Head of School"),
      // contract row that should be skipped (employmentType=contract + payrollLike=false)
      highSalaryRow("contractor", "1099 Curriculum Consultant", {
        employmentType: "contract",
        payrollLike: false,
      }),
      // manual blended-rate override row that should be skipped
      highSalaryRow("overridden", "Director of Operations", {
        payrollTaxRateOverridden: true,
      }),
    ],
    "comfortable",
  );
  const mixedInsight = mixedRosterPacket.sections
    .find((s) => s.id === "staffing_plan")
    ?.insights?.find((i) => i.label === "Wage-base savings");
  const mixedBody = mixedInsight?.body ?? "";
  const mixedMatch = mixedBody.match(/saves \$([\d,]+)\/yr/);
  const mixedDollars = mixedMatch ? Number(mixedMatch[1].replace(/,/g, "")) : NaN;

  check(
    "headline savings ignore contractor + overridden rows",
    Number.isFinite(realOnlyDollars) &&
      Number.isFinite(mixedDollars) &&
      realOnlyDollars === mixedDollars,
    `expected ${realOnlyDollars}, got ${mixedDollars} (mixed insight body: ${mixedBody})`,
  );
  check(
    "mixed-roster insight reports 'across 1 role' (the only payroll-like row)",
    mixedBody.includes("across 1 role"),
    `insight body was: ${mixedBody}`,
  );

  // ---- 5. the insight body reaches the rendered board PDF ----------------
  const pdfBuffer = await generateBoardPacketPDF(includedPacket);
  check("board PDF builds without error", pdfBuffer.length > 0);
  const pdfText = extractPDFText(pdfBuffer);
  check(
    "rendered board PDF contains the cap-savings insight body",
    pdfText.includes("Wage-base caps hit on"),
    "insight missing from PDF text — staffing_plan insights likely aren't being rendered by board-packet-pdf",
  );
  check(
    "rendered board PDF contains the 'Wage-base savings' callout label",
    pdfText.includes("Wage-base savings"),
    "callout label missing from PDF — drawInsightCallout may not be wired up in board-packet-pdf",
  );

  // ---- summary -----------------------------------------------------------
  console.log(`\nboard-packet-cap-insight: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(failures.join("\n"));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
