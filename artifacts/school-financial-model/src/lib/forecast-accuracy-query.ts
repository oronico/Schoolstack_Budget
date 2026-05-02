import { ACCURACY_METRICS, type AccuracyMetricKey } from "@workspace/finance";

const ACCURACY_METRIC_KEYS = new Set<string>(
  ACCURACY_METRICS.map((m) => m.key),
);

export interface ForecastFilterQueryParams {
  metric: AccuracyMetricKey | null;
  asOfYear: number | null;
}

export function readForecastFilterFromSearch(
  search: string,
): ForecastFilterQueryParams {
  const params = new URLSearchParams(search);
  const rawMetric = params.get("metric");
  const metric: AccuracyMetricKey | null =
    rawMetric && ACCURACY_METRIC_KEYS.has(rawMetric)
      ? (rawMetric as AccuracyMetricKey)
      : null;
  const rawYear = params.get("asOfYear");
  const yearNum = rawYear !== null ? Number(rawYear) : NaN;
  const asOfYear =
    Number.isInteger(yearNum) && yearNum >= 1 && yearNum <= 5 ? yearNum : null;
  return { metric, asOfYear };
}

export function buildForecastFilterQuery(): string {
  if (typeof window === "undefined") return "";
  const { metric, asOfYear } = readForecastFilterFromSearch(
    window.location.search,
  );
  const out = new URLSearchParams();
  if (metric) out.set("metric", metric);
  if (asOfYear !== null) out.set("asOfYear", String(asOfYear));
  const query = out.toString();
  return query ? `?${query}` : "";
}
