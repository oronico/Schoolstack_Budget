import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Verifies the Live What-If Planner's "Copy shareable link" affordance:
// editing an override and clicking the link icon writes a `#whatif=…`
// deep-link to the clipboard, and pasting that URL back into the browser
// auto-opens the drawer with the same overrides applied. Component tests
// cover the encoder; only a real browser proves the clipboard write +
// hash-driven re-hydration round-trip.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SHARE_RENT = 14250;

interface SeededFixture {
  token: string;
  modelId: number;
  email: string;
}

async function seedScenarioFixture(
  request: APIRequestContext,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: {
      email,
      password: TEST_PASSWORD,
      name: "Playwright Founder",
    },
  });
  expect(
    registerRes.ok(),
    `register failed: ${registerRes.status()} ${await registerRes.text()}`,
  ).toBeTruthy();
  const { token } = (await registerRes.json()) as { token: string };
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Mark currentStep=11 so the scenarios page mounts the WhatIfTrigger
  // (it only renders once `model && initialized`). No saved scenarios
  // needed — we drive the planner from a clean slate.
  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Share Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Share Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
      },
    },
  });
  expect(
    createRes.ok(),
    `create model failed: ${createRes.status()} ${await createRes.text()}`,
  ).toBeTruthy();
  const { id: modelId } = (await createRes.json()) as { id: number };

  return { token, modelId, email };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

// Stub navigator.clipboard.writeText so the test works in headless
// Chromium without granting OS-level clipboard permissions, and so we
// can read back exactly what the share button tried to copy.
async function captureClipboardWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const captured: string[] = [];
    (window as unknown as { __clipboardWrites: string[] }).__clipboardWrites = captured;
    const stub = {
      writeText: async (value: string) => {
        captured.push(value);
      },
      readText: async () => captured[captured.length - 1] ?? "",
    };
    try {
      Object.defineProperty(navigator, "clipboard", {
        value: stub,
        configurable: true,
      });
    } catch {
      (navigator as unknown as { clipboard: typeof stub }).clipboard = stub;
    }
  });
}

test("Copy shareable link writes a #whatif deep-link that re-hydrates the planner", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);
  await captureClipboardWrites(page);

  await page.goto(`/model/${modelId}/scenarios`);

  // Open the drawer via the floating trigger. The drawer is lazy-loaded,
  // so wait on the dialog itself rather than on the trigger button.
  await page.getByTestId("whatif-trigger").click();
  const drawer = page.getByTestId("whatif-drawer");
  await expect(drawer).toBeVisible({ timeout: 15_000 });

  // Edit monthly rent so the encoder has a non-empty payload to serialize.
  // We type into the input directly (clear-then-fill) because the field is
  // a number input bound to the overrides state; a plain `fill` mirrors how
  // the founder would enter a new lease.
  const rentInput = drawer.getByTestId("whatif-monthly-rent");
  await rentInput.fill(String(SHARE_RENT));
  await expect(rentInput).toHaveValue(String(SHARE_RENT));

  await drawer.getByTestId("whatif-copy-link").click();

  // The "Link copied" toast is the success-path indicator — the catch
  // branch fires a destructive toast with different copy, so this also
  // proves the clipboard write resolved without throwing.
  await expect(
    page.getByRole("status").filter({ hasText: /Link copied/i }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // Read back the value passed to clipboard.writeText. The encoder uses
  // `m:<rent>` for monthly rent so we pin on it — a future refactor that
  // drops monthly rent from the share payload would fail here.
  const sharedUrl = await page.evaluate(
    () =>
      (window as unknown as { __clipboardWrites?: string[] }).__clipboardWrites?.at(-1) ?? "",
  );
  expect(sharedUrl, "clipboard should contain the shareable URL").toBeTruthy();
  expect(sharedUrl).toContain("#whatif=");
  expect(sharedUrl).toContain(`m:${SHARE_RENT}`);
  // The link should preserve the page the founder is on so the recipient
  // lands on the same context (not the dashboard or root).
  expect(sharedUrl).toContain(`/model/${modelId}/scenarios`);

  // Pull the path + hash out and reopen as a fresh navigation (no leftover
  // drawer state). The trigger's first-mount effect should auto-open the
  // drawer because the hash carries non-empty overrides.
  const parsed = new URL(sharedUrl);
  const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  await page.goto(relative);

  // The trigger's first-mount effect auto-opens the drawer when the hash
  // carries non-empty overrides — assert on the drawer being visible and
  // the rent input matching the shared value as the round-trip contract.
  // (The active-badge dot is also gated on `hasOverrides` but it sits
  // inside the trigger button which the open drawer overlays, making it
  // racy to assert on directly.)
  const rehydratedDrawer = page.getByTestId("whatif-drawer");
  await expect(rehydratedDrawer).toBeVisible({ timeout: 15_000 });
  await expect(rehydratedDrawer.getByTestId("whatif-monthly-rent")).toHaveValue(
    String(SHARE_RENT),
  );

  // Closing the drawer leaves the trigger visible, with the active-overrides
  // badge populated by the same hashchange-driven `hasOverrides` flag.
  // Asserting on it post-close avoids the z-index race and still proves
  // the decoder ran successfully on the fresh navigation.
  await rehydratedDrawer.getByTestId("whatif-close").click();
  await expect(rehydratedDrawer).toHaveCount(0);
  await expect(page.getByTestId("whatif-active-badge")).toBeVisible({ timeout: 5_000 });
});
