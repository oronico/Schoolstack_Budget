import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Verifies the saved-scenario outcome status pills round-trip through the
// API. Component tests render the controls, but only a real browser proves
// that clicking a status writes through `useUpdateModel`, refetches, and
// re-renders the matching status pill — and that re-clicking the active
// status clears it (the "click again to clear" affordance).

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_NAME = "E2E status transition";
const SCENARIO_CREATED_AT = "2026-03-02T12:00:00.000Z";

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

  const authHeaders = { Authorization: `Bearer ${token}` };

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Status Academy",
      currentStep: 11,
      data: {
        schoolProfile: {
          schoolName: "E2E Status Academy",
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

  // Seed a scenario with NO outcomeStatus so the founder is starting from a
  // blank slate — the pill should appear on the first click and disappear
  // after a re-click of the active status.
  const updateRes = await request.put(`/api/models/${modelId}`, {
    headers: authHeaders,
    data: {
      name: "E2E Status Academy",
      currentStep: 11,
      data: {
        schoolProfile: {
          schoolName: "E2E Status Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        customScenarios: [
          {
            name: SCENARIO_NAME,
            createdAt: SCENARIO_CREATED_AT,
            overrides: { monthlyRent: 9500 },
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

test("Outcome status pills toggle on, switch, and clear from a saved scenario card", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  const card = page.getByTestId("custom-scenario-card-0");
  await expect(card).toBeVisible();

  const pill = card.getByTestId("custom-scenario-status-pill-0");
  await expect(pill).toHaveCount(0);

  // First click — Pursued. The mutation refetches the model, so we wait for
  // the pill itself to appear rather than asserting on the button's
  // aria-pressed attribute (which would race with the refetch).
  await card.getByTestId("custom-scenario-status-pursued-0").click();
  await expect(pill).toBeVisible();
  await expect(pill).toContainText(/Pursued/i);

  // Switching to a different status should swap the pill text + tone, not
  // stack a second pill onto the card.
  await card.getByTestId("custom-scenario-status-declined-0").click();
  await expect(pill).toContainText(/Declined/i);
  await expect(card.getByTestId("custom-scenario-status-pill-0")).toHaveCount(1);

  // Re-clicking the active status acts as "clear" — outcomeStatus becomes
  // undefined and the pill disappears entirely.
  await card.getByTestId("custom-scenario-status-declined-0").click();
  await expect(card.getByTestId("custom-scenario-status-pill-0")).toHaveCount(0);
});
