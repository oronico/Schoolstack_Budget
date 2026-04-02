export interface StaffingRowLike {
  fte: number;
  staffingMode?: string;
  studentRatio?: number;
  minFte?: number;
  maxFte?: number;
  startYear?: number;
  endYear?: number;
}

export function computeEffectiveFte(r: StaffingRowLike, y: number, enrollment: number): number {
  if (r.startYear && (y + 1) < r.startYear) return 0;
  if (r.endYear && (y + 1) > r.endYear) return 0;

  if (r.staffingMode === "ratio" && r.studentRatio && r.studentRatio > 0) {
    let computed = enrollment / r.studentRatio;
    if (r.minFte !== undefined) computed = Math.max(computed, r.minFte);
    if (r.maxFte !== undefined) computed = Math.min(computed, r.maxFte);
    return Math.ceil(computed * 2) / 2;
  }

  return r.fte;
}

export function resolveEsc(rowEsc?: number, fallback?: number): number {
  if (rowEsc !== undefined && rowEsc !== 0) return rowEsc;
  return fallback ?? 0;
}
