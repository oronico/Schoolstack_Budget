import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";

// Verifies the saved-scenario "Replace export" deep-link round-trips to the
// wizard's School Profile step with the AccountingExportUploader focused and
// scrolled into view. Component tests cover URL wiring; only a real browser
// can prove the routing handoff, focus state, and scrollIntoView call.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_NAME = "E2E new site evaluation";
const SCENARIO_CREATED_AT = "2026-03-01T12:00:00.000Z";

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
      name: "E2E Test Academy",
      // Scenarios page redirects to the wizard if currentStep < 8 — mark the
      // model as completed so the saved-scenario UI renders.
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Test Academy",
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

  // Layer the export + scenario onto the model in a separate PUT to mirror
  // how the wizard builds models incrementally.
  const updateRes = await request.put(`/api/models/${modelId}`, {
    headers: { ...authHeaders, "If-Match": `"${createdVersion}"` },
    data: {
      name: "E2E Test Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Test Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        accountingExport: {
          filename: "quickbooks-2026Q1.csv",
          uploadedAt: "2026-03-14T15:30:00.000Z",
          totals: {
            totalRevenue: 480000,
            totalExpenses: 420000,
            netIncome: 60000,
          },
        },
        customScenarios: [
          {
            name: SCENARIO_NAME,
            createdAt: SCENARIO_CREATED_AT,
            overrides: { monthlyRent: 12500 },
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
  // Inject the JWT before any app code runs so AuthProvider sees it on first
  // render. Equivalent to logging in through the UI, minus the form.
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

test("Replace export deep-link lands on wizard step 2 with the uploader focused", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  // Stub scrollIntoView before any navigation so we can observe whether the
  // wizard called it on the uploader after the deep-link mounts. Registered
  // up-front because addInitScript only applies to subsequent page loads.
  await page.addInitScript(() => {
    (window as unknown as { __scrolledIntoView: number }).__scrolledIntoView = 0;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function patchedScrollIntoView(
      this: Element,
      ...args: unknown[]
    ) {
      if (
        this.getAttribute &&
        this.getAttribute("data-testid") === "accounting-export-uploader"
      ) {
        (window as unknown as { __scrolledIntoView: number }).__scrolledIntoView += 1;
      }
      if (typeof original === "function") {
        try {
          // @ts-expect-error — forwarding unknown[] to the native signature.
          return original.apply(this, args);
        } catch {
          /* noop */
        }
      }
    };
  });

  await page.goto(`/model/${modelId}/scenarios`);

  const card = page.getByTestId("custom-scenario-card-0");
  await expect(card).toBeVisible();

  // Drive the founder into the actuals editor + suggestion state — the
  // "Replace export" callout only renders once both have happened.
  await card.getByTestId("custom-scenario-actuals-edit-0").click();
  await expect(card.getByTestId("custom-scenario-actuals-editor-0")).toBeVisible();
  await card.getByTestId("custom-scenario-actuals-suggest-0").click();

  const callout = card.getByTestId("custom-scenario-actuals-export-source-0");
  await expect(callout).toBeVisible();
  await expect(callout).toContainText(/Pulled from your books/i);
  await expect(
    callout.getByTestId("custom-scenario-actuals-export-filename-0"),
  ).toHaveText("quickbooks-2026Q1.csv");

  // The "Replace upload" deep-link now lives in the dedicated upload-controls
  // panel (alongside "Remove uploaded export") rather than inside the green
  // "Pulled from your books" callout, so we scope the lookup to the card.
  const replaceLink = card.getByTestId(
    "custom-scenario-actuals-replace-export-0",
  );
  await expect(replaceLink).toHaveAttribute(
    "href",
    `/model/${modelId}?step=2&focus=accounting-export`,
  );

  await replaceLink.click();
  await page.waitForURL(/\/model\/\d+\?step=2&focus=accounting-export/);

  const uploader = page.getByTestId("accounting-export-uploader");
  await expect(uploader).toBeVisible({ timeout: 15_000 });

  // The uploader sets data-focused="true" for ~2.4s while the highlight ring
  // is visible — assert it appeared so we know the deep-link was honored.
  await expect(uploader).toHaveAttribute("data-focused", "true");

  const scrollCount = await page.evaluate(
    () => (window as unknown as { __scrolledIntoView?: number }).__scrolledIntoView ?? 0,
  );
  expect(scrollCount).toBeGreaterThan(0);
});
