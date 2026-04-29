/**
 * Capture real product screenshots used by the /solutions/:slug pages.
 *
 * What this does
 * --------------
 * 1. Boots a Playwright Chromium against the running dev servers (api-server
 *    on :8080 and the school-financial-model dev server on $PORT or :22092).
 * 2. Registers a throwaway founder, seeds a persona, and creates a model
 *    pre-populated with the `microschoolFixture` from `@workspace/finance` so
 *    every wizard step has realistic data.
 * 3. Navigates to specific routes / wizard deep-links, waits for the relevant
 *    element to render, and writes element-level PNGs into
 *    `public/images/solutions/`.
 *
 * The output PNGs are checked in alongside the source so the marketing
 * pages stay deterministic — the script is only re-run when the underlying
 * UI changes enough to make the captured screenshots stale.
 *
 * Run with:
 *   pnpm --filter @workspace/school-financial-model exec tsx scripts/capture-product-screenshots.ts
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { microschoolFixture } from "@workspace/finance";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "public", "images", "solutions");

const WEB_PORT = Number(process.env.CAPTURE_WEB_PORT ?? process.env.PORT ?? 22092);
const BASE_URL = process.env.CAPTURE_BASE_URL ?? `http://localhost:${WEB_PORT}`;
const API_URL = process.env.CAPTURE_API_URL ?? "http://localhost:8080";

const TEST_PASSWORD = "Capture-Screens-12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function api<T>(
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `${method} ${path} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as T;
}

async function seedFounder(): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `screenshots-${stamp}@capture.schoolstack.test`;

  const { token } = await api<{ token: string }>("POST", "/api/auth/register", {
    email,
    password: TEST_PASSWORD,
    name: "Bright Horizons Founder",
  });

  await api("PATCH", "/api/auth/persona", { stage: "existing", comfort: "comfortable" }, token);

  // Build a model whose data block matches the microschool fixture but uses
  // wizard-friendly field names. The fixture is the same shape consumed by
  // the parity tests, so it round-trips through the wizard cleanly.
  const data = {
    ...microschoolFixture,
    schoolProfile: {
      ...microschoolFixture.schoolProfile,
      schoolName: "Bright Horizons Microschool",
      schoolStage: "operating_school",
    },
    // The wizard scenario engine reads `customScenarios` for the comparison
    // table; pre-seed three so the screenshot of the comparison view is
    // visually rich rather than an empty state.
    customScenarios: [
      {
        name: "Conservative",
        createdAt: "2026-02-15T10:00:00.000Z",
        decisionType: "evaluate_site",
        narrative: "Lower enrollment ramp + 10% rent escalator.",
        overrides: {
          enrollmentMultiplier: 0.85,
          monthlyRent: 2750,
        },
      },
      {
        name: "Stress",
        createdAt: "2026-02-18T10:00:00.000Z",
        decisionType: "evaluate_site",
        narrative: "Worst case: enrollment short, grant slips a year.",
        overrides: {
          enrollmentMultiplier: 0.7,
          monthlyRent: 2900,
        },
      },
      {
        name: "Stretch",
        createdAt: "2026-02-22T10:00:00.000Z",
        decisionType: "add_program",
        narrative: "Add an after-school program in Year 2.",
        overrides: {
          enrollmentMultiplier: 1.1,
        },
      },
    ],
  };

  const { id: modelId } = await api<{ id: number }>(
    "POST",
    "/api/models",
    {
      name: "Bright Horizons Microschool",
      currentStep: 11,
      data,
    },
    token,
  );

  // Persist the same data via PUT so any defaults baked into the create
  // endpoint don't strip the deeper fixture fields.
  await api(
    "PUT",
    `/api/models/${modelId}`,
    { name: "Bright Horizons Microschool", currentStep: 11, data },
    token,
  );

  return { token, modelId };
}

async function primeAuth(page: Page, token: string, modelId: number): Promise<void> {
  await page.addInitScript(
    ({ value, mid }) => {
      window.localStorage.setItem("auth_token", value);
      // Suppress the budget primer auto-prompt so it doesn't cover screenshots
      // we're explicitly capturing for non-primer pages.
      window.localStorage.setItem("schoolstack_primer_completed", "1");
      // Park the founder in the "Advanced" guidance level by default so the
      // captures aren't dominated by coaching banners — we'll override this
      // inside the staffing-coaching capture itself.
      window.localStorage.setItem("schoolstack_guidance_mode", "advanced");
      // Skip the cookie consent banner — otherwise it slides up over the
      // bottom of every wizard capture about 1.5s after load.
      window.localStorage.setItem("cookie_consent", "accepted");
      // Skip the wizard prep checklist modal that intercepts pointer events
      // on the wizard route at currentStep === 1.
      window.localStorage.setItem(`wizard_prep_seen_${mid}`, "1");
    },
    { value: token, mid: modelId },
  );
}

async function resetCurrentStep(token: string, modelId: number): Promise<void> {
  // The wizard auto-saves the form state ~1s after mounting, which clobbers
  // `currentStep` with whatever step the deep-link landed on. The scenarios
  // page redirects back to /model/:id when currentStep < 8, so we re-pin it
  // to 11 here whenever we cross from a wizard capture into a non-wizard one.
  await api(
    "PUT",
    `/api/models/${modelId}`,
    { name: "Bright Horizons Microschool", currentStep: 11 },
    token,
  );
}

interface Capture {
  name: string;
  // Setting `wizardClobbersStep: true` causes the runner to PUT
  // currentStep=11 back onto the model after the capture finishes.
  wizardClobbersStep?: boolean;
  go: (page: Page, modelId: number) => Promise<Buffer | null>;
}

// Order matters: the wizard auto-saves `currentStep` ~1s after mounting,
// so we capture the scenarios + dashboard views FIRST (before any wizard
// step deep-link can rewrite the model's currentStep). For wizard
// captures we also re-pin currentStep to 11 between runs.
const captures: Capture[] = [
  {
    name: "scenario-comparison",
    async go(page, modelId) {
      await page.goto(`${BASE_URL}/model/${modelId}/scenarios`, {
        waitUntil: "networkidle",
      });
      const target = page.getByTestId("custom-scenarios-section");
      await target.waitFor({ state: "visible", timeout: 20_000 });
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      return await target.screenshot();
    },
  },
  {
    name: "scenario-whatif-drawer",
    async go(page, modelId) {
      await page.goto(`${BASE_URL}/model/${modelId}/scenarios`, {
        waitUntil: "networkidle",
      });
      const trigger = page.getByTestId("whatif-trigger");
      await trigger.waitFor({ state: "visible", timeout: 20_000 });
      await trigger.click();
      const drawer = page.getByTestId("whatif-drawer");
      await drawer.waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(700);
      return await drawer.screenshot();
    },
  },
  {
    name: "single-year-snapshot",
    async go(page) {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
      const target = page.getByTestId("dashboard-financial-snapshot");
      await target.waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(300);
      return await target.screenshot();
    },
  },
  {
    name: "guidance-primer-modal",
    async go(page) {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
      const helpButton = page
        .locator('button[title="Help & Learning"]')
        .or(page.getByRole("button", { name: /help.*learning/i }));
      await helpButton.first().click();
      await page.getByRole("button", { name: /budgeting basics/i }).click();
      const modal = page
        .locator('[role="dialog"]')
        .or(
          page
            .getByText(/Budgeting Basics for School Founders/i)
            .locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
        );
      await modal.first().waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForTimeout(400);
      return await modal.first().screenshot();
    },
  },
  {
    name: "single-year-review",
    wizardClobbersStep: true,
    async go(page, modelId) {
      await page.goto(`${BASE_URL}/model/${modelId}?step=8`, {
        waitUntil: "networkidle",
      });
      const target = page.locator("main").first();
      await target.waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(700);
      return await target.screenshot();
    },
  },
  {
    name: "five-year-lender-packet",
    wizardClobbersStep: true,
    async go(page, modelId) {
      await page.goto(`${BASE_URL}/model/${modelId}?step=11`, {
        waitUntil: "networkidle",
      });
      const target = page.locator("main").first();
      await target.waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(800);
      return await target.screenshot();
    },
  },
  {
    name: "debt-loan-inputs",
    wizardClobbersStep: true,
    async go(page, modelId) {
      await page.goto(`${BASE_URL}/model/${modelId}?step=3`, {
        waitUntil: "networkidle",
      });
      const target = page.locator("main").first();
      await target.waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(500);
      return await target.screenshot();
    },
  },
  {
    name: "guidance-staffing-coaching",
    wizardClobbersStep: true,
    async go(page, modelId) {
      await page.addInitScript(() => {
        window.localStorage.setItem("schoolstack_guidance_mode", "basics");
      });
      await page.goto(`${BASE_URL}/model/${modelId}?step=6`, {
        waitUntil: "networkidle",
      });
      const target = page.locator("main").first();
      await target.waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(700);
      return await target.screenshot();
    },
  },
];

async function run(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  // Sanity check both servers are reachable before launching Chromium.
  const healthRes = await fetch(`${API_URL}/api/healthz`).catch(() => null);
  if (!healthRes || !healthRes.ok) {
    throw new Error(
      `API server not reachable at ${API_URL}. Start it before running this script.`,
    );
  }
  const webRes = await fetch(`${BASE_URL}/`).catch(() => null);
  if (!webRes || !webRes.ok) {
    throw new Error(
      `Dev server not reachable at ${BASE_URL}. Start the school-financial-model workflow before running this script.`,
    );
  }

  console.log("[capture] seeding founder + model…");
  const { token, modelId } = await seedFounder();
  console.log(`[capture] seeded model #${modelId}`);

  const launchOptions: Parameters<typeof chromium.launch>[0] = {};
  if (process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    launchOptions.executablePath = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  }
  const browser: Browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });

    const failures: string[] = [];
    for (const capture of captures) {
      const page = await context.newPage();
      await primeAuth(page, token, modelId);
      try {
        console.log(`[capture] ${capture.name}…`);
        const buffer = await capture.go(page, modelId);
        if (!buffer) {
          failures.push(`${capture.name}: returned no buffer`);
          continue;
        }
        const outPath = join(OUT_DIR, `${capture.name}.png`);
        writeFileSync(outPath, buffer);
        console.log(
          `  → wrote ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  ! ${capture.name} failed at ${page.url()}: ${message}`);
        failures.push(`${capture.name}: ${message}`);
        const debugPath = join(OUT_DIR, `${capture.name}.debug.png`);
        await page
          .screenshot({ path: debugPath, fullPage: true })
          .catch(() => undefined);
      } finally {
        await page.close();
        if (capture.wizardClobbersStep) {
          // Wait for the wizard's debounced auto-save to settle before
          // re-pinning currentStep so we don't race the PUT.
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await resetCurrentStep(token, modelId).catch((err) =>
            console.warn(`  ! resetCurrentStep failed: ${err}`),
          );
        }
      }
    }

    if (failures.length > 0) {
      console.warn("\n[capture] finished with failures:");
      for (const f of failures) console.warn(`  - ${f}`);
      process.exitCode = 1;
    } else {
      console.log("\n[capture] all captures succeeded.");
    }
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("[capture] fatal:", err);
  process.exit(1);
});
