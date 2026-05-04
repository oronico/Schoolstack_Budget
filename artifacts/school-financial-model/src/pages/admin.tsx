import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
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
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Bug,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Star,
  ClipboardCheck,
  Send,
  CheckCircle2,
  ArrowLeft,
  Eye,
  MousePointerClick,
  Compass,
} from "lucide-react";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    // Set when this export was triggered by a recipient downloading via a
    // /shared/:token link (recorded against the model owner). The optional
    // viewerLabel is whatever the founder named the link for, e.g. "Board
    // Chair" or "First National Bank".
    viaSharedLink?: boolean;
    viewerLabel?: string | null;
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

interface FeedbackItem {
  id: number;
  category: string;
  message: string;
  score: number | null;
  pageUrl: string | null;
  email: string | null;
  userName: string | null;
  userId: number | null;
  createdAt: string;
}

interface FeedbackResponse {
  items: FeedbackItem[];
  total: number;
  page: number;
  limit: number;
}

function getNpsLabel(score: number): string {
  if (score >= 9) return "Promoter";
  if (score >= 7) return "Passive";
  return "Detractor";
}

function getNpsColor(score: number): string {
  if (score >= 9) return "text-green-600";
  if (score >= 7) return "text-amber-600";
  return "text-red-600";
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  like: { label: "What I like", icon: ThumbsUp, color: "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30" },
  dislike: { label: "What I don't like", icon: ThumbsDown, color: "text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30" },
  bug: { label: "Bug report", icon: Bug, color: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30" },
  feature: { label: "Feature request", icon: Sparkles, color: "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30" },
  nps: { label: "NPS", icon: Star, color: "text-violet-600 bg-violet-100 dark:text-violet-400 dark:bg-violet-900/30" },
};

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
  instructional_program: "Program",
  technology: "Technology",
  occupancy_facility: "Facility",
  administrative_general: "Admin & Operations",
};

type CtaRange = "7d" | "30d" | "90d" | "all";

interface CtaSummaryRow {
  clicks: number;
  signups: number;
  conversionRate: number;
  previousClicks: number;
  previousSignups: number;
  previousConversionRate: number;
  sparkline: number[];
}

interface CtaConversionData {
  range: CtaRange;
  bucketUnit: "day" | "week" | null;
  bucketCount: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  capability: {
    summary: (CtaSummaryRow & { source: string })[];
    byPosition: { source: string; position: string; clicks: number }[];
  };
  audience: {
    summary: (CtaSummaryRow & { audience: string })[];
  };
  crossLinks: (CtaSummaryRow & { audience: string; source: string })[];
  sectionEngagement?: {
    source: string;
    sections: {
      section: string;
      impressions: number;
      clicks: number;
      signups: number;
      clickRate: number;
      impressionsTrend: number[];
      clicksTrend: number[];
    }[];
    scrollDepth: { d25: number; d50: number; d75: number; d100: number };
  }[];
}

const RANGE_OPTIONS: { value: CtaRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

// Tiny inline SVG sparkline for the trend cells. Returns a placeholder
// dash when there are no data points yet (e.g. brand new capability page).
function MiniSparkline({ values, color = "#0f766e" }: { values: number[]; color?: string }) {
  if (!values || values.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const max = Math.max(...values, 1);
  const min = 0;
  const range = max - min || 1;
  const width = 80;
  const height = 22;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const path = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-label="Trend"
    >
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Render a delta vs the prior period. If the prior was 0 we skip the
// percentage to avoid showing infinite/NaN; "new" keeps it human readable.
function DeltaBadge({ current, previous, invertColor = false }: { current: number; previous: number; invertColor?: boolean }) {
  if (previous === 0 && current === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  if (previous === 0) {
    return (
      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">new</span>
    );
  }
  const delta = (current - previous) / previous;
  const pct = (delta * 100).toFixed(0);
  const sign = delta > 0 ? "+" : "";
  const isPositive = delta > 0;
  const goodColor = invertColor ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400";
  const badColor = invertColor ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  const color = delta === 0 ? "text-muted-foreground" : isPositive ? goodColor : badColor;
  return (
    <span className={`text-[11px] font-medium ${color}`}>
      {sign}
      {pct}%
    </span>
  );
}

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  inside_product: "Inside the product",
  how_it_works: "How it works",
  faq: "FAQ",
  closing_cta: "Closing CTA",
};

const CAPABILITY_LABELS: Record<string, string> = {
  "single-year-pro-forma": "Single-Year Pro Forma",
  "five-year-pro-forma": "Five-Year Pro Forma",
  "scenario-planning": "Scenario Planning",
  "debt-analysis": "Debt Analysis",
  "budgeting-accounting-guidance": "Budgeting & Accounting",
};

const AUDIENCE_LABELS: Record<string, string> = {
  "charter-schools": "Charter Schools",
  "private-schools": "Private Schools",
  "microschools": "Microschools & Pods",
  "school-founders": "School Founders",
  "lenders": "Lenders & CDFIs",
};

function CtaConversionSection() {
  const [data, setData] = useState<CtaConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<CtaRange>("30d");

  useEffect(() => {
    let cancelled = false;
    async function fetchCta() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/cta-conversion?range=${range}`);
        if (!res.ok) throw new Error("Failed to fetch CTA conversion");
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Failed to load CTA conversion data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCta();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const positionByCapability = new Map<string, Record<string, number>>();
  if (data) {
    for (const row of data.capability.byPosition) {
      const map = positionByCapability.get(row.source) || {};
      map[row.position] = row.clicks;
      positionByCapability.set(row.source, map);
    }
  }

  const totalCapClicks = data?.capability.summary.reduce((s, r) => s + r.clicks, 0) ?? 0;
  const totalCapSignups = data?.capability.summary.reduce((s, r) => s + r.signups, 0) ?? 0;
  const totalCapPriorClicks = data?.capability.summary.reduce((s, r) => s + r.previousClicks, 0) ?? 0;
  const totalCapPriorSignups = data?.capability.summary.reduce((s, r) => s + r.previousSignups, 0) ?? 0;
  const totalAudClicks = data?.audience.summary.reduce((s, r) => s + r.clicks, 0) ?? 0;
  const totalAudSignups = data?.audience.summary.reduce((s, r) => s + r.signups, 0) ?? 0;
  const totalAudPriorClicks = data?.audience.summary.reduce((s, r) => s + r.previousClicks, 0) ?? 0;
  const totalAudPriorSignups = data?.audience.summary.reduce((s, r) => s + r.previousSignups, 0) ?? 0;

  const showTrend = data?.range !== "all";
  const priorWindowLabel =
    range === "7d"
      ? "vs prior 7 days"
      : range === "30d"
        ? "vs prior 30 days"
        : range === "90d"
          ? "vs prior 90 days"
          : "";

  const RangePicker = (
    <div
      className="inline-flex rounded-lg border border-border/60 bg-secondary/40 p-0.5"
      role="group"
      aria-label="CTA date range"
      data-testid="cta-range-picker"
    >
      {RANGE_OPTIONS.map((opt) => {
        const active = range === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRange(opt.value)}
            data-testid={`cta-range-${opt.value}`}
            aria-pressed={active}
            className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6 mb-10">
      <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MousePointerClick className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">Capability Page CTA Conversion</h2>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              Clicks on capability page CTAs (primary hero + closing) and the share of those
              clicks that completed sign-up in the same browser session.
              {showTrend && priorWindowLabel ? ` Deltas compare ${priorWindowLabel}.` : ""}
            </p>
          </div>
          {RangePicker}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error || !data ? (
          <p className="text-sm text-destructive">{error || "No CTA data available."}</p>
        ) : data.capability.summary.length === 0 ? (
          <p className="text-sm text-muted-foreground">No capability CTA clicks in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cta-capability-table">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-muted-foreground border-b border-border/60">
                  <th className="py-2 pr-3">Capability page</th>
                  <th className="py-2 px-3 text-right">Primary CTA</th>
                  <th className="py-2 px-3 text-right">Closing CTA</th>
                  <th className="py-2 px-3 text-right">Total clicks</th>
                  <th className="py-2 px-3 text-right">Sign-ups</th>
                  <th className="py-2 px-3 text-right">Conversion</th>
                  {showTrend && <th className="py-2 pl-3 text-right">Trend</th>}
                </tr>
              </thead>
              <tbody>
                {data.capability.summary.map((row) => {
                  const positions = positionByCapability.get(row.source) || {};
                  return (
                    <tr key={row.source} className="border-b border-border/40 last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">
                        {CAPABILITY_LABELS[row.source] || row.source}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {positions.primary || 0}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {positions.closing || 0}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="font-semibold text-foreground">{row.clicks}</div>
                        {showTrend && (
                          <DeltaBadge current={row.clicks} previous={row.previousClicks} />
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="text-muted-foreground">{row.signups}</div>
                        {showTrend && (
                          <DeltaBadge current={row.signups} previous={row.previousSignups} />
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="font-bold text-primary">
                          {(row.conversionRate * 100).toFixed(1)}%
                        </div>
                        {showTrend && (
                          <DeltaBadge
                            current={row.conversionRate}
                            previous={row.previousConversionRate}
                          />
                        )}
                      </td>
                      {showTrend && (
                        <td className="py-2 pl-3 text-right">
                          <div className="inline-block" data-testid={`cta-spark-${row.source}`}>
                            <MiniSparkline values={row.sparkline} />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr className="text-xs uppercase text-muted-foreground font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td></td>
                  <td></td>
                  <td className="py-2 px-3 text-right">
                    <div>{totalCapClicks}</div>
                    {showTrend && (
                      <DeltaBadge current={totalCapClicks} previous={totalCapPriorClicks} />
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div>{totalCapSignups}</div>
                    {showTrend && (
                      <DeltaBadge current={totalCapSignups} previous={totalCapPriorSignups} />
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {totalCapClicks > 0
                      ? ((totalCapSignups / totalCapClicks) * 100).toFixed(1)
                      : "0.0"}
                    %
                  </td>
                  {showTrend && <td></td>}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Audience Carousel Cards</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Which audience card on the landing page draws clicks - and how many of those
            visitors finish sign-up.
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.audience.summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audience card clicks in this range.</p>
          ) : (
            <table className="w-full text-sm" data-testid="cta-audience-table">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase text-muted-foreground border-b border-border/60">
                  <th className="py-2 pr-3">Audience</th>
                  <th className="py-2 px-3 text-right">Clicks</th>
                  <th className="py-2 px-3 text-right">Sign-ups</th>
                  <th className="py-2 px-3 text-right">Conversion</th>
                  {showTrend && <th className="py-2 pl-3 text-right">Trend</th>}
                </tr>
              </thead>
              <tbody>
                {data.audience.summary.map((row) => (
                  <tr key={row.audience} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {AUDIENCE_LABELS[row.audience] || row.audience}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="font-semibold text-foreground">{row.clicks}</div>
                      {showTrend && (
                        <DeltaBadge current={row.clicks} previous={row.previousClicks} />
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="text-muted-foreground">{row.signups}</div>
                      {showTrend && (
                        <DeltaBadge current={row.signups} previous={row.previousSignups} />
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="font-bold text-primary">
                        {(row.conversionRate * 100).toFixed(1)}%
                      </div>
                      {showTrend && (
                        <DeltaBadge
                          current={row.conversionRate}
                          previous={row.previousConversionRate}
                        />
                      )}
                    </td>
                    {showTrend && (
                      <td className="py-2 pl-3 text-right">
                        <div className="inline-block">
                          <MiniSparkline values={row.sparkline} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                <tr className="text-xs uppercase text-muted-foreground font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 px-3 text-right">
                    <div>{totalAudClicks}</div>
                    {showTrend && (
                      <DeltaBadge current={totalAudClicks} previous={totalAudPriorClicks} />
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div>{totalAudSignups}</div>
                    {showTrend && (
                      <DeltaBadge current={totalAudSignups} previous={totalAudPriorSignups} />
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {totalAudClicks > 0
                      ? ((totalAudSignups / totalAudClicks) * 100).toFixed(1)
                      : "0.0"}
                    %
                  </td>
                  {showTrend && <td></td>}
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div
          className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm"
          data-testid="capability-cross-links-card"
        >
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Audience to Capability Cross-Links</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Which capability tile gets clicked from each audience page, and how many of
            those visitors completed sign-up.
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.crossLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cross-link clicks in this range.</p>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {data.crossLinks.map((row, i) => (
                <div
                  key={`${row.audience}-${row.source}-${i}`}
                  className="flex items-center justify-between py-2 border-b border-border/40 last:border-0 gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {AUDIENCE_LABELS[row.audience] || row.audience}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      → {CAPABILITY_LABELS[row.source] || row.source}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-right">
                    {showTrend && (
                      <div className="hidden sm:block">
                        <MiniSparkline values={row.sparkline} />
                      </div>
                    )}
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground block">
                        {row.clicks} clicks · {row.signups} signups
                      </span>
                      {showTrend && (
                        <DeltaBadge current={row.clicks} previous={row.previousClicks} />
                      )}
                    </div>
                    <span className="text-sm font-bold text-primary w-12">
                      {(row.conversionRate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {data && data.sectionEngagement && data.sectionEngagement.length > 0 && (
        <div
          className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm"
          data-testid="capability-section-engagement-card"
        >
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">
              Capability Page Section Engagement
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Per capability page, how often each section is viewed, how many CTA
            clicks happened from that section last (proxy for which content
            persuades visitors), and how many of those rolled up to sign-ups.
            Scroll-depth milestones show how far visitors actually read.
          </p>
          <div className="space-y-6">
            {data.sectionEngagement.map((page) => {
              const totalImpressions = page.sections.reduce(
                (s, x) => s + x.impressions,
                0,
              );
              const totalClicks = page.sections.reduce(
                (s, x) => s + x.clicks,
                0,
              );
              const totalSignups = page.sections.reduce(
                (s, x) => s + x.signups,
                0,
              );
              return (
                <div
                  key={page.source}
                  className="border border-border/40 rounded-xl p-4"
                  data-testid={`section-engagement-${page.source}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                    <h3 className="font-display font-bold text-base text-foreground">
                      {CAPABILITY_LABELS[page.source] || page.source}
                    </h3>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>
                        Scroll 25%:{" "}
                        <span className="font-semibold text-foreground">
                          {page.scrollDepth.d25}
                        </span>
                      </span>
                      <span>
                        50%:{" "}
                        <span className="font-semibold text-foreground">
                          {page.scrollDepth.d50}
                        </span>
                      </span>
                      <span>
                        75%:{" "}
                        <span className="font-semibold text-foreground">
                          {page.scrollDepth.d75}
                        </span>
                      </span>
                      <span>
                        100%:{" "}
                        <span className="font-semibold text-foreground">
                          {page.scrollDepth.d100}
                        </span>
                      </span>
                    </div>
                  </div>
                  {page.sections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No section engagement yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs font-semibold uppercase text-muted-foreground border-b border-border/40">
                            <th className="py-2 pr-3">Section</th>
                            <th className="py-2 px-3 text-right">Impressions</th>
                            <th className="py-2 px-3 text-right">
                              Clicks from section
                            </th>
                            <th className="py-2 px-3 text-right">Sign-ups</th>
                            <th className="py-2 px-3 text-right">Click rate</th>
                            <th className="py-2 pl-3 text-right">
                              Trend ({data.bucketUnit === "week" ? "weekly" : data.bucketUnit === "day" ? "daily" : "—"})
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {page.sections.map((s) => (
                            <tr
                              key={s.section}
                              className="border-b border-border/30 last:border-0"
                              data-testid={`section-engagement-row-${page.source}-${s.section}`}
                            >
                              <td className="py-2 pr-3 font-medium text-foreground">
                                {SECTION_LABELS[s.section] || s.section}
                              </td>
                              <td className="py-2 px-3 text-right text-muted-foreground">
                                {s.impressions}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-foreground">
                                {s.clicks}
                              </td>
                              <td className="py-2 px-3 text-right text-muted-foreground">
                                {s.signups}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-primary">
                                {(s.clickRate * 100).toFixed(1)}%
                              </td>
                              <td
                                className="py-2 pl-3 text-right"
                                data-testid={`section-engagement-trend-${page.source}-${s.section}`}
                              >
                                {data.bucketUnit ? (
                                  <div className="inline-flex flex-col items-end gap-0.5">
                                    <MiniSparkline
                                      values={s.impressionsTrend}
                                      color="#0f766e"
                                    />
                                    <MiniSparkline
                                      values={s.clicksTrend}
                                      color="#b45309"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                          <tr className="text-xs uppercase text-muted-foreground font-semibold">
                            <td className="py-2 pr-3">Total</td>
                            <td className="py-2 px-3 text-right">
                              {totalImpressions}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {totalClicks}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {totalSignups}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {totalImpressions > 0
                                ? ((totalClicks / totalImpressions) * 100).toFixed(
                                    1,
                                  )
                                : "0.0"}
                              %
                            </td>
                            <td className="py-2 pl-3 text-right" />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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

function FeedbackSection() {
  const [feedbackData, setFeedbackData] = useState<FeedbackResponse | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const fetchFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await fetch(`/api/admin/feedback?${params}`);
      if (!res.ok) throw new Error("Failed to fetch feedback");
      const json = await res.json();
      setFeedbackData(json);
    } catch {
      setFeedbackError("Failed to load feedback.");
    } finally {
      setFeedbackLoading(false);
    }
  }, [page, categoryFilter]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const totalPages = feedbackData ? Math.ceil(feedbackData.total / feedbackData.limit) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={() => { setCategoryFilter(""); setPage(1); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            !categoryFilter
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All
        </button>
        {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => { setCategoryFilter(key); setPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                categoryFilter === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </button>
          );
        })}
        {feedbackData && (
          <span className="text-sm text-muted-foreground ml-auto">
            {feedbackData.total} total
          </span>
        )}
      </div>

      {feedbackLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : feedbackError ? (
        <p className="text-destructive text-center py-12">{feedbackError}</p>
      ) : !feedbackData || feedbackData.items.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No feedback submissions yet.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {feedbackData.items.map((item) => {
              const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.like;
              const CatIcon = cfg.icon;
              return (
                <div
                  key={item.id}
                  className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm"
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-xl flex-shrink-0 ${cfg.color}`}>
                      <CatIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {cfg.label}
                        </span>
                        {item.category === "nps" && item.score != null && Number.isFinite(item.score) && (
                          <span className={`text-xs font-bold ${getNpsColor(item.score)}`}>
                            {item.score}/10 ({getNpsLabel(item.score)})
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap mb-2">
                        {item.message}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {(item.userName || item.email) && (
                          <span>
                            {item.userName || item.email}
                          </span>
                        )}
                        {!item.userName && !item.email && (
                          <span className="italic">Anonymous</span>
                        )}
                        {item.pageUrl && (
                          <span className="flex items-center gap-1 truncate max-w-[200px]">
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            {item.pageUrl.replace(/^https?:\/\/[^/]+/, "")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ErrorLogItem {
  id: number;
  userId: string | null;
  errorMessage: string;
  errorStack: string | null;
  route: string | null;
  requestBody: Record<string, unknown> | null;
  createdAt: string;
}

function ErrorsSection() {
  const [errors, setErrors] = useState<ErrorLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function fetchErrors() {
      try {
        const res = await fetch("/api/admin/errors");
        if (!res.ok) throw new Error("Failed to fetch errors");
        const json = await res.json();
        setErrors(json.items || []);
      } catch {
        setLoadError("Failed to load error logs.");
      } finally {
        setLoading(false);
      }
    }
    fetchErrors();
  }, []);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return <p className="text-destructive text-center py-12">{loadError}</p>;
  }

  if (errors.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No errors logged yet. That's a good thing!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Showing the {errors.length} most recent errors
      </p>
      {errors.map((err) => {
        const isExpanded = expandedIds.has(err.id);
        const source = err.requestBody && typeof err.requestBody === "object" && "source" in err.requestBody
          ? (err.requestBody as Record<string, unknown>).source
          : "server";
        return (
          <div
            key={err.id}
            className="bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden"
          >
            <button
              onClick={() => toggleExpand(err.id)}
              className="w-full text-left p-5 flex items-start gap-3 hover:bg-secondary/30 transition-colors"
            >
              <div className={`p-2 rounded-xl flex-shrink-0 ${
                source === "frontend"
                  ? "bg-amber-100 text-amber-600"
                  : "bg-red-100 text-red-600"
              }`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {source === "frontend" ? "Client" : "Server"}
                  </span>
                  {err.route && (
                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[250px]">
                      {err.route}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                    {format(new Date(err.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
                <p className="text-sm text-foreground line-clamp-2">
                  {err.errorMessage}
                </p>
                {err.userId && (
                  <span className="text-xs text-muted-foreground mt-1 inline-block">
                    User #{err.userId}
                  </span>
                )}
              </div>
              <div className="flex-shrink-0 mt-1">
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {isExpanded && err.errorStack && (
              <div className="px-5 pb-5 pt-0">
                <pre className="bg-secondary/50 rounded-xl p-4 text-xs font-mono text-foreground/70 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {err.errorStack}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ReviewItem {
  eventId: number;
  modelId: number;
  userId: number | null;
  requesterName: string;
  requesterEmail: string;
  schoolName: string;
  schoolType: string;
  modelName: string;
  requestedAt: string;
  feedbackSent: boolean;
  status: "pending" | "sent";
  sharedViewUrl: string | null;
}

interface ReviewAnalysis {
  modelName: string;
  schoolName: string;
  state: string;
  schoolType: string;
  entityType: string;
  requesterName: string;
  requesterEmail: string;
  lenderReadiness: string;
  executiveSummary: string;
  biggestStrength: string;
  biggestRisk: string;
  sharedViewUrl: string | null;
  topIssues: { title: string; severity: string; explanation: string }[];
  yearFinancials: {
    year: number;
    students: number;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    netMargin: number;
    debtService: number;
  }[];
  metrics: {
    y1Revenue: number;
    y1NetMargin: number;
    dscr: number;
    cashRunwayMonths: number;
    reserveMonths: number;
    daysCashOnHand: number;
    lenderReadiness: string;
  };
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    high: "bg-orange-100 text-orange-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-green-100 text-green-700",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[severity] || "bg-gray-100 text-gray-700"}`}>
      {severity}
    </span>
  );
}

function LenderBadge({ readiness }: { readiness: string }) {
  const colors: Record<string, string> = {
    "Strong": "bg-green-100 text-green-700 border-green-200",
    "Needs Work": "bg-amber-100 text-amber-700 border-amber-200",
    "Not Yet Ready": "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`text-sm font-bold px-3 py-1 rounded-xl border ${colors[readiness] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
      {readiness}
    </span>
  );
}

function ReviewsSection() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<ReviewAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "sent">("all");

  const [strengths, setStrengths] = useState("");
  const [watchItems, setWatchItems] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reviews");
      if (!res.ok) throw new Error("Failed to fetch reviews");
      const json = await res.json();
      setReviews(json.reviews || []);
    } catch {
      setError("Failed to load review queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const openReview = async (modelId: number) => {
    setSelectedModelId(modelId);
    setAnalysisLoading(true);
    setAnalysis(null);
    setAnalysisError(null);
    setSendSuccess(false);
    setSendError(null);
    setStrengths("");
    setWatchItems("");
    setRecommendations("");
    try {
      const res = await fetch(`/api/admin/reviews/${modelId}/analysis`);
      if (!res.ok) throw new Error("Failed to fetch analysis");
      const json = await res.json();
      setAnalysis(json);

      if (json.biggestStrength) setStrengths(json.biggestStrength);
      if (json.biggestRisk) setWatchItems(json.biggestRisk);
      const recs = json.topIssues
        ?.filter((i: { severity: string }) => i.severity === "critical" || i.severity === "high")
        .slice(0, 3)
        .map((i: { title: string; explanation: string }) => `• ${i.title}: ${i.explanation}`)
        .join("\n");
      if (recs) setRecommendations(recs);
    } catch {
      setAnalysisError("Failed to load analysis.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleSend = async () => {
    if (!analysis || !selectedModelId) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${selectedModelId}/send-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strengths,
          watchItems,
          recommendations,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to send");
      }
      setSendSuccess(true);
      setReviews(prev => prev.map(r =>
        r.modelId === selectedModelId ? { ...r, feedbackSent: true } : r
      ));
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : "Failed to send feedback.");
    } finally {
      setSending(false);
    }
  };

  const filteredReviews = reviews.filter(r => {
    if (filter === "pending") return !r.feedbackSent;
    if (filter === "sent") return r.feedbackSent;
    return true;
  });

  const pendingCount = reviews.filter(r => !r.feedbackSent).length;

  if (selectedModelId) {
    return (
      <div>
        <button
          onClick={() => { setSelectedModelId(null); setAnalysis(null); }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to queue
        </button>

        {analysisLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : analysisError || !analysis ? (
          <p className="text-destructive text-center py-12">{analysisError || "Failed to load analysis."}</p>
        ) : (
          <div className="space-y-6">
            <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">{analysis.schoolName}</h2>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mt-1">
                    <span>{analysis.requesterName} &middot; {analysis.requesterEmail}</span>
                    {(analysis.schoolType || analysis.entityType || analysis.state) && (
                      <span className="text-border">|</span>
                    )}
                    {analysis.schoolType && <span>{analysis.schoolType}</span>}
                    {analysis.entityType && <span>&middot; {analysis.entityType}</span>}
                    {analysis.state && analysis.state !== "N/A" && <span>&middot; {analysis.state}</span>}
                  </div>
                </div>
                <LenderBadge readiness={analysis.lenderReadiness} />
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{analysis.executiveSummary}</p>
              {analysis.sharedViewUrl && (
                <a
                  href={analysis.sharedViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl text-sm font-medium bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Full Model
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-card border border-border/60 rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Y1 Revenue</p>
                <p className="text-lg font-bold text-foreground">{fmtCurrency(analysis.metrics.y1Revenue)}</p>
              </div>
              <div className="bg-card border border-border/60 rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Y1 Margin</p>
                <p className="text-lg font-bold text-foreground">{(analysis.metrics.y1NetMargin * 100).toFixed(1)}%</p>
              </div>
              <div className="bg-card border border-border/60 rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">DSCR</p>
                <p className="text-lg font-bold text-foreground">{analysis.metrics.dscr.toFixed(2)}x</p>
              </div>
              <div className="bg-card border border-border/60 rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Cash Runway</p>
                <p className="text-lg font-bold text-foreground">{analysis.metrics.cashRunwayMonths}mo</p>
              </div>
              <div className="bg-card border border-border/60 rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Days Cash</p>
                <p className="text-lg font-bold text-foreground">{analysis.metrics.daysCashOnHand}</p>
              </div>
            </div>

            {analysis.yearFinancials.length > 0 && (
              <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm overflow-x-auto">
                <h3 className="font-display text-sm font-bold text-foreground mb-3">5-Year Summary</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-2 text-muted-foreground font-medium">Year</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Students</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Revenue</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Expenses</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Net Income</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.yearFinancials.map(yf => (
                      <tr key={yf.year} className="border-b border-border/30">
                        <td className="py-2 font-medium">Year {yf.year}</td>
                        <td className="py-2 text-right">{yf.students}</td>
                        <td className="py-2 text-right">{fmtCurrency(yf.totalRevenue)}</td>
                        <td className="py-2 text-right">{fmtCurrency(yf.totalExpenses)}</td>
                        <td className={`py-2 text-right font-semibold ${yf.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmtCurrency(yf.netIncome)}
                        </td>
                        <td className="py-2 text-right">{(yf.netMargin * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {analysis.topIssues.length > 0 && (
              <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
                <h3 className="font-display text-sm font-bold text-foreground mb-3">Top Issues</h3>
                <div className="space-y-2">
                  {analysis.topIssues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                      <SeverityBadge severity={issue.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{issue.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{issue.explanation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-card border-2 border-primary/20 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Send className="h-5 w-5 text-primary" />
                <h3 className="font-display text-lg font-bold text-foreground">Compose Feedback</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                This will be emailed to {analysis.requesterName} ({analysis.requesterEmail}).
                The fields below are pre-filled from the consultant engine - edit them to personalize.
              </p>

              {sendSuccess ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="font-semibold text-green-900">Feedback sent successfully</p>
                  <p className="text-sm text-green-700 mt-1">
                    {analysis.requesterName} will receive the email shortly.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      What looks strong
                    </label>
                    <textarea
                      value={strengths}
                      onChange={(e) => setStrengths(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      placeholder="Highlight the model's strengths..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      What to keep an eye on
                    </label>
                    <textarea
                      value={watchItems}
                      onChange={(e) => setWatchItems(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      placeholder="Risks or areas that need attention..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      Our recommendations
                    </label>
                    <textarea
                      value={recommendations}
                      onChange={(e) => setRecommendations(e.target.value)}
                      rows={4}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                      placeholder="Actionable recommendations for the founder..."
                    />
                  </div>

                  {sendError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <p className="text-sm text-red-700">{sendError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleSend}
                    disabled={sending || (!strengths.trim() && !watchItems.trim() && !recommendations.trim())}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sending ? "Sending..." : "Send Feedback Email"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive text-center py-12">{error}</p>;
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-12">
        <ClipboardCheck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No review requests yet.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            filter === "all"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          All ({reviews.length})
        </button>
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            filter === "pending"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Pending ({pendingCount})
        </button>
        <button
          onClick={() => setFilter("sent")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            filter === "sent"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Sent ({reviews.length - pendingCount})
        </button>
      </div>

      <div className="space-y-3">
        {filteredReviews.map((review) => (
          <div
            key={review.eventId}
            className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-xl flex-shrink-0 ${
                review.feedbackSent
                  ? "bg-green-100 text-green-600"
                  : "bg-amber-100 text-amber-600"
              }`}>
                {review.feedbackSent
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <ClipboardCheck className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{review.schoolName}</span>
                  {review.feedbackSent && (
                    <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      Feedback sent
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-1">
                  {review.requesterName} &middot; {review.requesterEmail}
                  {review.schoolType && (
                    <span> &middot; {SCHOOL_TYPE_LABELS[review.schoolType] || review.schoolType}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Model: {review.modelName} &middot; Requested {format(new Date(review.requestedAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
              <button
                onClick={() => openReview(review.modelId)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex-shrink-0"
              >
                <Eye className="h-3.5 w-3.5" />
                {review.feedbackSent ? "View" : "Review"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface CoachingFunnelSurface {
  key: string;
  label: string;
  shown: number;
  engaged: number;
  // null when this surface has no dismissable affordance (e.g. dashboard
  // launcher coach is just a subtitle — the "click the card" action is the
  // engagement signal and there's nothing explicit to dismiss).
  dismissed: number | null;
  engagementRate: number;
  dismissalRate: number | null;
  // Repo-relative path to the file that emits this surface's *_shown
  // event. Surfaced in the low-engagement tooltip so admins can jump
  // straight to the source when pruning dead coach copy (Task #410).
  sourcePath: string;
  // True when impressions cleared the floor (proves it's not noise) and
  // engagement is below the floor — i.e. the surface looks dead.
  lowEngagement: boolean;
}

interface CoachingFunnelResponse {
  windowDays: number;
  since: string;
  // Mirrored from the server so the tooltip can quote the exact numbers
  // that triggered the flag without hardcoding them on the client.
  lowEngagementThreshold: {
    minImpressions: number;
    maxEngagementRate: number;
  };
  surfaces: CoachingFunnelSurface[];
}

interface DowngradePrecursorSurface {
  // Mirrors COACHING_FUNNEL_SURFACES.key on the server. When the server
  // doesn't have a registered surface for a dismissal event (e.g. an
  // event was renamed) the key falls back to the raw event name so the
  // UI still has something stable to render.
  key: string;
  label: string;
  sourcePath: string;
  dismissedEvent: string;
  // Number of dismissal events emitted by users in the 24h before they
  // downgraded to advanced. A single user with two downgrades can
  // contribute up to one dismissal per (downgrade, dismissal) pair.
  dismissals: number;
}

interface DowngradePrecursorsResponse {
  windowDays: number;
  precursorWindowHours: number;
  totalDowngrades: number;
  surfaces: DowngradePrecursorSurface[];
}

// Coach downgrade precursors (Task #411) — the top 5 coach surfaces a
// founder dismissed in the 24 hours before they switched guidance mode
// to "advanced" (i.e. silenced the coach). Highest-signal feedback we
// have for cutting the right coach copy: surfaces here are the ones
// pushing founders to mute the coach. Powered by
// GET /api/admin/coach-downgrade-precursors which joins
// guidance_mode_changed against the *_dismissed events from Task #285.
function CoachDowngradePrecursorsSection() {
  const [data, setData] = useState<DowngradePrecursorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/coach-downgrade-precursors");
        if (!res.ok) throw new Error("Failed to fetch downgrade precursors");
        const json = (await res.json()) as DowngradePrecursorsResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Failed to load downgrade precursors.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm"
      data-testid="coach-downgrade-precursors"
    >
      <div className="flex items-start justify-between mb-2 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="font-display text-lg font-bold">
              Coach lines dismissed before downgrade
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Top 5 coach surfaces a founder dismissed in the{" "}
            {data?.precursorWindowHours ?? 24} hours before switching guidance
            mode to advanced. The highest-signal feedback we have for cutting
            the right coach copy &mdash; these are the lines pushing founders
            to silence the coach.
          </p>
        </div>
        {data && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {data.totalDowngrades} downgrade
            {data.totalDowngrades === 1 ? "" : "s"} &middot; last{" "}
            {data.windowDays} days
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error || !data ? (
        <p className="text-sm text-destructive mt-4">
          {error || "No data available."}
        </p>
      ) : data.totalDowngrades === 0 ? (
        <p className="text-sm text-muted-foreground mt-4">
          No basics/extra &rarr; advanced downgrades in the last{" "}
          {data.windowDays} days yet.
        </p>
      ) : data.surfaces.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-4">
          {data.totalDowngrades} downgrade
          {data.totalDowngrades === 1 ? "" : "s"} recorded, but no dismissable
          coach surfaces fired in the {data.precursorWindowHours}h before any
          of them.
        </p>
      ) : (
        <table
          className="w-full text-sm mt-4"
          data-testid="coach-downgrade-precursors-table"
        >
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-muted-foreground border-b border-border/60">
              <th className="py-2 pr-3">Rank</th>
              <th className="py-2 pr-3">Coach surface</th>
              <th className="py-2 px-3 text-right">Dismissals before downgrade</th>
              <th className="py-2 pl-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {data.surfaces.map((s, i) => (
              <tr
                key={s.key}
                data-testid={`coach-downgrade-precursor-${s.key}`}
                className="border-b border-border/40 last:border-0"
              >
                <td className="py-2 pr-3 font-mono text-muted-foreground">
                  #{i + 1}
                </td>
                <td className="py-2 pr-3 font-medium text-foreground">
                  {s.label}
                </td>
                <td className="py-2 px-3 text-right font-semibold text-amber-700 dark:text-amber-400">
                  {s.dismissals}
                </td>
                <td className="py-2 pl-3">
                  {s.sourcePath ? (
                    <a
                      href={resolveSourceUrl(s.sourcePath)}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`coach-downgrade-source-${s.key}`}
                      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid break-all"
                    >
                      {s.sourcePath}
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {s.dismissedEvent}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Coaching funnel — paired shown / engaged / dismissed counts per coach
// surface over the last 30 days. Lets us scan, at a glance, which coach
// lines actually land for basics/extra founders and which we could rip
// out without anyone noticing. Powered by GET /api/admin/coaching-funnel
// which reads raw events on each request (no rollups stored), so the
// chart is intentionally ephemeral and ages out as old events fall out
// of the 30-day window.
function CoachingFunnelSection() {
  const [data, setData] = useState<CoachingFunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/coaching-funnel");
        if (!res.ok) throw new Error("Failed to fetch coaching funnel");
        const json = (await res.json()) as CoachingFunnelResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Failed to load coaching funnel data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
        <p className="text-destructive">{error || "No data."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between mb-2 gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">
                Coach surface funnel
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Last {data.windowDays} days &middot; basics &amp; extra founders only.
              Advanced-mode users emit nothing for these surfaces.
            </p>
          </div>
        </div>

        {data.surfaces.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-4">No coaching events yet.</p>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="space-y-6 mt-6">
              {sortCoachingSurfaces(data.surfaces).map((s) => (
                <div
                  key={s.key}
                  data-testid={`coaching-surface-${s.key}`}
                  data-low-engagement={s.lowEngagement ? "true" : "false"}
                  className="space-y-2 border-b border-border/40 last:border-0 pb-5 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {s.label}
                      </span>
                      {s.lowEngagement && (
                        <LowEngagementBadge
                          surface={s}
                          threshold={data.lowEngagementThreshold}
                        />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Engaged {(s.engagementRate * 100).toFixed(0)}%
                      {s.dismissalRate !== null && (
                        <> &middot; Dismissed {(s.dismissalRate * 100).toFixed(0)}%</>
                      )}
                    </span>
                  </div>
                  <FunnelBar label="Shown" value={s.shown} maxValue={s.shown} />
                  <FunnelBar label="Engaged" value={s.engaged} maxValue={s.shown} />
                  {s.dismissed !== null && (
                    <FunnelBar label="Dismissed" value={s.dismissed} maxValue={s.shown} />
                  )}
                </div>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

// Sort low-engagement surfaces to the top so admins see "this looks dead"
// candidates first, then sort the remainder by impression count desc so
// the highest-traffic healthy surfaces sit above quiet ones (Task #410).
function sortCoachingSurfaces(
  surfaces: CoachingFunnelSurface[],
): CoachingFunnelSurface[] {
  return [...surfaces].sort((a, b) => {
    if (a.lowEngagement !== b.lowEngagement) {
      return a.lowEngagement ? -1 : 1;
    }
    return b.shown - a.shown;
  });
}

// Resolve an admin-clickable URL for a repo-relative source path.
//
// When VITE_SOURCE_REPO_URL is set (e.g. "https://github.com/acme/repo/blob/main"
// or "vscode://file/Users/me/checkouts/repo"), the link points at the
// remote/editor target. When unset, we fall back to the same repo path
// prefixed with "/" so the resulting <a href> is still a real, valid URL
// that admins can right-click → "Copy link" — preserving the "links to
// source file" contract even without configuration.
function resolveSourceUrl(sourcePath: string): string {
  const base = (
    typeof import.meta !== "undefined" && import.meta.env?.VITE_SOURCE_REPO_URL
  ) as string | undefined;
  if (base && typeof base === "string" && base.length > 0) {
    return `${base.replace(/\/+$/, "")}/${sourcePath.replace(/^\/+/, "")}`;
  }
  return `/${sourcePath.replace(/^\/+/, "")}`;
}

// Amber "looks dead" badge with a tooltip that quotes the exact threshold
// numbers and links to the file emitting the surface's *_shown event so
// an admin can jump straight to it when pruning copy (Task #410).
//
// The trigger is a real <button> (not a styled <span>) so keyboard users
// can focus the badge to read the tooltip via aria-describedby. The
// source path is rendered as a real <a href> anchor (primary affordance)
// with a small copy-to-clipboard control beside it as a secondary
// affordance for environments where the resolved URL doesn't open
// directly (e.g. a Replit shell needs to paste the path locally).
function LowEngagementBadge({
  surface,
  threshold,
}: {
  surface: CoachingFunnelSurface;
  threshold: CoachingFunnelResponse["lowEngagementThreshold"];
}) {
  const ratePct = (threshold.maxEngagementRate * 100).toFixed(0);
  const [copied, setCopied] = useState(false);
  const sourceUrl = resolveSourceUrl(surface.sourcePath);
  const handleCopy = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(surface.sourcePath).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }, [surface.sourcePath]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={`low-engagement-badge-${surface.key}`}
          aria-label={`Low engagement: ${surface.label}`}
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Looks dead
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        className="max-w-xs bg-amber-900 text-amber-50 text-xs leading-snug px-3 py-2"
      >
        <p className="font-semibold mb-1">Low engagement</p>
        <p>
          Engaged {(surface.engagementRate * 100).toFixed(1)}% of{" "}
          {surface.shown.toLocaleString()} impressions over the last 30 days —
          below the {ratePct}% floor we apply once a surface clears{" "}
          {threshold.minImpressions} impressions. Consider rewriting or
          retiring the copy.
        </p>
        <p className="mt-2">Source:</p>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          data-testid={`low-engagement-source-${surface.key}`}
          aria-label={`Open source file ${surface.sourcePath}`}
          className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded break-all"
        >
          {surface.sourcePath}
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={handleCopy}
          data-testid={`low-engagement-copy-${surface.key}`}
          aria-label={`Copy source path ${surface.sourcePath}`}
          className="mt-1 block text-[10px] text-amber-200/80 underline decoration-dotted underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded"
          aria-live="polite"
        >
          {copied ? "Path copied" : "Copy path"}
        </button>
      </TooltipContent>
    </Tooltip>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "analytics" | "feedback" | "errors" | "reviews" | "coaching"
  >("analytics");

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
      <Layout>
        <div className="flex-1 flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (error === "forbidden") {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-20">
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
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center py-20">
          <p className="text-destructive">Failed to load analytics data.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-bold text-foreground tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Platform usage overview and key metrics.
          </p>
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "analytics"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
            </button>
            <button
              onClick={() => setActiveTab("feedback")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "feedback"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              Feedback
            </button>
            <button
              onClick={() => setActiveTab("reviews")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "reviews"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardCheck className="h-4 w-4" />
              Reviews
            </button>
            <button
              onClick={() => setActiveTab("coaching")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "coaching"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <Compass className="h-4 w-4" />
              Coaching
            </button>
            <button
              onClick={() => setActiveTab("errors")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "errors"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              Errors
            </button>
          </div>
        </div>

        {activeTab === "errors" ? (
          <ErrorsSection />
        ) : activeTab === "reviews" ? (
          <ReviewsSection />
        ) : activeTab === "coaching" ? (
          <div className="space-y-6">
            <CoachDowngradePrecursorsSection />
            <CoachingFunnelSection />
          </div>
        ) : activeTab === "feedback" ? (
          <FeedbackSection />
        ) : (
        <>
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

        <CtaConversionSection />

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
                      <p className="text-sm font-medium text-foreground flex items-center gap-2 flex-wrap">
                        {e.modelName}
                        {e.viaSharedLink && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800"
                            title={
                              e.viewerLabel
                                ? `Downloaded via shared link (${e.viewerLabel})`
                                : "Downloaded via shared link"
                            }
                          >
                            via shared link
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.viaSharedLink
                          ? `via ${e.viewerLabel || "shared link"} (owner: ${e.userName}) · ${e.format.toUpperCase()}`
                          : `by ${e.userName} · ${e.format.toUpperCase()}`}
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
        </>
        )}
      </div>
    </Layout>
  );
}
