import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PayingYourselfMatters } from "../PayingYourselfMatters";
import type { FullModelData } from "@/pages/model-wizard/schema";

function makeModel(overrides: Partial<FullModelData> = {}): FullModelData {
  return {
    schoolProfile: { schoolType: "private_school", state: "CA" },
    enrollment: { year1: 30, year2: 60, year3: 90, year4: 110, year5: 130 },
    facilities: { annualSalaryIncrease: 3 },
    staffing: {
      reportedFounderComp: [40000, 45000, 50000, 55000, 60000],
      normalizedFounderComp: [80000, 85000, 90000, 95000, 100000],
      benefitsRate: 15,
      payrollTaxRate: 8,
    },
    staffingRows: [
      {
        id: "leader-1",
        functionCategory: "school_leadership",
        roleName: "Head of School",
        annualizedRate: 40000,
        fte: 1,
        employmentType: "full_time",
        benefitsEligible: true,
      },
    ],
    ...overrides,
  } as unknown as FullModelData;
}

describe("PayingYourselfMatters", () => {
  it("renders side-by-side current vs market-rate columns with totals", () => {
    render(<PayingYourselfMatters data={makeModel()} yearCount={5} />);
    expect(screen.getByTestId("paying-yourself-matters")).toBeInTheDocument();
    const reportedTotal = screen.getByTestId("paying-yourself-reported-total");
    const normalizedTotal = screen.getByTestId(
      "paying-yourself-normalized-total",
    );
    // Normalized must exceed reported when founder is taking a discount.
    const toNum = (el: HTMLElement) =>
      Number(el.textContent!.replace(/[^0-9-]/g, ""));
    expect(toNum(normalizedTotal)).toBeGreaterThan(toNum(reportedTotal));
  });

  it("renders per-year cells for both views", () => {
    render(<PayingYourselfMatters data={makeModel()} yearCount={5} />);
    for (let y = 1; y <= 5; y++) {
      expect(
        screen.getByTestId(`paying-yourself-reported-y${y}`),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`paying-yourself-normalized-y${y}`),
      ).toBeInTheDocument();
    }
  });

  it("shows the multi-year delta callout when reported < normalized", () => {
    render(<PayingYourselfMatters data={makeModel()} yearCount={5} />);
    const delta = screen.getByTestId("paying-yourself-delta");
    expect(delta.textContent).toMatch(/subsidizing/i);
  });

  it("shows an empty-state when no founder comp or schoolType info exists", () => {
    const empty = {
      schoolProfile: {},
      enrollment: {},
      facilities: {},
      staffing: {},
      staffingRows: [],
    } as unknown as FullModelData;
    render(<PayingYourselfMatters data={empty} yearCount={5} />);
    expect(screen.getByTestId("paying-yourself-empty")).toBeInTheDocument();
  });

  it("includes the paying_yourself concept explainer", () => {
    render(<PayingYourselfMatters data={makeModel()} yearCount={5} />);
    expect(
      screen.getByTestId("concept-explainer-paying_yourself"),
    ).toBeInTheDocument();
  });
});
