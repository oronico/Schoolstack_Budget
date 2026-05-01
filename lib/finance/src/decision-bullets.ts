// Shared decision-history bullet logic and label maps.
//
// The planner (frontend) and the lender/board packet builders (api-server)
// both need to render the same one-liner summary of a saved decision
// scenario's overrides. Keeping the implementation here ensures the two
// surfaces never silently disagree about what the same scenario means.

export type DecisionType = "add_program" | "evaluate_site" | "change_enrollment";

export type DecisionOutcomeStatus = "pursued" | "declined" | "on_hold";

export const DECISION_LABELS: Record<DecisionType, string> = {
  add_program: "Add a program",
  evaluate_site: "Evaluate a site",
  change_enrollment: "Change enrollment",
};

export const OUTCOME_LABELS: Record<DecisionOutcomeStatus, string> = {
  pursued: "Pursued",
  declined: "Declined",
  on_hold: "On hold",
};

export interface PersistedDecisionOverrides {
  // Mirrors customScenarioSchema.overrides shape. Kept here so both the
  // planner UI and the api-server packet builders can consume one type.
  enrollmentDelta?: number[];
  retentionRate?: number;
  tuitionDeltaPerStudent?: number;
  monthlyRent?: number;
  rentEscalation?: number;
  rentChangeStartYear?: number;
  sqftDelta?: number;
  addProgramName?: string;
  addProgramGradeBand?: string;
  addProgramTuition?: number;
  addProgramEnrollment?: number[];
  addProgramAddedFte?: number;
  addProgramAddedFteSalary?: number;
  addProgramAddedAnnualSpace?: number;
  addProgramStaffingTbd?: boolean;
  siteFitOutCost?: number;
}

export function isDecisionType(v: unknown): v is DecisionType {
  return v === "add_program" || v === "evaluate_site" || v === "change_enrollment";
}

export function isDecisionOutcomeStatus(v: unknown): v is DecisionOutcomeStatus {
  return v === "pursued" || v === "declined" || v === "on_hold";
}

// Coerce a loosely-typed `overrides` blob (e.g. parsed JSON from storage) into
// the strict `PersistedDecisionOverrides` shape. Unknown fields are dropped;
// non-finite numbers and non-strings are ignored. This keeps the bullet
// generator's input contract narrow without forcing each caller to repeat the
// same defensive coercion logic.
export function coercePersistedDecisionOverrides(
  raw: Record<string, unknown> | null | undefined,
): PersistedDecisionOverrides {
  if (!raw || typeof raw !== "object") return {};

  const out: PersistedDecisionOverrides = {};

  const numberOf = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const stringOf = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v : undefined;
  const numberArrayOf = (v: unknown): number[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    return v.map((n) => (typeof n === "number" && Number.isFinite(n) ? n : 0));
  };

  const enrollmentDelta = numberArrayOf(raw.enrollmentDelta);
  if (enrollmentDelta) out.enrollmentDelta = enrollmentDelta;

  const retentionRate = numberOf(raw.retentionRate);
  if (retentionRate !== undefined) out.retentionRate = retentionRate;

  const tuitionDeltaPerStudent = numberOf(raw.tuitionDeltaPerStudent);
  if (tuitionDeltaPerStudent !== undefined) out.tuitionDeltaPerStudent = tuitionDeltaPerStudent;

  const monthlyRent = numberOf(raw.monthlyRent);
  if (monthlyRent !== undefined) out.monthlyRent = monthlyRent;

  const rentEscalation = numberOf(raw.rentEscalation);
  if (rentEscalation !== undefined) out.rentEscalation = rentEscalation;

  const rentChangeStartYear = numberOf(raw.rentChangeStartYear);
  if (rentChangeStartYear !== undefined) out.rentChangeStartYear = rentChangeStartYear;

  const sqftDelta = numberOf(raw.sqftDelta);
  if (sqftDelta !== undefined) out.sqftDelta = sqftDelta;

  const addProgramName = stringOf(raw.addProgramName);
  if (addProgramName) out.addProgramName = addProgramName;

  const addProgramGradeBand = stringOf(raw.addProgramGradeBand);
  if (addProgramGradeBand) out.addProgramGradeBand = addProgramGradeBand;

  const addProgramTuition = numberOf(raw.addProgramTuition);
  if (addProgramTuition !== undefined) out.addProgramTuition = addProgramTuition;

  const addProgramEnrollment = numberArrayOf(raw.addProgramEnrollment);
  if (addProgramEnrollment) out.addProgramEnrollment = addProgramEnrollment;

  const addProgramAddedFte = numberOf(raw.addProgramAddedFte);
  if (addProgramAddedFte !== undefined) out.addProgramAddedFte = addProgramAddedFte;

  const addProgramAddedFteSalary = numberOf(raw.addProgramAddedFteSalary);
  if (addProgramAddedFteSalary !== undefined) out.addProgramAddedFteSalary = addProgramAddedFteSalary;

  const addProgramAddedAnnualSpace = numberOf(raw.addProgramAddedAnnualSpace);
  if (addProgramAddedAnnualSpace !== undefined) out.addProgramAddedAnnualSpace = addProgramAddedAnnualSpace;

  if (raw.addProgramStaffingTbd === true) out.addProgramStaffingTbd = true;

  const siteFitOutCost = numberOf(raw.siteFitOutCost);
  if (siteFitOutCost !== undefined) out.siteFitOutCost = siteFitOutCost;

  return out;
}

// Render a saved scenario's overrides as a list of human-readable bullets.
// Behaviour and copy must stay identical across the planner UI and the
// generated lender/board packets — the existing decision-history tests pin
// the exact strings, so any change here is shared by both surfaces.
export function buildDecisionBullets(
  persisted: PersistedDecisionOverrides,
  decisionType?: DecisionType,
): string[] {
  const bullets: string[] = [];

  if (decisionType === "add_program" || persisted.addProgramName) {
    if (persisted.addProgramName) {
      const band = persisted.addProgramGradeBand ? ` (${persisted.addProgramGradeBand})` : "";
      bullets.push(`Program: ${persisted.addProgramName}${band}`);
    }
    if (persisted.addProgramTuition) {
      bullets.push(`Tuition $${persisted.addProgramTuition.toLocaleString()}/yr`);
    }
    if (persisted.addProgramEnrollment) {
      const total = persisted.addProgramEnrollment.reduce((a, b) => a + b, 0);
      bullets.push(`Adds ${total} cumulative students (5 yrs)`);
    }
    if (persisted.addProgramAddedFte) {
      bullets.push(`+${persisted.addProgramAddedFte} FTE`);
    }
    if (persisted.addProgramStaffingTbd) bullets.push("Staffing: TBD");
    return bullets;
  }

  if (persisted.enrollmentDelta && persisted.enrollmentDelta.some((v) => v !== 0)) {
    const sum = persisted.enrollmentDelta.reduce((a, b) => a + b, 0);
    bullets.push(`Enrollment ${sum > 0 ? "+" : ""}${sum} cumulative`);
  }
  if (persisted.retentionRate !== undefined) {
    bullets.push(`Retention ${persisted.retentionRate}%`);
  }
  if (persisted.tuitionDeltaPerStudent !== undefined && persisted.tuitionDeltaPerStudent !== 0) {
    // Place the sign *outside* the "$" so a negative delta reads as
    // "Tuition -$250/student" instead of the typo-looking "Tuition $-250/student".
    // Symmetric with the positive case ("Tuition +$500/student").
    const delta = persisted.tuitionDeltaPerStudent;
    const sign = delta > 0 ? "+" : "-";
    bullets.push(`Tuition ${sign}$${Math.abs(delta)}/student`);
  }
  if (persisted.monthlyRent !== undefined) {
    bullets.push(`Rent $${persisted.monthlyRent.toLocaleString()}/mo`);
  }
  if (persisted.rentEscalation !== undefined) {
    bullets.push(`Rent escalation ${persisted.rentEscalation}%`);
  }
  if (persisted.sqftDelta !== undefined && persisted.sqftDelta !== 0) {
    bullets.push(`Sqft ${persisted.sqftDelta > 0 ? "+" : ""}${persisted.sqftDelta}`);
  }
  if (persisted.siteFitOutCost) {
    bullets.push(`Fit-out $${persisted.siteFitOutCost.toLocaleString()} (Y1)`);
  }
  return bullets;
}
