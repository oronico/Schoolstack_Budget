// Canonical Oakwood Learning Studio microschool demo data.
//
// Shared between:
//   - src/lib/seed-preview-data.ts        (PR preview seed)
//   - src/scripts/generate-legislator-samples.ts  (downloadable packets)
//
// Each consumer wraps this with its own naming convention (e.g.
// "(Demo Microschool)" vs "(Legislator Sample)") but the underlying
// tuition tiers, staffing, and facility data live here so a tweak in
// one place is reflected everywhere.

export const MICROSCHOOL_DEMO = {
  baseSchoolName: "Oakwood Learning Studio",
  slug: "Oakwood_Learning_Studio",
  schoolStage: "new_school" as const,
  fundingProfile: "tuition_based" as const,
  data: {
    schoolProfile: {
      schoolName: "Oakwood Learning Studio",
      state: "AZ",
      schoolType: "microschool",
      entityType: "llc_single",
      schoolStage: "new_school",
      fundingProfile: "tuition_based",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 45,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: true,
      year1OperatingMonths: 10,
      locationSecured: true,
      facilityCity: "Scottsdale",
      facilityState: "AZ",
      ownershipType: "rent",
      monthlyRent: 2200,
      annualRentEscalation: 3,
      lendingLabIntent: "plan_to_apply",
      debtIncluded: true,
    },
    enrollment: {
      year1: 20, year2: 26, year3: 32, year4: 37, year5: 40,
      retentionRate: 88, applicationsReceived: 35, waitlistCount: 8,
    },
    tuitionTiers: [
      { id: "t1", tierType: "full_pay", label: "Full Pay", discountPercent: 0, studentCounts: [14, 18, 22, 26, 28] },
      { id: "t2", tierType: "sibling_discount", label: "Sibling Discount", discountPercent: 15, studentCounts: [4, 5, 7, 8, 9] },
      { id: "t3", tierType: "high_need_scholarship", label: "Need-Based Scholarship", discountPercent: 40, studentCounts: [2, 3, 3, 3, 3] },
    ],
    tuitionEscalation: { rate: 3 },
    revenue: {
      tuitionPerStudent: 10000, annualTuitionIncrease: 3,
      annualDonations: 12000, foundationGrants: 18000,
    },
    revenueRows: [
      { id: "gross_tuition", category: "tuition_and_fees", lineItem: "Private Pay / Tuition", enabled: true, driverType: "per_student", amounts: [10000, 10300, 10609, 10927, 11255], escalationRate: 3, billingMonths: 10, collectionMethod: "autopay", collectionRate: 100, collectionDelayDays: 0 },
      { id: "registration_fees", category: "tuition_and_fees", lineItem: "Registration / Enrollment Fees", enabled: true, driverType: "per_student", amounts: [250, 250, 250, 250, 250], billingMonths: 12 },
      { id: "scholarships_aid", category: "tuition_offsets", lineItem: "Scholarships / Financial Aid / Discount Rate", enabled: true, driverType: "percent_of_base", amounts: [8, 8, 8, 8, 8], percentBase: "gross_tuition", billingMonths: 10 },
      { id: "donations_fundraising", category: "philanthropy", lineItem: "Donations / Fundraising", enabled: true, driverType: "annual_fixed", amounts: [8000, 7000, 5000, 4000, 3000], grantStatus: "projected", receiptQuarter: 1 },
      { id: "grants", category: "philanthropy", lineItem: "Startup Grant (Foundation)", enabled: true, driverType: "annual_fixed", amounts: [15000, 10000, 5000, 0, 0], grantStatus: "confirmed", receiptQuarter: 2 },
    ],
    staffingRows: [
      { id: "s1", roleName: "Founder / Lead Teacher", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 58000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "Owner-operator", staffingMode: "fixed" },
      { id: "s2", roleName: "Assistant Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 38000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s3", roleName: "Part-Time Aide", functionCategory: "instructional", employmentType: "part_time", fte: 0.5, annualizedRate: 24000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "Starts Y2", staffingMode: "ratio", studentRatio: 15, minFte: 0, maxFte: 2, startYear: 2 },
    ],
    facilities: {
      monthlyRent: 2200, annualRentIncrease: 3, annualUtilities: 4200,
      annualInsurance: 2800, curriculumCostPerStudent: 450,
      techCostPerStudent: 350, annualMarketing: 3500,
      annualSalaryIncrease: 3, generalCostInflation: 3,
    },
    expenseRows: [
      { id: "e1", category: "occupancy_facility", lineItem: "Rent / Lease", enabled: true, driverType: "monthly", amounts: [2200, 2266, 2334, 2404, 2476], escalationRate: 3 },
      { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "annual_fixed", amounts: [4200, 4326, 4456, 4590, 4728] },
      { id: "e3", category: "occupancy_facility", lineItem: "Property & Liability Insurance", enabled: true, driverType: "annual_fixed", amounts: [2800, 2884, 2971, 3060, 3152] },
      { id: "e4", category: "instructional_program", lineItem: "Curriculum & Materials", enabled: true, driverType: "per_student", amounts: [450, 450, 450, 450, 450] },
      { id: "e5", category: "technology", lineItem: "Software & Subscriptions (SIS, LMS)", enabled: true, driverType: "annual_fixed", amounts: [2400, 2472, 2546, 2622, 2701] },
      { id: "e6", category: "administrative_general", lineItem: "Marketing & Admissions", enabled: true, driverType: "annual_fixed", amounts: [3500, 3000, 2500, 2000, 1800] },
      { id: "e7", category: "administrative_general", lineItem: "Legal & Accounting", enabled: true, driverType: "annual_fixed", amounts: [4500, 4635, 4774, 4917, 5065] },
    ],
    capitalAndDebtRows: [
      { id: "cd1", lineItem: "FF&E (Furniture, Fixtures & Equipment)", enabled: true, driverType: "annual_fixed", amounts: [8000, 2000, 1500, 1000, 500], isLoan: false },
      { id: "cd2", lineItem: "SchoolStack Lending Lab Microloan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 20000, loanRate: 6.5, loanTermYears: 5, purpose: "startup" },
    ],
    openingBalances: { cash: 12000, accountsReceivable: 0, fixedAssets: 3000 },
    scenarios: [
      { name: "Conservative (20% fewer students)", enrollmentAdjustment: -20, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Base Case", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Aggressive (15% more students)", enrollmentAdjustment: 15, tuitionAdjustment: 5, expenseAdjustment: 0, staffingAdjustment: 5, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.25, minDaysCashOnHand: 30, minMonthsRunway: 2, minCapacityUtil: 0.5 },
  },
};
