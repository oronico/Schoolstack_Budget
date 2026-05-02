import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

export type InsightCalloutTone = "info" | "success" | "warning";
export type InsightCalloutVariant = "card" | "inline";

interface InsightCalloutProps {
  body: string;
  label?: string;
  tone?: InsightCalloutTone;
  variant?: InsightCalloutVariant;
  className?: string;
}

export function InsightCallout({
  body,
  label,
  tone = "info",
  variant = "card",
  className,
}: InsightCalloutProps) {
  if (variant === "inline") {
    return (
      <div className={cn("flex items-start gap-1.5 mt-1", className)}>
        <Landmark
          className="h-3 w-3 text-slate-400 mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-0.5">
          {label && (
            <p className="text-[11px] font-semibold text-slate-600 leading-relaxed">
              {label}
            </p>
          )}
          <p className="text-[11px] text-slate-500 leading-relaxed">{body}</p>
        </div>
      </div>
    );
  }

  const accent =
    tone === "warning"
      ? "border-amber-300 bg-amber-50"
      : tone === "success"
        ? "border-green-300 bg-green-50"
        : "border-teal-300 bg-teal-50";
  const iconColor =
    tone === "warning"
      ? "text-amber-600"
      : tone === "success"
        ? "text-green-600"
        : "text-teal-600";
  const labelColor =
    tone === "warning"
      ? "text-amber-800"
      : tone === "success"
        ? "text-green-800"
        : "text-teal-800";

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border-l-4 px-3 py-2",
        accent,
        className,
      )}
    >
      <Landmark
        className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", iconColor)}
        aria-hidden="true"
      />
      <div className="space-y-0.5">
        {label && (
          <p className={cn("text-xs font-semibold", labelColor)}>{label}</p>
        )}
        <p className="text-xs text-slate-600 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
