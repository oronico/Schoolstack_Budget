import { useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  Download, Loader2, ArrowRight, Landmark, CheckCircle2,
  Lock, Check, FileSpreadsheet, Crown, Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { getPublicExportUnderwritingUrl } from "@workspace/api-client-react";

const STARTER_FEATURES = [
  "5-year budget projections",
  "Color-coded assumptions tab",
  "Live Excel formulas",
  "Financial Health scorecard",
  "Monthly pro forma view",
];

const FULL_MODEL_FEATURES = [
  "21-tab underwriting workbook",
  "Program-level revenue drivers",
  "Monthly cash flow forecast",
  "Balance sheet & net assets",
  "DSCR & covenant analysis",
  "Scenario comparison engine",
  "Lender-ready PDF packet",
  "Board summary PDF",
  "Debt schedule & amortization",
  "Decision engine insights",
];

export function PublicExportStep({ jumpToStep, modelId }: { jumpToStep?: (s: number) => void; modelId: number | null }) {
  const [loading, setLoading] = useState(false);
  const [exported, setExported] = useState(false);
  const { getValues, watch } = useFormContext();
  const lendingLabIntent = watch("schoolProfile.lendingLabIntent");

  const handleDownload = async () => {
    if (loading) return;
    setLoading(true);

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
      alert("Failed to export. Please try again.");
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
              A polished 5-tab Excel workbook with your key projections and assumptions.
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
              Everything in Starter, plus a comprehensive 21-tab underwriting package lenders expect to see.
            </p>
            <ul className="space-y-2.5">
              {FULL_MODEL_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <Lock className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
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
    </div>
  );
}
