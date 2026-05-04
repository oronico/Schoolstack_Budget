import { useFormContext } from "react-hook-form";
import { MessageSquareText } from "lucide-react";

// Lightweight rationale capture box rendered on every wizard category card.
// The textarea registers directly against
// `budgetNarrative.inlineRationales.<rationaleKey>` so the wizard's existing
// auto-save persists the value with no extra plumbing. Keys are semantic
// `step:categoryId` strings (see `schema.ts`) so they survive wizard step
// reorders and a downstream task can roll them up into the Lender Narrative
// without depending on visual layout.

export interface RationaleFieldProps {
  /** Stable semantic key, e.g. `revenue:tuition_and_fees`. */
  rationaleKey: string;
  /** Optional label override. Defaults to "Why these numbers?". */
  label?: string;
  /**
   * Smart placeholder generated from current form values (e.g. "You set
   * tuition at $14,500/student. What anchors that…"). Falls back to a
   * generic prompt when omitted.
   */
  placeholder?: string;
  /** Optional secondary helper line under the textarea. */
  helperText?: string;
  /** Tailwind override / additional classes for the outer container. */
  className?: string;
  /** `rows` attribute on the textarea. Defaults to 2. */
  rows?: number;
}

const DEFAULT_PLACEHOLDER =
  "A sentence or two on how you arrived at these numbers - pricing comps, a signed LOI, a recent quote, or a board mandate.";

export function RationaleField({
  rationaleKey,
  label = "Why these numbers?",
  placeholder,
  helperText,
  className,
  rows = 2,
}: RationaleFieldProps) {
  const { register } = useFormContext();
  // Sanitize the key for DOM ids only — the actual storage path keeps the
  // colon so it stays human-readable in saved JSON.
  const fieldId = `rationale-${rationaleKey.replace(/[^a-z0-9]+/gi, "-")}`;
  const path = `budgetNarrative.inlineRationales.${rationaleKey}` as const;

  return (
    <div
      data-rationale-key={rationaleKey}
      className={
        className ??
        "rounded-xl border border-slate-200 bg-slate-50/40 px-4 py-3 space-y-2 mt-3"
      }
    >
      <label
        htmlFor={fieldId}
        className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-slate-600"
      >
        <MessageSquareText className="h-3.5 w-3.5" />
        {label}
        <span className="text-[10px] font-normal normal-case tracking-normal text-slate-400">
          (optional)
        </span>
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        {...register(path)}
        placeholder={placeholder ?? DEFAULT_PLACEHOLDER}
        className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-slate-400 placeholder:italic"
      />
      {helperText && (
        <p className="text-[11px] text-slate-500 leading-snug">{helperText}</p>
      )}
    </div>
  );
}
