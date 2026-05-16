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
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { microschoolFixture } from "@workspace/finance";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "public", "images", "prep-guide");
const FONTS_DIR = join(__dirname, "prep-guide", "fonts");

// Task #935 — to make the captured PNGs byte-identical across local
// Replit and GitHub Actions Ubuntu runners we strip every non-deterministic
// rendering knob we can. Anything that varies between Linux hosts (system
// fonts via fontconfig, GPU/Skia paths, LCD subpixel antialiasing, color
// profiles, device scale factor) is forced to a fixed setting below; the
// remaining font bytes are served from woff2 files committed alongside this
// script so we never depend on whatever Google Fonts CDN happens to return.
const DETERMINISTIC_LAUNCH_ARGS = [
  // Force grayscale antialiasing — LCD subpixel rendering is the single
  // biggest source of pixel-level diffs between hosts because it depends
  // on the host's freetype/Skia build, not Chromium.
  "--disable-lcd-text",
  // No subpixel hint shifting — without this, the same glyph can land on
  // different pixel boundaries depending on host font metrics.
  "--font-render-hinting=none",
  // Skia GPU rasterization is non-deterministic across hosts; route
  // everything through software so two Linux x64 boxes produce the same
  // bytes.
  "--disable-gpu",
  "--disable-skia-runtime-opts",
  "--in-process-gpu",
  // Pin the color profile so srgb→display conversion can't shift.
  "--force-color-profile=srgb",
  // Don't leak the host's scrollbar styling into the screenshot.
  "--hide-scrollbars",
  // Make every captured tab look "in focus" — otherwise inputs render
  // their unfocused outline color and a re-run on a different machine
  // can flip individual fields.
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

interface LocalFont {
  family: string;
  style: "normal" | "italic";
  weight: string; // single weight ("400") or range ("300 700")
  file: string;
}

// Mirrors the @import in src/index.css:
//   Quicksand wght@400;500;600;700
//   Nunito ital,wght@0,300;0,400;0,500;0,600;0,700;1,400
// The Latin Google Fonts subsets for these families are variable-axis
// woff2 files (one per family + one italic axis), so three committed
// files cover every weight the wizard actually uses.
const LOCAL_FONTS: LocalFont[] = [
  {
    family: "Quicksand",
    style: "normal",
    weight: "400 700",
    file: "quicksand-latin.woff2",
  },
  {
    family: "Nunito",
    style: "normal",
    weight: "300 700",
    file: "nunito-latin.woff2",
  },
  {
    family: "Nunito",
    style: "italic",
    weight: "400",
    file: "nunito-italic-latin.woff2",
  },
];

function buildLocalFontsCss(): string {
  return LOCAL_FONTS.map((font) => {
    const bytes = readFileSync(join(FONTS_DIR, font.file));
    const data = bytes.toString("base64");
    return `@font-face {
  font-family: '${font.family}';
  font-style: ${font.style};
  font-weight: ${font.weight};
  font-display: block;
  src: url(data:font/woff2;base64,${data}) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}`;
  }).join("\n");
}

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

async function installDeterministicFonts(
  context: BrowserContext,
  css: string,
): Promise<void> {
  // Intercept the Google Fonts CSS request from src/index.css and reply
  // with a CSS payload whose @font-face rules embed our committed woff2
  // bytes as data: URIs. This keeps the page free of any cross-machine
  // network variance (different gstatic edge caches, subset versions,
  // race conditions on font-display: swap firing before the screenshot)
  // and guarantees identical glyph bytes on Replit and Ubuntu CI.
  await context.route(
    (url) =>
      url.hostname === "fonts.googleapis.com" ||
      url.hostname === "fonts.gstatic.com",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "fonts.googleapis.com") {
        await route.fulfill({
          status: 200,
          contentType: "text/css; charset=utf-8",
          body: css,
        });
      } else {
        // Anything that still tries to reach gstatic (e.g. preconnect
        // probes) gets a tiny 200 so it doesn't show up as a console
        // error or delay networkidle.
        await route.fulfill({ status: 200, body: "" });
      }
    },
  );
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
  // Task #935 — wait for the deterministic webfonts (Quicksand / Nunito)
  // to actually finish loading + activating before the screenshot. Without
  // this, the first capture on a cold context can race the FontFaceSet
  // ready promise and snap a frame mid-swap (visible as a system-font
  // fallback fragment in the diff).
  await page.evaluate(() => document.fonts.ready);
  // The seed step bumps the model version (create + re-PUT), which can
  // race with the wizard's cross-tab change listener and surface the
  // "Your other tab made changes — Reload model" banner + inline pill on
  // top of the step content. Hide them (don't remove — removing the
  // nodes races React's reconciler and trips the error boundary) before
  // the shot so each screenshot shows the actual wizard step.
  await page.addStyleTag({
    content: `
      [data-testid="conflict-reload-banner"],
      [data-testid="wizard-save-conflict-reload"],
      /* Task #935 — the transient "Saving..." / "Saved at HH:MM:SS"
         badge in the wizard header flips on every keystroke / debounced
         auto-save. It's pure status copy, not part of the prep-guide
         story, and its presence/absence on a given run was the single
         biggest source of cross-run drift (e.g. the actuals-intake and
         review-export captures). Hide the whole save-status cluster so
         it can't sneak into a screenshot mid-flicker. */
      [data-testid="wizard-save-status-saving"],
      [data-testid="wizard-save-status-saved"],
      [data-testid^="wizard-save-error-"],
      [data-testid="wizard-save-auth-relogin"] { display: none !important; }
      /* Task #935 — freeze every animation/transition so a stray
         in-flight transition (e.g. the wizard rail's transition-all
         duration-500 progress fill, or a focus-ring fade) can't make
         two back-to-back captures of the same step diverge by a few
         pixels. Also hide the blinking text caret which is the most
         common source of "1px column shifts on alternating runs". */
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  // Let the freshly-injected stylesheet settle (forces a fresh paint)
  // before snapping. Cheap insurance against the screenshot landing
  // mid-style-recalc.
  await page.waitForTimeout(250);
  return await page.screenshot({ fullPage: false, type: "png" });
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[prep-guide] capturing into ${OUT_DIR}`);

  const fontsCss = buildLocalFontsCss();

  const seed = await seedFounder();
  // Task #935 — explicitly opt into Playwright's pinned bundled Chromium
  // (i.e. don't honor REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE here). The
  // pinned binary that ships with whatever @playwright/test version this
  // workspace resolves is what GitHub Actions also installs, so both
  // environments rasterize with the exact same Skia/Blink build. The
  // deterministic args above remove the remaining sources of pixel drift.
  const browser = await chromium.launch({ args: DETERMINISTIC_LAUNCH_ARGS });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      // Force 1.0 DPR so the screenshot's pixel grid is identical to the
      // CSS pixel grid on every host — anything else would magnify even
      // a one-pixel font shift into a multi-pixel diff.
      deviceScaleFactor: 1,
    });
    await installDeterministicFonts(context, fontsCss);
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
