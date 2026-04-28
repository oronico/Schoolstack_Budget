import { Lightbulb } from "lucide-react";

interface WhyThisMattersProps {
  title?: string;
  why: string;
  revisit?: string;
}

export function WhyThisMatters({ title = "Why this matters", why, revisit }: WhyThisMattersProps) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 flex items-start gap-3 mb-6">
      <div className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
        <Lightbulb className="h-4 w-4 text-amber-700" />
      </div>
      <div className="text-sm">
        <p className="font-semibold text-amber-900">{title}</p>
        <p className="text-amber-800/90 mt-1 leading-relaxed">{why}</p>
        {revisit && (
          <p className="text-xs text-amber-700/80 mt-2">
            <span className="font-medium">When to revisit:</span> {revisit}
          </p>
        )}
      </div>
    </div>
  );
}
