import { useEffect, useMemo, useRef } from "react";
import { TrendingUp, AlertTriangle, CircleCheckBig, Trophy, Lightbulb, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionImpact } from "@/lib/decision-flows";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { WhatIfLink } from "@/components/coaching/WhatIfLink";

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
  /**
   * When true, the surface is rendered for a single-year model. The engine
   * still emits length-5 arrays in that case, but Y2-Y5 are extrapolations
   * from Y1 inputs that aren't user-meaningful. Headline tiles, the per-year
   * table, and the comparison view all collapse to a single Year-1 column
   * with "Y1" labels. Mirrors the same `isSingleYear` plumb done for the
   * mailer and scenario-compare paths in Tasks #469 / #472. Audit:
   * `.local/audits/y5-anchored-consumers-audit.md` (Task #478).
   */
  isSingleYear?: boolean;
}

function fmtMoney(v: number): string {
  if (!isFinite(v)) return "-";
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
  if (shift === null) return "-";
  if (shift === 0) return "Same";
  if (shift > 0) return `+${shift}y`;
  return `${shift}y`;
}

function fmtRunway(months: number): string {
  if (months === 0) return "0 mo";
  const sign = months > 0 ? "+" : "";
  return `${sign}${months.toFixed(1)} mo`;
}

// Returns the index of the lowest finite cash-position year. Ties resolve to
// the *earliest* year so the founder sees the first crunch — that's the year
// a lender will ask about first ("when do you nearly run out?"). Returns null
// when the input has no finite values (e.g. an empty or all-NaN forecast).
export function findTroughIndex(values: readonly (number | null | undefined)[]): number | null {
  let bestIdx: number | null = null;
  let bestVal = Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !isFinite(v)) continue;
    if (v < bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function SignalIcon({ signal }: { signal: "green" | "amber" | "red" }) {
  if (signal === "green") return <CircleCheckBig className="h-4 w-4 text-emerald-600" />;
  if (signal === "amber") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <AlertTriangle className="h-4 w-4 text-rose-600" />;
}

export function ImpactSummary(props: ImpactSummaryProps) {
  if (props.columns && props.columns.length >= 2) {
    return <ImpactComparison columns={props.columns} isSingleYear={props.isSingleYear} />;
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
        isSingleYear={props.isSingleYear}
      />
    );
  }
  return <ImpactSingle impact={props.impact} isSingleYear={props.isSingleYear} />;
}

function ImpactSingle({ impact, isSingleYear }: { impact: DecisionImpact; isSingleYear?: boolean }) {
  // Task #478 — single-year models still get length-5 arrays from the
  // engine, but Y2-Y5 are extrapolations from Y1. Anchor headlines and the
  // per-year table to Y1 only when isSingleYear, so we never publish a
  // hidden Y5 number that the founder didn't actually project.
  const headlineIdx = isSingleYear ? 0 : 4;
  const headlineLabel = isSingleYear ? "Y1" : "Y5";
  const tableYears = isSingleYear ? [0] : [0, 1, 2, 3, 4];
  const tableTitle = isSingleYear ? "Year 1 impact" : "5-year impact";
  const { base, adjusted, deltas, nudges } = impact;
  // Task #499: shared coach-gate hook keeps every coach-gated surface in sync.
  const { guidanceLevel, showCoach } = useShowCoach();

  // KPI threshold nudges — fire when the *adjusted* model crosses common
  // red lines: DSCR below 1.20 in any year, runway under 6 months, or any
  // negative net income year. These echo what a board / lender would flag
  // the moment they see the model and are *always shown* (even in
  // advanced mode) because they're decision-blocking, not just coaching.
  // The verbose `body` paragraph is gated behind `showCoach` so advanced
  // founders see a tight one-liner instead of the full coaching script.
  const kpiNudges = useMemo(() => {
    const items: Array<{ key: string; label: string; body: string; oneLiner: string }> = [];
    const dscrYearIdx = adjusted.dscr.findIndex((d) => isFinite(d) && d < 1.2);
    if (dscrYearIdx >= 0) {
      items.push({
        key: "dscr",
        label: "DSCR slips below 1.20",
        oneLiner: `Adjusted DSCR ${adjusted.dscr[dscrYearIdx].toFixed(2)} in Year ${dscrYearIdx + 1}.`,
        body: `Your adjusted DSCR drops to ${adjusted.dscr[dscrYearIdx].toFixed(2)} in Year ${dscrYearIdx + 1}. Most lenders want at least 1.20 - flag this on the board memo, or pair the decision with an enrollment or expense lever before you commit.`,
      });
    }
    if (adjusted.cashRunwayMonths < 6) {
      items.push({
        key: "runway",
        label: "Cash runway under 6 months",
        oneLiner: `Adjusted runway ${adjusted.cashRunwayMonths.toFixed(1)} months.`,
        body: `After this decision, the model only has ${adjusted.cashRunwayMonths.toFixed(1)} months of runway. That's the threshold where a single missed enrollment month becomes a payroll problem - line up a reserve, line of credit, or smaller starting commitment first.`,
      });
    }
    const niYearIdx = adjusted.netIncome.findIndex((n) => n < 0);
    if (niYearIdx >= 0) {
      items.push({
        key: "ni",
        label: `Net income negative in Year ${niYearIdx + 1}`,
        oneLiner: `Adjusted Year ${niYearIdx + 1} net income negative.`,
        body: `Adjusted net income is ${adjusted.netIncome[niYearIdx] < 0 ? "negative" : "thin"} in Year ${niYearIdx + 1}. New schools often plan for a year or two of red ink, but it should be a deliberate choice - make sure your reserves and your board memo line up with that plan.`,
      });
    }
    return items;
  }, [adjusted]);

  const trackedRef = useRef<string>("");
  useEffect(() => {
    // Advanced-mode founders never see the WhatIfLink coach nudge below
    // (the link is hidden for advanced), so we silence the *_shown event
    // for them too — keeps the /admin/coaching-funnel impressions
    // matched to actual rendered surfaces (Task #285).
    if (guidanceLevel === "advanced") return;
    if (kpiNudges.length === 0) return;
    const key = kpiNudges.map((n) => n.key).join(",");
    if (trackedRef.current === key) return;
    trackedRef.current = key;
    trackCoachingEvent("impact_kpi_nudge_shown", {
      nudgeKeys: kpiNudges.map((n) => n.key),
      guidanceLevel,
    });
  }, [kpiNudges, guidanceLevel]);

  // Surface the worst cash year for the adjusted scenario so founders see
  // the runway crunch without having to scan year by year. We compute on
  // the adjusted side because that's the post-decision forecast — the
  // number a lender will press on first.
  const troughIdx = useMemo(
    () => findTroughIndex(adjusted.cashPosition),
    [adjusted.cashPosition],
  );

  return (
    <div className="space-y-5" data-testid="decision-impact-summary">
      {/* Headline tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border/60 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{headlineLabel} net income Δ</p>
          <p className={cn(
            "text-2xl font-bold font-mono mt-1",
            deltas.netIncome[headlineIdx] > 0 ? "text-emerald-700" : deltas.netIncome[headlineIdx] < 0 ? "text-rose-700" : "text-foreground",
          )}
            data-testid="impact-y5-net-delta"
          >
            {fmtMoneyDelta(deltas.netIncome[headlineIdx])}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            base {fmtMoney(base.netIncome[headlineIdx])} → after {fmtMoney(adjusted.netIncome[headlineIdx])}
          </p>
        </div>
        <div className="bg-card border border-border/60 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{headlineLabel} revenue Δ</p>
          <p className={cn(
            "text-2xl font-bold font-mono mt-1",
            deltas.revenue[headlineIdx] > 0 ? "text-emerald-700" : deltas.revenue[headlineIdx] < 0 ? "text-rose-700" : "text-foreground",
          )}>
            {fmtMoneyDelta(deltas.revenue[headlineIdx])}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            base {fmtMoney(base.revenue[headlineIdx])} → after {fmtMoney(adjusted.revenue[headlineIdx])}
          </p>
        </div>
        <div className="bg-card border border-border/60 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Break-even</p>
          <p className="text-2xl font-bold font-mono mt-1">
            {fmtBreakEven(deltas.breakEvenYearShift)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            base Y{base.breakEvenYear ?? "-"} → after Y{adjusted.breakEvenYear ?? "-"}
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
          <h3 className="font-display font-semibold text-sm">{tableTitle}</h3>
        </div>
        <table className="w-full text-xs" data-testid="impact-year-table">
          <thead className="bg-slate-50">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Metric</th>
              {tableYears.map((i) => (
                <th key={i} className="px-2 py-2 font-medium text-right">Year {i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono">
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 font-sans text-muted-foreground">Net income Δ</td>
              {tableYears.map((i) => {
                const d = deltas.netIncome[i];
                return (
                  <td key={i} className={cn(
                    "px-2 py-2 text-right",
                    d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-muted-foreground",
                  )}>{fmtMoneyDelta(d)}</td>
                );
              })}
            </tr>
            <tr className="border-t border-border/60 bg-slate-50/40">
              <td className="px-3 py-2 font-sans text-muted-foreground">Revenue Δ</td>
              {tableYears.map((i) => {
                const d = deltas.revenue[i];
                return (
                  <td key={i} className={cn(
                    "px-2 py-2 text-right",
                    d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-muted-foreground",
                  )}>{fmtMoneyDelta(d)}</td>
                );
              })}
            </tr>
            <tr className="border-t border-border/60">
              <td className="px-3 py-2 font-sans text-muted-foreground">DSCR after</td>
              {tableYears.map((i) => {
                const v = adjusted.dscr[i];
                const baseV = base.dscr[i];
                const better = isFinite(v) && isFinite(baseV) && v > baseV;
                const worse = isFinite(v) && isFinite(baseV) && v < baseV;
                return (
                  <td key={i} className={cn(
                    "px-2 py-2 text-right",
                    better && "text-emerald-700",
                    worse && "text-rose-700",
                  )}>
                    {isFinite(v) ? v.toFixed(2) : "-"}
                  </td>
                );
              })}
            </tr>
            <tr className="border-t border-border/60 bg-slate-50/40">
              <td className="px-3 py-2 font-sans text-muted-foreground">Cash position</td>
              {tableYears.map((i) => {
                const v = adjusted.cashPosition[i];
                const isTrough = troughIdx === i;
                return (
                  <td
                    key={i}
                    className="px-2 py-2 text-right"
                    data-testid={`impact-cash-position-y${i + 1}`}
                  >
                    {isTrough ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1",
                          v < 0
                            ? "bg-rose-50 ring-rose-300 text-rose-700"
                            : "bg-amber-50 ring-amber-300 text-amber-800",
                        )}
                        data-testid={`impact-cash-position-y${i + 1}-trough`}
                      >
                        <TrendingDown className="h-3 w-3" aria-label="Trough" />
                        <span className="font-semibold">{fmtMoney(v)}</span>
                      </span>
                    ) : (
                      <span className={cn(v < 0 && "text-rose-700")}>{fmtMoney(v)}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
        {troughIdx !== null && (
          <div
            className={cn(
              "px-4 py-2.5 border-t border-border/60 flex items-center gap-2 text-xs",
              adjusted.cashPosition[troughIdx] < 0
                ? "bg-rose-50/70 text-rose-800"
                : "bg-amber-50/70 text-amber-900",
            )}
            data-testid="impact-cash-trough-callout"
          >
            <TrendingDown className="h-3.5 w-3.5 shrink-0" />
            <p>
              <span className="font-semibold">Trough:</span>{" "}
              <span data-testid="impact-cash-trough-label">
                Year {troughIdx + 1} at {fmtMoney(adjusted.cashPosition[troughIdx])}
              </span>{" "}
              <span className="text-foreground/70">- lowest projected cash year after this decision.</span>
            </p>
          </div>
        )}
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

      {/* KPI threshold nudges - always shown (DSCR<1.20, runway<6mo, NI<0).
          Basics/extra get the full coaching callout (label + body paragraph
          + "Try a What-If to fix it" link). Advanced founders get a compact
          inline metric flag instead — a small amber pill per failing KPI
          with an inline What-If link — matching the rest of the advanced
          experience where the warning chrome is dialed back to a marker. */}
      {kpiNudges.length > 0 && (
        guidanceLevel === "advanced" ? (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="impact-coach-nudges"
          >
            {kpiNudges.map((n) => (
              <div
                key={n.key}
                className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/70 px-2.5 py-1 text-xs text-amber-900"
                data-testid={`impact-coach-nudge-${n.key}`}
              >
                <Lightbulb className="h-3 w-3 text-amber-700 shrink-0" />
                <span className="font-semibold">{n.label}</span>
                <WhatIfLink
                  source="impact_summary"
                  detail={{ kpi: n.key, guidanceLevel }}
                  className="text-[11px]"
                >
                  What-If
                </WhatIfLink>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2" data-testid="impact-coach-nudges">
            {kpiNudges.map((n) => (
              <div
                key={n.key}
                className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3"
                data-testid={`impact-coach-nudge-${n.key}`}
              >
                <Lightbulb className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="text-sm flex-1 min-w-0">
                  <p className="font-semibold text-amber-900">
                    {showCoach ? `Coach: ${n.label}` : n.label}
                  </p>
                  <p className="text-amber-900/85 text-xs mt-0.5 leading-relaxed">
                    {showCoach ? n.body : n.oneLiner}
                  </p>
                  <div className="mt-2">
                    <WhatIfLink
                      source="impact_summary"
                      detail={{ kpi: n.key, guidanceLevel }}
                    >
                      Try a What-If to fix it
                    </WhatIfLink>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
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
//
// Phone (<480px) layout intent: each headline tile shows its inner cells
// stacked into a single column (n=2 and n=3) or a 2x2 grid (n=4). This
// keeps money values and "→ $X" subtext from wrapping in a way that
// breaks the visual scan. Above 480px we restore the wider grids.
const HEADLINE_INNER_GRID: Record<number, string> = {
  2: "grid grid-cols-1 min-[480px]:grid-cols-2 gap-2",
  3: "grid grid-cols-1 min-[480px]:grid-cols-3 gap-2",
  4: "grid grid-cols-2 lg:grid-cols-4 gap-2",
};

// On phones the per-column header strip stays a tidy stacked list of cards
// (one per decision) so the A/B/C/D color cue is preserved. Each card uses
// an inline letter + label layout below `sm` (see the strip render below)
// so a 4-up comparison doesn't take 200px of vertical space before the
// founder reaches the headline tiles.
const HEADER_STRIP_GRID: Record<number, string> = {
  2: "grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm",
  3: "grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-sm",
  4: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 text-sm",
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

function ImpactComparison({ columns, isSingleYear }: { columns: ComparisonColumn[]; isSingleYear?: boolean }) {
  // Defensive clamp — picker enforces 2-4 but keep the renderer robust.
  const cols = columns.slice(0, 4);
  const n = cols.length;
  const headerStripGrid = HEADER_STRIP_GRID[n] ?? HEADER_STRIP_GRID[2];
  const narrativeGrid = NARRATIVE_GRID[n] ?? NARRATIVE_GRID[2];
  const flagsGrid = FLAGS_GRID[n] ?? FLAGS_GRID[2];

  // Task #478 — same Y1-only collapse as ImpactSingle. The engine emits
  // length-5 arrays even for single-year models, but Y2-Y5 are
  // extrapolations — collapse the comparison to a single Year-1 column.
  const headlineIdx = isSingleYear ? 0 : 4;
  const headlineLabel = isSingleYear ? "Y1" : "Y5";
  const tableYears = isSingleYear ? [0] : [0, 1, 2, 3, 4];
  const tableTitle = isSingleYear ? "Year 1 impact, side-by-side" : "5-year impact, side-by-side";

  const headline: HeadlineMetric[] = [
    {
      label: `${headlineLabel} net income Δ`,
      higherIsBetter: true,
      values: cols.map((c) => c.impact.deltas.netIncome[headlineIdx]),
      displays: cols.map((c) => fmtMoneyDelta(c.impact.deltas.netIncome[headlineIdx])),
      subs: cols.map((c) => `→ ${fmtMoney(c.impact.adjusted.netIncome[headlineIdx])}`),
    },
    {
      label: `${headlineLabel} revenue Δ`,
      higherIsBetter: true,
      values: cols.map((c) => c.impact.deltas.revenue[headlineIdx]),
      displays: cols.map((c) => fmtMoneyDelta(c.impact.deltas.revenue[headlineIdx])),
      subs: cols.map((c) => `→ ${fmtMoney(c.impact.adjusted.revenue[headlineIdx])}`),
    },
    {
      label: "Break-even shift",
      // Lower (more negative) is better — pulls in sooner.
      higherIsBetter: false,
      values: cols.map((c) => c.impact.deltas.breakEvenYearShift),
      displays: cols.map((c) => fmtBreakEven(c.impact.deltas.breakEvenYearShift)),
      subs: cols.map((c) => `to Y${c.impact.adjusted.breakEvenYear ?? "-"}`),
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

  // Per-side trough year index — the lowest cash year for *this* column
  // alone, independent of the cross-column winner/loser highlighting. Lets
  // founders spot each side's worst year without scanning all five columns.
  const troughIdxByCol = cols.map((c) => findTroughIndex(c.impact.adjusted.cashPosition));

  return (
    <div className="space-y-5" data-testid="decision-impact-comparison">
      {/* Header strip identifying each column. On phones (<sm) each card
          uses a horizontal letter-pill + label layout so the strip stays
          compact even when 4 decisions stack vertically; on sm+ the letter
          sits above the label like a column header. The letter pill keeps
          its color cue at every breakpoint so A/B/C/D remain identifiable. */}
      <div className={headerStripGrid} data-testid="comparison-header-strip">
        {cols.map((c, i) => {
          const palette = COLUMN_PALETTE[i] ?? COLUMN_PALETTE[0];
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg px-3 py-1.5 sm:py-2 border flex items-center gap-2 sm:block sm:gap-0",
                palette.headerBg,
                palette.headerBorder,
              )}
              data-testid={`comparison-label-col-${i}`}
            >
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider shrink-0",
                  "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 sm:px-0 sm:py-0 sm:rounded-none",
                  "ring-1 ring-current/20 sm:ring-0",
                  palette.headerText,
                )}
              >
                {palette.letter}
              </span>
              <p className="font-display font-semibold text-foreground truncate min-w-0">
                {c.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Headline tiles - one per metric, with N inner cells */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HeadlineTile metric={headline[0]} testId="cmp-y5-net" columnCount={n} />
        <HeadlineTile metric={headline[1]} testId="cmp-y5-rev" columnCount={n} />
        <HeadlineTile metric={headline[2]} testId="cmp-breakeven" columnCount={n} />
        <HeadlineTile metric={headline[3]} testId="cmp-runway" columnCount={n} />
      </div>

      {/* Per-year table - interleaves all decision rows for each metric.
          The "Side" column shows A/B/C/D so founders can see at a glance
          which decision a row belongs to.

          Phone responsive: the seven-column table (Metric, Side, Y1-Y5)
          is wider than a phone viewport (min-w-[560px]) and lives inside
          an `overflow-x-auto` scroller. The Metric column is `sticky
          left-0` so the row label stays pinned while the founder swipes
          through the year columns. A subtle "Swipe →" hint surfaces only
          on phones (sm:hidden) so the scroll affordance is obvious — the
          built-in scrollbar alone is too easy to miss on touch devices. */}
      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-display font-semibold text-sm truncate">
              {tableTitle}
            </h3>
          </div>
          <p
            className="sm:hidden text-[10px] font-medium text-muted-foreground italic shrink-0"
            data-testid="comparison-year-table-scroll-hint"
            aria-hidden="true"
          >
            Swipe →
          </p>
        </div>
        <div className="overflow-x-auto" data-testid="comparison-year-table-scroller">
          <table
            className="w-full text-xs min-w-[560px]"
            data-testid="comparison-year-table"
          >
            <thead className="bg-slate-50">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium sticky left-0 bg-slate-50 z-10 shadow-[1px_0_0_0_var(--color-border)]">
                  Metric
                </th>
                <th className="px-2 py-2 font-medium">Side</th>
                {tableYears.map((i) => (
                  <th key={i} className="px-2 py-2 font-medium text-right">Year {i + 1}</th>
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
                      <td className="px-3 py-2 font-sans text-muted-foreground sticky left-0 bg-card z-[5] shadow-[1px_0_0_0_var(--color-border)]" rowSpan={n}>
                        Net income Δ
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.deltas.netIncome.slice(0, tableYears.length).map((d, yi) => (
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
                      <td className="px-3 py-2 font-sans text-muted-foreground sticky left-0 bg-card z-[5] shadow-[1px_0_0_0_var(--color-border)]" rowSpan={n}>
                        Revenue Δ
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.deltas.revenue.slice(0, tableYears.length).map((d, yi) => (
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
                      <td className="px-3 py-2 font-sans text-muted-foreground sticky left-0 bg-card z-[5] shadow-[1px_0_0_0_var(--color-border)]" rowSpan={n}>
                        DSCR after
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.adjusted.dscr.slice(0, tableYears.length).map((v, yi) => (
                      <td key={yi} className="px-2 py-2 text-right">
                        {isFinite(v) ? (
                          <YearCell
                            values={dscrYears[yi]}
                            index={ci}
                            higherIsBetter={true}
                            display={v.toFixed(2)}
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {/* Cash position after - surfaces the per-year trough so
                  founders can spot the runway crunch year lenders zero in on.
                  Each side's lowest cash year gets a ring + down-arrow icon so
                  founders see the crunch year at a glance, on top of the
                  cross-column winner/loser tinting from YearCell. */}
              {cols.map((c, ci) => {
                const palette = COLUMN_PALETTE[ci] ?? COLUMN_PALETTE[0];
                const sideTrough = troughIdxByCol[ci];
                return (
                  <tr key={`cash-${ci}`} className={cn("border-t border-border/60", ci % 2 === 1 && "bg-slate-50/40")}>
                    {ci === 0 && (
                      <td className="px-3 py-2 font-sans text-muted-foreground sticky left-0 bg-card z-[5] shadow-[1px_0_0_0_var(--color-border)]" rowSpan={n}>
                        Cash position
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.adjusted.cashPosition.slice(0, tableYears.length).map((v, yi) => {
                      const isTrough = sideTrough === yi;
                      return (
                        <td
                          key={yi}
                          className="px-2 py-2 text-right"
                          data-testid={`cmp-cash-position-col-${ci}-y${yi + 1}`}
                        >
                          {isTrough ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1",
                                v < 0
                                  ? "bg-rose-50 ring-rose-300"
                                  : "bg-amber-50 ring-amber-300",
                              )}
                              data-testid={`cmp-cash-position-col-${ci}-y${yi + 1}-trough`}
                              aria-label={`Trough for ${palette.letter}`}
                            >
                              <TrendingDown
                                className={cn("h-3 w-3", v < 0 ? "text-rose-600" : "text-amber-700")}
                              />
                              <YearCell
                                values={cashPositionYears[yi]}
                                index={ci}
                                higherIsBetter={true}
                                display={fmtMoney(v)}
                              />
                            </span>
                          ) : (
                            <YearCell
                              values={cashPositionYears[yi]}
                              index={ci}
                              higherIsBetter={true}
                              display={fmtMoney(v)}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Net margin after */}
              {cols.map((c, ci) => {
                const palette = COLUMN_PALETTE[ci] ?? COLUMN_PALETTE[0];
                return (
                  <tr key={`margin-${ci}`} className={cn("border-t border-border/60", ci % 2 === 1 && "bg-slate-50/40")}>
                    {ci === 0 && (
                      <td className="px-3 py-2 font-sans text-muted-foreground sticky left-0 bg-card z-[5] shadow-[1px_0_0_0_var(--color-border)]" rowSpan={n}>
                        Net margin after
                      </td>
                    )}
                    <td className={cn("px-2 py-2 font-sans text-[10px] uppercase tracking-wider", palette.headerText)}>
                      {palette.letter}
                    </td>
                    {c.impact.adjusted.netMargin.slice(0, tableYears.length).map((v, yi) => (
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
        {/* Per-side trough summary - restates each column's worst cash year as
            a one-line callout so founders don't have to scan the table to find
            the runway crunch year. Mirrors the column palette so the labels
            line up visually with the A/B/C/D columns above. */}
        {troughIdxByCol.some((t) => t !== null) && (
          <div
            className="px-4 py-3 border-t border-border/60 bg-slate-50/50 flex flex-wrap gap-x-4 gap-y-1.5 text-xs"
            data-testid="comparison-cash-trough-summary"
          >
            <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
              <TrendingDown className="h-3.5 w-3.5" />
              Trough year per side:
            </span>
            {cols.map((c, ci) => {
              const palette = COLUMN_PALETTE[ci] ?? COLUMN_PALETTE[0];
              const ti = troughIdxByCol[ci];
              if (ti === null) return null;
              const v = c.impact.adjusted.cashPosition[ti];
              return (
                <span
                  key={ci}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 ring-1",
                    v < 0 ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200",
                  )}
                  data-testid={`comparison-cash-trough-col-${ci}`}
                >
                  <span className={cn("text-[10px] font-semibold uppercase tracking-wider", palette.headerText)}>
                    {palette.letter}
                  </span>
                  <span className={cn("font-mono", v < 0 ? "text-rose-700" : "text-amber-900")}>
                    Y{ti + 1} at {fmtMoney(v)}
                  </span>
                </span>
              );
            })}
          </div>
        )}
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
                  {palette.letter} - Why
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
                {palette.letter} - flags
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
