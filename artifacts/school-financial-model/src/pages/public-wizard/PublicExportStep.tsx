import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { Download, Loader2, PartyPopper, ArrowRight, ClipboardCheck } from "lucide-react";
import { Link } from "wouter";
import { getPublicExportUnderwritingUrl } from "@workspace/api-client-react";

export function PublicExportStep({ jumpToStep, modelId }: { jumpToStep?: (s: number) => void; modelId: number | null }) {
  const [loading, setLoading] = useState(false);
  const [exported, setExported] = useState(false);
  const { getValues } = useFormContext();

  const handleDownload = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const data = getValues();
      const res = await fetch(getPublicExportUnderwritingUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch?.[1] || "SchoolStack_Underwriting_Pro_Forma.xlsx";
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
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
    <div className="text-center py-12 px-4">
      <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-8">
        {exported ? (
          <PartyPopper className="h-12 w-12 text-primary" />
        ) : (
          <Download className="h-12 w-12 text-primary" />
        )}
      </div>

      <h2 className="font-display text-4xl font-bold text-foreground mb-4">
        {exported ? "Your workbook is ready!" : "Ready to export your model?"}
      </h2>

      <p className="text-xl text-muted-foreground mb-10 max-w-lg mx-auto">
        {exported
          ? "Check your downloads folder. Your 14-tab underwriting workbook is fully formatted and lender-ready."
          : "Download your financial model as a comprehensive 14-tab Excel underwriting workbook — ready for lender meetings."}
      </p>

      <div className="max-w-sm mx-auto mb-8">
        <button
          onClick={handleDownload}
          disabled={loading}
          className="group w-full bg-white rounded-2xl border border-border/60 shadow-sm p-6 flex flex-col items-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1 disabled:opacity-50 disabled:transform-none disabled:cursor-not-allowed"
        >
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${exported ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary/20"}`}>
            {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <ClipboardCheck className="h-7 w-7" />}
          </div>
          <span className="font-display font-bold text-sm text-foreground">
            {exported ? "Underwriting Pro Forma ✓" : "Underwriting Pro Forma"}
          </span>
          <span className="text-xs text-muted-foreground leading-snug">
            14-tab workbook with DSCR, covenants & balance sheet
          </span>
          <span className="mt-auto text-xs font-semibold text-primary group-hover:text-primary/80 transition-colors">
            {loading ? "Generating..." : exported ? "Download Again" : "Download"}
          </span>
        </button>
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

      {exported && (
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
