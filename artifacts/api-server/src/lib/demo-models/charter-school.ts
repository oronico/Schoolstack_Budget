// Canonical Liberty STEM Charter School demo data.
//
// Shared between:
//   - src/lib/seed-preview-data.ts        (PR preview seed)
//   - src/scripts/generate-legislator-samples.ts  (downloadable packets)
//
// Each consumer wraps this with its own naming convention (e.g.
// "(Demo Charter School)" vs "(Legislator Sample)") but the underlying
// per-pupil rates, staffing, and facility data live here so a tweak in
// one place is reflected everywhere.

export const CHARTER_SCHOOL_DEMO = {
  baseSchoolName: "Liberty STEM Charter School",
  slug: "Liberty_STEM_Charter",
  schoolStage: "new_school" as const,
  fundingProfile: "charter_public_funded" as const,
  data: {
    schoolProfile: {
      schoolName: "Liberty STEM Charter School",
      state: "AZ",
      schoolType: "charter_school",
      entityType: "nonprofit_501c3",
      schoolStage: "new_school",
      fundingProfile: "charter_public_funded",
      openingYear: 2026,
      currentStudents: 0,
      maxCapacity: 600,
      fiscalYearStartMonth: 7,
      isPartialFirstYear: true,
      year1OperatingMonths: 10,
      locationSecured: true,
      facilityCity: "Phoenix",
      facilityState: "AZ",
      ownershipType: "rent",
      monthlyRent: 18000,
      annualRentEscalation: 3,
      lendingLabIntent: "plan_to_apply",
      debtIncluded: true,
      enrollmentRevenueMethod: "adm",
      gradeBandEnrollment: {
        k5: [120, 160, 210, 260, 310],
        m68: [80, 110, 140, 170, 200],
        h912: [0, 30, 50, 70, 90],
      },
      gradeBandPerPupil: { k5: 8200, m68: 8800, h912: 9500 },
    },
    enrollment: {
      year1: 200, year2: 300, year3: 400, year4: 500, year5: 600,
      retentionRate: 88, applicationsReceived: 320, waitlistCount: 45,
    },
    revenue: { publicFundingPerStudent: 8500 },
    revenueRows: [
      { id: "r1", category: "public_funding", lineItem: "State Per-Pupil Funding (K-5)", enabled: true, driverType: "per_student", amounts: [8200, 8364, 8531, 8702, 8876], escalationRate: 2 },
      { id: "r2", category: "public_funding", lineItem: "State Per-Pupil Funding (6-8)", enabled: true, driverType: "per_student", amounts: [8800, 8976, 9156, 9339, 9525], escalationRate: 2 },
      { id: "r3", category: "public_funding", lineItem: "State Per-Pupil Funding (9-12)", enabled: true, driverType: "per_student", amounts: [9500, 9690, 9884, 10082, 10283], escalationRate: 2 },
      { id: "r4", category: "public_funding", lineItem: "Title I Federal Funding", enabled: true, driverType: "per_student", amounts: [1200, 1200, 1200, 1200, 1200], escalationRate: 0 },
      { id: "r5", category: "philanthropy", lineItem: "Charter Startup Grant (CSPP)", enabled: true, driverType: "annual_fixed", amounts: [250000, 150000, 0, 0, 0], grantStatus: "confirmed", receiptQuarter: 1 },
      { id: "r6", category: "other_revenue", lineItem: "After-School & Summer Programs", enabled: true, driverType: "per_student", amounts: [300, 300, 300, 300, 300], escalationRate: 2 },
    ],
    staffingRows: [
      { id: "s1", roleName: "Executive Director", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 110000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s2", roleName: "Principal", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 90000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s3", roleName: "Dean of Students", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 75000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s4", roleName: "STEM Teachers", functionCategory: "instructional", employmentType: "full_time", fte: 8, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "Ratio-driven 1:18", staffingMode: "ratio", studentRatio: 18, minFte: 8, maxFte: 24 },
      { id: "s5", roleName: "General Teachers", functionCategory: "instructional", employmentType: "full_time", fte: 4, annualizedRate: 48000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "ratio", studentRatio: 25, minFte: 4, maxFte: 12 },
      { id: "s6", roleName: "Special Education Staff", functionCategory: "student_support", employmentType: "full_time", fte: 2, annualizedRate: 52000, benefitsEligible: true, benefitsRate: 22, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s7", roleName: "Office & Finance Staff", functionCategory: "administrative", employmentType: "full_time", fte: 3, annualizedRate: 45000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
      { id: "s8", roleName: "Custodial / Maintenance", functionCategory: "operations", employmentType: "full_time", fte: 2, annualizedRate: 35000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, notes: "", staffingMode: "fixed" },
    ],
    facilities: {
      monthlyRent: 18000, annualRentIncrease: 3, annualUtilities: 48000,
      annualInsurance: 35000, curriculumCostPerStudent: 800,
      techCostPerStudent: 450, annualMarketing: 20000,
      annualSalaryIncrease: 3, generalCostInflation: 3,
    },
    expenseRows: [
      { id: "e1", category: "occupancy_facility", lineItem: "Rent / Lease", enabled: true, driverType: "monthly", amounts: [18000, 18540, 19096, 19669, 20259], escalationRate: 3 },
      { id: "e2", category: "instructional_program", lineItem: "STEM Lab Equipment & Curriculum", enabled: true, driverType: "per_student", amounts: [800, 600, 500, 450, 400], escalationRate: 2 },
      { id: "e3", category: "technology", lineItem: "1:1 Chromebooks + Infrastructure", enabled: true, driverType: "per_student", amounts: [450, 300, 250, 200, 200] },
      { id: "e4", category: "occupancy_facility", lineItem: "Utilities & Building Maintenance", enabled: true, driverType: "annual_fixed", amounts: [48000, 55000, 65000, 75000, 85000] },
      { id: "e5", category: "administrative_general", lineItem: "Insurance (GL, D&O, Workers Comp)", enabled: true, driverType: "annual_fixed", amounts: [35000, 40000, 48000, 55000, 60000] },
      { id: "e6", category: "administrative_general", lineItem: "Legal, Audit & Compliance", enabled: true, driverType: "annual_fixed", amounts: [25000, 28000, 30000, 32000, 35000] },
      { id: "e7", category: "instructional_program", lineItem: "Student Transportation", enabled: true, driverType: "per_student", amounts: [400, 400, 400, 400, 400], escalationRate: 3 },
      { id: "e8", category: "instructional_program", lineItem: "Food Service (subsidized)", enabled: true, driverType: "per_student", amounts: [600, 600, 600, 600, 600], escalationRate: 2 },
      { id: "e9", category: "administrative_general", lineItem: "Marketing & Community Outreach", enabled: true, driverType: "annual_fixed", amounts: [20000, 15000, 12000, 10000, 8000] },
    ],
    capitalAndDebtRows: [
      { id: "cd1", lineItem: "Facility Build-Out (Phase 1)", enabled: true, driverType: "annual_fixed", amounts: [350000, 0, 0, 0, 0], isLoan: false },
      { id: "cd2", lineItem: "Facility Expansion Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 500000, loanRate: 6.5, loanTermYears: 15, purpose: "startup" },
      { id: "cd3", lineItem: "Equipment Financing (STEM lab)", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 75000, loanRate: 5.5, loanTermYears: 5, purpose: "startup" },
    ],
    openingBalances: { cash: 200000, accountsReceivable: 0, fixedAssets: 100000 },
    scenarios: [
      { name: "Conservative (25% fewer students)", enrollmentAdjustment: -25, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: -10, facilityAdjustment: 0 },
      { name: "Base Case", enrollmentAdjustment: 0, tuitionAdjustment: 0, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "State funding cut (-10% per pupil)", enrollmentAdjustment: 0, tuitionAdjustment: -10, expenseAdjustment: 0, staffingAdjustment: 0, facilityAdjustment: 0 },
      { name: "Full capacity ahead of plan", enrollmentAdjustment: 15, tuitionAdjustment: 0, expenseAdjustment: 5, staffingAdjustment: 10, facilityAdjustment: 0 },
    ],
    covenantThresholds: { minDSCR: 1.15, minDaysCashOnHand: 45, minMonthsRunway: 3, minCapacityUtil: 0.7 },
  },
};
