import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "./utils/test";

// Task #486 — Lock in the in-pane "Send this to the SchoolStack team" submit
// affordance Task #482 added to the single-year Advisor Preview Panel on the
// Scenarios page. There is no automated coverage today, so a future refactor
// of AdvisorPreviewPanel or the request-review route could silently break the
// in-pane submit flow.
//
// Two cases:
//  1. /review-available stubbed to true: open the form, fill name + email,
//     submit (request-review stubbed to 200), and assert the success state.
//  2. /review-available stubbed to false: the open-form button is disabled
//     and the unavailable hint renders.
//
// We stub the email-gate endpoints so the spec doesn't depend on the dev
// server having RESEND_API_KEY / EMAIL_FROM configured.

const TEST_PASSWORD = "PlaywrightTest12345!";

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildSingleYearSeed(): Record<string, unknown> {
  const baseEnrollment = 60;
  const tuition = 14000;

  return {
    name: "E2E Advisor Preview Academy",
    currentStep: 12,
    data: {
      schoolProfile: {
        // The single-year flag isSingleYearModel() reads to decide whether
        // to mount the AdvisorPreviewPanel on the Scenarios page.
        modelDuration: "single_year",
        schoolName: "E2E Advisor Preview Academy",
        state: "MA",
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
        ownershipType: "rent",
        monthlyRent: 9000,
        annualRentEscalation: 3,
        gradeBandEnrollment: {
          k5: [baseEnrollment, 0, 0, 0, 0],
          m68: [0, 0, 0, 0, 0],
          h912: [0, 0, 0, 0, 0],
        },
        gradeBandPerPupil: { k5: tuition, m68: 0, h912: 0 },
        sameTuitionForAllBands: true,
      },
      enrollment: { year1: baseEnrollment, year2: 0, year3: 0, year4: 0, year5: 0 },
      programs: [
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
      ],
      revenueRows: [
        {
          id: makeId("rev"),
          category: "tuition_and_fees",
          lineItem: "Tuition",
          enabled: true,
          driverType: "per_student",
          amounts: [tuition, 0, 0, 0, 0],
        },
      ],
      staffingRows: [
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
      ],
      expenseRows: [
        {
          id: makeId("exp"),
          category: "facility",
          lineItem: "Rent",
          enabled: true,
          driverType: "monthly",
          amounts: [108000, 0, 0, 0, 0],
        },
      ],
      capitalAndDebtRows: [],
      assumptionFlagResponses: [],
      // The Scenarios page only mounts the AdvisorPreviewPanel inside the
      // `{results && scenarios.length > 0 && (...)}` block, so we need at
      // least one saved what-if scenario for the panel to render at all.
      scenarios: [
        {
          name: "Slower ramp",
          enrollmentAdjustment: -10,
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
): Promise<{ token: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-advisor-preview-${stamp}@e2e.schoolstack.test`;

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
    await introBtn.click({ timeout: 3000 });
  } catch {
    /* dialog never appeared */
  }
}

// Stub /review-available so the spec doesn't depend on RESEND_API_KEY /
// EMAIL_FROM being configured on the dev server.
async function stubReviewAvailable(
  page: Page,
  modelId: number,
  available: boolean,
): Promise<void> {
  await page.route(
    new RegExp(`/api/models/${modelId}/review-available(\\?.*)?$`),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available }),
      });
    },
  );
}

async function stubRequestReviewSuccess(
  page: Page,
  modelId: number,
): Promise<void> {
  await page.route(
    new RegExp(`/api/models/${modelId}/request-review$`),
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    },
  );
}

test("advisor preview panel submits a review request from the Scenarios page", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  const { token } = await registerAndSeed(request);
  const modelId = await createModel(request, token, buildSingleYearSeed());
  await primeAuthToken(page, token);
  await stubReviewAvailable(page, modelId, true);
  await stubRequestReviewSuccess(page, modelId);

  await page.goto(`/model/${modelId}/scenarios`);
  await dismissOnboardingOverlays(page);

  const panel = page.getByTestId("advisor-preview-panel");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await panel.scrollIntoViewIfNeeded();

  // Wait for /review-available to resolve before clicking — the open-form
  // button is intentionally disabled until then to avoid a 503 race.
  const openButton = panel.getByTestId("advisor-preview-open-form");
  await expect(openButton).toBeEnabled({ timeout: 15_000 });
  await openButton.click();

  const form = panel.getByTestId("advisor-preview-form");
  await expect(form).toBeVisible();

  // Submit gate: name + email are required, so the button must be disabled
  // until both fields hold non-blank text.
  const submitButton = form.getByTestId("advisor-preview-submit-button");
  await expect(submitButton).toBeDisabled();

  await form.getByTestId("advisor-preview-input-name").fill("Jane Founder");
  await form
    .getByTestId("advisor-preview-input-email")
    .fill("jane@e2e.schoolstack.test");
  await form
    .getByTestId("advisor-preview-input-message")
    .fill("Please review my Year 1 plan.");

  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  // Success state replaces the form entirely.
  const submitted = panel.getByTestId("advisor-preview-submitted");
  await expect(submitted).toBeVisible({ timeout: 10_000 });
  await expect(submitted).toContainText(/Review requested/i);
  await expect(panel.getByTestId("advisor-preview-form")).toHaveCount(0);
});

test("advisor preview panel disables the submit button when /review-available is false", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);

  const { token } = await registerAndSeed(request);
  const modelId = await createModel(request, token, buildSingleYearSeed());
  await primeAuthToken(page, token);
  await stubReviewAvailable(page, modelId, false);

  await page.goto(`/model/${modelId}/scenarios`);
  await dismissOnboardingOverlays(page);

  const panel = page.getByTestId("advisor-preview-panel");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await panel.scrollIntoViewIfNeeded();

  // The unavailable hint only renders once /review-available has resolved
  // to false, so it doubles as a "stub took effect" signal.
  await expect(panel.getByTestId("advisor-preview-unavailable-hint")).toBeVisible({
    timeout: 15_000,
  });
  await expect(panel.getByTestId("advisor-preview-open-form")).toBeDisabled();

  // The form must stay closed — the disabled gate is the only thing
  // keeping a fast-clicking founder away from a doomed POST.
  await expect(panel.getByTestId("advisor-preview-form")).toHaveCount(0);
});
