import { useMemo, useEffect, useRef } from "react";
import { Users, DollarSign, Scissors, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { computeQuickLevers, type QuickLever } from "@/lib/scenario-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";
import { trackCoachingEvent } from "@/lib/coaching/track";

interface QuickLeversProps {
  data: FullModelData;
  className?: string;
}

const ICON_MAP = {
  users: Users,
  dollar: DollarSign,
  scissors: Scissors,
} as const;

const ICON_COLORS = {
  users: { bg: "bg-blue-100", text: "text-blue-700" },
  dollar: { bg: "bg-emerald-100", text: "text-emerald-700" },
  scissors: { bg: "bg-amber-100", text: "text-amber-700" },
} as const;

function DeltaChip({ before, after, label, higherIsBetter = true }: { before: number; after: number; label: string; higherIsBetter?: boolean }) {
  if (before === -1 && after === -1) return null;
  if (before === 0 && after === 0 && label === "Debt payment cushion") return null;

  const isSentinel = before === -1 || after === -1;
  const delta = after - before;
  const isUnchanged = !isSentinel && Math.abs(delta) < 0.01;

  let isImproved = false;
  let isWorsened = false;

  if (isSentinel && label === "BE Enrollment") {
    if (before === -1 && after > 0) isImproved = true;
    else if (after === -1 && before > 0) isWorsened = true;
  } else if (!isUnchanged) {
    isImproved = higherIsBetter ? delta > 0 : delta < 0;
    isWorsened = higherIsBetter ? delta < 0 : delta > 0;
  }

  let color = "bg-gray-100 text-gray-600";
  let Icon = Minus;
  if (!isUnchanged || isSentinel) {
    if (isImproved) {
      color = "bg-emerald-100 text-emerald-700";
      Icon = TrendingUp;
    } else if (isWorsened) {
      color = "bg-rose-100 text-rose-700";
      Icon = TrendingDown;
    }
  }

  let display: string;
  if (label === "BE Enrollment") {
    if (before === -1 && after > 0) display = `→ ${after} students`;
    else if (after === -1 && before > 0) display = "N/A";
    else if (before === -1 && after === -1) return null;
    else if (delta < 0) display = `${delta} students`;
    else if (delta > 0) display = `+${delta} students`;
    else display = "-";
  } else if (label === "Debt payment cushion") {
    display = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}x`;
  } else if (label === "Cash Trough") {
    display = `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`;
  } else {
    display = `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`;
  }

  return (
    <div className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", color)}>
      <Icon className="h-2.5 w-2.5" />
      <span>{label}: {display}</span>
    </div>
  );
}

function LeverCard({ lever, index }: { lever: QuickLever; index: number }) {
  const IconComp = ICON_MAP[lever.icon];
  const iconColors = ICON_COLORS[lever.icon];

  return (
    <div
      className="bg-white rounded-xl border border-border/60 p-4 shadow-sm hover:shadow-md transition-shadow"
      onClick={() => {
        trackCoachingEvent("quick_lever_viewed", { leverId: lever.id, index });
      }}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", iconColors.bg)}>
          <IconComp className={cn("h-4 w-4", iconColors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-foreground">{lever.label}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{lever.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 text-center py-1.5 rounded-lg bg-secondary/40">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Now</p>
          <p className="text-sm font-bold text-foreground">{formatCurrency(lever.before.netIncome)}</p>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="flex-1 text-center py-1.5 rounded-lg bg-secondary/40">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">After</p>
          <p className={cn("text-sm font-bold", lever.after.netIncome >= 0 ? "text-emerald-700" : "text-rose-600")}>
            {formatCurrency(lever.after.netIncome)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <DeltaChip before={lever.before.cashTrough} after={lever.after.cashTrough} label="Cash Trough" />
        <DeltaChip before={lever.before.dscr} after={lever.after.dscr} label="Debt payment cushion" />
        <DeltaChip before={lever.before.breakEvenEnrollment} after={lever.after.breakEvenEnrollment} label="BE Enrollment" higherIsBetter={false} />
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed italic">{lever.coaching}</p>
    </div>
  );
}

const ACTIONABLE_LEVER_IDS = ["enrollment_up_10", "staff_minus_1", "tuition_up_5"];
const RISK_LEVER_IDS = ["enrollment_down_10"];

function selectTopLevers(all: QuickLever[], max: number): QuickLever[] {
  const actionable = all.filter(l => ACTIONABLE_LEVER_IDS.includes(l.id));
  const risk = all.filter(l => RISK_LEVER_IDS.includes(l.id));
  const selected = actionable.slice(0, max);
  if (selected.length < max && risk.length > 0) {
    selected.push(...risk.slice(0, max - selected.length));
  }
  return selected;
}

export function QuickLevers({ data, className }: QuickLeversProps) {
  const allLevers = useMemo(() => computeQuickLevers(data), [data]);
  const levers = useMemo(() => selectTopLevers(allLevers, 3), [allLevers]);

  const trackedRef = useRef(false);
  useEffect(() => {
    if (levers.length === 0 || trackedRef.current) return;
    trackedRef.current = true;
    trackCoachingEvent("quick_levers_shown", {
      leverCount: levers.length,
      leverIds: levers.map(l => l.id),
    });
  }, [levers]);

  if (levers.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Quick Levers - What If You...</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Your budget is never perfect on the first try - and that's okay. These quick levers help you see how small changes affect your bottom line, so you can make adjustments with confidence.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {levers.map((lever, i) => (
          <LeverCard key={lever.id} lever={lever} index={i} />
        ))}
      </div>
    </div>
  );
}
