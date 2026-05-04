import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";

// Heavy collaborators that the export step pulls in but that aren't
// relevant to the single-year gating predicate we're verifying here.
vi.mock("@workspace/api-client-react", () => ({
  getExportModelUrl: (id: number) => `/api/models/${id}/export`,
  customFetch: vi.fn().mockResolvedValue([]),
  useUpdateModel: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useExportTracker", () => ({
  trackExport: vi.fn(),
}));

vi.mock("../../../../components/export/LenderPacketPreview", () => ({
  LenderPacketPreview: () => null,
}));
vi.mock("../../../../components/export/BoardPacketPreview", () => ({
  BoardPacketPreview: () => null,
}));

import { ExportStep } from "../ExportStep";

function Harness({ modelDuration }: { modelDuration: "single_year" | "five_year" }) {
  const methods = useForm({
    defaultValues: {
      schoolProfile: { schoolType: "private_independent", modelDuration },
    },
    mode: "onChange",
  });
  return (
    <FormProvider {...methods}>
      <ExportStep modelId={1} />
    </FormProvider>
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportStep — single-year gating across all four lender-grade cards", () => {
  it("disables Lender, Board, Underwriting, and Formula cards in single-year mode", () => {
    render(<Harness modelDuration="single_year" />);

    // All four wrappers render their Extend-to-5-year overlay CTAs.
    expect(screen.getByTestId("lender-card-extend-cta")).toBeInTheDocument();
    expect(screen.getByTestId("board-card-extend-cta")).toBeInTheDocument();
    expect(screen.getByTestId("underwriting-card-extend-cta")).toBeInTheDocument();
    expect(screen.getByTestId("formula-card-extend-cta")).toBeInTheDocument();

    // Underlying ExportCard buttons render the "Requires 5-year" copy and
    // are disabled so the button itself can't fire a download. Look up
    // the card via its wrapper testid because the banner copy mentions
    // each card name and would otherwise match multiple roles.
    const cardButton = (testid: string) =>
      screen.getByTestId(testid).querySelector("button:not([data-testid])") as HTMLButtonElement;

    const lender = cardButton("lender-packet-card-wrapper");
    const board = cardButton("board-packet-card-wrapper");
    const underwriting = cardButton("underwriting-card-wrapper");
    const formula = cardButton("formula-card-wrapper");

    expect(lender).toBeDisabled();
    expect(board).toBeDisabled();
    expect(underwriting).toBeDisabled();
    expect(formula).toBeDisabled();

    // Underwriting + Formula now use the same gating copy as Lender/Board.
    expect(underwriting.textContent).toMatch(/Requires 5-year projection/i);
    expect(formula.textContent).toMatch(/Requires 5-year projection/i);

    // Single-year banner no longer claims Underwriting/Formula are usable
    // in this mode — copy lists all four exports as gated.
    expect(
      screen.getByText(/Lender Packet, Board Summary, Underwriting Package, and Formula Workbook/i),
    ).toBeInTheDocument();
  });

  it("leaves all four lender-grade cards enabled in 5-year mode", () => {
    render(<Harness modelDuration="five_year" />);

    // No Extend-to-5-year overlay CTAs should exist on any card.
    expect(screen.queryByTestId("lender-card-extend-cta")).toBeNull();
    expect(screen.queryByTestId("board-card-extend-cta")).toBeNull();
    expect(screen.queryByTestId("underwriting-card-extend-cta")).toBeNull();
    expect(screen.queryByTestId("formula-card-extend-cta")).toBeNull();

    // ExportCard buttons are clickable.
    expect(screen.getByRole("button", { name: /Lender-Ready Packet/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Board Summary/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Underwriting Package/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Formula Workbook/i })).not.toBeDisabled();
  });
});
