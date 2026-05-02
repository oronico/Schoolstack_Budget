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

// Note: the fixtures below (homeschoolCoopFixture, chestertonAcademyFixture,
// tutoringCenterFixture, learningPodFixture) are *regression goldens* —
// they freeze the current consultant-engine
// output for representative shapes so unintended math drift fails loudly.
// They are deliberately structurally non-trivial but are not calibrated as
// normative operating budgets; both run a higher net margin than a typical
// real-world plan would. If you need plausible-ops fixtures for narrative
// or benchmarking, build a separate set rather than re-tuning these.

/**
 * Homeschool co-op (Arizona, mixed-ESA + tuition + small fundraiser).
 * Realistic 5-yr ramp from a 25-student start to an 80-student steady state
 * (4-day-per-week co-op, K-8). Year 1 is a 10-month partial year. Director
 * + lead teacher + part-time facilitators that scale with enrollment;
 * facility is a leased classroom suite (not church-shared). This is the
 * shape used in the marketing collateral for "Liberty Learning Co-Op".
 */
export const homeschoolCoopFixture: TestModelPayload = {
  schoolProfile: {
    schoolName: "Liberty Learning Co-Op",
    state: "AZ",
    schoolType: "homeschool_coop",
    isPartialFirstYear: true,
    year1OperatingMonths: 10,
    debtIncluded: false,
    maxCapacity: 80,
    fiscalYearStartMonth: 7,
  },
  enrollment: { year1: 25, year2: 45, year3: 60, year4: 72, year5: 80 },
  facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
  revenueRows: [
    { id: "r1", category: "tuition_and_fees", lineItem: "Co-Op Tuition", enabled: true, driverType: "per_student", amounts: [5500, 5665, 5835, 6010, 6190], billingMonths: 10 },
    { id: "r2", category: "tuition_and_fees", lineItem: "Materials Fee", enabled: true, driverType: "per_student", amounts: [250, 250, 250, 250, 250], billingMonths: 12, escalationRate: 0, escalationRateOverridden: true },
    { id: "r3", category: "school_choice", lineItem: "AZ ESA Funds", enabled: true, driverType: "per_student", amounts: [7000, 7210, 7426, 7649, 7878], billingMonths: 12 },
    { id: "r4", category: "philanthropy", lineItem: "Annual Fundraiser", enabled: true, driverType: "annual_fixed", amounts: [5000, 6500, 8000, 9000, 10000] },
    { id: "r5", category: "tuition_offsets", lineItem: "Sibling Discount", enabled: true, driverType: "percent_of_base", amounts: [8, 8, 8, 8, 8], percentBase: "r1" },
  ],
  staffingRows: [
    { id: "s1", roleName: "Director / Lead Educator", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 52000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s2", roleName: "Lead Teacher", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 42000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s3", roleName: "Co-Op Facilitators", functionCategory: "instructional", employmentType: "part_time", fte: 1.5, annualizedRate: 28000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false, staffingMode: "ratio", studentRatio: 18, minFte: 1 },
    { id: "s4", roleName: "Admin Assistant", functionCategory: "administrative", employmentType: "part_time", fte: 0.5, annualizedRate: 30000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
  ],
  expenseRows: [
    { id: "e1", category: "occupancy_facility", lineItem: "Rent", enabled: true, driverType: "monthly", amounts: [2000, 2060, 2122, 2185, 2251], escalationRate: 3 },
    { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "monthly", amounts: [250, 256, 263, 269, 276] },
    { id: "e3", category: "occupancy_facility", lineItem: "Insurance", enabled: true, driverType: "annual_fixed", amounts: [2400, 2460, 2522, 2585, 2650] },
    { id: "e4", category: "instructional_program", lineItem: "Curriculum & Materials", enabled: true, driverType: "per_student", amounts: [400, 412, 424, 437, 450] },
    { id: "e5", category: "technology", lineItem: "Technology", enabled: true, driverType: "per_student", amounts: [225, 232, 239, 246, 253] },
    { id: "e6", category: "administrative_general", lineItem: "Marketing", enabled: true, driverType: "annual_fixed", amounts: [3000, 3075, 3152, 3231, 3312] },
    { id: "e7", category: "administrative_general", lineItem: "Compliance & Bookkeeping", enabled: true, driverType: "annual_fixed", amounts: [4500, 4613, 4728, 4846, 4967] },
  ],
  capitalAndDebtRows: [],
  openingBalances: { cash: 18000, accountsReceivable: 0, fixedAssets: 4000, otherAssets: 0, accountsPayable: 0, currentDebtPortion: 0, longTermDebt: 0 },
};

/**
 * Chesterton Academy classical-Catholic high school startup.
 * Anchored on the canonical CSN template defaults (`buildDefaultChestertonData`):
 * starting tuition $8500 with 4% annual escalation, financial aid 10%,
 * starting teacher salary $44k, $600 book/supply fee. 5-yr enrollment is the
 * standard CSN phased rollout (freshman class fills first, then sophomore,
 * etc.) scaled to a ~120-student steady state by Y5 — a representative size
 * for an established Chesterton academy in a mid-size diocese. Includes the
 * gift-chart-driven philanthropy tail (TFG ~ $387k Y1, tapering as tuition
 * carries more of the budget).
 */
export const chestertonAcademyFixture: TestModelPayload = {
  schoolProfile: {
    schoolName: "St. Augustine Chesterton Academy",
    state: "MN",
    schoolType: "chesterton_academy",
    isPartialFirstYear: false,
    year1OperatingMonths: 12,
    debtIncluded: false,
    maxCapacity: 150,
    fiscalYearStartMonth: 7,
  },
  enrollment: { year1: 20, year2: 40, year3: 65, year4: 95, year5: 120 },
  facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
  revenueRows: [
    { id: "r1", category: "tuition_and_fees", lineItem: "Tuition", enabled: true, driverType: "per_student", amounts: [8500, 8840, 9194, 9561, 9944], billingMonths: 10 },
    { id: "r2", category: "tuition_and_fees", lineItem: "Book / Supply Fee", enabled: true, driverType: "per_student", amounts: [600, 600, 600, 600, 600], billingMonths: 12, escalationRate: 0, escalationRateOverridden: true },
    { id: "r3", category: "tuition_offsets", lineItem: "Financial Aid (10%)", enabled: true, driverType: "percent_of_base", amounts: [10, 10, 10, 10, 10], percentBase: "r1" },
    { id: "r4", category: "philanthropy", lineItem: "Major Gifts ($25k+)", enabled: true, driverType: "annual_fixed", amounts: [100000, 90000, 75000, 60000, 50000] },
    { id: "r5", category: "philanthropy", lineItem: "Mid-Major Gifts ($5k-$25k)", enabled: true, driverType: "annual_fixed", amounts: [132500, 120000, 100000, 85000, 75000] },
    { id: "r6", category: "philanthropy", lineItem: "Annual Fund ($500-$5k)", enabled: true, driverType: "annual_fixed", amounts: [91250, 95000, 100000, 105000, 110000] },
    { id: "r7", category: "philanthropy", lineItem: "Grassroots & Events", enabled: true, driverType: "annual_fixed", amounts: [63125, 65000, 70000, 75000, 80000] },
  ],
  staffingRows: [
    { id: "s1", roleName: "Headmaster", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 75000, benefitsEligible: true, benefitsRate: 20, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s2", roleName: "Faculty (Classical Curriculum)", functionCategory: "instructional", employmentType: "full_time", fte: 2, annualizedRate: 44000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 7.65, payrollLike: false, staffingMode: "ratio", studentRatio: 14, minFte: 2 },
    { id: "s3", roleName: "Adjunct Instructors", functionCategory: "instructional", employmentType: "part_time", fte: 1, annualizedRate: 22000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s4", roleName: "Office Manager", functionCategory: "administrative", employmentType: "part_time", fte: 0.5, annualizedRate: 38000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s5", roleName: "Development Director", functionCategory: "administrative", employmentType: "part_time", fte: 0.5, annualizedRate: 50000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
  ],
  expenseRows: [
    { id: "e1", category: "occupancy_facility", lineItem: "Building Lease (Parish-shared)", enabled: true, driverType: "monthly", amounts: [4500, 4635, 4774, 4917, 5065], escalationRate: 3 },
    { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "monthly", amounts: [800, 824, 849, 874, 900] },
    { id: "e3", category: "occupancy_facility", lineItem: "Insurance", enabled: true, driverType: "annual_fixed", amounts: [6000, 6180, 6365, 6556, 6753] },
    { id: "e4", category: "instructional_program", lineItem: "Curriculum (Great Books)", enabled: true, driverType: "per_student", amounts: [450, 464, 478, 492, 507] },
    { id: "e5", category: "technology", lineItem: "Technology", enabled: true, driverType: "per_student", amounts: [200, 206, 212, 218, 225] },
    { id: "e6", category: "administrative_general", lineItem: "Marketing & Recruiting", enabled: true, driverType: "annual_fixed", amounts: [12000, 12360, 12731, 13113, 13506] },
    { id: "e7", category: "administrative_general", lineItem: "Professional Development", enabled: true, driverType: "per_fte", amounts: [1200, 1200, 1200, 1200, 1200] },
    { id: "e8", category: "administrative_general", lineItem: "Accreditation & Compliance", enabled: true, driverType: "annual_fixed", amounts: [5000, 5125, 5253, 5384, 5519] },
    { id: "e9", category: "administrative_general", lineItem: "CSN Network Dues", enabled: true, driverType: "annual_fixed", amounts: [7500, 7500, 7500, 7500, 7500], escalationRate: 0, escalationRateOverridden: true },
  ],
  capitalAndDebtRows: [
    { id: "cd1", lineItem: "Classroom Furniture & Equipment", enabled: true, driverType: "annual_fixed", amounts: [15000, 8000, 8000, 6000, 6000], isLoan: false },
  ],
  openingBalances: { cash: 50000, accountsReceivable: 0, fixedAssets: 15000, otherAssets: 0, accountsPayable: 0, currentDebtPortion: 0, longTermDebt: 0 },
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

/**
 * Task #454 — Tutoring center (Arizona, fee-per-session storefront with a
 * small ESA mix). 20 → 60 students over 5 years. Year 1 is a 10-month
 * partial year. The shape is deliberately *not* a microschool-with-fewer-
 * students: revenue is dominated by an annual tuition fee that proxies a
 * weekly-session subscription (~$3,500 = ~150 sessions @ $23/session),
 * staffing leans on a director + lead tutor + ratio-staffed contract
 * tutors (1:10, min 2 / max 6 — matches the tutoring_center staffing
 * benchmark of "1 director + 2–6 contract tutors for 20–60 students"),
 * and the facility is a small storefront. Used as a
 * regression golden alongside `homeschoolCoopFixture` and
 * `chestertonAcademyFixture` — see the comment block above for the
 * "regression-only, not normative budget" caveat.
 */
export const tutoringCenterFixture: TestModelPayload = {
  schoolProfile: {
    schoolName: "Saguaro Tutoring Center",
    state: "AZ",
    schoolType: "tutoring_center",
    isPartialFirstYear: true,
    year1OperatingMonths: 10,
    debtIncluded: false,
    maxCapacity: 60,
    fiscalYearStartMonth: 7,
  },
  enrollment: { year1: 20, year2: 35, year3: 45, year4: 55, year5: 60 },
  facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
  revenueRows: [
    { id: "r1", category: "tuition_and_fees", lineItem: "Annual Tutoring Fee", enabled: true, driverType: "per_student", amounts: [3500, 3605, 3713, 3825, 3939], billingMonths: 10 },
    { id: "r2", category: "tuition_and_fees", lineItem: "Materials & Assessment Fee", enabled: true, driverType: "per_student", amounts: [200, 200, 200, 200, 200], billingMonths: 12, escalationRate: 0, escalationRateOverridden: true },
    { id: "r3", category: "school_choice", lineItem: "AZ ESA Funds (partial mix)", enabled: true, driverType: "per_student", amounts: [2500, 2575, 2652, 2732, 2814], billingMonths: 12 },
    { id: "r4", category: "philanthropy", lineItem: "Community Sponsorships", enabled: true, driverType: "annual_fixed", amounts: [3000, 4000, 5000, 6000, 7000] },
  ],
  staffingRows: [
    { id: "s1", roleName: "Center Director", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 58000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s2", roleName: "Lead Tutor", functionCategory: "instructional", employmentType: "full_time", fte: 1, annualizedRate: 42000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s3", roleName: "Contract Tutors", functionCategory: "instructional", employmentType: "contract", fte: 2, annualizedRate: 30000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 0, payrollLike: false, staffingMode: "ratio", studentRatio: 10, minFte: 2, maxFte: 6 },
    { id: "s4", roleName: "Front Desk / Scheduler", functionCategory: "administrative", employmentType: "part_time", fte: 0.5, annualizedRate: 28000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
  ],
  expenseRows: [
    { id: "e1", category: "occupancy_facility", lineItem: "Storefront Lease", enabled: true, driverType: "monthly", amounts: [2200, 2266, 2334, 2404, 2476], escalationRate: 3 },
    { id: "e2", category: "occupancy_facility", lineItem: "Utilities", enabled: true, driverType: "monthly", amounts: [220, 226, 232, 238, 245] },
    { id: "e3", category: "occupancy_facility", lineItem: "Insurance", enabled: true, driverType: "annual_fixed", amounts: [1800, 1845, 1891, 1938, 1987] },
    { id: "e4", category: "instructional_program", lineItem: "Curriculum & Assessments", enabled: true, driverType: "per_student", amounts: [180, 185, 190, 196, 202] },
    { id: "e5", category: "technology", lineItem: "Scheduling & Tutoring Software", enabled: true, driverType: "per_student", amounts: [120, 124, 128, 132, 136] },
    { id: "e6", category: "administrative_general", lineItem: "Marketing & Local Ads", enabled: true, driverType: "annual_fixed", amounts: [6000, 6150, 6304, 6461, 6623] },
    { id: "e7", category: "administrative_general", lineItem: "Bookkeeping & Compliance", enabled: true, driverType: "annual_fixed", amounts: [3600, 3690, 3782, 3877, 3974] },
  ],
  capitalAndDebtRows: [],
  openingBalances: { cash: 12000, accountsReceivable: 0, fixedAssets: 3000, otherAssets: 0, accountsPayable: 0, currentDebtPortion: 0, longTermDebt: 0 },
};

/**
 * Task #454 — Learning pod (Arizona, ESA-eligible premium small cohort).
 * 8 → 15 students over 5 years (capacity-capped by design — the pod model
 * trades scale for personalization). Year 1 is a 10-month partial year.
 * Revenue is dominated by per-student tuition (~$10k) plus AZ ESA. Staff
 * is a single full-time facilitator + part-time enrichment specialist;
 * facility is a low-cost shared / micro-leased space. Regression golden
 * — see header comment above.
 */
export const learningPodFixture: TestModelPayload = {
  schoolProfile: {
    schoolName: "Sonoran Learning Pod",
    state: "AZ",
    schoolType: "learning_pod",
    isPartialFirstYear: true,
    year1OperatingMonths: 10,
    debtIncluded: false,
    maxCapacity: 15,
    fiscalYearStartMonth: 7,
  },
  enrollment: { year1: 8, year2: 10, year3: 12, year4: 14, year5: 15 },
  facilities: { annualSalaryIncrease: 3, generalCostInflation: 2.5 },
  revenueRows: [
    { id: "r1", category: "tuition_and_fees", lineItem: "Pod Tuition", enabled: true, driverType: "per_student", amounts: [10000, 10300, 10609, 10927, 11255], billingMonths: 10 },
    { id: "r2", category: "tuition_and_fees", lineItem: "Enrichment Fee", enabled: true, driverType: "per_student", amounts: [400, 400, 400, 400, 400], billingMonths: 12, escalationRate: 0, escalationRateOverridden: true },
    { id: "r3", category: "school_choice", lineItem: "AZ ESA Funds", enabled: true, driverType: "per_student", amounts: [7000, 7210, 7426, 7649, 7878], billingMonths: 12 },
    { id: "r4", category: "philanthropy", lineItem: "Family Fundraising", enabled: true, driverType: "annual_fixed", amounts: [2000, 2500, 3000, 3500, 4000] },
    { id: "r5", category: "tuition_offsets", lineItem: "Sibling Discount", enabled: true, driverType: "percent_of_base", amounts: [10, 10, 10, 10, 10], percentBase: "r1" },
  ],
  staffingRows: [
    { id: "s1", roleName: "Lead Facilitator", functionCategory: "school_leadership", employmentType: "full_time", fte: 1, annualizedRate: 50000, benefitsEligible: true, benefitsRate: 18, payrollTaxRate: 7.65, payrollLike: false },
    { id: "s2", roleName: "Enrichment Specialist", functionCategory: "instructional", employmentType: "part_time", fte: 0.4, annualizedRate: 35000, benefitsEligible: false, benefitsRate: 0, payrollTaxRate: 7.65, payrollLike: false },
  ],
  expenseRows: [
    { id: "e1", category: "occupancy_facility", lineItem: "Shared Space Rent", enabled: true, driverType: "monthly", amounts: [1200, 1236, 1273, 1311, 1351], escalationRate: 3 },
    { id: "e2", category: "occupancy_facility", lineItem: "Utilities & Internet", enabled: true, driverType: "monthly", amounts: [180, 185, 190, 196, 202] },
    { id: "e3", category: "occupancy_facility", lineItem: "Insurance", enabled: true, driverType: "annual_fixed", amounts: [1500, 1538, 1576, 1615, 1656] },
    { id: "e4", category: "instructional_program", lineItem: "Curriculum & Materials", enabled: true, driverType: "per_student", amounts: [600, 618, 637, 656, 675] },
    { id: "e5", category: "technology", lineItem: "Devices & Software", enabled: true, driverType: "per_student", amounts: [350, 361, 372, 383, 394] },
    { id: "e6", category: "administrative_general", lineItem: "Marketing", enabled: true, driverType: "annual_fixed", amounts: [1500, 1545, 1591, 1639, 1688] },
    { id: "e7", category: "administrative_general", lineItem: "Bookkeeping & Compliance", enabled: true, driverType: "annual_fixed", amounts: [2400, 2460, 2522, 2585, 2650] },
  ],
  capitalAndDebtRows: [],
  openingBalances: { cash: 8000, accountsReceivable: 0, fixedAssets: 1500, otherAssets: 0, accountsPayable: 0, currentDebtPortion: 0, longTermDebt: 0 },
};
