import { useEffect, useRef } from "react";
import { CheckCircle2, ArrowRight, Undo2, Plus, ArrowRightLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionType } from "@/pages/model-wizard/schema";
import { DECISION_THEME, type DecisionFieldChange } from "@/lib/decision-flows";

interface ApplyConfirmationProps {
  decisionType: DecisionType;
  scenarioName: string;
  changes: DecisionFieldChange[];
  isUndoing: boolean;
  onUndo: () => void;
  onContinue: () => void;
}

// Confirmation modal shown immediately after "Apply to my model" succeeds.
// Lists each field that changed (old → new) and offers a one-click Undo
// that restores the previous model snapshot. The two flows that auto-redirect
// after Apply (add_program, evaluate_site, change_enrollment) all wait on
// the user to dismiss this modal — never auto-close — so the audit trail
// can't slip past them.
export function ApplyConfirmation({
  decisionType,
  scenarioName,
  changes,
  isUndoing,
  onUndo,
  onContinue,
}: ApplyConfirmationProps) {
  const theme = DECISION_THEME[decisionType];
  const continueRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Move keyboard focus to the primary action so Enter dismisses the
    // modal cleanly. Screen readers will also announce the dialog title via
    // the aria-labelledby below.
    continueRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-confirmation-title"
      data-testid="decision-flow-apply-confirmation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-2xl">
        <header className={cn("px-6 py-4 border-b border-border flex items-start gap-3", theme.bg)}>
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-white flex-shrink-0", theme.accent)}>
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p
              id="apply-confirmation-title"
              className={cn("font-display text-base font-bold", theme.text)}
            >
              Decision applied to your model
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              "{scenarioName}" is now folded into the base model. Review what changed below.
            </p>
          </div>
        </header>

        <section className="px-6 py-4">
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic" data-testid="apply-confirmation-no-changes">
              No model fields were modified by this decision. (You can still undo to restore the
              snapshot taken before the apply step.)
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                What changed in your base model
              </p>
              <ul className="space-y-2.5" data-testid="apply-confirmation-changes">
                {changes.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-muted/30 p-3"
                    data-testid={`apply-confirmation-change-${i}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full",
                          c.kind === "added"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800",
                        )}
                      >
                        {c.kind === "added" ? <Plus className="h-2.5 w-2.5" /> : <ArrowRightLeft className="h-2.5 w-2.5" />}
                        {c.kind === "added" ? "Added" : "Changed"}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{c.label}</span>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs ml-1">
                      <span className="text-muted-foreground">Before</span>
                      <span
                        className="font-mono text-foreground/80"
                        data-testid={`apply-confirmation-before-${i}`}
                      >
                        {c.before}
                      </span>
                      <span className="text-muted-foreground">After</span>
                      <span
                        className={cn("font-mono font-semibold", theme.text)}
                        data-testid={`apply-confirmation-after-${i}`}
                      >
                        {c.after}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <footer className="px-6 py-4 border-t border-border bg-muted/20 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onUndo}
            disabled={isUndoing}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-border text-foreground hover:bg-muted transition-colors",
              isUndoing && "opacity-60 cursor-not-allowed",
            )}
            data-testid="apply-confirmation-undo"
          >
            {isUndoing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Undo2 className="h-3.5 w-3.5" />
            )}
            {isUndoing ? "Restoring…" : "Undo apply"}
          </button>
          <button
            type="button"
            ref={continueRef}
            onClick={onContinue}
            disabled={isUndoing}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md text-white transition-colors",
              theme.accent,
              !isUndoing && "hover:brightness-110",
              isUndoing && "opacity-60 cursor-not-allowed",
            )}
            data-testid="apply-confirmation-continue"
          >
            View updated model <ArrowRight className="h-4 w-4" />
          </button>
        </footer>
      </div>
    </div>
  );
}
