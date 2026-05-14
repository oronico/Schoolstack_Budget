/**
 * Task #860 EXPANDED — Per-seat funding mix view-model tests.
 *
 * Asserts that `buildPerSeatFundingMix` reuses the engine's
 * post-correction revenue dollars, so the founder-facing surface
 * (dashboard / packets) always reconciles to the workbook totals.
 */
import { describe, it, expect } from "vitest";
import { buildPerSeatFundingMix } from "../per-seat-funding-mix.js";

describe("buildPerSeatFundingMix", () => {
  it("returns null when there is no per-student tuition row", () => {
    const result = buildPerSeatFundingMix(
      [
        {
          id: "public_per_pupil",
          enabled: true,
          driverType: "per_student",
          category: "public_funding",
          amounts: [9000, 9000, 9000, 9000, 9000],
        },
      ],
      0,
      200,
    );
    expect(result).toBeNull();
  });

  it("returns null when enrollment is zero", () => {
    const result = buildPerSeatFundingMix(
      [
        {
          id: "gross_tuition",
          enabled: true,
          driverType: "per_student",
          category: "tuition_and_fees",
          amounts: [12000, 12000, 12000, 12000, 12000],
        },
      ],
      0,
      0,
    );
    expect(result).toBeNull();
  });

  it("treats per-student school_choice rows as funders of the SAME seat (residual family pay)", () => {
    const result = buildPerSeatFundingMix(
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
      0,
      100,
    );
    expect(result).not.toBeNull();
    // Funder per-seat reflects engine output (post-cap)
    expect(result!.funders).toHaveLength(1);
    expect(result!.funders[0].programType).toBe("voucher");
    expect(result!.funders[0].perSeat).toBeCloseTo(8000, 0);
    // Residual family pay = sticker - voucher = 12000 - 8000 = 4000
    expect(result!.familyPayPerSeat).toBeCloseTo(4000, 0);
    // Recognized per seat = full sticker (no double-count)
    expect(result!.recognizedPerSeat).toBeCloseTo(12000, 0);
  });

  it("caps combined funders at the net seat basis (engine prevents double-count)", () => {
    // ESA + voucher together exceed sticker — engine caps at sticker.
    const result = buildPerSeatFundingMix(
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
      0,
      50,
    );
    expect(result).not.toBeNull();
    // Total recognized cannot exceed the seat sticker.
    expect(result!.recognizedPerSeat).toBeLessThanOrEqual(10000.01);
    // Family pay clamps at zero — never negative.
    expect(result!.familyPayPerSeat).toBeGreaterThanOrEqual(-0.01);
  });

  it("classifies funder programType from row id", () => {
    const result = buildPerSeatFundingMix(
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
          amounts: [3000, 3000, 3000, 3000, 3000],
        },
        {
          id: "tax_credit_revenue",
          enabled: true,
          driverType: "per_student",
          category: "school_choice",
          amounts: [2000, 2000, 2000, 2000, 2000],
        },
      ],
      0,
      40,
    );
    const programs = result!.funders.map((f) => f.programType).sort();
    expect(programs).toEqual(["esa", "tax_credit"]);
  });
});
