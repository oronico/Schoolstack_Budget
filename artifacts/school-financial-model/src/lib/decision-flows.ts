import type { FullModelData, DecisionType } from "@/pages/model-wizard/schema";
import { computeBaseFinancials, type ScenarioMetrics, type NudgeItem } from "./scenario-engine";
import {
  applyWhatIfOverrides,
  detectFacilityRent,
  type WhatIfOverrides,
} from "./whatif-engine";

// --- Decision input shapes ----------------------------------------------------

export interface AddProgramInputs {
  name: string;
  annualTuition: number;
  enrollment: [number, number, number, number, number];
  addedFte?: number;
  addedFteSalary?: number;
  addedAnnualSpace?: number;
}

export interface SiteInputs {
  newMonthlyRent: number;
  newRentEscalation?: number;
  newSqft?: number;
  startYear?: number;
  oneTimeFitOut?: number;
}

export interface EnrollmentChangeInputs {
  enrollmentDelta: [number, number, number, number, number];
  retentionRate?: number;
  tuitionDeltaPerStudent?: number;
}

export type DecisionInputs =
  | { type: "add_program"; inputs: AddProgramInputs }
  | { type: "evaluate_site"; inputs: SiteInputs }
  | { type: "change_enrollment"; inputs: EnrollmentChangeInputs };

export interface DecisionImpact {
  base: ScenarioMetrics;
  adjusted: ScenarioMetrics;
  deltas: {
    revenue: number[];
    netIncome: number[];
    netIncomePct: number[];
    dscr: number[];
    breakEvenYearShift: number | null;
    cashRunwayDeltaMonths: number;
  };
  nudges: NudgeItem[];
}

const Z5: [number, number, number, number, number] = [0, 0, 0, 0, 0];

export const DECISION_LABELS: Record<DecisionType, string> = {
  add_program: "Add a program",
  evaluate_site: "Evaluate a site",
  change_enrollment: "Change enrollment",
};

export const DECISION_SHORT: Record<DecisionType, string> = {
  add_program: "New program",
  evaluate_site: "New site",
  change_enrollment: "Enrollment change",
};

export const DECISION_THEME: Record<DecisionType, { accent: string; bg: string; border: string; text: string }> = {
  add_program: {
    accent: "bg-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
  },
  evaluate_site: {
    accent: "bg-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-200",
    text: "text-teal-800",
  },
  change_enrollment: {
    accent: "bg-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
  },
};

// --- Helpers ----------------------------------------------------------------

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // fall through
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultBenefitsRate(data: FullModelData): number {
  const rate = data.staffing?.benefitsRate;
  if (typeof rate === "number" && rate >= 0) return rate;
  return 22;
}

function defaultPayrollTaxRate(data: FullModelData): number {
  const rate = data.staffing?.payrollTaxRate;
  if (typeof rate === "number" && rate >= 0) return rate;
  return 8;
}

// --- Add-program application -------------------------------------------------

export function applyAddProgramDecision(
  data: FullModelData,
  inputs: AddProgramInputs,
): FullModelData {
  const cloned = deepClone(data) as FullModelData;
  const programName = inputs.name.trim() || "New program";
  const tuition = Math.max(0, Math.round(inputs.annualTuition || 0));
  const enrollment = inputs.enrollment.map((n) => Math.max(0, Math.round(n || 0)));

  // We deliberately DO NOT mutate baseline enrollment. The base model's
  // per-student tuition and expense rows belong to the *host* program, so
  // adding the new program's students to the enrollment numbers would
  // double-count revenue (per-student row + the explicit row we add below)
  // and wrongly stretch host-program per-student costs across new students.
  //
  // Instead, we represent the new program with explicit per-year amounts
  // (enrollment × tuition) and let the user specify any added staff/space
  // costs directly via the optional fields below.
  const stamp = Date.now();
  const newRevenueRow = {
    id: `__decision_program_rev_${stamp}__`,
    category: "tuition_and_fees" as const,
    lineItem: programName,
    enabled: true,
    driverType: "annual_fixed" as const,
    amounts: enrollment.map((n) => n * tuition),
    note: "Decision flow: Add a program",
  };
  cloned.revenueRows = [
    ...(cloned.revenueRows || []),
    newRevenueRow,
  ] as FullModelData["revenueRows"];

  // 3) Optional: synthesize a staffing row for new program-related FTE.
  const addedFte = Math.max(0, inputs.addedFte ?? 0);
  const addedSalary = Math.max(0, inputs.addedFteSalary ?? 0);
  if (addedFte > 0 && addedSalary > 0) {
    const staffRow = {
      id: `__decision_program_staff_${stamp}__`,
      roleName: `${programName} staff`,
      functionCategory: "instructional" as const,
      employmentType: "full_time" as const,
      fte: addedFte,
      annualizedRate: addedSalary,
      benefitsEligible: true,
      benefitsRate: defaultBenefitsRate(cloned),
      payrollTaxRate: defaultPayrollTaxRate(cloned),
      payrollLike: true,
      notes: "Decision flow: Add a program",
      staffingMode: "fixed" as const,
    };
    cloned.staffingRows = [
      ...(cloned.staffingRows || []),
      staffRow,
    ] as FullModelData["staffingRows"];
  }

  // 4) Optional: synthesize an annual occupancy/space expense row.
  const addedSpace = Math.max(0, inputs.addedAnnualSpace ?? 0);
  if (addedSpace > 0) {
    const expRow = {
      id: `__decision_program_space_${stamp}__`,
      category: "occupancy_facility",
      lineItem: `${programName} space`,
      enabled: true,
      driverType: "annual_fixed" as const,
      amounts: [addedSpace, addedSpace, addedSpace, addedSpace, addedSpace],
      note: "Decision flow: Add a program",
    };
    cloned.expenseRows = [
      ...(cloned.expenseRows || []),
      expRow,
    ] as FullModelData["expenseRows"];
  }

  return cloned;
}

// --- Inputs → WhatIfOverrides translators ------------------------------------

export function siteInputsToOverrides(data: FullModelData, inputs: SiteInputs): WhatIfOverrides {
  const ov: WhatIfOverrides = {};
  if (inputs.newMonthlyRent != null) ov.monthlyRent = Math.max(0, inputs.newMonthlyRent);
  if (inputs.newRentEscalation != null) ov.rentEscalation = inputs.newRentEscalation;
  if (inputs.startYear != null) ov.rentChangeStartYear = inputs.startYear;
  if (inputs.newSqft != null) {
    // Compute current sqft baseline from facilityPhases (max)
    const sp = data.schoolProfile as Record<string, unknown> | undefined;
    let baseSqft = 0;
    if (sp) {
      const phases = sp.facilityPhases as Array<Record<string, unknown>> | undefined;
      if (phases) {
        for (const p of phases) {
          const sq = (p.squareFootage as number | undefined) ?? 0;
          if (sq > baseSqft) baseSqft = sq;
        }
      }
    }
    if (baseSqft > 0) {
      ov.sqftDelta = inputs.newSqft - baseSqft;
    }
  }
  return ov;
}

export function enrollmentChangeInputsToOverrides(inputs: EnrollmentChangeInputs): WhatIfOverrides {
  const ov: WhatIfOverrides = {};
  if (inputs.enrollmentDelta.some((v) => v !== 0)) {
    ov.enrollmentDelta = [...inputs.enrollmentDelta] as [number, number, number, number, number];
  }
  if (inputs.retentionRate !== undefined) ov.retentionRate = inputs.retentionRate;
  if (inputs.tuitionDeltaPerStudent !== undefined && inputs.tuitionDeltaPerStudent !== 0) {
    ov.tuitionDeltaPerStudent = inputs.tuitionDeltaPerStudent;
  }
  return ov;
}

// --- One-time fit-out cost (site) -------------------------------------------

function applyOneTimeFitOut(data: FullModelData, fitOut: number): FullModelData {
  if (!fitOut || fitOut <= 0) return data;
  const cloned = deepClone(data);
  const expRow = {
    id: `__decision_site_fitout_${Date.now()}__`,
    category: "occupancy_facility",
    lineItem: "Site fit-out (one-time)",
    enabled: true,
    driverType: "annual_fixed" as const,
    amounts: [fitOut, 0, 0, 0, 0],
    note: "Decision flow: Evaluate a site",
  };
  cloned.expenseRows = [
    ...(cloned.expenseRows || []),
    expRow,
  ] as FullModelData["expenseRows"];
  return cloned;
}

// --- Apply any decision -----------------------------------------------------

export function applyDecisionToData(
  data: FullModelData,
  decision: DecisionInputs,
): FullModelData {
  switch (decision.type) {
    case "add_program":
      return applyAddProgramDecision(data, decision.inputs);
    case "evaluate_site": {
      const overrides = siteInputsToOverrides(data, decision.inputs);
      const withOverrides = applyWhatIfOverrides(data, overrides);
      return applyOneTimeFitOut(withOverrides, decision.inputs.oneTimeFitOut ?? 0);
    }
    case "change_enrollment": {
      const overrides = enrollmentChangeInputsToOverrides(decision.inputs);
      return applyWhatIfOverrides(data, overrides);
    }
  }
}

// --- Compute decision impact ------------------------------------------------

function genDecisionNudges(impact: DecisionImpact, decisionType: DecisionType): NudgeItem[] {
  const nudges: NudgeItem[] = [];
  const { adjusted, deltas } = impact;
  const yr5Net = adjusted.netIncome[4] ?? 0;
  const yr5Delta = deltas.netIncome[4] ?? 0;
  if (yr5Delta > 0) {
    nudges.push({
      signal: "green",
      label: "Year 5 net income rises",
      message: `Net income at Year 5 is ${yr5Delta >= 0 ? "+" : ""}$${Math.round(yr5Delta).toLocaleString()} vs. the base model.`,
    });
  } else if (yr5Delta < 0) {
    nudges.push({
      signal: "amber",
      label: "Year 5 net income declines",
      message: `Net income at Year 5 falls $${Math.abs(Math.round(yr5Delta)).toLocaleString()}. Make sure the strategic upside is worth it.`,
    });
  }
  if (yr5Net < 0) {
    nudges.push({
      signal: "red",
      label: "Year 5 net income is negative",
      message: `After this change, Year 5 ends at ($${Math.abs(Math.round(yr5Net)).toLocaleString()}). Consider tightening assumptions.`,
    });
  }
  if (deltas.cashRunwayDeltaMonths < -3) {
    nudges.push({
      signal: "amber",
      label: "Cash runway shrinks",
      message: `You'll lose about ${Math.abs(deltas.cashRunwayDeltaMonths).toFixed(1)} months of cash cushion.`,
    });
  }
  if (deltas.breakEvenYearShift !== null && deltas.breakEvenYearShift > 0) {
    nudges.push({
      signal: "amber",
      label: "Break-even pushes out",
      message: `Break-even moves out by ${deltas.breakEvenYearShift} year${deltas.breakEvenYearShift === 1 ? "" : "s"}.`,
    });
  } else if (deltas.breakEvenYearShift !== null && deltas.breakEvenYearShift < 0) {
    nudges.push({
      signal: "green",
      label: "Break-even arrives sooner",
      message: `Break-even pulls in by ${Math.abs(deltas.breakEvenYearShift)} year${Math.abs(deltas.breakEvenYearShift) === 1 ? "" : "s"}.`,
    });
  }
  if (decisionType === "add_program" && yr5Delta > 0 && deltas.cashRunwayDeltaMonths < 0) {
    nudges.push({
      signal: "amber",
      label: "Profitable, but watch year 1 cash",
      message: "The program improves Year 5 net income but draws down cash short term — plan ramp-up reserves.",
    });
  }
  if (nudges.length === 0) {
    nudges.push({
      signal: "green",
      label: "No major shifts",
      message: "This decision doesn't materially move your headline numbers.",
    });
  }
  return nudges;
}

export function computeDecisionImpact(
  data: FullModelData,
  decision: DecisionInputs,
): DecisionImpact {
  const base = computeBaseFinancials(data);
  const adjustedData = applyDecisionToData(data, decision);
  const adjusted = computeBaseFinancials(adjustedData);

  const revenueDelta: number[] = [];
  const netIncomeDelta: number[] = [];
  const netIncomePctDelta: number[] = [];
  const dscrDelta: number[] = [];
  for (let i = 0; i < 5; i++) {
    revenueDelta.push(adjusted.revenue[i] - base.revenue[i]);
    netIncomeDelta.push(adjusted.netIncome[i] - base.netIncome[i]);
    const baseAbs = Math.abs(base.netIncome[i]);
    netIncomePctDelta.push(baseAbs > 0 ? netIncomeDelta[i] / baseAbs : 0);
    dscrDelta.push(adjusted.dscr[i] - base.dscr[i]);
  }
  const breakEvenYearShift =
    base.breakEvenYear !== null && adjusted.breakEvenYear !== null
      ? adjusted.breakEvenYear - base.breakEvenYear
      : null;
  const cashRunwayDeltaMonths = adjusted.cashRunwayMonths - base.cashRunwayMonths;

  const partial: DecisionImpact = {
    base,
    adjusted,
    deltas: {
      revenue: revenueDelta,
      netIncome: netIncomeDelta,
      netIncomePct: netIncomePctDelta,
      dscr: dscrDelta,
      breakEvenYearShift,
      cashRunwayDeltaMonths,
    },
    nudges: [],
  };
  partial.nudges = genDecisionNudges(partial, decision.type);
  return partial;
}

// --- Persisted CustomScenario shape helpers ----------------------------------

export interface PersistedDecisionOverrides {
  // Mirrors customScenarioSchema.overrides shape so we keep one storage slot
  enrollmentDelta?: number[];
  retentionRate?: number;
  tuitionDeltaPerStudent?: number;
  monthlyRent?: number;
  rentEscalation?: number;
  rentChangeStartYear?: number;
  sqftDelta?: number;
  addProgramName?: string;
  addProgramTuition?: number;
  addProgramEnrollment?: number[];
  addProgramAddedFte?: number;
  addProgramAddedFteSalary?: number;
  addProgramAddedAnnualSpace?: number;
  siteFitOutCost?: number;
}

export function decisionToPersistedOverrides(
  data: FullModelData,
  decision: DecisionInputs,
): PersistedDecisionOverrides {
  switch (decision.type) {
    case "add_program": {
      const i = decision.inputs;
      return {
        addProgramName: i.name,
        addProgramTuition: i.annualTuition,
        addProgramEnrollment: [...i.enrollment],
        addProgramAddedFte: i.addedFte,
        addProgramAddedFteSalary: i.addedFteSalary,
        addProgramAddedAnnualSpace: i.addedAnnualSpace,
      };
    }
    case "evaluate_site": {
      const ov = siteInputsToOverrides(data, decision.inputs);
      return {
        ...ov,
        siteFitOutCost: decision.inputs.oneTimeFitOut ?? undefined,
      };
    }
    case "change_enrollment": {
      const ov = enrollmentChangeInputsToOverrides(decision.inputs);
      return ov;
    }
  }
}

export function buildDecisionBullets(persisted: PersistedDecisionOverrides, decisionType?: DecisionType): string[] {
  const bullets: string[] = [];
  if (decisionType === "add_program" || persisted.addProgramName) {
    if (persisted.addProgramName) bullets.push(`Program: ${persisted.addProgramName}`);
    if (persisted.addProgramTuition) bullets.push(`Tuition $${persisted.addProgramTuition.toLocaleString()}/yr`);
    if (persisted.addProgramEnrollment) {
      const total = persisted.addProgramEnrollment.reduce((a, b) => a + b, 0);
      bullets.push(`Adds ${total} cumulative students (5 yrs)`);
    }
    if (persisted.addProgramAddedFte) bullets.push(`+${persisted.addProgramAddedFte} FTE`);
    return bullets;
  }
  if (persisted.enrollmentDelta && persisted.enrollmentDelta.some((v) => v !== 0)) {
    const sum = persisted.enrollmentDelta.reduce((a, b) => a + b, 0);
    bullets.push(`Enrollment ${sum > 0 ? "+" : ""}${sum} cumulative`);
  }
  if (persisted.retentionRate !== undefined) bullets.push(`Retention ${persisted.retentionRate}%`);
  if (persisted.tuitionDeltaPerStudent !== undefined && persisted.tuitionDeltaPerStudent !== 0) {
    bullets.push(`Tuition ${persisted.tuitionDeltaPerStudent > 0 ? "+" : ""}$${persisted.tuitionDeltaPerStudent}/student`);
  }
  if (persisted.monthlyRent !== undefined) bullets.push(`Rent $${persisted.monthlyRent.toLocaleString()}/mo`);
  if (persisted.rentEscalation !== undefined) bullets.push(`Rent escalation ${persisted.rentEscalation}%`);
  if (persisted.sqftDelta !== undefined && persisted.sqftDelta !== 0) {
    bullets.push(`Sqft ${persisted.sqftDelta > 0 ? "+" : ""}${persisted.sqftDelta}`);
  }
  if (persisted.siteFitOutCost) {
    bullets.push(`Fit-out $${persisted.siteFitOutCost.toLocaleString()} (Y1)`);
  }
  return bullets;
}

// --- Empty-state helpers used by UIs ----------------------------------------

export function buildBlankAddProgramInputs(): AddProgramInputs {
  return {
    name: "",
    annualTuition: 0,
    enrollment: [...Z5] as [number, number, number, number, number],
    addedFte: 0,
    addedFteSalary: 0,
    addedAnnualSpace: 0,
  };
}

export function buildBlankEnrollmentChangeInputs(): EnrollmentChangeInputs {
  return {
    enrollmentDelta: [...Z5] as [number, number, number, number, number],
  };
}

export function buildBlankSiteInputs(data: FullModelData): SiteInputs {
  // Default starting rent suggestion based on detected facility rent
  const detected = detectFacilityRent(data);
  const seedRent = detected.monthlyRent ?? 0;
  return {
    newMonthlyRent: seedRent,
    newRentEscalation: 3,
    startYear: 1,
    oneTimeFitOut: 0,
  };
}
