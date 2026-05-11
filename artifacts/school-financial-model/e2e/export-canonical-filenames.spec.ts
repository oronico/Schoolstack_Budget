import {
  PERSONAS,
  primeAuthToken,
  seedPersonaModel,
} from "./utils/export-personas";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";

// Task #680: end-to-end coverage that the *actual* file a founder
// receives when they click each export uses the canonical
// `SchoolName_…` filename pattern. Task #676 already unit-tests the
// labels/tokens inside `ExportStep.tsx`, but the unit test stops at
// the fallback string — it never proves the server's
// Content-Disposition header actually carries a matching name.
//
// The Content-Disposition value is what the browser writes to disk
// (ExportStep prefers `filenameMatch?.[1]` over the local fallback),
// so a server-side regression that swapped the filename back to
// `Lender_Packet_<id>.pdf` or dropped the school-name prefix would
// silently ship a different file than what the wizard documents.
// This spec walks the wizard, triggers each export, and asserts the
// suggested filename matches the canonical pattern shared with Task
// #676. Each export gets its own test so a single failure points
// directly at the offending pipeline (and so each test fits in the
// default 60s window without needing setTimeout overrides).

const CANONICAL_FILENAME_RE =
  /^[A-Za-z0-9_-]+_(Founder_Planning_Workbook|1-Year_Operating_Budget|5-Year_Financial_Model|Board_and_Funder_Summary|Lender_Conversation_Snapshot)\.(xlsx|pdf)$/;

// The charter persona is multi-year and non-Chesterton, so it
// renders all four standard export cards (5-Year Financial Model,
// Founder Planning Workbook, Lender Conversation Snapshot, Board and
// Funder Summary).
const STANDARD_PERSONA = PERSONAS[0];

// Direct-download cards (no preview modal): clicking the card itself
// triggers the browser download. The card's accessible name is the
// concatenation of title + description + action text, so callers
// match on the unique title substring.
async function downloadFromCard(
  page: Page,
  cardName: RegExp,
): Promise<string> {
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: cardName }).click();
  const download = await downloadPromise;
  return download.suggestedFilename();
}

// Modal-mediated download: Lender + Board cards open a preview
// modal first; the actual download is gated behind the modal's
// "Download PDF" button. We wait for the cash-runway block to render
// so the test fails fast on a 500 from the JSON preview endpoint
// rather than waiting on a phantom download event.
async function downloadFromPreview(
  page: Page,
  cardName: RegExp,
  cashRunwayTestId: "lender-packet-cash-runway" | "board-packet-cash-runway",
): Promise<string> {
  await page.getByRole("button", { name: cardName }).click();
  await expect(page.getByTestId(cashRunwayTestId)).toBeVisible({
    timeout: 30_000,
  });
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /^Download PDF$/i }).click();
  const download = await downloadPromise;
  return download.suggestedFilename();
}

async function gotoExportStep(
  page: Page,
  request: APIRequestContext,
  persona = STANDARD_PERSONA,
): Promise<void> {
  const { token, modelId } = await seedPersonaModel(request, persona);
  await primeAuthToken(page, token);
  await page.goto(`/model/${modelId}`);
  await expect(
    page.getByRole("heading", { name: /Ready to export your model/i }),
  ).toBeVisible({ timeout: 30_000 });
}

test(`@smoke 5-Year Financial Model download uses the canonical SchoolName_ filename`, async ({
  page,
  request,
}) => {
  await gotoExportStep(page, request);
  const filename = await downloadFromCard(page, /5-Year Financial Model/);
  expect(filename, `5-Year Financial Model filename: ${filename}`).toMatch(
    CANONICAL_FILENAME_RE,
  );
  expect(filename).toMatch(/_5-Year_Financial_Model\.xlsx$/);
});

test(`@smoke Founder Planning Workbook download uses the canonical SchoolName_ filename`, async ({
  page,
  request,
}) => {
  await gotoExportStep(page, request);
  const filename = await downloadFromCard(page, /Founder Planning Workbook/);
  expect(filename, `Founder Planning Workbook filename: ${filename}`).toMatch(
    CANONICAL_FILENAME_RE,
  );
  expect(filename).toMatch(/_Founder_Planning_Workbook\.xlsx$/);
});

test(`@smoke Lender Conversation Snapshot download uses the canonical SchoolName_ filename`, async ({
  page,
  request,
}) => {
  await gotoExportStep(page, request);
  const filename = await downloadFromPreview(
    page,
    /Lender Conversation Snapshot/,
    "lender-packet-cash-runway",
  );
  expect(filename, `Lender Conversation Snapshot filename: ${filename}`).toMatch(
    CANONICAL_FILENAME_RE,
  );
  expect(filename).toMatch(/_Lender_Conversation_Snapshot\.pdf$/);
});

test(`@smoke Board and Funder Summary download uses the canonical SchoolName_ filename`, async ({
  page,
  request,
}) => {
  await gotoExportStep(page, request);
  const filename = await downloadFromPreview(
    page,
    /Board and Funder Summary/,
    "board-packet-cash-runway",
  );
  expect(filename, `Board and Funder Summary filename: ${filename}`).toMatch(
    CANONICAL_FILENAME_RE,
  );
  expect(filename).toMatch(/_Board_and_Funder_Summary\.pdf$/);
});

// The 1-Year Operating Budget label is the single-year alternate of
// the 5-Year Financial Model card (same code path on both client and
// server, just a different yearCount branch). Driving this branch
// through the wizard UI is fragile because the wizard's debounced
// autosave re-pads `revenueRows[*].amounts` arrays as soon as the
// page loads, flipping the server back to multi-year before we can
// click. We hit the formula export endpoint directly via Playwright's
// request context instead — still real HTTP through the running
// api-server, just without the wizard re-pad — and assert the
// Content-Disposition header carries the canonical
// `<School>_1-Year_Operating_Budget.xlsx` filename.
test(`@smoke Single-year formula export uses the canonical 1-Year_Operating_Budget filename`, async ({
  request,
}) => {
  const truncateAmounts = <T,>(rows: T): T => {
    if (!Array.isArray(rows)) return rows;
    return rows.map((row) => {
      if (
        row &&
        typeof row === "object" &&
        Array.isArray((row as { amounts?: unknown[] }).amounts)
      ) {
        return {
          ...(row as Record<string, unknown>),
          amounts: ((row as { amounts: unknown[] }).amounts).slice(0, 1),
        };
      }
      return row;
    }) as T;
  };
  const baseData = STANDARD_PERSONA.data as {
    schoolProfile?: Record<string, unknown>;
    revenueRows?: unknown[];
    expenseRows?: unknown[];
    staffingRows?: unknown[];
  };
  const singleYearPersona = {
    ...STANDARD_PERSONA,
    label: `${STANDARD_PERSONA.label}-single-year`,
    modelName: `${STANDARD_PERSONA.modelName} (Single Year)`,
    data: {
      ...STANDARD_PERSONA.data,
      schoolProfile: {
        ...(baseData.schoolProfile ?? {}),
        modelDuration: "single_year",
      },
      revenueRows: truncateAmounts(baseData.revenueRows),
      expenseRows: truncateAmounts(baseData.expenseRows),
      staffingRows: truncateAmounts(baseData.staffingRows),
    },
  };

  const { token, modelId } = await seedPersonaModel(request, singleYearPersona);

  const res = await request.get(`/api/models/${modelId}/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(
    res.ok(),
    `formula export failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  const disposition = res.headers()["content-disposition"] ?? "";
  const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
  const filename = filenameMatch?.[1] ?? "";
  expect(filename, `Content-Disposition was: ${disposition}`).toMatch(
    CANONICAL_FILENAME_RE,
  );
  expect(filename).toMatch(/_1-Year_Operating_Budget\.xlsx$/);
});
