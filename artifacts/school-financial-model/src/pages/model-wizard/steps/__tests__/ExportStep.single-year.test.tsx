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
  it("disables only Lender + Board cards in single-year mode; Underwriting + Formula stay enabled", () => {
    render(<Harness modelDuration="single_year" />);

    // Lender + Board still need a 5-year projection, so their overlay CTAs render.
    expect(screen.getByTestId("lender-card-extend-cta")).toBeInTheDocument();
    expect(screen.getByTestId("board-card-extend-cta")).toBeInTheDocument();

    // Underwriting + Formula are now single-year aware — no overlay CTA.
    expect(screen.queryByTestId("underwriting-card-extend-cta")).toBeNull();
    expect(screen.queryByTestId("formula-card-extend-cta")).toBeNull();

    const cardButton = (testid: string) =>
      screen.getByTestId(testid).querySelector("button:not([data-testid])") as HTMLButtonElement;

    const lender = cardButton("lender-packet-card-wrapper");
    const board = cardButton("board-packet-card-wrapper");
    const underwriting = cardButton("underwriting-card-wrapper");
    const formula = cardButton("formula-card-wrapper");

    expect(lender).toBeDisabled();
    expect(board).toBeDisabled();
    expect(underwriting).not.toBeDisabled();
    expect(formula).not.toBeDisabled();

    // Banner copy lists only the gated exports.
    expect(
      screen.getByText(/Lender Conversation Snapshot and Board and Funder Summary/i),
    ).toBeInTheDocument();
  });

  it("leaves all four lender-grade cards enabled in 5-year mode", () => {
    render(<Harness modelDuration="five_year" />);

    expect(screen.queryByTestId("lender-card-extend-cta")).toBeNull();
    expect(screen.queryByTestId("board-card-extend-cta")).toBeNull();
    expect(screen.queryByTestId("underwriting-card-extend-cta")).toBeNull();
    expect(screen.queryByTestId("formula-card-extend-cta")).toBeNull();

    expect(screen.getByRole("button", { name: /Lender Conversation Snapshot/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Board and Funder Summary/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Founder Planning Workbook/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /5-Year Financial Model/i })).not.toBeDisabled();
  });
});
