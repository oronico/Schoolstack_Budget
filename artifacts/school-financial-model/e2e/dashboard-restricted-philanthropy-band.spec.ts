import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #844: end-to-end guard for the dashboard's Revenue Mix card hatched
// restricted band + "X% of fundraising is restricted" sub-line.
//
// Unit tests cover computeRevenueSourceMix's restricted accounting, but
// nothing proves <RevenueMixCard testId="dashboard-revenue-mix"> actually
// renders the restricted slice + sub-line when a founder flips the
// `revenue-row-*-restricted` checkbox in the Revenue step. Removing the
// `philanthropyBucket` branch in RevenueMixCard.tsx would silently strip
// the affordance — this spec catches that regression.

const TEST_PASSWORD = "PlaywrightTest12345!";

// Stable, non-`restricted_*` id so the checkbox defaults to unchecked.
const PHILANTHROPY_ROW_ID = "phil_annual_fund_dashboard_band_e2e";
const PHILANTHROPY_AMOUNT_PER_YEAR = 200_000;

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedModel(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-dash-restricted-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Founder",
  });
  await seedPersona(request, token);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const tuition = 14_500;
  const fivePhilanthropyAmounts = new Array(5).fill(PHILANTHROPY_AMOUNT_PER_YEAR);

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Dashboard Restricted Band Academy",
      currentStep: 4,
      data: {
        schoolProfile: {
          schoolName: "E2E Dashboard Restricted Band Academy",
          state: "MA",
          schoolType: "private_school",
          entityType: "nonprofit_501c3",
          schoolStage: "operating_school",
          fundingProfile: "tuition_based",
          operatingYear: "second_year_plus",
          openingYear: 2022,
          fiscalYearStartMonth: 7,
          currentStudents: 80,
          longTermEnrollmentGoal: 120,
          maxCapacity: 150,
          isPartialFirstYear: false,
          year1OperatingMonths: 12,
        },
        enrollment: { year1: 80, year2: 85, year3: 90, year4: 95, year5: 100 },
        revenueSources: {
          tuition: true,
          publicFunding: false,
          schoolChoice: false,
          philanthropy: true,
        },
        revenueRows: [
          {
            id: "tuition_base",
            lineItem: "Tuition",
            category: "tuition_and_fees",
            enabled: true,
            driverType: "per_student",
            amounts: new Array(5).fill(tuition),
          },
          {
            id: PHILANTHROPY_ROW_ID,
            lineItem: "Annual fund",
            category: "philanthropy",
            enabled: true,
            driverType: "annual_fixed",
            amounts: fivePhilanthropyAmounts,
          },
        ],
        staffingRows: [
          {
            id: "lead_teacher_1",
            roleName: "Lead Teacher",
            functionCategory: "instructional",
            employmentType: "full_time",
            staffingMode: "fixed",
            fte: 4,
            annualizedRate: 55_000,
            benefitsEligible: true,
            benefitsRate: 18,
            payrollTaxRate: 8,
            payrollLike: true,
          },
        ],
        expenseRows: [
          {
            id: "ops_admin_e2e",
            category: "operations",
            lineItem: "General operations",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [400_000, 410_000, 420_000, 430_000, 440_000],
          },
        ],
        openingBalances: { cash: 100_000 },
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
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

async function gotoRevenueStep(page: Page, modelId: number): Promise<void> {
  await page.goto(`/model/${modelId}?step=4`);
  await expect(
    page
      .getByRole("heading", {
        name: /Where Does Your Money Come From|Revenue by Source/i,
      })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}

async function ensureRestrictedCheckboxVisible(page: Page) {
  const checkbox = page.getByTestId(
    `revenue-row-${PHILANTHROPY_ROW_ID}-restricted`,
  );
  if (!(await checkbox.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /Philanthropy/i })
      .first()
      .click()
      .catch(() => undefined);
  }
  await expect(checkbox).toBeVisible({ timeout: 15_000 });
  return checkbox;
}

test("dashboard revenue mix renders the restricted philanthropy band when toggled", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedModel(request);
  await primeAuthToken(page, token);

  // ---- Baseline: dashboard before the toggle is flipped ----
  // The seeded row defaults to unchecked, so the restricted slice + sub-line
  // must NOT render yet.
  await page.goto("/dashboard");
  const card = page.getByTestId("dashboard-revenue-mix");
  await expect(card).toBeVisible({ timeout: 30_000 });
  // The unrestricted (full) philanthropy segment should be present.
  await expect(
    card.getByTestId("dashboard-revenue-mix-y1-segment-fundraising"),
  ).toBeVisible();
  // Restricted slice + percent sub-line must be absent at baseline.
  await expect(
    card.getByTestId(
      "dashboard-revenue-mix-y1-segment-fundraising-restricted",
    ),
  ).toHaveCount(0);
  await expect(
    card.getByTestId("dashboard-revenue-mix-philanthropy-restricted-pct"),
  ).toHaveCount(0);

  // ---- Flip the restricted toggle on the Revenue step ----
  await gotoRevenueStep(page, modelId);
  const checkbox = await ensureRestrictedCheckboxVisible(page);
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  // Let the wizard's debounced auto-save flush.
  await page.waitForTimeout(2_000);

  // ---- Dashboard now renders the hatched restricted slice + sub-line ----
  await page.goto("/dashboard");
  const cardAfter = page.getByTestId("dashboard-revenue-mix");
  await expect(cardAfter).toBeVisible({ timeout: 30_000 });
  await expect(
    cardAfter.getByTestId(
      "dashboard-revenue-mix-y1-segment-fundraising-restricted",
    ),
  ).toBeVisible();
  const pctSubline = cardAfter.getByTestId(
    "dashboard-revenue-mix-philanthropy-restricted-pct",
  );
  await expect(pctSubline).toBeVisible();
  // 100% of philanthropy is restricted in our seed (the only philanthropy
  // row is toggled on), so the sub-line should read "100%".
  await expect(pctSubline).toHaveText(/100%/);

  // ---- Untoggle: restricted slice + sub-line should disappear again ----
  await gotoRevenueStep(page, modelId);
  const checkboxAgain = await ensureRestrictedCheckboxVisible(page);
  await expect(checkboxAgain).toBeChecked();
  await checkboxAgain.uncheck();
  await expect(checkboxAgain).not.toBeChecked();
  await page.waitForTimeout(2_000);

  await page.goto("/dashboard");
  const cardCleared = page.getByTestId("dashboard-revenue-mix");
  await expect(cardCleared).toBeVisible({ timeout: 30_000 });
  await expect(
    cardCleared.getByTestId(
      "dashboard-revenue-mix-y1-segment-fundraising-restricted",
    ),
  ).toHaveCount(0);
  await expect(
    cardCleared.getByTestId(
      "dashboard-revenue-mix-philanthropy-restricted-pct",
    ),
  ).toHaveCount(0);
});
