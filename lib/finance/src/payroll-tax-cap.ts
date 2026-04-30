/**
 * Shared wage-base cap savings helpers (Tasks #319 / #322).
 *
 * The wizard, the saved-scenario summary cards, and the lender / board PDF
 * packets all need to surface the same wage-base cap savings insight in the
 * same persona-aware copy. This module is the single source of truth for the
 * math and the copy variants so the three surfaces never drift.
 *
 * Wage-base context: each statutory payroll tax (FICA, FUTA, state SUI,
 * employer-paid leave funds, etc.) is owed only on wages up to a per-employee
 * annual cap (the "wage base"). A flat blended rate ignores those caps and
 * over-states the tax owed on higher salaries. `computePayrollTaxCapSavings`
 * captures the dollar gap between the flat estimate and the wage-base-aware
 * truth so the founder sees how much smarter math saves them.
 *
 * The data table (state-specific components, federal wage bases) lives in
 * `artifacts/school-financial-model/src/lib/state-payroll-tax-data.ts`. This
 * module is intentionally data-free so the api-server (which builds packets
 * from a normalized roster) can reuse the math without dragging in the data
 * table.
 */

export interface PayrollTaxComponent {
  /** Display label, e.g. "Social Security (FICA)" or "WA SUI". */
  label?: string;
  /** Component rate as a percent (e.g. 6.2 for FICA's 6.2%). */
  rate: number;
  /** Per-employee annual wage cap; undefined = applies to all wages (no cap). */
  wageBase?: number;
}

export interface CappedComponent {
  label: string;
  wageBase: number;
}

export interface PayrollTaxCapInsight {
  /** Components whose wage base the salary exceeds (i.e. would otherwise overcharge). */
  cappedComponents: CappedComponent[];
  /** Sum of every component's nominal rate (percent). */
  flatRate: number;
  /** What the founder would pay under the naive flat × salary estimate. */
  flatTax: number;
  /** What the wage-base-aware engine actually charges. */
  cappedTax: number;
  /** Dollars per year the wage-base caps save vs. the flat estimate (≥ 0). */
  savings: number;
}

/**
 * Founder persona "comfort" axis used to switch between plain-English and
 * technical copy. Kept loose (string union + null) here so this module never
 * has to import the full persona types from school-financial-model. Callers
 * pass in their FounderComfort literally.
 */
export type ComfortVariant = "new_to_budgeting" | "comfortable" | null;

/**
 * Sanity guard against rendering a "saves $0/yr" insight when a degenerate
 * component set (e.g. a zero-rate component with a low wage base) somehow
 * surfaces. The cap-savings helper itself returns null when no component is
 * actually capped, so this floor only matters once we round.
 */
export const CAP_INSIGHT_MIN_SAVINGS = 1;

/**
 * Compute the dollar payroll tax owed on a single employee's annual salary,
 * applying each component's wage-base cap.
 */
export function computePayrollTaxForSalary(
  annualSalary: number,
  components: PayrollTaxComponent[],
): number {
  if (!annualSalary || annualSalary <= 0 || !components || components.length === 0) return 0;
  let total = 0;
  for (const c of components) {
    const cappedWage = c.wageBase !== undefined ? Math.min(annualSalary, c.wageBase) : annualSalary;
    total += cappedWage * (c.rate / 100);
  }
  return total;
}

/**
 * Inspect a salary against a payroll-tax component set and return a
 * coaching-friendly summary of which components hit their wage-base cap and
 * how many dollars the wage-base-aware math saves vs. a flat blended rate.
 *
 * Returns `null` when the salary doesn't exceed any component's wage base —
 * the UI should hide the insight in that case.
 */
export function computePayrollTaxCapSavings(
  annualSalary: number,
  components: PayrollTaxComponent[],
): PayrollTaxCapInsight | null {
  if (!annualSalary || annualSalary <= 0 || !components || components.length === 0) return null;
  const capped = components.filter(
    (c) => c.wageBase !== undefined && annualSalary > c.wageBase,
  );
  if (capped.length === 0) return null;
  const flatRate = components.reduce((s, c) => s + c.rate, 0);
  const flatTax = annualSalary * (flatRate / 100);
  const cappedTax = computePayrollTaxForSalary(annualSalary, components);
  const savings = Math.max(0, flatTax - cappedTax);
  return {
    cappedComponents: capped.map((c) => ({
      label: c.label ?? "Payroll tax component",
      wageBase: c.wageBase!,
    })),
    flatRate,
    flatTax,
    cappedTax,
    savings,
  };
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * Per-row copy used by the StaffingStep wizard card. Two variants:
 *   - new_to_budgeting → plain-English explainer.
 *   - comfortable / null → technical "blended rate" wording.
 */
export function buildCapInsightText(insight: PayrollTaxCapInsight, comfort: ComfortVariant): string {
  const labels = insight.cappedComponents.map(
    (c) => `${c.label} ($${c.wageBase.toLocaleString()})`,
  );
  const labelStr = joinLabels(labels);
  const savings = `$${Math.round(insight.savings).toLocaleString()}/yr`;
  if (comfort === "new_to_budgeting") {
    return `This salary is over the wage-base cap for ${labelStr}, so we stop charging payroll tax above those limits — saves about ${savings} vs. a flat estimate.`;
  }
  return `Wage-base caps hit on ${labelStr}. Wage-base-aware math saves ${savings} vs. a flat ${insight.flatRate.toFixed(2)}% blended rate.`;
}

/**
 * Minimal staffing-row shape needed to aggregate cap savings across the
 * roster. Mirrors the fields the wizard / api-server already carry on each
 * row so callers don't have to translate.
 */
export interface RosterStaffingRowLike {
  /** Annualized full-time salary; pre-FTE. The aggregator multiplies by FTE. */
  annualizedRate: number;
  fte: number;
  payrollTaxComponents?: PayrollTaxComponent[];
  /** When true, the founder manually overrode the row's blended rate, so the
   *  components don't drive the math. We skip those rows. */
  payrollTaxRateOverridden?: boolean;
  /** Contract-not-payroll-like rows owe nothing — skip them too. */
  employmentType?: string;
  payrollLike?: boolean;
}

export interface RosterCapSavingsAggregate {
  /** Total wage-base savings across every roster row, rounded to the dollar. */
  totalSavings: number;
  /** Number of roster rows that contributed to the savings (≥ 1 capped component each). */
  affectedRoleCount: number;
  /** Distinct capped component labels (e.g. "Social Security (FICA)") observed across the roster. */
  cappedComponentLabels: string[];
}

/**
 * Walk a staffing roster and aggregate the wage-base savings across every
 * row whose salary clears at least one component's wage base. Returns null
 * when no row qualifies — callers should hide the insight in that case.
 */
export function aggregateRosterCapSavings(
  rows: RosterStaffingRowLike[],
): RosterCapSavingsAggregate | null {
  if (!rows || rows.length === 0) return null;
  let totalSavings = 0;
  let affectedRoleCount = 0;
  const labels = new Set<string>();
  for (const row of rows) {
    const isContractNotPayrollLike = row.employmentType === "contract" && !row.payrollLike;
    if (isContractNotPayrollLike) continue;
    if (row.payrollTaxRateOverridden) continue;
    const components = row.payrollTaxComponents;
    if (!components || components.length === 0) continue;
    const salary = Math.round((row.fte || 0) * (row.annualizedRate || 0));
    const insight = computePayrollTaxCapSavings(salary, components);
    if (!insight) continue;
    const rowSavings = Math.round(insight.savings);
    if (rowSavings < CAP_INSIGHT_MIN_SAVINGS) continue;
    totalSavings += rowSavings;
    affectedRoleCount += 1;
    for (const c of insight.cappedComponents) labels.add(c.label);
  }
  if (totalSavings < CAP_INSIGHT_MIN_SAVINGS || affectedRoleCount === 0) return null;
  return {
    totalSavings,
    affectedRoleCount,
    cappedComponentLabels: Array.from(labels),
  };
}

/**
 * Roster-level copy used by saved-scenario summary cards and the lender /
 * board PDF Personnel sections. Mirrors `buildCapInsightText`'s persona
 * variants but speaks about the whole staffing plan instead of a single row.
 */
export function buildRosterCapInsightText(
  agg: RosterCapSavingsAggregate,
  comfort: ComfortVariant,
): string {
  const savings = `$${agg.totalSavings.toLocaleString()}/yr`;
  const roleNoun = agg.affectedRoleCount === 1 ? "role" : "roles";
  const componentList = joinLabels(agg.cappedComponentLabels);
  if (comfort === "new_to_budgeting") {
    return `${agg.affectedRoleCount} ${roleNoun} earn above the wage-base cap for ${componentList}, so we stop charging payroll tax above those limits — saves about ${savings} vs. a flat estimate.`;
  }
  return `Wage-base caps hit on ${componentList} across ${agg.affectedRoleCount} ${roleNoun}. Wage-base-aware math saves ${savings} vs. a flat blended rate.`;
}
