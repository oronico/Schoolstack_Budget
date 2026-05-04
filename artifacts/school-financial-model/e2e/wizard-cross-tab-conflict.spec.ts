import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page, type Browser } from "./utils/test";

// Task #491 — locks in the If-Match safety net introduced in Task #479.
//
// Two scenarios:
//   1) Cross-tab wizard autosave: open the same model in two browser
//      contexts, edit + autosave in tab A, then edit in tab B. Tab B's
//      autosave must hit the server's mandatory optimistic-concurrency
//      check, fail with 409, and surface the "Updated in another tab"
//      reload prompt instead of silently clobbering tab A's edit.
//   2) Sequential decision-flow saves: prove the customFetch model-
//      version cache transparently advances across back-to-back PUTs
//      that go through useUpdateModel (decision flow #1, then decision
//      flow #2). Both saves must succeed without 428/409, which only
//      works when the cache extracts the new ETag from each response
//      and auto-injects it as If-Match on the next PUT.

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedWizardFixture(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-cross-tab-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
  });
  expect(
    registerRes.ok(),
    `register failed: ${registerRes.status()} ${await registerRes.text()}`,
  ).toBeTruthy();
  const { token } = (await registerRes.json()) as { token: string };
  await seedPersona(request, token);

  // Land on step 1 (SchoolProfileStep) so both tabs can edit the
  // schoolProfile.schoolName field — the simplest text input that
  // dirties the form and triggers the 1s-debounced autosave.
  const createRes = await request.post("/api/models", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: "E2E Cross-Tab Academy",
      currentStep: 1,
      data: {
        schoolProfile: {
          schoolName: "E2E Cross-Tab Academy",
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

  return { token, modelId };
}

async function seedDecisionFixture(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-cross-tab-decisions-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
  });
  expect(
    registerRes.ok(),
    `register failed: ${registerRes.status()} ${await registerRes.text()}`,
  ).toBeTruthy();
  const { token } = (await registerRes.json()) as { token: string };
  await seedPersona(request, token);

  const createRes = await request.post("/api/models", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: "E2E Sequential Saves Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Sequential Saves Academy",
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

async function openWizardTab(browser: Browser, token: string, modelId: number): Promise<Page> {
  // Each tab needs its own BrowserContext so React state, the wizard's
  // `lastEtagRef`, and the customFetch module's modelVersionCache do
  // NOT leak across the two tabs — that's the only way to reproduce
  // the cross-tab race the safety net is supposed to catch.
  const ctx = await browser.newContext();
  await ctx.addInitScript((value) => {
    try {
      window.localStorage.setItem("auth_token", value);
      window.localStorage.setItem("cookie_consent", "declined");
    } catch {
      /* ignore */
    }
  }, token);
  const page = await ctx.newPage();
  await page.goto(`/model/${modelId}`);
  // Wait until the wizard's school-name input is interactive — that's
  // proof the GET /api/models/:id round-trip finished and lastEtagRef
  // was seeded from the response's `version`.
  const nameInput = page.getByLabel("What's the name of your school?");
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await expect(nameInput).toBeEnabled();
  return page;
}

test("Two tabs editing the same model: Tab B's stale save is blocked with the conflict-reload UI", async ({
  browser,
  request,
}) => {
  const { token, modelId } = await seedWizardFixture(request);

  const tabA = await openWizardTab(browser, token, modelId);
  const tabB = await openWizardTab(browser, token, modelId);

  try {
    // Tab A edits the school name. Autosave is debounced 1s and the
    // header flips to "Saved" once the PUT resolves successfully, so
    // we wait on that indicator before letting Tab B race its own save.
    const tabANameInput = tabA.getByLabel("What's the name of your school?");
    await tabANameInput.fill("E2E Cross-Tab Academy — edited in Tab A");
    await expect(
      tabA.getByText("Saved", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // Tab B is still holding the original `version` in lastEtagRef, so
    // its next autosave should send a stale If-Match and the server
    // should respond 409. The wizard renders a button with the
    // "Updated in another tab — click to reload" copy when saveError
    // flips to "conflict".
    const tabBNameInput = tabB.getByLabel("What's the name of your school?");
    await tabBNameInput.fill("E2E Cross-Tab Academy — edited in Tab B");

    const conflictPrompt = tabB.getByRole("button", {
      name: /Updated in another tab.*click to reload/i,
    });
    await expect(conflictPrompt).toBeVisible({ timeout: 15_000 });
  } finally {
    await tabA.context().close();
    await tabB.context().close();
  }
});

test("Sequential useUpdateModel saves succeed because customFetch auto-injects the latest If-Match", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedDecisionFixture(request);

  // Single context so the customFetch modelVersionCache is shared
  // across both saves — that's exactly the production code path we
  // want to exercise for callers that go through useUpdateModel.
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);

  // First save — change-enrollment flow (useUpdateModel #1). The cache
  // is seeded by the GET that useGetModel issues on mount, then the
  // PUT auto-injects If-Match from the cache.
  await page.goto(`/decisions/change-enrollment/${modelId}`);
  await expect(page.getByTestId("why-step-change_enrollment")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("decision-why-narrative").fill("Sequential save #1");
  await page.getByTestId("decision-flow-next").click();
  await expect(page.getByTestId("change-enrollment-inputs")).toBeVisible();
  await page.getByTestId("change-enrollment-retention").fill("92");
  await page.getByTestId("change-enrollment-tuition-delta").fill("250");
  await page.getByTestId("decision-flow-next").click();
  await expect(page.getByTestId("change-enrollment-impact")).toBeVisible();
  await page.getByTestId("decision-flow-next").click();
  await expect(page.getByTestId("decision-flow-save-step")).toBeVisible();
  await page.getByTestId("decision-flow-scenario-name").fill("E2E Sequential save 1");
  await page.getByTestId("save-action-later").click();
  await expect(page.getByTestId("decision-flow-save-step")).toContainText(/Scenario saved/i, {
    timeout: 10_000,
  });

  // Second save — same model, second decision flow (useUpdateModel #2).
  // Without the cache update on the first PUT response, this PUT would
  // ship a stale (or missing) If-Match and the server would 409 / 428.
  await page.goto(`/decisions/change-enrollment/${modelId}`);
  await expect(page.getByTestId("why-step-change_enrollment")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("decision-why-narrative").fill("Sequential save #2");
  await page.getByTestId("decision-flow-next").click();
  await page.getByTestId("change-enrollment-retention").fill("90");
  await page.getByTestId("change-enrollment-tuition-delta").fill("400");
  await page.getByTestId("decision-flow-next").click();
  await expect(page.getByTestId("change-enrollment-impact")).toBeVisible();
  await page.getByTestId("decision-flow-next").click();
  await expect(page.getByTestId("decision-flow-save-step")).toBeVisible();
  await page.getByTestId("decision-flow-scenario-name").fill("E2E Sequential save 2");
  await page.getByTestId("save-action-later").click();
  await expect(page.getByTestId("decision-flow-save-step")).toContainText(/Scenario saved/i, {
    timeout: 10_000,
  });

  // Server-side verification: both writes landed, proving the second
  // PUT was not silently rejected behind the React Query layer.
  const refetched = await request.get(`/api/models/${modelId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(refetched.ok()).toBeTruthy();
  const body = (await refetched.json()) as {
    version?: number;
    data?: { customScenarios?: Array<{ name?: string }> };
  };
  const scenarios = body.data?.customScenarios ?? [];
  expect(scenarios.map((s) => s.name)).toEqual([
    "E2E Sequential save 1",
    "E2E Sequential save 2",
  ]);
  // The version must have advanced at least twice (once per PUT).
  // Original create was version 1, so >= 3 after two successful saves.
  expect(body.version ?? 0).toBeGreaterThanOrEqual(3);
});
