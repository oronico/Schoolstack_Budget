import { X, TrendingUp, CheckCircle2 } from "lucide-react";

interface ExtendToFiveYearModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending?: boolean;
}

/**
 * Confirmation modal shown when a single-year founder asks to extend to a
 * 5-year projection. Pure presentation — the actual flag flip + Y2-Y5
 * backfill is wired by the caller via `onConfirm`.
 *
 * The copy here is the contract the marketing site promises: "when you're
 * ready, the multi-year view is already there". This modal is what makes
 * that promise feel real.
 */
export function ExtendToFiveYearModal({
  open,
  onClose,
  onConfirm,
  isPending = false,
}: ExtendToFiveYearModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extend-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-1 rounded-lg text-muted-foreground hover:bg-black/5 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <h2 id="extend-modal-title" className="font-display text-2xl font-bold text-foreground">
            Extend to a 5-year projection?
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          We'll seed Years 2&ndash;5 from your Year 1 inputs using your escalation rates,
          then drop you on the Enrollment step so you can review the ramp before continuing.
          You can edit any year afterwards.
        </p>
        <ul className="space-y-2 mb-6 text-sm text-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>Your Year 1 numbers stay exactly as you entered them.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>Enrollment, tuition, staffing, and expenses for Years 2&ndash;5 are derived from Year 1 using your assumption rates (defaults: flat enrollment, 3%/yr tuition, 3%/yr salary, 3%/yr cost inflation).</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>Any Y2&ndash;Y5 values you've already entered are preserved &mdash; only empty years get reseeded.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>Lender Packet, Board Summary, and 5-year exports become available.</span>
          </li>
        </ul>
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-semibold text-muted-foreground hover:bg-black/5 transition-colors"
          >
            Stay on Single-Year
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isPending ? "Extending..." : "Extend to 5-Year"}
          </button>
        </div>
      </div>
    </div>
  );
}
