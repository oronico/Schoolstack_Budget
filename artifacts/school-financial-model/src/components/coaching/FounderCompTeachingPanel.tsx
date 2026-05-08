import { useEffect, useMemo, useRef } from "react";
import { useFormContext } from "react-hook-form";
import {
  HandCoins,
  TrendingDown,
  TrendingUp,
  Calendar,
  Bookmark,
  Trash2,
  Check,
} from "lucide-react";
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

interface FounderCompPlan {
  notPayingYet?: boolean;
  annualAmount?: number;
  startMonth?: number;
  startYear?: number;
}

interface SavedScenario {
  id: string;
  name: string;
  notPayingYet?: boolean;
  annualAmount?: number;
  startMonth?: number;
  startYear?: number;
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

const MONTH_LABELS_SHORT = [
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

const MAX_SCENARIOS = 3;

/**
 * Compute the per-year founder pay cost (with benefits + payroll-tax
 * multiplier applied) for a given plan. Returns an array of length
 * `yearCount`. When the plan has no pay (notPayingYet, or zero amount,
 * or no amount), every entry is 0.
 */
function computeFounderCostPerYear(
  data: FullModelData,
  plan: FounderCompPlan,
  yearCount: number,
  colaPct: number,
): number[] {
  if (plan.notPayingYet) return Array.from({ length: yearCount }, () => 0);
  const amount = plan.annualAmount;
  if (typeof amount !== "number" || amount <= 0) {
    return Array.from({ length: yearCount }, () => 0);
  }
  const series = deriveReportedFounderCompFromStartDate({
    annualAmount: amount,
    startMonth: plan.startMonth,
    startYear: plan.startYear,
    yearCount,
    colaPct,
  });
  if (!series) return Array.from({ length: yearCount }, () => 0);
  const benefitsRate = (data.staffing?.benefitsRate ?? 0) / 100;
  const payrollTaxRate = (data.staffing?.payrollTaxRate ?? 0) / 100;
  const multiplier = 1 + benefitsRate + payrollTaxRate;
  return series.map((s) => s * multiplier);
}

/**
 * Project the engine baseline forward with a founder-comp delta applied
 * each month. Re-derives net income, cash runway, and the lowest cash
 * month so the comparison is honest. Returns `null` when the plan adds
 * no founder cost in any year (so callers can render an empty state).
 */
function computePlanMetrics(
  data: FullModelData,
  baseline: ReturnType<typeof computeBaseFinancials>,
  plan: FounderCompPlan,
  yearCount: number,
  colaPct: number,
): { metrics: ComparisonMetrics | null; costPerYear: number[] } {
  const costPerYear = computeFounderCostPerYear(data, plan, yearCount, colaPct);
  if (!costPerYear.some((n) => n > 0)) {
    return { metrics: null, costPerYear };
  }

  const netIncome = baseline.netIncome.map(
    (n, i) => n - (costPerYear[i] || 0),
  );

  const startingCash = data.openingBalances?.cash || 0;
  const baseByYear = baseline.monthlyCashFlowByYear;
  let runwayMonths = baseline.cashRunwayMonths;
  let trough: LowestCashMonth | null = baseline.lowestCashMonth ?? null;

  const startMonth = Math.max(1, Math.min(12, plan.startMonth ?? 1));
  const startYear = Math.max(1, Math.min(yearCount, plan.startYear ?? 1));

  if (baseByYear && baseByYear.length > 0) {
    const overlaidByYear = baseByYear.map((series, y) => {
      const yearCost = costPerYear[y] || 0;
      const monthly = new Array(12).fill(0);
      if (yearCost > 0) {
        if (y === startYear - 1) {
          const monthsActive = Math.max(1, 12 - (startMonth - 1));
          const perMonth = yearCost / monthsActive;
          for (let m = startMonth - 1; m < 12; m++) monthly[m] = perMonth;
        } else if (y > startYear - 1) {
          const perMonth = yearCost / 12;
          for (let m = 0; m < 12; m++) monthly[m] = perMonth;
        }
      }
      const newOutflow = series.outflow.map((v, m) => v + monthly[m]);
      const newNet = series.inflow.map((v, m) => v - newOutflow[m]);
      return newNet;
    });

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
    metrics: {
      netIncome,
      cashRunwayMonths: Math.round(runwayMonths * 10) / 10,
      lowestCashMonth: trough,
    },
    costPerYear,
  };
}

function plansEqual(a: FounderCompPlan, b: FounderCompPlan): boolean {
  return (
    !!a.notPayingYet === !!b.notPayingYet &&
    (a.annualAmount ?? 0) === (b.annualAmount ?? 0) &&
    (a.startMonth ?? 1) === (b.startMonth ?? 1) &&
    (a.startYear ?? 1) === (b.startYear ?? 1)
  );
}

function describeScenario(s: SavedScenario): string {
  if (s.notPayingYet) return "Not paying yet";
  const amt = typeof s.annualAmount === "number" ? s.annualAmount : 0;
  if (amt <= 0) return "No amount set";
  const month = MONTH_LABELS_SHORT[(s.startMonth ?? 1) - 1];
  return `${formatCurrency(amt)}/yr • starts ${month} of Y${s.startYear ?? 1}`;
}

/**
 * Task #685: a focused teaching moment in the staffing step that
 *  (a) explains in plain English why paying yourself eventually matters,
 *  (b) lets the founder set when their own compensation begins,
 *  (c) shows the model side-by-side WITHOUT founder pay vs WITH founder
 *      pay, surfacing Y1 net income, runway months, and lowest cash month
 *      so the tradeoff is concrete.
 *
 * Task #693: founders can now save up to 3 named pay scenarios
 *  (e.g. "Start now at $40k" vs "Wait til Y2 at $70k") and compare them
 *  side-by-side. The active scenario writes back into the four staffing
 *  fields so the rest of the wizard, engine, and exports keep reading
 *  from a single source of truth.
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
  const savedScenarios =
    (watch("staffing.founderCompScenarios") as SavedScenario[] | undefined) ??
    [];
  const activeScenarioId = watch("staffing.activeFounderCompScenarioId") as
    | string
    | undefined;

  const currentPlan: FounderCompPlan = useMemo(
    () => ({ notPayingYet, annualAmount, startMonth, startYear }),
    [notPayingYet, annualAmount, startMonth, startYear],
  );

  // Keep the derived per-year `reportedFounderComp` in sync with the
  // friendly inputs.
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

  // Resolve the "with" plan: prefer the user's typed amount, otherwise
  // fall back to the market-rate placeholder so the card still renders.
  const withPlan: FounderCompPlan = useMemo(() => {
    if (notPayingYet) return { notPayingYet: true };
    if (plannedAnnualAmount > 0) {
      return { annualAmount: plannedAnnualAmount, startMonth, startYear };
    }
    if (fallbackAnnualAmount > 0) {
      return { annualAmount: fallbackAnnualAmount, startMonth, startYear };
    }
    return {};
  }, [
    notPayingYet,
    plannedAnnualAmount,
    fallbackAnnualAmount,
    startMonth,
    startYear,
  ]);

  const withResult = useMemo(
    () => computePlanMetrics(data, baseline, withPlan, yearCount, colaRate),
    [data, baseline, withPlan, yearCount, colaRate],
  );

  const totalWithComp = useMemo(
    () => withResult.costPerYear.reduce((s, n) => s + n, 0),
    [withResult],
  );

  const hasFounderPay = plannedAnnualAmount > 0 && !notPayingYet;
  const suggestedYears = useMemo(() => {
    if (hasFounderPay) return [] as number[];
    return getNormalizedFounderCompYears(data, yearCount);
  }, [hasFounderPay, data, yearCount]);

  // Compute metrics per saved scenario for the side-by-side comparison.
  const scenarioResults = useMemo(
    () =>
      savedScenarios.map((s) => {
        const plan: FounderCompPlan = {
          notPayingYet: s.notPayingYet,
          annualAmount: s.annualAmount,
          startMonth: s.startMonth,
          startYear: s.startYear,
        };
        const result = computePlanMetrics(
          data,
          baseline,
          plan,
          yearCount,
          colaRate,
        );
        return { scenario: s, plan, ...result };
      }),
    [savedScenarios, data, baseline, yearCount, colaRate],
  );

  const canSaveCurrent =
    savedScenarios.length < MAX_SCENARIOS &&
    (notPayingYet || (typeof annualAmount === "number" && annualAmount > 0));

  function handleSaveCurrent() {
    if (!canSaveCurrent) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `scn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const defaultName = notPayingYet
      ? "Not paying yet"
      : `${formatCurrency(annualAmount ?? 0)}/yr from ${MONTH_LABELS_SHORT[startMonth - 1]} Y${startYear}`;
    const next: SavedScenario[] = [
      ...savedScenarios,
      {
        id,
        name: defaultName.slice(0, 60),
        notPayingYet: !!notPayingYet,
        annualAmount: notPayingYet ? undefined : annualAmount,
        startMonth: notPayingYet ? undefined : startMonth,
        startYear: notPayingYet ? undefined : startYear,
      },
    ];
    setValue("staffing.founderCompScenarios", next, { shouldDirty: true });
    setValue("staffing.activeFounderCompScenarioId", id, { shouldDirty: true });
  }

  function handleUseScenario(s: SavedScenario) {
    setValue("staffing.notPayingFounderYet", !!s.notPayingYet, {
      shouldDirty: true,
    });
    if (!s.notPayingYet) {
      setValue("staffing.founderCompAnnualAmount", s.annualAmount, {
        shouldDirty: true,
      });
      if (typeof s.startMonth === "number") {
        setValue("staffing.founderCompStartMonth", s.startMonth, {
          shouldDirty: true,
        });
      }
      if (typeof s.startYear === "number") {
        setValue("staffing.founderCompStartYear", s.startYear, {
          shouldDirty: true,
        });
      }
    }
    setValue("staffing.activeFounderCompScenarioId", s.id, {
      shouldDirty: true,
    });
  }

  function handleDeleteScenario(id: string) {
    const next = savedScenarios.filter((s) => s.id !== id);
    setValue("staffing.founderCompScenarios", next, { shouldDirty: true });
    if (activeScenarioId === id) {
      setValue("staffing.activeFounderCompScenarioId", undefined, {
        shouldDirty: true,
      });
    }
  }

  function handleRenameScenario(id: string, name: string) {
    const next = savedScenarios.map((s) =>
      s.id === id ? { ...s, name: name.slice(0, 60) } : s,
    );
    setValue("staffing.founderCompScenarios", next, { shouldDirty: true });
  }

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

      {/* Side-by-side current-vs-with comparison. */}
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
          metrics={withResult.metrics}
          founderPay={
            hasFounderPay
              ? totalWithComp
              : suggestedYears.reduce((s, n) => s + n, 0)
          }
          yearCount={yearCount}
          testId="founder-comp-with"
        />
      </div>

      {/* Saved pay scenarios — Task #693. */}
      <div
        className="mt-5 rounded-xl border border-amber-200/70 bg-white/80 p-3 sm:p-4"
        data-testid="founder-comp-scenarios"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h4 className="font-display text-sm font-bold text-amber-900 flex items-center gap-1.5">
              <Bookmark className="h-3.5 w-3.5 text-amber-700" />
              Saved pay scenarios
            </h4>
            <p className="text-[12px] text-amber-900/75 leading-snug mt-0.5">
              Save up to {MAX_SCENARIOS} options (e.g. "Start now at $40k" vs
              "Wait til Y2 at $70k") and compare them side-by-side. The
              scenario you pick flows into the rest of the wizard and your
              exports.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveCurrent}
            disabled={!canSaveCurrent}
            data-testid="founder-comp-save-scenario"
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
              canSaveCurrent
                ? "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200"
                : "border-amber-200/60 bg-amber-50/60 text-amber-900/50 cursor-not-allowed",
            )}
          >
            Save current as scenario
          </button>
        </div>

        {savedScenarios.length === 0 ? (
          <div
            data-testid="founder-comp-scenarios-empty"
            className="text-[12px] text-amber-900/70 italic mt-2"
          >
            No saved scenarios yet. Set an amount above and click "Save current
            as scenario" to start comparing options.
          </div>
        ) : (
          <div
            className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            data-testid="founder-comp-scenario-list"
          >
            {scenarioResults.map(({ scenario, plan, metrics, costPerYear }) => {
              const isActive =
                activeScenarioId === scenario.id ||
                (!activeScenarioId && plansEqual(plan, currentPlan));
              const total = costPerYear.reduce((s, n) => s + n, 0);
              return (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  metrics={metrics}
                  founderPay={total}
                  yearCount={yearCount}
                  isActive={isActive}
                  onUse={() => handleUseScenario(scenario)}
                  onDelete={() => handleDeleteScenario(scenario.id)}
                  onRename={(name) => handleRenameScenario(scenario.id, name)}
                />
              );
            })}
          </div>
        )}
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

interface ScenarioCardProps {
  scenario: SavedScenario;
  metrics: ComparisonMetrics | null;
  founderPay: number;
  yearCount: number;
  isActive: boolean;
  onUse: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}

function ScenarioCard({
  scenario,
  metrics,
  founderPay,
  yearCount,
  isActive,
  onUse,
  onDelete,
  onRename,
}: ScenarioCardProps) {
  const y1Net = metrics?.netIncome[0] ?? 0;
  const lowest = metrics?.lowestCashMonth ?? null;
  const runway = metrics?.cashRunwayMonths ?? 0;
  const NetIcon = y1Net >= 0 ? TrendingUp : TrendingDown;
  const netColor = y1Net >= 0 ? "text-emerald-700" : "text-rose-700";
  const testId = `founder-comp-scenario-${scenario.id}`;

  return (
    <div
      data-testid={testId}
      className={cn(
        "rounded-lg border p-3 flex flex-col gap-2",
        isActive
          ? "border-amber-400 bg-amber-100/50 ring-1 ring-amber-300"
          : "border-amber-200/70 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <input
          type="text"
          value={scenario.name}
          onChange={(e) => onRename(e.target.value)}
          data-testid={`${testId}-name`}
          aria-label="Scenario name"
          className="flex-1 min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-semibold text-amber-950 outline-none hover:border-amber-200 focus:border-amber-300 focus:bg-white"
        />
        {isActive && (
          <span
            data-testid={`${testId}-active-badge`}
            className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900"
          >
            <Check className="h-2.5 w-2.5" />
            Active
          </span>
        )}
      </div>

      <div className="text-[11.5px] text-amber-900/75 leading-snug">
        {describeScenario(scenario)}
      </div>

      {!metrics ? (
        <div
          data-testid={`${testId}-empty`}
          className="text-[11.5px] text-amber-900/70 italic"
        >
          No founder pay in this scenario.
        </div>
      ) : (
        <div className="space-y-1 text-[12px]">
          <Stat
            label="Y1 net income"
            valueEl={
              <span className={cn("inline-flex items-center gap-1", netColor)}>
                <NetIcon className="h-3 w-3" />
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
                  <span className="font-normal text-[10.5px] text-amber-900/70">
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
            label="Total founder pay"
            valueEl={
              <span className="tabular-nums font-semibold text-amber-950">
                {formatCurrency(Math.round(founderPay))}
              </span>
            }
            testId={`${testId}-founder-pay-total`}
          />
        </div>
      )}

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onUse}
          disabled={isActive}
          data-testid={`${testId}-use`}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-[12px] font-semibold transition-colors",
            isActive
              ? "bg-amber-200/60 text-amber-900/70 cursor-default"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          {isActive ? "In use" : "Use this scenario"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${scenario.name}`}
          data-testid={`${testId}-delete`}
          className="rounded-md border border-amber-200 bg-white p-1.5 text-amber-900/70 hover:bg-amber-50 hover:text-rose-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
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
