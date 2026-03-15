export type ExpenseCategory =
  | "personnel"
  | "instructional_program"
  | "technology"
  | "occupancy_facility"
  | "administrative_general"
  | "capital_financing";

export type ExpenseDriverType = "annual_fixed" | "monthly" | "per_student" | "percent_of_revenue";

export type SchoolStage = "new_school" | "operating_school";
export type FundingProfile = "tuition_based" | "charter_public_funded" | "hybrid_mixed";

export interface ExpenseRowData {
  id: string;
  category: ExpenseCategory;
  lineItem: string;
  enabled: boolean;
  driverType: ExpenseDriverType;
  amounts: number[];
  note?: string;
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
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  personnel: "People",
  instructional_program: "Program",
  technology: "Technology",
  occupancy_facility: "Facility",
  administrative_general: "Admin & Operations",
  capital_financing: "Capital & Debt",
};

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
  percent_of_revenue: "% of Revenue",
};

interface ExpenseLineItemDef {
  id: string;
  category: ExpenseCategory;
  lineItem: string;
  driverType: ExpenseDriverType;
  defaultAmount: number;
  enabledFor: FundingProfile[];
}

const EXPENSE_LINE_ITEMS: ExpenseLineItemDef[] = [
  { id: "curriculum_materials", category: "instructional_program", lineItem: "Curriculum & Instructional Materials", driverType: "per_student", defaultAmount: 300, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "classroom_supplies", category: "instructional_program", lineItem: "Classroom Supplies", driverType: "per_student", defaultAmount: 100, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "testing_assessment", category: "instructional_program", lineItem: "Testing & Assessment", driverType: "per_student", defaultAmount: 50, enabledFor: ["charter_public_funded", "hybrid_mixed"] },
  { id: "special_education", category: "instructional_program", lineItem: "Special Education Services", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [] },
  { id: "professional_development", category: "instructional_program", lineItem: "Professional Development", driverType: "annual_fixed", defaultAmount: 3000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "enrichment_programs", category: "instructional_program", lineItem: "Enrichment / After-School Programs", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [] },
  { id: "food_service", category: "instructional_program", lineItem: "Food / Meal Service", driverType: "per_student", defaultAmount: 0, enabledFor: [] },
  { id: "transportation", category: "instructional_program", lineItem: "Student Transportation", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [] },

  { id: "student_devices", category: "technology", lineItem: "Student Devices & Hardware", driverType: "per_student", defaultAmount: 150, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "software_licenses", category: "technology", lineItem: "Software & Subscriptions (SIS, LMS)", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "internet_telecom", category: "technology", lineItem: "Internet & Telecommunications", driverType: "monthly", defaultAmount: 300, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "tech_support", category: "technology", lineItem: "IT Support / Managed Services", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [] },

  { id: "rent_lease", category: "occupancy_facility", lineItem: "Rent / Lease", driverType: "monthly", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "utilities", category: "occupancy_facility", lineItem: "Utilities", driverType: "annual_fixed", defaultAmount: 8000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "insurance", category: "occupancy_facility", lineItem: "Property & Liability Insurance", driverType: "annual_fixed", defaultAmount: 3500, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "maintenance_repairs", category: "occupancy_facility", lineItem: "Maintenance & Repairs", driverType: "annual_fixed", defaultAmount: 2000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "janitorial", category: "occupancy_facility", lineItem: "Janitorial / Cleaning", driverType: "monthly", defaultAmount: 0, enabledFor: [] },
  { id: "security", category: "occupancy_facility", lineItem: "Security", driverType: "monthly", defaultAmount: 0, enabledFor: [] },

  { id: "bookkeeper", category: "administrative_general", lineItem: "Bookkeeper", driverType: "monthly", defaultAmount: 0, enabledFor: [] },
  { id: "lawyer", category: "administrative_general", lineItem: "Lawyer / Legal Counsel", driverType: "monthly", defaultAmount: 0, enabledFor: [] },
  { id: "general_liability_insurance", category: "occupancy_facility", lineItem: "General Liability Insurance", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [] },
  { id: "marketing_admissions", category: "administrative_general", lineItem: "Marketing & Admissions", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "legal_accounting", category: "administrative_general", lineItem: "Legal & Accounting", driverType: "annual_fixed", defaultAmount: 8000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "office_supplies", category: "administrative_general", lineItem: "Office Supplies & Postage", driverType: "annual_fixed", defaultAmount: 2000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "bank_merchant_fees", category: "administrative_general", lineItem: "Bank & Merchant Processing Fees", driverType: "percent_of_revenue", defaultAmount: 2.5, enabledFor: ["tuition_based", "hybrid_mixed"] },
  { id: "authorizer_fee", category: "administrative_general", lineItem: "Authorizer / Management Fee", driverType: "percent_of_revenue", defaultAmount: 3, enabledFor: [] },
  { id: "audit_compliance", category: "administrative_general", lineItem: "Audit & Compliance", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["charter_public_funded"] },
  { id: "board_governance", category: "administrative_general", lineItem: "Board & Governance", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [] },
  { id: "miscellaneous", category: "administrative_general", lineItem: "Miscellaneous / Other Overhead", driverType: "annual_fixed", defaultAmount: 3000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
];

interface CapitalDebtItemDef {
  id: string;
  lineItem: string;
  driverType: ExpenseDriverType;
  defaultAmount: number;
  enabledFor: FundingProfile[];
  isLoan?: boolean;
}

const CAPITAL_DEBT_ITEMS: CapitalDebtItemDef[] = [
  { id: "ffe_equipment", lineItem: "FF&E (Furniture, Fixtures & Equipment)", driverType: "annual_fixed", defaultAmount: 15000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "leasehold_improvements", lineItem: "Leasehold Improvements / Buildout", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [] },
  { id: "startup_equipment", lineItem: "Startup Equipment & Supplies", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"] },
  { id: "vehicle_purchase", lineItem: "Vehicle Purchase", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [] },
  { id: "debt_service", lineItem: "Loan / Debt Service", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], isLoan: true },
  { id: "capital_reserve", lineItem: "Capital Reserve Fund", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [] },
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

export function generateDefaultExpenseRows(
  fundingProfile: FundingProfile,
  yearCount: number,
  schoolStage: SchoolStage = "new_school",
  managementFee?: { enabled: boolean; percent: number },
): ExpenseRowData[] {
  return EXPENSE_LINE_ITEMS.map((def) => {
    const baseAmount = stageAdjust(def.defaultAmount, schoolStage);
    let enabled = def.enabledFor.includes(fundingProfile);
    let amount = baseAmount;

    if (def.id === "authorizer_fee" && managementFee) {
      enabled = managementFee.enabled;
      amount = managementFee.enabled ? managementFee.percent : baseAmount;
    }

    return {
      id: uid(),
      category: def.category,
      lineItem: def.lineItem,
      enabled,
      driverType: def.driverType,
      amounts: new Array(yearCount).fill(amount),
      note: "",
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
    };
  });
}

export function calculateLoanPayment(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (annualRate <= 0) return Math.round(principal / termYears);
  const monthlyRate = annualRate / 100 / 12;
  const totalPayments = termYears * 12;
  const monthlyPayment = (principal * monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
  return Math.round(monthlyPayment * 12);
}

const BUSINESS_OPS_EXPENSE_LINE_ITEMS = ["Bookkeeper", "Lawyer / Legal Counsel", "General Liability Insurance"];

export function mergeCanonicalExpenseRows(existing: ExpenseRowData[], yearCount: number): ExpenseRowData[] {
  const existingNames = new Set(existing.map((r) => r.lineItem));
  const missing = EXPENSE_LINE_ITEMS
    .filter((def) => BUSINESS_OPS_EXPENSE_LINE_ITEMS.includes(def.lineItem) && !existingNames.has(def.lineItem))
    .map((def) => ({
      id: uid(),
      category: def.category,
      lineItem: def.lineItem,
      enabled: false,
      driverType: def.driverType,
      amounts: new Array(yearCount).fill(0),
      note: "",
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
  };
}

export function getYearCount(_schoolStage?: string): number {
  return 5;
}
