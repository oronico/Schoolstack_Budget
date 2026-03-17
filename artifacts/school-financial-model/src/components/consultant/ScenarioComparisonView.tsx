import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Scale,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScenarioDeltaCard } from "./ScenarioDeltaCard";
import type { ComparisonResult } from "@/lib/scenario-compare";

const VERDICT_CONFIG = {
  stronger: {
    icon: ShieldCheck,
    bgClass: "bg-emerald-50 border-emerald-200",
    iconClass: "text-emerald-600",
    titleClass: "text-emerald-800",
    label: "Stronger Scenario",
  },
  weaker: {
    icon: ShieldAlert,
    bgClass: "bg-rose-50 border-rose-200",
    iconClass: "text-rose-600",
    titleClass: "text-rose-800",
    label: "Weaker Scenario",
  },
  mixed: {
    icon: Scale,
    bgClass: "bg-amber-50 border-amber-200",
    iconClass: "text-amber-600",
    titleClass: "text-amber-800",
    label: "Mixed Trade-offs",
  },
};

interface ScenarioComparisonViewProps {
  comparison: ComparisonResult;
  baseName: string;
  compareName: string;
}

export function ScenarioComparisonView({
  comparison,
  baseName,
  compareName,
}: ScenarioComparisonViewProps) {
  const verdictCfg = VERDICT_CONFIG[comparison.verdict];
  const VerdictIcon = verdictCfg.icon;

  const changed = comparison.metricDeltas.filter((d) => d.direction !== "unchanged");
  const unchanged = comparison.metricDeltas.filter((d) => d.direction === "unchanged");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <ArrowRightLeft className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-bold text-foreground">
          Scenario Comparison
        </h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Comparing <span className="font-semibold text-foreground">{baseName}</span> vs{" "}
        <span className="font-semibold text-foreground">{compareName}</span>
      </p>

      <div className={cn("rounded-2xl border-2 p-5", verdictCfg.bgClass)}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <VerdictIcon className={cn("h-7 w-7", verdictCfg.iconClass)} />
          </div>
          <div>
            <h3 className={cn("font-display font-bold text-lg", verdictCfg.titleClass)}>
              {verdictCfg.label}
            </h3>
            <p className="text-sm text-foreground/80 mt-1 leading-relaxed">
              {comparison.verdictExplanation}
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              {comparison.improvementCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  <TrendingUp className="h-3 w-3" />
                  {comparison.improvementCount} improved
                </span>
              )}
              {comparison.worsenedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">
                  <TrendingDown className="h-3 w-3" />
                  {comparison.worsenedCount} worsened
                </span>
              )}
              {unchanged.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                  {unchanged.length} unchanged
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {(comparison.biggestImprovement || comparison.biggestRisk) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {comparison.biggestImprovement && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Biggest Improvement</span>
              </div>
              <p className="text-sm font-semibold text-foreground">{comparison.biggestImprovement.label}</p>
              <p className="text-xs text-foreground/70 mt-1">{comparison.biggestImprovement.explanation}</p>
            </div>
          )}
          {comparison.biggestRisk && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-rose-600" />
                <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Biggest New Risk</span>
              </div>
              <p className="text-sm font-semibold text-foreground">{comparison.biggestRisk.label}</p>
              <p className="text-xs text-foreground/70 mt-1">{comparison.biggestRisk.explanation}</p>
            </div>
          )}
        </div>
      )}

      {changed.length > 0 && (
        <div>
          <h3 className="font-display font-semibold text-foreground mb-3">What Changed</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {changed.map((d) => (
              <ScenarioDeltaCard key={d.id} delta={d} />
            ))}
          </div>
        </div>
      )}

      {unchanged.length > 0 && (
        <div>
          <h3 className="font-display font-semibold text-muted-foreground mb-3">Unchanged</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unchanged.map((d) => (
              <ScenarioDeltaCard key={d.id} delta={d} />
            ))}
          </div>
        </div>
      )}

      {comparison.assumptionChanges.length > 0 && (
        <div className="bg-white rounded-xl border border-border/60 p-5">
          <h3 className="font-display font-semibold text-foreground mb-3">Assumption Changes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase">Assumption</th>
                  <th className="text-center py-2 px-4 text-xs font-semibold text-muted-foreground uppercase">{baseName}</th>
                  <th className="text-center py-2 px-4 text-xs font-semibold text-muted-foreground uppercase">{compareName}</th>
                  <th className="text-center py-2 pl-4 text-xs font-semibold text-muted-foreground uppercase">Change</th>
                </tr>
              </thead>
              <tbody>
                {comparison.assumptionChanges.map((ac) => (
                  <tr key={ac.label} className="border-b border-border/20 last:border-0">
                    <td className="py-2 pr-4 font-medium text-foreground">{ac.label}</td>
                    <td className="py-2 px-4 text-center font-mono text-muted-foreground">{ac.baseValue}</td>
                    <td className="py-2 px-4 text-center font-mono text-foreground">{ac.compareValue}</td>
                    <td className="py-2 pl-4 text-center font-mono font-semibold text-primary">{ac.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
