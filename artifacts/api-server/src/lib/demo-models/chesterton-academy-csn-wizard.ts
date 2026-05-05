// Canonical Chesterton Academy "CSN Operating Manual View" demo data.
//
// Used by:
//   - src/lib/seed-preview-data.ts        (PR preview seed)
//
// This is the SECOND Chesterton-shaped demo (see chesterton-academy.ts
// for the first). The two coexist on purpose:
//
//   1. CHESTERTON_ACADEMY_DEMO       — schoolType: "private_school",
//      standard ModelData shape, flows through every export
//      identically to the other demos. Lives in chesterton-academy.ts.
//
//   2. CHESTERTON_ACADEMY_CSN_WIZARD_DEMO  (this file) — schoolType:
//      "chesterton_academy", populates `data.chesterton.*` so the
//      reviewer lands directly on the dedicated wizard branch
//      (Enrollment → Staffing → Fundraising → Gift Chart → Recruiting
//      with periods-based math + the CSN gift-chart pyramid UI) AND
//      the CSN Operating Manual export tab is gated on, all without
//      requiring the reviewer to first click "Create new model" and
//      pick "Chesterton Academy" as the school type. See task #560 in
//      docs/CHESTERTON_PREVIEW.md.
//
// Why two demos and not one merged demo? The dedicated wizard branch
// (CHESTERTON_STEPS in pages/model-wizard/index.tsx) replaces the
// generic Enrollment + Staffing steps and inserts Fundraising / Gift
// Chart / Recruiting steps that read exclusively from `data.chesterton.*`.
// A reviewer landing on the dedicated branch sees the CSN-shaped UI
// immediately. The standard `private_school` demo continues to anchor
// every export tab so the rest of the consultant/lender/board surface
// is still one click away.
//
// To keep the consultant engine, formula workbook, lender packet, and
// board packet all working on this demo too, we ALSO populate the
// standard ModelData fields (revenueRows, staffingRows, tuitionTiers,
// expenseRows, capitalAndDebtRows, scenarios, openingBalances,
// covenantThresholds). The dedicated wizard branch does not show those
// rows directly to the reviewer, but downstream code paths still read
// from them — leaving them unset would break the lender/board PDFs.
//
// IMPORTANT: api-server cannot import from artifacts/school-financial-model
// (no @workspace package is exposed for it), so the chesterton.* defaults
// here are inlined verbatim from
// artifacts/school-financial-model/src/lib/chesterton/template.ts. If
// you change the template defaults there, mirror the change here so the
// seeded payload still parses cleanly through `chestertonSchema`. The
// schema validates row counts and id strings, not specific values, so
// drift in numeric defaults is a UX-only concern (the reviewer just
// sees stale starting values), not a parse failure.

// `chesterton.totalFundraisingGoal` is the sum of `goalAmount` across
// `chesterton.fundraisingGoals` (matches the wizard's TFG roll-up).
// Components: 100,000 + 132,500 + 91,250 + 13,125 + 50,000 = 386,875.
const CSN_TOTAL_FUNDRAISING_GOAL = 386875;

export const CHESTERTON_ACADEMY_CSN_WIZARD_DEMO = {
  baseSchoolName:
    "Chesterton Academy of Saint Edmund — CSN Operating Manual View",
  slug: "Chesterton_Academy_Saint_Edmund_CSN_Wizard",
  schoolStage: "new_school" as const,
  fundingProfile: "tuition_based" as const,
  data: {
    schoolProfile: {
      schoolName:
        "Chesterton Academy of Saint Edmund (CSN Operating Manual View)",
      state: "IL",
      // The single switch that flips the wizard to CHESTERTON_STEPS and
      // unlocks the CSN Operating Manual export tab. Everything else on
      // this demo is supporting context so the OTHER exports still work.
      schoolType: "chesterton_academy",
      entityType: "nonprofit_501c3",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 100,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: true,
      year1OperatingMonths: 10,
      locationSecured: true,
      facilityCity: "Naperville",
      facilityState: "IL",
      ownershipType: "rent",
      monthlyRent: 4500,
      annualRentEscalation: 3,
      lendingLabIntent: "plan_to_apply",
      debtIncluded: true,
    },
    // Dedicated wizard branch payload — drives the CSN-shaped
    // ChestertonEnrollmentStep, ChestertonStaffingStep,
    // ChestertonFundraisingStep, ChestertonGiftChartStep, and
    // ChestertonRecruitingStep, plus the CSN Operating Manual workbook
    // export. Mirrors `buildDefaultChestertonData()` in
    // artifacts/school-financial-model/src/lib/chesterton/template.ts so
    // a reviewer sees the same numbers a founder would see when they
    // pick "Chesterton Academy" for their own new model — no surprises.
    chesterton: {
      planningYear: 2026,
      startingTuition: 8500,
      tuitionGrowthRate: 0.04,
      bookSupplyFee: 600,
      financialAidPct: 0.10,
      startingTeacherSalary: 44000,
      benefitsFirstYearAmount: 0,
      attritionRate: 0.10,
      totalFundraisingGoal: CSN_TOTAL_FUNDRAISING_GOAL,
      prospectConversionDivisor: 3,
      // CSN founding pattern: a single freshman class in the planning
      // year, then one new grade added per year until full 9-12 by Y3.
      // year0 is the planning-year baseline; year1..year5 are the
      // forward-looking five-year projections. Verbatim from
      // template.ts > DEFAULT_CHESTERTON_PHASE_ENROLLMENT.
      phaseEnrollment: [
        { grade: "freshman", year0: 15, year1: 15, year2: 20, year3: 21, year4: 22, year5: 22 },
        { grade: "sophomore", year0: 0, year1: 15, year2: 15, year3: 20, year4: 20, year5: 22 },
        { grade: "junior", year0: 0, year1: 0, year2: 13, year3: 14, year4: 18, year5: 20 },
        { grade: "senior", year0: 0, year1: 0, year2: 0, year3: 12, year4: 13, year5: 18 },
      ],
      // 1 section per grade for the first three years, 2 sections for
      // years 3-5 (total six numbers covering year0..year5).
      classesPerGrade: [1, 1, 1, 2, 2, 2],
      // Classical core + arts/PE. periodsPerSection=5 means a full FTE.
      salarySchedule: [
        { id: "subj-literature", subject: "Literature", periodsPerSection: 5 },
        { id: "subj-mathematics", subject: "Mathematics", periodsPerSection: 5 },
        { id: "subj-theology", subject: "Theology", periodsPerSection: 5 },
        { id: "subj-latin", subject: "Latin", periodsPerSection: 5 },
        { id: "subj-science", subject: "Science", periodsPerSection: 5 },
        { id: "subj-history", subject: "History", periodsPerSection: 5 },
        { id: "subj-arts", subject: "Arts & Music", periodsPerSection: 3 },
        { id: "subj-pe", subject: "Physical Education", periodsPerSection: 2 },
      ],
      // Mirror of the CSN "Sample Gift Chart" pyramid + standard
      // recurring categories. goalAmounts sum to CSN_TOTAL_FUNDRAISING_GOAL.
      fundraisingGoals: [
        { id: "fund-major", category: "Major Gifts ($25,000+)", goalAmount: 100000, numberOfGifts: 3, averageGift: 33333 },
        { id: "fund-mid", category: "Mid-Major Gifts ($5,000–$25,000)", goalAmount: 132500, numberOfGifts: 27, averageGift: 4907 },
        { id: "fund-annual", category: "Annual Fund ($500–$5,000)", goalAmount: 91250, numberOfGifts: 165, averageGift: 553 },
        { id: "fund-grass", category: "Grassroots (under $500)", goalAmount: 13125, numberOfGifts: 225, averageGift: 58 },
        { id: "fund-events", category: "Events", goalAmount: 50000, numberOfGifts: 0, averageGift: 0, notes: "Galas, auctions, peer-to-peer drives" },
      ],
      // Verbatim CSN "5 - GIFT CHART" worksheet pyramid.
      giftChart: [
        { id: "gift-50000", giftAmount: 50000, numberOfGifts: 1, numberOfProspects: 5 },
        { id: "gift-25000", giftAmount: 25000, numberOfGifts: 2, numberOfProspects: 5 },
        { id: "gift-20000", giftAmount: 20000, numberOfGifts: 1, numberOfProspects: 5 },
        { id: "gift-10000", giftAmount: 10000, numberOfGifts: 8, numberOfProspects: 20 },
        { id: "gift-7500", giftAmount: 7500, numberOfGifts: 7, numberOfProspects: 25 },
        { id: "gift-5000", giftAmount: 5000, numberOfGifts: 12, numberOfProspects: 25 },
        { id: "gift-2500", giftAmount: 2500, numberOfGifts: 17, numberOfProspects: 30 },
        { id: "gift-1000", giftAmount: 1000, numberOfGifts: 15, numberOfProspects: 30 },
        { id: "gift-500", giftAmount: 500, numberOfGifts: 35, numberOfProspects: 75 },
        { id: "gift-250", giftAmount: 250, numberOfGifts: 65, numberOfProspects: 120 },
        { id: "gift-100", giftAmount: 100, numberOfGifts: 100, numberOfProspects: 150 },
        { id: "gift-25", giftAmount: 25, numberOfGifts: 125, numberOfProspects: 250 },
      ],
      // Override the wizard's "0 prospects" placeholders with realistic
      // founding-class numbers so the recruiting projections + board
      // packet recruiting roll-up render with non-zero values out of
      // the box. Total prospects (78) ÷ expected divisor 3 = 26 ≈
      // year-1 freshman goal of 30, which makes the wizard's
      // best/expected/worst panel a realistic teaching moment.
      recruitingPipeline: [
        { id: "rec-siblings", source: "Siblings of current students", prospectiveStudents: 6, notes: "Younger siblings of K-8 feeder graduates" },
        { id: "rec-feeder", source: "Feeder school graduates", prospectiveStudents: 32, notes: "St. Raphael Catholic Academy 8th grade class" },
        { id: "rec-homeschool", source: "Homeschool students", prospectiveStudents: 28, notes: "DuPage Homeschool Co-op high-school families" },
        { id: "rec-parish", source: "Parish bulletin & open houses", prospectiveStudents: 12, notes: "St. Raphael, St. Margaret, St. John parish bulletins" },
      ],
      prospectiveFacilities: [
        { id: "fac-1", name: "Phase I — St. Raphael Parish Hall", capacity: 70, location: "Naperville, IL" },
        { id: "fac-2", name: "Phase II — Renovated Parish Annex", capacity: 100, location: "Naperville, IL" },
        { id: "fac-3", name: "Phase III — Standalone Campus (TBD)", capacity: 250, location: "DuPage County, IL" },
      ],
      priestlyOutreach: [
        { id: "priest-1", name: "Fr. Anthony Brankin", affiliation: "St. Raphael the Archangel" },
        { id: "priest-2", name: "Fr. Brian Welter", affiliation: "St. Margaret Mary" },
        { id: "priest-3", name: "Fr. Paul Hottinger", affiliation: "St. John the Evangelist" },
      ],
      keyInfluencers: [
        { id: "inf-1", name: "Maria Bertolino", affiliation: "Founding Board Chair" },
        { id: "inf-2", name: "Dr. Kevin O'Brien", affiliation: "Academic Advisor (Wyoming Catholic College)" },
      ],
    },
    // Standard wizard payload kept in sync with the founding-class
    // numbers above so the consultant engine, formula workbook, lender
    // packet, and board packet can all still run without falling back
    // to defaults. Mirrors the shape of CHESTERTON_ACADEMY_DEMO.
    enrollment: {
      year1: 15, year2: 30, year3: 45, year4: 60, year5: 75,
      retentionRate: 90,
      applicationsReceived: 28,
      waitlistCount: 5,
    },
    tuitionTiers: [
      { id: "t1", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: [11, 22, 33, 44, 55] },
      { id: "t2", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 15, studentCounts: [2, 4, 6, 9, 12] },
      { id: "t3", tierType: "high_need_scholarship", label: "Need-Based Aid", discountPercent: 35, studentCounts: [2, 4, 6, 7, 8] },
    ],
    tuitionEscalation: { rate: 4 },
    revenue: {
      tuitionPerStudent: 8500,
      annualTuitionIncrease: 4,
      annualDonations: 287500,
    },
    revenueRows: [
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Tuition (Grades 9-12)", enabled: true, driverType: "per_student", amounts: [8500, 8840, 9194, 9561, 9944], escalationRate: 4, billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
      { id: "books_supply_fee", category: "tuition_and_fees", lineItem: "Books & Supply Fee", enabled: true, driverType: "per_student", amounts: [600, 600, 600, 600, 600] },
      { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Need-Based Financial Aid", enabled: true, driverType: "percent_of_base", amounts: [10, 10, 10, 10, 10], percentBase: "gross_tuition" },
      { id: "major_gifts", category: "philanthropy", lineItem: "Major Gifts ($25K+)", enabled: true, driverType: "annual_fixed", amounts: [100000, 80000, 60000, 50000, 45000], grantStatus: "projected", receiptQuarter: 2 },
      { id: "mid_gifts", category: "philanthropy", lineItem: "Mid-Major Gifts ($5K-$25K)", enabled: true, driverType: "annual_fixed", amounts: [50000, 45000, 40000, 35000, 35000] },
      { id: "annual_fund", category: "philanthropy", lineItem: "Annual Fund ($500-$5K)", enabled: true, driverType: "annual_fixed", amounts: [100000, 95000, 90000, 85000, 80000] },
      { id: "grassroots", category: "philanthropy", lineItem: "Grassroots Gifts & Events", enabled: true, driverType: "annual_fixed", amounts: [37500, 35000, 32000, 30000, 25000] },
    ],
    staffingRows: [
      { id: "s1", roleName: "Headmaster", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 75000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 7.65, payrollLike: false, notes: "Founding head of school", staffingMode: "fixed" },
      { id: "s2", roleName: "Literature Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 44000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "Classical literature & rhetoric", staffingMode: "ratio", studentRatio: 25, minFte: 1, maxFte: 3 },
      { id: "s3", roleName: "Mathematics Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 44000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "Algebra through Calculus", staffingMode: "ratio", studentRatio: 25, minFte: 1, maxFte: 3 },
      { id: "s4", roleName: "Theology Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 44000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "Catholic doctrine & philosophy", staffingMode: "ratio", studentRatio: 25, minFte: 1, maxFte: 3 },
      { id: "s5", roleName: "Latin Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 44000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "Latin I-IV", staffingMode: "ratio", studentRatio: 25, minFte: 1, maxFte: 3 },
      { id: "s6", roleName: "Science Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 44000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "Biology / Chemistry / Physics", staffingMode: "ratio", studentRatio: 25, minFte: 1, maxFte: 3 },
      { id: "s7", roleName: "History Teacher", functionCategory: "instructional", employmentType: "part_time", fte: 0.5, annualizedRate: 44000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "Part-time Y1, full-time by Y3", staffingMode: "ratio", studentRatio: 30, minFte: 0.5, maxFte: 2 },
      { id: "s8", roleName: "Arts & Music Adjunct", functionCategory: "instructional", employmentType: "part_time", fte: 0.4, annualizedRate: 30000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "Shared with parish music program", staffingMode: "fixed" },
      { id: "s9", roleName: "Office Manager", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 38000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "Admissions + bookkeeping", staffingMode: "fixed" },
    ],
    facilities: {
      monthlyRent: 4500,
      annualRentIncrease: 3,
      annualUtilities: 14000,
      annualInsurance: 9500,
      curriculumCostPerStudent: 800,
      techCostPerStudent: 200,
      annualMarketing: 18000,
      annualSalaryIncrease: 3,
      generalCostInflation: 3,
    },
    expenseRows: [
      { id: "e1", category: "occupancy_facility", lineItem: "Rent (Phase I parish facility)", enabled: true, driverType: "monthly", amounts: [4500, 4635, 4774, 4917, 5065], escalationRate: 3 },
      { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "annual_fixed", amounts: [14000, 16000, 18000, 22000, 26000] },
      { id: "e3", category: "administrative_general", lineItem: "Insurance (GL, D&O)", enabled: true, driverType: "annual_fixed", amounts: [9500, 11000, 13000, 15000, 17000] },
      { id: "e4", category: "instructional_program", lineItem: "Classical Curriculum & Texts", enabled: true, driverType: "per_student", amounts: [800, 800, 800, 800, 800] },
      { id: "e5", category: "technology", lineItem: "Technology (intentionally minimal)", enabled: true, driverType: "per_student", amounts: [200, 200, 200, 200, 200] },
      { id: "e6", category: "administrative_general", lineItem: "Marketing & Recruiting", enabled: true, driverType: "annual_fixed", amounts: [18000, 15000, 12000, 10000, 9000] },
      { id: "e7", category: "administrative_general", lineItem: "Legal, Audit & CSN Affiliation Fees", enabled: true, driverType: "annual_fixed", amounts: [12000, 12500, 13000, 13500, 14000] },
      { id: "e8", category: "instructional_program", lineItem: "Professional Development (CSN Training)", enabled: true, driverType: "annual_fixed", amounts: [8000, 9000, 10000, 11000, 12000] },
    ],
    capitalAndDebtRows: [
      { id: "cd1", lineItem: "Founding-Year FF&E (Desks, Chapel, Library)", enabled: true, driverType: "annual_fixed", amounts: [25000, 8000, 8000, 5000, 3000], isLoan: false },
      { id: "cd2", lineItem: "Bridge Loan (Year 2 Activation)", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 50000, loanRate: 6.0, loanTermYears: 5, purpose: "startup" },
    ],
    openingBalances: { cash: 75000, accountsReceivable: 0, fixedAssets: 15000 },
    scenarios: [
      { name: "Slow Recruitment (-25% Y1 freshmen)", enrollmentAdjustment: -25, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Base Case (CSN Default)", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Strong First Class (+30% freshmen)", enrollmentAdjustment: 30, tuitionAdjustment: 0, expenseAdjustment: 5, staffingAdjustment: 10, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.20, minDaysCashOnHand: 30, minMonthsRunway: 2, minCapacityUtil: 0.6 },
  },
};
