import { TrendingUp, AlertTriangle, CircleCheckBig } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionImpact } from "@/lib/decision-flows";

interface ImpactSummaryProps {
  impact: DecisionImpact;
}

function fmtMoney(v: number): string {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${v < 0 ? "-" : ""}$${(abs / 1000).toFixed(1)}k`;
  return `${v < 0 ? "-" : ""}$${Math.round(abs).toLocaleString()}`;
}

function fmtMoneyDelta(v: number): string {
  if (v === 0) return "$0";
  const sign = v > 0 ? "+" : "";
  return sign + fmtMoney(v);
}

function SignalIcon({ signal }: { signal: "green" | "amber" | "red" }) {
  if (signal === "green") return <CircleCheckBig className="h-4 w-4 text-emerald-600" />;
  if (signal === "amber") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <AlertTriangle className="h-4 w-4 text-rose-600" />;
}

export function ImpactSummary({ impact }: ImpactSummaryProps) {
  const { base, adjusted, deltas, nudges } = impact;
  return (
    <div className="space-y-5" data-testid="decision-impact-summary">
      {/* Headline tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border/60 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Y5 net income Δ</p>
          <p className={cn(
            "text-2xl font-bold font-mono mt-1",
            deltas.netIncome[4] > 0 ? "text-emerald-700" : deltas.netIncome[4] < 0 ? "text-rose-700" : "text-foreground",
          )}
            data-testid="impact-y5-net-delta"
          >
            {fmtMoneyDelta(deltas.netIncome[4])}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            base {fmtMoney(base.netIncome[4])} → after {fmtMoney(adjusted.netIncome[4])}
          </p>
        </div>
        <div className="bg-card border border-border/60 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Y5 revenue Δ</p>
          <p className={cn(
            "text-2xl font-bold font-mono mt-1",
            deltas.revenue[4] > 0 ? "text-emerald-700" : deltas.revenue[4] < 0 ? "text-rose-700" : "text-foreground",
          )}>
            {fmtMoneyDelta(deltas.revenue[4])}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            base {fmtMoney(base.revenue[4])} → after {fmtMoney(adjusted.revenue[4])}
          </p>
        </div>
        <div className="bg-card border border-border/60 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Break-even</p>
          <p className="text-2xl font-bold font-mono mt-1">
            {deltas.breakEvenYearShift === null
              ? "—"
              : deltas.breakEvenYearShift === 0
              ? "Same"
              : deltas.breakEvenYearShift > 0
              ? `+${deltas.breakEvenYearShift}y`
              : `${deltas.breakEvenYearShift}y`}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            base Y{base.breakEvenYear ?? "—"} → after Y{adjusted.breakEvenYear ?? "—"}
          </p>
        </div>
        <div className="bg-card border border-border/60 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cash runway Δ</p>
          <p className={cn(
            "text-2xl font-bold font-mono mt-1",
            deltas.cashRunwayDeltaMonths > 0 ? "text-emerald-700" : deltas.cashRunwayDeltaMonths < 0 ? "text-rose-700" : "text-foreground",
          )}>
            {deltas.cashRunwayDeltaMonths === 0
              ? "0 mo"
              : deltas.cashRunwayDeltaMonths > 0
              ? `+${deltas.cashRunwayDeltaMonths.toFixed(1)} mo`
              : `${deltas.cashRunwayDeltaMonths.toFixed(1)} mo`}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            base {base.cashRunwayMonths >= 60 ? "60+ mo" : `${base.cashRunwayMonths.toFixed(0)} mo`}
          </p>
        </div>
      </div>

      {/* Per-year table */}
      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-amber-700" />
          <h3 className="font-display font-semibold text-sm">5-year impact</h3>
        </div>
        <table className="w-full text-xs" data-testid="impact-year-table">
          <thead className="bg-slate-50">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Metric</th>
              {[1, 2, 3, 4, 5].map((y) => (
                <th key={y} className="px-2 py-2 font-medium text-right">Year {y}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 font-sans text-muted-foreground">Net income Δ</td>
              {deltas.netIncome.map((d, i) => (
                <td key={i} className={cn(
                  "px-2 py-2 text-right",
                  d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-muted-foreground",
                )}>{fmtMoneyDelta(d)}</td>
              ))}
            </tr>
            <tr className="border-t border-border/60 bg-slate-50/40">
              <td className="px-3 py-2 font-sans text-muted-foreground">Revenue Δ</td>
              {deltas.revenue.map((d, i) => (
                <td key={i} className={cn(
                  "px-2 py-2 text-right",
                  d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-muted-foreground",
                )}>{fmtMoneyDelta(d)}</td>
              ))}
            </tr>
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 font-sans text-muted-foreground">DSCR after</td>
              {adjusted.dscr.map((v, i) => {
                const baseV = base.dscr[i];
                const better = isFinite(v) && isFinite(baseV) && v > baseV;
                const worse = isFinite(v) && isFinite(baseV) && v < baseV;
                return (
                  <td key={i} className={cn(
                    "px-2 py-2 text-right",
                    better && "text-emerald-700",
                    worse && "text-rose-700",
                  )}>
                    {isFinite(v) ? v.toFixed(2) : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Nudges */}
      {nudges.length > 0 && (
        <div className="space-y-2" data-testid="impact-nudges">
          {nudges.map((n, i) => (
            <div key={i} className={cn(
              "flex items-start gap-2.5 rounded-xl border p-3",
              n.signal === "green" ? "bg-emerald-50 border-emerald-200" :
              n.signal === "amber" ? "bg-amber-50 border-amber-200" :
              "bg-rose-50 border-rose-200",
            )}>
              <SignalIcon signal={n.signal} />
              <div className="text-sm">
                <p className="font-semibold text-foreground">{n.label}</p>
                <p className="text-foreground/80 text-xs mt-0.5">{n.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
