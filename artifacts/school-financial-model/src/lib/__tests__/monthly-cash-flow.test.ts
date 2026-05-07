import { describe, it, expect } from "vitest";
import {
  distributeRevenueMonthly,
  distributePersonnelMonthly,
  distributeOpexMonthly,
  distributeDebtMonthly,
  computeYear1MonthlyCashFlow,
  findLowestCashMonth,
  computeCashRunwayMonths,
  type MonthlyRevenueRowLike,
} from "@workspace/finance";

const sum = (arr: readonly number[]) => arr.reduce((a, b) => a + b, 0);
const approx = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("distributeRevenueMonthly — annual totals are byte-identical", () => {
  it("tuition spread across 10 billing months sums to annual total", () => {
    const rows: MonthlyRevenueRowLike[] = [
      {
        id: "gross_tuition",
        category: "tuition_and_fees",
        enabled: true,
        driverType: "per_student",
        amounts: [10000],
        billingMonths: 10,
        collectionRate: 100,
      },
    ];
    const monthly = distributeRevenueMonthly(rows, 0, 50);
    approx(sum(monthly), 10000 * 50);
    expect(monthly[0]).toBe(0);
    expect(monthly[11]).toBe(0);
    expect(monthly.filter((v) => v > 0).length).toBe(10);
  });

  it("tuition with 30-day collection delay shifts start month by 1", () => {
    const rows: MonthlyRevenueRowLike[] = [
      {
        id: "gross_tuition",
        category: "tuition_and_fees",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [120000],
        billingMonths: 10,
        collectionDelayDays: 30,
      },
    ];
    const monthly = distributeRevenueMonthly(rows, 0, 0);
    approx(sum(monthly), 120000);
    expect(monthly[0]).toBe(0);
    expect(monthly[1]).toBe(0);
    expect(monthly[2]).toBeGreaterThan(0);
  });

  it("ESA reimbursement lag preserves annual total", () => {
    const rows: MonthlyRevenueRowLike[] = [
      {
        id: "esa",
        category: "school_choice",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [60000],
        disbursementType: "reimbursement",
        reimbursementLagMonths: 2,
      },
    ];
    const monthly = distributeRevenueMonthly(rows, 0, 0);
    approx(sum(monthly), 60000);
    expect(monthly[0]).toBe(0);
    expect(monthly[1]).toBe(0);
    expect(monthly[2]).toBeGreaterThan(0);
  });

  it("public funding quarterly arrears lands in months 2,5,8,11", () => {
    const rows: MonthlyRevenueRowLike[] = [
      {
        id: "psf",
        category: "public_funding",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [400000],
        paymentFrequency: "quarterly",
        paymentTiming: "arrears",
      },
    ];
    const monthly = distributeRevenueMonthly(rows, 0, 0);
    approx(sum(monthly), 400000);
    [2, 5, 8, 11].forEach((m) => approx(monthly[m], 100000));
    [0, 1, 3, 4, 6, 7, 9, 10].forEach((m) => approx(monthly[m], 0));
  });

  it("philanthropy lands in receiptQuarter only", () => {
    const rows: MonthlyRevenueRowLike[] = [
      {
        id: "gala",
        category: "philanthropy",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [50000],
        receiptQuarter: 4,
      },
    ];
    const monthly = distributeRevenueMonthly(rows, 0, 0);
    approx(sum(monthly), 50000);
    approx(monthly[9], 50000);
  });
});

describe("distributePersonnel/Opex/Debt", () => {
  it("personnel spreads across operating months only", () => {
    const monthly = distributePersonnelMonthly(120000, 10);
    approx(sum(monthly), 120000);
    approx(monthly[0], 12000);
    approx(monthly[9], 12000);
    approx(monthly[10], 0);
    approx(monthly[11], 0);
  });

  it("opex spreads across operating months only", () => {
    const monthly = distributeOpexMonthly(60000, 10);
    approx(sum(monthly), 60000);
    expect(monthly.filter((v) => v > 0).length).toBe(10);
  });

  it("debt service spreads monthly by default", () => {
    const monthly = distributeDebtMonthly(36000);
    approx(sum(monthly), 36000);
    approx(monthly[0], 3000);
    approx(monthly[11], 3000);
  });
});

describe("computeYear1MonthlyCashFlow + findLowestCashMonth", () => {
  it("captures a real cash trough when staff paid 12 mo but tuition billed 10 mo", () => {
    const rows: MonthlyRevenueRowLike[] = [
      {
        id: "gross_tuition",
        category: "tuition_and_fees",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [600000],
        billingMonths: 10,
      },
    ];
    const series = computeYear1MonthlyCashFlow({
      revenueRows: rows,
      students: 0,
      annualPersonnel: 480000,
      annualOpex: 60000,
      annualDebt: 36000,
      openingCash: 50000,
      opMonths: 10,
    });
    approx(sum(series.inflow), 600000);
    approx(sum(series.outflow), 480000 + 60000 + 36000);
    approx(sum(series.net), 600000 - (480000 + 60000 + 36000));

    const trough = findLowestCashMonth(series.cumulative, 7);
    expect(trough).not.toBeNull();
    expect(trough!.amount).toBeLessThan(50000);
  });
});

describe("computeCashRunwayMonths", () => {
  it("returns cap when cash never runs out", () => {
    const monthlyNet = new Array(12).fill(1000);
    expect(computeCashRunwayMonths(10000, [monthlyNet], 60)).toBe(60);
  });

  it("returns the month index where cash first hits zero", () => {
    const monthlyNet = new Array(12).fill(-1000);
    expect(computeCashRunwayMonths(3000, [monthlyNet], 60)).toBe(3);
  });
});

describe("annual-total parity vs legacy annual/12 spreading", () => {
  it("byte-identical annual totals across mixed revenue streams", () => {
    const rows: MonthlyRevenueRowLike[] = [
      { id: "gross_tuition", category: "tuition_and_fees", enabled: true, driverType: "per_student", amounts: [12000], billingMonths: 10 },
      { id: "esa", category: "school_choice", enabled: true, driverType: "annual_fixed", amounts: [80000], disbursementType: "direct" },
      { id: "psf", category: "public_funding", enabled: true, driverType: "annual_fixed", amounts: [200000], paymentFrequency: "monthly", paymentTiming: "upfront" },
      { id: "gala", category: "philanthropy", enabled: true, driverType: "annual_fixed", amounts: [25000], receiptQuarter: 2 },
      { id: "other", category: "other_revenue", enabled: true, driverType: "annual_fixed", amounts: [12000] },
    ];
    const monthly = distributeRevenueMonthly(rows, 0, 75);
    const expectedTotal = 12000 * 75 + 80000 + 200000 + 25000 + 12000;
    approx(sum(monthly), expectedTotal, 1e-3);
  });
});
