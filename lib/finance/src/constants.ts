export const DEFAULT_BENEFITS_RATE = 25;
export const DEFAULT_PAYROLL_TAX_RATE = 8;
export const DEFAULT_COLA_PCT = 3;
export const DEFAULT_GENERAL_INFLATION_PCT = 3;
export const DEFAULT_RENT_ESCALATION_PCT = 3;
export const DEFAULT_TUITION_ESCALATION_PCT = 3;
export const DEFAULT_RETENTION_RATE = 85;

export const LOADED_COST_MULTIPLIER = 1 + (DEFAULT_BENEFITS_RATE + DEFAULT_PAYROLL_TAX_RATE) / 100;

export const YEAR_COUNT = 5;

export const BENCHMARK_DSCR_GREEN = 1.25;
export const BENCHMARK_DSCR_AMBER = 1.15;

export type CollectionMethod = "autopay" | "invoiced" | "mixed";

export const DEFAULT_COLLECTION_RATE_BY_METHOD: Record<CollectionMethod, number> = {
  autopay: 100,
  invoiced: 95,
  mixed: 95,
};

export const COLLECTION_RATE_BENCHMARK_COPY =
  "Most invoiced K-8 schools see 88-93% — set with care";

export function defaultCollectionRateForMethod(method?: string | null): number {
  if (!method) return DEFAULT_COLLECTION_RATE_BY_METHOD.autopay;
  if (method === "autopay" || method === "invoiced" || method === "mixed") {
    return DEFAULT_COLLECTION_RATE_BY_METHOD[method];
  }
  return DEFAULT_COLLECTION_RATE_BY_METHOD.autopay;
}
