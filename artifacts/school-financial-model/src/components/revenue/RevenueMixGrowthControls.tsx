import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import {
  computeRevenueSourceMix,
  getBucketLabel,
  getBucketColor,
  type RevenueSourceBucket,
  type RevenueRowAmountsRowLike,
  type TuitionTierLike,
  type RevenueRowAmountsSchoolProfileLike,
} from "@workspace/finance";
import type { FullModelData } from "@/pages/model-wizard/schema";

interface Props {
  data: FullModelData;
  testId?: string;
}

interface RowFromModel extends RevenueRowAmountsRowLike {
  lineItem?: string;
}

function getStudentsByYear(data: FullModelData, yearCount: number): number[] {
  const e = data.enrollment ?? {};
  const arr: number[] = [];
  for (let i = 0; i < yearCount; i++) {
    const key = (`year${i + 1}` as "year1" | "year2" | "year3" | "year4" | "year5");
    arr.push((e as Partial<Record<typeof key, number>>)[key] ?? 0);
  }
  return arr;
}

/**
 * Per-source toggle: each visible bucket can independently be "Constant
 * share" (Y1 mix carries forward) or "Changes year-to-year" (founder
 * explains in narrative). Stored on `revenue.revenueMixGrowth[bucket]`.
 */
export function RevenueMixGrowthControls({
  data,
  testId = "revenue-mix-growth",
}: Props) {
  const { setValue, watch } = useFormContext<FullModelData>();
  const schoolType = data.schoolProfile?.schoolType;

  const y1 = useMemo(() => {
    const rows = (data.revenueRows ?? []) as RowFromModel[];
    const yearCount = Math.max(1, Math.min(rows[0]?.amounts?.length ?? 5, 5));
    const students = getStudentsByYear(data, yearCount);
    const result = computeRevenueSourceMix({
      rows,
      yearCount,
      studentsByYear: students,
      schoolType,
      tuitionTiers: data.tuitionTiers as TuitionTierLike[] | undefined,
      schoolProfile: data.schoolProfile as
        | RevenueRowAmountsSchoolProfileLike
        | undefined,
    });
    return { result, year: result.years[0] };
  }, [data, schoolType]);

  const visibleBuckets = useMemo<RevenueSourceBucket[]>(() => {
    if (!y1.year) return [];
    return y1.result.buckets.filter(
      (b) => (y1.year!.totalsByBucket.get(b) ?? 0) > 0,
    );
  }, [y1]);

  const mixGrowth =
    (watch("revenue.revenueMixGrowth") as
      | Record<string, { mode: "constant" | "manual"; narrative?: string }>
      | undefined) ?? {};

  if (visibleBuckets.length === 0) {
    return null;
  }

  const setBucket = (
    bucket: RevenueSourceBucket,
    next: { mode?: "constant" | "manual"; narrative?: string },
  ) => {
    const cur = mixGrowth[bucket] ?? { mode: "constant" as const };
    setValue(
      "revenue.revenueMixGrowth",
      {
        ...mixGrowth,
        [bucket]: {
          mode: next.mode ?? cur.mode,
          narrative: next.narrative ?? cur.narrative,
        },
      },
      { shouldDirty: true },
    );
  };

  return (
    <div
      data-testid={testId}
      className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
    >
      <h3 className="font-display font-semibold text-base text-foreground">
        How does the revenue mix change over 5 years?
      </h3>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        For each source, pick whether its share of revenue stays the same as
        Year 1 or changes as the school grows. If it changes, briefly explain
        why — that note flows into your lender narrative.
      </p>
      <ul className="space-y-3">
        {visibleBuckets.map((b) => {
          const entry = mixGrowth[b];
          const mode = entry?.mode ?? "constant";
          const narrative = entry?.narrative ?? "";
          const share = y1.year?.sharesByBucket.get(b) ?? 0;
          return (
            <li
              key={b}
              data-testid={`${testId}-row-${b}`}
              className="rounded-xl border border-border/60 bg-background/60 p-3"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: getBucketColor(b, schoolType) }}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-sm text-foreground">
                    {getBucketLabel(b, schoolType)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Y1 share: {share.toFixed(1)}%
                  </span>
                </div>
                <div
                  className="inline-flex rounded-lg border border-border/60 bg-muted/40 p-0.5"
                  role="radiogroup"
                  aria-label={`${getBucketLabel(b, schoolType)} growth mode`}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "constant"}
                    data-testid={`${testId}-${b}-constant`}
                    onClick={() => setBucket(b, { mode: "constant" })}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      mode === "constant"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Constant share
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "manual"}
                    data-testid={`${testId}-${b}-manual`}
                    onClick={() => setBucket(b, { mode: "manual" })}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      mode === "manual"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Changes year-to-year
                  </button>
                </div>
              </div>
              {mode === "manual" && (
                <div className="mt-3">
                  <label
                    htmlFor={`${testId}-narrative-${b}`}
                    className="block text-xs font-medium text-foreground mb-1"
                  >
                    Why does this share change? (required)
                  </label>
                  <textarea
                    id={`${testId}-narrative-${b}`}
                    data-testid={`${testId}-narrative-${b}`}
                    value={narrative}
                    onChange={(ev) =>
                      setBucket(b, {
                        mode: "manual",
                        narrative: ev.target.value,
                      })
                    }
                    rows={2}
                    maxLength={500}
                    placeholder={`e.g. Voucher program expands in Y2, lifting voucher share from ${share.toFixed(0)}% to 35%.`}
                    className="w-full text-xs rounded-md border border-border/60 bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {narrative.trim().length === 0 && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      Add a short note — this becomes part of your lender narrative.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
