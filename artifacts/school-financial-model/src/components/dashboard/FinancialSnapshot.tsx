import { useMemo, useState } from "react";
import { useGetModel } from "@workspace/api-client-react";
import { DollarSign, TrendingUp, Shield, Wallet, Loader2, AlertTriangle } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { computeMetrics } from "@/lib/coaching/diagnostics-engine";
import {
  computeAnnualDebt,
  computeYear1MonthlyCashFlow,
  findLowestCashMonth,
  type MonthlyRevenueRowLike,
} from "@workspace/finance";
import { formatCurrency } from "@/lib/utils";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { WhyThisNumber } from "@/components/coaching/WhyThisNumber";
import { LENDER_LABELS } from "@/lib/coaching/lender-labels";
import { useLenderLanguage } from "@/lib/coaching/use-lender-language";
import type { HeadlineMetricKey } from "@workspace/finance";
import type { FullModelData } from "@/pages/model-wizard/schema";

interface FinancialSnapshotProps {
  /** ID of the model to summarize. Caller picks the most recently updated
   *  model that has revenue rows so the block has something meaningful to
   *  display. */
  modelId: number;
  modelName: string;
}

interface CapitalAndDebtRow {
  enabled?: boolean;
  isLoan?: boolean;
  loanPrincipal?: number;
  loanRate?: number;
  loanTermYears?: number;
}

function computeY1LoanDebtService(data: FullModelData): number {
  const rows = (data.capitalAndDebtRows || []) as CapitalAndDebtRow[];
  let total = 0;
  for (const row of rows) {
    if (!row.enabled) continue;
    if (
      row.isLoan &&
      row.loanPrincipal &&
      row.loanRate !== undefined &&
      row.loanTermYears
    ) {
      total += computeAnnualDebt(
        row.loanPrincipal,
        (row.loanRate || 0) / 100,
        row.loanTermYears,
      );
    }
  }
  return total;
}

interface KpiTileProps {
  labelId: string;
  defaultLabel: string;
  enabled: boolean;
  value: string;
  caption?: string;
  icon: React.ReactNode;
  tone: "green" | "rose" | "blue" | "amber";
  testIdSuffix: string;
  metricKey?: HeadlineMetricKey;
  modelData?: FullModelData | null;
}

function KpiTile({
  labelId,
  defaultLabel,
  enabled,
  value,
  caption,
  icon,
  tone,
  testIdSuffix,
  metricKey,
  modelData,
}: KpiTileProps) {
  const entry = LENDER_LABELS[labelId];
  const isLender = enabled && !!entry;
  const label = isLender ? entry!.lender : defaultLabel;
  const glossaryKey = isLender ? entry!.glossaryKey : null;

  const toneClasses: Record<KpiTileProps["tone"], string> = {
    green: "bg-green-100 text-green-700",
    rose: "bg-rose-100 text-rose-600",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  };

  return (
    <div
      data-testid={`dashboard-kpi-${testIdSuffix}`}
      className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${toneClasses[tone]}`}
        >
          {icon}
        </div>
      </div>
      <p
        data-testid={`dashboard-kpi-label-${testIdSuffix}`}
        className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
      >
        {glossaryKey ? (
          <GlossaryTerm termKey={glossaryKey}>{label}</GlossaryTerm>
        ) : (
          label
        )}
      </p>
      <p className="font-display font-bold text-xl text-foreground mt-1">
        {value}
      </p>
      {caption && (
        <p className="text-[11px] text-muted-foreground mt-1">{caption}</p>
      )}
      {metricKey && modelData && (
        <div className="mt-2">
          <WhyThisNumber
            metricKey={metricKey}
            data={modelData}
            testIdSuffix={testIdSuffix}
          />
        </div>
      )}
    </div>
  );
}

const YEAR_OPTIONS: Array<{ value: 0 | 1 | 2 | 3 | 4; label: string }> = [
  { value: 0, label: "Year 1" },
  { value: 1, label: "Year 2" },
  { value: 2, label: "Year 3" },
  { value: 3, label: "Year 4" },
  { value: 4, label: "Year 5" },
];

export function FinancialSnapshot({ modelId, modelName }: FinancialSnapshotProps) {
  const { enabled, toggle } = useLenderLanguage();
  const { data: model, isLoading } = useGetModel(modelId, {
    query: { queryKey: [`/api/models/${modelId}`, "snapshot"] },
  });
  const [selectedYear, setSelectedYear] = useState<0 | 1 | 2 | 3 | 4>(0);

  const metrics = useMemo(() => {
    if (!model?.data) return null;
    try {
      const data = model.data as unknown as FullModelData;
      const m = computeMetrics(data);
      const loanDebtService = computeY1LoanDebtService(data);
      const operatingSurplus = m.y1NetIncome + loanDebtService;
      const dscr =
        loanDebtService > 0 ? operatingSurplus / loanDebtService : null;
      const startingCash = data.openingBalances?.cash ?? 0;
      const monthlyExpense = m.y1TotalExpenses / 12;
      const reserveMonths =
        monthlyExpense > 0
          ? Math.max(0, startingCash + m.y1NetIncome) / monthlyExpense
          : 0;
      // Task #609 / #648 — surface the lowest cash month so founders see when
      // tuition gaps and payroll obligations actually trough their cash, for
      // any of years 1-5.
      const sp = data.schoolProfile ?? {};
      const opMonths = Math.max(
        1,
        Math.min((sp as { operatingMonthsPerYear?: number }).operatingMonthsPerYear ?? 12, 12),
      );
      const fyStart = (sp as { fiscalYearStartMonth?: number }).fiscalYearStartMonth ?? 7;
      const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const revenueRows = (data.revenueRows ?? []) as unknown as MonthlyRevenueRowLike[];
      const yearOpeningCash = (y: number) =>
        y === 0 ? startingCash : m.endingCashByYear[y - 1] ?? startingCash;
      const buildYear = (y: 0 | 1 | 2 | 3 | 4) => {
        const annualOpex = Math.max(0, m.opexByYear[y] ?? 0);
        const annualPersonnel = Math.max(0, m.staffingByYear[y] ?? 0);
        const annualDebt = Math.max(0, m.capDebtByYear[y] ?? 0);
        const series = computeYear1MonthlyCashFlow({
          revenueRows,
          yearIndex: y,
          students: m.enrollment?.[y] ?? 0,
          annualPersonnel,
          annualOpex,
          annualDebt,
          openingCash: yearOpeningCash(y),
          opMonths,
        });
        const lowestCashMonth = findLowestCashMonth(series.cumulative, fyStart);
        const chartData = series.inflow.map((inflow, i) => {
          const calIdx = ((fyStart - 1 + i) % 12 + 12) % 12;
          return {
            month: monthLabels[calIdx],
            inflow,
            outflow: -series.outflow[i],
            net: series.net[i],
            ending: series.cumulative[i],
            isLow: lowestCashMonth?.monthIndex === i,
          };
        });
        return { lowestCashMonth, chartData };
      };
      const byYear = [0, 1, 2, 3, 4].map((y) => buildYear(y as 0 | 1 | 2 | 3 | 4));
      return {
        operatingSurplus,
        netIncome: m.y1NetIncome,
        dscr,
        reserveMonths,
        loanDebtService,
        revenue: m.y1Revenue,
        hasNumbers: m.y1Revenue > 0 || m.y1TotalExpenses > 0,
        byYear,
        revenueByYear: m.revenueByYear,
        expensesByYear: m.expensesByYear,
      };
    } catch {
      return null;
    }
  }, [model]);

  const yearMetrics = metrics?.byYear[selectedYear] ?? null;
  const lowestCashMonth = yearMetrics?.lowestCashMonth ?? null;
  const chartData = yearMetrics?.chartData ?? null;
  const yearLabel = YEAR_OPTIONS[selectedYear].label;
  const hasYearNumbers = !!(
    metrics &&
    ((metrics.revenueByYear[selectedYear] ?? 0) > 0 ||
      (metrics.expensesByYear[selectedYear] ?? 0) > 0)
  );

  return (
    <div
      data-testid="dashboard-financial-snapshot"
      className="bg-white border border-border/60 rounded-2xl p-5 sm:p-6 shadow-sm mb-8"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            Financial snapshot
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            From <span className="font-medium text-foreground">{modelName}</span>
            {" "}- the last model you touched.
          </p>
        </div>
        <label
          data-testid="lender-language-toggle-label"
          className="inline-flex items-center gap-2.5 cursor-pointer select-none rounded-xl border border-border/60 px-3 py-2 hover:bg-secondary/40 transition-colors"
          aria-label="Toggle lender language for KPI labels"
        >
          <span className="text-xs font-semibold text-foreground/80">
            Lender language
          </span>
          <button
            type="button"
            role="switch"
            data-testid="lender-language-toggle"
            aria-checked={enabled}
            onClick={toggle}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
              enabled ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-4 w-4 translate-y-0.5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading your latest numbers...
        </div>
      ) : (
        <>
          {lowestCashMonth && hasYearNumbers && (
            <div
              data-testid="dashboard-lowest-cash-callout"
              className={`flex items-start gap-3 mb-4 rounded-xl border p-3 ${
                lowestCashMonth.isNegative
                  ? "border-rose-200 bg-rose-50 text-rose-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold">
                  Lowest cash month ({yearLabel}): {lowestCashMonth.monthLabel}
                </span>
                <span className="ml-1">
                  ({formatCurrency(lowestCashMonth.amount)})
                </span>
                <p className="text-xs opacity-80 mt-0.5">
                  {lowestCashMonth.isNegative
                    ? "Cash dips below zero — plan a reserve or line of credit before this month."
                    : "This is the month lenders focus on. Plan reserves to cover the trough."}
                </p>
              </div>
            </div>
          )}
          {chartData && hasYearNumbers && (
            <div
              data-testid="dashboard-monthly-cashflow-chart"
              className="mb-4 rounded-xl border border-border/60 bg-secondary/20 p-3 sm:p-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-2">
                <h3 className="font-display text-sm font-semibold text-foreground">
                  {yearLabel} monthly cash flow
                </h3>
                <div
                  role="tablist"
                  aria-label="Choose forecast year"
                  data-testid="dashboard-cashflow-year-selector"
                  className="flex flex-wrap gap-1 rounded-lg bg-secondary/50 p-1 self-start sm:self-auto"
                >
                  {YEAR_OPTIONS.map((opt) => {
                    const active = opt.value === selectedYear;
                    const yearHasNumbers =
                      (metrics?.revenueByYear[opt.value] ?? 0) > 0 ||
                      (metrics?.expensesByYear[opt.value] ?? 0) > 0;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        disabled={!yearHasNumbers}
                        data-testid={`dashboard-cashflow-year-${opt.value + 1}`}
                        onClick={() => setSelectedYear(opt.value)}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                          active
                            ? "bg-white text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        } ${!yearHasNumbers ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Bars: inflow vs outflow. Line: ending cash.
                {lowestCashMonth && (
                  <>
                    {" "}Lowest month{" "}
                    <span className="font-semibold text-foreground">
                      {lowestCashMonth.monthLabel}
                    </span>{" "}
                    highlighted.
                  </>
                )}
              </p>
              <div className="h-56 sm:h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="#e5e7eb"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      tickFormatter={(v: number) =>
                        Math.abs(v) >= 1000
                          ? `${(v / 1000).toFixed(0)}k`
                          : `${v}`
                      }
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === "Outflow"
                          ? formatCurrency(Math.abs(value))
                          : formatCurrency(value),
                        name,
                      ]}
                      labelFormatter={(label) => `Month: ${label}`}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      iconSize={10}
                    />
                    <Bar
                      dataKey="inflow"
                      name="Inflow"
                      fill="#16a34a"
                      radius={[3, 3, 0, 0]}
                    >
                      {chartData.map((d, i) => (
                        <Cell
                          key={`in-${i}`}
                          fill={d.isLow ? "#0f5132" : "#16a34a"}
                        />
                      ))}
                    </Bar>
                    <Bar
                      dataKey="outflow"
                      name="Outflow"
                      fill="#e11d48"
                      radius={[0, 0, 3, 3]}
                    >
                      {chartData.map((d, i) => (
                        <Cell
                          key={`out-${i}`}
                          fill={d.isLow ? "#881337" : "#e11d48"}
                        />
                      ))}
                    </Bar>
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Net"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="ending"
                      name="Ending cash"
                      stroke="#d97706"
                      strokeWidth={2}
                      dot={(props: {
                        cx?: number;
                        cy?: number;
                        index?: number;
                        payload?: { isLow?: boolean };
                      }) => {
                        const { cx, cy, index, payload } = props;
                        const isLow = payload?.isLow;
                        return (
                          <circle
                            key={`end-dot-${index}`}
                            cx={cx}
                            cy={cy}
                            r={isLow ? 5 : 2.5}
                            fill={isLow ? "#b45309" : "#d97706"}
                            stroke={isLow ? "#fff" : "none"}
                            strokeWidth={isLow ? 2 : 0}
                          />
                        );
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile
              labelId="operatingSurplus"
              defaultLabel="Operating Surplus"
              enabled={enabled}
              value={
                metrics ? formatCurrency(metrics.operatingSurplus) : "-"
              }
              icon={<TrendingUp className="w-4 h-4" />}
              tone="green"
              testIdSuffix="operating-surplus"
              metricKey="y1_operating_surplus"
              modelData={(model?.data as unknown as FullModelData) ?? null}
            />
            <KpiTile
              labelId="netIncome"
              defaultLabel="Net Income"
              enabled={enabled}
              value={metrics ? formatCurrency(metrics.netIncome) : "-"}
              icon={<DollarSign className="w-4 h-4" />}
              tone={metrics && metrics.netIncome < 0 ? "rose" : "green"}
              testIdSuffix="net-income"
              metricKey="y1_net_income"
              modelData={(model?.data as unknown as FullModelData) ?? null}
            />
            <KpiTile
              labelId="coverageRatio"
              defaultLabel="Coverage Ratio"
              enabled={enabled}
              value={
                !metrics || metrics.dscr === null
                  ? "-"
                  : `${metrics.dscr.toFixed(2)}x`
              }
              caption={
                metrics && metrics.dscr === null ? "No loan modeled" : undefined
              }
              icon={<Shield className="w-4 h-4" />}
              tone="blue"
              testIdSuffix="coverage-ratio"
              metricKey="y1_dscr"
              modelData={(model?.data as unknown as FullModelData) ?? null}
            />
            <KpiTile
              labelId="cashReserve"
              defaultLabel="Cash Reserve"
              enabled={enabled}
              value={metrics ? `${metrics.reserveMonths.toFixed(1)} mo` : "-"}
              icon={<Wallet className="w-4 h-4" />}
              tone="amber"
              testIdSuffix="cash-reserve"
              metricKey="y1_reserve_months"
              modelData={(model?.data as unknown as FullModelData) ?? null}
            />
          </div>
          {metrics && !metrics.hasNumbers && (
            <p className="text-xs text-muted-foreground mt-3 italic">
              Add revenue and expenses to your model to see live numbers here.
            </p>
          )}
        </>
      )}
    </div>
  );
}
