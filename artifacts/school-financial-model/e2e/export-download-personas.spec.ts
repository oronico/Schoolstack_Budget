import {
  PERSONAS,
  primeAuthToken,
  seedPersonaModel,
  type PersonaCase,
} from "./utils/export-personas";
import { extractPdfText } from "./utils/extract-pdf-text";
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
): Promise<{ filename: string; size: number; magic: string; path: string }> {
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
    return {
      filename,
      size: stat.size,
      magic: buf.toString("latin1"),
      path: path!,
    };
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

// Pursued + actuals saved scenarios injected into the persona for the
// filter-passthrough tests below. Without at least one pursued scenario
// carrying comparable actuals, the lender packet's Forecast Accuracy
// section is omitted entirely (renderForecastAccuracySection short-
// circuits on rollup.entries.length === 0) and there's nothing for
// renderFilterCaption to attach to — meaning a "caption present"
// assertion would always fail regardless of whether the wiring works.
// We pick scenarios with `asOfYear: 1` and `enrollmentActual` populated
// so the `metric=enrollment&asOfYear=1` filter keeps both, exercising
// the populated branch (caption + table) rather than the empty branch.
// Neither carries `appliedToModelAt`, so they remain saved-only and the
// base persona's projections (and its assumption-flag set) are
// unchanged — meaning the existing PERSONAS[0] flag resolutions still
// clear the export gate.
const FORECAST_FILTER_SAVED_SCENARIOS = [
  {
    name: "Add Middle School wing (filter fixture)",
    outcomeStatus: "pursued",
    decisionType: "add_program",
    outcomeUpdatedAt: "2025-03-15T12:00:00Z",
    overrides: {
      addProgramName: "Middle School",
      addProgramGradeBand: "6-8",
      addProgramTuition: 14000,
      addProgramEnrollment: [10, 20, 30, 30, 30],
      addProgramAddedFte: 2.5,
    },
    actuals: {
      asOfYear: 1,
      enrollmentActual: 130,
      revenueActual: 1_100_000,
      expenseActual: 1_080_000,
      netIncomeActual: 20_000,
      notes: "Filter passthrough fixture (saved-only).",
      updatedAt: "2025-09-01T10:00:00Z",
    },
  },
  {
    name: "Open downtown facility (filter fixture)",
    outcomeStatus: "pursued",
    decisionType: "evaluate_site",
    outcomeUpdatedAt: "2025-04-15T12:00:00Z",
    overrides: { monthlyRent: 18_000, sqftDelta: 1500 },
    actuals: {
      asOfYear: 1,
      enrollmentActual: 118,
      revenueActual: 950_000,
      expenseActual: 1_000_000,
      netIncomeActual: -50_000,
      signedMonthlyRent: 18_500,
      notes: "Filter passthrough fixture (saved-only).",
      updatedAt: "2025-09-15T10:00:00Z",
    },
  },
];

function withForecastScenarios(persona: PersonaCase, label: string): PersonaCase {
  return {
    ...persona,
    label,
    modelName: `${persona.modelName} ${label}`,
    data: {
      ...persona.data,
      customScenarios: FORECAST_FILTER_SAVED_SCENARIOS,
    },
  };
}

// Task #391 wired the forecast-accuracy filter (metric + as-of year)
// through to the lender packet PDF body so the caption surfaces in the
// downloaded artifact. We assert two things: (a) the URL passthrough
// from page → JSON preview → PDF endpoint keeps the metric + asOfYear
// query params intact, and (b) the printed PDF body actually carries
// the "Filtered to ..." caption (Task #452). Without (b), a future
// refactor that received the filter on the server but silently dropped
// renderFilterCaption from the section renderer would still pass — the
// founder would receive an unfiltered-looking packet with no warning.
test("Lender-Ready Packet honours ?metric & ?asOfYear filter passthrough", async ({
  page,
  request,
}) => {
  const persona = withForecastScenarios(PERSONAS[0], "filter-passthrough");
  const { token, modelId } = await seedPersonaModel(request, persona);
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

  const { filename, size, magic, path } = await downloadFromPreview(
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

  // Task #452: URL passthrough only proves the filter REACHED the
  // server. Crack open the printed PDF and confirm renderFilterCaption
  // actually wrote the "Filtered to ..." caption into the page bytes —
  // otherwise a future refactor that received the filter but dropped
  // the caption call would silently regress with no test failure.
  // We assert the three pieces of the caption independently rather
  // than the full string because the caption joins them with a unicode
  // middle dot ("·") whose encoding through pdfkit's font subset isn't
  // guaranteed to round-trip through our minimal extractor.
  const { promises: fs } = await import("node:fs");
  const pdfBuffer = await fs.readFile(path);
  const pdfText = extractPdfText(pdfBuffer);
  expect(pdfText, "PDF body missing 'Filtered to' caption prefix").toContain(
    "Filtered to",
  );
  expect(
    pdfText,
    "PDF body missing 'Total enrollment' metric label in filter caption",
  ).toContain("Total enrollment");
  expect(
    pdfText,
    "PDF body missing 'Year 1 actuals' year label in filter caption",
  ).toContain("Year 1 actuals");
});

// Negative companion to the filter-passthrough test above (Task #452).
// When no metric/asOfYear query params are supplied, the Forecast
// Accuracy section must STILL render (the persona has pursued + actuals
// scenarios), but the "Filtered to ..." caption must NOT appear —
// otherwise the positive assertion has no bite (a renderer that
// unconditionally printed the caption would still pass test (b) above).
test("Lender-Ready Packet omits filter caption when no ?metric/?asOfYear is supplied", async ({
  page,
  request,
}) => {
  const persona = withForecastScenarios(PERSONAS[0], "filter-omitted");
  const { token, modelId } = await seedPersonaModel(request, persona);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);
  await expect(
    page.getByRole("heading", { name: /Ready to export your model/i }),
  ).toBeVisible({ timeout: 30_000 });

  const { magic, path } = await downloadFromPreview(
    page,
    /Lender-Ready Packet/i,
    "lender-packet-cash-runway",
  );
  expect(magic).toBe("%PDF-");

  const { promises: fs } = await import("node:fs");
  const pdfBuffer = await fs.readFile(path);
  const pdfText = extractPdfText(pdfBuffer);

  // Sanity: the section title IS present — proves the section rendered
  // (so the "no caption" assertion below is meaningful, not just a
  // by-product of the section being skipped entirely).
  expect(
    pdfText,
    "expected Forecast Accuracy section to render for unfiltered packet",
  ).toContain("Forecast Accuracy");
  expect(
    pdfText,
    "filter caption leaked into unfiltered packet",
  ).not.toContain("Filtered to");
});
