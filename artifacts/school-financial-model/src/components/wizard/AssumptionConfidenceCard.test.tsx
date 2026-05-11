import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useForm, FormProvider } from "react-hook-form";
import {
  ASSUMPTION_REGISTRY,
  HIGH_IMPACT_CONFIDENCE_KEYS,
  isEstimateWithoutEvidence,
  listAssumptionKeysByStep,
  type AssumptionConfidenceEntry,
} from "@workspace/finance";
import { AssumptionConfidenceCard } from "./AssumptionConfidenceCard";
import { fullModelSchema } from "@/pages/model-wizard/schema";

function Harness({
  stepTitle,
  initial,
}: {
  stepTitle: string;
  initial?: Record<string, AssumptionConfidenceEntry>;
}) {
  const methods = useForm({
    defaultValues: { assumptionConfidence: initial ?? {} },
  });
  return (
    <FormProvider {...methods}>
      <AssumptionConfidenceCard stepTitle={stepTitle} />
    </FormProvider>
  );
}

describe("AssumptionConfidenceCard — Task #659", () => {
  it("registry covers required assumption families (public funding, philanthropy, founder comp)", () => {
    expect(ASSUMPTION_REGISTRY).toHaveProperty("public_funding_y1");
    expect(ASSUMPTION_REGISTRY).toHaveProperty("philanthropy_revenue_y1");
    expect(ASSUMPTION_REGISTRY).toHaveProperty("founder_compensation_y1");
    expect(ASSUMPTION_REGISTRY.public_funding_y1.stepTitle).toBe("Revenue");
    expect(ASSUMPTION_REGISTRY.philanthropy_revenue_y1.stepTitle).toBe("Revenue");
    expect(ASSUMPTION_REGISTRY.founder_compensation_y1.stepTitle).toBe("Staffing");
  });

  it("renders one row per registry key for the given step", () => {
    render(<Harness stepTitle="Revenue" />);
    const keys = listAssumptionKeysByStep("Revenue");
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(screen.getByText(ASSUMPTION_REGISTRY[key].label)).toBeInTheDocument();
    }
  });

  it("tally counts evidence-attached entries, not bare estimates", () => {
    const keys = listAssumptionKeysByStep("Revenue");
    const initial: Record<string, AssumptionConfidenceEntry> = {
      [keys[0]]: { confidence: "signed_agreement" },
      [keys[1]]: { confidence: "estimate" },
      [keys[2]]: { confidence: "estimate", evidenceNote: "Quoted by vendor 3/2025" },
    };
    render(<Harness stepTitle="Revenue" initial={initial} />);
    const tally = screen.getByTestId("assumption-confidence-tally");
    // 2 with evidence: signed_agreement + estimate-with-note. Bare estimate excluded.
    expect(tally.textContent).toMatch(/2 of \d+ with evidence/);
  });

  it("isEstimateWithoutEvidence flags bare estimate but not estimate-with-note", () => {
    expect(isEstimateWithoutEvidence({ confidence: "estimate" })).toBe(true);
    expect(isEstimateWithoutEvidence({ confidence: "estimate", evidenceNote: "  " })).toBe(true);
    expect(isEstimateWithoutEvidence({ confidence: "estimate", evidenceNote: "Per NAIS 2024" })).toBe(false);
    expect(isEstimateWithoutEvidence({ confidence: "research" })).toBe(false);
    expect(isEstimateWithoutEvidence(undefined)).toBe(false);
  });

  it("flags every high-impact key as registered", () => {
    for (const k of HIGH_IMPACT_CONFIDENCE_KEYS) {
      expect(ASSUMPTION_REGISTRY).toHaveProperty(k);
    }
  });

  it("schema round-trips assumptionConfidence map", () => {
    const result = fullModelSchema.safeParse({
      assumptionConfidence: {
        tuition_per_student: { confidence: "signed_agreement", evidenceNote: "Board-ratified fee schedule 2025" },
        enrollment_y1: { confidence: "estimate" },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assumptionConfidence?.tuition_per_student?.confidence).toBe("signed_agreement");
      expect(result.data.assumptionConfidence?.enrollment_y1?.evidenceNote).toBeUndefined();
    }
  });

  it("clicking a confidence chip selects it (aria-checked toggles)", () => {
    const keys = listAssumptionKeysByStep("Revenue");
    const firstKey = keys[0];
    render(<Harness stepTitle="Revenue" />);
    const chip = screen.getByTestId(`confidence-option-${firstKey}-quote`);
    expect(chip).toHaveAttribute("aria-checked", "false");
    fireEvent.click(chip);
    expect(screen.getByTestId(`confidence-option-${firstKey}-quote`)).toHaveAttribute("aria-checked", "true");
  });

  it("renders attached evidence files as download links with type-aware previews (Task #730)", () => {
    const keys = listAssumptionKeysByStep("Revenue");
    const firstKey = keys[0];
    const initial: Record<string, AssumptionConfidenceEntry> = {
      [firstKey]: {
        confidence: "signed_agreement",
        evidenceFiles: [
          {
            id: "f-pdf",
            name: "lease.pdf",
            mimeType: "application/pdf",
            size: 1024,
            uploadedAt: "2025-01-01T00:00:00.000Z",
            objectPath: "/objects/abc123",
          },
          {
            id: "f-img",
            name: "site-photo.jpg",
            mimeType: "image/jpeg",
            size: 2048,
            uploadedAt: "2025-01-01T00:00:00.000Z",
            objectPath: "/objects/def456",
          },
        ],
      },
    };
    render(<Harness stepTitle="Revenue" initial={initial} />);
    // Task #734 — `/api/storage/objects/*` is now behind auth+ACL,
    // so the row renders a <button> that downloads via authenticated
    // fetch (not a raw <a href>) so the Bearer token gets attached.
    // Img previews load async via the same auth-aware fetch into a
    // blob: URL, so we just assert the trigger exists with the right
    // testid + accessible label here.
    const pdfLink = screen.getByTestId(`evidence-file-link-${firstKey}-f-pdf`);
    expect(pdfLink.tagName).toBe("BUTTON");
    expect(pdfLink).not.toHaveAttribute("href");
    expect(pdfLink.getAttribute("title")).toContain("lease.pdf");

    const imgLink = screen.getByTestId(`evidence-file-link-${firstKey}-f-img`);
    expect(imgLink.tagName).toBe("BUTTON");
    expect(imgLink).not.toHaveAttribute("href");
    expect(imgLink.getAttribute("title")).toContain("site-photo.jpg");
  });

  it("renders legacy dataBase64 evidence files as a data: URL link without crashing (Task #730)", () => {
    const keys = listAssumptionKeysByStep("Revenue");
    const firstKey = keys[0];
    const initial: Record<string, AssumptionConfidenceEntry> = {
      [firstKey]: {
        confidence: "signed_agreement",
        evidenceFiles: [
          {
            id: "f-legacy",
            name: "old-quote.pdf",
            mimeType: "application/pdf",
            size: 512,
            uploadedAt: "2024-06-01T00:00:00.000Z",
            // Legacy Task #707 inline payload — schema dropped it in
            // #729; cast keeps the regression test for unmigrated rows.
            ...({ dataBase64: "JVBERi0xLjQK" } as Record<string, unknown>),
          },
          {
            id: "f-broken",
            name: "missing.pdf",
            mimeType: "application/pdf",
            size: 100,
            uploadedAt: "2024-06-01T00:00:00.000Z",
          },
        ],
      },
    };
    render(<Harness stepTitle="Revenue" initial={initial} />);
    const legacyLink = screen.getByTestId(`evidence-file-link-${firstKey}-f-legacy`);
    expect(legacyLink.getAttribute("href")).toBe(
      "data:application/pdf;base64,JVBERi0xLjQK",
    );
    // No objectPath and no dataBase64 → unavailable, but row still renders
    // and the remove button still works.
    expect(
      screen.getByTestId(`evidence-file-unavailable-${firstKey}-f-broken`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`evidence-file-remove-${firstKey}-f-broken`),
    ).toBeInTheDocument();
  });

  it("shows high-impact badge for tuition_per_student row", () => {
    render(<Harness stepTitle="Revenue" />);
    const label = screen.getByText(ASSUMPTION_REGISTRY.tuition_per_student.label);
    const row = label.closest("div.rounded-xl") as HTMLElement;
    expect(row).not.toBeNull();
    expect(within(row).getByText(/High impact/i)).toBeInTheDocument();
  });
});
