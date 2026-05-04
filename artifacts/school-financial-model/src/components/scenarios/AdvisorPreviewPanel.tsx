import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, Loader2, AlertCircle, ScanEye } from "lucide-react";
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

  // Push the rendered HTML into the iframe via srcdoc so the email's
  // inline <style>/<table> markup renders in isolation from the host page.
  // sandbox="" blocks scripts entirely — the brief is static HTML.
  const srcDoc = useMemo(() => {
    if (!data?.html) return "";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#F8FAFC;">${data.html}</body></html>`;
  }, [data?.html]);

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
    </div>
  );
}
