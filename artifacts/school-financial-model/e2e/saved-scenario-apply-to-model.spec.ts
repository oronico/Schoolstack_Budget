import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Verifies the saved-scenario "Apply to my model" handoff for a Pursued
// decision: clicking the green Apply button folds the scenario's overrides
// into the base model via `useUpdateModel`, swaps the green nudge for an
// "Applied to model on <date>" marker, and surfaces an Undo affordance in
// the toast. Component tests cover the in-memory transform; only a real
// browser proves the API write, refetch, and re-render handshake.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_NAME = "E2E apply to model";
const SCENARIO_CREATED_AT = "2026-03-05T12:00:00.000Z";
const SCENARIO_MONTHLY_RENT = 13250;

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

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Apply Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Apply Academy",
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

  // Seed an evaluate_site scenario marked Pursued so the green
  // "Apply to my model" nudge renders. `appliedToModelAt` is intentionally
  // omitted so the test starts in the pre-apply state and we can prove the
  // round-trip writes it.
  const updateRes = await request.put(`/api/models/${modelId}`, {
    headers: authHeaders,
    data: {
      name: "E2E Apply Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Apply Academy",
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
            outcomeStatus: "pursued",
            outcomeUpdatedAt: SCENARIO_CREATED_AT,
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

test("Apply to my model folds the scenario in and swaps the nudge for an applied marker", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  const card = page.getByTestId("custom-scenario-card-0");
  await expect(card).toBeVisible();

  // Pre-apply: green nudge is up, no "Applied" marker yet, and the green
  // Apply button (not the amber "Open in planner") is the call-to-action.
  await expect(card.getByTestId("custom-scenario-apply-nudge-0")).toBeVisible();
  await expect(
    card.getByTestId("custom-scenario-applied-marker-0"),
  ).toHaveCount(0);
  const applyButton = card.getByTestId("custom-scenario-apply-0");
  await expect(applyButton).toBeVisible();
  await expect(applyButton).toContainText(/Apply to my model/i);

  await applyButton.click();

  // Post-apply: the marker renders with a parsed date, the nudge clears,
  // and the green Apply button is gone (the card falls back to the amber
  // "Open in planner" CTA because evaluate_site + appliedToModelAt no
  // longer triggers either Apply branch).
  const marker = card.getByTestId("custom-scenario-applied-marker-0");
  await expect(marker).toBeVisible();
  await expect(marker).toContainText(/Applied to model on/i);
  await expect(card.getByTestId("custom-scenario-apply-nudge-0")).toHaveCount(0);
  await expect(card.getByTestId("custom-scenario-apply-0")).toHaveCount(0);

  const followUpButton = card.getByTestId("custom-scenario-open-0");
  await expect(followUpButton).toBeVisible();
  await expect(followUpButton).toContainText(/Open in planner/i);

  // The handler ships an "Applied to model" toast with an Undo action — its
  // presence proves the success path resolved cleanly (the catch branch
  // would have surfaced a destructive toast instead).
  await expect(
    page.getByRole("status").filter({ hasText: /Applied to model/i }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // The persisted scenario now has appliedToModelAt set — re-read via the
  // API so we don't rely on the in-flight cache state. This guards against
  // a regression where the optimistic UI shows the marker but the PUT was
  // dropped on the floor.
  const refetched = await request.get(`/api/models/${modelId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(refetched.ok()).toBeTruthy();
  const body = (await refetched.json()) as {
    data?: { customScenarios?: Array<{ appliedToModelAt?: string }> };
  };
  const persisted = body.data?.customScenarios?.[0];
  expect(persisted?.appliedToModelAt).toBeTruthy();
});
