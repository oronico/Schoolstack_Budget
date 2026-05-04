// Canonical Riverside Christian Academy private-school demo data.
//
// Shared between:
//   - src/lib/seed-preview-data.ts        (PR preview seed)
//   - src/scripts/generate-legislator-samples.ts  (downloadable packets)
//
// Each consumer wraps this with its own naming convention (e.g.
// "(Demo Private School)" vs "(Legislator Sample)") but the underlying
// tuition tiers, staffing, and facility data live here so a tweak in
// one place is reflected everywhere.

export const PRIVATE_SCHOOL_DEMO = {
  baseSchoolName: "Riverside Christian Academy",
  slug: "Riverside_Christian_Academy",
  schoolStage: "operating_school" as const,
  fundingProfile: "tuition_based" as const,
  data: {
    schoolProfile: {
      schoolName: "Riverside Christian Academy",
      state: "FL",
      schoolType: "private_school",
      entityType: "nonprofit_501c3",
      schoolStage: "operating_school",
      fundingProfile: "tuition_based",
      openingYear: 2023,
      currentStudents: 185,
      maxCapacity: 400,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: false,
      year1OperatingMonths: 12,
      locationSecured: true,
      ownershipType: "own",
      hasMortgage: true,
      mortgageMonthlyPayment: 8500,
      lendingLabIntent: "want_to_understand",
      debtIncluded: true,
    },
    enrollment: { year1: 200, year2: 250, year3: 300, year4: 350, year5: 400, retentionRate: 92 },
    tuitionTiers: [
      { id: "t1", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: [130, 160, 200, 230, 260] },
      { id: "t2", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 10, studentCounts: [40, 50, 60, 70, 80] },
      { id: "t3", tierType: "high_need_scholarship", label: "Need-Based Scholarship", discountPercent: 50, studentCounts: [30, 40, 40, 50, 60] },
    ],
    tuitionEscalation: { rate: 4 },
    revenue: {
      tuitionPerStudent: 12500, annualTuitionIncrease: 4,
      annualDonations: 75000, foundationGrants: 50000, capitalGifts: 25000,
    },
    revenueRows: [
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Annual Tuition (K-8)", enabled: true, driverType: "per_student", amounts: [12500, 13000, 13520, 14061, 14623], escalationRate: 4, billingMonths: 10 },
      { id: "r2", category: "tuition_and_fees", lineItem: "Registration & Activity Fees", enabled: true, driverType: "per_student", amounts: [750, 750, 750, 750, 750] },
      { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Scholarships / Financial Aid", enabled: true, driverType: "percent_of_base", amounts: [12, 12, 12, 12, 12], percentBase: "gross_tuition" },
      { id: "r3", category: "philanthropy", lineItem: "Annual Fund Donations", enabled: true, driverType: "annual_fixed", amounts: [75000, 85000, 95000, 100000, 110000] },
      { id: "r4", category: "philanthropy", lineItem: "Foundation Grants", enabled: true, driverType: "annual_fixed", amounts: [50000, 40000, 30000, 25000, 20000] },
      { id: "r5", category: "other_revenue", lineItem: "After-School Programs", enabled: true, driverType: "per_student", amounts: [500, 500, 500, 500, 500] },
    ],
    staffingRows: [
      { id: "s1", roleName: "Head of School", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 95000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s2", roleName: "Assistant Principal", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 72000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s3", roleName: "Lead Teachers (K-8)", functionCategory: "instructional", employmentType: "full_time", fte: 12, annualizedRate: 48000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "Ratio-driven 1:18", staffingMode: "ratio", studentRatio: 18, minFte: 8, maxFte: 22 },
      { id: "s4", roleName: "Teaching Assistants", functionCategory: "instructional", employmentType: "full_time", fte: 6, annualizedRate: 30000, benefitsEligible: true, benefitsRate: 15, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s5", roleName: "Office Manager", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 42000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s6", roleName: "Counselor", functionCategory: "student_support", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
    ],
    facilities: {
      annualUtilities: 24000, annualInsurance: 18000,
      facilityMaintenance: 18000, curriculumCostPerStudent: 600,
      techCostPerStudent: 350, annualMarketing: 15000,
      annualSalaryIncrease: 3, generalCostInflation: 3,
    },
    expenseRows: [
      { id: "e1", category: "instructional_program", lineItem: "Curriculum & Textbooks", enabled: true, driverType: "per_student", amounts: [600, 600, 600, 600, 600] },
      { id: "e2", category: "technology", lineItem: "Technology (Devices + Software)", enabled: true, driverType: "per_student", amounts: [350, 350, 350, 350, 350] },
      { id: "e3", category: "occupancy_facility", lineItem: "Utilities & Maintenance", enabled: true, driverType: "annual_fixed", amounts: [36000, 38000, 40000, 42000, 44000] },
      { id: "e4", category: "administrative_general", lineItem: "Insurance (General + D&O)", enabled: true, driverType: "annual_fixed", amounts: [18000, 19000, 20000, 21000, 22000] },
      { id: "e5", category: "administrative_general", lineItem: "Marketing & Enrollment", enabled: true, driverType: "annual_fixed", amounts: [15000, 12000, 10000, 8000, 8000] },
      { id: "e6", category: "instructional_program", lineItem: "Professional Development", enabled: true, driverType: "annual_fixed", amounts: [8000, 10000, 12000, 14000, 15000] },
      { id: "e7", category: "administrative_general", lineItem: "Accounting & Legal", enabled: true, driverType: "annual_fixed", amounts: [12000, 12500, 13000, 13500, 14000] },
    ],
    capitalAndDebtRows: [
      { id: "d1", lineItem: "Building Mortgage", enabled: true, driverType: "annual_fixed", amounts: [102000, 102000, 102000, 102000, 102000], isLoan: true, loanPrincipal: 1200000, loanRate: 5.5, loanTermYears: 25 },
      { id: "d2", lineItem: "Renovation Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 150000, loanRate: 7, loanTermYears: 10 },
    ],
    openingBalances: { cash: 120000, fixedAssets: 850000, longTermDebt: 1200000 },
    priorYearSnapshot: { endingEnrollment: 185, totalRevenue: 2400000, totalExpenses: 2200000, endingCash: 120000 },
    scenarios: [
      { name: "Slow Growth (flat enrollment Y2-3)", enrollmentAdjustment: -15, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Strong Growth (+10% enrollment)", enrollmentAdjustment: 10, tuitionAdjustment: 0, expenseAdjustment: 5, staffingAdjustment: 5, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.2, minDaysCashOnHand: 45, minMonthsRunway: 3, minCapacityUtil: 0.6 },
  },
};
