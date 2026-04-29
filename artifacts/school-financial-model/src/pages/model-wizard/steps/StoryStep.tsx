import { useFormContext } from "react-hook-form";
import { Sparkles, BookOpen, CheckCircle2, Lightbulb, GraduationCap } from "lucide-react";
import { FormInput, FormSelect } from "@/components/ui/form-inputs";
import { cn } from "@/lib/utils";
import { SCHOOL_TYPE_LABELS } from "../schema";
import { useAuth } from "@/lib/auth-context";
import { isYetToLaunch, getFounderPersona } from "@/lib/coaching/founder-persona";
import { GRADE_BAND_KEYS, GRADE_BAND_DEFAULT_RATIO, type GradeBandKey } from "@/lib/revenue-defaults";

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
  const yetToLaunch = isYetToLaunch(user);
  const newComfort = persona.comfort === "new_to_budgeting";
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

  const toggleQuestion = (value: string) => {
    const current = new Set(foundingQuestions);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    setValue("budgetNarrative.foundingQuestions", Array.from(current), {
      shouldDirty: true,
    });
  };

  // Toggle a grade band on or off. Turning a band on initializes its
  // 5-year enrollment vector + per-pupil tuition to zero so downstream
  // revenue/enrollment calcs pick up the band immediately. Turning it off
  // resets the vector + per-pupil to undefined so the model behaves as if
  // the band was never selected.
  const isBandOn = (key: GradeBandKey) => {
    const arr = gradeBandEnrollment[key];
    return Array.isArray(arr) && arr.length > 0;
  };
  const toggleGradeBand = (key: GradeBandKey) => {
    const wasOn = isBandOn(key);
    const nextEnrollment = { ...gradeBandEnrollment } as Partial<Record<GradeBandKey, number[]>>;
    const nextPerPupil = { ...gradeBandPerPupil } as Partial<Record<GradeBandKey, number>>;
    if (wasOn) {
      nextEnrollment[key] = [];
      nextPerPupil[key] = undefined;
    } else {
      nextEnrollment[key] = [0, 0, 0, 0, 0];
      nextPerPupil[key] = nextPerPupil[key] ?? 0;
    }
    setValue("schoolProfile.gradeBandEnrollment", nextEnrollment, { shouldDirty: true });
    setValue("schoolProfile.gradeBandPerPupil", nextPerPupil, { shouldDirty: true });
  };

  // Year-1 enrollment per band is the first slot of the 5-year vector.
  const setBandYear1 = (key: GradeBandKey, value: number) => {
    const current = (gradeBandEnrollment[key] as number[] | undefined) ?? [0, 0, 0, 0, 0];
    const next = [...current];
    next[0] = Number.isFinite(value) ? value : 0;
    while (next.length < 5) next.push(next[next.length - 1] ?? 0);
    setValue(`schoolProfile.gradeBandEnrollment.${key}`, next, { shouldDirty: true });
  };

  const totalYear1 = GRADE_BAND_KEYS.reduce((sum, key) => {
    const arr = gradeBandEnrollment[key] as number[] | undefined;
    return sum + (arr?.[0] ?? 0);
  }, 0);

  const activeBands = GRADE_BAND_OPTIONS.filter((opt) => isBandOn(opt.key));

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
    if (longTermTotal > 0 && totalYear1 > 0) {
      const arr = gradeBandEnrollment[key] as number[] | undefined;
      const share = (arr?.[0] ?? 0) / totalYear1;
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
          Before we touch any numbers, tell us about the school you're building. A good budget starts with a clear story — everything else flows from there.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 flex items-start gap-3">
        <Lightbulb className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold text-amber-900">Why we ask this first</p>
          <p className="text-amber-800/90 mt-1 leading-relaxed">
            Lenders, authorizers, and board members read your story before they read your numbers. Putting it down in plain words now makes every number you enter later make sense — to them and to you.
          </p>
        </div>
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
          No need to be polished — write it the way you'd describe it to a friend. You'll have a chance to refine this later in the Lender Narrative step.
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

      {/* "Your program" — gentle plain-English program-design sequence
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
              {yetToLaunch
                ? "Sketch out the school you're planning. Don't worry about being precise — you can refine every number later."
                : "Tell us how your program is set up today. We'll use these as the starting point for your projections."}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">Which age or grade bands will you serve?</p>
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

        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">How will the program be paid for?</p>
          {newComfort && (
            <p className="text-xs text-muted-foreground">Pick every source you expect to use. We'll build out the details in later steps.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TUITION_SOURCE_OPTIONS.map((opt) => {
              const isOn = !!revenueSources[opt.key];
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSource(opt.key, !isOn)}
                  data-testid={`story-tuition-source-${opt.key}`}
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

        {activeBands.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-foreground">
                {yetToLaunch ? "Year-1 enrollment and tuition by band" : "Current enrollment and tuition by band"}
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
                A best-guess number is fine — what would the program look like if you opened today?
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeBands.map((opt) => {
                const arr = (gradeBandEnrollment[opt.key] as number[] | undefined) ?? [0, 0, 0, 0, 0];
                const year1 = arr[0] ?? 0;
                const perPupil = gradeBandPerPupil[opt.key] ?? 0;
                const ratioOverride = gradeBandRatio[opt.key];
                const ratioDefault = GRADE_BAND_DEFAULT_RATIO[opt.key];
                const longTermShare = computeLongTermShare(opt.key);
                const displayLabel = opt.key === "other" && otherLabel ? otherLabel : opt.label;
                return (
                  <div
                    key={opt.key}
                    className="rounded-xl border border-border bg-card px-3 py-3 space-y-3"
                    data-testid={`story-band-detail-${opt.key}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{displayLabel}</p>
                    <div>
                      <label className="text-xs text-muted-foreground">{yetToLaunch ? "Year-1 students" : "Students this year"}</label>
                      <input
                        type="number"
                        min={0}
                        value={year1}
                        onChange={(e) => setBandYear1(opt.key, Number(e.target.value || 0))}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm mt-1"
                        data-testid={`story-band-year1-${opt.key}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Tuition per student / year</label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <input
                          type="number"
                          min={0}
                          value={perPupil}
                          onChange={(e) => setBandPerPupil(opt.key, Number(e.target.value || 0))}
                          className="w-full rounded-lg border border-border pl-6 pr-3 py-2 text-sm"
                          data-testid={`story-band-per-pupil-${opt.key}`}
                          disabled={sameTuition && activeBands[0]?.key !== opt.key}
                        />
                      </div>
                      {sameTuition && activeBands[0]?.key !== opt.key && (
                        <p className="text-[10px] text-muted-foreground mt-1">Synced from {activeBands[0]?.label}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Year-5 students</label>
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
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm mt-1"
                        data-testid={`story-band-longterm-${opt.key}`}
                      />
                      {gradeBandLongTermGoal[opt.key] === undefined && longTermShare > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Default: {longTermShare} (proportional to year-1 mix)
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Students per teacher</label>
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
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm mt-1"
                        data-testid={`story-band-ratio-${opt.key}`}
                      />
                      {ratioOverride === undefined && (
                        <p className="text-[10px] text-muted-foreground mt-1">Default for this band: {ratioDefault} students per teacher</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {totalYear1 > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="story-year1-total">
                {yetToLaunch ? "That's " : "Total: "}
                <span className="font-semibold text-foreground">{totalYear1}</span>{" "}
                {yetToLaunch ? "students in your opening year." : "students currently enrolled."}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormInput
            name="schoolProfile.longTermEnrollmentGoal"
            label={yetToLaunch ? "Long-term enrollment goal (year 5, total)" : "Where do you want total enrollment in 5 years?"}
            type="number"
            placeholder="e.g. 120"
            helperText={
              newComfort
                ? "What's the size you're building toward? We split it across the bands above using your year-1 mix — you can override any band individually."
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
              ? "We'll walk you through the rest in plain English — setup, enrollment, staffing, and costs. Most steps have smart defaults you can accept and refine later. You can always come back and update anything as your plans evolve."
              : "We'll walk you through the basics — your school's setup, enrollment, revenue, staffing, and expenses. Most steps have smart defaults you can accept and refine later. You can always come back and update anything as your plans evolve."}
          </p>
        </div>
      </div>
    </div>
  );
}
