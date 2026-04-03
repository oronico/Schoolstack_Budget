import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface LenderHintProps {
  text: string;
  className?: string;
}

export function LenderHint({ text, className }: LenderHintProps) {
  return (
    <div className={cn("flex items-start gap-1.5 mt-1", className)}>
      <Shield className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-[11px] text-slate-500 leading-relaxed">{text}</p>
    </div>
  );
}
