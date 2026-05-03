// Task #455 — fragility detection for state-funding programs.
//
// Lenders and boards need to know when a 5-year forecast leans on a
// school-choice program whose legal status is unsettled. The wizard surfaces
// these programs through `state-funding-data.ts`, but until now no
// downstream consumer (assumption-flag rules, packet PDFs, the wizard's
// own RevenueStep) shared a single helper to read those statuses back off
// the founder's revenue rows.
//
// This module is that helper. It pairs the wizard's revenue-row IDs with
// their underlying `SchoolChoiceProgramType`, then walks the state's
// program list and reports every match whose status is `pending`,
// `litigated`, or `blocked`. Callers decide what tone to render — the
// assumption-flag detector emits `litigated_funding` (warning) and
// `pending_funding` (info); the lender + board PDFs append a footnote on
// the Revenue Model section; the wizard renders an inline chip next to
// the affected row.
import {
  STATE_FUNDING_MAP,
  type ProgramInfo,
  type ProgramStatus,
  type SchoolChoiceProgramType,
  type SchoolType,
  type StateFundingEntry,
} from "./state-funding-data.js";

/**
 * Wizard revenue-row ID → underlying school-choice program type. Mirrors the
 * `PROGRAM_TYPE_TO_ROW_ID` constant in
 * `artifacts/school-financial-model/src/pages/model-wizard/steps/RevenueStep.tsx`.
 * Kept in sync via the contract test in `__tests__/state-funding-fragility.test.ts`.
 */
export const ROW_ID_TO_PROGRAM_TYPE: Record<string, SchoolChoiceProgramType> = {
  esa_revenue: "esa",
  voucher_revenue: "voucher",
  scholarship_org: "tax_credit_scholarship",
  refundable_tax_credit: "refundable_tax_credit",
  individual_tax_credit: "individual_tax_credit",
  federal_tax_credit_sgo: "federal_tax_credit_sgo",
  correspondence_charter: "correspondence_charter",
  private_scholarship_revenue: "private_scholarship",
};

/** Inverse of {@link ROW_ID_TO_PROGRAM_TYPE} — same shape RevenueStep keeps locally. */
export const PROGRAM_TYPE_TO_ROW_ID: Record<SchoolChoiceProgramType, string> = {
  esa: "esa_revenue",
  voucher: "voucher_revenue",
  tax_credit_scholarship: "scholarship_org",
  refundable_tax_credit: "refundable_tax_credit",
  individual_tax_credit: "individual_tax_credit",
  federal_tax_credit_sgo: "federal_tax_credit_sgo",
  correspondence_charter: "correspondence_charter",
  private_scholarship: "private_scholarship_revenue",
};

/** A single matched revenue row whose program is non-active. */
export interface FragileProgramMatch {
  rowId: string;
  rowLineItem: string;
  programType: SchoolChoiceProgramType;
  programLabel: string;
  status: Exclude<ProgramStatus, "active">;
  notes?: string;
  /** State (uppercased) the program belongs to. */
  stateCode: string;
  /**
   * Inclusive forecast year range for which this row contributes a non-zero
   * amount. Computed only when the caller supplies both `openingYear` and
   * the row's `amounts` array; otherwise omitted. We use this in lender +
   * board prompts so the founder/lender knows *how many years* of the
   * forecast actually depend on the fragile dollars.
   */
  yearRange?: { firstYear: number; lastYear: number };
}

/** Bundled result, partitioned by status so callers can render distinct tones. */
export interface FragileFundingReport {
  litigated: FragileProgramMatch[];
  pending: FragileProgramMatch[];
  blocked: FragileProgramMatch[];
  /** Convenience union — all matches in one ordered list. */
  all: FragileProgramMatch[];
}

interface FragileInputRow {
  id: string;
  category?: string;
  lineItem?: string;
  enabled?: boolean;
  /** Per-year revenue amounts; used to compute `yearRange` when present. */
  amounts?: number[];
}

function computeYearRange(
  amounts: number[] | undefined,
  openingYear: number | undefined,
): { firstYear: number; lastYear: number } | undefined {
  if (!amounts || amounts.length === 0 || !openingYear) return undefined;
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < amounts.length; i++) {
    const v = Number(amounts[i] ?? 0);
    if (v > 0) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    }
  }
  if (firstIdx < 0) return undefined;
  return { firstYear: openingYear + firstIdx, lastYear: openingYear + lastIdx };
}

function emptyReport(): FragileFundingReport {
  return { litigated: [], pending: [], blocked: [], all: [] };
}

function findProgram(
  entry: StateFundingEntry,
  programType: SchoolChoiceProgramType,
): ProgramInfo | undefined {
  return entry.programs.find((p) => p.type === programType);
}

/**
 * Walk the founder's revenue rows and report every school-choice row whose
 * underlying state program has a non-active status.
 *
 * Rows whose `enabled` flag is explicitly `false` are skipped — a disabled
 * row contributes $0 to the forecast and shouldn't trigger a "your forecast
 * depends on a litigated program" warning.
 */
export function detectFragileFunding(
  rows: readonly FragileInputRow[] | undefined | null,
  stateCode: string | undefined | null,
  schoolType?: SchoolType,
  openingYear?: number,
): FragileFundingReport {
  if (!rows || rows.length === 0 || !stateCode) return emptyReport();
  const normalizedState = stateCode.toUpperCase();
  const entry = STATE_FUNDING_MAP[normalizedState];
  if (!entry) return emptyReport();

  // Charter schools never receive school-choice funding in the wizard, so
  // even if a stale row is hanging around (e.g. from a school-type switch),
  // it isn't part of their forecast and shouldn't generate a flag.
  if (schoolType === "charter_school") return emptyReport();

  const report = emptyReport();
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row || row.enabled === false) continue;
    const programType = ROW_ID_TO_PROGRAM_TYPE[row.id];
    if (!programType) continue;
    if (seen.has(row.id)) continue;
    const program = findProgram(entry, programType);
    if (!program) continue;
    if (program.status === "active") continue;
    seen.add(row.id);

    const match: FragileProgramMatch = {
      rowId: row.id,
      rowLineItem: row.lineItem || program.label,
      programType,
      programLabel: program.label,
      status: program.status,
      notes: program.notes,
      stateCode: normalizedState,
      yearRange: computeYearRange(row.amounts, openingYear),
    };
    report.all.push(match);
    if (program.status === "litigated") report.litigated.push(match);
    else if (program.status === "pending") report.pending.push(match);
    else if (program.status === "blocked") report.blocked.push(match);
  }

  return report;
}
