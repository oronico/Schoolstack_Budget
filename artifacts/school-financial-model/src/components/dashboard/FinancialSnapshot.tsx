import { useMemo } from "react";
import { useGetModel } from "@workspace/api-client-react";
import { DollarSign, TrendingUp, Shield, Wallet, Loader2 } from "lucide-react";
import { computeMetrics } from "@/lib/coaching/diagnostics-engine";
import { computeAnnualDebt } from "@workspace/finance";
import { formatCurrency } from "@/lib/utils";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { LENDER_LABELS } from "@/lib/coaching/lender-labels";
import { useLenderLanguage } from "@/lib/coaching/use-lender-language";
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
      return {
        operatingSurplus,
        netIncome: m.y1NetIncome,
        dscr,
        reserveMonths,
        loanDebtService,
        revenue: m.y1Revenue,
        hasNumbers: m.y1Revenue > 0 || m.y1TotalExpenses > 0,
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
            />
            <KpiTile
              labelId="netIncome"
              defaultLabel="Net Income"
              enabled={enabled}
              value={metrics ? formatCurrency(metrics.netIncome) : "-"}
              icon={<DollarSign className="w-4 h-4" />}
              tone={metrics && metrics.netIncome < 0 ? "rose" : "green"}
              testIdSuffix="net-income"
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
            />
            <KpiTile
              labelId="cashReserve"
              defaultLabel="Cash Reserve"
              enabled={enabled}
              value={metrics ? `${metrics.reserveMonths.toFixed(1)} mo` : "-"}
              icon={<Wallet className="w-4 h-4" />}
              tone="amber"
              testIdSuffix="cash-reserve"
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
