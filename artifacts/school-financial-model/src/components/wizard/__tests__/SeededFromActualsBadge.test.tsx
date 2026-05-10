import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SeededFromActualsBadge } from "../SeededFromActualsBadge";

// Task #703 / T6 — basic render contract.

describe("SeededFromActualsBadge", () => {
  it("renders the seeded-from-actuals copy", () => {
    render(<SeededFromActualsBadge />);
    expect(screen.getByTestId("seeded-from-actuals-badge")).toBeInTheDocument();
    expect(
      screen.getByText(/Seeded from your last-year actuals/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/adjust if your plan differs/i)).toBeInTheDocument();
  });

  it("hides the reset button when no callback is provided", () => {
    render(<SeededFromActualsBadge />);
    expect(
      screen.queryByTestId("seeded-from-actuals-reset"),
    ).not.toBeInTheDocument();
  });

  it("renders the reset button (with optional actual label) and fires the callback on click", () => {
    const onReset = vi.fn();
    render(
      <SeededFromActualsBadge
        onResetToActual={onReset}
        actualLabel="$60,000"
      />,
    );
    const btn = screen.getByTestId("seeded-from-actuals-reset");
    expect(btn).toHaveTextContent("Reset to actual ($60,000)");
    fireEvent.click(btn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("renders the reset button without parens when no actualLabel is passed", () => {
    const onReset = vi.fn();
    render(<SeededFromActualsBadge onResetToActual={onReset} />);
    const btn = screen.getByTestId("seeded-from-actuals-reset");
    expect(btn).toHaveTextContent(/^Reset to actual$/);
  });
});
