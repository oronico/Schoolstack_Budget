import { describe, expect, it } from "vitest";
import {
  formatPerFte,
  formatPerStudent,
  perStudentValue,
} from "../per-student-lens";

describe("formatPerStudent", () => {
  it("formats a positive total against y1 enrollment", () => {
    expect(formatPerStudent(100_000, 50)).toBe("$2,000 / student / yr");
  });

  it("rounds to the nearest whole dollar", () => {
    expect(formatPerStudent(10_001, 7)).toBe("$1,429 / student / yr");
  });

  it("returns the placeholder when enrollment is zero", () => {
    expect(formatPerStudent(100_000, 0)).toBe("-");
  });

  it("returns the placeholder when enrollment is negative", () => {
    expect(formatPerStudent(100_000, -5)).toBe("-");
  });

  it("returns the placeholder when total is non-finite", () => {
    expect(formatPerStudent(NaN, 25)).toBe("-");
    expect(formatPerStudent(Infinity, 25)).toBe("-");
  });

  it("returns the placeholder when enrollment is NaN", () => {
    expect(formatPerStudent(50_000, NaN)).toBe("-");
  });

  it("formats negative totals (e.g. tuition discounts) as negative currency by default", () => {
    expect(formatPerStudent(-12_000, 30)).toBe("-$400 / student / yr");
  });

  it("clamps negatives to zero when allowNegative is false", () => {
    expect(formatPerStudent(-12_000, 30, { allowNegative: false })).toBe(
      "$0 / student / yr",
    );
  });

  it("supports a custom suffix for partial-year scenarios", () => {
    expect(formatPerStudent(45_000, 30, { suffix: " / student / partial yr" })).toBe(
      "$1,500 / student / partial yr",
    );
  });
});

describe("formatPerFte", () => {
  it("formats a category total against total FTE", () => {
    expect(formatPerFte(420_000, 6)).toBe("$70,000 / FTE");
  });

  it("returns the placeholder when total FTE is zero (per-fte vs flat driver)", () => {
    expect(formatPerFte(420_000, 0)).toBe("-");
  });

  it("returns the placeholder when inputs are non-finite", () => {
    expect(formatPerFte(NaN, 5)).toBe("-");
    expect(formatPerFte(420_000, Infinity)).toBe("-");
  });

  it("rounds fractional FTE divisions to whole dollars", () => {
    expect(formatPerFte(100_000, 3.5)).toBe("$28,571 / FTE");
  });
});

describe("perStudentValue", () => {
  it("returns the raw quotient when enrollment is positive", () => {
    expect(perStudentValue(75_000, 30)).toBe(2_500);
  });

  it("returns null on zero enrollment (divide-by-zero guard)", () => {
    expect(perStudentValue(75_000, 0)).toBeNull();
  });

  it("returns null on non-finite inputs", () => {
    expect(perStudentValue(NaN, 30)).toBeNull();
    expect(perStudentValue(75_000, NaN)).toBeNull();
  });
});
