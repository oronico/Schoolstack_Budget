import { PERSONAS, primeAuthToken, seedPersonaModel } from "./utils/export-personas";
import { test, expect, type Page } from "./utils/test";

// Task #450: end-to-end coverage for the two remaining PDF export
// endpoints across every reference persona (Task #449 covered
// Lender-Ready Packet + Board Summary; Task #454 expanded the persona
// list to include tutoring center and learning pod):
//
//   - GET /api/models/:id/export/pro-forma-pdf
//   - GET /api/models/:id/export/loan-readiness-pdf
//
// Both produce real PDFs but neither is wired to an ExportCard in the
// wizard's Export step today, so we drive each download from inside
// the browser using the same blob → <a download> → click pattern
// `ExportStep.handleDownload` uses for the existing card-based
// downloads. That fires Playwright's `download` event, matching the
// `page.waitForEvent("download")` shape of `export-download-personas`,
// and exercises the wiring we care about end-to-end:
//
//   * localStorage auth token → fetch Authorization header
//   * Vite dev proxy → api-server route
//   * Real PDF blob handed to the browser (not a JSON error masquerading)
//   * Server's Content-Disposition filename surfaces in the download

interface DownloadResult {
  filename: string;
  size: number;
  magic: string;
}

async function downloadFromBrowser(
  page: Page,
  url: string,
): Promise<DownloadResult> {
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.evaluate(async (target) => {
    const token = window.localStorage.getItem("auth_token");
    const res = await fetch(target, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`fetch ${target} failed ${res.status}: ${body.slice(0, 300)}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") ?? "";
    const m = disposition.match(/filename="?([^";\n]+)"?/);
    const filename = m?.[1] ?? "download.pdf";
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    // Defer revoke/cleanup so Chromium has time to capture the download.
    setTimeout(() => {
      URL.revokeObjectURL(objUrl);
      a.remove();
    }, 100);
  }, url);
  const download = await downloadPromise;

  const filename = download.suggestedFilename();
  const path = await download.path();
  expect(path, `download path missing for ${url}`).toBeTruthy();
  const { promises: fs } = await import("node:fs");
  const stat = await fs.stat(path!);
  // Read first 5 bytes to verify the file is actually a PDF — a JSON
  // error blob masquerading as a PDF would happily pass a size check.
  const handle = await fs.open(path!, "r");
  try {
    const buf = Buffer.alloc(5);
    await handle.read(buf, 0, 5, 0);
    return { filename, size: stat.size, magic: buf.toString("latin1") };
  } finally {
    await handle.close();
  }
}

interface PdfCase {
  label: string;
  pathBuilder: (modelId: number) => string;
  // Substring (case-insensitive) the Content-Disposition filename hint
  // must contain — guards against a regression that returns a 200 with
  // the wrong PDF (e.g. lender packet bytes from a misrouted handler).
  filenameContains: string;
}

const PDF_CASES: PdfCase[] = [
  {
    label: "Pro-Forma PDF",
    pathBuilder: (id) => `/api/models/${id}/export/pro-forma-pdf`,
    filenameContains: "Pro_Forma",
  },
  {
    label: "Loan Readiness PDF",
    pathBuilder: (id) => `/api/models/${id}/export/loan-readiness-pdf`,
    filenameContains: "Loan_Readiness",
  },
];

for (const persona of PERSONAS) {
  for (const pdfCase of PDF_CASES) {
    test(`${pdfCase.label} downloads for ${persona.label}`, async ({
      page,
      request,
    }) => {
      const { token, modelId } = await seedPersonaModel(request, persona);
      await primeAuthToken(page, token);

      // Land on the wizard so the page has the same origin / auth
      // context as the founder's real session before triggering the
      // download.
      await page.goto(`/model/${modelId}`);
      await expect(
        page.getByRole("heading", { name: /Ready to export your model/i }),
      ).toBeVisible({ timeout: 30_000 });

      const { filename, size, magic } = await downloadFromBrowser(
        page,
        pdfCase.pathBuilder(modelId),
      );

      expect(filename, `${pdfCase.label} for ${persona.label} filename`).toMatch(
        /\.pdf$/i,
      );
      expect(
        filename.toLowerCase(),
        `${pdfCase.label} for ${persona.label} filename slug`,
      ).toContain(pdfCase.filenameContains.toLowerCase());
      expect(
        size,
        `${pdfCase.label} for ${persona.label} size`,
      ).toBeGreaterThan(5_000);
      expect(
        magic,
        `${pdfCase.label} for ${persona.label} magic bytes`,
      ).toBe("%PDF-");
    });
  }
}
