import { useMemo } from "react";
import {
  computeRevenueSourceMix,
  getBucketColor,
  getBucketLabel,
  getPhilanthropyBucket,
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

  const philanthropyBucket = getPhilanthropyBucket(schoolType);
  const philanthropyTotal = y1?.totalsByBucket.get(philanthropyBucket) ?? 0;
  const philanthropyRestricted =
    y1?.restrictedByBucket.get(philanthropyBucket) ?? 0;
  const restrictedShareOfPhilanthropy =
    philanthropyTotal > 0
      ? (philanthropyRestricted / philanthropyTotal) * 100
      : 0;
  const philanthropyLabel = getBucketLabel(philanthropyBucket, schoolType);
  const restrictedTooltip = `Restricted gifts are donor-earmarked (capital, program, scholarship) and excluded from operating cash, so they don't count toward DSCR or runway.`;

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
          const color = getBucketColor(b, schoolType);
          // Split the philanthropy bucket into unrestricted | restricted so
          // the donor-earmarked portion reads visually as a separate band.
          if (b === philanthropyBucket && philanthropyRestricted > 0) {
            const restrictedSlice =
              y1.total > 0
                ? (philanthropyRestricted / y1.total) * 100
                : 0;
            const unrestrictedSlice = Math.max(0, share - restrictedSlice);
            return (
              <div
                key={b}
                data-testid={`${testId}-y1-segment-${b}`}
                className="flex h-full"
                style={{ width: `${share}%` }}
                title={`${getBucketLabel(b, schoolType)}: ${pct(share)} (${pct(restrictedShareOfPhilanthropy)} restricted)`}
              >
                {unrestrictedSlice > 0 && (
                  <div
                    data-testid={`${testId}-y1-segment-${b}-unrestricted`}
                    style={{
                      width: `${(unrestrictedSlice / share) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                )}
                <div
                  data-testid={`${testId}-y1-segment-${b}-restricted`}
                  style={{
                    width: `${(restrictedSlice / share) * 100}%`,
                    backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 4px, rgba(0,0,0,0.35) 4px 8px)`,
                  }}
                  title={`Restricted ${getBucketLabel(b, schoolType).toLowerCase()}: ${pct(restrictedShareOfPhilanthropy)} of philanthropy`}
                />
              </div>
            );
          }
          return (
            <div
              key={b}
              data-testid={`${testId}-y1-segment-${b}`}
              style={{
                width: `${share}%`,
                backgroundColor: color,
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
          const showRestrictedNote =
            b === philanthropyBucket && philanthropyRestricted > 0;
          return (
            <li
              key={b}
              data-testid={`${testId}-row-${b}`}
              className="text-xs"
            >
              <div className="flex items-center justify-between">
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
              </div>
              {showRestrictedNote && (
                <p
                  data-testid={`${testId}-philanthropy-restricted-note`}
                  className="mt-1 ml-[18px] text-[11px] text-muted-foreground leading-snug"
                  title={restrictedTooltip}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 rounded-sm mr-1.5 align-middle"
                    style={{
                      backgroundImage: `repeating-linear-gradient(45deg, ${getBucketColor(b, schoolType)} 0 3px, rgba(0,0,0,0.35) 3px 6px)`,
                    }}
                  />
                  <span
                    data-testid={`${testId}-philanthropy-restricted-pct`}
                    className="font-semibold text-foreground"
                  >
                    {pct(restrictedShareOfPhilanthropy)}
                  </span>{" "}
                  of {philanthropyLabel.toLowerCase()} is restricted (
                  {formatCurrency(philanthropyRestricted)}) — excluded from
                  operating cash
                </p>
              )}
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
