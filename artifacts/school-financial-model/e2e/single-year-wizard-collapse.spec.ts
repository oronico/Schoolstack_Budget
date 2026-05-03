import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "./utils/test";

// Task #462: regression smoke for the single-year wizard data-entry collapse.
//
// The deep collapse shipped in an earlier session is driven by `useYearCount()`
// which returns 1 when `schoolProfile.modelDuration === "single_year"` and 5
// otherwise. That hook is threaded into 5 step files (Enrollment, Revenue,
// Staffing, Expense, Review). Today's `wizard-smoke-six-paths.spec.ts` only
// covers 5-year smokes, so a future refactor could silently regress one of
// the steps back to 5-column rendering and the suite would not catch it.
//
// This test boots a single-year model via the API, then visits each of the
// 5 collapsed steps and asserts:
//   - No element with exact text "Y2", "Y3", "Y4", or "Y5" is visible
//     (those are the per-column labels Revenue / Staffing / Expense use).
//   - No element with exact text "Year 2", "Year 3", "Year 4", or "Year 5"
//     is visible (Review's enrollment grid uses these per-column labels).
//   - Where the step renders a Y1 column header at all, exactly one such
//     header is present.
//
// The exact-text assertions are deliberate: body copy like "...growing to
// 90 by Year 5" wraps a longer string and won't match `^Year 5$`, so this
// test only fires on real column-header / input-grid regressions.

const TEST_PASSWORD = "PlaywrightTest12345!";

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Single-year seed model. Mirrors the buildSeedModel in
// wizard-smoke-six-paths.spec.ts but with `modelDuration: "single_year"`
// and Y2-Y5 enrollment intentionally zeroed so the Y1-only collapse is
// exercised end-to-end (no leftover ramp data to fall back on).
function buildSingleYearSeed(): Record<string, unknown> {
  const baseEnrollment = 60;
  const tuition = 14000;

  const enrollment = {
    year1: baseEnrollment,
    year2: 0,
    year3: 0,
    year4: 0,
    year5: 0,
  };

  const schoolProfile: Record<string, unknown> = {
    schoolName: "E2E Single-Year Academy",
    state: "CA",
    schoolType: "private_school",
    entityType: "nonprofit_501c3",
    schoolStage: "new_school",
    fundingProfile: "tuition_based",
    plannedOpeningYear: "2027",
    openingYear: 2027,
    currentStudents: 0,
    longTermEnrollmentGoal: baseEnrollment,
    maxCapacity: Math.round(baseEnrollment * 1.25),
    fiscalYearStartMonth: 7,
    isPartialFirstYear: false,
    year1OperatingMonths: 12,
    isAccredited: false,
    locationSecured: false,
    ownershipType: "rent",
    monthlyRent: 9000,
    annualRentEscalation: 3,
    postLeaseRenewalBump: 15,
    isNNNLease: false,
    nnnCamCharges: 0,
    nnnMaintenance: 0,
    nnnUtilities: 0,
    propertyTaxAnnual: 0,
    hasMortgage: false,
    mortgageMonthlyPayment: 0,
    estimatedMonthlyFacilityBudget: 0,
    hasBookkeeper: true,
    bookkeeperMonthlyCost: 800,
    hasLawyer: false,
    lawyerMonthlyCost: 0,
    hasGeneralLiabilityInsurance: true,
    insuranceCost: 600,
    hasLocalBusinessLicense: false,
    localBusinessLicenseAnnualCost: 0,
    hasSavingsAccount: true,
    hasBusinessAccount: true,
    hasCreditCard: true,
    hasLoan: false,
    loanAmount: 0,
    loanRate: 0,
    loanTermYears: 0,
    lendingLabIntent: "budget_only",
    debtIncluded: false,
    accountingBasis: "accrual",
    gradeBandEnrollment: {
      k5: [baseEnrollment, 0, 0, 0, 0],
      m68: [0, 0, 0, 0, 0],
      h912: [0, 0, 0, 0, 0],
    },
    gradeBandPerPupil: { k5: tuition, m68: 0, h912: 0 },
    sameTuitionForAllBands: true,
    // The contract under test: this flag must collapse the wizard to 1 column.
    modelDuration: "single_year",
  };

  const programs = [
    {
      id: makeId("prog"),
      name: "General Enrollment",
      annualTuition: tuition,
      priorYear: 0,
      currentYear: 0,
      year1: baseEnrollment,
      year2: 0,
      year3: 0,
      year4: 0,
      year5: 0,
    },
  ];

  const revenueRows: Array<Record<string, unknown>> = [
    {
      id: makeId("rev"),
      category: "tuition_and_fees",
      lineItem: "Tuition",
      enabled: true,
      driverType: "per_student",
      amounts: [tuition, 0, 0, 0, 0],
    },
    {
      id: makeId("rev"),
      category: "philanthropy",
      lineItem: "Annual fund",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [25000, 0, 0, 0, 0],
    },
  ];

  // One ratio-mode row so the StaffingStep's per-year FTE column grid
  // actually renders (it is gated by `isRatio` — fixed-mode rows never
  // show Y-columns at all, which would make the Y2-absent assertion
  // trivially pass even in 5-year mode).
  const staffingRows: Array<Record<string, unknown>> = [
    {
      id: makeId("staff"),
      roleName: "Lead Teacher",
      functionCategory: "instructional",
      employmentType: "full_time",
      fte: 4,
      annualizedRate: 55000,
      benefitsEligible: true,
      benefitsRate: 18,
      payrollTaxRate: 8,
      payrollLike: true,
      notes: "",
      staffingMode: "ratio",
      studentsPerStaff: 15,
      startYear: 1,
      endYear: 5,
    },
    {
      id: makeId("staff"),
      roleName: "School Leader",
      functionCategory: "school_leadership",
      employmentType: "full_time",
      fte: 1,
      annualizedRate: 95000,
      benefitsEligible: true,
      benefitsRate: 18,
      payrollTaxRate: 8,
      payrollLike: true,
      notes: "",
      staffingMode: "fixed",
    },
  ];

  const expenseRows: Array<Record<string, unknown>> = [
    {
      id: makeId("exp"),
      category: "facility",
      lineItem: "Rent",
      enabled: true,
      driverType: "monthly",
      amounts: [108000, 0, 0, 0, 0],
    },
    {
      id: makeId("exp"),
      category: "instructional",
      lineItem: "Curriculum & supplies",
      enabled: true,
      driverType: "per_student",
      amounts: [350, 0, 0, 0, 0],
    },
  ];

  return {
    name: "E2E Single-Year Academy",
    currentStep: 1,
    data: {
      schoolProfile,
      enrollment,
      programs,
      revenue: {
        tuitionPerStudent: tuition,
        annualTuitionIncrease: 3,
        publicFundingPerStudent: 0,
        otherRevenuePerStudent: 0,
        scholarshipRate: 0,
        annualDonations: 0,
        foundationGrants: 0,
        capitalGifts: 0,
      },
      revenueRows,
      revenueDefaults: {
        billingMonths: 10,
        collectionMethod: "autopay",
        collectionRate: 100,
        collectionDelayDays: 0,
      },
      staffing: {
        studentsPerTeacher: 15,
        teacherSalary: 55000,
        adminStaffCount: 1,
        adminSalary: 65000,
        founderSalary: 0,
        offersBenefits: true,
        benefitsRate: 18,
        payrollTaxRate: 8,
      },
      staffingRows,
      facilities: {
        monthlyRent: 9000,
        annualRentIncrease: 3,
        annualUtilities: 24000,
        annualInsurance: 12000,
        annualSalaryIncrease: 3,
        generalCostInflation: 3,
      },
      expenseRows,
      capitalAndDebtRows: [],
      assumptionFlagResponses: [],
    },
  };
}

async function registerAndSeed(
  request: APIRequestContext,
): Promise<{ token: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-single-year-${stamp}@e2e.schoolstack.test`;

  const backoffsMs = [2000, 5000, 10000, 20000, 30000];
  let registerRes = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
  });
  for (const wait of backoffsMs) {
    if (registerRes.status() !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
    registerRes = await request.post("/api/auth/register", {
      data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
    });
  }
  expect(
    registerRes.ok(),
    `register failed: ${registerRes.status()} ${await registerRes.text()}`,
  ).toBeTruthy();
  const { token } = (await registerRes.json()) as { token: string };
  await seedPersona(request, token);
  const guidanceRes = await request.patch("/api/auth/guidance-level", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { guidanceLevel: "basics" },
  });
  expect(
    guidanceRes.ok(),
    `guidance failed: ${guidanceRes.status()} ${await guidanceRes.text()}`,
  ).toBeTruthy();
  return { token };
}

async function createModel(
  request: APIRequestContext,
  token: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const res = await request.post("/api/models", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: payload,
  });
  expect(
    res.ok(),
    `create model failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  const { id } = (await res.json()) as { id: number };
  return id;
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

async function dismissOnboardingOverlays(page: Page): Promise<void> {
  const introBtn = page.getByRole("button", { name: /Let.?s get started/i });
  try {
    await introBtn.click({ timeout: 8000 });
  } catch {
    /* dialog never appeared */
  }
  const cookieDecline = page.getByRole("button", { name: /^Decline$/ });
  try {
    await cookieDecline.click({ timeout: 3000 });
  } catch {
    /* banner never appeared */
  }
}

// Click the step-rail button for a given numeric step id and wait for the
// step's heading to appear. Mirrors the navigation pattern in
// chesterton-wizard-data-entry.spec.ts.
async function gotoStep(
  page: Page,
  stepId: number,
  heading: RegExp,
): Promise<void> {
  await page
    .getByRole("button", { name: String(stepId), exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: heading }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

// Assert no per-column "Y2"/"Y3"/"Y4"/"Y5" labels are rendered. Uses
// exact-text match so body copy like "...by Year 5" or "Y1 salaries: ..."
// (where Y2 etc. would be embedded in a longer span) does not produce
// false positives — only true column-header / input-grid labels match.
async function expectNoYearTwoThroughFiveColumns(page: Page): Promise<void> {
  for (const label of ["Y2", "Y3", "Y4", "Y5"]) {
    await expect(
      page.getByText(label, { exact: true }),
      `expected no "${label}" column label in single-year mode`,
    ).toHaveCount(0);
  }
  for (const label of ["Year 2", "Year 3", "Year 4", "Year 5"]) {
    await expect(
      page.getByText(label, { exact: true }),
      `expected no "${label}" column label in single-year mode`,
    ).toHaveCount(0);
  }
}

test("single-year wizard collapses every data-entry step to one Y1 column", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token } = await registerAndSeed(request);
  const modelId = await createModel(request, token, buildSingleYearSeed());
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);
  await dismissOnboardingOverlays(page);

  // ----- Step 3: Enrollment -----
  // Programs table column headers are calendar years (e.g. "2027-28") for
  // future years, so the only meaningful regression signal here is the
  // absence of the per-year "Year N" / "YN" labels other steps share.
  await gotoStep(page, 3, /Programs\s*&\s*Enrollment/i);
  await expectNoYearTwoThroughFiveColumns(page);

  // ----- Step 4: Revenue -----
  // Each revenue row card renders a `Y${i+1}` header per visible year. In
  // single-year mode that grid must collapse to a single Y1 column.
  await gotoStep(page, 4, /Revenue by Source|Where Does Your Money Come From/i);
  await expectNoYearTwoThroughFiveColumns(page);
  await expect(
    page.getByText("Y1", { exact: true }).first(),
    "expected at least one Y1 column header on Revenue step",
  ).toBeVisible();

  // ----- Step 5: Staffing -----
  // Ratio-mode staffing rows render a `Y${yi+1}` header per visible year.
  // The seed includes one ratio row so this column grid is exercised.
  await gotoStep(page, 5, /Tell Us About Your Leadership and Staff/i);
  await expectNoYearTwoThroughFiveColumns(page);
  await expect(
    page.getByText("Y1", { exact: true }).first(),
    "expected at least one Y1 column header on Staffing step",
  ).toBeVisible();

  // ----- Step 6: Expenses -----
  // ExpenseStep builds `yearLabels = ["Y1", ...]` from yearCount and
  // threads it into every line-item card column header.
  await gotoStep(
    page,
    6,
    /Expenses\s*&\s*Operations|What Does Your School Spend On/i,
  );
  await expectNoYearTwoThroughFiveColumns(page);
  await expect(
    page.getByText("Y1", { exact: true }).first(),
    "expected at least one Y1 column header on Expense step",
  ).toBeVisible();

  // ----- Step 9: Review -----
  // Review's Enrollment section maps `["year1"..."year5"].slice(0, yearCount)`
  // to `<p>Year {i+1}</p>` cards. Single-year mode must render only "Year 1".
  await gotoStep(page, 9, /Does Everything Look Right/i);
  await expectNoYearTwoThroughFiveColumns(page);
  await expect(
    page.getByText("Year 1", { exact: true }).first(),
    "expected the Year 1 enrollment card on Review step",
  ).toBeVisible();
});
