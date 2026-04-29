import { describe, expect, it } from "vitest";
import {
  DEFAULT_STALE_THRESHOLD_MS,
  computeSnapshotStaleness,
} from "../AccountingConnectionCard";

const NOW = Date.parse("2026-04-29T12:00:00Z");
const HOUR = 3_600_000;

describe("computeSnapshotStaleness", () => {
  it("returns null when the timestamp is missing", () => {
    expect(computeSnapshotStaleness(null, NOW)).toBeNull();
    expect(computeSnapshotStaleness(undefined, NOW)).toBeNull();
  });

  it("returns null when the timestamp is unparseable", () => {
    expect(computeSnapshotStaleness("not-a-date", NOW)).toBeNull();
  });

  it("is fresh when the snapshot is younger than the threshold", () => {
    const synced = new Date(NOW - 12 * HOUR).toISOString();
    const result = computeSnapshotStaleness(synced, NOW);
    expect(result).not.toBeNull();
    expect(result!.stale).toBe(false);
    expect(result!.ageLabel).toBe("12 hours");
  });

  it("is fresh just under the default 36h threshold", () => {
    const synced = new Date(NOW - (DEFAULT_STALE_THRESHOLD_MS - HOUR)).toISOString();
    const result = computeSnapshotStaleness(synced, NOW);
    expect(result!.stale).toBe(false);
  });

  it("is stale at exactly the threshold and reports days when >= 24h", () => {
    const synced = new Date(NOW - DEFAULT_STALE_THRESHOLD_MS).toISOString();
    const result = computeSnapshotStaleness(synced, NOW);
    expect(result!.stale).toBe(true);
    // 36h floors to 1 day.
    expect(result!.ageLabel).toBe("1 day");
  });

  it("formats multi-day ages with plural 'days'", () => {
    const synced = new Date(NOW - 3 * 24 * HOUR).toISOString();
    const result = computeSnapshotStaleness(synced, NOW);
    expect(result!.stale).toBe(true);
    expect(result!.ageLabel).toBe("3 days");
  });

  it("respects a custom threshold override", () => {
    const synced = new Date(NOW - 2 * HOUR).toISOString();
    // Default would say "fresh" at 2h; with a 1h threshold it's stale.
    expect(computeSnapshotStaleness(synced, NOW, HOUR)!.stale).toBe(true);
    expect(computeSnapshotStaleness(synced, NOW, 4 * HOUR)!.stale).toBe(false);
  });

  it("treats future-dated timestamps as zero-age (not negative)", () => {
    const synced = new Date(NOW + 5 * HOUR).toISOString();
    const result = computeSnapshotStaleness(synced, NOW);
    expect(result!.stale).toBe(false);
    expect(result!.ageLabel).toBe("0 hours");
  });
});
