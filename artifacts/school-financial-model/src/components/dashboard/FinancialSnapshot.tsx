import { useMemo } from "react";
import { useGetModel } from "@workspace/api-client-react";
import { DollarSign, TrendingUp, Shield, Wallet, Loader2, AlertTriangle } from "lucide-react";
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

export function FinancialSnapshot({ modelId, modelName }: FinancialSnapshotProps) {
  const { enabled, toggle } = useLenderLanguage();
  const { data: model, isLoading } = useGetModel(modelId, {
    query: { queryKey: [`/api/models/${modelId}`, "snapshot"] },
  });

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
      // Task #609 — surface the lowest cash month so founders see when
      // tuition gaps and payroll obligations actually trough their cash.
      const sp = data.schoolProfile ?? {};
      const opMonths = Math.max(
        1,
        Math.min((sp as { operatingMonthsPerYear?: number }).operatingMonthsPerYear ?? 12, 12),
      );
      const fyStart = (sp as { fiscalYearStartMonth?: number }).fiscalYearStartMonth ?? 7;
      const annualOpex = Math.max(
        0,
        m.y1TotalExpenses - m.y1StaffingCost - loanDebtService,
      );
      const series = computeYear1MonthlyCashFlow({
        revenueRows: (data.revenueRows ?? []) as unknown as MonthlyRevenueRowLike[],
        yearIndex: 0,
        students: m.enrollment?.[0] ?? 0,
        annualPersonnel: m.y1StaffingCost,
        annualOpex,
        annualDebt: loanDebtService,
        openingCash: startingCash,
        opMonths,
      });
      const lowestCashMonth = findLowestCashMonth(series.cumulative, fyStart);
      return {
        operatingSurplus,
        netIncome: m.y1NetIncome,
        dscr,
        reserveMonths,
        loanDebtService,
        revenue: m.y1Revenue,
        hasNumbers: m.y1Revenue > 0 || m.y1TotalExpenses > 0,
        lowestCashMonth,
      };
    } catch {
      return null;
    }
  }, [model]);

  return (
    <div
      data-testid="dashboard-financial-snapshot"
      className="bg-white border border-border/60 rounded-2xl p-5 sm:p-6 shadow-sm mb-8"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            Year 1 financial snapshot
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
          {metrics?.lowestCashMonth && (
            <div
              data-testid="dashboard-lowest-cash-callout"
              className={`flex items-start gap-3 mb-4 rounded-xl border p-3 ${
                metrics.lowestCashMonth.isNegative
                  ? "border-rose-200 bg-rose-50 text-rose-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold">
                  Lowest cash month: {metrics.lowestCashMonth.monthLabel}
                </span>
                <span className="ml-1">
                  ({formatCurrency(metrics.lowestCashMonth.amount)})
                </span>
                <p className="text-xs opacity-80 mt-0.5">
                  {metrics.lowestCashMonth.isNegative
                    ? "Cash dips below zero — plan a reserve or line of credit before this month."
                    : "This is the month lenders focus on. Plan reserves to cover the trough."}
                </p>
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
