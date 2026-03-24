import { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import type {
  LendingLabAssessment,
  LendingLabCriterion,
  LendingLabCriterionStatus,
  PhilanthropyYearData,
} from "@workspace/api-client-react";

interface LendingLabCardProps {
  assessment: LendingLabAssessment;
  jumpToStep?: (step: number) => void;
}

const STATUS_CONFIG: Record<
  LendingLabCriterionStatus,
  {
    icon: typeof CheckCircle2;
    color: string;
    bg: string;
    dot: string;
    label: string;
  }
> = {
  pass: {
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-50",
    dot: "bg-green-500",
    label: "Pass",
  },
  warn: {
    icon: AlertCircle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    dot: "bg-amber-500",
    label: "Warning",
  },
  fail: {
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50",
    dot: "bg-red-500",
    label: "Fail",
  },
  na: {
    icon: HelpCircle,
    color: "text-gray-400",
    bg: "bg-gray-50",
    dot: "bg-gray-300",
    label: "N/A",
  },
};

function CriterionRow({
  criterion,
  jumpToStep,
}: {
  criterion: LendingLabCriterion;
  jumpToStep?: (step: number) => void;
}) {
  const [expanded, setExpanded] = useState(criterion.status === "fail" || criterion.status === "warn");
  const config = STATUS_CONFIG[criterion.status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "border rounded-xl transition-all",
        criterion.status === "fail"
          ? "border-red-200 bg-red-50/30"
          : criterion.status === "warn"
            ? "border-amber-200 bg-amber-50/30"
            : criterion.status === "na"
              ? "border-gray-200 bg-gray-50/30"
              : "border-green-200 bg-green-50/30"
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3.5 text-left"
      >
        <Icon className={cn("h-5 w-5 shrink-0", config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">
              {criterion.name}
            </span>
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded-full font-medium",
                config.bg,
                config.color
              )}
            >
              {config.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {criterion.threshold} · {criterion.actual}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 border-t border-border/40">
          <p className="text-sm text-foreground/80 leading-relaxed mt-3">
            {criterion.detail}
          </p>
          {criterion.status === "fail" &&
            criterion.jumpToStep &&
            jumpToStep && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  jumpToStep(criterion.jumpToStep!);
                }}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                Fix this <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
        </div>
      )}
    </div>
  );
}

function ExpenseAllocationBar({
  personnelPct,
  facilityPct,
  otherPct,
}: {
  personnelPct: number;
  facilityPct: number;
  otherPct: number;
}) {
  const data = [
    { name: "Personnel", value: personnelPct, target: "≤60%", color: "#4A7CB8" },
    { name: "Facilities", value: facilityPct, target: "≤20%", color: "#D97706" },
    { name: "Everything Else", value: otherPct, target: "≥20%", color: "#328555" },
  ];

  return (
    <div className="mt-4 p-4 bg-white rounded-xl border border-border/60">
      <h4 className="text-sm font-bold text-foreground mb-3">
        How Every Dollar Is Spent
      </h4>
      <div className="flex h-8 rounded-lg overflow-hidden mb-3">
        {data.map(
          (d) =>
            d.value > 0 && (
              <div
                key={d.name}
                className="flex items-center justify-center text-white text-xs font-bold transition-all"
                style={{
                  width: `${d.value}%`,
                  backgroundColor: d.color,
                  minWidth: d.value > 5 ? undefined : "2%",
                }}
              >
                {d.value >= 10 ? `${d.value}%` : ""}
              </div>
            )
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-foreground font-medium">{d.name}</span>
            <span className="text-muted-foreground">
              {d.value}% (target {d.target})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhilanthropyTrend({
  data,
}: {
  data: PhilanthropyYearData[] | undefined;
}) {
  if (!data || data.length === 0) return null;
  if (data.every((d: PhilanthropyYearData) => d.dependency === 0)) return null;

  const chartData = data.map((d: PhilanthropyYearData) => ({
    name: `Y${d.year}`,
    dependency: d.dependency,
    withinLimit: d.withinLimit,
  }));

  return (
    <div className="mt-4 p-4 bg-white rounded-xl border border-border/60">
      <h4 className="text-sm font-bold text-foreground mb-3">
        Philanthropy Dependency Trend
      </h4>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barSize={32}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              domain={[0, "auto"]}
              width={40}
            />
            <Tooltip
              formatter={(v: number) => [`${v}%`, "Dependency"]}
              contentStyle={{
                borderRadius: 8,
                fontSize: 12,
                border: "1px solid #e5e7eb",
              }}
            />
            <Bar dataKey="dependency" radius={[4, 4, 0, 0]}>
              {chartData.map((entry: { name: string; dependency: number; withinLimit: boolean }, i: number) => (
                <Cell
                  key={i}
                  fill={entry.withinLimit ? "#328555" : "#D97706"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#328555]" /> Within limit
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-[#D97706]" /> Above 25%
        </span>
      </div>
    </div>
  );
}

export function LendingLabCard({ assessment, jumpToStep }: LendingLabCardProps) {
  const isPerfect = assessment.score === 100;
  const isReady = assessment.ready;

  const borderColor = isReady ? "border-[#328555]" : "border-[#D97706]";
  const bgColor = isReady
    ? "bg-gradient-to-br from-green-50/80 to-emerald-50/40"
    : "bg-gradient-to-br from-amber-50/80 to-orange-50/40";
  const HeaderIcon = isReady ? ShieldCheck : AlertTriangle;
  const iconColor = isReady ? "text-[#328555]" : "text-[#D97706]";

  const title = isReady ? "Lending Lab Ready" : "Not Yet Lending Lab Ready";
  const subtitle = isPerfect
    ? "Your model meets all Lending Lab criteria with no flags. You're in strong shape to apply."
    : isReady
      ? "This model meets the underwriting requirements for a Building Hope Impact Fund loan application."
      : `${assessment.failCount} area${assessment.failCount > 1 ? "s" : ""} need attention before applying.`;

  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-6 shadow-sm transition-all",
        borderColor,
        bgColor
      )}
    >
      <div className="flex items-start gap-4 mb-4">
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
            isReady ? "bg-green-100" : "bg-amber-100"
          )}
        >
          {isPerfect ? (
            <Sparkles className="h-6 w-6 text-[#328555]" />
          ) : (
            <HeaderIcon className={cn("h-6 w-6", iconColor)} />
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
            {title}
            {isPerfect && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-semibold">
                100%
              </span>
            )}
          </h3>
          <p className="text-sm text-foreground/70 mt-1 leading-relaxed">
            {subtitle}
          </p>
          {isReady && (
            <p className="text-xs text-muted-foreground mt-2 italic">
              Meeting these criteria does not guarantee approval. The Lending Lab
              also evaluates your team, community need, and school model.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-foreground font-medium">
            {assessment.passCount} passed
          </span>
        </div>
        {assessment.warnCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-foreground font-medium">
              {assessment.warnCount} warning{assessment.warnCount > 1 ? "s" : ""}
            </span>
          </div>
        )}
        {assessment.failCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-foreground font-medium">
              {assessment.failCount} need{assessment.failCount > 1 ? "" : "s"}{" "}
              attention
            </span>
          </div>
        )}
        {assessment.criteriaCount < assessment.criteria.length && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
            <span className="text-foreground font-medium">
              {assessment.criteria.length - assessment.criteriaCount} not yet
              evaluated
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {assessment.criteria.map((c: LendingLabCriterion, i: number) => (
          <CriterionRow key={i} criterion={c} jumpToStep={jumpToStep} />
        ))}
      </div>

      {!isReady && (
        <p className="text-sm text-foreground/60 mt-4 italic">
          Most founders need 2–3 iterations to get here. Adjust your model and
          the assessment updates automatically.
        </p>
      )}

      {assessment.expenseAllocation && (
        <ExpenseAllocationBar
          personnelPct={assessment.expenseAllocation.personnelPct}
          facilityPct={assessment.expenseAllocation.facilityPct}
          otherPct={assessment.expenseAllocation.otherPct}
        />
      )}

      <PhilanthropyTrend data={assessment.philanthropyByYear} />

      <div className="mt-4 pt-4 border-t border-border/40">
        <p className="text-sm text-foreground/70">
          The Lending Lab loan window opens May 6.{" "}
          <a
            href="#lending-lab"
            className="inline-flex items-center gap-1 text-primary font-semibold hover:text-primary/80 transition-colors"
          >
            Learn more <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </p>
      </div>
    </div>
  );
}
