import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #522: end-to-end coverage for the Story-step enrollment matrix's
// mobile-friendly layout (Task #519). The vitest unit tests confirm the
// Tailwind classes render (sm:hidden labels, grid-cols-1 → sm:grid-cols-N)
// but jsdom doesn't apply CSS, so the no-horizontal-scroll behaviour and
// the desktop single-row layout are not exercised end-to-end. This spec
// loads the wizard at a real phone viewport (390x844), fills in every
// per-grade input, and asserts document.documentElement.scrollWidth ===
// window.innerWidth. It then re-runs at 1280x800 and asserts that the
// desktop matrix header (story-grade-y5-header) is visible alongside the
// inputs in a single row.

const TEST_PASSWORD = "PlaywrightTest12345!";

const ACTIVE_GRADES = ["k", "g1", "g2", "g3"] as const;

function buildSeedPayload(): Record<string, unknown> {
  // Pick a private operating school so the StoryStep renders with the
  // grades-only matrix and the Y5 column visible (five-year mode).
  return {
    name: "E2E Story Matrix Mobile Academy",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "E2E Story Matrix Mobile Academy",
        state: "MA",
        schoolType: "private_school",
        entityType: "nonprofit_501c3",
        schoolStage: "new_school",
        fundingProfile: "tuition_based",
        operatingYear: "first_year",
        openingYear: 2026,
        modelDuration: "five_year",
        currentStudents: 0,
        longTermEnrollmentGoal: 120,
        maxCapacity: 180,
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        isAccredited: false,
        locationSecured: false,
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
        hasBookkeeper: false,
        bookkeeperMonthlyCost: 0,
        hasLawyer: false,
        lawyerMonthlyCost: 0,
        hasGeneralLiabilityInsurance: false,
        insuranceCost: 0,
        hasLocalBusinessLicense: false,
        localBusinessLicenseAnnualCost: 0,
        hasSavingsAccount: false,
        hasBusinessAccount: false,
        hasCreditCard: false,
        hasLoan: false,
        loanAmount: 0,
        loanRate: 0,
        loanTermYears: 0,
        lendingLabIntent: "budget_only",
        debtIncluded: false,
        accountingBasis: "accrual",
        sameTuitionForAllBands: true,
        // Story-step grouping: render the per-grade matrix with the four
        // active grades below.
        studentGroupingMode: "grades",
        gradeActive: [...ACTIVE_GRADES],
        gradeEnrollment: {
          k: [0, 0, 0, 0, 0],
          g1: [0, 0, 0, 0, 0],
          g2: [0, 0, 0, 0, 0],
          g3: [0, 0, 0, 0, 0],
        },
        gradePerPupil: { k: 12000, g1: 12000, g2: 12000, g3: 12000 },
      },
      enrollment: { year1: 0, year2: 0, year3: 0, year4: 0, year5: 0 },
      programs: [],
      revenue: {
        tuitionPerStudent: 12000,
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
      staffingRows: [],
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

async function registerAndSeed(
  request: APIRequestContext,
): Promise<{ token: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-story-mobile-${stamp}@e2e.schoolstack.test`;

  // Same retry-on-429 pattern as sibling specs — the register endpoint is
  // IP-rate-limited and full-suite runs can blow through the window.
  const { token } = await registerAndVerifyE2E(request, { email, password: TEST_PASSWORD, name: "Playwright Founder" });

  await seedPersona(request, token, {
    stage: "yet_to_launch",
    comfort: "comfortable",
  });

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

  return { token };
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

async function dismissOverlays(page: Page): Promise<void> {
  // The wizard's "What to have ready" prep dialog opens on a useEffect
  // after model load. Wait briefly, dismiss if present, then proceed.
  const prepDialog = page.getByRole("dialog", { name: /What to have ready/i });
  try {
    await prepDialog.waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: /Let.?s get started/i }).click();
    await prepDialog.waitFor({ state: "detached", timeout: 5_000 });
  } catch {
    // dialog never appeared — proceed
  }

  // Cookie banner is pre-declined by the shared test fixture, but be
  // defensive in case the script ever races with a navigation.
  const cookieDecline = page.getByRole("button", { name: /^Decline$/ });
  try {
    await cookieDecline.click({ timeout: 2000 });
  } catch {
    // never appeared — proceed
  }
}

async function fillGradeInputs(page: Page): Promise<void> {
  const values: Record<(typeof ACTIVE_GRADES)[number], {
    y1: number;
    tuition: number;
    y5: number;
    ratio: number;
  }> = {
    k: { y1: 12, tuition: 12000, y5: 18, ratio: 10 },
    g1: { y1: 14, tuition: 13000, y5: 20, ratio: 12 },
    g2: { y1: 16, tuition: 14000, y5: 22, ratio: 14 },
    g3: { y1: 18, tuition: 15000, y5: 24, ratio: 16 },
  };
  for (const key of ACTIVE_GRADES) {
    const v = values[key];
    await page.getByTestId(`story-grade-year1-${key}`).fill(String(v.y1));
    await page.getByTestId(`story-grade-per-pupil-${key}`).fill(String(v.tuition));
    await page.getByTestId(`story-grade-longterm-${key}`).fill(String(v.y5));
    await page.getByTestId(`story-grade-ratio-${key}`).fill(String(v.ratio));
  }
  // Commit the last input's onChange before measuring layout.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
}

test.describe("Story step grade matrix — real-browser layout", () => {
  test("phone viewport (390x844): no horizontal scroll while filling every grade row", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 390, height: 844 });

    const { token } = await registerAndSeed(request);
    const modelId = await createModel(request, token, buildSeedPayload());
    await primeAuthToken(page, token);
    await page.goto(`/model/${modelId}`);
    await dismissOverlays(page);

    await expect(
      page
        .getByRole("heading", { name: /Let.?s start with your school.?s story/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // The mobile layout hides the desktop column header (sm:hidden inversion)
    // and exposes per-row labels for each cell. Sanity-check one such label
    // is actually rendered visible at this viewport before we type.
    await expect(page.getByTestId("story-grade-year1-label-k")).toBeVisible();

    // Fill all four grade rows: Y1 students, tuition, Y5 students, ratio.
    await fillGradeInputs(page);

    // The matrix detail section must not introduce horizontal overflow at
    // a phone width. We assert three things:
    //   1. The matrix detail section's own scrollWidth fits within its
    //      clientWidth — defends against the case where some ancestor's
    //      overflow:hidden masks a child overflow that would otherwise
    //      manifest as a stuck scroll bar inside the card. This is the
    //      core "no sideways scroll" promise of Task #519.
    //   2. The matrix detail section is itself no wider than the viewport
    //      — which is the founder-visible symptom the task is about
    //      (the matrix can't push the page wider than the phone screen).
    //   3. The whole document does not scroll horizontally at a phone
    //      width (Task #526) — the wizard chrome (step rail, sticky
    //      header, persona overlay) must also fit inside the viewport.
    const detailMetrics = await page
      .getByTestId("story-grades-detail-section")
      .evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        boundingWidth: el.getBoundingClientRect().width,
      }));
    expect(
      detailMetrics.scrollWidth,
      `story-grades-detail-section scrollWidth (${detailMetrics.scrollWidth}) ` +
        `exceeded its clientWidth (${detailMetrics.clientWidth}) — the matrix ` +
        `is overflowing horizontally on phone-sized viewports.`,
    ).toBeLessThanOrEqual(detailMetrics.clientWidth);
    expect(
      detailMetrics.boundingWidth,
      `story-grades-detail-section rendered ${detailMetrics.boundingWidth}px ` +
        `wide at a 390px viewport — the matrix should not push the page wider ` +
        `than the founder's phone screen.`,
    ).toBeLessThanOrEqual(390);

    // Task #526 — the whole document must also fit within the phone
    // viewport. Previously the wizard's step rail rendered 12 fixed-width
    // step circles in a `justify-between` row, which blew past the
    // 390px viewport by ~10px and caused a stuck horizontal scroll bar
    // on every wizard step. Re-enabled now that the rail uses smaller
    // circles on mobile and the chrome clips horizontal overflow.
    const pageMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      pageMetrics.scrollWidth,
      `document scrollWidth (${pageMetrics.scrollWidth}) exceeded window ` +
        `innerWidth (${pageMetrics.innerWidth}) — the wizard chrome is ` +
        `pushing the page wider than the phone viewport.`,
    ).toBeLessThanOrEqual(pageMetrics.innerWidth);

    // The desktop column header is hidden on mobile (it lives inside the
    // `hidden sm:grid` row). Confirm it's not visible at this width so the
    // hidden/grid stacked layout we're asserting is actually in effect.
    await expect(page.getByTestId("story-grade-y5-header")).toBeHidden();
  });

  test("desktop viewport (1280x800): Y5 header visible alongside inputs in a single row", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 1280, height: 800 });

    const { token } = await registerAndSeed(request);
    const modelId = await createModel(request, token, buildSeedPayload());
    await primeAuthToken(page, token);
    await page.goto(`/model/${modelId}`);
    await dismissOverlays(page);

    await expect(
      page
        .getByRole("heading", { name: /Let.?s start with your school.?s story/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // The desktop column header must render at this width.
    const y5Header = page.getByTestId("story-grade-y5-header");
    await expect(y5Header).toBeVisible();

    // The mobile-only per-row label must NOT render at desktop widths
    // (it carries `sm:hidden`). If it does, the responsive layout has
    // regressed.
    await expect(page.getByTestId("story-grade-year1-label-k")).toBeHidden();

    // Each grade row should lay out as a single horizontal row, with the
    // Y1, tuition, Y5, and ratio inputs all sharing the row's vertical
    // center-line. We assert this by reading bounding boxes for the K row
    // and confirming all four inputs sit on the same baseline (top within
    // a few pixels of each other) and to the right of the Grade label.
    const rowK = page.getByTestId("story-grade-detail-k");
    await expect(rowK).toBeVisible();

    const cells = await Promise.all([
      page.getByTestId("story-grade-year1-k").boundingBox(),
      page.getByTestId("story-grade-per-pupil-k").boundingBox(),
      page.getByTestId("story-grade-longterm-k").boundingBox(),
      page.getByTestId("story-grade-ratio-k").boundingBox(),
    ]);
    for (const [i, box] of cells.entries()) {
      expect(box, `cell ${i} should have a bounding box`).not.toBeNull();
    }
    const tops = cells.map((b) => (b ? b.y : Number.NaN));
    const maxTop = Math.max(...tops);
    const minTop = Math.min(...tops);
    expect(
      maxTop - minTop,
      `desktop row inputs should share a baseline (tops within 4px); ` +
        `got tops=${tops.join(",")}`,
    ).toBeLessThanOrEqual(4);

    // And lefts should be strictly increasing — the matrix is laid out
    // left-to-right in a single row at desktop widths, not stacked.
    const lefts = cells.map((b) => (b ? b.x : Number.NaN));
    for (let i = 1; i < lefts.length; i += 1) {
      expect(
        lefts[i],
        `cell ${i} (x=${lefts[i]}) should be to the right of cell ${i - 1} ` +
          `(x=${lefts[i - 1]}) — single-row desktop layout regressed`,
      ).toBeGreaterThan(lefts[i - 1]);
    }

    // The Y5 header and the Y5 input for K should share a grid column —
    // both header and input are left-aligned (not centered) within their
    // column, so we assert horizontal containment: the input falls within
    // the header column's left/right bounds (the input is `sm:w-24` while
    // the header cell takes the full column width).
    const headerBox = await y5Header.boundingBox();
    const y5InputBox = await page
      .getByTestId("story-grade-longterm-k")
      .boundingBox();
    expect(headerBox).not.toBeNull();
    expect(y5InputBox).not.toBeNull();
    if (headerBox && y5InputBox) {
      expect(
        y5InputBox.x,
        `Y5 input left (${y5InputBox.x}) should be within Y5 header column ` +
          `[${headerBox.x}, ${headerBox.x + headerBox.width}] — column alignment regressed`,
      ).toBeGreaterThanOrEqual(headerBox.x - 4);
      expect(
        y5InputBox.x + y5InputBox.width,
        `Y5 input right (${y5InputBox.x + y5InputBox.width}) should not extend ` +
          `past Y5 header column right (${headerBox.x + headerBox.width})`,
      ).toBeLessThanOrEqual(headerBox.x + headerBox.width + 4);
    }

    // No horizontal page scroll at desktop width either.
    const pageMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(pageMetrics.scrollWidth).toBeLessThanOrEqual(pageMetrics.innerWidth);
  });
});
