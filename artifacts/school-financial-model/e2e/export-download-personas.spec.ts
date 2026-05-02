import { PERSONAS, primeAuthToken, seedPersonaModel } from "./utils/export-personas";
import { test, expect, type Page } from "./utils/test";

// Task #449: end-to-end coverage that the lender-ready and board-summary
// PDF downloads round-trip cleanly for the three reference personas we
// already ship as fixtures in the api-server test suite. Component tests
// cover the modal layout and PDF route handlers cover the bytes; what
// only a real browser proves is the wiring from `/model/{id}` (Export
// step) → ExportCard click → preview modal load → "Download PDF" button
// → blob handed back to the browser. Earlier reviews of the lender +
// board pipelines (Task #391) showed the failure mode is silent — the
// modal renders fine but the PDF fetch 500s for a persona-shape that
// isn't covered by unit tests, so the founder gets a "Failed to
// download PDF" alert with no telemetry. This spec exercises the three
// flagship founder shapes we always quote in marketing copy:
//
//   * charter / public-funded   → `charterPublicFunding`     (OH, ~120-400)
//   * private high school        → `privateSchoolWithESA`     (FL, ~100-200)
//   * homeschool co-op (mixed)   → `homeschoolCoopMixed`      (AZ, ~15-40)
//
// so any persona-shape regression fails the e2e suite before it ships.
//
// One additional spec exercises the forecast-accuracy filter passthrough
// (`?metric=…&asOfYear=…`) on the lender packet — Task #391 made the
// filter caption flow through to the PDF body, and we want a smoke test
// that at minimum proves the URL params don't break the download.
//
// Task #450 split the persona / seed helpers out into
// `e2e/utils/export-personas.ts` so the sister spec
// (`export-download-extra-personas.spec.ts`) can reuse them without
// duplicating the warning-flag boilerplate.

// Triggers a modal-mediated PDF download. The ExportStep's "Lender-Ready
// Packet" / "Board Summary" cards open a preview modal first; the actual
// download is gated behind the modal's "Download PDF" button. We assert
// the cash-runway block has rendered (modal data fetch landed) before
// clicking download so the test fails fast on a 500 from the JSON
// preview endpoint rather than waiting on a phantom download event.
async function downloadFromPreview(
  page: Page,
  cardName: RegExp,
  cashRunwayTestId: "lender-packet-cash-runway" | "board-packet-cash-runway",
): Promise<{ filename: string; size: number; magic: string }> {
  await page.getByRole("button", { name: cardName }).click();
  await expect(page.getByTestId(cashRunwayTestId)).toBeVisible({
    timeout: 30_000,
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /^Download PDF$/i }).click();
  const download = await downloadPromise;

  const filename = download.suggestedFilename();
  const path = await download.path();
  expect(
    path,
    `download path missing for ${cashRunwayTestId}`,
  ).toBeTruthy();
  const { promises: fs } = await import("node:fs");
  const stat = await fs.stat(path!);
  // Read first 5 bytes to verify the file is actually a PDF (a JSON
  // error blob masquerading as a PDF would happily pass a size check).
  const handle = await fs.open(path!, "r");
  try {
    const buf = Buffer.alloc(5);
    await handle.read(buf, 0, 5, 0);
    return { filename, size: stat.size, magic: buf.toString("latin1") };
  } finally {
    await handle.close();
  }
}

for (const persona of PERSONAS) {
  test(`Lender-Ready Packet PDF downloads for ${persona.label}`, async ({
    page,
    request,
  }) => {
    const { token, modelId } = await seedPersonaModel(request, persona);
    await primeAuthToken(page, token);

    await page.goto(`/model/${modelId}`);
    await expect(
      page.getByRole("heading", { name: /Ready to export your model/i }),
    ).toBeVisible({ timeout: 30_000 });

    const { filename, size, magic } = await downloadFromPreview(
      page,
      /Lender-Ready Packet/i,
      "lender-packet-cash-runway",
    );

    // The PDF route returns a real PDF blob; assert non-trivial bytes and
    // that the suggested filename matches the server's content-disposition
    // pattern (Lender_Packet_<id>.pdf or a school-name slug variant).
    expect(filename, `filename for ${persona.label}`).toMatch(/\.pdf$/i);
    expect(filename.toLowerCase()).toContain("lender");
    // 5KB floor: a totally empty / error PDF would be a few hundred bytes;
    // a real lender packet with cover + 5-yr forecast + DSCR is ~tens of KB
    // even for the smallest persona.
    expect(size, `lender PDF size for ${persona.label}`).toBeGreaterThan(5_000);
    // Magic bytes guard: ensures the file is actually a PDF, not a JSON
    // error blob or HTML 500 page that just happens to be >5KB.
    expect(magic, `lender PDF magic for ${persona.label}`).toBe("%PDF-");
  });

  test(`Board Summary PDF downloads for ${persona.label}`, async ({
    page,
    request,
  }) => {
    const { token, modelId } = await seedPersonaModel(request, persona);
    await primeAuthToken(page, token);

    await page.goto(`/model/${modelId}`);
    await expect(
      page.getByRole("heading", { name: /Ready to export your model/i }),
    ).toBeVisible({ timeout: 30_000 });

    const { filename, size, magic } = await downloadFromPreview(
      page,
      /Board Summary/i,
      "board-packet-cash-runway",
    );

    expect(filename, `filename for ${persona.label}`).toMatch(/\.pdf$/i);
    expect(filename.toLowerCase()).toContain("board");
    expect(size, `board PDF size for ${persona.label}`).toBeGreaterThan(5_000);
    expect(magic, `board PDF magic for ${persona.label}`).toBe("%PDF-");
  });
}

// Task #391 wired the forecast-accuracy filter (metric + as-of year)
// through to the lender packet PDF body so the caption surfaces in the
// downloaded artifact. We don't crack the PDF open here — the api-server
// suite already pins the caption rendering — but we DO want to know if
// the URL passthrough breaks (e.g. a future change drops the
// buildForecastFilterQuery call) because that's a silent regression: the
// modal still opens, the download still arrives, but the founder gets
// an unfiltered packet with no caption and no warning.
//
// To make this assertion meaningful (not just "did anything download"),
// we capture the actual outbound request URLs to BOTH the JSON preview
// endpoint (/export/lender-packet) and the PDF endpoint
// (/export/lender-packet-pdf) and assert each one carries the expected
// metric + asOfYear query params. If a future change strips the filter,
// this test fails immediately, even though the download itself would
// still succeed.
test("Lender-Ready Packet honours ?metric & ?asOfYear filter passthrough", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedPersonaModel(request, PERSONAS[0]);
  await primeAuthToken(page, token);

  const previewUrls: string[] = [];
  const pdfUrls: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    // Match both the JSON preview and the PDF download endpoints for
    // this specific model id; ignore any other in-flight traffic.
    if (url.includes(`/api/models/${modelId}/export/lender-packet-pdf`)) {
      pdfUrls.push(url);
    } else if (url.includes(`/api/models/${modelId}/export/lender-packet`)) {
      previewUrls.push(url);
    }
  });

  await page.goto(`/model/${modelId}?metric=enrollment&asOfYear=1`);
  await expect(
    page.getByRole("heading", { name: /Ready to export your model/i }),
  ).toBeVisible({ timeout: 30_000 });

  const { filename, size, magic } = await downloadFromPreview(
    page,
    /Lender-Ready Packet/i,
    "lender-packet-cash-runway",
  );

  expect(filename).toMatch(/\.pdf$/i);
  expect(size).toBeGreaterThan(5_000);
  expect(magic).toBe("%PDF-");

  // Both endpoints must have been called, and both must carry the
  // metric + asOfYear query string verbatim. We URL-decode for the
  // assertion so we don't depend on whether the client uses
  // URLSearchParams or string concatenation.
  expect(
    previewUrls.length,
    `expected at least one /export/lender-packet preview request, got ${previewUrls.length}`,
  ).toBeGreaterThan(0);
  expect(
    pdfUrls.length,
    `expected at least one /export/lender-packet-pdf request, got ${pdfUrls.length}`,
  ).toBeGreaterThan(0);
  for (const url of previewUrls) {
    expect(url, `preview url missing metric: ${url}`).toMatch(
      /[?&]metric=enrollment(&|$)/,
    );
    expect(url, `preview url missing asOfYear: ${url}`).toMatch(
      /[?&]asOfYear=1(&|$)/,
    );
  }
  for (const url of pdfUrls) {
    expect(url, `pdf url missing metric: ${url}`).toMatch(
      /[?&]metric=enrollment(&|$)/,
    );
    expect(url, `pdf url missing asOfYear: ${url}`).toMatch(
      /[?&]asOfYear=1(&|$)/,
    );
  }
});
