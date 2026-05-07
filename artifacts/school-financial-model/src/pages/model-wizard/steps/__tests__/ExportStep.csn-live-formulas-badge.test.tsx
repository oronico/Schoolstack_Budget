import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";

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

function Harness({ schoolType }: { schoolType: string }) {
  const methods = useForm({
    defaultValues: {
      schoolProfile: { schoolType, modelDuration: "five_year" },
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

describe("ExportStep — CSN Operating Manual live-formulas badge", () => {
  const captionMatcher =
    /Tuition, financial aid, faculty payroll, fundraising totals, key-assumption bullets, and the parent handout's projection title all run as live Excel formulas - edit any input on GETTING STARTED and the workbook recalculates\./i;
  const badgeMatcher = /✓\s*Live formulas/i;

  it("shows the Live formulas badge and explainer caption on the CSN card for Chesterton schools", () => {
    render(<Harness schoolType="chesterton_academy" />);

    const csnCard = screen.getByRole("button", { name: /CSN Operating Manual/i });

    expect(within(csnCard).getByText(badgeMatcher)).toBeInTheDocument();

    const caption = within(csnCard).getByText(captionMatcher);
    expect(caption).toBeInTheDocument();
    expect(caption.textContent).toMatch(/tuition/i);
    expect(caption.textContent).toMatch(/financial aid/i);
    expect(caption.textContent).toMatch(/faculty payroll/i);
    expect(caption.textContent).toMatch(/fundraising/i);
  });

  it("does not render the badge or caption on the other (non-CSN) export cards", () => {
    render(<Harness schoolType="chesterton_academy" />);

    for (const cardName of [
      /Lender Conversation Snapshot/i,
      /Board and Funder Summary/i,
      /Founder Planning Workbook/i,
      /5-Year Financial Model/i,
    ]) {
      const card = screen.getByRole("button", { name: cardName });
      expect(within(card).queryByText(badgeMatcher)).toBeNull();
      expect(within(card).queryByText(captionMatcher)).toBeNull();
    }
  });

  it("does not render the CSN card (and therefore no badge/caption) for non-Chesterton schools", () => {
    render(<Harness schoolType="private_independent" />);

    expect(
      screen.queryByRole("button", { name: /CSN Operating Manual/i }),
    ).toBeNull();
    expect(screen.queryByText(badgeMatcher)).toBeNull();
    expect(screen.queryByText(captionMatcher)).toBeNull();
  });
});
