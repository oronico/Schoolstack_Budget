import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Walks the Evaluate-a-site mini-flow from "Why" through "Save" to lock in
// the React state-machine wiring + the persistence handshake. The unit suite
// covers the engine math (rent override, one-time fit-out, startYear); this
// spec proves "Save & review later" appends a customScenarios entry tagged
// `decisionType: "evaluate_site"` with the founder's narrative intact.

const TEST_PASSWORD = "PlaywrightTest12345!";
const NARRATIVE = "Lease at 42 Maple St. is up for renewal — checking if a bigger gym is worth the rent jump.";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedFixture(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-evaluate-site-${stamp}@e2e.schoolstack.test`;

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

  // Seed an existing rent row so the flow's "current modeled rent" detection
  // surfaces a comparable baseline (and so siteInputsToOverrides has something
  // to override). Keeps the engine path representative of a real founder.
  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Evaluate-Site Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Evaluate-Site Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
          isPartialFirstYear: false,
          year1OperatingMonths: 12,
          debtIncluded: false,
          monthlyRent: 6000,
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
        expenseRows: [
          {
            id: "rent",
            category: "occupancy_facility",
            lineItem: "Rent",
            enabled: true,
            driverType: "monthly",
            amounts: [6000, 6000, 6000, 6000, 6000],
            escalationRate: 0,
          },
        ],
        capitalAndDebtRows: [],
        tuitionTiers: [],
        openingBalances: { cash: 80000 },
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

test("Evaluate Site: walks Why → Inputs → Impact → Save and persists scenario with decisionType + narrative", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/decisions/evaluate-site/${modelId}`);

  // Step 1 — Why.
  await expect(page.getByTestId("decision-flow-evaluate_site")).toBeVisible();
  await expect(page.getByTestId("why-step-evaluate_site")).toBeVisible();
  await page.getByTestId("decision-why-narrative").fill(NARRATIVE);
  await page.getByTestId("decision-flow-next").click();

  // Step 2 — Inputs. New rent + escalation + one-time fit-out cover the
  // engine's three numerical surfaces in a single pass.
  await expect(page.getByTestId("evaluate-site-inputs")).toBeVisible();
  await page.getByTestId("evaluate-site-rent").fill("9500");
  await page.getByTestId("evaluate-site-escalation").fill("3");
  await page.getByTestId("evaluate-site-fitout").fill("75000");
  await page.getByTestId("decision-flow-next").click();

  // Step 3 — Impact.
  await expect(page.getByTestId("evaluate-site-impact")).toBeVisible();
  await expect(page.getByTestId("decision-impact-summary")).toBeVisible();
  await page.getByTestId("decision-flow-next").click();

  // Step 4 — Save & review later. Planner is unavailable when fit-out > 0
  // (the SaveActions copy explains why), so "later" is the safe leg.
  await expect(page.getByTestId("decision-flow-save-step")).toBeVisible();
  await page.getByTestId("decision-flow-scenario-name").fill("E2E Maple St lease");
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
  expect(saved.name).toBe("E2E Maple St lease");
  expect(saved.decisionType).toBe("evaluate_site");
  expect(saved.narrative).toBe(NARRATIVE);
  expect(saved.overrides).toMatchObject({
    monthlyRent: 9500,
    rentEscalation: 3,
    siteFitOutCost: 75000,
  });
});
