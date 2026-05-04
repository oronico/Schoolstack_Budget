import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { GraduationCap, Building2, Users, Sparkles, X, FileSpreadsheet, ChevronRight, Lightbulb } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";

type LaunchableType = "add_program" | "evaluate_site" | "change_enrollment";

const URL_FOR_TYPE: Record<LaunchableType, string> = {
  add_program: "add-program",
  evaluate_site: "evaluate-site",
  change_enrollment: "change-enrollment",
};

interface ModelLite {
  id: number;
  name: string | null;
  status: string;
  currentStep?: number | null;
  updatedAt: string | Date;
}

interface DecisionLauncherProps {
  models: ModelLite[];
  onStartNew: () => void;
  startNewPending: boolean;
}

// `coachSubtitle` is the plain-English line we show under the blurb for
// basics + extra users — concrete examples, no jargon, sets expectations
// for how long the flow takes. `tooltip` is the lender/board framing that
// shows on hover (and as accessible title) for every guidance level so
// even advanced users can scan the framing fast.
const decisionCards: Array<{
  type: LaunchableType;
  title: string;
  blurb: React.ReactNode;
  coachSubtitle: string;
  tooltip: string;
  Icon: typeof GraduationCap;
  bg: string;
  border: string;
  iconBg: string;
  iconColor: string;
  testid: string;
}> = [
  {
    type: "add_program",
    title: "Add a program or grade",
    blurb: (
      <>
        Model what a new grade band, after-school track, or program adds to
        revenue and cost.
      </>
    ),
    coachSubtitle: "Best for: \"Should we add 6th grade next year?\" or \"Is the after-school track worth it?\" - about 5 minutes.",
    tooltip: "Holds your base model fixed and layers a new program on top, so you see the marginal revenue, marginal cost, and net effect on DSCR / cash / break-even.",
    Icon: GraduationCap,
    bg: "bg-amber-50/50",
    border: "border-amber-200/70 hover:border-amber-400",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    testid: "decision-card-add-program",
  },
  {
    type: "evaluate_site",
    title: "Evaluate a site or lease",
    blurb: (
      <>
        See how a new building, rent, or fit-out cost moves{" "}
        <GlossaryTerm termKey="dscr">DSCR</GlossaryTerm>, cash, and{" "}
        <GlossaryTerm termKey="break_even">break-even</GlossaryTerm>.
      </>
    ),
    coachSubtitle: "Best for: comparing two lease offers, stress-testing a fit-out budget, or pressure-testing rent before you sign - about 5 minutes.",
    tooltip: "Plugs in monthly rent, fit-out, and concessions, then re-runs the model so you can compare the new debt-service coverage and cash trough against your base.",
    Icon: Building2,
    bg: "bg-teal-50/50",
    border: "border-teal-200/70 hover:border-teal-400",
    iconBg: "bg-teal-100",
    iconColor: "text-teal-700",
    testid: "decision-card-evaluate-site",
  },
  {
    type: "change_enrollment",
    title: "Change enrollment",
    blurb: (
      <>
        Test a new re-enrollment number, retention rate, or tuition adjustment
        against your <GlossaryTerm termKey="break_even">break-even</GlossaryTerm>.
      </>
    ),
    coachSubtitle: "Best for: deciding whether to bump tuition 4%, what happens if 5 families don't return, or how aggressive your re-enroll target should be - about 5 minutes.",
    tooltip: "Holds program structure fixed and re-projects revenue, runway, and net income against the new enrollment / pricing assumption.",
    Icon: Users,
    bg: "bg-emerald-50/50",
    border: "border-emerald-200/70 hover:border-emerald-400",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
    testid: "decision-card-change-enrollment",
  },
];

const TITLE_FOR_TYPE: Record<LaunchableType, string> = {
  add_program: "Add a program or grade",
  evaluate_site: "Evaluate a site or lease",
  change_enrollment: "Change enrollment",
};

export function DecisionLauncher({ models, onStartNew, startNewPending }: DecisionLauncherProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingType, setPendingType] = useState<LaunchableType | null>(null);
  // Task #499: shared coach-gate hook keeps every coach-gated surface in sync.
  const { guidanceLevel, showCoach } = useShowCoach();

  // Fire once per mount when the launcher renders for a coach-mode user, so
  // the coaching dashboard can measure how often the subtitles actually show.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (!showCoach || trackedRef.current) return;
    trackedRef.current = true;
    trackCoachingEvent("dashboard_launcher_coach_shown", {
      guidanceLevel,
      modelCount: models.length,
    });
  }, [showCoach, guidanceLevel, models.length]);

  const eligibleModels = useMemo(
    () => models.filter((m) => m.status !== "archived"),
    [models],
  );

  // Engagement signal: any decision card click while the coach subtitles are
  // visible counts as the founder taking action on the coach line. Fired once
  // per mount so the funnel measures unique launchers, not per-click totals.
  const engagedRef = useRef(false);
  const trackEngaged = (cardType: LaunchableType) => {
    if (!showCoach || engagedRef.current) return;
    engagedRef.current = true;
    trackCoachingEvent("dashboard_launcher_coach_engaged", {
      guidanceLevel,
      cardType,
    });
  };

  const launch = (type: LaunchableType) => {
    trackEngaged(type);
    if (eligibleModels.length === 0) {
      // Friendly nudge + redirect straight into the wizard. Decision flows need
      // a base model to run against, so we send the founder there directly
      // rather than dead-ending in a modal.
      toast({
        title: "Let's build a base model first",
        description: `${TITLE_FOR_TYPE[type]} runs on top of an existing model - about 30–45 minutes to set one up, then your decision plugs right in.`,
      });
      onStartNew();
      return;
    }
    if (eligibleModels.length === 1) {
      setLocation(`/decisions/${URL_FOR_TYPE[type]}/${eligibleModels[0].id}`);
      return;
    }
    setPendingType(type);
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
    setPendingType(null);
  };

  const goToModel = (modelId: number) => {
    if (!pendingType) return;
    setLocation(`/decisions/${URL_FOR_TYPE[pendingType]}/${modelId}`);
    closePicker();
  };

  return (
    <section className="mb-10" data-testid="decision-launcher">
      <div className="flex items-end justify-between gap-2 mb-4">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600" />
            I want to figure out…
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Each path is a guided 4-step mini-flow that saves your work as a scenario.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={onStartNew}
          disabled={startNewPending}
          className="group flex flex-col text-left rounded-2xl border border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 p-5 transition-all disabled:opacity-70"
          data-testid="decision-card-start-school"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-3">
            <Sparkles className="h-5 w-5" />
          </div>
          <h3 className="font-display font-bold text-foreground mb-1">Start a school</h3>
          <p className="text-xs text-muted-foreground leading-relaxed flex-1">
            Brand-new model? Walk through the full wizard and build a 5-year projection.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
            {startNewPending ? "Creating…" : "Open wizard"} <ChevronRight className="h-3 w-3" />
          </span>
        </button>

        {decisionCards.map(({ type, title, blurb, coachSubtitle, tooltip, Icon, bg, border, iconBg, iconColor, testid }) => (
          <button
            key={type}
            type="button"
            onClick={() => launch(type)}
            title={tooltip}
            className={cn(
              "group flex flex-col text-left rounded-2xl border bg-card p-5 transition-all hover:shadow-md",
              border,
              bg,
            )}
            data-testid={testid}
          >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", iconBg, iconColor)}>
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="font-display font-bold text-foreground mb-1">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{blurb}</p>
            {showCoach && (
              <p
                className="mt-1.5 text-[11px] text-amber-900/85 leading-snug flex-1"
                data-testid={`${testid}-coach-subtitle`}
              >
                <span className="font-semibold">Coach:</span> {coachSubtitle}
              </p>
            )}
            {!showCoach && <div className="flex-1" />}
            <span className={cn("mt-3 inline-flex items-center gap-1 text-xs font-semibold", iconColor)}>
              {eligibleModels.length === 0 ? "Start a model first" : eligibleModels.length === 1 ? "Open flow" : "Pick a model"}
              <ChevronRight className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>

      {pickerOpen && pendingType && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4 animate-in fade-in-0"
          onClick={closePicker}
          data-testid="decision-model-picker"
        >
          <div
            className="bg-background border border-border rounded-2xl p-6 shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">
                  {eligibleModels.length === 0 ? "Start a model first" : "Pick a model to use"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {eligibleModels.length === 0
                    ? "Decision flows run on top of an existing financial model."
                    : "Which model should we run this decision against?"}
                </p>
              </div>
              <button
                type="button"
                onClick={closePicker}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Close model picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {eligibleModels.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground/80">
                  Build a quick base model first - about 30–45 minutes - then come back here to play
                  out this decision against it.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    closePicker();
                    onStartNew();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-white font-semibold text-sm hover:bg-primary/90"
                >
                  Start a model now <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {eligibleModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => goToModel(m.id)}
                    className="w-full flex items-center gap-3 text-left rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/5 px-3 py-2.5 transition-colors"
                    data-testid={`model-picker-option-${m.id}`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <FileSpreadsheet className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {m.name || "Untitled Model"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {m.status === "complete" ? "Complete" : "In progress"} •
                        Updated {format(new Date(m.updatedAt), "MMM d")}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface ThingsHaveChangedBannerProps {
  models: ModelLite[];
  staleDays?: number;
}

export function ThingsHaveChangedBanner({ models, staleDays = 30 }: ThingsHaveChangedBannerProps) {
  const [, setLocation] = useLocation();
  // Task #499: shared coach-gate hook keeps every coach-gated surface in sync.
  const { guidanceLevel, showCoach } = useShowCoach();
  const trackedRef = useRef(false);
  const stale = useMemo(() => {
    return models
      .filter((m) => m.status === "complete")
      .map((m) => ({ m, days: differenceInDays(new Date(), new Date(m.updatedAt)) }))
      .filter(({ days }) => days > staleDays)
      .sort((a, b) => b.days - a.days);
  }, [models, staleDays]);

  // Pick the most stale completed model as the default target for the chips.
  // Compute these even when stale.length === 0 so the useEffect deps below
  // stay stable across renders; we early-return the JSX further down.
  const target = stale[0]?.m;
  const oldestDays = stale[0]?.days ?? 0;

  // Fire the "things changed" coach-shown event once per mount when the
  // banner is actually visible to a coach-mode user. Kept in an effect (not
  // the render path) so React StrictMode double-invocation and remounts
  // don't double-emit, and the ref guard still prevents re-fires when deps
  // change while the banner is still on screen.
  useEffect(() => {
    if (!showCoach || stale.length === 0 || trackedRef.current) return;
    trackedRef.current = true;
    trackCoachingEvent("things_changed_coach_shown", {
      guidanceLevel,
      oldestDays,
      staleCount: stale.length,
    });
  }, [showCoach, guidanceLevel, oldestDays, stale.length]);

  // Engagement signal: stale chip click while the banner is on screen for a
  // coach-mode user. Fired once per mount so the funnel measures unique
  // banners that drove a follow-through, not raw chip clicks.
  const engagedRef = useRef(false);

  if (stale.length === 0 || !target) return null;

  const launch = (type: LaunchableType) => {
    if (showCoach && !engagedRef.current) {
      engagedRef.current = true;
      trackCoachingEvent("things_changed_coach_engaged", {
        guidanceLevel,
        oldestDays,
        cardType: type,
      });
    }
    setLocation(`/decisions/${URL_FOR_TYPE[type]}/${target.id}`);
  };

  return (
    <div
      className="mb-8 bg-gradient-to-r from-amber-50/70 via-white to-amber-50/70 border border-amber-200/70 rounded-2xl p-5"
      data-testid="things-changed-banner"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Things have changed since you last looked?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-semibold text-foreground">{target.name || "Untitled Model"}</span> hasn't been updated in {oldestDays} days. Run a quick decision flow to see how today's reality stacks up.
              {stale.length > 1 && (
                <span className="text-muted-foreground"> ({stale.length - 1} other completed model{stale.length - 1 === 1 ? "" : "s"} also stale.)</span>
              )}
            </p>
            {showCoach && (
              <p
                className="text-[11px] text-amber-900/85 mt-1.5 leading-snug flex items-start gap-1.5"
                data-testid="things-changed-coach"
              >
                <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-amber-700" />
                <span>
                  <span className="font-semibold">Coach:</span> a model older
                  than ~30 days usually means enrollment, payroll, or rent has
                  drifted from your projection. The fastest way to catch up is
                  a 5-minute decision flow - pick the chip that matches what
                  changed and we'll re-run the math against today.
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {decisionCards.map(({ type, title, iconColor, iconBg, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => launch(type)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 border bg-white border-border/60 hover:border-foreground/30 transition-colors",
              )}
              data-testid={`stale-chip-${URL_FOR_TYPE[type]}`}
            >
              <span className={cn("inline-flex w-5 h-5 items-center justify-center rounded-full", iconBg, iconColor)}>
                <Icon className="h-3 w-3" />
              </span>
              {title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
