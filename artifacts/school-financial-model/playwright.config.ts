import { defineConfig, devices } from "@playwright/test";

// The school-financial-model dev server proxies `/api` to the api-server, so a
// single base URL is enough for both UI navigation and seed-data API calls.
const PORT = Number(process.env.E2E_PORT ?? process.env.PORT ?? 22092);
// Use the IPv4 loopback address explicitly. `localhost` resolves to `::1`
// first on this container (verbatim DNS in Node 17+), but Vite binds to
// `0.0.0.0` (IPv4 only). When Playwright's `request` fixture or the Vite
// proxy used `localhost`, intermittent runs would surface
// `connect ECONNREFUSED ::1:<port>` even though the dev server was healthy
// — every test after the first IPv6 lookup would bail (Task #380). Pinning
// to `127.0.0.1` removes the dual-stack ambiguity entirely.
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const API_PORT = Number(process.env.E2E_API_PORT ?? 8080);
const API_HEALTH_URL =
  process.env.E2E_API_HEALTH_URL ?? `http://127.0.0.1:${API_PORT}/api/healthz`;

// Allow CI to opt into having Playwright start the dev servers on its own.
// Locally we expect the workspace's existing artifact workflows to already be
// running (the standard Replit dev experience), so the webServer block is
// gated behind an explicit flag to keep `pnpm test:e2e` snappy during day to
// day development.
const shouldStartServers = process.env.E2E_START_SERVERS === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Screenshot snapshots (Task #570) compare against a committed baseline
    // PNG. Anti-aliasing and font hinting can shift a few pixels between
    // runs even on the same Chromium build, so we tolerate a small fraction
    // of changed pixels — but the threshold is deliberately tight enough
    // that a sparkline collapsing to a flat horizontal line (the regression
    // we're guarding against) still trips the diff. We screenshot a small,
    // tightly-cropped element (the trend cell), so even a partial flatline
    // dominates the diff well above this ratio.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05,
      // Small per-pixel tolerance for anti-aliasing on stroked SVG paths.
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Video recording is intentionally disabled: it requires ffmpeg, which
    // is not bundled with the Replit-pinned Playwright Chromium build, so
    // enabling it breaks the validation `e2e` step. Trace + screenshot are
    // sufficient for diagnosing failures.
    video: "off",
  },
  // Snapshot files default to `<name>-<projectName>-<platform>.png`, which
  // would force us to maintain three near-identical PNG baselines (one per
  // browser) for the same SVG sparkline. The trend-cell screenshot in
  // admin-section-engagement-trend.spec.ts is rendered from the same
  // committed SVG path data on every browser — so we strip the project
  // suffix and keep a single platform-keyed baseline shared across
  // chromium / firefox / webkit. The pixel tolerance above is loose
  // enough to absorb the small AA/font-hinting differences between
  // browsers on the same Linux host.
  snapshotPathTemplate:
    "{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}",
  // Browser matrix is gated by E2E_ALL_BROWSERS. The Replit container only
  // ships the system libraries Chromium needs; Firefox and WebKit require a
  // long list of distro-specific shared objects (libavif, libenchant-2,
  // libwoff2dec, libflite_*, libharfbuzz-icu, libmanette-0.2, etc.) that
  // aren't easily provisioned through Nix. Running them on Replit therefore
  // fails every test with a "Host system is missing dependencies" error and
  // masks real signal from the chromium project. Engineers with a fully
  // provisioned local environment (or a future CI image with the deps
  // installed) can opt back into the full matrix by setting
  // E2E_ALL_BROWSERS=1 before invoking `pnpm test:e2e`.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Replit pre-installs a Chromium binary that matches the pinned
        // Playwright version (see REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE).
        // Honoring it avoids re-downloading ~150MB of browser binaries on
        // every fresh container while still allowing local dev environments
        // (or CI without the env var) to fall back to the default install.
        ...(process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? {
              launchOptions: {
                executablePath:
                  process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
              },
            }
          : {}),
      },
    },
    ...(process.env.E2E_ALL_BROWSERS === "1"
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"] },
          },
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"] },
          },
        ]
      : []),
  ],
  webServer: shouldStartServers
    ? [
        {
          command:
            "pnpm --filter @workspace/api-server run dev",
          url: API_HEALTH_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
          // The api-server defaults to PORT=3000 when unset, but the
          // school-financial-model Vite dev server proxies /api to
          // http://127.0.0.1:8080. Pin the API to 8080 here so the
          // proxy + the Playwright health check both resolve (otherwise
          // the wait URL polls :8080 forever while the server listens
          // on :3000).
          env: { PORT: String(API_PORT) },
        },
        {
          command:
            "pnpm --filter @workspace/school-financial-model run dev",
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
          // E2E_MODE=1 tells vite.config.ts to skip the Replit dev plugins
          // (cartographer/runtime-error-modal/dev-banner). Those plugins
          // watch the entire workspace from `..` and inject overlays we
          // don't need under headless Chromium — and they were the most
          // plausible cause of the long-run "Vite dev server appears to
          // die mid-run" flake (Task #380).
          //
          // VITE_API_PROXY_TARGET pins the /api proxy to the IPv4
          // loopback so requests can never get caught on `::1` even if
          // some future change re-introduces `localhost` defaults.
          env: {
            PORT: String(PORT),
            E2E_MODE: "1",
            VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`,
          },
        },
      ]
    : undefined,
});
