import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, Loader2, AlertCircle, ScanEye, MessageSquareMore, Send, CheckCircle2 } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import type { ComparisonResult } from "@/lib/scenario-compare";

interface AdvisorPreviewPanelProps {
  modelId: number;
  // Optional scenario-compare verdict to render alongside the email preview.
  // When present, the panel shows the same Y1-anchored verdict copy advisors
  // see in the comparison view — sourced from the page's existing
  // compareScenarios() call so the preview can never drift.
  comparison?: ComparisonResult | null;
  baseName?: string;
  compareName?: string;
}

interface PreviewResponse {
  subject: string;
  html: string;
  priority: "high" | "standard";
  isSingleYear: boolean;
}

const VERDICT_BADGE: Record<ComparisonResult["verdict"], { label: string; className: string }> = {
  stronger: {
    label: "Stronger than base",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  weaker: {
    label: "Weaker than base",
    className: "bg-rose-50 text-rose-800 border-rose-200",
  },
  mixed: {
    label: "Mixed verdict",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
};

/**
 * Single-year founders' in-app preview of (a) the advisor brief that the
 * /request-review endpoint emails to the team and (b) the scenario-compare
 * verdict copy. Both halves reuse the production renderers
 * (`renderReviewRequestEmail` server-side, `compareScenarios` client-side)
 * so what the founder previews is what advisors actually receive. See
 * Task #477.
 *
 * Task #482: also includes a "Send to advisors" submit affordance so founders
 * can act on the preview without leaving Scenarios. Mirrors the wizard's
 * Export-step request-review form (POST /api/models/:id/request-review,
 * gated on /api/models/:id/review-available).
 */
export function AdvisorPreviewPanel({
  modelId,
  comparison,
  baseName,
  compareName,
}: AdvisorPreviewPanelProps) {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Request-review state — mirrors ExportStep so submit/success/error UX matches.
  const [reviewAvailable, setReviewAvailable] = useState<boolean | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewName, setReviewName] = useState("");
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    customFetch<PreviewResponse>(`/api/models/${modelId}/review-preview`, {
      method: "GET",
    })
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load preview. Try again in a moment.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  useEffect(() => {
    let cancelled = false;
    customFetch<{ available: boolean }>(`/api/models/${modelId}/review-available`)
      .then((res) => {
        if (cancelled) return;
        setReviewAvailable(res.available);
      })
      .catch(() => {
        if (cancelled) return;
        setReviewAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewName.trim() || !reviewEmail.trim()) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      await customFetch(`/api/models/${modelId}/request-review`, {
        method: "POST",
        body: JSON.stringify({
          name: reviewName.trim(),
          email: reviewEmail.trim(),
          message: reviewMessage.trim() || undefined,
        }),
      });
      setReviewSubmitted(true);
      setShowReviewForm(false);
    } catch {
      setReviewError("Something went wrong. Please try again.");
    } finally {
      setReviewLoading(false);
    }
  };

  // Push the rendered HTML into the iframe via srcdoc so the email's
  // inline <style>/<table> markup renders in isolation from the host page.
  // sandbox="" blocks scripts entirely — the brief is static HTML.
  const srcDoc = useMemo(() => {
    if (!data?.html) return "";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#F8FAFC;">${data.html}</body></html>`;
  }, [data?.html]);

  // Treat the still-loading (null) state as disabled so a fast click can't
  // open the form before /review-available resolves and avoid a 503 from the
  // server. Matches the wizard's hard-gate behavior.
  const submitDisabled = reviewAvailable !== true;
  const submitUnavailable = reviewAvailable === false;

  return (
    <div
      className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm"
      data-testid="advisor-preview-panel"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <ScanEye className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl font-bold text-foreground">
            Preview what advisors / scenario compare will see
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Single-year mode anchors every callout on Year 1. This is exactly
            the brief our team reads when you click <em>Get Your Free Expert
            Review</em>, and the verdict copy that lands in side-by-side
            comparisons.
          </p>
        </div>
      </div>

      {comparison && (
        <div
          className="mb-5 rounded-xl border border-border/60 bg-muted/30 p-4"
          data-testid="advisor-preview-verdict"
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full border ${VERDICT_BADGE[comparison.verdict].className}`}
            >
              {VERDICT_BADGE[comparison.verdict].label}
            </span>
            {baseName && compareName && (
              <span className="text-xs text-muted-foreground">
                {baseName} <span className="px-1">vs</span> {compareName}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            {comparison.verdictExplanation}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border/60 overflow-hidden bg-white">
        <div className="px-4 py-2 border-b border-border/60 bg-muted/40 flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground truncate">
            {data?.subject || "Advisor Review Brief"}
          </span>
          {data?.priority === "high" && (
            <span className="ml-auto inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700">
              High priority
            </span>
          )}
        </div>
        {loading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Rendering preview…
          </div>
        )}
        {error && !loading && (
          <div className="flex items-start gap-2 px-4 py-6 text-sm text-rose-700 bg-rose-50">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {!loading && !error && srcDoc && (
          <iframe
            ref={iframeRef}
            data-testid="advisor-preview-iframe"
            title="Advisor brief preview"
            srcDoc={srcDoc}
            sandbox=""
            className="w-full"
            style={{ height: 720, border: 0, background: "#F8FAFC" }}
          />
        )}
      </div>

      {/* Task #482 - submit straight from the preview pane. */}
      <div className="mt-5" data-testid="advisor-preview-submit">
        {reviewSubmitted ? (
          <div
            className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-3"
            data-testid="advisor-preview-submitted"
          >
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-display font-bold text-base text-green-900 mb-1">
                Review requested - we'll be in touch
              </h3>
              <p className="text-sm text-green-700">
                Check your email for a confirmation. Our advisors will review
                your model and get back to you within 5–7 business days.
              </p>
            </div>
          </div>
        ) : showReviewForm ? (
          <form
            onSubmit={handleReviewSubmit}
            className="bg-gradient-to-b from-amber-50/80 to-white border-2 border-amber-400/40 rounded-xl p-5 space-y-4 text-left"
            data-testid="advisor-preview-form"
          >
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <MessageSquareMore className="h-4 w-4 text-amber-600" />
              </div>
              <h3 className="font-display font-bold text-base text-foreground">
                Send this to the SchoolStack team
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Our school finance advisors will review your model and reply with
              personalized feedback within 5–7 business days - free.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Your name</label>
                <input
                  type="text"
                  required
                  value={reviewName}
                  onChange={(e) => setReviewName(e.target.value)}
                  data-testid="advisor-preview-input-name"
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Your email</label>
                <input
                  type="email"
                  required
                  value={reviewEmail}
                  onChange={(e) => setReviewEmail(e.target.value)}
                  data-testid="advisor-preview-input-email"
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                  placeholder="jane@school.org"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Questions or notes <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                value={reviewMessage}
                onChange={(e) => setReviewMessage(e.target.value)}
                rows={3}
                data-testid="advisor-preview-input-message"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 resize-none"
                placeholder="Anything specific you'd like us to look at?"
              />
            </div>
            {reviewError && (
              <p className="text-sm text-red-600" data-testid="advisor-preview-error">
                {reviewError}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={reviewLoading || !reviewName.trim() || !reviewEmail.trim()}
                data-testid="advisor-preview-submit-button"
                className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-amber-600 shadow-md shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {reviewLoading ? "Sending..." : "Send to advisors"}
              </button>
              <button
                type="button"
                onClick={() => { setShowReviewForm(false); setReviewError(null); }}
                className="px-4 py-2.5 rounded-lg border border-border text-muted-foreground hover:bg-muted/50 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={() => setShowReviewForm(true)}
              disabled={submitDisabled}
              data-testid="advisor-preview-open-form"
              className="inline-flex items-center justify-center gap-2 bg-amber-500 text-white font-semibold py-2.5 px-5 rounded-lg hover:bg-amber-600 shadow-md shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
              Send this to the SchoolStack team
            </button>
            {submitUnavailable ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="advisor-preview-unavailable-hint"
              >
                Email isn't configured on this server yet, so review requests
                can't be delivered. Ask your admin to set up the SchoolStack
                mailer to enable this.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Same form as the wizard's <em>Get Your Free Expert Review</em>{" "}
                - free, 5–7 day turnaround.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
