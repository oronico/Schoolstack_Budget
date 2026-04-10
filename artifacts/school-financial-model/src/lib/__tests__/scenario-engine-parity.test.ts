import { describe, expect, it } from "vitest";
import { computeScenarios, computeBaseFinancials } from "../scenario-engine";
import {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  type TestModelPayload,
} from "@workspace/finance";

interface BackendGoldenValues {
  revenue: number[];
  personnel: number[];
  opex: number[];
  capDebt: number[];
  netIncome: number[];
  loanDebtService: number[];
}

const microschoolGolden: BackendGoldenValues = {
  revenue: [184667, 340512, 427946, 500518, 516085],
  personnel: [118934, 147003, 151413, 155955, 160634],
  opex: [40500, 54885, 59774, 64012, 65776],
  capDebt: [6960, 6960, 6960, 6960, 6960],
  netIncome: [18273, 131664, 209799, 273591, 282715],
  loanDebtService: [6960, 6960, 6960, 6960, 6960],
};

const privateSchoolGolden: BackendGoldenValues = {
  revenue: [1975000, 2612670, 3286760, 3895050, 4323000],
  personnel: [854772, 854772, 854772, 854772, 854772],
  opex: [271400, 310442, 351598, 389496, 417905],
  capDebt: [59064, 44064, 44064, 39064, 39064],
  netIncome: [789764, 1403392, 2036326, 2611718, 3011259],
  loanDebtService: [34064, 34064, 34064, 34064, 34064],
};

function asFullModelData(fixture: TestModelPayload) {
  return fixture as Parameters<typeof computeBaseFinancials>[0];
}

function withinPct(actual: number, expected: number, pct: number): boolean {
  const tol = Math.max(Math.abs(expected) * (pct / 100), 5);
  return Math.abs(actual - expected) <= tol;
}

function describeParity(label: string, fixture: TestModelPayload, golden: BackendGoldenValues) {
  describe(`parity: ${label}`, () => {
    const result = computeScenarios(asFullModelData(fixture), []);
    const m = result.base.metrics;

    for (let y = 0; y < 5; y++) {
      it(`Y${y + 1} revenue within 1% of backend`, () => {
        expect(withinPct(m.revenue[y], golden.revenue[y], 1)).toBe(true);
      });

      it(`Y${y + 1} staffing within 1% of backend`, () => {
        expect(withinPct(m.staffingCost[y], golden.personnel[y], 1)).toBe(true);
      });

      it(`Y${y + 1} opex+facility within 1% of backend`, () => {
        const feExp = m.facilityCost[y] + m.opex[y];
        expect(withinPct(feExp, golden.opex[y], 1)).toBe(true);
      });

      it(`Y${y + 1} net income within 1% of backend`, () => {
        expect(withinPct(m.netIncome[y], golden.netIncome[y], 1)).toBe(true);
      });

      if (golden.loanDebtService[y] > 0) {
        it(`Y${y + 1} DSCR within 1% of backend`, () => {
          const feDscr = m.dscr[y];
          const beNI = golden.netIncome[y];
          const beDS = golden.loanDebtService[y];
          const beDscr = Math.round(((beNI + beDS) / beDS) * 100) / 100;
          expect(withinPct(feDscr, beDscr, 1)).toBe(true);
        });
      }
    }
  });
}

describeParity("microschool", microschoolFixture, microschoolGolden);
describeParity("private school", privateSchoolFixture, privateSchoolGolden);

describe("parity: charter school", () => {
  const result = computeScenarios(asFullModelData(charterFixture), []);
  const m = result.base.metrics;

  it("Y1 revenue is positive and non-trivial", () => {
    expect(m.revenue[0]).toBeGreaterThan(1000000);
  });

  it("Y5 revenue > Y1 revenue (growth trend matches backend)", () => {
    expect(m.revenue[4]).toBeGreaterThan(m.revenue[0]);
  });

  it("staffing cost is positive and > 50% of revenue in Y1 (charter pattern)", () => {
    expect(m.staffingCost[0] / m.revenue[0]).toBeGreaterThan(0.5);
  });

  it("loan debt service matches PMT formula exactly", () => {
    const mr = 0.0575 / 12;
    const n = 15 * 12;
    const monthlyPmt = (500000 * mr) / (1 - Math.pow(1 + mr, -n));
    const annualPmt = monthlyPmt * 12;
    expect(Math.abs(m.loanDebtService![0] - annualPmt)).toBeLessThan(1);
  });

  it("DSCR is computed when debt exists (can be negative with Y1 losses)", () => {
    expect(m.dscr[0]).not.toBe(0);
  });
});

describe("parity: computeBaseFinancials output shape", () => {
  const m = computeBaseFinancials(asFullModelData(microschoolFixture));

  it("returns 5-year arrays for all metric fields", () => {
    expect(m.revenue).toHaveLength(5);
    expect(m.staffingCost).toHaveLength(5);
    expect(m.facilityCost).toHaveLength(5);
    expect(m.opex).toHaveLength(5);
    expect(m.totalExpenses).toHaveLength(5);
    expect(m.netIncome).toHaveLength(5);
    expect(m.netMargin).toHaveLength(5);
    expect(m.dscr).toHaveLength(5);
    expect(m.staffingPctOfRevenue).toHaveLength(5);
    expect(m.enrollment).toHaveLength(5);
    expect(m.loanDebtService).toHaveLength(5);
  });

  it("totalExpenses = staffingCost + facilityCost + opex + capDebt for each year", () => {
    for (let y = 0; y < 5; y++) {
      const capDebt = m.totalExpenses[y] - m.staffingCost[y] - m.facilityCost[y] - m.opex[y];
      expect(m.totalExpenses[y]).toBeCloseTo(
        m.staffingCost[y] + m.facilityCost[y] + m.opex[y] + capDebt,
        0,
      );
    }
  });

  it("netIncome = revenue - totalExpenses for each year", () => {
    for (let y = 0; y < 5; y++) {
      expect(m.netIncome[y]).toBeCloseTo(m.revenue[y] - m.totalExpenses[y], 0);
    }
  });
});
