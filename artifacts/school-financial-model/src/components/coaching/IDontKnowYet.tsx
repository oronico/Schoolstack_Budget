import { useState } from "react";
import { Wand2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface IDontKnowYetProps {
  label?: string;
  helperText?: string;
  onApply: () => void;
  appliedMessage?: string;
  className?: string;
}

export function IDontKnowYet({
  label = "I don't know this yet — use a typical value",
  helperText = "We'll fill in a sensible starting point. You can refine it any time.",
  onApply,
  appliedMessage = "Starter values added — edit anything below.",
  className,
}: IDontKnowYetProps) {
  const [applied, setApplied] = useState(false);

  const handleClick = () => {
    onApply();
    setApplied(true);
  };

  if (applied) {
    return (
      <div
        className={cn(
          "rounded-xl border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-2.5 text-sm",
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-amber-900">{appliedMessage}</p>
          <p className="text-xs text-amber-800/80 mt-0.5">
            These are typical defaults — your own numbers will be more accurate when you have them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "w-full text-left rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/30 hover:bg-amber-50/60 hover:border-amber-400 p-3.5 flex items-start gap-3 transition-all group",
        className,
      )}
    >
      <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
        <Wand2 className="h-4 w-4 text-amber-700" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-900">{label}</p>
        <p className="text-xs text-amber-800/80 mt-0.5">{helperText}</p>
      </div>
    </button>
  );
}
