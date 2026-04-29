import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Verifies the saved-scenario "Compare decisions side-by-side" surface
// renders end-to-end: with two decision scenarios persisted, the section
// auto-fills both pickers, computes the comparison columns, and surfaces
// the binary-only Download-as-PDF action. Adding a third column should
// hide the PDF action; removing it should bring it back. Component tests
// cover the impact engine; only a real browser proves the picker → engine
// → ImpactSummary handoff plus the column-count gating.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_A_NAME = "E2E candidate site A";
const SCENARIO_A_CREATED_AT = "2026-03-06T09:00:00.000Z";
const SCENARIO_B_NAME = "E2E candidate site B";
const SCENARIO_B_CREATED_AT = "2026-03-06T10:00:00.000Z";
const SCENARIO_C_NAME = "E2E enrollment bump";
const SCENARIO_C_CREATED_AT = "2026-03-06T11:00:00.000Z";

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
      name: "E2E Compare Academy",
      currentStep: 11,
      data: {
        schoolProfile: {
          schoolName: "E2E Compare Academy",
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

  // Seed three decision scenarios so we can exercise the 2-col → 3-col
  // → 2-col gating on the Download-as-PDF affordance. Scenarios A and B
  // are different lease offers; C is an enrollment bump so the picker
  // labels show distinct decision-type prefixes.
  const updateRes = await request.put(`/api/models/${modelId}`, {
    headers: authHeaders,
    data: {
      name: "E2E Compare Academy",
      currentStep: 11,
      data: {
        schoolProfile: {
          schoolName: "E2E Compare Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        customScenarios: [
          {
            name: SCENARIO_A_NAME,
            createdAt: SCENARIO_A_CREATED_AT,
            overrides: { monthlyRent: 11000 },
            decisionType: "evaluate_site",
          },
          {
            name: SCENARIO_B_NAME,
            createdAt: SCENARIO_B_CREATED_AT,
            overrides: { monthlyRent: 13500 },
            decisionType: "evaluate_site",
          },
          {
            name: SCENARIO_C_NAME,
            createdAt: SCENARIO_C_CREATED_AT,
            overrides: { enrollmentDelta: [10, 5, 0, 0, 0] },
            decisionType: "change_enrollment",
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

test("Side-by-side decision comparison auto-fills, gates the PDF button on 2 columns, and switches columns on user pick", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  const section = page.getByTestId("decision-comparison-section");
  await expect(section).toBeVisible();

  // The component auto-seeds the first two decision scenarios into the
  // pickers when the user hasn't picked anything yet (the persisted
  // customScenarios list order is the input order). Asserting on the
  // selected option text is more durable than asserting on the composite
  // `${name}|${createdAt}` key, which is an internal contract.
  const pickerA = section.getByTestId("decision-compare-select-0");
  const pickerB = section.getByTestId("decision-compare-select-1");
  await expect(pickerA).toBeVisible();
  await expect(pickerB).toBeVisible();
  await expect(pickerA).toContainText(SCENARIO_A_NAME);
  await expect(pickerB).toContainText(SCENARIO_B_NAME);

  // The result block + Download-as-PDF button should both be live for the
  // binary case. The PDF button only renders when `columns.length === 2`,
  // so its visibility is the contract under test here.
  const result = section.getByTestId("decision-compare-result");
  await expect(result).toBeVisible();
  await expect(section.getByTestId("decision-compare-same-warning")).toHaveCount(0);
  await expect(section.getByTestId("decision-compare-error")).toHaveCount(0);
  await expect(section.getByTestId("decision-compare-download-pdf")).toBeVisible();

  // The ImpactSummary renders its multi-column comparison view (not the
  // single-scenario view) when `columns` has 2+ entries — assert on the
  // comparison-mode wrapper so we know the engine produced columns.
  await expect(page.getByTestId("decision-impact-comparison")).toBeVisible();

  // Add a third column — switches ImpactSummary to a 3-up grid and the
  // Download-as-PDF button should disappear because the backend PDF
  // generator is scoped to a binary A vs B comparison.
  await section.getByTestId("decision-compare-add").click();
  const pickerC = section.getByTestId("decision-compare-select-2");
  await expect(pickerC).toBeVisible();
  await expect(pickerC).toContainText(SCENARIO_C_NAME);
  await expect(section.getByTestId("decision-compare-download-pdf")).toHaveCount(0);

  // Removing the third column drops back to the binary case so the PDF
  // button must reappear — guards against a regression where the gating
  // condition flips inclusive/exclusive.
  await section.getByTestId("decision-compare-remove-2").click();
  await expect(section.getByTestId("decision-compare-select-2")).toHaveCount(0);
  await expect(section.getByTestId("decision-compare-download-pdf")).toBeVisible();

  // Switching picker B to scenario C (the enrollment bump) recomputes the
  // comparison columns from a different override family — proves the
  // engine re-runs on user interaction, not just on the auto-seeded keys.
  // The picker exposes a composite `${name}|${createdAt}` value; rather
  // than reconstruct it we discover it from the option's text label.
  const pickerBOptions = await pickerB.locator("option").all();
  let scenarioCValue = "";
  for (const opt of pickerBOptions) {
    const label = (await opt.textContent()) ?? "";
    if (label.includes(SCENARIO_C_NAME)) {
      scenarioCValue = (await opt.getAttribute("value")) ?? "";
      break;
    }
  }
  expect(scenarioCValue, "scenario C should appear in the picker").toBeTruthy();
  await pickerB.selectOption(scenarioCValue);
  await expect(pickerB).toContainText(SCENARIO_C_NAME);
  await expect(section.getByTestId("decision-compare-result")).toBeVisible();
  // Still 2 columns and no duplicates, so the PDF action stays available.
  await expect(section.getByTestId("decision-compare-download-pdf")).toBeVisible();
});
