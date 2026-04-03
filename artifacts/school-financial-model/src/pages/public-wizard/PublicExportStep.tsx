import { useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  Download, Loader2, ArrowRight, Landmark, CheckCircle2,
  Lock, Check, FileSpreadsheet, Crown, Sparkles, Zap,
  MessageSquareMore, Send, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import { getPublicExportUnderwritingUrl } from "@workspace/api-client-react";

const STARTER_FEATURES = [
  "4 tabs: Instructions, Assumptions, 5-Year Model, Year 1 Pro Forma",
  "Live Excel formulas throughout",
  "Color-coded assumptions",
  "Financial Health scorecard",
];

const FULL_MODEL_FEATURES = [
  "Program-level enrollment & tuition drivers",
  "Position-by-position staffing forecast",
  "Monthly cash flow (Year 1)",
  "Balance sheet & debt schedule",
  "DSCR & covenant analysis",
  "Sources & uses",
  "Scenario comparison",
  "Underwriting snapshot",
];

const PLUS_FEATURES = [
  "Lender-ready PDF packet",
  "Scenario planner (what-if analysis)",
  "Decision engine — \"What should I fix first?\"",
];

export function PublicExportStep({ jumpToStep, modelId }: { jumpToStep?: (s: number) => void; modelId: number | null }) {
  const [loading, setLoading] = useState(false);
  const [exported, setExported] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { getValues, watch } = useFormContext();
  const lendingLabIntent = watch("schoolProfile.lendingLabIntent");

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewName, setReviewName] = useState("");
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewName.trim() || !reviewEmail.trim()) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const data = getValues();
      const res = await fetch("/api/public/request-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reviewName.trim(),
          email: reviewEmail.trim(),
          message: reviewMessage.trim() || undefined,
          modelData: data,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to submit");
      }
      setReviewSubmitted(true);
      setShowReviewForm(false);
    } catch (err: unknown) {
      setReviewError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setReviewLoading(false);
    }
  };

  const handleDownload = async () => {
    if (loading) return;
    setLoading(true);
    setExportError(null);

    try {
      const data = getValues();
      const url = getPublicExportUnderwritingUrl();

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch?.[1] || "SchoolStack_Budget_Model.xlsx";
      const urlObj = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(urlObj);
      a.remove();
      setExported(true);
    } catch (e) {
      console.error(e);
      setExportError("Failed to export. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-8 px-2">
      <div className="text-center mb-10">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
          Your financial model is ready
        </h2>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Download your starter workbook now, or create a free account for the full underwriting package.
        </p>
      </div>

      {lendingLabIntent === "plan_to_apply" && (
        <div className="max-w-2xl mx-auto mb-8 bg-primary/5 border border-primary/20 rounded-2xl px-6 py-4 text-left">
          <div className="flex items-start gap-3">
            <Landmark className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              This model can help you prepare for Lending Lab review. It does not replace the full application or diligence process.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        <div className="relative bg-white rounded-2xl border border-border/60 shadow-sm flex flex-col overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">Starter Export</h3>
                <p className="text-xs text-muted-foreground">Available now</p>
              </div>
            </div>
          </div>

          <div className="px-6 pb-4 flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              A clean Excel workbook — great for exploring your numbers and sharing early projections.
            </p>
            <ul className="space-y-2.5">
              {STARTER_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <Check className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="px-6 pb-6 pt-2">
            <button
              onClick={handleDownload}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold shadow-sm hover:bg-slate-800 hover:shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
              ) : exported ? (
                <><CheckCircle2 className="h-4 w-4" /> Download Again</>
              ) : (
                <><Download className="h-4 w-4" /> Download Starter</>
              )}
            </button>
            {exportError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{exportError}</span>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex items-center gap-1 px-3 py-1 rounded-md bg-destructive/10 hover:bg-destructive/20 font-semibold text-xs transition-colors"
                >
                  <RefreshCw className="h-3 w-3" /> Retry
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative bg-gradient-to-b from-amber-50/80 to-white rounded-2xl border-2 border-amber-400/60 shadow-lg shadow-amber-100/50 flex flex-col overflow-hidden">
          <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl">
            Recommended
          </div>

          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Crown className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">Full Underwriting Model</h3>
                <p className="text-xs text-amber-600 font-medium">Free with account</p>
              </div>
            </div>
          </div>

          <div className="px-6 pb-4 flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              The package you'd hand to a lender — 21 tabs covering every angle of your school's financials.
            </p>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">21-tab workbook includes</p>
            <ul className="space-y-2">
              {FULL_MODEL_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <Lock className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-amber-200/60">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Plus</p>
              <ul className="space-y-2">
                {PLUS_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Zap className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="px-6 pb-6 pt-2">
            <Link
              href="/register"
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-white font-semibold shadow-lg shadow-amber-500/25 hover:bg-amber-600 hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              <Sparkles className="h-4 w-4" /> Create Free Account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {exported && (
        <div className="mt-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-5 py-2.5 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Starter workbook downloaded — check your downloads folder
          </div>
        </div>
      )}

      {exported && lendingLabIntent === "plan_to_apply" && (
        <div className="mt-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 max-w-xl mx-auto text-left">
            <div className="flex items-center gap-3 mb-4">
              <Landmark className="h-5 w-5 text-primary" />
              <h3 className="font-display font-bold text-lg text-foreground">Next steps for Lending Lab</h3>
            </div>
            <ul className="space-y-2.5">
              {[
                "Review your assumptions carefully",
                "Confirm staffing and facility costs are realistic",
                "Create a free account to unlock the full underwriting package",
                "Complete the Lending Lab application when ready",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {exported && !reviewSubmitted && !nudgeDismissed && (
        <div className="mt-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl px-5 py-3 flex items-center gap-3">
            <MessageSquareMore className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 flex-1">
              <span className="font-semibold">Before you go</span> — want an expert to look over your model? <button onClick={() => setShowReviewForm(true)} className="font-bold text-amber-700 underline underline-offset-2 hover:text-amber-900 transition-colors">Request a free review</button>
            </p>
            <button
              type="button"
              onClick={() => setNudgeDismissed(true)}
              className="text-amber-400 hover:text-amber-600 transition-colors p-1 flex-shrink-0"
              aria-label="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
      )}

      {exported && lendingLabIntent !== "plan_to_apply" && (
        <div className="mt-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="bg-accent/10 border border-accent/20 rounded-2xl p-6 max-w-xl mx-auto text-center">
            <h3 className="font-display font-bold text-xl text-foreground mb-2">Looking for capital?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Now that you have a solid financial model, you might be ready to explore funding options to launch or grow your school.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 text-accent font-bold hover:text-accent/80 transition-colors text-sm"
            >
              Learn about our loan program <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      <div className="mt-10 max-w-3xl mx-auto">
        {reviewSubmitted ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-center gap-3 mb-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <h3 className="font-display font-bold text-xl text-green-900">Review requested — we'll be in touch</h3>
            </div>
            <p className="text-green-700 text-sm text-center">
              Check your email for a confirmation. Our team will review your model and get back to you within 5–7 business days.
            </p>
          </div>
        ) : showReviewForm ? (
          <div className="bg-gradient-to-b from-amber-50/80 to-white border-2 border-amber-400/40 rounded-2xl p-8 shadow-lg animate-in fade-in duration-300">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <MessageSquareMore className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="font-display font-bold text-xl text-foreground">Request Expert Review</h3>
            </div>
            <p className="text-muted-foreground text-sm mb-6">Our team will review your financial model and send personalized feedback within 5–7 business days — completely free.</p>
            <form onSubmit={handleReviewSubmit} className="space-y-4 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Your name</label>
                  <input
                    type="text"
                    required
                    value={reviewName}
                    onChange={e => setReviewName(e.target.value)}
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
                    onChange={e => setReviewEmail(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                    placeholder="jane@school.org"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Questions or notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  value={reviewMessage}
                  onChange={e => setReviewMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 resize-none"
                  placeholder="Anything specific you'd like us to look at?"
                />
              </div>
              {reviewError && (
                <p className="text-sm text-red-600">{reviewError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={reviewLoading || !reviewName.trim() || !reviewEmail.trim()}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-500 text-white font-semibold py-3 px-4 rounded-xl hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {reviewLoading ? "Submitting..." : "Submit Review Request"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReviewForm(false); setReviewError(null); }}
                  className="px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-muted/50 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div
            onClick={() => setShowReviewForm(true)}
            className="w-full cursor-pointer group bg-gradient-to-r from-amber-50 via-white to-amber-50 border-2 border-amber-300/60 hover:border-amber-400 rounded-2xl p-6 sm:p-8 transition-all hover:shadow-xl hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 transition-colors">
                <MessageSquareMore className="h-7 w-7 text-amber-600" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-display font-bold text-lg sm:text-xl text-foreground mb-1">Get a Free Expert Review</h3>
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                  Our team of school finance specialists will review your model and send you personalized feedback — what looks strong, what to watch, and how to improve your lending position.
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Free of charge</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> 5–7 day turnaround</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> No account required</span>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-amber-500 mt-1 flex-shrink-0 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
