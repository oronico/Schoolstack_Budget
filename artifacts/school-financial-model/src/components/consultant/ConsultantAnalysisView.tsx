import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  BarChart3,
  Lightbulb,
  Star,
  PieChart as PieChartIcon,
  Activity,
  ChevronDown,
  ChevronUp,
  Grid3X3,
  Clock,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConsultantOutput } from "@workspace/api-client-react";
import { KPI_FORMULAS } from "@/lib/coaching/kpi-formulas";
import { KpiFormulaDrawer } from "@/components/coaching/ExplainerDrawer";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { TopIssuesPanel } from "./TopIssuesPanel";
import { HealthSignalsSection } from "./HealthSignalCard";
import { LendingLabCard } from "./LendingLabCard";

function metricNameToKpiId(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.includes("revenue per student")) return "revenuePerStudent";
  if (lower.includes("staffing cost")) return "staffingCostPct";
  if (lower.includes("operating cost")) return "operatingCostPct";
  if (lower.includes("margin") || lower.includes("surplus") || lower.includes("profit")) return "netMargin";
  if (lower.includes("revenue growth")) return "revenueGrowth";
  if (lower.includes("capacity utilization")) return "capacityUtilization";
  if (lower.includes("debt service") || lower.includes("dscr")) return "dscr";
  if (lower.includes("reserve")) return "reserveMonths";
  return undefined;
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

const CHART_COLORS = {
  green: "#328555",
  teal: "#0D9488",
  amber: "#D97706",
  rose: "#E11D48",
  navy: "#1E293B",
  blue: "#3B82F6",
  purple: "#8B5CF6",
  slate: "#64748B",
};

function CollapsibleTable({ children, label }: { children: React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function CustomTooltip({ active, payload, label, formatter, formatByName }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; formatter?: (v: number) => string; formatByName?: Record<string, (v: number) => string> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg border border-border/60 shadow-lg px-3.5 py-2.5 text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry, i) => {
        const fmt = formatByName?.[entry.name] || formatter;
        return (
          <div key={i} className="flex items-center gap-2 py-0.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold text-foreground ml-auto">{fmt ? fmt(entry.value) : entry.value}</span>
          </div>
        );
      })}
    </div>
  );
}

interface ConsultantAnalysisViewProps {
  data: ConsultantOutput;
  niLabel: string;
  cumNiLabel: string;
  modelId?: number;
  jumpToStep?: (step: number) => void;
  exportStepNumber?: number;
}

export function ConsultantAnalysisView({ data, niLabel, cumNiLabel, modelId, jumpToStep, exportStepNumber = 9 }: ConsultantAnalysisViewProps) {
  const [openKpi, setOpenKpi] = useState<string | null>(null);
  const [sensitivityTab, setSensitivityTab] = useState<"revenue" | "expense">("revenue");

  useEffect(() => {
    trackCoachingEvent("analysis_view_opened", {
      modelId: modelId ?? null,
    });
  }, [modelId]);

  const lenderColor =
    data.lenderReadiness === "Strong"
      ? "text-green-700"
      : data.lenderReadiness === "Needs Work"
        ? "text-amber-700"
        : "text-rose-700";

  const lenderBg =
    data.lenderReadiness === "Strong"
      ? "bg-gradient-to-br from-green-50 to-emerald-50/50 border-green-200"
      : data.lenderReadiness === "Needs Work"
        ? "bg-gradient-to-br from-amber-50 to-yellow-50/50 border-amber-200"
        : "bg-gradient-to-br from-rose-50 to-red-50/50 border-rose-200";

  const LenderIcon =
    data.lenderReadiness === "Strong"
      ? ShieldCheck
      : data.lenderReadiness === "Needs Work"
        ? Shield
        : ShieldAlert;

  const revComp = data.revenueComposition;
  const costComp = data.costComposition;
  const cumFin = data.cumulativeFinancials;
  const stressTests = data.stressTests;

  const revChartData = revComp?.map((rc, i) => ({
    year: `Year ${i + 1}`,
    "Tuition & Fees": Math.round(rc.tuitionPct * 100),
    "Public & Aid": Math.round(rc.publicPct * 100),
    "Philanthropy": Math.round(rc.philanthropyPct * 100),
  }));

  const PIE_COLORS = [CHART_COLORS.green, CHART_COLORS.teal, CHART_COLORS.amber];
  const y1PieData = revComp && revComp.length > 0
    ? [
        { name: "Tuition & Fees", value: Math.round(revComp[0].tuitionPct * 100) },
        { name: "Public & Aid", value: Math.round(revComp[0].publicPct * 100) },
        { name: "Philanthropy", value: Math.round(revComp[0].philanthropyPct * 100) },
      ].filter((d) => d.value > 0)
    : null;

  const costChartData = costComp?.map((cc, i) => ({
    year: `Year ${i + 1}`,
    "Staffing": Math.round(cc.staffingPctOfRevenue * 100),
    "Facility": Math.round(cc.facilityPctOfRevenue * 100),
    "Other OpEx": Math.round((cc.totalOpexPctOfRevenue - cc.staffingPctOfRevenue - cc.facilityPctOfRevenue) * 100),
  }));

  const cumChartData = cumFin?.map((cf) => ({
    year: `Year ${cf.year}`,
    [cumNiLabel]: cf.cumulativeNetIncome,
    "Reserve (Months)": cf.reserveMonths,
  }));

  const y1Key = `Year 1 ${niLabel}`;
  const fyKey = `Final Year ${niLabel}`;

  const stressChartData = stressTests?.map((st) => ({
    scenario: st.scenario.length > 20 ? st.scenario.substring(0, 18) + "…" : st.scenario,
    fullScenario: st.scenario,
    [y1Key]: st.y1NetIncome,
    [fyKey]: st.y5NetIncome,
    _y1: st.y1NetIncome,
    _fy: st.y5NetIncome,
  }));

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-3xl font-bold text-foreground">
              What Our Analysis Found
            </h2>
            <p className="text-muted-foreground text-base mt-0.5">
              Here's what our school finance team would tell you about your plan.
            </p>
          </div>
        </div>
      </div>

      {data.lendingLabAssessment && (
        <LendingLabCard
          assessment={data.lendingLabAssessment}
          jumpToStep={jumpToStep}
        />
      )}

      <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
        <h3 className="font-display font-bold text-lg text-foreground mb-3">
          Executive Summary
        </h3>
        <p className="text-foreground/80 leading-relaxed text-[15px]">{data.executiveSummary}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50/50 border border-green-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Star className="h-4 w-4 text-green-700" />
            </div>
            <h4 className="font-bold text-green-800 text-sm uppercase tracking-wider">
              Biggest Strength
            </h4>
          </div>
          <p className="text-green-900 font-medium text-[15px]">{data.biggestStrength}</p>
        </div>

        <div className="bg-gradient-to-br from-rose-50 to-red-50/50 border border-rose-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <h4 className="font-bold text-rose-800 text-sm uppercase tracking-wider">
              Biggest Risk
            </h4>
          </div>
          <p className="text-rose-900 font-medium text-[15px]">{data.biggestRisk}</p>
        </div>
      </div>

      {data.topIssues && data.topIssues.length > 0 && (
        <TopIssuesPanel
          issues={data.topIssues}
          jumpToStep={jumpToStep}
        />
      )}

      <div>
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-lg text-foreground">Key Metrics</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.keyMetrics.map((metric, idx) => {
            const StatusIcon =
              metric.status === "good"
                ? CheckCircle2
                : metric.status === "warning"
                  ? AlertTriangle
                  : ShieldAlert;

            const statusColor =
              metric.status === "good"
                ? "text-green-600"
                : metric.status === "warning"
                  ? "text-amber-600"
                  : "text-rose-600";

            const statusBadgeBg =
              metric.status === "good"
                ? "bg-green-100 text-green-700"
                : metric.status === "warning"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-rose-100 text-rose-700";

            const cardBorder =
              metric.status === "good"
                ? "border-green-200/60"
                : metric.status === "warning"
                  ? "border-amber-200/60"
                  : "border-rose-200/60";

            return (
              <div
                key={idx}
                className={cn(
                  "bg-white rounded-2xl p-5 border shadow-sm flex flex-col",
                  cardBorder
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-muted-foreground leading-tight">
                    {metric.name}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", statusBadgeBg)}>
                    <StatusIcon className="h-3 w-3" />
                    {metric.status === "good" ? "Healthy" : metric.status === "warning" ? "Watch" : "Alert"}
                  </span>
                </div>
                <p className={cn("font-display font-bold text-3xl mb-2", statusColor)}>
                  {metric.value}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed mt-auto">
                  {metric.interpretation}
                </p>
                {metric.benchmark && (
                  <p className="text-xs text-blue-600/80 font-medium mt-2 pt-2 border-t border-border/40">
                    {metric.benchmark}
                  </p>
                )}
                {metricNameToKpiId(metric.name) && KPI_FORMULAS[metricNameToKpiId(metric.name)!] && (
                  <button
                    type="button"
                    onClick={() => setOpenKpi(metricNameToKpiId(metric.name)!)}
                    className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary font-medium mt-2 pt-2 border-t border-border/40 transition-colors"
                  >
                    <HelpCircle className="h-3 w-3" aria-hidden="true" />
                    How is this calculated?
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {openKpi && KPI_FORMULAS[openKpi] && (
        <KpiFormulaDrawer
          formula={KPI_FORMULAS[openKpi]}
          open
          onClose={() => setOpenKpi(null)}
          modelId={modelId}
        />
      )}

      {data.healthSignals && data.healthSignals.length > 0 && (
        <HealthSignalsSection signals={data.healthSignals} />
      )}

      {revChartData && revChartData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <PieChartIcon className="h-5 w-5 text-primary" />
            <h3 className="font-display font-bold text-lg text-foreground">Revenue Mix</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {y1PieData && y1PieData.length > 0 && (
              <div className="flex flex-col items-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Year 1 Breakdown</p>
                <div className="h-48 w-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={y1PieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {y1PieData.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {y1PieData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground">{entry.name}: <span className="font-semibold text-foreground">{entry.value}%</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className={cn("h-64", y1PieData && y1PieData.length > 0 ? "lg:col-span-2" : "col-span-full")}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Trend Over Time</p>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" />
                  <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip formatter={(v) => `${v}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="Tuition & Fees" stackId="1" stroke={CHART_COLORS.green} fill={CHART_COLORS.green} fillOpacity={0.7} />
                  <Area type="monotone" dataKey="Public & Aid" stackId="1" stroke={CHART_COLORS.teal} fill={CHART_COLORS.teal} fillOpacity={0.7} />
                  <Area type="monotone" dataKey="Philanthropy" stackId="1" stroke={CHART_COLORS.amber} fill={CHART_COLORS.amber} fillOpacity={0.7} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <CollapsibleTable label="View detailed table">
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs">Source</th>
                    {revComp!.map((_, i) => (
                      <th key={i} className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Year {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/40">
                    <td className="px-4 py-2 font-medium text-xs">Tuition & Fees</td>
                    {revComp!.map((rc, i) => (
                      <td key={i} className="text-right px-4 py-2 text-xs">{fmtPct(rc.tuitionPct)}</td>
                    ))}
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-4 py-2 font-medium text-xs">Public & Aid</td>
                    {revComp!.map((rc, i) => (
                      <td key={i} className="text-right px-4 py-2 text-xs">{fmtPct(rc.publicPct)}</td>
                    ))}
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-4 py-2 font-medium text-xs">Philanthropy</td>
                    {revComp!.map((rc, i) => (
                      <td key={i} className="text-right px-4 py-2 text-xs">{fmtPct(rc.philanthropyPct)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CollapsibleTable>
        </div>
      )}

      {costChartData && costChartData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <ArrowUpRight className="h-5 w-5 text-primary" />
            <h3 className="font-display font-bold text-lg text-foreground">Cost Structure</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<CustomTooltip formatter={(v) => `${v}%`} />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="Staffing" fill={CHART_COLORS.navy} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Facility" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Other OpEx" fill={CHART_COLORS.slate} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <CollapsibleTable label="View detailed table">
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs">Category</th>
                    {costComp!.map((_, i) => (
                      <th key={i} className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Year {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/40">
                    <td className="px-4 py-2 font-medium text-xs">Staffing</td>
                    {costComp!.map((cc, i) => (
                      <td key={i} className="text-right px-4 py-2 text-xs">{fmtPct(cc.staffingPctOfRevenue)}</td>
                    ))}
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-4 py-2 font-medium text-xs">Facility</td>
                    {costComp!.map((cc, i) => (
                      <td key={i} className="text-right px-4 py-2 text-xs">{fmtPct(cc.facilityPctOfRevenue)}</td>
                    ))}
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-4 py-2 font-medium text-xs">Total OpEx</td>
                    {costComp!.map((cc, i) => (
                      <td key={i} className="text-right px-4 py-2 text-xs">{fmtPct(cc.totalOpexPctOfRevenue)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CollapsibleTable>
        </div>
      )}

      {cumChartData && cumChartData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h3 className="font-display font-bold text-lg text-foreground">Cumulative Financials</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="cumNetGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.green} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${fmtCompact(v)}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}mo`} />
                <Tooltip content={<CustomTooltip formatByName={{ [cumNiLabel]: (v) => fmtCurrency(v), "Reserve (Months)": (v) => `${Number(v).toFixed(1)} months` }} />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area yAxisId="left" type="monotone" dataKey={cumNiLabel} stroke={CHART_COLORS.green} strokeWidth={2.5} fill="url(#cumNetGradient)" dot={{ r: 4, fill: CHART_COLORS.green }} activeDot={{ r: 6 }} />
                <Area yAxisId="right" type="monotone" dataKey="Reserve (Months)" stroke={CHART_COLORS.amber} strokeWidth={2.5} strokeDasharray="5 5" fill="transparent" dot={{ r: 4, fill: CHART_COLORS.amber }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <CollapsibleTable label="View detailed table">
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs">Metric</th>
                    {cumFin!.map((cf) => (
                      <th key={cf.year} className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Year {cf.year}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border/40">
                    <td className="px-4 py-2 font-medium text-xs">{cumNiLabel}</td>
                    {cumFin!.map((cf) => (
                      <td key={cf.year} className={cn("text-right px-4 py-2 font-semibold text-xs", cf.cumulativeNetIncome >= 0 ? "text-green-700" : "text-rose-700")}>
                        {fmtCurrency(cf.cumulativeNetIncome)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-4 py-2 font-medium text-xs">Reserve (Months)</td>
                    {cumFin!.map((cf) => (
                      <td key={cf.year} className={cn("text-right px-4 py-2 font-semibold text-xs", cf.reserveMonths >= 3 ? "text-green-700" : cf.reserveMonths >= 1 ? "text-amber-700" : "text-rose-700")}>
                        {cf.reserveMonths.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CollapsibleTable>
        </div>
      )}

      {stressChartData && stressChartData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="font-display font-bold text-lg text-foreground">Stress Tests</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-5">What happens under adverse scenarios?</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stressChartData} margin={{ top: 5, right: 10, left: 10, bottom: 40 }} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" />
                <XAxis dataKey="scenario" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${fmtCompact(v)}`} />
                <Tooltip content={<CustomTooltip formatter={(v) => fmtCurrency(v)} />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey={y1Key} fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]}>
                  {stressChartData.map((entry, index) => (
                    <Cell key={index} fill={entry._y1 >= 0 ? CHART_COLORS.blue : CHART_COLORS.rose} />
                  ))}
                </Bar>
                <Bar dataKey={fyKey} fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]}>
                  {stressChartData.map((entry, index) => (
                    <Cell key={index} fill={entry._fy >= 0 ? CHART_COLORS.teal : CHART_COLORS.rose} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <CollapsibleTable label="View detailed table">
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs">Scenario</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Year 1 {niLabel}</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Final Year {niLabel}</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs">Break-Even</th>
                  </tr>
                </thead>
                <tbody>
                  {stressTests!.map((st, idx) => (
                    <tr key={idx} className="border-t border-border/40">
                      <td className="px-4 py-2 font-medium text-xs">{st.scenario}</td>
                      <td className={cn("text-right px-4 py-2 font-semibold text-xs", st.y1NetIncome >= 0 ? "text-green-700" : "text-rose-700")}>
                        {fmtCurrency(st.y1NetIncome)}
                      </td>
                      <td className={cn("text-right px-4 py-2 font-semibold text-xs", st.y5NetIncome >= 0 ? "text-green-700" : "text-rose-700")}>
                        {fmtCurrency(st.y5NetIncome)}
                      </td>
                      <td className="text-right px-4 py-2 font-semibold text-xs">
                        {st.breakEvenYear ? `Year ${st.breakEvenYear}` : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleTable>
        </div>
      )}

      {data.sensitivityMatrix && data.sensitivityMatrix.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Grid3X3 className="h-5 w-5 text-primary" />
            <h3 className="font-display font-bold text-lg text-foreground">Sensitivity Analysis</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Sensitivity analysis shows how your bottom line changes under different scenarios. Lenders use these tables to stress-test your model — green cells indicate healthy margins while red signals risk.
          </p>
          {data.expenseSensitivityMatrix && data.expenseSensitivityMatrix.length > 0 && (
            <div className="flex gap-1 mb-3 bg-secondary/30 rounded-lg p-1 w-fit">
              <button
                onClick={() => setSensitivityTab("revenue")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                  sensitivityTab === "revenue"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Enrollment × Tuition
              </button>
              <button
                onClick={() => setSensitivityTab("expense")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                  sensitivityTab === "expense"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Enrollment × Expense Inflation
              </button>
            </div>
          )}
          {sensitivityTab === "revenue" && (() => {
            const enrollPcts = [...new Set(data.sensitivityMatrix.map(c => c.enrollmentPct))].sort((a, b) => a - b);
            const tuitionPcts = [...new Set(data.sensitivityMatrix.map(c => c.tuitionPct))].sort((a, b) => a - b);
            const cellMap = new Map<string, number>();
            for (const c of data.sensitivityMatrix) {
              cellMap.set(`${c.enrollmentPct}_${c.tuitionPct}`, c.netIncome);
            }
            return (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Final year {niLabel.toLowerCase()} under different enrollment and tuition assumptions.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/50">
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Enrollment \ Tuition</th>
                        {tuitionPcts.map(tp => (
                          <th key={tp} className="px-3 py-2 text-center font-semibold text-muted-foreground">
                            {tp >= 0 ? "+" : ""}{tp}%
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enrollPcts.map(ep => (
                        <tr key={ep} className="border-t border-border/40">
                          <td className="px-3 py-2 font-medium">
                            {ep >= 0 ? "+" : ""}{ep}% Enrollment
                          </td>
                          {tuitionPcts.map(tp => {
                            const ni = cellMap.get(`${ep}_${tp}`) || 0;
                            const isBase = ep === 0 && tp === 0;
                            return (
                              <td
                                key={tp}
                                className={cn(
                                  "px-3 py-2 text-center font-semibold",
                                  isBase ? "bg-blue-50 ring-1 ring-blue-300 rounded" : "",
                                  ni >= 0 ? "text-green-700" : "text-rose-700"
                                )}
                              >
                                {fmtCompact(ni)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
          {sensitivityTab === "expense" && data.expenseSensitivityMatrix && (() => {
            const enrollPcts = [...new Set(data.expenseSensitivityMatrix.map(c => c.enrollmentPct))].sort((a, b) => a - b);
            const inflPcts = [...new Set(data.expenseSensitivityMatrix.map(c => c.expenseInflationPct))].sort((a, b) => a - b);
            const cellMap = new Map<string, number>();
            for (const c of data.expenseSensitivityMatrix) {
              cellMap.set(`${c.enrollmentPct}_${c.expenseInflationPct}`, c.netIncome);
            }
            return (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Final year {niLabel.toLowerCase()} under different enrollment and expense inflation assumptions.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/50">
                        <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Enrollment \ Expense Inflation</th>
                        {inflPcts.map(ip => (
                          <th key={ip} className="px-3 py-2 text-center font-semibold text-muted-foreground">
                            {ip >= 0 ? "+" : ""}{ip}%
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enrollPcts.map(ep => (
                        <tr key={ep} className="border-t border-border/40">
                          <td className="px-3 py-2 font-medium">
                            {ep >= 0 ? "+" : ""}{ep}% Enrollment
                          </td>
                          {inflPcts.map(ip => {
                            const ni = cellMap.get(`${ep}_${ip}`) || 0;
                            const isBase = ep === 0 && ip === 0;
                            return (
                              <td
                                key={ip}
                                className={cn(
                                  "px-3 py-2 text-center font-semibold",
                                  isBase ? "bg-blue-50 ring-1 ring-blue-300 rounded" : "",
                                  ni >= 0 ? "text-green-700" : "text-rose-700"
                                )}
                              >
                                {fmtCompact(ni)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {data.cashRunwayMonths !== undefined && (
        <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-primary" />
            <h3 className="font-display font-bold text-lg text-foreground">Cash Runway</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className={cn(
              "text-4xl font-bold font-display",
              data.cashRunwayMonths >= 36 ? "text-green-700" : data.cashRunwayMonths >= 18 ? "text-amber-700" : "text-rose-700"
            )}>
              {data.cashRunwayMonths >= 60 ? "60+" : data.cashRunwayMonths} months
            </div>
            <p className="text-sm text-muted-foreground">
              {data.cashRunwayMonths >= 60
                ? "Your school maintains positive cash throughout the entire projection period. Strong financial sustainability."
                : data.cashRunwayMonths >= 36
                  ? "Cash remains positive for 3+ years. A solid foundation, but continue building reserves."
                  : data.cashRunwayMonths >= 12
                    ? "Cash runway is limited. Focus on building reserves and securing backup funding sources."
                    : "Cash runs out within the first year. Immediate action needed: secure additional funding or reduce costs."}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-lg text-foreground">
            Recommended Actions
          </h3>
        </div>
        <div className="space-y-3">
          {data.recommendations.map((rec, idx) => {
            const priorityColor =
              rec.priority === "high"
                ? "bg-rose-100 text-rose-700 border-rose-200"
                : rec.priority === "medium"
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-teal-100 text-teal-700 border-teal-200";

            return (
              <div
                key={idx}
                className="rounded-xl p-4 border border-border/50 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold text-sm shrink-0">
                      {idx + 1}
                    </span>
                    <h4 className="font-bold text-foreground text-sm">{rec.title}</h4>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-bold uppercase px-2.5 py-1 rounded-full border whitespace-nowrap",
                      priorityColor
                    )}
                  >
                    {rec.priority}
                  </span>
                </div>
                <p className="text-foreground/60 text-sm leading-relaxed ml-10">
                  {rec.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className={cn("rounded-2xl p-6 border shadow-sm", lenderBg)}>
        <div className="flex items-center gap-4 mb-3">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center",
            data.lenderReadiness === "Strong" ? "bg-green-100" :
            data.lenderReadiness === "Needs Work" ? "bg-amber-100" : "bg-rose-100"
          )}>
            <LenderIcon className={cn("h-6 w-6", lenderColor)} />
          </div>
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
              Lending Lab Readiness
            </h4>
            <p className={cn("font-display font-bold text-2xl", lenderColor)}>
              {data.lenderReadiness}
            </p>
          </div>
        </div>
        <p className="text-foreground/50 text-sm leading-relaxed mb-3 italic">
          Thinking about a loan? The Building Hope Impact Fund Lending Lab offers small, affordable loans for early-stage schools. Here&rsquo;s how your model stacks up against their criteria.
        </p>
        <p className="text-foreground/70 leading-relaxed text-[15px]">
          {data.lenderReadinessExplanation}
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/60 via-white to-amber-50/60 p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <HelpCircle className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground mb-1">Want a real advisor to look at this?</p>
          <p className="text-sm text-muted-foreground">
            Request a free expert review — our school finance team will walk through your model and send you personalized feedback within 5–7 business days.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (jumpToStep) jumpToStep(exportStepNumber);
          }}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap transition-colors mt-1"
        >
          Request free review <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
