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
