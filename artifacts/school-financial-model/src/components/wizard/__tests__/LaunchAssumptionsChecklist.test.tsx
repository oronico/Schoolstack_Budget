import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import type { ReactNode } from "react";
import { LaunchAssumptionsChecklist } from "../LaunchAssumptionsChecklist";

function Wrap({ stage, children }: { stage: string; children: ReactNode }) {
  const methods = useForm({
    defaultValues: { schoolProfile: { schoolStage: stage } },
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe("LaunchAssumptionsChecklist (Task #703)", () => {
  it("renders for new_school stage", () => {
    render(
      <Wrap stage="new_school">
        <LaunchAssumptionsChecklist />
      </Wrap>,
    );
    expect(screen.getByTestId("launch-assumptions-checklist")).toBeInTheDocument();
    expect(screen.getByText(/Launch checklist/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Committed students/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Signed enrollment agreements/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Projected opening month/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/First month with payroll/i)).toBeInTheDocument();
  });

  it("does not render for operating_school stage", () => {
    render(
      <Wrap stage="operating_school">
        <LaunchAssumptionsChecklist />
      </Wrap>,
    );
    expect(screen.queryByTestId("launch-assumptions-checklist")).toBeNull();
  });

  it("does not render for yet_to_launch stage", () => {
    render(
      <Wrap stage="yet_to_launch">
        <LaunchAssumptionsChecklist />
      </Wrap>,
    );
    expect(screen.queryByTestId("launch-assumptions-checklist")).toBeNull();
  });
});
