import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

interface FinancingInsightProps {
  text: string;
  className?: string;
}

export function FinancingInsight({ text, className }: FinancingInsightProps) {
  return (
    <div className={cn("flex items-start gap-1.5 mt-1", className)}>
      <Landmark className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-[11px] text-slate-500 leading-relaxed">{text}</p>
    </div>
  );
}
