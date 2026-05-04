import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: { id: 1, email: "founder@test.school", name: "Founder", personaComfort: "comfortable" },
    isLoading: false,
    login: () => {},
    logout: () => {},
    refetchUser: async () => {},
  });
  return { useAuth: ctx, useOptionalAuth: ctx };
});
vi.mock("@/lib/coaching/track", () => ({
  trackCoachingEvent: () => {},
}));

import { CustomScenarioCard } from "../index";
import type { CustomScenario } from "@/pages/model-wizard/schema";
import type { ActualsSuggestion, ProjectedSnapshot } from "@/lib/decision-flows";
import type { StaffingRowData } from "@/lib/staffing-defaults";
import {
  aggregateRosterCapSavings,
  type PayrollTaxComponent,
} from "@workspace/finance";

const WA_COMPONENTS: PayrollTaxComponent[] = [
  { label: "FICA SS", rate: 6.2, wageBase: 176_100 },
  { label: "Medicare", rate: 1.45 },
  { label: "FUTA", rate: 0.6, wageBase: 7_000 },
  { label: "WA SUI", rate: 1.22, wageBase: 72_800 },
  { label: "WA PFML", rate: 0.28, wageBase: 176_100 },
  { label: "WA Comp", rate: 0.4 },
];

function makeStaffingRow(
  partial: Partial<StaffingRowData> & Pick<StaffingRowData, "id" | "roleName" | "annualizedRate">,
): StaffingRowData {
  return {
    functionCategory: "school_leadership",
    employmentType: "full_time",
    fte: 1,
    benefitsEligible: true,
    benefitsRate: 25,
    payrollTaxRate: 9.95,
    payrollLike: true,
    notes: "",
    staffingMode: "fixed",
    payrollTaxComponents: WA_COMPONENTS,
    ...partial,
  };
}

function makeScenario(overrides: Partial<CustomScenario> = {}): CustomScenario {
  return {
    name: "Hire Director of Operations",
    createdAt: "2026-04-01T12:00:00.000Z",
    overrides: {},
    decisionType: "evaluate_site",
    outcomeStatus: "on_hold",
    outcomeUpdatedAt: "2026-04-15T12:00:00.000Z",
    ...overrides,
  };
}

const projectedSnapshot: ProjectedSnapshot = {
  asOfYear: 1,
  enrollment: 120,
  revenue: 2_400_000,
  expense: 2_100_000,
  netIncome: 300_000,
  monthlyRent: 12_500,
  programEnrollment: 0,
};

const emptySuggestion: ActualsSuggestion = {
  values: {},
  sources: {},
  sourceLabels: [],
  contributors: {},
};

function renderCard(props: {
  staffingRows?: StaffingRowData[];
  personaComfort?: "new_to_budgeting" | "comfortable" | null;
} = {}) {
  render(
    <CustomScenarioCard
      scenario={makeScenario()}
      index={0}
      fmtDate={(iso) => new Date(iso).toLocaleDateString("en-US")}
      onRemove={vi.fn(async () => {})}
      onPatch={vi.fn(async () => {})}
      onOpenInPlanner={vi.fn()}
      onApplyToModel={vi.fn(async () => {})}
      getProjectedSnapshot={() => projectedSnapshot}
      getActualsSuggestion={() => emptySuggestion}
      staffingRows={props.staffingRows}
      personaComfort={props.personaComfort ?? null}
    />,
  );
}

describe("CustomScenarioCard — wage-base cap savings insight", () => {
  it("renders the persona-aware insight when at least one row clears a wage-base cap", () => {
    renderCard({
      staffingRows: [
        makeStaffingRow({ id: "1", roleName: "Head of School", annualizedRate: 200_000 }),
      ],
      personaComfort: "comfortable",
    });

    const insight = screen.getByTestId("custom-scenario-cap-insight-0");
    expect(insight).toBeInTheDocument();
    // Technical (comfortable) wording leads with the wage-base mechanic.
    expect(insight).toHaveTextContent(/Wage-base caps hit on/i);
    expect(insight).toHaveTextContent(/saves \$[\d,]+\/yr/i);
  });

  it("uses the plain-language variant for new_to_budgeting founders", () => {
    renderCard({
      staffingRows: [
        makeStaffingRow({ id: "1", roleName: "Head of School", annualizedRate: 200_000 }),
      ],
      personaComfort: "new_to_budgeting",
    });

    const insight = screen.getByTestId("custom-scenario-cap-insight-0");
    expect(insight).toHaveTextContent(/earn above the wage-base cap/i);
    expect(insight).toHaveTextContent(/saves about \$[\d,]+\/yr/i);
  });

  it("hides the insight when no row clears any wage-base cap", () => {
    renderCard({
      staffingRows: [
        // $6.5k stays under FUTA's $7k floor (the lowest cap), so nothing triggers.
        makeStaffingRow({ id: "1", roleName: "Aide", annualizedRate: 6_500 }),
      ],
    });
    expect(screen.queryByTestId("custom-scenario-cap-insight-0")).not.toBeInTheDocument();
  });

  it("hides the insight when there is no roster (legacy / pre-staffing model)", () => {
    renderCard({ staffingRows: [] });
    expect(screen.queryByTestId("custom-scenario-cap-insight-0")).not.toBeInTheDocument();
  });

  it("excludes contract rows that are not payroll-like and rows whose blended rate is overridden", () => {
    // The math integrity check from the Task #322 review: if the card hands
    // these rows to the aggregator without their exclusion fields, the
    // displayed savings would over-count vs. what the wizard shows.
    const rows: StaffingRowData[] = [
      makeStaffingRow({ id: "real", roleName: "Head of School", annualizedRate: 200_000 }),
      makeStaffingRow({
        id: "contractor",
        roleName: "1099 Curriculum Consultant",
        annualizedRate: 200_000,
        employmentType: "contract",
        payrollLike: false,
      }),
      makeStaffingRow({
        id: "overridden",
        roleName: "Director of Operations",
        annualizedRate: 200_000,
        payrollTaxRateOverridden: true,
      }),
    ];

    renderCard({ staffingRows: rows, personaComfort: "comfortable" });

    const insight = screen.getByTestId("custom-scenario-cap-insight-0");
    // The displayed dollar amount must equal the savings from ONLY the
    // single payroll-like, non-overridden row — this is what
    // `aggregateRosterCapSavings` produces when called with the full row
    // shape including exclusion fields.
    const expected = aggregateRosterCapSavings([
      {
        annualizedRate: 200_000,
        fte: 1,
        payrollTaxComponents: WA_COMPONENTS,
      },
    ]);
    expect(expected).not.toBeNull();
    if (!expected) return;
    expect(insight).toHaveTextContent(`$${expected.totalSavings.toLocaleString()}/yr`);
    // The card should report the correct headcount (1 role), not 3.
    expect(insight).toHaveTextContent(/across 1 role/i);
  });
});
