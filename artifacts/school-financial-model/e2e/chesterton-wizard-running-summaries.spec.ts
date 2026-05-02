import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "./utils/test";

// Task #337: end-to-end coverage for the three running summaries the
// Chesterton wizard renders on steps 6 (Fundraising), 7 (Gift Chart),
// and 8 (Recruiting). Component-level tests in
// `chesterton/__tests__/chesterton-summaries.test.tsx` already cover the
// math in isolation, and `chesterton-wizard-data-entry.spec.ts` proves
// row edits persist into the workbook. What was missing was a Playwright
// spec that walks the chesterton_academy wizard path in a real browser
// and asserts each summary panel updates LIVE — without navigating
// away — as the founder edits a row.
//
// The seed payload + helpers are intentionally duplicated from the
// other chesterton specs. Each chesterton spec is a self-contained
// regression contract for one slice of the branch (rendering, data
// entry, summaries); sharing helpers across them would couple
// unrelated regressions to one file.

const TEST_PASSWORD = "PlaywrightTest12345!";

// Chesterton template defaults (kept in sync with
// artifacts/school-financial-model/src/lib/chesterton/template.ts).
function chestertonSeedBlock(): Record<string, unknown> {
  // Sum of fundraising goalAmounts in the seed below — keep this
  // expression so the assertion math stays obvious.
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
    // Year 1 enrollment goal = freshman.year1 + sophomore.year1 = 30.
    // The recruiting summary uses this as the denominator for coverage %.
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
    ],
    // Fundraising row 0 starts at 100,000. Editing it changes the
    // "Committed so far" running total live.
    fundraisingGoals: [
      { id: "fund-major",  category: "Major Gifts ($25,000+)",            goalAmount: 100000, numberOfGifts: 3,   averageGift: 33333 },
      { id: "fund-mid",    category: "Mid-Major Gifts ($5,000–$25,000)", goalAmount: 132500, numberOfGifts: 27,  averageGift: 4907 },
      { id: "fund-annual", category: "Annual Fund ($500–$5,000)",        goalAmount: 91250,  numberOfGifts: 165, averageGift: 553 },
      { id: "fund-grass",  category: "Grassroots (under $500)",           goalAmount: 13125,  numberOfGifts: 225, averageGift: 58 },
      { id: "fund-events", category: "Events",                            goalAmount: 50000,  numberOfGifts: 0,   averageGift: 0 },
    ],
    // Gift chart row 0 starts at 1 gift × $50,000 = $50,000 raised.
    // Editing the # Gifts cell changes the pyramid total → coverage %.
    giftChart: [
      { id: "gift-50000", giftAmount: 50000, numberOfGifts: 1,   numberOfProspects: 5   },
      { id: "gift-25000", giftAmount: 25000, numberOfGifts: 2,   numberOfProspects: 5   },
      { id: "gift-10000", giftAmount: 10000, numberOfGifts: 8,   numberOfProspects: 20  },
      { id: "gift-5000",  giftAmount: 5000,  numberOfGifts: 12,  numberOfProspects: 25  },
      { id: "gift-1000",  giftAmount: 1000,  numberOfGifts: 15,  numberOfProspects: 30  },
      { id: "gift-100",   giftAmount: 100,   numberOfGifts: 100, numberOfProspects: 150 },
    ],
    // Recruiting row 0 starts at 0 prospects. Editing it drives the
    // Total prospects, Projected enrollment, and Coverage of Year 1 goal.
    recruitingPipeline: [
      { id: "rec-siblings",   source: "Siblings of current students", prospectiveStudents: 0 },
      { id: "rec-feeder",     source: "Feeder school graduates",      prospectiveStudents: 0 },
      { id: "rec-homeschool", source: "Homeschool students",          prospectiveStudents: 0 },
    ],
    // CSN rule of thumb is 1-in-3; pin it explicitly so the test math
    // does not silently break if the schema default ever changes.
    prospectConversionDivisor: 3,
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
    name: "E2E Chesterton Running Summaries",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "E2E Chesterton Running Summaries",
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
  const email = `playwright-chesterton-summaries-${stamp}@e2e.schoolstack.test`;

  // Same per-IP rate-limit backoff as the other chesterton specs.
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

// react-hook-form input IDs are dotted (e.g.
// `chesterton.fundraisingGoals.0.goalAmount`). CSS needs each dot escaped
// with two backslashes inside a JS string literal. Helper keeps the quirk
// in one place.
function fieldLocator(page: Page, name: string) {
  const escaped = name.replace(/\./g, "\\.");
  return page.locator(`#${escaped}`);
}

test("Chesterton wizard's three running summaries update live as the founder edits rows", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token } = await registerAndSeed(request);
  const modelId = await createModel(request, token, buildChestertonSeedModel());
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);
  await dismissOnboardingOverlays(page);

  // ----- 1. Step 6 (Fundraising) — "Committed so far" updates live. -----
  // Chesterton step rail order: 1 Story · 2 School · 3 Enrollment ·
  // 4 Revenue · 5 Staffing · 6 Fundraising · 7 Gift Chart · 8 Recruiting ·
  // ... · 15 Export.
  await page.getByRole("button", { name: "6", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-fundraising-step")).toBeVisible({
    timeout: 15_000,
  });

  // Seeded sum of goalAmounts = 100k + 132.5k + 91.25k + 13.125k + 50k =
  // $386,875, which is exactly the Total Fundraising Goal → 100% coverage.
  await expect(page.getByTestId("chesterton-fundraising-committed")).toHaveText(
    "$386,875",
  );
  await expect(
    page.getByTestId("chesterton-fundraising-coverage-pct"),
  ).toHaveText("100%");

  // Edit row 0 from 100,000 → 175,000. New committed = 386,875 + 75,000 =
  // $461,875, coverage = 461,875 / 386,875 ≈ 119%. Both should rerender
  // immediately (no navigate-away required).
  const fundraisingGoalInput = fieldLocator(
    page,
    "chesterton.fundraisingGoals.0.goalAmount",
  );
  await expect(fundraisingGoalInput).toHaveValue("100000");
  await fundraisingGoalInput.fill("175000");
  // Don't blur — we're explicitly asserting the live re-render driven by
  // useWatch on the field array, not the autosave-on-blur path.
  await expect(page.getByTestId("chesterton-fundraising-committed")).toHaveText(
    "$461,875",
    { timeout: 5_000 },
  );
  await expect(
    page.getByTestId("chesterton-fundraising-coverage-pct"),
  ).toHaveText("119%", { timeout: 5_000 });

  // ----- 2. Step 7 (Gift Chart) — "Goal coverage %" updates live. -----
  await page.getByRole("button", { name: "7", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-gift-chart-step")).toBeVisible({
    timeout: 15_000,
  });

  // Seeded pyramid = 50k×1 + 25k×2 + 10k×8 + 5k×12 + 1k×15 + 100×100
  // = 50,000 + 50,000 + 80,000 + 60,000 + 15,000 + 10,000 = $265,000.
  // Total Fundraising Goal carried over from step 6 is still $386,875, so
  // initial coverage = 265,000 / 386,875 ≈ 68%.
  await expect(
    page.getByTestId("chesterton-gift-chart-coverage-pct"),
  ).toHaveText("68%");

  // Bump row 0's # Gifts from 1 → 5. That adds 4 × $50,000 = $200,000 to
  // the pyramid → new total = $465,000 → coverage = 465,000 / 386,875 ≈
  // 120%. The coverage % must update without leaving the step.
  const giftsInput = fieldLocator(
    page,
    "chesterton.giftChart.0.numberOfGifts",
  );
  await expect(giftsInput).toHaveValue("1");
  await giftsInput.fill("5");
  await expect(
    page.getByTestId("chesterton-gift-chart-coverage-pct"),
  ).toHaveText("120%", { timeout: 5_000 });

  // ----- 3. Step 8 (Recruiting) — "Projected enrollment" updates live. ----
  await page.getByRole("button", { name: "8", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-recruiting-step")).toBeVisible({
    timeout: 15_000,
  });

  // Year 1 enrollment goal from phaseEnrollment = freshman.year1 +
  // sophomore.year1 = 15 + 15 = 30. Seeded prospects are all 0, so
  // projected = floor(0 / 3) = 0 students.
  await expect(
    page.getByTestId("chesterton-recruiting-year1-need"),
  ).toContainText("30");
  await expect(
    page.getByTestId("chesterton-recruiting-total-prospects"),
  ).toHaveText("0");
  await expect(
    page.getByTestId("chesterton-recruiting-projected"),
  ).toContainText("0");

  // Edit row 0 from 0 → 90 prospects. At the seeded 1-in-3 conversion,
  // projected = floor(90 / 3) = 30 students = exactly the Year 1 goal,
  // so coverage = 100%.
  const prospectsInput = fieldLocator(
    page,
    "chesterton.recruitingPipeline.0.prospectiveStudents",
  );
  await expect(prospectsInput).toHaveValue("0");
  await prospectsInput.fill("90");
  await expect(
    page.getByTestId("chesterton-recruiting-total-prospects"),
  ).toHaveText("90", { timeout: 5_000 });
  await expect(
    page.getByTestId("chesterton-recruiting-projected"),
  ).toContainText("30");
  await expect(
    page.getByTestId("chesterton-recruiting-coverage-pct"),
  ).toHaveText("100%", { timeout: 5_000 });
});
