import { computeAnnualDebt, YEAR_COUNT } from "@workspace/finance";

export type BuiltInExpenseCategory =
  | "personnel"
  | "instructional_program"
  | "technology"
  | "occupancy_facility"
  | "administrative_general"
  | "capital_financing";

export type ExpenseCategory = BuiltInExpenseCategory | (string & {});

export type ExpenseDriverType = "annual_fixed" | "monthly" | "per_student" | "per_new_student" | "per_returning_student" | "percent_of_revenue";

export type SchoolStage = "new_school" | "operating_school";
export type FundingProfile = "tuition_based" | "charter_public_funded" | "hybrid_mixed";

export interface EscalationRule {
  rate: number;
  label: string;
  type: "inflation" | "rent" | "flat";
}

export interface EscalationRates {
  generalCostInflation: number;
  annualRentIncrease: number;
}

const RENT_CANONICAL_KEYS = ["Rent / Lease"];

export function getEscalationRule(
  row: { driverType: ExpenseDriverType; canonicalKey?: string; category?: string },
  rates: EscalationRates,
): EscalationRule {
  if (row.canonicalKey && RENT_CANONICAL_KEYS.includes(row.canonicalKey)) {
    return { rate: rates.annualRentIncrease, label: "per lease terms", type: "rent" };
  }

  switch (row.driverType) {
    case "per_student":
    case "per_new_student":
    case "per_returning_student":
      return { rate: 0, label: "scales with enrollment", type: "flat" };
    case "percent_of_revenue":
      return { rate: 0, label: "scales with revenue", type: "flat" };
    case "monthly":
    case "annual_fixed":
      return {
        rate: rates.generalCostInflation,
        label: rates.generalCostInflation > 0 ? `${rates.generalCostInflation}% inflation` : "no inflation",
        type: "inflation",
      };
    default:
      return { rate: 0, label: "flat", type: "flat" };
  }
}

export function computeEscalatedAmounts(
  y1Amount: number,
  yearCount: number,
  rate: number,
  preserveDecimals = false,
): number[] {
  const amounts = [y1Amount];
  for (let i = 1; i < yearCount; i++) {
    const val = y1Amount * Math.pow(1 + rate / 100, i);
    amounts.push(preserveDecimals ? parseFloat(val.toFixed(2)) : Math.round(val));
  }
  return amounts;
}

export interface ExpenseRowData {
  id: string;
  category: ExpenseCategory;
  lineItem: string;
  canonicalKey?: string;
  enabled: boolean;
  driverType: ExpenseDriverType;
  amounts: number[];
  note?: string;
  accountCode?: string;
}

export interface CapitalDebtRowData {
  id: string;
  lineItem: string;
  enabled: boolean;
  driverType: ExpenseDriverType;
  amounts: number[];
  note?: string;
  isLoan?: boolean;
  loanPrincipal?: number;
  loanRate?: number;
  loanTermYears?: number;
  accountCode?: string;
}

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  personnel: "People",
  instructional_program: "Program",
  technology: "Technology",
  occupancy_facility: "Facility",
  administrative_general: "Admin & Operations",
  capital_financing: "Capital & Debt",
};

export const BUILT_IN_CATEGORIES: BuiltInExpenseCategory[] = [
  "personnel",
  "instructional_program",
  "technology",
  "occupancy_facility",
  "administrative_general",
  "capital_financing",
];

export function isCustomCategory(cat: string): boolean {
  return !BUILT_IN_CATEGORIES.includes(cat as BuiltInExpenseCategory);
}

let customCategoryCounter = 0;
export function generateCustomCategoryKey(): string {
  customCategoryCounter++;
  return `custom_${Date.now()}_${customCategoryCounter}`;
}

export const EXPENSE_CATEGORY_ORDER: ExpenseCategory[] = [
  "personnel",
  "instructional_program",
  "technology",
  "occupancy_facility",
  "administrative_general",
  "capital_financing",
];

export const OPERATING_CATEGORIES: ExpenseCategory[] = [
  "instructional_program",
  "technology",
  "occupancy_facility",
  "administrative_general",
];

export const DRIVER_TYPE_LABELS: Record<ExpenseDriverType, string> = {
  annual_fixed: "Annual Fixed",
  monthly: "Monthly",
  per_student: "Per Student",
  per_new_student: "Per New Student",
  per_returning_student: "Per Returning Student",
  percent_of_revenue: "% of Revenue",
};

interface ExpenseLineItemDef {
  id: string;
  category: ExpenseCategory;
  lineItem: string;
  driverType: ExpenseDriverType;
  defaultAmount: number;
  enabledFor: FundingProfile[];
  accountCode?: string;
}

const EXPENSE_LINE_ITEMS: ExpenseLineItemDef[] = [
  // ── Instructional Program (5xxx) ──
  { id: "curriculum_materials", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (New)", driverType: "per_new_student", defaultAmount: 500, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "5100" },
  { id: "curriculum_materials_returning", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (Returning)", driverType: "per_returning_student", defaultAmount: 100, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "5101" },
  { id: "classroom_supplies", category: "instructional_program", lineItem: "Classroom Supplies", driverType: "per_student", defaultAmount: 100, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "5110" },
  { id: "testing_assessment", category: "instructional_program", lineItem: "Testing & Assessment", driverType: "per_student", defaultAmount: 50, enabledFor: ["charter_public_funded", "hybrid_mixed"], accountCode: "5120" },
  { id: "special_education", category: "instructional_program", lineItem: "Special Education Services", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5130" },
  { id: "professional_development", category: "instructional_program", lineItem: "Professional Development", driverType: "annual_fixed", defaultAmount: 3000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "5200" },
  { id: "substitute_teachers", category: "instructional_program", lineItem: "Substitute Teacher Services", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5205" },
  { id: "enrichment_programs", category: "instructional_program", lineItem: "Enrichment / After-School Programs", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5210" },
  { id: "field_trips", category: "instructional_program", lineItem: "Field Trips & Experiential Learning", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "5220" },
  { id: "food_service", category: "instructional_program", lineItem: "Food / Meal Service", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "5300" },
  { id: "transportation", category: "instructional_program", lineItem: "Student Transportation", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5310" },
  { id: "student_recruitment", category: "instructional_program", lineItem: "Student Recruitment & Outreach", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5315" },
  { id: "library_media", category: "instructional_program", lineItem: "Library & Media Resources", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "5318" },
  { id: "uniforms_student_supplies", category: "instructional_program", lineItem: "Uniforms / Student Supplies", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "5320" },
  { id: "health_safety_supplies", category: "instructional_program", lineItem: "Health & Safety Supplies", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5410" },
  { id: "parent_communication", category: "instructional_program", lineItem: "Parent Communication Tools", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5420" },

  // ── Technology (6xxx) ──
  { id: "student_devices", category: "technology", lineItem: "Student Devices & Hardware (New)", driverType: "per_new_student", defaultAmount: 400, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "6100" },
  { id: "student_devices_returning", category: "technology", lineItem: "Student Devices & Hardware (Returning)", driverType: "per_returning_student", defaultAmount: 50, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "6101" },
  { id: "software_licenses", category: "technology", lineItem: "Software & Subscriptions (SIS, LMS)", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "6200" },
  { id: "internet_telecom", category: "technology", lineItem: "Internet & Telecommunications", driverType: "monthly", defaultAmount: 300, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "6300" },
  { id: "website_hosting", category: "technology", lineItem: "Website & Domain Hosting", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "6350" },
  { id: "tech_support", category: "technology", lineItem: "IT Support / Managed Services", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "6400" },

  // ── Facility (7xxx) ──
  { id: "rent_lease", category: "occupancy_facility", lineItem: "Rent / Lease", driverType: "monthly", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "7100" },
  { id: "utilities", category: "occupancy_facility", lineItem: "Utilities", driverType: "annual_fixed", defaultAmount: 8000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "7200" },
  { id: "insurance", category: "occupancy_facility", lineItem: "Property & Liability Insurance", driverType: "annual_fixed", defaultAmount: 3500, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "7300" },
  { id: "general_liability_insurance", category: "occupancy_facility", lineItem: "General Liability Insurance", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "7310" },
  { id: "maintenance_repairs", category: "occupancy_facility", lineItem: "Maintenance & Repairs (General)", driverType: "annual_fixed", defaultAmount: 2000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "7400" },
  { id: "pest_control", category: "occupancy_facility", lineItem: "Pest Control", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "7410" },
  { id: "fire_safety_inspections", category: "occupancy_facility", lineItem: "Fire/Safety Systems & Inspection", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "7420" },
  { id: "hvac_mechanical", category: "occupancy_facility", lineItem: "HVAC / Mechanical Service", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "7430" },
  { id: "landscaping_grounds", category: "occupancy_facility", lineItem: "Landscaping / Grounds", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "7440" },
  { id: "trash_waste", category: "occupancy_facility", lineItem: "Trash / Waste Removal", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "7450" },
  { id: "janitorial", category: "occupancy_facility", lineItem: "Janitorial / Cleaning", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "7460" },
  { id: "security", category: "occupancy_facility", lineItem: "Security", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "7470" },

  // ── Admin & Operations (8xxx) ──
  { id: "bookkeeper", category: "administrative_general", lineItem: "Bookkeeper", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "8100" },
  { id: "lawyer", category: "administrative_general", lineItem: "Lawyer / Legal Counsel", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "8110" },
  { id: "marketing_admissions", category: "administrative_general", lineItem: "Marketing & Admissions", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8200" },
  { id: "legal_accounting", category: "administrative_general", lineItem: "Legal & Accounting", driverType: "annual_fixed", defaultAmount: 8000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8300" },
  { id: "office_supplies", category: "administrative_general", lineItem: "Office Supplies & Postage", driverType: "annual_fixed", defaultAmount: 2000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8400" },
  { id: "bank_merchant_fees", category: "administrative_general", lineItem: "Bank & Merchant Processing Fees", driverType: "percent_of_revenue", defaultAmount: 2.5, enabledFor: ["tuition_based", "hybrid_mixed"], accountCode: "8500" },
  { id: "payroll_processing", category: "administrative_general", lineItem: "Payroll Processing Fees", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "8510" },
  { id: "staff_recruitment", category: "administrative_general", lineItem: "Staff Recruitment & Hiring", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8515" },
  { id: "workers_comp", category: "administrative_general", lineItem: "Workers' Compensation Insurance", driverType: "annual_fixed", defaultAmount: 4000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8520" },
  { id: "background_checks", category: "administrative_general", lineItem: "Employee Background Checks", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "8530" },
  { id: "do_insurance", category: "administrative_general", lineItem: "Directors & Officers (D&O) Insurance", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8540" },
  { id: "travel_conferences", category: "administrative_general", lineItem: "Travel & Conference", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8600" },
  { id: "staff_appreciation", category: "administrative_general", lineItem: "Staff Appreciation & Morale", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8605" },
  { id: "printing_copying", category: "administrative_general", lineItem: "Printing & Copying", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8608" },
  { id: "dues_memberships", category: "administrative_general", lineItem: "Dues & Memberships", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8610" },
  { id: "accreditation_licensing", category: "administrative_general", lineItem: "Accreditation & Licensing Fees", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8615" },
  { id: "contracted_services", category: "administrative_general", lineItem: "Contracted Services (Speech, OT, Nursing)", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8700" },
  { id: "authorizer_fee", category: "administrative_general", lineItem: "Authorizer / Management Fee", driverType: "percent_of_revenue", defaultAmount: 3, enabledFor: [], accountCode: "8800" },
  { id: "audit_compliance", category: "administrative_general", lineItem: "Audit & Compliance", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["charter_public_funded"], accountCode: "8810" },
  { id: "board_governance", category: "administrative_general", lineItem: "Board & Governance", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8820" },
  { id: "contingency_reserve", category: "administrative_general", lineItem: "Contingency / Operating Reserve", driverType: "percent_of_revenue", defaultAmount: 0, enabledFor: [], accountCode: "8850" },
  { id: "diocesan_assessment", category: "administrative_general", lineItem: "Diocesan Assessment", driverType: "percent_of_revenue", defaultAmount: 7, enabledFor: [], accountCode: "8860" },
  { id: "congregation_assessment", category: "administrative_general", lineItem: "Congregation / Organization Assessment Fee", driverType: "percent_of_revenue", defaultAmount: 5, enabledFor: [], accountCode: "8865" },
  { id: "fiscal_sponsor_fee", category: "administrative_general", lineItem: "Fiscal Sponsor Fee", driverType: "percent_of_revenue", defaultAmount: 7, enabledFor: [], accountCode: "8870" },
  { id: "miscellaneous", category: "administrative_general", lineItem: "Miscellaneous / Other Overhead", driverType: "annual_fixed", defaultAmount: 3000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8900" },
];

interface CapitalDebtItemDef {
  id: string;
  lineItem: string;
  driverType: ExpenseDriverType;
  defaultAmount: number;
  enabledFor: FundingProfile[];
  isLoan?: boolean;
  accountCode?: string;
}

const CAPITAL_DEBT_ITEMS: CapitalDebtItemDef[] = [
  { id: "ffe_equipment", lineItem: "FF&E (Furniture, Fixtures & Equipment)", driverType: "annual_fixed", defaultAmount: 15000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "9100" },
  { id: "leasehold_improvements", lineItem: "Leasehold Improvements / Buildout", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "9200" },
  { id: "startup_equipment", lineItem: "Startup Equipment & Supplies", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "9300" },
  { id: "vehicle_purchase", lineItem: "Vehicle Purchase", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "9400" },
  { id: "debt_service", lineItem: "Loan / Debt Service", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], isLoan: true, accountCode: "9500" },
  { id: "capital_reserve", lineItem: "Capital Reserve Fund", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "9600" },
];

let counter = 0;
function uid(): string {
  return `exp_${Date.now()}_${++counter}_${Math.random().toString(36).slice(2, 6)}`;
}

function stageAdjust(amount: number, schoolStage: SchoolStage): number {
  if (schoolStage === "operating_school" && amount > 0) {
    return Math.round(amount * 1.15);
  }
  return amount;
}

export interface FaithFundraisingExpenseProfile {
  isDiocesan?: boolean;
  congregationAssessment?: boolean;
  hasFiscalSponsor?: boolean;
}

export function generateDefaultExpenseRows(
  fundingProfile: FundingProfile,
  yearCount: number,
  schoolStage: SchoolStage = "new_school",
  managementFee?: { enabled: boolean; percent: number },
  rates?: EscalationRates,
  faithProfile?: FaithFundraisingExpenseProfile,
): ExpenseRowData[] {
  const defaultRates: EscalationRates = rates || { generalCostInflation: 3, annualRentIncrease: 3 };
  return EXPENSE_LINE_ITEMS.map((def) => {
    const baseAmount = stageAdjust(def.defaultAmount, schoolStage);
    let enabled = def.enabledFor.includes(fundingProfile);
    let amount = baseAmount;

    if (def.id === "authorizer_fee" && managementFee) {
      enabled = managementFee.enabled;
      amount = managementFee.enabled ? managementFee.percent : baseAmount;
    }

    if (def.id === "diocesan_assessment" && faithProfile?.isDiocesan) {
      enabled = true;
    }
    if (def.id === "congregation_assessment" && faithProfile?.congregationAssessment) {
      enabled = true;
    }
    if (def.id === "fiscal_sponsor_fee" && faithProfile?.hasFiscalSponsor) {
      enabled = true;
    }

    const rule = getEscalationRule(
      { driverType: def.driverType, canonicalKey: def.lineItem },
      defaultRates,
    );
    const isPercent = def.driverType === "percent_of_revenue";
    const amounts = computeEscalatedAmounts(amount, yearCount, rule.rate, isPercent);

    return {
      id: uid(),
      category: def.category,
      lineItem: def.lineItem,
      canonicalKey: def.lineItem,
      enabled,
      driverType: def.driverType,
      amounts,
      note: "",
      accountCode: def.accountCode || "",
    };
  });
}

export function generateDefaultCapitalDebtRows(
  fundingProfile: FundingProfile,
  yearCount: number,
  schoolStage: SchoolStage = "new_school",
): CapitalDebtRowData[] {
  return CAPITAL_DEBT_ITEMS.map((def) => {
    const baseAmount = schoolStage === "new_school" ? def.defaultAmount : Math.round(def.defaultAmount * 0.5);
    return {
      id: uid(),
      lineItem: def.lineItem,
      enabled: def.enabledFor.includes(fundingProfile),
      driverType: def.driverType,
      amounts: new Array(yearCount).fill(baseAmount),
      note: "",
      isLoan: def.isLoan || false,
      loanPrincipal: 0,
      loanRate: 0,
      loanTermYears: 0,
      accountCode: def.accountCode || "",
    };
  });
}

export function calculateLoanPayment(principal: number, annualRate: number, termYears: number): number {
  return Math.round(computeAnnualDebt(principal, annualRate / 100, termYears));
}

export function mergeCanonicalExpenseRows(existing: ExpenseRowData[], yearCount: number): ExpenseRowData[] {
  const existingNames = new Set(existing.map((r) => r.lineItem));
  const missing = EXPENSE_LINE_ITEMS
    .filter((def) => !existingNames.has(def.lineItem))
    .map((def) => ({
      id: uid(),
      category: def.category,
      lineItem: def.lineItem,
      enabled: false,
      driverType: def.driverType,
      amounts: new Array(yearCount).fill(0),
      note: "",
      accountCode: def.accountCode || "",
    }));
  return missing.length > 0 ? [...existing, ...missing] : existing;
}

const BUSINESS_OPS_CAPITAL_LINE_ITEMS = ["Loan / Debt Service"];

export function mergeCanonicalCapitalRows(existing: CapitalDebtRowData[], yearCount: number): CapitalDebtRowData[] {
  const existingNames = new Set(existing.map((r) => r.lineItem));
  const missing = CAPITAL_DEBT_ITEMS
    .filter((def) => BUSINESS_OPS_CAPITAL_LINE_ITEMS.includes(def.lineItem) && !existingNames.has(def.lineItem))
    .map((def) => ({
      id: uid(),
      lineItem: def.lineItem,
      enabled: false,
      driverType: def.driverType,
      amounts: new Array(yearCount).fill(0),
      note: "",
      isLoan: def.isLoan || false,
      loanPrincipal: 0,
      loanRate: 0,
      loanTermYears: 0,
      accountCode: def.accountCode || "",
    }));
  return missing.length > 0 ? [...existing, ...missing] : existing;
}

export function createBlankExpenseRow(category: ExpenseCategory, yearCount: number): ExpenseRowData {
  return {
    id: uid(),
    category,
    lineItem: "",
    enabled: true,
    driverType: "annual_fixed",
    amounts: new Array(yearCount).fill(0),
    note: "",
    accountCode: "",
  };
}

export function createBlankCapitalDebtRow(yearCount: number): CapitalDebtRowData {
  return {
    id: uid(),
    lineItem: "",
    enabled: true,
    driverType: "annual_fixed",
    amounts: new Array(yearCount).fill(0),
    note: "",
    accountCode: "",
  };
}

export const COA_CATEGORY_RANGES: Record<string, { range: string; label: string }> = {
  instructional_program: { range: "5000–5499", label: "Program Expenses" },
  technology: { range: "6000–6499", label: "Technology Expenses" },
  occupancy_facility: { range: "7000–7499", label: "Facility & Occupancy" },
  administrative_general: { range: "8000–8999", label: "Admin & Operations" },
  capital_financing: { range: "9000–9699", label: "Capital & Debt" },
};

export function getYearCount(_schoolStage?: string): number {
  return YEAR_COUNT;
}
