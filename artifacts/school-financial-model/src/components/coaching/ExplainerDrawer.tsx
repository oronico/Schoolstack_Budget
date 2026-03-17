import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiFormula } from "@/lib/coaching/kpi-formulas";

interface KpiFormulaDrawerProps {
  formula: KpiFormula;
  values?: { label: string; value: string }[];
  open: boolean;
  onClose: () => void;
}

export function KpiFormulaDrawer({ formula, values, open, onClose }: KpiFormulaDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`How ${formula.title} is calculated`}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-background shadow-2xl border-l border-border animate-in slide-in-from-right duration-300 overflow-y-auto">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="font-display text-lg font-bold text-foreground">How is this calculated?</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-foreground mb-1">{formula.title}</h3>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Formula</p>
            <p className="font-mono text-sm text-foreground font-medium">{formula.formula}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Inputs used</p>
            <ul className="space-y-2">
              {formula.inputLabels.map((label, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/40 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>

          {values && values.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Your model's values</p>
              <div className="rounded-xl border border-border overflow-hidden">
                {values.map((v, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between px-4 py-2.5 text-sm",
                      i > 0 && "border-t border-border"
                    )}
                  >
                    <span className="text-muted-foreground">{v.label}</span>
                    <span className="font-semibold text-foreground">{v.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-gradient-to-br from-emerald-50/60 to-teal-50/40 border border-primary/15 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary/60 mb-1.5">What this tells you</p>
            <p className="text-sm text-foreground/80 leading-relaxed">{formula.interpretation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
