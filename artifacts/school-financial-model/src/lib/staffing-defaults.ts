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

export interface StaffingRowData {
  id: string;
  role: string;
  functionCategory: StaffingFunctionCategory;
  employmentType: EmploymentType;
  fte: number;
  annualRate: number;
  benefitsEligible: boolean;
  benefitsRate: number;
  payrollTaxRate: number;
  note: string;
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
  role: string;
  functionCategory: StaffingFunctionCategory;
  employmentType: EmploymentType;
  fte: number;
  annualRate: number;
  benefitsEligible: boolean;
  includeFor: { stages: SchoolStage[]; profiles: FundingProfile[] };
}

const ALL_STAGES: SchoolStage[] = ["new_school", "operating_school"];
const ALL_PROFILES: FundingProfile[] = ["tuition_based", "charter_public_funded", "hybrid_mixed"];

const STAFF_PRESETS: StaffPreset[] = [
  {
    id: "head_of_school",
    role: "Head of School / Principal",
    functionCategory: "school_leadership",
    employmentType: "full_time",
    fte: 1.0,
    annualRate: 85000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
  {
    id: "assistant_principal",
    role: "Assistant Principal",
    functionCategory: "school_leadership",
    employmentType: "full_time",
    fte: 1.0,
    annualRate: 70000,
    benefitsEligible: true,
    includeFor: { stages: ["operating_school"], profiles: ALL_PROFILES },
  },
  {
    id: "teacher_1",
    role: "Lead Teacher",
    functionCategory: "instructional",
    employmentType: "full_time",
    fte: 1.0,
    annualRate: 55000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
  {
    id: "teacher_2",
    role: "Teacher",
    functionCategory: "instructional",
    employmentType: "full_time",
    fte: 1.0,
    annualRate: 50000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
  {
    id: "teaching_aide",
    role: "Teaching Aide / Paraprofessional",
    functionCategory: "instructional",
    employmentType: "part_time",
    fte: 0.5,
    annualRate: 28000,
    benefitsEligible: false,
    includeFor: { stages: ["operating_school"], profiles: ALL_PROFILES },
  },
  {
    id: "sped_coordinator",
    role: "Special Education Coordinator",
    functionCategory: "student_support",
    employmentType: "full_time",
    fte: 1.0,
    annualRate: 55000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ["charter_public_funded", "hybrid_mixed"] },
  },
  {
    id: "counselor",
    role: "School Counselor",
    functionCategory: "student_support",
    employmentType: "full_time",
    fte: 1.0,
    annualRate: 50000,
    benefitsEligible: true,
    includeFor: { stages: ["operating_school"], profiles: ALL_PROFILES },
  },
  {
    id: "office_manager",
    role: "Office Manager",
    functionCategory: "administrative",
    employmentType: "full_time",
    fte: 1.0,
    annualRate: 42000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
  {
    id: "compliance_officer",
    role: "Compliance / Reporting Officer",
    functionCategory: "administrative",
    employmentType: "full_time",
    fte: 1.0,
    annualRate: 55000,
    benefitsEligible: true,
    includeFor: { stages: ALL_STAGES, profiles: ["charter_public_funded"] },
  },
  {
    id: "facilities_custodian",
    role: "Facilities / Custodial Staff",
    functionCategory: "operations",
    employmentType: "part_time",
    fte: 0.5,
    annualRate: 30000,
    benefitsEligible: false,
    includeFor: { stages: ["operating_school"], profiles: ALL_PROFILES },
  },
  {
    id: "bookkeeper",
    role: "Bookkeeper / Accountant",
    functionCategory: "administrative",
    employmentType: "contract",
    fte: 0.25,
    annualRate: 18000,
    benefitsEligible: false,
    includeFor: { stages: ALL_STAGES, profiles: ALL_PROFILES },
  },
];

const DEFAULT_BENEFITS_RATE = 20;
const DEFAULT_PAYROLL_TAX_RATE = 8;

export function generateDefaultStaffingRows(
  schoolStage: SchoolStage,
  fundingProfile: FundingProfile
): StaffingRowData[] {
  return STAFF_PRESETS
    .filter(
      (p) =>
        p.includeFor.stages.includes(schoolStage) &&
        p.includeFor.profiles.includes(fundingProfile)
    )
    .map((p) => ({
      id: p.id,
      role: p.role,
      functionCategory: p.functionCategory,
      employmentType: p.employmentType,
      fte: p.fte,
      annualRate: p.annualRate,
      benefitsEligible: p.benefitsEligible,
      benefitsRate: DEFAULT_BENEFITS_RATE,
      payrollTaxRate: DEFAULT_PAYROLL_TAX_RATE,
      note: "",
    }));
}

export function createBlankStaffRow(): StaffingRowData {
  return {
    id: `staff_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role: "",
    functionCategory: "instructional",
    employmentType: "full_time",
    fte: 1.0,
    annualRate: 0,
    benefitsEligible: true,
    benefitsRate: DEFAULT_BENEFITS_RATE,
    payrollTaxRate: DEFAULT_PAYROLL_TAX_RATE,
    note: "",
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

export function calculatePersonnelCosts(rows: StaffingRowData[]): PersonnelCostSummary {
  let totalSalariesWages = 0;
  let totalBenefits = 0;
  let totalPayrollTaxes = 0;
  let totalContractedPersonnel = 0;
  let totalFTE = 0;

  for (const row of rows) {
    const annualCost = row.fte * row.annualRate;
    totalFTE += row.fte;

    if (row.employmentType === "contract") {
      totalContractedPersonnel += annualCost;
    } else {
      totalSalariesWages += annualCost;
      if (row.benefitsEligible) {
        totalBenefits += annualCost * (row.benefitsRate / 100);
      }
      totalPayrollTaxes += annualCost * (row.payrollTaxRate / 100);
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
