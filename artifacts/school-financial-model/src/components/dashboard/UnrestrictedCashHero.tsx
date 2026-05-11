import { useMemo, useState } from "react";
import { useGetModel } from "@workspace/api-client-react";
import { Loader2, Wallet, ChevronDown, ChevronUp } from "lucide-react";
import { computeBaseFinancials } from "@workspace/finance";
import { formatCurrency } from "@/lib/utils";
import type { FullModelData } from "@/pages/model-wizard/schema";

interface UnrestrictedCashHeroProps {
  /** ID of the model whose Y5 unrestricted cash position should be surfaced. */
  modelId: number;
  modelName: string;
}

/**
 * Task #646 — dashboard hero card for the cash-reality engine (Task #610).
 *
 * Founders open the dashboard and immediately see year-end **unrestricted**
 * cash — the figure DSCR + runway are computed off, with restricted gifts
 * carved out so the headline isn't propped up by money the school can't
 * legally spend on operations or debt service. A one-click "vs accrual"
 * reveal exposes the legacy all-in cash number and the restricted delta so
 * the founder can reconcile against their P&L when needed.
 *
 * The numbers come from `computeBaseFinancials` (the same engine the
 * scenario planner + lender packet build off), so the headline is in
 * lock-step with what the lender sees in `buildCashRunway.accrualToggle`.
 */
export function UnrestrictedCashHero({ modelId, modelName }: UnrestrictedCashHeroProps) {
  const { data: model, isLoading } = useGetModel(modelId, {
    query: { queryKey: [`/api/models/${modelId}`, "unrestricted-cash-hero"] },
  });
  const [showAccrual, setShowAccrual] = useState(false);

  const view = useMemo(() => {
    if (!model?.data) return null;
    try {
      const data = model.data as unknown as FullModelData;
      const m = computeBaseFinancials(data);
      // Use the last year that has any modeled revenue/expenses as the
      // headline year — most schools model 5 years, but new-school plans
      // may model fewer. Falls back to Y5 (index 4) when every year has
      // numbers.
      let lastIdx = -1;
      for (let y = 0; y < 5; y++) {
        if ((m.revenue[y] ?? 0) > 0 || (m.totalExpenses[y] ?? 0) > 0) lastIdx = y;
      }
      if (lastIdx < 0) return null;
      return {
        yearLabel: `Year ${lastIdx + 1}`,
        unrestricted: m.unrestrictedCash[lastIdx] ?? 0,
        accrual: m.cashPosition[lastIdx] ?? 0,
        restricted: m.restrictedCash[lastIdx] ?? 0,
        runwayMonths: m.unrestrictedCashRunwayMonths,
      };
    } catch {
      return null;
    }
  }, [model]);

  if (isLoading) {
    return (
      <div
        data-testid="dashboard-unrestricted-cash-hero"
        className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 border border-emerald-200/70 rounded-2xl p-5 sm:p-6 shadow-sm mb-6"
      >
        <div className="flex items-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading your latest cash position...
        </div>
      </div>
    );
  }
  if (!view) return null;

  const restrictedPositive = view.restricted > 0;
  const runwayLabel =
    view.runwayMonths >= 60 ? "60+ months" : `${view.runwayMonths.toFixed(1)} months`;

  return (
    <div
      data-testid="dashboard-unrestricted-cash-hero"
      className="bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 border border-emerald-200/70 rounded-2xl p-5 sm:p-6 shadow-sm mb-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Unrestricted cash · {view.yearLabel} year-end
            </p>
            <p
              data-testid="unrestricted-cash-headline"
              className="font-display text-3xl sm:text-4xl font-bold text-foreground mt-1 tabular-nums"
            >
              {formatCurrency(view.unrestricted)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              From <span className="font-medium text-foreground">{modelName}</span> · runway{" "}
              <span
                data-testid="unrestricted-cash-runway"
                className="font-semibold text-foreground"
              >
                {runwayLabel}
              </span>
              {restrictedPositive
                ? " — restricted gifts carved out so DSCR + runway aren't propped up by money you can't spend on operations."
                : " — no restricted gifts modeled, so accrual and unrestricted cash agree."}
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="unrestricted-cash-toggle"
          aria-expanded={showAccrual}
          onClick={() => setShowAccrual((v) => !v)}
          className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 rounded-full px-3 py-1.5 hover:bg-emerald-50 transition-colors"
        >
          {showAccrual ? "Hide vs accrual" : "vs accrual"}
          {showAccrual ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
      {showAccrual && (
        <div
          data-testid="unrestricted-cash-accrual-detail"
          className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-emerald-200/70"
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Accrual cash ({view.yearLabel})
            </p>
            <p
              data-testid="accrual-cash-value"
              className="font-display text-lg font-bold text-foreground tabular-nums mt-0.5"
            >
              {formatCurrency(view.accrual)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              The all-in cash position before restricted gifts are carved out.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Restricted delta
            </p>
            <p
              data-testid="restricted-delta-value"
              className={`font-display text-lg font-bold tabular-nums mt-0.5 ${
                restrictedPositive ? "text-amber-700" : "text-foreground"
              }`}
            >
              {restrictedPositive
                ? `−${formatCurrency(view.restricted)}`
                : formatCurrency(0)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {restrictedPositive
                ? "Capital / program / scholarship gifts that can't fund operations or debt service."
                : "No restricted philanthropy modeled."}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Unrestricted runway
            </p>
            <p className="font-display text-lg font-bold text-foreground tabular-nums mt-0.5">
              {runwayLabel}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Months of operating cover after stripping restricted inflows out of every year.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
