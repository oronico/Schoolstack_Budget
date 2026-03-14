import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { useGetConsultantAnalysis } from "@workspace/api-client-react";
import { profitLabel, cumulativeProfitLabel } from "../schema";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Loader2,
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
  PieChart,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConsultantStepProps {
  jumpToStep?: (step: number) => void;
  modelId: number | null;
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
  green: "#16A34A",
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

function CustomTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; formatter?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg border border-border/60 shadow-lg px-3.5 py-2.5 text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold text-foreground ml-auto">{formatter ? formatter(entry.value) : entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ConsultantStep({ modelId }: ConsultantStepProps) {
  const { watch } = useFormContext();
  const entityType = watch("schoolProfile.entityType");
  const niLabel = profitLabel(entityType);
  const cumNiLabel = cumulativeProfitLabel(entityType);
  const [hasRequested, setHasRequested] = useState(false);

  const { data, isLoading, error, refetch } = useGetConsultantAnalysis(modelId || 0, {
    query: {
      queryKey: [`/api/models/${modelId || 0}/consultant`],
      enabled: false,
    },
  });

  useEffect(() => {
    if (modelId && !hasRequested) {
      setHasRequested(true);
      refetch();
    }
  }, [modelId, hasRequested, refetch]);

  if (isLoading || !hasRequested) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground mb-2">
          Running Your Financial Analysis
        </h2>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          Our consultant is reviewing your model and preparing recommendations...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 mb-6">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground mb-2">
          Analysis Unavailable
        </h2>
        <p className="text-muted-foreground text-lg mb-6">
          We couldn't complete the analysis. Please try again.
        </p>
        <button
          onClick={() => refetch()}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

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

  const revComp = data.revenueComposition as Array<{ tuitionPct: number; publicPct: number; philanthropyPct: number }> | undefined;
  const costComp = data.costComposition as Array<{ staffingPctOfRevenue: number; facilityPctOfRevenue: number; totalOpexPctOfRevenue: number }> | undefined;
  const cumFin = data.cumulativeFinancials as Array<{ year: number; cumulativeNetIncome: number; reserveMonths: number }> | undefined;
  const stressTests = data.stressTests as Array<{ scenario: string; y1NetIncome: number; y5NetIncome: number; breakEvenYear: number | null }> | undefined;

  const revChartData = revComp?.map((rc, i) => ({
    year: `Year ${i + 1}`,
    "Tuition & Fees": Math.round(rc.tuitionPct * 100),
    "Public & Aid": Math.round(rc.publicPct * 100),
    "Philanthropy": Math.round(rc.philanthropyPct * 100),
  }));

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
              Your Financial Health Check
            </h2>
            <p className="text-muted-foreground text-base mt-0.5">
              Here's what a school finance consultant would tell you about your plan.
            </p>
          </div>
        </div>
      </div>

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
              Lender Readiness
            </h4>
            <p className={cn("font-display font-bold text-2xl", lenderColor)}>
              {data.lenderReadiness}
            </p>
          </div>
        </div>
        <p className="text-foreground/70 leading-relaxed text-[15px]">
          {data.lenderReadinessExplanation}
        </p>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-lg text-foreground">Key Metrics</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.keyMetrics.map(
            (
              metric: {
                name: string;
                value: string;
                status: string;
                interpretation: string;
              },
              idx: number
            ) => {
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
                </div>
              );
            }
          )}
        </div>
      </div>

      {revChartData && revChartData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <PieChart className="h-5 w-5 text-primary" />
            <h3 className="font-display font-bold text-lg text-foreground">Revenue Mix</h3>
          </div>
          <div className="h-64">
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
              <LineChart data={cumChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 15% 88%)" />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${fmtCompact(v)}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}mo`} />
                <Tooltip content={<CustomTooltip formatter={(v) => typeof v === "number" && Math.abs(v) > 100 ? fmtCurrency(v) : `${Number(v).toFixed(1)} months`} />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line yAxisId="left" type="monotone" dataKey={cumNiLabel} stroke={CHART_COLORS.green} strokeWidth={2.5} dot={{ r: 4, fill: CHART_COLORS.green }} activeDot={{ r: 6 }} />
                <Line yAxisId="right" type="monotone" dataKey="Reserve (Months)" stroke={CHART_COLORS.amber} strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 4, fill: CHART_COLORS.amber }} activeDot={{ r: 6 }} />
              </LineChart>
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

      <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h3 className="font-display font-bold text-lg text-foreground">
            Recommended Actions
          </h3>
        </div>
        <div className="space-y-3">
          {data.recommendations.map(
            (
              rec: { title: string; description: string; priority: string },
              idx: number
            ) => {
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
            }
          )}
        </div>
      </div>
    </div>
  );
}
