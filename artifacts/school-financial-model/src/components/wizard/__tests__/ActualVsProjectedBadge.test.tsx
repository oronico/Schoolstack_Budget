import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActualVsProjectedBadge } from "../ActualVsProjectedBadge";

describe("ActualVsProjectedBadge (Task #703)", () => {
  it("renders the Actual variant with emerald styling and source tooltip", () => {
    render(<ActualVsProjectedBadge kind="actual" sourceLabel="From last year's books" />);
    const el = screen.getByTestId("actual-vs-projected-badge-actual");
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("Actual");
    expect(el.className).toMatch(/emerald/);
    expect(el).toHaveAttribute("title", "From last year's books");
  });

  it("renders the Projected variant with slate styling and a default tooltip", () => {
    render(<ActualVsProjectedBadge kind="projected" />);
    const el = screen.getByTestId("actual-vs-projected-badge-projected");
    expect(el).toHaveTextContent("Projected");
    expect(el.className).toMatch(/slate/);
    expect(el).toHaveAttribute("title", "Projected");
  });
});
