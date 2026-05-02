import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";

import { ChestertonFundraisingStep } from "../ChestertonFundraisingStep";
import { ChestertonGiftChartStep } from "../ChestertonGiftChartStep";
import { ChestertonRecruitingStep } from "../ChestertonRecruitingStep";
import { ChestertonStaffingStep } from "../ChestertonStaffingStep";
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

  // Task #350: the summary widgets must update live as the user edits a row's
  // # Students input — no navigate-away-and-back required.
  it("recruiting step updates Total prospects + coverage live as the user types", async () => {
    const user = userEvent.setup();
    const seed = buildDefaultChestertonData();
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
              { id: "r1", source: "Feeder", prospectiveStudents: 0, notes: "" },
              { id: "r2", source: "Homeschool", prospectiveStudents: 0, notes: "" },
            ],
          },
        }}
      >
        <ChestertonRecruitingStep />
      </HostForm>,
    );

    expect(screen.getByTestId("chesterton-recruiting-total-prospects")).toHaveTextContent("0");

    // Two recruiting rows render two "# Students" inputs; edit the first.
    const input = screen.getAllByLabelText("# Students", { selector: "input" })[0] as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "60");

    // 60 prospects, year-1 need = 30, projected = floor(60/3) = 20, coverage = 67%.
    expect(screen.getByTestId("chesterton-recruiting-total-prospects")).toHaveTextContent("60");
    expect(screen.getByTestId("chesterton-recruiting-projected")).toHaveTextContent("20");
    expect(screen.getByTestId("chesterton-recruiting-coverage-pct")).toHaveTextContent("67%");
  });

  it("fundraising step updates Committed so far + coverage live as the user types", async () => {
    const user = userEvent.setup();
    const seed = buildDefaultChestertonData();

    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            totalFundraisingGoal: 100_000,
            fundraisingGoals: [
              { id: "f1", category: "Major", goalAmount: 0, numberOfGifts: 0, averageGift: 0, notes: "" },
            ],
          },
        }}
      >
        <ChestertonFundraisingStep />
      </HostForm>,
    );

    expect(screen.getByTestId("chesterton-fundraising-committed")).toHaveTextContent("$0");

    const goalAmountInput = screen.getByLabelText("Goal Amount", { selector: "input" }) as HTMLInputElement;
    await user.clear(goalAmountInput);
    await user.type(goalAmountInput, "40000");

    expect(screen.getByTestId("chesterton-fundraising-committed")).toHaveTextContent("$40,000");
    expect(screen.getByTestId("chesterton-fundraising-coverage-pct")).toHaveTextContent("40%");
  });

  // Task #351: the staffing step's payroll widgets must update live as the
  // founder edits a row's # Periods input — same anti-pattern as #350.
  it("staffing step updates periods total / FTE / annual payroll live as the user types", async () => {
    const user = userEvent.setup();
    const seed = buildDefaultChestertonData();

    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            startingTeacherSalary: 50_000,
            salarySchedule: [
              { id: "s1", subject: "Latin", periodsPerSection: 0, notes: "" },
              { id: "s2", subject: "Math", periodsPerSection: 0, notes: "" },
            ],
          },
        }}
      >
        <ChestertonStaffingStep />
      </HostForm>,
    );

    expect(screen.getByTestId("chesterton-staffing-periods-total")).toHaveTextContent("0");
    expect(screen.getByTestId("chesterton-staffing-fte-equivalent")).toHaveTextContent("0.0");
    expect(screen.getByTestId("chesterton-staffing-annual-payroll")).toHaveTextContent("$0");

    // Two salary-schedule rows render two "Periods" inputs; edit the first.
    const periodsInput = screen.getAllByLabelText("Periods", { selector: "input" })[0] as HTMLInputElement;
    await user.clear(periodsInput);
    await user.type(periodsInput, "5");

    // 5 periods total, FTE = 5/5 = 1.0, payroll = (50_000/5) * 5 = $50,000.
    expect(screen.getByTestId("chesterton-staffing-periods-total")).toHaveTextContent("5");
    expect(screen.getByTestId("chesterton-staffing-fte-equivalent")).toHaveTextContent("1.0");
    expect(screen.getByTestId("chesterton-staffing-annual-payroll")).toHaveTextContent("$50,000");
  });

  // Task #338: the prospect-to-enrollment conversion rate is configurable.
  // Picking a different rate must rewire the projected enrollment, the
  // coverage % and the "you need N× more prospects" callout in lockstep.
  it("recruiting step recomputes projected/coverage/need-more callout when the conversion rate changes", async () => {
    const user = userEvent.setup();
    const seed = buildDefaultChestertonData();
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
            prospectConversionDivisor: 3,
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

    // Default 1-in-3: 90 prospects → projected 30, coverage 100%, no callout.
    expect(screen.getByTestId("chesterton-recruiting-projected")).toHaveTextContent("30");
    expect(screen.getByTestId("chesterton-recruiting-coverage-pct")).toHaveTextContent("100%");
    expect(screen.getByTestId("chesterton-recruiting-conversion-label")).toHaveTextContent("1 in 3");
    expect(screen.queryByTestId("chesterton-recruiting-need-more-callout")).toBeNull();

    // Switch to a worse 1-in-5 conversion rate (lender stress test).
    const select = screen.getByLabelText("Conversion rate", { selector: "select" }) as HTMLSelectElement;
    await user.selectOptions(select, "5");

    // 90 prospects / 5 = 18 projected, coverage = 60%, callout asks for
    // (30 * 5) - 90 = 60 more prospects, label updates to "1 in 5".
    expect(screen.getByTestId("chesterton-recruiting-projected")).toHaveTextContent("18");
    expect(screen.getByTestId("chesterton-recruiting-coverage-pct")).toHaveTextContent("60%");
    expect(screen.getByTestId("chesterton-recruiting-conversion-label")).toHaveTextContent("1 in 5");
    const callout = screen.getByTestId("chesterton-recruiting-need-more-callout");
    expect(callout).toHaveTextContent("5× more prospects");
    expect(callout).toHaveTextContent("60");

    // Switch to a better 1-in-2 conversion rate (strong feeder pipeline);
    // projected jumps to 45, coverage clips at 100%, callout disappears.
    await user.selectOptions(select, "2");
    expect(screen.getByTestId("chesterton-recruiting-projected")).toHaveTextContent("45");
    expect(screen.getByTestId("chesterton-recruiting-coverage-pct")).toHaveTextContent("150%");
    expect(screen.getByTestId("chesterton-recruiting-conversion-label")).toHaveTextContent("1 in 2");
    expect(screen.queryByTestId("chesterton-recruiting-need-more-callout")).toBeNull();
  });

  // Task #360: lenders want to see the projected enrollment range — best,
  // expected, and worst — without the founder having to flip the conversion
  // dropdown back and forth. The recruiting summary should render all three
  // projections at once and highlight the founder's chosen rate as Expected.
  it("recruiting step shows projections at best/expected/worst conversion rates side-by-side", async () => {
    const user = userEvent.setup();
    const seed = buildDefaultChestertonData();
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
            prospectConversionDivisor: 3,
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

    // Year-1 need = 30, total prospects = 90. We should see all three columns
    // with the right divisors and projections:
    //   best  : 1-in-2 -> 45 students, 150% coverage
    //   expected (founder picked 3): 1-in-3 -> 30 students, 100% coverage
    //   worst : 1-in-5 -> 18 students, 60% coverage
    const grid = screen.getByTestId("chesterton-recruiting-projection-grid");
    expect(grid).toBeInTheDocument();

    const best = screen.getByTestId("chesterton-recruiting-projection-best");
    expect(best).toHaveTextContent("Best");
    expect(best).toHaveTextContent("1 in 2");
    expect(screen.getByTestId("chesterton-recruiting-projected-best")).toHaveTextContent("45");
    expect(screen.getByTestId("chesterton-recruiting-coverage-pct-best")).toHaveTextContent("150%");

    const expected = screen.getByTestId("chesterton-recruiting-projection-expected");
    expect(expected).toHaveTextContent("Expected");
    expect(expected).toHaveTextContent("1 in 3");
    // The expected column reuses the historical test ids so the single-rate
    // flow keeps working.
    expect(screen.getByTestId("chesterton-recruiting-projected")).toHaveTextContent("30");
    expect(screen.getByTestId("chesterton-recruiting-coverage-pct")).toHaveTextContent("100%");

    const worst = screen.getByTestId("chesterton-recruiting-projection-worst");
    expect(worst).toHaveTextContent("Worst");
    expect(worst).toHaveTextContent("1 in 5");
    expect(screen.getByTestId("chesterton-recruiting-projected-worst")).toHaveTextContent("18");
    expect(screen.getByTestId("chesterton-recruiting-coverage-pct-worst")).toHaveTextContent("60%");

    // Switching the founder's pick re-anchors the Expected column without
    // touching the Best (1-in-2) or Worst (1-in-5) columns.
    const select = screen.getByLabelText("Conversion rate", { selector: "select" }) as HTMLSelectElement;
    await user.selectOptions(select, "4");

    expect(screen.getByTestId("chesterton-recruiting-projection-expected")).toHaveTextContent("1 in 4");
    expect(screen.getByTestId("chesterton-recruiting-projected")).toHaveTextContent("22"); // floor(90/4)
    expect(screen.getByTestId("chesterton-recruiting-coverage-pct")).toHaveTextContent("73%");
    // Best and Worst stay anchored at 1-in-2 and 1-in-5.
    expect(screen.getByTestId("chesterton-recruiting-projected-best")).toHaveTextContent("45");
    expect(screen.getByTestId("chesterton-recruiting-projected-worst")).toHaveTextContent("18");
  });

  // Task #336: priestly-outreach card surfaces a running count of contacts
  // and the number of distinct team members covering them.
  it("recruiting step shows priestly-outreach contact count and distinct team members", () => {
    const seed = buildDefaultChestertonData();
    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            priestlyOutreach: [
              { id: "p1", name: "Fr. Smith", affiliation: "St. Mary", teamMember: "Alice" },
              { id: "p2", name: "Fr. Jones", affiliation: "St. Joseph", teamMember: "alice" },
              { id: "p3", name: "Fr. Brown", affiliation: "Holy Family", teamMember: "Bob" },
              { id: "p4", name: "Fr. Green", affiliation: "St. Anne", teamMember: "" },
            ],
          },
        }}
      >
        <ChestertonRecruitingStep />
      </HostForm>,
    );

    // 4 contacts entered; team members = {alice, bob} (case-insensitive distinct) = 2.
    expect(screen.getByTestId("chesterton-priestly-contact-count")).toHaveTextContent("4");
    expect(screen.getByTestId("chesterton-priestly-team-count")).toHaveTextContent("2");
    const summary = screen.getByTestId("chesterton-priestly-summary");
    expect(summary).toHaveTextContent(/parishes contacted/i);
    expect(summary).toHaveTextContent(/team members/i);
  });

  it("recruiting step priestly card updates live as the founder fills in a contact", async () => {
    const user = userEvent.setup();
    const seed = buildDefaultChestertonData();
    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            priestlyOutreach: [
              { id: "p1", name: "Fr. Smith", affiliation: "St. Mary", teamMember: "" },
            ],
          },
        }}
      >
        <ChestertonRecruitingStep />
      </HostForm>,
    );

    expect(screen.getByTestId("chesterton-priestly-contact-count")).toHaveTextContent("1");
    expect(screen.getByTestId("chesterton-priestly-team-count")).toHaveTextContent("0");
    expect(screen.getByTestId("chesterton-priestly-summary")).toHaveTextContent(
      /assign a team member/i,
    );

    const teamInput = screen.getAllByLabelText("Team member assigned", {
      selector: "input",
    })[0] as HTMLInputElement;
    await user.clear(teamInput);
    await user.type(teamInput, "Alice");

    expect(screen.getByTestId("chesterton-priestly-team-count")).toHaveTextContent("1");
    expect(screen.getByTestId("chesterton-priestly-summary")).not.toHaveTextContent(
      /assign a team member/i,
    );
  });

  // Task #336: prospective-facilities card surfaces total capacity vs the
  // long-term (Year 5) enrollment goal so founders can see if the planned
  // facility footprint matches the long-term plan.
  it("recruiting step shows facilities total capacity vs long-term Year-5 enrollment", () => {
    const seed = buildDefaultChestertonData();
    const phase = (seed.phaseEnrollment ?? []).map((row, i) => ({
      ...row,
      year0: 0,
      year1: 0,
      year2: 0,
      year3: 0,
      year4: 0,
      year5: i === 0 ? 200 : 0,
    }));

    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            phaseEnrollment: phase,
            prospectiveFacilities: [
              { id: "f1", name: "Phase 1 building", capacity: 80, location: "Main" },
              { id: "f2", name: "Phase 2 wing", capacity: 60, location: "Annex" },
            ],
          },
        }}
      >
        <ChestertonRecruitingStep />
      </HostForm>,
    );

    expect(screen.getByTestId("chesterton-facilities-total-capacity")).toHaveTextContent(
      "140",
    );
    expect(screen.getByTestId("chesterton-facilities-count-label")).toHaveTextContent(
      "across 2 future facilities",
    );
    expect(
      screen.getByTestId("chesterton-facilities-long-term-enrollment"),
    ).toHaveTextContent("200");
    // 140 / 200 = 70%; capacity falls short, so the callout appears asking for 60 more.
    expect(screen.getByTestId("chesterton-facilities-coverage-pct")).toHaveTextContent(
      "70%",
    );
    expect(screen.getByTestId("chesterton-facilities-need-more-callout")).toHaveTextContent(
      "60",
    );
  });

  it("recruiting step facilities card updates live as the founder edits capacity", async () => {
    const user = userEvent.setup();
    const seed = buildDefaultChestertonData();
    const phase = (seed.phaseEnrollment ?? []).map((row, i) => ({
      ...row,
      year0: 0,
      year1: 0,
      year2: 0,
      year3: 0,
      year4: 0,
      year5: i === 0 ? 100 : 0,
    }));

    render(
      <HostForm
        defaults={{
          chesterton: {
            ...seed,
            phaseEnrollment: phase,
            prospectiveFacilities: [
              { id: "f1", name: "Phase 1 building", capacity: 0, location: "Main" },
            ],
          },
        }}
      >
        <ChestertonRecruitingStep />
      </HostForm>,
    );

    expect(screen.getByTestId("chesterton-facilities-total-capacity")).toHaveTextContent(
      "0 seats",
    );

    const capacityInput = screen.getAllByLabelText("Capacity", {
      selector: "input",
    })[0] as HTMLInputElement;
    await user.clear(capacityInput);
    await user.type(capacityInput, "120");

    // 120 capacity vs 100 long-term enrollment → 120%, callout disappears.
    expect(screen.getByTestId("chesterton-facilities-total-capacity")).toHaveTextContent(
      "120",
    );
    expect(screen.getByTestId("chesterton-facilities-coverage-pct")).toHaveTextContent(
      "120%",
    );
    expect(screen.queryByTestId("chesterton-facilities-need-more-callout")).toBeNull();
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
