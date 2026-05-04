import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtendToFiveYearModal } from "./ExtendToFiveYearModal";

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

  it("calls onConfirm when the primary button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ExtendToFiveYearModal open onClose={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /Extend to 5-Year/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
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
});
