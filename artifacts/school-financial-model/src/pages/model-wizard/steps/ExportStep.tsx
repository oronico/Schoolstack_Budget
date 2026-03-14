import { useState } from "react";
import { getExportModelUrl } from "@workspace/api-client-react";
import { Download, Loader2, PartyPopper, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export function ExportStep({ modelId }: { jumpToStep?: (s:number)=>void, modelId: number | null }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const handleExport = async () => {
    if (!modelId) return;
    setIsExporting(true);
    
    try {
      // Direct fetch to handle the Blob download
      const token = localStorage.getItem('auth_token');
      const res = await fetch(getExportModelUrl(modelId), {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      if (!res.ok) throw new Error("Export failed");
      
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
      const filename = filenameMatch?.[1] || `School_Financial_Model_${modelId}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      
      setExported(true);
    } catch (e) {
      console.error(e);
      alert("Failed to export model. Please try again.");
    } finally {
      setIsExporting(false);
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
        {exported ? "Your model is ready!" : "Ready to generate your model?"}
      </h2>
      
      <p className="text-xl text-muted-foreground mb-10 max-w-lg mx-auto">
        {exported 
          ? "Check your downloads folder for the Excel workbook. It includes all formulas and is fully unprotected."
          : "We'll build a comprehensive Excel workbook with assumption-driven formulas across all tabs — ready for lenders."}
      </p>

      <button
        onClick={handleExport}
        disabled={isExporting}
        className="mx-auto flex items-center justify-center gap-3 px-10 py-5 rounded-2xl bg-primary text-primary-foreground text-lg font-bold shadow-xl shadow-primary/25 hover:shadow-2xl hover:-translate-y-1 transition-all disabled:opacity-70 disabled:transform-none"
      >
        {isExporting ? <Loader2 className="h-6 w-6 animate-spin" /> : <Download className="h-6 w-6" />}
        {isExporting ? "Generating Excel File..." : exported ? "Download Again" : "Download Excel Workbook"}
      </button>

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
