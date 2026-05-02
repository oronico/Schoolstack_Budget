import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "./utils/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as XLSX from "xlsx";

// Task #334: end-to-end exercise of the Chesterton (CSN) wizard branch.
//
// Prior unit tests cover step-component rendering, the chesterton template
// defaults, and the workbook builder. This spec wires the three layers
// together in a real browser:
//
//   1. Seed a model whose schoolType is "chesterton_academy" so the wizard
//      derives the 15-step Chesterton variant on first render.
//   2. Assert the sidebar shows the three CSN-only steps (Fundraising
//      Goals / Gift Chart / Recruiting) and that they render their
//      Chesterton-specific UI (data-testid hooks).
//   3. Navigate to Export, click "CSN Operating Manual", capture the
//      download, and parse the .xlsx to assert the sheet list matches
//      the CSN Operating Manual contract (CHESTERTON_TAB_NAMES).
//   4. Toggle schoolType back to "private_school" via the School Details
//      step's <select>, then assert the three CSN steps disappear from
//      the sidebar and the generic Enrollment step component reappears.

const TEST_PASSWORD = "PlaywrightTest12345!";

// Sheet list mirrors `CHESTERTON_TAB_NAMES` in
// artifacts/api-server/src/lib/packets/chesterton-operating-manual.ts.
// Duplicated here intentionally — the e2e spec is the contract that locks
// the workbook surface area visible to a CSN founder; if either side
// changes, this assertion is the safety net that catches it.
//
// The exporter emits 10 tabs: 7 numbered/derived tabs (above) plus three
// reference tabs (Cadence, CSN Training Schedule, Parent Handout) that
// mirror the published CSN Operating Manual word-for-word.
const EXPECTED_TABS = [
  "GETTING STARTED",
  "1 - 5 YR FINANCIAL PROJECTIONS",
  "2 - SALARY SCHEDULE",
  "3 - KEY ASSUMPTIONS",
  "4 - FUNDRAISING GOALS",
  "5 - GIFT CHART",
  "5 - GIFT CHART AUTOMATIC",
  "7 - RECRUITING PIPELINE",
  "Cadence",
  "CSN Training Schedule",
  "Parent Handout",
];

// Chesterton template defaults (kept in sync with
// artifacts/school-financial-model/src/lib/chesterton/template.ts).
// Embedding them here means the seed payload is self-contained — the
// e2e suite can not import workspace TS modules directly.
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

// Minimal-but-complete model payload that satisfies the wizard's
// `checkCoreFieldsForExport` gate (schoolName/state/schoolType + at least
// one row in enrollment, revenueRows, staffingRows). Everything else is
// optional for sidebar navigation and the workbook export.
function buildChestertonSeedModel(): Record<string, unknown> {
  return {
    name: "E2E Chesterton Academy",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "E2E Chesterton Academy",
        state: "VA",
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
          year1: 30,
          year2: 45,
          year3: 60,
          year4: 75,
          year5: 90,
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
          fte: 1,
          annualizedRate: 75000,
          benefitsEligible: true,
          benefitsRate: 18,
          payrollTaxRate: 8,
          payrollLike: true,
          notes: "",
          staffingMode: "fixed",
        },
        {
          id: "staff-teacher",
          roleName: "Lead Teacher",
          functionCategory: "instructional",
          employmentType: "full_time",
          fte: 4,
          annualizedRate: 44000,
          benefitsEligible: true,
          benefitsRate: 18,
          payrollTaxRate: 8,
          payrollLike: true,
          notes: "",
          staffingMode: "fixed",
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

async function registerAndSeed(request: APIRequestContext): Promise<{ token: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-chesterton-${stamp}@e2e.schoolstack.test`;

  // Same backoff dance as wizard-smoke-six-paths — the registration route
  // is rate-limited per IP and earlier tests in the run can saturate it.
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
  // Skip the dashboard guidance overlay so the wizard renders unobstructed.
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

async function primeAuthToken(page: Page, token: string): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("auth_token", value);
  }, token);
}

async function dismissOnboardingOverlays(page: Page): Promise<void> {
  // Wizard "Here's what to expect" prep dialog — fires on first model load.
  const introBtn = page.getByRole("button", { name: /Let.?s get started/i });
  try {
    await introBtn.click({ timeout: 8000 });
  } catch {
    // dialog never appeared — proceed
  }
  // Cookie consent banner — analytics noise this spec does not care about.
  const cookieDecline = page.getByRole("button", { name: /^Decline$/ });
  try {
    await cookieDecline.click({ timeout: 3000 });
  } catch {
    // banner never appeared — proceed
  }
}

test("Chesterton wizard branch renders the CSN flow and exports the Operating Manual", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token } = await registerAndSeed(request);
  const modelId = await createModel(request, token, buildChestertonSeedModel());
  await primeAuthToken(page, token);

  // ----- 1. Land on the wizard, dismiss noise. -----
  await page.goto(`/model/${modelId}`);
  await dismissOnboardingOverlays(page);

  // ----- 2. Sidebar should show the three CSN-only steps. -----
  // The step rail renders each step as `<button>{step.id}</button>` with a
  // sibling `<span>{step.title}</span>`. We assert by title text — they're
  // unique per-step within the wizard chrome.
  await expect(page.getByText("Fundraising Goals", { exact: true })).toBeVisible();
  await expect(page.getByText("Gift Chart", { exact: true })).toBeVisible();
  await expect(page.getByText("Recruiting", { exact: true })).toBeVisible();

  // The header reflects the visible-step count: "Step 1 of 15: Story" for
  // a fresh Chesterton model. The header is rendered inside a `md:hidden`
  // wrapper (mobile-only), so we assert presence in the DOM rather than
  // CSS-visibility. Matching exactly one occurrence of "of 15" proves the
  // visibleSteps list expanded by exactly the three inserted steps.
  await expect(page.getByText(/Step\s+\d+\s+of\s+15:/i)).toHaveCount(1);

  // ----- 3. Walk the three CSN-only steps. -----
  // Step rail step IDs for Chesterton:
  //   1 Story / 2 School Details / 3 Enrollment / 4 Revenue /
  //   5 Staffing / 6 Fundraising / 7 Gift Chart / 8 Recruiting /
  //   9 Expenses / 10 Capital / 11 Assumptions / 12 Review /
  //   13 Consultant / 14 Narrative / 15 Export
  // Steps below 12 (REVIEW_STEP_ID) skip the core-fields gate, so we can
  // jump straight to Fundraising via the rail.
  await page.getByRole("button", { name: "6", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-fundraising-step")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /^Continue$/ }).first().click();
  await expect(page.getByTestId("chesterton-gift-chart-step")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /^Continue$/ }).first().click();
  await expect(page.getByTestId("chesterton-recruiting-step")).toBeVisible({
    timeout: 15_000,
  });

  // ----- 4. Jump to Export, download CSN Operating Manual. -----
  await page.getByRole("button", { name: "15", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: /Your reports are ready|Ready to export your model/i }),
  ).toBeVisible({ timeout: 15_000 });

  const csnCard = page.getByText("CSN Operating Manual", { exact: true });
  await expect(csnCard).toBeVisible();

  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await csnCard.click();
  const download = await downloadPromise;

  const tmpPath = path.join(
    os.tmpdir(),
    `csn-operating-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xlsx`,
  );
  await download.saveAs(tmpPath);

  // Suggested filename includes the safe-name + standard suffix.
  const suggestedName = download.suggestedFilename();
  expect(
    suggestedName,
    `unexpected download filename: ${suggestedName}`,
  ).toMatch(/CSN_Operating_Manual\.xlsx$/);

  // ----- 5. Parse the workbook and assert the sheet list. -----
  const fileBuffer = fs.readFileSync(tmpPath);
  expect(fileBuffer.length).toBeGreaterThan(0);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  // ExcelJS-emitted files are valid xlsx; XLSX.read throws on corruption,
  // so a populated SheetNames array is sufficient proof of validity.
  expect(workbook.SheetNames.length).toBeGreaterThan(0);
  expect(workbook.SheetNames).toEqual(EXPECTED_TABS);

  // Tidy up the temp file. Failure here is non-fatal — OS will clean tmpdir.
  try {
    fs.unlinkSync(tmpPath);
  } catch {
    /* ignore */
  }

  // ----- 6. Toggle off: revert schoolType → CSN steps disappear. -----
  // Navigate back to School Details (step 2) — below REVIEW so no gate.
  await page.getByRole("button", { name: "2", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: /Tell Us About Your School/i }),
  ).toBeVisible({ timeout: 15_000 });

  // FormSelect renders a native <select id="schoolProfile.schoolType">.
  // Switching to private_school re-derives visibleSteps to the 12-step
  // generic flow.
  await page.locator("#schoolProfile\\.schoolType").selectOption("private_school");

  // The header step count should drop back to "of 12" (same `md:hidden`
  // wrapper as the chesterton variant — see comment above).
  await expect(page.getByText(/Step\s+\d+\s+of\s+12:/i)).toHaveCount(1, {
    timeout: 10_000,
  });

  // The three CSN-only step labels should no longer appear in the rail.
  await expect(page.getByText("Fundraising Goals", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Gift Chart", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Recruiting", { exact: true })).toHaveCount(0);

  // The generic Enrollment step should now occupy step 3 (was the
  // Chesterton variant before the toggle). Click and confirm the generic
  // heading renders, and the chesterton-specific testid is gone.
  await page.getByRole("button", { name: "3", exact: true }).first().click();
  await expect(
    page
      .getByRole("heading", { name: /Programs\s*&\s*Enrollment|Where Does Your Money Come From/i })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("chesterton-enrollment-step")).toHaveCount(0);
});
