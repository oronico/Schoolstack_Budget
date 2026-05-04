import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Wand2, FileSpreadsheet, ClipboardList, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionType } from "@/pages/model-wizard/schema";
import { DECISION_THEME } from "@/lib/decision-flows";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import { trackCoachingEvent } from "@/lib/coaching/track";

export type SaveAction = "apply" | "planner" | "later";

interface SaveActionsProps {
  decisionType: DecisionType;
  scenarioName: string;
  setScenarioName: (v: string) => void;
  defaultName: string;
  isSaving: boolean;
  done: boolean;
  doneAction: SaveAction | null;
  onSave: (action: SaveAction) => void | Promise<void>;
  plannerAvailable: boolean;
  plannerUnavailableReason?: string;
}

export function SaveActions({
  decisionType,
  scenarioName,
  setScenarioName,
  defaultName,
  isSaving,
  done,
  doneAction,
  onSave,
  plannerAvailable,
  plannerUnavailableReason,
}: SaveActionsProps) {
  const theme = DECISION_THEME[decisionType];
  const [hover, setHover] = useState<SaveAction | null>(null);
  // Task #499: shared coach-gate hook keeps every coach-gated surface in sync.
  const { guidanceLevel, showCoach } = useShowCoach();

  // The "Apply to my model" reminder is the most consequential message in
  // this step (Apply rewrites the base model), so we only surface it when
  // the founder signals intent toward that specific action — i.e. they
  // hover or keyboard-focus the Apply tile. Showing it unconditionally
  // for every coach-mode visitor turned out to feel like noise during
  // QA. We still emit the *_shown event the first time it appears so the
  // coaching dashboard can measure reach.
  const showApplyReminder = showCoach && hover === "apply";
  const trackedRef = useRef(false);
  useEffect(() => {
    if (!showApplyReminder || trackedRef.current) return;
    trackedRef.current = true;
    trackCoachingEvent("save_action_apply_reminder_shown", {
      decisionType,
      guidanceLevel,
    });
  }, [showApplyReminder, decisionType, guidanceLevel]);

  // Engagement / dismissal pairing for the apply reminder. Engagement = the
  // founder clicked "Apply to my model" while the reminder was visible
  // (they read it and proceeded anyway). Dismissal = they hovered away or
  // moved focus elsewhere after the reminder appeared without ever clicking
  // Apply (treated as "shown but not converted"). Both are fired once per
  // mount so the funnel measures unique reminders, not repeated hovers.
  const reminderShownRef = useRef(false);
  const engagedRef = useRef(false);
  const dismissedRef = useRef(false);
  useEffect(() => {
    if (showApplyReminder) reminderShownRef.current = true;
  }, [showApplyReminder]);
  const handleSave = (action: SaveAction) => {
    if (
      action === "apply" &&
      showCoach &&
      reminderShownRef.current &&
      !engagedRef.current
    ) {
      engagedRef.current = true;
      trackCoachingEvent("save_action_apply_reminder_engaged", {
        decisionType,
        guidanceLevel,
      });
    } else if (
      action !== "apply" &&
      showCoach &&
      reminderShownRef.current &&
      !dismissedRef.current &&
      !engagedRef.current
    ) {
      // The founder saw the apply reminder but ultimately picked a
      // non-apply action (planner / save-later) — treat as dismissed.
      dismissedRef.current = true;
      trackCoachingEvent("save_action_apply_reminder_dismissed", {
        decisionType,
        guidanceLevel,
        chosenAction: action,
      });
    }
    void onSave(action);
  };

  // Auto-populate the scenario name with the suggested default the first time
  // the user lands on the save step, so the action tiles are immediately
  // usable. The user can still edit or clear the name; we only fill it once.
  useEffect(() => {
    if (!scenarioName && defaultName) {
      setScenarioName(defaultName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid = scenarioName.trim().length > 0;

  return (
    <section className="max-w-2xl space-y-5" data-testid="decision-flow-save-step">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground mb-1">Save & decide what to do next</h2>
        <p className="text-sm text-muted-foreground">
          Name this decision so your future self (and your board) can find it. Then choose what should happen next.
        </p>
      </div>

      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Scenario name
        </span>
        <input
          type="text"
          value={scenarioName}
          onChange={(e) => setScenarioName(e.target.value)}
          placeholder={defaultName}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
          data-testid="decision-flow-scenario-name"
        />
      </label>

      {showApplyReminder && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-2.5"
          data-testid="save-action-apply-coach"
        >
          <Lightbulb className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-amber-900">
            <p className="font-semibold">Coach: pick "Apply to my model" only when you're ready</p>
            <p className="text-amber-900/85 mt-0.5">
              "Apply" rewrites your base model to assume this decision is happening — every future scenario will compare against the new baseline. If you're still weighing options, "Save &amp; review later" keeps the scenario without changing your base.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3" data-testid="decision-flow-save-actions">
        <ActionTile
          testid="save-action-apply"
          Icon={CheckCircle2}
          title="Apply to my model"
          subtitle="Save this scenario AND fold the change into your base model. Best when you've decided to go ahead."
          isPrimary
          theme={theme}
          disabled={!valid || isSaving}
          isLoading={isSaving && hover === "apply"}
          done={done && doneAction === "apply"}
          onPointerEnter={() => setHover("apply")}
          onPointerLeave={() => setHover((h) => (h === "apply" ? null : h))}
          onFocus={() => setHover("apply")}
          onBlur={() => setHover((h) => (h === "apply" ? null : h))}
          onClick={() => { setHover("apply"); handleSave("apply"); }}
        />
        <ActionTile
          testid="save-action-planner"
          Icon={Wand2}
          title="Open in What-If planner"
          subtitle={
            plannerAvailable
              ? "Save this scenario AND open the live planner so you can keep tweaking the levers."
              : plannerUnavailableReason ?? "Not available for this decision type."
          }
          theme={theme}
          disabled={!valid || isSaving || !plannerAvailable}
          isLoading={isSaving && hover === "planner"}
          done={done && doneAction === "planner"}
          onPointerEnter={() => setHover("planner")}
          onPointerLeave={() => setHover((h) => (h === "planner" ? null : h))}
          onFocus={() => setHover("planner")}
          onBlur={() => setHover((h) => (h === "planner" ? null : h))}
          onClick={() => { setHover("planner"); handleSave("planner"); }}
        />
        <ActionTile
          testid="save-action-later"
          Icon={ClipboardList}
          title="Save & review later"
          subtitle="Save this scenario alongside your other what-ifs so you can compare and revisit it any time."
          theme={theme}
          disabled={!valid || isSaving}
          isLoading={isSaving && hover === "later"}
          done={done && doneAction === "later"}
          onPointerEnter={() => setHover("later")}
          onPointerLeave={() => setHover((h) => (h === "later" ? null : h))}
          onFocus={() => setHover("later")}
          onBlur={() => setHover((h) => (h === "later" ? null : h))}
          onClick={() => { setHover("later"); handleSave("later"); }}
        />
      </div>

      {done && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900">
          <p className="font-semibold mb-1 inline-flex items-center gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> Scenario saved
          </p>
          <p className="text-emerald-900/80 text-xs">
            {doneAction === "apply"
              ? "We've also folded the change into your base model. The dashboard's stale-banner will reset for this model."
              : doneAction === "planner"
              ? "Opening the What-If planner with your overrides applied."
              : "Find it under Saved What-If scenarios on your Scenarios page."}
          </p>
        </div>
      )}
    </section>
  );
}

interface ActionTileProps {
  testid: string;
  Icon: typeof CheckCircle2;
  title: string;
  subtitle: string;
  isPrimary?: boolean;
  theme: typeof DECISION_THEME[DecisionType];
  disabled: boolean;
  isLoading: boolean;
  done: boolean;
  onClick: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

function ActionTile({ testid, Icon, title, subtitle, isPrimary, theme, disabled, isLoading, done, onClick, onPointerEnter, onPointerLeave, onFocus, onBlur }: ActionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      disabled={disabled}
      data-testid={testid}
      className={cn(
        "flex items-start gap-3 text-left rounded-xl border p-4 transition-all",
        isPrimary ? `${theme.border} ${theme.bg}` : "border-border bg-card",
        !disabled && "hover:shadow-md hover:border-foreground/30",
        disabled && "opacity-60 cursor-not-allowed",
        done && "ring-2 ring-emerald-300 border-emerald-300",
      )}
    >
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", isPrimary ? theme.accent : "bg-muted", isPrimary ? "text-white" : "text-foreground")}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className={cn("font-display font-semibold text-sm", isPrimary ? theme.text : "text-foreground")}>
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {isLoading && (
        <span className="text-xs text-muted-foreground self-center">Saving…</span>
      )}
    </button>
  );
}
