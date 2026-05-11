import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #792: end-to-end guard for the Revenue-step "Restricted (capital/program)"
// philanthropy toggle introduced in Task #647.
//
// The toggle marks a philanthropy row as restricted, which makes the
// scenario engine carve those gifts out of unrestricted operating cash
// (see lib/finance/src/restricted-revenue.ts + scenario-engine.ts). DSCR
// and runway are computed off unrestricted cash, so flipping the toggle
// must (a) move the dashboard's Unrestricted Cash hero down by the
// restricted amount, and (b) survive a save+reload of the model.
//
// Without this guard a future refactor could silently stop persisting
// `isRestricted` (e.g. by dropping it from the schema, the form payload,
// or the engine's restricted-row check) and DSCR would be propped up by
// money the school can't legally spend on operations.

const TEST_PASSWORD = "PlaywrightTest12345!";

// Stable id keeps the data-testid for the restricted checkbox deterministic
// (`revenue-row-${row.id}-restricted`). Must NOT start with `restricted_` so
// the default `row.id.startsWith("restricted_")` fallback leaves the checkbox
// unchecked at first render — otherwise we'd be asserting our own seed.
const PHILANTHROPY_ROW_ID = "phil_annual_fund_e2e";

// Sized so flipping the restricted toggle moves unrestricted cash by a
// material amount the dashboard headline rounds to a different value.
const PHILANTHROPY_AMOUNT_PER_YEAR = 150_000;

interface SeededFixture {
  token: string;
  modelId: number;
}

async function seedModel(request: APIRequestContext): Promise<SeededFixture> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-restricted-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Playwright Founder",
  });
  await seedPersona(request, token);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const enrollmentArr = [80, 85, 90, 95, 100];
  const tuition = 14_500;
  const fivePhilanthropyAmounts = new Array(5).fill(PHILANTHROPY_AMOUNT_PER_YEAR);

  const createRes = await request.post("/api/models", {
    headers: authHeaders,
    data: {
      name: "E2E Restricted Philanthropy Academy",
      currentStep: 4,
      data: {
        schoolProfile: {
          schoolName: "E2E Restricted Philanthropy Academy",
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
        enrollment: { year1: 80, year2: 85, year3: 90, year4: 95, year5: 100 },
        revenueSources: {
          tuition: true,
          publicFunding: false,
          schoolChoice: false,
          philanthropy: true,
        },
        revenueRows: [
          {
            id: "tuition_base",
            lineItem: "Tuition",
            category: "tuition_and_fees",
            enabled: true,
            driverType: "per_student",
            amounts: new Array(5).fill(tuition),
          },
          {
            // Stable, non-`restricted_*` id so the restricted checkbox
            // defaults to unchecked. We flip it on in the test.
            id: PHILANTHROPY_ROW_ID,
            lineItem: "Annual fund",
            category: "philanthropy",
            enabled: true,
            driverType: "annual_fixed",
            amounts: fivePhilanthropyAmounts,
          },
        ],
        staffingRows: [
          {
            id: "lead_teacher_1",
            roleName: "Lead Teacher",
            functionCategory: "instructional",
            employmentType: "full_time",
            staffingMode: "fixed",
            fte: 4,
            annualizedRate: 55_000,
            benefitsEligible: true,
            benefitsRate: 18,
            payrollTaxRate: 8,
            payrollLike: true,
          },
        ],
        expenseRows: [
          {
            id: "ops_admin_e2e",
            category: "operations",
            lineItem: "General operations",
            enabled: true,
            driverType: "annual_fixed",
            amounts: [400_000, 410_000, 420_000, 430_000, 440_000],
          },
        ],
        openingBalances: { cash: 100_000 },
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

// Parse the formatted currency string the hero renders (e.g. "$1,234,567")
// back into a number we can compare. Returns NaN if the headline isn't a
// recognizable money string yet (we wait for it to settle before reading).
function parseCurrency(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return NaN;
  return Number(cleaned);
}

async function readUnrestrictedCashHeadline(page: Page): Promise<number> {
  const headline = page.getByTestId("unrestricted-cash-headline");
  await expect(headline).toBeVisible({ timeout: 30_000 });
  // The headline mounts after the model fetch resolves; give react-query a
  // beat to settle before snapshotting so we don't read a transitional value.
  await page.waitForTimeout(500);
  const text = (await headline.textContent()) ?? "";
  const value = parseCurrency(text);
  expect(
    Number.isFinite(value),
    `expected a numeric unrestricted cash headline, got: ${text}`,
  ).toBeTruthy();
  return value;
}

test("restricted philanthropy toggle drops unrestricted cash and survives reload", async ({
  page,
  request,
}) => {
  const { token, modelId } = await seedModel(request);
  await primeAuthToken(page, token);

  // ---- Baseline: dashboard hero before the toggle is flipped ----
  await page.goto("/dashboard");
  const baselineUnrestricted = await readUnrestrictedCashHeadline(page);

  // ---- Flip the restricted toggle on the Revenue step ----
  await page.goto(`/model/${modelId}?step=4`);
  await expect(
    page
      .getByRole("heading", {
        name: /Where Does Your Money Come From|Revenue by Source/i,
      })
      .first(),
  ).toBeVisible({ timeout: 30_000 });

  const restrictedCheckbox = page.getByTestId(
    `revenue-row-${PHILANTHROPY_ROW_ID}-restricted`,
  );
  // The Philanthropy category card may render collapsed even when its rows
  // are enabled. Expand it if the checkbox isn't in the DOM yet.
  if (!(await restrictedCheckbox.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /Philanthropy/i })
      .first()
      .click()
      .catch(() => undefined);
  }
  await expect(restrictedCheckbox).toBeVisible({ timeout: 15_000 });

  // The seeded row id doesn't start with `restricted_` and isRestricted is
  // unset, so the checkbox should default to unchecked. This both documents
  // the default and prevents a silent regression where the inferred default
  // flips on every philanthropy row.
  await expect(restrictedCheckbox).not.toBeChecked();

  await restrictedCheckbox.check();
  await expect(restrictedCheckbox).toBeChecked();

  // Give the wizard's debounced auto-save time to flush the new value to
  // /api/models before we navigate away. Same delay used by the inline
  // rationale persistence spec for the same reason.
  await page.waitForTimeout(2_000);

  // ---- Verify the API persisted isRestricted=true ----
  const refetched = await request.get(`/api/models/${modelId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(refetched.ok()).toBeTruthy();
  const body = (await refetched.json()) as {
    data?: { revenueRows?: Array<{ id?: string; isRestricted?: boolean }> };
  };
  const persistedRow = (body.data?.revenueRows ?? []).find(
    (r) => r.id === PHILANTHROPY_ROW_ID,
  );
  expect(
    persistedRow,
    "expected the seeded philanthropy row to round-trip to the API",
  ).toBeTruthy();
  expect(persistedRow?.isRestricted).toBe(true);

  // ---- Reload the wizard and assert the checkbox state survives ----
  await page.goto(`/model/${modelId}?step=4`);
  await expect(
    page
      .getByRole("heading", {
        name: /Where Does Your Money Come From|Revenue by Source/i,
      })
      .first(),
  ).toBeVisible({ timeout: 30_000 });

  const restrictedAfterReload = page.getByTestId(
    `revenue-row-${PHILANTHROPY_ROW_ID}-restricted`,
  );
  if (!(await restrictedAfterReload.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /Philanthropy/i })
      .first()
      .click()
      .catch(() => undefined);
  }
  await expect(restrictedAfterReload).toBeVisible({ timeout: 15_000 });
  await expect(restrictedAfterReload).toBeChecked();

  // ---- Dashboard now reflects the carved-out unrestricted cash ----
  await page.goto("/dashboard");
  const updatedUnrestricted = await readUnrestrictedCashHeadline(page);

  // The engine subtracts cumulative restricted gifts from cashPosition, so
  // the headline must drop by AT LEAST one year's restricted philanthropy.
  // We use a generous lower bound (one year, not all five) to stay robust to
  // future engine tweaks that change which year drives the headline.
  const drop = baselineUnrestricted - updatedUnrestricted;
  expect(
    drop,
    `expected unrestricted cash to drop by at least ~one year of restricted philanthropy ($${PHILANTHROPY_AMOUNT_PER_YEAR}); baseline=${baselineUnrestricted}, updated=${updatedUnrestricted}`,
  ).toBeGreaterThanOrEqual(PHILANTHROPY_AMOUNT_PER_YEAR * 0.95);
});
