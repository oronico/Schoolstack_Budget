// Helpers for the admin sparkline tooltip. Kept in their own module so
// they can be unit-tested in isolation without dragging in the heavy
// admin page tree.
//
// The bucket-start timestamps come from /api/admin/cta-conversion as
// midnight UTC (day buckets) or Monday 00:00 UTC (week buckets) —
// postgres date_trunc semantics. We must format them in UTC, otherwise
// admins west of UTC would see "Mon Apr 27" for a bucket the API
// pinned to Apr 28. Using getUTC* (instead of date-fns' local-tz
// `format`) keeps the labels consistent with the values the route /
// regression test pin.

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatBucketLabel(
  iso: string,
  bucketUnit: "day" | "week" | null | undefined,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const month = MONTH_LABELS[d.getUTCMonth()];
  const day = d.getUTCDate();
  if (bucketUnit === "week") {
    return `Week of ${month} ${day}`;
  }
  const weekday = WEEKDAY_LABELS[d.getUTCDay()];
  return `${weekday} ${month} ${day}`;
}

export function pluralize(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}
