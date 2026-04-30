import { describe, it, expect } from "vitest";
import {
  buildCapInsightText,
  computePayrollTaxCapSavings,
  type PayrollTaxCapInsight,
} from "@workspace/finance";

/**
 * Task #323 — persona-tone snapshot for the wage-base-cap coaching insight.
 *
 * `buildCapInsightText` flexes its wording on `personaComfort`:
 *   - "new_to_budgeting" gets a plain-English sentence (no blended-rate %).
 *   - "comfortable" / null get the technical wording with the blended rate.
 *
 * Future copy edits must keep:
 *   - the named capped components + their wage bases
 *   - the rounded $/yr savings figure
 *   - the persona-specific phrasing (the literal "saves about $X" for the
 *     plain-English variant; the literal "blended rate" mention for the
 *     technical variant)
 *
 * If you intentionally rewrite this copy, update the snapshot strings below
 * with the same care for tone.
 */

const FICA_OASDI_2025_WAGE_BASE = 176_100;

function buildInsightAtHeadOfSchoolSalary(): PayrollTaxCapInsight {
  // A salary that exceeds the OASDI wage base but not Medicare (uncapped),
  // matching the engine-level fixture in payroll-tax-cap-escalation.test.ts.
  const insight = computePayrollTaxCapSavings(250_000, [
    { label: "FICA-OASDI", rate: 6.2, wageBase: FICA_OASDI_2025_WAGE_BASE },
    { label: "Medicare", rate: 1.45 },
  ]);
  if (!insight) {
    throw new Error(
      "Test fixture invariant broken: salary should exceed at least one wage base."
    );
  }
  return insight;
}

function buildMultiCapInsight(): PayrollTaxCapInsight {
  // Two capped components so we can lock the comma + "and" join.
  const insight = computePayrollTaxCapSavings(60_000, [
    { label: "State UI", rate: 2.7, wageBase: 10_000 },
    { label: "State DI", rate: 1.0, wageBase: 20_000 },
    { label: "Medicare", rate: 1.45 },
  ]);
  if (!insight) throw new Error("multi-cap fixture should produce an insight");
  return insight;
}

describe("buildCapInsightText (persona tone contract)", () => {
  describe("single capped component", () => {
    const insight = buildInsightAtHeadOfSchoolSalary();
    const expectedSavings = `$${Math.round(insight.savings).toLocaleString()}/yr`;
    const expectedLabel = `FICA-OASDI ($${FICA_OASDI_2025_WAGE_BASE.toLocaleString()})`;

    it("renders the plain-English wording for new-to-budgeting founders", () => {
      const text = buildCapInsightText(insight, "new_to_budgeting");

      // Tone-specific phrasing: plain-English wording uses "saves about" and
      // never mentions the blended-rate percentage.
      expect(text).toContain("saves about");
      expect(text).not.toMatch(/blended rate/i);
      expect(text).not.toMatch(/\d+\.\d{2}%/);

      // Named capped component (label + wage base in dollars).
      expect(text).toContain(expectedLabel);

      // Dollar savings figure (rounded, with /yr suffix).
      expect(text).toContain(expectedSavings);

      // Snapshot the full sentence so accidental copy churn is loud.
      expect(text).toBe(
        `This salary is over the wage-base cap for ${expectedLabel}, so we stop charging payroll tax above those limits — saves about ${expectedSavings} vs. a flat estimate.`
      );
    });

    it("renders the technical wording for comfortable founders", () => {
      const text = buildCapInsightText(insight, "comfortable");

      // Tone-specific phrasing: technical wording cites the blended rate.
      expect(text).toContain("blended rate");
      expect(text).toContain(`${insight.flatRate.toFixed(2)}%`);
      expect(text).not.toContain("saves about");

      // Named capped component + dollar savings.
      expect(text).toContain(expectedLabel);
      expect(text).toContain(`saves ${expectedSavings}`);

      // Full snapshot.
      expect(text).toBe(
        `Wage-base caps hit on ${expectedLabel}. Wage-base-aware math saves ${expectedSavings} vs. a flat ${insight.flatRate.toFixed(2)}% blended rate.`
      );
    });

    it("falls back to the technical wording when persona comfort is unknown (legacy users)", () => {
      const text = buildCapInsightText(insight, null);
      expect(text).toBe(
        `Wage-base caps hit on ${expectedLabel}. Wage-base-aware math saves ${expectedSavings} vs. a flat ${insight.flatRate.toFixed(2)}% blended rate.`
      );
    });
  });

  describe("multiple capped components", () => {
    const insight = buildMultiCapInsight();
    const expectedSavings = `$${Math.round(insight.savings).toLocaleString()}/yr`;
    const labelA = `State UI ($${(10_000).toLocaleString()})`;
    const labelB = `State DI ($${(20_000).toLocaleString()})`;

    it("joins exactly two capped components with ' and ' in both persona variants", () => {
      const plain = buildCapInsightText(insight, "new_to_budgeting");
      const technical = buildCapInsightText(insight, "comfortable");

      expect(plain).toContain(`${labelA} and ${labelB}`);
      expect(technical).toContain(`${labelA} and ${labelB}`);

      // Both still carry the dollar savings.
      expect(plain).toContain(expectedSavings);
      expect(technical).toContain(expectedSavings);

      // And keep their tone markers.
      expect(plain).toContain("saves about");
      expect(technical).toContain("blended rate");
    });
  });
});
