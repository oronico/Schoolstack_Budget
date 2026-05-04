import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRoute, useLocation, useSearchParams } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { useConflictBanner } from "@/components/ConflictReloadBanner";
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
  Download,
  Search,
  X,
  Share2,
} from "lucide-react";
import { computeScenarios, type ScenarioAdjustments, type ScenarioResult, type NudgeItem } from "@/lib/scenario-engine";
import { compareScenarios } from "@/lib/scenario-compare";
import { ScenarioComparisonView } from "@/components/consultant/ScenarioComparisonView";
import { AdvisorPreviewPanel } from "@/components/scenarios/AdvisorPreviewPanel";
import { isSingleYearModel, type FullModelData, type OutcomeStatus, type CustomScenario, type CustomScenarioActuals } from "@/pages/model-wizard/schema";
import { WhatIfTrigger } from "@/components/whatif/WhatIfTrigger";
import { encodeOverridesToHash, type WhatIfOverrides } from "@/lib/whatif-engine";
import {
  buildCompareShareUrl,
  decodeCompareKeysFromHash,
  MAX_COMPARE_KEYS,
} from "@/lib/share-comparison";
import { parseExportSourceLabel, parseLiveSnapshotSourceLabel } from "@/lib/actuals-source";
import { highlightMatch } from "@/lib/text-highlight";
import { useAuth } from "@/lib/auth-context";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import { getFounderPersona, type FounderComfort } from "@/lib/coaching/founder-persona";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { WhatIfLink } from "@/components/coaching/WhatIfLink";
import { FinancingInsight } from "@/components/coaching/FinancingInsight";
import { Lightbulb } from "lucide-react";
import {
  aggregateRosterCapSavings,
  buildRosterCapInsightText,
  CAP_INSIGHT_MIN_SAVINGS,
  DECISION_OUTCOME_STATUSES,
} from "@workspace/finance";
import type { StaffingRowData } from "@/lib/staffing-defaults";
import {
  applyPersistedScenarioToData,
  buildActualsSuggestion,
  buildDecisionBullets,
  computeDecisionImpactFromPersisted,
  computeProjectedSnapshot,
  DECISION_LABELS,
  DECISION_THEME,
  type ActualsSuggestion,
  type ActualsSuggestionField,
  type ActualsContributor,
  type PersistedDecisionOverrides,
  type ProjectedSnapshot,
} from "@/lib/decision-flows";
import type { DecisionType } from "@/pages/model-wizard/schema";
import { ImpactSummary, findTroughIndex } from "@/components/decision-flow/ImpactSummary";
import { ForecastAccuracyView } from "@/components/forecast-accuracy/ForecastAccuracyView";
import { computeForecastAccuracy } from "@/lib/forecast-accuracy";
import { isYetToLaunch as personaIsYetToLaunch } from "@/lib/coaching/founder-persona";
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

// Derived from the shared `DECISION_OUTCOME_STATUSES` tuple in
// `@workspace/finance` so adding a fourth status in one place automatically
// propagates here (or fails to compile) — see the comment on
// `outcomeStatusSchema` in `model-wizard/schema.ts`.
const OUTCOME_STATUS_OPTIONS: readonly OutcomeStatus[] = DECISION_OUTCOME_STATUSES;

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
    // Mirrors the formatting in buildDecisionBullets so the sign sits
    // outside the "$" — "Tuition -$250/student" rather than "$-250".
    const sign = o.tuitionDeltaPerStudent > 0 ? "+" : "-";
    arr.push(`Tuition ${sign}$${Math.abs(o.tuitionDeltaPerStudent)}/student`);
  }
  if (o.monthlyRent !== undefined) arr.push(`Rent $${o.monthlyRent.toLocaleString()}/mo`);
  if (o.rentEscalation !== undefined) arr.push(`Rent escalation ${o.rentEscalation}%`);
  if (o.sqftDelta !== undefined && o.sqftDelta !== 0) {
    arr.push(`Sqft ${o.sqftDelta > 0 ? "+" : ""}${o.sqftDelta}`);
  }
  return arr;
}

// Coach intro shown above the actuals editor for basics/extra users.
// Explains what actuals are vs projections in plain terms, with the two
// terms wrapped in glossary popovers so newer founders can dig deeper.
function ActualsCoachIntro({ idx }: { idx: number }) {
  const { guidanceLevel } = useShowCoach();
  // Track once per mount per scenario index. Advanced founders never see
  // this intro so we skip the ping for them too — keeps the analytics
  // signal aligned with what's actually rendered.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (trackedRef.current || guidanceLevel === "advanced") return;
    trackedRef.current = true;
    trackCoachingEvent("actuals_coach_intro_shown", {
      scenarioIndex: idx,
      guidanceLevel,
    });
  }, [idx, guidanceLevel]);
  // Engagement signal: opening either glossary popover (Actuals or
  // Variance) inside the coach copy counts as the founder digging into
  // the explanation. Fires once per mount per scenario index.
  const engagedRef = useRef(false);
  const handleGlossaryOpen = (termKey: string) => {
    if (guidanceLevel === "advanced" || engagedRef.current) return;
    engagedRef.current = true;
    trackCoachingEvent("actuals_coach_intro_engaged", {
      scenarioIndex: idx,
      guidanceLevel,
      termKey,
    });
  };
  if (guidanceLevel === "advanced") return null;
  return (
    <div data-testid={`custom-scenario-actuals-coach-intro-${idx}`}>
      <WhyThisMatters
        title="Why fill in actuals?"
        why={
          <>
            <GlossaryTerm termKey="actuals" onOpen={handleGlossaryOpen}>Actuals</GlossaryTerm> are what really
            happened — the enrollment, revenue, and expenses you can read off
            your bank statement and bookkeeping. Comparing them to your
            projections gives you{" "}
            <GlossaryTerm termKey="variance" onOpen={handleGlossaryOpen}>variance</GlossaryTerm>: where you
            beat the plan, where you missed, and by how much. That's the loop
            that turns a model into a tool you actually steer with.
          </>
        }
        revisit="Update actuals at the end of every month or quarter — the more recent the data, the better the next decision you make."
      />
    </div>
  );
}

// Inline variance nudge that fires when any of the four headline lines
// (enrollment / revenue / expense / net income) misses the projection by
// more than 10%. Surfaces a one-line plain-English read so founders see
// the implication at a glance, and emits an event the first time we light
// up so the coaching dashboard can measure exposure.
interface ActualsVarianceCoachProps {
  idx: number;
  projected: ProjectedSnapshot;
  draft: CustomScenarioActuals;
  decisionType: CustomScenario["decisionType"];
}
function ActualsVarianceCoach({ idx, projected, draft }: ActualsVarianceCoachProps) {
  const { guidanceLevel, showCoach: verbose } = useShowCoach();

  // Variance computation runs at every guidance level so even an advanced
  // founder sees a quiet one-liner when actuals miss projections by more
  // than 10%. Only the explanatory body changes by guidance level.
  const items = useMemo(() => {
    const checks: Array<{ key: string; label: string; actual?: number; projected: number; betterWhen: "higher" | "lower" }> = [
      { key: "enrollment", label: "Enrollment", actual: draft.enrollmentActual, projected: projected.enrollment, betterWhen: "higher" },
      { key: "revenue", label: "Revenue", actual: draft.revenueActual, projected: projected.revenue, betterWhen: "higher" },
      { key: "expense", label: "Expenses", actual: draft.expenseActual, projected: projected.expense, betterWhen: "lower" },
      { key: "netIncome", label: "Net income", actual: draft.netIncomeActual, projected: projected.netIncome, betterWhen: "higher" },
    ];
    const out: Array<{ key: string; label: string; pct: number; direction: "good" | "bad" }> = [];
    for (const c of checks) {
      if (c.actual === undefined || !isFinite(c.actual)) continue;
      const denom = Math.abs(c.projected);
      if (denom < 1) continue;
      const pct = (c.actual - c.projected) / denom;
      if (Math.abs(pct) <= 0.1) continue;
      const better = c.betterWhen === "higher" ? pct > 0 : pct < 0;
      out.push({ key: c.key, label: c.label, pct, direction: better ? "good" : "bad" });
    }
    return out;
  }, [draft.enrollmentActual, draft.revenueActual, draft.expenseActual, draft.netIncomeActual, projected.enrollment, projected.revenue, projected.expense, projected.netIncome]);

  const trackedRef = useRef<string>("");
  useEffect(() => {
    // Advanced-mode founders see the variance one-liner but never the
    // WhatIfLink coach nudge that the funnel measures engagement for, so
    // we silence the *_shown event for them — keeps the
    // /admin/coaching-funnel impressions matched to surfaces that
    // actually have an engagement affordance (Task #285).
    if (guidanceLevel === "advanced") return;
    if (items.length === 0) return;
    const k = items.map((i) => `${i.key}:${i.direction}`).join(",");
    if (trackedRef.current === k) return;
    trackedRef.current = k;
    trackCoachingEvent("actuals_variance_nudge_shown", {
      keys: items.map((i) => i.key),
      guidanceLevel,
    });
  }, [items, guidanceLevel]);

  if (items.length === 0) return null;
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2 space-y-1"
      data-testid={`custom-scenario-actuals-variance-coach-${idx}`}
    >
      {items.map((it) => (
        <div key={it.key} className="flex items-start gap-2 text-[11px] text-amber-900 leading-snug">
          <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-amber-700" />
          <p>
            <span className="font-semibold">{it.label} {it.direction === "good" ? "beat" : "missed"} by {Math.abs(it.pct * 100).toFixed(0)}%.</span>{" "}
            {verbose ? (
              it.direction === "good"
                ? "Worth noting in your board memo — and worth understanding so you can plan around it next year."
                : "A 10%+ miss usually means an assumption needs revisiting before the next decision rolls. Open the planner and see if it's enrollment, pricing, or a single line item."
            ) : null}
          </p>
        </div>
      ))}
      <p
        className="text-[11px] text-amber-800/90 leading-snug pt-0.5 border-t border-amber-200/70"
        data-testid={`custom-scenario-actuals-variance-accounting-note-${idx}`}
      >
        In accounting, this is called{" "}
        <GlossaryTerm termKey="variance_analysis">variance analysis</GlossaryTerm>{" "}
        — comparing planned to actual on the same{" "}
        <GlossaryTerm termKey="pl_statement">P&amp;L</GlossaryTerm> line. Doing
        it monthly is what turns a budget into a tool you steer with.
      </p>
      <div className="pt-1">
        <WhatIfLink source="actuals_variance" className="text-[11px]" />
      </div>
    </div>
  );
}

// Hides the actuals editor / variance / QuickBooks affordances on a saved
// scenario card. Set by the page level for `yet_to_launch` founders so the
// onboarding never surfaces concepts that don't yet apply to a school
// they're still planning. See Task #302.
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
  // Computes the projected snapshot for this scenario at a given model year.
  // Done up here (rather than in the card) so the card stays decoupled from
  // the freshest base model data and we don't recompute it on every render.
  getProjectedSnapshot: (asOfYear: number) => ProjectedSnapshot;
  // Builds a suggested set of actuals from the founder's existing model data
  // (prior-year snapshot, current-year projection, signed lease) so the
  // editor can prefill values they already entered once.
  getActualsSuggestion: (asOfYear: number) => ActualsSuggestion;
  // The most recent CSV the founder uploaded in the wizard's School Profile
  // step. Used to render a "Pulled from your books: filename.csv · uploaded
  // Mar 14" caption when the suggestion engine sourced fields from it, plus
  // a "Replace export" deep-link back into the wizard step that owns the
  // upload UI. Undefined when no export is present.
  accountingExportInfo?: { filename?: string; uploadedAt?: string };
  // URL the "Replace export" link should navigate to — built once at the
  // page level so the card stays decoupled from the route shape.
  replaceExportHref?: string;
  // Clears the founder's uploaded accounting export from the persisted
  // model. Wired to a confirmation-gated "Remove uploaded export" button in
  // the actuals editor so a misclicked CSV doesn't keep poisoning future
  // suggestion runs. Undefined when the page can't (or won't) expose
  // removal — the button stays hidden in that case.
  onRemoveExport?: () => Promise<void>;
  // When true (set by the page for yet_to_launch founders), suppress every
  // actuals/variance/QuickBooks surface on this card. The scenario card
  // still renders projections and decision rationale.
  hideActualsSurfaces?: boolean;
  // Staffing roster from the parent model, used to roll up the wage-base
  // cap savings insight on this card (Task #322). Optional + defaults to
  // an empty list so legacy / pre-staffing models render unaffected.
  staffingRows?: StaffingRowData[];
  // Founder persona "comfort" axis ("new_to_budgeting" | "comfortable").
  // Drives the cap-savings copy variant; null = legacy/technical wording.
  personaComfort?: FounderComfort | null;
  // Active free-text search from the toolbar above the cards. When non-empty,
  // the card highlights (`<mark>`s) the matched substring inside the
  // scenario name, retrospective note, and decision-type badge so founders
  // can see *why* a card showed up at a glance. Optional + defaults to ""
  // so callers/tests that don't need search behave exactly as before.
  // (Task #215)
  searchQuery?: string;
  // Adjusted-side cash-position forecast (length-5, year 1 → year 5) for this
  // saved scenario, used to render the at-a-glance trough badge that mirrors
  // the in-impact callout from ImpactSummary. Returns null when the scenario
  // has no decisionType (legacy / non-decision saves) or the forecast couldn't
  // be computed — the card silently omits the badge in that case so layout
  // never breaks. (Task #377)
  getAdjustedCashPosition?: () => readonly number[] | null;
}

// "Mar 14" formatter shared with the wizard upload card so the caption in
// the saved-scenario editor reads identically to the one shown next to the
// upload UI itself.
function formatExportUploadDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  } catch {
    return null;
  }
}

// Tiny formatter for the actuals-vs-projected lines. Keeps zeros short and
// large numbers readable, matching the rest of the scenario UI.
function fmtActualVal(v: number, kind: "money" | "count"): string {
  if (kind === "count") return v.toLocaleString();
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(v)).toLocaleString()}`;
}

// Computes a percentage delta string with leading sign — "Came in 12% under
// plan" / "+8% vs plan". Returns null when the projection is zero so we don't
// show a misleading "+∞%" callout.
function actualsDeltaPct(actual: number, projected: number): { text: string; tone: "good" | "bad" | "neutral" } | null {
  if (!isFinite(projected) || projected === 0) return null;
  const diff = actual - projected;
  const pct = (diff / Math.abs(projected)) * 100;
  if (Math.abs(pct) < 0.5) return { text: "on plan", tone: "neutral" };
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(0)}% vs plan`,
    // For revenue / enrollment / net income / program enrollment, "more" is
    // good. The caller decides tone — see ActualsLine below.
    tone: "neutral",
  };
}

// One row in the actuals editor: projected on the left, actual input on the
// right, and a small delta callout once both are present. `betterWhen` lets
// the row render the delta in green/red based on whether higher or lower
// realized values are favorable for that line.
//
// `suggested` (with optional `suggestionSource`) renders a small "Suggested"
// pill so the founder can tell at a glance which inputs were pre-filled from
// model data and still need their confirmation. The pill clears as soon as
// they edit the field — see the consumer's onChange handler.
function ActualsLine({
  label,
  projected,
  actual,
  onChange,
  testId,
  kind,
  betterWhen,
  suggested,
  suggestionSource,
  suggestionContributors,
  savedSourceLabel,
}: {
  label: string;
  projected: number | undefined;
  actual: number | undefined;
  onChange: (v: number | undefined) => void;
  testId: string;
  kind: "money" | "count";
  betterWhen: "higher" | "lower";
  suggested?: boolean;
  suggestionSource?: string;
  // Top accounts feeding this suggestion. Rendered as a small caption so the
  // founder can sanity-check the mapping ("Revenue = Tuition + Workshop")
  // before accepting the pre-filled value. Only populated when the suggestion
  // source carries per-account data (no current source does, kept for
  // forward-compat).
  suggestionContributors?: ActualsContributor[];
  // Per-field provenance pill for the read-only saved-actuals summary.
  // Pass a non-empty string (the persisted `sourceByField` label) to render
  // a "Books" pill, `null` to render an explicit "Typed" pill, or omit
  // entirely (the editor case) to render no provenance pill at all. The
  // raw label is surfaced as the pill's `title` so hovering reveals the
  // exact source ("From quickbooks-2025-q1.csv uploaded May 1", etc.).
  savedSourceLabel?: string | null;
}) {
  const hasActual = actual !== undefined && !Number.isNaN(actual);
  const hasProjected = projected !== undefined && !Number.isNaN(projected);
  let deltaPill: { text: string; tone: "good" | "bad" | "neutral" } | null = null;
  if (hasActual && hasProjected) {
    const base = actualsDeltaPct(actual!, projected!);
    if (base) {
      const diff = actual! - projected!;
      let tone: "good" | "bad" | "neutral" = "neutral";
      if (Math.abs(diff) >= Math.max(1, Math.abs(projected!) * 0.005)) {
        const favoredHigher = betterWhen === "higher";
        tone = (diff > 0) === favoredHigher ? "good" : "bad";
      }
      deltaPill = { text: base.text, tone };
    }
  }
  const toneClass =
    deltaPill?.tone === "good"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : deltaPill?.tone === "bad"
      ? "text-rose-700 bg-rose-50 border-rose-200"
      : "text-muted-foreground bg-muted/40 border-border/60";
  // Render the breakdown only when the suggestion source provided per-account
  // composition. Skip for already-typed-in actuals (the breakdown is only
  // useful while the founder is reviewing a fresh suggestion).
  const showContributors =
    !!suggestionContributors && suggestionContributors.length > 0;
  // Live-sync subtitle: when the suggestion came from a connected
  // accounting tool (QuickBooks/Xero) via `liveSnapshot.enrollment`,
  // the engine emits a label like "From QuickBooks tag 'Students FY26'".
  // We surface it as a small caption below the row so founders can tell
  // at a glance the number is a fresh sync — not a typed-in prior-year
  // value or a stale CSV upload — and a tooltip walks them back to the
  // AccountingConnectionCard if they want to disconnect the tag.
  // Mirrors the saved-actuals view too: when the saved snapshot was
  // pulled live, `savedSourceLabel` carries the same string.
  const liveSnapshotFromSuggestion =
    suggested && suggestionSource
      ? parseLiveSnapshotSourceLabel(suggestionSource)
      : null;
  const liveSnapshotFromSaved =
    typeof savedSourceLabel === "string" && savedSourceLabel.length > 0
      ? parseLiveSnapshotSourceLabel(savedSourceLabel)
      : null;
  const liveSnapshotInfo = liveSnapshotFromSuggestion ?? liveSnapshotFromSaved;
  return (
    <div data-testid={`${testId}-row`}>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-foreground truncate">{label}</div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Projected {hasProjected ? fmtActualVal(projected!, kind) : "—"}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            value={hasActual ? String(actual) : ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange(undefined);
                return;
              }
              const n = Number(raw);
              onChange(Number.isNaN(n) ? undefined : n);
            }}
            placeholder={kind === "money" ? "$" : "#"}
            className={`w-24 text-[11px] border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono text-right ${
              suggested
                ? "bg-amber-50 border-amber-300 text-amber-900"
                : "bg-background border-border"
            }`}
            data-testid={testId}
            title={suggested && suggestionSource ? `Suggested from: ${suggestionSource}` : undefined}
          />
          {suggested && (
            <span
              className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800"
              data-testid={`${testId}-suggested`}
              title={suggestionSource ? `Source: ${suggestionSource}` : undefined}
            >
              Suggested
            </span>
          )}
          {savedSourceLabel !== undefined && (
            savedSourceLabel ? (
              <span
                className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800"
                data-testid={`${testId}-source-books`}
                title={savedSourceLabel}
              >
                Books
              </span>
            ) : (
              <span
                className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground"
                data-testid={`${testId}-source-typed`}
                title="Manually entered"
              >
                Typed
              </span>
            )
          )}
          {!suggested && deltaPill && (
            <span
              className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${toneClass}`}
              data-testid={`${testId}-delta`}
            >
              {deltaPill.text}
            </span>
          )}
        </div>
      </div>
      {showContributors && (
        <div
          className="mt-1 text-[10px] text-muted-foreground leading-snug"
          data-testid={`${testId}-contributors`}
        >
          <span className="font-semibold uppercase tracking-wide text-muted-foreground/80 mr-1">
            From
          </span>
          {suggestionContributors!.map((c, i) => (
            <span key={`${c.name}-${i}`}>
              {i > 0 ? <span className="mx-1 text-muted-foreground/60">+</span> : null}
              <span
                className="font-medium text-foreground/80"
                data-testid={`${testId}-contributor-${i}-name`}
              >
                {c.name}
              </span>
              <span
                className="font-mono ml-1 text-muted-foreground"
                data-testid={`${testId}-contributor-${i}-amount`}
              >
                {fmtActualVal(c.amount, "money")}
              </span>
            </span>
          ))}
        </div>
      )}
      {liveSnapshotInfo && (
        <p
          className="mt-1 text-[10px] text-emerald-800 leading-snug cursor-help"
          data-testid={`${testId}-live-snapshot`}
          title={`This number was pulled live from ${liveSnapshotInfo.provider}. Disconnecting the tag in the Accounting Connection card will stop using it.`}
        >
          From{" "}
          <span
            className="font-semibold"
            data-testid={`${testId}-live-snapshot-provider`}
          >
            {liveSnapshotInfo.provider}
          </span>{" "}
          tag{" "}
          <span
            className="font-mono"
            data-testid={`${testId}-live-snapshot-tag`}
          >
            {liveSnapshotInfo.tagName}
          </span>
        </p>
      )}
    </div>
  );
}

// Renders a single saved decision-flow scenario card with outcome controls.
// Founders can mark Pursued / Declined / On hold and add a short retrospective
// note so the saved scenario becomes a historical record, not just a projection.
// When a Pursued scenario hasn't yet been folded into the base model, we
// surface an "Apply to model" nudge so future decision flows compare against
// current reality instead of the older base assumptions.
export function CustomScenarioCard({
  scenario: cs,
  index: idx,
  fmtDate,
  onRemove,
  onPatch,
  onOpenInPlanner,
  onApplyToModel,
  getProjectedSnapshot,
  getActualsSuggestion,
  accountingExportInfo,
  replaceExportHref,
  onRemoveExport,
  hideActualsSurfaces,
  staffingRows,
  personaComfort,
  searchQuery = "",
  getAdjustedCashPosition,
}: CustomScenarioCardProps) {
  const [editingRetro, setEditingRetro] = useState(false);
  // Inline rename state. We keep the saved scenario's `(name, createdAt)`
  // as a stable id, so renaming only patches `name` — `patchCustom` matches
  // on the prior tuple before writing the update. (Task #175)
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(cs.name);
  const [renaming, setRenaming] = useState(false);
  // Two-step confirmation for the destructive "Remove uploaded export"
  // affordance. Resets back to false whenever the editor closes so a
  // half-confirmed remove can't bleed across editor sessions.
  const [confirmRemoveExport, setConfirmRemoveExport] = useState(false);
  const [removingExport, setRemovingExport] = useState(false);
  // Two-step confirmation for the destructive "Delete this saved scenario"
  // affordance. A saved scenario can carry outcome status, retrospective
  // notes, and a snapshot of actuals — none of which the existing toast
  // flows know how to restore — so a single misclick on the close icon
  // would silently destroy real founder work. Gating the delete behind an
  // inline "Delete this saved scenario? · Yes, delete / Cancel" prompt
  // matches the pattern used for "Remove uploaded export" elsewhere on
  // this card. (Task #369)
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState(false);
  // One-line notice that surfaces when the founder removes the uploaded
  // export while the actuals editor is open. The "Pulled from your books"
  // callout disappears as soon as the upload is gone (correct), but any
  // values the suggestion engine had previously filled remain in the
  // inputs as plain entries — without this notice the transition can look
  // like the values lost their provenance for no reason. Dismissable, and
  // auto-clears on save / cancel / editor close. (Task #288)
  const [uploadRemovedNotice, setUploadRemovedNotice] = useState(false);
  // Tracks the previous upload filename so we can detect the truthy →
  // falsy transition that means "the founder just removed it" without
  // firing the notice on first mount or on unrelated re-renders.
  const prevExportFilenameRef = useRef<string | undefined>(accountingExportInfo?.filename);
  const [retroDraft, setRetroDraft] = useState(cs.retrospective ?? "");
  // Keep the draft in sync if the persisted note changes (e.g. another tab,
  // or after a save round-trip) and we're not currently editing it.
  useEffect(() => {
    if (!editingRetro) setRetroDraft(cs.retrospective ?? "");
  }, [cs.retrospective, editingRetro]);
  // Same idempotent sync for the rename draft so it tracks the persisted
  // name when not actively being edited.
  useEffect(() => {
    if (!editingName) setNameDraft(cs.name);
  }, [cs.name, editingName]);

  // Actuals editor state — opens automatically when the scenario already has
  // actuals saved (so the founder lands on their previous entries) and stays
  // collapsed otherwise behind a single "Add actuals" affordance.
  const [editingActuals, setEditingActuals] = useState(false);
  const [actualsDraft, setActualsDraft] = useState<CustomScenarioActuals>(cs.actuals ?? { asOfYear: 1 });
  // Tracks which fields in the current draft were populated by the
  // "Suggest from latest data" action vs typed by the founder. We use this
  // to render a "Suggested" pill on each prefilled input, and to clear that
  // marking the moment the founder edits the field. Suggestions are local
  // state only — once the founder hits Save they become regular actuals.
  const [suggestedFields, setSuggestedFields] = useState<Set<ActualsSuggestionField>>(new Set());
  const [suggestionFeedback, setSuggestionFeedback] = useState<string | null>(null);
  useEffect(() => {
    if (!editingActuals) {
      setActualsDraft(cs.actuals ?? { asOfYear: 1 });
      setSuggestedFields(new Set());
      setSuggestionFeedback(null);
      setConfirmRemoveExport(false);
      setUploadRemovedNotice(false);
    }
  }, [cs.actuals, editingActuals]);

  // Watch the upload filename for a truthy → falsy transition while the
  // editor is open. When that happens we surface the inline "Upload
  // removed" notice and strip the "Suggested" pill from any draft fields
  // whose source label points at the now-gone export, so the UI stops
  // claiming a provenance the export no longer backs. We also strip those
  // fields' entries from `actualsDraft.sourceByField` for the same reason
  // — without it, a subsequent Save would re-persist the stale source.
  useEffect(() => {
    const prev = prevExportFilenameRef.current;
    const current = accountingExportInfo?.filename;
    if (editingActuals && prev && !current) {
      const exportPrefix = `From ${prev}`;
      const sources = actualsDraft.sourceByField ?? {};
      const bookSourcedFields = new Set<string>();
      for (const [field, src] of Object.entries(sources)) {
        if (typeof src === "string" && src.startsWith(exportPrefix)) {
          bookSourcedFields.add(field);
        }
      }
      if (bookSourcedFields.size > 0) {
        setSuggestedFields((prevSet) => {
          let changed = false;
          const next = new Set(prevSet);
          for (const f of bookSourcedFields) {
            if (next.delete(f as ActualsSuggestionField)) changed = true;
          }
          return changed ? next : prevSet;
        });
        setActualsDraft((d) => {
          if (!d.sourceByField) return d;
          const rest: Record<string, string> = {};
          for (const [field, src] of Object.entries(d.sourceByField)) {
            if (!bookSourcedFields.has(field)) rest[field] = src;
          }
          return { ...d, sourceByField: Object.keys(rest).length > 0 ? rest : undefined };
        });
      }
      setUploadRemovedNotice(true);
    }
    prevExportFilenameRef.current = current;
  }, [accountingExportInfo?.filename, editingActuals, actualsDraft.sourceByField]);

  // Helper: write a field into the draft and clear its "suggested" marker so
  // any direct edit by the user immediately overrides the suggestion. Also
  // strips the field's persisted source label so the saved-actuals summary
  // doesn't keep claiming a books-sourced provenance for a value the
  // founder has since typed over.
  const setActualsField = (field: ActualsSuggestionField | "programEnrollmentActual", value: number | undefined) => {
    setActualsDraft((d) => {
      const next: CustomScenarioActuals = { ...d, [field]: value };
      if (next.sourceByField && field in next.sourceByField) {
        const rest = { ...next.sourceByField };
        delete rest[field];
        next.sourceByField = Object.keys(rest).length > 0 ? rest : undefined;
      }
      return next;
    });
    if (suggestedFields.has(field as ActualsSuggestionField)) {
      setSuggestedFields((prev) => {
        const next = new Set(prev);
        next.delete(field as ActualsSuggestionField);
        return next;
      });
    }
    if (suggestionFeedback) setSuggestionFeedback(null);
  };

  // Pulls suggestions from the founder's existing model data and merges them
  // into the editor without overwriting anything they've already typed. The
  // "manual edits take precedence" guarantee lives here: a field is only
  // populated when its current value is undefined.
  const suggestFromLatestData = () => {
    const yr = actualsDraft.asOfYear ?? 1;
    const suggestion = getActualsSuggestion(yr);
    // Compute the next draft synchronously from the current state so the
    // `filled` / `skipped` counters reflect what actually changed before we
    // pick which feedback message to render. Mutating these counters inside
    // a `setActualsDraft((d) => ...)` updater used to leave them at 0 when we
    // read them right after the setter call — React 18 defers the updater to
    // render time and (in StrictMode) invokes it twice — so the feedback
    // would falsely read "Nothing to suggest" even after the inputs filled.
    let filled = 0;
    let skipped = 0;
    const nextSuggested = new Set(suggestedFields);
    const nextDraft: CustomScenarioActuals = { ...actualsDraft };
    // Per-field source labels are persisted on the saved actuals so the
    // read-only summary can render the same "Pulled from your books"
    // caption that this editor shows. We layer onto whatever sources
    // were already saved (so previously-pulled fields the founder hasn't
    // touched keep their provenance) and overwrite for fields we're
    // about to fill from this fresh suggestion.
    const nextSources: Record<string, string> = {
      ...(actualsDraft.sourceByField ?? {}),
    };
    const fields: ActualsSuggestionField[] = [
      "enrollmentActual",
      "revenueActual",
      "expenseActual",
      "netIncomeActual",
      "signedMonthlyRent",
    ];
    // Hide signedMonthlyRent for non-site decisions — the suggestion helper
    // already won't return it, but this is belt-and-braces.
    for (const f of fields) {
      const suggested = suggestion.values[f];
      if (suggested === undefined) continue;
      const existing = nextDraft[f];
      if (existing !== undefined && !nextSuggested.has(f)) {
        // Manual entry already there — never overwrite.
        skipped += 1;
        continue;
      }
      nextDraft[f] = suggested;
      nextSuggested.add(f);
      const src = suggestion.sources[f];
      if (src) nextSources[f] = src;
      filled += 1;
    }
    nextDraft.sourceByField =
      Object.keys(nextSources).length > 0 ? nextSources : undefined;
    setActualsDraft(nextDraft);
    setSuggestedFields(nextSuggested);
    if (filled === 0) {
      setSuggestionFeedback(
        suggestion.sourceLabels.length === 0
          ? "No suggestions available — add prior-year actuals or current-year projections in setup to enable this."
          : "Nothing to suggest — every field is already filled in.",
      );
    } else {
      const sourceList = suggestion.sourceLabels.slice(0, 2).join(" · ");
      setSuggestionFeedback(
        `Filled ${filled} field${filled === 1 ? "" : "s"} from ${sourceList}. Edit any value before saving.${
          skipped > 0 ? ` Kept ${skipped} field${skipped === 1 ? "" : "s"} you'd already entered.` : ""
        }`,
      );
    }
  };

  // Cached suggestion preview — used to enable/disable the suggest button and
  // surface its source label so the founder knows what's available before
  // they click. Recomputes when the as-of year changes since suggestions are
  // year-aware.
  const previewSuggestion = useMemo<ActualsSuggestion | null>(() => {
    if (!editingActuals) return null;
    const yr = actualsDraft.asOfYear ?? 1;
    return getActualsSuggestion(yr);
  }, [editingActuals, actualsDraft.asOfYear, getActualsSuggestion]);
  const hasAnySuggestion = !!previewSuggestion && Object.keys(previewSuggestion.values).length > 0;

  const decisionTheme = cs.decisionType ? DECISION_THEME[cs.decisionType] : null;
  const decisionLabel = cs.decisionType ? DECISION_LABELS[cs.decisionType] : null;
  const narrativeExcerpt = cs.narrative
    ? cs.narrative.length > 140
      ? `${cs.narrative.slice(0, 140).trimEnd()}…`
      : cs.narrative
    : null;
  const bullets = describeScenario(cs);
  // Trough badge data (Task #377): mirrors the in-impact "lowest cash year"
  // callout on the saved-scenario card itself so founders see the runway
  // crunch year without opening the scenario. Skipped when the page didn't
  // wire `getAdjustedCashPosition` (legacy callers / tests), when the
  // scenario has no decisionType, or when the forecast has no finite value.
  const troughBadge = useMemo(() => {
    if (!getAdjustedCashPosition) return null;
    const cashPosition = getAdjustedCashPosition();
    if (!cashPosition || cashPosition.length === 0) return null;
    const idx = findTroughIndex(cashPosition);
    if (idx === null) return null;
    const value = cashPosition[idx];
    if (!isFinite(value)) return null;
    return { yearLabel: `Y${idx + 1}`, value, negative: value < 0 };
  }, [getAdjustedCashPosition]);
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

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    // Empty rename is a no-op — falls back to the existing name so a
    // founder can't accidentally render a card without a title.
    if (trimmed.length === 0 || trimmed === cs.name) {
      setNameDraft(cs.name);
      setEditingName(false);
      return;
    }
    setRenaming(true);
    try {
      await onPatch(target, { name: trimmed });
      setEditingName(false);
    } finally {
      setRenaming(false);
    }
  };

  const showApplyNudge = cs.outcomeStatus === "pursued" && !cs.appliedToModelAt;
  // Actuals are most useful for Pursued scenarios but we also keep them
  // visible if the user already saved some so they're never accidentally
  // hidden by toggling status. yet_to_launch founders never see the
  // surface (Task #302) — actuals/variance only make sense once a school
  // is operating.
  const showActualsSurface =
    !hideActualsSurfaces && (cs.outcomeStatus === "pursued" || !!cs.actuals);
  const actualsAsOfYear = actualsDraft.asOfYear ?? cs.actuals?.asOfYear ?? 1;
  // Compute projected snapshot lazily — only when the editor is open or when
  // we're about to render the saved-actuals summary, to avoid recomputing it
  // for every saved scenario on first render.
  const projectedSnapshot = useMemo(
    () => (showActualsSurface ? getProjectedSnapshot(actualsAsOfYear) : null),
    [showActualsSurface, actualsAsOfYear, getProjectedSnapshot],
  );

  const saveActuals = async () => {
    // Per-field provenance: only keep entries whose value survived to the
    // final save. A field that was suggested and then cleared shouldn't
    // persist a stale source label; manual edits already strip the entry
    // via `setActualsField`.
    let sourceByField: Record<string, string> | undefined;
    if (actualsDraft.sourceByField) {
      const filtered: Record<string, string> = {};
      for (const [field, src] of Object.entries(actualsDraft.sourceByField)) {
        const fieldVal = (actualsDraft as Record<string, unknown>)[field];
        if (fieldVal !== undefined && typeof src === "string") {
          filtered[field] = src;
        }
      }
      sourceByField = Object.keys(filtered).length > 0 ? filtered : undefined;
    }
    // Strip out empty fields so the persisted shape stays minimal — easier
    // to evolve into the future "forecast accuracy" view.
    const a: CustomScenarioActuals = {
      asOfYear: actualsDraft.asOfYear ?? 1,
      enrollmentActual: actualsDraft.enrollmentActual,
      revenueActual: actualsDraft.revenueActual,
      expenseActual: actualsDraft.expenseActual,
      netIncomeActual: actualsDraft.netIncomeActual,
      signedMonthlyRent: actualsDraft.signedMonthlyRent,
      programEnrollmentActual: actualsDraft.programEnrollmentActual,
      notes: actualsDraft.notes && actualsDraft.notes.trim().length > 0 ? actualsDraft.notes.trim() : undefined,
      sourceByField,
      updatedAt: new Date().toISOString(),
    };
    // If literally nothing was entered (only asOfYear), clear instead of saving
    // a hollow object.
    const hasAny =
      a.enrollmentActual !== undefined ||
      a.revenueActual !== undefined ||
      a.expenseActual !== undefined ||
      a.netIncomeActual !== undefined ||
      a.signedMonthlyRent !== undefined ||
      a.programEnrollmentActual !== undefined ||
      (a.notes !== undefined && a.notes.length > 0);
    await onPatch(target, { actuals: hasAny ? a : undefined });
    setSuggestedFields(new Set());
    setSuggestionFeedback(null);
    setUploadRemovedNotice(false);
    setEditingActuals(false);
  };

  const clearActuals = async () => {
    await onPatch(target, { actuals: undefined });
    setSuggestedFields(new Set());
    setSuggestionFeedback(null);
    setUploadRemovedNotice(false);
    setEditingActuals(false);
  };

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
                {highlightMatch(decisionLabel, searchQuery)}
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
          {editingName ? (
            <div
              className="flex items-center gap-1.5"
              data-testid={`custom-scenario-rename-editor-${idx}`}
            >
              <input
                type="text"
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveName();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setNameDraft(cs.name);
                    setEditingName(false);
                  }
                }}
                maxLength={120}
                disabled={renaming}
                className="font-display font-bold text-foreground bg-background border border-border rounded px-1.5 py-0.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="Rename scenario"
                data-testid={`custom-scenario-rename-input-${idx}`}
              />
              <button
                type="button"
                onClick={() => void saveName()}
                disabled={renaming}
                className="text-[11px] px-2 py-0.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-60"
                data-testid={`custom-scenario-rename-save-${idx}`}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(cs.name);
                  setEditingName(false);
                }}
                disabled={renaming}
                className="text-[11px] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground"
                data-testid={`custom-scenario-rename-cancel-${idx}`}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group/title">
              <h3
                className="font-display font-bold text-foreground truncate"
                data-testid={`custom-scenario-name-${idx}`}
              >
                {highlightMatch(cs.name, searchQuery)}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(cs.name);
                  setEditingName(true);
                }}
                aria-label={`Rename ${cs.name}`}
                title="Rename scenario"
                className="p-0.5 rounded text-muted-foreground hover:text-primary opacity-0 group-hover/title:opacity-100 focus:opacity-100 transition-opacity"
                data-testid={`custom-scenario-rename-${idx}`}
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Saved {fmtDate(cs.createdAt)}
            {cs.outcomeUpdatedAt && (
              <span> · Status updated {fmtDate(cs.outcomeUpdatedAt)}</span>
            )}
          </p>
        </div>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition-colors flex-shrink-0"
            aria-label={`Delete ${cs.name}`}
            data-testid={`custom-scenario-delete-${idx}`}
          >
            <XCircle className="h-4 w-4" />
          </button>
        ) : (
          <div
            className="flex items-center gap-1.5 flex-shrink-0"
            data-testid={`custom-scenario-delete-confirm-${idx}`}
          >
            <span
              className="text-[10px] text-rose-800 whitespace-nowrap"
              data-testid={`custom-scenario-delete-confirm-prompt-${idx}`}
            >
              Delete this saved scenario?
            </span>
            <button
              type="button"
              onClick={async () => {
                setRemoving(true);
                try {
                  await onRemove(target);
                  // No need to reset confirmDelete — this card unmounts on
                  // success. Only reset on failure so the prompt can be
                  // dismissed cleanly.
                } catch {
                  setConfirmDelete(false);
                } finally {
                  setRemoving(false);
                }
              }}
              disabled={removing}
              className="text-[10px] font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded px-2 py-0.5 whitespace-nowrap"
              data-testid={`custom-scenario-delete-confirm-yes-${idx}`}
            >
              {removing ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={removing}
              className="text-[10px] text-muted-foreground hover:text-foreground whitespace-nowrap"
              data-testid={`custom-scenario-delete-cancel-${idx}`}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {narrativeExcerpt && (
        <p
          className="text-xs text-foreground/70 italic border-l-2 border-border/60 pl-2.5 mb-3 leading-relaxed"
          data-testid={`custom-scenario-narrative-${idx}`}
        >
          “{narrativeExcerpt}”
        </p>
      )}
      <ul className="text-xs text-muted-foreground space-y-1 mb-3">
        {bullets.length === 0 ? (
          <li>(No overrides — baseline)</li>
        ) : (
          bullets.map((b, i) => <li key={i}>• {b}</li>)
        )}
      </ul>
      {troughBadge && (
        <div
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 mb-4 ${
            troughBadge.negative
              ? "bg-rose-50 ring-rose-300 text-rose-700"
              : "bg-amber-50 ring-amber-300 text-amber-800"
          }`}
          data-testid={`custom-scenario-trough-badge-${idx}`}
        >
          <TrendingDown className="h-3 w-3" aria-hidden="true" />
          <span>
            <span className="font-semibold">Trough:</span>{" "}
            <span data-testid={`custom-scenario-trough-label-${idx}`}>
              {troughBadge.yearLabel} at {fmt(troughBadge.value)}
            </span>
          </span>
        </div>
      )}

      {/*
        Wage-base cap savings insight (Task #322): if any staffing row's
        salary exceeds at least one component's wage base, surface a
        persona-aware sentence here so the saved scenario summary speaks in
        the same voice the StaffingStep wizard does. We render via the
        shared `aggregateRosterCapSavings` + `buildRosterCapInsightText`
        helpers so the wizard, this card, and the lender / board PDFs all
        agree on the math + tone. Hidden when there's no roster, when the
        rolled-up savings round below our $1 sanity floor, or when the
        roster doesn't carry per-component breakdowns yet.
      */}
      {(() => {
        const agg = aggregateRosterCapSavings(
          (staffingRows || []).map((r) => ({
            annualizedRate: r.annualizedRate,
            fte: r.fte,
            payrollTaxComponents: r.payrollTaxComponents,
            // Forward the exclusion-relevant fields so the shared aggregator
            // can skip rows that should not contribute (manual blended-rate
            // overrides + contract-not-payroll-like rows). Dropping these
            // would make the saved-scenario card overstate savings vs. the
            // wizard.
            payrollTaxRateOverridden: r.payrollTaxRateOverridden,
            employmentType: r.employmentType,
            payrollLike: r.payrollLike,
          })),
        );
        if (!agg || agg.totalSavings < CAP_INSIGHT_MIN_SAVINGS) return null;
        return (
          <div className="mb-3" data-testid={`custom-scenario-cap-insight-${idx}`}>
            <FinancingInsight text={buildRosterCapInsightText(agg, personaComfort ?? null)} />
          </div>
        );
      })()}

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
            {highlightMatch(cs.retrospective, searchQuery)}
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

      {/* Actuals snapshot — projected vs realized numbers for one model year.
          Surfaces only for Pursued scenarios (or when actuals already exist)
          since founders won't have realized numbers for declined / on-hold
          decisions. The schema accepts optional fields so this stays a
          forward-compatible foundation for a future "forecast accuracy" view. */}
      {showActualsSurface && (
        <div className="mb-3 border border-border/60 rounded-lg p-2.5 bg-muted/20" data-testid={`custom-scenario-actuals-${idx}`}>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Actuals snapshot
            </p>
            {!editingActuals && (
              <button
                onClick={() => setEditingActuals(true)}
                className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                data-testid={`custom-scenario-actuals-edit-${idx}`}
              >
                <Pencil className="h-2.5 w-2.5" />
                {cs.actuals ? "Edit" : "Add actuals"}
              </button>
            )}
          </div>
          {!editingActuals && cs.actuals && projectedSnapshot && (
            <div className="space-y-1.5" data-testid={`custom-scenario-actuals-summary-${idx}`}>
              <p className="text-[10px] text-muted-foreground">
                As of Year {cs.actuals.asOfYear ?? 1}
                {cs.actuals.updatedAt && (
                  <span> · Updated {fmtDate(cs.actuals.updatedAt)}</span>
                )}
              </p>
              {(() => {
                // Compact "Pulled from your books" caption mirrored from the
                // editor so the books-vs-typed distinction stays visible
                // after save. We scan the saved per-field source labels for
                // an export-shaped one (parser knows the format) and render
                // the captured filename + upload date — captured at save
                // time so a later "Replace export" in the wizard doesn't
                // retroactively rewrite the historical caption.
                const sources = cs.actuals.sourceByField;
                if (!sources) return null;
                for (const src of Object.values(sources)) {
                  if (typeof src !== "string") continue;
                  const parsed = parseExportSourceLabel(src);
                  if (!parsed) continue;
                  return (
                    <p
                      className="text-[10px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 leading-snug"
                      data-testid={`custom-scenario-actuals-summary-export-source-${idx}`}
                    >
                      <span className="font-semibold">Pulled from your books:</span>{" "}
                      <span
                        className="font-mono break-all"
                        data-testid={`custom-scenario-actuals-summary-export-filename-${idx}`}
                      >
                        {parsed.filename}
                      </span>
                      {parsed.uploadedLabel && (
                        <span
                          className="text-emerald-800/80"
                          data-testid={`custom-scenario-actuals-summary-export-date-${idx}`}
                        >
                          {" "}· uploaded {parsed.uploadedLabel}
                        </span>
                      )}
                    </p>
                  );
                }
                return null;
              })()}
              {(() => {
                // Per-field provenance pills only render when the saved
                // snapshot recorded *any* source — that's the only case
                // where the books-vs-typed distinction is meaningful.
                // When everything was typed (no `sourceByField` at all)
                // the badges would be redundant noise on every row, so
                // we suppress them by passing `undefined` to ActualsLine.
                const sources = cs.actuals.sourceByField;
                const showPills = !!sources;
                const labelFor = (field: string): string | null | undefined => {
                  if (!showPills) return undefined;
                  const v = sources?.[field];
                  return typeof v === "string" && v.length > 0 ? v : null;
                };
                return (
                  <>
                    {cs.actuals.enrollmentActual !== undefined && (
                      <ActualsLine
                        label="Total enrollment"
                        projected={projectedSnapshot.enrollment}
                        actual={cs.actuals.enrollmentActual}
                        onChange={() => {}}
                        testId={`custom-scenario-actuals-enrollment-display-${idx}`}
                        kind="count"
                        betterWhen="higher"
                        savedSourceLabel={labelFor("enrollmentActual")}
                      />
                    )}
                    {cs.actuals.revenueActual !== undefined && (
                      <ActualsLine
                        label="Revenue"
                        projected={projectedSnapshot.revenue}
                        actual={cs.actuals.revenueActual}
                        onChange={() => {}}
                        testId={`custom-scenario-actuals-revenue-display-${idx}`}
                        kind="money"
                        betterWhen="higher"
                        savedSourceLabel={labelFor("revenueActual")}
                      />
                    )}
                    {cs.actuals.expenseActual !== undefined && (
                      <ActualsLine
                        label="Expenses"
                        projected={projectedSnapshot.expense}
                        actual={cs.actuals.expenseActual}
                        onChange={() => {}}
                        testId={`custom-scenario-actuals-expense-display-${idx}`}
                        kind="money"
                        betterWhen="lower"
                        savedSourceLabel={labelFor("expenseActual")}
                      />
                    )}
                    {cs.actuals.netIncomeActual !== undefined && (
                      <ActualsLine
                        label="Net income"
                        projected={projectedSnapshot.netIncome}
                        actual={cs.actuals.netIncomeActual}
                        onChange={() => {}}
                        testId={`custom-scenario-actuals-netincome-display-${idx}`}
                        kind="money"
                        betterWhen="higher"
                        savedSourceLabel={labelFor("netIncomeActual")}
                      />
                    )}
                    {cs.decisionType === "evaluate_site" && cs.actuals.signedMonthlyRent !== undefined && (
                      <ActualsLine
                        label="Signed rent (mo)"
                        projected={projectedSnapshot.monthlyRent}
                        actual={cs.actuals.signedMonthlyRent}
                        onChange={() => {}}
                        testId={`custom-scenario-actuals-rent-display-${idx}`}
                        kind="money"
                        betterWhen="lower"
                        savedSourceLabel={labelFor("signedMonthlyRent")}
                      />
                    )}
                    {cs.decisionType === "add_program" && cs.actuals.programEnrollmentActual !== undefined && (
                      <ActualsLine
                        label="Program enrollment"
                        projected={projectedSnapshot.programEnrollment}
                        actual={cs.actuals.programEnrollmentActual}
                        onChange={() => {}}
                        testId={`custom-scenario-actuals-progenroll-display-${idx}`}
                        kind="count"
                        betterWhen="higher"
                        savedSourceLabel={labelFor("programEnrollmentActual")}
                      />
                    )}
                  </>
                );
              })()}
              {cs.actuals.notes && (
                <p className="text-[10px] italic text-foreground/70 pt-1 border-t border-border/40">
                  {cs.actuals.notes}
                </p>
              )}
            </div>
          )}
          {!editingActuals && !cs.actuals && (
            <p className="text-[10px] text-muted-foreground">
              Record what actually happened so you can compare your forecast to reality.
            </p>
          )}
          {editingActuals && projectedSnapshot && (
            <div className="space-y-2" data-testid={`custom-scenario-actuals-editor-${idx}`}>
              <ActualsCoachIntro idx={idx} />
              <ActualsVarianceCoach
                idx={idx}
                projected={projectedSnapshot}
                draft={actualsDraft}
                decisionType={cs.decisionType}
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-medium text-foreground">As of</label>
                  <select
                    value={String(actualsDraft.asOfYear ?? 1)}
                    onChange={(e) => {
                      const nextYear = Number(e.target.value);
                      setActualsDraft({ ...actualsDraft, asOfYear: nextYear });
                      // Clear suggestion markers when the year changes — the
                      // suggestion source is year-aware, so previously-filled
                      // values may no longer match what we'd suggest now.
                      setSuggestedFields(new Set());
                      setSuggestionFeedback(null);
                    }}
                    className="text-[11px] border border-border rounded-md px-1.5 py-0.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    data-testid={`custom-scenario-actuals-year-${idx}`}
                  >
                    {[1, 2, 3, 4, 5].map((y) => (
                      <option key={y} value={y}>Year {y}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={suggestFromLatestData}
                  disabled={!hasAnySuggestion}
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors ${
                    hasAnySuggestion
                      ? "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"
                      : "bg-muted/40 text-muted-foreground border-border cursor-not-allowed"
                  }`}
                  data-testid={`custom-scenario-actuals-suggest-${idx}`}
                  title={
                    hasAnySuggestion
                      ? `Pulls suggestions from your model setup (${previewSuggestion!.sourceLabels.join(" · ")})`
                      : "Add prior-year actuals or current-year projections in setup to enable suggestions"
                  }
                >
                  <Wand2 className="h-3 w-3" /> Suggest from latest data
                </button>
              </div>
              {(() => {
                // "Pulled from your books" callout — only renders when the
                // suggestion engine actually sourced one or more fields from
                // the founder's uploaded CSV. We detect that by matching the
                // export filename against each per-field source string (the
                // suggestion helper formats it as "From <filename> uploaded
                // <Mon D>"), so any other source won't trigger the callout.
                const exportFilename = accountingExportInfo?.filename;
                if (!exportFilename || !previewSuggestion) return null;
                const sources = previewSuggestion.sources;
                const exportPrefix = `From ${exportFilename}`;
                // Only surface the callout when one or more *currently-applied*
                // suggestion fields are sourced from this export. We intersect
                // `suggestedFields` (the fields the founder hasn't manually
                // touched since clicking "Suggest from latest data") with the
                // per-field source labels so the callout doesn't claim
                // book-sourced provenance for typed-in or not-yet-suggested
                // values.
                const fromExport = Array.from(suggestedFields).some((f) => {
                  const s = sources[f];
                  return typeof s === "string" && s.startsWith(exportPrefix);
                });
                if (!fromExport) return null;
                const friendlyDate = formatExportUploadDate(accountingExportInfo?.uploadedAt);
                return (
                  <div
                    className="flex items-start justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5"
                    data-testid={`custom-scenario-actuals-export-source-${idx}`}
                  >
                    <div className="text-[10px] text-emerald-900 leading-snug min-w-0">
                      <span className="font-semibold">Pulled from your books:</span>{" "}
                      <span
                        className="font-mono break-all"
                        data-testid={`custom-scenario-actuals-export-filename-${idx}`}
                      >
                        {exportFilename}
                      </span>
                      {friendlyDate && (
                        <span
                          className="text-emerald-800/80"
                          data-testid={`custom-scenario-actuals-export-date-${idx}`}
                        >
                          {" "}· uploaded {friendlyDate}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
              {(() => {
                // Always-visible "Uploaded export" controls panel — surfaces
                // the founder's most-recent CSV/Excel upload alongside Replace
                // and Remove affordances so a wrong export can be swapped or
                // cleared without leaving the scenarios page. Renders any
                // time we know there's an upload (filename present), even
                // when the suggestion engine isn't currently sourcing fields
                // from it; that way a founder who hasn't yet clicked "Suggest
                // from latest data" can still take action on a stale upload.
                const exportFilename = accountingExportInfo?.filename;
                if (!exportFilename) return null;
                const friendlyDate = formatExportUploadDate(accountingExportInfo?.uploadedAt);
                const handleConfirmRemove = async () => {
                  if (!onRemoveExport) return;
                  setRemovingExport(true);
                  try {
                    await onRemoveExport();
                    setConfirmRemoveExport(false);
                  } finally {
                    setRemovingExport(false);
                  }
                };
                return (
                  <div
                    className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5"
                    data-testid={`custom-scenario-actuals-export-controls-${idx}`}
                  >
                    <div className="text-[10px] text-foreground/80 leading-snug min-w-0">
                      <span className="font-semibold">Uploaded export:</span>{" "}
                      <span
                        className="font-mono break-all"
                        data-testid={`custom-scenario-actuals-export-controls-filename-${idx}`}
                      >
                        {exportFilename}
                      </span>
                      {friendlyDate && (
                        <span className="text-muted-foreground">
                          {" "}· uploaded {friendlyDate}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!confirmRemoveExport ? (
                        <>
                          {replaceExportHref && (
                            <a
                              href={replaceExportHref}
                              className="text-[10px] font-semibold text-primary hover:underline whitespace-nowrap"
                              data-testid={`custom-scenario-actuals-replace-export-${idx}`}
                              title="Jump back to the wizard's School Profile step to upload a fresh export"
                            >
                              Replace upload →
                            </a>
                          )}
                          {onRemoveExport && (
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveExport(true)}
                              className="text-[10px] font-semibold text-rose-700 hover:text-rose-800 hover:underline whitespace-nowrap"
                              data-testid={`custom-scenario-actuals-remove-export-${idx}`}
                              title="Clear the uploaded export so suggestions revert to your typed-in priors"
                            >
                              Remove uploaded export
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <span
                            className="text-[10px] text-rose-800 whitespace-nowrap"
                            data-testid={`custom-scenario-actuals-remove-export-confirm-prompt-${idx}`}
                          >
                            Remove this upload?
                          </span>
                          <button
                            type="button"
                            onClick={handleConfirmRemove}
                            disabled={removingExport}
                            className="text-[10px] font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded px-2 py-0.5 whitespace-nowrap"
                            data-testid={`custom-scenario-actuals-remove-export-confirm-${idx}`}
                          >
                            {removingExport ? "Removing…" : "Yes, remove"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveExport(false)}
                            disabled={removingExport}
                            className="text-[10px] text-muted-foreground hover:text-foreground whitespace-nowrap"
                            data-testid={`custom-scenario-actuals-remove-export-cancel-${idx}`}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
              {uploadRemovedNotice && (
                <div
                  className="flex items-start justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5"
                  data-testid={`custom-scenario-actuals-upload-removed-notice-${idx}`}
                >
                  <p className="text-[10px] text-amber-900 leading-snug min-w-0">
                    Upload removed — book-sourced values are now editable as plain entries.
                  </p>
                  <button
                    type="button"
                    onClick={() => setUploadRemovedNotice(false)}
                    className="text-[10px] text-amber-900/70 hover:text-amber-900 shrink-0"
                    data-testid={`custom-scenario-actuals-upload-removed-dismiss-${idx}`}
                    title="Dismiss"
                    aria-label="Dismiss upload-removed notice"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              {suggestionFeedback && (
                <p
                  className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-snug"
                  data-testid={`custom-scenario-actuals-suggestion-feedback-${idx}`}
                >
                  {suggestionFeedback}
                </p>
              )}
              <ActualsLine
                label="Total enrollment"
                projected={projectedSnapshot.enrollment}
                actual={actualsDraft.enrollmentActual}
                onChange={(v) => setActualsField("enrollmentActual", v)}
                testId={`custom-scenario-actuals-enrollment-${idx}`}
                kind="count"
                betterWhen="higher"
                suggested={suggestedFields.has("enrollmentActual")}
                suggestionSource={previewSuggestion?.sources.enrollmentActual}
                suggestionContributors={previewSuggestion?.contributors.enrollmentActual}
              />
              <ActualsLine
                label="Revenue"
                projected={projectedSnapshot.revenue}
                actual={actualsDraft.revenueActual}
                onChange={(v) => setActualsField("revenueActual", v)}
                testId={`custom-scenario-actuals-revenue-${idx}`}
                kind="money"
                betterWhen="higher"
                suggested={suggestedFields.has("revenueActual")}
                suggestionSource={previewSuggestion?.sources.revenueActual}
                suggestionContributors={previewSuggestion?.contributors.revenueActual}
              />
              <ActualsLine
                label="Expenses"
                projected={projectedSnapshot.expense}
                actual={actualsDraft.expenseActual}
                onChange={(v) => setActualsField("expenseActual", v)}
                testId={`custom-scenario-actuals-expense-${idx}`}
                kind="money"
                betterWhen="lower"
                suggested={suggestedFields.has("expenseActual")}
                suggestionSource={previewSuggestion?.sources.expenseActual}
                suggestionContributors={previewSuggestion?.contributors.expenseActual}
              />
              <ActualsLine
                label="Net income"
                projected={projectedSnapshot.netIncome}
                actual={actualsDraft.netIncomeActual}
                onChange={(v) => setActualsField("netIncomeActual", v)}
                testId={`custom-scenario-actuals-netincome-${idx}`}
                kind="money"
                betterWhen="higher"
                suggested={suggestedFields.has("netIncomeActual")}
                suggestionSource={previewSuggestion?.sources.netIncomeActual}
              />
              {cs.decisionType === "evaluate_site" && (
                <ActualsLine
                  label="Signed rent (mo)"
                  projected={projectedSnapshot.monthlyRent}
                  actual={actualsDraft.signedMonthlyRent}
                  onChange={(v) => setActualsField("signedMonthlyRent", v)}
                  testId={`custom-scenario-actuals-rent-${idx}`}
                  kind="money"
                  betterWhen="lower"
                  suggested={suggestedFields.has("signedMonthlyRent")}
                  suggestionSource={previewSuggestion?.sources.signedMonthlyRent}
                  suggestionContributors={previewSuggestion?.contributors.signedMonthlyRent}
                />
              )}
              {cs.decisionType === "add_program" && (
                <ActualsLine
                  label="Program enrollment"
                  projected={projectedSnapshot.programEnrollment}
                  actual={actualsDraft.programEnrollmentActual}
                  onChange={(v) => setActualsDraft({ ...actualsDraft, programEnrollmentActual: v })}
                  testId={`custom-scenario-actuals-progenroll-${idx}`}
                  kind="count"
                  betterWhen="higher"
                />
              )}
              <textarea
                value={actualsDraft.notes ?? ""}
                onChange={(e) => setActualsDraft({ ...actualsDraft, notes: e.target.value })}
                rows={2}
                maxLength={300}
                placeholder="Optional context — e.g. 'Pre-K projected 24, came in at 19'"
                className="w-full text-[11px] border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                data-testid={`custom-scenario-actuals-notes-${idx}`}
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  onClick={clearActuals}
                  className="text-[10px] px-2 py-1 rounded text-muted-foreground hover:text-rose-600"
                  data-testid={`custom-scenario-actuals-clear-${idx}`}
                  title="Remove the saved actuals snapshot"
                >
                  Clear all
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setActualsDraft(cs.actuals ?? { asOfYear: 1 });
                      setSuggestedFields(new Set());
                      setSuggestionFeedback(null);
                      setUploadRemovedNotice(false);
                      setEditingActuals(false);
                    }}
                    className="text-[10px] px-2 py-1 rounded text-muted-foreground hover:text-foreground"
                    data-testid={`custom-scenario-actuals-cancel-${idx}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveActuals}
                    className="text-[10px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                    data-testid={`custom-scenario-actuals-save-${idx}`}
                  >
                    {suggestedFields.size > 0 ? "Confirm & save" : "Save actuals"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
          onClick={() => {
            // The persisted shape stores fit-out under `siteFitOutCost`; the
            // planner's WhatIfOverrides expects it under `oneTimeFitOut`.
            // Translate so re-opening an Evaluate-Site scenario in the planner
            // doesn't silently drop the fit-out value.
            const persisted = cs.overrides as PersistedDecisionOverrides & WhatIfOverrides;
            const planner: WhatIfOverrides = { ...(persisted as WhatIfOverrides) };
            if (persisted.siteFitOutCost !== undefined && persisted.siteFitOutCost > 0) {
              planner.oneTimeFitOut = persisted.siteFitOutCost;
            }
            onOpenInPlanner(planner);
          }}
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
  // Hide actuals / variance / QuickBooks / forecast-accuracy surfaces for
  // yet_to_launch founders (Task #302). Computed once at the page level so
  // every CustomScenarioCard and the page-level Forecast Accuracy roll-up
  // share the same gate.
  const { user: authUser } = useAuth();
  const hideActualsForPersona = personaIsYetToLaunch(authUser);

  const { data: model, isLoading } = useGetModel(modelId || 0, {
    query: { queryKey: [`/api/models/${modelId || 0}`], enabled: !!modelId },
  });
  const conflict = useConflictBanner();
  // Wire a global onError so every mutateAsync caller below (debounced
  // scenario save, decision-compare picker, custom scenario edits, what-if
  // applies, etc.) consistently surfaces the shared "your other tab edited
  // this" banner on a 409 instead of bubbling up an "HTTP 409" toast.
  const updateMutation = useUpdateModel({
    mutation: {
      onError: (err) => {
        conflict.handleMutationError(err);
      },
    },
  });
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
  // Init priority:
  //   1. `#compare=…` URL hash (Task #200) — an explicit "show me this
  //      lineup" share-link intent wins over any persisted selection.
  //   2. Empty — the model-load effect below hydrates from
  //      `modelData.decisionComparisonSelection` (Task #199) so a refresh
  //      restores the founder's previous picker without a hash.
  // The picker also persists (debounced) on every edit, so changes made
  // after a hash-seeded load still survive subsequent reloads.
  const [decisionCompareKeys, setDecisionCompareKeys] = useState<string[]>(
    () => {
      if (typeof window === "undefined") return [];
      return decodeCompareKeysFromHash(window.location.hash);
    },
  );
  const decisionCompareSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hard cap so the comparison stays readable on a typical laptop screen.
  // Matches the column palette in ImpactSummary and the codec's own cap;
  // re-exported via MAX_COMPARE_KEYS so the helper and UI agree.
  const MAX_DECISION_COMPARE = MAX_COMPARE_KEYS;
  // Tracks the most recent "share link copied" toast so we can give the
  // founder immediate feedback without standing up a separate dialog.
  const [shareCopied, setShareCopied] = useState<boolean>(false);
  const shareCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the in-flight Download-as-PDF request for the comparison block so
  // the button can show a spinner and we can disable it during generation.
  // The PDF endpoint is currently scoped to a binary A vs B comparison, so
  // the button only appears when exactly two columns are selected.
  const [decisionCompareDownloading, setDecisionCompareDownloading] =
    useState<boolean>(false);
  const [decisionCompareError, setDecisionCompareError] = useState<string | null>(null);

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
  // Free-text query that matches scenario name + retrospective note +
  // decision-type label (case-insensitive). Persisted in `?q=` so a
  // shared / reloaded URL keeps the same view as filter+sort.
  const searchQuery = searchParams.get("q") ?? "";
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
  const setSearchQuery = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          const trimmed = next.trim();
          if (trimmed === "") sp.delete("q");
          else sp.set("q", next);
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

  // Mirror the saveTimeout cleanup pattern for the decision-comparison
  // picker so an in-flight debounced write doesn't fire after unmount.
  useEffect(() => {
    return () => {
      if (decisionCompareSaveTimeoutRef.current) {
        clearTimeout(decisionCompareSaveTimeoutRef.current);
      }
    };
  }, []);

  // Re-hydrate the comparison picker whenever the URL hash changes so a
  // founder pasting a `#compare=…` link into the address bar (or hitting
  // back/forward through saved comparisons) lands on the encoded
  // selection. Empty / unrelated hashes leave the existing selection
  // alone — the IIFE below already tops up to a 2-column minimum from
  // the saved scenario list, so a wiped hash doesn't blank the picker.
  useEffect(() => {
    const sync = () => {
      const next = decodeCompareKeysFromHash(window.location.hash);
      if (next.length === 0) return;
      setDecisionCompareKeys(next);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Cleanup the "Link copied" indicator timer on unmount so we don't
  // call setState on an unmounted scenarios page.
  useEffect(() => {
    return () => {
      if (shareCopiedTimerRef.current) {
        clearTimeout(shareCopiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (model && !initialized) {
      const modelData = model.data as FullModelData | undefined;
      if ((model.currentStep ?? 0) < 9) {
        setLocation(`/model/${modelId}`);
        return;
      }
      const existing = modelData?.scenarios;
      // Restore the founder's last "Compare decisions side-by-side" picker
      // lineup so refreshing or revisiting the page doesn't reset to the
      // first two saved decisions. Stale keys (from scenarios deleted in a
      // prior session) get filtered out at render time by `validKeys`, and
      // a follow-up effect re-persists the cleaned list.
      const persistedSelection = (modelData as Record<string, unknown> | undefined)
        ?.decisionComparisonSelection as string[] | undefined;
      // Defer to the hash-seeded selection (Task #200) when a `#compare=…`
      // share link is present — the recipient's intent to land on the
      // shared lineup wins over the sender's last-saved picker.
      const hashSeeded =
        typeof window !== "undefined" &&
        decodeCompareKeysFromHash(window.location.hash).length > 0;
      if (
        !hashSeeded &&
        Array.isArray(persistedSelection) &&
        persistedSelection.length > 0
      ) {
        setDecisionCompareKeys(
          persistedSelection
            .filter((k): k is string => typeof k === "string")
            .slice(0, MAX_COMPARE_KEYS),
        );
      }
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

  // Memoize the forecast-accuracy roll-up so we re-run the per-scenario
  // engine projections only when the saved scenarios actually change. The
  // helper internally calls `computeProjectedSnapshot` (which re-runs the
  // financial engine) for every Pursued saved scenario, so this matters once
  // a founder accumulates several decisions.
  const forecastAccuracyRollup = useMemo(
    () => computeForecastAccuracy(modelData),
    [modelData],
  );

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

    return compareScenarios(leftMetrics, rightMetrics, leftAdj, rightAdj, {
      isSingleYear: isSingleYearModel(modelData),
    });
  }, [results, compareLeft, compareRight, scenarios, modelData]);

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

  // Debounced persist for the "Compare decisions" picker selection. Reads
  // the freshest cached server state before merging so concurrent saves
  // (e.g. a customScenario rename) don't get clobbered. An empty array is
  // stored as `undefined` so the field doesn't accumulate noise on models
  // that have never used the picker.
  const persistDecisionCompareKeys = useCallback(
    (updated: string[]) => {
      if (!modelId) return;
      if (decisionCompareSaveTimeoutRef.current) {
        clearTimeout(decisionCompareSaveTimeoutRef.current);
      }
      decisionCompareSaveTimeoutRef.current = setTimeout(() => {
        const fresh = queryClient.getQueryData<{ data?: Record<string, unknown> }>([
          `/api/models/${modelId}`,
        ]);
        const freshData = (fresh?.data ?? modelData) as Record<string, unknown>;
        updateMutation.mutate({
          id: modelId,
          data: {
            data: {
              ...freshData,
              decisionComparisonSelection: updated.length > 0 ? updated : undefined,
            } as Record<string, unknown>,
          },
        });
      }, 800);
    },
    [modelId, modelData, updateMutation, queryClient]
  );

  // Single helper used by every picker mutation so state and persistence
  // stay in lock-step. Wrapped (rather than calling both at the call site)
  // to keep the picker handlers below simple.
  const updateDecisionCompareKeys = useCallback(
    (next: string[]) => {
      setDecisionCompareKeys(next);
      persistDecisionCompareKeys(next);
    },
    [persistDecisionCompareKeys]
  );

  // Reconcile the persisted selection against the live customScenarios
  // list. When a saved scenario is deleted (or its decisionType cleared)
  // the matching key disappears here too, and the cleaned list is
  // re-persisted so the next session doesn't reload the stale entry.
  useEffect(() => {
    if (!initialized) return;
    const customList = ((modelData as Record<string, unknown>).customScenarios as
      | Array<{ name: string; createdAt: string; decisionType?: DecisionType }>
      | undefined) || [];
    const validKeys = new Set(
      customList
        .filter((c) => !!c.decisionType)
        .map((c) => `${c.name}|${c.createdAt}`),
    );
    const filtered = decisionCompareKeys.filter((k) => validKeys.has(k));
    if (filtered.length !== decisionCompareKeys.length) {
      setDecisionCompareKeys(filtered);
      persistDecisionCompareKeys(filtered);
    }
  }, [modelData, initialized, decisionCompareKeys, persistDecisionCompareKeys]);

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
      try {
        await updateMutation.mutateAsync({
          id: modelId,
          data: { data: adjustedData as Record<string, unknown> },
        });
      } catch (err) {
        // Task #492 — swallow 409s so the WhatIfDrawer doesn't show its
        // generic "Apply failed: HTTP 409" toast on top of the shared
        // ConflictReloadBanner the mutation's onError just opened. Re-throw
        // anything else so the drawer's error toast still surfaces real
        // failures (network, validation, server crash).
        if (conflict.handleMutationError(err)) return;
        throw err;
      }
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
    [modelId, updateMutation, queryClient, modelData, toast, conflict]
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
      try {
        await updateMutation.mutateAsync({
          id: modelId,
          data: {
            data: { ...freshData, customScenarios: updated } as Record<string, unknown>,
          },
        });
      } catch (err) {
        // Task #492 — same pattern as handleApplyWhatIfFromScenarios above:
        // 409s are surfaced via the shared ConflictReloadBanner, so we must
        // not reject (the drawer would show "Save failed: HTTP 409").
        if (conflict.handleMutationError(err)) return;
        throw err;
      }
      await queryClient.invalidateQueries({ queryKey: [`/api/models/${modelId}`] });
    },
    [modelId, modelData, updateMutation, queryClient, conflict]
  );

  // Clears the founder's uploaded accounting export from the persisted
  // model. Wired to the per-card "Remove uploaded export" button so a
  // misclicked CSV no longer poisons future suggestion runs. We snapshot
  // the prior export so the toast can offer a one-click undo — the upload
  // itself isn't re-stored anywhere else, so undoing is the *only* way to
  // recover from an accidental remove.
  const handleRemoveAccountingExport = useCallback(async () => {
    if (!modelId) return;
    const fresh = queryClient.getQueryData<{ data?: Record<string, unknown> }>([
      `/api/models/${modelId}`,
    ]);
    const freshData = (fresh?.data ?? modelData) as Record<string, unknown>;
    const priorExport = freshData.accountingExport;
    if (priorExport === undefined) return;
    const { accountingExport: _omitted, ...rest } = freshData as Record<string, unknown>;
    await updateMutation.mutateAsync({
      id: modelId,
      data: { data: rest as Record<string, unknown> },
    });
    await queryClient.invalidateQueries({ queryKey: [`/api/models/${modelId}`] });
    toast({
      title: "Uploaded export removed",
      description:
        "Suggestions will revert to your typed-in priors. Upload a fresh export from the wizard to start sourcing from books again.",
      action: (
        <ToastAction
          altText="Undo remove"
          onClick={async () => {
            const latest = queryClient.getQueryData<{ data?: Record<string, unknown> }>([
              `/api/models/${modelId}`,
            ]);
            const latestData = (latest?.data ?? rest) as Record<string, unknown>;
            await updateMutation.mutateAsync({
              id: modelId,
              data: {
                data: { ...latestData, accountingExport: priorExport } as Record<string, unknown>,
              },
            });
            await queryClient.invalidateQueries({ queryKey: [`/api/models/${modelId}`] });
            toast({
              title: "Upload restored",
              description: "Your accounting export is back on the model.",
            });
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  }, [modelId, modelData, updateMutation, queryClient, toast]);

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
      {conflict.banner}
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

                      {/* Task #478 — Y5 summary + per-year tables only make
                          sense for 5-year models. Single-year models extrapolate
                          Y2-Y5 from Y1, so these would publish hidden Y5 numbers
                          the founder didn't actually project. */}
                      {!isSingleYearModel(modelData) && (
                        <>
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
                    staffingRows={modelData.staffingRows ?? []}
                    personaComfort={getFounderPersona(authUser).comfort}
                    baseStaffingAdjustment={
                      compareLeft === "base"
                        ? 0
                        : scenarios[parseInt(compareLeft)]?.staffingAdjustment ?? 0
                    }
                    compareStaffingAdjustment={
                      compareRight === "base"
                        ? 0
                        : scenarios[parseInt(compareRight)]?.staffingAdjustment ?? 0
                    }
                  />
                </div>
              )}
            </div>

            {/* Task #477 — Single-year founders only. Renders the same
                advisor brief HTML the team review email would ship + the
                same scenario-compare verdict copy that lands in the
                comparison view, so the founder can confirm the Y1-anchored
                copy reads correctly before they hit submit. */}
            {modelId && isSingleYearModel(modelData) && (
              <div className="mb-8">
                <AdvisorPreviewPanel
                  modelId={modelId}
                  comparison={comparisonResult}
                  baseName={
                    compareLeft === "base"
                      ? "Base Model"
                      : scenarios[parseInt(compareLeft)]?.name || `Scenario ${parseInt(compareLeft) + 1}`
                  }
                  compareName={
                    compareRight === ""
                      ? undefined
                      : compareRight === "base"
                        ? "Base Model"
                        : scenarios[parseInt(compareRight)]?.name || `Scenario ${parseInt(compareRight) + 1}`
                  }
                />
              </div>
            )}
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
            updateDecisionCompareKeys(next);
          };
          const removeAt = (idx: number) => {
            if (effectiveKeys.length <= 2) return;
            updateDecisionCompareKeys(effectiveKeys.filter((_, i) => i !== idx));
          };
          const addColumn = () => {
            if (!canAddMore) return;
            const next = [...effectiveKeys, keyOf(remainingScenarios[0])];
            updateDecisionCompareKeys(next);
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
                <div className="mt-6 space-y-4" data-testid="decision-compare-result">
                  {/* Share link — copies a `#compare=…` URL that pre-selects
                      the same 2-4 saved decisions on the recipient's load.
                      Distinct from the live planner's What-If quick-share:
                      this one is for saved decision scenarios on the
                      Scenarios page. Visible for any 2-4 column selection
                      (the PDF download below is gated to the binary case). */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-muted-foreground">
                      Send a co-founder or board member straight to this exact
                      comparison — they'll land on the same {effectiveKeys.length} columns.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const url = buildCompareShareUrl(effectiveKeys);
                        // Update the address bar so a manual copy from the
                        // browser URL also captures the comparison hash.
                        try {
                          window.history.replaceState(null, "", url);
                        } catch {
                          // Ignore — replaceState can throw in some sandboxed
                          // iframes; clipboard copy below is the primary path.
                        }
                        try {
                          await navigator.clipboard.writeText(url);
                          setShareCopied(true);
                          if (shareCopiedTimerRef.current) {
                            clearTimeout(shareCopiedTimerRef.current);
                          }
                          shareCopiedTimerRef.current = setTimeout(
                            () => setShareCopied(false),
                            2500,
                          );
                          toast({
                            title: "Link copied",
                            description:
                              "Paste it in Slack or email — the recipient lands on this exact comparison.",
                          });
                        } catch {
                          toast({
                            title: "Couldn't copy link",
                            description: url,
                            variant: "destructive",
                          });
                        }
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors"
                      data-testid="decision-compare-share-link"
                      aria-label="Copy a shareable link to this comparison"
                    >
                      {shareCopied ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Link copied
                        </>
                      ) : (
                        <>
                          <Share2 className="h-4 w-4" /> Share link
                        </>
                      )}
                    </button>
                  </div>
                  {/* Download-as-PDF action — only shown for the binary
                      A vs B case because the backend PDF generator renders
                      a side-by-side comparison of exactly two scenarios.
                      For 3-4 column comparisons the user can drop a column
                      and the button reappears. The pre-computed impacts are
                      sent in the request body so the PDF mirrors what's on
                      screen. */}
                  {columns.length === 2 && selectedScenarios[0] && selectedScenarios[1] && (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-xs text-muted-foreground">
                        Take this comparison straight to the board — one page, the same numbers
                        you see here.
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!modelId || decisionCompareDownloading) return;
                          const a = selectedScenarios[0]!;
                          const b = selectedScenarios[1]!;
                          const aImpact = columns[0].impact;
                          const bImpact = columns[1].impact;
                          setDecisionCompareDownloading(true);
                          setDecisionCompareError(null);
                          try {
                            const profile = (modelData as Record<string, unknown>).schoolProfile as
                              | { schoolName?: string }
                              | undefined;
                            const decLabelOf = (cs: typeof a) =>
                              cs.decisionType ? DECISION_LABELS[cs.decisionType] : undefined;
                            const serializeImpact = (im: typeof aImpact) => ({
                              base: {
                                revenue: im.base.revenue,
                                netIncome: im.base.netIncome,
                                netMargin: im.base.netMargin,
                                dscr: im.base.dscr,
                                breakEvenYear: im.base.breakEvenYear,
                                cashRunwayMonths: im.base.cashRunwayMonths,
                              },
                              adjusted: {
                                revenue: im.adjusted.revenue,
                                netIncome: im.adjusted.netIncome,
                                netMargin: im.adjusted.netMargin,
                                dscr: im.adjusted.dscr,
                                breakEvenYear: im.adjusted.breakEvenYear,
                                cashRunwayMonths: im.adjusted.cashRunwayMonths,
                              },
                              deltas: {
                                revenue: im.deltas.revenue,
                                netIncome: im.deltas.netIncome,
                                breakEvenYearShift: im.deltas.breakEvenYearShift,
                                cashRunwayDeltaMonths: im.deltas.cashRunwayDeltaMonths,
                              },
                              nudges: im.nudges,
                            });
                            const payload = {
                              schoolName: profile?.schoolName,
                              primary: {
                                label: a.name,
                                decisionLabel: decLabelOf(a),
                                narrative: a.narrative,
                                impact: serializeImpact(aImpact),
                              },
                              compare: {
                                label: b.name,
                                decisionLabel: decLabelOf(b),
                                narrative: b.narrative,
                                impact: serializeImpact(bImpact),
                              },
                            };
                            const token = localStorage.getItem("auth_token");
                            const res = await fetch(
                              `/api/models/${modelId}/export/decision-comparison-pdf`,
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                },
                                body: JSON.stringify(payload),
                              },
                            );
                            if (!res.ok) {
                              const errText = await res.text().catch(() => "");
                              throw new Error(
                                `PDF generation failed (${res.status})${errText ? `: ${errText.slice(0, 200)}` : ""}`,
                              );
                            }
                            const blob = await res.blob();
                            const disposition = res.headers.get("content-disposition") || "";
                            const m = disposition.match(/filename="?([^";\n]+)"?/);
                            const safe = (s: string) =>
                              s.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Scenario";
                            const fallback = `Decision_Comparison_${safe(a.name)}_vs_${safe(b.name)}.pdf`;
                            const filename = m?.[1] || fallback;
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = filename;
                            document.body.appendChild(link);
                            link.click();
                            window.URL.revokeObjectURL(url);
                            link.remove();
                          } catch (err) {
                            setDecisionCompareError(
                              err instanceof Error ? err.message : "Failed to download PDF.",
                            );
                          } finally {
                            setDecisionCompareDownloading(false);
                          }
                        }}
                        disabled={decisionCompareDownloading}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        data-testid="decision-compare-download-pdf"
                      >
                        {decisionCompareDownloading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Preparing PDF…
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" /> Download as PDF
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  {decisionCompareError && (
                    <p
                      className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
                      data-testid="decision-compare-download-error"
                    >
                      {decisionCompareError}
                    </p>
                  )}
                  <ImpactSummary impact={columns[0].impact} columns={columns} isSingleYear={isSingleYearModel(modelData)} />
                </div>
              )}
            </div>
          );
        })()}

        {/* Forecast accuracy — roll-up of projected vs actual across every
            Pursued saved scenario that has actuals captured. Sits above the
            saved-scenarios list so a founder lands on the aggregate insight
            ("you tend to over-project enrollment by 5%") before drilling into
            individual cards below. Hidden when there's nothing to roll up so
            we don't render an empty surface for newer accounts. */}
        {!hideActualsForPersona && forecastAccuracyRollup.entries.length > 0 && (
          <ForecastAccuracyView rollup={forecastAccuracyRollup} />
        )}

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
            if (!hash) return;
            // Always force the planner open via a custom event — `hashchange`
            // alone wouldn't fire if the encoded hash happens to match the
            // current one (e.g. re-clicking the same scenario after closing
            // the drawer). The trigger listens for this and remounts the
            // drawer so it re-hydrates from the freshly written hash.
            window.location.hash = hash;
            window.dispatchEvent(
              new CustomEvent("whatif:open", { detail: { hash } }),
            );
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
          // Apply text search → outcome filter → sort. Search comes first so
          // the chip counts reflect "how many Pursued match my query?" while
          // the active outcome chip then narrows to that subset.
          const trimmedQuery = searchQuery.trim().toLowerCase();
          const matchesQuery = (cs: CustomScenario): boolean => {
            if (!trimmedQuery) return true;
            const haystack: string[] = [cs.name];
            if (cs.retrospective) haystack.push(cs.retrospective);
            if (cs.decisionType) haystack.push(DECISION_LABELS[cs.decisionType]);
            return haystack.some((s) => s.toLowerCase().includes(trimmedQuery));
          };
          const searchMatched = trimmedQuery
            ? custom.filter(matchesQuery)
            : custom;
          // Counts reflect the post-search candidate pool so the chip badges
          // tell the founder "of what I'm searching for, how many are
          // Pursued / Declined / etc." When there's no query this is just the
          // full list, matching the previous behaviour.
          const counts: Record<OutcomeFilter, number> = {
            all: searchMatched.length,
            pursued: 0,
            declined: 0,
            on_hold: 0,
            untracked: 0,
          };
          for (const cs of searchMatched) {
            const status = cs.outcomeStatus ?? "untracked";
            counts[status as OutcomeFilter] += 1;
          }
          const filtered =
            outcomeFilter === "all"
              ? searchMatched
              : outcomeFilter === "untracked"
                ? searchMatched.filter((cs) => !cs.outcomeStatus)
                : searchMatched.filter((cs) => cs.outcomeStatus === outcomeFilter);
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
              {/* Filter + search + sort toolbar — keeps the list scannable
                  as the number of saved decisions grows. Selections persist
                  to the URL (?outcome=…&q=…&sort=…) so reloads/shares keep
                  the view. */}
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
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative">
                    <Search
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name or note…"
                      aria-label="Search saved scenarios by name, retrospective note, or decision type"
                      className="text-xs border border-border rounded-md pl-7 pr-7 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-44 sm:w-56"
                      data-testid="custom-scenarios-search-input"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        aria-label="Clear search"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        data-testid="custom-scenarios-search-clear"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
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
              </div>
              {visible.length === 0 ? (
                <div
                  className="bg-muted/30 border border-dashed border-border rounded-2xl px-5 py-8 text-center"
                  data-testid="custom-scenarios-empty"
                >
                  <p className="text-sm text-muted-foreground">
                    {trimmedQuery
                      ? `No saved scenarios match “${searchQuery}”${outcomeFilter !== "all" ? " in this filter" : ""}.`
                      : "No saved scenarios match this filter."}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setOutcomeFilter("all");
                      setSearchQuery("");
                    }}
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
                      hideActualsSurfaces={hideActualsForPersona}
                      searchQuery={searchQuery}
                      getProjectedSnapshot={(asOfYear) =>
                        computeProjectedSnapshot(
                          modelData,
                          cs.overrides as PersistedDecisionOverrides,
                          cs.decisionType,
                          asOfYear,
                        )
                      }
                      getAdjustedCashPosition={() => {
                        // Trough badge (Task #377): only computable when the
                        // saved scenario has a decisionType — legacy / non-
                        // decision saves have no decision-engine path. Wrap
                        // in try/catch so a single bad scenario can't take
                        // out the whole list.
                        if (!cs.decisionType) return null;
                        try {
                          const impact = computeDecisionImpactFromPersisted(
                            modelData,
                            cs.decisionType as DecisionType,
                            cs.overrides as PersistedDecisionOverrides,
                          );
                          return impact.adjusted.cashPosition;
                        } catch {
                          return null;
                        }
                      }}
                      getActualsSuggestion={(asOfYear) =>
                        buildActualsSuggestion(
                          modelData,
                          cs.overrides as PersistedDecisionOverrides,
                          cs.decisionType,
                          asOfYear,
                        )
                      }
                      accountingExportInfo={
                        modelData.accountingExport
                          ? {
                              filename: modelData.accountingExport.filename,
                              uploadedAt: modelData.accountingExport.uploadedAt,
                            }
                          : undefined
                      }
                      replaceExportHref={
                        modelId
                          ? `/model/${modelId}?step=2&focus=accounting-export`
                          : undefined
                      }
                      onRemoveExport={
                        modelData.accountingExport ? handleRemoveAccountingExport : undefined
                      }
                      staffingRows={modelData.staffingRows ?? []}
                      personaComfort={getFounderPersona(authUser).comfort}
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
          customScenarios={(modelData.customScenarios as CustomScenario[]) || []}
        />
      )}
    </Layout>
  );
}
