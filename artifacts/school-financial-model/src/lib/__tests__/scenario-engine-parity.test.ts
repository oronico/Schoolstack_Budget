import { describe, expect, it } from "vitest";
import { computeScenarios, computeBaseFinancials } from "../scenario-engine";
import {
  microschoolFixture,
  privateSchoolFixture,
  charterFixture,
  computeBackendValues,
  type TestModelPayload,
  type BackendComputedValues,
} from "@workspace/finance";

type FullModelData = Parameters<typeof computeBaseFinancials>[0];

function toFullModelData(fixture: TestModelPayload): FullModelData {
  return fixture as FullModelData;
}

function withinPct(actual: number, expected: number, pct: number, isRatio = false): boolean {
  const floor = isRatio ? 0.01 : 5;
  const tol = Math.max(Math.abs(expected) * (pct / 100), floor);
  return Math.abs(actual - expected) <= tol;
}

function describeCrossEngineParity(label: string, fixture: TestModelPayload) {
  describe(`cross-engine parity: ${label}`, () => {
    const feResult = computeScenarios(toFullModelData(fixture), []);
    const fe = feResult.base.metrics;
    const be: BackendComputedValues = computeBackendValues(fixture);

    for (let y = 0; y < 5; y++) {
      it(`Y${y + 1} revenue: FE vs BE within 1%`, () => {
        expect(withinPct(fe.revenue[y], be.revenue[y], 1)).toBe(true);
      });

      it(`Y${y + 1} staffing: FE vs BE within 1%`, () => {
        expect(withinPct(fe.staffingCost[y], be.personnel[y], 1)).toBe(true);
      });

      it(`Y${y + 1} expenses (facility+opex): FE vs BE within 1%`, () => {
        const feExp = fe.facilityCost[y] + fe.opex[y];
        expect(withinPct(feExp, be.expenses[y], 1)).toBe(true);
      });

      it(`Y${y + 1} net income: FE vs BE within 1%`, () => {
        expect(withinPct(fe.netIncome[y], be.netIncome[y], 1)).toBe(true);
      });

      if (be.loanDS[y] > 0) {
        it(`Y${y + 1} DSCR: FE vs BE within 1%`, () => {
          const feDscr = fe.dscr[y];
          const beDscr = Math.round(((be.netIncome[y] + be.loanDS[y]) / be.loanDS[y]) * 100) / 100;
          expect(withinPct(feDscr, beDscr, 1, true)).toBe(true);
        });
      }
    }
  });
}

describeCrossEngineParity("microschool", microschoolFixture);
describeCrossEngineParity("private school", privateSchoolFixture);
describeCrossEngineParity("charter school", charterFixture);

describe("cross-engine: charter loan PMT exactness", () => {
  const result = computeScenarios(toFullModelData(charterFixture), []);
  const m = result.base.metrics;

  it("loan debt service matches PMT formula exactly", () => {
    const mr = 0.0575 / 12;
    const n = 15 * 12;
    const monthlyPmt = (500000 * mr) / (1 - Math.pow(1 + mr, -n));
    const annualPmt = monthlyPmt * 12;
    expect(Math.abs(m.loanDebtService![0] - annualPmt)).toBeLessThan(1);
  });
});

describe("cross-engine: computeBaseFinancials output shape", () => {
  const m = computeBaseFinancials(toFullModelData(microschoolFixture));

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

  it("netIncome = revenue - totalExpenses for each year", () => {
    for (let y = 0; y < 5; y++) {
      expect(m.netIncome[y]).toBeCloseTo(m.revenue[y] - m.totalExpenses[y], 0);
    }
  });
});
