export interface PayrollTaxComponent {
  label: string;
  rate: number;
}

export interface StatePayrollTaxEntry {
  components: PayrollTaxComponent[];
  totalRate: number;
}

function entry(stateComponents: PayrollTaxComponent[]): StatePayrollTaxEntry {
  const federalComponents: PayrollTaxComponent[] = [
    { label: "Social Security (FICA)", rate: 6.2 },
    { label: "Medicare", rate: 1.45 },
    { label: "FUTA", rate: 0.6 },
  ];
  const allComponents = [...federalComponents, ...stateComponents];
  const totalRate = Math.round(allComponents.reduce((sum, c) => sum + c.rate, 0) * 100) / 100;
  return { components: allComponents, totalRate };
}

export const STATE_PAYROLL_TAX_MAP: Record<string, StatePayrollTaxEntry> = {
  AL: entry([{ label: "AL SUI", rate: 2.7 }]),
  AK: entry([{ label: "AK SUI", rate: 1.0 }]),
  AZ: entry([{ label: "AZ SUI", rate: 2.0 }]),
  AR: entry([{ label: "AR SUI", rate: 3.1 }]),
  CA: entry([
    { label: "CA SUI", rate: 3.4 },
    { label: "CA SDI (employer)", rate: 0.0 },
    { label: "CA Employment Training Tax", rate: 0.1 },
  ]),
  CO: entry([{ label: "CO SUI", rate: 1.7 }, { label: "CO FAMLI (employer)", rate: 0.45 }]),
  CT: entry([{ label: "CT SUI", rate: 3.0 }]),
  DE: entry([{ label: "DE SUI", rate: 1.8 }]),
  FL: entry([{ label: "FL SUI", rate: 2.7 }]),
  GA: entry([{ label: "GA SUI", rate: 2.7 }]),
  HI: entry([{ label: "HI SUI", rate: 3.0 }, { label: "HI TDI (employer)", rate: 0.5 }]),
  ID: entry([{ label: "ID SUI", rate: 1.0 }]),
  IL: entry([{ label: "IL SUI", rate: 3.175 }]),
  IN: entry([{ label: "IN SUI", rate: 2.5 }]),
  IA: entry([{ label: "IA SUI", rate: 1.0 }]),
  KS: entry([{ label: "KS SUI", rate: 2.7 }]),
  KY: entry([{ label: "KY SUI", rate: 2.7 }]),
  LA: entry([{ label: "LA SUI", rate: 1.16 }]),
  ME: entry([{ label: "ME SUI", rate: 2.37 }]),
  MD: entry([{ label: "MD SUI", rate: 2.3 }]),
  MA: entry([{ label: "MA SUI", rate: 1.87 }, { label: "MA PFML (employer)", rate: 0.34 }]),
  MI: entry([{ label: "MI SUI", rate: 2.7 }]),
  MN: entry([{ label: "MN SUI", rate: 1.0 }]),
  MS: entry([{ label: "MS SUI", rate: 1.0 }]),
  MO: entry([{ label: "MO SUI", rate: 1.0 }]),
  MT: entry([{ label: "MT SUI", rate: 1.18 }]),
  NE: entry([{ label: "NE SUI", rate: 1.25 }]),
  NV: entry([{ label: "NV SUI", rate: 2.95 }]),
  NH: entry([{ label: "NH SUI", rate: 1.7 }]),
  NJ: entry([
    { label: "NJ SUI", rate: 2.6825 },
    { label: "NJ SDI (employer)", rate: 0.5 },
    { label: "NJ FLI (employer)", rate: 0.09 },
    { label: "NJ WFD", rate: 0.1175 },
  ]),
  NM: entry([{ label: "NM SUI", rate: 1.0 }]),
  NY: entry([
    { label: "NY SUI", rate: 3.525 },
    { label: "NY Re-employment Fund", rate: 0.075 },
  ]),
  NC: entry([{ label: "NC SUI", rate: 1.0 }]),
  ND: entry([{ label: "ND SUI", rate: 1.02 }]),
  OH: entry([{ label: "OH SUI", rate: 2.7 }]),
  OK: entry([{ label: "OK SUI", rate: 1.5 }]),
  OR: entry([
    { label: "OR SUI", rate: 2.1 },
    { label: "OR Transit Tax", rate: 0.1 },
    { label: "OR Paid Leave (employer)", rate: 0.4 },
  ]),
  PA: entry([{ label: "PA SUI", rate: 3.6890 }]),
  RI: entry([{ label: "RI SUI", rate: 1.09 }, { label: "RI TDI (employer)", rate: 0.0 }]),
  SC: entry([{ label: "SC SUI", rate: 0.54 }]),
  SD: entry([{ label: "SD SUI", rate: 1.2 }]),
  TN: entry([{ label: "TN SUI", rate: 2.7 }]),
  TX: entry([{ label: "TX SUI", rate: 2.7 }]),
  UT: entry([{ label: "UT SUI", rate: 1.1 }]),
  VT: entry([{ label: "VT SUI", rate: 1.0 }]),
  VA: entry([{ label: "VA SUI", rate: 2.5 }]),
  WA: entry([
    { label: "WA SUI", rate: 1.22 },
    { label: "WA Paid Family & Medical Leave", rate: 0.28 },
    { label: "WA Workers' Comp (avg)", rate: 0.4 },
  ]),
  WV: entry([{ label: "WV SUI", rate: 2.7 }]),
  WI: entry([{ label: "WI SUI", rate: 3.05 }]),
  WY: entry([{ label: "WY SUI", rate: 1.46 }]),
  DC: entry([{ label: "DC SUI", rate: 2.7 }, { label: "DC Paid Family Leave", rate: 0.62 }]),
};

const DEFAULT_FEDERAL_ONLY: StatePayrollTaxEntry = {
  components: [
    { label: "Social Security (FICA)", rate: 6.2 },
    { label: "Medicare", rate: 1.45 },
    { label: "FUTA", rate: 0.6 },
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
