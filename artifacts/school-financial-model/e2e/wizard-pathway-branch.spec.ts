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

test("path switch is bidirectional with confirmation and preserves typed-in values", async ({ page, request }) => {
  const { token, modelId } = await seedFounderWithBlankModel(request);
  await primeAuthToken(page, token);
  await page.goto(`/model/${modelId}`);
  await dismissIntro(page);

  // Pick assumptions, then offer the switch back to actuals with confirmation.
  await page.getByTestId("pathway-option-assumptions").click();
  await expect(page.getByTestId("assumptions-framing-block")).toBeVisible();
  await page.getByTestId("assumptions-switch-to-actuals").click();
  await expect(page.getByTestId("assumptions-switch-confirm")).toBeVisible();
  await expect(page.getByTestId("assumptions-switch-confirm")).toContainText(/stay saved/i);
  await page.getByTestId("assumptions-switch-confirm-button").click();

  // Pathway flipped — badge tracks actuals and Continue lands on Actuals Intake.
  await expect(page.getByTestId("wizard-provenance-badge")).toHaveAttribute("data-pathway", "actuals");
  await page.getByRole("button", { name: /^Continue$/ }).first().click();
  await expect(page.getByTestId("actuals-intake-form")).toBeVisible();

  // Type a number, then switch back via the actuals-side confirmation.
  // The typed value must still be on the form when we land back on Story.
  const revenue = page.getByLabel(/Last-year total revenue/i);
  await revenue.fill("123456");
  await page.getByTestId("actuals-switch-to-assumptions").click();
  await expect(page.getByTestId("actuals-switch-confirm")).toBeVisible();
  await expect(page.getByTestId("actuals-switch-confirm")).toContainText(/stay saved/i);
  await page.getByTestId("actuals-switch-confirm-button").click();

  // Now back on Story, on the assumptions pathway. Reload to verify the
  // typed-in revenue value really persisted across the switch.
  await page.reload();
  await expect(page.getByTestId("wizard-provenance-badge")).toHaveAttribute("data-pathway", "assumptions");
  // Switch back to actuals one more time to confirm the value is still there.
  await page.getByTestId("assumptions-switch-to-actuals").click();
  await page.getByTestId("assumptions-switch-confirm-button").click();
  await page.getByRole("button", { name: /^Continue$/ }).first().click();
  await expect(page.getByLabel(/Last-year total revenue/i)).toHaveValue("123456");
});

test("Actuals Intake shows a working P&L upload control", async ({ page, request }) => {
  const { token, modelId } = await seedFounderWithBlankModel(request);
  await primeAuthToken(page, token);
  await page.goto(`/model/${modelId}`);
  await dismissIntro(page);

  await page.getByTestId("pathway-option-actuals").click();
  await page.getByRole("button", { name: /^Continue$/ }).first().click();
  await expect(page.getByTestId("actuals-intake-form")).toBeVisible();

  // Upload affordance is visible and wired to a real file input.
  await expect(page.getByTestId("actuals-intake-upload")).toBeVisible();
  await expect(page.getByTestId("actuals-intake-upload-button")).toBeEnabled();

  const csv = [
    "Income,,",
    "  Tuition,,\"$500,000.00\"",
    "  Donations,,\"$120,000.00\"",
    "Total Income,,\"$620,000.00\"",
    "Expenses,,",
    "  Salaries,,\"$300,000.00\"",
    "  Rent,,\"$60,000.00\"",
    "Total Expenses,,\"$400,000.00\"",
  ].join("\n");
  await page.getByTestId("actuals-intake-upload-input").setInputFiles({
    name: "playwright-pnl.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8"),
  });

  // Summary acknowledges what was filled and the headline cells now hold
  // the parsed P&L totals.
  await expect(page.getByTestId("actuals-intake-upload-summary")).toContainText(/playwright-pnl\.csv/);
  await expect(page.getByLabel(/Last-year total revenue/i)).toHaveValue("620000");
  await expect(page.getByLabel(/Last-year total expenses paid/i)).toHaveValue("400000");
});
