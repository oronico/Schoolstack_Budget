import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Verifies the in-drawer "Saved scenarios" picker (Task #368) end-to-end:
//   1. With a pre-seeded CustomScenario on the model, opening the picker from
//      the WhatIfDrawer header and clicking the entry hydrates the drawer's
//      live overrides — the enrollment input(s) reflect the override AND
//      `window.location.hash` ends up carrying an encoded `whatif=` segment
//      (proving the trigger → drawer → customScenarios prop → hash-write
//      effect chain is wired together against a real React Query store).
//   2. With no saved scenarios on the model, opening the picker shows the
//      empty-state hint that points the founder at the footer Save action.
//
// Component-level tests in `WhatIfDrawer.savedScenarios.test.tsx` cover the
// hydration callback in jsdom; this spec is the only thing that pins the
// real round-trip down a real browser.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_NAME = "E2E Bigger Y1 cohort";
const SCENARIO_CREATED_AT = "2026-04-02T15:00:00.000Z";
const Y1_DELTA = 10;
const BASE_ENROLLMENT = {
  year1: 100,
  year2: 110,
  year3: 120,
  year4: 130,
  year5: 140,
} as const;

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedFixture(
  request: APIRequestContext,
  opts: { withScenario: boolean },
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Founder",
  });
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // currentStep=12 makes the Scenarios page render the WhatIfTrigger; we
  // also seed a baseline enrollment so we can assert the in-drawer Y1
  // input reflects baseline + override delta after hydration.
  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Saved Picker Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Saved Picker Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        enrollment: { ...BASE_ENROLLMENT },
      },
    },
  });
  expect(
    createRes.ok(),
    `create model failed: ${createRes.status()} ${await createRes.text()}`,
  ).toBeTruthy();
  const { id: modelId, version: createdVersion } = (await createRes.json()) as {
    id: number;
    version: number;
  };

  if (opts.withScenario) {
    const updateRes = await request.put(`/api/models/${modelId}`, {
      headers: { ...authHeaders, "If-Match": `"${createdVersion}"` },
      data: {
        name: "E2E Saved Picker Academy",
        currentStep: 12,
        data: {
          schoolProfile: {
            schoolName: "E2E Saved Picker Academy",
            state: "MA",
            schoolStage: "operating_school",
            fiscalYearStartMonth: 7,
          },
          enrollment: { ...BASE_ENROLLMENT },
          customScenarios: [
            {
              name: SCENARIO_NAME,
              createdAt: SCENARIO_CREATED_AT,
              overrides: { enrollmentDelta: [Y1_DELTA, 0, 0, 0, 0] },
              decisionType: "evaluate_site",
            },
          ],
        },
      },
    });
    expect(
      updateRes.ok(),
      `update model failed: ${updateRes.status()} ${await updateRes.text()}`,
    ).toBeTruthy();
  }

  return { token, modelId };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

test("In-drawer saved-scenario picker hydrates overrides into the enrollment input and URL hash", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedFixture(request, { withScenario: true });
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  // No `#whatif=` segment yet — proves the hash payload we assert on later
  // came from selecting the saved scenario, not from any prior nav.
  expect(page.url()).not.toContain("#whatif=");

  // Open the planner via the floating trigger (drawer is lazy-loaded).
  await page.getByTestId("whatif-trigger").click();
  const drawer = page.getByTestId("whatif-drawer");
  await expect(drawer).toBeVisible({ timeout: 15_000 });

  // Pre-condition: the Y1 enrollment input shows the baseline value before
  // the founder picks a saved scenario.
  const enrollmentY1 = drawer.getByTestId("whatif-enrollment-Y1");
  await expect(enrollmentY1).toHaveValue(String(BASE_ENROLLMENT.year1));

  // Open the in-header picker; the count badge should reflect the seeded
  // scenario, and the menu should list it.
  const trigger = drawer.getByTestId("whatif-saved-scenarios-trigger");
  await expect(trigger).toBeVisible();
  await expect(drawer.getByTestId("whatif-saved-scenarios-count")).toHaveText(
    "1",
  );
  await trigger.click();

  const menu = drawer.getByTestId("whatif-saved-scenarios-menu");
  await expect(menu).toBeVisible();
  const entry = menu.getByTestId("whatif-saved-scenario-0");
  await expect(entry).toContainText(SCENARIO_NAME);

  await entry.click();

  // Menu closes on hydrate so the founder can immediately see the dialled
  // sliders. The enrollment input now reflects baseline + override delta.
  await expect(menu).toHaveCount(0);
  await expect(enrollmentY1).toHaveValue(
    String(BASE_ENROLLMENT.year1 + Y1_DELTA),
  );

  // The debounced hash-writer effect pushes the override into the URL.
  // The encoder uses `e:<d1>,<d2>,...` for enrollmentDelta — assert the
  // segment is present (URL-encoded `,` becomes `%2C`) so a future
  // refactor that drops the field from the payload trips this test.
  await page.waitForFunction(() =>
    window.location.hash.includes("whatif="),
  );
  expect(page.url()).toContain("#");
  expect(page.url()).toContain("whatif=");
  expect(page.url()).toMatch(/whatif=[^&]*e:?/);
});

test("Saved-scenario picker shows the empty-state hint when the model has no saved scenarios", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedFixture(request, { withScenario: false });
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  await page.getByTestId("whatif-trigger").click();
  const drawer = page.getByTestId("whatif-drawer");
  await expect(drawer).toBeVisible({ timeout: 15_000 });

  // No scenarios → no count badge next to the picker label.
  await expect(drawer.getByTestId("whatif-saved-scenarios-count")).toHaveCount(
    0,
  );

  await drawer.getByTestId("whatif-saved-scenarios-trigger").click();

  const empty = drawer.getByTestId("whatif-saved-scenarios-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText(/no saved scenarios yet/i);
  await expect(empty).toContainText(/save as scenario/i);
});
