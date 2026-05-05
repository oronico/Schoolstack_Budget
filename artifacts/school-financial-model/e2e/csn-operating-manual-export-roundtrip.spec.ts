import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as XLSX from "xlsx";
import { registerAndVerifyE2E } from "./utils/register-and-verify";
import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "./utils/test";

// Task #574 — round-trip test for the CSN Operating Manual export.
//
// `tests/demo-models-smoke.ts` over in api-server already calls
// `generateChestertonOperatingManual` against the seeded demo's data
// block, so any shape drift in the workbook generator is caught at
// the unit level. What that smoke test does NOT prove is that:
//
//   1. Opening a Chesterton-shaped model in the wizard surfaces the
//      "CSN Operating Manual" export tab on the Review/Export step
//      (the tab is gated on `schoolType === "chesterton_academy"` in
//      ExportStep.tsx — a regression that re-hides the card would
//      slip past the unit smoke test entirely).
//   2. Clicking the card from the running app actually delivers a
//      working xlsx blob via the
//      `/api/models/:id/export/chesterton-operating-manual` route
//      (a 404 / 500 from the route would also slip past the unit
//      smoke test).
//
// This spec closes both gaps. It mirrors the demo reviewer flow as
// closely as possible:
//
//   - register a verified user (stand-in for `demo@schoolstack.ai` —
//     we cannot reuse the literal demo account because the e2e DB
//     is shared across specs and the preview-data seed only fires on
//     a completely empty users table; using a per-run email keeps
//     the spec independent of seed ordering)
//   - seed a model with the same `schoolType: "chesterton_academy"`
//     + `data.chesterton.*` shape the preview demo uses (the
//     "— CSN Operating Manual View" demo), at currentStep = 15 so
//     the wizard lands on the Export step directly
//   - drive the actual `/login` form (NOT the localStorage shortcut)
//     so the login flow itself is exercised end-to-end
//   - assert the CSN Operating Manual card is visible on the Export
//     step (tab-gating regression catch)
//   - click the card, capture the download, and assert the file is a
//     real xlsx (PK zip magic bytes + non-trivial size + xlsx parses)

const TEST_PASSWORD = "PlaywrightTest12345!";

// CSN-shaped seed payload. Inlined rather than imported so this spec
// stays self-contained — the api-server isn't reachable as a workspace
// import from school-financial-model, and the wizard only needs the
// `schoolType` + `data.chesterton.*` fields populated to flip on the
// CSN Operating Manual export card. The numeric values mirror the
// canonical CSN template (see
// artifacts/school-financial-model/src/lib/chesterton/template.ts).
function chestertonSeedBlock(): Record<string, unknown> {
  const totalFundraisingGoal = 100000 + 132500 + 91250 + 13125 + 50000;
  return {
    planningYear: new Date().getFullYear() + 1,
    startingTuition: 8500,
    tuitionGrowthRate: 0.04,
    bookSupplyFee: 600,
    financialAidPct: 0.10,
    startingTeacherSalary: 44000,
    benefitsFirstYearAmount: 0,
    attritionRate: 0.10,
    totalFundraisingGoal,
    phaseEnrollment: [
      { grade: "freshman",  year0: 15, year1: 15, year2: 20, year3: 21, year4: 22, year5: 22 },
      { grade: "sophomore", year0: 0,  year1: 15, year2: 15, year3: 20, year4: 20, year5: 22 },
      { grade: "junior",    year0: 0,  year1: 0,  year2: 13, year3: 14, year4: 18, year5: 20 },
      { grade: "senior",    year0: 0,  year1: 0,  year2: 0,  year3: 12, year4: 13, year5: 18 },
    ],
    classesPerGrade: [1, 1, 1, 2, 2, 2],
    salarySchedule: [
      { id: "subj-literature",  subject: "Literature",         periodsPerSection: 5 },
      { id: "subj-mathematics", subject: "Mathematics",        periodsPerSection: 5 },
      { id: "subj-theology",    subject: "Theology",           periodsPerSection: 5 },
      { id: "subj-latin",       subject: "Latin",              periodsPerSection: 5 },
      { id: "subj-science",     subject: "Science",            periodsPerSection: 5 },
      { id: "subj-history",     subject: "History",            periodsPerSection: 5 },
      { id: "subj-arts",        subject: "Arts & Music",       periodsPerSection: 3 },
      { id: "subj-pe",          subject: "Physical Education", periodsPerSection: 2 },
    ],
    fundraisingGoals: [
      { id: "fund-major",  category: "Major Gifts ($25,000+)",            goalAmount: 100000, numberOfGifts: 3,   averageGift: 33333 },
      { id: "fund-mid",    category: "Mid-Major Gifts ($5,000–$25,000)", goalAmount: 132500, numberOfGifts: 27,  averageGift: 4907 },
      { id: "fund-annual", category: "Annual Fund ($500–$5,000)",        goalAmount: 91250,  numberOfGifts: 165, averageGift: 553 },
      { id: "fund-grass",  category: "Grassroots (under $500)",           goalAmount: 13125,  numberOfGifts: 225, averageGift: 58 },
      { id: "fund-events", category: "Events",                            goalAmount: 50000,  numberOfGifts: 0,   averageGift: 0 },
    ],
    giftChart: [
      { id: "gift-50000", giftAmount: 50000, numberOfGifts: 1,   numberOfProspects: 5   },
      { id: "gift-25000", giftAmount: 25000, numberOfGifts: 2,   numberOfProspects: 5   },
      { id: "gift-10000", giftAmount: 10000, numberOfGifts: 8,   numberOfProspects: 20  },
      { id: "gift-5000",  giftAmount: 5000,  numberOfGifts: 12,  numberOfProspects: 25  },
      { id: "gift-1000",  giftAmount: 1000,  numberOfGifts: 15,  numberOfProspects: 30  },
      { id: "gift-100",   giftAmount: 100,   numberOfGifts: 100, numberOfProspects: 150 },
    ],
    recruitingPipeline: [
      { id: "rec-siblings",   source: "Siblings of current students", prospectiveStudents: 0 },
      { id: "rec-feeder",     source: "Feeder school graduates",      prospectiveStudents: 0 },
      { id: "rec-homeschool", source: "Homeschool students",          prospectiveStudents: 0 },
    ],
    prospectiveFacilities: [
      { id: "fac-1", name: "Phase I (Year 0–1)", capacity: 70,  location: "TBD" },
      { id: "fac-2", name: "Phase II (Year 2–3)", capacity: 100, location: "TBD" },
    ],
    priestlyOutreach: [
      { id: "priest-1", name: "Father TBD", affiliation: "Parish Name" },
    ],
    keyInfluencers: [
      { id: "inf-1", name: "First Last", affiliation: "Role" },
    ],
  };
}

function buildSeedModel(): Record<string, unknown> {
  return {
    // Match the canonical preview seed name so anyone reading the model
    // list / spec output recognizes this as the demo CSN row.
    name: "Chesterton Academy of Saint Edmund — CSN Operating Manual View",
    // Land the founder directly on the Export step (step 15 in the
    // Chesterton wizard layout — see CHESTERTON_STEPS in
    // src/pages/model-wizard/index.tsx). Skipping the intermediate
    // steps keeps the spec focused on the export tab + download
    // round-trip, not on wizard navigation.
    currentStep: 15,
    data: {
      schoolProfile: {
        schoolName:
          "Chesterton Academy of Saint Edmund (CSN Operating Manual View)",
        state: "VA",
        // The single switch that flips on CHESTERTON_STEPS in the
        // wizard AND the CSN Operating Manual export card in the
        // Review/Export step. Anything else here is supporting
        // context so the rest of the export step doesn't crash.
        schoolType: "chesterton_academy",
        entityType: "nonprofit_501c3",
        schoolStage: "new_school",
        plannedOpeningYear: "2027",
        openingYear: 2027,
        currentStudents: 0,
        longTermEnrollmentGoal: 120,
        maxCapacity: 150,
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        ownershipType: "rent",
        monthlyRent: 8000,
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
        accountingBasis: "accrual",
      },
      enrollment: { year1: 30, year2: 45, year3: 60, year4: 75, year5: 90 },
      programs: [
        {
          id: "prog-csn-classical",
          name: "Classical Liberal Arts (9–12)",
          annualTuition: 8500,
          priorYear: 0,
          currentYear: 0,
          year1: 30, year2: 45, year3: 60, year4: 75, year5: 90,
        },
      ],
      revenueRows: [
        {
          id: "rev-tuition",
          category: "tuition_and_fees",
          lineItem: "Tuition",
          enabled: true,
          driverType: "per_student",
          amounts: [8500, 8755, 9018, 9288, 9567],
        },
        {
          id: "rev-philanthropy",
          category: "philanthropy",
          lineItem: "Annual fund",
          enabled: true,
          driverType: "annual_fixed",
          amounts: [100000, 110000, 120000, 130000, 140000],
        },
      ],
      staffingRows: [
        {
          id: "staff-head",
          roleName: "Headmaster",
          functionCategory: "school_leadership",
          employmentType: "full_time",
          fte: 1, annualizedRate: 75000,
          benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 8,
          payrollLike: true, notes: "", staffingMode: "fixed",
        },
        {
          id: "staff-teacher",
          roleName: "Lead Teacher",
          functionCategory: "instructional",
          employmentType: "full_time",
          fte: 4, annualizedRate: 44000,
          benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 8,
          payrollLike: true, notes: "", staffingMode: "fixed",
        },
      ],
      expenseRows: [
        {
          id: "exp-rent",
          category: "facility",
          lineItem: "Rent",
          enabled: true,
          driverType: "monthly",
          amounts: [96000, 0, 0, 0, 0],
        },
      ],
      chesterton: chestertonSeedBlock(),
    },
  };
}

async function registerAndSeed(
  request: APIRequestContext,
): Promise<{ token: string; email: string }> {
  // Per-run email so the spec is independent of the preview-data seed
  // having fired (which only happens on an empty users table).
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-csn-export-${stamp}@e2e.schoolstack.test`;

  const { token } = await registerAndVerifyE2E(request, {
    email,
    password: TEST_PASSWORD,
    name: "Demo Reviewer",
  });
  await seedPersona(request, token);
  // Skip the in-app "guided tour"/"basics" overlay so the export card
  // is interactive on first paint. Mirrors the helper in
  // chesterton-wizard-data-entry.spec.ts.
  const guidanceRes = await request.patch("/api/auth/guidance-level", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data: { guidanceLevel: "basics" },
  });
  expect(
    guidanceRes.ok(),
    `guidance failed: ${guidanceRes.status()} ${await guidanceRes.text()}`,
  ).toBeTruthy();
  return { token, email };
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

async function loginViaForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  // The <label>s in src/pages/auth/login.tsx aren't associated with
  // their inputs via `htmlFor`, so `getByLabel` doesn't resolve — we
  // target the inputs by `type` attribute instead, which is stable
  // across the form's restyles.
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  // Login redirects to /dashboard on success.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
}

async function dismissOnboardingOverlays(page: Page): Promise<void> {
  // Mirrors the helper in chesterton-wizard-data-entry.spec.ts so this
  // spec is resilient to the same overlays (intro modal + cookie
  // banner). The shared `test` fixture in e2e/utils/test.ts already
  // pre-seeds `cookie_consent = "declined"`, but a future change that
  // re-enables the banner shouldn't silently break this round-trip.
  const introBtn = page.getByRole("button", { name: /Let.?s get started/i });
  try {
    await introBtn.click({ timeout: 5000 });
  } catch {
    // overlay never appeared — proceed
  }
  const cookieDecline = page.getByRole("button", { name: /^Decline$/ });
  try {
    await cookieDecline.click({ timeout: 3000 });
  } catch {
    // banner never appeared — proceed
  }
}

test("CSN Operating Manual export round-trips end-to-end via the wizard", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token, email } = await registerAndSeed(request);
  const modelId = await createModel(request, token, buildSeedModel());

  // Drive the real /login form so the auth flow is part of the
  // round-trip — this is the demo-reviewer experience the task
  // description calls out. The bearer token returned at register time
  // is intentionally unused: the UI flow re-mints its own token from
  // the login response and stashes it in localStorage.
  await loginViaForm(page, email, TEST_PASSWORD);

  // Open the model and jump to the Export step by clicking the rail
  // button. We deliberately do NOT rely on the persisted
  // `currentStep` or on the `?step=N` deep link:
  //   - persisted `currentStep` gets bumped by the storyMigration /
  //     reorderV2 one-shot migrations on first load
  //   - the `?step=N` deep link is clamped to `visibleSteps.length`,
  //     which is computed from a memo that hasn't yet picked up the
  //     freshly-reset form values when the init effect reads it, so
  //     for a Chesterton seed it still sees the 12-step default
  //     layout and silently clamps step=15 down to 12 (Review)
  // Clicking the rail button after the wizard renders bypasses both.
  await page.goto(`/model/${modelId}`);
  await dismissOnboardingOverlays(page);

  // Wait for the full 15-step Chesterton rail to render, then click
  // the Export node (button "15"). The rail uses the step ordinal as
  // the button's accessible name.
  await expect(
    page.getByRole("button", { name: "15", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "15", exact: true }).click();

  // Now wait for the Export step's heading to confirm we're on the
  // right surface before looking for the gated CSN card.
  await expect(
    page.getByRole("heading", {
      name: /Your reports are ready|Ready to export your model/i,
    }),
  ).toBeVisible({ timeout: 30_000 });

  // Tab gating assertion: the CSN Operating Manual card is only
  // rendered when `isChestertonAcademy(schoolType)` is true. A
  // regression that re-hid the card would fail here.
  const csnCard = page.getByText("CSN Operating Manual", { exact: true });
  await expect(csnCard).toBeVisible({ timeout: 10_000 });

  // Download round-trip assertion: clicking the card kicks off a
  // GET /api/models/:id/export/chesterton-operating-manual; we capture
  // the resulting download and confirm it's an actual xlsx (PK zip
  // magic bytes + non-trivial size + parses cleanly with a non-empty
  // sheet list).
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await csnCard.click();
  const download = await downloadPromise;

  const tmpPath = path.join(
    os.tmpdir(),
    `csn-operating-manual-roundtrip-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.xlsx`,
  );
  await download.saveAs(tmpPath);

  try {
    const fileBuffer = fs.readFileSync(tmpPath);
    // Non-trivial size: the unit smoke test in
    // artifacts/api-server/tests/demo-models-smoke.ts produces
    // workbooks well over 30 KB; 8 KB is a generous lower bound that
    // still catches a truncated / error-payload response masquerading
    // as an xlsx.
    expect(
      fileBuffer.length,
      `expected non-trivial xlsx, got ${fileBuffer.length} bytes`,
    ).toBeGreaterThan(8 * 1024);

    // xlsx files are zip archives, so the first two bytes are "PK".
    // A JSON error blob with the wrong content-type would fail this.
    expect(fileBuffer.subarray(0, 2).toString("latin1")).toBe("PK");

    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    // The Operating Manual ships multiple tabs (GETTING STARTED, the
    // 5-yr projection, salary schedule, fundraising goals, gift chart,
    // recruiting pipeline, …). Asserting "more than one" rather than
    // pinning the exact list keeps this spec focused on round-trip
    // wiring; the unit smoke test owns the per-tab shape contract.
    expect(
      workbook.SheetNames.length,
      `expected multiple sheets, got ${JSON.stringify(workbook.SheetNames)}`,
    ).toBeGreaterThan(1);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }

  // The download filename should advertise the manual so a reviewer
  // saving from a real browser sees something recognisable. Loose
  // regex tolerates timestamp / school-name suffixes.
  expect(download.suggestedFilename()).toMatch(
    /(chesterton|csn|operating[-_ ]manual)/i,
  );
});
