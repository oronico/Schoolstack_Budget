import { describe, it, expect } from "vitest";
import { computeBaseFinancials } from "../scenario-engine";

/**
 * F1 ENGINE-LEVEL REGRESSION GUARD
 *
 * The wage-base-aware payroll tax bug rejected on the prior code review:
 * capped tax was computed against base salary then multiplied by `persEsc`
 * (annual salary escalation) outside the row loop. That inflates capped
 * components linearly past the cap, which is wrong — wage-base caps don't
 * scale with salary inflation.
 *
 * The fix moves `escalatedRate = annualizedRate * persEsc` inside the loop
 * and caps each component against `escalatedRate`, with no outer
 * `* persEsc` multiplier.
 *
 * This test exercises the *engine entry point* (not just the helper) so a
 * regression that re-introduces the outer multiplier in the engine call
 * site cannot pass.
 */

type FullModelData = Parameters<typeof computeBaseFinancials>[0];

function buildSingleStafferModel(): FullModelData {
  // One year-round head of school at exactly the FICA-OASDI 2025 wage base
  // ($176,100), with a 3% annual salary increase. At Y1 salary == $176.1k,
  // OASDI tax is capped at $176,100 * 6.2% = $10,918.20. After a 3% raise
  // in Y2, salary is $181,383 but OASDI tax STAYS at $10,918.20 (capped).
  // Medicare (uncapped) grows with the salary at 1.45%.
  return {
    schoolProfile: { isPartialFirstYear: false } as FullModelData["schoolProfile"],
    facilities: { annualSalaryIncrease: 3, generalCostInflation: 0 },
    enrollment: { year1: 50, year2: 50, year3: 50, year4: 50, year5: 50, retentionRate: 100 },
    staffingRows: [
      {
        id: "head-of-school",
        roleName: "Head of School",
        functionCategory: "leadership",
        employmentType: "full_time",
        fte: 1,
        annualizedRate: 176_100,
        benefitsEligible: false,
        benefitsRate: 0,
        payrollTaxRate: 0,
        payrollTaxRateOverridden: false,
        payrollLike: true,
        payrollTaxComponents: [
          { label: "FICA-OASDI", rate: 6.2, wageBase: 176_100 },
          { label: "Medicare", rate: 1.45 },
        ],
        notes: "",
      } as unknown as FullModelData["staffingRows"][number],
    ],
    revenueRows: [
      {
        id: "tuition",
        category: "tuition_and_fees",
        lineItem: "Tuition",
        enabled: true,
        driverType: "per_student",
        amounts: [10_000, 10_000, 10_000, 10_000, 10_000],
        escalationRate: 0,
      } as unknown as FullModelData["revenueRows"][number],
    ],
    expenseRows: [],
    capitalAndDebtRows: [],
    tuitionTiers: [],
  } as unknown as FullModelData;
}

describe("F1 engine-level: wage-base caps survive year-over-year salary escalation", () => {
  it("computeBaseFinancials: capped staffing cost grows < 3% YoY at the OASDI wage base", () => {
    const m = computeBaseFinancials(buildSingleStafferModel());

    const y1 = m.staffingCost[0];
    const y2 = m.staffingCost[1];
    const y3 = m.staffingCost[2];

    // Sanity: positive growth (uncapped Medicare scales with salary).
    expect(y2).toBeGreaterThan(y1);
    expect(y3).toBeGreaterThan(y2);

    // Year-1 expected components (no benefits, no employer-flat-rate path):
    //   salary:   $176,100
    //   OASDI:    $176,100 * 6.2%  = $10,918.20  (capped)
    //   Medicare: $176,100 * 1.45% = $ 2,553.45  (uncapped)
    //   total:    $189,571.65
    expect(y1).toBeCloseTo(176_100 + 10_918.2 + 2_553.45, 2);

    // Year-2 expected:
    //   salary:   $176,100 * 1.03                 = $181,383.00
    //   OASDI:    min(181_383, 176_100) * 6.2%    = $10,918.20  (still capped)
    //   Medicare: $181,383 * 1.45%                = $  2,630.05
    //   total:    $194,931.25
    const y2Expected = 176_100 * 1.03 + 10_918.2 + 176_100 * 1.03 * 0.0145;
    expect(y2).toBeCloseTo(y2Expected, 2);

    // The crucial regression assertion: Y2 / Y1 < 1.03. Under the OLD bug,
    // the capped OASDI component would scale by 1.03 along with salary,
    // producing Y2/Y1 ≈ 1.03 exactly. The fix keeps OASDI flat, so the
    // composite ratio is strictly less than 1.03.
    const yoyRatio = y2 / y1;
    expect(yoyRatio).toBeLessThan(1.03);
    // And it must still be > 1 (Medicare + salary do scale).
    expect(yoyRatio).toBeGreaterThan(1.0);
  });

  it("computeBaseFinancials: flat-rate path stays mathematically unchanged under escalation", () => {
    // When no payrollTaxComponents are supplied, the engine takes the legacy
    // `salary * payrollTaxRate / 100` path. The fix must leave this path
    // bit-equivalent because (annual * rate) * salaryEsc ==
    // (annual * salaryEsc) * rate. This guards goldens.
    const data = buildSingleStafferModel();
    const row = data.staffingRows![0] as Record<string, unknown>;
    delete row.payrollTaxComponents;
    row.payrollTaxRate = 7.65; // FICA + Medicare blended

    const m = computeBaseFinancials(data);
    // Salary $176,100 + payroll-tax 7.65% = $189,571.65 in Y1.
    expect(m.staffingCost[0]).toBeCloseTo(176_100 * 1.0765, 2);
    // Y2 grows by exactly 3% (flat rate scales linearly).
    expect(m.staffingCost[1] / m.staffingCost[0]).toBeCloseTo(1.03, 6);
  });

  it("computeBaseFinancials: zero salary escalation leaves capped tax flat across years", () => {
    const data = buildSingleStafferModel();
    data.facilities!.annualSalaryIncrease = 0;
    const m = computeBaseFinancials(data);
    expect(m.staffingCost[0]).toBeCloseTo(m.staffingCost[1], 2);
    expect(m.staffingCost[0]).toBeCloseTo(m.staffingCost[4], 2);
  });
});
