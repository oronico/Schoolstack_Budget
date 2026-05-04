import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type ConsoleMessage,
} from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #354: companion smoke spec for the grouping/matrix surface that the
// six-paths smoke does not touch. The six-paths smoke proves each
// (schoolType, schoolStage) combo doesn't crash; it never flips on the new
// "both" grouping mode, never toggles individual grade chips, and never
// types into the matrix or hits "Didn't offer". That left an infinite-loop
// regression in the matrix's fan-out useEffect uncaught for several
// iterations before Task #352. This spec walks one founder persona through:
//
//   1. StoryStep — choose grouping mode "both", flip on K, 1st, and k5 band.
//   2. EnrollmentStep — type known values into the matrix cells for year1
//      and assert the displayed row total / column total / per-year total
//      all match the sum of what was typed.
//   3. Hit "Didn't offer" for the current-year actuals row and assert the
//      matrix cells in that row collapse to "—" placeholder buttons and the
//      row total reads 0.
//   4. Reload the model from the API and assert the matrix sums fanned out
//      correctly into `programs[0].year1` (the field downstream revenue,
//      staffing, and charter math actually consume).

const TEST_PASSWORD = "PlaywrightTest12345!";

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Build a minimal-but-valid seed payload for a private operating school in
// its second-or-later year. We pick:
//   - schoolType = private_school: defaults grouping to "grades", so the
//     test's "both" click is a real change (not a no-op).
//   - schoolStage = operating_school + operatingYear = second_year_plus:
//     enables BOTH the prior-year and current-year actuals columns, which
//     is required for the "Didn't offer" toggle to render.
//   - Caller passes one or more program ids/names. Single-program test
//     uses one row; the multi-program sibling test (Task #367) seeds two
//     so we can verify per-row reducer fan-out and column-total math.
function buildSeedPayload(
  programs: Array<{ id: string; name: string }>,
): Record<string, unknown> {
  const enrollment = { year1: 0, year2: 0, year3: 0, year4: 0, year5: 0 };
  return {
    name: "E2E Matrix + Grouping Academy",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "E2E Matrix + Grouping Academy",
        state: "MA",
        schoolType: "private_school",
        entityType: "nonprofit_501c3",
        schoolStage: "operating_school",
        fundingProfile: "tuition_based",
        operatingYear: "second_year_plus",
        openingYear: 2022,
        currentStudents: 60,
        longTermEnrollmentGoal: 120,
        maxCapacity: 180,
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        isAccredited: true,
        locationSecured: true,
        ownershipType: "rent",
        monthlyRent: 12000,
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
        bookkeeperMonthlyCost: 600,
        hasLawyer: false,
        lawyerMonthlyCost: 0,
        hasGeneralLiabilityInsurance: true,
        insuranceCost: 500,
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
        sameTuitionForAllBands: true,
      },
      enrollment,
      programs: programs.map((p) => ({
        id: p.id,
        name: p.name,
        annualTuition: 18000,
        priorYear: 0,
        currentYear: 0,
        year1: 0,
        year2: 0,
        year3: 0,
        year4: 0,
        year5: 0,
      })),
      revenue: {
        tuitionPerStudent: 18000,
        annualTuitionIncrease: 3,
        publicFundingPerStudent: 0,
        otherRevenuePerStudent: 0,
        scholarshipRate: 0,
        annualDonations: 0,
        foundationGrants: 0,
        capitalGifts: 0,
      },
      revenueRows: [],
      revenueDefaults: {
        billingMonths: 10,
        collectionMethod: "autopay",
        collectionRate: 100,
        collectionDelayDays: 0,
      },
      staffing: {
        studentsPerTeacher: 14,
        teacherSalary: 55000,
        adminStaffCount: 1,
        adminSalary: 65000,
        founderSalary: 0,
        offersBenefits: true,
        benefitsRate: 18,
        payrollTaxRate: 8,
      },
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
          staffingMode: "fixed",
        },
      ],
      facilities: {
        monthlyRent: 12000,
        annualRentIncrease: 3,
        annualUtilities: 24000,
        annualInsurance: 12000,
        annualSalaryIncrease: 3,
        generalCostInflation: 3,
      },
      expenseRows: [],
      capitalAndDebtRows: [],
      assumptionFlagResponses: [],
    },
  };
}

async function registerAndSeed(request: APIRequestContext): Promise<{ token: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-matrix-${stamp}@e2e.schoolstack.test`;

  // Same retry-on-429 pattern as the six-paths smoke spec.
  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });

  // stage = "existing" so the actuals (priorYear/currentYear) columns and
  // the "Didn't offer" toggle render — they're suppressed for yet-to-launch.
  await seedPersona(request, token, { stage: "existing", comfort: "comfortable" });

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

async function fetchModel(
  request: APIRequestContext,
  token: string,
  modelId: number,
): Promise<Record<string, unknown>> {
  const res = await request.get(`/api/models/${modelId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `fetch model failed: ${res.status()}`).toBeTruthy();
  return (await res.json()) as Record<string, unknown>;
}

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

function trackPageHealth(page: Page): { consoleErrors: string[]; dialogs: string[] } {
  const consoleErrors: string[] = [];
  const dialogs: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (text.includes("Failed to load resource")) return;
      if (text.includes("net::ERR_")) return;
      if (text.includes("favicon")) return;
      consoleErrors.push(text);
    }
  });

  page.on("pageerror", (err: Error) => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });

  page.on("dialog", async (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss().catch(() => undefined);
  });

  return { consoleErrors, dialogs };
}

test("wizard matrix + grouping: pick 'both', flip on K + 1st + k5, type into matrix, then 'Didn't offer'", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token } = await registerAndSeed(request);
  const programId = makeId("prog");
  const payload = buildSeedPayload([{ id: programId, name: "Full Day" }]);
  const modelId = await createModel(request, token, payload);

  const health = trackPageHealth(page);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);

  // Dismiss the "Here's what to expect" prep dialog if it appears. The
  // dialog opens on a useEffect that runs after the model finishes loading,
  // and its overlay intercepts pointer events for everything underneath —
  // so we must make sure it's gone before touching the wizard. Wait up to
  // 15s for the dialog (long enough for slow CI cold starts), click the
  // dismiss button, then assert the overlay is detached. If the dialog
  // never appears (e.g. localStorage already-seen flag), proceed silently.
  const prepDialog = page.getByRole("dialog", { name: /What to have ready/i });
  try {
    await prepDialog.waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: /Let.?s get started/i }).click();
    await prepDialog.waitFor({ state: "detached", timeout: 5_000 });
  } catch {
    // dialog never appeared — proceed
  }

  // Dismiss the cookie banner if present.
  const cookieDecline = page.getByRole("button", { name: /^Decline$/ });
  try {
    await cookieDecline.click({ timeout: 3000 });
  } catch {
    // never appeared — proceed
  }

  // ---------------------------------------------------------------------
  // Step 1 (Story): grouping + grade/band chip toggles.
  // ---------------------------------------------------------------------
  await expect(
    page.getByRole("heading", { name: /Let.?s start with your school.?s story/i }).first(),
  ).toBeVisible({ timeout: 15_000 });

  const bothBtn = page.getByTestId("story-grouping-mode-both");
  await expect(bothBtn, "story-grouping-mode-both should be visible").toBeVisible();
  await bothBtn.click();
  await expect(bothBtn).toHaveAttribute("aria-pressed", "true");

  // Picking "both" reveals the bands + grades selectors. Toggle the three
  // chips named in the task: K, 1st, k5 band.
  const kChip = page.getByTestId("story-grade-k");
  const g1Chip = page.getByTestId("story-grade-g1");
  const k5BandChip = page.getByTestId("story-grade-band-k5");
  await expect(kChip).toBeVisible();
  await expect(g1Chip).toBeVisible();
  await expect(k5BandChip).toBeVisible();

  await kChip.click();
  await g1Chip.click();
  // The k5 band is enabled by default for many school types — only click
  // when it isn't already on, otherwise we'd toggle it back off.
  const k5Pressed = await k5BandChip.getAttribute("aria-pressed");
  if (k5Pressed !== "true") {
    await k5BandChip.click();
  }
  await expect(kChip).toHaveAttribute("aria-pressed", "true");
  await expect(g1Chip).toHaveAttribute("aria-pressed", "true");
  await expect(k5BandChip).toHaveAttribute("aria-pressed", "true");

  // Continue → Step 2 (School Details).
  await page.getByRole("button", { name: /Continue/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /Tell Us About Your School/i }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // Continue → Step 3 (Enrollment).
  await page.getByRole("button", { name: /Continue/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /Programs\s*&\s*Enrollment/i }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // ---------------------------------------------------------------------
  // Step 3 (Enrollment): the matrix should now render with three columns
  // (k, g1, k5) for our single program. Type known values into year1.
  // ---------------------------------------------------------------------
  // Sanity-check the column headers — the matrix is wrapped in an
  // overflow-x-auto, so the cells live inside a table per actuals/forecast
  // year. Targeting cells by data-testid keeps us resilient to layout.
  const year1KCell = page.getByTestId(`matrix-cell-${programId}-year1-k`);
  const year1G1Cell = page.getByTestId(`matrix-cell-${programId}-year1-g1`);
  const year1K5Cell = page.getByTestId(`matrix-cell-${programId}-year1-k5`);
  await expect(year1KCell, "year1 K cell should exist after enabling K").toBeVisible({ timeout: 10_000 });
  await expect(year1G1Cell, "year1 1st cell should exist after enabling 1st").toBeVisible();
  await expect(year1K5Cell, "year1 k5 cell should exist after enabling k5 band").toBeVisible();

  const yearOneByGroup: Record<string, number> = { k: 12, g1: 14, k5: 18 };
  await year1KCell.fill(String(yearOneByGroup.k));
  await year1G1Cell.fill(String(yearOneByGroup.g1));
  await year1K5Cell.fill(String(yearOneByGroup.k5));

  const expectedRowSum = yearOneByGroup.k + yearOneByGroup.g1 + yearOneByGroup.k5;

  // Click outside to commit the last input value before reading the
  // computed totals (some browsers defer onChange flushes).
  await page.locator("body").click({ position: { x: 1, y: 1 } });

  // The wizard's matrix renders one card per year, each containing a table
  // whose last <td> is `sumProgramYear(programId, year1)`. The year card is
  // the nearest ancestor `<div>` with the `rounded-2xl` chrome class (see
  // EnrollmentStep.tsx). Walk up via xpath rather than guessing at the
  // text content — the card also includes the year heading, "Total: N",
  // table headers, and column-N/A buttons, so a `hasText` regex match
  // against the wrapper is brittle.
  const year1Card = year1KCell.locator(
    'xpath=ancestor::div[contains(@class, "rounded-2xl")][1]',
  );
  await expect(year1Card).toBeVisible();

  // The card header shows "Total: <sum>" — assert that overall total
  // matches the sum across our typed cells (single-program case).
  await expect(year1Card).toContainText(`Total: ${expectedRowSum}`);

  // Per-row total (the last numeric td in the program row). Easier: assert
  // by finding the unique numeric cell inside the row that contains all 3
  // matrix inputs.
  const programRow = year1Card.locator("tr").filter({
    has: page.getByTestId(`matrix-cell-${programId}-year1-k`),
  }).first();
  // The row total is the cell rendered with class `bg-secondary/20` and
  // shows just the integer sum. Reading the row's text is the cleanest
  // assertion that doesn't tie us to internal markup.
  const rowText = (await programRow.innerText()).replace(/\s+/g, " ");
  expect(
    rowText,
    `row text should include the row total ${expectedRowSum} once: "${rowText}"`,
  ).toContain(String(expectedRowSum));

  // ---------------------------------------------------------------------
  // Wait for autosave to flush (the form debounces saves at ~1s) and then
  // refetch the model from the API to verify the matrix really fanned its
  // sums out into programs[0].year1 — the field downstream revenue,
  // staffing, and charter math actually read.
  // ---------------------------------------------------------------------
  // The wizard debounces saves at ~1s. Wait two debounce windows to cover
  // both the matrix-cell save and the follow-up programs[].year1 fan-out
  // save fired by the matrix → programs useEffect.
  await page.waitForTimeout(2500);

  const reloaded = await fetchModel(request, token, modelId);
  const reloadedData = (reloaded as { data: Record<string, unknown> }).data;
  const reloadedPrograms = (reloadedData.programs ?? []) as Array<Record<string, unknown>>;
  expect(
    reloadedPrograms.length,
    "programs[] should still contain exactly one row",
  ).toBe(1);
  expect(
    reloadedPrograms[0].id,
    "the seeded program id should round-trip unchanged",
  ).toBe(programId);
  expect(
    reloadedPrograms[0].year1,
    `programs[0].year1 should equal the matrix row sum (${expectedRowSum})`,
  ).toBe(expectedRowSum);

  // Also verify the matrix itself round-tripped.
  const matrix = (reloadedData.programEnrollmentMatrix ?? {}) as Record<
    string,
    Record<string, Record<string, number | null>>
  >;
  expect(matrix[programId]?.year1?.k).toBe(yearOneByGroup.k);
  expect(matrix[programId]?.year1?.g1).toBe(yearOneByGroup.g1);
  expect(matrix[programId]?.year1?.k5).toBe(yearOneByGroup.k5);

  // ---------------------------------------------------------------------
  // "Didn't offer" — the toggle only renders for actuals years
  // (priorYear/currentYear). We seeded operatingYear="second_year_plus"
  // so both columns exist. Toggle currentYear, then assert all three
  // matrix cells in that row collapse to "—" placeholder buttons and the
  // row total reads 0.
  // ---------------------------------------------------------------------
  // Before toggling, type a non-zero into one current-year cell so we can
  // tell the toggle actually wiped it.
  const currentKCell = page.getByTestId(`matrix-cell-${programId}-currentYear-k`);
  await expect(currentKCell, "currentYear K cell should exist").toBeVisible();
  await currentKCell.fill("9");
  await page.locator("body").click({ position: { x: 1, y: 1 } });

  const naToggle = page.getByTestId(`matrix-na-${programId}-currentYear`);
  await expect(naToggle, "row-level 'Didn't offer' checkbox").toBeVisible();
  await naToggle.check();
  await expect(naToggle).toBeChecked();

  // After toggle: every cell in the row becomes the placeholder button
  // (rendered as `—`). The cell's testid is reused on the button, so the
  // matcher still resolves — we assert it is now a <button>, not <input>.
  for (const groupKey of ["k", "g1", "k5"]) {
    const cell = page.getByTestId(`matrix-cell-${programId}-currentYear-${groupKey}`);
    await expect(cell).toBeVisible();
    const tag = await cell.evaluate((el) => el.tagName);
    expect(
      tag.toLowerCase(),
      `currentYear/${groupKey} cell should be a placeholder <button> after "Didn't offer"`,
    ).toBe("button");
  }

  // The row total cell for currentYear should now display 0. Walk up from
  // the row-level "Didn't offer" checkbox to its enclosing year card the
  // same way we did for year1 — the card div carries the `rounded-2xl`
  // chrome class.
  const currentYearCard = naToggle.locator(
    'xpath=ancestor::div[contains(@class, "rounded-2xl")][1]',
  );
  await expect(currentYearCard).toBeVisible();
  const currentRow = currentYearCard.locator("tr").filter({
    has: page.getByTestId(`matrix-na-${programId}-currentYear`),
  }).first();
  const currentRowText = (await currentRow.innerText()).replace(/\s+/g, " ");
  // Sum cell renders as a bare integer ("0") in the program row.
  expect(
    /\b0\b/.test(currentRowText),
    `currentYear row total should be 0 after "Didn't offer": "${currentRowText}"`,
  ).toBe(true);
  // And the previously-typed 9 should NOT appear in the row anymore.
  expect(
    currentRowText,
    `currentYear row should no longer show the typed "9" after "Didn't offer": "${currentRowText}"`,
  ).not.toContain("9");

  // Final health check.
  expect(
    health.consoleErrors,
    `browser console errors:\n${health.consoleErrors.join("\n---\n")}`,
  ).toEqual([]);
  expect(
    health.dialogs,
    `unexpected blocking dialogs:\n${health.dialogs.join("\n---\n")}`,
  ).toEqual([]);
});

// Task #367: companion to the single-program walk above. The fan-out from
// `programEnrollmentMatrix[programId][year][group]` into
// `programs[i].year1` is shared across every program/year, so a regression
// in `sumProgramYear` or in the matrix → programs useEffect could easily
// land per-program totals on the wrong row without a multi-program test
// catching it. Column totals at the bottom of each year card are computed
// independently (see EnrollmentStep.tsx ~line 1136), so we assert them
// separately rather than as a sum of the per-row totals.
test("wizard matrix + grouping: two programs fan out to per-row year1 and column totals roll up independently", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token } = await registerAndSeed(request);
  const programAId = makeId("progA");
  const programBId = makeId("progB");
  const payload = buildSeedPayload([
    { id: programAId, name: "Full Day" },
    { id: programBId, name: "Half Day" },
  ]);
  const modelId = await createModel(request, token, payload);

  const health = trackPageHealth(page);
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);

  const prepDialog = page.getByRole("dialog", { name: /What to have ready/i });
  try {
    await prepDialog.waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: /Let.?s get started/i }).click();
    await prepDialog.waitFor({ state: "detached", timeout: 5_000 });
  } catch {
    // dialog never appeared — proceed
  }

  const cookieDecline = page.getByRole("button", { name: /^Decline$/ });
  try {
    await cookieDecline.click({ timeout: 3000 });
  } catch {
    // never appeared — proceed
  }

  // ---------------------------------------------------------------------
  // Step 1 (Story): same grouping setup as the single-program test — pick
  // "both", enable K + 1st + k5 band so the matrix renders three columns.
  // ---------------------------------------------------------------------
  await expect(
    page.getByRole("heading", { name: /Let.?s start with your school.?s story/i }).first(),
  ).toBeVisible({ timeout: 15_000 });

  const bothBtn = page.getByTestId("story-grouping-mode-both");
  await expect(bothBtn).toBeVisible();
  await bothBtn.click();
  await expect(bothBtn).toHaveAttribute("aria-pressed", "true");

  const kChip = page.getByTestId("story-grade-k");
  const g1Chip = page.getByTestId("story-grade-g1");
  const k5BandChip = page.getByTestId("story-grade-band-k5");
  await kChip.click();
  await g1Chip.click();
  const k5Pressed = await k5BandChip.getAttribute("aria-pressed");
  if (k5Pressed !== "true") {
    await k5BandChip.click();
  }
  await expect(kChip).toHaveAttribute("aria-pressed", "true");
  await expect(g1Chip).toHaveAttribute("aria-pressed", "true");
  await expect(k5BandChip).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /Continue/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /Tell Us About Your School/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Continue/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /Programs\s*&\s*Enrollment/i }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // ---------------------------------------------------------------------
  // Step 3 (Enrollment): type known year1 values into BOTH programs. We
  // choose values so every per-row sum, every per-column sum, and the
  // year total are unique integers, which lets us assert with
  // toContainText / toHaveText without worrying about a number from one
  // total accidentally matching another.
  //
  //                k    g1   k5   row sum
  //   Full Day     10   20   30   60
  //   Half Day      5   15   25   45
  //   col total    15   35   55   105 (year total)
  // ---------------------------------------------------------------------
  const yearOneA: Record<string, number> = { k: 10, g1: 20, k5: 30 };
  const yearOneB: Record<string, number> = { k: 5, g1: 15, k5: 25 };
  const expectedRowSumA = yearOneA.k + yearOneA.g1 + yearOneA.k5;
  const expectedRowSumB = yearOneB.k + yearOneB.g1 + yearOneB.k5;
  const expectedColK = yearOneA.k + yearOneB.k;
  const expectedColG1 = yearOneA.g1 + yearOneB.g1;
  const expectedColK5 = yearOneA.k5 + yearOneB.k5;
  const expectedYearTotal = expectedRowSumA + expectedRowSumB;

  for (const [pid, vals] of [
    [programAId, yearOneA],
    [programBId, yearOneB],
  ] as const) {
    const kCell = page.getByTestId(`matrix-cell-${pid}-year1-k`);
    const g1Cell = page.getByTestId(`matrix-cell-${pid}-year1-g1`);
    const k5Cell = page.getByTestId(`matrix-cell-${pid}-year1-k5`);
    await expect(kCell).toBeVisible({ timeout: 10_000 });
    await expect(g1Cell).toBeVisible();
    await expect(k5Cell).toBeVisible();
    await kCell.fill(String(vals.k));
    await g1Cell.fill(String(vals.g1));
    await k5Cell.fill(String(vals.k5));
  }

  // Click outside to commit the last input value.
  await page.locator("body").click({ position: { x: 1, y: 1 } });

  // Find the year1 card via the program-A K cell, walking up to the
  // wrapper div (same `rounded-2xl` chrome class as the single-program
  // test).
  const year1Card = page
    .getByTestId(`matrix-cell-${programAId}-year1-k`)
    .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
  await expect(year1Card).toBeVisible();

  // Header total (rendered as "Total: <sum>").
  await expect(year1Card).toContainText(`Total: ${expectedYearTotal}`);

  // Per-program row totals — each row is the <tr> that contains the
  // program's matrix inputs, and its row-total cell is the last numeric
  // cell. Asserting on innerText keeps us decoupled from cell ordering.
  const rowA = year1Card.locator("tr").filter({
    has: page.getByTestId(`matrix-cell-${programAId}-year1-k`),
  }).first();
  const rowB = year1Card.locator("tr").filter({
    has: page.getByTestId(`matrix-cell-${programBId}-year1-k`),
  }).first();
  const rowAText = (await rowA.innerText()).replace(/\s+/g, " ");
  const rowBText = (await rowB.innerText()).replace(/\s+/g, " ");
  expect(
    rowAText,
    `Full Day row total should equal ${expectedRowSumA}: "${rowAText}"`,
  ).toContain(String(expectedRowSumA));
  expect(
    rowBText,
    `Half Day row total should equal ${expectedRowSumB}: "${rowBText}"`,
  ).toContain(String(expectedRowSumB));
  // Cross-check: each row should NOT contain the OTHER program's row sum
  // (60 vs 45 are unique values not present in any column total). This
  // catches a per-row reducer that accidentally aggregates across rows.
  expect(
    rowAText,
    `Full Day row should not bleed into Half Day's sum (${expectedRowSumB}): "${rowAText}"`,
  ).not.toContain(String(expectedRowSumB));
  expect(
    rowBText,
    `Half Day row should not bleed into Full Day's sum (${expectedRowSumA}): "${rowBText}"`,
  ).not.toContain(String(expectedRowSumA));

  // Column totals at the bottom of the year card. The "Column total" row
  // is rendered as a final <tr> with the literal text "Column total" in
  // its first <td>; subsequent cells are one per group then the year
  // total. We assert each column's td by index rather than computing the
  // year total as a sum of row totals — that's what makes this test
  // independent of the row-sum logic.
  const colTotalRow = year1Card.locator("tr").filter({ hasText: /Column total/ }).first();
  await expect(colTotalRow).toBeVisible();
  const colCells = colTotalRow.locator("td");
  await expect(colCells.nth(1)).toHaveText(String(expectedColK));
  await expect(colCells.nth(2)).toHaveText(String(expectedColG1));
  await expect(colCells.nth(3)).toHaveText(String(expectedColK5));
  // Last cell is the year total.
  await expect(colCells.nth(4)).toHaveText(String(expectedYearTotal));

  // ---------------------------------------------------------------------
  // Wait for autosave + the matrix → programs useEffect, then refetch
  // the model and assert each program's year1 received its own row sum
  // (not the other program's, not the year total).
  // ---------------------------------------------------------------------
  await page.waitForTimeout(2500);

  const reloaded = await fetchModel(request, token, modelId);
  const reloadedData = (reloaded as { data: Record<string, unknown> }).data;
  const reloadedPrograms = (reloadedData.programs ?? []) as Array<Record<string, unknown>>;
  expect(
    reloadedPrograms.length,
    "programs[] should still contain exactly two rows",
  ).toBe(2);

  const byId = new Map(reloadedPrograms.map((p) => [p.id as string, p]));
  expect(byId.has(programAId), "Full Day program id should round-trip").toBe(true);
  expect(byId.has(programBId), "Half Day program id should round-trip").toBe(true);
  expect(
    byId.get(programAId)?.year1,
    `programs[Full Day].year1 should equal its own row sum (${expectedRowSumA})`,
  ).toBe(expectedRowSumA);
  expect(
    byId.get(programBId)?.year1,
    `programs[Half Day].year1 should equal its own row sum (${expectedRowSumB})`,
  ).toBe(expectedRowSumB);

  // And the matrix itself round-tripped per program/group.
  const matrix = (reloadedData.programEnrollmentMatrix ?? {}) as Record<
    string,
    Record<string, Record<string, number | null>>
  >;
  expect(matrix[programAId]?.year1?.k).toBe(yearOneA.k);
  expect(matrix[programAId]?.year1?.g1).toBe(yearOneA.g1);
  expect(matrix[programAId]?.year1?.k5).toBe(yearOneA.k5);
  expect(matrix[programBId]?.year1?.k).toBe(yearOneB.k);
  expect(matrix[programBId]?.year1?.g1).toBe(yearOneB.g1);
  expect(matrix[programBId]?.year1?.k5).toBe(yearOneB.k5);

  expect(
    health.consoleErrors,
    `browser console errors:\n${health.consoleErrors.join("\n---\n")}`,
  ).toEqual([]);
  expect(
    health.dialogs,
    `unexpected blocking dialogs:\n${health.dialogs.join("\n---\n")}`,
  ).toEqual([]);
});
