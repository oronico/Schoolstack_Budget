/**
 * State payroll tax data with 2025 wage bases.
 *
 * Each component represents one statutory tax (FICA, Medicare, FUTA, state SUI,
 * state-paid-leave, etc). The `wageBase` field is the per-employee annual wage
 * cap above which the tax no longer applies — when omitted (Medicare,
 * employer-paid PFML in some states), the tax applies to all wages.
 *
 * Sources (2025):
 *   - Social Security wage base: $176,100 (SSA, 2025)
 *   - Medicare: no cap (employer share 1.45%)
 *   - FUTA: $7,000 (federal statutory, employer pays 0.6% net of credit)
 *   - State SUI wage bases: state DOL publications, 2025 schedules
 *
 * The engine uses these to cap the tax: `min(salary, wageBase) * rate`.
 * Without wage-base caps, a $120k Head of School in WA would over-accrue
 * SUI by ~$575/yr, and a $200k principal in NY would over-accrue FICA by
 * ~$1,500/yr. The audit doc at docs/math-trigger-audit.md walks through
 * the corrected vs. previous numbers.
 */

export interface PayrollTaxComponent {
  label: string;
  rate: number;
  /** Annual wage base in dollars; undefined = applies to all wages (no cap). */
  wageBase?: number;
}

export interface StatePayrollTaxEntry {
  components: PayrollTaxComponent[];
  totalRate: number;
}

// 2025 federal wage bases.
const FICA_WAGE_BASE_2025 = 176100;
const FUTA_WAGE_BASE = 7000;

function entry(stateComponents: PayrollTaxComponent[]): StatePayrollTaxEntry {
  const federalComponents: PayrollTaxComponent[] = [
    { label: "Social Security (FICA)", rate: 6.2, wageBase: FICA_WAGE_BASE_2025 },
    { label: "Medicare", rate: 1.45 },
    { label: "FUTA", rate: 0.6, wageBase: FUTA_WAGE_BASE },
  ];
  const allComponents = [...federalComponents, ...stateComponents];
  const totalRate = Math.round(allComponents.reduce((sum, c) => sum + c.rate, 0) * 100) / 100;
  return { components: allComponents, totalRate };
}

// 2025 state unemployment insurance wage bases (employer pays SUI on wages up to this annual cap per employee).
// Compiled from state workforce / labor agency 2025 tax-rate notices.
export const STATE_PAYROLL_TAX_MAP: Record<string, StatePayrollTaxEntry> = {
  AL: entry([{ label: "AL SUI", rate: 2.7, wageBase: 8000 }]),
  AK: entry([{ label: "AK SUI", rate: 1.0, wageBase: 49700 }]),
  AZ: entry([{ label: "AZ SUI", rate: 2.0, wageBase: 8000 }]),
  AR: entry([{ label: "AR SUI", rate: 3.1, wageBase: 7000 }]),
  CA: entry([
    { label: "CA SUI", rate: 3.4, wageBase: 7000 },
    { label: "CA Employment Training Tax", rate: 0.1, wageBase: 7000 },
  ]),
  CO: entry([
    { label: "CO SUI", rate: 1.7, wageBase: 27200 },
    { label: "CO FAMLI (employer)", rate: 0.45, wageBase: FICA_WAGE_BASE_2025 },
  ]),
  CT: entry([{ label: "CT SUI", rate: 3.0, wageBase: 26100 }]),
  DE: entry([{ label: "DE SUI", rate: 1.8, wageBase: 12500 }]),
  FL: entry([{ label: "FL SUI", rate: 2.7, wageBase: 7000 }]),
  GA: entry([{ label: "GA SUI", rate: 2.7, wageBase: 9500 }]),
  HI: entry([
    { label: "HI SUI", rate: 3.0, wageBase: 62000 },
    { label: "HI TDI (employer)", rate: 0.5, wageBase: 71868 },
  ]),
  ID: entry([{ label: "ID SUI", rate: 1.0, wageBase: 55300 }]),
  IL: entry([{ label: "IL SUI", rate: 3.175, wageBase: 13916 }]),
  IN: entry([{ label: "IN SUI", rate: 2.5, wageBase: 9500 }]),
  IA: entry([{ label: "IA SUI", rate: 1.0, wageBase: 39500 }]),
  KS: entry([{ label: "KS SUI", rate: 2.7, wageBase: 14000 }]),
  KY: entry([{ label: "KY SUI", rate: 2.7, wageBase: 11700 }]),
  LA: entry([{ label: "LA SUI", rate: 1.16, wageBase: 7700 }]),
  ME: entry([{ label: "ME SUI", rate: 2.37, wageBase: 12000 }]),
  MD: entry([{ label: "MD SUI", rate: 2.3, wageBase: 8500 }]),
  MA: entry([
    { label: "MA SUI", rate: 1.87, wageBase: 15000 },
    { label: "MA PFML (employer)", rate: 0.34, wageBase: FICA_WAGE_BASE_2025 },
  ]),
  MI: entry([{ label: "MI SUI", rate: 2.7, wageBase: 9500 }]),
  MN: entry([{ label: "MN SUI", rate: 1.0, wageBase: 43000 }]),
  MS: entry([{ label: "MS SUI", rate: 1.0, wageBase: 14000 }]),
  MO: entry([{ label: "MO SUI", rate: 1.0, wageBase: 9500 }]),
  MT: entry([{ label: "MT SUI", rate: 1.18, wageBase: 45100 }]),
  NE: entry([{ label: "NE SUI", rate: 1.25, wageBase: 9000 }]),
  NV: entry([{ label: "NV SUI", rate: 2.95, wageBase: 41800 }]),
  NH: entry([{ label: "NH SUI", rate: 1.7, wageBase: 14000 }]),
  NJ: entry([
    { label: "NJ SUI", rate: 2.6825, wageBase: 43300 },
    { label: "NJ SDI (employer)", rate: 0.5, wageBase: 165400 },
    { label: "NJ FLI (employer)", rate: 0.09, wageBase: 165400 },
    { label: "NJ WFD", rate: 0.1175, wageBase: 43300 },
  ]),
  NM: entry([{ label: "NM SUI", rate: 1.0, wageBase: 33200 }]),
  NY: entry([
    { label: "NY SUI", rate: 3.525, wageBase: 12800 },
    { label: "NY Re-employment Fund", rate: 0.075, wageBase: 12800 },
  ]),
  NC: entry([{ label: "NC SUI", rate: 1.0, wageBase: 32600 }]),
  ND: entry([{ label: "ND SUI", rate: 1.02, wageBase: 45100 }]),
  OH: entry([{ label: "OH SUI", rate: 2.7, wageBase: 9000 }]),
  OK: entry([{ label: "OK SUI", rate: 1.5, wageBase: 28200 }]),
  OR: entry([
    { label: "OR SUI", rate: 2.1, wageBase: 54300 },
    { label: "OR Transit Tax", rate: 0.1 },
    { label: "OR Paid Leave (employer)", rate: 0.4, wageBase: 176100 },
  ]),
  PA: entry([{ label: "PA SUI", rate: 3.689, wageBase: 10000 }]),
  RI: entry([{ label: "RI SUI", rate: 1.09, wageBase: 29200 }]),
  SC: entry([{ label: "SC SUI", rate: 0.54, wageBase: 14000 }]),
  SD: entry([{ label: "SD SUI", rate: 1.2, wageBase: 15000 }]),
  TN: entry([{ label: "TN SUI", rate: 2.7, wageBase: 7000 }]),
  TX: entry([{ label: "TX SUI", rate: 2.7, wageBase: 9000 }]),
  UT: entry([{ label: "UT SUI", rate: 1.1, wageBase: 48900 }]),
  VT: entry([{ label: "VT SUI", rate: 1.0, wageBase: 14800 }]),
  VA: entry([{ label: "VA SUI", rate: 2.5, wageBase: 8000 }]),
  WA: entry([
    { label: "WA SUI", rate: 1.22, wageBase: 72800 },
    { label: "WA Paid Family & Medical Leave", rate: 0.28, wageBase: FICA_WAGE_BASE_2025 },
    { label: "WA Workers' Comp (avg)", rate: 0.4 },
  ]),
  WV: entry([{ label: "WV SUI", rate: 2.7, wageBase: 9500 }]),
  WI: entry([{ label: "WI SUI", rate: 3.05, wageBase: 14000 }]),
  WY: entry([{ label: "WY SUI", rate: 1.46, wageBase: 32400 }]),
  DC: entry([
    { label: "DC SUI", rate: 2.7, wageBase: 9000 },
    { label: "DC Paid Family Leave", rate: 0.62, wageBase: FICA_WAGE_BASE_2025 },
  ]),
};

const DEFAULT_FEDERAL_ONLY: StatePayrollTaxEntry = {
  components: [
    { label: "Social Security (FICA)", rate: 6.2, wageBase: FICA_WAGE_BASE_2025 },
    { label: "Medicare", rate: 1.45 },
    { label: "FUTA", rate: 0.6, wageBase: FUTA_WAGE_BASE },
  ],
  totalRate: 8.25,
};

export function getStatePayrollTaxEntry(stateCode: string): StatePayrollTaxEntry {
  if (!stateCode) return DEFAULT_FEDERAL_ONLY;
  const normalized = stateCode.toUpperCase();
  return STATE_PAYROLL_TAX_MAP[normalized] || DEFAULT_FEDERAL_ONLY;
}

export function getStatePayrollTaxRate(stateCode: string): number {
  return Math.round(getStatePayrollTaxEntry(stateCode).totalRate * 10) / 10;
}

export function getQuickPickOptions(stateCode: string): { label: string; value: number }[] {
  const rate = getStatePayrollTaxRate(stateCode);
  const rounded = Math.round(rate);

  const candidates = new Set<number>();
  candidates.add(rounded - 1);
  candidates.add(rounded);
  candidates.add(rounded + 1);
  candidates.add(rounded + 2);

  const options = Array.from(candidates)
    .filter(v => v >= 7 && v <= 20)
    .sort((a, b) => a - b)
    .slice(0, 4)
    .map(v => ({ label: String(v), value: v }));

  return options;
}

/**
 * Compute the dollar payroll tax owed on a single employee's annual salary,
 * applying each component's wage-base cap.
 *
 * Example: a $200k Head of School in WA (FICA + WA SUI + WA PFML + WA Comp):
 *   - FICA SS:   min($200k, $176.1k) * 6.2%  = $10,918.20
 *   - Medicare:  $200k * 1.45%               = $2,900.00
 *   - FUTA:      min($200k, $7k) * 0.6%      = $42.00
 *   - WA SUI:    min($200k, $72.8k) * 1.22%  = $888.16
 *   - WA PFML:   min($200k, $176.1k) * 0.28% = $493.08
 *   - WA Comp:   $200k * 0.4%                = $800.00
 *   = $16,041.44 (vs. flat 9.95% × $200k = $19,900 — overstated by $3,859)
 */
export function computePayrollTaxForSalary(
  annualSalary: number,
  components: PayrollTaxComponent[]
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
 * Compute the *effective* blended payroll tax rate (as a percent of the salary)
 * given the wage-base caps. Used by UI for display ("effective rate at $80k = 8.7%").
 */
export function computeEffectivePayrollTaxRate(
  annualSalary: number,
  components: PayrollTaxComponent[]
): number {
  if (!annualSalary || annualSalary <= 0) return 0;
  const dollars = computePayrollTaxForSalary(annualSalary, components);
  return (dollars / annualSalary) * 100;
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
 * Inspect a salary against a payroll-tax component set and return a
 * coaching-friendly summary of which components hit their wage-base cap and
 * how many dollars the wage-base-aware math saves vs. a flat blended rate.
 *
 * Returns `null` when the salary doesn't exceed any component's wage base —
 * the UI should hide the insight in that case (every component applies to the
 * full salary, so there are no "savings" to coach about).
 */
export function computePayrollTaxCapSavings(
  annualSalary: number,
  components: PayrollTaxComponent[]
): PayrollTaxCapInsight | null {
  if (!annualSalary || annualSalary <= 0 || !components || components.length === 0) return null;
  const cappedComponents = components.filter(
    (c) => c.wageBase !== undefined && annualSalary > c.wageBase
  );
  if (cappedComponents.length === 0) return null;
  const flatRate = components.reduce((s, c) => s + c.rate, 0);
  const flatTax = annualSalary * (flatRate / 100);
  const cappedTax = computePayrollTaxForSalary(annualSalary, components);
  const savings = Math.max(0, flatTax - cappedTax);
  return {
    cappedComponents: cappedComponents.map((c) => ({ label: c.label, wageBase: c.wageBase! })),
    flatRate,
    flatTax,
    cappedTax,
    savings,
  };
}
