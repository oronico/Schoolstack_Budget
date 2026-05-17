// Task #675 — Snapshot test for the standard lender stress-test section
// in the lender packet PDF and the lender pro-forma workbook.
//
// The engine math behind the five fixed scenarios is already covered by
// `lib/finance/src/decision-engine/__tests__/lender-stress-tests.test.ts`.
// What was missing — and what this test pins — is that the section
// actually renders into the two founder-facing artifacts:
//
//   1. The lender packet PDF carries a section titled "Standard Lender
//      Stress Tests" and at least one of the five scenario names appears
//      in the extracted text.
//   2. The lender pro-forma workbook carries a worksheet named
//      "Stress Tests" with one block per scenario in `LENDER_STRESS_SCENARIOS`
//      (matched by the canonical scenario name on the block-header row).
//
// Renders the microschool fixture end-to-end so a future renderer
// refactor cannot silently drop the section without this test failing.

import ExcelJS from "exceljs";

import { generateLenderPacketPDF } from "../src/lib/packets/lender-packet-pdf.js";
import {
  buildLenderPacket,
  type ModelData,
} from "../src/lib/packets/build-lender-packet.js";
import { runConsultantEngine } from "../src/lib/consultant-engine.js";
import { generateLenderProFormaWorkbook } from "../src/lib/lender-proforma-export.js";
import { LENDER_STRESS_SCENARIOS } from "@workspace/finance";
import { microschoolStartup } from "./sample-payloads.js";

import { extractPdfText } from "./_pdf-text-snapshot-util.js";
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    const line = `  FAIL: ${label}${detail ? ` — ${detail}` : ""}`;
    failures.push(line);
    console.log(line);
  }
}

// --- Minimal PDF text extractor ------------------------------------------
// Same technique as tests/lender-packet-pdf-route.ts. pdfkit emits
// FlateDecode-compressed content streams; rendered text lives inside
// `(...)` literals and `<...>` hex strings inside those streams.

// --- Test --------------------------------------------------------------

async function main() {
  console.log("=== Lender Stress Section Snapshot Test ===\n");

  // microschoolStartup raises a single warning flag; resolve it so the
  // packet renders the full body (the section we care about lives below
  // the warning gate in the PDF, but resolving is harmless and matches
  // the happy-path fixture used by the route test).
  const data = {
    ...(microschoolStartup as Record<string, unknown>),
    assumptionFlagResponses: [
      {
        field: "enrollment.year2",
        flagType: "enrollment_spike",
        reason:
          "Founders confirmed 18 family commitments via signed letters of intent.",
      },
    ],
  };

  const consultant = await runConsultantEngine(
    data as Parameters<typeof runConsultantEngine>[0],
  );
  const packet = buildLenderPacket(data as unknown as ModelData, consultant, 1);

  // ─── PDF assertions ─────────────────────────────────────────────────
  const pdf = await generateLenderPacketPDF(packet);
  check("PDF buffer non-trivial", pdf.length > 1000, `bytes=${pdf.length}`);
  check(
    "PDF starts with %PDF-",
    pdf.subarray(0, 5).toString("ascii") === "%PDF-",
  );

  const pdfText = extractPdfText(pdf);
  check(
    "PDF carries 'Standard Lender Stress Tests' section title",
    pdfText.includes("Standard Lender Stress Tests"),
    `text snippet: ${pdfText.slice(0, 200)}…`,
  );

  const matchedScenarioName = LENDER_STRESS_SCENARIOS.find((sc) =>
    pdfText.includes(sc.name),
  );
  check(
    "PDF contains at least one scenario name from the canonical catalog",
    matchedScenarioName !== undefined,
    `expected one of: ${LENDER_STRESS_SCENARIOS.map((s) => s.name).join(" | ")}`,
  );

  // ─── Workbook assertions ────────────────────────────────────────────
  const xlsxBuf = await generateLenderProFormaWorkbook(
    data as Record<string, unknown>,
    consultant,
  );
  check("Workbook buffer non-trivial", xlsxBuf.length > 1000, `bytes=${xlsxBuf.length}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBuf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Stress Tests");
  check(
    "Workbook has 'Stress Tests' worksheet",
    ws !== undefined,
    `sheets: ${wb.worksheets.map((s) => s.name).join(", ")}`,
  );

  if (ws) {
    // Collect every text-bearing cell in column A so we can match the
    // block-header rows (the renderer writes the scenario `name` as the
    // merged title at the top of each block).
    const colATexts: string[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string") colATexts.push(v);
    });

    for (const sc of LENDER_STRESS_SCENARIOS) {
      check(
        `Workbook 'Stress Tests' has row for scenario '${sc.id}' (name: ${sc.name})`,
        colATexts.some((t) => t.includes(sc.name)),
        `column A texts: ${colATexts.join(" | ")}`,
      );
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
