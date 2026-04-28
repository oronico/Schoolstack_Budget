import { useState, useEffect, useMemo, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Slider } from "@/components/ui/slider";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowRightLeft,
  Wand2,
} from "lucide-react";
import { computeScenarios, type ScenarioAdjustments, type ScenarioResult, type NudgeItem } from "@/lib/scenario-engine";
import { compareScenarios } from "@/lib/scenario-compare";
import { ScenarioComparisonView } from "@/components/consultant/ScenarioComparisonView";
import type { FullModelData } from "@/pages/model-wizard/schema";
import { WhatIfTrigger } from "@/components/whatif/WhatIfTrigger";
import { encodeOverridesToHash, type WhatIfOverrides } from "@/lib/whatif-engine";
import { buildDecisionBullets, DECISION_LABELS, DECISION_THEME } from "@/lib/decision-flows";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const DEFAULT_SCENARIO: ScenarioAdjustments = {
  name: "",
  enrollmentAdjustment: 0,
  tuitionAdjustment: 0,
  expenseAdjustment: 0,
  staffingAdjustment: 0,
  facilityAdjustment: 0,
};

const SLIDER_CONFIG = [
  { key: "enrollmentAdjustment" as const, label: "Enrollment", min: -50, max: 50 },
  { key: "tuitionAdjustment" as const, label: "Tuition / Revenue", min: -30, max: 30 },
  { key: "staffingAdjustment" as const, label: "Staffing Costs", min: -30, max: 30 },
  { key: "facilityAdjustment" as const, label: "Facility Costs", min: -50, max: 50 },
  { key: "expenseAdjustment" as const, label: "Other Expenses", min: -30, max: 30 },
];

function fmt(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function pct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function SignalDot({ signal }: { signal: "green" | "amber" | "red" }) {
  const colors = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[signal]}`} />;
}

function NudgeCard({ nudge }: { nudge: NudgeItem }) {
  const icons = {
    green: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />,
    amber: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />,
    red: <XCircle className="h-4 w-4 text-red-600 shrink-0" />,
  };
  const bg = {
    green: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    red: "bg-red-50 border-red-200",
  };
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-sm ${bg[nudge.signal]}`}>
      {icons[nudge.signal]}
      <div>
        <span className="font-medium text-foreground">{nudge.label}:</span>{" "}
        <span className="text-muted-foreground">{nudge.message}</span>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  base,
  scenarios,
  format: formatFn,
  highlightBetter,
}: {
  label: string;
  base: number | string;
  scenarios: (number | string)[];
  format?: (v: number) => string;
  highlightBetter?: "higher" | "lower";
}) {
  const baseVal = typeof base === "number" ? base : 0;
  const fmtFn = formatFn || ((v: number) => v.toString());

  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="py-3 pr-4 text-sm font-medium text-foreground whitespace-nowrap">{label}</td>
      <td className="py-3 px-4 text-sm text-center font-mono bg-muted/30">
        {typeof base === "number" ? fmtFn(base) : base}
      </td>
      {scenarios.map((val, i) => {
        let colorClass = "";
        if (typeof val === "number" && highlightBetter) {
          const diff = val - baseVal;
          if (highlightBetter === "higher" && diff > 0) colorClass = "text-emerald-700";
          else if (highlightBetter === "higher" && diff < 0) colorClass = "text-red-600";
          else if (highlightBetter === "lower" && diff < 0) colorClass = "text-emerald-700";
          else if (highlightBetter === "lower" && diff > 0) colorClass = "text-red-600";
        }
        return (
          <td key={i} className={`py-3 px-4 text-sm text-center font-mono ${colorClass}`}>
            {typeof val === "number" ? fmtFn(val) : val}
          </td>
        );
      })}
    </tr>
  );
}

export function ScenarioPage() {
  const [match, params] = useRoute("/model/:id/scenarios");
  const modelId = params?.id ? parseInt(params.id) : null;
  const [, setLocation] = useLocation();

  const { data: model, isLoading } = useGetModel(modelId || 0, {
    query: { queryKey: [`/api/models/${modelId || 0}`], enabled: !!modelId },
  });
  const updateMutation = useUpdateModel();
  const queryClient = useQueryClient();

  const [scenarios, setScenarios] = useState<ScenarioAdjustments[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [compareLeft, setCompareLeft] = useState<string>("base");
  const [compareRight, setCompareRight] = useState<string>("");

  useEffect(() => {
    return () => {
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  }, [saveTimeout]);

  useEffect(() => {
    if (model && !initialized) {
      const modelData = model.data as FullModelData | undefined;
      if ((model.currentStep ?? 0) < 8) {
        setLocation(`/model/${modelId}`);
        return;
      }
      const existing = modelData?.scenarios;
      if (existing && existing.length > 0) {
        setScenarios(
          existing.map((s) => ({
            name: s.name || "",
            enrollmentAdjustment: s.enrollmentAdjustment || 0,
            tuitionAdjustment: s.tuitionAdjustment || 0,
            expenseAdjustment: s.expenseAdjustment || 0,
            staffingAdjustment: s.staffingAdjustment || 0,
            facilityAdjustment: s.facilityAdjustment || 0,
          }))
        );
      }
      setInitialized(true);
    }
  }, [model, initialized, setLocation, modelId]);

  const modelData = (model?.data as FullModelData) || {};

  const results = useMemo(() => {
    if (!initialized || !model) return null;
    return computeScenarios(modelData, scenarios);
  }, [modelData, scenarios, initialized, model]);

  const comparisonResult = useMemo(() => {
    if (!results || scenarios.length === 0) return null;
    const leftIdx = compareLeft === "base" ? -1 : parseInt(compareLeft);
    const rightIdx = compareRight === "" ? -1 : compareRight === "base" ? -1 : parseInt(compareRight);
    if (compareRight === "") return null;
    if (compareLeft === compareRight) return null;

    const leftMetrics = leftIdx < 0 ? results.base.metrics : results.scenarios[leftIdx]?.metrics;
    const rightMetrics = rightIdx < 0 ? results.base.metrics : results.scenarios[rightIdx]?.metrics;
    if (!leftMetrics || !rightMetrics) return null;

    const leftAdj = leftIdx < 0
      ? { ...DEFAULT_SCENARIO, name: "Base Model" }
      : results.scenarios[leftIdx]?.adjustments;
    const rightAdj = rightIdx < 0
      ? { ...DEFAULT_SCENARIO, name: "Base Model" }
      : results.scenarios[rightIdx]?.adjustments;

    return compareScenarios(leftMetrics, rightMetrics, leftAdj, rightAdj);
  }, [results, compareLeft, compareRight, scenarios]);

  const persistScenarios = useCallback(
    (updated: ScenarioAdjustments[]) => {
      if (!modelId) return;
      if (saveTimeout) clearTimeout(saveTimeout);
      const t = setTimeout(() => {
        updateMutation.mutate({
          id: modelId,
          data: {
            data: { ...modelData, scenarios: updated } as Record<string, unknown>,
          },
        });
      }, 800);
      setSaveTimeout(t);
    },
    [modelId, modelData, updateMutation, saveTimeout]
  );

  const addScenario = () => {
    if (scenarios.length >= 3) return;
    const names = ["Optimistic", "Conservative", "Stress Test"];
    const usedNames = new Set(scenarios.map((s) => s.name));
    const nextName = names.find((n) => !usedNames.has(n)) || `Scenario ${scenarios.length + 1}`;
    const updated = [...scenarios, { ...DEFAULT_SCENARIO, name: nextName }];
    setScenarios(updated);
    persistScenarios(updated);
  };

  const removeScenario = (idx: number) => {
    const updated = scenarios.filter((_, i) => i !== idx);
    setScenarios(updated);
    persistScenarios(updated);
  };

  const updateScenario = (idx: number, field: keyof ScenarioAdjustments, value: number | string) => {
    const updated = scenarios.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
    setScenarios(updated);
    persistScenarios(updated);
  };

  const { toast } = useToast();

  const handleApplyWhatIfFromScenarios = useCallback(
    async (adjustedData: FullModelData) => {
      if (!modelId) return;
      // Snapshot prior model from the freshest cache entry so undo restores
      // exactly what the user had before applying — even if other concurrent
      // changes landed.
      const fresh = queryClient.getQueryData<{ data?: Record<string, unknown> }>([
        `/api/models/${modelId}`,
      ]);
      const priorSnapshot = (fresh?.data ?? modelData) as Record<string, unknown>;
      await updateMutation.mutateAsync({
        id: modelId,
        data: { data: adjustedData as Record<string, unknown> },
      });
      await queryClient.invalidateQueries({ queryKey: [`/api/models/${modelId}`] });
      toast({
        title: "Applied to model",
        description: "What-If overrides are now part of your saved model.",
        action: (
          <ToastAction
            altText="Undo apply"
            onClick={async () => {
              await updateMutation.mutateAsync({
                id: modelId,
                data: { data: priorSnapshot },
              });
              await queryClient.invalidateQueries({ queryKey: [`/api/models/${modelId}`] });
              toast({ title: "Undone", description: "Your previous model values are restored." });
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    },
    [modelId, updateMutation, queryClient, modelData, toast]
  );

  const handleSaveAsScenarioFromWhatIf = useCallback(
    async (overrides: WhatIfOverrides, name: string) => {
      if (!modelId) return;
      // Read freshest snapshot from the query cache to avoid losing any concurrently
      // saved customScenarios that haven't yet propagated to the `model` prop.
      const fresh = queryClient.getQueryData<{ data?: Record<string, unknown> }>([
        `/api/models/${modelId}`,
      ]);
      const freshData = (fresh?.data ?? modelData) as Record<string, unknown>;
      const existing = freshData.customScenarios as
        | Array<{ name: string; overrides: WhatIfOverrides; createdAt: string }>
        | undefined;
      const updated = [
        ...(existing || []),
        { name, overrides, createdAt: new Date().toISOString() },
      ];
      await updateMutation.mutateAsync({
        id: modelId,
        data: {
          data: { ...freshData, customScenarios: updated } as Record<string, unknown>,
        },
      });
      await queryClient.invalidateQueries({ queryKey: [`/api/models/${modelId}`] });
    },
    [modelId, modelData, updateMutation, queryClient]
  );

  const resetScenario = (idx: number) => {
    const updated = scenarios.map((s, i) =>
      i === idx
        ? {
            ...DEFAULT_SCENARIO,
            name: s.name,
          }
        : s
    );
    setScenarios(updated);
    persistScenarios(updated);
  };

  if (isLoading || !initialized) {
    return (
      <Layout>
        <div className="flex justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => setLocation(`/model/${modelId}`)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Scenario Planner
            </h1>
            <p className="text-muted-foreground mt-1">
              {model?.name || "Model"} - Compare up to 3 what-if scenarios against your base model
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {scenarios.map((scenario, idx) => (
            <div
              key={idx}
              className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-5">
                <input
                  type="text"
                  value={scenario.name}
                  onChange={(e) => updateScenario(idx, "name", e.target.value)}
                  className="font-display text-lg font-bold bg-transparent border-0 border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors w-full mr-2 pb-0.5"
                  placeholder="Scenario name"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => resetScenario(idx)}
                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="Reset adjustments"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeScenario(idx)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    title="Remove scenario"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                {SLIDER_CONFIG.map((slider) => {
                  const val = scenario[slider.key];
                  return (
                    <div key={slider.key}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-foreground">{slider.label}</label>
                        <span
                          className={`text-sm font-mono font-semibold ${
                            val > 0 ? "text-emerald-700" : val < 0 ? "text-red-600" : "text-muted-foreground"
                          }`}
                        >
                          {val > 0 ? "+" : ""}
                          {val}%
                        </span>
                      </div>
                      <Slider
                        value={[val]}
                        min={slider.min}
                        max={slider.max}
                        step={1}
                        onValueChange={([v]) => updateScenario(idx, slider.key, v)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {scenarios.length < 3 && (
            <button
              onClick={addScenario}
              className="flex flex-col items-center justify-center gap-3 bg-card border-2 border-dashed border-border/60 rounded-2xl p-6 min-h-[320px] hover:border-primary/50 hover:bg-primary/5 transition-all group"
            >
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="font-display font-semibold text-foreground">Add Scenario</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {scenarios.length === 0
                    ? "Create your first what-if scenario"
                    : `${3 - scenarios.length} more available`}
                </p>
              </div>
            </button>
          )}
        </div>

        {results && scenarios.length > 0 && (
          <>
            <div className="mb-8">
              <h2 className="font-display text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Side-by-Side Comparison
              </h2>
              <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Metric
                        </th>
                        <th className="py-3 px-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                          Base Model
                        </th>
                        {results.scenarios.map((s, i) => (
                          <th
                            key={i}
                            className="py-3 px-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                          >
                            {s.name || `Scenario ${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/40">
                        <td
                          colSpan={2 + results.scenarios.length}
                          className="py-2 px-4 text-xs font-bold text-primary uppercase tracking-wider bg-primary/5"
                        >
                          Year 1 Summary
                        </td>
                      </tr>
                      <MetricRow
                        label="Total Revenue"
                        base={results.base.metrics.revenue[0]}
                        scenarios={results.scenarios.map((s) => s.metrics.revenue[0])}
                        format={fmt}
                        highlightBetter="higher"
                      />
                      <MetricRow
                        label="Total Expenses"
                        base={results.base.metrics.totalExpenses[0]}
                        scenarios={results.scenarios.map((s) => s.metrics.totalExpenses[0])}
                        format={fmt}
                        highlightBetter="lower"
                      />
                      <MetricRow
                        label="Net Income"
                        base={results.base.metrics.netIncome[0]}
                        scenarios={results.scenarios.map((s) => s.metrics.netIncome[0])}
                        format={fmt}
                        highlightBetter="higher"
                      />
                      <MetricRow
                        label="Net Margin"
                        base={results.base.metrics.netMargin[0]}
                        scenarios={results.scenarios.map((s) => s.metrics.netMargin[0])}
                        format={pct}
                        highlightBetter="higher"
                      />
                      <MetricRow
                        label="Enrollment"
                        base={results.base.metrics.enrollment[0]}
                        scenarios={results.scenarios.map((s) => s.metrics.enrollment[0])}
                        format={(v) => v.toString()}
                        highlightBetter="higher"
                      />

                      <tr className="border-b border-border/40">
                        <td
                          colSpan={2 + results.scenarios.length}
                          className="py-2 px-4 text-xs font-bold text-primary uppercase tracking-wider bg-primary/5"
                        >
                          Year 5 Summary
                        </td>
                      </tr>
                      <MetricRow
                        label="Total Revenue"
                        base={results.base.metrics.revenue[4]}
                        scenarios={results.scenarios.map((s) => s.metrics.revenue[4])}
                        format={fmt}
                        highlightBetter="higher"
                      />
                      <MetricRow
                        label="Total Expenses"
                        base={results.base.metrics.totalExpenses[4]}
                        scenarios={results.scenarios.map((s) => s.metrics.totalExpenses[4])}
                        format={fmt}
                        highlightBetter="lower"
                      />
                      <MetricRow
                        label="Net Income"
                        base={results.base.metrics.netIncome[4]}
                        scenarios={results.scenarios.map((s) => s.metrics.netIncome[4])}
                        format={fmt}
                        highlightBetter="higher"
                      />
                      <MetricRow
                        label="Net Margin"
                        base={results.base.metrics.netMargin[4]}
                        scenarios={results.scenarios.map((s) => s.metrics.netMargin[4])}
                        format={pct}
                        highlightBetter="higher"
                      />
                      <MetricRow
                        label="Enrollment"
                        base={results.base.metrics.enrollment[4]}
                        scenarios={results.scenarios.map((s) => s.metrics.enrollment[4])}
                        format={(v) => v.toString()}
                        highlightBetter="higher"
                      />

                      <tr className="border-b border-border/40">
                        <td
                          colSpan={2 + results.scenarios.length}
                          className="py-2 px-4 text-xs font-bold text-primary uppercase tracking-wider bg-primary/5"
                        >
                          Net Income by Year
                        </td>
                      </tr>
                      {[0, 1, 2, 3, 4].map((y) => (
                        <MetricRow
                          key={`ni-${y}`}
                          label={`Year ${y + 1}`}
                          base={results.base.metrics.netIncome[y]}
                          scenarios={results.scenarios.map((s) => s.metrics.netIncome[y])}
                          format={fmt}
                          highlightBetter="higher"
                        />
                      ))}

                      {results.base.metrics.dscr.some((d) => d > 0) && (
                        <>
                          <tr className="border-b border-border/40">
                            <td
                              colSpan={2 + results.scenarios.length}
                              className="py-2 px-4 text-xs font-bold text-primary uppercase tracking-wider bg-primary/5"
                            >
                              DSCR by Year
                            </td>
                          </tr>
                          {[0, 1, 2, 3, 4].map((y) => (
                            <MetricRow
                              key={`dscr-${y}`}
                              label={`Year ${y + 1}`}
                              base={results.base.metrics.dscr[y]}
                              scenarios={results.scenarios.map((s) => s.metrics.dscr[y])}
                              format={(v) => (v > 0 ? `${v.toFixed(2)}x` : "N/A")}
                              highlightBetter="higher"
                            />
                          ))}
                        </>
                      )}

                      <tr className="border-b border-border/40">
                        <td
                          colSpan={2 + results.scenarios.length}
                          className="py-2 px-4 text-xs font-bold text-primary uppercase tracking-wider bg-primary/5"
                        >
                          Key Indicators
                        </td>
                      </tr>
                      <MetricRow
                        label="Break-Even Year"
                        base={results.base.metrics.breakEvenYear ?? "Never"}
                        scenarios={results.scenarios.map((s) =>
                          s.metrics.breakEvenYear !== null ? `Year ${s.metrics.breakEvenYear}` : "Never"
                        )}
                      />
                      <MetricRow
                        label="Staffing % of Revenue (Avg)"
                        base={
                          results.base.metrics.staffingPctOfRevenue.reduce((a, b) => a + b, 0) / 5
                        }
                        scenarios={results.scenarios.map(
                          (s) =>
                            s.metrics.staffingPctOfRevenue.reduce((a, b) => a + b, 0) / 5
                        )}
                        format={pct}
                        highlightBetter="lower"
                      />
                      <MetricRow
                        label="Cash Runway"
                        base={results.base.metrics.cashRunwayMonths}
                        scenarios={results.scenarios.map((s) => s.metrics.cashRunwayMonths)}
                        format={(v) => (v >= 60 ? "60+ mo" : `${v.toFixed(0)} mo`)}
                        highlightBetter="higher"
                      />
                      <MetricRow
                        label="Reserve Months (Yr 5)"
                        base={results.base.metrics.reserveMonths}
                        scenarios={results.scenarios.map((s) => s.metrics.reserveMonths)}
                        format={(v) => `${v.toFixed(1)} mo`}
                        highlightBetter="higher"
                      />
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="font-display text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-amber-600" />
                Viability Nudges
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
                  <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
                    <SignalDot signal={results.base.nudges.some((n) => n.signal === "red") ? "red" : results.base.nudges.some((n) => n.signal === "amber") ? "amber" : "green"} /> Base Model
                  </h3>
                  <div className="space-y-2">
                    {results.base.nudges.map((n, i) => (
                      <NudgeCard key={i} nudge={n} />
                    ))}
                  </div>
                </div>
                {results.scenarios.map((s, idx) => {
                  const worstSignal = s.nudges.some((n) => n.signal === "red")
                    ? "red"
                    : s.nudges.some((n) => n.signal === "amber")
                    ? "amber"
                    : "green";
                  return (
                    <div key={idx} className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
                      <h3 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
                        <SignalDot signal={worstSignal} /> {s.name || `Scenario ${idx + 1}`}
                      </h3>
                      <div className="space-y-2">
                        {s.nudges.map((n, i) => (
                          <NudgeCard key={i} nudge={n} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mb-8">
              <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-bold text-foreground">Deep Comparison</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Pick two scenarios to see exactly what changed, what improved, and what worsened - in plain English.
                </p>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-foreground">Compare</label>
                    <select
                      value={compareLeft}
                      onChange={(e) => setCompareLeft(e.target.value)}
                      className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="base">Base Model</option>
                      {scenarios.map((s, i) => (
                        <option key={i} value={String(i)}>{s.name || `Scenario ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">vs</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={compareRight}
                      onChange={(e) => setCompareRight(e.target.value)}
                      className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Select a scenario...</option>
                      <option value="base" disabled={compareLeft === "base"}>Base Model</option>
                      {scenarios.map((s, i) => (
                        <option key={i} value={String(i)} disabled={compareLeft === String(i)}>
                          {s.name || `Scenario ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {compareLeft === compareRight && compareRight !== "" && (
                  <p className="text-xs text-amber-600 mt-2">You are comparing the same scenario - pick a different one to see differences.</p>
                )}
              </div>

              {comparisonResult && (
                <div className="mt-6">
                  <ScenarioComparisonView
                    comparison={comparisonResult}
                    baseName={
                      compareLeft === "base"
                        ? "Base Model"
                        : scenarios[parseInt(compareLeft)]?.name || `Scenario ${parseInt(compareLeft) + 1}`
                    }
                    compareName={
                      compareRight === "base"
                        ? "Base Model"
                        : scenarios[parseInt(compareRight)]?.name || `Scenario ${parseInt(compareRight) + 1}`
                    }
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Custom What-If scenarios — saved from the Live What-If Planner drawer */}
        {(() => {
          const custom = ((modelData as Record<string, unknown>).customScenarios as
            | Array<{ name: string; createdAt: string; overrides: WhatIfOverrides; decisionType?: "add_program" | "evaluate_site" | "change_enrollment"; narrative?: string }>
            | undefined) || [];
          if (custom.length === 0) return null;
          const fmtDate = (iso: string) => {
            const d = new Date(iso);
            return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
          };
          const removeCustom = async (target: { name: string; createdAt: string }) => {
            if (!modelId) return;
            const fresh = queryClient.getQueryData<{ data?: Record<string, unknown> }>([
              `/api/models/${modelId}`,
            ]);
            const freshData = (fresh?.data ?? modelData) as Record<string, unknown>;
            const list = ((freshData.customScenarios as typeof custom) || []).filter(
              (cs) => !(cs.name === target.name && cs.createdAt === target.createdAt)
            );
            await updateMutation.mutateAsync({
              id: modelId,
              data: { data: { ...freshData, customScenarios: list } as Record<string, unknown> },
            });
            await queryClient.invalidateQueries({ queryKey: [`/api/models/${modelId}`] });
          };
          const openInPlanner = (overrides: WhatIfOverrides) => {
            const hash = encodeOverridesToHash(overrides);
            if (hash) {
              window.location.hash = hash;
            }
          };
          return (
            <div className="mb-10" data-testid="custom-scenarios-section">
              <div className="flex items-center gap-2 mb-4">
                <Wand2 className="h-5 w-5 text-amber-700" />
                <h2 className="font-display text-xl font-bold text-foreground">Saved What-If scenarios</h2>
                <span className="text-sm text-muted-foreground">({custom.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {custom.map((cs, idx) => {
                  const o = cs.overrides;
                  const bulletsFromDecision = buildDecisionBullets(o, cs.decisionType);
                  const bullets: string[] = bulletsFromDecision.length > 0 ? bulletsFromDecision : (() => {
                    const arr: string[] = [];
                    if (o.enrollmentDelta && o.enrollmentDelta.some((v) => v !== 0)) {
                      const sum = o.enrollmentDelta.reduce((a, b) => a + b, 0);
                      arr.push(`Enrollment ${sum > 0 ? "+" : ""}${sum} cumulative`);
                    }
                    if (o.retentionRate !== undefined) arr.push(`Retention ${o.retentionRate}%`);
                    if (o.tuitionDeltaPerStudent !== undefined && o.tuitionDeltaPerStudent !== 0) {
                      arr.push(`Tuition ${o.tuitionDeltaPerStudent > 0 ? "+" : ""}$${o.tuitionDeltaPerStudent}/student`);
                    }
                    if (o.monthlyRent !== undefined) arr.push(`Rent $${o.monthlyRent.toLocaleString()}/mo`);
                    if (o.rentEscalation !== undefined) arr.push(`Rent escalation ${o.rentEscalation}%`);
                    if (o.sqftDelta !== undefined && o.sqftDelta !== 0) {
                      arr.push(`Sqft ${o.sqftDelta > 0 ? "+" : ""}${o.sqftDelta}`);
                    }
                    return arr;
                  })();
                  const decisionTheme = cs.decisionType ? DECISION_THEME[cs.decisionType] : null;
                  const decisionLabel = cs.decisionType ? DECISION_LABELS[cs.decisionType] : null;
                  const narrativeExcerpt = cs.narrative
                    ? cs.narrative.length > 140
                      ? `${cs.narrative.slice(0, 140).trimEnd()}…`
                      : cs.narrative
                    : null;
                  return (
                    <div
                      key={`${cs.name}-${cs.createdAt}-${idx}`}
                      className={`bg-card border ${decisionTheme ? decisionTheme.border : "border-amber-200"} rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow`}
                      data-testid={`custom-scenario-card-${idx}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0">
                          {decisionLabel && decisionTheme && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${decisionTheme.bg} ${decisionTheme.text} border ${decisionTheme.border}`}
                              data-testid={`custom-scenario-decision-badge-${idx}`}
                            >
                              {decisionLabel}
                            </span>
                          )}
                          <h3 className="font-display font-bold text-foreground truncate">{cs.name}</h3>
                          <p className="text-[11px] text-muted-foreground">Saved {fmtDate(cs.createdAt)}</p>
                        </div>
                        <button
                          onClick={() => removeCustom({ name: cs.name, createdAt: cs.createdAt })}
                          className="p-1 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition-colors flex-shrink-0"
                          aria-label={`Delete ${cs.name}`}
                          data-testid={`custom-scenario-delete-${idx}`}
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                      {narrativeExcerpt && (
                        <p
                          className="text-xs text-foreground/70 italic border-l-2 border-border/60 pl-2.5 mb-3 leading-relaxed"
                          data-testid={`custom-scenario-narrative-${idx}`}
                        >
                          “{narrativeExcerpt}”
                        </p>
                      )}
                      <ul className="text-xs text-muted-foreground space-y-1 mb-4">
                        {bullets.length === 0 ? (
                          <li>(No overrides — baseline)</li>
                        ) : (
                          bullets.map((b, i) => <li key={i}>• {b}</li>)
                        )}
                      </ul>
                      {cs.decisionType === "add_program" ? (
                        <p
                          className="w-full text-center text-[11px] text-muted-foreground italic px-3 py-2 rounded-lg bg-muted/40 border border-border/60"
                          data-testid={`custom-scenario-open-${idx}`}
                        >
                          Re-run the “Add a program” flow to revise this decision.
                        </p>
                      ) : (
                        <button
                          onClick={() => openInPlanner(o)}
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 text-sm font-medium border border-amber-200 transition-colors"
                          data-testid={`custom-scenario-open-${idx}`}
                        >
                          <Wand2 className="h-3.5 w-3.5" /> Open in planner
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {scenarios.length === 0 && (
          <div className="bg-gradient-to-br from-primary/5 via-card to-card border border-primary/20 rounded-3xl p-10 sm:p-16 text-center shadow-sm">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-display text-xl font-bold mb-3">What happens if...?</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
              Create scenarios to test how changes in enrollment, tuition, staffing, and expenses affect your bottom line.
              Each scenario shows a side-by-side comparison with your base model.
            </p>
            <button
              onClick={addScenario}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
              <Plus className="h-5 w-5" /> Create First Scenario
            </button>
          </div>
        )}
      </div>
      {model && initialized && (
        <WhatIfTrigger
          data={modelData}
          modelId={modelId}
          onApplyToModel={handleApplyWhatIfFromScenarios}
          onSaveAsScenario={handleSaveAsScenarioFromWhatIf}
        />
      )}
    </Layout>
  );
}
