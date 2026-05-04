import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";

const mockCustomFetch = vi.fn();
const mockUpdateMutateAsync = vi.fn(async () => ({}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: (...args: unknown[]) => mockCustomFetch(...args),
  getExportModelUrl: (id: number) => `/api/models/${id}/export/formula`,
  useUpdateModel: () => ({
    mutate: vi.fn(),
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@/hooks/useExportTracker", () => ({ trackExport: () => {} }));
vi.mock("../../../../components/export/LenderPacketPreview", () => ({
  LenderPacketPreview: () => <div data-testid="lender-preview-modal" />,
}));
vi.mock("../../../../components/export/BoardPacketPreview", () => ({
  BoardPacketPreview: () => <div data-testid="board-preview-modal" />,
}));

import { ExportStep } from "../ExportStep";

let lastReset: Record<string, unknown> | null = null;

function Harness() {
  const methods = useForm({
    defaultValues: {
      schoolProfile: {
        modelDuration: "single_year",
        schoolType: "private_school",
        enrollmentGrowthRate: 2,
      },
      enrollment: { year1: 80, year2: 0, year3: 0, year4: 0, year5: 0 },
      tuitionEscalation: { rate: 3 },
      facilities: { annualSalaryIncrease: 3, generalCostInflation: 3 },
      revenueRows: [
        {
          id: "r1",
          category: "tuition_and_fees",
          lineItem: "Tuition",
          enabled: true,
          driverType: "annual_fixed",
          amounts: [800000, 0, 0, 0, 0],
        },
      ],
      expenseRows: [
        {
          id: "e1",
          category: "facility",
          lineItem: "Rent",
          enabled: true,
          driverType: "annual_fixed",
          amounts: [120000, 0, 0, 0, 0],
          note: "",
        },
      ],
    },
  });
  const origReset = methods.reset.bind(methods);
  methods.reset = ((values?: Record<string, unknown>) => {
    if (values) lastReset = values;
    return origReset(values as never);
  }) as typeof methods.reset;
  return (
    <FormProvider {...methods}>
      <ExportStep modelId={42} />
    </FormProvider>
  );
}

beforeEach(() => {
  lastReset = null;
  mockCustomFetch.mockReset();
  mockCustomFetch.mockResolvedValue([]);
  mockUpdateMutateAsync.mockReset();
  mockUpdateMutateAsync.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportStep — Extend modal honors edited growth rates", () => {
  it("pre-fills the modal with the form's resolved rates", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("single-year-banner-extend"));
    expect(screen.getByTestId("extend-rate-enrollment")).toHaveValue(2);
    expect(screen.getByTestId("extend-rate-tuition")).toHaveValue(3);
    expect(screen.getByTestId("extend-rate-salary")).toHaveValue(3);
    expect(screen.getByTestId("extend-rate-cost")).toHaveValue(3);
  });

  it("seeds Y2-Y5 with the edited rates and persists them back to form fields", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("single-year-banner-extend"));

    fireEvent.change(screen.getByTestId("extend-rate-enrollment"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("extend-rate-tuition"), { target: { value: "4" } });
    fireEvent.change(screen.getByTestId("extend-rate-salary"), { target: { value: "6" } });
    fireEvent.change(screen.getByTestId("extend-rate-cost"), { target: { value: "2" } });

    const dialog = screen.getByRole("dialog");
    const confirmBtn = Array.from(dialog.querySelectorAll("button")).find(
      (b) => /Extend to 5-Year/i.test(b.textContent ?? ""),
    );
    fireEvent.click(confirmBtn!);

    await waitFor(() => expect(lastReset).not.toBeNull());

    const next = lastReset as Record<string, unknown>;
    const sp = next.schoolProfile as Record<string, unknown>;
    const facilities = next.facilities as Record<string, unknown>;
    const tuitionEsc = next.tuitionEscalation as Record<string, unknown>;
    const enrollment = next.enrollment as Record<string, number>;
    const revenueRows = next.revenueRows as Array<{ amounts: number[] }>;
    const expenseRows = next.expenseRows as Array<{ amounts: number[] }>;

    // Rates persisted back to the matching form fields
    expect(sp.modelDuration).toBe("five_year");
    expect(sp.enrollmentGrowthRate).toBe(5);
    expect(tuitionEsc.rate).toBe(4);
    expect(facilities.annualSalaryIncrease).toBe(6);
    expect(facilities.generalCostInflation).toBe(2);

    // Y2-Y5 seed reflects the edited rates
    expect(enrollment.year2).toBe(Math.round(80 * 1.05));
    expect(enrollment.year5).toBe(Math.round(80 * Math.pow(1.05, 4)));
    expect(revenueRows[0].amounts[1]).toBe(Math.round(800000 * 1.04));
    expect(revenueRows[0].amounts[4]).toBe(Math.round(800000 * Math.pow(1.04, 4)));
    expect(expenseRows[0].amounts[2]).toBe(Math.round(120000 * Math.pow(1.02, 2)));
  });
});
