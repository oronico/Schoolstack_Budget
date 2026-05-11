import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChestertonDashboard } from "../ChestertonDashboard";
import { buildDefaultChestertonData } from "@/lib/chesterton/template";

describe("ChestertonDashboard", () => {
  it("renders Year 0 - Year 6 columns and the four metric rows", () => {
    const data = buildDefaultChestertonData();
    render(<ChestertonDashboard chesterton={data} schoolName="Test Academy" />);
    expect(screen.getByTestId("chesterton-dashboard")).toBeInTheDocument();
    for (let i = 0; i <= 6; i++) {
      expect(screen.getByTestId(`chesterton-dashboard-header-yr-${i}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("chesterton-dashboard-row-enrollment")).toBeInTheDocument();
    expect(screen.getByTestId("chesterton-dashboard-row-netRevenue")).toBeInTheDocument();
    expect(screen.getByTestId("chesterton-dashboard-row-operatingExpense")).toBeInTheDocument();
    expect(screen.getByTestId("chesterton-dashboard-row-fundraisingGap")).toBeInTheDocument();
  });

  it("highlights years where Fundraising Gap exceeds the Total Fundraising Goal", () => {
    const data = buildDefaultChestertonData();
    // Force a tiny TFG so every populated year exceeds it.
    render(<ChestertonDashboard chesterton={{ ...data, totalFundraisingGoal: 1 }} />);
    // Year 1 will have a non-trivial gap that exceeds $1.
    expect(
      screen.getByTestId("chesterton-dashboard-gap-warning-yr-1"),
    ).toBeInTheDocument();
  });

  it("does not highlight when Total Fundraising Goal is large enough to cover gaps", () => {
    const data = buildDefaultChestertonData();
    render(
      <ChestertonDashboard
        chesterton={{ ...data, totalFundraisingGoal: 100_000_000 }}
      />,
    );
    expect(
      screen.queryByTestId("chesterton-dashboard-gap-warning-yr-1"),
    ).toBeNull();
  });

  it("hides the operating expense breakdown until the toggle is clicked", () => {
    const data = buildDefaultChestertonData();
    render(<ChestertonDashboard chesterton={data} />);
    // Subrows are not rendered initially.
    expect(screen.queryByTestId("chesterton-dashboard-row-facultyCost")).toBeNull();
    expect(screen.queryByTestId("chesterton-dashboard-row-adminSalaries")).toBeNull();
    expect(screen.queryByTestId("chesterton-dashboard-row-generalAdmin")).toBeNull();

    fireEvent.click(screen.getByTestId("chesterton-dashboard-opexpense-toggle"));

    expect(screen.getByTestId("chesterton-dashboard-row-facultyCost")).toBeInTheDocument();
    expect(screen.getByTestId("chesterton-dashboard-row-adminSalaries")).toBeInTheDocument();
    expect(screen.getByTestId("chesterton-dashboard-row-generalAdmin")).toBeInTheDocument();
    // A specific Year 1 cell renders for each subrow.
    expect(screen.getByTestId("chesterton-dashboard-cell-facultyCost-yr-1")).toBeInTheDocument();
    expect(screen.getByTestId("chesterton-dashboard-cell-adminSalaries-yr-1")).toBeInTheDocument();
    expect(screen.getByTestId("chesterton-dashboard-cell-generalAdmin-yr-1")).toBeInTheDocument();
  });

  it("renders zeros gracefully when chesterton data is undefined", () => {
    render(<ChestertonDashboard chesterton={undefined} />);
    expect(screen.getByTestId("chesterton-dashboard")).toBeInTheDocument();
    expect(
      screen.getByTestId("chesterton-dashboard-cell-enrollment-yr-0"),
    ).toHaveTextContent("0");
  });
});
