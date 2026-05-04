import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";

import type { ExpenseRowData } from "@/lib/expense-defaults";
import type { StaffingRowData } from "@/lib/staffing-defaults";

// ExpenseStep calls `useAuth()` directly, which throws when no AuthProvider
// is mounted. We don't care about the auth-driven coaching variants here —
// the ramp preview only depends on the wizard form state — so stub the
// module to keep the harness lightweight (mirrors the pattern used by
// `ExportStep.single-year.test.tsx`).
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null }),
  useOptionalAuth: () => null,
}));

import { ExpenseStep } from "../ExpenseStep";

const SUPPLIES_ROW_ID = "test_supplies";

interface HarnessProps {
  /** Per-row escalation rate for the seeded non-payroll row. `undefined`
   *  means "fall back to general cost inflation" (the modal-mirror path). */
  escalationRate?: number;
  modelDuration?: "single_year" | "five_year";
}

function buildStaffingRows(): StaffingRowData[] {
  // One full-time teacher at $100k with no benefits/payroll-tax loading so
  // the payroll preview math is a clean `$100,000 → $100k * 1.05^4`.
  return [
    {
      id: "lead_teacher",
      roleName: "Lead Teacher",
      functionCategory: "instructional",
      employmentType: "full_time",
      fte: 1,
      annualizedRate: 100_000,
      benefitsEligible: false,
      benefitsRate: 0,
      payrollTaxRate: 0,
      payrollLike: false,
      notes: "",
      staffingMode: "fixed",
    },
  ];
}

function buildExpenseRows(escalationRate: number | undefined): ExpenseRowData[] {
  return [
    {
      id: SUPPLIES_ROW_ID,
      category: "instructional_program",
      lineItem: "Test Supplies",
      enabled: true,
      driverType: "annual_fixed",
      amounts: [10_000, 0, 0, 0, 0],
      escalationRate,
      note: "",
      accountCode: "",
    },
  ];
}

function Harness({ escalationRate, modelDuration = "five_year" }: HarnessProps) {
  const methods = useForm({
    defaultValues: {
      schoolProfile: {
        schoolStage: "new_school",
        fundingProfile: "tuition_based",
        schoolType: "private_independent",
        modelDuration,
      },
      facilities: {
        // 5%/yr salary escalation drives the payroll Y5 preview.
        annualSalaryIncrease: 5,
        // 3%/yr general cost inflation is the per-row fallback when
        // `escalationRate` is undefined.
        generalCostInflation: 3,
        annualRentIncrease: 3,
      },
      enrollment: { year1: 100 },
      staffingRows: buildStaffingRows(),
      expenseRows: buildExpenseRows(escalationRate),
      capitalAndDebtRows: [],
    },
    mode: "onChange",
  });

  // Push prop-driven escalationRate updates into the form so re-renders
  // exercise the same code path a founder edit would.
  useEffect(() => {
    const rows = (methods.getValues("expenseRows") as ExpenseRowData[] | undefined) || [];
    const next = rows.map((r) =>
      r.id === SUPPLIES_ROW_ID ? { ...r, escalationRate } : r,
    );
    methods.setValue("expenseRows", next, { shouldDirty: true });
  }, [escalationRate, methods]);

  return (
    <FormProvider {...methods}>
      <ExpenseStep />
    </FormProvider>
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExpenseStep — Y1 → Y5 cost ramp preview (Task #512 surface)", () => {
  it("renders payroll Y5 = Y1 * (1 + annualSalaryIncrease/100)^(yearCount-1)", async () => {
    render(<Harness />);

    // 1 FTE * $100k, no benefits, no payroll tax → Y1 = $100,000.
    await waitFor(() => {
      expect(screen.getByTestId("expense-ramp-preview")).toBeInTheDocument();
    });
    expect(screen.getByTestId("expense-ramp-payroll-y1")).toHaveTextContent("$100,000");
    // 100_000 * 1.05^4 = 121_550.625 → Math.round → 121_551.
    expect(screen.getByTestId("expense-ramp-payroll-y5")).toHaveTextContent("$121,551");
  });

  it("updates the non-payroll Y5 when a per-row escalationRate is changed", async () => {
    const { rerender } = render(<Harness />);

    // No per-row rate → falls back to generalCostInflation (3%).
    // 10_000 * 1.03^4 = 11_255.0881 → Math.round → 11_255.
    await waitFor(() => {
      expect(screen.getByTestId("expense-ramp-nonpayroll-y1")).toHaveTextContent("$10,000");
      expect(screen.getByTestId("expense-ramp-nonpayroll-y5")).toHaveTextContent("$11,255");
    });

    // Change the per-row rate to 10% — preview must follow the row override,
    // not the general cost inflation fallback.
    rerender(<Harness escalationRate={10} />);
    // 10_000 * 1.10^4 = 14_641 exactly.
    await waitFor(() => {
      expect(screen.getByTestId("expense-ramp-nonpayroll-y5")).toHaveTextContent("$14,641");
    });

    // Y1 stays put — escalation never touches the base year.
    expect(screen.getByTestId("expense-ramp-nonpayroll-y1")).toHaveTextContent("$10,000");
  });

  it("hides the ramp preview entirely when yearCount === 1 (single-year mode)", async () => {
    render(<Harness modelDuration="single_year" />);

    // Give effects a tick to settle so we're asserting the steady-state UI.
    await waitFor(() => {
      // The Y1 staffing-driven payroll number would otherwise force the
      // preview to render — its absence proves the `rampYears > 1` gate.
      expect(screen.queryByTestId("expense-ramp-preview")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("expense-ramp-payroll-y5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("expense-ramp-nonpayroll-y5")).not.toBeInTheDocument();
  });
});
