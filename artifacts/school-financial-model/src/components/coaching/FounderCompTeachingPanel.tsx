import { useEffect, useMemo, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { HandCoins, TrendingDown, TrendingUp, Calendar } from "lucide-react";
import {
  computeBaseFinancials,
  computeCashRunwayMonths,
  deriveReportedFounderCompFromStartDate,
  findLowestCashMonthAcrossYears,
  getNormalizedFounderCompYears,
  type LowestCashMonth,
} from "@workspace/finance";
import { cn, formatCurrency } from "@/lib/utils";
import type { FullModelData } from "@/pages/model-wizard/schema";

interface ComparisonMetrics {
  netIncome: number[];
  cashRunwayMonths: number;
  lowestCashMonth: LowestCashMonth | null;
}

interface FounderCompTeachingPanelProps {
  yearCount: number;
  className?: string;
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Task #685: a focused teaching moment in the staffing step that
 *  (a) explains in plain English why paying yourself eventually matters,
 *  (b) lets the founder set when their own compensation begins (start
 *      month + start year + annual amount, or "I'm not paying myself yet"),
 *  (c) shows the model side-by-side WITHOUT founder pay vs WITH founder
 *      pay, surfacing Y1 net income, runway months, and lowest cash month
 *      so the tradeoff is concrete.
 *
 *  This panel writes the founder's friendly inputs into both the
 *  `staffing.notPayingFounderYet/founderCompStartMonth/...` fields AND the
 *  derived `staffing.reportedFounderComp[]` array — so the rest of the
 *  engine (cash flow, P&L, exports) picks up the change with no extra
 *  wiring. The tone here is coaching, not judgmental: starting unpaid is
 *  framed as a real, often necessary choice — just one to make on purpose,
 *  not by accident.
 */
export function FounderCompTeachingPanel({
  yearCount,
  className,
}: FounderCompTeachingPanelProps) {
  const { watch, setValue } = useFormContext();
  const data = watch() as FullModelData;
  const colaRate = (watch("facilities.annualSalaryIncrease") as number) ?? 3;

  const notPayingYet = watch("staffing.notPayingFounderYet") as
    | boolean
    | undefined;
  const annualAmount = watch("staffing.founderCompAnnualAmount") as
    | number
    | undefined;
  const startMonth =
    (watch("staffing.founderCompStartMonth") as number | undefined) ?? 7;
  const startYear =
    (watch("staffing.founderCompStartYear") as number | undefined) ?? 1;

  // Keep the derived per-year `reportedFounderComp` in sync with the
  // friendly inputs. We only write when these inputs actively express
  // intent (toggle on, or amount > 0) so we never clobber an existing
  // hand-entered per-year array on first paint.
  const lastWritten = useRef<string>("");
  useEffect(() => {
    const derived = deriveReportedFounderCompFromStartDate({
      notPayingYet: !!notPayingYet,
      annualAmount,
      startMonth,
      startYear,
      yearCount,
      colaPct: colaRate,
    });
    if (!derived) return;
    const key = `${notPayingYet ? 1 : 0}|${annualAmount ?? ""}|${startMonth}|${startYear}|${yearCount}|${colaRate}`;
    if (lastWritten.current === key) return;
    lastWritten.current = key;
    setValue("staffing.reportedFounderComp", derived, { shouldDirty: true });
  }, [
    notPayingYet,
    annualAmount,
    startMonth,
    startYear,
    yearCount,
    colaRate,
    setValue,
  ]);

  // Side-by-side comparison.
  //
  //   - LEFT ("Your current model") = the user's TRUE current model from
  //     the canonical engine, untouched. We do NOT zero out leadership
  //     rows — leadership comp the user already entered must stay in the
  //     baseline so the comparison reflects reality.
  //   - RIGHT ("Your model with founder compensation included") = the
  //     same baseline plus a founder-comp delta that respects the start
  //     month + start year + COLA. The delta is applied to monthly cash
  //     flow (Y1 starts at the chosen month so proration is real) and
  //     re-derives net income, runway, and the lowest-cash month from
  //     the canonical baseline. Benefits + payroll tax multiplier is
  //     pulled from the model so the cost is honest.
  const plannedAnnualAmount = useMemo(() => {
    if (notPayingYet) return 0;
    if (typeof annualAmount === "number" && annualAmount > 0) return annualAmount;
    return 0;
  }, [notPayingYet, annualAmount]);

  const fallbackAnnualAmount = useMemo(() => {
    if (plannedAnnualAmount > 0) return plannedAnnualAmount;
    const norm = getNormalizedFounderCompYears(data, yearCount);
    return norm[0] ?? 0;
  }, [plannedAnnualAmount, data, yearCount]);

  const baseline = useMemo(() => computeBaseFinancials(data), [data]);

  const withoutMetrics: ComparisonMetrics = useMemo(
    () => ({
      netIncome: baseline.netIncome,
      cashRunwayMonths: baseline.cashRunwayMonths,
      lowestCashMonth: baseline.lowestCashMonth ?? null,
    }),
    [baseline],
  );

  // Per-year founder cost array (already prorated for Y1 start month
  // because deriveReportedFounderCompFromStartDate scales annualAmount
  // by months remaining in Y1).
  const founderCostPerYear = useMemo(() => {
    const targetAmount = plannedAnnualAmount > 0 ? plannedAnnualAmount : fallbackAnnualAmount;
    if (targetAmount <= 0 || notPayingYet) {
      return Array.from({ length: yearCount }, () => 0);
    }
    const series = deriveReportedFounderCompFromStartDate({
      annualAmount: targetAmount,
      startMonth,
      startYear,
      yearCount,
      colaPct: colaRate,
    });
    if (!series) return Array.from({ length: yearCount }, () => 0);
    // Apply benefits + payroll tax multiplier so cost-to-school is honest.
    const benefitsRate = (data.staffing?.benefitsRate ?? 0) / 100;
    const payrollTaxRate = (data.staffing?.payrollTaxRate ?? 0) / 100;
    const multiplier = 1 + benefitsRate + payrollTaxRate;
    return series.map((s) => s * multiplier);
  }, [
    plannedAnnualAmount,
    fallbackAnnualAmount,
    notPayingYet,
    startMonth,
    startYear,
    yearCount,
    colaRate,
    data,
  ]);

  // Total founder pay (salary only, no benefits) over the modeled years.
  const totalWithComp = useMemo(
    () => founderCostPerYear.reduce((s, n) => s + n, 0),
    [founderCostPerYear],
  );

  const hasFounderPay = plannedAnnualAmount > 0 && !notPayingYet;
  const showWithCard = founderCostPerYear.some((n) => n > 0);

  const withMetricsForDisplay: ComparisonMetrics | null = useMemo(() => {
    if (!showWithCard) return null;

    // Net income: subtract per-year founder cost from baseline.
    const newNetIncome = baseline.netIncome.map(
      (n, i) => n - (founderCostPerYear[i] || 0),
    );

    // Monthly cash flow: spread each year's founder cost across the
    // months it actually occurs. Y1 starts at startMonth (1-indexed FY
    // month relative to the user's first FY); Y2+ spread across all 12.
    const startingCash = data.openingBalances?.cash || 0;
    const baseByYear = baseline.monthlyCashFlowByYear;
    let runwayMonths = baseline.cashRunwayMonths;
    let trough: LowestCashMonth | null = baseline.lowestCashMonth ?? null;

    if (baseByYear && baseByYear.length > 0) {
      const overlaidByYear = baseByYear.map((series, y) => {
        const yearCost = founderCostPerYear[y] || 0;
        const monthly = new Array(12).fill(0);
        if (yearCost > 0) {
          if (y === startYear - 1) {
            // First year of pay: spread across the months from startMonth
            // through end of year.
            const monthsActive = Math.max(1, 12 - (startMonth - 1));
            const perMonth = yearCost / monthsActive;
            for (let m = startMonth - 1; m < 12; m++) monthly[m] = perMonth;
          } else if (y > startYear - 1) {
            // Later years: spread evenly.
            const perMonth = yearCost / 12;
            for (let m = 0; m < 12; m++) monthly[m] = perMonth;
          }
        }
        const newOutflow = series.outflow.map((v, m) => v + monthly[m]);
        const newNet = series.inflow.map((v, m) => v - newOutflow[m]);
        return newNet;
      });

      // Re-chain cumulative cash year over year off the user's starting
      // cash so runway + trough are honest.
      const cumulativeByYear: number[][] = [];
      let runningOpen = startingCash;
      for (const netSeries of overlaidByYear) {
        const cum: number[] = [];
        let r = runningOpen;
        for (const v of netSeries) {
          r += v;
          cum.push(r);
        }
        cumulativeByYear.push(cum);
        runningOpen = cum[cum.length - 1];
      }

      runwayMonths = computeCashRunwayMonths(
        startingCash,
        overlaidByYear,
        yearCount * 12,
      );
      trough = findLowestCashMonthAcrossYears(cumulativeByYear, 7);
    }

    return {
      netIncome: newNetIncome,
      cashRunwayMonths: Math.round(runwayMonths * 10) / 10,
      lowestCashMonth: trough,
    };
  }, [
    showWithCard,
    baseline,
    founderCostPerYear,
    data,
    startMonth,
    startYear,
    yearCount,
  ]);

  // Suggested years (used only in the no-amount-yet sublabel copy).
  const suggestedYears = useMemo(() => {
    if (hasFounderPay) return [] as number[];
    return getNormalizedFounderCompYears(data, yearCount);
  }, [hasFounderPay, data, yearCount]);

  return (
    <section
      data-testid="founder-comp-teaching-panel"
      className={cn(
        "rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-yellow-50/50 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5 mb-3">
        <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
          <HandCoins className="h-4 w-4 text-amber-700" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base font-bold text-amber-900">
            Paying yourself matters
          </h3>
          <p className="text-[13px] text-amber-900/85 leading-snug mt-1">
            A lot of school founders start out unpaid — and that can be a real,
            honest choice in year one to protect cash. It just shouldn't stay
            that way forever. A sustainable school eventually pays the people
            doing the work, and that includes you. Tell us when you plan to
            start paying yourself and we'll show you the tradeoff side-by-side.
          </p>
        </div>
      </div>

      {/* Friendly inputs: not-paying-yet toggle + start month/year + amount. */}
      <div
        className="rounded-xl bg-white/70 border border-amber-200/60 p-3 sm:p-4"
        data-testid="founder-comp-teaching-inputs"
      >
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            data-testid="founder-not-paying-yet"
            checked={!!notPayingYet}
            onChange={(e) =>
              setValue("staffing.notPayingFounderYet", e.target.checked, {
                shouldDirty: true,
              })
            }
            className="mt-0.5 h-4 w-4 rounded border-amber-300 text-primary focus:ring-primary/30"
          />
          <span className="text-[13px] text-amber-900 leading-snug">
            <span className="font-semibold">I'm not paying myself yet.</span>{" "}
            <span className="text-amber-900/75">
              That's okay for now — we'll still show you what the model would
              look like once you do.
            </span>
          </span>
        </label>

        {!notPayingYet && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-900/80">
                Annual amount
              </span>
              <input
                type="number"
                min={0}
                step={1000}
                value={annualAmount ?? ""}
                onChange={(e) =>
                  setValue(
                    "staffing.founderCompAnnualAmount",
                    e.target.value === "" ? undefined : Number(e.target.value),
                    { shouldDirty: true },
                  )
                }
                data-testid="founder-comp-annual-amount"
                placeholder="e.g. 60000"
                className="rounded-md border border-amber-200/80 bg-white px-2.5 py-1.5 text-sm text-foreground tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-900/80">
                <Calendar className="inline h-3 w-3 mr-1 -mt-0.5" />
                Starting month
              </span>
              <select
                value={startMonth}
                onChange={(e) =>
                  setValue(
                    "staffing.founderCompStartMonth",
                    Number(e.target.value),
                    { shouldDirty: true },
                  )
                }
                data-testid="founder-comp-start-month"
                className="rounded-md border border-amber-200/80 bg-white px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              >
                {MONTH_LABELS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-900/80">
                Starting year
              </span>
              <select
                value={startYear}
                onChange={(e) =>
                  setValue(
                    "staffing.founderCompStartYear",
                    Number(e.target.value),
                    { shouldDirty: true },
                  )
                }
                data-testid="founder-comp-start-year"
                className="rounded-md border border-amber-200/80 bg-white px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              >
                {Array.from({ length: yearCount }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Year {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {/* Side-by-side impact comparison. */}
      <div
        className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        data-testid="founder-comp-comparison"
      >
        <ImpactCard
          label="Your current model"
          sublabel="What the model looks like with no founder paycheck — the cash you're effectively donating to the school as sweat equity."
          tone="current"
          metrics={withoutMetrics}
          founderPay={0}
          yearCount={yearCount}
          testId="founder-comp-current"
        />
        <ImpactCard
          label="Your model with founder compensation included"
          sublabel={
            hasFounderPay
              ? `What it looks like once your ${formatCurrency(annualAmount ?? 0)}/yr starts in ${MONTH_LABELS[startMonth - 1]} of Year ${startYear}.`
              : suggestedYears.some((n) => n > 0)
                ? "Using the suggested market rate as a placeholder until you set your own number."
                : "Add an amount above to see the tradeoff."
          }
          tone="with"
          metrics={withMetricsForDisplay}
          founderPay={
            hasFounderPay
              ? totalWithComp
              : suggestedYears.reduce((s, n) => s + n, 0)
          }
          yearCount={yearCount}
          testId="founder-comp-with"
        />
      </div>

      <p
        className="mt-3 text-[12px] text-amber-900/75 leading-snug"
        data-testid="founder-comp-coaching-note"
      >
        Both views are real. Going unpaid for a season can be the right call to
        protect cash early — just plan, on purpose, for when the school can
        pick up the cost so the model stays sustainable.
      </p>
    </section>
  );
}

interface ImpactCardProps {
  label: string;
  sublabel: string;
  tone: "current" | "with";
  metrics: ComparisonMetrics | null;
  founderPay: number;
  yearCount: number;
  testId: string;
}

function ImpactCard({
  label,
  sublabel,
  tone,
  metrics,
  founderPay,
  yearCount,
  testId,
}: ImpactCardProps) {
  const toneClasses =
    tone === "current"
      ? "border-amber-200/70 bg-white/80"
      : "border-amber-300/80 bg-amber-100/40";
  const y1Net = metrics?.netIncome[0] ?? 0;
  const lowest = metrics?.lowestCashMonth ?? null;
  const runway = metrics?.cashRunwayMonths ?? 0;
  const totalNet = (metrics?.netIncome ?? []).reduce((s, n) => s + n, 0);
  const NetIcon = y1Net >= 0 ? TrendingUp : TrendingDown;
  const netColor = y1Net >= 0 ? "text-emerald-700" : "text-rose-700";

  return (
    <div
      data-testid={testId}
      className={cn("rounded-xl border p-3 sm:p-4", toneClasses)}
    >
      <div className="text-[11px] uppercase tracking-wider font-semibold text-amber-900/80">
        {label}
      </div>
      <p className="text-[11.5px] text-amber-900/75 leading-snug mt-1">
        {sublabel}
      </p>

      {!metrics ? (
        <div
          data-testid={`${testId}-empty`}
          className="mt-3 text-[12px] text-amber-900/70 italic"
        >
          Once you add an amount, you'll see the side-by-side here.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Stat
            label="Year 1 net income"
            valueEl={
              <span className={cn("inline-flex items-center gap-1", netColor)}>
                <NetIcon className="h-3.5 w-3.5" />
                <span className="tabular-nums font-semibold">
                  {formatCurrency(Math.round(y1Net))}
                </span>
              </span>
            }
            testId={`${testId}-y1-net-income`}
          />
          <Stat
            label="Cash runway"
            valueEl={
              <span className="tabular-nums font-semibold text-amber-950">
                {runway >= yearCount * 12
                  ? `${yearCount * 12}+ mo`
                  : `${runway.toFixed(1)} mo`}
              </span>
            }
            testId={`${testId}-runway`}
          />
          <Stat
            label="Lowest cash month"
            valueEl={
              lowest ? (
                <span
                  className={cn(
                    "tabular-nums font-semibold",
                    lowest.isNegative ? "text-rose-700" : "text-amber-950",
                  )}
                >
                  {formatCurrency(Math.round(lowest.amount))}{" "}
                  <span className="font-normal text-[11px] text-amber-900/70">
                    ({lowest.monthLabel} Y{(lowest.yearIndex ?? 0) + 1})
                  </span>
                </span>
              ) : (
                <span className="text-amber-900/60 text-[12px]">—</span>
              )
            }
            testId={`${testId}-lowest-cash`}
          />
          <Stat
            label={`5-yr founder pay${yearCount !== 5 ? ` (${yearCount}-yr)` : ""}`}
            valueEl={
              <span className="tabular-nums font-semibold text-amber-950">
                {formatCurrency(Math.round(founderPay))}
              </span>
            }
            testId={`${testId}-founder-pay-total`}
          />
          <Stat
            label="Cumulative net income"
            valueEl={
              <span
                className={cn(
                  "tabular-nums font-semibold",
                  totalNet >= 0 ? "text-emerald-700" : "text-rose-700",
                )}
              >
                {formatCurrency(Math.round(totalNet))}
              </span>
            }
            testId={`${testId}-cumulative-net`}
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  valueEl,
  testId,
}: {
  label: string;
  valueEl: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-baseline justify-between gap-2 text-[12.5px]"
    >
      <span className="text-amber-900/80">{label}</span>
      <span className="text-right">{valueEl}</span>
    </div>
  );
}
