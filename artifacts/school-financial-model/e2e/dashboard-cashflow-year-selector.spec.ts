import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #661 — end-to-end coverage for the dashboard cash-flow year selector
// added in #648. The Year 1-5 tabs in the Financial Snapshot's monthly cash
// flow chart switch the chart heading, the lowest-cash callout text, and
// the underlying chart data. We seed a model where Y1-Y3 have non-zero
// revenue/expenses and Y4-Y5 are empty so the test can also assert that the
// empty years' tabs are disabled (not clickable).

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedFounderWithMultiYearModel(
  request: APIRequestContext,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-cashflow-year-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Founder",
  });
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // Pre-set the guidance level so the dashboard's "Choose your guidance
  // level" modal doesn't intercept clicks on the year selector tabs.
  const guidanceRes = await request.patch("/api/auth/guidance-level", {
    headers: { ...authHeaders, "Content-Type": "application/json" },
    data: { guidanceLevel: "basics" },
  });
  expect(
    guidanceRes.ok(),
    `set guidance level failed: ${guidanceRes.status()} ${await guidanceRes.text()}`,
  ).toBeTruthy();

  // Seed Y1-Y3 with non-zero revenue and expenses; leave Y4-Y5 at zero so
  // the year selector renders the disabled state for those tabs.
  const createRes = await request.post("/api/models", {
    headers: { ...authHeaders, "Content-Type": "application/json" },
    data: {
      name: "E2E Cashflow Year Selector Academy",
      currentStep: 1,
      data: {
        schoolProfile: {
          schoolName: "E2E Cashflow Year Selector Academy",
          state: "MA",
          schoolType: "private_school",
          entityType: "nonprofit_501c3",
          schoolStage: "new_school",
          fundingProfile: "tuition_based",
          modelDuration: "five_year",
          plannedOpeningYear: "2027",
          openingYear: 2027,
          currentStudents: 0,
          longTermEnrollmentGoal: 120,
          maxCapacity: 150,
          fiscalYearStartMonth: 7,
          ownershipType: "rent",
          monthlyRent: 8000,
          accountingBasis: "accrual",
          operatingMonthsPerYear: 12,
        },
        enrollment: { year1: 60, year2: 70, year3: 80, year4: 0, year5: 0 },
        programs: [
          {
            id: "prog-cfy-1",
            name: "Cashflow Year Demo Program",
            annualTuition: 10000,
            year1: 60,
            year2: 70,
            year3: 80,
            year4: 0,
            year5: 0,
          },
        ],
        revenueRows: [
          {
            id: "rev-cfy-1",
            category: "tuition_and_fees",
            lineItem: "Cashflow Year Demo Tuition",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [600000, 700000, 800000, 0, 0],
            note: "",
          },
        ],
        staffingRows: [],
        expenseRows: [
          {
            id: "exp-cfy-1",
            category: "instructional_program",
            lineItem: "Cashflow Year Demo Salaries",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [400000, 450000, 500000, 0, 0],
            note: "",
          },
        ],
        capitalAndDebtRows: [],
        assumptionFlagResponses: [],
        openingBalances: { cash: 50000 },
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

test("dashboard cash-flow year selector switches chart, callout, and disables empty years", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  const { token } = await seedFounderWithMultiYearModel(request);
  await primeAuthToken(page, token);

  await page.goto("/dashboard");

  const snapshot = page.getByTestId("dashboard-financial-snapshot");
  await expect(snapshot).toBeVisible();

  const chart = page.getByTestId("dashboard-monthly-cashflow-chart");
  await expect(chart).toBeVisible();

  const selector = page.getByTestId("dashboard-cashflow-year-selector");
  await expect(selector).toBeVisible();

  const callout = page.getByTestId("dashboard-lowest-cash-callout");
  await expect(callout).toBeVisible();

  // Default selection is Year 1 — heading + callout reflect that.
  await expect(chart.getByRole("heading")).toContainText("Year 1 monthly cash flow");
  await expect(callout).toContainText("Lowest cash month (Year 1):");

  // Click each enabled tab (Years 1-3) and assert the heading + callout
  // update to the new year label.
  for (const yi of [1, 2, 3] as const) {
    const tab = page.getByTestId(`dashboard-cashflow-year-${yi}`);
    await expect(tab).toBeEnabled();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(chart.getByRole("heading")).toContainText(
      `Year ${yi} monthly cash flow`,
    );
    await expect(callout).toContainText(`Lowest cash month (Year ${yi}):`);
  }

  // Years 4 and 5 have no revenue/expense data, so their tabs render in
  // the disabled state. Assert both that the disabled attribute is set
  // and that clicking is a no-op (the previously-active Year 3 tab stays
  // selected).
  const year3Tab = page.getByTestId("dashboard-cashflow-year-3");
  await expect(year3Tab).toHaveAttribute("aria-selected", "true");

  for (const yi of [4, 5] as const) {
    const tab = page.getByTestId(`dashboard-cashflow-year-${yi}`);
    await expect(tab).toBeDisabled();
    await tab.click({ force: true }).catch(() => {
      /* disabled buttons reject pointer events — that's the contract */
    });
    await expect(tab).toHaveAttribute("aria-selected", "false");
  }

  // After the no-op clicks the heading + callout still reflect Year 3.
  await expect(year3Tab).toHaveAttribute("aria-selected", "true");
  await expect(chart.getByRole("heading")).toContainText("Year 3 monthly cash flow");
  await expect(callout).toContainText("Lowest cash month (Year 3):");
});
