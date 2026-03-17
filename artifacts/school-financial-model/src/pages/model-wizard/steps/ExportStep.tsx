import { useState } from "react";
import { getExportModelUrl } from "@workspace/api-client-react";
import { Download, Loader2, PartyPopper, ArrowRight, FileSpreadsheet, ClipboardCheck } from "lucide-react";
import { Link } from "wouter";

type ExportType = "formula" | "underwritingV2";

export function ExportStep({ modelId }: { jumpToStep?: (s:number)=>void, modelId: number | null }) {
  const [loading, setLoading] = useState<ExportType | null>(null);
  const [exported, setExported] = useState<Set<ExportType>>(new Set());

  const handleDownload = async (type: ExportType) => {
    if (!modelId || loading) return;
    setLoading(type);

    try {
      const urlMap: Record<ExportType, string> = {
        formula: getExportModelUrl(modelId),
        underwritingV2: `/api/models/${modelId}/export/underwriting-v2`,
      };

      const token = localStorage.getItem('auth_token');
      const res = await fetch(urlMap[type], {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const fallbackNames: Record<ExportType, string> = {
        formula: `School_Budget_Formulas_${modelId}.xlsx`,
        underwritingV2: `Underwriting_Package_${modelId}.xlsx`,
      };
      const filename = filenameMatch?.[1] || fallbackNames[type];
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      setExported(prev => new Set(prev).add(type));
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
        {anyExported ? "Your reports are ready!" : "Ready to export your model?"}
      </h2>

      <p className="text-xl text-muted-foreground mb-10 max-w-lg mx-auto">
        {anyExported
          ? "Check your downloads folder. All documents are lender-ready and fully formatted."
          : "Download your financial model as a polished Excel workbook - ready for lender meetings."}
      </p>

      <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <ExportCard
          icon={<ClipboardCheck className="h-7 w-7" />}
          title="Underwriting Package"
          description="21-tab workbook with DSCR, covenants, balance sheet, debt schedule & full formulas"
          isLoading={loading === "underwritingV2"}
          isExported={exported.has("underwritingV2")}
          disabled={loading !== null && loading !== "underwritingV2"}
          onClick={() => handleDownload("underwritingV2")}
          highlight
        />
        <ExportCard
          icon={<FileSpreadsheet className="h-7 w-7" />}
          title="Formula Workbook"
          description="Assumptions page with live formulas — lenders can test the math"
          isLoading={loading === "formula"}
          isExported={exported.has("formula")}
          disabled={loading !== null && loading !== "formula"}
          onClick={() => handleDownload("formula")}
        />
      </div>

      {anyExported && (
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

function ExportCard({
  icon, title, description, isLoading, isExported, disabled, onClick, highlight
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  isLoading: boolean;
  isExported: boolean;
  disabled: boolean;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group bg-white rounded-2xl border shadow-sm p-6 flex flex-col items-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1 disabled:opacity-50 disabled:transform-none disabled:cursor-not-allowed ${highlight ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border/60'}`}
    >
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${isExported ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary group-hover:bg-primary/20'}`}>
        {isLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : icon}
      </div>
      <span className="font-display font-bold text-sm text-foreground">{isExported ? `${title} ✓` : title}</span>
      <span className="text-xs text-muted-foreground leading-snug">{description}</span>
      <span className="mt-auto text-xs font-semibold text-primary group-hover:text-primary/80 transition-colors">
        {isLoading ? "Generating..." : isExported ? "Download Again" : "Download"}
      </span>
    </button>
  );
}
