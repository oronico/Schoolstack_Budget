export interface TestRevenueRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  billingMonths?: number;
  escalationRate?: number;
  escalationRateOverridden?: boolean;
  percentBase?: string;
  collectionMethod?: string;
  collectionRate?: number;
  disbursementType?: string;
  reimbursementLagMonths?: number;
  grantStatus?: string;
  paymentFrequency?: string;
}

export interface TestStaffingRow {
  id: string;
  roleName: string;
  functionCategory: string;
  employmentType: string;
  fte: number;
  annualizedRate: number;
  benefitsEligible: boolean;
  benefitsRate: number;
  payrollTaxRate: number;
  payrollLike: boolean;
  notes?: string;
  staffingMode?: string;
  studentRatio?: number;
  minFte?: number;
  maxFte?: number;
  startYear?: number;
  endYear?: number;
}

export interface TestExpenseRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  escalationRate?: number;
  escalationRateOverridden?: boolean;
}

export interface TestCapDebtRow {
  id: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  isLoan: boolean;
  loanPrincipal?: number;
  loanRate?: number;
  loanTermYears?: number;
  purpose?: string;
}

export interface TestEnrollment {
  year1: number;
  year2: number;
  year3: number;
  year4: number;
  year5: number;
  retentionRate?: number;
}

export interface TestSchoolProfile {
  schoolName: string;
  state: string;
  schoolType: string;
  isPartialFirstYear: boolean;
  year1OperatingMonths: number;
  debtIncluded: boolean;
  maxCapacity: number;
  fiscalYearStartMonth?: number;
  [key: string]: unknown;
}

export interface TestFacilities {
  annualSalaryIncrease: number;
  generalCostInflation: number;
  [key: string]: unknown;
}

export interface TestOpeningBalances {
  cash: number;
  accountsReceivable?: number;
  fixedAssets?: number;
  otherAssets?: number;
  accountsPayable?: number;
  currentDebtPortion?: number;
  longTermDebt?: number;
}

export interface TestModelPayload {
  schoolProfile: TestSchoolProfile;
  enrollment: TestEnrollment;
  facilities: TestFacilities;
  revenueRows: TestRevenueRow[];
  staffingRows: TestStaffingRow[];
  expenseRows: TestExpenseRow[];
  capitalAndDebtRows: TestCapDebtRow[];
  openingBalances: TestOpeningBalances;
  tuitionTiers?: Array<{ id: string; name: string; discountPercent: number; studentCounts: number[] }>;
  tuitionEscalation?: { rate: number };
  [key: string]: unknown;
}

export const microschoolFixture: TestModelPayload = {
  schoolProfile: {
    schoolName: "Bright Horizons Microschool",
    state: "AZ",
    schoolType: "microschool",
    isPartialFirstYear: true,
    year1OperatingMonths: 10,
    debtIncluded: false,
    maxCapacity: 25,
    fiscalYearStartMonth: 7,
  },
  enrollment: { year1: 12, year2: 18, year3: 22, year4: 25, year5: 25 },
  facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
  revenueRows: [
    { id: "r1", category: "tuition_and_fees", lineItem: "Tuition", enabled: true, driverType: "per_student", amounts: [12000, 12360, 12731, 13113, 13506], billingMonths: 10 },
    { id: "r2", category: "tuition_and_fees", lineItem: "Registration Fee", enabled: true, driverType: "per_student", amounts: [250, 250, 250, 250, 250], billingMonths: 12 },
    { id: "r3", category: "school_choice", lineItem: "AZ ESA Funds", enabled: true, driverType: "per_student", amounts: [7000, 7210, 7426, 7649, 7878], billingMonths: 12 },
    { id: "r4", category: "philanthropy", lineItem: "Annual Fundraising", enabled: true, driverType: "annual_fixed", amounts: [5000, 6000, 7000, 8000, 9000] },
    { id: "r5", category: "tuition_offsets", lineItem: "Scholarship Discount", enabled: true, driverType: "percent_of_base", amounts: [10, 10, 10, 10, 10], percentBase: "r1" },
  ],
  staffingRows: [
    { id: "s1", roleName: "Founder / Head of School", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s2", roleName: "Lead Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 45000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s3", roleName: "Teaching Assistant", functionCategory: "instructional", employmentType: "part_time", fte: 0.5, annualizedRate: 28000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
  ],
  expenseRows: [
    { id: "e1", category: "occupancy_facility", lineItem: "Rent", enabled: true, driverType: "monthly", amounts: [2500, 2575, 2652, 2732, 2814], escalationRate: 3 },
    { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "monthly", amounts: [300, 308, 316, 324, 332] },
    { id: "e3", category: "occupancy_facility", lineItem: "Insurance", enabled: true, driverType: "annual_fixed", amounts: [2400, 2460, 2522, 2585, 2650] },
    { id: "e4", category: "instructional_program", lineItem: "Curriculum & Materials", enabled: true, driverType: "per_student", amounts: [500, 515, 530, 546, 562] },
    { id: "e5", category: "technology", lineItem: "Technology", enabled: true, driverType: "per_student", amounts: [300, 309, 318, 328, 338] },
    { id: "e6", category: "administrative_general", lineItem: "Marketing", enabled: true, driverType: "annual_fixed", amounts: [3000, 3075, 3152, 3231, 3312] },
  ],
  capitalAndDebtRows: [
    { id: "cd1", lineItem: "Equipment Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 30000, loanRate: 6, loanTermYears: 5, purpose: "startup" },
  ],
  openingBalances: { cash: 15000, accountsReceivable: 0, fixedAssets: 5000, otherAssets: 0, accountsPayable: 0, currentDebtPortion: 0, longTermDebt: 0 },
};

export const privateSchoolFixture: TestModelPayload = {
  schoolProfile: {
    schoolName: "Heritage Academy",
    state: "FL",
    schoolType: "private_school",
    isPartialFirstYear: false,
    year1OperatingMonths: 12,
    debtIncluded: true,
    maxCapacity: 200,
    fiscalYearStartMonth: 7,
  },
  enrollment: { year1: 100, year2: 130, year3: 160, year4: 185, year5: 200 },
  facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
  revenueRows: [
    { id: "r1", category: "tuition_and_fees", lineItem: "Tuition", enabled: true, driverType: "per_student", amounts: [10500, 10815, 11140, 11474, 11818], billingMonths: 10 },
    { id: "r2", category: "tuition_and_fees", lineItem: "Registration Fee", enabled: true, driverType: "per_student", amounts: [350, 350, 350, 350, 350], billingMonths: 12 },
    { id: "r3", category: "tuition_offsets", lineItem: "Scholarship Discount", enabled: true, driverType: "per_student", amounts: [-1050, -1082, -1114, -1147, -1182] },
    { id: "r4", category: "school_choice", lineItem: "FL FTC Scholarship", enabled: true, driverType: "per_student", amounts: [8700, 8961, 9230, 9507, 9792], billingMonths: 12 },
    { id: "r5", category: "philanthropy", lineItem: "Foundation Grant", enabled: true, driverType: "annual_fixed", amounts: [50000, 40000, 30000, 20000, 10000] },
    { id: "r6", category: "philanthropy", lineItem: "Annual Fund", enabled: true, driverType: "annual_fixed", amounts: [25000, 30000, 35000, 40000, 45000] },
    { id: "r7", category: "other_revenue", lineItem: "After-School Programs", enabled: true, driverType: "per_student", amounts: [500, 515, 530, 546, 562] },
  ],
  staffingRows: [
    { id: "s1", roleName: "Head of School", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 95000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s2", roleName: "Assistant Principal", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 75000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s3", roleName: "Teachers", functionCategory: "instructional", employmentType: "full_time", fte: 6, annualizedRate: 48000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s4", roleName: "Paraprofessionals", functionCategory: "instructional", employmentType: "full_time", fte: 3, annualizedRate: 32000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s5", roleName: "Office Manager", functionCategory: "administrative", employmentType: "full_time", fte: 1, annualizedRate: 42000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s6", roleName: "School Counselor", functionCategory: "student_support", employmentType: "full_time", fte: 1, annualizedRate: 52000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false },
  ],
  expenseRows: [
    { id: "e1", category: "occupancy_facility", lineItem: "Rent", enabled: true, driverType: "monthly", amounts: [8500, 8755, 9018, 9289, 9567], escalationRate: 3 },
    { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "monthly", amounts: [1200, 1236, 1273, 1311, 1350] },
    { id: "e3", category: "occupancy_facility", lineItem: "Insurance", enabled: true, driverType: "annual_fixed", amounts: [12000, 12360, 12731, 13113, 13506] },
    { id: "e4", category: "occupancy_facility", lineItem: "Maintenance", enabled: true, driverType: "annual_fixed", amounts: [8000, 8240, 8487, 8742, 9004] },
    { id: "e5", category: "instructional_program", lineItem: "Curriculum", enabled: true, driverType: "per_student", amounts: [600, 618, 637, 656, 675] },
    { id: "e6", category: "technology", lineItem: "Technology", enabled: true, driverType: "per_student", amounts: [400, 412, 424, 437, 450] },
    { id: "e7", category: "administrative_general", lineItem: "Marketing", enabled: true, driverType: "annual_fixed", amounts: [15000, 15450, 15914, 16391, 16883] },
    { id: "e8", category: "administrative_general", lineItem: "Professional Development", enabled: true, driverType: "per_fte", amounts: [1500, 1500, 1500, 1500, 1500] },
    { id: "e9", category: "administrative_general", lineItem: "Accounting & Legal", enabled: true, driverType: "annual_fixed", amounts: [12000, 12360, 12731, 13113, 13506] },
  ],
  capitalAndDebtRows: [
    { id: "cd1", lineItem: "Facility Buildout Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 250000, loanRate: 6.5, loanTermYears: 10 },
    { id: "cd2", lineItem: "Furniture & Equipment", enabled: true, driverType: "annual_fixed", amounts: [25000, 10000, 10000, 5000, 5000], isLoan: false },
  ],
  openingBalances: { cash: 75000, accountsReceivable: 12000, fixedAssets: 180000, otherAssets: 5000, accountsPayable: 8000, currentDebtPortion: 20000, longTermDebt: 200000 },
};

export const charterFixture: TestModelPayload = {
  schoolProfile: {
    schoolName: "Civic Scholars Charter",
    state: "OH",
    schoolType: "charter_school",
    isPartialFirstYear: true,
    year1OperatingMonths: 10,
    debtIncluded: true,
    maxCapacity: 400,
    fiscalYearStartMonth: 7,
  },
  enrollment: { year1: 120, year2: 200, year3: 300, year4: 375, year5: 400 },
  facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
  revenueRows: [
    { id: "r1", category: "public_funding", lineItem: "State Per-Pupil Funding", enabled: true, driverType: "per_student", amounts: [9500, 9690, 9884, 10081, 10283], billingMonths: 12 },
    { id: "r2", category: "public_funding", lineItem: "Federal Title I", enabled: true, driverType: "per_student", amounts: [800, 816, 832, 849, 866], billingMonths: 12 },
    { id: "r3", category: "public_funding", lineItem: "Special Education Funding", enabled: true, driverType: "per_student", amounts: [1200, 1224, 1248, 1273, 1299], billingMonths: 12 },
    { id: "r4", category: "philanthropy", lineItem: "CSP Startup Grant", enabled: true, driverType: "annual_fixed", amounts: [100000, 75000, 50000, 0, 0] },
    { id: "r5", category: "philanthropy", lineItem: "Annual Fundraising", enabled: true, driverType: "annual_fixed", amounts: [30000, 40000, 50000, 60000, 70000] },
    { id: "r6", category: "other_revenue", lineItem: "Food Service Revenue", enabled: true, driverType: "per_student", amounts: [300, 309, 318, 328, 338] },
  ],
  staffingRows: [
    { id: "s1", roleName: "Executive Director", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 110000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s2", roleName: "Principal", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 90000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s3", roleName: "Dean of Students", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 72000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s4", roleName: "Core Teachers", functionCategory: "instructional", employmentType: "full_time", fte: 6, annualizedRate: 52000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false, staffingMode: "ratio", studentRatio: 22, minFte: 4 },
    { id: "s5", roleName: "Special Education Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s6", roleName: "Instructional Aides", functionCategory: "instructional", employmentType: "full_time", fte: 3, annualizedRate: 30000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s7", roleName: "Operations Manager", functionCategory: "operations", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s8", roleName: "Office Staff", functionCategory: "administrative", employmentType: "full_time", fte: 2, annualizedRate: 38000, benefitsEligible: true, benefitsRate: 25, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s9", roleName: "School Counselor", functionCategory: "student_support", employmentType: "full_time", fte: 1, annualizedRate: 55000, benefitsEligible: true, benefitsRate: 28, payrollTaxRate: 7.65, payrollLike: false },
  ],
  expenseRows: [
    { id: "e1", category: "occupancy_facility", lineItem: "Facility Lease", enabled: true, driverType: "monthly", amounts: [18000, 18540, 19096, 19669, 20259], escalationRate: 3 },
    { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "monthly", amounts: [2500, 2575, 2652, 2732, 2814] },
    { id: "e3", category: "occupancy_facility", lineItem: "Insurance", enabled: true, driverType: "annual_fixed", amounts: [18000, 18540, 19096, 19669, 20259] },
    { id: "e4", category: "occupancy_facility", lineItem: "Janitorial", enabled: true, driverType: "monthly", amounts: [1500, 1545, 1591, 1639, 1688] },
    { id: "e5", category: "instructional_program", lineItem: "Curriculum & Textbooks", enabled: true, driverType: "per_student", amounts: [700, 721, 743, 765, 788] },
    { id: "e6", category: "technology", lineItem: "Technology & Devices", enabled: true, driverType: "per_student", amounts: [500, 515, 530, 546, 562] },
    { id: "e7", category: "administrative_general", lineItem: "Marketing & Recruitment", enabled: true, driverType: "annual_fixed", amounts: [25000, 25750, 26523, 27318, 28138] },
    { id: "e8", category: "administrative_general", lineItem: "Professional Development", enabled: true, driverType: "annual_fixed", amounts: [15000, 15450, 15914, 16391, 16883] },
    { id: "e9", category: "administrative_general", lineItem: "Legal & Compliance", enabled: true, driverType: "annual_fixed", amounts: [20000, 20600, 21218, 21855, 22510] },
    { id: "e10", category: "administrative_general", lineItem: "Food Service", enabled: true, driverType: "per_student", amounts: [800, 824, 849, 874, 900] },
    { id: "e11", category: "administrative_general", lineItem: "Transportation", enabled: true, driverType: "per_student", amounts: [600, 618, 637, 656, 675] },
  ],
  capitalAndDebtRows: [
    { id: "cd1", lineItem: "Facility Improvement Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 500000, loanRate: 5.75, loanTermYears: 15 },
    { id: "cd2", lineItem: "FF&E Purchase", enabled: true, driverType: "annual_fixed", amounts: [75000, 25000, 30000, 15000, 10000], isLoan: false },
    { id: "cd3", lineItem: "Technology Infrastructure", enabled: true, driverType: "annual_fixed", amounts: [40000, 15000, 10000, 10000, 10000], isLoan: false },
  ],
  openingBalances: { cash: 50000, accountsReceivable: 0, fixedAssets: 0, otherAssets: 0, accountsPayable: 0, currentDebtPortion: 0, longTermDebt: 0 },
};

/**
 * Synthetic fixture that exercises every supported driver type at least once,
 * so that the cross-engine parity suite catches drift in any driver — not just
 * the handful exercised by the per-school fixtures above. New driver types
 * added to the FE engine must be wired through here too.
 *
 * Drivers covered:
 *   Revenue:  per_student, monthly, annual_fixed, percent_of_base
 *   Expense:  per_student, monthly, annual_fixed, per_fte,
 *             percent_of_revenue, per_new_student, per_returning_student
 *   CapDebt:  PMT loan, monthly (non-loan), per_student (non-loan),
 *             annual_fixed (non-loan)
 */
export const driverCoverageFixture: TestModelPayload = {
  schoolProfile: {
    schoolName: "Driver Coverage Test School",
    state: "CA",
    schoolType: "private_school",
    isPartialFirstYear: false,
    year1OperatingMonths: 12,
    debtIncluded: true,
    maxCapacity: 30,
    fiscalYearStartMonth: 7,
  },
  enrollment: { year1: 10, year2: 15, year3: 20, year4: 25, year5: 25, retentionRate: 80 },
  facilities: { annualSalaryIncrease: 0, generalCostInflation: 0 },
  revenueRows: [
    { id: "r1", category: "tuition_and_fees", lineItem: "Tuition", enabled: true, driverType: "per_student", amounts: [8000, 8000, 8000, 8000, 8000] },
    { id: "r2", category: "tuition_and_fees", lineItem: "Monthly Add-On Fee", enabled: true, driverType: "monthly", amounts: [50, 50, 50, 50, 50] },
    { id: "r3", category: "philanthropy", lineItem: "Annual Grant", enabled: true, driverType: "annual_fixed", amounts: [12000, 12000, 12000, 12000, 12000] },
    { id: "r4", category: "tuition_offsets", lineItem: "Scholarship Discount", enabled: true, driverType: "percent_of_base", amounts: [5, 5, 5, 5, 5], percentBase: "r1" },
  ],
  staffingRows: [
    { id: "s1", roleName: "Lead Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 50000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s2", roleName: "Assistant", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 30000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
  ],
  expenseRows: [
    { id: "e1", category: "occupancy_facility", lineItem: "Rent (monthly)", enabled: true, driverType: "monthly", amounts: [1500, 1500, 1500, 1500, 1500] },
    { id: "e2", category: "instructional_program", lineItem: "Curriculum (per student)", enabled: true, driverType: "per_student", amounts: [200, 200, 200, 200, 200] },
    { id: "e3", category: "administrative_general", lineItem: "Marketing (annual fixed)", enabled: true, driverType: "annual_fixed", amounts: [3000, 3000, 3000, 3000, 3000] },
    { id: "e4", category: "administrative_general", lineItem: "Prof Dev (per FTE)", enabled: true, driverType: "per_fte", amounts: [500, 500, 500, 500, 500] },
    { id: "e5", category: "administrative_general", lineItem: "Mgmt Fee (% of revenue)", enabled: true, driverType: "percent_of_revenue", amounts: [3, 3, 3, 3, 3] },
    { id: "e6", category: "administrative_general", lineItem: "Onboarding (per new student)", enabled: true, driverType: "per_new_student", amounts: [150, 150, 150, 150, 150] },
    { id: "e7", category: "administrative_general", lineItem: "Retention Bonus (per returning student)", enabled: true, driverType: "per_returning_student", amounts: [50, 50, 50, 50, 50] },
  ],
  capitalAndDebtRows: [
    { id: "cd1", lineItem: "Equipment Loan", enabled: true, driverType: "annual_fixed", amounts: [0, 0, 0, 0, 0], isLoan: true, loanPrincipal: 25000, loanRate: 6, loanTermYears: 5 },
    { id: "cd2", lineItem: "Equipment Lease (monthly)", enabled: true, driverType: "monthly", amounts: [200, 200, 200, 200, 200], isLoan: false },
    { id: "cd3", lineItem: "Tech Refresh (per student)", enabled: true, driverType: "per_student", amounts: [100, 100, 100, 100, 100], isLoan: false },
    { id: "cd4", lineItem: "FF&E (annual fixed)", enabled: true, driverType: "annual_fixed", amounts: [4000, 2000, 2000, 2000, 2000], isLoan: false },
  ],
  openingBalances: { cash: 50000, accountsReceivable: 0, fixedAssets: 0, otherAssets: 0, accountsPayable: 0, currentDebtPortion: 0, longTermDebt: 0 },
};
