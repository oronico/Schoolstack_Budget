import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

// Task #320: end-to-end coverage of the state + entity-type wiring on the
// Expenses step and the state-driven payroll-tax re-seed on the Staffing step.
//
// Task #318 added unit tests for the underlying math; these specs guard the
// React effects that surface that math to founders:
//
//   - Expenses (step 7) renders the State Entity Filing Fees row whenever a
//     fee profile exists for the (state, entity-type) pair, removes it when
//     the founder picks `sole_practitioner`, and re-seeds Y1 with the
//     state's one-time publication fee on `state` changes (CA → NY → none).
//
//   - Staffing (step 6) re-seeds every default staff row's
//     `payrollTaxComponents` when the founder picks a new state, so the
//     displayed "Payroll Taxes" $$ for an above-wage-base salary
//     (Head of School @ $85k vs WA SUI cap of $72,800) reflects the
//     wage-base-aware computation rather than the federal fallback.

const TEST_PASSWORD = "PlaywrightTest12345!";

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedModel(
  request: APIRequestContext,
  currentStep: number,
  schoolProfile: Record<string, unknown>,
): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-state-triggers-${stamp}@e2e.schoolstack.test`;

  const registerRes = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
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
      name: "E2E State Triggers Academy",
      currentStep,
      data: { schoolProfile },
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
    // Pre-dismiss the cookie consent banner so its bottom-of-viewport
    // dialog does not intercept clicks on the wizard's full-width primary
    // CTA buttons (e.g. "Continue with N categories" on the Expenses step).
    window.localStorage.setItem("cookie_consent", "declined");
  }, token);
}

// Find the State Entity Filing Fees row card by its line-item input value.
// React sets the `value` attribute when the input first mounts (the row is
// generated via the F3 effect's setValue → re-render path), so the
// `[value="..."]` attribute selector matches on initial paint of each new
// row. The closest ancestor `div.rounded-xl` wraps the editable controls.
function stateFeeRowInput(page: Page): Locator {
  return page.locator('input[value="State Entity Filing Fees"]');
}

function stateFeeRow(page: Page): Locator {
  return stateFeeRowInput(page).locator(
    'xpath=ancestor::div[contains(@class, "rounded-xl")][1]',
  );
}

// Click the wizard's step rail circle for a given step (1-indexed).
async function jumpToStep(page: Page, stepId: number): Promise<void> {
  await page
    .getByRole("button", { name: String(stepId), exact: true })
    .click();
}

// First arrival on the Expenses step renders the "What Does Your School
// Spend On?" category picker. Dismissing it via the Continue button reveals
// the generated rows (incl. the state entity filing fees row when a state +
// entity type are set). Subsequent re-mounts (after navigating away and
// back) auto-skip the picker because `expenseRows` is already populated.
async function dismissCategoryPickerIfShown(page: Page): Promise<void> {
  // The picker only appears on the first arrival; on later remounts the
  // hydration branch in ExpenseStep auto-skips it. Wait for the Expenses
  // step heading first (either the picker title or the row-list title) so
  // we know the step has finished mounting before deciding what to do.
  const pickerHeading = page.getByRole("heading", {
    name: "What Does Your School Spend On?",
  });
  const rowsHeading = page.getByRole("heading", {
    name: /Operating Expenses|Add Custom Category|Year-Over-Year/,
  });
  await Promise.race([
    pickerHeading.waitFor({ state: "visible", timeout: 15000 }),
    rowsHeading.waitFor({ state: "visible", timeout: 15000 }),
  ]).catch(() => {
    /* fall through and let downstream assertions surface a clearer error */
  });

  const continueBtn = page.getByRole("button", {
    name: /^Continue with \d+ categor/,
  });
  if (!(await continueBtn.isVisible().catch(() => false))) {
    return;
  }
  await continueBtn.click();
  await continueBtn.waitFor({ state: "detached" });
}

test("State Entity Filing Fees row appears, re-seeds on state change, and disappears for sole_practitioner", async ({
  page,
  request,
}) => {
  // microschool allows the full entity-type list (charter / private / catholic
  // / homeschool_coop strip out sole_practitioner). Seeding currentStep=6
  // lands on the Expenses step (step 7) once the wizard's one-time +1
  // "Story" migration shifts the saved index forward by one.
  const { token, modelId } = await seedModel(request, 6, {
    schoolName: "E2E State Triggers Academy",
    schoolType: "microschool",
    state: "CA",
    entityType: "llc_single",
    schoolStage: "new_school",
    plannedOpeningYear: "2026-27",
    fiscalYearStartMonth: 7,
  });
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);
  await dismissCategoryPickerIfShown(page);

  // CA llc_single profile: $800/yr minimum franchise tax + $70 one-time
  // LLC formation fee folded into Y1 → Y1 input shows 870.
  const row = stateFeeRow(page);
  await expect(row).toBeVisible();
  await expect(row.locator('input[type="number"]').first()).toHaveValue("870");

  // Switch the state to NY without changing the entity. The F3 reactive
  // effect should overwrite Y1 with NY's $9 annual + $1,500 publication
  // surcharge = $1,509.
  await jumpToStep(page, 2);
  const stateSelect = page.getByLabel("State");
  await expect(stateSelect).toHaveValue("CA");
  await stateSelect.selectOption("NY");
  await expect(stateSelect).toHaveValue("NY");
  await jumpToStep(page, 7);
  await dismissCategoryPickerIfShown(page);

  await expect(row).toBeVisible();
  await expect(row.locator('input[type="number"]').first()).toHaveValue("1509");

  // Switching to sole_practitioner removes the row entirely — sole props
  // don't owe entity filing fees, so the engine returns no profile and the
  // F3 effect strips the existing row.
  await jumpToStep(page, 2);
  const entitySelect = page.getByLabel("Entity Type");
  await expect(entitySelect).toHaveValue("llc_single");
  await entitySelect.selectOption("sole_practitioner");
  await expect(entitySelect).toHaveValue("sole_practitioner");
  await jumpToStep(page, 7);
  await dismissCategoryPickerIfShown(page);

  await expect(
    page.locator('input[value="State Entity Filing Fees"]'),
  ).toHaveCount(0);
});

test("Picking WA on the Staffing step re-seeds default rows with the WA SUI wage-base-aware payroll tax", async ({
  page,
  request,
}) => {
  // Seed with TX so the default staffing rows generate against TX payroll
  // components first. Then navigate back to School Details, switch to WA,
  // return to Staffing, and assert the Head of School row's *displayed*
  // payroll-tax $$ uses the WA SUI wage-base cap ($72,800) rather than a
  // flat blended rate × salary.
  //
  // NOTE on the displayed "Payroll Tax Rate" input: the wizard keeps every
  // row's headline rate synced to the model-level `staffing.payrollTaxRate`
  // (default = 8) via a reactive sync. So the visible rate input always
  // shows "8" regardless of state. The state-driven re-seed only updates
  // `payrollTaxComponents` (which the engine uses for the actual math),
  // hence we assert on the computed dollar amount, not the rate input.
  const { token, modelId } = await seedModel(request, 5, {
    schoolName: "E2E State Triggers Academy",
    schoolType: "microschool",
    state: "TX",
    entityType: "llc_single",
    schoolStage: "new_school",
    plannedOpeningYear: "2026-27",
    fiscalYearStartMonth: 7,
  });
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);

  // Default Head of School preset: full-time, FTE 1.0, salary $85,000.
  // Each row card is `<div class="rounded-xl border-2 ... bg-card ...">`,
  // distinct from the Expense step's `bg-white` cards.
  const headRow = page
    .locator("div.rounded-xl.bg-card")
    .filter({ hasText: "Head of School / Principal" })
    .first();
  await expect(headRow).toBeVisible();

  // Sanity-check the pre-WA TX baseline so the post-WA assertion is meaningful.
  // TX components: FICA (5,270) + Medicare (1,232.50) + FUTA (42) + TX SUI
  // (min(85k, 9k) × 2.7% = 243) = 6,787.50 → Math.round = $6,788.
  await expect(headRow.getByText("Payroll Taxes: $6,788")).toBeVisible();

  // Jump back to School Details, switch state to WA, return to Staffing.
  await jumpToStep(page, 2);
  await page.getByLabel("State").selectOption("WA");
  await jumpToStep(page, 6);

  // Wage-base-aware payroll tax for $85k Head of School in WA:
  //   FICA:    85,000 × 6.2%             = $5,270.00
  //   Medicare: 85,000 × 1.45%           = $1,232.50
  //   FUTA:    min(85k, 7,000) × 0.6%    = $42.00
  //   WA SUI:  min(85k, 72,800) × 1.22%  = $888.16   ← cap kicks in here
  //   WA PFML: 85,000 × 0.28%            = $238.00
  //   WA Comp: 85,000 × 0.4%             = $340.00
  //   = $8,010.66 → Math.round = $8,011.
  // Without the WA SUI wage-base cap the SUI line would be 85k × 1.22%
  // = $1,037, pushing the total to $8,160. The exact $8,011 figure proves
  // the WA wage-base components are wired in.
  await expect(headRow.getByText("Payroll Taxes: $8,011")).toBeVisible();
});
