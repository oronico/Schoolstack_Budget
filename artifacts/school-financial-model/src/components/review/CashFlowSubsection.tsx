// Task #705 — Cash flow truth layer.
//
// Builds the founder-facing monthly cash flow view on the Review step:
//   1. Uses the canonical `computeYear1MonthlyCashFlow` helper from
//      `@workspace/finance` so the wizard, the api-server lender PDF,
//      and the underwriting workbook all read the same per-stream
//      timing for revenue and expenses.
//   2. Surfaces the lowest-cash month with a callout that includes a
//      `Next step:` line (Task #686 next-step contract).
//   3. Adds a "summer gap" annotation when the trough lands in
//      Jun/Jul/Aug/Sep so the founder sees the structural pattern.
//   4. Adds a delayed-public-funding scenario toggle (60 / 90 / 120
//      days) that re-runs the same canonical helper with shifted
//      public-funding rows so the founder can stress-test their
//      structural cash position without touching saved revenue rows.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  DollarSign,
  Lightbulb,
  Sun,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  computeYear1MonthlyCashFlow,
  findLowestCashMonth,
  type MonthlyRevenueRowLike,
} from "@workspace/finance";
import { formatCurrency, cn } from "@/lib/utils";
import {
  applyDelayedPublicFunding,
  isSummerGapMonth,
  PUBLIC_FUNDING_DELAY_OPTIONS,
  type PublicFundingDelayDays,
} from "./cash-flow-helpers";

const CALENDAR_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface CashFlowSubsectionProps {
  revenueRows: readonly MonthlyRevenueRowLike[];
  students: number;
  annualPersonnel: number;
  annualOpex: number;
  annualDebt: number;
  openingCash: number;
  /** 1-indexed fiscal-year start month (1 = Jan, 7 = Jul). */
  fiscalYearStartMonth: number;
  /** Operating months in Year 1 (1-12). */
  opMonths: number;
  /** Optional callback so the parent can mirror the lowest-cash month
   *  in the Simple / CFO metric panels without re-running the engine. */
  onLowestCashChange?: (
    lowest: { monthLabel: string; amount: number; isNegative: boolean } | null,
  ) => void;
}

interface MonthRow {
  monthLabel: string;
  begin: number;
  inflow: number;
  outflow: number;
  net: number;
  end: number;
  isLowest: boolean;
  isSummer: boolean;
}

export function buildMonthRows(
  series: ReturnType<typeof computeYear1MonthlyCashFlow>,
  opening: number,
  fiscalYearStartMonth: number,
  lowestIdx: number,
): MonthRow[] {
  const fyStart = Math.max(1, Math.min(12, fiscalYearStartMonth)) - 1;
  const rows: MonthRow[] = [];
  let begin = opening;
  for (let i = 0; i < 12; i++) {
    const calIdx = ((fyStart + i) % 12 + 12) % 12;
    const monthLabel = CALENDAR_MONTHS[calIdx];
    const inflow = series.inflow[i] ?? 0;
    const outflow = series.outflow[i] ?? 0;
    const net = inflow - outflow;
    const end = begin + net;
    rows.push({
      monthLabel,
      begin,
      inflow,
      outflow,
      net,
      end,
      isLowest: i === lowestIdx,
      isSummer: isSummerGapMonth(monthLabel),
    });
    begin = end;
  }
  return rows;
}

export function CashFlowSubsection({
  revenueRows,
  students,
  annualPersonnel,
  annualOpex,
  annualDebt,
  openingCash,
  fiscalYearStartMonth,
  opMonths,
  onLowestCashChange,
}: CashFlowSubsectionProps) {
  const [delayDays, setDelayDays] = useState<PublicFundingDelayDays>(0);

  const { baseSeries, scenarioSeries, baseLowest, scenarioLowest } = useMemo(() => {
    const compute = (rows: readonly MonthlyRevenueRowLike[]) =>
      computeYear1MonthlyCashFlow({
        revenueRows: rows,
        yearIndex: 0,
        students,
        annualPersonnel,
        annualOpex,
        annualDebt,
        openingCash,
        opMonths,
      });
    const baseSeries = compute(revenueRows);
    const scenarioRows =
      delayDays > 0
        ? applyDelayedPublicFunding(revenueRows, delayDays)
        : revenueRows;
    const scenarioSeries =
      delayDays > 0 ? compute(scenarioRows) : baseSeries;
    return {
      baseSeries,
      scenarioSeries,
      baseLowest: findLowestCashMonth(baseSeries.cumulative, fiscalYearStartMonth),
      scenarioLowest: findLowestCashMonth(
        scenarioSeries.cumulative,
        fiscalYearStartMonth,
      ),
    };
  }, [
    revenueRows,
    students,
    annualPersonnel,
    annualOpex,
    annualDebt,
    openingCash,
    opMonths,
    fiscalYearStartMonth,
    delayDays,
  ]);

  const activeSeries = delayDays > 0 ? scenarioSeries : baseSeries;
  const activeLowest = delayDays > 0 ? scenarioLowest : baseLowest;
  const lowestIdx = activeLowest?.monthIndex ?? -1;
  const monthRows = useMemo(
    () => buildMonthRows(activeSeries, openingCash, fiscalYearStartMonth, lowestIdx),
    [activeSeries, openingCash, fiscalYearStartMonth, lowestIdx],
  );

  const hasNegativeMonth = monthRows.some((m) => m.end < 0);
  const lowestMonthLabel = activeLowest?.monthLabel ?? "";
  const lowestAmount = activeLowest?.amount ?? 0;
  const isSummerTrough = isSummerGapMonth(lowestMonthLabel);
  const baseLowestAmount = baseLowest?.amount ?? 0;
  const scenarioDelta =
    delayDays > 0 ? (scenarioLowest?.amount ?? 0) - baseLowestAmount : 0;

  // Mirror the active trough up to the parent so Simple / CFO metric
  // panels share the exact same number the table shows.
  useEffect(() => {
    if (!onLowestCashChange) return;
    onLowestCashChange(
      activeLowest
        ? {
            monthLabel: activeLowest.monthLabel,
            amount: activeLowest.amount,
            isNegative: activeLowest.isNegative,
          }
        : null,
    );
  }, [activeLowest, onLowestCashChange]);

  const chartData = useMemo(() => {
    const baseRows = buildMonthRows(baseSeries, openingCash, fiscalYearStartMonth, baseLowest?.monthIndex ?? -1);
    const scenarioRows =
      delayDays > 0
        ? buildMonthRows(
            scenarioSeries,
            openingCash,
            fiscalYearStartMonth,
            scenarioLowest?.monthIndex ?? -1,
          )
        : null;
    return baseRows.map((row, i) => ({
      month: row.monthLabel,
      base: row.end,
      scenario: scenarioRows ? scenarioRows[i].end : null,
    }));
  }, [baseSeries, scenarioSeries, openingCash, fiscalYearStartMonth, baseLowest, scenarioLowest, delayDays]);

  return (
    <div
      data-testid="cash-flow-subsection"
      className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-display font-bold text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Year 1 Monthly Cash Flow
        </h3>
        {hasNegativeMonth && (
          <span
            data-testid="cash-flow-negative-badge"
            className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-rose-100 text-rose-700"
          >
            <AlertTriangle className="h-3 w-3" /> Negative months
          </span>
        )}
      </div>

      {activeLowest && (
        <CashTroughCallout
          monthLabel={lowestMonthLabel}
          amount={lowestAmount}
          openingCash={openingCash}
          isNegative={activeLowest.isNegative}
          isSummerGap={isSummerTrough}
          delayDays={delayDays}
          scenarioDelta={scenarioDelta}
        />
      )}

      <div data-testid="cash-flow-chart" className="h-56 w-full -mx-2 mb-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatCurrency(v)} width={80} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="2 2" />
            <Line type="monotone" dataKey="base" name="On-time funding" stroke="#0d9488" strokeWidth={2} dot={false} />
            {delayDays > 0 && (
              <Line
                type="monotone"
                dataKey="scenario"
                name={`${delayDays}-day public funding delay`}
                stroke="#b45309"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <DelayedFundingControls
        delayDays={delayDays}
        onChange={setDelayDays}
        baseLowestAmount={baseLowestAmount}
        scenarioLowestAmount={scenarioLowest?.amount ?? null}
      />

      <div className="overflow-x-auto -mx-2 mt-2">
        <table
          className="w-full text-xs"
          data-testid="cash-flow-table"
        >
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 font-semibold text-muted-foreground">
                Month
              </th>
              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">
                Beginning
              </th>
              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">
                Inflows
              </th>
              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">
                Outflows
              </th>
              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">
                Net
              </th>
              <th className="text-right py-2 px-2 font-semibold text-muted-foreground">
                Ending
              </th>
            </tr>
          </thead>
          <tbody>
            {monthRows.map((m, i) => (
              <tr
                key={i}
                data-testid={`cash-flow-row-${m.monthLabel.toLowerCase()}`}
                data-lowest={m.isLowest ? "true" : undefined}
                className={cn(
                  "border-b border-border/30",
                  m.end < 0 && "bg-rose-50",
                  m.isLowest && "bg-amber-50 font-semibold",
                  !m.isLowest && m.end >= 0 && i % 2 === 0 && "bg-secondary/20",
                )}
              >
                <td className="py-2 px-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {m.monthLabel}
                    {m.isLowest && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900"
                        data-testid="cash-flow-lowest-tag"
                      >
                        Lowest
                      </span>
                    )}
                    {m.isSummer && !m.isLowest && (
                      <Sun className="h-3 w-3 text-amber-500" aria-label="Summer month" />
                    )}
                  </span>
                </td>
                <td className="py-2 px-2 text-right">{formatCurrency(m.begin)}</td>
                <td className="py-2 px-2 text-right text-emerald-700">
                  {formatCurrency(m.inflow)}
                </td>
                <td className="py-2 px-2 text-right text-rose-600">
                  ({formatCurrency(m.outflow)})
                </td>
                <td
                  className={cn(
                    "py-2 px-2 text-right",
                    m.net >= 0 ? "text-emerald-700" : "text-rose-600",
                  )}
                >
                  {formatCurrency(m.net)}
                </td>
                <td
                  className={cn(
                    "py-2 px-2 text-right font-semibold",
                    m.end < 0 && "text-rose-700",
                  )}
                >
                  {formatCurrency(m.end)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface CashTroughCalloutProps {
  monthLabel: string;
  amount: number;
  openingCash: number;
  isNegative: boolean;
  isSummerGap: boolean;
  delayDays: PublicFundingDelayDays;
  scenarioDelta: number;
}

function CashTroughCallout({
  monthLabel,
  amount,
  openingCash,
  isNegative,
  isSummerGap,
  delayDays,
  scenarioDelta,
}: CashTroughCalloutProps) {
  const isLow = !isNegative && openingCash > 0 && amount < openingCash * 0.25;

  let tone: "rose" | "amber" | "teal";
  let icon = <Lightbulb className="h-4 w-4 flex-shrink-0 mt-0.5" />;
  let body: React.ReactNode;
  let nextStep: string;

  if (isNegative) {
    tone = "rose";
    icon = <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />;
    body = (
      <>
        <span className="font-bold">Cash trough alert:</span> Your cash balance
        drops to <span className="font-semibold">{formatCurrency(amount)}</span>{" "}
        in {monthLabel}. You'll run out of money before collections catch up.
      </>
    );
    nextStep =
      "Open Step 7 and trim discretionary cost, or line up a bridge facility (line of credit / short-term loan) before this month hits.";
  } else if (isLow) {
    tone = "amber";
    body = (
      <>
        <span className="font-bold">Cash trough:</span> Your lowest cash point
        is <span className="font-semibold">{formatCurrency(amount)}</span> in{" "}
        {monthLabel}. That's less than a quarter of the cash you started with.
      </>
    );
    nextStep =
      "Open Step 2: School Details and raise opening cash, or revisit Step 5: Revenue collection timing so cash arrives sooner.";
  } else {
    tone = "teal";
    body = (
      <>
        <span className="font-bold">Cash trough:</span> Your lowest cash point
        is <span className="font-semibold">{formatCurrency(amount)}</span> in{" "}
        {monthLabel}. You have enough reserves to absorb the collection gap.
      </>
    );
    nextStep =
      "Keep an eye on this month each year — if opening cash drops or expenses grow, the cushion narrows fast.";
  }

  const toneClasses: Record<typeof tone, string> = {
    rose: "bg-rose-50 border-rose-200 text-rose-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    teal: "bg-teal-50 border-teal-200 text-teal-800",
  };

  return (
    <div
      data-testid="cash-trough-callout"
      data-tone={tone}
      className={cn(
        "rounded-xl border px-4 py-3 mb-3",
        toneClasses[tone],
      )}
    >
      <div className="flex items-start gap-3">
        {icon}
        <div className="space-y-1.5 text-sm">
          <p>{body}</p>
          {isSummerGap && (
            <p
              data-testid="summer-gap-annotation"
              className="text-xs italic"
            >
              Summer gap: your annual budget may look balanced, but tuition
              stops billing while payroll and facility costs keep going out.
              That's why cash gets tight in {monthLabel} before the new school
              year's collections catch up.
            </p>
          )}
          {delayDays > 0 && (
            <p
              data-testid="delayed-funding-impact"
              className="text-xs"
            >
              With public funding {delayDays} days late, your trough moves by{" "}
              <span className="font-semibold">
                {scenarioDelta >= 0 ? "+" : ""}
                {formatCurrency(scenarioDelta)}
              </span>{" "}
              vs. on-time funding.
            </p>
          )}
          <p className="text-xs">
            <span className="font-semibold">Next step:</span> {nextStep}
          </p>
        </div>
      </div>
    </div>
  );
}

interface DelayedFundingControlsProps {
  delayDays: PublicFundingDelayDays;
  onChange: (next: PublicFundingDelayDays) => void;
  baseLowestAmount: number;
  scenarioLowestAmount: number | null;
}

function DelayedFundingControls({
  delayDays,
  onChange,
  baseLowestAmount,
  scenarioLowestAmount,
}: DelayedFundingControlsProps) {
  return (
    <div
      data-testid="delayed-funding-controls"
      className="rounded-xl border border-border/50 bg-secondary/20 p-3 mb-3"
    >
      <div className="flex items-start gap-2 flex-wrap">
        <ArrowRight className="h-4 w-4 text-primary mt-1" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-xs font-semibold text-foreground">
            What if public funding arrives late?
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Stress-test your lowest cash month against a state / district
            payment delay. Saved revenue rows are not changed.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Delayed public funding scenario"
          className="inline-flex items-center rounded-lg border border-border/60 bg-white p-1"
        >
          {PUBLIC_FUNDING_DELAY_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              role="radio"
              aria-checked={delayDays === opt.days}
              data-testid={`delayed-funding-option-${opt.days}`}
              onClick={() => onChange(opt.days as PublicFundingDelayDays)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                delayDays === opt.days
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {delayDays > 0 && scenarioLowestAmount !== null && (
        <p
          data-testid="delayed-funding-readout"
          className="text-[11px] text-muted-foreground mt-2 ml-6"
        >
          Lowest cash month was {formatCurrency(baseLowestAmount)} on time —
          becomes {formatCurrency(scenarioLowestAmount)} with {delayDays}-day
          delay.
        </p>
      )}
    </div>
  );
}
