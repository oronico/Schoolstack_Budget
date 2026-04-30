import { DEFAULT_BENEFITS_RATE, DEFAULT_PAYROLL_TAX_RATE } from "@workspace/finance";
import {
  getStatePayrollTaxEntry,
  getStatePayrollTaxRate,
  computePayrollTaxForSalary,
  type PayrollTaxComponent,
} from "./state-payroll-tax-data";

export type StaffingFunctionCategory =
  | "instructional"
  | "school_leadership"
  | "student_support"
  | "operations"
  | "administrative"
  | "other";

export type EmploymentType = "full_time" | "part_time" | "contract";

export type SchoolStage = "new_school" | "operating_school";
export type FundingProfile = "tuition_based" | "charter_public_funded" | "hybrid_mixed";

export type StaffingMode = "fixed" | "ratio";

export interface StaffingRowData {
  id: string;
  roleName: string;
  functionCategory: StaffingFunctionCategory;
  employmentType: EmploymentType;
  fte: number;
  annualizedRate: number;
  benefitsEligible: boolean;
  benefitsRate: number;
  payrollTaxRate: number;
  /** Per-component breakdown (FICA, Medicare, FUTA, state SUI, etc) with wage-base
   *  caps. When present and `payrollTaxRateOverridden` is false, payroll tax is
   *  computed per component, capped at each component's wage base. */
  payrollTaxComponents?: PayrollTaxComponent[];
  payrollLike: boolean;
  benefitsRateOverridden?: boolean;
  payrollTaxRateOverridden?: boolean;
  notes: string;
  staffingMode: StaffingMode;
  studentRatio?: number;
  minFte?: number;
  maxFte?: number;
  startYear?: number;
  endYear?: number;
}

export const FUNCTION_CATEGORY_LABELS: Record<StaffingFunctionCategory, string> = {
  instructional: "Instructional",
  school_leadership: "School Leadership",
  student_support: "Student Support",
  operations: "Operations",
  administrative: "Administrative",
  other: "Other",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-Time",
  part_time: "Part-Time",
  contract: "Contract",
};

export const FUNCTION_CATEGORY_ORDER: StaffingFunctionCategory[] = [
  "school_leadership",
  "instructional",
  "student_support",
  "operations",
  "administrative",
  "other",
];

interface StaffPreset {
  id: string;
  roleName: string;
  functionCategory: StaffingFunctionCategory;
  employmentType: EmploymentType;
  fte: number;
  annualizedRate: number;
  benefitsEligible: boolean;
  includeFor: { stages: SchoolStage[]; profiles: FundingProfile[] };
}

const ALL_STAGES: SchoolStage[] = ["new_school", "operating_school"];
const ALL_PROFILES: FundingProfile[] = ["tuition_based", "charter_public_funded", "hybrid_mixed"];

const STAFF_PRESETS: StaffPreset[] = [
  {
    id: "head_of_school",
    roleName: "Head of School / Principal",
    functionCategory: "school_leadership",
    employmentType: "full_time",
    fte: 1.0,
    annualizedRate: 85000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
  {
    id: "assistant_principal",
    roleName: "Assistant Principal",
    functionCategory: "school_leadership",
    employmentType: "full_time",
    fte: 1.0,
    annualizedRate: 70000,
    benefitsEligible: true,
    includeFor: { stages: ["operating_school"], profiles: ALL_PROFILES },
  },
  {
    id: "teacher_1",
    roleName: "Lead Teacher",
    functionCategory: "instructional",
    employmentType: "full_time",
    fte: 1.0,
    annualizedRate: 55000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
  {
    id: "teacher_2",
    roleName: "Teacher",
    functionCategory: "instructional",
    employmentType: "full_time",
    fte: 1.0,
    annualizedRate: 50000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
  {
    id: "teaching_aide",
    roleName: "Teaching Aide / Paraprofessional",
    functionCategory: "instructional",
    employmentType: "part_time",
    fte: 0.5,
    annualizedRate: 28000,
    benefitsEligible: false,
    includeFor: { stages: ["operating_school"], profiles: ALL_PROFILES },
  },
  {
    id: "sped_coordinator",
    roleName: "Special Education Coordinator",
    functionCategory: "student_support",
    employmentType: "full_time",
    fte: 1.0,
    annualizedRate: 55000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ["charter_public_funded", "hybrid_mixed"] },
  },
  {
    id: "counselor",
    roleName: "School Counselor",
    functionCategory: "student_support",
    employmentType: "full_time",
    fte: 1.0,
    annualizedRate: 50000,
    benefitsEligible: true,
    includeFor: { stages: ["operating_school"], profiles: ALL_PROFILES },
  },
  {
    id: "office_manager",
    roleName: "Office Manager",
    functionCategory: "administrative",
    employmentType: "full_time",
    fte: 1.0,
    annualizedRate: 42000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
  {
    id: "compliance_officer",
    roleName: "Compliance / Reporting Officer",
    functionCategory: "administrative",
    employmentType: "full_time",
    fte: 1.0,
    annualizedRate: 55000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ["charter_public_funded"] },
  },
  {
    id: "facilities_custodian",
    roleName: "Facilities / Custodial Staff",
    functionCategory: "operations",
    employmentType: "part_time",
    fte: 0.5,
    annualizedRate: 30000,
    benefitsEligible: false,
    includeFor: { stages: ["operating_school"], profiles: ALL_PROFILES },
  },
  {
    id: "bookkeeper",
    roleName: "Bookkeeper / Accountant",
    functionCategory: "administrative",
    employmentType: "contract",
    fte: 0.25,
    annualizedRate: 18000,
    benefitsEligible: false,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
];

export function generateDefaultStaffingRows(
  schoolStage: SchoolStage,
  fundingProfile: FundingProfile,
  stateCode?: string
): StaffingRowData[] {
  // When the school's state is known, seed each row with the per-component
  // payroll tax breakdown (FICA, Medicare, FUTA, state SUI, state PFML, etc.)
  // along with the state's blended display rate. The engine uses the components
  // for the actual math (with wage-base caps), and `payrollTaxRate` is just the
  // headline number we display in the UI.
  const stateEntry = stateCode ? getStatePayrollTaxEntry(stateCode) : undefined;
  const blendedRate = stateCode ? getStatePayrollTaxRate(stateCode) : DEFAULT_PAYROLL_TAX_RATE;
  return STAFF_PRESETS
    .filter(
      (p) =>
        p.includeFor.stages.includes(schoolStage) &&
        p.includeFor.profiles.includes(fundingProfile)
    )
    .map((p) => ({
      id: p.id,
      roleName: p.roleName,
      functionCategory: p.functionCategory,
      employmentType: p.employmentType,
      fte: p.fte,
      annualizedRate: p.annualizedRate,
      benefitsEligible: p.benefitsEligible,
      benefitsRate: DEFAULT_BENEFITS_RATE,
      payrollTaxRate: blendedRate,
      payrollTaxComponents: stateEntry ? stateEntry.components.map(c => ({ ...c })) : undefined,
      payrollLike: false,
      notes: "",
      staffingMode: "fixed" as StaffingMode,
    }));
}

export function createBlankStaffRow(stateCode?: string): StaffingRowData {
  const stateEntry = stateCode ? getStatePayrollTaxEntry(stateCode) : undefined;
  const blendedRate = stateCode ? getStatePayrollTaxRate(stateCode) : DEFAULT_PAYROLL_TAX_RATE;
  return {
    id: `staff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    roleName: "",
    functionCategory: "instructional",
    employmentType: "full_time",
    fte: 1.0,
    annualizedRate: 0,
    benefitsEligible: true,
    benefitsRate: DEFAULT_BENEFITS_RATE,
    payrollTaxRate: blendedRate,
    payrollTaxComponents: stateEntry ? stateEntry.components.map(c => ({ ...c })) : undefined,
    payrollLike: false,
    notes: "",
    staffingMode: "fixed",
  };
}

export interface PersonnelCostSummary {
  totalSalariesWages: number;
  totalBenefits: number;
  totalPayrollTaxes: number;
  totalContractedPersonnel: number;
  grandTotal: number;
  headcount: number;
  totalFTE: number;
}

function computeEffectiveFteForRow(row: StaffingRowData, enrollment: number): number {
  if (row.staffingMode === "ratio" && row.studentRatio && row.studentRatio > 0) {
    let computed = enrollment / row.studentRatio;
    if (row.minFte !== undefined) computed = Math.max(computed, row.minFte);
    if (row.maxFte !== undefined) computed = Math.min(computed, row.maxFte);
    return Math.ceil(computed * 2) / 2;
  }
  return row.fte;
}

export function calculatePersonnelCosts(rows: StaffingRowData[], y1Enrollment?: number): PersonnelCostSummary {
  let totalSalariesWages = 0;
  let totalBenefits = 0;
  let totalPayrollTaxes = 0;
  let totalContractedPersonnel = 0;
  let totalFTE = 0;

  for (const row of rows) {
    const fte = y1Enrollment !== undefined ? computeEffectiveFteForRow(row, y1Enrollment) : row.fte;
    const annualCost = fte * row.annualizedRate;
    totalFTE += fte;

    const isContractNotPayrollLike = row.employmentType === "contract" && !row.payrollLike;

    if (isContractNotPayrollLike) {
      totalContractedPersonnel += annualCost;
    } else {
      totalSalariesWages += annualCost;
      if (row.benefitsEligible) {
        totalBenefits += annualCost * (row.benefitsRate / 100);
      }
      // Wage-base-aware payroll tax (mirrors lib/finance scenario-engine):
      const components = row.payrollTaxComponents;
      if (components && components.length > 0 && !row.payrollTaxRateOverridden) {
        const perEmployeeTax = computePayrollTaxForSalary(row.annualizedRate, components);
        totalPayrollTaxes += perEmployeeTax * fte;
      } else {
        totalPayrollTaxes += annualCost * (row.payrollTaxRate / 100);
      }
    }
  }

  return {
    totalSalariesWages: Math.round(totalSalariesWages),
    totalBenefits: Math.round(totalBenefits),
    totalPayrollTaxes: Math.round(totalPayrollTaxes),
    totalContractedPersonnel: Math.round(totalContractedPersonnel),
    grandTotal: Math.round(totalSalariesWages + totalBenefits + totalPayrollTaxes + totalContractedPersonnel),
    headcount: rows.length,
    totalFTE: Math.round(totalFTE * 10) / 10,
  };
}
