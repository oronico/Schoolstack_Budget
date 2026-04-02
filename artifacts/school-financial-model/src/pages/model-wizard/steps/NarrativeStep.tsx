import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { useGetConsultantAnalysis } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, BookOpen, Shield, Users, TrendingUp } from "lucide-react";

interface NarrativeStepProps {
  jumpToStep?: (step: number) => void;
  modelId: number | null;
}

interface AssumptionFlag {
  field: string;
  flagType: string;
  currentValue: string;
  benchmark: string;
  severity: "info" | "warning" | "critical";
  defaultPrompt: string;
}

const NARRATIVE_SECTIONS = [
  {
    key: "enrollmentStrategy" as const,
    label: "Enrollment Strategy",
    icon: Users,
    primary: true,
    helpText: "This is the most important part of your financial plan. How will you reach your enrollment targets? What's your marketing plan, waitlist strategy, or community pipeline?",
  },
  {
    key: "retentionPlan" as const,
    label: "Retention Plan",
    icon: Shield,
    primary: true,
    helpText: "Keeping families is harder than finding them. What will you do to maintain high retention year over year? What's your re-enrollment process?",
  },
  {
    key: "riskMitigation" as const,
    label: "Risk Mitigation",
    icon: AlertTriangle,
    primary: true,
    helpText: "What's your plan if enrollment comes in 20% below target in Year 1? What if retention drops to 70%? What expenses can you cut?",
  },
  {
    key: "missionAndVision" as const,
    label: "Mission & Vision",
    icon: BookOpen,
    primary: false,
    helpText: "In a few sentences, describe why you're starting this school and what makes it different.",
  },
  {
    key: "revenueAssumptions" as const,
    label: "Revenue Assumptions",
    icon: TrendingUp,
    primary: false,
    helpText: "Walk us through your tuition pricing. What are families paying and why is that the right number for your market?",
  },
  {
    key: "staffingPhilosophy" as const,
    label: "Staffing Philosophy",
    icon: Users,
    primary: false,
    helpText: "Describe your team structure. Why is this student-teacher ratio right for your model?",
  },
  {
    key: "expenseAssumptions" as const,
    label: "Expense Assumptions",
    icon: TrendingUp,
    primary: false,
    helpText: "Are there any costs you expect to stay flat, decrease, or grow faster than normal? Explain any unusual choices.",
  },
  {
    key: "growthStrategy" as const,
    label: "Growth Strategy",
    icon: TrendingUp,
    primary: false,
    helpText: "How do you plan to grow over 5 years? More students, more grades, new programs, new locations?",
  },
  {
    key: "additionalContext" as const,
    label: "Additional Context",
    icon: BookOpen,
    primary: false,
    helpText: "Anything else a lender or board member should know?",
  },
];

type NarrativeKey = typeof NARRATIVE_SECTIONS[number]["key"];

interface ConsultantFlag {
  field: string;
  flagType: string;
  severity: string;
  currentValue?: string;
}

function buildPrefill(key: NarrativeKey, formValues: Record<string, unknown>, consultantFlags?: ConsultantFlag[]): string {
  const enrollment = formValues.enrollment as Record<string, number> | undefined;

  if (!enrollment) return "";

  const y1 = enrollment.year1 || 0;
  const y5 = enrollment.year5 || 0;
  const retRate = enrollment.retentionRate ?? 85;

  if (key === "enrollmentStrategy" && y1 > 0) {
    const growthPct = y1 > 0 && y5 > 0 ? (((y5 / y1) ** (1 / 4) - 1) * 100).toFixed(0) : "0";
    return `We project ${y1} students in Year 1, growing to ${y5} by Year 5 (approximately ${growthPct}% annual growth).`;
  }
  if (key === "retentionPlan") {
    return `We project ${retRate}% student retention year over year.`;
  }
  if (key === "staffingPhilosophy") {
    const ratioFlag = consultantFlags?.find(f => f.flagType === "staffing_ratio" || f.flagType === "extreme_staffing_ratio");
    if (ratioFlag?.currentValue) {
      return `Our staffing plan: ${ratioFlag.currentValue}.`;
    }
  }
  return "";
}

export function NarrativeStep({ modelId }: NarrativeStepProps) {
  const { watch, setValue, getValues, register } = useFormContext();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(NARRATIVE_SECTIONS.filter(s => s.primary).map(s => s.key))
  );
  const [flagResponses, setFlagResponses] = useState<Record<string, string>>({});

  const { data: consultantData, isLoading: flagsLoading } = useGetConsultantAnalysis(modelId || 0, {
    query: {
      queryKey: [`/api/models/${modelId || 0}/consultant`],
      enabled: !!modelId,
    },
  });

  const assumptionFlags: AssumptionFlag[] = (consultantData as Record<string, unknown>)?.assumptionFlags as AssumptionFlag[] || [];

  useEffect(() => {
    const existing = getValues("assumptionFlagResponses") as Array<{ field: string; flagType: string; reason: string }> | undefined;
    if (existing && existing.length > 0) {
      const map: Record<string, string> = {};
      for (const r of existing) {
        map[`${r.flagType}:${r.field}`] = r.reason;
      }
      setFlagResponses(map);
    }
  }, [getValues]);

  const formValues = watch();
  const narrative = (formValues.budgetNarrative || {}) as Record<string, string>;

  const handleFlagResponse = (flag: AssumptionFlag, reason: string) => {
    const flagKey = `${flag.flagType}:${flag.field}`;
    const updated = { ...flagResponses, [flagKey]: reason };
    setFlagResponses(updated);

    const responses = assumptionFlags.map(f => ({
      field: f.field,
      flagType: f.flagType,
      reason: updated[`${f.flagType}:${f.field}`] || "",
    }));
    setValue("assumptionFlagResponses", responses, { shouldDirty: true });
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const criticalFlags = assumptionFlags.filter(f => f.severity === "critical");
  const warningFlags = assumptionFlags.filter(f => f.severity === "warning");
  const infoFlags = assumptionFlags.filter(f => f.severity === "info");

  const unresolvedCritical = criticalFlags.filter(f => {
    const key = `${f.flagType}:${f.field}`;
    return !flagResponses[key] || flagResponses[key].trim().length === 0;
  });

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 mb-4">
          <BookOpen className="h-7 w-7 text-amber-700" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Budget Narrative
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
          Lenders read the story before the numbers. Explain your assumptions in your own words so reviewers understand the "why" behind your financial plan.
        </p>
      </div>

      <div className="space-y-4">
        {NARRATIVE_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSections.has(section.key);
          const currentVal = narrative[section.key] || "";
          const prefill = buildPrefill(section.key, formValues, assumptionFlags as ConsultantFlag[]);

          return (
            <div
              key={section.key}
              className={`border rounded-xl overflow-hidden transition-colors ${
                section.primary
                  ? "border-amber-300 bg-amber-50/30"
                  : "border-border bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {section.primary && (
                    <div className="w-1 h-8 rounded-full bg-amber-500" />
                  )}
                  <Icon className={`h-5 w-5 ${section.primary ? "text-amber-600" : "text-muted-foreground"}`} />
                  <div>
                    <span className={`font-semibold ${section.primary ? "text-amber-900" : "text-foreground"}`}>
                      {section.label}
                    </span>
                    {section.primary && (
                      <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                        Priority
                      </span>
                    )}
                    {currentVal.trim().length > 0 && (
                      <CheckCircle2 className="inline-block ml-2 h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  <p className="text-sm text-muted-foreground">{section.helpText}</p>
                  {prefill && !currentVal && (
                    <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                      Suggested start: <em>{prefill}</em>
                    </p>
                  )}
                  <textarea
                    className="w-full min-h-[120px] p-3 text-sm border rounded-lg bg-background resize-y focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
                    placeholder={prefill || `Write about your ${section.label.toLowerCase()}...`}
                    {...register(`budgetNarrative.${section.key}`)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {flagsLoading && (
        <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Analyzing your assumptions...</span>
        </div>
      )}

      {!flagsLoading && assumptionFlags.length > 0 && (
        <div className="space-y-4">
          <div className="border-t pt-6">
            <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Flagged Assumptions
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              We've identified assumptions that lenders will likely question. Address each one below.
            </p>
          </div>

          {criticalFlags.length > 0 && (
            <div className="space-y-3">
              {criticalFlags.map((flag) => (
                <FlagCard
                  key={`${flag.flagType}:${flag.field}`}
                  flag={flag}
                  response={flagResponses[`${flag.flagType}:${flag.field}`] || ""}
                  onResponseChange={(val) => handleFlagResponse(flag, val)}
                />
              ))}
            </div>
          )}

          {warningFlags.length > 0 && (
            <div className="space-y-3">
              {warningFlags.map((flag) => (
                <FlagCard
                  key={`${flag.flagType}:${flag.field}`}
                  flag={flag}
                  response={flagResponses[`${flag.flagType}:${flag.field}`] || ""}
                  onResponseChange={(val) => handleFlagResponse(flag, val)}
                />
              ))}
            </div>
          )}

          {infoFlags.length > 0 && (
            <div className="space-y-3">
              {infoFlags.map((flag) => (
                <FlagCard
                  key={`${flag.flagType}:${flag.field}`}
                  flag={flag}
                  response={flagResponses[`${flag.flagType}:${flag.field}`] || ""}
                  onResponseChange={(val) => handleFlagResponse(flag, val)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!flagsLoading && assumptionFlags.length === 0 && (
        <div className="text-center py-6 border rounded-xl bg-emerald-50/50 border-emerald-200">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="font-medium text-emerald-800">No unusual assumptions detected</p>
          <p className="text-sm text-emerald-600">Your model's assumptions are within normal ranges.</p>
        </div>
      )}

      {unresolvedCritical.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">
              {unresolvedCritical.length} critical assumption{unresolvedCritical.length > 1 ? "s" : ""} need{unresolvedCritical.length === 1 ? "s" : ""} explanation before export
            </p>
            <p className="text-sm text-red-600 mt-1">
              Address the critical flags above to proceed to the Export step.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FlagCard({
  flag,
  response,
  onResponseChange,
}: {
  flag: AssumptionFlag;
  response: string;
  onResponseChange: (val: string) => void;
}) {
  const severityStyles = {
    critical: {
      border: "border-red-300",
      bg: "bg-red-50/50",
      badge: "bg-red-100 text-red-700",
      indicator: "bg-red-500",
      label: "Critical",
    },
    warning: {
      border: "border-amber-300",
      bg: "bg-amber-50/30",
      badge: "bg-amber-100 text-amber-700",
      indicator: "bg-amber-500",
      label: "Warning",
    },
    info: {
      border: "border-blue-200",
      bg: "bg-blue-50/30",
      badge: "bg-blue-100 text-blue-700",
      indicator: "bg-blue-500",
      label: "Info",
    },
  };

  const style = severityStyles[flag.severity];
  const isResolved = response.trim().length > 0;
  const isRequired = flag.severity === "critical" || flag.severity === "warning";

  return (
    <div className={`border rounded-xl p-4 ${style.border} ${style.bg}`}>
      <div className="flex items-start gap-3">
        <div className={`w-1.5 h-10 rounded-full ${style.indicator} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
              {style.label}
            </span>
            {isResolved && (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
          </div>
          <p className="text-sm font-medium text-foreground">{flag.currentValue}</p>
          <p className="text-xs text-muted-foreground">
            Benchmark: {flag.benchmark}
          </p>
          <div className="mt-2">
            <label className="text-sm text-muted-foreground block mb-1">
              {flag.defaultPrompt}
              {isRequired && !isResolved && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <textarea
              className="w-full min-h-[80px] p-2 text-sm border rounded-lg bg-background resize-y focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              placeholder="Explain your reasoning..."
              value={response}
              onChange={(e) => onResponseChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
