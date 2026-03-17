import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MetricDelta } from "@/lib/scenario-compare";

const DIRECTION_CONFIG = {
  improved: {
    icon: ArrowUp,
    bgClass: "bg-emerald-50 border-emerald-200",
    iconClass: "text-emerald-600",
    badgeClass: "bg-emerald-100 text-emerald-700",
    badgeText: "Improved",
  },
  worsened: {
    icon: ArrowDown,
    bgClass: "bg-rose-50 border-rose-200",
    iconClass: "text-rose-600",
    badgeClass: "bg-rose-100 text-rose-700",
    badgeText: "Worsened",
  },
  unchanged: {
    icon: Minus,
    bgClass: "bg-gray-50 border-gray-200",
    iconClass: "text-gray-400",
    badgeClass: "bg-gray-100 text-gray-500",
    badgeText: "No change",
  },
};

function formatValue(id: string, value: number): string {
  if (id === "break_even") return value < 0 ? "Never" : `Year ${value}`;
  if (id === "cash_runway") return value >= 60 ? "60+ months" : `${value.toFixed(0)} months`;
  if (id === "reserve_months") return `${value.toFixed(1)} months`;
  if (id === "enrollment_y5") return `${Math.round(value)} students`;
  if (id.includes("margin")) return `${(value * 100).toFixed(1)}%`;
  if (id.includes("dscr")) return value === 0 ? "N/A" : `${value.toFixed(2)}x`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDelta(id: string, delta: number): string {
  const sign = delta > 0 ? "+" : "";
  if (id === "break_even") return delta === 0 ? "—" : `${sign}${delta} yr`;
  if (id === "cash_runway" || id === "reserve_months") return `${sign}${delta.toFixed(1)} mo`;
  if (id === "enrollment_y5") return `${sign}${Math.round(delta)}`;
  if (id.includes("margin")) return `${sign}${(delta * 100).toFixed(1)}pp`;
  if (id.includes("dscr")) return `${sign}${delta.toFixed(2)}x`;
  if (Math.abs(delta) >= 1_000_000) return `${sign}$${(delta / 1_000_000).toFixed(1)}M`;
  if (Math.abs(delta) >= 1_000) return `${sign}$${(delta / 1_000).toFixed(0)}K`;
  return `${sign}$${delta.toFixed(0)}`;
}

interface ScenarioDeltaCardProps {
  delta: MetricDelta;
}

export function ScenarioDeltaCard({ delta }: ScenarioDeltaCardProps) {
  const config = DIRECTION_CONFIG[delta.direction];
  const Icon = config.icon;

  return (
    <div className={cn("rounded-xl border p-4 transition-all", config.bgClass)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-foreground">{delta.label}</span>
        <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", config.badgeClass)}>
          <Icon className="h-3 w-3" />
          {config.badgeText}
        </span>
      </div>

      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-xs text-muted-foreground">{formatValue(delta.id, delta.baseValue)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-sm font-mono font-semibold text-foreground">{formatValue(delta.id, delta.compareValue)}</span>
        {delta.direction !== "unchanged" && (
          <span className={cn("text-xs font-mono font-bold", config.iconClass)}>
            ({formatDelta(delta.id, delta.delta)})
          </span>
        )}
      </div>

      <p className="text-xs text-foreground/70 leading-relaxed">{delta.explanation}</p>
    </div>
  );
}
