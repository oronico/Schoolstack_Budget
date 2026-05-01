import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as XLSX from "xlsx";

// Task #339: data-entry coverage for the Chesterton (CSN) wizard branch.
//
// The companion spec (chesterton-wizard-branch.spec.ts) proves the three
// CSN-only steps render and that the workbook ships with the expected
// tab list. It does NOT exercise the data-entry surface inside those
// steps. This spec closes that gap by:
//
//   1. Seeding a Chesterton model with the standard CSN defaults.
//   2. Editing one row in each of Fundraising / Gift Chart / Recruiting
//      via the actual <input> hooks the founder uses.
//   3. Reloading the page and confirming the new values survived.
//   4. Downloading the CSN Operating Manual and asserting the edits
//      flow into the matching workbook cells:
//        - Fundraising Goals tab    : C6 (first row goalAmount)
//        - Gift Chart tab           : B5 (first row giftAmount)
//        - Recruiting Pipeline tab  : C5 (first row prospectiveStudents)
//
// The seed payload, register/seed helpers, and overlay-dismiss flow are
// intentionally duplicated from chesterton-wizard-branch.spec.ts so each
// spec stays self-contained — the wizard branch spec is the contract for
// rendering, and this one is the contract for data persistence; sharing
// helpers across them would couple two unrelated regressions to one file.

const TEST_PASSWORD = "PlaywrightTest12345!";

// Chesterton template defaults (kept in sync with
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

function buildChestertonSeedModel(): Record<string, unknown> {
  return {
    name: "E2E Chesterton Data Entry",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "E2E Chesterton Data Entry",
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

async function registerAndSeed(request: APIRequestContext): Promise<{ token: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-chesterton-data-${stamp}@e2e.schoolstack.test`;

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
  const introBtn = page.getByRole("button", { name: /Let.?s get started/i });
  try {
    await introBtn.click({ timeout: 8000 });
  } catch {
    // dialog never appeared — proceed
  }
  const cookieDecline = page.getByRole("button", { name: /^Decline$/ });
  try {
    await cookieDecline.click({ timeout: 3000 });
  } catch {
    // banner never appeared — proceed
  }
}

// react-hook-form input IDs are dotted (e.g.
// `chesterton.fundraisingGoals.0.goalAmount`). CSS selectors need each
// dot escaped with two backslashes inside a JS string literal. Helper
// keeps that quirk in one place.
function fieldLocator(page: Page, name: string) {
  const escaped = name.replace(/\./g, "\\.");
  return page.locator(`#${escaped}`);
}

// Pull a numeric value from a parsed XLSX cell. xlsx stores formulas as
// objects with `v` (calculated value) + `f` (formula string); literals
// are stored with just `v`. ExcelJS-emitted workbooks always include a
// cached `v` for formulas, so reading it directly is safe.
function cellNumber(ws: XLSX.WorkSheet, address: string): number {
  const cell = ws[address] as XLSX.CellObject | undefined;
  if (!cell) throw new Error(`cell ${address} missing`);
  const raw = cell.v;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  throw new Error(`cell ${address} not numeric: ${JSON.stringify(raw)}`);
}

test("Chesterton wizard data entry persists through reload and into the workbook", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const { token } = await registerAndSeed(request);
  const modelId = await createModel(request, token, buildChestertonSeedModel());
  await primeAuthToken(page, token);

  await page.goto(`/model/${modelId}`);
  await dismissOnboardingOverlays(page);

  // ----- 1. Edit one row in Fundraising (step 6). -----
  // Chesterton step rail: 1 Story · 2 School · 3 Enrollment · 4 Revenue ·
  // 5 Staffing · 6 Fundraising · 7 Gift Chart · 8 Recruiting · ...
  await page.getByRole("button", { name: "6", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-fundraising-step")).toBeVisible({
    timeout: 15_000,
  });

  const fundraisingGoalInput = fieldLocator(
    page,
    "chesterton.fundraisingGoals.0.goalAmount",
  );
  await expect(fundraisingGoalInput).toHaveValue("100000");
  await fundraisingGoalInput.fill("175000");
  await fundraisingGoalInput.blur();
  await expect(fundraisingGoalInput).toHaveValue("175000");

  // ----- 2. Edit one row in Gift Chart (step 7). -----
  await page.getByRole("button", { name: "7", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-gift-chart-step")).toBeVisible({
    timeout: 15_000,
  });
  const giftAmountInput = fieldLocator(
    page,
    "chesterton.giftChart.0.giftAmount",
  );
  await expect(giftAmountInput).toHaveValue("50000");
  await giftAmountInput.fill("75000");
  await giftAmountInput.blur();
  await expect(giftAmountInput).toHaveValue("75000");

  // ----- 3. Edit one row in Recruiting (step 8). -----
  await page.getByRole("button", { name: "8", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-recruiting-step")).toBeVisible({
    timeout: 15_000,
  });
  const prospectsInput = fieldLocator(
    page,
    "chesterton.recruitingPipeline.0.prospectiveStudents",
  );
  await expect(prospectsInput).toHaveValue("0");
  await prospectsInput.fill("35");
  // Blur to make sure RHF's onChange + our debounced autosave both see the
  // edit before we navigate away from the step.
  await prospectsInput.blur();
  await expect(prospectsInput).toHaveValue("35");

  // Task #350: the "Total prospects" / "Projected enrollment" / "Coverage of
  // Year 1 goal" widgets must update live as the founder types — without
  // requiring a navigate-away-and-back. The seeded phaseEnrollment puts
  // Year 1 enrollment at 30 (freshman 15 + sophomore 15), so editing row 0
  // to 35 prospects gives totals = 35 prospects, projected = floor(35/3)
  // = 11, coverage = 11/30 ≈ 37%.
  await expect(page.getByTestId("chesterton-recruiting-total-prospects")).toHaveText(
    "35",
    { timeout: 5_000 },
  );
  await expect(page.getByTestId("chesterton-recruiting-projected")).toContainText("11");
  await expect(page.getByTestId("chesterton-recruiting-coverage-pct")).toHaveText("37%");

  // ----- 4. Wait for autosave to flush, then reload. -----
  // The wizard debounces saves at 1s and also flushes on unmount via
  // beforeunload (keepalive: true). 3s gives the debounce timer ample
  // headroom even with a slow CI runner.
  await page.waitForTimeout(3000);

  // Read the model back via the API to assert the autosave actually
  // landed before we reload — guards against a flaky reload masking a
  // missed save.
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/models/${modelId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok()) return null;
        const body = (await res.json()) as {
          data?: {
            chesterton?: {
              fundraisingGoals?: Array<{ goalAmount?: number }>;
              giftChart?: Array<{ giftAmount?: number }>;
              recruitingPipeline?: Array<{ prospectiveStudents?: number }>;
            };
          };
        };
        const c = body.data?.chesterton;
        return {
          fundraising: c?.fundraisingGoals?.[0]?.goalAmount,
          gift: c?.giftChart?.[0]?.giftAmount,
          prospects: c?.recruitingPipeline?.[0]?.prospectiveStudents,
        };
      },
      { timeout: 15_000, intervals: [500, 1000, 1000, 2000] },
    )
    .toEqual({ fundraising: 175000, gift: 75000, prospects: 35 });

  await page.reload();
  await dismissOnboardingOverlays(page);

  // ----- 5. Verify each edit survived the reload. -----
  await page.getByRole("button", { name: "6", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-fundraising-step")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    fieldLocator(page, "chesterton.fundraisingGoals.0.goalAmount"),
  ).toHaveValue("175000");

  await page.getByRole("button", { name: "7", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-gift-chart-step")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    fieldLocator(page, "chesterton.giftChart.0.giftAmount"),
  ).toHaveValue("75000");

  await page.getByRole("button", { name: "8", exact: true }).first().click();
  await expect(page.getByTestId("chesterton-recruiting-step")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    fieldLocator(page, "chesterton.recruitingPipeline.0.prospectiveStudents"),
  ).toHaveValue("35");

  // ----- 6. Download the workbook and assert edits hit the cells. -----
  await page.getByRole("button", { name: "15", exact: true }).first().click();
  await expect(
    page.getByRole("heading", {
      name: /Your reports are ready|Ready to export your model/i,
    }),
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

  const fileBuffer = fs.readFileSync(tmpPath);
  expect(fileBuffer.length).toBeGreaterThan(0);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  // Cell positions mirror the layout in
  // artifacts/api-server/src/lib/packets/chesterton-operating-manual.ts.
  // - Fundraising tab data rows start at row 6 (header row 5); col C is
  //   the goal amount input cell for the first fundraising component.
  // - Gift Chart tab data rows start at row 5 (header row 4); col B is
  //   the gift-amount input cell for the first pyramid tier.
  // - Recruiting tab data rows start at row 5 (header row 4); col C is
  //   the prospect-count input cell for the first recruiting source.
  const fundraisingSheet = workbook.Sheets["4 - FUNDRAISING GOALS"];
  expect(fundraisingSheet).toBeDefined();
  expect(cellNumber(fundraisingSheet, "C6")).toBe(175000);

  const giftSheet = workbook.Sheets["5 - GIFT CHART"];
  expect(giftSheet).toBeDefined();
  expect(cellNumber(giftSheet, "B5")).toBe(75000);

  const recruitingSheet = workbook.Sheets["7 - RECRUITING PIPELINE"];
  expect(recruitingSheet).toBeDefined();
  expect(cellNumber(recruitingSheet, "C5")).toBe(35);

  try {
    fs.unlinkSync(tmpPath);
  } catch {
    /* ignore */
  }
});
