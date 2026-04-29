import { TrendingUp, AlertTriangle, CircleCheckBig, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionImpact } from "@/lib/decision-flows";

export interface ComparisonColumn {
  impact: DecisionImpact;
  label: string;
  narrative?: string;
}

interface ImpactSummaryProps {
  impact: DecisionImpact;
  /**
   * When provided, ImpactSummary renders a 2-up comparison view that puts two
   * decision impacts in adjacent columns. The "primary" side is `impact`, the
   * "compare" side is `compareWith`. Better headline values get a winner badge.
   *
   * For comparing more than two decisions, prefer the `columns` prop instead.
   */
  compareWith?: DecisionImpact;
  primaryLabel?: string;
  compareLabel?: string;
  primaryNarrative?: string;
  compareNarrative?: string;
  /**
   * N-up comparison (2-4 columns). When provided, this takes precedence over
   * `compareWith` and `impact`. Each column rerenders the same metrics, and
   * the column with the best value per metric gets a winner badge.
   */
  columns?: ComparisonColumn[];
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
  if (props.columns && props.columns.length >= 2) {
    return <ImpactComparison columns={props.columns} />;
  }
  if (props.compareWith) {
    return (
      <ImpactComparison
        columns={[
          {
            impact: props.impact,
            label: props.primaryLabel ?? "Decision A",
            narrative: props.primaryNarrative,
          },
          {
            impact: props.compareWith,
            label: props.compareLabel ?? "Decision B",
            narrative: props.compareNarrative,
          },
        ]}
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

// ---------------- N-up comparison view ----------------

// Distinct color treatments for each compared decision column. Capped at 4.
// Matches the picker cap on the Scenarios page; if we ever raise the cap,
// extend this palette in lockstep.
const COLUMN_PALETTE = [
  {
    letter: "A",
    headerBg: "bg-primary/5",
    headerBorder: "border-primary/20",
    headerText: "text-primary/80",
  },
  {
    letter: "B",
    headerBg: "bg-teal-50",
    headerBorder: "border-teal-200",
    headerText: "text-teal-700",
  },
  {
    letter: "C",
    headerBg: "bg-amber-50",
    headerBorder: "border-amber-200",
    headerText: "text-amber-700",
  },
  {
    letter: "D",
    headerBg: "bg-violet-50",
    headerBorder: "border-violet-200",
    headerText: "text-violet-700",
  },
];

// Tailwind doesn't support dynamic class names, so we look up grid classes
// based on the actual column count (clamped to 2-4).
const HEADLINE_INNER_GRID: Record<number, string> = {
  2: "grid grid-cols-2 gap-2",
  3: "grid grid-cols-3 gap-2",
  4: "grid grid-cols-2 lg:grid-cols-4 gap-2",
};

const HEADER_STRIP_GRID: Record<number, string> = {
  2: "grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm",
  3: "grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm",
  4: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm",
};

const NARRATIVE_GRID: Record<number, string> = {
  2: "grid grid-cols-1 md:grid-cols-2 gap-3",
  3: "grid grid-cols-1 md:grid-cols-3 gap-3",
  4: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3",
};

const FLAGS_GRID: Record<number, string> = {
  2: "grid grid-cols-1 md:grid-cols-2 gap-3",
  3: "grid grid-cols-1 md:grid-cols-3 gap-3",
  4: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3",
};

interface HeadlineMetric {
  label: string;
  // Larger is better when true; smaller is better when false; null means
  // there's no winner concept.
  higherIsBetter: boolean | null;
  // Per-column raw values used to determine the winner.
  values: (number | null)[];
  // Per-column display strings.
  displays: string[];
  // Per-column subtext lines (e.g. "→ $X"). Optional.
  subs?: (string | undefined)[];
}

// Returns booleans aligned to `values`: which column(s) are the strict winner
// (only when there's a single best value). Ties don't get a winner badge so
// founders aren't misled into thinking one option dominates when they don't.
function pickWinners(
  values: (number | null)[],
  higherIsBetter: boolean | null,
): boolean[] {
  if (higherIsBetter === null) return values.map(() => false);
  const finite = values
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v !== null && isFinite(x.v as number));
  if (finite.length < 2) return values.map(() => false);
  const best = finite.reduce(
    (acc, cur) => (higherIsBetter ? ((cur.v as number) > acc ? (cur.v as number) : acc) : ((cur.v as number) < acc ? (cur.v as number) : acc)),
    higherIsBetter ? -Infinity : Infinity,
  );
  const winners = finite.filter((x) => x.v === best);
  if (winners.length !== 1) return values.map(() => false);
  return values.map((_, i) => i === winners[0].i);
}

// Strict losers: the single strictly worst column (so the founder sees which
// option drags). If everyone ties for worst, no loser is marked.
function pickLosers(
  values: (number | null)[],
  higherIsBetter: boolean | null,
): boolean[] {
  if (higherIsBetter === null) return values.map(() => false);
  return pickWinners(values, !higherIsBetter);
}

function HeadlineTile({
  metric,
  testId,
  columnCount,
}: {
  metric: HeadlineMetric;
  testId: string;
  columnCount: number;
}) {
  const winners = pickWinners(metric.values, metric.higherIsBetter);
  const losers = pickLosers(metric.values, metric.higherIsBetter);
  const innerGrid = HEADLINE_INNER_GRID[columnCount] ?? HEADLINE_INNER_GRID[2];
  return (
    <div className="bg-slate-50/60 border border-border/60 rounded-xl p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {metric.label}
      </p>
      <div className={innerGrid}>
        {metric.values.map((_, i) => {
          const isWinner = winners[i];
          const isLoser = losers[i];
          const palette = COLUMN_PALETTE[i] ?? COLUMN_PALETTE[0];
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg border p-2.5 flex flex-col gap-0.5",
                isWinner ? "bg-emerald-50 border-emerald-300" : "bg-card border-border/60",
              )}
              data-testid={`${testId}-col-${i}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider truncate",
                    isWinner ? "text-emerald-800" : "text-muted-foreground",
                  )}
                >
                  {palette.letter}
                </p>
                {isWinner && (
                  <Trophy
                    className="h-3 w-3 text-emerald-600 shrink-0"
                    data-testid={`${testId}-col-${i}-winner`}
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
                {metric.displays[i]}
              </p>
              {metric.subs?.[i] && (
                <p className="text-[10px] text-muted-foreground truncate">{metric.subs[i]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Render a single per-year value cell, highlighting the strict winner across
// all columns for that year-metric.
function YearCell({
  values,
  index,
  higherIsBetter,
  display,
}: {
  values: (number | null)[];
  index: number;
  higherIsBetter: boolean;
  display: string;
}) {
  const winners = pickWinners(values, higherIsBetter);
  const losers = pickLosers(values, higherIsBetter);
  let cls = "text-foreground";
  if (winners[index]) cls = "text-emerald-700 font-semibold";
  else if (losers[index]) cls = "text-rose-700";
  return <span className={cls}>{display}</span>;
}

function ImpactComparison({ columns }: { columns: ComparisonColumn[] }) {
  // Defensive clamp — picker enforces 2-4 but keep the renderer robust.
  const cols = columns.slice(0, 4);
  const n = cols.length;
  const headerStripGrid = HEADER_STRIP_GRID[n] ?? HEADER_STRIP_GRID[2];
  const narrativeGrid = NARRATIVE_GRID[n] ?? NARRATIVE_GRID[2];
  const flagsGrid = FLAGS_GRID[n] ?? FLAGS_GRID[2];

  const headline: HeadlineMetric[] = [
    {
      label: "Y5 net income Δ",
      higherIsBetter: true,
      values: cols.map((c) => c.impact.deltas.netIncome[4]),
      displays: cols.map((c) => fmtMoneyDelta(c.impact.deltas.netIncome[4])),
      subs: cols.map((c) => `→ ${fmtMoney(c.impact.adjusted.netIncome[4])}`),
    },
    {
      label: "Y5 revenue Δ",
      higherIsBetter: true,
      values: cols.map((c) => c.impact.deltas.revenue[4]),
      displays: cols.map((c) => fmtMoneyDelta(c.impact.deltas.revenue[4])),
      subs: cols.map((c) => `→ ${fmtMoney(c.impact.adjusted.revenue[4])}`),
    },
    {
      label: "Break-even shift",
      // Lower (more negative) is better — pulls in sooner.
      higherIsBetter: false,
      values: cols.map((c) => c.impact.deltas.breakEvenYearShift),
      displays: cols.map((c) => fmtBreakEven(c.impact.deltas.breakEvenYearShift)),
      subs: cols.map((c) => `to Y${c.impact.adjusted.breakEvenYear ?? "—"}`),
    },
    {
      label: "Cash runway Δ",
      higherIsBetter: true,
      values: cols.map((c) => c.impact.deltas.cashRunwayDeltaMonths),
      displays: cols.map((c) => fmtRunway(c.impact.deltas.cashRunwayDeltaMonths)),
      subs: cols.map((c) =>
        c.impact.adjusted.cashRunwayMonths >= 60
          ? "→ 60+ mo"
          : `→ ${c.impact.adjusted.cashRunwayMonths.toFixed(0)} mo`,
      ),
    },
  ];

  // Per-year metric columns aligned across all decisions.
  const netIncomeYears = [0, 1, 2, 3, 4].map((i) =>
    cols.map((c) => c.impact.deltas.netIncome[i] as number | null),
  );
  const revenueYears = [0, 1, 2, 3, 4].map((i) =>
    cols.map((c) => c.impact.deltas.revenue[i] as number | null),
  );
  const dscrYears = [0, 1, 2, 3, 4].map((i) =>
    cols.map((c) => {
      const v = c.impact.adjusted.dscr[i];
      return isFinite(v) ? v : null;
    }),
  );
  const marginYears = [0, 1, 2, 3, 4].map((i) =>
    cols.map((c) => c.impact.adjusted.netMargin[i] as number | null),
  );
  const cashPositionYears = [0, 1, 2, 3, 4].map((i) =>
    cols.map((c) => c.impact.adjusted.cashPosition[i] as number | null),
  );

  return (
    <div className="space-y-5" data-testid="decision-impact-comparison">
      {/* Header strip identifying each column */}
      <div className={headerStripGrid}>
        {cols.map((c, i) => {
          const palette = COLUMN_PALETTE[i] ?? COLUMN_PALETTE[0];
          return (
            <div
              key={i}
              className={cn("rounded-lg px-3 py-2 border", palette.headerBg, palette.headerBorder)}
              data-testid={`comparison-label-col-${i}`}
            >
              <span
                className={cn("text-[10px] font-semibold uppercase tracking-wider", palette.headerText)}
              >
                {palette.letter}
              </span>
              <p className="font-display font-semibold text-foreground truncate">{c.label}</p>
            </div>
          );
        })}
      </div>

      {/* Headline tiles — one per metric, with N inner cells */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HeadlineTile metric={headline[0]} testId="cmp-y5-net" columnCount={n} />
        <HeadlineTile metric={headline[1]} testId="cmp-y5-rev" columnCount={n} />
        <HeadlineTile metric={headline[2]} testId="cmp-breakeven" columnCount={n} />
        <HeadlineTile metric={headline[3]} testId="cmp-runway" columnCount={n} />
      </div>

      {/* Per-year table — interleaves all decision rows for each metric.
          The "Side" column shows A/B/C/D so founders can see at a glance
          which decision a row belongs to. */}
      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">
            5-year impact, side-by-side
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]" data-testid="comparison-year-table">
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
              {cols.map((c, ci) => {
                const palette = COLUMN_PALETTE[ci] ?? COLUMN_PALETTE[0];
                return (
                  <tr key={`net-${ci}`} className={cn("border-t border-border/60", ci % 2 === 1 && "bg-slate-50/40")}>
                    {ci === 0 && (
                      <td className="px-3 py-2 font-sans text-muted-foreground" rowSpan={n}>
                        Net income Δ
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.deltas.netIncome.map((d, yi) => (
                      <td key={yi} className="px-2 py-2 text-right">
                        <YearCell
                          values={netIncomeYears[yi]}
                          index={ci}
                          higherIsBetter={true}
                          display={fmtMoneyDelta(d)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}

              {/* Revenue Δ */}
              {cols.map((c, ci) => {
                const palette = COLUMN_PALETTE[ci] ?? COLUMN_PALETTE[0];
                return (
                  <tr key={`rev-${ci}`} className={cn("border-t border-border/60", ci % 2 === 1 && "bg-slate-50/40")}>
                    {ci === 0 && (
                      <td className="px-3 py-2 font-sans text-muted-foreground" rowSpan={n}>
                        Revenue Δ
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.deltas.revenue.map((d, yi) => (
                      <td key={yi} className="px-2 py-2 text-right">
                        <YearCell
                          values={revenueYears[yi]}
                          index={ci}
                          higherIsBetter={true}
                          display={fmtMoneyDelta(d)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}

              {/* DSCR after */}
              {cols.map((c, ci) => {
                const palette = COLUMN_PALETTE[ci] ?? COLUMN_PALETTE[0];
                return (
                  <tr key={`dscr-${ci}`} className={cn("border-t border-border/60", ci % 2 === 1 && "bg-slate-50/40")}>
                    {ci === 0 && (
                      <td className="px-3 py-2 font-sans text-muted-foreground" rowSpan={n}>
                        DSCR after
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.adjusted.dscr.map((v, yi) => (
                      <td key={yi} className="px-2 py-2 text-right">
                        {isFinite(v) ? (
                          <YearCell
                            values={dscrYears[yi]}
                            index={ci}
                            higherIsBetter={true}
                            display={v.toFixed(2)}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {/* Cash position after — surfaces the per-year trough so
                  founders can spot the runway crunch year lenders zero in on. */}
              {cols.map((c, ci) => {
                const palette = COLUMN_PALETTE[ci] ?? COLUMN_PALETTE[0];
                return (
                  <tr key={`cash-${ci}`} className={cn("border-t border-border/60", ci % 2 === 1 && "bg-slate-50/40")}>
                    {ci === 0 && (
                      <td className="px-3 py-2 font-sans text-muted-foreground" rowSpan={n}>
                        Cash position
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.adjusted.cashPosition.map((v, yi) => (
                      <td
                        key={yi}
                        className="px-2 py-2 text-right"
                        data-testid={`cmp-cash-position-col-${ci}-y${yi + 1}`}
                      >
                        <YearCell
                          values={cashPositionYears[yi]}
                          index={ci}
                          higherIsBetter={true}
                          display={fmtMoney(v)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}

              {/* Net margin after */}
              {cols.map((c, ci) => {
                const palette = COLUMN_PALETTE[ci] ?? COLUMN_PALETTE[0];
                return (
                  <tr key={`margin-${ci}`} className={cn("border-t border-border/60", ci % 2 === 1 && "bg-slate-50/40")}>
                    {ci === 0 && (
                      <td className="px-3 py-2 font-sans text-muted-foreground" rowSpan={n}>
                        Net margin after
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.adjusted.netMargin.map((v, yi) => (
                      <td key={yi} className="px-2 py-2 text-right">
                        <YearCell
                          values={marginYears[yi]}
                          index={ci}
                          higherIsBetter={true}
                          display={`${(v * 100).toFixed(1)}%`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Narratives side-by-side. We always render a card per column when any
          narrative exists so the founder sees consistent column alignment. */}
      {cols.some((c) => c.narrative) && (
        <div className={narrativeGrid} data-testid="comparison-narratives">
          {cols.map((c, i) => {
            const palette = COLUMN_PALETTE[i] ?? COLUMN_PALETTE[0];
            return (
              <div
                key={i}
                className={cn("rounded-xl border p-4", palette.headerBg, palette.headerBorder)}
                data-testid={`comparison-narrative-${i}`}
              >
                <p
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider mb-1",
                    palette.headerText,
                  )}
                >
                  {palette.letter} — Why
                </p>
                {c.narrative ? (
                  <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">
                    {c.narrative}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No narrative captured for this scenario.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Nudges side-by-side */}
      <div className={flagsGrid} data-testid="comparison-nudges">
        {cols.map((c, i) => {
          const palette = COLUMN_PALETTE[i] ?? COLUMN_PALETTE[0];
          return (
            <div key={i} className="space-y-2">
              <p
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider",
                  palette.headerText,
                )}
              >
                {palette.letter} — flags
              </p>
              {c.impact.nudges.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No flags raised.</p>
              ) : (
                c.impact.nudges.map((n, ni) => (
                  <div
                    key={ni}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border p-3",
                      n.signal === "green"
                        ? "bg-emerald-50 border-emerald-200"
                        : n.signal === "amber"
                        ? "bg-amber-50 border-amber-200"
                        : "bg-rose-50 border-rose-200",
                    )}
                  >
                    <SignalIcon signal={n.signal} />
                    <div className="text-sm">
                      <p className="font-semibold text-foreground">{n.label}</p>
                      <p className="text-foreground/80 text-xs mt-0.5">{n.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
