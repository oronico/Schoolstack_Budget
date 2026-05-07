import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #657 — Actuals-first vs assumptions-first wizard pathways.
// Verifies for both pathways that:
//   1. The Story step surfaces the pathway prompt.
//   2. Picking "operating" inserts the Actuals Intake step + shows the
//      "Built from actuals" badge in the wizard header.
//   3. Picking "launching" surfaces the framing block + shows the
//      "Built from assumptions" badge in the wizard header.
//   4. The pathway choice persists across reload.

const TEST_PASSWORD = "PlaywrightTest12345!";

async function seedFounderWithBlankModel(
  request: APIRequestContext,
): Promise<{ token: string; modelId: number }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-pathway-${stamp}@e2e.schoolstack.test`;
  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Pathway",
  });
  await seedPersona(request, token);
  const authHeaders = { Authorization: `Bearer ${token}` };
  await request.patch("/api/auth/guidance-level", {
    headers: { ...authHeaders, "Content-Type": "application/json" },
    data: { guidanceLevel: "basics" },
  });
  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Pathway Branch School",
      currentStep: 1,
      data: {
        schoolProfile: {
          schoolName: "E2E Pathway Branch School",
          schoolType: "private_school",
          state: "MA",
        },
      },
    },
  });
  expect(createRes.ok(), `create model failed: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
  const { id: modelId } = (await createRes.json()) as { id: number };
  return { token, modelId };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

// First-visit intro modal renders after the wizard mounts and intercepts
// pointer events. We wait briefly for it and dismiss it; if it never
// appears (e.g. on reload after first visit) we just proceed.
async function dismissIntro(page: Page): Promise<void> {
  const intro = page.getByRole("button", { name: /Let.?s get started/i });
  await intro.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
  if (await intro.isVisible().catch(() => false)) {
    await intro.click();
    await intro.waitFor({ state: "hidden", timeout: 5000 }).catch(() => undefined);
  }
}

test("operating pathway inserts Actuals Intake step and badges 'Built from actuals'", async ({ page, request }) => {
  const { token, modelId } = await seedFounderWithBlankModel(request);
  await primeAuthToken(page, token);
  await page.goto(`/model/${modelId}`);
  await dismissIntro(page);

  // Pathway prompt appears on the Story step.
  await expect(page.getByTestId("pathway-prompt")).toBeVisible();
  await page.getByTestId("pathway-option-actuals").click();

  // Header badge flips to actuals.
  const badge = page.getByTestId("wizard-provenance-badge");
  await expect(badge).toHaveAttribute("data-pathway", "actuals");
  await expect(badge).toContainText(/Built from actuals/i);

  // Framing block for the assumptions path must NOT render.
  await expect(page.getByTestId("assumptions-framing-block")).toHaveCount(0);

  // Continue from Story → land on the conditional Actuals Intake step.
  await page.getByRole("button", { name: /^Continue$/ }).first().click();
  await expect(page.getByTestId("actuals-intake-form")).toBeVisible();

  // Reload and confirm the pathway persisted server-side.
  await page.reload();
  const badgeAfter = page.getByTestId("wizard-provenance-badge");
  await expect(badgeAfter).toHaveAttribute("data-pathway", "actuals");
});

test("assumptions pathway shows framing block and badges 'Built from assumptions'", async ({ page, request }) => {
  const { token, modelId } = await seedFounderWithBlankModel(request);
  await primeAuthToken(page, token);
  await page.goto(`/model/${modelId}`);
  await dismissIntro(page);

  await expect(page.getByTestId("pathway-prompt")).toBeVisible();
  await page.getByTestId("pathway-option-assumptions").click();

  const badge = page.getByTestId("wizard-provenance-badge");
  await expect(badge).toHaveAttribute("data-pathway", "assumptions");
  await expect(badge).toContainText(/Built from assumptions/i);

  // Framing block surfaces explicitly for the assumptions pathway.
  await expect(page.getByTestId("assumptions-framing-block")).toBeVisible();

  // Reload and confirm persistence.
  await page.reload();
  const badgeAfter = page.getByTestId("wizard-provenance-badge");
  await expect(badgeAfter).toHaveAttribute("data-pathway", "assumptions");
  await expect(page.getByTestId("assumptions-framing-block")).toBeVisible();
});
