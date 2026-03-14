import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import {
  Users,
  FileSpreadsheet,
  Download,
  TrendingUp,
  Clock,
  BarChart3,
  Loader2,
  ShieldAlert,
  Landmark,
  GraduationCap,
  DollarSign,
  CalendarRange,
} from "lucide-react";
import { format } from "date-fns";

interface AnalyticsData {
  totalUsers: number;
  totalModels: number;
  totalExports: number;
  recentSignups: {
    id: number;
    email: string;
    name: string;
    createdAt: string;
  }[];
  recentExports: {
    id: number;
    format: string;
    modelName: string;
    userName: string;
    createdAt: string;
  }[];
  schoolTypeDistribution: { type: string; count: number }[];
  schoolStageDistribution: { stage: string; count: number }[];
  fundingProfileDistribution: { profile: string; count: number }[];
  topRevenueLines: { lineItem: string; count: number }[];
  topExpenseCategories: { category: string; count: number }[];
  exportRateByType: { type: string; totalModels: number; exportedModels: number; rate: number }[];
  year5Adoption: { totalRowModels: number; extendedTo5: number; rate: number };
  funnel: {
    signedUp: number;
    createdModel: number;
    reachedReview: number;
    exported: number;
  };
}

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  charter_school: "Charter School",
  homeschool_coop: "Homeschool Co-Op",
  learning_pod: "Learning Pod",
  microschool: "Microschool",
  private_school: "Private School",
  tutoring_center: "Tutoring Center",
  other: "Other",
};

const STAGE_LABELS: Record<string, string> = {
  new_school: "New School",
  operating_school: "Operating School",
};

const FUNDING_LABELS: Record<string, string> = {
  tuition_based: "Tuition-Based",
  charter_public_funded: "Charter / Public",
  hybrid_mixed: "Hybrid / Mixed",
};

const EXPENSE_CAT_LABELS: Record<string, string> = {
  instructional_program: "Instructional",
  technology: "Technology",
  occupancy_facility: "Occupancy",
  administrative_general: "Admin / General",
};

function MetricCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 text-primary rounded-xl">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground tracking-tight">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  maxValue,
}: {
  label: string;
  value: number;
  maxValue: number;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {value} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-3 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RankedList({
  items,
  labelMap,
}: {
  items: { label: string; count: number }[];
  labelMap?: Record<string, string>;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  const maxCount = Math.max(...items.map((i) => i.count));
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-foreground truncate mr-2">
              {labelMap?.[item.label] || item.label}
            </span>
            <span className="text-muted-foreground flex-shrink-0">{item.count}</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch("/api/admin/analytics");
        if (res.status === 403) {
          setError("forbidden");
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch analytics");
        const json = await res.json();
        setData(json);
      } catch {
        setError("error");
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error === "forbidden") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <div className="p-4 bg-destructive/10 text-destructive rounded-2xl">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h2 className="font-display text-2xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground text-center max-w-md">
            You do not have admin access. This page is restricted to authorized
            administrators.
          </p>
          <button
            onClick={() => setLocation("/dashboard")}
            className="mt-4 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-destructive">Failed to load analytics data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-bold text-foreground tracking-tight">
            Admin Analytics
          </h1>
          <p className="text-muted-foreground mt-2">
            Platform usage overview and key metrics.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <MetricCard title="Total Users" value={data.totalUsers} icon={Users} />
          <MetricCard title="Total Models" value={data.totalModels} icon={FileSpreadsheet} />
          <MetricCard title="Total Exports" value={data.totalExports} icon={Download} />
          <MetricCard
            title="Year 5 Adoption"
            value={`${(data.year5Adoption.rate * 100).toFixed(0)}%`}
            icon={CalendarRange}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Conversion Funnel
              </h2>
            </div>
            <div className="space-y-4">
              <FunnelBar label="Signed Up" value={data.funnel.signedUp} maxValue={data.funnel.signedUp} />
              <FunnelBar label="Created Model" value={data.funnel.createdModel} maxValue={data.funnel.signedUp} />
              <FunnelBar label="Reached Review" value={data.funnel.reachedReview} maxValue={data.funnel.signedUp} />
              <FunnelBar label="Exported XLSX" value={data.funnel.exported} maxValue={data.funnel.signedUp} />
            </div>
          </div>

          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                School Type Distribution
              </h2>
            </div>
            <RankedList
              items={data.schoolTypeDistribution.map((s) => ({ label: s.type, count: s.count }))}
              labelMap={SCHOOL_TYPE_LABELS}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <GraduationCap className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                School Stage Distribution
              </h2>
            </div>
            <RankedList
              items={data.schoolStageDistribution.map((s) => ({ label: s.stage, count: s.count }))}
              labelMap={STAGE_LABELS}
            />
          </div>

          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Landmark className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Funding Profile Distribution
              </h2>
            </div>
            <RankedList
              items={data.fundingProfileDistribution.map((f) => ({ label: f.profile, count: f.count }))}
              labelMap={FUNDING_LABELS}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <DollarSign className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Most Used Revenue Lines
              </h2>
            </div>
            <RankedList
              items={data.topRevenueLines.map((r) => ({ label: r.lineItem, count: r.count }))}
            />
          </div>

          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Most Used Expense Categories
              </h2>
            </div>
            <RankedList
              items={data.topExpenseCategories.map((e) => ({ label: e.category, count: e.count }))}
              labelMap={EXPENSE_CAT_LABELS}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Download className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Export Rate by School Type
              </h2>
            </div>
            {data.exportRateByType.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-3">
                {data.exportRateByType.map((item) => (
                  <div key={item.type} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm font-medium text-foreground">
                      {SCHOOL_TYPE_LABELS[item.type] || item.type}
                    </span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-foreground">
                        {(item.rate * 100).toFixed(0)}%
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({item.exportedModels}/{item.totalModels})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <CalendarRange className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Year 5 Extension Adoption
              </h2>
            </div>
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <div className="text-5xl font-bold text-primary">
                {(data.year5Adoption.rate * 100).toFixed(0)}%
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {data.year5Adoption.extendedTo5} of {data.year5Adoption.totalRowModels} models
                extended to 5-year projections
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Recent Signups
              </h2>
            </div>
            {data.recentSignups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No signups yet.</p>
            ) : (
              <div className="space-y-3">
                {data.recentSignups.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {u.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(u.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Download className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Recent Exports
              </h2>
            </div>
            {data.recentExports.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exports yet.</p>
            ) : (
              <div className="space-y-3">
                {data.recentExports.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {e.modelName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        by {e.userName} &middot; {e.format.toUpperCase()}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(e.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
