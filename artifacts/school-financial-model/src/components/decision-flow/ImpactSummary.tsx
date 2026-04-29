import { TrendingUp, AlertTriangle, CircleCheckBig, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionImpact } from "@/lib/decision-flows";

interface ImpactSummaryProps {
  impact: DecisionImpact;
  /**
   * When provided, ImpactSummary renders a 2-up comparison view that puts two
   * decision impacts in adjacent columns. The "primary" side is `impact`, the
   * "compare" side is `compareWith`. Better headline values get a winner badge.
   */
  compareWith?: DecisionImpact;
  primaryLabel?: string;
  compareLabel?: string;
  primaryNarrative?: string;
  compareNarrative?: string;
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

function fmtBreakEven(shift: number | null): string {
  if (shift === null) return "—";
  if (shift === 0) return "Same";
  if (shift > 0) return `+${shift}y`;
  return `${shift}y`;
}

function fmtRunway(months: number): string {
  if (months === 0) return "0 mo";
  const sign = months > 0 ? "+" : "";
  return `${sign}${months.toFixed(1)} mo`;
}

function SignalIcon({ signal }: { signal: "green" | "amber" | "red" }) {
  if (signal === "green") return <CircleCheckBig className="h-4 w-4 text-emerald-600" />;
  if (signal === "amber") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <AlertTriangle className="h-4 w-4 text-rose-600" />;
}

export function ImpactSummary(props: ImpactSummaryProps) {
  if (props.compareWith) {
    return (
      <ImpactComparison
        primary={props.impact}
        compare={props.compareWith}
        primaryLabel={props.primaryLabel ?? "Decision A"}
        compareLabel={props.compareLabel ?? "Decision B"}
        primaryNarrative={props.primaryNarrative}
        compareNarrative={props.compareNarrative}
      />
    );
  }
  return <ImpactSingle impact={props.impact} />;
}

function ImpactSingle({ impact }: { impact: DecisionImpact }) {
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
            {fmtBreakEven(deltas.breakEvenYearShift)}
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
            {fmtRunway(deltas.cashRunwayDeltaMonths)}
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

// ---------------- 2-up comparison view ----------------

interface HeadlineMetric {
  label: string;
  // Larger is better when true; smaller is better when false; null means
  // there's no winner concept (e.g. break-even shift, which we still color).
  higherIsBetter: boolean | null;
  // Raw values used to determine the winner.
  primaryRaw: number | null;
  compareRaw: number | null;
  // Display strings for each side.
  primaryDisplay: string;
  compareDisplay: string;
  // Subtext lines (e.g. "base $X → after $Y"). Optional.
  primarySub?: string;
  compareSub?: string;
}

function renderHeadlineCell(
  m: HeadlineMetric,
  side: "primary" | "compare",
  testIdPrefix: string,
) {
  const value = side === "primary" ? m.primaryRaw : m.compareRaw;
  const other = side === "primary" ? m.compareRaw : m.primaryRaw;
  const display = side === "primary" ? m.primaryDisplay : m.compareDisplay;
  const sub = side === "primary" ? m.primarySub : m.compareSub;
  let isWinner = false;
  let isLoser = false;
  if (
    m.higherIsBetter !== null &&
    value !== null &&
    other !== null &&
    isFinite(value) &&
    isFinite(other) &&
    value !== other
  ) {
    if (m.higherIsBetter) {
      isWinner = value > other;
      isLoser = value < other;
    } else {
      isWinner = value < other;
      isLoser = value > other;
    }
  }
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 flex flex-col gap-0.5",
        isWinner ? "bg-emerald-50 border-emerald-300" : "bg-card border-border/60",
      )}
      data-testid={`${testIdPrefix}-${side}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wider truncate",
            isWinner ? "text-emerald-800" : "text-muted-foreground",
          )}
        >
          {side === "primary" ? "A" : "B"}
        </p>
        {isWinner && (
          <Trophy
            className="h-3 w-3 text-emerald-600 shrink-0"
            data-testid={`${testIdPrefix}-${side}-winner`}
            aria-label="Better value"
          />
        )}
      </div>
      <p
        className={cn(
          "text-base font-bold font-mono",
          isWinner ? "text-emerald-800" : isLoser ? "text-rose-700" : "text-foreground",
        )}
      >
        {display}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}

function HeadlineTile({
  metric,
  testId,
}: {
  metric: HeadlineMetric;
  testId: string;
}) {
  return (
    <div className="bg-slate-50/60 border border-border/60 rounded-xl p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {metric.label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {renderHeadlineCell(metric, "primary", testId)}
        {renderHeadlineCell(metric, "compare", testId)}
      </div>
    </div>
  );
}

function compareCell(
  primary: number,
  compare: number,
  side: "primary" | "compare",
  higherIsBetter: boolean,
  display: string,
) {
  let cls = "text-foreground";
  if (
    isFinite(primary) &&
    isFinite(compare) &&
    primary !== compare
  ) {
    const value = side === "primary" ? primary : compare;
    const other = side === "primary" ? compare : primary;
    const isWinner = higherIsBetter ? value > other : value < other;
    const isLoser = higherIsBetter ? value < other : value > other;
    if (isWinner) cls = "text-emerald-700 font-semibold";
    else if (isLoser) cls = "text-rose-700";
  }
  return <span className={cls}>{display}</span>;
}

function ImpactComparison({
  primary,
  compare,
  primaryLabel,
  compareLabel,
  primaryNarrative,
  compareNarrative,
}: {
  primary: DecisionImpact;
  compare: DecisionImpact;
  primaryLabel: string;
  compareLabel: string;
  primaryNarrative?: string;
  compareNarrative?: string;
}) {
  const headline: HeadlineMetric[] = [
    {
      label: "Y5 net income Δ",
      higherIsBetter: true,
      primaryRaw: primary.deltas.netIncome[4],
      compareRaw: compare.deltas.netIncome[4],
      primaryDisplay: fmtMoneyDelta(primary.deltas.netIncome[4]),
      compareDisplay: fmtMoneyDelta(compare.deltas.netIncome[4]),
      primarySub: `→ ${fmtMoney(primary.adjusted.netIncome[4])}`,
      compareSub: `→ ${fmtMoney(compare.adjusted.netIncome[4])}`,
    },
    {
      label: "Y5 revenue Δ",
      higherIsBetter: true,
      primaryRaw: primary.deltas.revenue[4],
      compareRaw: compare.deltas.revenue[4],
      primaryDisplay: fmtMoneyDelta(primary.deltas.revenue[4]),
      compareDisplay: fmtMoneyDelta(compare.deltas.revenue[4]),
      primarySub: `→ ${fmtMoney(primary.adjusted.revenue[4])}`,
      compareSub: `→ ${fmtMoney(compare.adjusted.revenue[4])}`,
    },
    {
      label: "Break-even shift",
      // Lower (more negative) is better — pulls in sooner.
      higherIsBetter: false,
      primaryRaw: primary.deltas.breakEvenYearShift,
      compareRaw: compare.deltas.breakEvenYearShift,
      primaryDisplay: fmtBreakEven(primary.deltas.breakEvenYearShift),
      compareDisplay: fmtBreakEven(compare.deltas.breakEvenYearShift),
      primarySub: `to Y${primary.adjusted.breakEvenYear ?? "—"}`,
      compareSub: `to Y${compare.adjusted.breakEvenYear ?? "—"}`,
    },
    {
      label: "Cash runway Δ",
      higherIsBetter: true,
      primaryRaw: primary.deltas.cashRunwayDeltaMonths,
      compareRaw: compare.deltas.cashRunwayDeltaMonths,
      primaryDisplay: fmtRunway(primary.deltas.cashRunwayDeltaMonths),
      compareDisplay: fmtRunway(compare.deltas.cashRunwayDeltaMonths),
      primarySub: primary.adjusted.cashRunwayMonths >= 60
        ? "→ 60+ mo"
        : `→ ${primary.adjusted.cashRunwayMonths.toFixed(0)} mo`,
      compareSub: compare.adjusted.cashRunwayMonths >= 60
        ? "→ 60+ mo"
        : `→ ${compare.adjusted.cashRunwayMonths.toFixed(0)} mo`,
    },
  ];

  return (
    <div className="space-y-5" data-testid="decision-impact-comparison">
      {/* Header strip identifying A and B */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div
          className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2"
          data-testid="comparison-label-primary"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">A</span>
          <p className="font-display font-semibold text-foreground truncate">{primaryLabel}</p>
        </div>
        <div
          className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-2"
          data-testid="comparison-label-compare"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-700">B</span>
          <p className="font-display font-semibold text-foreground truncate">{compareLabel}</p>
        </div>
      </div>

      {/* Headline tiles, two columns per metric */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HeadlineTile metric={headline[0]} testId="cmp-y5-net" />
        <HeadlineTile metric={headline[1]} testId="cmp-y5-rev" />
        <HeadlineTile metric={headline[2]} testId="cmp-breakeven" />
        <HeadlineTile metric={headline[3]} testId="cmp-runway" />
      </div>

      {/* Per-year table — interleaves A and B rows for each metric */}
      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">5-year impact, side-by-side</h3>
        </div>
        <table className="w-full text-xs" data-testid="comparison-year-table">
          <thead className="bg-slate-50">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Metric</th>
              <th className="px-2 py-2 font-medium">Side</th>
              {[1, 2, 3, 4, 5].map((y) => (
                <th key={y} className="px-2 py-2 font-medium text-right">Year {y}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            {/* Net income Δ */}
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 font-sans text-muted-foreground" rowSpan={2}>Net income Δ</td>
              <td className="px-2 py-2 font-sans text-[10px] uppercase tracking-wider text-primary/80">A</td>
              {primary.deltas.netIncome.map((d, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {compareCell(d, compare.deltas.netIncome[i], "primary", true, fmtMoneyDelta(d))}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border/60 bg-slate-50/40">
              <td className="px-2 py-2 font-sans text-[10px] uppercase tracking-wider text-teal-700">B</td>
              {compare.deltas.netIncome.map((d, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {compareCell(primary.deltas.netIncome[i], d, "compare", true, fmtMoneyDelta(d))}
                </td>
              ))}
            </tr>

            {/* Revenue Δ */}
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 font-sans text-muted-foreground" rowSpan={2}>Revenue Δ</td>
              <td className="px-2 py-2 font-sans text-[10px] uppercase tracking-wider text-primary/80">A</td>
              {primary.deltas.revenue.map((d, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {compareCell(d, compare.deltas.revenue[i], "primary", true, fmtMoneyDelta(d))}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border/60 bg-slate-50/40">
              <td className="px-2 py-2 font-sans text-[10px] uppercase tracking-wider text-teal-700">B</td>
              {compare.deltas.revenue.map((d, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {compareCell(primary.deltas.revenue[i], d, "compare", true, fmtMoneyDelta(d))}
                </td>
              ))}
            </tr>

            {/* DSCR after */}
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 font-sans text-muted-foreground" rowSpan={2}>DSCR after</td>
              <td className="px-2 py-2 font-sans text-[10px] uppercase tracking-wider text-primary/80">A</td>
              {primary.adjusted.dscr.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {isFinite(v)
                    ? compareCell(v, compare.adjusted.dscr[i], "primary", true, v.toFixed(2))
                    : "—"}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border/60 bg-slate-50/40">
              <td className="px-2 py-2 font-sans text-[10px] uppercase tracking-wider text-teal-700">B</td>
              {compare.adjusted.dscr.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {isFinite(v)
                    ? compareCell(primary.adjusted.dscr[i], v, "compare", true, v.toFixed(2))
                    : "—"}
                </td>
              ))}
            </tr>

            {/* Net margin after — useful per-year health gauge */}
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 font-sans text-muted-foreground" rowSpan={2}>Net margin after</td>
              <td className="px-2 py-2 font-sans text-[10px] uppercase tracking-wider text-primary/80">A</td>
              {primary.adjusted.netMargin.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {compareCell(v, compare.adjusted.netMargin[i], "primary", true, `${(v * 100).toFixed(1)}%`)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border/60 bg-slate-50/40">
              <td className="px-2 py-2 font-sans text-[10px] uppercase tracking-wider text-teal-700">B</td>
              {compare.adjusted.netMargin.map((v, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {compareCell(primary.adjusted.netMargin[i], v, "compare", true, `${(v * 100).toFixed(1)}%`)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Narratives side-by-side */}
      {(primaryNarrative || compareNarrative) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="comparison-narratives">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80 mb-1">
              A — Why
            </p>
            {primaryNarrative ? (
              <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">
                {primaryNarrative}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No narrative captured for this scenario.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-700 mb-1">
              B — Why
            </p>
            {compareNarrative ? (
              <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">
                {compareNarrative}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No narrative captured for this scenario.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Nudges side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="comparison-nudges">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
            A — flags
          </p>
          {primary.nudges.map((n, i) => (
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
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-700">
            B — flags
          </p>
          {compare.nudges.map((n, i) => (
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
      </div>
    </div>
  );
}
