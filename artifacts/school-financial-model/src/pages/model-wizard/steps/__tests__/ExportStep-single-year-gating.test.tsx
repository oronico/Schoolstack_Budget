import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";

// Network helpers used by ExportStep's review-availability + share-list
// fetches. Resolve them as empty / unavailable so the component renders the
// export grid without async churn.
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

vi.mock("@/hooks/useExportTracker", () => ({
  trackExport: () => {},
}));

// LenderPacketPreview / BoardPacketPreview are heavy modals that pull in
// charts; we only need to know they aren't mounted in single-year mode
// (the gate redirects to the Extend modal instead).
vi.mock("../../../../components/export/LenderPacketPreview", () => ({
  LenderPacketPreview: () => <div data-testid="lender-preview-modal" />,
}));
vi.mock("../../../../components/export/BoardPacketPreview", () => ({
  BoardPacketPreview: () => <div data-testid="board-preview-modal" />,
}));

import { ExportStep } from "../ExportStep";

function Harness({ duration }: { duration: "single_year" | "five_year" }) {
  const methods = useForm({
    defaultValues: {
      schoolProfile: { modelDuration: duration, schoolType: "private_school" },
      enrollment: { year1: 60 },
    },
  });
  return (
    <FormProvider {...methods}>
      <ExportStep modelId={42} />
    </FormProvider>
  );
}

beforeEach(() => {
  mockCustomFetch.mockReset();
  // Both the review-available endpoint and the shared-links endpoint fail
  // open with empty results — the gating UI does not depend on either.
  mockCustomFetch.mockResolvedValue([]);
  mockUpdateMutateAsync.mockReset();
  mockUpdateMutateAsync.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportStep — single-year gating for Lender + Board packets", () => {
  it("disables Lender Packet + Board Summary cards in single-year mode", () => {
    render(<Harness duration="single_year" />);
    // Both extend-CTA overlays are present (one per gated card).
    expect(screen.getByTestId("lender-card-extend-cta")).toBeInTheDocument();
    expect(screen.getByTestId("board-card-extend-cta")).toBeInTheDocument();
    // The single-year explanation banner above the cards is also visible.
    expect(screen.getByText(/You're on Single-Year mode/i)).toBeInTheDocument();
  });

  it("opens the Extend modal when the Lender card CTA is clicked", () => {
    render(<Harness duration="single_year" />);
    expect(screen.queryByText(/Extend to a 5-year projection/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lender-card-extend-cta"));
    // Modal title from ExtendToFiveYearModal — confirms the wiring.
    expect(screen.getByText(/Extend to a 5-year projection/i)).toBeInTheDocument();
  });

  it("opens the Extend modal when the inline banner CTA is clicked", () => {
    render(<Harness duration="single_year" />);
    fireEvent.click(screen.getByTestId("single-year-banner-extend"));
    expect(screen.getByText(/Extend to a 5-year projection/i)).toBeInTheDocument();
  });

  it("does not gate the Lender + Board cards in five-year mode", () => {
    render(<Harness duration="five_year" />);
    // The single-year-specific overlay buttons must not exist in 5-year mode.
    expect(screen.queryByTestId("lender-card-extend-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("board-card-extend-cta")).not.toBeInTheDocument();
    expect(screen.queryByText(/You're on Single-Year mode/i)).not.toBeInTheDocument();
    // The cards themselves are present (and clickable in 5-year mode).
    expect(screen.getByText(/Lender-Ready Packet/i)).toBeInTheDocument();
    expect(screen.getByText(/Board Summary/i)).toBeInTheDocument();
  });
});
