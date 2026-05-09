// Task #705 — Simple vs CFO metric contract tests.
//
// 1. Simple Summary panel renders strengths, items to clarify, what to
//    fix first, lowest cash month.
// 2. CFO Detail panel renders staffing %, facility %, reserves,
//    debt cushion, founder comp, revenue quality, lowest cash.
// 3. Every consultant-engine warning rendered on Review carries a
//    `Next step:` line (Task #686 contract).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SimpleSummaryPanel, CfoDetailPanel } from "../ReviewMetricsPanels";
import { computeMetrics, runDiagnostics } from "@/lib/coaching/diagnostics-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";

function buildModel(overrides: Partial<FullModelData> = {}): FullModelData {
  return {
    schoolProfile: { schoolType: "private_school", year1OperatingMonths: 12, fiscalYearStartMonth: 7 },
    enrollment: { year1: 120, year2: 0, year3: 0, year4: 0, year5: 0 },
    revenueRows: [
      {
        id: "tuition",
        category: "tuition_and_fees",
        enabled: true,
        driverType: "per_student",
        amounts: [10_000],
        billingMonths: 10,
      },
    ],
    expenseRows: [
      { id: "rent", category: "occupancy_facility", enabled: true, driverType: "annual_fixed", amounts: [180_000] },
      { id: "supplies", category: "instructional_program", enabled: true, driverType: "annual_fixed", amounts: [40_000] },
    ],
    staffingRows: [
      { id: "teacher", category: "instructional", enabled: true, fte: 6, salary: [60_000], benefitsPctOfSalary: 20 },
    ],
    capitalAndDebtRows: [],
    openingBalances: { cash: 200_000 },
    ...overrides,
  } as unknown as FullModelData;
}

describe("Task #705 — Simple Summary metric contract", () => {
  it("renders all four required sections", () => {
    const data = buildModel();
    const metrics = computeMetrics(data);
    render(
      <SimpleSummaryPanel
        data={data}
        metrics={metrics}
        lowestCash={{ monthLabel: "Aug", amount: 25_000, isNegative: false }}
      />,
    );
    expect(screen.getByTestId("simple-summary-panel")).toBeInTheDocument();
    expect(screen.getByTestId("simple-strengths")).toBeInTheDocument();
    expect(screen.getByTestId("simple-clarify")).toBeInTheDocument();
    expect(screen.getByTestId("simple-fix-first")).toBeInTheDocument();
    expect(screen.getByTestId("simple-lowest-cash")).toBeInTheDocument();
  });

  it("renders the lowest cash month and amount", () => {
    const data = buildModel();
    const metrics = computeMetrics(data);
    render(
      <SimpleSummaryPanel
        data={data}
        metrics={metrics}
        lowestCash={{ monthLabel: "Aug", amount: 25_000, isNegative: false }}
      />,
    );
    expect(screen.getByTestId("simple-lowest-cash").textContent).toMatch(/Aug/);
  });

  it("every clarify/fix item rendered carries a Next step line", () => {
    const data = buildModel();
    const metrics = computeMetrics(data);
    render(
      <SimpleSummaryPanel
        data={data}
        metrics={metrics}
        lowestCash={{ monthLabel: "Aug", amount: 25_000, isNegative: false }}
      />,
    );
    // Sweep both clarify and fix-first containers — every rendered
    // diagnostic must show a Next step prompt for the founder.
    const clarify = screen.getByTestId("simple-clarify");
    const fixFirst = screen.getByTestId("simple-fix-first");
    for (const node of [clarify, fixFirst]) {
      const text = node.textContent ?? "";
      // Either the panel is empty (no findings) or it includes the
      // canonical next-step copy.
      if (text && !text.match(/Nothing flagged|Nothing critical/)) {
        expect(text).toMatch(/Next step:/i);
      }
    }
  });
});

describe("Task #705 — CFO Detail metric contract", () => {
  it("renders all required CFO metrics", () => {
    const data = buildModel();
    const metrics = computeMetrics(data);
    render(
      <CfoDetailPanel
        data={data}
        metrics={metrics}
        lowestCash={{ monthLabel: "Aug", amount: 25_000, isNegative: false }}
        annualDebtService={50_000}
      />,
    );
    expect(screen.getByTestId("cfo-detail-panel")).toBeInTheDocument();
    expect(screen.getByTestId("cfo-staffing-pct")).toBeInTheDocument();
    expect(screen.getByTestId("cfo-facility-pct")).toBeInTheDocument();
    expect(screen.getByTestId("cfo-reserves-months")).toBeInTheDocument();
    expect(screen.getByTestId("cfo-debt-cushion")).toBeInTheDocument();
    expect(screen.getByTestId("cfo-founder-comp")).toBeInTheDocument();
    expect(screen.getByTestId("cfo-revenue-quality")).toBeInTheDocument();
    expect(screen.getByTestId("cfo-lowest-cash")).toBeInTheDocument();
  });

  it("relabels the debt-service ratio as 'Debt payment cushion'", () => {
    const data = buildModel();
    const metrics = computeMetrics(data);
    render(
      <CfoDetailPanel
        data={data}
        metrics={metrics}
        lowestCash={null}
        annualDebtService={50_000}
      />,
    );
    expect(screen.getByTestId("cfo-debt-cushion").textContent).toMatch(/Debt payment cushion/);
  });
});

describe("Task #705 — diagnostic engine Next-step contract", () => {
  it("every diagnostic finding emitted on Review carries a Next step", () => {
    const data = buildModel({
      // Force findings: tiny opening cash, big rent, no founder comp
      openingBalances: { cash: 1_000 },
      expenseRows: [
        { id: "rent", category: "occupancy_facility", enabled: true, driverType: "annual_fixed", amounts: [600_000] },
      ],
    } as unknown as Partial<FullModelData>);
    const findings = runDiagnostics(data, 10);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.nextStep, `${f.id} must carry Next step`).toBeTruthy();
      expect(f.nextStep.length).toBeGreaterThan(8);
    }
  });
});
