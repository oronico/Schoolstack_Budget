import { seedPersona } from "./utils/seed-persona";
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "./utils/test";
import { registerAndVerifyE2E } from "./utils/register-and-verify";

// Task #525: end-to-end coverage for the Story-step age-band matrix's
// mobile-friendly layout. Task #522 covered the grades-only sibling at
// 390x844; this spec exercises the age-band variant
// (story-bands-detail-section, used by microschools / learning labs)
// which shares the same responsive grid but is not otherwise covered
// end-to-end. The vitest unit tests confirm the Tailwind classes render
// (sm:hidden labels, grid-cols-1 → sm:grid-cols-N) but jsdom doesn't
// apply CSS, so the no-horizontal-scroll behaviour and the desktop
// single-row layout are not exercised end-to-end.

const TEST_PASSWORD = "PlaywrightTest12345!";

// Two active bands keep the matrix realistic for a microschool / learning
// lab founder while still exercising every cell type (Y1, tuition, Y5,
// ratio) for more than one row.
const ACTIVE_BANDS = ["preK", "k5"] as const;

function buildSeedPayload(): Record<string, unknown> {
  // Pick a private operating school so the StoryStep renders in
  // five-year mode (Y5 column visible).
  return {
    name: "E2E Story Band Matrix Mobile Lab",
    currentStep: 1,
    data: {
      schoolProfile: {
        schoolName: "E2E Story Band Matrix Mobile Lab",
        state: "MA",
        schoolType: "private_school",
        entityType: "nonprofit_501c3",
        schoolStage: "new_school",
        fundingProfile: "tuition_based",
        operatingYear: "first_year",
        openingYear: 2026,
        modelDuration: "five_year",
        currentStudents: 0,
        longTermEnrollmentGoal: 60,
        maxCapacity: 90,
        fiscalYearStartMonth: 7,
        isPartialFirstYear: false,
        year1OperatingMonths: 12,
        isAccredited: false,
        locationSecured: false,
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
        sameTuitionForAllBands: false,
        // Story-step grouping: render the per-band matrix with the two
        // active age bands below.
        studentGroupingMode: "age_bands",
        gradeBandActive: [...ACTIVE_BANDS],
        gradeBandEnrollment: {
          preK: [0, 0, 0, 0, 0],
          k5: [0, 0, 0, 0, 0],
        },
        gradeBandPerPupil: { preK: 10000, k5: 12000 },
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
        studentsPerTeacher: 10,
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
        monthlyRent: 8000,
        annualRentIncrease: 3,
        annualUtilities: 18000,
        annualInsurance: 9000,
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
  const email = `playwright-story-band-mobile-${stamp}@e2e.schoolstack.test`;

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

async function fillBandInputs(page: Page): Promise<void> {
  const values: Record<(typeof ACTIVE_BANDS)[number], {
    y1: number;
    tuition: number;
    y5: number;
    ratio: number;
  }> = {
    preK: { y1: 8, tuition: 10000, y5: 14, ratio: 8 },
    k5: { y1: 12, tuition: 12000, y5: 22, ratio: 10 },
  };
  for (const key of ACTIVE_BANDS) {
    const v = values[key];
    await page.getByTestId(`story-band-year1-${key}`).fill(String(v.y1));
    await page.getByTestId(`story-band-per-pupil-${key}`).fill(String(v.tuition));
    await page.getByTestId(`story-band-longterm-${key}`).fill(String(v.y5));
    await page.getByTestId(`story-band-ratio-${key}`).fill(String(v.ratio));
  }
  // Commit the last input's onChange before measuring layout.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
}

test.describe("Story step age-band matrix — real-browser layout", () => {
  test("phone viewport (390x844): no horizontal scroll while filling every band row", async ({
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
    await expect(page.getByTestId("story-band-year1-label-preK")).toBeVisible();

    // Fill all band rows: Y1 students, tuition, Y5 students, ratio.
    await fillBandInputs(page);

    // The matrix detail section must not introduce horizontal overflow at
    // a phone width. We assert two things:
    //   1. The matrix detail section's own scrollWidth fits within its
    //      clientWidth — defends against the case where some ancestor's
    //      overflow:hidden masks a child overflow that would otherwise
    //      manifest as a stuck scroll bar inside the card.
    //   2. The matrix detail section is itself no wider than the viewport
    //      — the founder-visible symptom (the matrix can't push the page
    //      wider than the phone screen).
    //
    // We deliberately do NOT assert document.documentElement.scrollWidth
    // === window.innerWidth here, because the wizard chrome (sidebar,
    // sticky header, persona overlay residue, etc.) can introduce a few
    // pixels of unrelated overflow on phone widths that have nothing to
    // do with this task. A regression in StoryStep would still trip the
    // section-scoped assertions below.
    const detailMetrics = await page
      .getByTestId("story-bands-detail-section")
      .evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        boundingWidth: el.getBoundingClientRect().width,
      }));
    expect(
      detailMetrics.scrollWidth,
      `story-bands-detail-section scrollWidth (${detailMetrics.scrollWidth}) ` +
        `exceeded its clientWidth (${detailMetrics.clientWidth}) — the band ` +
        `matrix is overflowing horizontally on phone-sized viewports.`,
    ).toBeLessThanOrEqual(detailMetrics.clientWidth);
    expect(
      detailMetrics.boundingWidth,
      `story-bands-detail-section rendered ${detailMetrics.boundingWidth}px ` +
        `wide at a 390px viewport — the band matrix should not push the page ` +
        `wider than the founder's phone screen.`,
    ).toBeLessThanOrEqual(390);

    // The desktop column header is hidden on mobile (it lives inside the
    // `hidden sm:grid` row). Confirm it's not visible at this width so the
    // hidden/grid stacked layout we're asserting is actually in effect.
    await expect(page.getByTestId("story-band-y5-header")).toBeHidden();
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
    const y5Header = page.getByTestId("story-band-y5-header");
    await expect(y5Header).toBeVisible();

    // The mobile-only per-row labels must NOT render at desktop widths
    // (they carry `sm:hidden`). If they do, the responsive layout has
    // regressed.
    for (const key of ACTIVE_BANDS) {
      await expect(
        page.getByTestId(`story-band-year1-label-${key}`),
      ).toBeHidden();
    }

    // Each band row should lay out as a single horizontal row, with the
    // Y1, tuition, Y5, and ratio inputs all sharing the row's vertical
    // center-line. We assert this by reading bounding boxes for the
    // pre-K row and confirming all four inputs sit on the same baseline
    // (top within a few pixels of each other) and lay out left-to-right.
    const rowPreK = page.getByTestId("story-band-detail-preK");
    await expect(rowPreK).toBeVisible();

    const cells = await Promise.all([
      page.getByTestId("story-band-year1-preK").boundingBox(),
      page.getByTestId("story-band-per-pupil-preK").boundingBox(),
      page.getByTestId("story-band-longterm-preK").boundingBox(),
      page.getByTestId("story-band-ratio-preK").boundingBox(),
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
  });
});
