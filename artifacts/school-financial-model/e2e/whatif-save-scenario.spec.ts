import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";

// Verifies the Live What-If Planner's "Save as scenario" create-path:
// editing an override, opening the name dialog, confirming the save, and
// having the resulting custom scenario card appear on the Scenarios page —
// then surviving a hard refetch. Component tests cover the dialog's local
// state, but only a real browser proves the drawer → dialog → API write →
// react-query invalidation → card render → reload round-trip.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SAVE_RENT = 13750;
const SCENARIO_NAME = "E2E Slower lease ramp";

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

  // currentStep=12 is the threshold at which the Scenarios page mounts
  // the WhatIfTrigger; we deliberately seed *no* customScenarios so that
  // a successful save is the only way `custom-scenario-card-0` can exist.
  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Save Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Save Academy",
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

test("Save-as-scenario writes a custom scenario that survives a refetch", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  // Pre-condition: with no seeded customScenarios, the first card slot
  // must be empty. If it's already populated, the rest of the assertions
  // are meaningless.
  await expect(page.getByTestId("custom-scenario-card-0")).toHaveCount(0);

  // Open the drawer via the floating trigger. The drawer is lazy-loaded,
  // so wait on the dialog itself rather than on the trigger button.
  await page.getByTestId("whatif-trigger").click();
  const drawer = page.getByTestId("whatif-drawer");
  await expect(drawer).toBeVisible({ timeout: 15_000 });

  // Edit monthly rent so `isDirty` flips true and the save footer button
  // becomes enabled (it's gated on `!isEmptyOverrides(overrides)`).
  const rentInput = drawer.getByTestId("whatif-monthly-rent");
  await rentInput.fill(String(SAVE_RENT));
  await expect(rentInput).toHaveValue(String(SAVE_RENT));

  const saveButton = drawer.getByTestId("whatif-save-scenario");
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  const saveDialog = drawer.getByTestId("whatif-save-dialog");
  await expect(saveDialog).toBeVisible();

  // Confirm-yes is disabled until the founder types a non-blank name —
  // exercising that gate proves the dialog wired its disabled state to
  // the controlled input rather than firing on every empty submit.
  const confirmYes = saveDialog.getByTestId("whatif-save-confirm-yes");
  await expect(confirmYes).toBeDisabled();

  await saveDialog.getByTestId("whatif-scenario-name").fill(SCENARIO_NAME);
  await expect(confirmYes).toBeEnabled();
  await confirmYes.click();

  // The success toast is fired by the drawer when the parent's save
  // handler resolves; waiting on it ensures the PUT to /api/models has
  // completed before we look at the card list.
  await expect(
    page.getByRole("status").filter({ hasText: /Scenario saved/i }).first(),
  ).toBeVisible({ timeout: 10_000 });

  // After save the dialog closes (showSaveDialog → false) but the drawer
  // itself stays open. Close it so it doesn't overlay the scenarios page.
  await expect(saveDialog).toHaveCount(0);
  await drawer.getByTestId("whatif-close").click();
  await expect(drawer).toHaveCount(0);

  // The card list invalidates from queryClient.invalidateQueries, so the
  // new card should render without a manual reload — proving the create
  // path correctly busts the cache for an immediate render.
  const card = page.getByTestId("custom-scenario-card-0");
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.getByTestId("custom-scenario-name-0")).toHaveText(
    SCENARIO_NAME,
  );

  // Hard reload to prove the scenario was persisted server-side, not just
  // optimistically pushed into the local cache.
  await page.reload();
  const reloadedCard = page.getByTestId("custom-scenario-card-0");
  await expect(reloadedCard).toBeVisible({ timeout: 15_000 });
  await expect(reloadedCard.getByTestId("custom-scenario-name-0")).toHaveText(
    SCENARIO_NAME,
  );
});
