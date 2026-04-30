import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type ConsoleMessage,
} from "@playwright/test";

// User-requested smoke test: six wizard paths must work end-to-end.
// 3 school types (charter, private, learning lab) × 2 stages (operating, new) = 6 paths.
// For each combination we:
//   1. Register a fresh user and seed their persona (so the founder-persona
//      overlay does not block the wizard).
//   2. Create a fully-populated model via the API so every wizard step has
//      enough data to satisfy its react-hook-form `trigger()` validation.
//   3. Open the wizard at step 1 and click "Continue" through all 11 steps.
//   4. Assert each step's "Step N of 11: {Title}" header renders.
//   5. Capture browser console errors and any blocking alert() dialogs and
//      surface them as test failures so engine/UI bugs do not silently pass.

const TEST_PASSWORD = "PlaywrightTest12345!";

type WizardSchoolType = "charter_school" | "private_school" | "learning_pod";
type WizardSchoolStage = "operating_school" | "new_school";

interface PathSpec {
  label: string;
  schoolType: WizardSchoolType;
  schoolStage: WizardSchoolStage;
}

const PATHS: PathSpec[] = [
  { label: "charter operating",     schoolType: "charter_school", schoolStage: "operating_school" },
  { label: "charter new",           schoolType: "charter_school", schoolStage: "new_school" },
  { label: "private operating",     schoolType: "private_school", schoolStage: "operating_school" },
  { label: "private new",           schoolType: "private_school", schoolStage: "new_school" },
  { label: "learning lab operating", schoolType: "learning_pod",  schoolStage: "operating_school" },
  { label: "learning lab new",      schoolType: "learning_pod",   schoolStage: "new_school" },
];

// Per-step desktop-visible heading text (the wizard chrome's "Step N of 11"
// label is mobile-only; each step component renders its own h2 we can pin to).
const STEP_HEADINGS: Array<{ step: number; title: string; heading: RegExp }> = [
  { step: 1,  title: "Story",          heading: /Let.?s start with your school.?s story/i },
  { step: 2,  title: "School Details", heading: /Tell Us About Your School/i },
  { step: 3,  title: "Assumptions",    heading: /^Assumptions$/i },
  { step: 4,  title: "Enrollment",     heading: /Programs\s*&\s*Enrollment/i },
  { step: 5,  title: "Revenue",        heading: /Revenue by Source|Where Does Your Money Come From/i },
  { step: 6,  title: "Staffing",       heading: /Tell Us About Your Leadership and Staff/i },
  { step: 7,  title: "Expenses",       heading: /Expenses\s*&\s*Operations|What Does Your School Spend On/i },
  { step: 8,  title: "Review",         heading: /Does Everything Look Right/i },
  { step: 9,  title: "Consultant",     heading: /What Our Analysis Found|Running Your Financial Analysis|Analysis Unavailable/i },
  { step: 10, title: "Narrative",      heading: /Lender Narrative/i },
  { step: 11, title: "Export",         heading: /Your reports are ready|Ready to export your model/i },
];

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Build a fully-populated model payload for one (type, stage) combination.
// Targets every step's `trigger()` validation so "Continue" is always enabled.
function buildSeedModel(spec: PathSpec): Record<string, unknown> {
  const isCharter = spec.schoolType === "charter_school";
  const isPrivate = spec.schoolType === "private_school";
  const isLab     = spec.schoolType === "learning_pod";
  const isNew     = spec.schoolStage === "new_school";

  // Sized so each path is plausible but small — keeps the engine fast.
  const baseEnrollment =
    isLab ? (isNew ? 12 : 18) :
    isPrivate ? (isNew ? 80 : 180) :
    /* charter */ (isNew ? 120 : 320);

  const tuitionPerStudent =
    isLab ? 14000 :
    isPrivate ? 22000 :
    /* charter */ 0; // charters are publicly funded — tuition is $0.

  const publicFundingPerStudent = isCharter ? 11500 : 0;

  // Year 1..5 enrollment ramp.
  const enrollment = {
    year1: baseEnrollment,
    year2: Math.round(baseEnrollment * 1.15),
    year3: Math.round(baseEnrollment * 1.30),
    year4: Math.round(baseEnrollment * 1.45),
    year5: Math.round(baseEnrollment * 1.60),
  };

  const enrollmentArr = [enrollment.year1, enrollment.year2, enrollment.year3, enrollment.year4, enrollment.year5];

  // schoolProfile — covers everything Story + School Details validation hits.
  const schoolProfile: Record<string, unknown> = {
    schoolName: `E2E ${spec.label} Academy`,
    state: isCharter ? "NC" : isPrivate ? "MA" : "CA",
    schoolType: spec.schoolType,
    entityType: isCharter ? "nonprofit_501c3" : isPrivate ? "nonprofit_501c3" : "llc_single",
    schoolStage: spec.schoolStage,
    fundingProfile: isCharter ? "charter_public_funded" : isLab ? "hybrid_mixed" : "tuition_based",
    plannedOpeningYear: isNew ? "2027" : undefined,
    operatingYear: isNew ? undefined : "second_year_plus",
    openingYear: isNew ? 2027 : 2022,
    currentStudents: isNew ? 0 : baseEnrollment,
    longTermEnrollmentGoal: enrollment.year5,
    maxCapacity: Math.round(enrollment.year5 * 1.25),
    fiscalYearStartMonth: 7,
    isPartialFirstYear: false,
    year1OperatingMonths: 12,
    isAccredited: !isNew,
    locationSecured: !isNew,
    ownershipType: "rent",
    monthlyRent: isLab ? 4500 : isPrivate ? 18000 : 26000,
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
    insuranceCost: isLab ? 150 : 600,
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
      k5:  enrollmentArr,
      m68: [0, 0, 0, 0, 0],
      h912: [0, 0, 0, 0, 0],
    },
    gradeBandPerPupil: {
      k5: tuitionPerStudent || publicFundingPerStudent,
      m68: 0,
      h912: 0,
    },
    sameTuitionForAllBands: true,
  };

  // Charter-only required fields surface in StoryStep / SchoolProfileStep.
  if (isCharter) {
    schoolProfile.enrollmentRevenueMethod = "adm";
    schoolProfile.charterDepositTiming = "monthly";
    schoolProfile.stateFundingMethodology = "adm";
    schoolProfile.priorYearADM = isNew ? 0 : baseEnrollment;
    schoolProfile.priorYearADA = isNew ? 0 : Math.round(baseEnrollment * 0.95);
  }

  // Programs row — needed if EnrollmentStep validates `programs` instead of
  // `enrollment` (it does so when programs.length > 0).
  const programs = [
    {
      id: makeId("prog"),
      name: "General Enrollment",
      annualTuition: tuitionPerStudent,
      priorYear: isNew ? 0 : baseEnrollment,
      currentYear: isNew ? 0 : baseEnrollment,
      year1: enrollment.year1,
      year2: enrollment.year2,
      year3: enrollment.year3,
      year4: enrollment.year4,
      year5: enrollment.year5,
    },
  ];

  // Revenue rows — type-appropriate.
  const revenueRows: Array<Record<string, unknown>> = [];
  if (tuitionPerStudent > 0) {
    revenueRows.push({
      id: makeId("rev"),
      category: "tuition_and_fees",
      lineItem: "Tuition",
      enabled: true,
      driverType: "per_student",
      amounts: [tuitionPerStudent, tuitionPerStudent * 1.03, tuitionPerStudent * 1.06, tuitionPerStudent * 1.09, tuitionPerStudent * 1.12],
    });
  }
  if (isCharter) {
    revenueRows.push({
      id: makeId("rev"),
      category: "public_funding",
      lineItem: "State per-pupil funding",
      enabled: true,
      driverType: "per_student",
      amounts: [publicFundingPerStudent, publicFundingPerStudent * 1.02, publicFundingPerStudent * 1.04, publicFundingPerStudent * 1.06, publicFundingPerStudent * 1.08],
    });
  }
  // Always add a small philanthropy row so non-charter, non-tuition sanity exists.
  revenueRows.push({
    id: makeId("rev"),
    category: "philanthropy",
    lineItem: "Annual fund",
    enabled: true,
    driverType: "annual_fixed",
    amounts: isLab ? [5000, 6000, 7000, 8000, 9000] : [25000, 30000, 35000, 40000, 45000],
  });

  // Staffing rows — at least one is REQUIRED by the schema (`min(1)`).
  const staffingRows: Array<Record<string, unknown>> = [
    {
      id: makeId("staff"),
      roleName: "Lead Teacher",
      functionCategory: "instructional",
      employmentType: "full_time",
      fte: isLab ? 1 : 4,
      annualizedRate: 55000,
      benefitsEligible: true,
      benefitsRate: 18,
      payrollTaxRate: 8,
      payrollLike: true,
      notes: "",
      staffingMode: "fixed",
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

  // Expense rows — facility, instructional, ops, admin spread.
  const expenseRows: Array<Record<string, unknown>> = [
    {
      id: makeId("exp"),
      category: "facility",
      lineItem: "Rent",
      enabled: true,
      driverType: "monthly",
      amounts: [(schoolProfile.monthlyRent as number) * 12, 0, 0, 0, 0],
    },
    {
      id: makeId("exp"),
      category: "instructional",
      lineItem: "Curriculum & supplies",
      enabled: true,
      driverType: "per_student",
      amounts: [350, 360, 370, 380, 390],
    },
    {
      id: makeId("exp"),
      category: "operations",
      lineItem: "Insurance",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [12000, 12500, 13000, 13500, 14000],
    },
  ];

  return {
    name: `E2E ${spec.label} Academy`,
    currentStep: 1,
    data: {
      schoolProfile,
      enrollment,
      programs,
      revenue: {
        tuitionPerStudent,
        annualTuitionIncrease: 3,
        publicFundingPerStudent,
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
        studentsPerTeacher: isLab ? 8 : 18,
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
        monthlyRent: schoolProfile.monthlyRent,
        annualRentIncrease: 3,
        annualUtilities: isLab ? 6000 : 24000,
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

async function registerAndSeed(request: APIRequestContext, label: string): Promise<{ token: string; userId: number }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-six-${label.replace(/\s+/g, "-")}-${stamp}@e2e.schoolstack.test`;

  // The registration endpoint is rate-limited per IP. When the e2e suite runs
  // many tests in sequence, later tests can hit 429. Retry with exponential
  // backoff up to ~70s total (covers a 60s rolling window) before failing.
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
  const { token, user } = (await registerRes.json()) as { token: string; user: { id: number } };
  await seedPersona(request, token);
  // Pre-set guidance level so the dashboard / wizard does not show the
  // "choose your guidance level" overlay (which intercepts Next clicks).
  const guidanceRes = await request.patch("/api/auth/guidance-level", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { guidanceLevel: "basics" },
  });
  expect(
    guidanceRes.ok(),
    `guidance failed: ${guidanceRes.status()} ${await guidanceRes.text()}`,
  ).toBeTruthy();
  return { token, userId: user.id };
}

async function createModel(request: APIRequestContext, token: string, payload: Record<string, unknown>): Promise<number> {
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

// Returns a function the test can call at the end to assert no fatal errors.
function trackPageHealth(page: Page): {
  consoleErrors: string[];
  dialogs: string[];
} {
  const consoleErrors: string[] = [];
  const dialogs: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter known noisy errors that are not engine bugs.
      if (text.includes("Failed to load resource")) return;
      if (text.includes("net::ERR_")) return;
      if (text.includes("favicon")) return;
      consoleErrors.push(text);
    }
  });

  page.on("pageerror", (err: Error) => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });

  // Auto-dismiss alerts so they do not block test execution. Record them so
  // the test can decide whether they indicate a real problem.
  page.on("dialog", async (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss().catch(() => undefined);
  });

  return { consoleErrors, dialogs };
}

async function expectStepHeader(page: Page, stepNum: number): Promise<void> {
  const meta = STEP_HEADINGS[stepNum - 1];
  const heading = page.getByRole("heading", { name: meta.heading }).first();
  await expect(
    heading,
    `expected to land on Step ${stepNum} (${meta.title})`,
  ).toBeVisible({ timeout: 15_000 });
}

for (const spec of PATHS) {
  test(`wizard smoke: ${spec.label} walks all 11 steps without crashing`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000); // each combo needs a few seconds per step

    const { token } = await registerAndSeed(request, spec.label);
    const payload = buildSeedModel(spec);
    const modelId = await createModel(request, token, payload);

    const health = trackPageHealth(page);
    await primeAuthToken(page, token);

    await page.goto(`/model/${modelId}`);

    // The wizard fires a useEffect after model load that opens a "Here's what
    // to expect" prep dialog. Auto-wait up to 8s for it to appear, then click
    // "Let's get started" to dismiss. If it never appears (already-seen flag
    // in localStorage), skip silently.
    const introBtn = page.getByRole("button", { name: /Let.?s get started/i });
    try {
      await introBtn.click({ timeout: 8000 });
    } catch {
      // dialog never appeared — proceed
    }

    // Dismiss the cookie consent banner if it appears (analytics noise the
    // smoke test does not care about). It can render either before or after
    // the prep dialog, so check after dismissing the dialog.
    const cookieDecline = page.getByRole("button", { name: /^Decline$/ });
    try {
      await cookieDecline.click({ timeout: 3000 });
    } catch {
      // banner never appeared — proceed
    }

    // Step 1 (Story) should be the first surface the user sees.
    await expectStepHeader(page, 1);

    // Walk through every step. The Continue button has 4 different labels
    // depending on the current step (see wizard index.tsx ~line 1021).
    for (let step = 1; step <= STEP_HEADINGS.length; step++) {
      await expectStepHeader(page, step);

      if (step === STEP_HEADINGS.length) break; // nothing to click on the final step

      // Step 10 (Lender Narrative) shows "Flagged Assumptions" with REQUIRED
      // "Explain your reasoning..." textareas for any benchmark misses. The
      // smoke seed creates flags, so we have to fill every textarea before
      // the form will submit. Use a generic plausible answer for each.
      if (step === 10) {
        const reasoningBoxes = page.getByPlaceholder(/Explain your reasoning/i);
        const count = await reasoningBoxes.count();
        for (let i = 0; i < count; i++) {
          await reasoningBoxes.nth(i).fill(
            "Smoke test placeholder reasoning: addressed via planned cost reductions and additional fundraising in years 2 and 3.",
          );
        }
      }

      const nextLabel =
        step === 8 ? /View Consultant Analysis/i :
        step === 9 ? /Continue to Lender Narrative/i :
        step === 10 ? /Generate Excel Model/i :
        /Continue/i;

      const nextBtn = page.getByRole("button", { name: nextLabel }).first();
      await expect(nextBtn, `Continue button missing on step ${step}`).toBeVisible();
      await nextBtn.click();
    }

    // Final assertions — surface every captured browser error so a failing
    // path tells us exactly what blew up.
    expect(
      health.consoleErrors,
      `[${spec.label}] browser console errors:\n${health.consoleErrors.join("\n---\n")}`,
    ).toEqual([]);

    // Blocking validation alerts on Step 1 / 7 / 10 are real failures (the
    // seed payload should satisfy every step). Surface them so we notice.
    expect(
      health.dialogs,
      `[${spec.label}] unexpected blocking dialogs:\n${health.dialogs.join("\n---\n")}`,
    ).toEqual([]);
  });
}
