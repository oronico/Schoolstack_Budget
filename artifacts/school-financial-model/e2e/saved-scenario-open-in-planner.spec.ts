import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Verifies the saved-scenario "Open in planner" handoff: clicking the button
// encodes the scenario's overrides into the URL hash, the floating WhatIf
// trigger picks them up via its hashchange listener, and opening the trigger
// reveals the planner drawer with the encoded overrides loaded. Component
// tests cover the encoding helper; only a real browser proves the hash →
// trigger badge → drawer hydration sequence.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_NAME = "E2E open-in-planner";
const SCENARIO_CREATED_AT = "2026-03-03T12:00:00.000Z";
const SCENARIO_MONTHLY_RENT = 11750;

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

  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Planner Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Planner Academy",
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
  const { id: modelId, version: createdVersion } = (await createRes.json()) as { id: number; version: number };

  // Seed an evaluate_site scenario without an outcomeStatus so the card
  // renders the "Open in planner" button (the Pursued / add_program
  // branches show "Apply to my model" instead). The monthlyRent override
  // gives the planner a non-empty payload to encode + decode.
  const updateRes = await request.put(`/api/models/${modelId}`, {
    headers: { ...authHeaders, "If-Match": `"${createdVersion}"` },
    data: {
      name: "E2E Planner Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Planner Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        customScenarios: [
          {
            name: SCENARIO_NAME,
            createdAt: SCENARIO_CREATED_AT,
            overrides: { monthlyRent: SCENARIO_MONTHLY_RENT },
            decisionType: "evaluate_site",
          },
        ],
      },
    },
  });
  expect(
    updateRes.ok(),
    `update model failed: ${updateRes.status()} ${await updateRes.text()}`,
  ).toBeTruthy();

  return { token, modelId, email };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

test("Open in planner encodes overrides into the URL hash and hydrates the WhatIf drawer", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  const card = page.getByTestId("custom-scenario-card-0");
  await expect(card).toBeVisible();

  // Sanity check — the trigger renders without an active-overrides badge
  // before the founder clicks "Open in planner".
  const trigger = page.getByTestId("whatif-trigger");
  await expect(trigger).toBeVisible();
  await expect(page.getByTestId("whatif-active-badge")).toHaveCount(0);

  await card.getByTestId("custom-scenario-open-0").click();

  // The handoff sets `window.location.hash` to a `#whatif=...` payload that
  // encodes the saved overrides. Wait for the URL to settle before
  // asserting on the badge so we don't race the hashchange listener.
  await page.waitForFunction(() =>
    window.location.hash.startsWith("#whatif="),
  );
  expect(page.url()).toContain("#whatif=");
  // The encoder uses `m:<rent>` for monthly rent — assert on it so a future
  // refactor that drops the field from the payload fails this test. The
  // colon survives unencoded in the URL fragment.
  expect(page.url()).toContain(`m:${SCENARIO_MONTHLY_RENT}`);

  // The trigger's hashchange listener flips `hasOverrides`, which renders
  // the small badge dot on the floating button.
  await expect(page.getByTestId("whatif-active-badge")).toBeVisible();

  // Clicking the trigger should open the lazy-loaded drawer; the overrides
  // are decoded out of the hash on mount so the drawer reflects the saved
  // monthly rent.
  await trigger.click();
  const drawer = page.getByTestId("whatif-drawer");
  await expect(drawer).toBeVisible({ timeout: 15_000 });

  const rentInput = drawer.getByTestId("whatif-monthly-rent");
  await expect(rentInput).toBeVisible();
  await expect(rentInput).toHaveValue(String(SCENARIO_MONTHLY_RENT));
});
