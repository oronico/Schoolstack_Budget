import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Verifies the inline rationale capture introduced in task #330.
// We seed a model that already has populated revenue/staffing rows so the
// wizard renders the per-category cards immediately, then we type a
// rationale into one of the RationaleField inputs, navigate forward and
// back, and assert the value is still present in the textarea AND has been
// persisted to the API under `data.budgetNarrative.inlineRationales[<key>]`.
// The keys in this test mirror the production semantic naming
// (`revenue:tuition_and_fees`, `staffing:instructional`) so a rename of
// either would force this test to be updated alongside the consumer.

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedModel(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Rationale Academy",
      currentStep: 4,
      data: {
        schoolProfile: {
          schoolName: "E2E Rationale Academy",
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
        enrollment: {
          year1: 80, year2: 90, year3: 100, year4: 110, year5: 120,
        },
        // Pre-enable the Revenue tuition_and_fees category by seeding a
        // matching enabled row. Same shape used by the wizard defaults.
        revenueRows: [
          {
            id: "tuition_base",
            lineItem: "Tuition",
            category: "tuition_and_fees",
            enabled: true,
            driverType: "per_student",
            amounts: [14500, 14935, 15383, 15844, 16319],
          },
        ],
        // Seed at least one instructional staff row so the
        // `staffing:instructional` rationale card renders.
        staffingRows: [
          {
            id: "lead_teacher_1",
            roleName: "Lead Teacher",
            functionCategory: "instructional",
            employmentType: "full_time",
            staffingMode: "fixed",
            fte: 1,
            annualizedRate: 55000,
            benefitsEligible: true,
            benefitsRate: 25,
            payrollTaxRate: 7.65,
            payrollLike: true,
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
  return { token, modelId };
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

test("Inline rationales persist across navigation, survive reload, and round-trip to the API", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedModel(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}?step=4`);

  // Wait for the Revenue step to mount before doing anything else; the
  // wizard performs a few rerenders during initial hydration that would
  // otherwise detach our locators mid-action.
  await expect(
    page.getByRole("heading", { name: /Where Does Your Money Come From|Revenue by Source/i }).first(),
  ).toBeVisible({ timeout: 30_000 });

  // The tuition_and_fees category may render collapsed. Expand it if its
  // rationale textarea is not yet in the tree, then wait for the textarea.
  const tuitionRationale = page
    .locator('[data-rationale-key="revenue:tuition_and_fees"] textarea')
    .first();
  if (!(await tuitionRationale.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /Tuition\s*&\s*Fees/i })
      .first()
      .click();
  }
  await expect(tuitionRationale).toBeVisible({ timeout: 15_000 });

  const rationaleText =
    "Tuition anchored to a 2026 comp survey of three local independent schools.";
  await tuitionRationale.fill(rationaleText);
  // Blur so react-hook-form's onChange picks up the value before we navigate.
  await tuitionRationale.blur();

  // Navigate forward to staffing, then back, to prove the value sticks
  // across step transitions and not just within the same render tree.
  const continueButton = page
    .getByRole("button", { name: /^Continue/i })
    .last();
  await continueButton.click();

  // Land on Staffing — confirm the per-category instructional rationale renders.
  const instructionalRationale = page
    .locator('[data-rationale-key="staffing:instructional"] textarea')
    .first();
  await expect(instructionalRationale).toBeVisible({ timeout: 15_000 });

  const staffingText =
    "Staffing built off our current Year 1 hiring plan and 2025 NAIS comp data.";
  await instructionalRationale.fill(staffingText);
  await instructionalRationale.blur();

  // Walk back to Revenue and confirm the previous value survived.
  await page.getByRole("button", { name: /^Back/i }).last().click();

  // The category may collapse on navigation; reopen if needed.
  const tuitionRationaleAgain = page
    .locator('[data-rationale-key="revenue:tuition_and_fees"] textarea')
    .first();
  if (!(await tuitionRationaleAgain.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /Tuition\s*&\s*Fees/i })
      .first()
      .click();
  }
  await expect(tuitionRationaleAgain).toHaveValue(rationaleText, {
    timeout: 15_000,
  });

  // Give the debounced wizard auto-save a beat to flush the final write,
  // then hard-reload the page to prove the value survives a real document
  // load (not just an in-memory step transition).
  await page.waitForTimeout(2_000);
  await page.goto(`/model/${modelId}?step=4`);
  await expect(
    page.getByRole("heading", { name: /Where Does Your Money Come From|Revenue by Source/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
  const tuitionAfterReload = page
    .locator('[data-rationale-key="revenue:tuition_and_fees"] textarea')
    .first();
  if (!(await tuitionAfterReload.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /Tuition\s*&\s*Fees/i })
      .first()
      .click();
  }
  await expect(tuitionAfterReload).toHaveValue(rationaleText, {
    timeout: 15_000,
  });

  // Round-trip: re-read the model from the API and assert both rationales
  // landed in the expected `budgetNarrative.inlineRationales` slot. The
  // record-shaped persistence path is the same for every step token, so a
  // representative pair (revenue + staffing) proves the mechanism end-to-end.
  const refetched = await request.get(`/api/models/${modelId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(refetched.ok()).toBeTruthy();
  const body = (await refetched.json()) as {
    data?: {
      budgetNarrative?: { inlineRationales?: Record<string, string> };
    };
  };
  const persisted = body.data?.budgetNarrative?.inlineRationales ?? {};
  expect(persisted["revenue:tuition_and_fees"]).toBe(rationaleText);
  expect(persisted["staffing:instructional"]).toBe(staffingText);
});
