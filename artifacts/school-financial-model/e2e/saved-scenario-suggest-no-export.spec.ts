import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";

// Verifies the "Suggest from latest data" fallback path: when the founder
// has prior-year actuals captured in setup but has NOT uploaded an
// accounting export, clicking Suggest should still populate the editor and
// surface the suggestion-feedback line — but NOT render the "Pulled from
// your books" callout (which is gated on an export filename match). This
// guards against a regression where the callout leaks into non-export
// suggestions and confuses the founder about provenance.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_NAME = "E2E suggest fallback";
const SCENARIO_CREATED_AT = "2026-03-04T12:00:00.000Z";
const PRIOR_ENROLLMENT = 87;
const PRIOR_REVENUE = 1_350_000;
const PRIOR_EXPENSES = 1_290_000;

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
      name: "E2E Suggest Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Suggest Academy",
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

  // Seed prior-year actuals (so Suggest has something to pull) but NO
  // accountingExport — this is the fallback path. Mark the scenario as
  // Pursued so the actuals editor surfaces; without that, the
  // "showActualsSurface" gate hides the editor entirely.
  const updateRes = await request.put(`/api/models/${modelId}`, {
    headers: { ...authHeaders, "If-Match": `"${createdVersion}"` },
    data: {
      name: "E2E Suggest Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Suggest Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        priorYearSnapshot: {
          endingEnrollment: PRIOR_ENROLLMENT,
          totalRevenue: PRIOR_REVENUE,
          totalExpenses: PRIOR_EXPENSES,
        },
        customScenarios: [
          {
            name: SCENARIO_NAME,
            createdAt: SCENARIO_CREATED_AT,
            overrides: { enrollmentDelta: [5, 0, 0, 0, 0] },
            decisionType: "change_enrollment",
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

test("Suggest from latest data fills the editor without a books callout when no export exists", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  const card = page.getByTestId("custom-scenario-card-0");
  await expect(card).toBeVisible();

  // Open the actuals editor — the surface only appears for Pursued
  // scenarios (or those with saved actuals), which we set up in the seed.
  await card.getByTestId("custom-scenario-actuals-edit-0").click();
  const editor = card.getByTestId("custom-scenario-actuals-editor-0");
  await expect(editor).toBeVisible();

  const suggestButton = card.getByTestId("custom-scenario-actuals-suggest-0");
  await expect(suggestButton).toBeEnabled();

  await suggestButton.click();

  // The editor's enrollment / revenue / expense inputs get populated with
  // the prior-year values and tagged "Suggested" so the founder can see
  // they came from setup data.
  await expect(card.getByTestId("custom-scenario-actuals-enrollment-0")).toHaveValue(
    String(PRIOR_ENROLLMENT),
  );
  await expect(card.getByTestId("custom-scenario-actuals-revenue-0")).toHaveValue(
    String(PRIOR_REVENUE),
  );
  await expect(card.getByTestId("custom-scenario-actuals-expense-0")).toHaveValue(
    String(PRIOR_EXPENSES),
  );
  await expect(
    card.getByTestId("custom-scenario-actuals-enrollment-0-suggested"),
  ).toBeVisible();
  // The feedback note under the Suggest button must reflect that fields
  // were filled — never the misleading "Nothing to suggest" message that
  // used to fire when the `filled` counter was mutated inside a deferred
  // React state-updater callback. We anchor on the "Filled N field(s)
  // from …" wording so any future regression that swaps it back to the
  // empty-state copy fails loudly.
  const feedback = card.getByTestId(
    "custom-scenario-actuals-suggestion-feedback-0",
  );
  await expect(feedback).toBeVisible();
  await expect(feedback).toHaveText(/Filled \d+ fields? from /i);
  await expect(feedback).not.toHaveText(/Nothing to suggest/i);
  // Source-label tooltip on the input pins the provenance to the typed-in
  // setup snapshot — this is the bit the books-callout would override if
  // an export were present, so it's the right anchor for the fallback.
  await expect(
    card.getByTestId("custom-scenario-actuals-enrollment-0"),
  ).toHaveAttribute("title", /Prior-year actuals from setup/i);

  // Critically — the "Pulled from your books" callout must NOT render
  // when there's no accounting export. That callout is gated on
  // `accountingExportInfo?.filename`, so its absence here is what
  // proves the fallback path works without leaking a misleading
  // books-sourced caption.
  await expect(
    card.getByTestId("custom-scenario-actuals-export-source-0"),
  ).toHaveCount(0);
  await expect(
    card.getByTestId("custom-scenario-actuals-replace-export-0"),
  ).toHaveCount(0);
});
