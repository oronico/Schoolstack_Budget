import { defineConfig, devices } from "@playwright/test";

// The school-financial-model dev server proxies `/api` to the api-server, so a
// single base URL is enough for both UI navigation and seed-data API calls.
const PORT = Number(process.env.E2E_PORT ?? process.env.PORT ?? 22092);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

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
  expect: { timeout: 10_000 },
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
  ],
  webServer: shouldStartServers
    ? [
        {
          command:
            "pnpm --filter @workspace/api-server run dev",
          url: "http://localhost:8080/api/healthz",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
          // The api-server defaults to PORT=3000 when unset, but the
          // school-financial-model Vite dev server proxies /api to
          // http://localhost:8080. Pin the API to 8080 here so the
          // proxy + the Playwright health check both resolve (otherwise
          // the wait URL polls :8080 forever while the server listens
          // on :3000).
          env: { PORT: "8080" },
        },
        {
          command:
            "pnpm --filter @workspace/school-financial-model run dev",
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
          env: { PORT: String(PORT) },
        },
      ]
    : undefined,
});
