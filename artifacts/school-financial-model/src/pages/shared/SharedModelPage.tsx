import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { TrendingUp, TrendingDown, Users, DollarSign, Shield, Clock, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "@/lib/benchmark-thresholds";
import { SEOHead } from "@/components/SEOHead";

interface SharedModelData {
  schoolName: string;
  state: string;
  schoolType: string;
  entityType: string;
  enrollment: number[];
  revenue: number[];
  expenses: number[];
  netIncome: number[];
  staffingCost: number[];
  facilityCost: number[];
  debtService: number[];
  netMargin: number[];
  dscr: number[];
  reserveMonths: number;
  cashRunwayMonths: number;
  daysCashOnHand: number;
  revenueBreakdown: { tuition: number; public: number; philanthropy: number }[];
  executiveSummary: string | null;
  lenderReadiness: string | null;
  createdAt: string;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function MetricCard({ label, value, subtext, icon: Icon, status }: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ElementType;
  status?: "good" | "warning" | "danger";
}) {
  const colors = {
    good: "text-green-600 bg-green-50 border-green-200",
    warning: "text-amber-600 bg-amber-50 border-amber-200",
    danger: "text-red-600 bg-red-50 border-red-200",
  };
  const c = status ? colors[status] : "text-slate-600 bg-slate-50 border-slate-200";
  return (
    <div className={`rounded-xl border p-5 ${c}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 opacity-70" />
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtext && <div className="text-xs mt-1 opacity-70">{subtext}</div>}
    </div>
  );
}

function SummaryTable({ data }: { data: SharedModelData }) {
  const years = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  const rows: { label: string; values: string[]; bold?: boolean }[] = [
    { label: "Enrollment", values: data.enrollment.map(e => e.toLocaleString()) },
    { label: "Total Revenue", values: data.revenue.map(fmt), bold: true },
    { label: "Total Expenses", values: data.expenses.map(fmt), bold: true },
    { label: "Net Income", values: data.netIncome.map(fmt), bold: true },
    { label: "Net Margin", values: data.netMargin.map(pct) },
  ];

  if (data.dscr.some(d => d > 0)) {
    rows.push({ label: "DSCR", values: data.dscr.map(d => d > 0 ? `${d.toFixed(2)}x` : "N/A") });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-left py-3 pr-4 font-semibold text-slate-500 w-40"></th>
            {years.map(y => (
              <th key={y} className="text-right py-3 px-3 font-semibold text-slate-600 min-w-[100px]">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-slate-100 ${row.bold ? "font-semibold" : ""}`}>
              <td className="py-2.5 pr-4 text-slate-600">{row.label}</td>
              {row.values.map((v, j) => (
                <td key={j} className={`text-right py-2.5 px-3 ${row.label === "Net Income" ? (data.netIncome[j] >= 0 ? "text-green-700" : "text-red-600") : "text-slate-800"}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenueBreakdownSection({ data }: { data: SharedModelData }) {
  const years = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-left py-3 pr-4 font-semibold text-slate-500 w-40"></th>
            {years.map(y => (
              <th key={y} className="text-right py-3 px-3 font-semibold text-slate-600 min-w-[100px]">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Tuition & Fees</td>
            {data.revenueBreakdown.map((rb, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(rb.tuition)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Public Funding</td>
            {data.revenueBreakdown.map((rb, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(rb.public)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Grants & Philanthropy</td>
            {data.revenueBreakdown.map((rb, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(rb.philanthropy)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100 font-semibold">
            <td className="py-2.5 pr-4 text-slate-600">Total Revenue</td>
            {data.revenue.map((r, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(r)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ExpenseBreakdownSection({ data }: { data: SharedModelData }) {
  const years = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  const otherOpex = data.expenses.map((e, i) => e - data.staffingCost[i] - data.facilityCost[i] - data.debtService[i]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-left py-3 pr-4 font-semibold text-slate-500 w-40"></th>
            {years.map(y => (
              <th key={y} className="text-right py-3 px-3 font-semibold text-slate-600 min-w-[100px]">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Staffing</td>
            {data.staffingCost.map((s, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(s)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Facility</td>
            {data.facilityCost.map((f, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(f)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Other Operating</td>
            {otherOpex.map((o, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(o)}</td>
            ))}
          </tr>
          {data.debtService.some(d => d > 0) && (
            <tr className="border-b border-slate-100">
              <td className="py-2.5 pr-4 text-slate-600">Debt Service</td>
              {data.debtService.map((d, i) => (
                <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(d)}</td>
              ))}
            </tr>
          )}
          <tr className="border-b border-slate-100 font-semibold">
            <td className="py-2.5 pr-4 text-slate-600">Total Expenses</td>
            {data.expenses.map((e, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(e)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function EnrollmentChart({ enrollment }: { enrollment: number[] }) {
  const max = Math.max(...enrollment, 1);

  return (
    <div className="flex items-end gap-3 h-40">
      {enrollment.map((e, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-semibold text-slate-700">{e}</span>
          <div
            className="w-full bg-amber-500 rounded-t-md transition-all"
            style={{ height: `${Math.max((e / max) * 120, 4)}px` }}
          />
          <span className="text-xs text-slate-500">Y{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function LenderReadinessBadge({ readiness }: { readiness: string }) {
  const config = {
    "Strong": { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
    "Needs Work": { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
    "Not Yet Ready": { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  }[readiness] || { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-300" };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${config.bg} ${config.text} ${config.border}`}>
      {readiness === "Strong" && <Shield className="h-3.5 w-3.5" />}
      {readiness === "Needs Work" && <AlertTriangle className="h-3.5 w-3.5" />}
      {readiness}
    </span>
  );
}

export function SharedModelPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<SharedModelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.token) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    fetch(`${apiBase}/api/shared/${params.token}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load shared model.");
        }
        return res.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Unable to load model</h2>
          <p className="text-slate-500">{error || "This shared link may have expired or been revoked."}</p>
        </div>
      </div>
    );
  }

  const y1Margin = data.netMargin[0];
  const y5NetIncome = data.netIncome[4];

  return (
    <div className="min-h-screen bg-slate-50">
      <SEOHead
        title={`${data.schoolName} - Shared Model`}
        description="Shared financial model view on SchoolStack Budget."
        path={`/shared/${params.token}`}
        noIndex
      />
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{data.schoolName}</h1>
            <div className="flex items-center gap-3 mt-1">
              {data.state && <span className="text-sm text-slate-500">{data.state}</span>}
              {data.schoolType && <span className="text-sm text-slate-500">• {data.schoolType}</span>}
              {data.lenderReadiness && (
                <LenderReadinessBadge readiness={data.lenderReadiness} />
              )}
            </div>
          </div>
          <div className="text-xs text-slate-400">5-Year Financial Model</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {data.executiveSummary && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
            <h2 className="text-lg font-bold text-slate-800 mb-3">Executive Summary</h2>
            <p className="text-slate-600 leading-relaxed whitespace-pre-line">{data.executiveSummary}</p>
          </section>
        )}

        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <MetricCard
            label="Year 1 Enrollment"
            value={data.enrollment[0].toLocaleString()}
            subtext={`→ ${data.enrollment[4].toLocaleString()} by Year 5`}
            icon={Users}
          />
          <MetricCard
            label="Year 1 Revenue"
            value={fmt(data.revenue[0])}
            icon={DollarSign}
          />
          <MetricCard
            label="Year 1 Net Margin"
            value={pct(y1Margin)}
            icon={y1Margin >= 0 ? TrendingUp : TrendingDown}
            status={y1Margin >= 0.05 ? "good" : y1Margin >= 0 ? "warning" : "danger"}
          />
          <MetricCard
            label="Days Cash on Hand"
            value={`${data.daysCashOnHand}`}
            icon={Clock}
            status={data.daysCashOnHand >= 60 ? "good" : data.daysCashOnHand >= 30 ? "warning" : "danger"}
          />
          <MetricCard
            label="Year 5 Net Income"
            value={fmt(y5NetIncome)}
            icon={y5NetIncome >= 0 ? TrendingUp : TrendingDown}
            status={y5NetIncome > 0 ? "good" : "danger"}
          />
        </section>

        {data.dscr.some(d => d > 0) && (
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <MetricCard
              label="Year 1 DSCR"
              value={data.dscr[0] > 0 ? `${data.dscr[0].toFixed(2)}x` : "N/A"}
              subtext="Debt service coverage ratio"
              icon={Shield}
              status={data.dscr[0] >= BENCHMARK_DSCR_GREEN ? "good" : data.dscr[0] >= BENCHMARK_DSCR_AMBER ? "warning" : "danger"}
            />
            <MetricCard
              label="Reserve Months"
              value={data.reserveMonths.toFixed(1)}
              subtext="Operating reserves by Year 5"
              icon={Clock}
              status={data.reserveMonths >= 3 ? "good" : data.reserveMonths > 0 ? "warning" : "danger"}
            />
            <MetricCard
              label="Cash Runway"
              value={`${data.cashRunwayMonths} mo`}
              subtext="Before cash runs out"
              icon={Clock}
              status={data.cashRunwayMonths >= 36 ? "good" : data.cashRunwayMonths >= 18 ? "warning" : "danger"}
            />
          </section>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Enrollment Projection</h2>
          <EnrollmentChart enrollment={data.enrollment} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">5-Year Financial Summary</h2>
          <SummaryTable data={data} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Revenue Breakdown</h2>
          <RevenueBreakdownSection data={data} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Expense Breakdown</h2>
          <ExpenseBreakdownSection data={data} />
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Powered by</span>
            <a
              href="https://budget.schoolstack.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-amber-600 hover:text-amber-700 transition-colors inline-flex items-center gap-1"
            >
              SchoolStack <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="text-xs text-slate-400">
            Shared on {new Date(data.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>
      </footer>
    </div>
  );
}
