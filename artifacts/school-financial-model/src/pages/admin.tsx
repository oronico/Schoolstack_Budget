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
          recipientName: analysis.requesterName,
          recipientEmail: analysis.requesterEmail,
          schoolName: analysis.schoolName,
          strengths,
          watchItems,
          recommendations,
          metrics: analysis.metrics,
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
                  <p className="text-sm text-muted-foreground mt-1">
                    {analysis.requesterName} &middot; {analysis.requesterEmail}
                  </p>
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
                The fields below are pre-filled from the consultant engine — edit them to personalize.
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

export function AdminPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"analytics" | "feedback" | "errors" | "reviews">("analytics");

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
        </>
        )}
      </div>
    </Layout>
  );
}
