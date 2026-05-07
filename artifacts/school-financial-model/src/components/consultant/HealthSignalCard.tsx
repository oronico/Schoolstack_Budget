import { CheckCircle2, AlertTriangle, ShieldAlert, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthSignal } from "@workspace/api-client-react";

const STATUS_CONFIG = {
  healthy: {
    icon: CheckCircle2,
    badgeClass: "bg-green-100 text-green-700",
    iconClass: "text-green-600",
    dotClass: "bg-green-500",
  },
  watch: {
    icon: AlertTriangle,
    badgeClass: "bg-amber-100 text-amber-700",
    iconClass: "text-amber-500",
    dotClass: "bg-amber-500",
  },
  at_risk: {
    icon: ShieldAlert,
    badgeClass: "bg-rose-100 text-rose-700",
    iconClass: "text-rose-500",
    dotClass: "bg-rose-500",
  },
};

const DIMENSION_LABELS: Record<string, string> = {
  viability: "Viability",
  liquidity: "Liquidity",
  staffing_burden: "Staffing burden",
  facility_burden: "Facility burden",
  debt_affordability: "Debt affordability",
  revenue_concentration: "Revenue concentration",
  reserve_strength: "Reserve strength",
};

interface HealthSignalsSectionProps {
  signals: HealthSignal[];
}

export function HealthSignalsSection({ signals }: HealthSignalsSectionProps) {
  if (!signals || signals.length === 0) return null;

  const healthyCount = signals.filter(s => s.status === "healthy").length;
  const watchCount = signals.filter(s => s.status === "watch").length;
  const atRiskCount = signals.filter(s => s.status === "at_risk").length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Eye className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-lg text-foreground">Financial Health</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        How your model performs across {signals.length} key dimensions
      </p>

      <div className="flex flex-wrap gap-3 mb-5">
        {healthyCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {healthyCount} Healthy
          </span>
        )}
        {watchCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {watchCount} Watch
          </span>
        )}
        {atRiskCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            {atRiskCount} Needs attention
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {signals.map((signal) => {
          const config = STATUS_CONFIG[signal.status] || STATUS_CONFIG.watch;
          const Icon = config.icon;
          const dimensionLabel = DIMENSION_LABELS[signal.dimension] || signal.dimension;

          return (
            <div
              key={signal.dimension}
              className="bg-white rounded-xl border border-border/60 shadow-sm p-4 flex flex-col"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">
                  {dimensionLabel}
                </span>
                <span className={cn(
                  "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full",
                  config.badgeClass,
                )}>
                  <Icon className="h-3 w-3" />
                  {signal.label}
                </span>
              </div>
              <p className="text-xs text-foreground/70 leading-relaxed mb-2 flex-1">
                {signal.explanation}
              </p>
              <div className="pt-2 border-t border-border/40 space-y-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Watch:</span> {signal.watchItem}
                </p>
                {/* Task #686 — `nextStep` is a required field on every signal. */}
                <p className="text-xs text-emerald-700">
                  <span className="font-semibold">Next step:</span> {signal.nextStep}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
