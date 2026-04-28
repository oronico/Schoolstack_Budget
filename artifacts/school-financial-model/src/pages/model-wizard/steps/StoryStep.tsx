import { useFormContext } from "react-hook-form";
import { Sparkles, BookOpen, CheckCircle2, Lightbulb } from "lucide-react";
import { FormInput, FormSelect } from "@/components/ui/form-inputs";
import { cn } from "@/lib/utils";
import { SCHOOL_TYPE_LABELS } from "../schema";

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
  const openingStory = (watch("budgetNarrative.openingStory") as string) || "";
  const foundingQuestions = (watch("budgetNarrative.foundingQuestions") as string[]) || [];

  const toggleQuestion = (value: string) => {
    const current = new Set(foundingQuestions);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    setValue("budgetNarrative.foundingQuestions", Array.from(current), {
      shouldDirty: true,
    });
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

      <div className="rounded-xl border border-border/60 bg-secondary/40 p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-foreground/80">
          <p className="font-semibold text-foreground">What happens next</p>
          <p className="mt-1 leading-relaxed">
            We'll walk you through the basics — your school's setup, enrollment, revenue, staffing, and expenses. Most steps have smart defaults you can accept and refine later. You can always come back and update anything as your plans evolve.
          </p>
        </div>
      </div>
    </div>
  );
}
