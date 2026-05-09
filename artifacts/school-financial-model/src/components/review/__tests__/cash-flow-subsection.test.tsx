// Task #705 — Cash flow truth layer tests.
//
// Covers:
//   1. lowest-cash-month detection through the canonical engine
//   2. delayed-public-funding scenario shifts the trough deeper
//   3. summer-gap annotation copy fires when the trough is in
//      Jun/Jul/Aug/Sep
//   4. Simple Summary vs CFO Detail toggle persists per model id
//   5. every callout rendered by the cash subsection carries a
//      `Next step:` line (Task #686 coaching contract).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  computeYear1MonthlyCashFlow,
  findLowestCashMonth,
  type MonthlyRevenueRowLike,
} from "@workspace/finance";
import { CashFlowSubsection } from "../CashFlowSubsection";
import {
  applyDelayedPublicFunding,
  isSummerGapMonth,
} from "../cash-flow-helpers";
import {
  ReviewViewToggle,
  readPersistedReviewView,
  writePersistedReviewView,
  useReviewView,
} from "../ReviewViewToggle";
import { renderHook, act } from "@testing-library/react";

const tuitionRows: MonthlyRevenueRowLike[] = [
  {
    id: "tuition",
    category: "tuition_and_fees",
    enabled: true,
    driverType: "annual_fixed",
    amounts: [600_000],
    billingMonths: 10,
  },
];

const publicFundingRows: MonthlyRevenueRowLike[] = [
  {
    id: "psf",
    category: "public_funding",
    enabled: true,
    driverType: "annual_fixed",
    amounts: [400_000],
    paymentFrequency: "monthly",
    paymentTiming: "upfront",
  },
];

describe("Task #705 — lowest cash month surfaces through canonical engine", () => {
  it("identifies the trough month when payroll runs 12 months and tuition bills 10", () => {
    const series = computeYear1MonthlyCashFlow({
      revenueRows: tuitionRows,
      students: 0,
      annualPersonnel: 480_000,
      annualOpex: 60_000,
      annualDebt: 36_000,
      openingCash: 80_000,
      opMonths: 10,
    });
    const trough = findLowestCashMonth(series.cumulative, 7);
    expect(trough).not.toBeNull();
    expect(trough!.monthIndex).toBeGreaterThanOrEqual(0);
    expect(trough!.amount).toBeLessThan(80_000);
  });
});

describe("Task #705 — delayed public funding scenario", () => {
  it("shifts only public-funding rows and leaves tuition untouched", () => {
    const mixed = [...tuitionRows, ...publicFundingRows];
    const shifted = applyDelayedPublicFunding(mixed, 90);
    const tuition = shifted.find((r) => r.id === "tuition")!;
    const psf = shifted.find((r) => r.id === "psf")!;
    expect(tuition.collectionDelayDays ?? 0).toBe(0);
    expect(psf.collectionDelayDays).toBe(90);
  });

  it("returns rows unchanged when delay is zero", () => {
    const mixed = [...tuitionRows, ...publicFundingRows];
    const shifted = applyDelayedPublicFunding(mixed, 0);
    expect(shifted).toHaveLength(mixed.length);
    const psf = shifted.find((r) => r.id === "psf")!;
    expect(psf.collectionDelayDays ?? 0).toBe(0);
  });

  it("a 90-day public funding delay drops the trough deeper than on-time", () => {
    const mixed: MonthlyRevenueRowLike[] = [
      ...tuitionRows,
      {
        id: "psf",
        category: "public_funding",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [400_000],
        paymentFrequency: "monthly",
        paymentTiming: "upfront",
      },
    ];
    const compute = (rows: readonly MonthlyRevenueRowLike[]) =>
      computeYear1MonthlyCashFlow({
        revenueRows: rows,
        students: 0,
        annualPersonnel: 600_000,
        annualOpex: 80_000,
        annualDebt: 0,
        openingCash: 50_000,
        opMonths: 10,
      });
    const onTime = compute(mixed);
    const delayed = compute(applyDelayedPublicFunding(mixed, 90));
    const onTimeTrough = findLowestCashMonth(onTime.cumulative, 7);
    const delayedTrough = findLowestCashMonth(delayed.cumulative, 7);
    expect(onTimeTrough).not.toBeNull();
    expect(delayedTrough).not.toBeNull();
    expect(delayedTrough!.amount).toBeLessThan(onTimeTrough!.amount);
  });
});

describe("Task #705 — summer gap annotation", () => {
  it("flags Jun/Jul/Aug/Sep as summer-gap months", () => {
    expect(isSummerGapMonth("Jun")).toBe(true);
    expect(isSummerGapMonth("Jul")).toBe(true);
    expect(isSummerGapMonth("Aug")).toBe(true);
    expect(isSummerGapMonth("Sep")).toBe(true);
  });

  it("does not flag non-summer months", () => {
    expect(isSummerGapMonth("Jan")).toBe(false);
    expect(isSummerGapMonth("Dec")).toBe(false);
    expect(isSummerGapMonth(undefined)).toBe(false);
  });
});

describe("Task #705 — CashFlowSubsection rendering", () => {
  it("renders the lowest-cash row, callout, and a Next step line", () => {
    render(
      <CashFlowSubsection
        revenueRows={tuitionRows}
        students={0}
        annualPersonnel={600_000}
        annualOpex={80_000}
        annualDebt={0}
        openingCash={50_000}
        fiscalYearStartMonth={7}
        opMonths={10}
      />,
    );
    const callout = screen.getByTestId("cash-trough-callout");
    expect(callout).toBeInTheDocument();
    // Every callout must include a "Next step:" line.
    expect(callout.textContent ?? "").toMatch(/Next step:/i);
    // Lowest-month tag is rendered on at least one row.
    expect(screen.getAllByTestId("cash-flow-lowest-tag").length).toBeGreaterThan(0);
  });

  it("renders the cash-flow chart with base + delayed scenario series", () => {
    const mixed: MonthlyRevenueRowLike[] = [
      ...tuitionRows,
      {
        id: "psf",
        category: "public_funding",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [400_000],
        paymentFrequency: "monthly",
        paymentTiming: "upfront",
      },
    ];
    render(
      <CashFlowSubsection
        revenueRows={mixed}
        students={0}
        annualPersonnel={600_000}
        annualOpex={80_000}
        annualDebt={0}
        openingCash={50_000}
        fiscalYearStartMonth={7}
        opMonths={10}
      />,
    );
    expect(screen.getByTestId("cash-flow-chart")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("delayed-funding-option-90"));
    // Scenario delta readout proves the chart re-rendered with the
    // shifted series.
    const readout = screen.getByTestId("delayed-funding-readout");
    expect(readout.textContent ?? "").toMatch(/90-day delay/);
  });

  it("re-renders the trough when delayed-funding scenario is selected", () => {
    const mixed: MonthlyRevenueRowLike[] = [
      ...tuitionRows,
      {
        id: "psf",
        category: "public_funding",
        enabled: true,
        driverType: "annual_fixed",
        amounts: [400_000],
        paymentFrequency: "monthly",
        paymentTiming: "upfront",
      },
    ];
    render(
      <CashFlowSubsection
        revenueRows={mixed}
        students={0}
        annualPersonnel={600_000}
        annualOpex={80_000}
        annualDebt={0}
        openingCash={50_000}
        fiscalYearStartMonth={7}
        opMonths={10}
      />,
    );
    const ninety = screen.getByTestId("delayed-funding-option-90");
    fireEvent.click(ninety);
    expect(screen.getByTestId("delayed-funding-impact")).toBeInTheDocument();
    expect(screen.getByTestId("delayed-funding-readout")).toBeInTheDocument();
  });
});

describe("Task #705 — Review view toggle persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to simple when nothing is persisted", () => {
    expect(readPersistedReviewView(123)).toBe("simple");
  });

  it("round-trips via writePersistedReviewView per model id", () => {
    writePersistedReviewView(123, "cfo");
    writePersistedReviewView(456, "simple");
    expect(readPersistedReviewView(123)).toBe("cfo");
    expect(readPersistedReviewView(456)).toBe("simple");
  });

  it("useReviewView state changes persist", () => {
    const { result } = renderHook(() => useReviewView(789));
    expect(result.current[0]).toBe("simple");
    act(() => result.current[1]("cfo"));
    expect(result.current[0]).toBe("cfo");
    expect(readPersistedReviewView(789)).toBe("cfo");
  });

  it("ReviewViewToggle calls onChange when clicked", () => {
    const onChange = vi.fn();
    render(<ReviewViewToggle view="simple" onChange={onChange} />);
    fireEvent.click(screen.getByTestId("review-view-cfo"));
    expect(onChange).toHaveBeenCalledWith("cfo");
  });
});
