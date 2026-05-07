// Task #569 — admin sparkline tooltip label formatting.
//
// The /api/admin/cta-conversion route returns trendBucketStarts at
// midnight UTC (day buckets) or Monday 00:00 UTC (week buckets). The
// admin tooltip must label each bucket using the UTC calendar — if it
// falls back to the browser's local timezone, an admin in a negative
// offset would see "Mon Apr 27" for a bucket the API/regression test
// pinned to Apr 28, breaking the contract that tooltip dates name the
// same day the route's date_trunc snapped to.
//
// We pin formatBucketLabel against known UTC timestamps so a future
// regression that re-introduces date-fns' local-tz `format` would fail
// here regardless of the host's $TZ.

import { describe, it, expect } from "vitest";
import { formatBucketLabel, pluralize } from "../sparkline-bucket-label";

describe("formatBucketLabel", () => {
  it("formats a day bucket with weekday + month + day in UTC", () => {
    // 2026-04-28 is a Tuesday in UTC.
    expect(formatBucketLabel("2026-04-28T00:00:00.000Z", "day")).toBe(
      "Tue Apr 28",
    );
  });

  it("formats a week bucket as 'Week of <Mon> <day>' in UTC", () => {
    // 2026-04-27 is a Monday in UTC (start of the ISO week).
    expect(formatBucketLabel("2026-04-27T00:00:00.000Z", "week")).toBe(
      "Week of Apr 27",
    );
  });

  it("uses UTC even when the local timezone would land on a different calendar day", () => {
    // A midnight-UTC timestamp that, in any negative-offset timezone,
    // would fall on the previous calendar day if we used local-tz
    // formatting. Asserting "Apr 28" (not "Apr 27") catches the
    // regression the code review flagged: date-fns' `format` would
    // return "Mon Apr 27" on a host running in PT/EST while UTC is
    // already on Tue Apr 28.
    const iso = "2026-04-28T00:00:00.000Z";
    const label = formatBucketLabel(iso, "day");
    // The exact weekday (Tue) and the day-of-month (28) come from UTC.
    expect(label).toContain("Apr 28");
    expect(label.startsWith("Tue ")).toBe(true);
  });

  it("falls back to the raw string for an unparseable input", () => {
    expect(formatBucketLabel("not-a-date", "day")).toBe("not-a-date");
  });

  it("treats a null bucketUnit the same as 'day'", () => {
    expect(formatBucketLabel("2026-04-28T00:00:00.000Z", null)).toBe(
      "Tue Apr 28",
    );
  });
});

describe("pluralize", () => {
  it("uses the singular form for exactly 1", () => {
    expect(pluralize(1, "impression")).toBe("1 impression");
    expect(pluralize(1, "click")).toBe("1 click");
  });

  it("appends 's' for 0 or any value > 1", () => {
    expect(pluralize(0, "impression")).toBe("0 impressions");
    expect(pluralize(3, "click")).toBe("3 clicks");
  });
});
