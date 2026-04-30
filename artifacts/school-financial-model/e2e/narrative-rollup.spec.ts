import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Task #331 — Lender Narrative roll-up surfacing.
// Verifies that when a model already carries inline rationales captured at
// earlier wizard steps, the Lender Narrative step (step 11):
//   1. Pre-populates each section's textarea with the rolled-up rationale text.
//   2. Renders the "Pulled from your earlier notes" badge for those sections.
//   3. Exposes a back-link with the source category label and a working
//      "Edit at source" button that navigates to the originating step.

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedModel(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-rollup-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Rollup Founder" },
  });
  expect(
    registerRes.ok(),
    `register failed: ${registerRes.status()} ${await registerRes.text()}`,
  ).toBeTruthy();
  const { token } = (await registerRes.json()) as { token: string };
  await seedPersona(request, token);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Narrative Rollup Academy",
      currentStep: 11,
      data: {
        schoolProfile: {
          schoolName: "E2E Narrative Rollup Academy",
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
        budgetNarrative: {
          // Critically: each of these inline rationale entries should map to
          // a different rolled-up Lender Narrative section. Leave the target
          // narrative sections empty so the rollup backfill is observable.
          inlineRationales: {
            "enrollment:programs":
              "We grow K to 3 in year 1 and add a grade per year, anchored to our waitlist data.",
            "revenue:tuition_and_fees":
              "Tuition rises 3 percent per year tied to CPI and a 2026 comp survey.",
            "staffing:instructional":
              "Lower student to teacher ratio in K-2 to drive retention and outcomes.",
            "expenses:instructional_program":
              "Curriculum and supplies budgeted at 500 dollars per student annually.",
            "capitalFinancing:debtTerms":
              "Twenty year amortization at 6.5 percent locked at closing.",
          },
        },
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

test("Lender Narrative surfaces rolled-up rationales with badge + back-link", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedModel(request);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}?step=11`);

  // Step header confirms we landed on the Lender Narrative step.
  await expect(
    page.getByRole("heading", { name: /Lender Narrative|narrative/i }).first(),
  ).toBeVisible({ timeout: 30_000 });

  // Helper: open a collapsed section by clicking its toggle button. The
  // button label is the section's conversational prompt.
  const expandSection = async (key: string, headingMatcher: RegExp) => {
    const textarea = page.getByTestId(`narrative-textarea-${key}`);
    if (await textarea.isVisible().catch(() => false)) return textarea;
    await page.getByRole("button", { name: headingMatcher }).first().click();
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    return textarea;
  };

  // ---- Revenue Assumptions section: rolled-up tuition rationale ---------
  // Section button uses the conversational prompt:
  //   "What are families paying, and why is that the right number?"
  const revenueTextarea = await expandSection(
    "revenueAssumptions",
    /What are families paying/i,
  );
  await expect(revenueTextarea).toHaveValue(
    /Tuition rises 3 percent per year tied to CPI and a 2026 comp survey\./,
    { timeout: 15_000 },
  );

  // ---- "Pulled from your earlier notes" badge + back-link ---------------
  const editAtSource = page.getByTestId(
    "narrative-rollup-edit-revenueAssumptions",
  );
  await expect(editAtSource).toBeVisible();
  await expect(
    page.getByText("Pulled from your earlier notes").first(),
  ).toBeVisible();

  // Click the back-link and confirm the wizard navigates back to the Revenue
  // step so the founder can edit the source rationale in place. The wizard
  // uses internal state for the current step (not the URL), so we assert on
  // the appearance of the Revenue step heading rather than the URL.
  await editAtSource.click();
  await expect(
    page.getByRole("heading", {
      name: /Where Does Your Money Come From|Revenue by Source/i,
    }).first(),
  ).toBeVisible({ timeout: 15_000 });
});
