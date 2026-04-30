import { describe, it, expect } from "vitest";
import {
  computePayrollTaxForSalary,
  computeEffectivePayrollTaxRate,
  computePayrollTaxCapSavings,
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

  // Task #319 — coaching insight on the staffing step.
  describe("computePayrollTaxCapSavings", () => {
    it("returns null when the salary doesn't cross any wage base", () => {
      const components: PayrollTaxComponent[] = [
        { label: "FICA-OASDI", rate: 6.2, wageBase: 176_100 },
        { label: "Medicare", rate: 1.45 },
      ];
      // $50k under both caps (Medicare uncapped, OASDI cap $176.1k).
      expect(computePayrollTaxCapSavings(50_000, components)).toBeNull();
    });

    it("returns null for zero / negative / empty inputs", () => {
      const components: PayrollTaxComponent[] = [
        { label: "FICA-OASDI", rate: 6.2, wageBase: 176_100 },
      ];
      expect(computePayrollTaxCapSavings(0, components)).toBeNull();
      expect(computePayrollTaxCapSavings(-1000, components)).toBeNull();
      expect(computePayrollTaxCapSavings(200_000, [])).toBeNull();
    });

    it("names the capped components and sums savings vs. a flat blended rate", () => {
      // WA Head of School at $200k — expect FICA-OASDI, FUTA, WA SUI, WA PFML
      // to be the capped components (Medicare and WA Workers' Comp are
      // uncapped).
      const wa = getStatePayrollTaxEntry("WA");
      const insight = computePayrollTaxCapSavings(200_000, wa.components);
      expect(insight).not.toBeNull();
      const labels = insight!.cappedComponents.map((c) => c.label);
      expect(labels).toEqual([
        "Social Security (FICA)",
        "FUTA",
        "WA SUI",
        "WA Paid Family & Medical Leave",
      ]);
      // Wage bases the founder should see in the coaching copy.
      const wageBases = insight!.cappedComponents.map((c) => c.wageBase);
      expect(wageBases).toEqual([176_100, 7_000, 72_800, 176_100]);

      // Flat (no caps) = $200k * (6.2 + 1.45 + 0.6 + 1.22 + 0.28 + 0.4)% = $200k * 10.15%
      const flatRate = 6.2 + 1.45 + 0.6 + 1.22 + 0.28 + 0.4;
      expect(insight!.flatRate).toBeCloseTo(flatRate, 6);
      expect(insight!.flatTax).toBeCloseTo(200_000 * (flatRate / 100), 2);
      // Capped = the audit-doc total.
      expect(insight!.cappedTax).toBeCloseTo(16_041.44, 2);
      // Savings = flat - capped, must be > $3,000 for this scenario.
      expect(insight!.savings).toBeCloseTo(insight!.flatTax - insight!.cappedTax, 2);
      expect(insight!.savings).toBeGreaterThan(3_000);
    });

    it("matches the task example: NY $200k principal saves >$1,500 vs. flat", () => {
      const ny = getStatePayrollTaxEntry("NY");
      const insight = computePayrollTaxCapSavings(200_000, ny.components);
      expect(insight).not.toBeNull();
      // FICA-OASDI ($176,100), FUTA ($7,000), NY SUI ($12,800), NY Re-employment ($12,800).
      const labels = insight!.cappedComponents.map((c) => c.label);
      expect(labels).toContain("Social Security (FICA)");
      expect(insight!.savings).toBeGreaterThan(1_500);
    });

    it("flags a single capped component when only that one applies", () => {
      // FUTA-only cap at a low salary — Medicare uncapped, no other components.
      const components: PayrollTaxComponent[] = [
        { label: "Medicare", rate: 1.45 },
        { label: "FUTA", rate: 0.6, wageBase: 7_000 },
      ];
      const insight = computePayrollTaxCapSavings(40_000, components);
      expect(insight).not.toBeNull();
      expect(insight!.cappedComponents).toHaveLength(1);
      expect(insight!.cappedComponents[0]).toEqual({ label: "FUTA", wageBase: 7_000 });
      // Savings = (40k - 7k) * 0.6% = $198.
      expect(insight!.savings).toBeCloseTo(198, 2);
    });

    it("never produces negative savings", () => {
      // Pathological inputs: every component uncapped → flat == capped → 0 savings → null.
      const components: PayrollTaxComponent[] = [
        { label: "Flat", rate: 7.65 },
      ];
      expect(computePayrollTaxCapSavings(150_000, components)).toBeNull();
    });
  });

  // Required hand-check spot tests for the audit doc (Task #318):
  //   AZ Year-1 $70k Head of School and WA Year-1 $120k senior salary.
  it("AZ $70k 2025 → $5,557 (FICA + Medicare + FUTA cap + AZ SUI cap)", () => {
    const az = getStatePayrollTaxEntry("AZ");
    const dollars = computePayrollTaxForSalary(70_000, az.components);
    // FICA: 70k * 6.2% = 4340; Medicare: 70k * 1.45% = 1015;
    // FUTA: min(70k, 7k) * 0.6% = 42; AZ SUI: min(70k, 8k) * 2.0% = 160.
    expect(dollars).toBeCloseTo(4340 + 1015 + 42 + 160, 2);
    expect(dollars).toBeCloseTo(5557, 2);
  });

  it("WA $120k 2025 → $10,926.16 (all six WA components capped where applicable)", () => {
    const wa = getStatePayrollTaxEntry("WA");
    const dollars = computePayrollTaxForSalary(120_000, wa.components);
    // FICA: 120k * 6.2% = 7440; Medicare: 120k * 1.45% = 1740;
    // FUTA: 7k * 0.6% = 42; WA SUI: min(120k, 72.8k) * 1.22% = 888.16;
    // WA PFML: 120k * 0.28% = 336; WA Comp: 120k * 0.4% = 480.
    expect(dollars).toBeCloseTo(7440 + 1740 + 42 + 888.16 + 336 + 480, 2);
    expect(dollars).toBeCloseTo(10_926.16, 2);
  });

  it("year-over-year salary escalation re-applies caps each year (capped tax does NOT inflate linearly)", () => {
    // FICA-OASDI cap is the easiest demonstrator: at $176,100 base, salary
    // already at the cap. After a 3% raise, the OASDI tax should NOT grow 3%
    // — it stays at cap * 6.2%. (Medicare & uncapped components do scale.)
    const components: PayrollTaxComponent[] = [
      { label: "FICA-OASDI", rate: 6.2, wageBase: 176100 },
      { label: "Medicare", rate: 1.45 },
    ];
    const base = 176_100;
    const escalated = base * 1.03;
    const baseTax = computePayrollTaxForSalary(base, components);
    const escTax = computePayrollTaxForSalary(escalated, components);
    // OASDI portion stays flat ($176,100 * 6.2% = $10,918.20).
    // Medicare grows 3% (uncapped): $176,100 * 1.45% * 1.03.
    const expectedBase = 176_100 * 0.062 + 176_100 * 0.0145;
    const expectedEsc = 176_100 * 0.062 + escalated * 0.0145;
    expect(baseTax).toBeCloseTo(expectedBase, 2);
    expect(escTax).toBeCloseTo(expectedEsc, 2);
    // The escalated tax must be less than a naive flat × salaryEsc would
    // produce — that's the bug the wage-base path closes.
    expect(escTax).toBeLessThan(baseTax * 1.03);
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

  // Spot tests for the published audit doc reference table.
  it.each([
    ["CA", "llc_single", 800],
    ["CA", "llc_partnership", 800],
    ["DE", "llc_single", 300],
    ["TX", "llc_single", 0],
    ["TX", "c_corp", 0],
    ["NC", "c_corp", 225],
    ["NC", "s_corp", 225],
    ["WA", "llc_single", 160],
    ["WA", "c_corp", 160],
  ] as const)("STATE_ENTITY_FEES[%s][%s].annual === %d", (state, et, expected) => {
    const profile = STATE_ENTITY_FEES[state][et as "llc_single" | "c_corp" | "s_corp" | "llc_partnership"];
    expect(profile.annual).toBe(expected);
  });

  it("FL nonprofit_501c3 stays at 61.25 (audit-doc reference)", () => {
    expect(STATE_ENTITY_FEES.FL.nonprofit_501c3.annual).toBeCloseTo(61.25, 2);
  });

  // Consistency guard: when a note ends with "= $X", the annual amount must
  // match. This is exactly the failure mode that produced the rejection on
  // NC corp ($25 vs $225) and WA LLC ($70 vs $160).
  it("annual amount matches any '= $X' total stated in the note", () => {
    const violations: string[] = [];
    for (const [state, profile] of Object.entries(STATE_ENTITY_FEES)) {
      for (const [et, fee] of Object.entries(profile)) {
        const f = fee as EntityFeeProfile;
        const m = f.notes.match(/=\s*\$([\d,]+(?:\.\d+)?)/);
        if (!m) continue;
        const stated = parseFloat(m[1].replace(/,/g, ""));
        if (Math.abs(stated - f.annual) > 0.01) {
          violations.push(`${state}.${et}: notes say "= $${stated}" but annual=${f.annual}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
