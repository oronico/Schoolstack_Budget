import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #390: covers the metric / asOfYear chip toolbar on the Forecast
// accuracy view. The pure helper `filterForecastAccuracy` is already covered
// by vitest, but only a real browser exercise can prove the URL-binding
// chain (chip click → wouter setSearchParams → re-render → recomputed
// aggregate band) still holds end-to-end. A regression in that chain — a
// stale memoization key, a wouter API change that breaks `useSearchParams`,
// or an off-by-one on the URL serialization — would slip past the unit
// suite.
//
// We seed two pursued scenarios with actuals captured against different
// metrics AND different asOfYear values so each chip narrows the visible
// slice in a way that's distinguishable from the unfiltered view, then
// assert the URL, the entry list, and the aggregate band all move
// together.

const TEST_PASSWORD = "PlaywrightTest12345!";

const SCENARIO_ENROLL_NAME = "Forecast E2E enrollment Y1";
const SCENARIO_ENROLL_CREATED_AT = "2026-04-01T12:00:00.000Z";
const SCENARIO_RENT_NAME = "Forecast E2E rent Y2";
const SCENARIO_RENT_CREATED_AT = "2026-04-02T12:00:00.000Z";

// Hand-picked numbers so the deltas are easy to reason about if a future
// failure dumps the rendered text:
//   enrollment: projected 100, actual 110 → +10%
//   monthlyRent: projected 10_000, actual 11_000 → +10% (bad — rent overran)
const PROJECTED_ENROLLMENT_Y1 = 100;
const ACTUAL_ENROLLMENT_Y1 = 110;
const PROJECTED_MONTHLY_RENT = 10_000;
const ACTUAL_MONTHLY_RENT = 11_000;

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

  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });
  // The Forecast accuracy view is gated to "existing" founders — the
  // yet_to_launch persona hides every actuals / variance surface, so
  // seeding the default ("existing") persona keeps the section rendered.
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Forecast Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Forecast Academy",
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

  // Seed two pursued scenarios that each capture a different metric +
  // different asOfYear. We also pin enrollment.year1 so projected
  // enrollment is non-zero (otherwise computeForecastAccuracy would skip
  // the enrollment aggregate because deltaPct would be null on a
  // divide-by-zero).
  const updateRes = await request.put(`/api/models/${modelId}`, {
    headers: { ...authHeaders, "If-Match": `"${createdVersion}"` },
    data: {
      name: "E2E Forecast Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Forecast Academy",
          state: "MA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        enrollment: {
          year1: PROJECTED_ENROLLMENT_Y1,
          year2: 120,
          year3: 140,
          year4: 160,
          year5: 180,
          retentionRate: 85,
        },
        customScenarios: [
          {
            name: SCENARIO_ENROLL_NAME,
            createdAt: SCENARIO_ENROLL_CREATED_AT,
            // No enrollment delta — projected Year 1 enrollment is just the
            // baseline (100), and the actual (110) lands +10% above plan.
            overrides: { enrollmentDelta: [0, 0, 0, 0, 0] },
            decisionType: "change_enrollment",
            outcomeStatus: "pursued",
            outcomeUpdatedAt: SCENARIO_ENROLL_CREATED_AT,
            actuals: {
              asOfYear: 1,
              enrollmentActual: ACTUAL_ENROLLMENT_Y1,
              updatedAt: SCENARIO_ENROLL_CREATED_AT,
            },
          },
          {
            name: SCENARIO_RENT_NAME,
            createdAt: SCENARIO_RENT_CREATED_AT,
            overrides: { monthlyRent: PROJECTED_MONTHLY_RENT },
            decisionType: "evaluate_site",
            outcomeStatus: "pursued",
            outcomeUpdatedAt: SCENARIO_RENT_CREATED_AT,
            actuals: {
              asOfYear: 2,
              signedMonthlyRent: ACTUAL_MONTHLY_RENT,
              updatedAt: SCENARIO_RENT_CREATED_AT,
            },
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

// The chip toolbar uses `setSearchParams(..., { replace: true })`, so we read
// the `?…` portion straight off `page.url()` rather than waiting on a
// navigation event.
function searchParamsOf(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

test("Forecast accuracy chip toolbar binds metric + asOfYear filters to the URL and recomputes the band", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  // Wait for the section + both seeded entries before exercising chips —
  // otherwise a slow first paint can race the first click and produce a
  // misleading "wrong URL" failure.
  const section = page.getByTestId("forecast-accuracy-section");
  await expect(section).toBeVisible();

  const count = page.getByTestId("forecast-accuracy-count");
  // Initial state: no filter, so the count parens render just "(2)" — the
  // "X of Y" form only appears once a filter is active.
  await expect(count).toHaveText("(2)");

  // Anchor every name assertion inside the Forecast accuracy section —
  // the same scenario names also render on the saved-scenarios cards and
  // in the decision-comparison picker on the same page, so a top-level
  // `getByText` would resolve to multiple elements and trip strict mode.
  const entries = section.getByTestId("forecast-accuracy-entries");
  await expect(entries).toBeVisible();
  // We render one entry per pursued scenario with actuals — assert the
  // count first so a later regression that drops or duplicates a row
  // fails here with a clear message rather than further down.
  await expect(
    section.getByTestId(/^forecast-accuracy-entry-name-/),
  ).toHaveCount(2);
  await expect(
    entries.getByText(SCENARIO_ENROLL_NAME, { exact: true }),
  ).toBeVisible();
  await expect(
    entries.getByText(SCENARIO_RENT_NAME, { exact: true }),
  ).toBeVisible();

  // Both metric aggregates must show up in the unfiltered view. Each
  // scenario contributed to a different metric, so we should see one card
  // per metric in the band.
  const aggEnrollment = page.getByTestId(
    "forecast-accuracy-aggregate-enrollment",
  );
  const aggRent = page.getByTestId("forecast-accuracy-aggregate-monthlyRent");
  await expect(aggEnrollment).toBeVisible();
  await expect(aggRent).toBeVisible();

  // No filter params on the URL yet.
  expect(searchParamsOf(page).get("metric")).toBeNull();
  expect(searchParamsOf(page).get("asOfYear")).toBeNull();

  // --- Click the enrollment metric chip ------------------------------------

  await page.getByTestId("forecast-accuracy-metric-enrollment").click();

  // URL must gain `?metric=enrollment` (replace: true, so no extra history
  // entry is pushed — we just assert the current location reflects it).
  await expect
    .poll(() => searchParamsOf(page).get("metric"))
    .toBe("enrollment");
  expect(searchParamsOf(page).get("asOfYear")).toBeNull();

  // The entry list shrinks to just the enrollment scenario and the count
  // switches to the "X of Y" form.
  await expect(count).toHaveText("(1 of 2)");
  await expect(
    section.getByTestId(/^forecast-accuracy-entry-name-/),
  ).toHaveCount(1);
  await expect(
    entries.getByText(SCENARIO_ENROLL_NAME, { exact: true }),
  ).toBeVisible();
  await expect(
    entries.getByText(SCENARIO_RENT_NAME, { exact: true }),
  ).toHaveCount(0);

  // The aggregate band shrinks too: only the enrollment aggregate
  // survives the filter — the monthlyRent card must drop out entirely.
  await expect(aggEnrollment).toBeVisible();
  await expect(aggRent).toHaveCount(0);

  // --- Append a conflicting asOfYear chip ----------------------------------
  //
  // We deliberately pick year=2 first, even though metric=enrollment is
  // already active. The only enrollment entry was captured at asOfYear=1,
  // so combining metric=enrollment AND asOfYear=2 must collapse the
  // entries list to zero and drop the aggregate band entirely. Picking
  // year=1 here would leave the same single-entry slice as the
  // metric-only step above, and a regression where the year filter is
  // ignored (but the URL still updates) would slip through. Using a
  // conflicting year proves the filter actually changes the computed
  // output, not just the query string.

  await page.getByTestId("forecast-accuracy-year-2").click();

  // Both query params must be present now — `?asOfYear=2` is appended to
  // the existing `?metric=enrollment` rather than replacing it.
  await expect
    .poll(() => searchParamsOf(page).get("asOfYear"))
    .toBe("2");
  expect(searchParamsOf(page).get("metric")).toBe("enrollment");

  // No enrollment entry exists at asOfYear=2, so the entry list collapses
  // to the empty state and the aggregate band disappears entirely. This
  // is the discriminative check — a regression that ignored the year
  // filter would still render the Year-1 enrollment entry here.
  await expect(count).toHaveText("(0 of 2)");
  await expect(
    section.getByTestId(/^forecast-accuracy-entry-name-/),
  ).toHaveCount(0);
  await expect(section.getByTestId("forecast-accuracy-empty")).toBeVisible();
  await expect(aggEnrollment).toHaveCount(0);
  await expect(aggRent).toHaveCount(0);

  // --- Recover by selecting the matching year ------------------------------
  //
  // Switching to year=1 must bring the enrollment slice back. We go
  // through year=1 (rather than All) so we exercise the chip→URL→
  // recompute path one more time with a value that DOES match.

  await page.getByTestId("forecast-accuracy-year-1").click();
  await expect
    .poll(() => searchParamsOf(page).get("asOfYear"))
    .toBe("1");
  expect(searchParamsOf(page).get("metric")).toBe("enrollment");

  await expect(count).toHaveText("(1 of 2)");
  await expect(
    section.getByTestId(/^forecast-accuracy-entry-name-/),
  ).toHaveCount(1);
  await expect(
    entries.getByText(SCENARIO_ENROLL_NAME, { exact: true }),
  ).toBeVisible();
  await expect(aggEnrollment).toBeVisible();
  // Aggregate copy reflects the recomputed slice — the lone enrollment
  // entry came in +10% (actual 110 vs projected 100), which the
  // describeTendency helper renders as "you tend to under-project" with
  // a "10%" magnitude. Anchoring on this text proves the aggregate band
  // was actually rebuilt against the surviving slice rather than left
  // stale from the unfiltered roll-up.
  await expect(
    page.getByTestId("forecast-accuracy-aggregate-text-enrollment"),
  ).toContainText(/under-project/i);
  await expect(
    page.getByTestId("forecast-accuracy-aggregate-text-enrollment"),
  ).toContainText("10%");
  await expect(aggRent).toHaveCount(0);

  // --- Clear filters --------------------------------------------------------

  await page.getByTestId("forecast-accuracy-clear-filters").click();

  // Both query params disappear from the URL — the helper builds a fresh
  // URLSearchParams without `metric` or `asOfYear`, so other unrelated
  // params (none in this test) would survive but the two filter keys must
  // not.
  await expect
    .poll(() => searchParamsOf(page).get("metric"))
    .toBeNull();
  expect(searchParamsOf(page).get("asOfYear")).toBeNull();

  // Count returns to the bare "(2)" form, both aggregates re-render, and
  // both seeded entries are visible again.
  await expect(count).toHaveText("(2)");
  await expect(aggEnrollment).toBeVisible();
  await expect(aggRent).toBeVisible();
  await expect(
    section.getByTestId(/^forecast-accuracy-entry-name-/),
  ).toHaveCount(2);
  await expect(
    entries.getByText(SCENARIO_ENROLL_NAME, { exact: true }),
  ).toBeVisible();
  await expect(
    entries.getByText(SCENARIO_RENT_NAME, { exact: true }),
  ).toBeVisible();
});
