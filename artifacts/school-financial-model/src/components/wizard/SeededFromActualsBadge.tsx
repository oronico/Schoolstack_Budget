import { Sparkles, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// Task #703 — Y1 inputs that were pre-filled by the actuals seeder show
// a small "Seeded from your last-year actuals — adjust if your plan
// differs" badge so the founder always knows where the number came
// from. An optional onResetToActual callback puts the actuals figure
// back if the founder typed over it and changed their mind.

export function SeededFromActualsBadge({
  onResetToActual,
  actualLabel,
  className,
}: {
  onResetToActual?: () => void;
  /** Short label shown on the reset button — e.g. "$60,000". Helps the
   *  founder see *what* the reset will restore without opening the
   *  intake step. */
  actualLabel?: string;
  className?: string;
}) {
  return (
    <div
      data-testid="seeded-from-actuals-badge"
      className={cn(
        "flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-[11px] text-emerald-800",
        className,
      )}
    >
      <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">Seeded from your last-year actuals</span>{" "}
        — adjust if your plan differs.
        {onResetToActual && (
          <button
            type="button"
            data-testid="seeded-from-actuals-reset"
            onClick={onResetToActual}
            className="ml-1 inline-flex items-center gap-1 underline hover:no-underline font-medium"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to actual{actualLabel ? ` (${actualLabel})` : ""}
          </button>
        )}
      </div>
    </div>
  );
}
