import type { FullModelData, DecisionType } from "./model-shape.js";
import {
  DECISION_LABELS as SHARED_DECISION_LABELS,
  buildDecisionBullets as sharedBuildDecisionBullets,
  type PersistedDecisionOverrides as SharedPersistedDecisionOverrides,
} from "../decision-bullets.js";
import { computeBaseFinancials, type ScenarioMetrics, type NudgeItem } from "./scenario-engine.js";
import {
  applyWhatIfOverrides,
  detectFacilityRent,
  type WhatIfOverrides,
} from "./whatif-engine.js";

// Re-export the shared persisted-decision overrides type so existing
// `@/lib/decision-flows` consumers keep importing it from the same module.
export type PersistedDecisionOverrides = SharedPersistedDecisionOverrides;

// --- Decision input shapes ----------------------------------------------------

export interface AddProgramInputs {
  name: string;
  gradeBand?: string;
  annualTuition: number;
  enrollment: [number, number, number, number, number];
  addedFte?: number;
  addedFteSalary?: number;
  addedAnnualSpace?: number;
  staffingTbd?: boolean;
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

export const DECISION_LABELS = SHARED_DECISION_LABELS;

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
  //    Skipped when the founder marked staffing as "to be determined" — the
  //    impact step will surface a nudge so they remember to come back.
  const addedFte = inputs.staffingTbd ? 0 : Math.max(0, inputs.addedFte ?? 0);
  const addedSalary = inputs.staffingTbd ? 0 : Math.max(0, inputs.addedFteSalary ?? 0);
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

function genDecisionNudges(
  impact: DecisionImpact,
  decisionType: DecisionType,
  data: FullModelData,
  decisionInputs: DecisionInputs,
): NudgeItem[] {
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
  if (decisionType === "add_program") {
    if (yr5Delta > 0 && deltas.cashRunwayDeltaMonths < 0) {
      nudges.push({
        signal: "amber",
        label: "Profitable, but watch year 1 cash",
        message: "The program improves Year 5 net income but draws down cash short term — plan ramp-up reserves.",
      });
    }
    if (decisionInputs.type === "add_program" && decisionInputs.inputs.staffingTbd) {
      nudges.push({
        signal: "amber",
        label: "Staffing not yet modeled",
        message: "You marked staffing as TBD. The numbers above don't include any new salaries or benefits yet — make sure you revisit this before sharing with a lender.",
      });
    }
  }

  if (decisionType === "evaluate_site") {
    // Lender-focused DSCR thresholds (charter lenders typically want 1.25x+,
    // some healthcare/SBA lenders accept 1.20x). Highlight the worst year.
    let worstDscr = Infinity;
    let worstYear = 0;
    for (let i = 0; i < adjusted.dscr.length; i++) {
      if (isFinite(adjusted.dscr[i]) && adjusted.dscr[i] < worstDscr) {
        worstDscr = adjusted.dscr[i];
        worstYear = i + 1;
      }
    }
    if (isFinite(worstDscr)) {
      if (worstDscr < 1.0) {
        nudges.push({
          signal: "red",
          label: `DSCR falls below 1.00× in Year ${worstYear}`,
          message: `At ${worstDscr.toFixed(2)}×, lenders see this as cash flow that can't service debt. Most won't underwrite a school lease at this level.`,
        });
      } else if (worstDscr < 1.20) {
        nudges.push({
          signal: "red",
          label: `DSCR is ${worstDscr.toFixed(2)}× in Year ${worstYear} — below most lender thresholds`,
          message: "Charter and school lenders typically require 1.20–1.25× minimum DSCR. Plan to negotiate the lease, raise tuition, or grow enrollment before signing.",
        });
      } else if (worstDscr < 1.25) {
        nudges.push({
          signal: "amber",
          label: `DSCR is ${worstDscr.toFixed(2)}× in Year ${worstYear} — borderline for school lenders`,
          message: "Most school lenders look for 1.25× or better. You're close — a small operating cushion (extra enrollment, tighter expenses) would put this firmly in approval range.",
        });
      } else {
        // Compare worst adjusted year against the same base year (and any year
        // where adjusted DSCR meaningfully drops vs base) so we don't miss
        // weakening that's localized to mid-plan years.
        let largestDrop = 0;
        let dropYear = 0;
        for (let i = 0; i < adjusted.dscr.length; i++) {
          const baseY = impact.base.dscr[i];
          const adjY = adjusted.dscr[i];
          if (!isFinite(baseY) || !isFinite(adjY)) continue;
          const drop = baseY - adjY;
          if (drop > largestDrop) {
            largestDrop = drop;
            dropYear = i + 1;
          }
        }
        if (largestDrop >= 0.05) {
          nudges.push({
            signal: "amber",
            label: `Site weakens DSCR by ${largestDrop.toFixed(2)}× in Year ${dropYear}`,
            message: "Coverage holds above lender thresholds, but be ready to explain the trade-off (capacity, location) when a lender asks why coverage thinned out.",
          });
        }
      }
    }
    // Cash runway under 6 months at any point is a lender red flag.
    if (adjusted.cashRunwayMonths < 6) {
      nudges.push({
        signal: "red",
        label: "Cash runway under 6 months",
        message: `Adjusted runway is ${adjusted.cashRunwayMonths.toFixed(1)} months. Most lenders want to see at least 60–90 days of operating cash on hand at all times.`,
      });
    }
  }

  if (decisionType === "change_enrollment" && decisionInputs.type === "change_enrollment") {
    // Staffing-implications nudge: if enrollment shifted but no compensating
    // staffing change is in the model, flag it so the founder revisits FTE.
    const en = data.enrollment;
    const baseTotal = (en?.year1 ?? 0) + (en?.year2 ?? 0) + (en?.year3 ?? 0) + (en?.year4 ?? 0) + (en?.year5 ?? 0);
    const deltaTotal = decisionInputs.inputs.enrollmentDelta.reduce((a, b) => a + b, 0);
    const baselineFte = (data.staffingRows ?? []).reduce((acc, r) => acc + (r.fte ?? 0), 0);
    const adjustedFte = baselineFte; // enrollment-change flow doesn't touch staffing
    const studentsPerFte = adjustedFte > 0 ? Math.round((((en?.year5 ?? 0) + (decisionInputs.inputs.enrollmentDelta[4] ?? 0))) / adjustedFte) : 0;
    if (baseTotal > 0 && Math.abs(deltaTotal) >= Math.max(20, baseTotal * 0.1)) {
      const direction = deltaTotal > 0 ? "more" : "fewer";
      nudges.push({
        signal: "amber",
        label: "Enrollment shift may strain your staffing plan",
        message:
          deltaTotal > 0
            ? `You're modeling ${Math.abs(deltaTotal)} ${direction} students cumulatively but didn't add any FTE. ${
                studentsPerFte > 0 ? `That pushes you to ~${studentsPerFte} students per FTE in Year 5 — ` : ""
              }revisit your staffing plan before sharing this scenario.`
            : `You're modeling ${Math.abs(deltaTotal)} ${direction} students cumulatively but didn't reduce FTE. Salaries and benefits will run higher per student than your base — consider whether staffing should also adjust.`,
      });
    }
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
  partial.nudges = genDecisionNudges(partial, decision.type, data, decision);
  return partial;
}

// --- Persisted CustomScenario shape helpers ----------------------------------
// (PersistedDecisionOverrides is defined once in @workspace/finance and
// re-exported at the top of this file.)

export function decisionToPersistedOverrides(
  data: FullModelData,
  decision: DecisionInputs,
): PersistedDecisionOverrides {
  switch (decision.type) {
    case "add_program": {
      const i = decision.inputs;
      return {
        addProgramName: i.name,
        addProgramGradeBand: i.gradeBand,
        addProgramTuition: i.annualTuition,
        addProgramEnrollment: [...i.enrollment],
        addProgramAddedFte: i.staffingTbd ? undefined : i.addedFte,
        addProgramAddedFteSalary: i.staffingTbd ? undefined : i.addedFteSalary,
        addProgramAddedAnnualSpace: i.addedAnnualSpace,
        addProgramStaffingTbd: i.staffingTbd ? true : undefined,
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

// Apply a *persisted* decision-flow scenario back into the founder's base model.
// This is the bridge that turns a saved projection into reality: once the founder
// marks a scenario "Pursued", folding it into the base model means future decision
// flows compare against current reality instead of stale assumptions.
//
// We dispatch on `decisionType` so each flow folds in the way that matches how it
// was modeled originally (add_program inserts explicit rows, evaluate_site rewrites
// the rent + fit-out, change_enrollment shifts enrollment counts and tuition).
// When `decisionType` is missing (older saved entries from the Live What-If
// drawer), we fall back to applying the raw overrides via the what-if engine —
// safe because that engine ignores keys it doesn't recognize.
export function applyPersistedScenarioToData(
  data: FullModelData,
  persisted: PersistedDecisionOverrides,
  decisionType?: DecisionType,
): FullModelData {
  if (decisionType === "add_program") {
    const enrollment = (persisted.addProgramEnrollment ?? []).slice(0, 5);
    while (enrollment.length < 5) enrollment.push(0);
    return applyAddProgramDecision(data, {
      name: persisted.addProgramName ?? "Program",
      gradeBand: persisted.addProgramGradeBand,
      annualTuition: persisted.addProgramTuition ?? 0,
      enrollment: [enrollment[0], enrollment[1], enrollment[2], enrollment[3], enrollment[4]],
      addedFte: persisted.addProgramAddedFte,
      addedFteSalary: persisted.addProgramAddedFteSalary,
      addedAnnualSpace: persisted.addProgramAddedAnnualSpace,
      staffingTbd: persisted.addProgramStaffingTbd,
    });
  }

  // For site + enrollment flows (and untyped legacy entries) we lean on the
  // what-if engine, then layer any one-time fit-out cost on top.
  const overrides: WhatIfOverrides = {};
  if (persisted.enrollmentDelta && persisted.enrollmentDelta.length === 5) {
    overrides.enrollmentDelta = [...persisted.enrollmentDelta] as [number, number, number, number, number];
  }
  if (persisted.retentionRate !== undefined) overrides.retentionRate = persisted.retentionRate;
  if (persisted.tuitionDeltaPerStudent !== undefined) overrides.tuitionDeltaPerStudent = persisted.tuitionDeltaPerStudent;
  if (persisted.monthlyRent !== undefined) overrides.monthlyRent = persisted.monthlyRent;
  if (persisted.rentEscalation !== undefined) overrides.rentEscalation = persisted.rentEscalation;
  if (persisted.rentChangeStartYear !== undefined) overrides.rentChangeStartYear = persisted.rentChangeStartYear;
  if (persisted.sqftDelta !== undefined) overrides.sqftDelta = persisted.sqftDelta;

  const withOverrides = applyWhatIfOverrides(data, overrides);
  if (decisionType === "evaluate_site" && persisted.siteFitOutCost) {
    return applyOneTimeFitOut(withOverrides, persisted.siteFitOutCost);
  }
  return withOverrides;
}

// --- Actuals snapshot helpers ------------------------------------------------

// What we project for a saved scenario at a given model year. Used to populate
// the projected column in the actuals editor so the founder can compare their
// realized numbers against the modeled prediction. Decision-specific fields
// (monthlyRent for sites, programEnrollment for add-program) are filled in only
// when relevant — the UI hides them otherwise.
export interface ProjectedSnapshot {
  asOfYear: number;
  enrollment: number;
  revenue: number;
  expense: number;
  netIncome: number;
  monthlyRent?: number;
  programEnrollment?: number;
}

// Reuses applyPersistedScenarioToData + computeBaseFinancials so the projection
// always matches what the rest of the app shows for the saved scenario. Falls
// back to year 1 if the caller doesn't pin an asOfYear yet.
export function computeProjectedSnapshot(
  data: FullModelData,
  persisted: PersistedDecisionOverrides,
  decisionType: DecisionType | undefined,
  asOfYear: number = 1,
): ProjectedSnapshot {
  const yr = Math.max(1, Math.min(5, Math.round(asOfYear || 1)));
  const idx = yr - 1;
  const adjustedData = applyPersistedScenarioToData(data, persisted, decisionType);
  const metrics = computeBaseFinancials(adjustedData);
  const snap: ProjectedSnapshot = {
    asOfYear: yr,
    enrollment: Math.round(metrics.enrollment[idx] ?? 0),
    revenue: Math.round(metrics.revenue[idx] ?? 0),
    expense: Math.round(metrics.totalExpenses[idx] ?? 0),
    netIncome: Math.round(metrics.netIncome[idx] ?? 0),
  };
  if (decisionType === "evaluate_site" && persisted.monthlyRent !== undefined) {
    snap.monthlyRent = Math.round(persisted.monthlyRent);
  }
  if (decisionType === "add_program" && persisted.addProgramEnrollment) {
    snap.programEnrollment = Math.round(persisted.addProgramEnrollment[idx] ?? 0);
  }
  return snap;
}

// Bullet rendering lives in @workspace/finance so the planner UI and the
// api-server packet builders stay in lockstep on a single implementation.
export function buildDecisionBullets(
  persisted: PersistedDecisionOverrides,
  decisionType?: DecisionType,
): string[] {
  return sharedBuildDecisionBullets(persisted, decisionType);
}

// --- Replay a persisted custom scenario ---------------------------------------
//
// Saved decision scenarios live as `customScenarios` entries with a stored
// `PersistedDecisionOverrides` payload + a `decisionType`. To compare two saved
// decisions side-by-side we need to recompute their impact against the *current*
// base model. Reconstructing a clean `DecisionInputs` is lossy for the
// "evaluate_site" branch (it stores `sqftDelta`, not the original `newSqft`),
// so we apply the overrides directly here and only synthesise inputs for the
// downstream nudge generator.

function applyPersistedDecisionToData(
  data: FullModelData,
  decisionType: DecisionType,
  persisted: PersistedDecisionOverrides,
): FullModelData {
  switch (decisionType) {
    case "add_program": {
      const en = persisted.addProgramEnrollment ?? [0, 0, 0, 0, 0];
      return applyAddProgramDecision(data, {
        name: persisted.addProgramName ?? "Program",
        gradeBand: persisted.addProgramGradeBand,
        annualTuition: persisted.addProgramTuition ?? 0,
        enrollment: [
          en[0] ?? 0, en[1] ?? 0, en[2] ?? 0, en[3] ?? 0, en[4] ?? 0,
        ] as [number, number, number, number, number],
        addedFte: persisted.addProgramAddedFte,
        addedFteSalary: persisted.addProgramAddedFteSalary,
        addedAnnualSpace: persisted.addProgramAddedAnnualSpace,
        staffingTbd: persisted.addProgramStaffingTbd ?? false,
      });
    }
    case "evaluate_site": {
      const overrides: WhatIfOverrides = {
        monthlyRent: persisted.monthlyRent,
        rentEscalation: persisted.rentEscalation,
        rentChangeStartYear: persisted.rentChangeStartYear,
        sqftDelta: persisted.sqftDelta,
      };
      const withOverrides = applyWhatIfOverrides(data, overrides);
      return applyOneTimeFitOut(withOverrides, persisted.siteFitOutCost ?? 0);
    }
    case "change_enrollment": {
      const en = persisted.enrollmentDelta;
      const overrides: WhatIfOverrides = {
        enrollmentDelta:
          en && en.length === 5
            ? ([en[0], en[1], en[2], en[3], en[4]] as [number, number, number, number, number])
            : undefined,
        retentionRate: persisted.retentionRate,
        tuitionDeltaPerStudent: persisted.tuitionDeltaPerStudent,
      };
      return applyWhatIfOverrides(data, overrides);
    }
  }
}

function persistedToSyntheticInputs(
  decisionType: DecisionType,
  persisted: PersistedDecisionOverrides,
): DecisionInputs {
  switch (decisionType) {
    case "add_program": {
      const en = persisted.addProgramEnrollment ?? [0, 0, 0, 0, 0];
      return {
        type: "add_program",
        inputs: {
          name: persisted.addProgramName ?? "Program",
          gradeBand: persisted.addProgramGradeBand,
          annualTuition: persisted.addProgramTuition ?? 0,
          enrollment: [
            en[0] ?? 0, en[1] ?? 0, en[2] ?? 0, en[3] ?? 0, en[4] ?? 0,
          ] as [number, number, number, number, number],
          addedFte: persisted.addProgramAddedFte,
          addedFteSalary: persisted.addProgramAddedFteSalary,
          addedAnnualSpace: persisted.addProgramAddedAnnualSpace,
          staffingTbd: persisted.addProgramStaffingTbd ?? false,
        },
      };
    }
    case "evaluate_site":
      return {
        type: "evaluate_site",
        inputs: {
          newMonthlyRent: persisted.monthlyRent ?? 0,
          newRentEscalation: persisted.rentEscalation,
          startYear: persisted.rentChangeStartYear,
          oneTimeFitOut: persisted.siteFitOutCost,
        },
      };
    case "change_enrollment": {
      const en = persisted.enrollmentDelta ?? [0, 0, 0, 0, 0];
      return {
        type: "change_enrollment",
        inputs: {
          enrollmentDelta: [
            en[0] ?? 0, en[1] ?? 0, en[2] ?? 0, en[3] ?? 0, en[4] ?? 0,
          ] as [number, number, number, number, number],
          retentionRate: persisted.retentionRate,
          tuitionDeltaPerStudent: persisted.tuitionDeltaPerStudent,
        },
      };
    }
  }
}

export function computeDecisionImpactFromPersisted(
  data: FullModelData,
  decisionType: DecisionType,
  persisted: PersistedDecisionOverrides,
): DecisionImpact {
  const base = computeBaseFinancials(data);
  const adjustedData = applyPersistedDecisionToData(data, decisionType, persisted);
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

  const synthetic = persistedToSyntheticInputs(decisionType, persisted);
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
  partial.nudges = genDecisionNudges(partial, decisionType, data, synthetic);
  return partial;
}

// --- Empty-state helpers used by UIs ----------------------------------------

export function buildBlankAddProgramInputs(): AddProgramInputs {
  return {
    name: "",
    gradeBand: "",
    annualTuition: 0,
    enrollment: [...Z5] as [number, number, number, number, number],
    addedFte: 0,
    addedFteSalary: 0,
    addedAnnualSpace: 0,
    staffingTbd: false,
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
