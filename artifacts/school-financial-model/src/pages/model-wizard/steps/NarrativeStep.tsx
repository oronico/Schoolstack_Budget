import { useState, useEffect, useMemo, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { useGetConsultantAnalysis } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, BookOpen, Shield, Users, TrendingUp, FileText, Pencil } from "lucide-react";
import { SectionExplainers } from "@/components/coaching/SectionExplainers";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import {
  buildSectionRollup,
  ROLLUP_SECTION_KEYS,
  type NarrativeSectionKey,
} from "@/lib/lender-narrative-rollup";

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
  // Task #658 — required coach-voice next step. Always populated by the
  // server-side emit sites and round-tripped through `persistedFlags`.
  nextStep: string;
}

function getNarrativeSections(schoolType?: string): { key: string; label: string; conversationalPrompt: string; icon: typeof Users; primary: boolean; helpText: React.ReactNode }[] { return [
  {
    key: "enrollmentStrategy",
    label: "Enrollment Strategy",
    conversationalPrompt: "How will families find out about your school?",
    icon: Users,
    primary: true,
    helpText: "How will families find out about your school? Do you have a waitlist, word-of-mouth network, or marketing plan? This is the most important part of your financial plan - it's the engine behind everything.",
  },
  {
    key: "retentionPlan",
    label: "Retention Plan",
    conversationalPrompt: "What will keep families coming back year after year?",
    icon: Shield,
    primary: true,
    helpText: "What will keep families coming back year after year? What makes your school worth staying at? Keeping families is harder than finding them - and much cheaper than replacing them.",
  },
  {
    key: "riskMitigation",
    label: "Risk Mitigation",
    conversationalPrompt: "What's your biggest worry about Year 1?",
    icon: AlertTriangle,
    primary: true,
    helpText: "What's your biggest worry about Year 1? What's your backup plan if enrollment is lower than expected? What if retention drops to 70%? What expenses could you cut without closing the school?",
  },
  {
    key: "missionAndVision",
    label: "Mission & Vision",
    conversationalPrompt: "Why does your school need to exist?",
    icon: BookOpen,
    primary: false,
    helpText: "Why does your school need to exist? What will be different for kids who attend? In a few sentences, describe what makes your school worth building.",
  },
  {
    key: "revenueAssumptions",
    label: "Revenue Assumptions",
    conversationalPrompt: "What are families paying, and why is that the right number?",
    icon: TrendingUp,
    primary: false,
    helpText: <>Walk us through your tuition pricing and any <GlossaryTerm termKey="tuition_offsets" schoolType={schoolType}>tuition offsets</GlossaryTerm> (scholarships, discounts). What are families paying and why is that the right number for your market? What's your expected <GlossaryTerm termKey="collection_rate" schoolType={schoolType}>collection rate</GlossaryTerm>?</>,
  },
  {
    key: "staffingPhilosophy",
    label: "Staffing Philosophy",
    conversationalPrompt: "How will you find and keep great teachers?",
    icon: Users,
    primary: false,
    helpText: <>How will you find and keep great teachers? What kind of team culture do you want? Why is this student-teacher ratio right for your model? How many <GlossaryTerm termKey="fte" schoolType={schoolType}>FTE</GlossaryTerm> do you plan per grade level?</>,
  },
  {
    key: "expenseAssumptions",
    label: "Expense Assumptions",
    conversationalPrompt: "Are there any costs that might surprise you?",
    icon: TrendingUp,
    primary: false,
    helpText: <>Are there any costs you expect to stay flat, decrease, or grow faster than normal? How are you handling <GlossaryTerm termKey="escalation_rate" schoolType={schoolType}>escalation</GlossaryTerm> and <GlossaryTerm termKey="depreciation" schoolType={schoolType}>depreciation</GlossaryTerm>? Explain any unusual choices.</>,
  },
  {
    key: "growthStrategy" as const,
    label: "Growth Strategy",
    conversationalPrompt: "How do you plan to grow over the next 5 years?",
    icon: TrendingUp,
    primary: false,
    helpText: "How do you plan to grow over 5 years? More students, more grades, new programs, new locations? What does success look like by Year 5?",
  },
  {
    key: "additionalContext" as const,
    label: "Additional Context",
    conversationalPrompt: "Anything else a reviewer should know?",
    icon: BookOpen,
    primary: false,
    helpText: "Anything else a board member or reviewer should know? This is your chance to share context that doesn't fit neatly into the other sections.",
  },
]; }

type NarrativeKey = string;

interface ConsultantFlag {
  field: string;
  flagType: string;
  severity: string;
  currentValue?: string;
}

interface EngineRevenueComposition {
  tuitionPct: number;
  publicPct: number;
  philanthropyPct: number;
}

interface KeyMetricData {
  name: string;
  value: string;
}

interface ConsultantEngineData {
  assumptionFlags?: ConsultantFlag[];
  revenueComposition?: EngineRevenueComposition[];
  keyMetrics?: KeyMetricData[];
}

function fmt$(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function buildPrefill(key: NarrativeKey, formValues: Record<string, unknown>, engineData?: ConsultantEngineData): string {
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

  if (key === "revenueAssumptions") {
    const revComp = engineData?.revenueComposition;
    if (revComp && revComp.length > 0) {
      const y1Rev = revComp[0];
      const sources: string[] = [];
      if (y1Rev.tuitionPct > 0) sources.push(`Tuition: ${(y1Rev.tuitionPct * 100).toFixed(0)}%`);
      if (y1Rev.publicPct > 0) sources.push(`Public funding: ${(y1Rev.publicPct * 100).toFixed(0)}%`);
      if (y1Rev.philanthropyPct > 0) sources.push(`Philanthropy: ${(y1Rev.philanthropyPct * 100).toFixed(0)}%`);
      const otherPct = 1 - y1Rev.tuitionPct - y1Rev.publicPct - y1Rev.philanthropyPct;
      if (otherPct > 0.005) sources.push(`Other: ${(otherPct * 100).toFixed(0)}%`);
      if (sources.length > 0) {
        return `Year 1 projected revenue composition: ${sources.join("; ")}.`;
      }
    }
  }

  if (key === "staffingPhilosophy") {
    const flags = engineData?.assumptionFlags;
    const ratioFlag = flags?.find(f => f.flagType === "staffing_ratio" || f.flagType === "extreme_staffing_ratio");
    if (ratioFlag?.currentValue) {
      return `Our staffing plan: ${ratioFlag.currentValue}.`;
    }
    const staffingMetric = engineData?.keyMetrics?.find(m => m.name.toLowerCase().includes("staffing") || m.name.toLowerCase().includes("staff"));
    if (staffingMetric) {
      return `Our staffing plan: ${staffingMetric.value}.`;
    }
  }

  return "";
}

export function NarrativeStep({ modelId, jumpToStep }: NarrativeStepProps) {
  const { watch, setValue, getValues, register } = useFormContext();
  const schoolType = watch("schoolProfile.schoolType");
  const NARRATIVE_SECTIONS = useMemo(() => getNarrativeSections(schoolType), [schoolType]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(getNarrativeSections().filter(s => s.primary).map(s => s.key))
  );
  const [flagResponses, setFlagResponses] = useState<Record<string, string>>({});

  const { data: consultantData, isLoading: flagsLoading } = useGetConsultantAnalysis(modelId || 0, {
    query: {
      queryKey: [`/api/models/${modelId || 0}/consultant`],
      enabled: !!modelId,
    },
  });

  const assumptionFlags: AssumptionFlag[] = (consultantData as unknown as Record<string, unknown>)?.assumptionFlags as AssumptionFlag[] || [];

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
  const inlineRationales = (narrative.inlineRationales || {}) as unknown as Record<string, string>;
  const customExpenseLabels = (formValues.customCategoryLabels || {}) as Record<string, string>;

  // Roll-up the inline rationales captured during earlier wizard steps (Task #331).
  // The result is a map of sectionKey → { text, sources }. We pre-populate any
  // section that's still empty with the concatenated rationale text, and remember
  // which sections came from inline notes so we can render the "Pulled from your
  // earlier notes" badge + back-link.
  const sectionRollups = useMemo(() => {
    const out: Partial<Record<NarrativeSectionKey, ReturnType<typeof buildSectionRollup>>> = {};
    for (const k of ROLLUP_SECTION_KEYS) {
      out[k] = buildSectionRollup(k, inlineRationales, customExpenseLabels);
    }
    return out;
  }, [inlineRationales, customExpenseLabels]);

  // Track which sections were originally populated by the rollup vs. edited
  // by the founder. We snapshot each section's rollup text the FIRST TIME it
  // becomes non-empty (vs. on first render) so async hydration of the form
  // — common because the wizard `reset()`'s the form from API data after
  // mount — doesn't leave us with a permanently-empty snapshot.
  // The snapshot is per-key and write-once: once captured, edits to the
  // textarea will not match it and the badge correctly disappears.
  const initialRollupRef = useRef<Partial<Record<NarrativeSectionKey, string>>>({});
  for (const k of ROLLUP_SECTION_KEYS) {
    if (initialRollupRef.current[k] === undefined) {
      const text = sectionRollups[k]?.text || "";
      if (text.length > 0) {
        initialRollupRef.current[k] = text;
      }
    }
  }

  // Backfill empty narrative sections from the rollup so the founder sees the
  // pulled-in text in the textarea. Re-runs whenever the rollup text changes,
  // so async hydration of the model data (the wizard `reset()`'s the form
  // after mount) still reaches us. Once a section has any user-entered text,
  // we leave it alone so we don't clobber edits.
  useEffect(() => {
    for (const k of ROLLUP_SECTION_KEYS) {
      const rollup = sectionRollups[k];
      if (!rollup || !rollup.text) continue;
      const current = (narrative[k] || "").trim();
      if (current.length === 0) {
        setValue(`budgetNarrative.${k}`, rollup.text, { shouldDirty: true });
      }
    }
    // We deliberately depend on the rollup text values (joined into a stable
    // string for hash-equality) rather than the entire `sectionRollups`
    // object, since the latter is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ROLLUP_SECTION_KEYS.map((k) => sectionRollups[k]?.text || "").join("|"), setValue]);

  // Pre-fill missionAndVision from the Story step's openingStory when it's still empty,
  // so founders don't have to rewrite their answer.
  useEffect(() => {
    const opening = (narrative.openingStory || "").trim();
    const mission = (narrative.missionAndVision || "").trim();
    if (opening && !mission) {
      setValue("budgetNarrative.missionAndVision", opening, { shouldDirty: true });
    }
    // Run once when the step mounts and we have data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // A section needs an explanation only when there's a flagged assumption tied
  // to it AND the user hasn't written enough yet. Sections with no flagged
  // items are considered complete by default — Task #331 relaxes the gating
  // so unflagged sections don't block the founder's progress.
  const sectionHasFlag = (sectionKey: string): boolean => {
    if (assumptionFlags.length === 0) return false;
    // Map narrative section keys → assumption flag prefixes/types they cover.
    // We use loose matching against `flagType` (engine taxonomy) and `field`
    // since the consultant engine's flag namespace doesn't yet have a
    // 1:1 alignment with the narrative sections.
    const matchers: Record<string, (f: AssumptionFlag) => boolean> = {
      enrollmentStrategy: (f) => /enrollment|growth/i.test(f.flagType) || /enrollment|growth/i.test(f.field),
      retentionPlan: (f) => /retention/i.test(f.flagType) || /retention/i.test(f.field),
      revenueAssumptions: (f) => /revenue|tuition|funding|philanthropy|collection/i.test(f.flagType) || /revenue|tuition|funding|philanthropy/i.test(f.field),
      staffingPhilosophy: (f) => /staff|payroll|fte/i.test(f.flagType) || /staff|payroll|fte/i.test(f.field),
      expenseAssumptions: (f) => /expense|cost|facility|occupancy|operating/i.test(f.flagType) || /expense|cost|facility|occupancy|operating/i.test(f.field),
      riskMitigation: (f) => /debt|dscr|reserve|liquidity|risk|covenant/i.test(f.flagType) || /debt|dscr|reserve|covenant/i.test(f.field),
      missionAndVision: () => false,
      growthStrategy: (f) => /growth/i.test(f.flagType) || /growth/i.test(f.field),
      additionalContext: () => false,
    };
    const matcher = matchers[sectionKey];
    if (!matcher) return false;
    return assumptionFlags.some(matcher);
  };

  const completenessStats = useMemo(() => {
    const MIN_SUBSTANTIVE_LENGTH = 20;
    // A section counts as "complete" when EITHER it has substantive narrative
    // OR it has no flagged assumption tied to it. This is the core relaxation
    // requested by Task #331 — unflagged sections are no longer required.
    const isComplete = (s: { key: string }): boolean => {
      const val = (narrative[s.key] || "").trim();
      if (val.length >= MIN_SUBSTANTIVE_LENGTH) return true;
      return !sectionHasFlag(s.key);
    };
    const completed = NARRATIVE_SECTIONS.filter(isComplete);
    const priorityTotal = NARRATIVE_SECTIONS.filter(s => s.primary).length;
    const priorityDone = NARRATIVE_SECTIONS.filter(s => s.primary && isComplete(s)).length;
    return {
      total: NARRATIVE_SECTIONS.length,
      done: completed.length,
      priorityTotal,
      priorityDone,
      pct: Math.round((completed.length / NARRATIVE_SECTIONS.length) * 100),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrative, assumptionFlags]);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 mb-4">
          <BookOpen className="h-7 w-7 text-amber-700" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Lender Narrative
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
          You already shared your school's story at the start. This is the polished version - the one lenders, board members, and grant reviewers will read alongside your numbers. We've pre-filled what we can from your earlier answers.
        </p>
      </div>

      <SectionExplainers
        section="narrative"
        schoolType={schoolType}
        schoolStage={watch("schoolProfile.schoolStage") as string | undefined}
      />

      <div className="border rounded-xl bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Narrative Completeness</span>
          </div>
          <span className={`text-sm font-bold ${completenessStats.pct === 100 ? "text-emerald-600" : completenessStats.pct >= 50 ? "text-amber-600" : "text-muted-foreground"}`}>
            {completenessStats.done}/{completenessStats.total} sections
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 mb-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${completenessStats.pct === 100 ? "bg-emerald-500" : completenessStats.pct >= 50 ? "bg-amber-500" : "bg-muted-foreground/40"}`}
            style={{ width: `${completenessStats.pct}%` }}
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Priority sections: {completenessStats.priorityDone}/{completenessStats.priorityTotal}
            {completenessStats.priorityDone === completenessStats.priorityTotal && (
              <CheckCircle2 className="inline-block ml-1 h-3 w-3 text-emerald-500" />
            )}
          </span>
        </div>
        {completenessStats.pct < 100 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {NARRATIVE_SECTIONS.map(s => {
              const filled = (narrative[s.key] || "").trim().length >= 20;
              return (
                <span
                  key={s.key}
                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${filled ? "bg-emerald-100 text-emerald-700" : s.primary ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}
                >
                  {filled ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
                  {s.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {NARRATIVE_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSections.has(section.key);
          const currentVal = narrative[section.key] || "";
          const engineDataForPrefill: ConsultantEngineData = {
            assumptionFlags: assumptionFlags as ConsultantFlag[],
            revenueComposition: (consultantData as unknown as Record<string, unknown>)?.revenueComposition as EngineRevenueComposition[] | undefined,
            keyMetrics: (consultantData as unknown as Record<string, unknown>)?.keyMetrics as KeyMetricData[] | undefined,
          };
          const prefill = buildPrefill(section.key, formValues, engineDataForPrefill);
          const rollup = sectionRollups[section.key as NarrativeSectionKey];
          const rollupSnapshot = initialRollupRef.current[section.key as NarrativeSectionKey] || "";
          // Show the "Pulled from your earlier notes" badge when (a) the
          // rollup actually contributed text and (b) the founder hasn't
          // edited it since (current value matches the snapshot we used to
          // populate the textarea on mount).
          const showRollupBadge = !!(rollup && rollup.sources.length > 0 && rollupSnapshot && currentVal.trim() === rollupSnapshot.trim());

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
                      {section.conversationalPrompt}
                    </span>
                    <span className="block text-[11px] text-muted-foreground font-normal mt-0.5">{section.label}</span>
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
                  {showRollupBadge && rollup && (
                    <div className="flex flex-wrap items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <span className="font-semibold text-emerald-800">
                        Pulled from your earlier notes
                      </span>
                      <span className="text-emerald-700">·</span>
                      <span className="text-emerald-700">
                        {rollup.sources.map((src) => src.categoryLabel).join(", ")}
                      </span>
                      {jumpToStep && rollup.sources[0] && (
                        <button
                          type="button"
                          onClick={() => jumpToStep(rollup.sources[0].sourceStep)}
                          className="ml-auto inline-flex items-center gap-1 font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900 transition-colors"
                          data-testid={`narrative-rollup-edit-${section.key}`}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit at source
                        </button>
                      )}
                    </div>
                  )}
                  {prefill && !currentVal && !rollup?.text && (
                    <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                      Suggested start: <em>{prefill}</em>
                    </p>
                  )}
                  <textarea
                    className="w-full min-h-[120px] p-3 text-sm border rounded-lg bg-background resize-y focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
                    placeholder={prefill || `${section.conversationalPrompt} Write in your own words...`}
                    data-testid={`narrative-textarea-${section.key}`}
                    {...register(`budgetNarrative.${section.key}`)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AudienceDraftsSection
        narrative={narrative}
        consultantData={consultantData as Record<string, unknown> | undefined}
        formValues={formValues}
        setValue={setValue}
        register={register}
      />

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
              We've identified assumptions that reviewers will likely question. Address each one below.
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

// ───────────────────────────────────────────────────────────────────────
// Audience-specific narrative drafts (Board / Grant / Lender). Each draft
// is auto-generated from the founder's model so they have a starting point,
// then editable inline. The framing line "draft from your model — edit
// before sending" is intentional: founders should not ship the auto-draft
// verbatim, and a reviewer should never see machine prose unedited.
// ───────────────────────────────────────────────────────────────────────

type AudienceKey = "board" | "grant" | "lender";

const AUDIENCE_DEFS: Array<{
  key: AudienceKey;
  label: string;
  helper: string;
  icon: typeof Users;
}> = [
  {
    key: "board",
    label: "Board narrative",
    helper:
      "A warmer, mission-anchored update for trustees. Frames cash, DSCR, and risks as decisions the board can help with.",
    icon: Users,
  },
  {
    key: "grant",
    label: "Grant narrative",
    helper:
      "A mission-aligned, multi-year impact framing for foundation officers and grant reviewers.",
    icon: BookOpen,
  },
  {
    key: "lender",
    label: "Lender narrative",
    helper:
      "A factual, lender-grade summary of DSCR, runway, stress results, and the next step before lender conversations.",
    icon: Shield,
  },
];

function buildAudienceDraft(
  audience: AudienceKey,
  formValues: Record<string, unknown>,
  consultantData: Record<string, unknown> | undefined,
): string {
  const sp = (formValues.schoolProfile || {}) as Record<string, unknown>;
  const en = (formValues.enrollment || {}) as Record<string, unknown>;
  const schoolName =
    (typeof sp.schoolName === "string" && sp.schoolName.trim()) ||
    "the school";
  const y1 = Number(en.year1 ?? 0) || 0;
  const y5 = Number(en.year5 ?? 0) || 0;
  const enrollmentLine =
    y1 && y5
      ? `${y1.toLocaleString()} students in Year 1, growing to ${y5.toLocaleString()} by Year 5`
      : `the enrollment trajectory in the budget`;

  const cd = (consultantData || {}) as Record<string, unknown>;
  const lenderReadiness =
    typeof cd.lenderReadiness === "string" ? cd.lenderReadiness : null;
  const biggestStrength =
    typeof cd.biggestStrength === "string" && cd.biggestStrength.trim()
      ? cd.biggestStrength
      : null;
  const biggestRisk =
    typeof cd.biggestRisk === "string" && cd.biggestRisk.trim()
      ? cd.biggestRisk
      : null;
  const explanation =
    typeof cd.lenderReadinessExplanation === "string"
      ? cd.lenderReadinessExplanation
      : null;

  const strengthLine = biggestStrength
    ? `The model's strongest point right now: ${biggestStrength}`
    : `The model documents the school's strongest planning point in the body of the budget.`;
  const riskLine = biggestRisk
    ? `The single item we'd want to address first: ${biggestRisk}`
    : `The model surfaces the watch items the team is tracking in the risk section of the budget.`;

  if (audience === "board") {
    return [
      `Trustees, this update is a snapshot of where ${schoolName} stands financially today, drawn directly from the same canonical model the dashboard and any external packet share. We are planning for ${enrollmentLine}.`,
      strengthLine + ".",
      riskLine + ". This is a board-level conversation — the team is asking for direction, not just an FYI.",
      lenderReadiness
        ? `Read against a lender's standard criteria, the plan today reads as a "${lenderReadiness}" packet. ${explanation ?? ""}`.trim()
        : `Detail on how the plan reads against the standard external review criteria is in the appendix.`,
    ].join("\n\n");
  }

  if (audience === "grant") {
    return [
      `Thank you for considering ${schoolName}. The figures below are drawn directly from the same canonical financial model the board and any lender would see, so every number ties back to a line in the budget.`,
      `Over the grant horizon we are planning for ${enrollmentLine}. Each additional seat funded by this grant translates directly into students served against the school's mission.`,
      strengthLine + ".",
      `Two stewardship matters we want to surface up front: ${biggestRisk ?? "the watch items documented in the risk section of the budget"}. The team's planned response is described in detail in the model's recommendations.`,
      `We are happy to walk through any line of the model in detail with the funder.`,
    ].join("\n\n");
  }

  // lender
  return [
    `${schoolName} is presenting this packet for lender review. The figures below are drawn from the canonical financial model that the board, dashboard, and any external review use as the single source of truth.`,
    `Enrollment plan: ${enrollmentLine}. The model's stress battery and sensitivity tables are in the body of the packet for review.`,
    strengthLine + ".",
    riskLine + ".",
    lenderReadiness
      ? `Against the standard lender battery, the model today reads as a "${lenderReadiness}" packet. ${explanation ?? ""}`.trim()
      : `The packet documents DSCR, runway, and reserve metrics in the body for direct comparison against a lender's covenants.`,
    `Recommended next step before lender conversations: address the highest-priority recommendation in the model and re-run the stress battery.`,
  ].join("\n\n");
}

// Task #745 — split a founder-edited audience draft into paragraphs the
// same way `chooseCommentaryParagraphs` in the PDF render path does
// (split on blank lines, trim, drop empties). Keeping the splitter
// identical to the server contract is what guarantees the in-app
// preview matches the actual PDF output.
function splitFounderDraft(text: string): string[] {
  return (text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function AudienceDraftsSection({
  narrative,
  consultantData,
  formValues,
  setValue,
  register,
}: {
  narrative: Record<string, string>;
  consultantData: Record<string, unknown> | undefined;
  formValues: Record<string, unknown>;
  setValue: (name: string, value: unknown, opts?: { shouldDirty?: boolean }) => void;
  register: (name: string) => Record<string, unknown>;
}) {
  const audienceDrafts = ((narrative as unknown as Record<string, unknown>)
    .audienceDrafts || {}) as Record<AudienceKey, string>;
  // Task #745 — durable per-audience flag that records "the auto-seeded
  // draft has already been written here, OR the founder has explicitly
  // reset back to the canonical-engine fallback". Either case must
  // disqualify this audience from future auto-fill so a reset doesn't
  // silently get overwritten on the next consultant refresh / remount.
  const audienceDraftsAutoFilled = ((narrative as unknown as Record<string, unknown>)
    .audienceDraftsAutoFilled || {}) as Record<AudienceKey, boolean | undefined>;

  // Auto-fill any draft that is still blank AND has never been seeded
  // before with the freshly-generated text, so the founder always sees a
  // starting point on first visit. Once a draft has been auto-filled or
  // explicitly reset by the founder, we leave it alone (write-once).
  useEffect(() => {
    for (const def of AUDIENCE_DEFS) {
      const current = (audienceDrafts[def.key] || "").trim();
      const alreadyAutoFilled = audienceDraftsAutoFilled[def.key] === true;
      if (current.length === 0 && !alreadyAutoFilled) {
        const draft = buildAudienceDraft(def.key, formValues, consultantData);
        setValue(`budgetNarrative.audienceDrafts.${def.key}`, draft, {
          shouldDirty: false,
        });
        setValue(
          `budgetNarrative.audienceDraftsAutoFilled.${def.key}`,
          true,
          { shouldDirty: false },
        );
      }
    }
    // We deliberately exclude `audienceDrafts` from deps to avoid re-running
    // on every keystroke; the consultantData / formValues identity is stable
    // enough between renders for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultantData]);

  const handleRegenerate = (key: AudienceKey) => {
    const draft = buildAudienceDraft(key, formValues, consultantData);
    setValue(`budgetNarrative.audienceDrafts.${key}`, draft, {
      shouldDirty: true,
    });
    setValue(`budgetNarrative.audienceDraftsAutoFilled.${key}`, true, {
      shouldDirty: true,
    });
  };

  // Task #745 — clears the founder draft so the PDF (and the preview
  // panel below) falls back to the canonical-engine commentary the
  // server returns. The textarea is the source of truth: blank → PDF
  // renders the engine commentary; non-blank → PDF renders the
  // founder draft. We also set the auto-filled flag to true so the
  // auto-seed effect above does NOT silently re-populate this draft on
  // the next render / consultant refresh — the reset is durable.
  const handleResetToAutoBuilt = (key: AudienceKey) => {
    setValue(`budgetNarrative.audienceDrafts.${key}`, "", {
      shouldDirty: true,
    });
    setValue(`budgetNarrative.audienceDraftsAutoFilled.${key}`, true, {
      shouldDirty: true,
    });
  };

  // Pull the canonical-engine commentaries for board / grant / lender
  // off the consultant response. These are produced by the same
  // `buildBoardCommentary` / `buildGrantCommentary` /
  // `buildLenderCommentary` helpers that the PDF render path uses, so
  // an empty audience draft renders identically here and in the PDF.
  const narrativeCommentaries =
    ((consultantData as Record<string, unknown> | undefined)?.narrativeCommentaries as
      | Record<AudienceKey, { paragraphs?: string[] } | undefined>
      | undefined) || undefined;

  return (
    <div className="space-y-4 pt-4 border-t" data-testid="audience-drafts-section">
      <div>
        <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5 text-amber-600" />
          Board, grant, and lender drafts
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          We've written a first draft from your model — edit before sending.
          Each draft uses the same canonical numbers, but the framing changes for the audience.
        </p>
      </div>

      <div className="space-y-4">
        {AUDIENCE_DEFS.map((def) => {
          const Icon = def.icon;
          return (
            <div
              key={def.key}
              className="border rounded-xl bg-card p-4 space-y-2"
              data-testid={`audience-draft-card-${def.key}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-1 text-amber-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-foreground">{def.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {def.helper}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleResetToAutoBuilt(def.key)}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2"
                    data-testid={`audience-draft-reset-${def.key}`}
                  >
                    Reset to auto-built
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRegenerate(def.key)}
                    className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2"
                    data-testid={`audience-draft-regenerate-${def.key}`}
                  >
                    Regenerate from model
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground italic">
                Draft from your model — edit before sending.
              </p>
              <textarea
                className="w-full min-h-[180px] p-3 text-sm border rounded-lg bg-background resize-y focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
                data-testid={`audience-draft-textarea-${def.key}`}
                {...(register(`budgetNarrative.audienceDrafts.${def.key}`) as Record<string, unknown>)}
              />
            </div>
          );
        })}
      </div>

      {/* Task #745 — side-by-side preview of all three audience-specific
          narratives the way each PDF will render them. Mirrors the
          server-side `chooseCommentaryParagraphs` contract: a non-blank
          founder draft wins (split on blank lines, "Edited by the
          founder" footer); a blank draft falls back to the canonical
          engine commentary (`buildBoardCommentary` / `buildGrantCommentary`
          / `buildLenderCommentary`) returned on the consultant response,
          with the canonical-engine footer note. Founders can use this
          to catch tone drift across the three audiences before exporting. */}
      <NarrativePreviewPanel
        audienceDrafts={audienceDrafts}
        narrativeCommentaries={narrativeCommentaries}
      />
    </div>
  );
}

// Task #745 — render the side-by-side preview of all three audience
// narratives. Each card renders the same paragraph layout and footer
// note the corresponding PDF will print, so the founder sees exactly
// what each audience will receive before downloading.
function NarrativePreviewPanel({
  audienceDrafts,
  narrativeCommentaries,
}: {
  audienceDrafts: Record<AudienceKey, string>;
  narrativeCommentaries:
    | Record<AudienceKey, { paragraphs?: string[] } | undefined>
    | undefined;
}) {
  return (
    <div
      className="border rounded-xl bg-muted/20 p-4 space-y-3"
      data-testid="narrative-preview-panel"
    >
      <div>
        <h4 className="font-display text-base font-bold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-amber-600" />
          Preview · what each audience will receive
        </h4>
        <p className="text-xs text-muted-foreground mt-1">
          These mirror the prose that will print in each audience's exported
          PDF. Compare across the three to catch tone drift before exporting.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {AUDIENCE_DEFS.map((def) => {
          const Icon = def.icon;
          const founderText = (audienceDrafts[def.key] || "").trim();
          const usingFounderDraft = founderText.length > 0;
          const paragraphs = usingFounderDraft
            ? splitFounderDraft(founderText)
            : narrativeCommentaries?.[def.key]?.paragraphs ?? [];

          return (
            <div
              key={def.key}
              className="border rounded-lg bg-card p-3 space-y-2 flex flex-col"
              data-testid={`narrative-preview-card-${def.key}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 text-amber-600 shrink-0" />
                  <div className="font-semibold text-sm text-foreground truncate">
                    {def.label}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    usingFounderDraft
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                  data-testid={`narrative-preview-badge-${def.key}`}
                >
                  {usingFounderDraft ? "Founder-edited" : "Auto-built"}
                </span>
              </div>

              <div className="space-y-2 flex-1">
                {paragraphs.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">
                    No prose available yet — finish your model so the engine
                    can build a fallback narrative for this audience.
                  </p>
                ) : (
                  paragraphs.map((p, i) => (
                    <p
                      key={i}
                      className="text-xs leading-relaxed text-foreground whitespace-pre-wrap"
                    >
                      {p}
                    </p>
                  ))
                )}
              </div>

              <p
                className="text-[10px] italic text-muted-foreground border-t pt-2"
                data-testid={`narrative-preview-footer-${def.key}`}
              >
                {usingFounderDraft
                  ? "Edited by the founder for this audience. Figures elsewhere in this packet are sourced from the canonical engine."
                  : "Every figure in this commentary is sourced from the same canonical engine that powers the rest of this packet."}
              </p>
            </div>
          );
        })}
      </div>
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
              <span className="block mt-1.5 text-xs text-emerald-700">
                <span className="font-semibold">Next step:</span> {flag.nextStep}
              </span>
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
