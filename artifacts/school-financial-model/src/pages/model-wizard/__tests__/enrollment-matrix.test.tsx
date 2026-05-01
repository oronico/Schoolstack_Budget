import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";

import { EnrollmentStep } from "../steps/EnrollmentStep";

// regression coverage for the new program × group matrix.
// We assert four behaviors:
//   1. The matrix renders one card per visible year column with one row per
//      program and one column per active group key.
//   2. Typing a number into a cell fans the sum down into the program's
//      yearN column (and therefore into enrollment.yearN).
//   3. The grade-band fan-out runs so charter math keeps working (cells
//      assigned to "k5" land in schoolProfile.gradeBandEnrollment.k5).
//   4. Toggling "Didn't offer" for an actuals year nulls every cell in that
//      row+year so it shows N/A instead of zero.

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      email: "founder@test.school",
      name: "Maya",
      personaStage: "operating_school",
      personaComfort: "comfortable",
      guidanceLevel: "standard",
    },
    isLoading: false,
    login: () => {},
    logout: () => {},
    refetchUser: async () => {},
  }),
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

let formRef: UseFormReturn | null = null;

function Harness({ initial }: { initial: Record<string, unknown> }) {
  const methods = useForm({ defaultValues: initial, mode: "onChange" });
  formRef = methods;
  return (
    <FormProvider {...methods}>
      <EnrollmentStep />
    </FormProvider>
  );
}

const baseInitial = {
  schoolProfile: {
    schoolName: "Maple Hill",
    schoolType: "private_school",
    schoolStage: "operating_school",
    operatingYear: "second_year_plus",
    plannedOpeningYear: "2026-27",
    studentGroupingMode: "age_bands",
    gradeBandActive: ["k5"],
    gradeActive: [],
    gradeBandEnrollment: { k5: [0, 0, 0, 0, 0] },
  },
  programs: [
    { id: "p1", name: "Full Day", annualTuition: 10000, year1: 0, year2: 0, year3: 0, year4: 0, year5: 0 },
    { id: "p2", name: "Half Day", annualTuition: 6000, year1: 0, year2: 0, year3: 0, year4: 0, year5: 0 },
  ],
  enrollment: {},
  revenueSources: {},
  budgetNarrative: { foundingQuestions: [] },
  staffing: {},
  tuitionEscalation: { rate: 3 },
};

describe("program × group enrollment matrix", () => {
  it("renders a cell per program × active group for year 1", () => {
    render(<Harness initial={baseInitial} />);
    expect(screen.getByTestId("matrix-cell-p1-year1-k5")).toBeTruthy();
    expect(screen.getByTestId("matrix-cell-p2-year1-k5")).toBeTruthy();
  });

  it("typing into a matrix cell fans the sum into program.year1", async () => {
    render(<Harness initial={baseInitial} />);
    const cell = screen.getByTestId("matrix-cell-p1-year1-k5") as HTMLInputElement;
    fireEvent.change(cell, { target: { value: "12" } });
    await waitFor(() => {
      const programs = formRef!.getValues("programs") as Array<{ id: string; year1: number }>;
      expect(programs.find((p) => p.id === "p1")!.year1).toBe(12);
    });
  });

  it("fans matrix cells assigned to a band into schoolProfile.gradeBandEnrollment.<band>", async () => {
    render(<Harness initial={baseInitial} />);
    fireEvent.change(screen.getByTestId("matrix-cell-p1-year1-k5") as HTMLInputElement, {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByTestId("matrix-cell-p2-year1-k5") as HTMLInputElement, {
      target: { value: "4" },
    });
    // The fan-out runs in two passes: first programs.yearN is updated, then
    // gradeBandEnrollment is updated on the next render. Use waitFor to
    // poll until both have settled.
    await waitFor(() => {
      const gbe = formRef!.getValues("schoolProfile.gradeBandEnrollment.k5") as number[];
      expect(gbe[0]).toBe(12);
    });
  });

  it("'Didn't offer' for an actuals year nulls every cell in the row", () => {
    render(<Harness initial={baseInitial} />);
    const naBox = screen.getByTestId("matrix-na-p1-priorYear") as HTMLInputElement;
    fireEvent.click(naBox);
    const matrix = formRef!.getValues("programEnrollmentMatrix") as Record<
      string,
      Record<string, Record<string, number | null>>
    >;
    expect(matrix.p1.priorYear.k5).toBeNull();
    const notOffered = formRef!.getValues("programNotOffered") as Record<
      string,
      Record<string, boolean>
    >;
    expect(notOffered.p1.priorYear).toBe(true);
  });

  it("per-cell N/A nulls a single cell without touching the others", () => {
    render(<Harness initial={baseInitial} />);
    const cellNa = screen.getByTestId("matrix-cell-na-p1-priorYear-k5");
    fireEvent.click(cellNa);
    const matrix = formRef!.getValues("programEnrollmentMatrix") as Record<
      string,
      Record<string, Record<string, number | null>>
    >;
    expect(matrix.p1.priorYear.k5).toBeNull();
    expect(matrix.p2?.priorYear?.k5 ?? 0).toBe(0);
  });

  it("column-level N/A nulls every program's cell in (yearKey, groupKey)", () => {
    render(<Harness initial={baseInitial} />);
    const colNa = screen.getByTestId("matrix-col-na-priorYear-k5");
    fireEvent.click(colNa);
    const matrix = formRef!.getValues("programEnrollmentMatrix") as Record<
      string,
      Record<string, Record<string, number | null>>
    >;
    expect(matrix.p1.priorYear.k5).toBeNull();
    expect(matrix.p2.priorYear.k5).toBeNull();
  });

  it("matrix actuals cells fan into program.priorYear", async () => {
    render(<Harness initial={baseInitial} />);
    fireEvent.change(screen.getByTestId("matrix-cell-p1-priorYear-k5") as HTMLInputElement, {
      target: { value: "9" },
    });
    await waitFor(() => {
      const programs = formRef!.getValues("programs") as Array<{ id: string; priorYear?: number }>;
      expect(programs.find((p) => p.id === "p1")!.priorYear).toBe(9);
    });
  });

  // Persistence regression: the "Didn't offer" checkbox must reflect the
  // programNotOffered mask (the user's stated intent) — never the cell
  // contents. If a cell ends up with a stray number while the row is
  // marked N/A, the toggle must stay checked and the cell must keep
  // rendering as the "—" placeholder so the user's choice survives reload.
  it("'Didn't offer' stays checked when an underlying cell becomes non-null", async () => {
    render(<Harness initial={baseInitial} />);
    const naBox = screen.getByTestId("matrix-na-p1-priorYear") as HTMLInputElement;
    fireEvent.click(naBox);
    expect(naBox.checked).toBe(true);

    // Simulate a stray cell value landing in the matrix (e.g. via the —
    // placeholder click that resets the cell to 0, or via a re-hydrated
    // form value that pre-dated the N/A toggle).
    formRef!.setValue("programEnrollmentMatrix.p1.priorYear.k5", 7, { shouldDirty: true });

    await waitFor(() => {
      const refreshedBox = screen.getByTestId("matrix-na-p1-priorYear") as HTMLInputElement;
      expect(refreshedBox.checked).toBe(true);
      const cell = screen.getByTestId("matrix-cell-p1-priorYear-k5");
      // Still the placeholder button — cell content is masked by the flag.
      expect(cell.tagName).toBe("BUTTON");
    });

    // The mask in the form value also persists.
    const notOffered = formRef!.getValues("programNotOffered") as Record<
      string,
      Record<string, boolean>
    >;
    expect(notOffered.p1.priorYear).toBe(true);
  });

  it("'Didn't offer' rehydrates from programNotOffered on mount", () => {
    const initial = {
      ...baseInitial,
      programEnrollmentMatrix: {
        p1: { priorYear: { k5: 0 } },
      },
      programNotOffered: {
        p1: { priorYear: true },
      },
    };
    render(<Harness initial={initial} />);
    const naBox = screen.getByTestId("matrix-na-p1-priorYear") as HTMLInputElement;
    // Even though the cell holds the number 0 (not null), the saved mask
    // wins and the checkbox is checked on reload.
    expect(naBox.checked).toBe(true);
    const cell = screen.getByTestId("matrix-cell-p1-priorYear-k5");
    expect(cell.tagName).toBe("BUTTON");
  });

  it("untoggling 'Didn't offer' clears the flag and lets cells be edited again", async () => {
    render(<Harness initial={baseInitial} />);
    const naBox = screen.getByTestId("matrix-na-p1-priorYear") as HTMLInputElement;

    // Toggle on — cells get nulled, mask records the choice.
    fireEvent.click(naBox);
    expect(naBox.checked).toBe(true);

    // Toggle off — mask clears, but cells remain null so the placeholder
    // is still showing (just no longer forced by the row mask).
    fireEvent.click(naBox);
    await waitFor(() => {
      const refreshedBox = screen.getByTestId("matrix-na-p1-priorYear") as HTMLInputElement;
      expect(refreshedBox.checked).toBe(false);
    });
    const notOffered = formRef!.getValues("programNotOffered") as Record<
      string,
      Record<string, boolean>
    >;
    expect(notOffered.p1.priorYear).toBe(false);

    // Clicking the placeholder converts the cell to an editable input.
    const placeholder = screen.getByTestId("matrix-cell-p1-priorYear-k5");
    expect(placeholder.tagName).toBe("BUTTON");
    fireEvent.click(placeholder);
    await waitFor(() => {
      const cell = screen.getByTestId("matrix-cell-p1-priorYear-k5");
      expect(cell.tagName).toBe("INPUT");
    });

    // And the input accepts a typed value.
    fireEvent.change(screen.getByTestId("matrix-cell-p1-priorYear-k5") as HTMLInputElement, {
      target: { value: "4" },
    });
    await waitFor(() => {
      const matrix = formRef!.getValues("programEnrollmentMatrix") as Record<
        string,
        Record<string, Record<string, number | null>>
      >;
      expect(matrix.p1.priorYear.k5).toBe(4);
    });
  });
});
