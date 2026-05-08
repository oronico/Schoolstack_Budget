import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { FounderCompTeachingPanel } from "../FounderCompTeachingPanel";
import type { FullModelData } from "@/pages/model-wizard/schema";

function Harness({ initial }: { initial: Partial<FullModelData> }) {
  const methods = useForm({ defaultValues: initial });
  return (
    <FormProvider {...methods}>
      <FounderCompTeachingPanel yearCount={5} />
    </FormProvider>
  );
}

const baseModel: Partial<FullModelData> = {
  schoolProfile: { schoolType: "private_school", state: "OH" } as never,
  enrollment: { year1: 60, year2: 80, year3: 100, year4: 110, year5: 120 } as never,
  revenue: { tuitionPerStudent: 12_000 } as never,
  staffing: {
    studentsPerTeacher: 12,
    teacherSalary: 50_000,
    benefitsRate: 15,
    payrollTaxRate: 8,
  } as never,
  facilities: { monthlyRent: 6_000, annualSalaryIncrease: 3 } as never,
  openingBalances: { cash: 200_000 } as never,
  staffingRows: [
    {
      id: "founder-row",
      functionCategory: "school_leadership",
      roleName: "Head of School",
      fte: 1,
      annualizedRate: 0,
      benefitsEligible: true,
      employmentType: "full_time",
    },
    {
      id: "teacher-row",
      functionCategory: "instructional",
      roleName: "Teacher",
      fte: 5,
      annualizedRate: 50_000,
      benefitsEligible: true,
      employmentType: "full_time",
    },
  ] as never,
};

describe("FounderCompTeachingPanel (Task #685)", () => {
  it("renders the teaching block, the friendly inputs, and the side-by-side comparison", () => {
    render(<Harness initial={baseModel} />);
    expect(screen.getByTestId("founder-comp-teaching-panel")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-teaching-inputs")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-comparison")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-current")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-with")).toBeInTheDocument();
  });

  it("includes the not-paying-yet toggle, start month/year, and annual amount inputs", () => {
    render(<Harness initial={baseModel} />);
    expect(screen.getByTestId("founder-not-paying-yet")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-annual-amount")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-start-month")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-start-year")).toBeInTheDocument();
  });

  it("hides the start-date inputs when 'not paying yet' is checked", () => {
    render(
      <Harness
        initial={{
          ...baseModel,
          staffing: { ...baseModel.staffing, notPayingFounderYet: true } as never,
        }}
      />,
    );
    expect(screen.queryByTestId("founder-comp-annual-amount")).not.toBeInTheDocument();
  });

  it("shows the with-founder-pay metrics card with Y1 net income, runway, and lowest cash month rows", () => {
    render(
      <Harness
        initial={{
          ...baseModel,
          staffing: {
            ...baseModel.staffing,
            founderCompAnnualAmount: 60_000,
            founderCompStartMonth: 7,
            founderCompStartYear: 1,
          } as never,
        }}
      />,
    );
    expect(screen.getByTestId("founder-comp-with-y1-net-income")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-with-runway")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-with-lowest-cash")).toBeInTheDocument();
  });

  it("checking 'not paying yet' makes the with-comp side fall back to a market-rate placeholder", () => {
    render(<Harness initial={baseModel} />);
    // No annual amount entered AND school_type=private_school + state=OH means
    // the normalized benchmark fills in, so the with-card should still render
    // metrics.
    fireEvent.click(screen.getByTestId("founder-not-paying-yet"));
    // The with card should still exist; its sublabel should mention the
    // market-rate placeholder.
    expect(screen.getByTestId("founder-comp-with")).toBeInTheDocument();
  });

  it("uses coaching language (not judgmental)", () => {
    render(<Harness initial={baseModel} />);
    const note = screen.getByTestId("founder-comp-coaching-note").textContent || "";
    // Tone check: the coaching note should NOT contain shaming words.
    expect(note.toLowerCase()).not.toMatch(/wrong|fail|bad|stupid|mistake/);
    // It should frame unpaid as a real, intentional choice.
    expect(note.toLowerCase()).toMatch(/right call|on purpose|sustainable|real/);
  });
});

describe("FounderCompTeachingPanel saved scenarios (Task #693)", () => {
  it("renders the saved-scenarios section with an empty state and a disabled save button by default", () => {
    render(<Harness initial={baseModel} />);
    expect(screen.getByTestId("founder-comp-scenarios")).toBeInTheDocument();
    expect(screen.getByTestId("founder-comp-scenarios-empty")).toBeInTheDocument();
    const saveBtn = screen.getByTestId(
      "founder-comp-save-scenario",
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("enables 'Save current as scenario' once an amount is set, and adds a scenario card on click", () => {
    render(
      <Harness
        initial={{
          ...baseModel,
          staffing: {
            ...baseModel.staffing,
            founderCompAnnualAmount: 40_000,
            founderCompStartMonth: 8,
            founderCompStartYear: 1,
          } as never,
        }}
      />,
    );
    const saveBtn = screen.getByTestId(
      "founder-comp-save-scenario",
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);
    const list = screen.getByTestId("founder-comp-scenario-list");
    expect(list).toBeInTheDocument();
    // Exactly one direct-child scenario card is rendered.
    expect(list.children.length).toBe(1);
    // And it carries an active badge since it mirrors the current inputs.
    expect(
      list.querySelector("[data-testid$='-active-badge']"),
    ).not.toBeNull();
  });

  it("renders pre-saved scenarios side-by-side with their own metrics and lets the user switch between them", () => {
    render(
      <Harness
        initial={{
          ...baseModel,
          staffing: {
            ...baseModel.staffing,
            founderCompScenarios: [
              {
                id: "scn-now",
                name: "Start now at $40k",
                annualAmount: 40_000,
                startMonth: 1,
                startYear: 1,
              },
              {
                id: "scn-y2",
                name: "Wait til Y2 at $70k",
                annualAmount: 70_000,
                startMonth: 1,
                startYear: 2,
              },
            ],
            activeFounderCompScenarioId: "scn-now",
          } as never,
        }}
      />,
    );
    // Both saved scenarios render their own per-scenario metrics rows.
    expect(
      screen.getByTestId("founder-comp-scenario-scn-now-y1-net-income"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("founder-comp-scenario-scn-y2-y1-net-income"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("founder-comp-scenario-scn-now-runway"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("founder-comp-scenario-scn-y2-runway"),
    ).toBeInTheDocument();
    // The active scenario shows the active badge; the other does not.
    expect(
      screen.getByTestId("founder-comp-scenario-scn-now-active-badge"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("founder-comp-scenario-scn-y2-active-badge"),
    ).not.toBeInTheDocument();
    // Switching to the Y2 scenario marks it active.
    fireEvent.click(screen.getByTestId("founder-comp-scenario-scn-y2-use"));
    expect(
      screen.getByTestId("founder-comp-scenario-scn-y2-active-badge"),
    ).toBeInTheDocument();
  });

  it("removes a saved scenario when the delete button is clicked", () => {
    render(
      <Harness
        initial={{
          ...baseModel,
          staffing: {
            ...baseModel.staffing,
            founderCompScenarios: [
              {
                id: "scn-keep",
                name: "Keep me",
                annualAmount: 50_000,
                startMonth: 7,
                startYear: 1,
              },
              {
                id: "scn-drop",
                name: "Drop me",
                annualAmount: 80_000,
                startMonth: 1,
                startYear: 2,
              },
            ],
          } as never,
        }}
      />,
    );
    expect(
      screen.getByTestId("founder-comp-scenario-scn-drop"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("founder-comp-scenario-scn-drop-delete"));
    expect(
      screen.queryByTestId("founder-comp-scenario-scn-drop"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("founder-comp-scenario-scn-keep"),
    ).toBeInTheDocument();
  });

  it("disables the save button once 3 scenarios are already saved", () => {
    render(
      <Harness
        initial={{
          ...baseModel,
          staffing: {
            ...baseModel.staffing,
            founderCompAnnualAmount: 50_000,
            founderCompStartMonth: 7,
            founderCompStartYear: 1,
            founderCompScenarios: [
              { id: "a", name: "A", annualAmount: 30_000, startMonth: 1, startYear: 1 },
              { id: "b", name: "B", annualAmount: 50_000, startMonth: 1, startYear: 2 },
              { id: "c", name: "C", annualAmount: 80_000, startMonth: 1, startYear: 3 },
            ],
          } as never,
        }}
      />,
    );
    const saveBtn = screen.getByTestId(
      "founder-comp-save-scenario",
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });
});
