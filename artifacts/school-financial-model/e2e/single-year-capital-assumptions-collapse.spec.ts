import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";

// Task #460: in single-year mode, the Capital & Financing and Assumptions
// steps must collapse multi-year inputs and copy to Year 1 only — same
// pattern the Enrollment / Revenue / Expense / Staffing / Review steps
// already follow. This spec creates a single-year model, walks to each of
// those two steps, and asserts that no Year 2-5 columns or labels leak.

const TEST_PASSWORD = "PlaywrightTest12345!";

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildSingleYearModel(): Record<string, unknown> {
  const enrollment = { year1: 80, year2: 0, year3: 0, year4: 0, year5: 0 };
  const enrollmentArr = [80, 0, 0, 0, 0];
  return {
    name: "E2E single-year collapse",
    currentStep: 1,
    data: {
      schoolProfile: {
        modelDuration: "single_year",
        schoolName: "E2E Single Year Academy",
        state: "MA",
        schoolType: "private_school",
        entityType: "nonprofit_501c3",
        schoolStage: "new_school",
        fundingProfile: "tuition_based",
        plannedOpeningYear: "2027",
        openingYear: 2027,
        currentStudents: 0,
        longTermEnrollmentGoal: 80,
        maxCapacity: 100,
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        ownershipType: "rent",
        monthlyRent: 18000,
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
        hasLoan: true,
        loanAmount: 250000,
        loanRate: 7,
        loanTermYears: 10,
        debtIncluded: true,
        accountingBasis: "accrual",
        gradeBandEnrollment: { k5: enrollmentArr, m68: [0,0,0,0,0], h912: [0,0,0,0,0] },
        gradeBandPerPupil: { k5: 22000, m68: 0, h912: 0 },
        sameTuitionForAllBands: true,
      },
      enrollment,
      programs: [{
        id: makeId("prog"),
        name: "General Enrollment",
        annualTuition: 22000,
        priorYear: 0,
        currentYear: 0,
        ...enrollment,
      }],
      revenue: {
        tuitionPerStudent: 22000,
        annualTuitionIncrease: 3,
        publicFundingPerStudent: 0,
        otherRevenuePerStudent: 0,
        scholarshipRate: 0,
        annualDonations: 0,
        foundationGrants: 0,
        capitalGifts: 0,
      },
      revenueRows: [{
        id: makeId("rev"),
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "per_student",
        amounts: [22000, 0, 0, 0, 0],
      }],
      revenueDefaults: { billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
      staffing: { studentsPerTeacher: 18, teacherSalary: 55000, adminStaffCount: 1, adminSalary: 65000, founderSalary: 0, offersBenefits: true, benefitsRate: 18, payrollTaxRate: 8 },
      staffingRows: [{
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
        staffingMode: "fixed",
      }],
      facilities: { monthlyRent: 18000, annualRentIncrease: 3, annualUtilities: 24000, annualInsurance: 12000, annualSalaryIncrease: 3, generalCostInflation: 3 },
      expenseRows: [{
        id: makeId("exp"),
        category: "facility",
        lineItem: "Rent",
        enabled: true,
        driverType: "monthly",
        amounts: [216000, 0, 0, 0, 0],
      }],
      capitalAndDebtRows: [],
      assumptionFlagResponses: [],
      covenantThresholds: { dscrByYear: [1.10, 1.15, 1.20, 1.25, 1.25] },
    },
  };
}

async function registerAndSeed(request: APIRequestContext): Promise<string> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-singleyear-collapse-${stamp}@e2e.schoolstack.test`;
  const backoffs = [2000, 5000, 10000, 20000, 30000];
  let res = await request.post("/api/auth/register", { data: { email, password: TEST_PASSWORD, name: "Playwright Founder" } });
  for (const wait of backoffs) {
    if (res.status() !== 429) break;
    await new Promise((r) => setTimeout(r, wait));
    res = await request.post("/api/auth/register", { data: { email, password: TEST_PASSWORD, name: "Playwright Founder" } });
  }
  expect(res.ok(), `register failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const { token } = (await res.json()) as { token: string };
  await seedPersona(request, token);
  const guidance = await request.patch("/api/auth/guidance-level", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { guidanceLevel: "basics" },
  });
  expect(guidance.ok(), `guidance failed: ${guidance.status()}`).toBeTruthy();
  return token;
}

async function createModel(request: APIRequestContext, token: string, payload: Record<string, unknown>): Promise<number> {
  const res = await request.post("/api/models", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: payload,
  });
  expect(res.ok(), `create model failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const { id } = (await res.json()) as { id: number };
  return id;
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

async function dismissOverlays(page: Page): Promise<void> {
  const introBtn = page.getByRole("button", { name: /Let.?s get started/i });
  try { await introBtn.click({ timeout: 8000 }); } catch { /* not shown */ }
  const cookie = page.getByRole("button", { name: /^Decline$/ });
  try { await cookie.click({ timeout: 3000 }); } catch { /* not shown */ }
}

async function continueUntil(page: Page, headingRe: RegExp, maxClicks = 12): Promise<void> {
  for (let i = 0; i < maxClicks; i++) {
    const heading = page.getByRole("heading", { level: 2, name: headingRe });
    if (await heading.isVisible().catch(() => false)) return;
    const btn = page.getByRole("button", { name: /^Continue/i }).first();
    await expect(btn).toBeVisible();
    await btn.click();
    await heading.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  }
  await expect(page.getByRole("heading", { level: 2, name: headingRe })).toBeVisible();
}

test("single-year mode collapses Capital & Financing and Assumptions to Year 1 only", async ({ page, request }) => {
  test.setTimeout(120_000);

  const token = await registerAndSeed(request);
  const modelId = await createModel(request, token, buildSingleYearModel());

  await primeAuthToken(page, token);
  await page.goto(`/model/${modelId}`);
  await dismissOverlays(page);

  // Confirm we're in single-year mode by checking the persistent banner.
  await expect(page.getByText(/Single-Year Budget mode/i)).toBeVisible({ timeout: 15_000 });

  // ---- Capital & Financing step ----
  await continueUntil(page, /Capital\s*&\s*Financing/i);

  // The Year 1 covenant input is present.
  await expect(page.getByText(/Year 1/i).first()).toBeVisible();
  // No Year 2-5 covenant labels in the DSCR grid.
  for (const yr of ["Year 2", "Year 3", "Year 4", "Year 5"]) {
    await expect(
      page.getByText(new RegExp(`^${yr}$`)),
      `${yr} should not render on Capital & Financing in single-year mode`,
    ).toHaveCount(0);
  }
  // The five-step ramp copy must not leak.
  await expect(page.getByText(/1\.10x → 1\.15x → 1\.20x → 1\.25x → 1\.25x/i)).toHaveCount(0);
  // Year-by-year language is removed.
  await expect(page.getByText(/year-by-year targets/i)).toHaveCount(0);

  // ---- Assumptions & Sensitivity step ----
  await continueUntil(page, /Assumptions\s*&\s*Sensitivity/i);

  // Cost Escalation section becomes the N/A note.
  await expect(page.getByText(/Single-year mode - escalation rates N\/A/i)).toBeVisible();
  // The Cost Escalation input fields (COLA, General Cost Inflation, Rent Escalation)
  // must not render — assert via accessible labels (the InfoBadge copy intentionally
  // names these fields, so plain text assertions would over-match).
  await expect(page.getByLabel(/COLA \(Cost of Living Adjustment\)/i)).toHaveCount(0);
  await expect(page.getByLabel(/General Cost Inflation/i)).toHaveCount(0);
  await expect(page.getByLabel(/Rent Escalation/i)).toHaveCount(0);
  // Tuition Escalation Rate input is hidden in single-year mode.
  await expect(page.getByLabel(/Tuition Escalation Rate/i)).toHaveCount(0);
  // Enrollment Growth Rate input is hidden in single-year mode.
  await expect(page.getByLabel(/Enrollment Growth Rate/i)).toHaveCount(0);
  // Model Horizon shows 1-Year Budget rather than 5-Year Projection.
  // (Surrounding copy intentionally references the 5-year option as the upgrade path,
  // so we only assert the active label, not the absence of the phrase entirely.)
  await expect(page.getByText(/1-Year Budget/i)).toBeVisible();
  // Header copy mentions single-year mode.
  await expect(page.getByText(/single-year mode/i).first()).toBeVisible();

  // ---- Review step ----
  // Task #465: the Review step's "Assumptions & Sensitivity" summary card
  // must hide COLA, General Cost Inflation, Rent Escalation, and Enrollment
  // Growth Rate in single-year mode and replace them with an N/A note.
  await continueUntil(page, /Does Everything Look Right/i);

  // The new N/A note replaces the four hidden rows.
  await expect(
    page.getByText(/Multi-year escalation rates N\/A in single-year mode/i),
  ).toBeVisible();

  // The four hidden labels must not render as Item rows. The Item component
  // wraps labels in a `span.text-sm.font-medium.text-muted-foreground`, so we
  // assert there is no such span whose visible text exactly matches each
  // hidden label. Using exact text avoids matching the descriptive N/A note
  // (which mentions these field names in prose).
  for (const exactLabel of [
    "COLA (Cost of Living Adjustment)",
    "General Cost Inflation",
    "Rent Escalation",
    "Enrollment Growth Rate",
  ]) {
    await expect(
      page.locator("span.text-muted-foreground").getByText(exactLabel, { exact: true }),
      `${exactLabel} should not render as a Review row in single-year mode`,
    ).toHaveCount(0);
  }
});
