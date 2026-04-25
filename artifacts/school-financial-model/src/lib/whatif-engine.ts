import type { FullModelData } from "@/pages/model-wizard/schema";
import { computeBaseFinancials, type ScenarioMetrics } from "./scenario-engine";

export interface WhatIfOverrides {
  enrollmentDelta?: [number, number, number, number, number];
  retentionRate?: number;
  tuitionDeltaPerStudent?: number;
  monthlyRent?: number;
  rentEscalation?: number;
  rentChangeStartYear?: number;
  sqftDelta?: number;
}

export interface WhatIfImpact {
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
  detectedRentRowId: string | null;
  detectedBaseMonthlyRent: number | null;
}

export const EMPTY_OVERRIDES: WhatIfOverrides = {};

export function isEmptyOverrides(o: WhatIfOverrides | undefined | null): boolean {
  if (!o) return true;
  if (o.enrollmentDelta && o.enrollmentDelta.some((v) => v !== 0)) return false;
  if (o.retentionRate !== undefined) return false;
  if (o.tuitionDeltaPerStudent !== undefined && o.tuitionDeltaPerStudent !== 0) return false;
  if (o.monthlyRent !== undefined) return false;
  if (o.rentEscalation !== undefined) return false;
  if (o.sqftDelta !== undefined && o.sqftDelta !== 0) return false;
  return true;
}

interface ExpenseRowLike {
  id: string;
  category?: string;
  driverType?: string;
  amounts?: number[];
  escalationRate?: number;
  escalationRateOverridden?: boolean;
  enabled?: boolean;
}

export function detectFacilityRent(data: FullModelData): { rowId: string | null; monthlyRent: number | null } {
  const rows = (data.expenseRows || []) as ExpenseRowLike[];
  let bestRowId: string | null = null;
  let bestMonthly = 0;
  for (const r of rows) {
    if (!r.enabled) continue;
    if (r.category !== "occupancy_facility") continue;
    if (r.driverType !== "monthly") continue;
    const amt = r.amounts?.[0] ?? 0;
    if (amt > bestMonthly) {
      bestMonthly = amt;
      bestRowId = r.id;
    }
  }
  if (bestRowId !== null) {
    return { rowId: bestRowId, monthlyRent: bestMonthly };
  }
  // Fallback: try schoolProfile.monthlyRent (legacy single phase)
  const sp = data.schoolProfile as Record<string, unknown> | undefined;
  if (sp) {
    const phases = sp.facilityPhases as Array<Record<string, unknown>> | undefined;
    if (phases && phases.length > 0) {
      const rents = phases
        .filter((p) => p.ownershipType === "rent")
        .map((p) => (p.monthlyRent as number) || 0);
      if (rents.length > 0) {
        const max = Math.max(...rents);
        if (max > 0) return { rowId: null, monthlyRent: max };
      }
    }
    const profileRent = sp.monthlyRent as number | undefined;
    if (typeof profileRent === "number" && profileRent > 0) {
      return { rowId: null, monthlyRent: profileRent };
    }
  }
  return { rowId: null, monthlyRent: null };
}

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

export function applyWhatIfOverrides(data: FullModelData, overrides: WhatIfOverrides): FullModelData {
  if (isEmptyOverrides(overrides)) return data;
  const cloned = deepClone(data) as FullModelData & Record<string, unknown>;

  // Enrollment deltas (additive per year)
  if (overrides.enrollmentDelta && overrides.enrollmentDelta.some((v) => v !== 0)) {
    const en = (cloned.enrollment || {}) as Record<string, unknown>;
    const keys = ["year1", "year2", "year3", "year4", "year5"] as const;
    for (let i = 0; i < 5; i++) {
      const cur = (en[keys[i]] as number | undefined) ?? 0;
      const next = Math.max(0, cur + overrides.enrollmentDelta[i]);
      en[keys[i]] = next;
    }
    cloned.enrollment = en as FullModelData["enrollment"];
  }

  // Retention rate override
  if (overrides.retentionRate !== undefined) {
    const en = (cloned.enrollment || {}) as Record<string, unknown>;
    en.retentionRate = Math.max(0, Math.min(100, overrides.retentionRate));
    cloned.enrollment = en as FullModelData["enrollment"];
  }

  // Tuition delta per student (additive on per_student tuition_and_fees rows).
  // The base engine has two paths:
  //   (a) tier-mode (when data.tuitionTiers has rows) — only reads amounts[0] and escalates
  //       per year using `data.tuitionEscalation.rate ?? r.escalationRate`.
  //   (b) non-tier mode — uses driverVal which reads amounts[y] when escalation is 0,
  //       or amounts[0] * (1+esc)^y when escalation is non-zero.
  // To produce a consistent "raise base tuition by $delta" effect across both paths,
  // we add the delta to amounts[0] (which both paths read) and additionally bump every
  // amounts[y] for the no-escalation case so non-tier mode still picks it up year-over-year.
  if (overrides.tuitionDeltaPerStudent !== undefined && overrides.tuitionDeltaPerStudent !== 0) {
    const delta = overrides.tuitionDeltaPerStudent;
    const tuitionEsc = (cloned as Record<string, unknown>).tuitionEscalation as
      | { rate?: number }
      | undefined;
    const globalEsc = tuitionEsc?.rate ?? 0;
    const rows = (cloned.revenueRows || []) as Array<Record<string, unknown>>;
    for (const r of rows) {
      if (r.category === "tuition_and_fees" && r.driverType === "per_student") {
        const amts = ((r.amounts as number[] | undefined) || []).slice();
        const rowEsc = (r.escalationRate as number | undefined) ?? 0;
        const effectiveEsc = globalEsc !== 0 ? globalEsc : rowEsc;
        if (effectiveEsc !== 0) {
          // Engine will escalate amounts[0] across years. Just bump amounts[0].
          amts[0] = Math.max(0, (amts[0] ?? 0) + delta);
        } else {
          // No escalation — engine reads amounts[y] per year. Bump each year.
          for (let i = 0; i < 5; i++) {
            amts[i] = Math.max(0, (amts[i] ?? amts[0] ?? 0) + delta);
          }
        }
        r.amounts = amts;
      }
    }
  }

  // Lease overrides (monthly rent / escalation / start year)
  const startYear = Math.max(1, Math.min(5, overrides.rentChangeStartYear ?? 1));
  const startIdx = startYear - 1;
  if (overrides.monthlyRent !== undefined || overrides.rentEscalation !== undefined) {
    const rows = (cloned.expenseRows || []) as ExpenseRowLike[];
    const detected = detectFacilityRent(data);
    const targetId = detected.rowId;

    if (targetId !== null) {
      const target = rows.find((r) => r.id === targetId);
      if (target) {
        const origAmts = target.amounts || [];
        const origEsc = (target.escalationRate ?? 0) as number;
        // When the user only changes escalation (or only the start year), the
        // rent basis at startYear should be the *projected* original rent at
        // that year — not Y1 — so we don't accidentally reset rent to its Y1
        // value. Only fall back to Y1 when no monthlyRent override is given
        // AND the change applies from year 1.
        const projectedOriginalAtStart = origEsc !== 0 && startIdx > 0
          ? (origAmts[0] ?? 0) * Math.pow(1 + origEsc / 100, startIdx)
          : (origAmts[startIdx] ?? origAmts[0] ?? 0);
        const newRent =
          overrides.monthlyRent !== undefined
            ? Math.max(0, overrides.monthlyRent)
            : projectedOriginalAtStart;
        const newEsc = overrides.rentEscalation !== undefined ? overrides.rentEscalation : origEsc;
        const out: number[] = [];
        for (let i = 0; i < 5; i++) {
          if (i < startIdx) {
            // Preserve original projected monthly value
            let v: number;
            if (origEsc !== 0 && i > 0) {
              v = (origAmts[0] ?? 0) * Math.pow(1 + origEsc / 100, i);
            } else {
              v = origAmts[i] ?? 0;
            }
            out.push(v);
          } else {
            const yearsFromStart = i - startIdx;
            const v = newRent * Math.pow(1 + newEsc / 100, yearsFromStart);
            out.push(v);
          }
        }
        target.amounts = out;
        target.escalationRate = 0;
        target.escalationRateOverridden = true;
      }
    } else {
      // No facility expense row — synthesize one so monthly rent and/or escalation
      // overrides take effect. Use detected fallback rent (from schoolProfile) as the
      // baseline when only escalation is changed.
      const baselineRent = detected.monthlyRent ?? 0;
      const newRent =
        overrides.monthlyRent !== undefined ? Math.max(0, overrides.monthlyRent) : baselineRent;
      const newEsc = overrides.rentEscalation ?? 0;
      // Only synthesize if there's a positive rent to model — otherwise escalating $0 is
      // a no-op and we shouldn't add a phantom row.
      if (newRent > 0) {
        const out: number[] = [];
        for (let i = 0; i < 5; i++) {
          if (i < startIdx) {
            // Preserve the (likely zero) baseline before start year. If the user has
            // schoolProfile.monthlyRent baseline pre-existing, keep it for early years.
            out.push(baselineRent);
          } else {
            const yearsFromStart = i - startIdx;
            out.push(newRent * Math.pow(1 + newEsc / 100, yearsFromStart));
          }
        }
        const synthetic = {
          id: "__whatif_rent__",
          category: "occupancy_facility",
          lineItem: "What-If Rent",
          enabled: true,
          driverType: "monthly",
          amounts: out,
          escalationRate: 0,
          escalationRateOverridden: true,
          note: "",
        };
        cloned.expenseRows = ([...(cloned.expenseRows || []), synthetic] as unknown) as FullModelData["expenseRows"];
      }
    }
  }

  // Square footage delta — proportionally scale all occupancy_facility expense rows
  if (overrides.sqftDelta !== undefined && overrides.sqftDelta !== 0) {
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
      const factor = Math.max(0, 1 + overrides.sqftDelta / baseSqft);
      const rows = (cloned.expenseRows || []) as ExpenseRowLike[];
      for (const r of rows) {
        if (r.category !== "occupancy_facility") continue;
        if (!r.amounts) continue;
        // Skip the row we already overrode to avoid double-scaling
        if (r.id === "__whatif_rent__") continue;
        const det = detectFacilityRent(data);
        const skipId = det.rowId;
        if (overrides.monthlyRent !== undefined && r.id === skipId) continue;
        r.amounts = r.amounts.map((a) => a * factor);
      }
    }
  }

  return cloned as FullModelData;
}

export function computeWhatIfImpact(data: FullModelData, overrides: WhatIfOverrides): WhatIfImpact {
  const base = computeBaseFinancials(data);
  const detected = detectFacilityRent(data);
  if (isEmptyOverrides(overrides)) {
    return {
      base,
      adjusted: base,
      deltas: {
        revenue: [0, 0, 0, 0, 0],
        netIncome: [0, 0, 0, 0, 0],
        netIncomePct: [0, 0, 0, 0, 0],
        dscr: [0, 0, 0, 0, 0],
        breakEvenYearShift: 0,
        cashRunwayDeltaMonths: 0,
      },
      detectedRentRowId: detected.rowId,
      detectedBaseMonthlyRent: detected.monthlyRent,
    };
  }
  const adjustedData = applyWhatIfOverrides(data, overrides);
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
  return {
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
    detectedRentRowId: detected.rowId,
    detectedBaseMonthlyRent: detected.monthlyRent,
  };
}

// URL-hash codec ----------------------------------------------------------

const HASH_KEY = "whatif";

export function encodeOverridesToHash(overrides: WhatIfOverrides): string {
  const parts: string[] = [];
  if (overrides.enrollmentDelta && overrides.enrollmentDelta.some((v) => v !== 0)) {
    parts.push(`e:${overrides.enrollmentDelta.join(",")}`);
  }
  if (overrides.retentionRate !== undefined) parts.push(`r:${overrides.retentionRate}`);
  if (overrides.tuitionDeltaPerStudent !== undefined && overrides.tuitionDeltaPerStudent !== 0) {
    parts.push(`t:${overrides.tuitionDeltaPerStudent}`);
  }
  if (overrides.monthlyRent !== undefined) parts.push(`m:${overrides.monthlyRent}`);
  if (overrides.rentEscalation !== undefined) parts.push(`esc:${overrides.rentEscalation}`);
  if (overrides.rentChangeStartYear !== undefined && overrides.rentChangeStartYear !== 1) {
    parts.push(`sy:${overrides.rentChangeStartYear}`);
  }
  if (overrides.sqftDelta !== undefined && overrides.sqftDelta !== 0) parts.push(`sq:${overrides.sqftDelta}`);
  if (parts.length === 0) return "";
  return `${HASH_KEY}=${parts.join("|")}`;
}

export function decodeOverridesFromHash(hash: string): WhatIfOverrides {
  const empty: WhatIfOverrides = {};
  if (!hash) return empty;
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  const segments = trimmed.split("&");
  let payload: string | null = null;
  for (const seg of segments) {
    if (seg.startsWith(`${HASH_KEY}=`)) {
      payload = seg.slice(HASH_KEY.length + 1);
      break;
    }
  }
  if (!payload) return empty;
  const out: WhatIfOverrides = {};
  for (const piece of payload.split("|")) {
    const [k, v] = piece.split(":");
    if (!k || v === undefined) continue;
    switch (k) {
      case "e": {
        const parts = v.split(",").map((s) => parseFloat(s));
        if (parts.length === 5 && parts.every((n) => !Number.isNaN(n))) {
          out.enrollmentDelta = [parts[0], parts[1], parts[2], parts[3], parts[4]];
        }
        break;
      }
      case "r": {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) out.retentionRate = n;
        break;
      }
      case "t": {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) out.tuitionDeltaPerStudent = n;
        break;
      }
      case "m": {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) out.monthlyRent = n;
        break;
      }
      case "esc": {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) out.rentEscalation = n;
        break;
      }
      case "sy": {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n)) out.rentChangeStartYear = Math.max(1, Math.min(5, n));
        break;
      }
      case "sq": {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) out.sqftDelta = n;
        break;
      }
    }
  }
  return out;
}
