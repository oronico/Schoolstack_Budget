import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";

import { StoryStep } from "../steps/StoryStep";

// Regression coverage for Task #517: the per-grade and per-band detail
// sections render as a single matrix table (one row per grade/band) and
// the Y5 column is hidden when the model is in single-year mode.

vi.mock("@/lib/auth-context", () => {
  const ctx = () => ({
    user: {
      id: 1,
      email: "founder@test.school",
      name: "Maya",
      personaStage: "yet_to_launch",
      personaComfort: "comfortable",
      guidanceLevel: "standard",
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

function Harness({ initial }: { initial: Record<string, unknown> }) {
  const methods = useForm({ defaultValues: initial, mode: "onChange" });
  return (
    <FormProvider {...methods}>
      <StoryStep />
    </FormProvider>
  );
}

const gradeFiveYearInitial = {
  schoolProfile: {
    schoolName: "Maple Hill",
    schoolType: "private_school",
    studentGroupingMode: "grades",
    modelDuration: "five_year",
    gradeActive: ["k", "g1", "g2"],
    gradeEnrollment: { k: [10, 0, 0, 0, 0], g1: [12, 0, 0, 0, 0], g2: [14, 0, 0, 0, 0] },
    gradePerPupil: { k: 8000, g1: 8500, g2: 9000 },
  },
  revenueSources: {},
  budgetNarrative: { foundingQuestions: [] },
  staffing: {},
};

const gradeSingleYearInitial = {
  ...gradeFiveYearInitial,
  schoolProfile: { ...gradeFiveYearInitial.schoolProfile, modelDuration: "single_year" },
};

const bandFiveYearInitial = {
  schoolProfile: {
    schoolName: "Maple Hill",
    schoolType: "microschool",
    studentGroupingMode: "age_bands",
    modelDuration: "five_year",
    gradeBandActive: ["k5", "m68"],
    gradeBandEnrollment: { k5: [10, 0, 0, 0, 0], m68: [8, 0, 0, 0, 0] },
    gradeBandPerPupil: { k5: 9000, m68: 10000 },
  },
  revenueSources: {},
  budgetNarrative: { foundingQuestions: [] },
  staffing: {},
};

const bandSingleYearInitial = {
  ...bandFiveYearInitial,
  schoolProfile: { ...bandFiveYearInitial.schoolProfile, modelDuration: "single_year" },
};

describe("Story step grade matrix", () => {
  it("renders one row per active grade with Y1 / tuition / Y5 / ratio cells", () => {
    render(<Harness initial={gradeFiveYearInitial} />);
    for (const key of ["k", "g1", "g2"] as const) {
      const row = screen.getByTestId(`story-grade-detail-${key}`);
      expect(row).toBeTruthy();
      expect(screen.getByTestId(`story-grade-year1-${key}`)).toBeTruthy();
      expect(screen.getByTestId(`story-grade-per-pupil-${key}`)).toBeTruthy();
      expect(screen.getByTestId(`story-grade-longterm-${key}`)).toBeTruthy();
      expect(screen.getByTestId(`story-grade-ratio-${key}`)).toBeTruthy();
    }
    expect(screen.getByTestId("story-grade-y5-header")).toBeTruthy();
  });

  it("hides the Y5 column on the grade matrix in single-year mode", () => {
    render(<Harness initial={gradeSingleYearInitial} />);
    expect(screen.queryByTestId("story-grade-y5-header")).toBeNull();
    expect(screen.queryByTestId("story-grade-longterm-k")).toBeNull();
    // The other cells remain present.
    expect(screen.getByTestId("story-grade-year1-k")).toBeTruthy();
    expect(screen.getByTestId("story-grade-per-pupil-k")).toBeTruthy();
    expect(screen.getByTestId(`story-grade-ratio-k`)).toBeTruthy();
  });

  // Task #519: on phone-sized viewports, the grade matrix should not require
  // horizontal scrolling. We achieve this with a responsive layout — the
  // desktop column header is hidden on mobile (sm:hidden inversion) and each
  // row stacks its cells with a per-cell label that's sm-hidden on desktop.
  it("renders mobile-friendly per-row labels and stacks cells (no horizontal scroll)", () => {
    render(<Harness initial={gradeFiveYearInitial} />);
    // Each grade row carries a mobile-only label for the Y1 students cell.
    for (const key of ["k", "g1", "g2"] as const) {
      const label = screen.getByTestId(`story-grade-year1-label-${key}`);
      expect(label).toBeTruthy();
      // Mobile labels should be hidden on sm+ (Tailwind's sm:hidden class).
      expect(label.className).toMatch(/\bsm:hidden\b/);
    }
    // The row container is a CSS grid with grid-cols-1 on mobile so cells
    // stack vertically rather than overflowing horizontally.
    const row = screen.getByTestId("story-grade-detail-k");
    expect(row.className).toMatch(/\bgrid-cols-1\b/);
    expect(row.className).toMatch(/\bsm:grid-cols-/);
    // The container is no longer wrapped in overflow-x-auto.
    const section = row.parentElement;
    expect(section?.className ?? "").not.toMatch(/overflow-x-auto/);
  });

  // Task #520 totals row, adapted for the responsive div layout (Task #519).
  it("renders a totals row summing Y1, tuition revenue, and Y5", () => {
    render(<Harness initial={gradeFiveYearInitial} />);
    const totalsRow = screen.getByTestId("story-grade-totals-row");
    expect(totalsRow).toBeTruthy();
    // Mirrors the per-row grid so the layout works on phones and desktop.
    expect(totalsRow.className).toMatch(/\bgrid-cols-1\b/);
    expect(totalsRow.className).toMatch(/\bsm:grid-cols-/);
    // Y1 sum: 10 + 12 + 14 = 36
    expect(screen.getByTestId("story-grade-total-year1").textContent).toContain("36");
    // Tuition revenue sum: 10*8000 + 12*8500 + 14*9000 = 80000 + 102000 + 126000 = 308000
    expect(screen.getByTestId("story-grade-total-tuition").textContent).toContain("308,000");
    // Y5 sum (none entered) = 0
    expect(screen.getByTestId("story-grade-total-y5").textContent).toContain("0");
    // Ratio shown as a weighted average string.
    expect(screen.getByTestId("story-grade-total-ratio").textContent).toContain("avg");
    // When no band footer is visible, the legacy `story-year1-total`
    // testid lives on the grade footer so existing selectors keep working.
    expect(screen.getByTestId("story-year1-total").textContent).toBe("36");
  });

  it("hides the Y5 totals cell in single-year mode", () => {
    render(<Harness initial={gradeSingleYearInitial} />);
    expect(screen.queryByTestId("story-grade-total-y5")).toBeNull();
    expect(screen.getByTestId("story-grade-total-year1").textContent).toContain("36");
  });
});

describe("Story step age-band matrix", () => {
  it("renders one row per active band with Y1 / tuition / Y5 / ratio cells", () => {
    render(<Harness initial={bandFiveYearInitial} />);
    for (const key of ["k5", "m68"] as const) {
      const row = screen.getByTestId(`story-band-detail-${key}`);
      expect(row).toBeTruthy();
      expect(screen.getByTestId(`story-band-year1-${key}`)).toBeTruthy();
      expect(screen.getByTestId(`story-band-per-pupil-${key}`)).toBeTruthy();
      expect(screen.getByTestId(`story-band-longterm-${key}`)).toBeTruthy();
      expect(screen.getByTestId(`story-band-ratio-${key}`)).toBeTruthy();
    }
    expect(screen.getByTestId("story-band-y5-header")).toBeTruthy();
  });

  it("hides the Y5 column on the band matrix in single-year mode", () => {
    render(<Harness initial={bandSingleYearInitial} />);
    expect(screen.queryByTestId("story-band-y5-header")).toBeNull();
    expect(screen.queryByTestId("story-band-longterm-k5")).toBeNull();
    expect(screen.getByTestId("story-band-year1-k5")).toBeTruthy();
    expect(screen.getByTestId("story-band-per-pupil-k5")).toBeTruthy();
    expect(screen.getByTestId("story-band-ratio-k5")).toBeTruthy();
  });

  // Task #519: same mobile-friendly layout as the grade matrix above.
  it("renders mobile-friendly per-row labels and stacks cells (no horizontal scroll)", () => {
    render(<Harness initial={bandFiveYearInitial} />);
    for (const key of ["k5", "m68"] as const) {
      const label = screen.getByTestId(`story-band-year1-label-${key}`);
      expect(label).toBeTruthy();
      expect(label.className).toMatch(/\bsm:hidden\b/);
    }
    const row = screen.getByTestId("story-band-detail-k5");
    expect(row.className).toMatch(/\bgrid-cols-1\b/);
    expect(row.className).toMatch(/\bsm:grid-cols-/);
    const section = screen.getByTestId("story-bands-detail-section");
    expect(section.className).not.toMatch(/overflow-x-auto/);
  });

  // Task #520 totals row, adapted for the responsive div layout (Task #519).
  it("renders a totals row summing Y1 and tuition revenue across bands", () => {
    render(<Harness initial={bandFiveYearInitial} />);
    const totalsRow = screen.getByTestId("story-band-totals-row");
    expect(totalsRow).toBeTruthy();
    // Mirrors the per-row grid so it stacks on mobile and lines up with cells on sm+.
    expect(totalsRow.className).toMatch(/\bgrid-cols-1\b/);
    expect(totalsRow.className).toMatch(/\bsm:grid-cols-/);
    // Y1 sum: 10 + 8 = 18
    expect(screen.getByTestId("story-band-total-year1").textContent).toContain("18");
    // Tuition revenue: 10*9000 + 8*10000 = 170000
    expect(screen.getByTestId("story-band-total-tuition").textContent).toContain("170,000");
    expect(screen.getByTestId("story-band-total-y5")).toBeTruthy();
    expect(screen.getByTestId("story-band-total-ratio").textContent).toContain("avg");
    // The legacy `story-year1-total` testid is preserved on the band footer
    // when bands are visible, so existing selectors keep working.
    expect(screen.getByTestId("story-year1-total").textContent).toBe("18");
  });

  it("hides the Y5 band totals cell in single-year mode", () => {
    render(<Harness initial={bandSingleYearInitial} />);
    expect(screen.queryByTestId("story-band-total-y5")).toBeNull();
    expect(screen.getByTestId("story-band-total-year1").textContent).toContain("18");
  });
});
