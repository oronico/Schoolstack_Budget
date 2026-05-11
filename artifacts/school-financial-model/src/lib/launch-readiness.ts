import type { FullModelData } from "@/pages/model-wizard/schema";

export type LaunchChecklistField = {
  key: string;
  label: string;
  filled: (data: FullModelData) => boolean;
};

function isNum(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export const LAUNCH_CHECKLIST_FIELDS: LaunchChecklistField[] = [
  {
    key: "projectedOpeningMonth",
    label: "Projected opening month",
    filled: (d) => Boolean(d.schoolProfile?.launchAssumptions?.projectedOpeningMonth),
  },
  {
    key: "committedStudents",
    label: "Committed students",
    filled: (d) => isNum(d.schoolProfile?.launchAssumptions?.committedStudents),
  },
  {
    key: "signedEnrollmentAgreements",
    label: "Signed enrollment agreements",
    filled: (d) => isNum(d.schoolProfile?.launchAssumptions?.signedEnrollmentAgreements),
  },
  {
    key: "depositsCollected",
    label: "Deposits collected",
    filled: (d) => isNum(d.schoolProfile?.launchAssumptions?.depositsCollected),
  },
  {
    key: "firstMonthWithRevenue",
    label: "First month with revenue",
    filled: (d) => Boolean(d.schoolProfile?.launchAssumptions?.firstMonthWithRevenue),
  },
  {
    key: "firstMonthWithPayroll",
    label: "First month with payroll",
    filled: (d) => Boolean(d.schoolProfile?.launchAssumptions?.firstMonthWithPayroll),
  },
  {
    key: "firstMonthWithRent",
    label: "First month with rent",
    filled: (d) => Boolean(d.schoolProfile?.launchAssumptions?.firstMonthWithRent),
  },
  {
    key: "preOpeningCashNeeds",
    label: "Pre-opening cash needs",
    filled: (d) => isNum(d.schoolProfile?.launchAssumptions?.preOpeningCashNeeds),
  },
  {
    key: "startupCosts",
    label: "One-time startup costs",
    filled: (d) => isNum(d.schoolProfile?.launchAssumptions?.startupCosts),
  },
];

export interface LaunchReadinessSummary {
  filled: LaunchChecklistField[];
  missing: LaunchChecklistField[];
  total: number;
}

export function summarizeLaunchReadiness(data: FullModelData): LaunchReadinessSummary {
  const filled: LaunchChecklistField[] = [];
  const missing: LaunchChecklistField[] = [];
  for (const field of LAUNCH_CHECKLIST_FIELDS) {
    let isFilled = false;
    try {
      isFilled = field.filled(data);
    } catch {
      isFilled = false;
    }
    if (isFilled) filled.push(field);
    else missing.push(field);
  }
  return { filled, missing, total: LAUNCH_CHECKLIST_FIELDS.length };
}

export function isNewSchool(data: Pick<FullModelData, "schoolProfile"> | undefined | null): boolean {
  return data?.schoolProfile?.schoolStage === "new_school";
}
