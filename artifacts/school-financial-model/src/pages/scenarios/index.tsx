import { useState, useEffect, useMemo, useCallback } from "react";
import { useRoute, useLocation, useSearchParams } from "wouter";
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
  PauseCircle,
  CircleSlash,
  Pencil,
} from "lucide-react";
import { computeScenarios, type ScenarioAdjustments, type ScenarioResult, type NudgeItem } from "@/lib/scenario-engine";
import { compareScenarios } from "@/lib/scenario-compare";
import { ScenarioComparisonView } from "@/components/consultant/ScenarioComparisonView";
import type { FullModelData, OutcomeStatus, CustomScenario } from "@/pages/model-wizard/schema";
import { WhatIfTrigger } from "@/components/whatif/WhatIfTrigger";
import { encodeOverridesToHash, type WhatIfOverrides } from "@/lib/whatif-engine";
import {
  applyPersistedScenarioToData,
  buildDecisionBullets,
  computeDecisionImpactFromPersisted,
  DECISION_LABELS,
  DECISION_THEME,
  type PersistedDecisionOverrides,
} from "@/lib/decision-flows";
import type { DecisionType } from "@/pages/model-wizard/schema";
import { ImpactSummary } from "@/components/decision-flow/ImpactSummary";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const OUTCOME_STATUS_META: Record<OutcomeStatus, { label: string; pillClass: string; Icon: typeof CheckCircle2 }> = {
  pursued: {
    label: "Pursued",
    pillClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    Icon: CheckCircle2,
  },
  declined: {
    label: "Declined",
    pillClass: "bg-rose-50 text-rose-800 border-rose-200",
    Icon: CircleSlash,
  },
  on_hold: {
    label: "On hold",
    pillClass: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: PauseCircle,
  },
};

const OUTCOME_STATUS_OPTIONS: OutcomeStatus[] = ["pursued", "declined", "on_hold"];

// Filter chips shown above the Saved What-If list. "untracked" matches saved
// scenarios that don't yet have an outcomeStatus set.
type OutcomeFilter = "all" | OutcomeStatus | "untracked";
const OUTCOME_FILTER_OPTIONS: { value: OutcomeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pursued", label: "Pursued" },
  { value: "declined", label: "Declined" },
  { value: "on_hold", label: "On hold" },
  { value: "untracked", label: "Untracked" },
];
const OUTCOME_FILTER_VALUES: OutcomeFilter[] = OUTCOME_FILTER_OPTIONS.map((o) => o.value);

// Sort options for the Saved What-If list.
// "updated" uses outcomeUpdatedAt (the most recent founder action) and falls
// back to createdAt so brand-new scenarios still sort sensibly.
type SortMode = "updated" | "oldest" | "status";
const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "updated", label: "Most recently updated" },
  { value: "oldest", label: "Save date (oldest first)" },
  { value: "status", label: "By status" },
];
const SORT_VALUES: SortMode[] = SORT_OPTIONS.map((o) => o.value);

// Status grouping order when sorting by status — prioritise live decisions
// (Pursued / On hold) over Declined and Untracked so the most actionable
// scenarios bubble to the top.
const STATUS_SORT_RANK: Record<OutcomeStatus | "untracked", number> = {
  pursued: 0,
  on_hold: 1,
  declined: 2,
  untracked: 3,
};

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

// Build human-readable bullets describing what a saved scenario changed.
// Mirrors the original IIFE logic but lives at the top level so the card
// component can reuse it without re-deriving it inline.
function describeScenario(cs: CustomScenario): string[] {
  const o = cs.overrides;
  const decisionBullets = buildDecisionBullets(o, cs.decisionType);
  if (decisionBullets.length > 0) return decisionBullets;
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
}

interface CustomScenarioCardProps {
  scenario: CustomScenario;
  index: number;
  fmtDate: (iso: string) => string;
  onRemove: (target: { name: string; createdAt: string }) => Promise<void>;
  onPatch: (
    target: { name: string; createdAt: string },
    updates: Partial<CustomScenario>,
  ) => Promise<void>;
  onOpenInPlanner: (overrides: WhatIfOverrides) => void;
  onApplyToModel: (cs: CustomScenario) => Promise<void>;
}

// Renders a single saved decision-flow scenario card with outcome controls.
// Founders can mark Pursued / Declined / On hold and add a short retrospective
// note so the saved scenario becomes a historical record, not just a projection.
// When a Pursued scenario hasn't yet been folded into the base model, we
// surface an "Apply to model" nudge so future decision flows compare against
// current reality instead of the older base assumptions.
function CustomScenarioCard({
  scenario: cs,
  index: idx,
  fmtDate,
  onRemove,
  onPatch,
  onOpenInPlanner,
  onApplyToModel,
}: CustomScenarioCardProps) {
  const [editingRetro, setEditingRetro] = useState(false);
  const [retroDraft, setRetroDraft] = useState(cs.retrospective ?? "");
  // Keep the draft in sync if the persisted note changes (e.g. another tab,
  // or after a save round-trip) and we're not currently editing it.
  useEffect(() => {
    if (!editingRetro) setRetroDraft(cs.retrospective ?? "");
  }, [cs.retrospective, editingRetro]);

  const decisionTheme = cs.decisionType ? DECISION_THEME[cs.decisionType] : null;
  const decisionLabel = cs.decisionType ? DECISION_LABELS[cs.decisionType] : null;
  const narrativeExcerpt = cs.narrative
    ? cs.narrative.length > 140
      ? `${cs.narrative.slice(0, 140).trimEnd()}…`
      : cs.narrative
    : null;
  const bullets = describeScenario(cs);
  const target = { name: cs.name, createdAt: cs.createdAt };
  const statusMeta = cs.outcomeStatus ? OUTCOME_STATUS_META[cs.outcomeStatus] : null;

  const setStatus = async (status: OutcomeStatus | null) => {
    // Toggle off when the user re-clicks the active status (acts like a clear).
    const next = status && cs.outcomeStatus === status ? undefined : status ?? undefined;
    await onPatch(target, {
      outcomeStatus: next,
      outcomeUpdatedAt: next ? new Date().toISOString() : undefined,
    });
  };

  const saveRetro = async () => {
    const trimmed = retroDraft.trim();
    await onPatch(target, {
      retrospective: trimmed.length > 0 ? trimmed : undefined,
    });
    setEditingRetro(false);
  };

  const showApplyNudge = cs.outcomeStatus === "pursued" && !cs.appliedToModelAt;

  return (
    <div
      className={`bg-card border ${decisionTheme ? decisionTheme.border : "border-amber-200"} rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow`}
      data-testid={`custom-scenario-card-${idx}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
            {decisionLabel && decisionTheme && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${decisionTheme.bg} ${decisionTheme.text} border ${decisionTheme.border}`}
                data-testid={`custom-scenario-decision-badge-${idx}`}
              >
                {decisionLabel}
              </span>
            )}
            {statusMeta && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${statusMeta.pillClass}`}
                data-testid={`custom-scenario-status-pill-${idx}`}
              >
                <statusMeta.Icon className="h-3 w-3" />
                {statusMeta.label}
              </span>
            )}
          </div>
          <h3 className="font-display font-bold text-foreground truncate">{cs.name}</h3>
          <p className="text-[11px] text-muted-foreground">
            Saved {fmtDate(cs.createdAt)}
            {cs.outcomeUpdatedAt && (
              <span> · Status updated {fmtDate(cs.outcomeUpdatedAt)}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => onRemove(target)}
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

      {/* Outcome status controls — what actually happened with this decision? */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          What happened?
        </p>
        <div className="flex flex-wrap gap-1.5" data-testid={`custom-scenario-status-controls-${idx}`}>
          {OUTCOME_STATUS_OPTIONS.map((s) => {
            const meta = OUTCOME_STATUS_META[s];
            const active = cs.outcomeStatus === s;
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  active
                    ? meta.pillClass
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
                aria-pressed={active}
                data-testid={`custom-scenario-status-${s}-${idx}`}
                title={active ? "Click again to clear" : `Mark this scenario as ${meta.label}`}
              >
                <meta.Icon className="h-3 w-3" />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Retrospective note — short reflection on how it actually landed */}
      <div className="mb-4">
        {editingRetro ? (
          <div data-testid={`custom-scenario-retro-editor-${idx}`}>
            <textarea
              value={retroDraft}
              onChange={(e) => setRetroDraft(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Short reflection — e.g. 'Signed the lease in March; enrollment came in 5 students under plan'"
              className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              data-testid={`custom-scenario-retro-textarea-${idx}`}
            />
            <div className="flex items-center justify-end gap-2 mt-1.5">
              <button
                onClick={() => {
                  setRetroDraft(cs.retrospective ?? "");
                  setEditingRetro(false);
                }}
                className="text-[11px] px-2 py-1 rounded text-muted-foreground hover:text-foreground"
                data-testid={`custom-scenario-retro-cancel-${idx}`}
              >
                Cancel
              </button>
              <button
                onClick={saveRetro}
                className="text-[11px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                data-testid={`custom-scenario-retro-save-${idx}`}
              >
                Save note
              </button>
            </div>
          </div>
        ) : cs.retrospective ? (
          <button
            type="button"
            onClick={() => setEditingRetro(true)}
            className="w-full text-left text-xs text-foreground/80 bg-muted/40 rounded-md px-2.5 py-1.5 border border-border/60 hover:bg-muted transition-colors group"
            data-testid={`custom-scenario-retro-note-${idx}`}
          >
            <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">
              Retrospective
              <Pencil className="inline-block h-2.5 w-2.5 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
            </span>
            {cs.retrospective}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditingRetro(true)}
            className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            data-testid={`custom-scenario-retro-add-${idx}`}
          >
            <Pencil className="h-3 w-3" /> Add a retro note
          </button>
        )}
      </div>

      {/* Pursued nudge — fold the change into the base model so future decision
          flows compare against current reality, not stale assumptions. */}
      {showApplyNudge && (
        <div
          className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2"
          data-testid={`custom-scenario-apply-nudge-${idx}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 mt-0.5 shrink-0" />
          <p className="text-[11px] text-emerald-900 leading-snug">
            You're pursuing this. Fold it into your base model so future flows compare against current reality.
          </p>
        </div>
      )}
      {cs.appliedToModelAt && (
        <p
          className="mb-3 text-[11px] text-emerald-800 inline-flex items-center gap-1"
          data-testid={`custom-scenario-applied-marker-${idx}`}
        >
          <CheckCircle2 className="h-3 w-3" /> Applied to model on {fmtDate(cs.appliedToModelAt)}
        </p>
      )}

      {showApplyNudge ? (
        <button
          onClick={() => onApplyToModel(cs)}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium border border-emerald-700 transition-colors"
          data-testid={`custom-scenario-apply-${idx}`}
          title="Fold this scenario into your base model"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Apply to my model
        </button>
      ) : cs.decisionType === "add_program" && !cs.appliedToModelAt ? (
        <button
          onClick={() => onApplyToModel(cs)}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium border border-amber-700 transition-colors"
          data-testid={`custom-scenario-open-${idx}`}
          title="Fold this Add-a-program scenario into your base model"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Apply to my model
        </button>
      ) : (
        <button
          onClick={() => onOpenInPlanner(cs.overrides as WhatIfOverrides)}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 text-sm font-medium border border-amber-200 transition-colors"
          data-testid={`custom-scenario-open-${idx}`}
        >
          <Wand2 className="h-3.5 w-3.5" /> Open in planner
        </button>
      )}
    </div>
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
  // "Compare decisions" picker — values are the saved scenario's
  // `${name}|${createdAt}` composite key, so a deleted scenario simply
  // drops out of the selection without triggering a stale lookup.
  // Supports 2-4 columns; the user can add or remove columns within that range.
  const [decisionCompareKeys, setDecisionCompareKeys] = useState<string[]>([]);
  // Hard cap so the comparison stays readable on a typical laptop screen.
  // Matches the column palette in ImpactSummary; raise both together.
  const MAX_DECISION_COMPARE = 4;

  // Filter/sort selections for the Saved What-If list. Persist to URL query
  // string so a chosen view (e.g. "what's still on hold?") survives reloads
  // and is shareable. Unknown / legacy values fall back to the defaults so we
  // never render a broken "what filter is this?" state.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawOutcomeParam = searchParams.get("outcome");
  const outcomeFilter: OutcomeFilter = OUTCOME_FILTER_VALUES.includes(
    rawOutcomeParam as OutcomeFilter,
  )
    ? (rawOutcomeParam as OutcomeFilter)
    : "all";
  const rawSortParam = searchParams.get("sort");
  const sortMode: SortMode = SORT_VALUES.includes(rawSortParam as SortMode)
    ? (rawSortParam as SortMode)
    : "updated";
  const setOutcomeFilter = useCallback(
    (next: OutcomeFilter) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (next === "all") sp.delete("outcome");
          else sp.set("outcome", next);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setSortMode = useCallback(
    (next: SortMode) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (next === "updated") sp.delete("sort");
          else sp.set("sort", next);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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

        {/* Compare 2-4 saved decision scenarios — uses computeDecisionImpactFromPersisted
            so each column is rerun against the *current* base model. Only shown when
            the founder has at least two saved decision-flow scenarios (i.e. those with
            a decisionType). What-If-only scenarios use the deep comparison above. */}
        {(() => {
          const custom = ((modelData as Record<string, unknown>).customScenarios as
            | Array<{ name: string; createdAt: string; overrides: WhatIfOverrides; decisionType?: DecisionType; narrative?: string }>
            | undefined) || [];
          const decisionScenarios = custom.filter((c) => !!c.decisionType);
          if (decisionScenarios.length < 2) return null;

          const keyOf = (cs: { name: string; createdAt: string }) => `${cs.name}|${cs.createdAt}`;
          const findByKey = (key: string) =>
            decisionScenarios.find((c) => keyOf(c) === key);

          // Reconcile saved selection against the current scenario list. Drop
          // keys that no longer exist (deleted scenarios), then top up with the
          // first available unused scenarios so we always have at least 2 cols.
          const validKeys = decisionCompareKeys.filter((k) => !!findByKey(k));
          let effectiveKeys = [...validKeys];
          for (const cs of decisionScenarios) {
            if (effectiveKeys.length >= 2) break;
            const k = keyOf(cs);
            if (!effectiveKeys.includes(k)) effectiveKeys.push(k);
          }
          // Cap at 4 in case state somehow exceeds it.
          effectiveKeys = effectiveKeys.slice(0, MAX_DECISION_COMPARE);

          const usedSet = new Set(effectiveKeys);
          const remainingScenarios = decisionScenarios.filter((cs) => !usedSet.has(keyOf(cs)));
          const canAddMore =
            effectiveKeys.length < MAX_DECISION_COMPARE && remainingScenarios.length > 0;

          const setKeyAt = (idx: number, value: string) => {
            const next = [...effectiveKeys];
            next[idx] = value;
            setDecisionCompareKeys(next);
          };
          const removeAt = (idx: number) => {
            if (effectiveKeys.length <= 2) return;
            setDecisionCompareKeys(effectiveKeys.filter((_, i) => i !== idx));
          };
          const addColumn = () => {
            if (!canAddMore) return;
            const next = [...effectiveKeys, keyOf(remainingScenarios[0])];
            setDecisionCompareKeys(next);
          };

          // Detect any duplicate selection so we can surface a clear warning
          // and skip computing the impact (which would render a confusing tie).
          const dupSet = new Set<string>();
          let hasDup = false;
          for (const k of effectiveKeys) {
            if (dupSet.has(k)) {
              hasDup = true;
              break;
            }
            dupSet.add(k);
          }

          const selectedScenarios = effectiveKeys.map((k) => findByKey(k));
          let columns: { impact: ReturnType<typeof computeDecisionImpactFromPersisted>; label: string; narrative?: string }[] = [];
          let computeError: string | null = null;
          try {
            if (!hasDup && selectedScenarios.every((s) => !!s)) {
              columns = selectedScenarios.map((cs) => ({
                impact: computeDecisionImpactFromPersisted(
                  modelData,
                  cs!.decisionType as DecisionType,
                  cs!.overrides as PersistedDecisionOverrides,
                ),
                label: cs!.name,
                narrative: cs!.narrative,
              }));
            }
          } catch (err) {
            computeError = err instanceof Error ? err.message : String(err);
            columns = [];
          }

          // Per-column option list: each select shows all decision scenarios,
          // but disables those already chosen in *other* columns so the user
          // can't pick the same scenario twice.
          const optionDisabled = (csKey: string, ownIdx: number) =>
            effectiveKeys.some((k, i) => i !== ownIdx && k === csKey);

          return (
            <div className="mb-10" data-testid="decision-comparison-section">
              <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-bold text-foreground">
                    Compare decisions side-by-side
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Pick 2-4 saved decisions — candidate sites, enrollment paths, or new
                  programs — and see Y5 net income, break-even shift, DSCR, and cash
                  runway side-by-side, with the strongest column highlighted per metric.
                </p>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3"
                  data-testid="decision-compare-pickers"
                >
                  {effectiveKeys.map((key, idx) => {
                    const palette = ["A", "B", "C", "D"][idx] ?? "?";
                    return (
                      <div key={idx} className="min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Decision {palette}
                          </label>
                          {effectiveKeys.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeAt(idx)}
                              className="text-[11px] text-muted-foreground hover:text-rose-600 transition-colors"
                              data-testid={`decision-compare-remove-${idx}`}
                              aria-label={`Remove decision ${palette}`}
                              title={`Remove decision ${palette}`}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <select
                          value={key}
                          onChange={(e) => setKeyAt(idx, e.target.value)}
                          data-testid={`decision-compare-select-${idx}`}
                          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {decisionScenarios.map((cs) => {
                            const k = keyOf(cs);
                            return (
                              <option
                                key={k}
                                value={k}
                                disabled={optionDisabled(k, idx)}
                              >
                                {cs.decisionType ? `[${DECISION_LABELS[cs.decisionType]}] ` : ""}
                                {cs.name}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={addColumn}
                    disabled={!canAddMore}
                    data-testid="decision-compare-add"
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={
                      effectiveKeys.length >= MAX_DECISION_COMPARE
                        ? `Maximum ${MAX_DECISION_COMPARE} decisions`
                        : remainingScenarios.length === 0
                        ? "No more saved decisions to add"
                        : "Add another decision to the comparison"
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add another decision
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    {effectiveKeys.length} of {MAX_DECISION_COMPARE} columns
                  </span>
                </div>
                {hasDup && (
                  <p
                    className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2"
                    data-testid="decision-compare-same-warning"
                  >
                    You picked the same decision more than once. Pick distinct scenarios
                    to see a head-to-head comparison.
                  </p>
                )}
                {computeError && (
                  <p
                    className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2"
                    data-testid="decision-compare-error"
                  >
                    Couldn't compute the comparison: {computeError}
                  </p>
                )}
              </div>

              {columns.length >= 2 && !hasDup && (
                <div className="mt-6" data-testid="decision-compare-result">
                  <ImpactSummary impact={columns[0].impact} columns={columns} />
                </div>
              )}
            </div>
          );
        })()}

        {/* Custom What-If scenarios — saved from the Live What-If Planner drawer */}
        {(() => {
          const custom = ((modelData as Record<string, unknown>).customScenarios as
            | CustomScenario[]
            | undefined) || [];
          if (custom.length === 0) return null;
          const fmtDate = (iso: string) => {
            const d = new Date(iso);
            return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
          };
          // Re-read the freshest cached server state so concurrent edits aren't
          // clobbered when we patch a single scenario in place.
          const readFreshData = (): Record<string, unknown> => {
            const fresh = queryClient.getQueryData<{ data?: Record<string, unknown> }>([
              `/api/models/${modelId}`,
            ]);
            return (fresh?.data ?? modelData) as Record<string, unknown>;
          };
          const removeCustom = async (target: { name: string; createdAt: string }) => {
            if (!modelId) return;
            const freshData = readFreshData();
            const list = ((freshData.customScenarios as CustomScenario[]) || []).filter(
              (cs) => !(cs.name === target.name && cs.createdAt === target.createdAt)
            );
            await updateMutation.mutateAsync({
              id: modelId,
              data: { data: { ...freshData, customScenarios: list } as Record<string, unknown> },
            });
            await queryClient.invalidateQueries({ queryKey: [`/api/models/${modelId}`] });
          };
          // Patch a single scenario in the customScenarios array and persist.
          // We match by (name, createdAt) which together act as a stable id.
          const patchCustom = async (
            target: { name: string; createdAt: string },
            updates: Partial<CustomScenario>,
          ) => {
            if (!modelId) return;
            const freshData = readFreshData();
            const list = ((freshData.customScenarios as CustomScenario[]) || []).map((cs) =>
              cs.name === target.name && cs.createdAt === target.createdAt
                ? { ...cs, ...updates }
                : cs,
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
          const applyScenarioToModel = async (cs: CustomScenario) => {
            if (!modelId) return;
            const freshData = readFreshData();
            const baseData = freshData as FullModelData;
            const priorSnapshot = freshData;
            const applied = applyPersistedScenarioToData(
              baseData,
              cs.overrides as PersistedDecisionOverrides,
              cs.decisionType,
            );
            // Mark the saved scenario as applied so we hide the "Apply to model"
            // nudge after the fold-in lands. We do it in the same write so the
            // nudge disappears immediately on success.
            const stamp = new Date().toISOString();
            const list = ((freshData.customScenarios as CustomScenario[]) || []).map((entry) =>
              entry.name === cs.name && entry.createdAt === cs.createdAt
                ? { ...entry, appliedToModelAt: stamp }
                : entry,
            );
            await updateMutation.mutateAsync({
              id: modelId,
              data: {
                data: {
                  ...(applied as unknown as Record<string, unknown>),
                  customScenarios: list,
                } as Record<string, unknown>,
              },
            });
            await queryClient.invalidateQueries({ queryKey: [`/api/models/${modelId}`] });
            toast({
              title: "Applied to model",
              description: `Folded “${cs.name}” into your base model.`,
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
          };
          // Apply outcome filter, then sort. We compute counts up-front so the
          // filter chips can show "(N)" badges — useful when a founder is
          // scanning to spot e.g. "what's still on hold?".
          const counts: Record<OutcomeFilter, number> = {
            all: custom.length,
            pursued: 0,
            declined: 0,
            on_hold: 0,
            untracked: 0,
          };
          for (const cs of custom) {
            const status = cs.outcomeStatus ?? "untracked";
            counts[status as OutcomeFilter] += 1;
          }
          const filtered =
            outcomeFilter === "all"
              ? custom
              : outcomeFilter === "untracked"
                ? custom.filter((cs) => !cs.outcomeStatus)
                : custom.filter((cs) => cs.outcomeStatus === outcomeFilter);
          const ts = (iso: string | undefined): number => {
            if (!iso) return 0;
            const t = new Date(iso).getTime();
            return isNaN(t) ? 0 : t;
          };
          // Sort a shallow copy so we don't mutate the persisted order.
          const visible = [...filtered].sort((a, b) => {
            if (sortMode === "oldest") {
              return ts(a.createdAt) - ts(b.createdAt);
            }
            if (sortMode === "status") {
              const ra = STATUS_SORT_RANK[a.outcomeStatus ?? "untracked"];
              const rb = STATUS_SORT_RANK[b.outcomeStatus ?? "untracked"];
              if (ra !== rb) return ra - rb;
              // Within a status group, fall back to most-recently-updated so
              // the freshest activity is at the top of each group.
              return (
                Math.max(ts(b.outcomeUpdatedAt), ts(b.createdAt)) -
                Math.max(ts(a.outcomeUpdatedAt), ts(a.createdAt))
              );
            }
            // Default: most recently updated (outcomeUpdatedAt ?? createdAt).
            return (
              Math.max(ts(b.outcomeUpdatedAt), ts(b.createdAt)) -
              Math.max(ts(a.outcomeUpdatedAt), ts(a.createdAt))
            );
          });
          return (
            <div className="mb-10" data-testid="custom-scenarios-section">
              <div className="flex items-center gap-2 mb-4">
                <Wand2 className="h-5 w-5 text-amber-700" />
                <h2 className="font-display text-xl font-bold text-foreground">Saved What-If scenarios</h2>
                <span className="text-sm text-muted-foreground">({custom.length})</span>
              </div>
              {/* Filter + sort toolbar — keeps the list scannable as the
                  number of saved decisions grows. Selections persist to the
                  URL (?outcome=…&sort=…) so reloads/shares keep the view. */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 mb-4"
                data-testid="custom-scenarios-toolbar"
              >
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Filter saved scenarios by outcome"
                  data-testid="custom-scenarios-filter-chips"
                >
                  {OUTCOME_FILTER_OPTIONS.map((opt) => {
                    const active = outcomeFilter === opt.value;
                    const count = counts[opt.value];
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setOutcomeFilter(opt.value)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:bg-muted"
                        }`}
                        data-testid={`custom-scenarios-filter-${opt.value}`}
                      >
                        {opt.label}
                        <span
                          className={`text-[10px] tabular-nums ${
                            active ? "opacity-90" : "opacity-70"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="custom-scenarios-sort"
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Sort
                  </label>
                  <select
                    id="custom-scenarios-sort"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    data-testid="custom-scenarios-sort-select"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {visible.length === 0 ? (
                <div
                  className="bg-muted/30 border border-dashed border-border rounded-2xl px-5 py-8 text-center"
                  data-testid="custom-scenarios-empty"
                >
                  <p className="text-sm text-muted-foreground">
                    No saved scenarios match this filter.
                  </p>
                  <button
                    type="button"
                    onClick={() => setOutcomeFilter("all")}
                    className="mt-2 text-xs text-primary hover:underline"
                    data-testid="custom-scenarios-empty-clear"
                  >
                    Show all saved scenarios
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visible.map((cs, idx) => (
                    <CustomScenarioCard
                      key={`${cs.name}-${cs.createdAt}-${idx}`}
                      scenario={cs}
                      index={idx}
                      fmtDate={fmtDate}
                      onRemove={removeCustom}
                      onPatch={patchCustom}
                      onOpenInPlanner={openInPlanner}
                      onApplyToModel={applyScenarioToModel}
                    />
                  ))}
                </div>
              )}
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
