// Task #705 — Type-safe adapter from the wizard's Zod-inferred
// `RevenueRow` shape to the canonical `MonthlyRevenueRowLike` shape
// consumed by `@workspace/finance`. Replaces the brittle `as unknown
// as` cast on the Review step. All optional fields are passed through
// only when defined, so the engine's defaults take over otherwise.

import type { MonthlyRevenueRowLike } from "@workspace/finance";

interface RawRevenueRow {
  id: string;
  category: string;
  enabled: boolean;
  driverType: string;
  amounts?: number[];
  percentBase?: string;
  billingMonths?: number;
  collectionRate?: number;
  collectionDelayDays?: number;
  paymentFrequency?: string;
  paymentTiming?: string;
  disbursementType?: string;
  reimbursementLagMonths?: number;
  receiptQuarter?: number;
}

export function toMonthlyRevenueRows(
  rows: readonly unknown[] | undefined,
): MonthlyRevenueRowLike[] {
  if (!rows || rows.length === 0) return [];
  const out: MonthlyRevenueRowLike[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<RawRevenueRow>;
    if (typeof r.id !== "string" || typeof r.category !== "string" || typeof r.driverType !== "string") continue;
    out.push({
      id: r.id,
      category: r.category,
      enabled: r.enabled ?? true,
      driverType: r.driverType,
      amounts: r.amounts,
      percentBase: r.percentBase,
      billingMonths: r.billingMonths,
      collectionRate: r.collectionRate,
      collectionDelayDays: r.collectionDelayDays,
      paymentFrequency: r.paymentFrequency,
      paymentTiming: r.paymentTiming,
      disbursementType: r.disbursementType,
      reimbursementLagMonths: r.reimbursementLagMonths,
      receiptQuarter: r.receiptQuarter,
    });
  }
  return out;
}
