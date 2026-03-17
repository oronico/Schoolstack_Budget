import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Download, Loader2, PartyPopper, ArrowRight, ClipboardCheck, Calendar, Landmark, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { getPublicExportUnderwritingUrl } from "@workspace/api-client-react";

type ExportMode = "5year" | "singleYear";

export function PublicExportStep({ jumpToStep, modelId }: { jumpToStep?: (s: number) => void; modelId: number | null }) {
  const [loading, setLoading] = useState<ExportMode | null>(null);
  const [exported, setExported] = useState<Set<ExportMode>>(new Set());
  const [singleYearIndex, setSingleYearIndex] = useState(0);
  const { getValues, watch } = useFormContext();
  const lendingLabIntent = watch("schoolProfile.lendingLabIntent");

  const handleDownload = async (mode: ExportMode) => {
    if (loading) return;
    setLoading(mode);

    try {
      const data = getValues();
      const url = mode === "singleYear"
        ? `/api/public/export-single-year?year=${singleYearIndex}`
        : getPublicExportUnderwritingUrl();

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const fallback = mode === "singleYear"
        ? `Year_${singleYearIndex + 1}_Budget.xlsx`
        : "SchoolStack_Budget_Model.xlsx";
      const filename = filenameMatch?.[1] || fallback;
      const urlObj = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(urlObj);
      a.remove();
      setExported(prev => new Set(prev).add(mode));
    } catch (e) {
      console.error(e);
      alert("Failed to export. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const anyExported = exported.size > 0;

  return (
    <div className="text-center py-12 px-4">
      <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-8">
        {anyExported ? (
          <PartyPopper className="h-12 w-12 text-primary" />
        ) : (
          <Download className="h-12 w-12 text-primary" />
        )}
      </div>

      <h2 className="font-display text-4xl font-bold text-foreground mb-4">
        {anyExported ? "Your workbook is ready!" : "Ready to export your model?"}
      </h2>

      <p className="text-xl text-muted-foreground mb-6 max-w-lg mx-auto">
        {anyExported
          ? "Check your downloads folder. Your workbook is fully formatted and lender-ready."
          : "Download your budget model as a polished Excel workbook - ready for lender meetings."}
      </p>

      {lendingLabIntent === "plan_to_apply" && (
        <div className="max-w-lg mx-auto mb-8 bg-primary/5 border border-primary/20 rounded-2xl px-6 py-4 text-left">
          <div className="flex items-start gap-3">
            <Landmark className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              This model can help you prepare for Lending Lab review. It does not replace the full application or diligence process.
            </p>
          </div>
        </div>
      )}

      {lendingLabIntent === "want_to_understand" && (
        <div className="max-w-lg mx-auto mb-8 bg-accent/5 border border-accent/20 rounded-2xl px-6 py-4 text-left">
          <div className="flex items-start gap-3">
            <Landmark className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">
              We'll highlight the kinds of information Lending Lab typically reviews. Your workbook covers the key areas lenders look for.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => handleDownload("5year")}
          disabled={loading !== null && loading !== "5year"}
          className="group bg-white rounded-2xl border border-border/60 shadow-sm p-6 flex flex-col items-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1 disabled:opacity-50 disabled:transform-none disabled:cursor-not-allowed"
        >
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${exported.has("5year") ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary/20"}`}>
            {loading === "5year" ? <Loader2 className="h-7 w-7 animate-spin" /> : <ClipboardCheck className="h-7 w-7" />}
          </div>
          <span className="font-display font-bold text-sm text-foreground">
            {exported.has("5year") ? "5-Year Budget ✓" : "5-Year Budget Model"}
          </span>
          <span className="text-xs text-muted-foreground leading-snug">
            3-tab workbook with assumptions, projections & monthly pro forma
          </span>
          <span className="mt-auto text-xs font-semibold text-primary group-hover:text-primary/80 transition-colors">
            {loading === "5year" ? "Generating..." : exported.has("5year") ? "Download Again" : "Download"}
          </span>
        </button>

        <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-6 flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${exported.has("singleYear") ? "bg-green-100 text-green-600" : "bg-amber-50 text-amber-600"}`}>
            {loading === "singleYear" ? <Loader2 className="h-7 w-7 animate-spin" /> : <Calendar className="h-7 w-7" />}
          </div>
          <span className="font-display font-bold text-sm text-foreground">
            {exported.has("singleYear") ? "Single-Year Budget ✓" : "Single-Year Budget"}
          </span>
          <span className="text-xs text-muted-foreground leading-snug">
            Monthly budget with Jul–Jun columns for one year
          </span>
          <select
            value={singleYearIndex}
            onChange={(e) => setSingleYearIndex(Number(e.target.value))}
            className="w-full mt-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {[0, 1, 2, 3, 4].map(i => (
              <option key={i} value={i}>Year {i + 1}</option>
            ))}
          </select>
          <button
            onClick={() => handleDownload("singleYear")}
            disabled={loading !== null && loading !== "singleYear"}
            className="mt-auto text-xs font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading === "singleYear" ? "Generating..." : exported.has("singleYear") ? "Download Again" : "Download"}
          </button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Want to save your model and unlock all export formats?
      </p>
      <Link
        href="/register"
        className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
      >
        Create a Free Account <ArrowRight className="h-4 w-4" />
      </Link>

      {anyExported && lendingLabIntent === "plan_to_apply" && (
        <div className="mt-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 max-w-xl mx-auto text-left">
            <div className="flex items-center gap-3 mb-5">
              <Landmark className="h-6 w-6 text-primary" />
              <h3 className="font-display font-bold text-xl text-foreground">Next steps for Lending Lab</h3>
            </div>
            <ul className="space-y-3">
              {[
                "Review your assumptions carefully",
                "Confirm staffing and facility costs are realistic",
                "Save your workbook",
                "Complete the Lending Lab application when ready",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {anyExported && lendingLabIntent !== "plan_to_apply" && (
        <div className="mt-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="bg-accent/10 border border-accent/20 rounded-3xl p-8 max-w-xl mx-auto">
            <h3 className="font-display font-bold text-2xl text-foreground mb-3">Looking for capital?</h3>
            <p className="text-muted-foreground mb-6">
              Now that you have a solid financial model, you might be ready to explore funding options to launch or grow your school.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 text-accent font-bold hover:text-accent/80 transition-colors"
            >
              Learn about our loan program <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
