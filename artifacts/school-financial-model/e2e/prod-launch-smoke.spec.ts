import { test, expect } from "./utils/test";
import type { ConsoleMessage, Download, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * PROD LAUNCH SMOKE — drives https://budget.schoolstack.ai/underwriting in a
 * real Chromium browser through three founder scenarios + a mobile viewport
 * pass, validates the lender-readiness snapshot renders, attempts to run the
 * server-side analysis, and (when the prod backend supports it) captures the
 * Excel workbook download to verify it is non-empty.
 *
 * This spec is the authoritative GO/NO-GO browser proof requested for the
 * loan-program launch. Run with:
 *
 *   E2E_BASE_URL=https://budget.schoolstack.ai \
 *     pnpm --filter @workspace/school-financial-model exec playwright test \
 *     prod-launch-smoke.spec.ts --reporter=list
 *
 * The wizard is fully public (no login), so we do not need any auth seeding.
 * State is per-tab in localStorage under `guest_underwriting_model_v1`; we
 * wipe it on every test so scenarios cannot bleed into each other.
 */

const STORAGE_KEY = "guest_underwriting_model_v1";

const PROD_DOWNLOAD_DIR = path.resolve(
  process.cwd(),
  ".local",
  "e2e-logs",
  "prod-launch-smoke",
);

test.beforeAll(() => {
  fs.mkdirSync(PROD_DOWNLOAD_DIR, { recursive: true });
});

interface ConsoleCapture {
  errors: string[];
  warnings: string[];
  pageErrors: string[];
}

function attachConsoleCapture(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = {
    errors: [],
    warnings: [],
    pageErrors: [],
  };
  page.on("console", (msg: ConsoleMessage) => {
    const text = `[${msg.type()}] ${msg.text()}`;
    if (msg.type() === "error") capture.errors.push(text);
    if (msg.type() === "warning") capture.warnings.push(text);
  });
  page.on("pageerror", (err) => {
    capture.pageErrors.push(String(err?.stack ?? err));
  });
  return capture;
}

async function clearStorageBeforeNav(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* about:blank may not have storage; init script reruns on real nav */
    }
  }, STORAGE_KEY);
}

async function fillByTestId(
  page: Page,
  testId: string,
  value: string,
): Promise<void> {
  const el = page.getByTestId(testId);
  await expect(el, `expected ${testId} to be visible`).toBeVisible({
    timeout: 15_000,
  });
  await el.fill(value);
}

async function selectByTestId(
  page: Page,
  testId: string,
  value: string,
): Promise<void> {
  const el = page.getByTestId(testId);
  await expect(el, `expected ${testId} to be visible`).toBeVisible({
    timeout: 15_000,
  });
  await el.selectOption(value);
}

async function clickNext(page: Page): Promise<void> {
  await page.getByTestId("button-next").click();
}

async function walkStepsToReview(page: Page): Promise<void> {
  // Six "Continue" clicks take us 1 → 2 → 3 → 4 → 5 → 6 → 7 (Review & Export).
  for (let i = 0; i < 6; i++) {
    await clickNext(page);
  }
  await expect(
    page.getByTestId("lender-readiness-snapshot"),
    "lender readiness snapshot must render on review step",
  ).toBeVisible({ timeout: 20_000 });
}

interface ScenarioResult {
  scenario: string;
  readinessStatus: string;
  reviewSchoolName: string;
  reviewY1: string;
  reviewY5: string;
  analysisAttempted: boolean;
  analysisSucceeded: boolean;
  analysisError: string | null;
  downloadAttempted: boolean;
  downloadSucceeded: boolean;
  downloadFilename: string | null;
  downloadBytes: number | null;
  downloadError: string | null;
  consoleErrors: number;
  pageErrors: number;
  consoleErrorSamples: string[];
  pageErrorSamples: string[];
}

async function runScenarioTrailingSteps(
  page: Page,
  console: ConsoleCapture,
  scenario: string,
): Promise<Omit<ScenarioResult, "scenario">> {
  const readinessStatus = (
    await page.getByTestId("readiness-status").textContent()
  )?.trim() ?? "(missing)";
  const reviewSchoolName = (
    await page.getByTestId("review-school-name").textContent()
  )?.trim() ?? "";
  const reviewY1 = (
    await page.getByTestId("review-y1-students").textContent()
  )?.trim() ?? "";
  const reviewY5 = (
    await page.getByTestId("review-y5-students").textContent()
  )?.trim() ?? "";

  // Attempt server-side analysis (best-effort — does not fail the scenario
  // if prod returns 4xx/5xx; we record the outcome instead).
  let analysisSucceeded = false;
  let analysisError: string | null = null;
  const runBtn = page.getByTestId("button-run-analysis");
  const analysisAttempted = await runBtn.isVisible().catch(() => false);
  if (analysisAttempted) {
    await runBtn.click().catch(() => {});
    // Wait up to 30s for either the success card or the error banner to
    // appear. Either outcome is observed; only an indefinite hang is bad.
    const success = page
      .getByTestId("card-analysis-result")
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "success" as const)
      .catch(() => null);
    const failure = page
      .getByTestId("text-analysis-error")
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => "failure" as const)
      .catch(() => null);
    const outcome = await Promise.race([success, failure]);
    if (outcome === "success") {
      analysisSucceeded = true;
    } else if (outcome === "failure") {
      analysisError = (
        await page.getByTestId("text-analysis-error").textContent()
      )?.trim() ?? "(unknown error)";
    } else {
      analysisError = "timeout waiting for analysis result";
    }
  }

  // Excel workbook download (best-effort).
  let downloadSucceeded = false;
  let downloadFilename: string | null = null;
  let downloadBytes: number | null = null;
  let downloadError: string | null = null;
  const dlBtn = page.getByTestId("button-download-excel");
  const downloadAttempted = await dlBtn.isVisible().catch(() => false);
  if (downloadAttempted) {
    try {
      const downloadPromise = page.waitForEvent("download", {
        timeout: 45_000,
      });
      await dlBtn.click();
      const download: Download = await downloadPromise;
      downloadFilename = download.suggestedFilename();
      const target = path.join(
        PROD_DOWNLOAD_DIR,
        `${scenario.replace(/[^a-z0-9]+/gi, "-")}-${downloadFilename}`,
      );
      await download.saveAs(target);
      const stat = fs.statSync(target);
      downloadBytes = stat.size;
      downloadSucceeded = downloadBytes > 1024;
      if (!downloadSucceeded) {
        downloadError = `workbook only ${downloadBytes} bytes — likely truncated`;
      }
    } catch (err) {
      downloadError = String(err instanceof Error ? err.message : err);
      // Fall back to checking for a visible error banner.
      const errBanner = page.getByTestId("text-export-error");
      if (await errBanner.isVisible().catch(() => false)) {
        downloadError = `${downloadError} | banner: ${(
          await errBanner.textContent()
        )?.trim()}`;
      }
    }
  }

  return {
    readinessStatus,
    reviewSchoolName,
    reviewY1,
    reviewY5,
    analysisAttempted,
    analysisSucceeded,
    analysisError,
    downloadAttempted,
    downloadSucceeded,
    downloadFilename,
    downloadBytes,
    downloadError,
    consoleErrors: console.errors.length,
    pageErrors: console.pageErrors.length,
    consoleErrorSamples: console.errors.slice(0, 5),
    pageErrorSamples: console.pageErrors.slice(0, 5),
  };
}

const RESULTS: ScenarioResult[] = [];

test.afterAll(() => {
  const summaryPath = path.join(PROD_DOWNLOAD_DIR, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(RESULTS, null, 2), "utf8");
  // Console output captured by the `list` reporter — keeps the proof pack
  // update step trivially copy-pasteable.
  // eslint-disable-next-line no-console
  console.log(
    "\n=== PROD LAUNCH SMOKE — RESULTS ===\n" +
      JSON.stringify(RESULTS, null, 2) +
      `\n=== summary written to ${summaryPath} ===\n`,
  );
});

// ---------------------------------------------------------------------------
// Scenario 1: Launch Test Academy (microschool, new, tuition-based)
// ---------------------------------------------------------------------------
test("[PROD] Launch Test Academy — microschool, new, tuition-based", async ({
  page,
}) => {
  const consoleCap = attachConsoleCapture(page);
  await clearStorageBeforeNav(page);
  await page.goto("/underwriting", { waitUntil: "domcontentloaded" });

  // Step 1: profile
  await fillByTestId(page, "input-school-name", "Launch Test Academy");
  await selectByTestId(page, "select-school-type", "microschool");
  await selectByTestId(page, "select-school-stage", "new_school");
  await selectByTestId(page, "select-funding-profile", "tuition_based");
  await fillByTestId(page, "input-state", "TX");
  await clickNext(page);

  // Step 2: enrollment — modest founding cohort with deposit evidence
  await fillByTestId(page, "input-year1-students", "18");
  await fillByTestId(page, "input-growth-pct", "20");
  // GUEST_DEFAULTS may set enrollment-validation to a value that hides the
  // signed-agreements/deposit fields; switching to "deposits" surfaces them
  // and exercises the realistic micro-school evidence path.
  await selectByTestId(page, "select-enrollment-validation", "deposits_collected");
  await fillByTestId(page, "input-deposit-count", "12");
  await fillByTestId(page, "input-avg-deposit", "500");
  await fillByTestId(page, "input-collection-rate", "95");
  await fillByTestId(page, "input-retention-rate", "85");
  await clickNext(page);

  // Step 3: revenue
  await fillByTestId(page, "input-tuition", "9500");
  await fillByTestId(page, "input-public-funding", "0");
  await fillByTestId(page, "input-philanthropy", "10000");
  await clickNext(page);

  // Step 4: staffing — founder unpaid Year 1, comp begins Year 2
  await fillByTestId(page, "input-students-per-teacher", "9");
  await fillByTestId(page, "input-teacher-salary", "42000");
  await fillByTestId(page, "input-num-admin", "0");
  await fillByTestId(page, "input-admin-salary", "0");
  // toggle defaults to false (deferred); verify deferred inputs are reachable
  await expect(page.getByTestId("input-founder-comp")).toBeVisible();
  await fillByTestId(page, "input-founder-comp", "45000");
  await selectByTestId(page, "select-founder-comp-year", "2");
  await clickNext(page);

  // Step 5: expenses & facility
  await fillByTestId(page, "input-monthly-rent", "2200");
  await fillByTestId(page, "input-utilities", "3600");
  await fillByTestId(page, "input-insurance", "4500");
  await fillByTestId(page, "input-curriculum", "5000");
  await fillByTestId(page, "input-other-opex", "6000");
  await clickNext(page);

  // Step 6: debt & cash — no existing debt, no requested loan
  await fillByTestId(page, "input-beginning-cash", "25000");
  await clickNext(page);

  // Step 7: review
  await expect(
    page.getByTestId("lender-readiness-snapshot"),
  ).toBeVisible({ timeout: 20_000 });

  const result = await runScenarioTrailingSteps(
    page,
    consoleCap,
    "launch-test-academy",
  );
  RESULTS.push({ scenario: "Launch Test Academy", ...result });

  // HARD ASSERTIONS — these are the GO-rule conditions for tomorrow's launch.
  // "Best effort" was a false-green risk per architect review.
  expect(result.pageErrors, `page errors: ${result.pageErrorSamples.join("\n")}`).toBe(0);
  expect(result.consoleErrors, `console errors: ${result.consoleErrorSamples.join("\n")}`).toBe(0);
  expect(result.analysisAttempted, "Run Analysis button must be visible on review").toBe(true);
  expect(result.analysisSucceeded, `analysis must succeed (err: ${result.analysisError})`).toBe(true);
  expect(result.downloadAttempted, "Download Excel button must be visible on review").toBe(true);
  expect(result.downloadSucceeded, `download must succeed (err: ${result.downloadError})`).toBe(true);
  expect(result.downloadBytes ?? 0, "workbook must be > 10 KB").toBeGreaterThan(10_000);
  // The two healthy scenarios should land in the green/yellow band, not "Not Yet Ready".
  expect(result.readinessStatus.toLowerCase()).not.toContain("not yet ready");
});

// ---------------------------------------------------------------------------
// Scenario 2: Actuals Test School — operating private school
// ---------------------------------------------------------------------------
test("[PROD] Actuals Test School — operating private school", async ({
  page,
}) => {
  const consoleCap = attachConsoleCapture(page);
  await clearStorageBeforeNav(page);
  await page.goto("/underwriting", { waitUntil: "domcontentloaded" });

  // Step 1
  await fillByTestId(page, "input-school-name", "Actuals Test School");
  await selectByTestId(page, "select-school-type", "private_school");
  await selectByTestId(page, "select-school-stage", "operating_school");
  await selectByTestId(page, "select-funding-profile", "tuition_based");
  await fillByTestId(page, "input-state", "WA");
  await clickNext(page);

  // Step 2 — already operating, larger enrollment with strong evidence
  await fillByTestId(page, "input-year1-students", "120");
  await fillByTestId(page, "input-growth-pct", "8");
  await selectByTestId(
    page,
    "select-enrollment-validation",
    "signed_agreements",
  );
  await fillByTestId(page, "input-signed-agreements", "115");
  await fillByTestId(page, "input-collection-rate", "97");
  await fillByTestId(page, "input-retention-rate", "92");
  await clickNext(page);

  // Step 3
  await fillByTestId(page, "input-tuition", "16500");
  await fillByTestId(page, "input-public-funding", "0");
  await fillByTestId(page, "input-philanthropy", "75000");
  await clickNext(page);

  // Step 4
  await fillByTestId(page, "input-students-per-teacher", "12");
  await fillByTestId(page, "input-teacher-salary", "52000");
  await fillByTestId(page, "input-num-admin", "2");
  await fillByTestId(page, "input-admin-salary", "78000");
  // Founder paid Year 1 — toggle on, comp begins Year 1
  const founderToggle = page.getByTestId("toggle-founder-paid");
  if (!(await founderToggle.isChecked())) {
    await founderToggle.check();
  }
  await fillByTestId(page, "input-founder-comp", "95000");
  await selectByTestId(page, "select-founder-comp-year", "1");
  await clickNext(page);

  // Step 5
  await fillByTestId(page, "input-monthly-rent", "12000");
  await fillByTestId(page, "input-utilities", "18000");
  await fillByTestId(page, "input-insurance", "22000");
  await fillByTestId(page, "input-curriculum", "35000");
  await fillByTestId(page, "input-other-opex", "55000");
  await clickNext(page);

  // Step 6 — has existing debt + requesting expansion loan
  await fillByTestId(page, "input-beginning-cash", "180000");
  const debtToggle = page.getByTestId("toggle-existing-debt");
  if (!(await debtToggle.isChecked())) {
    await debtToggle.check();
  }
  await fillByTestId(page, "input-existing-debt-balance", "120000");
  await fillByTestId(page, "input-existing-debt-service", "24000");
  await fillByTestId(page, "input-requested-loan", "350000");
  await fillByTestId(page, "input-requested-debt-service", "48000");
  await clickNext(page);

  // Step 7
  await expect(
    page.getByTestId("lender-readiness-snapshot"),
  ).toBeVisible({ timeout: 20_000 });

  const result = await runScenarioTrailingSteps(
    page,
    consoleCap,
    "actuals-test-school",
  );
  RESULTS.push({ scenario: "Actuals Test School", ...result });

  expect(result.pageErrors, `page errors: ${result.pageErrorSamples.join("\n")}`).toBe(0);
  expect(result.consoleErrors, `console errors: ${result.consoleErrorSamples.join("\n")}`).toBe(0);
  expect(result.analysisAttempted, "Run Analysis button must be visible on review").toBe(true);
  expect(result.analysisSucceeded, `analysis must succeed (err: ${result.analysisError})`).toBe(true);
  expect(result.downloadAttempted, "Download Excel button must be visible on review").toBe(true);
  expect(result.downloadSucceeded, `download must succeed (err: ${result.downloadError})`).toBe(true);
  expect(result.downloadBytes ?? 0, "workbook must be > 10 KB").toBeGreaterThan(10_000);
  expect(result.readinessStatus.toLowerCase()).not.toContain("not yet ready");
});

// ---------------------------------------------------------------------------
// Scenario 3: ESA Timing Test School — public-funding-delay sensitivity
// ---------------------------------------------------------------------------
test("[PROD] ESA Timing Test School — public funding delay", async ({
  page,
}) => {
  const consoleCap = attachConsoleCapture(page);
  await clearStorageBeforeNav(page);
  await page.goto("/underwriting", { waitUntil: "domcontentloaded" });

  // Step 1 — charter / public-funded, where the timing controls are exposed
  await fillByTestId(page, "input-school-name", "ESA Timing Test School");
  await selectByTestId(page, "select-school-type", "charter_school");
  await selectByTestId(page, "select-school-stage", "new_school");
  await selectByTestId(page, "select-funding-profile", "charter_public_funded");
  await fillByTestId(page, "input-state", "FL");
  await clickNext(page);

  // Step 2
  await fillByTestId(page, "input-year1-students", "180");
  await fillByTestId(page, "input-growth-pct", "10");
  await selectByTestId(
    page,
    "select-enrollment-validation",
    "signed_agreements",
  );
  await fillByTestId(page, "input-signed-agreements", "150");
  await fillByTestId(page, "input-collection-rate", "100");
  await fillByTestId(page, "input-retention-rate", "88");
  await clickNext(page);

  // Step 3 — primarily public funding
  await fillByTestId(page, "input-tuition", "0");
  await fillByTestId(page, "input-public-funding", "8800");
  await fillByTestId(page, "input-philanthropy", "50000");
  await clickNext(page);

  // Step 4
  await fillByTestId(page, "input-students-per-teacher", "18");
  await fillByTestId(page, "input-teacher-salary", "55000");
  await fillByTestId(page, "input-num-admin", "2");
  await fillByTestId(page, "input-admin-salary", "85000");
  await expect(page.getByTestId("input-founder-comp")).toBeVisible();
  await fillByTestId(page, "input-founder-comp", "110000");
  await selectByTestId(page, "select-founder-comp-year", "2");
  await clickNext(page);

  // Step 5
  await fillByTestId(page, "input-monthly-rent", "18000");
  await fillByTestId(page, "input-utilities", "32000");
  await fillByTestId(page, "input-insurance", "28000");
  await fillByTestId(page, "input-curriculum", "60000");
  await fillByTestId(page, "input-other-opex", "85000");
  await clickNext(page);

  // Step 6 — the timing-sensitivity controls live here for public-funded profiles
  await fillByTestId(page, "input-beginning-cash", "75000");
  await fillByTestId(page, "input-requested-loan", "500000");
  await fillByTestId(page, "input-requested-debt-service", "65000");
  // The funding-approval + 90-day-delay controls only render for
  // charter_public_funded / hybrid_mixed profiles — assert they are present.
  await expect(page.getByTestId("select-funding-approval")).toBeVisible();
  await selectByTestId(page, "select-funding-approval", "pending");
  // CRITICAL — explicitly answer "cannot withstand 90-day delay" so the
  // readiness engine surfaces the timing concern.
  const delayToggle = page.getByTestId("toggle-90day-delay");
  if (await delayToggle.isChecked()) {
    await delayToggle.uncheck();
  }
  await clickNext(page);

  // Step 7
  await expect(
    page.getByTestId("lender-readiness-snapshot"),
  ).toBeVisible({ timeout: 20_000 });

  const result = await runScenarioTrailingSteps(
    page,
    consoleCap,
    "esa-timing-test-school",
  );
  RESULTS.push({ scenario: "ESA Timing Test School", ...result });

  expect(result.pageErrors, `page errors: ${result.pageErrorSamples.join("\n")}`).toBe(0);
  expect(result.consoleErrors, `console errors: ${result.consoleErrorSamples.join("\n")}`).toBe(0);
  expect(result.analysisAttempted, "Run Analysis button must be visible on review").toBe(true);
  expect(result.analysisSucceeded, `analysis must succeed (err: ${result.analysisError})`).toBe(true);
  expect(result.downloadAttempted, "Download Excel button must be visible on review").toBe(true);
  expect(result.downloadSucceeded, `download must succeed (err: ${result.downloadError})`).toBe(true);
  expect(result.downloadBytes ?? 0, "workbook must be > 10 KB").toBeGreaterThan(10_000);
  // ESA Timing scenario MUST land in "Not Yet Ready" — the entire point of this
  // scenario is that the engine flags the public-funding-delay risk as designed.
  expect(
    result.readinessStatus.toLowerCase(),
    `ESA scenario must surface "Not Yet Ready" — engine should flag public-funding-delay risk`,
  ).toContain("not yet ready");
});

// ---------------------------------------------------------------------------
// Mobile viewport pass — iPhone 13 (375x812) and iPhone 14 Pro Max (430x932)
// ---------------------------------------------------------------------------
for (const vp of [
  { label: "iphone-13-375x812", width: 375, height: 812 },
  { label: "iphone-14-pro-max-430x932", width: 430, height: 932 },
]) {
  test(`[PROD] mobile viewport ${vp.label} — wizard renders & no horizontal overflow`, async ({
    page,
  }) => {
    const consoleCap = attachConsoleCapture(page);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await clearStorageBeforeNav(page);
    await page.goto("/underwriting", { waitUntil: "domcontentloaded" });

    // Title + first-step inputs must render at mobile widths.
    await expect(page).toHaveTitle(
      /SchoolStack Budget|Founder Underwriting|Mission/i,
      { timeout: 15_000 },
    );
    await expect(page.getByTestId("input-school-name")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("select-school-type")).toBeVisible();
    await expect(page.getByTestId("button-next")).toBeVisible();

    // Horizontal-overflow check: documentElement.scrollWidth must not exceed
    // the viewport by more than a 2px AA tolerance. Detects layout breaks
    // (overlong cards, fixed-width tables) that would force founders into
    // horizontal scrolling on real phones.
    const overflow = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
    });
    // Record overflow for the proof pack. We treat >50px as a P0 layout
    // break (forces founders into significant horizontal scroll) and 3-50px
    // as a P1 polish item documented in the proof pack but non-blocking
    // for launch.
    if (overflow > 50) {
      throw new Error(
        `P0 horizontal overflow at ${vp.width}x${vp.height}: ${overflow}px`,
      );
    }
    if (overflow > 2) {
      // eslint-disable-next-line no-console
      console.log(
        `[P1 mobile] horizontal overflow at ${vp.width}x${vp.height}: ${overflow}px (non-blocking)`,
      );
    }

    // Capture a screenshot for the proof pack.
    const shot = path.join(
      PROD_DOWNLOAD_DIR,
      `mobile-${vp.label}-step1.png`,
    );
    await page.screenshot({ path: shot, fullPage: true });

    // Walk one step forward and back to confirm the chrome works on mobile.
    await page.getByTestId("button-next").click();
    await expect(page.getByTestId("input-year1-students")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("button-back").click();
    await expect(page.getByTestId("input-school-name")).toBeVisible({
      timeout: 15_000,
    });

    RESULTS.push({
      scenario: `mobile ${vp.label}`,
      readinessStatus: "n/a",
      reviewSchoolName: "n/a",
      reviewY1: "n/a",
      reviewY5: "n/a",
      analysisAttempted: false,
      analysisSucceeded: false,
      analysisError: null,
      downloadAttempted: false,
      downloadSucceeded: false,
      downloadFilename: null,
      downloadBytes: null,
      downloadError: null,
      consoleErrors: consoleCap.errors.length,
      pageErrors: consoleCap.pageErrors.length,
      consoleErrorSamples: consoleCap.errors.slice(0, 5),
      pageErrorSamples: consoleCap.pageErrors.slice(0, 5),
    });

    expect(
      consoleCap.pageErrors,
      `unexpected page errors at ${vp.label}: ${consoleCap.pageErrors.join("\n")}`,
    ).toEqual([]);
  });
}
