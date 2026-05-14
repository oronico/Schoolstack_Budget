/**
 * Task #860 EXPANDED — Funding-mix v2 migration tests.
 */
import { describe, it, expect } from "vitest";
import {
  CURRENT_REVENUE_MODEL_VERSION,
  hasLegacyStackedPattern,
  migrateLegacyFundingMix,
} from "../funding-mix-migration.js";

const FIXED_NOW = () => "2026-01-01T00:00:00.000Z";

describe("migrateLegacyFundingMix", () => {
  it("is a no-op when revenueModelVersion is already current", () => {
    const model = {
      revenueModelVersion: CURRENT_REVENUE_MODEL_VERSION,
      revenueRows: [],
      enrollment: { year1: 100 },
    };
    const result = migrateLegacyFundingMix(model, FIXED_NOW);
    expect(result.applied).toBe(false);
    expect(result.data).toBe(model);
    expect(result.entry).toBeUndefined();
  });

  it("stamps v2 even when nothing to correct (no rows)", () => {
    const model = { revenueRows: [], enrollment: { year1: 0 } };
    const result = migrateLegacyFundingMix(model, FIXED_NOW);
    expect(result.applied).toBe(false);
    expect(result.data.revenueModelVersion).toBe(CURRENT_REVENUE_MODEL_VERSION);
  });

  it("records changelog entry with before/after Y1 revenue when legacy stacking exists", () => {
    // Stacked: ESA 7000 + voucher 6000 = 13000 > sticker 10000.
    const model = {
      enrollment: { year1: 100 },
      revenueRows: [
        {
          id: "gross_tuition",
          enabled: true,
          driverType: "per_student" as const,
          category: "tuition_and_fees",
          amounts: [10000, 10000, 10000, 10000, 10000],
        },
        {
          id: "esa_revenue",
          enabled: true,
          driverType: "per_student" as const,
          category: "school_choice",
          amounts: [7000, 7000, 7000, 7000, 7000],
        },
        {
          id: "voucher_revenue",
          enabled: true,
          driverType: "per_student" as const,
          category: "school_choice",
          amounts: [6000, 6000, 6000, 6000, 6000],
        },
      ],
    };
    const result = migrateLegacyFundingMix(model, FIXED_NOW);
    expect(result.applied).toBe(true);
    expect(result.data.revenueModelVersion).toBe(CURRENT_REVENUE_MODEL_VERSION);
    expect(result.entry).toBeDefined();
    // Naive: (10000 + 7000 + 6000) * 100 = 2,300,000
    expect(result.entry!.beforeY1Revenue).toBeCloseTo(2_300_000, 0);
    // Engine-corrected total stays at or below the sticker basis.
    expect(result.entry!.afterY1Revenue!).toBeLessThan(2_300_000);
    expect(result.entry!.deltaY1!).toBeLessThan(0);
    expect(result.entry!.appliedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.data.modelMigrations).toHaveLength(1);
  });

  it("appends to existing modelMigrations array", () => {
    const prior = {
      type: "some_other" as unknown as "funding_mix_v2",
      appliedAt: "2025-01-01T00:00:00.000Z",
      summary: "old",
    };
    const model = {
      enrollment: { year1: 50 },
      modelMigrations: [prior],
      revenueRows: [
        {
          id: "gross_tuition",
          enabled: true,
          driverType: "per_student" as const,
          category: "tuition_and_fees",
          amounts: [10000, 10000, 10000, 10000, 10000],
        },
        {
          id: "esa_revenue",
          enabled: true,
          driverType: "per_student" as const,
          category: "school_choice",
          amounts: [9000, 9000, 9000, 9000, 9000],
        },
        {
          id: "voucher_revenue",
          enabled: true,
          driverType: "per_student" as const,
          category: "school_choice",
          amounts: [5000, 5000, 5000, 5000, 5000],
        },
      ],
    };
    const result = migrateLegacyFundingMix(model, FIXED_NOW);
    expect(result.applied).toBe(true);
    expect(result.data.modelMigrations).toHaveLength(2);
    expect(result.data.modelMigrations![0]).toBe(prior);
  });
});

describe("hasLegacyStackedPattern", () => {
  it("uses tier-weighted net tuition (post-discount) as the basis", () => {
    // Sticker $10k, but a 50% scholarship tier on every seat → net = $5k.
    // ESA $8k > $5k → stacked, even though $8k < raw sticker $10k.
    const rows: any = [
      {
        id: "gross_tuition",
        enabled: true,
        driverType: "per_student",
        category: "tuition_and_fees",
        amounts: [10000, 10000, 10000, 10000, 10000],
      },
      {
        id: "esa_revenue",
        enabled: true,
        driverType: "per_student",
        category: "school_choice",
        amounts: [8000, 8000, 8000, 8000, 8000],
      },
    ];
    const tiers: any = [
      { discountPercent: 50, studentCounts: [100, 100, 100, 100, 100] },
    ];
    expect(hasLegacyStackedPattern(rows, 100, tiers)).toBe(true);
    // Without tiers it would be missed (8000 < 10000).
    expect(hasLegacyStackedPattern(rows, 100)).toBe(false);
  });

  it("returns false when there is no per-student tuition row", () => {
    expect(
      hasLegacyStackedPattern(
        [
          {
            id: "public_per_pupil",
            enabled: true,
            driverType: "per_student",
            category: "public_funding",
            amounts: [9000, 9000, 9000, 9000, 9000],
          },
        ],
        100,
      ),
    ).toBe(false);
  });

  it("returns false when school_choice funder ≤ tuition", () => {
    expect(
      hasLegacyStackedPattern(
        [
          {
            id: "gross_tuition",
            enabled: true,
            driverType: "per_student",
            category: "tuition_and_fees",
            amounts: [12000, 12000, 12000, 12000, 12000],
          },
          {
            id: "voucher_revenue",
            enabled: true,
            driverType: "per_student",
            category: "school_choice",
            amounts: [8000, 8000, 8000, 8000, 8000],
          },
        ],
        100,
      ),
    ).toBe(false);
  });

  it("returns true when ESA + voucher exceeds tuition in any year", () => {
    expect(
      hasLegacyStackedPattern(
        [
          {
            id: "gross_tuition",
            enabled: true,
            driverType: "per_student",
            category: "tuition_and_fees",
            amounts: [10000, 10000, 10000, 10000, 10000],
          },
          {
            id: "esa_revenue",
            enabled: true,
            driverType: "per_student",
            category: "school_choice",
            amounts: [7000, 7000, 7000, 7000, 7000],
          },
          {
            id: "voucher_revenue",
            enabled: true,
            driverType: "per_student",
            category: "school_choice",
            amounts: [6000, 6000, 6000, 6000, 6000],
          },
        ],
        100,
      ),
    ).toBe(true);
  });
});
