// "Forecast accuracy" roll-up section for the Scenarios page.
//
// Lists every Pursued saved scenario that has actuals captured and shows
// projected vs actual side-by-side per metric, with a colored % delta. A
// summary band at the top calls out aggregate tendencies ("you tend to
// over-project enrollment by 5%") so founders can spot consistent biases
// across all their past decisions, not just one card at a time.

import { useCallback, useMemo } from "react";
import { useSearchParams } from "wouter";
import { TrendingDown, TrendingUp, Target, CheckCircle2, X } from "lucide-react";
import {
  ACCURACY_METRICS,
  describeTendency,
  filterForecastAccuracy,
  type AccuracyMetricKey,
  type AccuracyMetricMeta,
  type ForecastAccuracyAggregate,
  type ForecastAccuracyEntry,
  type ForecastAccuracyRollup,
} from "@/lib/forecast-accuracy";
import { DECISION_LABELS, DECISION_THEME } from "@/lib/decision-flows";

// Stable list of metric keys for URL parsing — kept in sync with the
// AccuracyMetricKey union so an unknown / legacy `?metric=` value falls
// back to "no filter" rather than rendering an empty surface.
const METRIC_KEYS: AccuracyMetricKey[] = ACCURACY_METRICS.map((m) => m.key);

// Year filter chips. Model years run 1-5 in the rest of the app; we still
// only render chips for years present in the rollup so a fresh founder
// doesn't see five empty buttons.
const YEAR_OPTIONS: number[] = [1, 2, 3, 4, 5];

function fmtMoney(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

function fmtCount(v: number): string {
  return Math.round(v).toLocaleString();
}

function fmtMetric(meta: AccuracyMetricMeta, v: number): string {
  return meta.kind === "money" ? fmtMoney(v) : fmtCount(v);
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

// Pick a tone for a single per-scenario row's delta, mirroring the
// betterWhen logic from ActualsLine on the saved-scenario card so the
// coloring stays consistent between the two surfaces.
function deltaTone(
  meta: AccuracyMetricMeta,
  deltaPct: number | null,
): "good" | "bad" | "neutral" {
  if (deltaPct === null || Math.abs(deltaPct) < 0.5) return "neutral";
  const isGood =
    meta.betterWhen === "higher" ? deltaPct > 0 : deltaPct < 0;
  return isGood ? "good" : "bad";
}

function toneClasses(tone: "good" | "bad" | "neutral"): string {
  if (tone === "good") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (tone === "bad") return "text-rose-700 bg-rose-50 border-rose-200";
  return "text-muted-foreground bg-muted/40 border-border/60";
}

function fmtPct(deltaPct: number | null): string {
  if (deltaPct === null) return "—";
  if (Math.abs(deltaPct) < 0.5) return "on plan";
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(0)}%`;
}

function metricMetaByKey(key: AccuracyMetricKey): AccuracyMetricMeta {
  // ACCURACY_METRICS is small (6 entries) and stable — a linear find here
  // keeps the lookup readable without prebuilding a map.
  return ACCURACY_METRICS.find((m) => m.key === key)!;
}

function AggregateCard({ agg }: { agg: ForecastAccuracyAggregate }) {
  const meta = metricMetaByKey(agg.metric);
  const tendency = describeTendency(meta, agg.meanDeltaPct);
  const tone = tendency.tone;
  const Icon =
    tone === "good" ? TrendingUp : tone === "bad" ? TrendingDown : Target;
  return (
    <div
      className={`rounded-xl border p-3 ${toneClasses(tone)}`}
      data-testid={`forecast-accuracy-aggregate-${agg.metric}`}
    >
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
            {meta.label}
          </p>
          <p className="text-xs font-medium leading-snug" data-testid={`forecast-accuracy-aggregate-text-${agg.metric}`}>
            {tendency.text}
          </p>
          <p className="text-[10px] opacity-80 mt-1 font-mono">
            mean {agg.meanDeltaPct >= 0 ? "+" : ""}
            {agg.meanDeltaPct.toFixed(1)}% · median {agg.medianDeltaPct >= 0 ? "+" : ""}
            {agg.medianDeltaPct.toFixed(1)}% · {agg.count} {agg.count === 1 ? "decision" : "decisions"}
          </p>
        </div>
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  idx,
  metricFilter,
}: {
  entry: ForecastAccuracyEntry;
  idx: number;
  metricFilter: AccuracyMetricKey | null;
}) {
  const cs = entry.scenario;
  const decisionTheme = cs.decisionType ? DECISION_THEME[cs.decisionType] : null;
  const decisionLabel = cs.decisionType ? DECISION_LABELS[cs.decisionType] : null;
  // Render metrics in the canonical ACCURACY_METRICS order so columns line
  // up across rows even when one scenario captured fewer metrics. When a
  // metric filter is active, collapse the table to just that metric so the
  // card answers the question the founder asked ("show me only enrollment
  // accuracy") rather than burying it among other rows.
  const orderedMetricEntries = ACCURACY_METRICS.map((meta) => ({
    meta,
    delta: entry.metrics[meta.key],
  }))
    .filter((p) => !!p.delta)
    .filter((p) => !metricFilter || p.meta.key === metricFilter);
  return (
    <div
      className="bg-card border border-border/60 rounded-xl p-4 shadow-sm"
      data-testid={`forecast-accuracy-entry-${idx}`}
    >
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 mb-1">
            {decisionLabel && decisionTheme && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${decisionTheme.bg} ${decisionTheme.text} border ${decisionTheme.border}`}
                data-testid={`forecast-accuracy-entry-decision-${idx}`}
              >
                {decisionLabel}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-emerald-50 text-emerald-800 border-emerald-200"
            >
              <CheckCircle2 className="h-3 w-3" /> Pursued
            </span>
          </div>
          <h3
            className="font-display font-semibold text-foreground truncate"
            data-testid={`forecast-accuracy-entry-name-${idx}`}
          >
            {cs.name}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Year {entry.asOfYear} actuals
            {cs.actuals?.updatedAt && (
              <span> · Updated {fmtDate(cs.actuals.updatedAt)}</span>
            )}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid={`forecast-accuracy-entry-table-${idx}`}>
          <thead>
            <tr className="text-muted-foreground border-b border-border/60">
              <th className="py-1.5 pr-3 text-left font-semibold uppercase tracking-wider text-[10px]">
                Metric
              </th>
              <th className="py-1.5 px-3 text-right font-semibold uppercase tracking-wider text-[10px]">
                Projected
              </th>
              <th className="py-1.5 px-3 text-right font-semibold uppercase tracking-wider text-[10px]">
                Actual
              </th>
              <th className="py-1.5 pl-3 text-right font-semibold uppercase tracking-wider text-[10px]">
                Delta
              </th>
            </tr>
          </thead>
          <tbody>
            {orderedMetricEntries.map(({ meta, delta }) => {
              if (!delta) return null;
              const tone = deltaTone(meta, delta.deltaPct);
              return (
                <tr
                  key={meta.key}
                  className="border-b border-border/40 last:border-0"
                  data-testid={`forecast-accuracy-entry-${idx}-row-${meta.key}`}
                >
                  <td className="py-1.5 pr-3 text-foreground font-medium">{meta.label}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-foreground/80">
                    {fmtMetric(meta, delta.projected)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-foreground">
                    {fmtMetric(meta, delta.actual)}
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded border font-mono text-[10px] font-semibold ${toneClasses(tone)}`}
                      data-testid={`forecast-accuracy-entry-${idx}-delta-${meta.key}`}
                    >
                      {fmtPct(delta.deltaPct)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cs.actuals?.notes && (
        <p
          className="text-[11px] italic text-foreground/70 pt-2 mt-2 border-t border-border/40"
          data-testid={`forecast-accuracy-entry-${idx}-notes`}
        >
          {cs.actuals.notes}
        </p>
      )}
    </div>
  );
}

export function ForecastAccuracyView({ rollup }: { rollup: ForecastAccuracyRollup }) {
  // URL-driven filter state. We mirror the saved-scenarios toolbar's pattern
  // (page-level `?outcome=…&sort=…&q=…`) so a founder can paste a "show me
  // only Year 1 enrollment accuracy" link to a co-founder and land on the
  // same view. Unknown / legacy values quietly fall back to "no filter" so
  // a stale link never renders an empty surface.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawMetric = searchParams.get("metric");
  const metricFilter: AccuracyMetricKey | null = METRIC_KEYS.includes(
    rawMetric as AccuracyMetricKey,
  )
    ? (rawMetric as AccuracyMetricKey)
    : null;
  const rawYear = searchParams.get("asOfYear");
  const yearFilter: number | null = (() => {
    if (!rawYear) return null;
    const n = Number(rawYear);
    return Number.isInteger(n) && YEAR_OPTIONS.includes(n) ? n : null;
  })();

  const setMetric = useCallback(
    (next: AccuracyMetricKey | null) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (!next) sp.delete("metric");
          else sp.set("metric", next);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setYear = useCallback(
    (next: number | null) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (next === null) sp.delete("asOfYear");
          else sp.set("asOfYear", String(next));
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Years that actually have data — drives which year chips render so we
  // don't show "Year 4" when nobody has captured Year 4 actuals yet.
  const availableYears = useMemo(() => {
    const seen = new Set<number>();
    for (const e of rollup.entries) seen.add(e.asOfYear);
    return YEAR_OPTIONS.filter((y) => seen.has(y));
  }, [rollup.entries]);

  // Metrics that any entry captured — used to dim chips for metrics that
  // wouldn't return a single entry, matching the visual pattern of the
  // saved-scenarios outcome chips (count badge + active state).
  const metricCounts = useMemo(() => {
    const counts: Partial<Record<AccuracyMetricKey, number>> = {};
    for (const e of rollup.entries) {
      for (const key of METRIC_KEYS) {
        if (e.metrics[key]) counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [rollup.entries]);

  const filtered = useMemo(
    () => filterForecastAccuracy(rollup, { metric: metricFilter, asOfYear: yearFilter }),
    [rollup, metricFilter, yearFilter],
  );

  const hasFilter = metricFilter !== null || yearFilter !== null;
  const clearFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete("metric");
        sp.delete("asOfYear");
        return sp;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const { entries, aggregates } = filtered;

  return (
    <div className="mb-10" data-testid="forecast-accuracy-section">
      <div className="flex items-center gap-2 mb-2">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-bold text-foreground">Forecast accuracy</h2>
        <span
          className="text-sm text-muted-foreground"
          data-testid="forecast-accuracy-count"
        >
          ({entries.length}
          {hasFilter ? ` of ${rollup.entries.length}` : ""})
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        See how each pursued decision actually landed against your projection,
        and spot patterns across all your past forecasts.
      </p>

      {/* Filter toolbar — metric and year chips persist to ?metric=…&asOfYear=…
          so a chosen slice survives reloads and is shareable. The aggregate
          band below recomputes against the filtered set. */}
      <div
        className="flex flex-col gap-2 mb-4 p-3 rounded-xl border border-border/60 bg-muted/20"
        data-testid="forecast-accuracy-filters"
      >
        <div className="flex items-center flex-wrap gap-2">
          <span
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            id="forecast-accuracy-metric-label"
          >
            Metric
          </span>
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-labelledby="forecast-accuracy-metric-label"
            data-testid="forecast-accuracy-metric-chips"
          >
            <button
              type="button"
              onClick={() => setMetric(null)}
              aria-pressed={metricFilter === null}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                metricFilter === null
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
              data-testid="forecast-accuracy-metric-all"
            >
              All
            </button>
            {ACCURACY_METRICS.map((meta) => {
              const count = metricCounts[meta.key] ?? 0;
              const active = metricFilter === meta.key;
              const disabled = count === 0;
              return (
                <button
                  key={meta.key}
                  type="button"
                  onClick={() => setMetric(active ? null : meta.key)}
                  aria-pressed={active}
                  disabled={disabled}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  } ${disabled ? "opacity-40 cursor-not-allowed hover:bg-background" : ""}`}
                  data-testid={`forecast-accuracy-metric-${meta.key}`}
                >
                  {meta.label}
                  <span
                    className={`text-[10px] tabular-nums ${
                      active ? "opacity-90" : "opacity-70"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {availableYears.length > 0 && (
          <div className="flex items-center flex-wrap gap-2">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              id="forecast-accuracy-year-label"
            >
              Year
            </span>
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-labelledby="forecast-accuracy-year-label"
              data-testid="forecast-accuracy-year-chips"
            >
              <button
                type="button"
                onClick={() => setYear(null)}
                aria-pressed={yearFilter === null}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  yearFilter === null
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
                data-testid="forecast-accuracy-year-all"
              >
                All
              </button>
              {availableYears.map((y) => {
                const active = yearFilter === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setYear(active ? null : y)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                    data-testid={`forecast-accuracy-year-${y}`}
                  >
                    Year {y}
                  </button>
                );
              })}
            </div>
            {hasFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
                data-testid="forecast-accuracy-clear-filters"
              >
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
          </div>
        )}
        {availableYears.length === 0 && hasFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="self-end inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
            data-testid="forecast-accuracy-clear-filters"
          >
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}
      </div>

      {aggregates.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5"
          data-testid="forecast-accuracy-aggregates"
        >
          {aggregates.map((agg) => (
            <AggregateCard key={agg.metric} agg={agg} />
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div
          className="bg-muted/30 border border-dashed border-border rounded-2xl px-5 py-8 text-center"
          data-testid="forecast-accuracy-empty"
        >
          <p className="text-sm text-muted-foreground">
            No pursued decisions match this filter yet.
          </p>
          {hasFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-background text-foreground border-border hover:bg-muted"
              data-testid="forecast-accuracy-empty-clear"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="forecast-accuracy-entries">
          {entries.map((entry, idx) => (
            <EntryRow
              key={`${entry.scenario.name}-${entry.scenario.createdAt}`}
              entry={entry}
              idx={idx}
              metricFilter={metricFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}
