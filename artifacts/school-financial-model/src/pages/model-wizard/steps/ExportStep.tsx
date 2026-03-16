import { useState } from "react";
import { getExportModelUrl, getExportProFormaPdfUrl, getExportLoanReadinessPdfUrl, getExportLenderProformaUrl, getExportUnderwritingUrl } from "@workspace/api-client-react";
import { Download, Loader2, PartyPopper, ArrowRight, FileSpreadsheet, FileText, ShieldCheck, Landmark, ClipboardCheck, Calendar } from "lucide-react";
import { Link } from "wouter";

type ExportType = "xlsx" | "proforma" | "loanReadiness" | "lenderProforma" | "underwriting" | "singleYear";

export function ExportStep({ modelId }: { jumpToStep?: (s:number)=>void, modelId: number | null }) {
  const [loading, setLoading] = useState<ExportType | null>(null);
  const [exported, setExported] = useState<Set<ExportType>>(new Set());
  const [singleYearIndex, setSingleYearIndex] = useState(0);

  const handleDownload = async (type: ExportType) => {
    if (!modelId || loading) return;
    setLoading(type);

    try {
      const urlMap: Record<ExportType, string> = {
        xlsx: getExportModelUrl(modelId),
        proforma: getExportProFormaPdfUrl(modelId),
        loanReadiness: getExportLoanReadinessPdfUrl(modelId),
        lenderProforma: getExportLenderProformaUrl(modelId),
        underwriting: getExportUnderwritingUrl(modelId),
        singleYear: `/api/models/${modelId}/export/single-year?year=${singleYearIndex}`,
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
        xlsx: `School_Financial_Model_${modelId}.xlsx`,
        proforma: `Pro_Forma_${modelId}.pdf`,
        loanReadiness: `Loan_Readiness_Report_${modelId}.pdf`,
        lenderProforma: `Lender_Pro_Forma_${modelId}.xlsx`,
        underwriting: `Underwriting_Pro_Forma_${modelId}.xlsx`,
        singleYear: `Year_${singleYearIndex + 1}_Budget_${modelId}.xlsx`,
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
          : "Download your financial model as an Excel workbook or polished PDF reports — ready for lender meetings."}
      </p>

      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <ExportCard
          icon={<ClipboardCheck className="h-7 w-7" />}
          title="5-Year Underwriting Model"
          description="14-tab workbook with DSCR, covenants, balance sheet & interactive formulas"
          isLoading={loading === "underwriting"}
          isExported={exported.has("underwriting")}
          disabled={loading !== null && loading !== "underwriting"}
          onClick={() => handleDownload("underwriting")}
        />
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
        <ExportCard
          icon={<Landmark className="h-7 w-7" />}
          title="Lender Pro Forma"
          description="Template workbook with live P&L, DSCR & loan snapshot"
          isLoading={loading === "lenderProforma"}
          isExported={exported.has("lenderProforma")}
          disabled={loading !== null && loading !== "lenderProforma"}
          onClick={() => handleDownload("lenderProforma")}
        />
        <ExportCard
          icon={<FileSpreadsheet className="h-7 w-7" />}
          title="Excel Workbook"
          description="Full model with formulas across all tabs"
          isLoading={loading === "xlsx"}
          isExported={exported.has("xlsx")}
          disabled={loading !== null && loading !== "xlsx"}
          onClick={() => handleDownload("xlsx")}
        />
        <ExportCard
          icon={<FileText className="h-7 w-7" />}
          title="Pro Forma PDF"
          description="Financial projections summary for presentations"
          isLoading={loading === "proforma"}
          isExported={exported.has("proforma")}
          disabled={loading !== null && loading !== "proforma"}
          onClick={() => handleDownload("proforma")}
        />
        <ExportCard
          icon={<ShieldCheck className="h-7 w-7" />}
          title="Loan Readiness PDF"
          description="Consultant analysis with lender readiness assessment"
          isLoading={loading === "loanReadiness"}
          isExported={exported.has("loanReadiness")}
          disabled={loading !== null && loading !== "loanReadiness"}
          onClick={() => handleDownload("loanReadiness")}
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
  icon, title, description, isLoading, isExported, disabled, onClick
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  isLoading: boolean;
  isExported: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group bg-white rounded-2xl border border-border/60 shadow-sm p-6 flex flex-col items-center gap-3 transition-all hover:shadow-lg hover:-translate-y-1 disabled:opacity-50 disabled:transform-none disabled:cursor-not-allowed"
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
