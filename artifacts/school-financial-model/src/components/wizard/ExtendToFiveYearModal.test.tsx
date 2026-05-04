import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtendToFiveYearModal } from "./ExtendToFiveYearModal";
import type { SeedDefaults } from "@/lib/seed-five-year";

const FALLBACK: SeedDefaults = {
  enrollmentGrowthPct: 0,
  tuitionEscalationPct: 3,
  salaryEscalationPct: 3,
  costInflationPct: 3,
};

describe("ExtendToFiveYearModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ExtendToFiveYearModal open={false} onClose={() => {}} onConfirm={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title + bullets when open", () => {
    render(<ExtendToFiveYearModal open onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/Extend to a 5-year projection/i)).toBeInTheDocument();
    expect(screen.getByText(/Year 1 numbers stay exactly as you entered them/i)).toBeInTheDocument();
    expect(screen.getByText(/seed Years 2.5 from your Year 1 inputs/i)).toBeInTheDocument();
    expect(screen.getByText(/Lender Packet, Board Summary/i)).toBeInTheDocument();
  });

  it("calls onConfirm with the (default) rates when the primary button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ExtendToFiveYearModal open onClose={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /Extend to 5-Year/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(FALLBACK);
  });

  it("calls onClose when Stay on Single-Year is clicked", () => {
    const onClose = vi.fn();
    render(<ExtendToFiveYearModal open onClose={onClose} onConfirm={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Stay on Single-Year/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button while pending", () => {
    render(<ExtendToFiveYearModal open isPending onClose={() => {}} onConfirm={() => {}} />);
    const btn = screen.getByRole("button", { name: /Extending/i });
    expect(btn).toBeDisabled();
  });

  it("pre-fills the editable rates from the form's current resolved defaults", () => {
    const defaults: SeedDefaults = {
      enrollmentGrowthPct: 7,
      tuitionEscalationPct: 4,
      salaryEscalationPct: 6,
      costInflationPct: 2,
    };
    render(
      <ExtendToFiveYearModal open onClose={() => {}} onConfirm={() => {}} defaults={defaults} />
    );
    expect(screen.getByTestId("extend-rate-enrollment")).toHaveValue(7);
    expect(screen.getByTestId("extend-rate-tuition")).toHaveValue(4);
    expect(screen.getByTestId("extend-rate-salary")).toHaveValue(6);
    expect(screen.getByTestId("extend-rate-cost")).toHaveValue(2);
  });

  it("passes the founder's edited rates through onConfirm", () => {
    const onConfirm = vi.fn();
    const defaults: SeedDefaults = {
      enrollmentGrowthPct: 0,
      tuitionEscalationPct: 3,
      salaryEscalationPct: 3,
      costInflationPct: 3,
    };
    render(
      <ExtendToFiveYearModal
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        defaults={defaults}
      />
    );

    fireEvent.change(screen.getByTestId("extend-rate-enrollment"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("extend-rate-tuition"), { target: { value: "4" } });
    fireEvent.change(screen.getByTestId("extend-rate-cost"), { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: /Extend to 5-Year/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      enrollmentGrowthPct: 5,
      tuitionEscalationPct: 4,
      salaryEscalationPct: 3,
      costInflationPct: 2,
    });
  });
});
