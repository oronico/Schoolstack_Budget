import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";

// Walks the Add-a-program mini-flow from "Why" through "Save" so a regression
// in any of the four steps (Why → Inputs → Impact → Save) surfaces as a real
// browser failure. The unit suite in src/lib/__tests__/decision-flows.test.ts
// covers the engine math; this spec covers the React state machine + persistence
// handshake — specifically that "Save & review later" appends a customScenarios
// entry tagged `decisionType: "add_program"` with the narrative the founder typed.

const TEST_PASSWORD = "PlaywrightTest12345!";
const NARRATIVE = "Board asked us to model a Pre-K addition for fall 2027.";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedFixture(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-add-program-${stamp}@e2e.schoolstack.test`;

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

  // Minimal but engine-valid model. Decision flows compute impact against a
  // base, so we seed enough to make computeBaseFinancials produce non-empty
  // arrays. The mini-flow itself supplies all program-specific inputs.
  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Add-Program Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Add-Program Academy",
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
        openingBalances: { cash: 50000 },
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
  // Cookie-consent banner is pre-dismissed by the shared fixture in
  // ./utils/test (see Task #381) — no per-spec boilerplate needed.
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

test("Add Program: walks Why → Inputs → Impact → Save and persists scenario with decisionType + narrative", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/decisions/add-program/${modelId}`);

  // Step 1 — Why. Type a narrative the persistence layer must keep verbatim.
  await expect(page.getByTestId("decision-flow-add_program")).toBeVisible();
  await expect(page.getByTestId("why-step-add_program")).toBeVisible();
  await page.getByTestId("decision-why-narrative").fill(NARRATIVE);
  await page.getByTestId("decision-flow-next").click();

  // Step 2 — Inputs. Fill program name, tuition, and the 5-year ramp so the
  // flow's `inputsValid` gate releases the Continue button.
  await expect(page.getByTestId("add-program-inputs")).toBeVisible();
  await page.getByTestId("add-program-name").fill("STEM Lab");
  await page.getByTestId("add-program-tuition").fill("12000");
  for (const [i, n] of [[1, 10], [2, 20], [3, 30], [4, 40], [5, 50]] as const) {
    await page.getByTestId(`add-program-enrollment-${i}`).fill(String(n));
  }
  await page.getByTestId("decision-flow-next").click();

  // Step 3 — Impact. The summary is what proves the engine ran end-to-end.
  await expect(page.getByTestId("add-program-impact")).toBeVisible();
  await expect(page.getByTestId("decision-impact-summary")).toBeVisible();
  await page.getByTestId("decision-flow-next").click();

  // Step 4 — Save. "Save & review later" persists without rewriting the base
  // model — the assertion below proves the customScenarios entry was written.
  await expect(page.getByTestId("decision-flow-save-step")).toBeVisible();
  // Default name is auto-populated; override it so we can assert it round-trips.
  await page.getByTestId("decision-flow-scenario-name").fill("E2E STEM Lab");
  await page.getByTestId("save-action-later").click();

  // The done banner appears on the SaveActions card before the redirect kicks in.
  await expect(page.getByTestId("decision-flow-save-step")).toContainText(/Scenario saved/i, { timeout: 5_000 });

  // Re-fetch the model from the API and prove the scenario landed with the
  // exact decisionType + narrative we set. This guards the persistence path
  // independently of the in-flight react-query cache.
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
  expect(saved.name).toBe("E2E STEM Lab");
  expect(saved.decisionType).toBe("add_program");
  expect(saved.narrative).toBe(NARRATIVE);
  // Persisted overrides must carry the program-specific keys so the saved
  // scenario can be re-applied later (covered by unit round-trip tests).
  expect(saved.overrides).toMatchObject({
    addProgramName: "STEM Lab",
    addProgramTuition: 12000,
    addProgramEnrollment: [10, 20, 30, 40, 50],
  });
});
