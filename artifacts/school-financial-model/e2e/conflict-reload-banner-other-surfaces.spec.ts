import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type Browser,
} from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #513 — extends the Task #507 coverage of the shared
// `<ConflictReloadBanner />` to the surfaces the original spec didn't
// touch:
//   1. The Scenarios page's debounced scenario save (`persistScenarios`).
//   2. The wizard ExportStep's "Extend to 5-year" save.
//   3. The dashboard `<UndoLastAppliedDecisionBanner />` undo + dismiss.
//
// All three callers wrap their `useUpdateModel` mutation through the
// shared `useConflictBanner` hook. A regression in any one of those
// callsites — forgetting to call `handleMutationError` in a try/catch,
// or to render `conflict.banner` — would silently swallow a cross-tab
// 409 and let the second save overwrite the first. None of those paths
// are exercised end-to-end by the existing Task #507 spec, which only
// drives the decision-flow surface.
//
// Each test races a real cross-tab clobber by:
//   - Loading the surface in a real browser tab (so its in-memory
//     customFetch modelVersionCache is seeded with the model's initial
//     `version`), and then
//   - Firing an out-of-band PUT via the Playwright `request` fixture.
//     That bumps the server's `version` from N → N+1 without touching
//     the tab's local cache, so the tab's next mutation will ship a
//     stale `If-Match` header and the server will respond 409 — the
//     exact race the shared banner is meant to catch.

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

interface SeedOpts {
  currentStep?: number;
  extraData?: Record<string, unknown>;
  modelDuration?: "single_year" | "five_year";
  emailPrefix?: string;
}

async function seedModel(
  request: APIRequestContext,
  opts: SeedOpts = {},
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prefix = opts.emailPrefix ?? "playwright-conflict-other";
  const email = `${prefix}-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });
  await seedPersona(request, token);

  const baseSchoolProfile: Record<string, unknown> = {
    schoolName: "E2E Conflict Other Academy",
    state: "MA",
    schoolStage: "operating_school",
    fiscalYearStartMonth: 7,
    isPartialFirstYear: false,
    year1OperatingMonths: 12,
    debtIncluded: false,
  };
  if (opts.modelDuration) {
    baseSchoolProfile.modelDuration = opts.modelDuration;
  }

  const createRes = await request.post("/api/models", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: "E2E Conflict Other Academy",
      currentStep: opts.currentStep ?? 12,
      data: {
        schoolProfile: baseSchoolProfile,
        enrollment: {
          year1: 80,
          year2: 90,
          year3: 100,
          year4: 110,
          year5: 120,
          retentionRate: 88,
        },
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
        ...(opts.extraData ?? {}),
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

interface ServerModelSnapshot {
  version: number;
  data: Record<string, unknown>;
}

async function fetchModel(
  request: APIRequestContext,
  token: string,
  modelId: number,
): Promise<ServerModelSnapshot> {
  const res = await request.get(`/api/models/${modelId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `fetch model failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as ServerModelSnapshot;
  return body;
}

// Bumps the server-side `version` of `modelId` without going through the
// browser tab. Used to simulate "another tab" landing a save while the
// tab under test is sitting on a stale version. Returns the new version.
async function bumpServerVersion(
  request: APIRequestContext,
  token: string,
  modelId: number,
): Promise<number> {
  const before = await fetchModel(request, token, modelId);
  const putRes = await request.put(`/api/models/${modelId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "If-Match": `"${before.version}"`,
      "Content-Type": "application/json",
    },
    data: {
      data: {
        ...before.data,
        // Marker so a follow-up assertion can confirm the bump landed.
        // The wizard / scenarios pages ignore unknown keys.
        _e2eServerBump: Date.now(),
      },
    },
  });
  expect(
    putRes.ok(),
    `bump PUT failed: ${putRes.status()} ${await putRes.text()}`,
  ).toBeTruthy();
  const body = (await putRes.json()) as { version: number };
  return body.version;
}

// Each tab needs its own BrowserContext so the customFetch
// modelVersionCache (a module-level singleton) does NOT bleed across
// the in-test API bumps and the in-tab mutations — the API bump
// deliberately does not touch the tab's cache, which is what makes the
// next in-tab PUT ship a stale If-Match.
async function openTab(
  browser: Browser,
  token: string,
  url: string,
  opts: { modelId?: number } = {},
): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ({ value, modelId }) => {
      try {
        window.localStorage.setItem("auth_token", value);
        window.localStorage.setItem("cookie_consent", "declined");
        // The wizard pops `WizardPrepChecklist` as a modal overlay on
        // step 1 the first time a founder opens a model. Pre-mark it
        // as seen so it can't intercept the click on the undo banner.
        if (modelId != null) {
          window.localStorage.setItem(`wizard_prep_seen_${modelId}`, "1");
        }
      } catch {
        /* ignore */
      }
    },
    { value: token, modelId: opts.modelId ?? null },
  );
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}

test("Scenarios page: a stale debounced save surfaces the shared banner, and Reload restores a consistent state", async ({
  browser,
  request,
}) => {
  const { token, modelId } = await seedModel(request, {
    emailPrefix: "playwright-conflict-scenarios",
  });

  const page = await openTab(browser, token, `/model/${modelId}/scenarios`);

  try {
    // Wait until the scenarios page is fully interactive — that's
    // proof useGetModel finished and the customFetch cache holds the
    // initial version (1).
    const addButton = page.getByRole("button", { name: /Create First Scenario/i });
    await expect(addButton).toBeVisible({ timeout: 15_000 });

    // Bump the server version out-of-band. The tab's cache stays at
    // version 1 — its next PUT will ship `If-Match: "1"` against a
    // server that's now at 2 → 409.
    await bumpServerVersion(request, token, modelId);

    // Click "Create First Scenario" — `addScenario` updates local
    // state and schedules `persistScenarios` (800ms debounce). Wait
    // for the new scenario card to render so we know the click took.
    await addButton.click();
    await expect(
      page.getByRole("heading", { name: /Optimistic/ }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // The debounced PUT fires ~800ms after the click. handleMutationError
    // must catch the 409 and flip useConflictBanner open.
    const banner = page.getByTestId("conflict-reload-banner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText("Your other tab made changes");
    const reloadButton = page.getByTestId("conflict-reload-button");
    await expect(reloadButton).toBeVisible();

    // Server-side: the stale save must NOT have landed. The model
    // should still carry zero `scenarios` (the bump only added
    // `_e2eServerBump`).
    const afterStale = await fetchModel(request, token, modelId);
    const staleScenarios =
      (afterStale.data.scenarios as unknown[] | undefined) ?? [];
    expect(staleScenarios).toHaveLength(0);

    // Click Reload — re-runs useGetModel and reseeds the customFetch
    // version cache. After the reload the banner is gone and the
    // page is interactive again.
    await Promise.all([
      page.waitForLoadState("load"),
      reloadButton.click(),
    ]);

    await expect(
      page.getByRole("button", { name: /Create First Scenario/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("conflict-reload-banner")).toHaveCount(0);

    // Re-add a scenario. With the cache reseeded to the latest
    // version, this debounced PUT should succeed and the server
    // should now have one persisted scenario — proving the reload
    // restored the tab to a consistent state.
    await page
      .getByRole("button", { name: /Create First Scenario/i })
      .click();
    await expect(
      page.getByRole("heading", { name: /Optimistic/ }).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Wait for the debounced PUT to land server-side.
    await expect
      .poll(
        async () => {
          const snap = await fetchModel(request, token, modelId);
          const list =
            (snap.data.scenarios as Array<{ name?: string }> | undefined) ?? [];
          return list.length;
        },
        { timeout: 15_000, intervals: [500, 1000] },
      )
      .toBe(1);

    // Banner stayed dismissed — the second save was a clean win.
    await expect(page.getByTestId("conflict-reload-banner")).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});

// Task #518 fixed the silent-drop bug this test was parked for: the
// ExportStep "Extend to 5-year" handler used to call
// `methods.reset(next)` BEFORE awaiting `updateMutation.mutateAsync`,
// which flipped `schoolProfile.modelDuration` to "five_year",
// re-grew `visibleSteps` from 11 → 12, and unmounted ExportStep
// (taking the `{conflict.banner}` JSX with it) before the 409 from a
// stale cross-tab edit could land in the catch. The handler now
// defers the reset until after `mutateAsync` resolves successfully,
// so on a 409 ExportStep stays mounted long enough for
// `conflict.handleMutationError(err)` to flip the shared banner
// open — and the server-side `modelDuration` stays "single_year"
// because the failed PUT never landed.
test("ExportStep: a stale Extend-to-5-year save surfaces the shared banner", async ({
  browser,
  request,
}) => {
  const { token, modelId } = await seedModel(request, {
    currentStep: 12,
    modelDuration: "single_year",
    emailPrefix: "playwright-conflict-export",
  });

  const page = await openTab(browser, token, `/model/${modelId}`);

  try {
    // Wizard mounts at step 12 (Export). Wait for the single-year
    // banner's Extend button so we know the form has hydrated and
    // the customFetch cache is seeded.
    const extendCta = page.getByTestId("single-year-banner-extend");
    await expect(extendCta).toBeVisible({ timeout: 20_000 });

    // Bump the server out-of-band so the next ExportStep mutation
    // lands with a stale If-Match.
    await bumpServerVersion(request, token, modelId);

    // Open the ExtendToFiveYearModal and confirm. The confirm button
    // calls `updateMutation.mutateAsync` inside a try/catch that
    // forwards 409s to the shared `useConflictBanner` hook.
    await extendCta.click();
    const confirmButton = page.getByRole("button", {
      name: /^Extend to 5-Year$/,
    });
    await expect(confirmButton).toBeVisible({ timeout: 10_000 });
    await confirmButton.click();

    // The shared banner is the proof that ExportStep's
    // `handleMutationError` ran and that `{conflict.banner}` is
    // actually rendered on this surface. We allow for the wizard's
    // own copy of `<ConflictReloadBanner />` to potentially also be
    // up (Task #492) — `.first()` picks whichever rendered, both
    // share the same testid + reload button.
    const banner = page.getByTestId("conflict-reload-banner").first();
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText("Your other tab made changes");
    await expect(
      page.getByTestId("conflict-reload-button").first(),
    ).toBeVisible();

    // Server-side: the stale extend must NOT have landed. The model
    // should still be marked single-year (modelDuration unchanged).
    const after = await fetchModel(request, token, modelId);
    const profile = after.data.schoolProfile as
      | { modelDuration?: string }
      | undefined;
    expect(profile?.modelDuration).toBe("single_year");
  } finally {
    await page.context().close();
  }
});

test("UndoLastAppliedDecisionBanner: a stale undo click surfaces the shared banner", async ({
  browser,
  request,
}) => {
  // Pre-seed the model with a fresh `appliedDecisionUndo` record so
  // the dashboard renders the undo banner immediately on load.
  const undoRecord = {
    decisionType: "change_enrollment",
    scenarioName: "E2E Undo target",
    appliedAt: new Date().toISOString(),
    snapshot: {
      schoolProfile: {
        schoolName: "E2E Conflict Other Academy",
        state: "MA",
        schoolStage: "operating_school",
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        debtIncluded: false,
      },
      enrollment: {
        year1: 60,
        year2: 70,
        year3: 80,
        year4: 90,
        year5: 100,
        retentionRate: 85,
      },
    },
    changes: [
      { label: "Year 1 enrollment", before: "60", after: "80", kind: "modified" as const },
    ],
  };

  const { token, modelId } = await seedModel(request, {
    currentStep: 1,
    extraData: { appliedDecisionUndo: undoRecord },
    emailPrefix: "playwright-conflict-undo",
  });

  const page = await openTab(browser, token, `/model/${modelId}`, { modelId });

  try {
    const undoButton = page.getByTestId("undo-last-applied-decision-button");
    await expect(undoButton).toBeVisible({ timeout: 20_000 });

    // Bump server out-of-band so the undo mutation ships a stale
    // If-Match and 409s.
    await bumpServerVersion(request, token, modelId);

    // The undo button calls `window.confirm` before mutating —
    // accept whatever dialog shows up so the click reaches mutateAsync.
    page.on("dialog", (dialog) => {
      dialog.accept().catch(() => {
        /* ignore */
      });
    });
    await undoButton.click();

    const banner = page.getByTestId("conflict-reload-banner").first();
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText("Your other tab made changes");
    await expect(
      page.getByTestId("conflict-reload-button").first(),
    ).toBeVisible();

    // Server-side: the undo record must still be present (the stale
    // undo PUT was rejected, so the model state never rolled back).
    const after = await fetchModel(request, token, modelId);
    expect(after.data.appliedDecisionUndo).toBeTruthy();
  } finally {
    await page.context().close();
  }
});
