import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { useModelDuration, useYearCount } from "@/lib/use-model-duration";

function HookProbe() {
  const { duration, isSingleYear } = useModelDuration();
  const years = useYearCount();
  return (
    <div>
      <span data-testid="duration">{duration}</span>
      <span data-testid="single">{String(isSingleYear)}</span>
      <span data-testid="years">{String(years)}</span>
    </div>
  );
}

function Harness({ duration }: { duration?: string }) {
  const methods = useForm({
    defaultValues: { schoolProfile: { modelDuration: duration } },
  });
  return (
    <FormProvider {...methods}>
      <HookProbe />
    </FormProvider>
  );
}

describe("useModelDuration / useYearCount — RHF-aware reader", () => {
  it("reports five_year + 5 columns when the form value is 'five_year'", () => {
    render(<Harness duration="five_year" />);
    expect(screen.getByTestId("duration").textContent).toBe("five_year");
    expect(screen.getByTestId("single").textContent).toBe("false");
    expect(screen.getByTestId("years").textContent).toBe("5");
  });

  it("reports single_year + 1 column when the form value is 'single_year'", () => {
    render(<Harness duration="single_year" />);
    expect(screen.getByTestId("duration").textContent).toBe("single_year");
    expect(screen.getByTestId("single").textContent).toBe("true");
    expect(screen.getByTestId("years").textContent).toBe("1");
  });

  it("defaults to five_year when the form value is missing (legacy models)", () => {
    // Legacy models persisted before single-year shipped have no
    // `schoolProfile.modelDuration` field. The hook must default these to
    // five_year so existing wizards keep their multi-year behaviour.
    render(<Harness duration={undefined} />);
    expect(screen.getByTestId("duration").textContent).toBe("five_year");
    expect(screen.getByTestId("single").textContent).toBe("false");
    expect(screen.getByTestId("years").textContent).toBe("5");
  });

  it("defaults to five_year when the form value is an unknown string", () => {
    // Defensive: if a hand-edited / corrupted record carries a junk value
    // we still want the wizard to render in 5-year mode rather than crash.
    render(<Harness duration="ten_year_dream" />);
    expect(screen.getByTestId("duration").textContent).toBe("five_year");
  });
});
