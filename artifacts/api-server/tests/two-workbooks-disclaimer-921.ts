/**
 * Task #921 — Disclaimer-vs-UI-delivery tie-out (regression).
 *
 * What this guards
 * ----------------
 * The lender packet PDF (`renderProFormaMethodologyNote` in
 * `artifacts/api-server/src/lib/packets/lender-packet-pdf.ts`) and the
 * in-app preview (`ProFormaMethodologyNote` in
 * `artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx`)
 * both render the canonical disclosure body exported from
 * `lib/finance/src/lender-packet-copy.ts`
 * (`PRO_FORMA_METHODOLOGY_NOTE_BODY`).
 *
 * Before #921 the disclaimer claimed "this packet ships two Excel
 * workbooks" but the founder wizard's `ExportStep.tsx` only exposed a
 * Download button for the underwriting workbook (`underwritingV2`).
 * The Lender Pro-Forma generator + route exist
 * (`artifacts/api-server/src/lib/lender-proforma-export.ts`, route
 * `GET /api/models/:id/export/lender-proforma`) but no UI affordance
 * delivers them to the founder. A lender opening the PDF would have
 * been told to expect two attachments and would only find one.
 *
 * #921 rewrites the disclaimer to describe the single workbook that
 * actually ships today and notes the Lender Pro-Forma is "available on
 * request pending QA". This test pins both the copy AND the UI
 * delivery channel so the two cannot drift again:
 *
 *   1. Source of truth (Pattern D regression): the in-app preview and
 *      the PDF must both pull from the shared constant. Re-deriving
 *      either surface from a literal string would let them drift.
 *   2. Workbook count claim: the disclaimer's named-workbook count
 *      must equal the number of Download buttons in ExportStep that
 *      surface a workbook (xlsx) export. Today: 1 == 1.
 *   3. Underwriting workbook still produces an Operating Statement
 *      with the rows the disclaimer enumerates (Personnel, Operating
 *      Expenses, Interest Expense, Principal & Capital Outlays,
 *      Depreciation, Net Income).
 *   4. Lender Pro-Forma generator must still be invokable (so the
 *      "available on request" claim is not a lie) but must NOT be
 *      surfaced as a wizard Download button.
 *   5. PDF text snapshot must contain the new disclaimer title +
 *      first sentence — guards against a partial refactor that
 *      changes the constant but skips the PDF renderer.
 *
 * Sibling search performed (#921 commit): the only PDF narrative
 * reference to "Lender Pro-Forma" outside the disclaimer constant is
 * a doc-comment at `LenderPacketPreview.tsx` and the renderer comment
 * at `lender-packet-pdf.ts:1321`. Other "Pro Forma" hits
 * (`formula-export.ts` "Year 1 Pro Forma", `pdf-proforma.ts`,
 * marketing `Footer.tsx` solution pages, `underwriting-workbook.ts`
 * doc comments) are unrelated artifacts and code commentary — not
 * lender-facing narrative copy.
 *
 * Hermetic: no DB, no network, no env vars.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRO_FORMA_METHODOLOGY_NOTE_BODY,
  PRO_FORMA_METHODOLOGY_NOTE_TITLE,
} from "@workspace/finance";
import { generateUnderwritingWorkbook } from "../src/lib/underwriting-workbook.js";
import { generateLenderProFormaWorkbook } from "../src/lib/lender-proforma-export.js";
import { MICROSCHOOL_MODEL } from "../src/lib/seed-preview-data.js";
import ExcelJS from "exceljs";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) passed++;
  else {
    failed++;
    failures.push(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

// ── 1. Single-source-of-truth structural check (Pattern D regression) ──
//
// Both surface files must import the constant — never re-derive the
// disclaimer text from a literal. If a future refactor inlines the
// copy in either renderer, drift between PDF and in-app preview
// becomes possible again.
function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

const pdfRendererSrc = readFile(
  "artifacts/api-server/src/lib/packets/lender-packet-pdf.ts",
);
const previewSrc = readFile(
  "artifacts/school-financial-model/src/components/export/LenderPacketPreview.tsx",
);

check(
  "Pattern D: PDF renderer imports the shared methodology constant",
  /PRO_FORMA_METHODOLOGY_NOTE_(BODY|TITLE)/.test(pdfRendererSrc),
  "lender-packet-pdf.ts must import PRO_FORMA_METHODOLOGY_NOTE_* from @workspace/finance",
);
check(
  "Pattern D: in-app preview imports the shared methodology constant",
  /PRO_FORMA_METHODOLOGY_NOTE_(BODY|TITLE)/.test(previewSrc),
  "LenderPacketPreview.tsx must import PRO_FORMA_METHODOLOGY_NOTE_* from @workspace/finance",
);
check(
  "Pattern D: PDF renderer does NOT inline the disclaimer body literal",
  !pdfRendererSrc.includes(PRO_FORMA_METHODOLOGY_NOTE_BODY),
  "PDF renderer must reference the constant, not duplicate its text",
);
check(
  "Pattern D: in-app preview does NOT inline the disclaimer body literal",
  !previewSrc.includes(PRO_FORMA_METHODOLOGY_NOTE_BODY),
  "In-app preview must reference the constant, not duplicate its text",
);

// ── 2. UI delivery channel: count workbook Download buttons in ExportStep ──
const exportStepSrc = readFile(
  "artifacts/school-financial-model/src/pages/model-wizard/steps/ExportStep.tsx",
);

// The wizard's urlMap surfaces every export the founder can click.
// We grep for endpoints that produce a workbook (xlsx) — the lender
// PDF and board PDF are PDFs, not workbooks.
const urlMapMatches = Array.from(
  exportStepSrc.matchAll(/export\/([a-z0-9-]+)/gi),
).map((m) => m[1]);
const WORKBOOK_ENDPOINTS = new Set([
  "underwriting-v2",
  "lender-proforma",
  "model",
  "single-year",
  "monthly-cashflow",
]);
const wizardWorkbookEndpoints = urlMapMatches.filter((ep) =>
  WORKBOOK_ENDPOINTS.has(ep),
);
const distinctWizardWorkbooks = new Set(wizardWorkbookEndpoints);

check(
  "Wizard ExportStep surfaces exactly one workbook Download button",
  distinctWizardWorkbooks.size === 1,
  `expected 1 workbook export endpoint in ExportStep urlMap, got ${distinctWizardWorkbooks.size}: ${JSON.stringify([...distinctWizardWorkbooks])}`,
);
check(
  "Wizard ExportStep surfaces the underwriting workbook (underwriting-v2)",
  distinctWizardWorkbooks.has("underwriting-v2"),
  "Founder must still get the canonical 5-Year Financial Model",
);
check(
  "Wizard ExportStep does NOT surface the Lender Pro-Forma (gated to 'available on request')",
  !distinctWizardWorkbooks.has("lender-proforma"),
  "If/when the follow-up task wires the Pro-Forma Download button, this assertion + the disclaimer body must flip together",
);

// ── 3. Disclaimer body must match the UI delivery reality ──
check(
  "Disclaimer title is the post-#921 single-workbook framing",
  PRO_FORMA_METHODOLOGY_NOTE_TITLE === "Reading the 5-Year Financial Model",
  `actual: ${JSON.stringify(PRO_FORMA_METHODOLOGY_NOTE_TITLE)}`,
);
check(
  "Disclaimer body says exactly ONE workbook ships",
  /ships one Excel workbook/i.test(PRO_FORMA_METHODOLOGY_NOTE_BODY),
  "must contain 'ships one Excel workbook'",
);
check(
  "Disclaimer body names the canonical workbook",
  PRO_FORMA_METHODOLOGY_NOTE_BODY.includes("5-Year Financial Model"),
  "must name '5-Year Financial Model'",
);
check(
  "Disclaimer body gates the Lender Pro-Forma as 'available on request pending QA'",
  /available on request pending QA/i.test(PRO_FORMA_METHODOLOGY_NOTE_BODY),
  "must include 'available on request pending QA'",
);
check(
  "Disclaimer body does NOT claim two workbooks ship (the prior, drifted copy)",
  !/ships two Excel workbooks/i.test(PRO_FORMA_METHODOLOGY_NOTE_BODY),
  "regression: do not revert to 'ships two Excel workbooks' until UI wires the second Download button",
);

// Disclaimer enumerates the Operating Statement rows; underwriting
// workbook must actually contain them or the lender will hit a
// credibility gap (claim vs. workbook content).
// Each tuple: [disclaimer-token (what the body actually says, lowercased),
//               workbook-row-label (what Operating Statement renders)].
// The disclaimer uses lowercase prose ("interest"), the workbook uses
// proper-case row labels ("Interest Expense"). Both must be present.
const OPERATING_STATEMENT_ROWS: Array<[string, string]> = [
  ["personnel", "Personnel"],
  ["operating expenses", "Operating Expenses"],
  ["interest", "Interest Expense"],
  ["principal & capital outlays", "Principal & Capital Outlays"],
  ["depreciation", "Depreciation"],
];
for (const [token, _row] of OPERATING_STATEMENT_ROWS) {
  check(
    `Disclaimer enumerates Operating Statement row: ${token}`,
    PRO_FORMA_METHODOLOGY_NOTE_BODY.toLowerCase().includes(token),
    `body must mention '${token}' so the claim matches the workbook content`,
  );
}

// ── 4. Underwriting workbook actually has those rows ──
function toArrayBuffer(buf: any): ArrayBuffer {
  if (buf instanceof ArrayBuffer) return buf;
  if (Buffer.isBuffer(buf)) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  return buf;
}

async function loadUnderwriting(): Promise<ExcelJS.Workbook> {
  // generateUnderwritingWorkbook returns an ExcelJS.Workbook (not
  // bytes); we serialize → reload so we exercise the same on-disk
  // shape lenders consume (mirrors demo-math-smoke loadUW helper).
  const generator = await generateUnderwritingWorkbook(MICROSCHOOL_MODEL as any);
  const bytes = (await generator.xlsx.writeBuffer()) as ArrayBuffer;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toArrayBuffer(bytes));
  return wb;
}

function findRowLabel(ws: ExcelJS.Worksheet, needle: string): number {
  const n = needle.toLowerCase();
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= Math.min(ws.columnCount, 6); c++) {
      const v = ws.getCell(r, c).value;
      if (typeof v === "string" && v.toLowerCase().includes(n)) return r;
    }
  }
  return -1;
}

// ── 5. Pro-Forma generator must still be invokable (so 'on request' is honest) ──
async function loadProForma(): Promise<ExcelJS.Workbook> {
  const buf = await generateLenderProFormaWorkbook(MICROSCHOOL_MODEL as any);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toArrayBuffer(buf));
  return wb;
}

(async () => {
  // Underwriting workbook content tie-out
  try {
    const uw = await loadUnderwriting();
    const sheetNames = uw.worksheets.map((w) => w.name);
    const operatingSheet =
      uw.worksheets.find((w) => /operating/i.test(w.name)) ?? uw.worksheets[0];
    check(
      "Underwriting workbook contains an Operating Statement sheet",
      !!operatingSheet && /operating/i.test(operatingSheet.name),
      `sheets: ${sheetNames.join(", ")}`,
    );
    if (operatingSheet) {
      for (const [, row] of OPERATING_STATEMENT_ROWS) {
        check(
          `Underwriting Operating Statement contains row: ${row}`,
          findRowLabel(operatingSheet, row) > 0,
          `row '${row}' not found in sheet '${operatingSheet.name}'`,
        );
      }
      check(
        "Underwriting Operating Statement contains a Net Income row",
        findRowLabel(operatingSheet, "Net Income") > 0,
      );
    }
  } catch (err) {
    check(
      "Underwriting workbook generates without throwing",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  // Pro-Forma must still build (so 'available on request' is not a lie)
  try {
    const pf = await loadProForma();
    const sheetNames = pf.worksheets.map((w) => w.name);
    check(
      "Lender Pro-Forma generator produces a workbook (so 'on request' fulfillment works)",
      pf.worksheets.length > 0,
      `sheets: ${sheetNames.join(", ")}`,
    );
  } catch (err) {
    check(
      "Lender Pro-Forma generator does not throw (must remain buildable for on-request fulfillment)",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  // ── 6. PDF snapshot must reflect the new disclaimer title ──
  const snapshotDir = path.join(REPO_ROOT, "artifacts/api-server/tests/__snapshots__");
  const lenderSnapshots = fs
    .readdirSync(snapshotDir)
    .filter((f) => f.startsWith("lender-pdf-") && f.endsWith(".txt"));
  check(
    "Lender PDF snapshots exist (snapshot tests have been run at least once)",
    lenderSnapshots.length > 0,
  );
  // PDF text-extraction breaks words across lines AND splits
  // characters mid-word (the pdf-parse output shows "5-Y\near" and
  // "pac\nk\net"). To make substring matching robust to those
  // wrapping artifacts, strip ALL whitespace before comparing.
  const compact = (s: string): string => s.replace(/\s+/g, "").toLowerCase();
  const needleTitle = compact("Reading the 5-Year Financial Model");
  const needleShipsOne = compact("ships one Excel workbook");
  const needleShipsTwoDrift = compact("ships two Excel workbooks");
  for (const snap of lenderSnapshots) {
    const txt = compact(fs.readFileSync(path.join(snapshotDir, snap), "utf8"));
    check(
      `Lender PDF snapshot ${snap} contains the new disclaimer title`,
      txt.includes(needleTitle),
      "snapshot must reflect post-#921 title — re-run UPDATE_SNAPSHOTS=1 if disclaimer changed",
    );
    check(
      `Lender PDF snapshot ${snap} contains the 'ships one Excel workbook' phrase`,
      txt.includes(needleShipsOne),
    );
    check(
      `Lender PDF snapshot ${snap} no longer contains the drifted 'ships two Excel workbooks' phrase`,
      !txt.includes(needleShipsTwoDrift),
    );
  }

  console.log(`two-workbooks-disclaimer-921: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.error(f);
    process.exit(1);
  }
})();
