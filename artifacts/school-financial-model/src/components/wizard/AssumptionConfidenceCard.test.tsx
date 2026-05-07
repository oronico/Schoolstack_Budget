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

  it("shows high-impact badge for tuition_per_student row", () => {
    render(<Harness stepTitle="Revenue" />);
    const label = screen.getByText(ASSUMPTION_REGISTRY.tuition_per_student.label);
    const row = label.closest("div.rounded-xl") as HTMLElement;
    expect(row).not.toBeNull();
    expect(within(row).getByText(/High impact/i)).toBeInTheDocument();
  });
});
