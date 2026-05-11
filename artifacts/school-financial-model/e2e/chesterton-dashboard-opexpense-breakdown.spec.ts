import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #826: end-to-end coverage for the operating-expense breakdown the
// Chesterton dashboard renders on the Export step. Component-level tests
// in `chesterton/__tests__/ChestertonDashboard.test.tsx` verify the
// toggle behavior and that the three subrows render in isolation, but
// none of them prove the dashboard is still wired into real wizard
// state on the Export step. This spec walks the full chesterton_academy
// branch:
//
//   1. Seed a Chesterton model with the standard CSN defaults.
//   2. Jump to step 15 (Export) where ChestertonDashboard renders.
//   3. Click the Total Operating Expense toggle.
//   4. Confirm the Faculty / Admin Salaries / G&A subrows appear with
//      non-empty currency values for Year 1+.
//
// The seed payload + helpers are intentionally duplicated from the
// other chesterton specs. Each chesterton spec is a self-contained
// regression contract for one slice of the branch (rendering, data
// entry, summaries, dashboard breakdown); sharing helpers across them
// would couple unrelated regressions to one file.

const TEST_PASSWORD = "PlaywrightTest12345!";

// Chesterton template defaults (kept in sync with
// artifacts/school-financial-model/src/lib/chesterton/template.ts).
function chestertonSeedBlock(): Record<string, unknown> {
  const totalFundraisingGoal = 100000 + 132500 + 91250 + 13125 + 50000;
  return {
    planningYear: new Date().getFullYear() + 1,
    startingTuition: 8500,
    tuitionGrowthRate: 0.04,
    bookSupplyFee: 600,
    financialAidPct: 0.10,
    startingTeacherSalary: 44000,
    benefitsFirstYearAmount: 0,
    attritionRate: 0.10,
    totalFundraisingGoal,
    phaseEnrollment: [
      { grade: "freshman",  year0: 15, year1: 15, year2: 20, year3: 21, year4: 22, year5: 22 },
      { grade: "sophomore", year0: 0,  year1: 15, year2: 15, year3: 20, year4: 20, year5: 22 },
      { grade: "junior",    year0: 0,  year1: 0,  year2: 13, year3: 14, year4: 18, year5: 20 },
      { grade: "senior",    year0: 0,  year1: 0,  year2: 0,  year3: 12, year4: 13, year5: 18 },
    ],
    classesPerGrade: [1, 1, 1, 2, 2, 2],
    salarySchedule: [
      { id: "subj-literature",  subject: "Literature",         periodsPerSection: 5 },
      { id: "subj-mathematics", subject: "Mathematics",        periodsPerSection: 5 },
      { id: "subj-theology",    subject: "Theology",           periodsPerSection: 5 },
      { id: "subj-latin",       subject: "Latin",              periodsPerSection: 5 },
      { id: "subj-science",     subject: "Science",            periodsPerSection: 5 },
      { id: "subj-history",     subject: "History",            periodsPerSection: 5 },
      { id: "subj-arts",        subject: "Arts & Music",       periodsPerSection: 3 },
      { id: "subj-pe",          subject: "Physical Education", periodsPerSection: 2 },
    ],
    fundraisingGoals: [
      { id: "fund-major",  category: "Major Gifts ($25,000+)",            goalAmount: 100000, numberOfGifts: 3,   averageGift: 33333 },
      { id: "fund-mid",    category: "Mid-Major Gifts ($5,000–$25,000)", goalAmount: 132500, numberOfGifts: 27,  averageGift: 4907 },
      { id: "fund-annual", category: "Annual Fund ($500–$5,000)",        goalAmount: 91250,  numberOfGifts: 165, averageGift: 553 },
      { id: "fund-grass",  category: "Grassroots (under $500)",           goalAmount: 13125,  numberOfGifts: 225, averageGift: 58 },
      { id: "fund-events", category: "Events",                            goalAmount: 50000,  numberOfGifts: 0,   averageGift: 0 },
    ],
    giftChart: [
      { id: "gift-50000", giftAmount: 50000, numberOfGifts: 1,   numberOfProspects: 5   },
      { id: "gift-25000", giftAmount: 25000, numberOfGifts: 2,   numberOfProspects: 5   },
      { id: "gift-10000", giftAmount: 10000, numberOfGifts: 8,   numberOfProspects: 20  },
      { id: "gift-5000",  giftAmount: 5000,  numberOfGifts: 12,  numberOfProspects: 25  },
      { id: "gift-1000",  giftAmount: 1000,  numberOfGifts: 15,  numberOfProspects: 30  },
      { id: "gift-100",   giftAmount: 100,   numberOfGifts: 100, numberOfProspects: 150 },
    ],
    recruitingPipeline: [
      { id: "rec-siblings",   source: "Siblings of current students", prospectiveStudents: 30 },
      { id: "rec-feeder",     source: "Feeder school graduates",      prospectiveStudents: 30 },
      { id: "rec-homeschool", source: "Homeschool students",          prospectiveStudents: 30 },
    ],
    prospectiveFacilities: [
      { id: "fac-1", name: "Phase I (Year 0–1)", capacity: 70,  location: "TBD" },
    ],
    priestlyOutreach: [
      { id: "priest-1", name: "Father TBD", affiliation: "Parish Name" },
    ],
    keyInfluencers: [
      { id: "inf-1", name: "First Last", affiliation: "Role" },
    ],
  };
}

function buildChestertonSeedModel(): Record<string, unknown> {
  return {
    name: "E2E Chesterton OpExpense Breakdown",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "E2E Chesterton OpExpense Breakdown",
        state: "VA",
        schoolType: "chesterton_academy",
        entityType: "nonprofit_501c3",
        schoolStage: "new_school",
        plannedOpeningYear: "2027",
        openingYear: 2027,
        currentStudents: 0,
        longTermEnrollmentGoal: 120,
        maxCapacity: 150,
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        ownershipType: "rent",
        monthlyRent: 8000,
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
        accountingBasis: "accrual",
      },
      enrollment: { year1: 30, year2: 45, year3: 60, year4: 75, year5: 90 },
      programs: [
        {
          id: "prog-csn-classical",
          name: "Classical Liberal Arts (9–12)",
          annualTuition: 8500,
          priorYear: 0,
          currentYear: 0,
          year1: 30, year2: 45, year3: 60, year4: 75, year5: 90,
        },
      ],
      revenueRows: [
        {
          id: "rev-tuition",
          category: "tuition_and_fees",
          lineItem: "Tuition",
          enabled: true,
          driverType: "per_student",
          amounts: [8500, 8755, 9018, 9288, 9567],
        },
      ],
      staffingRows: [
        {
          id: "staff-head",
          roleName: "Headmaster",
          functionCategory: "school_leadership",
          employmentType: "full_time",
          fte: 1, annualizedRate: 75000,
          benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 8,
          payrollLike: true, notes: "", staffingMode: "fixed",
        },
      ],
      expenseRows: [
        {
          id: "exp-rent",
          category: "facility",
          lineItem: "Rent",
          enabled: true,
          driverType: "monthly",
          amounts: [96000, 0, 0, 0, 0],
        },
      ],
      chesterton: chestertonSeedBlock(),
    },
  };
}

async function registerAndSeed(request: APIRequestContext): Promise<{ token: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-chesterton-opexpense-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });
  await seedPersona(request, token);
  const guidanceRes = await request.patch("/api/auth/guidance-level", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
    // dialog never appeared — proceed
  }
  const cookieDecline = page.getByRole("button", { name: /^Decline$/ });
  try {
    await cookieDecline.click({ timeout: 3000 });
  } catch {
    // banner never appeared — proceed
  }
}

// formatCurrency renders en-US USD with no fraction digits, e.g. "$340,000".
// "Non-empty currency value" for this spec means: starts with "$" and
// contains at least one non-zero digit (so "$0" alone fails the check).
const NON_ZERO_CURRENCY = /^\$[\d,]*[1-9][\d,]*$/;

test("Chesterton dashboard's Total Operating Expense breakdown reveals Faculty / Admin Salaries / G&A subtotals", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token } = await registerAndSeed(request);
  const modelId = await createModel(request, token, buildChestertonSeedModel());
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);
  await dismissOnboardingOverlays(page);

  // Chesterton step rail: 1 Story · 2 School · 3 Enrollment · 4 Revenue ·
  // 5 Staffing · 6 Fundraising · 7 Gift Chart · 8 Recruiting · ... · 15 Export.
  await page.getByRole("button", { name: "15", exact: true }).first().click();
  await expect(
    page.getByRole("heading", {
      name: /Your reports are ready|Ready to export your model/i,
    }),
  ).toBeVisible({ timeout: 15_000 });

  const dashboard = page.getByTestId("chesterton-dashboard");
  await expect(dashboard).toBeVisible({ timeout: 15_000 });

  // Total Operating Expense row is always present; the three subrows
  // should NOT render until the toggle is clicked.
  await expect(
    page.getByTestId("chesterton-dashboard-row-operatingExpense"),
  ).toBeVisible();
  await expect(
    page.getByTestId("chesterton-dashboard-row-facultyCost"),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("chesterton-dashboard-row-adminSalaries"),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("chesterton-dashboard-row-generalAdmin"),
  ).toHaveCount(0);

  const toggle = page.getByTestId("chesterton-dashboard-opexpense-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  // All three subrows now render.
  await expect(
    page.getByTestId("chesterton-dashboard-row-facultyCost"),
  ).toBeVisible();
  await expect(
    page.getByTestId("chesterton-dashboard-row-adminSalaries"),
  ).toBeVisible();
  await expect(
    page.getByTestId("chesterton-dashboard-row-generalAdmin"),
  ).toBeVisible();

  // Year 1+ cells render non-empty currency values for each subtotal.
  // The CSN model always populates these in Year 1 (faculty is driven by
  // seeded subjects + enrollment, admin salaries default to the CSN
  // recommended Y1 ladder ≈ $340k, and G&A is per-student × enrollment).
  // Asserting Year 1 + Year 5 keeps the contract that the breakdown
  // stays wired across the projection horizon.
  for (const yearIndex of [1, 5]) {
    for (const key of ["facultyCost", "adminSalaries", "generalAdmin"] as const) {
      const cell = page.getByTestId(
        `chesterton-dashboard-cell-${key}-yr-${yearIndex}`,
      );
      await expect(cell).toBeVisible();
      await expect(cell).toHaveText(NON_ZERO_CURRENCY);
    }
  }

  // Toggling again collapses the breakdown — guards against regressions
  // where the toggle becomes one-way after it gets re-wired to wizard state.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByTestId("chesterton-dashboard-row-facultyCost"),
  ).toHaveCount(0);
});
