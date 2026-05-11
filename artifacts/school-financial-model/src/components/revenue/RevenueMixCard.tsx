import { useMemo } from "react";
import {
  computeRevenueSourceMix,
  getBucketColor,
  getBucketLabel,
  type RevenueSourceBucket,
  type RevenueRowAmountsRowLike,
  type TuitionTierLike,
  type RevenueRowAmountsSchoolProfileLike,
} from "@workspace/finance";
import { formatCurrency } from "@/lib/utils";
import type { FullModelData } from "@/pages/model-wizard/schema";

interface RevenueMixCardProps {
  data: FullModelData;
  /** Compact layout for the dashboard tile. Hides the Y1→Y5 trend bars. */
  compact?: boolean;
  /** Heading copy override. */
  title?: string;
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

export function RevenueMixCard({
  data,
  compact = false,
  title,
  testId = "revenue-mix-card",
}: RevenueMixCardProps) {
  const result = useMemo(() => {
    const rows = (data.revenueRows ?? []) as RowFromModel[];
    const yearCount = Math.max(
      1,
      Math.min(rows[0]?.amounts?.length ?? 5, 5),
    );
    const students = getStudentsByYear(data, yearCount);
    return computeRevenueSourceMix({
      rows,
      yearCount,
      studentsByYear: students,
      schoolType: data.schoolProfile?.schoolType,
      tuitionTiers: data.tuitionTiers as TuitionTierLike[] | undefined,
      schoolProfile: data.schoolProfile as
        | RevenueRowAmountsSchoolProfileLike
        | undefined,
    });
  }, [data]);

  const schoolType = data.schoolProfile?.schoolType;
  const y1 = result.years[0];
  const visibleBuckets = useMemo<RevenueSourceBucket[]>(() => {
    if (!y1) return [];
    return result.buckets.filter((b) => (y1.totalsByBucket.get(b) ?? 0) > 0);
  }, [result, y1]);

  if (!y1 || y1.total <= 0) {
    return (
      <div
        data-testid={testId}
        className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
      >
        <h3 className="font-display font-semibold text-base text-foreground mb-1">
          {title ?? "Revenue mix by source"}
        </h3>
        <p className="text-xs text-muted-foreground">
          Add revenue rows to see what % of revenue comes from each source.
        </p>
      </div>
    );
  }

  const pct = (n: number) =>
    n >= 10 ? `${Math.round(n)}%` : `${n.toFixed(1)}%`;

  return (
    <div
      data-testid={testId}
      className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-display font-semibold text-base text-foreground">
          {title ?? "Revenue mix by source"}
        </h3>
        <span className="text-xs text-muted-foreground">
          Year 1 · {formatCurrency(y1.total)}
        </span>
      </div>

      {/* Y1 stacked bar */}
      <div
        data-testid={`${testId}-y1-bar`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
      >
        {visibleBuckets.map((b) => {
          const share = y1.sharesByBucket.get(b) ?? 0;
          if (share <= 0) return null;
          return (
            <div
              key={b}
              data-testid={`${testId}-y1-segment-${b}`}
              style={{
                width: `${share}%`,
                backgroundColor: getBucketColor(b, schoolType),
              }}
              title={`${getBucketLabel(b, schoolType)}: ${pct(share)}`}
            />
          );
        })}
      </div>

      {/* Y1 legend table */}
      <ul className="mt-3 space-y-1.5">
        {visibleBuckets.map((b) => {
          const share = y1.sharesByBucket.get(b) ?? 0;
          const dollars = y1.totalsByBucket.get(b) ?? 0;
          return (
            <li
              key={b}
              data-testid={`${testId}-row-${b}`}
              className="flex items-center justify-between text-xs"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: getBucketColor(b, schoolType) }}
                  aria-hidden="true"
                />
                <span className="font-medium text-foreground truncate">
                  {getBucketLabel(b, schoolType)}
                </span>
              </span>
              <span className="text-muted-foreground tabular-nums">
                <span
                  data-testid={`${testId}-pct-${b}`}
                  className="font-semibold text-foreground"
                >
                  {pct(share)}
                </span>
                <span className="ml-2">{formatCurrency(dollars)}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* Y1→Y5 trend (skipped on compact / single-year) */}
      {!compact && result.years.length > 1 && (
        <div className="mt-4 pt-4 border-t border-border/60">
          <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground mb-2">
            Year-over-year share
          </p>
          <div
            data-testid={`${testId}-trend`}
            className="grid gap-1"
            style={{
              gridTemplateColumns: `auto repeat(${result.years.length}, minmax(0, 1fr))`,
            }}
          >
            <div />
            {result.years.map((y) => (
              <div
                key={`yh-${y.year}`}
                className="text-[10px] text-center text-muted-foreground"
              >
                Y{y.year + 1}
              </div>
            ))}
            {visibleBuckets.map((b) => (
              <RowTrend
                key={`tr-${b}`}
                bucket={b}
                schoolType={schoolType}
                years={result.years}
                testId={testId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RowTrend({
  bucket,
  schoolType,
  years,
  testId,
}: {
  bucket: RevenueSourceBucket;
  schoolType?: string;
  years: ReturnType<typeof computeRevenueSourceMix>["years"];
  testId: string;
}) {
  const color = getBucketColor(bucket, schoolType);
  return (
    <>
      <div className="text-[10px] text-muted-foreground truncate pr-1">
        {getBucketLabel(bucket, schoolType)}
      </div>
      {years.map((y) => {
        const share = y.sharesByBucket.get(bucket) ?? 0;
        return (
          <div
            key={`${bucket}-${y.year}`}
            className="h-3 rounded-sm bg-muted relative overflow-hidden"
            data-testid={`${testId}-trend-${bucket}-y${y.year + 1}`}
            title={`Y${y.year + 1} ${getBucketLabel(bucket, schoolType)}: ${share.toFixed(1)}%`}
          >
            <div
              style={{ width: `${Math.min(100, share)}%`, backgroundColor: color }}
              className="absolute inset-y-0 left-0"
            />
          </div>
        );
      })}
    </>
  );
}
