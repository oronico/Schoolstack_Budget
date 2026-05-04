import { seedPersona } from "./utils/seed-persona";
import { test, expect, type APIRequestContext, type Page } from "./utils/test";

// Task #474: end-to-end coverage for the Extend-to-5-Year flow.
//
// The deterministic seeder is unit-tested in src/lib/seed-five-year.test.ts,
// but nothing currently walks the full UI path: build a single-year model →
// click the "Extend to 5-year" banner → confirm the modal → land on the
// Enrollment step → see non-zero Y2-Y5 across enrollment, revenue, and
// expense steps. Without this safety net a future schema or wizard-routing
// change could silently regress the seeded ramp.

const TEST_PASSWORD = "PlaywrightTest12345!";

const PROGRAM_NAME = "Extend Demo Program";
const REVENUE_LINE_ITEM = "Extend Demo Tuition";
const EXPENSE_LINE_ITEM = "Extend Demo Salaries";

async function registerAndSeed(request: APIRequestContext): Promise<string> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-extend-five-year-${stamp}@e2e.schoolstack.test`;
  const backoffsMs = [2000, 5000, 10000, 20000, 30000];
  let res = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
  });
  for (const wait of backoffsMs) {
    if (res.status() !== 429) break;
    await new Promise((r) => setTimeout(r, wait));
    res = await request.post("/api/auth/register", {
      data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
    });
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

async function createSingleYearModel(
  request: APIRequestContext,
  token: string,
): Promise<number> {
  const payload = {
    name: "E2E Extend To Five Year",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "E2E Extend Academy",
        state: "MA",
        schoolType: "private_school",
        entityType: "nonprofit_501c3",
        schoolStage: "new_school",
        fundingProfile: "tuition_based",
        modelDuration: "single_year",
        plannedOpeningYear: "2027",
        openingYear: 2027,
        currentStudents: 0,
        longTermEnrollmentGoal: 120,
        maxCapacity: 150,
        fiscalYearStartMonth: 7,
        ownershipType: "rent",
        monthlyRent: 8000,
        accountingBasis: "accrual",
      },
      enrollment: { year1: 60, year2: 0, year3: 0, year4: 0, year5: 0 },
      programs: [
        {
          id: "prog-extend-1",
          name: PROGRAM_NAME,
          annualTuition: 10000,
          year1: 60,
          year2: 0,
          year3: 0,
          year4: 0,
          year5: 0,
        },
      ],
      revenueRows: [
        {
          id: "rev-extend-1",
          category: "tuition_and_fees",
          lineItem: REVENUE_LINE_ITEM,
          enabled: true,
          driverType: "annual_fixed",
          amounts: [600000, 0, 0, 0, 0],
          note: "",
        },
      ],
      staffingRows: [],
      expenseRows: [
        {
          id: "exp-extend-1",
          // Must match a real ExpenseStep operating-category key so the row
          // renders inside the "Program" accordion and isn't filtered out.
          category: "instructional_program",
          lineItem: EXPENSE_LINE_ITEM,
          enabled: true,
          driverType: "annual_fixed",
          amounts: [400000, 0, 0, 0, 0],
          note: "",
        },
      ],
      capitalAndDebtRows: [],
      assumptionFlagResponses: [],
    },
  };
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
  }, value(token));
}
// Helper to widen the type for addInitScript's serializable arg.
function value<T>(v: T): T {
  return v;
}

// Click a sidebar step button by its visible title. The rail buttons render
// only the step number (or a check icon when complete), so we look up the
// numbered button via its sibling title span.
async function jumpToStep(page: Page, title: string): Promise<void> {
  const clicked = await page.evaluate((t) => {
    const spans = Array.from(
      document.querySelectorAll<HTMLSpanElement>("span.uppercase.tracking-wider"),
    );
    const span = spans.find((s) => (s.textContent ?? "").trim() === t);
    const wrapper = span?.parentElement;
    const btn = wrapper?.querySelector("button");
    if (btn) {
      (btn as HTMLButtonElement).click();
      return true;
    }
    return false;
  }, title);
  expect(clicked, `could not find sidebar step "${title}"`).toBeTruthy();
}

// Read all numeric input values inside a row matching the given text. The
// Enrollment table renders the program name as a plain text node, while the
// Revenue/Expense row cards render the line item inside an editable text
// input — so we accept either textContent OR an `<input value="...">` as
// the anchor for finding the row container.
async function readRowAmounts(page: Page, rowText: string): Promise<number[]> {
  return page.evaluate((needle) => {
    const containsNeedle = (el: HTMLElement): boolean => {
      if ((el.textContent ?? "").includes(needle)) return true;
      const inputs = el.querySelectorAll<HTMLInputElement>(
        'input[type="text"], input:not([type])',
      );
      for (const i of inputs) {
        if ((i.value ?? "").includes(needle)) return true;
      }
      return false;
    };
    const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
    let target: HTMLElement | null = null;
    let smallestSize = Number.POSITIVE_INFINITY;
    for (const el of all) {
      if (!containsNeedle(el)) continue;
      const inputs = el.querySelectorAll('input[type="number"]');
      if (inputs.length < 5) continue;
      // Prefer the *smallest* container that wraps the needle plus 5+ year
      // inputs — the page has many ancestors that all qualify, but only the
      // immediate row card has exactly the seeded row's numbers.
      const size = el.outerHTML.length;
      if (size < smallestSize) {
        smallestSize = size;
        target = el;
      }
    }
    if (!target) return [];
    const inputs = Array.from(
      target.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    );
    return inputs.slice(0, 5).map((i) => Number(i.value || "0"));
  }, rowText);
}

test("Extend-to-5-Year seeds non-zero Y2-Y5 across enrollment, revenue, and expense steps", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const token = await registerAndSeed(request);
  const modelId = await createSingleYearModel(request, token);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);

  // Dismiss the wizard prep dialog if it appears.
  try {
    await page.getByRole("button", { name: /Let.?s get started/i }).click({ timeout: 8000 });
  } catch {
    // not shown — fine
  }

  // Wait for the wizard chrome to settle on Step 1.
  await expect(
    page.getByRole("heading", { name: /Let.?s start with your school.?s story/i }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // The single-year banner must be present — its existence is what tells us
  // the form picked up modelDuration: "single_year" from the server payload.
  await expect(page.getByTestId("banner-extend-to-five-year")).toBeVisible();

  // Click the banner's "Extend to 5-year" button to open the confirmation
  // modal, then confirm.
  await page.getByTestId("banner-extend-to-five-year").click();
  const modal = page.getByRole("dialog", { name: /Extend to a 5-year projection/i });
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: /Extend to 5-Year/i }).click();

  // Modal closes and the banner disappears once the form flips to
  // five_year mode.
  await expect(modal).toBeHidden();
  await expect(page.getByTestId("banner-extend-to-five-year")).toHaveCount(0);

  // 1. Wizard lands on the Enrollment step.
  await expect(
    page.getByRole("heading", { name: /Programs & Enrollment/i }),
  ).toBeVisible({ timeout: 10_000 });

  // 2. Enrollment Y2-Y5 fields match the documented seed rule. The form
  //    payload doesn't override schoolProfile.enrollmentGrowthRate, so the
  //    seeder applies the documented default of 0% growth → Y1 held flat
  //    across Y2-Y5. The program-row inputs are the canonical surface —
  //    enrollment.yearN is derived from the sum of program.yearN, so seeing
  //    the ramp on the program row covers both fields.
  //
  //    These are exact-value assertions (not just non-zero) so that any
  //    accidental change to enrollmentGrowthPct, the escalation formula, or
  //    the rounding strategy in seed-five-year.ts trips this test.
  await expect
    .poll(async () => (await readRowAmounts(page, PROGRAM_NAME))[1] ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(0);
  const enrollmentAmounts = await readRowAmounts(page, PROGRAM_NAME);
  // Documented default: enrollmentGrowthPct = 0 → Y1=60 held flat.
  expect(enrollmentAmounts).toEqual([60, 60, 60, 60, 60]);

  // 3. Revenue step: tuition_and_fees rows escalate at the documented
  //    default tuitionEscalationPct of 3%/yr (Y1 * 1.03^n, rounded).
  //    Task #494 — locate the row by its stable data-testid and read each
  //    `amount-y{N}` input directly instead of DOM-walking.
  await jumpToStep(page, "Revenue");
  const revenueRow = page.getByTestId("revenue-row-rev-extend-1");
  await expect(revenueRow).toBeVisible({ timeout: 10_000 });
  const revenueAmounts: number[] = [];
  for (let yi = 1; yi <= 5; yi++) {
    const input = revenueRow.getByTestId(`amount-y${yi}`);
    await expect(input).toBeVisible({ timeout: 10_000 });
    revenueAmounts.push(Number((await input.inputValue()) || "0"));
  }
  // 600000 * 1.03^n, rounded — matches escalate() in seed-five-year.ts.
  const expectedRevenue = [
    600000,
    Math.round(600000 * 1.03),
    Math.round(600000 * Math.pow(1.03, 2)),
    Math.round(600000 * Math.pow(1.03, 3)),
    Math.round(600000 * Math.pow(1.03, 4)),
  ];
  expect(expectedRevenue).toEqual([600000, 618000, 636540, 655636, 675305]);
  expect(revenueAmounts).toEqual(expectedRevenue);

  // 4. Expense step: Y2-Y5 amount cells are non-zero. We can't assert exact
  //    values here the way we do for enrollment/revenue: the ExpenseStep
  //    re-runs its own per-category escalation rule against Y1 and overwrites
  //    any Y2-Y5 cell the founder hasn't manually edited (see
  //    `escalatedAmounts` in ExpenseStep.tsx). So the on-screen Y2-Y5 values
  //    reflect the wizard's category rule, not seed-five-year.ts directly —
  //    locking the seed math here would actually pin the wizard's rule. The
  //    exact expense escalation math is asserted at the unit level
  //    (src/lib/seed-five-year.test.ts).
  //    The category accordion state ("Program" group for our seeded
  //    `instructional_program` row) can race with the form reset — toggle
  //    until the seeded row is mounted, then expand the row card so the
  //    per-year grid renders.
  await jumpToStep(page, "Expenses");
  const programHeader = page
    .getByRole("button", { name: /^Program\b.*active/i })
    .first();
  await expect(programHeader).toBeVisible({ timeout: 10_000 });
  const expenseRow = page.getByTestId("expense-row-exp-extend-1");
  await expect
    .poll(
      async () => {
        if (!(await expenseRow.count())) {
          await programHeader.click().catch(() => {});
        }
        return expenseRow.count();
      },
      { timeout: 15_000, intervals: [500, 1000, 1500] },
    )
    .toBeGreaterThan(0);
  await expenseRow.getByTestId("expand-row-exp-extend-1").click();
  const expenseAmounts: number[] = [];
  for (let yi = 1; yi <= 5; yi++) {
    const input = expenseRow.getByTestId(`amount-y${yi}`);
    await expect(input).toBeVisible({ timeout: 10_000 });
    expenseAmounts.push(Number((await input.inputValue()) || "0"));
  }
  expect(expenseAmounts[0]).toBe(400000);
  for (let i = 1; i < 5; i++) {
    expect(
      expenseAmounts[i],
      `expense year${i + 1} should be non-zero, got ${expenseAmounts[i]}`,
    ).toBeGreaterThan(0);
  }
});
