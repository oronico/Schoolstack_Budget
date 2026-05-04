import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page, type Browser } from "./utils/test";

// Task #507 — locks in the shared ConflictReloadBanner introduced in Task #492.
//
// Task #491 already covers the wizard's bespoke "Updated in another tab" pill,
// but every non-wizard caller of useUpdateModel (decision flows, scenarios
// page, ExportStep, undo banner) now goes through the shared
// `useConflictBanner` hook + `<ConflictReloadBanner />` component instead. A
// regression in any one of those surfaces' 409 handling — e.g. forgetting to
// call `handleMutationError` in a try/catch, or to render `conflict.banner` —
// would silently swallow the cross-tab clobber and let the second save
// overwrite the first. None of that is exercised end-to-end today.
//
// This spec drives a real two-tab race on the decision-flow surface (the
// simplest non-wizard caller of `useConflictBanner`) and asserts:
//   1. The shared banner (data-testid="conflict-reload-banner") renders on
//      Tab B's stale save — proving the 409 was caught by `handleMutationError`
//      and the shared component is wired up on this surface.
//   2. Clicking "Reload model" returns Tab B to a consistent state: the banner
//      is gone, the page re-loads with Tab A's saved scenario visible, and a
//      fresh save from Tab B now succeeds (proving the version cache was
//      reseeded by the post-reload GET).

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedDecisionFixture(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-conflict-banner-${stamp}@e2e.schoolstack.test`;

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
      name: "E2E Conflict-Banner Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Conflict-Banner Academy",
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

async function openChangeEnrollmentTab(
  browser: Browser,
  token: string,
  modelId: number,
): Promise<Page> {
  // Each tab needs its own BrowserContext so the customFetch
  // modelVersionCache does NOT leak across the two tabs — that's the only
  // way to reproduce the cross-tab race the shared banner is supposed to
  // catch on a non-wizard surface.
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
  await page.goto(`/decisions/change-enrollment/${modelId}`);
  // Wait until the flow is interactive — proves the GET /api/models/:id
  // round-trip finished and the customFetch cache was seeded with the
  // model's current `version`.
  await expect(page.getByTestId("why-step-change_enrollment")).toBeVisible({
    timeout: 15_000,
  });
  return page;
}

async function walkAndSaveScenario(page: Page, scenarioName: string): Promise<void> {
  await page.getByTestId("decision-why-narrative").fill(`Narrative for ${scenarioName}`);
  await page.getByTestId("decision-flow-next").click();

  await expect(page.getByTestId("change-enrollment-inputs")).toBeVisible();
  // retention + tuition-delta together satisfy `hasAnyChange` without
  // having to drive a Radix slider from Playwright.
  await page.getByTestId("change-enrollment-retention").fill("92");
  await page.getByTestId("change-enrollment-tuition-delta").fill("250");
  await page.getByTestId("decision-flow-next").click();

  await expect(page.getByTestId("change-enrollment-impact")).toBeVisible();
  await page.getByTestId("decision-flow-next").click();

  await expect(page.getByTestId("decision-flow-save-step")).toBeVisible();
  await page.getByTestId("decision-flow-scenario-name").fill(scenarioName);
  await page.getByTestId("save-action-later").click();
}

test("Decision flow: a stale save in Tab B surfaces the shared ConflictReloadBanner, and Reload model returns the tab to a consistent state", async ({
  browser,
  request,
}) => {
  const { token, modelId } = await seedDecisionFixture(request);

  const tabA = await openChangeEnrollmentTab(browser, token, modelId);
  const tabB = await openChangeEnrollmentTab(browser, token, modelId);

  try {
    // Tab A: walk through the flow and save "Tab A scenario". This advances
    // the model's server-side version from 1 → 2. Tab A's local
    // modelVersionCache is updated by the PUT response; Tab B's cache is
    // not, since they're in separate browser contexts.
    await walkAndSaveScenario(tabA, "Tab A scenario");
    await expect(tabA.getByTestId("decision-flow-save-step")).toContainText(
      /Scenario saved/i,
      { timeout: 10_000 },
    );

    // Sanity: the shared banner should NOT be on Tab A — Tab A's save
    // succeeded, no 409 was raised.
    await expect(tabA.getByTestId("conflict-reload-banner")).toHaveCount(0);

    // Tab B: walk through and try to save. Tab B's customFetch cache still
    // holds version 1, so its PUT will ship If-Match: 1 and the server
    // will respond 409. handleMutationError must catch that, flip the
    // useConflictBanner state to open, and render the shared banner.
    await walkAndSaveScenario(tabB, "Tab B scenario (stale)");

    const banner = tabB.getByTestId("conflict-reload-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText("Your other tab made changes");
    const reloadButton = tabB.getByTestId("conflict-reload-button");
    await expect(reloadButton).toBeVisible();

    // The stale write must NOT have landed: the server should still only
    // have Tab A's scenario at this point.
    const afterStale = await request.get(`/api/models/${modelId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterStale.ok()).toBeTruthy();
    const afterStaleBody = (await afterStale.json()) as {
      data?: { customScenarios?: Array<{ name?: string }> };
    };
    expect(
      (afterStaleBody.data?.customScenarios ?? []).map((s) => s.name),
    ).toEqual(["Tab A scenario"]);

    // Click "Reload model" — the shared component calls
    // window.location.reload() which re-runs useGetModel and reseeds the
    // customFetch version cache. After the reload, Tab B should be back
    // on the decision flow's first step and the banner should be gone.
    await Promise.all([
      tabB.waitForLoadState("load"),
      reloadButton.click(),
    ]);

    await expect(tabB.getByTestId("why-step-change_enrollment")).toBeVisible({
      timeout: 15_000,
    });
    await expect(tabB.getByTestId("conflict-reload-banner")).toHaveCount(0);

    // Re-walk the flow and save again. With the cache reseeded to the
    // latest version (2), this PUT should succeed and the server should
    // now have BOTH scenarios — proving the reload restored Tab B to a
    // consistent state instead of leaving it permanently stuck.
    await walkAndSaveScenario(tabB, "Tab B scenario (after reload)");
    await expect(tabB.getByTestId("decision-flow-save-step")).toContainText(
      /Scenario saved/i,
      { timeout: 10_000 },
    );

    const afterReload = await request.get(`/api/models/${modelId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterReload.ok()).toBeTruthy();
    const afterReloadBody = (await afterReload.json()) as {
      version?: number;
      data?: { customScenarios?: Array<{ name?: string }> };
    };
    expect(
      (afterReloadBody.data?.customScenarios ?? []).map((s) => s.name),
    ).toEqual(["Tab A scenario", "Tab B scenario (after reload)"]);
    // Two successful PUTs after the original create → version >= 3.
    expect(afterReloadBody.version ?? 0).toBeGreaterThanOrEqual(3);
  } finally {
    await tabA.context().close();
    await tabB.context().close();
  }
});
