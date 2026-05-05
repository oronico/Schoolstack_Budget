// Canonical Chesterton Academy of Saint Edmund demo data.
//
// Used by:
//   - src/lib/seed-preview-data.ts        (PR preview seed)
//
// Models a founding-year Catholic classical high school in the
// Chesterton Schools Network mold so the long-lived `chesterton-preview`
// branch deploy (see docs/CHESTERTON_PREVIEW.md) opens onto something a
// CSN founder will recognize within ten seconds:
//   - Grades 9-12 only, with a single freshman class founding the
//     school and one new grade added per year (15 → 30 → 45 → 60 → 75)
//   - $8,500 starting tuition with 4% annual growth, 10% need-based aid
//     pool, plus a 15% sibling discount tier — the CSN template defaults
//   - Classical subject specialists (Literature, Mathematics, Theology,
//     Latin, Science, History, Arts) at the CSN starting-teacher salary
//     of $44,000, single founding Headmaster, parish-shared facility
//   - ~$287K total philanthropy goal in Year 1 modeled after the CSN
//     "Sample Gift Chart" pyramid (major + mid-major + annual fund +
//     grassroots) — heavy fundraising tilt is the CSN signature
//
// IMPORTANT: This demo uses the standard `private_school` schoolType
// and the regular ModelData shape (revenueRows, staffingRows,
// tuitionTiers, etc.) so it flows through the consultant engine,
// formula workbook, lender packet, and board packet identically to
// the other demos. A reviewer who wants to exercise the dedicated
// `chesterton_academy` wizard branch (with `data.chesterton.*` inputs
// and the CSN Operating Manual export) can do that by clicking
// "Create new model" after logging in and picking "Chesterton Academy"
// as the school type — that path is intentionally separate from the
// seeded demo so the seed never has to keep two payload shapes in sync.

export const CHESTERTON_ACADEMY_DEMO = {
  baseSchoolName: "Chesterton Academy of Saint Edmund",
  slug: "Chesterton_Academy_Saint_Edmund",
  schoolStage: "new_school" as const,
  fundingProfile: "tuition_based" as const,
  data: {
    schoolProfile: {
      schoolName: "Chesterton Academy of Saint Edmund",
      state: "IL",
      schoolType: "private_school",
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
    enrollment: {
      // CSN founding pattern: a single freshman class in Y1, one new
      // grade added per year until full 9-12 by Y4.
      year1: 15, year2: 30, year3: 45, year4: 60, year5: 75,
      retentionRate: 90,
      applicationsReceived: 28,
      waitlistCount: 5,
    },
    tuitionTiers: [
      // Counts sum to the enrollment row above. CSN default aid is 10%,
      // distributed here across a sibling-discount tier and a
      // need-based aid tier so the discount math exercises both paths.
      { id: "t1", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: [11, 22, 33, 44, 55] },
      { id: "t2", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 15, studentCounts: [2, 4, 6, 9, 12] },
      { id: "t3", tierType: "high_need_scholarship", label: "Need-Based Aid", discountPercent: 35, studentCounts: [2, 4, 6, 7, 8] },
    ],
    tuitionEscalation: { rate: 4 },
    revenue: {
      tuitionPerStudent: 8500,
      annualTuitionIncrease: 4,
      // Match the Y1 sum of the four philanthropy revenueRows below
      // ($100K + $50K + $100K + $37.5K = $287.5K, the CSN founding
      // fundraising goal). The legacy `annualDonations` field is a
      // top-line summary; the line-item revenueRows are the source of
      // truth that flows through the consultant engine and exports.
      annualDonations: 287500,
    },
    revenueRows: [
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Tuition (Grades 9-12)", enabled: true, driverType: "per_student", amounts: [8500, 8840, 9194, 9561, 9944], escalationRate: 4, billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
      { id: "books_supply_fee", category: "tuition_and_fees", lineItem: "Books & Supply Fee", enabled: true, driverType: "per_student", amounts: [600, 600, 600, 600, 600] },
      { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Need-Based Financial Aid", enabled: true, driverType: "percent_of_base", amounts: [10, 10, 10, 10, 10], percentBase: "gross_tuition" },
      // Philanthropy modeled on the CSN "Sample Gift Chart" pyramid.
      // Year 1 totals $287,500 (the CSN founding-class fundraising
      // goal: 1 lead $50K + 2 major $25K + 5 mid-major $10K +
      // 30 annual $2.5K-$5K + 50 grassroots $750 ≈ $287.5K). Tapers
      // modestly as recurring tuition revenue scales in later years
      // — a CSN founding board still raises ~$200K+/yr at full
      // enrollment to fund aid + capital reserves.
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
