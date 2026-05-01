import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Walks the Change-enrollment mini-flow from "Why" through "Save". Where the
// other two flows exercise list-style inputs (sliders + per-year deltas), this
// spec exercises retentionRate + tuitionDeltaPerStudent as the change drivers
// — those are independently sufficient to satisfy `hasAnyChange` so the flow
// advances without us needing to drive Radix sliders from Playwright. The
// per-year delta math is covered exhaustively in the unit suite.

const TEST_PASSWORD = "PlaywrightTest12345!";
const NARRATIVE = "Modeling tighter retention plus a small tuition bump for the upcoming board review.";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedFixture(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-change-enrollment-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
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
      name: "E2E Change-Enrollment Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Change-Enrollment Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
          isPartialFirstYear: false,
          year1OperatingMonths: 12,
          debtIncluded: false,
        },
        enrollment: { year1: 80, year2: 90, year3: 100, year4: 110, year5: 120, retentionRate: 88 },
        revenueRows: [
          {
            id: "rev1",
            category: "tuition_and_fees",
            lineItem: "Tuition",
            enabled: true,
            driverType: "per_student",
            amounts: [12000, 12000, 12000, 12000, 12000],
          },
        ],
        staffingRows: [],
        expenseRows: [],
        capitalAndDebtRows: [],
        tuitionTiers: [],
        openingBalances: { cash: 60000 },
      },
    },
  });
  expect(
    createRes.ok(),
    `create model failed: ${createRes.status()} ${await createRes.text()}`,
  ).toBeTruthy();
  const { id: modelId } = (await createRes.json()) as { id: number };

  return { token, modelId };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
    // Pre-decline the cookie banner so its bottom-of-viewport sheet does not
    // intercept clicks on the decision-flow Continue button.
    window.localStorage.setItem("cookie_consent", "declined");
  }, token);
}

test("Change Enrollment: walks Why → Inputs → Impact → Save and persists scenario with decisionType + narrative", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/decisions/change-enrollment/${modelId}`);

  // Step 1 — Why.
  await expect(page.getByTestId("decision-flow-change_enrollment")).toBeVisible();
  await expect(page.getByTestId("why-step-change_enrollment")).toBeVisible();
  await page.getByTestId("decision-why-narrative").fill(NARRATIVE);
  await page.getByTestId("decision-flow-next").click();

  // Step 2 — Inputs. retention + tuition-delta together satisfy `hasAnyChange`.
  await expect(page.getByTestId("change-enrollment-inputs")).toBeVisible();
  await page.getByTestId("change-enrollment-retention").fill("92");
  await page.getByTestId("change-enrollment-tuition-delta").fill("500");
  await page.getByTestId("decision-flow-next").click();

  // Step 3 — Impact.
  await expect(page.getByTestId("change-enrollment-impact")).toBeVisible();
  await expect(page.getByTestId("decision-impact-summary")).toBeVisible();
  await page.getByTestId("decision-flow-next").click();

  // Step 4 — Save & review later.
  await expect(page.getByTestId("decision-flow-save-step")).toBeVisible();
  await page.getByTestId("decision-flow-scenario-name").fill("E2E Retention + tuition bump");
  await page.getByTestId("save-action-later").click();

  await expect(page.getByTestId("decision-flow-save-step")).toContainText(/Scenario saved/i, { timeout: 5_000 });

  const refetched = await request.get(`/api/models/${modelId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(refetched.ok()).toBeTruthy();
  const body = (await refetched.json()) as {
    data?: {
      customScenarios?: Array<{
        name?: string;
        decisionType?: string;
        narrative?: string;
        overrides?: Record<string, unknown>;
      }>;
    };
  };
  const scenarios = body.data?.customScenarios ?? [];
  expect(scenarios).toHaveLength(1);
  const saved = scenarios[0];
  expect(saved.name).toBe("E2E Retention + tuition bump");
  expect(saved.decisionType).toBe("change_enrollment");
  expect(saved.narrative).toBe(NARRATIVE);
  expect(saved.overrides).toMatchObject({
    retentionRate: 92,
    tuitionDeltaPerStudent: 500,
  });
});
