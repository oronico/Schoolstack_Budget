import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";

import { ActualsIntakeStep } from "../ActualsIntakeStep";

function Harness() {
  const methods = useForm({
    defaultValues: {
      schoolProfile: { wizardPathway: "actuals" },
      priorYearSnapshot: {},
    },
  });
  return (
    <FormProvider {...methods}>
      <ActualsIntakeStep />
    </FormProvider>
  );
}

describe("ActualsIntakeStep — QuickBooks import (Task #708)", () => {
  it("offers a QuickBooks button and a CSV fallback button", () => {
    render(<Harness />);
    expect(screen.getByTestId("actuals-intake-quickbooks-button")).toHaveTextContent(
      /import from quickbooks/i,
    );
    expect(screen.getByTestId("actuals-intake-upload-button")).toHaveTextContent(
      /upload csv or excel/i,
    );
  });

  it("first click on the QuickBooks button reveals export instructions, second click opens the picker", () => {
    render(<Harness />);
    expect(screen.queryByTestId("actuals-intake-quickbooks-help")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("actuals-intake-quickbooks-button"));
    const help = screen.getByTestId("actuals-intake-quickbooks-help");
    expect(help).toHaveTextContent(/Reports → Profit and Loss/i);
    expect(screen.getByTestId("actuals-intake-quickbooks-button")).toHaveTextContent(
      /choose your quickbooks export/i,
    );
  });

  it("imports a QuickBooks-style P&L CSV into priorYearSnapshot fields", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("actuals-intake-quickbooks-button"));

    const csv = [
      "Account,Total",
      "Tuition,480000",
      "Donations,95000",
      "Total Income,575000",
      "Total Payroll,400000",
      "Rent,60000",
      "Total Expenses,520000",
      "Net Income,55000",
    ].join("\n");
    const file = new File([csv], "quickbooks-pnl.csv", { type: "text/csv" });

    const input = screen.getByTestId("actuals-intake-upload-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("actuals-intake-upload-summary")).toBeInTheDocument();
    });
    const summary = screen.getByTestId("actuals-intake-upload-summary");
    expect(summary).toHaveTextContent(/quickbooks-pnl\.csv/);
    expect(summary).toHaveTextContent(/QuickBooks/);

    const totalRevenue = screen.getByLabelText(/Last-year total revenue/i) as HTMLInputElement;
    const totalExpenses = screen.getByLabelText(/Last-year total expenses paid/i) as HTMLInputElement;
    expect(Number(totalRevenue.value)).toBe(575000);
    expect(Number(totalExpenses.value)).toBe(520000);
  });

  it("uses the generic 'Pulled' wording when the CSV-fallback button drives the upload", async () => {
    render(<Harness />);
    const csv = ["Account,Total", "Total Income,100", "Total Expenses,90"].join("\n");
    const file = new File([csv], "xero-export.csv", { type: "text/csv" });
    fireEvent.click(screen.getByTestId("actuals-intake-upload-button"));
    const input = screen.getByTestId("actuals-intake-upload-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByTestId("actuals-intake-upload-summary")).toBeInTheDocument();
    });
    expect(screen.getByTestId("actuals-intake-upload-summary")).toHaveTextContent(
      /^Pulled .* xero-export\.csv\. /,
    );
  });
});
