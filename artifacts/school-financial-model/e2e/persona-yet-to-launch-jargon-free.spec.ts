import {
  test,
  expect,
  type APIRequestContext,
  type Page,
  type ConsoleMessage,
} from "./utils/test";
import {
  expectNoForbiddenTerms,
  sweepPage,
} from "./utils/jargon-free";

// Task #304: a yet_to_launch + new_to_budgeting founder must NEVER see
// actuals / prior-year / QuickBooks / Xero / variance / forecast-accuracy
// language in the wizard, on the scenarios page, or in the lazy-loaded
// What-If drawer. The vitest render check
// (`persona-yet-to-launch.test.tsx`, Task #302) covers three wizard steps
// with a mocked auth context, but it can't catch surfaces that are lazy-
// loaded by the real Suspense boundaries (e.g. the WhatIf drawer) or that
// only mount once a saved scenario exists on the page (e.g. the actuals
// editor on a CustomScenarioCard).
//
// Task #426 extends the same contract to the dashboard — a returning
// founder lands there most often, and a new coach card or "what's new"
// banner could quietly reintroduce forbidden language. The forbidden-term
// list itself lives in `./utils/jargon-free.ts` so the dashboard sweep
// and the wizard sweep can't drift apart.
//
// This spec also covers the persona modal contract: a brand-new user with
// no persona seeded must see the FounderPersonaPrompt overlay on the
// dashboard, the modal must NOT dismiss on a backdrop click in first-time
// mode, and the Continue button must stay disabled until both stage and
// comfort are picked.

const TEST_PASSWORD = "PlaywrightTest12345!";

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Per-step desktop heading, mirrors the smoke-test list. Used to wait for
// each step to actually render before sweeping its text — otherwise we'd
// race the lazy Suspense fallback and false-pass on an empty surface.
const STEP_HEADINGS: Array<{ step: number; title: string; heading: RegExp }> = [
  { step: 1,  title: "Story",                    heading: /Let.?s start with your school.?s story/i },
  { step: 2,  title: "School Details",           heading: /Tell Us About Your School/i },
  { step: 3,  title: "Enrollment",               heading: /Programs\s*&\s*Enrollment/i },
  { step: 4,  title: "Revenue",                  heading: /Revenue by Source|Where Does Your Money Come From/i },
  { step: 5,  title: "Staffing",                 heading: /Tell Us About Your Leadership and Staff/i },
  { step: 6,  title: "Expenses",                 heading: /Expenses\s*&\s*Operations|What Does Your School Spend On/i },
  { step: 7,  title: "Capital & Financing",      heading: /Capital\s*&\s*Financing/i },
  { step: 8,  title: "Assumptions & Sensitivity", heading: /Assumptions\s*&\s*Sensitivity/i },
  { step: 9,  title: "Review",                   heading: /Does Everything Look Right/i },
  { step: 10, title: "Consultant",               heading: /What Our Analysis Found|Running Your Financial Analysis|Analysis Unavailable/i },
  { step: 11, title: "Narrative",                heading: /Lender Narrative/i },
  { step: 12, title: "Export",                   heading: /Your reports are ready|Ready to export your model/i },
];

// Build a fully-populated yet_to_launch private-school model. Mirrors the
// "private new" combination from wizard-smoke-six-paths so every step has
// enough data to satisfy its react-hook-form `trigger()` validation.
function buildYetToLaunchModel(): Record<string, unknown> {
  const baseEnrollment = 80;
  const tuitionPerStudent = 22000;

  const enrollment = {
    year1: baseEnrollment,
    year2: Math.round(baseEnrollment * 1.15),
    year3: Math.round(baseEnrollment * 1.30),
    year4: Math.round(baseEnrollment * 1.45),
    year5: Math.round(baseEnrollment * 1.60),
  };
  const enrollmentArr = [
    enrollment.year1,
    enrollment.year2,
    enrollment.year3,
    enrollment.year4,
    enrollment.year5,
  ];

  const schoolProfile: Record<string, unknown> = {
    schoolName: "E2E Future Academy",
    state: "MA",
    schoolType: "private_school",
    entityType: "nonprofit_501c3",
    // The core gate: yet_to_launch founders are always tied to a new_school
    // — that's what hides the prior-year / QuickBooks / actuals panels.
    schoolStage: "new_school",
    fundingProfile: "tuition_based",
    plannedOpeningYear: "2027",
    openingYear: 2027,
    currentStudents: 0,
    longTermEnrollmentGoal: enrollment.year5,
    maxCapacity: Math.round(enrollment.year5 * 1.25),
    fiscalYearStartMonth: 7,
    isPartialFirstYear: false,
    year1OperatingMonths: 12,
    isAccredited: false,
    locationSecured: false,
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
    hasLoan: false,
    loanAmount: 0,
    loanRate: 0,
    loanTermYears: 0,
    lendingLabIntent: "budget_only",
    debtIncluded: false,
    accountingBasis: "accrual",
    gradeBandEnrollment: {
      k5: enrollmentArr,
      m68: [0, 0, 0, 0, 0],
      h912: [0, 0, 0, 0, 0],
    },
    gradeBandPerPupil: {
      k5: tuitionPerStudent,
      m68: 0,
      h912: 0,
    },
    sameTuitionForAllBands: true,
  };

  const programs = [
    {
      id: makeId("prog"),
      name: "General Enrollment",
      annualTuition: tuitionPerStudent,
      priorYear: 0,
      currentYear: 0,
      year1: enrollment.year1,
      year2: enrollment.year2,
      year3: enrollment.year3,
      year4: enrollment.year4,
      year5: enrollment.year5,
    },
  ];

  const revenueRows = [
    {
      id: makeId("rev"),
      category: "tuition_and_fees",
      lineItem: "Tuition",
      enabled: true,
      driverType: "per_student",
      amounts: [
        tuitionPerStudent,
        tuitionPerStudent * 1.03,
        tuitionPerStudent * 1.06,
        tuitionPerStudent * 1.09,
        tuitionPerStudent * 1.12,
      ],
    },
    {
      id: makeId("rev"),
      category: "philanthropy",
      lineItem: "Annual fund",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [25000, 30000, 35000, 40000, 45000],
    },
  ];

  const staffingRows = [
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

  const expenseRows = [
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

  // Seed one Pursued saved scenario so the scenarios page renders a
  // CustomScenarioCard. For yet_to_launch founders the actuals editor on
  // that card is supposed to be persona-gated off — sweeping the rendered
  // text proves the gate actually works in the browser.
  const customScenarios = [
    {
      name: "E2E rent reduction",
      createdAt: "2026-03-05T12:00:00.000Z",
      overrides: { monthlyRent: 13250 },
      decisionType: "evaluate_site",
      outcomeStatus: "pursued",
      outcomeUpdatedAt: "2026-03-05T12:00:00.000Z",
    },
  ];

  return {
    name: "E2E Future Academy",
    currentStep: 1,
    data: {
      schoolProfile,
      enrollment,
      programs,
      revenue: {
        tuitionPerStudent,
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
        studentsPerTeacher: 18,
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
        annualUtilities: 24000,
        annualInsurance: 12000,
        annualSalaryIncrease: 3,
        generalCostInflation: 3,
      },
      expenseRows,
      capitalAndDebtRows: [],
      assumptionFlagResponses: [],
      customScenarios,
    },
  };
}

async function registerUser(
  request: APIRequestContext,
  label: string,
): Promise<{ token: string; email: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-jargonfree-${label}-${stamp}@e2e.schoolstack.test`;

  // The registration endpoint is rate-limited per IP. Retry a few times
  // with backoff so this spec doesn't fail spuriously when other e2e
  // tests have just hit the same endpoint.
  const backoffsMs = [2000, 5000, 10000, 20000, 30000];
  let res = await request.post("/api/auth/register", {
    data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
  });
  for (const wait of backoffsMs) {
    if (res.status() !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
    res = await request.post("/api/auth/register", {
      data: { email, password: TEST_PASSWORD, name: "Playwright Founder" },
    });
  }
  expect(
    res.ok(),
    `register failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  const { token } = (await res.json()) as { token: string };
  return { token, email };
}

async function seedYetToLaunchPersona(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const personaRes = await request.patch("/api/auth/persona", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { stage: "yet_to_launch", comfort: "new_to_budgeting" },
  });
  expect(
    personaRes.ok(),
    `seed persona failed: ${personaRes.status()} ${await personaRes.text()}`,
  ).toBeTruthy();
  // Pre-set guidance level so the dashboard does not show a second blocking
  // overlay on top of the wizard.
  const guidanceRes = await request.patch("/api/auth/guidance-level", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { guidanceLevel: "extra" },
  });
  expect(
    guidanceRes.ok(),
    `set guidance failed: ${guidanceRes.status()} ${await guidanceRes.text()}`,
  ).toBeTruthy();
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

function trackPageHealth(page: Page): { consoleErrors: string[]; dialogs: string[] } {
  const consoleErrors: string[] = [];
  const dialogs: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("Failed to load resource")) return;
    if (text.includes("net::ERR_")) return;
    if (text.includes("favicon")) return;
    consoleErrors.push(text);
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

test("first-time founders see the persona modal and cannot bypass it without picking", async ({
  page,
  request,
}) => {
  // Register a fresh user but DO NOT seed their persona — that's the
  // condition the FounderPersonaPrompt is gated on.
  const { token } = await registerUser(request, "modal-gate");
  await primeAuthToken(page, token);

  await page.goto("/dashboard");

  // The modal mounts inside the Layout as soon as the auth context resolves
  // a user without a complete persona.
  const prompt = page.getByTestId("founder-persona-prompt");
  await expect(prompt).toBeVisible({ timeout: 15_000 });

  // The Continue button must stay disabled until both stage AND comfort
  // are picked. Submitting mid-pick is the most plausible regression here
  // (e.g. an aria attribute slipping off, or `disabled` getting dropped).
  const submit = page.getByTestId("persona-prompt-submit");
  await expect(submit).toBeDisabled();

  // First-time mode forbids dismissing via the backdrop. Clicking outside
  // the dialog body must keep the prompt mounted (we deliberately click the
  // far edge of the viewport so we hit the backdrop, not the panel).
  await page.mouse.click(5, 5);
  await expect(prompt).toBeVisible();
  await expect(submit).toBeDisabled();

  // First-time mode also has no close (X) button — only edit mode does.
  await expect(page.getByTestId("persona-prompt-close")).toHaveCount(0);

  // Pick the yet_to_launch + new_to_budgeting bucket and submit.
  await page
    .getByTestId("persona-bucket-yet_to_launch-new_to_budgeting")
    .click();
  await expect(submit).toBeEnabled();
  await submit.click();

  // Once the picker submits and refetchUser resolves, the prompt must
  // unmount so the founder can actually see the dashboard underneath.
  await expect(prompt).toHaveCount(0, { timeout: 15_000 });

  // Sanity: the dashboard's main heading is now reachable.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("yet_to_launch founder never sees actuals/QuickBooks/variance copy across the wizard, scenarios, and What-If drawer", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);

  const { token } = await registerUser(request, "wizard-sweep");
  await seedYetToLaunchPersona(request, token);
  const modelId = await createModel(request, token, buildYetToLaunchModel());

  const health = trackPageHealth(page);
  await primeAuthToken(page, token);

  // ---- Wizard walkthrough ----
  await page.goto(`/model/${modelId}`);

  // Dismiss the prep dialog and cookie consent if they appear (they're
  // unrelated to the persona contract under test here).
  try {
    await page
      .getByRole("button", { name: /Let.?s get started/i })
      .click({ timeout: 8000 });
  } catch {
    // never appeared — fine
  }
  try {
    await page
      .getByRole("button", { name: /^Decline$/ })
      .click({ timeout: 3000 });
  } catch {
    // never appeared — fine
  }

  // The persona is already seeded, so the FounderPersonaPrompt overlay
  // must NOT render on this navigation. Asserting its absence guards
  // against regressions where the gate is too eager (Task #302).
  await expect(page.getByTestId("founder-persona-prompt")).toHaveCount(0);

  for (const meta of STEP_HEADINGS) {
    const heading = page.getByRole("heading", { name: meta.heading }).first();
    await expect(
      heading,
      `expected to land on Step ${meta.step} (${meta.title})`,
    ).toBeVisible({ timeout: 20_000 });

    // Sweep the rendered surface for any forbidden copy. This is the whole
    // point of the spec — every step must read clean for a yet_to_launch
    // founder, including lazily-mounted callouts and coach lessons.
    await sweepPage(page, `Wizard step ${meta.step} (${meta.title})`);

    if (meta.step === 9) {
      // Step 9 (Review) hides the budget-to-books / variance lesson for
      // yet_to_launch founders. Belt-and-suspenders: assert the lesson
      // testid isn't on the page even though the text sweep covers the
      // copy that lives inside it.
      await expect(
        page.locator('[data-testid="budget-to-books-lesson"]'),
      ).toHaveCount(0);
    }

    if (meta.step === STEP_HEADINGS.length) break; // no Continue on Export

    if (meta.step === 11) {
      // Lender Narrative requires a reasoning textarea per flagged
      // assumption before "Generate Excel Model" submits.
      const reasoningBoxes = page.getByPlaceholder(/Explain your reasoning/i);
      const count = await reasoningBoxes.count();
      for (let i = 0; i < count; i++) {
        await reasoningBoxes
          .nth(i)
          .fill(
            "Plain-English reasoning: this is a planning assumption we'll revisit before opening.",
          );
      }
    }

    const nextLabel =
      meta.step === 9
        ? /View Consultant Analysis/i
        : meta.step === 10
          ? /Continue to Lender Narrative/i
          : meta.step === 11
            ? /Generate Excel Model/i
            : /Continue/i;

    await page.getByRole("button", { name: nextLabel }).first().click();
  }

  // ---- Scenarios page ----
  await page.goto(`/model/${modelId}/scenarios`);

  // Wait until the saved scenario card we seeded has rendered. This makes
  // sure the sweep below covers the actuals-related surfaces that mount
  // (or rather, that should NOT mount) per scenario card.
  await expect(page.getByTestId("custom-scenario-card-0")).toBeVisible({
    timeout: 20_000,
  });
  // The actuals editor button + the page-level Forecast Accuracy roll-up
  // are persona-gated off for yet_to_launch. Assert their testids are
  // absent so a future "ungate the surface" change has to delete this
  // assertion deliberately rather than silently flip the contract.
  await expect(
    page.getByTestId("custom-scenario-actuals-edit-0"),
  ).toHaveCount(0);
  await expect(page.getByTestId("custom-scenario-actuals-0")).toHaveCount(0);

  await sweepPage(page, "Scenarios page");

  // ---- What-If drawer (lazy-loaded — the unit test cannot reach this) ----
  await page.getByTestId("whatif-trigger").click();
  const drawer = page.getByTestId("whatif-drawer");
  await expect(drawer).toBeVisible({ timeout: 10_000 });

  // Sweep just the drawer's text — it contains its own copy block (impact
  // grid, sliders, helper text) that the page-level sweep would already
  // have covered, but pinning it down explicitly makes a regression here
  // point straight at the WhatIf surface.
  const drawerText = await drawer.innerText();
  expectNoForbiddenTerms(drawerText, "What-If drawer");

  await page.getByTestId("whatif-close").click();
  await expect(drawer).toHaveCount(0);

  // No browser console errors or blocking dialogs should surface during
  // any of the above — those would mean we crashed past a forbidden term
  // sweep without actually rendering the surface we meant to check.
  expect(
    health.consoleErrors,
    `browser console errors:\n${health.consoleErrors.join("\n---\n")}`,
  ).toEqual([]);
  expect(
    health.dialogs,
    `unexpected blocking dialogs:\n${health.dialogs.join("\n---\n")}`,
  ).toEqual([]);
});

// Task #426: the dashboard is the surface a returning yet_to_launch
// founder lands on most often. The wizard sweep above proves the wizard,
// scenarios page, and What-If drawer never reintroduce forbidden copy,
// but the dashboard had no equivalent guarantee. A coach card, KPI
// tile (FinancialSnapshot), DecisionLauncher card, ThingsHaveChangedBanner,
// or "recommended next steps" block could quietly bring back actuals /
// QuickBooks / variance / forecast-accuracy language and we wouldn't
// notice. This spec seeds a yet_to_launch founder with at least one
// model, opens /dashboard, waits for every async-loaded surface to
// render, and sweeps the rendered text against the SAME forbidden-term
// list the wizard sweep uses (imported from `./utils/jargon-free.ts`).
test("yet_to_launch founder never sees actuals/QuickBooks/variance copy on the dashboard", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);

  const { token } = await registerUser(request, "dashboard-sweep");
  await seedYetToLaunchPersona(request, token);
  // Seed at least one model so the dashboard renders its "has models"
  // branch — that's where DecisionLauncher, ThingsHaveChangedBanner,
  // FinancialSnapshot, and the model card grid all mount. The empty
  // state would skip most of those surfaces entirely and leave the
  // sweep with very little to actually check.
  const modelId = await createModel(request, token, buildYetToLaunchModel());

  const health = trackPageHealth(page);
  await primeAuthToken(page, token);

  await page.goto("/dashboard");

  // Persona is already seeded, so the FounderPersonaPrompt overlay must
  // NOT render — if it did, the page-level innerText sweep would only
  // see the modal's copy and false-pass on the dashboard underneath.
  await expect(page.getByTestId("founder-persona-prompt")).toHaveCount(0);

  // Wait for the dashboard's main heading and the model card grid to
  // render so we know the list query has resolved before sweeping.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", { name: /Your Models/i }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: /E2E Future Academy/i }),
  ).toBeVisible({ timeout: 15_000 });

  // Wait for FinancialSnapshot to finish loading — its KPI tiles only
  // mount once `useGetModel` resolves. Without this wait, the sweep
  // would race the "Loading your latest numbers..." spinner and miss
  // any forbidden copy in the lender-language KPI labels.
  await expect(
    page.getByTestId("dashboard-financial-snapshot"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByTestId("dashboard-kpi-operating-surplus"),
  ).toBeVisible({ timeout: 15_000 });

  // Now sweep the entire rendered dashboard. The util uses innerText so
  // hidden helper nodes (e.g. CSS-collapsed sections) won't false-trigger.
  await sweepPage(page, "Dashboard (lender language off)");

  // Flip the lender-language toggle on. The KPI labels swap to their
  // lender-style names (sourced from `LENDER_LABELS`) and that's a
  // common place for jargon to slip in unnoticed — sweep again with
  // lender labels active so the contract holds in both modes.
  const lenderToggle = page.getByTestId("lender-language-toggle");
  if ((await lenderToggle.count()) > 0) {
    await lenderToggle.click();
    // Give the swapped labels a tick to render before re-reading text.
    await expect(
      page.getByTestId("dashboard-kpi-operating-surplus"),
    ).toBeVisible();
    await sweepPage(page, "Dashboard (lender language on)");
  }

  // No browser console errors or blocking dialogs — same reasoning as
  // the wizard sweep: a crash mid-render could let the sweep false-pass
  // on a surface that never actually mounted.
  expect(
    health.consoleErrors,
    `browser console errors:\n${health.consoleErrors.join("\n---\n")}`,
  ).toEqual([]);
  expect(
    health.dialogs,
    `unexpected blocking dialogs:\n${health.dialogs.join("\n---\n")}`,
  ).toEqual([]);

  // Silence "modelId created but unused beyond seeding" lint by
  // referencing it in a no-op assertion.
  expect(modelId).toBeGreaterThan(0);
});
