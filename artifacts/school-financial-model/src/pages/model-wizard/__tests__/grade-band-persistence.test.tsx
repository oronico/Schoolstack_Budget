import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";

import { StoryStep } from "../steps/StoryStep";

// regression test for the "picking a different school type or
// program blanks out gradeBandEnrollment" bug. We simulate the exact flow
// the founder hit:
//   1. Pick K-5 in StoryStep.
//   2. Type 12 students for Year-1.
//   3. Re-render the form with a DIFFERENT schoolProfile.schoolType (this is
//      what used to trigger zod's `.default([0,0,0,0,0])` to overwrite the
//      founder's value via `methods.reset(d)`).
// After step 3 the K-5 band must still be active and Year-1 must still be 12.

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: {
      id: 1,
      email: "founder@test.school",
      name: "Maya",
      personaStage: "yet_to_launch",
      personaComfort: "new_to_budgeting",
      guidanceLevel: "extra",
    },
    isLoading: false,
    login: () => {},
    logout: () => {},
    refetchUser: async () => {},
  });
  return { useAuth: ctx, useOptionalAuth: ctx };
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function Harness({
  initial,
}: {
  initial: Record<string, unknown>;
}) {
  const methods = useForm({ defaultValues: initial, mode: "onChange" });
  // Expose the raw form to assertions.
  (Harness as unknown as { last?: typeof methods }).last = methods;
  return (
    <FormProvider {...methods}>
      <StoryStep />
    </FormProvider>
  );
}

describe("grade band persistence across schoolType changes", () => {
  it("keeps K-5 active and Year-1 = 12 after switching schoolType", () => {
    const initial = {
      schoolProfile: {
        schoolName: "Maple Hill",
        schoolType: "microschool",
        // No gradeBandActive yet — first render.
      },
      revenueSources: {},
      budgetNarrative: { foundingQuestions: [] },
      staffing: {},
    };
    const { rerender } = render(<Harness initial={initial} />);

    // Step 1: turn on K-5.
    fireEvent.click(screen.getByTestId("story-grade-band-k5"));
    // Step 2: enter 12 students for year-1.
    const y1 = screen.getByTestId("story-band-year1-k5") as HTMLInputElement;
    fireEvent.change(y1, { target: { value: "12" } });

    // Sanity — the band detail card is on screen and shows 12.
    expect((screen.getByTestId("story-band-year1-k5") as HTMLInputElement).value).toBe("12");

    // Step 3: simulate re-rendering after schoolType changes (this is the
    // path that used to wipe the band — methods.reset was rebuilding the
    // form with the new schoolType and the schema's `.default([0,0,0,0,0])`
    // was overriding the founder's value back to zero).
    const form = (Harness as unknown as { last?: { setValue: Function; getValues: Function } }).last!;
    form.setValue("schoolProfile.schoolType", "private_school", { shouldDirty: true });
    rerender(<Harness initial={form.getValues()} />);

    // The band is still on, the Year-1 value is still 12.
    const after = screen.getByTestId("story-band-year1-k5") as HTMLInputElement;
    expect(after.value).toBe("12");
    const btn = screen.getByTestId("story-grade-band-k5");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("turning a band off and back on preserves the previously entered value", () => {
    const initial = {
      schoolProfile: {
        schoolName: "Maple Hill",
        schoolType: "microschool",
      },
      revenueSources: {},
      budgetNarrative: { foundingQuestions: [] },
      staffing: {},
    };
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByTestId("story-grade-band-k5"));
    const y1 = screen.getByTestId("story-band-year1-k5") as HTMLInputElement;
    fireEvent.change(y1, { target: { value: "9" } });
    expect((screen.getByTestId("story-band-year1-k5") as HTMLInputElement).value).toBe("9");

    // Turn off, then back on — the value should still be 9 (the new toggle
    // never blanks the enrollment array).
    fireEvent.click(screen.getByTestId("story-grade-band-k5"));
    fireEvent.click(screen.getByTestId("story-grade-band-k5"));
    expect((screen.getByTestId("story-band-year1-k5") as HTMLInputElement).value).toBe("9");
  });

  it("grouping mode defaults from schoolType when not explicitly set", () => {
    render(
      <Harness
        initial={{
          schoolProfile: { schoolType: "private_school" },
          revenueSources: {},
          budgetNarrative: { foundingQuestions: [] },
          staffing: {},
        }}
      />,
    );
    // private_school should default to "grades" — the grades section is
    // visible, and the bands section is not.
    expect(screen.queryByTestId("story-grades-section")).not.toBeNull();
    expect(screen.queryByTestId("story-bands-section")).toBeNull();
  });

  it("microschool defaults to age_bands grouping mode", () => {
    render(
      <Harness
        initial={{
          schoolProfile: { schoolType: "microschool" },
          revenueSources: {},
          budgetNarrative: { foundingQuestions: [] },
          staffing: {},
        }}
      />,
    );
    expect(screen.queryByTestId("story-bands-section")).not.toBeNull();
    expect(screen.queryByTestId("story-grades-section")).toBeNull();
  });
});
