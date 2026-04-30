import { computeAnnualDebt, YEAR_COUNT } from "@workspace/finance";
import { getStateEntityFeeProfile, buildEntityFeeAmounts } from "./state-entity-fees";
import type { EntityType } from "@/pages/model-wizard/schema";

export type BuiltInExpenseCategory =
  | "personnel"
  | "instructional_program"
  | "technology"
  | "occupancy_facility"
  | "administrative_general"
  | "capital_financing";

export type ExpenseCategory = BuiltInExpenseCategory | (string & {});

export type ExpenseDriverType = "annual_fixed" | "monthly" | "per_student" | "per_new_student" | "per_returning_student" | "percent_of_revenue" | "per_fte";

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
    case "per_fte":
      return { rate: 0, label: "scales with staff FTE", type: "flat" };
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
  escalationRate?: number;
  escalationRateOverridden?: boolean;
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
  per_fte: "Per FTE",
};

interface ExpenseLineItemDef {
  id: string;
  category: ExpenseCategory;
  lineItem: string;
  driverType: ExpenseDriverType;
  defaultAmount: number;
  enabledFor: FundingProfile[];
  accountCode?: string;
  rationale?: string;
}

const EXPENSE_LINE_ITEMS: ExpenseLineItemDef[] = [
  // ── Instructional Program (5xxx) ──
  { id: "curriculum_materials", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (New)", driverType: "per_new_student", defaultAmount: 500, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "5100", rationale: "Packaged curricula typically cost $200–$500/student for new students." },
  { id: "curriculum_materials_returning", category: "instructional_program", lineItem: "Curriculum & Instructional Materials (Returning)", driverType: "per_returning_student", defaultAmount: 100, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "5101", rationale: "Returning students need workbooks and consumables, usually $75–$150/student." },
  { id: "classroom_supplies", category: "instructional_program", lineItem: "Classroom Supplies", driverType: "per_student", defaultAmount: 100, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "5110", rationale: "Most schools budget $75–$150/student for consumable supplies." },
  { id: "testing_assessment", category: "instructional_program", lineItem: "Testing & Assessment", driverType: "per_student", defaultAmount: 50, enabledFor: ["charter_public_funded", "hybrid_mixed"], accountCode: "5120", rationale: "Standardized assessments like MAP or NWEA cost $10–$50/student." },
  { id: "special_education", category: "instructional_program", lineItem: "Special Education Services", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5130", rationale: "Contracted speech, OT, or evaluation services if serving students with IEPs." },
  { id: "professional_development", category: "instructional_program", lineItem: "Professional Development", driverType: "per_fte", defaultAmount: 1500, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "5200", rationale: "Most schools invest $1,000–$3,000 per staff FTE in workshops, coaching, and conferences." },
  { id: "substitute_teachers", category: "instructional_program", lineItem: "Substitute Teacher Services", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5205", rationale: "Budget for coverage during PD days, sick leave, and emergencies." },
  { id: "enrichment_programs", category: "instructional_program", lineItem: "Enrichment / After-School Programs", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5210", rationale: "Instructor pay, supplies, and insurance for after-school or summer programs." },
  { id: "field_trips", category: "instructional_program", lineItem: "Field Trips & Experiential Learning", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "5220", rationale: "Transportation + admission typically runs $50–$100/student/year." },
  { id: "food_service", category: "instructional_program", lineItem: "Food / Meal Service", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "5300", rationale: "Full meal programs cost $4–$8/student/day; federal programs can offset costs." },
  { id: "transportation", category: "instructional_program", lineItem: "Student Transportation", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5310", rationale: "Bus contracts or van leases — often one of the largest variable costs." },
  { id: "student_recruitment", category: "instructional_program", lineItem: "Student Recruitment & Outreach", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5315", rationale: "Events, mailings, and outreach to attract prospective families." },
  { id: "library_media", category: "instructional_program", lineItem: "Library & Media Resources", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "5318", rationale: "Books, subscriptions, and digital media for a school library." },
  { id: "uniforms_student_supplies", category: "instructional_program", lineItem: "Uniforms / Student Supplies", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "5320", rationale: "Some schools subsidize uniforms, backpacks, or planners for families." },
  { id: "health_safety_supplies", category: "instructional_program", lineItem: "Health & Safety Supplies", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5410", rationale: "First-aid kits, PPE, and safety equipment for classrooms." },
  { id: "parent_communication", category: "instructional_program", lineItem: "Parent Communication Tools", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "5420", rationale: "Apps or services like ClassDojo, Remind, or ParentSquare." },

  // ── Technology (6xxx) ──
  { id: "student_devices", category: "technology", lineItem: "Student Devices & Hardware (New)", driverType: "per_new_student", defaultAmount: 400, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "6100", rationale: "1:1 Chromebooks/iPads run $200–$400/device for new students." },
  { id: "student_devices_returning", category: "technology", lineItem: "Student Devices & Hardware (Returning)", driverType: "per_returning_student", defaultAmount: 50, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "6101", rationale: "Chargers, cases, and repairs for returning students' existing devices." },
  { id: "software_licenses", category: "technology", lineItem: "Software & Subscriptions (SIS, LMS)", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "6200", rationale: "SIS, LMS, and admin tools typically cost $3,000–$8,000/year for a small school." },
  { id: "internet_telecom", category: "technology", lineItem: "Internet & Telecommunications", driverType: "monthly", defaultAmount: 300, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "6300", rationale: "Business-grade internet runs $200–$500/month depending on location." },
  { id: "website_hosting", category: "technology", lineItem: "Website & Domain Hosting", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "6350", rationale: "Domain registration and hosting, typically $100–$500/year." },
  { id: "tech_support", category: "technology", lineItem: "IT Support / Managed Services", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "6400", rationale: "Managed IT for small schools runs $500–$1,500/month." },

  // ── Facility (7xxx) ──
  { id: "rent_lease", category: "occupancy_facility", lineItem: "Rent / Lease", driverType: "monthly", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "7100", rationale: "Often the single largest non-personnel expense; include lease escalation clauses." },
  { id: "utilities", category: "occupancy_facility", lineItem: "Utilities", driverType: "annual_fixed", defaultAmount: 8000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "7200", rationale: "Electric, gas, water, and sewer — $6,000–$12,000/year for a small school." },
  { id: "insurance", category: "occupancy_facility", lineItem: "Property & Liability Insurance", driverType: "annual_fixed", defaultAmount: 3500, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "7300", rationale: "Covers building, contents, and liability — typically $3,000–$8,000/year." },
  { id: "general_liability_insurance", category: "occupancy_facility", lineItem: "General Liability Insurance", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "7310", rationale: "Usually $1,500–$4,000/year; most authorizers and landlords require it." },
  { id: "maintenance_repairs", category: "occupancy_facility", lineItem: "Maintenance & Repairs (General)", driverType: "annual_fixed", defaultAmount: 2000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "7400", rationale: "Budget for unexpected interior repairs even in leased spaces." },
  { id: "pest_control", category: "occupancy_facility", lineItem: "Pest Control", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "7410", rationale: "Quarterly service contracts run $300–$800/year." },
  { id: "fire_safety_inspections", category: "occupancy_facility", lineItem: "Fire/Safety Systems & Inspection", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "7420", rationale: "Annual fire inspections and extinguisher maintenance." },
  { id: "hvac_mechanical", category: "occupancy_facility", lineItem: "HVAC / Mechanical Service", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "7430", rationale: "Preventive HVAC maintenance contracts run $500–$2,000/year." },
  { id: "landscaping_grounds", category: "occupancy_facility", lineItem: "Landscaping / Grounds", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "7440", rationale: "Lawn care and snow removal if not covered by your lease." },
  { id: "trash_waste", category: "occupancy_facility", lineItem: "Trash / Waste Removal", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "7450", rationale: "Commercial waste pickup typically costs $100–$300/month." },
  { id: "janitorial", category: "occupancy_facility", lineItem: "Janitorial / Cleaning", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "7460", rationale: "Contracted cleaning services run $500–$2,000/month by facility size." },
  { id: "security", category: "occupancy_facility", lineItem: "Security", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "7470", rationale: "Alarm monitoring $50–$200/month; on-site guards are $15–$25/hour." },

  // ── Admin & Operations (8xxx) ──
  { id: "bookkeeper", category: "administrative_general", lineItem: "Bookkeeper", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "8100", rationale: "Outsourced bookkeeping for a small school is typically $300–$800/month." },
  { id: "lawyer", category: "administrative_general", lineItem: "Lawyer / Legal Counsel", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "8110", rationale: "A legal retainer typically runs $200–$500/month for basic counsel." },
  { id: "marketing_admissions", category: "administrative_general", lineItem: "Marketing & Admissions", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8200", rationale: "New schools should budget $5,000–$15,000/year for enrollment marketing." },
  { id: "legal_accounting", category: "administrative_general", lineItem: "Legal & Accounting", driverType: "annual_fixed", defaultAmount: 8000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8300", rationale: "Annual accounting/audit $3,000–$10,000 plus legal retainer $2,000–$5,000." },
  { id: "office_supplies", category: "administrative_general", lineItem: "Office Supplies & Postage", driverType: "annual_fixed", defaultAmount: 2000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8400", rationale: "Paper, ink, postage, and office essentials — typically $1,500–$3,000/year." },
  { id: "bank_merchant_fees", category: "administrative_general", lineItem: "Bank & Merchant Processing Fees", driverType: "percent_of_revenue", defaultAmount: 2.5, enabledFor: ["tuition_based", "hybrid_mixed"], accountCode: "8500", rationale: "Credit card processing is typically 2.5–3.5% of tuition payments collected." },
  { id: "payroll_processing", category: "administrative_general", lineItem: "Payroll Processing Fees", driverType: "monthly", defaultAmount: 0, enabledFor: [], accountCode: "8510", rationale: "Payroll services (Gusto, ADP) cost $40–$150/month base plus $6–$12/employee." },
  { id: "staff_recruitment", category: "administrative_general", lineItem: "Staff Recruitment & Hiring", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8515", rationale: "Job postings, background checks, and hiring costs for new staff." },
  { id: "workers_comp", category: "administrative_general", lineItem: "Workers' Compensation Insurance", driverType: "annual_fixed", defaultAmount: 4000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8520", rationale: "Required in most states; typically 1–3% of total payroll." },
  { id: "background_checks", category: "administrative_general", lineItem: "Employee Background Checks", driverType: "per_student", defaultAmount: 0, enabledFor: [], accountCode: "8530", rationale: "Required for anyone working with children — $30–$100/person." },
  { id: "do_insurance", category: "administrative_general", lineItem: "Directors & Officers (D&O) Insurance", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8540", rationale: "Protects board members; typically $1,000–$3,000/year for small nonprofits." },
  { id: "travel_conferences", category: "administrative_general", lineItem: "Travel & Conference", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8600", rationale: "Conferences, site visits, and travel for leadership and staff." },
  { id: "staff_appreciation", category: "administrative_general", lineItem: "Staff Appreciation & Morale", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8605", rationale: "Staff events, gifts, and morale-boosting activities." },
  { id: "printing_copying", category: "administrative_general", lineItem: "Printing & Copying", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8608", rationale: "Copier lease or printing service, typically $100–$300/month." },
  { id: "dues_memberships", category: "administrative_general", lineItem: "Dues & Memberships", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8610", rationale: "Professional associations and school network memberships." },
  { id: "accreditation_licensing", category: "administrative_general", lineItem: "Accreditation & Licensing Fees", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8615", rationale: "Annual accreditation or state licensing fees for your school." },
  { id: "local_business_license", category: "administrative_general", lineItem: "Local / City Business License", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8616", rationale: "Many cities and counties charge an annual business license, B&O tax, gross receipts tax, or commercial rent tax. Common examples: Seattle B&O, NYC commercial rent tax, San Francisco gross receipts. Confirm rates with your city/county clerk." },
  { id: "contracted_services", category: "administrative_general", lineItem: "Contracted Services (Speech, OT, Nursing)", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8700", rationale: "Contracted specialists cost $50–$150/hour; schools often share providers." },
  { id: "authorizer_fee", category: "administrative_general", lineItem: "Authorizer / Management Fee", driverType: "percent_of_revenue", defaultAmount: 3, enabledFor: [], accountCode: "8800", rationale: "Charter authorizer fees are typically 1–5% of per-pupil revenue." },
  { id: "audit_compliance", category: "administrative_general", lineItem: "Audit & Compliance", driverType: "annual_fixed", defaultAmount: 5000, enabledFor: ["charter_public_funded"], accountCode: "8810", rationale: "Charter schools often require an annual independent audit ($4,000–$10,000)." },
  { id: "board_governance", category: "administrative_general", lineItem: "Board & Governance", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8820", rationale: "Board training, retreats, and governance-related expenses." },
  { id: "contingency_reserve", category: "administrative_general", lineItem: "Contingency / Operating Reserve", driverType: "percent_of_revenue", defaultAmount: 0, enabledFor: [], accountCode: "8850", rationale: "Aim for 45–90 days of operating reserves for unexpected costs." },
  { id: "diocesan_assessment", category: "administrative_general", lineItem: "Diocesan Assessment", driverType: "percent_of_revenue", defaultAmount: 7, enabledFor: [], accountCode: "8860", rationale: "Typically 5–10% of gross revenue; confirm the rate with your diocese." },
  { id: "congregation_assessment", category: "administrative_general", lineItem: "Congregation / Organization Assessment Fee", driverType: "percent_of_revenue", defaultAmount: 5, enabledFor: [], accountCode: "8865", rationale: "Annual fee paid to your faith organization — confirm with leadership." },
  { id: "fiscal_sponsor_fee", category: "administrative_general", lineItem: "Fiscal Sponsor Fee", driverType: "annual_fixed", defaultAmount: 0, enabledFor: [], accountCode: "8870", rationale: "Typically 5–10% of philanthropic revenue handled through the sponsor." },
  { id: "miscellaneous", category: "administrative_general", lineItem: "Miscellaneous / Other Overhead", driverType: "annual_fixed", defaultAmount: 3000, enabledFor: ["tuition_based", "charter_public_funded", "hybrid_mixed"], accountCode: "8900", rationale: "A small buffer for unexpected or hard-to-categorize expenses." },
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

/** Optional state-business-entity fee context. When provided, an extra
 *  "State Entity Filing Fees" row is appended to the defaults reflecting the
 *  state's annual report / franchise tax for the chosen entity type. See
 *  `state-entity-fees.ts` and the audit doc for sources. */
export interface StateEntityFeeContext {
  stateCode?: string;
  entityType?: string;
}

export const STATE_ENTITY_FEE_LINE_ITEM = "State Entity Filing Fees";
export const STATE_ENTITY_FEE_ROW_ID = "state_entity_filing_fees";

export const LOCAL_BUSINESS_LICENSE_LINE_ITEM = "Local / City Business License";

export function generateDefaultExpenseRows(
  fundingProfile: FundingProfile,
  yearCount: number,
  schoolStage: SchoolStage = "new_school",
  managementFee?: { enabled: boolean; percent: number },
  rates?: EscalationRates,
  faithProfile?: FaithFundraisingExpenseProfile,
  entityFeeContext?: StateEntityFeeContext,
): ExpenseRowData[] {
  const defaultRates: EscalationRates = rates || { generalCostInflation: 3, annualRentIncrease: 3 };
  const rows: ExpenseRowData[] = EXPENSE_LINE_ITEMS.map((def) => {
    const baseAmount = stageAdjust(def.defaultAmount, schoolStage);
    let enabled = def.enabledFor.includes(fundingProfile);
    let amount = baseAmount;
    let note = "";

    if (def.id === "authorizer_fee" && managementFee) {
      enabled = managementFee.enabled;
      amount = managementFee.enabled ? managementFee.percent : baseAmount;
    }

    if (def.id === "diocesan_assessment" && faithProfile?.isDiocesan) {
      enabled = true;
      note = "Annual assessment paid to the diocese, typically 5–10% of gross revenue. Confirm the rate with your diocesan office.";
    }
    if (def.id === "congregation_assessment" && faithProfile?.congregationAssessment) {
      enabled = true;
      note = "Annual assessment or fee paid to your faith organization. Confirm the rate with your organization's leadership.";
    }
    if (def.id === "fiscal_sponsor_fee" && faithProfile?.hasFiscalSponsor) {
      enabled = true;
      note = "Typically 5–10% of philanthropic revenue (donations, grants, events). Calculate your expected philanthropy total and multiply by your sponsor's fee rate.";
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
      note,
      accountCode: def.accountCode || "",
    };
  });

  // F3: append a state entity-fee row when state + entity type are known.
  // We deliberately leave it out for `sole_practitioner` and `undetermined` so
  // founders aren't shown a misleading $0 line item before they've even chosen
  // a structure.
  if (entityFeeContext?.stateCode && entityFeeContext?.entityType) {
    const profile = getStateEntityFeeProfile(entityFeeContext.stateCode, entityFeeContext.entityType as EntityType);
    if (profile) {
      const amounts = buildEntityFeeAmounts(profile, yearCount);
      rows.push({
        id: STATE_ENTITY_FEE_ROW_ID,
        category: "administrative_general",
        lineItem: STATE_ENTITY_FEE_LINE_ITEM,
        canonicalKey: STATE_ENTITY_FEE_LINE_ITEM,
        enabled: true,
        driverType: "annual_fixed",
        amounts,
        note: profile.notes,
        accountCode: "",
      });
    }
  }
  return rows;
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

export function getExpenseRationale(lineItem: string): string | undefined {
  const def = EXPENSE_LINE_ITEMS.find((d) => d.lineItem === lineItem);
  return def?.rationale;
}
