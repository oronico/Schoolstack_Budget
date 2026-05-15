/**
 * Task #889 — capture wizard screenshots embedded in the printable
 * Model Prep Guide PDF.
 *
 * Mirrors the structure of `capture-product-screenshots.ts`: boots a
 * Playwright Chromium against running dev servers, registers a throwaway
 * founder, seeds a model pre-populated with `microschoolFixture`, then
 * deep-links into each wizard step and writes a full-page PNG into
 * `public/images/prep-guide/`.
 *
 * Each image is consumed by `artifacts/api-server/scripts/build-prep-guide.ts`
 * so refreshing the captures + re-running the PDF build is the full
 * "the wizard UI changed, regenerate the prep guide" workflow.
 *
 * Run with the same wrapper that ensures dev servers are up:
 *   pnpm --filter @workspace/school-financial-model run capture:prep-guide
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { microschoolFixture } from "@workspace/finance";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "public", "images", "prep-guide");

const WEB_PORT = Number(
  process.env.CAPTURE_WEB_PORT ?? process.env.PORT ?? 22094,
);
const BASE_URL = process.env.CAPTURE_BASE_URL ?? `http://localhost:${WEB_PORT}`;
const API_URL = process.env.CAPTURE_API_URL ?? "http://localhost:8080";
const TEST_PASSWORD = "Capture-Prep-Guide-12345!";

// Letter-page-friendly viewport — wider than tall so the screenshot
// embeds well inside the PDF's landscape-ish image slot without forcing
// the founder to squint at a laptop crop.
const VIEWPORT = { width: 1280, height: 880 };

interface Seed {
  token: string;
  modelId: number;
}

async function api<T>(
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body: unknown,
  token?: string,
  ifMatch?: number,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Task #479 — model PUTs require an `If-Match: "<version>"` token
      // echoing the server's last-known version (optimistic concurrency).
      ...(ifMatch != null ? { "If-Match": `"${ifMatch}"` } : {}),
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

async function seedFounder(): Promise<Seed> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `prep-guide-${stamp}@capture.schoolstack.test`;

  const reg = await api<{ _devToken?: string; _devBranch?: string }>(
    "POST",
    "/api/auth/register",
    { email, password: TEST_PASSWORD, name: "Prep Guide Capture" },
  );
  if (!reg._devToken || reg._devBranch !== "new") {
    throw new Error(
      `register did not return a fresh _devToken (branch=${reg._devBranch}); is API_URL pointing at a non-dev server?`,
    );
  }
  await api("POST", "/api/auth/verify-email", { token: reg._devToken });
  const login = await api<{ token: string }>("POST", "/api/auth/login", {
    email,
    password: TEST_PASSWORD,
  });
  const token = login.token;

  // Set the founder persona so the dashboard / wizard primer modal
  // ("Welcome — let's tailor this to you") doesn't intercept clicks and
  // obscure every captured screenshot. We pick the "existing /
  // comfortable" combo so all advanced surfaces (incl. Actuals Intake)
  // are visible and the language matches the operator-mode copy used in
  // the rest of the prep guide.
  await api(
    "PATCH",
    "/api/auth/persona",
    { stage: "existing", comfort: "comfortable" },
    token,
  );

  const data = {
    ...microschoolFixture,
    schoolProfile: {
      ...microschoolFixture.schoolProfile,
      schoolName: "Bright Horizons Microschool",
    },
  };

  const created = await api<{ id: number; version: number }>(
    "POST",
    "/api/models",
    { name: "Bright Horizons Microschool", currentStep: 11, data },
    token,
  );
  // Re-PUT to make sure deeper fixture fields aren't stripped by the
  // create endpoint's normalization. Forwards the version we just got
  // back so the optimistic-concurrency check passes.
  await api(
    "PUT",
    `/api/models/${created.id}`,
    { name: "Bright Horizons Microschool", currentStep: 11, data },
    token,
    created.version,
  );

  return { token, modelId: created.id };
}

async function primeAuth(
  page: Page,
  token: string,
  modelId: number,
): Promise<void> {
  await page.addInitScript(
    ({ value, mid }) => {
      window.localStorage.setItem("auth_token", value);
      window.localStorage.setItem("schoolstack_primer_completed", "1");
      window.localStorage.setItem("schoolstack_guidance_mode", "advanced");
      window.localStorage.setItem("cookie_consent", "accepted");
      // Skip the prep-checklist modal — we're capturing the actual wizard
      // step, not the splash modal that intercepts pointer events.
      window.localStorage.setItem(`wizard_prep_seen_${mid}`, "1");
    },
    { value: token, mid: modelId },
  );
}

interface Capture {
  filename: string;
  step: number;
}

const CAPTURES: Capture[] = [
  { filename: "01-story.png", step: 1 },
  { filename: "02-school-details.png", step: 3 },
  { filename: "03-enrollment.png", step: 4 },
  { filename: "04-revenue.png", step: 5 },
  { filename: "05-staffing.png", step: 6 },
  { filename: "06-expenses.png", step: 7 },
  { filename: "07-capital-financing.png", step: 8 },
  { filename: "08-assumptions.png", step: 9 },
  { filename: "09-actuals-intake.png", step: 2 },
  { filename: "10-review-export.png", step: 10 },
];

async function captureStep(
  page: Page,
  modelId: number,
  capture: Capture,
): Promise<Buffer> {
  await page.goto(`${BASE_URL}/model/${modelId}?step=${capture.step}`, {
    waitUntil: "networkidle",
  });
  // Let the wizard's debounced form-state hydrate so headings + inputs
  // settle before we snap. 1.2s is what the existing capture script
  // settled on for the same wizard.
  await page.waitForTimeout(1200);
  return await page.screenshot({ fullPage: false });
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[prep-guide] capturing into ${OUT_DIR}`);

  const seed = await seedFounder();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    await primeAuth(
      await context.newPage().then(async (p) => {
        await p.close();
        return context.pages()[0] ?? (await context.newPage());
      }),
      seed.token,
      seed.modelId,
    );
    const page = await context.newPage();
    await primeAuth(page, seed.token, seed.modelId);

    for (const capture of CAPTURES) {
      const png = await captureStep(page, seed.modelId, capture);
      const out = join(OUT_DIR, capture.filename);
      writeFileSync(out, png);
      console.log(`  wrote ${capture.filename} (${png.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[prep-guide] capture failed:", err);
  process.exit(1);
});
