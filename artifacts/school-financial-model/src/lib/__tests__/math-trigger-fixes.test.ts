import { describe, it, expect } from "vitest";
import {
  computePayrollTaxForSalary,
  computeEffectivePayrollTaxRate,
  STATE_PAYROLL_TAX_MAP,
  getStatePayrollTaxEntry,
  type PayrollTaxComponent,
} from "../state-payroll-tax-data";
import {
  STATE_ENTITY_FEES,
  getStateEntityFeeProfile,
  buildEntityFeeAmounts,
  type EntityFeeProfile,
} from "../state-entity-fees";
import {
  generateDefaultExpenseRows,
  STATE_ENTITY_FEE_LINE_ITEM,
  STATE_ENTITY_FEE_ROW_ID,
} from "../expense-defaults";

const EXPECTED_JURISDICTIONS = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

// =============================================================================
// F1 — Payroll-tax wage-base caps
// =============================================================================

describe("F1: payroll-tax wage-base caps", () => {
  it("STATE_PAYROLL_TAX_MAP covers all 51 jurisdictions", () => {
    const keys = Object.keys(STATE_PAYROLL_TAX_MAP).sort();
    expect(keys).toEqual([...EXPECTED_JURISDICTIONS].sort());
  });

  it("every state entry exposes payroll components with non-negative rates and (when present) wageBase > 0", () => {
    for (const code of EXPECTED_JURISDICTIONS) {
      const entry = STATE_PAYROLL_TAX_MAP[code];
      expect(entry).toBeDefined();
      expect(Array.isArray(entry.components)).toBe(true);
      expect(entry.components.length).toBeGreaterThan(0);
      for (const c of entry.components) {
        expect(c.rate).toBeGreaterThanOrEqual(0);
        expect(typeof c.label).toBe("string");
        if (c.wageBase !== undefined) {
          expect(c.wageBase).toBeGreaterThan(0);
        }
      }
    }
  });

  it("computePayrollTaxForSalary applies per-component wage-base caps", () => {
    // Two-component example: FICA-OASDI capped at $176,100 + Medicare uncapped
    const components: PayrollTaxComponent[] = [
      { label: "FICA-OASDI", rate: 6.2, wageBase: 176100 },
      { label: "Medicare", rate: 1.45 }, // uncapped
    ];
    // Salary $200k: OASDI on $176,100 only, Medicare on $200k
    const dollars = computePayrollTaxForSalary(200_000, components);
    const expected = 176_100 * 0.062 + 200_000 * 0.0145;
    expect(dollars).toBeCloseTo(expected, 2);
  });

  it("computePayrollTaxForSalary returns 0 for zero or negative salary", () => {
    const components: PayrollTaxComponent[] = [{ label: "FICA", rate: 7.65 }];
    expect(computePayrollTaxForSalary(0, components)).toBe(0);
    expect(computePayrollTaxForSalary(-1000, components)).toBe(0);
  });

  it("computePayrollTaxForSalary returns 0 when components are empty", () => {
    expect(computePayrollTaxForSalary(80_000, [])).toBe(0);
  });

  it("low-salary employees see the same flat % below the wage-base cap", () => {
    // At $50k, both FICA caps ($176,100 / $7k FUTA) — only FUTA hits the cap
    const components: PayrollTaxComponent[] = [
      { label: "FICA-OASDI", rate: 6.2, wageBase: 176100 },
      { label: "Medicare", rate: 1.45 },
      { label: "FUTA", rate: 0.6, wageBase: 7000 },
    ];
    const dollars = computePayrollTaxForSalary(50_000, components);
    const expected = 50_000 * 0.062 + 50_000 * 0.0145 + 7_000 * 0.006;
    expect(dollars).toBeCloseTo(expected, 2);
  });

  it("computeEffectivePayrollTaxRate falls below the nominal sum for high earners (cap savings)", () => {
    const components: PayrollTaxComponent[] = [
      { label: "FICA-OASDI", rate: 6.2, wageBase: 176100 },
      { label: "Medicare", rate: 1.45 },
      { label: "FUTA", rate: 0.6, wageBase: 7000 },
      { label: "WA SUI", rate: 1.22, wageBase: 72800 },
    ];
    const nominal = 6.2 + 1.45 + 0.6 + 1.22;
    const lowEffective = computeEffectivePayrollTaxRate(50_000, components);
    const highEffective = computeEffectivePayrollTaxRate(250_000, components);
    expect(highEffective).toBeLessThan(nominal);
    expect(highEffective).toBeLessThan(lowEffective);
  });

  it("getStatePayrollTaxEntry falls back to the default federal entry for unknown codes", () => {
    const fallback = getStatePayrollTaxEntry("ZZ");
    expect(fallback).toBeDefined();
    expect(fallback.components.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// F3 — State business-entity fees
// =============================================================================

describe("F3: state business-entity filing fees", () => {
  it("STATE_ENTITY_FEES covers all 51 jurisdictions", () => {
    const keys = Object.keys(STATE_ENTITY_FEES).sort();
    expect(keys).toEqual([...EXPECTED_JURISDICTIONS].sort());
  });

  it("every jurisdiction has all 5 supported entity types with non-negative annual fees", () => {
    const required: Array<keyof (typeof STATE_ENTITY_FEES)[string]> = [
      "llc_single",
      "llc_partnership",
      "c_corp",
      "s_corp",
      "nonprofit_501c3",
    ];
    for (const code of EXPECTED_JURISDICTIONS) {
      const profile = STATE_ENTITY_FEES[code];
      expect(profile).toBeDefined();
      for (const t of required) {
        const fee: EntityFeeProfile = profile[t];
        expect(fee).toBeDefined();
        expect(typeof fee.annual).toBe("number");
        expect(fee.annual).toBeGreaterThanOrEqual(0);
        expect(typeof fee.notes).toBe("string");
        expect(fee.notes.length).toBeGreaterThan(0);
        if (fee.oneTimeY1 !== undefined) {
          expect(fee.oneTimeY1).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("getStateEntityFeeProfile returns null for non-applicable entity types", () => {
    expect(getStateEntityFeeProfile("CA", "sole_practitioner")).toBeNull();
    expect(getStateEntityFeeProfile("CA", "undetermined")).toBeNull();
  });

  it("getStateEntityFeeProfile returns null when state code is unknown", () => {
    expect(getStateEntityFeeProfile("ZZ", "llc_single")).toBeNull();
    expect(getStateEntityFeeProfile("", "llc_single")).toBeNull();
  });

  it("getStateEntityFeeProfile returns CA $800 LLC franchise tax for llc_single", () => {
    const p = getStateEntityFeeProfile("CA", "llc_single");
    expect(p).not.toBeNull();
    expect(p!.annual).toBe(800);
  });

  it("buildEntityFeeAmounts adds oneTimeY1 to year 1 only", () => {
    const profile: EntityFeeProfile = { annual: 800, oneTimeY1: 70, notes: "t" };
    const amounts = buildEntityFeeAmounts(profile, 5);
    expect(amounts).toHaveLength(5);
    expect(amounts[0]).toBe(870);
    expect(amounts[1]).toBe(800);
    expect(amounts[4]).toBe(800);
  });

  it("buildEntityFeeAmounts returns flat annual when no oneTimeY1", () => {
    const profile: EntityFeeProfile = { annual: 50, notes: "t" };
    const amounts = buildEntityFeeAmounts(profile, 3);
    expect(amounts).toEqual([50, 50, 50]);
  });

  it("generateDefaultExpenseRows appends State Entity Filing Fees row when state+entityType provided", () => {
    const rows = generateDefaultExpenseRows(
      "tuition_based",
      5,
      "new_school",
      undefined,
      undefined,
      undefined,
      { stateCode: "CA", entityType: "llc_single" },
    );
    const fee = rows.find((r) => r.id === STATE_ENTITY_FEE_ROW_ID);
    expect(fee).toBeDefined();
    expect(fee!.lineItem).toBe(STATE_ENTITY_FEE_LINE_ITEM);
    expect(fee!.category).toBe("administrative_general");
    expect(fee!.enabled).toBe(true);
    expect(fee!.amounts).toHaveLength(5);
    expect(fee!.amounts[0]).toBeGreaterThan(0);
  });

  it("generateDefaultExpenseRows omits the entity-fee row for sole_practitioner", () => {
    const rows = generateDefaultExpenseRows(
      "tuition_based",
      5,
      "new_school",
      undefined,
      undefined,
      undefined,
      { stateCode: "CA", entityType: "sole_practitioner" },
    );
    expect(rows.find((r) => r.id === STATE_ENTITY_FEE_ROW_ID)).toBeUndefined();
  });

  it("generateDefaultExpenseRows omits the entity-fee row when context is absent", () => {
    const rows = generateDefaultExpenseRows("tuition_based", 5);
    expect(rows.find((r) => r.id === STATE_ENTITY_FEE_ROW_ID)).toBeUndefined();
  });
});
