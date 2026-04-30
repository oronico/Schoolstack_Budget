import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";

import { ChestertonFundraisingStep } from "../ChestertonFundraisingStep";
import { ChestertonGiftChartStep } from "../ChestertonGiftChartStep";
import { ChestertonRecruitingStep } from "../ChestertonRecruitingStep";
import { buildDefaultChestertonData } from "@/lib/chesterton/template";

// Lightweight FormProvider wrapper so each step can be rendered in isolation
// with a controllable initial chesterton subtree.
function HostForm({
  defaults,
  children,
}: {
  defaults: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const methods = useForm({ defaultValues: defaults });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe("Chesterton wizard step summaries", () => {
  it("fundraising step shows committed total and coverage % vs goal", () => {
    const seed = buildDefaultChestertonData();
    const goalAmount = 100_000;
    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            totalFundraisingGoal: goalAmount,
            fundraisingGoals: [
              { id: "f1", category: "Major", goalAmount: 25_000, numberOfGifts: 1, averageGift: 25_000, notes: "" },
              { id: "f2", category: "Annual", goalAmount: 10_000, numberOfGifts: 5, averageGift: 2_000, notes: "" },
            ],
          },
        }}
      >
        <ChestertonFundraisingStep />
      </HostForm>,
    );

    const summary = screen.getByTestId("chesterton-fundraising-summary");
    // 25k + 10k = 35k of 100k = 35%
    expect(summary).toHaveTextContent("$35,000");
    expect(screen.getByTestId("chesterton-fundraising-coverage-pct")).toHaveTextContent("35%");
  });

  it("fundraising step prompts for goal when none is set", () => {
    const seed = buildDefaultChestertonData();
    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            totalFundraisingGoal: 0,
            fundraisingGoals: [
              { id: "f1", category: "Major", goalAmount: 5_000, numberOfGifts: 1, averageGift: 5_000, notes: "" },
            ],
          },
        }}
      >
        <ChestertonFundraisingStep />
      </HostForm>,
    );

    const summary = screen.getByTestId("chesterton-fundraising-summary");
    expect(summary).toHaveTextContent(/Set a Total Fundraising Goal/i);
    expect(screen.queryByTestId("chesterton-fundraising-coverage-pct")).toBeNull();
  });

  it("gift chart step shows running coverage % toward Total Fundraising Goal", () => {
    const seed = buildDefaultChestertonData();
    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            totalFundraisingGoal: 200_000,
            giftChart: [
              { id: "g1", giftAmount: 25_000, numberOfGifts: 2, numberOfProspects: 6 },
              { id: "g2", giftAmount: 5_000, numberOfGifts: 10, numberOfProspects: 30 },
            ],
          },
        }}
      >
        <ChestertonGiftChartStep />
      </HostForm>,
    );

    // Pyramid total = (25_000 * 2) + (5_000 * 10) = 100_000 of 200_000 = 50%
    expect(screen.getByTestId("chesterton-gift-chart-coverage-pct")).toHaveTextContent("50%");
    expect(screen.getByTestId("chesterton-gift-chart-coverage")).toHaveTextContent("$200,000");
  });

  it("recruiting step shows projected enrollment vs Year-1 enrollment goal", () => {
    const seed = buildDefaultChestertonData();
    // Force a known Year-1 need by overriding phaseEnrollment row 0.
    const phase = (seed.phaseEnrollment ?? []).map((row, i) => ({
      ...row,
      year1: i === 0 ? 30 : 0,
      year2: 0,
      year3: 0,
      year4: 0,
      year5: 0,
      year6: 0,
    }));

    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            phaseEnrollment: phase,
            recruitingPipeline: [
              { id: "r1", source: "Feeder", prospectiveStudents: 60, notes: "" },
              { id: "r2", source: "Homeschool", prospectiveStudents: 30, notes: "" },
            ],
          },
        }}
      >
        <ChestertonRecruitingStep />
      </HostForm>,
    );

    // Year-1 need = 30; total prospects = 90; projected = floor(90/3) = 30; coverage = 100%
    expect(screen.getByTestId("chesterton-recruiting-year1-need")).toHaveTextContent("30");
    expect(screen.getByTestId("chesterton-recruiting-total-prospects")).toHaveTextContent("90");
    expect(screen.getByTestId("chesterton-recruiting-projected")).toHaveTextContent("30");
    expect(screen.getByTestId("chesterton-recruiting-coverage-pct")).toHaveTextContent("100%");
  });

  it("recruiting step hides the summary panel when Year-1 enrollment is unset", () => {
    const seed = buildDefaultChestertonData();
    const phase = (seed.phaseEnrollment ?? []).map((row) => ({
      ...row,
      year1: 0,
      year2: 0,
      year3: 0,
      year4: 0,
      year5: 0,
      year6: 0,
    }));

    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            phaseEnrollment: phase,
            recruitingPipeline: [
              { id: "r1", source: "Feeder", prospectiveStudents: 60, notes: "" },
            ],
          },
        }}
      >
        <ChestertonRecruitingStep />
      </HostForm>,
    );

    expect(screen.queryByTestId("chesterton-recruiting-summary")).toBeNull();
  });
});
