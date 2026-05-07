import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExtendToFiveYearModal } from "./ExtendToFiveYearModal";
import { seedFiveYearFromYearOne, type SeedDefaults } from "@/lib/seed-five-year";

const FALLBACK: SeedDefaults = {
  enrollmentGrowthPct: 0,
  tuitionEscalationPct: 3,
  salaryEscalationPct: 3,
  costInflationPct: 3,
};

describe("ExtendToFiveYearModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ExtendToFiveYearModal open={false} onClose={() => {}} onConfirm={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title + bullets when open", () => {
    render(<ExtendToFiveYearModal open onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/Extend to a 5-year projection/i)).toBeInTheDocument();
    expect(screen.getByText(/Year 1 numbers stay exactly as you entered them/i)).toBeInTheDocument();
    expect(screen.getByText(/seed Years 2.5 from your Year 1 inputs/i)).toBeInTheDocument();
    expect(screen.getByText(/Lender Conversation Snapshot, Board and Funder Summary/i)).toBeInTheDocument();
  });

  it("calls onConfirm with the (default) rates when the primary button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ExtendToFiveYearModal open onClose={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: /Extend to 5-Year/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(FALLBACK);
  });

  it("calls onClose when Stay on Single-Year is clicked", () => {
    const onClose = vi.fn();
    render(<ExtendToFiveYearModal open onClose={onClose} onConfirm={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Stay on Single-Year/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button while pending", () => {
    render(<ExtendToFiveYearModal open isPending onClose={() => {}} onConfirm={() => {}} />);
    const btn = screen.getByRole("button", { name: /Extending/i });
    expect(btn).toBeDisabled();
  });

  it("pre-fills the editable rates from the form's current resolved defaults", () => {
    const defaults: SeedDefaults = {
      enrollmentGrowthPct: 7,
      tuitionEscalationPct: 4,
      salaryEscalationPct: 6,
      costInflationPct: 2,
    };
    render(
      <ExtendToFiveYearModal open onClose={() => {}} onConfirm={() => {}} defaults={defaults} />
    );
    expect(screen.getByTestId("extend-rate-enrollment")).toHaveValue(7);
    expect(screen.getByTestId("extend-rate-tuition")).toHaveValue(4);
    expect(screen.getByTestId("extend-rate-salary")).toHaveValue(6);
    expect(screen.getByTestId("extend-rate-cost")).toHaveValue(2);
  });

  it("does not render the Y1→Y5 preview when no Y1 baselines are provided", () => {
    render(<ExtendToFiveYearModal open onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByTestId("extend-preview")).not.toBeInTheDocument();
  });

  it("renders a Y1→Y5 preview row using the resolved defaults", () => {
    render(
      <ExtendToFiveYearModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        defaults={{
          enrollmentGrowthPct: 10,
          tuitionEscalationPct: 4,
          salaryEscalationPct: 3,
          costInflationPct: 3,
        }}
        y1Enrollment={80}
        y1TuitionRevenue={800_000}
      />,
    );
    expect(screen.getByTestId("extend-preview")).toBeInTheDocument();
    expect(screen.getByTestId("extend-preview-enrollment-y1")).toHaveTextContent("80");
    // 80 * 1.10^4 = 117.128 → 117
    expect(screen.getByTestId("extend-preview-enrollment-y5")).toHaveTextContent("117");
    expect(screen.getByTestId("extend-preview-tuition-y1")).toHaveTextContent("$800k");
    // 800_000 * 1.04^4 = 935_882.88 → rounded → $936k
    expect(screen.getByTestId("extend-preview-tuition-y5")).toHaveTextContent("$936k");
  });

  it("updates the preview when the founder edits the enrollment growth rate", () => {
    render(
      <ExtendToFiveYearModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        defaults={FALLBACK}
        y1Enrollment={100}
        y1TuitionRevenue={1_000_000}
      />,
    );
    // Default enrollment growth = 0% → Y5 stays at 100
    expect(screen.getByTestId("extend-preview-enrollment-y5")).toHaveTextContent("100");
    fireEvent.change(screen.getByTestId("extend-rate-enrollment"), { target: { value: "10" } });
    // 100 * 1.10^4 = 146.41 → 146
    expect(screen.getByTestId("extend-preview-enrollment-y5")).toHaveTextContent("146");
  });

  it("preview Y5 enrollment matches what the seeder will produce", () => {
    const y1 = 80;
    const enrollmentGrowthPct = 10;
    const seeded = seedFiveYearFromYearOne(
      { enrollment: { year1: y1 } } as Parameters<typeof seedFiveYearFromYearOne>[0],
      {
        enrollmentGrowthPct,
        tuitionEscalationPct: 0,
        salaryEscalationPct: 0,
        costInflationPct: 0,
      },
    );
    const seededY5 = (seeded.enrollment as { year5?: number } | undefined)?.year5 ?? 0;

    render(
      <ExtendToFiveYearModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        defaults={{
          enrollmentGrowthPct,
          tuitionEscalationPct: 3,
          salaryEscalationPct: 3,
          costInflationPct: 3,
        }}
        y1Enrollment={y1}
      />,
    );
    expect(screen.getByTestId("extend-preview-enrollment-y5")).toHaveTextContent(
      String(seededY5),
    );
  });

  it("renders Y1→Y5 payroll preview using salaryEscalationPct", () => {
    render(
      <ExtendToFiveYearModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        defaults={{
          enrollmentGrowthPct: 0,
          tuitionEscalationPct: 3,
          salaryEscalationPct: 5,
          costInflationPct: 3,
        }}
        y1Payroll={500_000}
      />,
    );
    expect(screen.getByTestId("extend-preview")).toBeInTheDocument();
    expect(screen.getByTestId("extend-preview-payroll-y1")).toHaveTextContent("$500k");
    // 500_000 * 1.05^4 = 607_753.13 → $608k
    expect(screen.getByTestId("extend-preview-payroll-y5")).toHaveTextContent("$608k");
  });

  it("updates the payroll preview when salary rate is edited", () => {
    render(
      <ExtendToFiveYearModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        defaults={FALLBACK}
        y1Payroll={1_000_000}
      />,
    );
    // Default salary rate = 3% → 1M * 1.03^4 = 1_125_508.81 → $1.13M
    expect(screen.getByTestId("extend-preview-payroll-y5")).toHaveTextContent("$1.13M");
    fireEvent.change(screen.getByTestId("extend-rate-salary"), { target: { value: "6" } });
    // 1M * 1.06^4 = 1_262_476.96 → $1.26M
    expect(screen.getByTestId("extend-preview-payroll-y5")).toHaveTextContent("$1.26M");
  });

  it("renders non-payroll expense preview using per-row rates plus modal default", () => {
    render(
      <ExtendToFiveYearModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        defaults={FALLBACK}
        y1ExpenseRows={[
          { amount: 100_000 }, // uses modal default 3%
          { amount: 50_000, rate: 0 }, // pinned flat
        ]}
      />,
    );
    expect(screen.getByTestId("extend-preview-nonpayroll-y1")).toHaveTextContent("$150k");
    // 100k * 1.03^4 = 112_550 + 50k flat = 162_550 → $163k
    expect(screen.getByTestId("extend-preview-nonpayroll-y5")).toHaveTextContent("$163k");
    // Editing cost inflation only affects the unpinned row
    fireEvent.change(screen.getByTestId("extend-rate-cost"), { target: { value: "10" } });
    // 100k * 1.10^4 = 146_410 + 50k = 196_410 → $196k
    expect(screen.getByTestId("extend-preview-nonpayroll-y5")).toHaveTextContent("$196k");
  });

  it("preview Y5 expense matches what the seeder will produce", () => {
    const expenseRows = [
      { amounts: [200_000], escalationRate: undefined as number | undefined },
      { amounts: [80_000], escalationRate: 7 },
    ];
    const seedRates: SeedDefaults = {
      enrollmentGrowthPct: 0,
      tuitionEscalationPct: 3,
      salaryEscalationPct: 3,
      costInflationPct: 4,
    };
    const seeded = seedFiveYearFromYearOne(
      { expenseRows } as unknown as Parameters<typeof seedFiveYearFromYearOne>[0],
      seedRates,
    );
    const seededRows = (seeded as unknown as { expenseRows: Array<{ amounts: number[] }> }).expenseRows;
    const seededY5Total = seededRows.reduce((s, r) => s + (Number(r.amounts[4]) || 0), 0);

    render(
      <ExtendToFiveYearModal
        open
        onClose={() => {}}
        onConfirm={() => {}}
        defaults={seedRates}
        y1ExpenseRows={expenseRows.map((r) => ({
          amount: r.amounts[0],
          rate: r.escalationRate,
        }))}
      />,
    );
    // formatCurrency rounds; compare against the same formatter output
    const y5 = screen.getByTestId("extend-preview-nonpayroll-y5").textContent || "";
    // sanity: seeder Y5 sum > Y1 sum
    expect(seededY5Total).toBeGreaterThan(280_000);
    // Re-format the seeder total the same way the modal does
    const expected =
      seededY5Total >= 1_000_000
        ? `$${(seededY5Total / 1_000_000).toFixed(seededY5Total >= 10_000_000 ? 1 : 2)}M`
        : seededY5Total >= 1_000
          ? `$${Math.round(seededY5Total / 1_000).toLocaleString()}k`
          : `$${Math.round(seededY5Total).toLocaleString()}`;
    expect(y5).toContain(expected);
  });

  it("passes the founder's edited rates through onConfirm", () => {
    const onConfirm = vi.fn();
    const defaults: SeedDefaults = {
      enrollmentGrowthPct: 0,
      tuitionEscalationPct: 3,
      salaryEscalationPct: 3,
      costInflationPct: 3,
    };
    render(
      <ExtendToFiveYearModal
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        defaults={defaults}
      />
    );

    fireEvent.change(screen.getByTestId("extend-rate-enrollment"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("extend-rate-tuition"), { target: { value: "4" } });
    fireEvent.change(screen.getByTestId("extend-rate-cost"), { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: /Extend to 5-Year/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      enrollmentGrowthPct: 5,
      tuitionEscalationPct: 4,
      salaryEscalationPct: 3,
      costInflationPct: 2,
    });
  });
});
