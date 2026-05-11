import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #435 — end-to-end coverage for the persona-aware wage-base savings
// sentence on the Scenarios-page comparison view (Task #327). Component tests
// pin the variant copy + scaling math, but they wouldn't catch a regression
// where `staffingRows` / `*StaffingAdjustment` stop being threaded through
// the call site in `pages/scenarios/index.tsx` — at that point the section
// would silently disappear from the live page even though every unit test
// would still pass. This spec drives the real picker → memo → component
// wiring in a real browser to guard against that.
//
// Fixture shape: a roster with a single high-salary leader so a wage-base
// component (FICA SS / state SUI / WA PFML) is provably hit, plus one saved
// what-if scenario with a non-zero `staffingAdjustment` so the two sides of
// the comparison must produce different scaled dollar amounts.

const TEST_PASSWORD = "PlaywrightTest12345!";
const SCENARIO_NAME = "E2E -10% Staffing";
const STAFFING_ADJUSTMENT = -10;
const HEAD_OF_SCHOOL_RATE = 200_000;

// Mirrors the Washington-state component breakdown the unit tests use
// (`ScenarioComparisonView.cap-insight.test.tsx`). Picked because every
// component except Medicare and Comp has a wage base, and the $200k
// Head-of-School clears every cap, guaranteeing a non-zero aggregate
// regardless of which side's `staffingAdjustment` is applied.
const WA_PAYROLL_COMPONENTS = [
  { label: "FICA SS", rate: 6.2, wageBase: 176_100 },
  { label: "Medicare", rate: 1.45 },
  { label: "FUTA", rate: 0.6, wageBase: 7_000 },
  { label: "WA SUI", rate: 1.22, wageBase: 72_800 },
  { label: "WA PFML", rate: 0.28, wageBase: 176_100 },
  { label: "WA Comp", rate: 0.4 },
];

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

  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Founder",
  });
  await seedPersona(request, token, { comfort: "comfortable" });

  const authHeaders = { Authorization: `Bearer ${token}` };

  // currentStep>=9 is the gate that mounts the scenarios + comparison block
  // in `pages/scenarios/index.tsx`; below that the page redirects back to
  // the wizard.
  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Cap Insight Academy",
      currentStep: 12,
      data: {
        schoolProfile: {
          schoolName: "E2E Cap Insight Academy",
          state: "WA",
          schoolStage: "operating_school",
          fiscalYearStartMonth: 7,
        },
        // One real, payroll-like, full-time leader at $200k. The aggregator
        // skips contract / payrollLike=false / payrollTaxRateOverridden rows,
        // so a single clean row is the simplest fixture that guarantees the
        // section renders.
        staffingRows: [
          {
            id: "head-of-school",
            roleName: "Head of School",
            functionCategory: "school_leadership",
            employmentType: "full_time",
            fte: 1,
            annualizedRate: HEAD_OF_SCHOOL_RATE,
            benefitsEligible: true,
            benefitsRate: 25,
            payrollTaxRate: 9.95,
            payrollTaxComponents: WA_PAYROLL_COMPONENTS,
            payrollLike: true,
            notes: "",
            staffingMode: "fixed",
          },
        ],
        // The persisted `data.scenarios` array is what the Scenarios page
        // hydrates into its `scenarios` state on mount, which in turn drives
        // the picker options + the `staffingAdjustment` prop threaded into
        // `<ScenarioComparisonView>`. A non-zero adjustment is required so
        // the compare-side aggregate uses a different scaled salary than
        // the base side and the two dollar amounts must diverge.
        scenarios: [
          {
            name: SCENARIO_NAME,
            enrollmentAdjustment: 0,
            tuitionAdjustment: 0,
            expenseAdjustment: 0,
            staffingAdjustment: STAFFING_ADJUSTMENT,
            facilityAdjustment: 0,
          },
        ],
      },
    },
  });
  expect(
    createRes.ok(),
    `create model failed: ${createRes.status()} ${await createRes.text()}`,
  ).toBeTruthy();
  const { id: modelId } = (await createRes.json()) as { id: number };

  return { token, modelId, email };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

// Pulls the trailing "$<amount>/yr" out of the persona-aware sentence so
// the test can compare base vs compare amounts without re-implementing the
// engine math. The unit tests assert the exact dollar value against the
// engine; here we just need to know the two sides differ.
function extractSavings(text: string): number | null {
  const m = text.match(/\$([\d,]+)\s*\/\s*yr/i);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ""));
}

test("Scenarios page wires staffingRows + adjustments into the wage-base savings insight for both sides", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedScenarioFixture(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  // The whole comparison block is gated on a non-empty `compareRight` —
  // until the founder picks something, the view renders the picker but
  // no `<ScenarioComparisonView>`. Picking the seeded scenario via its
  // visible label is more durable than encoding the index, which is an
  // internal implementation detail of the picker.
  const compareRight = page.locator('select').filter({ hasText: "Select a scenario..." });
  await expect(compareRight).toBeVisible({ timeout: 15_000 });
  await compareRight.selectOption({ label: SCENARIO_NAME });

  // The shared insight panel is the parent — its presence proves the
  // `showBaseInsight || showCompareInsight` gate fired, which itself
  // proves `staffingRows` and (at minimum) one adjustment threaded
  // through the call site.
  const insight = page.getByTestId("scenario-comparison-cap-insight");
  await expect(insight).toBeVisible();

  const baseSide = page.getByTestId("scenario-comparison-cap-insight-base");
  const compareSide = page.getByTestId("scenario-comparison-cap-insight-compare");
  await expect(baseSide).toBeVisible();
  await expect(compareSide).toBeVisible();

  // The persona we seeded is `comfortable`, so both sides must use the
  // technical-variant copy ("Wage-base caps hit on …"). Asserting on
  // both sides catches a regression where a future refactor only feeds
  // the prop into one side.
  await expect(baseSide).toContainText(/Wage-base caps hit on/i);
  await expect(compareSide).toContainText(/Wage-base caps hit on/i);
  await expect(baseSide).toContainText("Base Model");
  await expect(compareSide).toContainText(SCENARIO_NAME);

  // The sentence template ends with "saves $X,XXX/yr". With a non-zero
  // staffingAdjustment, the two sides have to surface different dollar
  // amounts — if they're identical, either `compareStaffingAdjustment`
  // is no longer being passed to the component or the component has
  // stopped applying the staffing factor before aggregating.
  const baseText = (await baseSide.textContent()) ?? "";
  const compareText = (await compareSide.textContent()) ?? "";
  const baseSavings = extractSavings(baseText);
  const compareSavings = extractSavings(compareText);
  expect(
    baseSavings,
    `base side should surface a $X/yr savings figure, got: ${baseText}`,
  ).not.toBeNull();
  expect(
    compareSavings,
    `compare side should surface a $X/yr savings figure, got: ${compareText}`,
  ).not.toBeNull();
  // The compared scenario shrinks staffing by 10%, so the scaled salary
  // is lower and the wage-base savings (which only kick in on dollars
  // above the cap) must be strictly smaller than the base-side number.
  expect(compareSavings!).toBeLessThan(baseSavings!);
});
