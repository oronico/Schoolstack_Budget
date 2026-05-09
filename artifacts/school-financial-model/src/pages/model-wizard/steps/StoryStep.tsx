import { useEffect, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Sparkles, BookOpen, CheckCircle2, Lightbulb, GraduationCap, ClipboardCheck, Compass, ArrowLeftRight } from "lucide-react";
import { FormInput, FormSelect } from "@/components/ui/form-inputs";
import { cn } from "@/lib/utils";
import { SCHOOL_TYPE_LABELS, getWizardPathway, type WizardPathway } from "../schema";
import { useAuth } from "@/lib/auth-context";
import { isYetToLaunch, getFounderPersona } from "@/lib/coaching/founder-persona";
// Task #594 note: structural input framing in this step (Y1 vs current,
// planning vs operating) is gated on the *model's* schoolStage. The
// `yetToLaunch` persona check below is reserved for tone-only copy
// variants (the "what happens next" onboarding blurb).
import { useModelDuration } from "@/lib/use-model-duration";
import { LaunchChecklistCard } from "@/components/wizard/LaunchChecklistCard";
import {
  GRADE_BAND_KEYS,
  GRADE_BAND_DEFAULT_RATIO,
  GRADE_KEYS,
  GRADE_LABELS,
  GRADE_DEFAULT_RATIO,
  defaultGroupingModeForSchoolType,
  type GradeBandKey,
  type GradeKey,
  type StudentGroupingMode,
} from "@/lib/revenue-defaults";

// "Your program" — the gentle, plain-English program-design sequence we
// surface in the Story step for founders who have just signed up. Bands
// map to the same `gradeBandEnrollment` / `gradeBandPerPupil` fields used
// elsewhere in the model so what the founder enters here flows through to
// enrollment + revenue without duplicate state. We ask for year-1
// enrollment + a per-band 5-year goal in this step (the per-year ramp is
// fleshed out in Enrollment).
const GRADE_BAND_OPTIONS: Array<{ key: GradeBandKey; label: string; helper: string }> = [
  { key: "toddlers", label: "Toddlers (0–2)", helper: "Infants and young toddlers" },
  { key: "preK", label: "Pre-K (3–4)", helper: "Preschool / pre-kindergarten" },
  { key: "k5", label: "Elementary (K–5)", helper: "Kindergarten through 5th grade" },
  { key: "m68", label: "Middle (6–8)", helper: "6th through 8th grade" },
  { key: "h912", label: "High (9–12)", helper: "9th through 12th grade" },
  { key: "other", label: "Other", helper: "A program that doesn't fit the bands above" },
];

const TUITION_SOURCE_OPTIONS: Array<{ key: "tuition" | "publicFunding" | "schoolChoice" | "philanthropy"; label: string; helper: string }> = [
  { key: "tuition", label: "Family tuition", helper: "Families pay you directly each year." },
  { key: "publicFunding", label: "Public funding", helper: "Per-pupil dollars from the state or district." },
  { key: "schoolChoice", label: "School choice / vouchers", helper: "ESAs, vouchers, or tax-credit scholarships." },
  { key: "philanthropy", label: "Philanthropy & grants", helper: "Donors, foundations, or fundraising events." },
];

const SCHOOL_TYPE_OPTIONS = Object.entries(SCHOOL_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const FOUNDING_QUESTIONS = [
  { value: "afford_to_open", label: "Can I afford to open?" },
  { value: "make_payroll", label: "Can I make payroll?" },
  { value: "add_program", label: "Should I add a program or grade?" },
  { value: "break_even", label: "When will I break even?" },
  { value: "evaluate_lease", label: "Should I sign this lease?" },
  { value: "students_needed", label: "How many students do I need?" },
  { value: "hire_teacher", label: "Should I hire another teacher?" },
  { value: "raise_tuition", label: "Should I raise tuition?" },
  { value: "other", label: "Something else" },
];

export function StoryStep() {
  const { watch, setValue, register } = useFormContext();
  const { user } = useAuth();
  const persona = getFounderPersona(user);
  const newComfort = persona.comfort === "new_to_budgeting";
  // Task #595 audit: kept as tone-only persona check (reviewed and confirmed
  // non-structural — see line ~1060 "what happens next" onboarding blurb).
  // Tone-only persona check, used for the generic onboarding blurb at
  // the bottom of this step. Structural framing uses `isPlanning`.
  const yetToLaunch = isYetToLaunch(user);
  // Task #594: input framing (Y1 vs current, planning vs operating
  // descriptions) follows the *model's* stage, not the founder's
  // account-wide persona. A yet_to_launch founder who marks a model
  // Already Operating must see "Students now" / "currently enrolled"
  // language; an existing founder who marks New School (Pre-Opening)
  // must see "Y1 students" / "opening year" language.
  const isOperating = watch("schoolProfile.schoolStage") === "operating_school";
  const isPlanning = !isOperating;
  // Task #657 — explicit pathway choice. Falls back to schoolStage-mapped
  // default for older models so they don't lose the framing.
  const formSnapshot = { schoolProfile: { wizardPathway: watch("schoolProfile.wizardPathway") as string | undefined, schoolStage: watch("schoolProfile.schoolStage") as string | undefined } };
  const explicitPathway = watch("schoolProfile.wizardPathway") as WizardPathway | undefined;
  const effectivePathway = getWizardPathway(formSnapshot);
  const choosePathway = (p: WizardPathway) => {
    setValue("schoolProfile.wizardPathway", p, { shouldDirty: true });
    // Sync schoolStage so the rest of the wizard (which still keys
    // existing copy off schoolStage) reads the matching default. Founder
    // can still override stage independently on the School Details step.
    const currentStage = watch("schoolProfile.schoolStage") as string | undefined;
    if (!currentStage) {
      setValue(
        "schoolProfile.schoolStage",
        p === "actuals" ? "operating_school" : "new_school",
        { shouldDirty: true },
      );
    }
  };
  // Bidirectional path switch with explicit data-preservation
  // confirmation. Switching only flips `wizardPathway` — typed-in
  // numbers (program inputs, founding questions, etc.) stay on the
  // model so founders can flip back without losing work.
  const [confirmingSwitchToActuals, setConfirmingSwitchToActuals] = useState(false);
  const confirmSwitchToActuals = () => {
    choosePathway("actuals");
    setConfirmingSwitchToActuals(false);
  };
  // Single-year mode hides the Y5 column on both the age-band and grade
  // matrices below — single-year founders shouldn't be asked for Y5
  // numbers they explicitly opted out of on the duration picker.
  const { isSingleYear } = useModelDuration();
  const openingStory = (watch("budgetNarrative.openingStory") as string) || "";
  const foundingQuestions = (watch("budgetNarrative.foundingQuestions") as string[]) || [];
  const gradeBandEnrollment = (watch("schoolProfile.gradeBandEnrollment") as
    | Partial<Record<GradeBandKey, number[]>>
    | undefined) ?? {};
  const gradeBandPerPupil = (watch("schoolProfile.gradeBandPerPupil") as
    | Partial<Record<GradeBandKey, number>>
    | undefined) ?? {};
  const gradeBandLongTermGoal = (watch("schoolProfile.gradeBandLongTermGoal") as
    | Partial<Record<GradeBandKey, number>>
    | undefined) ?? {};
  const gradeBandRatio = (watch("schoolProfile.gradeBandRatio") as
    | Partial<Record<GradeBandKey, number>>
    | undefined) ?? {};
  const otherLabel = (watch("schoolProfile.gradeBandOtherLabel") as string | undefined) ?? "";
  const sameTuition = !!watch("schoolProfile.sameTuitionForAllBands");
  const revenueSources = (watch("revenueSources") as
    | { tuition?: boolean; publicFunding?: boolean; schoolChoice?: boolean; philanthropy?: boolean }
    | undefined) ?? {};
  const studentsPerTeacher = watch("staffing.studentsPerTeacher") as number | undefined;
  const schoolType = watch("schoolProfile.schoolType") as string | undefined;
  const gradeBandActive = (watch("schoolProfile.gradeBandActive") as string[] | undefined) ?? [];
  const gradeActive = (watch("schoolProfile.gradeActive") as string[] | undefined) ?? [];
  const gradeEnrollment = (watch("schoolProfile.gradeEnrollment") as
    | Partial<Record<GradeKey, (number | null)[]>>
    | undefined) ?? {};
  const gradePerPupil = (watch("schoolProfile.gradePerPupil") as
    | Partial<Record<GradeKey, number>>
    | undefined) ?? {};
  const gradeLongTermGoal = (watch("schoolProfile.gradeLongTermGoal") as
    | Partial<Record<GradeKey, number>>
    | undefined) ?? {};
  const gradeRatio = (watch("schoolProfile.gradeRatio") as
    | Partial<Record<GradeKey, number>>
    | undefined) ?? {};

  // studentGroupingMode auto-defaults from school type if not yet set.
  const storedGroupingMode = watch("schoolProfile.studentGroupingMode") as StudentGroupingMode | undefined;
  const groupingMode: StudentGroupingMode = useMemo(
    () => storedGroupingMode ?? defaultGroupingModeForSchoolType(schoolType),
    [storedGroupingMode, schoolType],
  );
  useEffect(() => {
    if (!storedGroupingMode && schoolType) {
      setValue(
        "schoolProfile.studentGroupingMode",
        defaultGroupingModeForSchoolType(schoolType),
        { shouldDirty: false },
      );
    }
  }, [storedGroupingMode, schoolType, setValue]);

  const showBands = groupingMode === "age_bands" || groupingMode === "both";
  const showGrades = groupingMode === "grades" || groupingMode === "both";

  const toggleQuestion = (value: string) => {
    const current = new Set(foundingQuestions);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    setValue("budgetNarrative.foundingQuestions", Array.from(current), {
      shouldDirty: true,
    });
  };

  // A band is "on" iff it appears in `gradeBandActive`. Falls back to
  // checking the enrollment array for legacy models without an explicit set.
  const hasExplicitActiveSet = Array.isArray(watch("schoolProfile.gradeBandActive"));
  const isBandOn = (key: GradeBandKey) => {
    if (hasExplicitActiveSet) {
      return gradeBandActive.includes(key);
    }
    const arr = gradeBandEnrollment[key];
    return Array.isArray(arr) && arr.length > 0;
  };
  const toggleGradeBand = (key: GradeBandKey) => {
    const wasOn = isBandOn(key);
    const nextActive = wasOn
      ? gradeBandActive.filter((k) => k !== key)
      : Array.from(new Set([...gradeBandActive, key]));
    setValue("schoolProfile.gradeBandActive", nextActive, { shouldDirty: true });
    // Initialize on first activation; toggling off never clears data.
    if (!wasOn) {
      const existing = gradeBandEnrollment[key];
      if (!Array.isArray(existing) || existing.length === 0) {
        setValue(`schoolProfile.gradeBandEnrollment.${key}`, [0, 0, 0, 0, 0], { shouldDirty: true });
      }
      if (gradeBandPerPupil[key] === undefined) {
        setValue(`schoolProfile.gradeBandPerPupil.${key}`, 0, { shouldDirty: true });
      }
    }
  };

  // Year-1 enrollment per band is the first slot of the 5-year vector.
  const setBandYear1 = (key: GradeBandKey, value: number) => {
    const current = (gradeBandEnrollment[key] as number[] | undefined) ?? [0, 0, 0, 0, 0];
    const next = [...current];
    next[0] = Number.isFinite(value) ? value : 0;
    while (next.length < 5) next.push(next[next.length - 1] ?? 0);
    setValue(`schoolProfile.gradeBandEnrollment.${key}`, next, { shouldDirty: true });
  };

  // Same pattern for individual grades.
  const hasExplicitGradeSet = Array.isArray(watch("schoolProfile.gradeActive"));
  const isGradeOn = (key: GradeKey) => {
    if (hasExplicitGradeSet) return gradeActive.includes(key);
    const arr = gradeEnrollment[key];
    return Array.isArray(arr) && arr.length > 0;
  };
  const toggleGrade = (key: GradeKey) => {
    const wasOn = isGradeOn(key);
    const nextActive = wasOn
      ? gradeActive.filter((k) => k !== key)
      : Array.from(new Set([...gradeActive, key]));
    setValue("schoolProfile.gradeActive", nextActive, { shouldDirty: true });
    if (!wasOn) {
      const existing = gradeEnrollment[key];
      if (!Array.isArray(existing) || existing.length === 0) {
        setValue(`schoolProfile.gradeEnrollment.${key}`, [0, 0, 0, 0, 0], { shouldDirty: true });
      }
      if (gradePerPupil[key] === undefined) {
        setValue(`schoolProfile.gradePerPupil.${key}`, 0, { shouldDirty: true });
      }
    }
  };
  const setGradeYear1 = (key: GradeKey, value: number) => {
    const current = (gradeEnrollment[key] as (number | null)[] | undefined) ?? [0, 0, 0, 0, 0];
    const next = [...current];
    next[0] = Number.isFinite(value) ? value : 0;
    while (next.length < 5) next.push(next[next.length - 1] ?? 0);
    setValue(`schoolProfile.gradeEnrollment.${key}`, next, { shouldDirty: true });
  };
  const setGradePerPupil = (key: GradeKey, value: number) => {
    setValue(`schoolProfile.gradePerPupil.${key}`, value, { shouldDirty: true });
  };
  const setGradeRatio = (key: GradeKey, value: number | undefined) => {
    setValue(`schoolProfile.gradeRatio.${key}`, value, { shouldDirty: true });
  };

  const totalBandYear1 = GRADE_BAND_KEYS.reduce((sum, key) => {
    if (!isBandOn(key)) return sum;
    const arr = gradeBandEnrollment[key] as (number | null)[] | undefined;
    const v = arr?.[0];
    return sum + (typeof v === "number" ? v : 0);
  }, 0);
  const totalGradeYear1 = GRADE_KEYS.reduce((sum, key) => {
    if (!isGradeOn(key)) return sum;
    const arr = gradeEnrollment[key] as (number | null)[] | undefined;
    const v = arr?.[0];
    return sum + (typeof v === "number" ? v : 0);
  }, 0);
  const totalYear1 = (showBands ? totalBandYear1 : 0) + (showGrades ? totalGradeYear1 : 0);

  const activeBands = GRADE_BAND_OPTIONS.filter((opt) => isBandOn(opt.key));
  const activeGrades = GRADE_KEYS.filter((key) => isGradeOn(key));

  // "Same tuition for every band" shortcut. When toggled on, copies the
  // first non-empty band's per-pupil tuition to every active band so the
  // founder doesn't have to type the same number five times. Founders can
  // turn it back off to enter band-specific tuition again.
  const applySameTuition = (perPupil: number) => {
    const next: Partial<Record<GradeBandKey, number>> = { ...gradeBandPerPupil };
    for (const opt of activeBands) {
      next[opt.key] = perPupil;
    }
    setValue("schoolProfile.gradeBandPerPupil", next, { shouldDirty: true });
  };

  const toggleSameTuition = (on: boolean) => {
    setValue("schoolProfile.sameTuitionForAllBands", on, { shouldDirty: true });
    if (on) {
      const firstWithTuition = activeBands
        .map((opt) => gradeBandPerPupil[opt.key] ?? 0)
        .find((v) => v > 0);
      if (firstWithTuition && firstWithTuition > 0) {
        applySameTuition(firstWithTuition);
      }
    }
  };

  const setBandPerPupil = (key: GradeBandKey, value: number) => {
    if (sameTuition) {
      applySameTuition(value);
    } else {
      setValue(`schoolProfile.gradeBandPerPupil.${key}`, value, { shouldDirty: true });
    }
  };

  // Long-term (year-5) enrollment: the founder enters either a per-band goal
  // directly or a single total. When they enter a total without overriding
  // bands, we display each band's proportional share based on their year-1
  // mix so they can see what we'll grow toward.
  const longTermTotal = (watch("schoolProfile.longTermEnrollmentGoal") as number | undefined) ?? 0;
  const sumLongTermPerBand = activeBands.reduce(
    (sum, opt) => sum + (gradeBandLongTermGoal[opt.key] ?? 0),
    0,
  );
  const computeLongTermShare = (key: GradeBandKey) => {
    const explicit = gradeBandLongTermGoal[key];
    if (explicit !== undefined && explicit !== null) return explicit;
    if (longTermTotal > 0 && totalBandYear1 > 0) {
      const arr = gradeBandEnrollment[key] as (number | null)[] | undefined;
      const v = arr?.[0];
      const share = (typeof v === "number" ? v : 0) / totalBandYear1;
      return Math.round(longTermTotal * share);
    }
    return 0;
  };

  const setSource = (key: "tuition" | "publicFunding" | "schoolChoice" | "philanthropy", on: boolean) => {
    setValue(`revenueSources.${key}`, on, { shouldDirty: true });
  };

  // When the founder clears the ratio input we write `undefined` rather
  // than `0`. The schema enforces `min(1)` on `gradeBandRatio.*`, so a
  // literal zero would create avoidable validation friction the moment the
  // input is emptied. Undefined cleanly falls back to GRADE_BAND_DEFAULT_RATIO
  // for that band.
  const setBandRatio = (key: GradeBandKey, value: number | undefined) => {
    setValue(`schoolProfile.gradeBandRatio.${key}`, value, { shouldDirty: true });
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 mb-4">
          <BookOpen className="h-7 w-7 text-amber-700" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Let's start with your school's story
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
          Before we touch any numbers, tell us about the school you're building. A good budget starts with a clear story - everything else flows from there.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 flex items-start gap-3">
        <Lightbulb className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-amber-900">Why we ask this first</p>
          <p className="text-amber-800/90 mt-1 leading-relaxed">
            Lenders, authorizers, and board members read your story before they read your numbers. Putting it down in plain words now makes every number you enter later make sense - to them and to you.
          </p>
        </div>
      </div>

      {/* Task #657 — pathway prompt. Required before Continue. Drives the
          conditional Actuals Intake step + the persistent provenance
          badge in the wizard header + the dashboard / export covers. */}
      <div data-testid="pathway-prompt" className="space-y-3">
        <div>
          <label className="text-sm font-semibold text-foreground">
            Is your school already operating, or are you launching?
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            We branch the wizard around this so you start from the strongest possible footing - either last year's books or a clean planning model.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="pathway-option-actuals"
            aria-pressed={effectivePathway === "actuals"}
            onClick={() => choosePathway("actuals")}
            className={cn(
              "text-left rounded-2xl border-2 p-4 transition-all",
              effectivePathway === "actuals"
                ? "border-emerald-400 bg-emerald-50 shadow-sm"
                : "border-border bg-card hover:border-emerald-300",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4 text-emerald-700" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">We're already operating</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Start from last year's books. We'll ask six headline numbers next and use them to seed your Year-1 projection.
                </p>
              </div>
            </div>
          </button>
          <button
            type="button"
            data-testid="pathway-option-assumptions"
            aria-pressed={effectivePathway === "assumptions"}
            onClick={() => choosePathway("assumptions")}
            className={cn(
              "text-left rounded-2xl border-2 p-4 transition-all",
              effectivePathway === "assumptions"
                ? "border-sky-400 bg-sky-50 shadow-sm"
                : "border-border bg-card hover:border-sky-300",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center">
                <Compass className="h-4 w-4 text-sky-700" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">We're launching</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Build a planning model from assumptions. We'll guide you through the inputs lenders and boards expect to see.
                </p>
              </div>
            </div>
          </button>
        </div>

        {explicitPathway === "assumptions" && (
          <div
            data-testid="assumptions-framing-block"
            className="space-y-3"
          >
            {/* Task #703 — assumptions-first launch checklist replaces
                the older free-text framing block. Verbatim brief copy
                lives inside the card. */}
            <LaunchChecklistCard />
            {!confirmingSwitchToActuals ? (
              <button
                type="button"
                data-testid="assumptions-switch-to-actuals"
                onClick={() => setConfirmingSwitchToActuals(true)}
                className="inline-flex items-center gap-2 text-xs text-sky-800 hover:text-sky-900 underline"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /> Wrong path? Switch to start from last year's books instead
              </button>
            ) : (
              <div
                role="dialog"
                aria-label="Confirm path switch"
                data-testid="assumptions-switch-confirm"
                className="rounded-lg border border-sky-300 bg-white px-3 py-2.5 space-y-2"
              >
                <p className="text-xs text-foreground">
                  <span className="font-semibold">Switch to the operating path?</span>{" "}
                  Your typed-in numbers stay saved on the model - you can switch back any time without losing them.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingSwitchToActuals(false)}
                    className="rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="assumptions-switch-confirm-button"
                    onClick={confirmSwitchToActuals}
                    className="rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700"
                  >
                    Yes, switch
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <FormInput
          label="What's the name of your school?"
          name="schoolProfile.schoolName"
          placeholder="Maple Hill Microschool"
          required
        />
        <FormSelect
          label="What kind of school is this?"
          name="schoolProfile.schoolType"
          options={SCHOOL_TYPE_OPTIONS}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground" htmlFor="openingStory">
          In a sentence or two, who is this school for?
        </label>
        <p className="text-xs text-muted-foreground">
          No need to be polished - write it the way you'd describe it to a friend. You'll have a chance to refine this later in the Lender Narrative step.
        </p>
        <textarea
          id="openingStory"
          {...register("budgetNarrative.openingStory")}
          rows={4}
          className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10 resize-y"
          placeholder="We're building a small K–5 microschool for families in our neighborhood who want a project-based, mixed-age experience…"
        />
        {openingStory.trim().length > 0 && (
          <p className="text-xs text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved as you type
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-semibold text-foreground">
            What are you trying to figure out with this budget?
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            Pick as many as you like. We'll use these to highlight the parts of the model that matter most for your decisions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FOUNDING_QUESTIONS.map((q) => {
            const isSelected = foundingQuestions.includes(q.value);
            return (
              <button
                key={q.value}
                type="button"
                onClick={() => toggleQuestion(q.value)}
                className={cn(
                  "px-3.5 py-2 rounded-full text-sm font-medium border-2 transition-all",
                  isSelected
                    ? "bg-amber-100 border-amber-400 text-amber-900 shadow-sm"
                    : "bg-card border-border text-foreground/70 hover:border-amber-300 hover:text-foreground"
                )}
              >
                {isSelected && (
                  <CheckCircle2 className="inline-block mr-1.5 -mt-0.5 h-3.5 w-3.5" />
                )}
                {q.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* "Your program" - gentle plain-English program-design sequence
          (Task #302). Asks about grade bands, how the program is paid for,
          tuition per band, year-1 enrollment, long-term enrollment goal,
          and student-to-teacher ratio. The fields write to the same paths
          the rest of the wizard reads from so nothing is duplicated; this
          step just surfaces them earlier and in plainer language than the
          dedicated Profile / Enrollment / Revenue / Staffing steps. */}
      <section className="space-y-6 rounded-2xl border border-primary/15 bg-primary/5 p-5" data-testid="story-program-section">
        <div className="flex items-start gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/15 shrink-0">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-foreground">Your program</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isPlanning
                ? "Sketch out the school you're planning. Don't worry about being precise - you can refine every number later."
                : "Tell us how your program is set up today. We'll use these as the starting point for your projections."}
            </p>
          </div>
        </div>

        {/* How does the founder think about students? */}
        <div className="space-y-3" data-testid="story-grouping-mode-section">
          <p className="text-sm font-semibold text-foreground">How do you think about your students?</p>
          {newComfort ? (
            <p className="text-xs text-muted-foreground">
              Pick whichever feels natural - most microschools and learning pods think in
              age bands; charter and private schools usually think in grade levels. You can
              switch modes at any time without losing what you've already entered.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Choose grades, age bands, or both. Affects which selectors appear below.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { value: "grades" as const, label: "Grade levels", helper: "K, 1st, 2nd … 12th" },
              { value: "age_bands" as const, label: "Age bands", helper: "Toddlers, Pre-K, K-5, 6-8, 9-12" },
              { value: "both" as const, label: "Both", helper: "Mixed-age studios with grade-aligned cohorts" },
            ]).map((opt) => {
              const isOn = groupingMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("schoolProfile.studentGroupingMode", opt.value, { shouldDirty: true })}
                  data-testid={`story-grouping-mode-${opt.value}`}
                  aria-pressed={isOn}
                  className={cn(
                    "rounded-xl border-2 px-3 py-3 text-left transition-all",
                    isOn
                      ? "bg-amber-100 border-amber-400 text-amber-900 shadow-sm"
                      : "bg-card border-border text-foreground/80 hover:border-amber-300"
                  )}
                >
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    {opt.label}
                    {isOn && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.helper}</p>
                </button>
              );
            })}
          </div>
        </div>

        {showBands && (
          <div className="space-y-3" data-testid="story-bands-section">
            <p className="text-sm font-semibold text-foreground">Which age bands will you serve?</p>
            {newComfort && (
              <p className="text-xs text-muted-foreground">Pick every band you plan to enroll. You can add more later, or use "Other" if you have a unique program.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {GRADE_BAND_OPTIONS.map((opt) => {
                const isOn = isBandOn(opt.key);
                const displayLabel = opt.key === "other" && otherLabel ? otherLabel : opt.label;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleGradeBand(opt.key)}
                    data-testid={`story-grade-band-${opt.key}`}
                    aria-pressed={isOn}
                    className={cn(
                      "rounded-xl border-2 px-3 py-3 text-left transition-all",
                      isOn
                        ? "bg-amber-100 border-amber-400 text-amber-900 shadow-sm"
                        : "bg-card border-border text-foreground/80 hover:border-amber-300"
                    )}
                  >
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      {displayLabel}
                      {isOn && <CheckCircle2 className="h-3.5 w-3.5" />}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.helper}</p>
                  </button>
                );
              })}
            </div>
            {isBandOn("other") && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 space-y-1.5">
                <label className="text-xs font-semibold text-amber-900" htmlFor="story-other-band-label">
                  What do you call this program?
                </label>
                <input
                  id="story-other-band-label"
                  type="text"
                  value={otherLabel}
                  onChange={(e) => setValue("schoolProfile.gradeBandOtherLabel", e.target.value, { shouldDirty: true })}
                  placeholder="e.g. Mixed-age studio, Bridge year, Workforce track"
                  maxLength={40}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  data-testid="story-other-band-label"
                />
              </div>
            )}
          </div>
        )}

        {showGrades && (
          <div className="space-y-3" data-testid="story-grades-section">
            <p className="text-sm font-semibold text-foreground">Which grade levels will you serve?</p>
            {newComfort && (
              <p className="text-xs text-muted-foreground">
                Pick every grade you plan to enroll. We use the same default class size per
                grade (~14 K-2, ~16 3-5, ~18 middle, ~20 high) - you can override any of
                them once you've picked them.
              </p>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
              {GRADE_KEYS.map((key) => {
                const isOn = isGradeOn(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleGrade(key)}
                    data-testid={`story-grade-${key}`}
                    aria-pressed={isOn}
                    className={cn(
                      "rounded-xl border-2 px-3 py-2.5 text-center transition-all",
                      isOn
                        ? "bg-amber-100 border-amber-400 text-amber-900 shadow-sm"
                        : "bg-card border-border text-foreground/80 hover:border-amber-300"
                    )}
                  >
                    <p className="text-sm font-semibold flex items-center justify-center gap-1">
                      {GRADE_LABELS[key]}
                      {isOn && <CheckCircle2 className="h-3 w-3" />}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">How will the program be paid for?</p>
          {newComfort && (
            <p className="text-xs text-muted-foreground">Pick every source you expect to use. We'll build out the details in later steps.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TUITION_SOURCE_OPTIONS.map((opt) => {
              const isOn = !!revenueSources[opt.key];
              // Public per-pupil funding from the state is only available to
              // charter schools. Disable the toggle (and the "on" state) for
              // every other school type so we never collect contradictory
              // intent on the way into the wizard.
              const charterOnly = opt.key === "publicFunding";
              const disabled = charterOnly && schoolType !== "charter_school";
              const helper = disabled
                ? "Charter schools only - state per-pupil funding isn't available to private, microschool, or other non-charter programs."
                : opt.helper;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => !disabled && setSource(opt.key, !isOn)}
                  disabled={disabled}
                  data-testid={`story-tuition-source-${opt.key}`}
                  aria-pressed={isOn && !disabled}
                  className={cn(
                    "rounded-xl border-2 px-3 py-3 text-left transition-all",
                    isOn && !disabled
                      ? "bg-amber-100 border-amber-400 text-amber-900 shadow-sm"
                      : "bg-card border-border text-foreground/80 hover:border-amber-300",
                    disabled && "opacity-50 cursor-not-allowed hover:border-border"
                  )}
                >
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    {opt.label}
                    {isOn && !disabled && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{helper}</p>
                </button>
              );
            })}
          </div>
        </div>

        {showBands && activeBands.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-foreground">
                {isPlanning ? "Year-1 enrollment and tuition by band" : "Current enrollment and tuition by band"}
              </p>
              <label className="inline-flex items-center gap-2 text-xs text-foreground" data-testid="story-same-tuition-toggle">
                <input
                  type="checkbox"
                  checked={sameTuition}
                  onChange={(e) => toggleSameTuition(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                Same tuition for every band
              </label>
            </div>
            {newComfort && (
              <p className="text-xs text-muted-foreground">
                A best-guess number is fine - what would the program look like if you opened today?
              </p>
            )}
            <div
              className="rounded-xl border border-border bg-card divide-y divide-border"
              data-testid="story-bands-detail-section"
            >
              <div
                className={`hidden sm:grid ${isSingleYear ? "sm:grid-cols-4" : "sm:grid-cols-5"} bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground`}
              >
                <div className="text-left font-semibold px-3 py-2">Band</div>
                <div className="text-left font-semibold px-3 py-2">{isPlanning ? "Y1 students" : "Students now"}</div>
                <div className="text-left font-semibold px-3 py-2">Tuition $/yr</div>
                {!isSingleYear && (
                  <div className="text-left font-semibold px-3 py-2" data-testid="story-band-y5-header">
                    Y5 students
                  </div>
                )}
                <div className="text-left font-semibold px-3 py-2">Students / teacher</div>
              </div>
              {activeBands.map((opt) => {
                const arr = (gradeBandEnrollment[opt.key] as (number | null)[] | undefined) ?? [0, 0, 0, 0, 0];
                const year1Raw = arr[0];
                const year1 = typeof year1Raw === "number" ? year1Raw : 0;
                const perPupil = gradeBandPerPupil[opt.key] ?? 0;
                const ratioOverride = gradeBandRatio[opt.key];
                const ratioDefault = GRADE_BAND_DEFAULT_RATIO[opt.key];
                const longTermShare = computeLongTermShare(opt.key);
                const displayLabel = opt.key === "other" && otherLabel ? otherLabel : opt.label;
                const tuitionDisabled = sameTuition && activeBands[0]?.key !== opt.key;
                const year1Label = isPlanning ? "Y1 students" : "Students now";
                return (
                  <div
                    key={opt.key}
                    className={`grid grid-cols-1 ${isSingleYear ? "sm:grid-cols-4" : "sm:grid-cols-5"} gap-3 sm:gap-0 sm:items-start p-3 sm:p-0`}
                    data-testid={`story-band-detail-${opt.key}`}
                  >
                    <div className="font-medium text-foreground sm:px-3 sm:py-2 sm:whitespace-nowrap">
                      {displayLabel}
                    </div>
                    <div className="sm:px-3 sm:py-2">
                      <div
                        className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mb-1"
                        data-testid={`story-band-year1-label-${opt.key}`}
                      >
                        {year1Label}
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={year1}
                        onChange={(e) => setBandYear1(opt.key, Number(e.target.value || 0))}
                        className="w-full sm:w-24 rounded-lg border border-border px-2 py-1.5 text-sm"
                        data-testid={`story-band-year1-${opt.key}`}
                      />
                    </div>
                    <div className="sm:px-3 sm:py-2">
                      <div className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                        Tuition $/yr
                      </div>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <input
                          type="number"
                          min={0}
                          value={perPupil}
                          onChange={(e) => setBandPerPupil(opt.key, Number(e.target.value || 0))}
                          className="w-full sm:w-28 rounded-lg border border-border pl-5 pr-2 py-1.5 text-sm"
                          data-testid={`story-band-per-pupil-${opt.key}`}
                          disabled={tuitionDisabled}
                        />
                      </div>
                      {tuitionDisabled && (
                        <p className="text-[10px] text-muted-foreground mt-1">Synced from {activeBands[0]?.label}</p>
                      )}
                    </div>
                    {!isSingleYear && (
                      <div className="sm:px-3 sm:py-2">
                        <div className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                          Y5 students
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={gradeBandLongTermGoal[opt.key] ?? ""}
                          placeholder={longTermShare > 0 ? String(longTermShare) : ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setValue(
                              `schoolProfile.gradeBandLongTermGoal.${opt.key}`,
                              v === "" ? undefined : Number(v) || 0,
                              { shouldDirty: true },
                            );
                          }}
                          className="w-full sm:w-24 rounded-lg border border-border px-2 py-1.5 text-sm"
                          data-testid={`story-band-longterm-${opt.key}`}
                        />
                        {gradeBandLongTermGoal[opt.key] === undefined && longTermShare > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Default: {longTermShare}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="sm:px-3 sm:py-2">
                      <div className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                        Students / teacher
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={ratioOverride ?? ""}
                        placeholder={String(ratioDefault)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setBandRatio(opt.key, undefined);
                          } else {
                            const parsed = Number(v);
                            setBandRatio(opt.key, Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
                          }
                        }}
                        className="w-full sm:w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
                        data-testid={`story-band-ratio-${opt.key}`}
                      />
                      {ratioOverride === undefined && (
                        <p className="text-[10px] text-muted-foreground mt-1">Default: {ratioDefault}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Totals "row" — Task #520. Mirrors the row grid above so
                  it reads like a real footer on desktop while staying
                  stacked on mobile. The legacy `story-year1-total`
                  testid lives here so any existing selector that read
                  the running total keeps working. */}
              {(() => {
                const y1Sum = activeBands.reduce((sum, opt) => {
                  const arr = gradeBandEnrollment[opt.key] as (number | null)[] | undefined;
                  const v = arr?.[0];
                  return sum + (typeof v === "number" ? v : 0);
                }, 0);
                const tuitionSum = activeBands.reduce((sum, opt) => {
                  const arr = gradeBandEnrollment[opt.key] as (number | null)[] | undefined;
                  const v = arr?.[0];
                  const y1 = typeof v === "number" ? v : 0;
                  const perPupil = gradeBandPerPupil[opt.key] ?? 0;
                  return sum + y1 * perPupil;
                }, 0);
                const y5Sum = activeBands.reduce(
                  (sum, opt) => sum + computeLongTermShare(opt.key),
                  0,
                );
                const teacherCount = activeBands.reduce((sum, opt) => {
                  const arr = gradeBandEnrollment[opt.key] as (number | null)[] | undefined;
                  const v = arr?.[0];
                  const y1 = typeof v === "number" ? v : 0;
                  const ratio = gradeBandRatio[opt.key] ?? GRADE_BAND_DEFAULT_RATIO[opt.key];
                  return sum + (ratio > 0 ? y1 / ratio : 0);
                }, 0);
                const avgRatio = teacherCount > 0 ? y1Sum / teacherCount : 0;
                return (
                  <div
                    className={`grid grid-cols-1 ${isSingleYear ? "sm:grid-cols-4" : "sm:grid-cols-5"} gap-3 sm:gap-0 sm:items-start p-3 sm:p-2 bg-muted/30 text-xs font-semibold text-foreground`}
                    data-testid="story-band-totals-row"
                  >
                    <div className="sm:px-3 sm:py-1">Total</div>
                    <div className="sm:px-3 sm:py-1" data-testid="story-band-total-year1">
                      <span className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Y1 total</span>
                      <span data-testid="story-year1-total">{y1Sum}</span>
                    </div>
                    <div className="sm:px-3 sm:py-1" data-testid="story-band-total-tuition">
                      <span className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Tuition total</span>
                      ${tuitionSum.toLocaleString()}/yr
                    </div>
                    {!isSingleYear && (
                      <div className="sm:px-3 sm:py-1" data-testid="story-band-total-y5">
                        <span className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Y5 total</span>
                        {y5Sum}
                      </div>
                    )}
                    <div className="sm:px-3 sm:py-1" data-testid="story-band-total-ratio">
                      <span className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Avg ratio</span>
                      {avgRatio > 0 ? `${avgRatio.toFixed(1)} avg` : "-"}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* parallel detail card for individual grades. */}
        {showGrades && activeGrades.length > 0 && (
          <div className="space-y-3" data-testid="story-grades-detail-section">
            <p className="text-sm font-semibold text-foreground">
              {isPlanning ? "Year-1 enrollment by grade" : "Current enrollment by grade"}
            </p>
            {newComfort && (
              <p className="text-xs text-muted-foreground">
                Enter the number of students you expect in each grade. Tuition + ratio
                pre-fill from typical defaults - edit any of them as needed.
              </p>
            )}
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              <div
                className={`hidden sm:grid ${isSingleYear ? "sm:grid-cols-4" : "sm:grid-cols-5"} bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground`}
              >
                <div className="text-left font-semibold px-3 py-2">Grade</div>
                <div className="text-left font-semibold px-3 py-2">{isPlanning ? "Y1 students" : "Students now"}</div>
                <div className="text-left font-semibold px-3 py-2">Tuition $/yr</div>
                {!isSingleYear && (
                  <div className="text-left font-semibold px-3 py-2" data-testid="story-grade-y5-header">
                    Y5 students
                  </div>
                )}
                <div className="text-left font-semibold px-3 py-2">Students / teacher</div>
              </div>
              {activeGrades.map((key) => {
                const arr = (gradeEnrollment[key] as (number | null)[] | undefined) ?? [0, 0, 0, 0, 0];
                const y1Raw = arr[0];
                const y1 = typeof y1Raw === "number" ? y1Raw : 0;
                const perPupil = gradePerPupil[key] ?? 0;
                const ratioOverride = gradeRatio[key];
                const ratioDefault = GRADE_DEFAULT_RATIO[key];
                const longTermVal = gradeLongTermGoal[key];
                const year1Label = isPlanning ? "Y1 students" : "Students now";
                return (
                  <div
                    key={key}
                    className={`grid grid-cols-1 ${isSingleYear ? "sm:grid-cols-4" : "sm:grid-cols-5"} gap-3 sm:gap-0 sm:items-start p-3 sm:p-0`}
                    data-testid={`story-grade-detail-${key}`}
                  >
                    <div className="font-medium text-foreground sm:px-3 sm:py-2 sm:whitespace-nowrap">
                      {GRADE_LABELS[key]}
                    </div>
                    <div className="sm:px-3 sm:py-2">
                      <div
                        className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mb-1"
                        data-testid={`story-grade-year1-label-${key}`}
                      >
                        {year1Label}
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={y1}
                        onChange={(e) => setGradeYear1(key, Number(e.target.value || 0))}
                        className="w-full sm:w-24 rounded-lg border border-border px-2 py-1.5 text-sm"
                        data-testid={`story-grade-year1-${key}`}
                      />
                    </div>
                    <div className="sm:px-3 sm:py-2">
                      <div className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                        Tuition $/yr
                      </div>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <input
                          type="number"
                          min={0}
                          value={perPupil}
                          onChange={(e) => setGradePerPupil(key, Number(e.target.value || 0))}
                          className="w-full sm:w-28 rounded-lg border border-border pl-5 pr-2 py-1.5 text-sm"
                          data-testid={`story-grade-per-pupil-${key}`}
                        />
                      </div>
                    </div>
                    {!isSingleYear && (
                      <div className="sm:px-3 sm:py-2">
                        <div className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                          Y5 students
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={longTermVal ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setValue(
                              `schoolProfile.gradeLongTermGoal.${key}`,
                              v === "" ? undefined : Number(v) || 0,
                              { shouldDirty: true },
                            );
                          }}
                          className="w-full sm:w-24 rounded-lg border border-border px-2 py-1.5 text-sm"
                          data-testid={`story-grade-longterm-${key}`}
                        />
                      </div>
                    )}
                    <div className="sm:px-3 sm:py-2">
                      <div className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                        Students / teacher
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={ratioOverride ?? ""}
                        placeholder={String(ratioDefault)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setGradeRatio(key, undefined);
                          } else {
                            const parsed = Number(v);
                            setGradeRatio(key, Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
                          }
                        }}
                        className="w-full sm:w-20 rounded-lg border border-border px-2 py-1.5 text-sm"
                        data-testid={`story-grade-ratio-${key}`}
                      />
                      {ratioOverride === undefined && (
                        <p className="text-[10px] text-muted-foreground mt-1">Default: {ratioDefault}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Totals "row" — Task #520. Same div+grid pattern as the
                  band totals above. The legacy `story-year1-total`
                  testid lives on the grade footer only when no band
                  footer is visible to claim it (avoids duplicate ids in
                  "both" mode). */}
              {(() => {
                const y1Sum = activeGrades.reduce((sum, key) => {
                  const arr = gradeEnrollment[key] as (number | null)[] | undefined;
                  const v = arr?.[0];
                  return sum + (typeof v === "number" ? v : 0);
                }, 0);
                const tuitionSum = activeGrades.reduce((sum, key) => {
                  const arr = gradeEnrollment[key] as (number | null)[] | undefined;
                  const v = arr?.[0];
                  const y1 = typeof v === "number" ? v : 0;
                  const perPupil = gradePerPupil[key] ?? 0;
                  return sum + y1 * perPupil;
                }, 0);
                const y5Sum = activeGrades.reduce(
                  (sum, key) => sum + (gradeLongTermGoal[key] ?? 0),
                  0,
                );
                const teacherCount = activeGrades.reduce((sum, key) => {
                  const arr = gradeEnrollment[key] as (number | null)[] | undefined;
                  const v = arr?.[0];
                  const y1 = typeof v === "number" ? v : 0;
                  const ratio = gradeRatio[key] ?? GRADE_DEFAULT_RATIO[key];
                  return sum + (ratio > 0 ? y1 / ratio : 0);
                }, 0);
                const avgRatio = teacherCount > 0 ? y1Sum / teacherCount : 0;
                const claimsLegacyTestid = !(showBands && activeBands.length > 0);
                return (
                  <div
                    className={`grid grid-cols-1 ${isSingleYear ? "sm:grid-cols-4" : "sm:grid-cols-5"} gap-3 sm:gap-0 sm:items-start p-3 sm:p-2 bg-muted/30 text-xs font-semibold text-foreground`}
                    data-testid="story-grade-totals-row"
                  >
                    <div className="sm:px-3 sm:py-1">Total</div>
                    <div className="sm:px-3 sm:py-1" data-testid="story-grade-total-year1">
                      <span className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Y1 total</span>
                      {claimsLegacyTestid ? (
                        <span data-testid="story-year1-total">{y1Sum}</span>
                      ) : (
                        y1Sum
                      )}
                    </div>
                    <div className="sm:px-3 sm:py-1" data-testid="story-grade-total-tuition">
                      <span className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Tuition total</span>
                      ${tuitionSum.toLocaleString()}/yr
                    </div>
                    {!isSingleYear && (
                      <div className="sm:px-3 sm:py-1" data-testid="story-grade-total-y5">
                        <span className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Y5 total</span>
                        {y5Sum}
                      </div>
                    )}
                    <div className="sm:px-3 sm:py-1" data-testid="story-grade-total-ratio">
                      <span className="sm:hidden text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Avg ratio</span>
                      {avgRatio > 0 ? `${avgRatio.toFixed(1)} avg` : "-"}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* The matrix tfoot rows above already show per-section totals.
            We only fall back to this combined line when neither matrix is
            visible (e.g. the founder hasn't picked any grades or bands
            yet) so the running total still shows up somewhere. */}
        {totalYear1 > 0 &&
          !(showBands && activeBands.length > 0) &&
          !(showGrades && activeGrades.length > 0) && (
            <p className="text-xs text-muted-foreground" data-testid="story-year1-total">
              {isPlanning ? "That's " : "Total: "}
              <span className="font-semibold text-foreground">{totalYear1}</span>{" "}
              {isPlanning ? "students in your opening year." : "students currently enrolled."}
            </p>
          )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormInput
            name="schoolProfile.longTermEnrollmentGoal"
            label={isPlanning ? "Long-term enrollment goal (year 5, total)" : "Where do you want total enrollment in 5 years?"}
            type="number"
            placeholder="e.g. 120"
            helperText={
              newComfort
                ? "What's the size you're building toward? We split it across the bands above using your year-1 mix - you can override any band individually."
                : sumLongTermPerBand > 0
                  ? `Per-band totals already entered: ${sumLongTermPerBand}`
                  : undefined
            }
          />
          <div>
            <label className="text-sm font-semibold text-foreground" htmlFor="story-students-per-teacher">
              Default students per teacher
            </label>
            {newComfort && (
              <p className="text-xs text-muted-foreground mt-1">
                Used as a fallback when a band doesn't have its own ratio. A typical microschool runs 8–14 students per teacher; preschool / toddler programs are usually lower.
              </p>
            )}
            <input
              id="story-students-per-teacher"
              type="number"
              min={1}
              defaultValue={studentsPerTeacher ?? 12}
              onChange={(e) => setValue("staffing.studentsPerTeacher", Number(e.target.value || 0), { shouldDirty: true })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm mt-2"
              data-testid="story-students-per-teacher"
            />
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-border/60 bg-secondary/40 p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-foreground/80">
          <p className="font-semibold text-foreground">What happens next</p>
          <p className="mt-1 leading-relaxed">
            {yetToLaunch
              ? "We'll walk you through the rest in plain English - setup, enrollment, staffing, and costs. Most steps have smart defaults you can accept and refine later. You can always come back and update anything as your plans evolve."
              : "We'll walk you through the basics - your school's setup, enrollment, revenue, staffing, and expenses. Most steps have smart defaults you can accept and refine later. You can always come back and update anything as your plans evolve."}
          </p>
        </div>
      </div>
    </div>
  );
}
