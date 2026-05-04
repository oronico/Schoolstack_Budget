import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #481 — Regression coverage for the Scenarios-page advisor brief
// preview shipped in Task #477.
//
// AdvisorPreviewPanel renders only when `isSingleYearModel(modelData)` is
// true. It fetches `/api/models/:id/review-preview` and pushes the rendered
// email HTML into a sandboxed <iframe> via `srcDoc`. The mailer's
// single-year branch (api-server/src/lib/mailer.ts) anchors copy on Y1 —
// e.g. it emits "Enrollment Y1" and "Y1 Revenue" — and the five-year
// branch instead emits "Enrollment Y1→Y5". Without an end-to-end check,
// any of these could silently regress:
//   - the panel could lose its single-year gate (would render for
//     five-year founders too)
//   - the panel could be dropped from the Scenarios page entirely
//   - the /review-preview endpoint could return five-year copy for a
//     single-year model (broken `isSingleYear` plumbing)
//
// This spec creates two models via the API (single-year + five-year),
// navigates each to /model/:id/scenarios, and asserts:
//   * Single-year model: the panel is visible, the iframe srcdoc
//     contains "Y1" anchored copy ("Enrollment Y1"), and does NOT
//     contain the multi-year "Y1→Y5" string.
//   * Five-year model: the panel is absent (gate works).

const TEST_PASSWORD = "PlaywrightTest12345!";

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Builds a minimal seed model the wizard + scenarios page accept. The only
// meaningful axis under test is `modelDuration` — every other field is the
// same between the single-year and five-year fixtures so any divergence
// in panel behavior is attributable to the duration gate alone.
function buildSeed(modelDuration: "single_year" | "five_year"): Record<string, unknown> {
  const baseEnrollment = 60;
  const tuition = 14000;
  const isSingle = modelDuration === "single_year";

  // For five-year mode we want a real enrollment ramp so the rendered
  // email's "Enrollment Y1→Y5" line shows distinct numbers (otherwise it
  // would render "60 → 60 → 60 → 60 → 60" and still trigger the
  // Y1→Y5 label, but the ramp keeps the fixture realistic).
  const enrollment = isSingle
    ? { year1: baseEnrollment, year2: 0, year3: 0, year4: 0, year5: 0 }
    : {
        year1: baseEnrollment,
        year2: baseEnrollment + 20,
        year3: baseEnrollment + 40,
        year4: baseEnrollment + 60,
        year5: baseEnrollment + 80,
      };

  const schoolProfile: Record<string, unknown> = {
    schoolName: isSingle ? "E2E Single-Year Preview" : "E2E Five-Year Preview",
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
      k5: isSingle
        ? [baseEnrollment, 0, 0, 0, 0]
        : [
            baseEnrollment,
            baseEnrollment + 20,
            baseEnrollment + 40,
            baseEnrollment + 60,
            baseEnrollment + 80,
          ],
      m68: [0, 0, 0, 0, 0],
      h912: [0, 0, 0, 0, 0],
    },
    gradeBandPerPupil: { k5: tuition, m68: 0, h912: 0 },
    sameTuitionForAllBands: true,
    modelDuration,
  };

  const programs = [
    {
      id: makeId("prog"),
      name: "General Enrollment",
      annualTuition: tuition,
      priorYear: 0,
      currentYear: 0,
      year1: enrollment.year1,
      year2: enrollment.year2,
      year3: enrollment.year3,
      year4: enrollment.year4,
      year5: enrollment.year5,
    },
  ];

  const yearAmounts = (perYear: number) =>
    isSingle
      ? [perYear, 0, 0, 0, 0]
      : [perYear, perYear, perYear, perYear, perYear];

  const revenueRows: Array<Record<string, unknown>> = [
    {
      id: makeId("rev"),
      category: "tuition_and_fees",
      lineItem: "Tuition",
      enabled: true,
      driverType: "per_student",
      amounts: yearAmounts(tuition),
    },
    {
      id: makeId("rev"),
      category: "philanthropy",
      lineItem: "Annual fund",
      enabled: true,
      driverType: "annual_fixed",
      amounts: yearAmounts(25000),
    },
  ];

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
      amounts: yearAmounts(108000),
    },
    {
      id: makeId("exp"),
      category: "instructional",
      lineItem: "Curriculum & supplies",
      enabled: true,
      driverType: "per_student",
      amounts: yearAmounts(350),
    },
  ];

  return {
    name: schoolProfile.schoolName as string,
    // ScenarioPage redirects to the wizard when `currentStep < 9` (see
    // src/pages/scenarios/index.tsx near `setLocation(\`/model/${modelId}\`)`).
    // Seed the model as if the founder has already reached the Review step
    // so the Scenarios route actually mounts on first navigation.
    currentStep: 9,
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
      // The Scenarios page wraps the Deep Comparison block (and the
      // AdvisorPreviewPanel under test) in `{results && scenarios.length > 0 && (...)}`.
      // Seed one persisted what-if scenario so the panel actually mounts —
      // an empty scenarios array would short-circuit before the gate we
      // care about (`isSingleYearModel`) is even evaluated.
      scenarios: [
        {
          name: "Test Scenario",
          enrollmentAdjustment: 10,
          tuitionAdjustment: 0,
          expenseAdjustment: 0,
          staffingAdjustment: 0,
          facilityAdjustment: 0,
        },
      ],
    },
  };
}

async function registerAndSeed(
  request: APIRequestContext,
  label: string,
): Promise<{ token: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-advisor-preview-${label}-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });
  await seedPersona(request, token);
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

test("AdvisorPreviewPanel renders Y1-anchored brief on the Scenarios page for single-year models", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token } = await registerAndSeed(request, "single");
  const modelId = await createModel(request, token, buildSeed("single_year"));
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  const panel = page.getByTestId("advisor-preview-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });

  const iframe = panel.getByTestId("advisor-preview-iframe");
  await expect(iframe).toBeVisible({ timeout: 30_000 });

  // Read the rendered email HTML straight from the iframe's srcdoc rather
  // than poking inside the sandboxed document. `sandbox=""` blocks scripts
  // and same-origin access, so `iframe.contentFrame()` would not give us a
  // usable handle in any case — but the React component pushes the full
  // body HTML into srcdoc, which is observable from the parent document.
  const srcDoc = await iframe.getAttribute("srcdoc");
  expect(srcDoc, "iframe srcdoc must be populated once the preview fetch resolves").not.toBeNull();
  const html = srcDoc ?? "";

  // Single-year mailer branch (api-server/src/lib/mailer.ts) emits the
  // "Enrollment Y1" label instead of "Enrollment Y1→Y5", and uses
  // "Y1 Revenue" / "Y1 Net Income" headlines. Asserting the Y1 label
  // pins the single-year copy without coupling the test to incidental
  // formatting of the enrollment number.
  expect(html, "single-year preview should contain the 'Enrollment Y1' label").toContain("Enrollment Y1");
  expect(html, "single-year preview should contain a Y1 revenue headline").toContain("Y1 Revenue");

  // The five-year-only string must be absent — its presence would mean
  // either the mailer or the /review-preview endpoint regressed and is
  // emitting multi-year copy for a single-year model.
  expect(html, "single-year preview must NOT contain the multi-year 'Y1→Y5' label").not.toContain("Y1→Y5");
});

test("AdvisorPreviewPanel is hidden on the Scenarios page for five-year models", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token } = await registerAndSeed(request, "five");
  const modelId = await createModel(request, token, buildSeed("five_year"));
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}/scenarios`);

  // Wait for the Scenarios page itself to mount before asserting the
  // panel is absent — otherwise `toHaveCount(0)` would pass while the
  // page is still loading and produce a false negative. The "Compare
  // Scenarios" controls are rendered for every model regardless of
  // duration, so they make a reliable mount signal here.
  await expect(
    page.getByRole("heading", { name: /Scenario Planner/i }).first(),
  ).toBeVisible({ timeout: 30_000 });

  await expect(
    page.getByTestId("advisor-preview-panel"),
    "advisor-preview-panel must be absent for five-year models (single-year-only gate)",
  ).toHaveCount(0);
});
