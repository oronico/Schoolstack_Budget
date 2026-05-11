import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { FounderCompPanel } from "../StaffingStep";

/**
 * Task #634 — component coverage for the FounderCompPanel "Use suggested
 * market rate" affordance. Pins:
 *   1. The button renders only when a benchmark resolves (school type +
 *      state both present).
 *   2. Clicking the button writes the per-year benchmark series into
 *      `staffing.normalizedFounderComp` (Task #650 per-year defaults), not
 *      a Y1 broadcast.
 *   3. Editing a single Y2 normalized cell preserves the surrounding
 *      values (no array shrink + setValue mutation regressions).
 *   4. The legacy `staffing.founderSalary` value renders as the Y1 reported
 *      placeholder when no per-year `reportedFounderComp[]` exists yet.
 */

interface HarnessProps {
  defaults?: Record<string, unknown>;
  schoolType?: string;
  stateCode?: string;
  colaRate?: number;
  enrollmentArr?: number[];
}

function Harness({
  defaults = {},
  schoolType = "private_school",
  stateCode = "OH",
  colaRate = 0,
  enrollmentArr = [100, 140, 200, 280, 350],
}: HarnessProps) {
  const methods = useForm({ defaultValues: defaults });
  // Expose form state to the test via a ref-style hook
  return (
    <FormProvider {...methods}>
      <FounderCompPanel
        schoolType={schoolType}
        stateCode={stateCode}
        colaRate={colaRate}
        enrollmentArr={enrollmentArr}
      />
      <button
        data-testid="dump-form"
        type="button"
        onClick={() => {
          const v = methods.getValues();
          (window as unknown as { __formValues: unknown }).__formValues = v;
        }}
      >
        dump
      </button>
    </FormProvider>
  );
}

function readForm(): Record<string, unknown> {
  fireEvent.click(screen.getByTestId("dump-form"));
  return (window as unknown as { __formValues: Record<string, unknown> }).__formValues;
}

describe("FounderCompPanel — 'Use suggested market rate' affordance (Task #634)", () => {
  it("renders the panel and reported/normalized inputs for every modeled year", () => {
    render(<Harness />);
    expect(screen.getByTestId("founder-comp-panel")).toBeInTheDocument();
    for (let y = 1; y <= 5; y++) {
      expect(screen.getByTestId(`founder-reported-y${y}`)).toBeInTheDocument();
      expect(screen.getByTestId(`founder-normalized-y${y}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("founder-apply-suggested")).toBeInTheDocument();
  });

  it("clicking 'Use suggested market rate' fills normalizedFounderComp from the per-year benchmark series", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("founder-apply-suggested"));
    const v = readForm() as { staffing?: { normalizedFounderComp?: number[] } };
    const series = v.staffing?.normalizedFounderComp;
    expect(Array.isArray(series)).toBe(true);
    expect(series).toHaveLength(5);
    // private_school NAIS bands @ 0% COLA: xs ($140k <150), s ($180k 150–300), m ($230k 300+)
    // Enrollments [100, 140, 200, 280, 350] → [xs, xs, s, s, m]
    expect(series).toEqual([140_000, 140_000, 180_000, 180_000, 230_000]);
  });

  it("rounds the per-year benchmark to the nearest $1k after applying COLA escalation", () => {
    render(
      <Harness
        colaRate={3}
        enrollmentArr={[100, 100, 100, 100, 100]}
      />,
    );
    fireEvent.click(screen.getByTestId("founder-apply-suggested"));
    const v = readForm() as { staffing?: { normalizedFounderComp?: number[] } };
    const series = v.staffing?.normalizedFounderComp ?? [];
    // Y1 = 140k base; Y5 = 140k * 1.03^4 → rounded to nearest $1k
    expect(series[0]).toBe(140_000);
    expect(series[4]).toBe(Math.round((140_000 * Math.pow(1.03, 4)) / 1000) * 1000);
    // Strictly increasing under positive COLA
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
    }
  });

  it("hides the 'Use suggested market rate' button when no benchmark resolves (missing schoolType)", () => {
    render(<Harness schoolType="" />);
    expect(screen.queryByTestId("founder-apply-suggested")).not.toBeInTheDocument();
  });

  it("editing a single normalized Y2 cell does not clobber the other years", () => {
    render(
      <Harness
        defaults={{
          staffing: {
            normalizedFounderComp: [100_000, 100_000, 100_000, 100_000, 100_000],
          },
        }}
      />,
    );
    const y2 = screen.getByTestId("founder-normalized-y2") as HTMLInputElement;
    fireEvent.change(y2, { target: { value: "125000" } });
    const v = readForm() as { staffing?: { normalizedFounderComp?: number[] } };
    expect(v.staffing?.normalizedFounderComp).toEqual([
      100_000,
      125_000,
      100_000,
      100_000,
      100_000,
    ]);
  });

  it("renders the legacy founderSalary as the Y1 reported placeholder when no per-year array exists", () => {
    render(
      <Harness
        defaults={{ staffing: { founderSalary: 65_000 } }}
      />,
    );
    const y1 = screen.getByTestId("founder-reported-y1") as HTMLInputElement;
    expect(Number(y1.value)).toBe(65_000);
    // Other years stay empty (placeholder "0") — no silent broadcast.
    const y2 = screen.getByTestId("founder-reported-y2") as HTMLInputElement;
    expect(y2.value).toBe("");
  });

  it("flags band transitions when enrollment crosses NAIS / NACSA size-band thresholds", () => {
    render(
      <Harness
        enrollmentArr={[100, 140, 200, 280, 350]}
      />,
    );
    // xs → s in Y3, s → m in Y5
    expect(screen.getByTestId("founder-band-transitions")).toBeInTheDocument();
    expect(screen.getByTestId("founder-band-transition-msg-y3")).toBeInTheDocument();
    expect(screen.getByTestId("founder-band-transition-msg-y5")).toBeInTheDocument();
  });
});
