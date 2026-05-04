import { useEffect, useMemo } from "react";
import { useFormContext, useFieldArray, useWatch } from "react-hook-form";
import { Plus, Trash2, BookOpen, Calculator } from "lucide-react";
import { FormInput } from "@/components/ui/form-inputs";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { useShowCoach } from "@/lib/coaching/use-show-coach";
import { formatCurrency } from "@/lib/utils";
import { buildDefaultChestertonData, avgSalaryPerPeriod } from "@/lib/chesterton/template";

const FTE_PERIODS = 5; // one Chesterton FTE = 5 periods/day per the CSN manual

export function ChestertonStaffingStep() {
  const { control, setValue } = useFormContext();
  // Task #416 / #499: shared coach-gate hook keeps every wizard step in sync.
  const { showCoach } = useShowCoach();
  // useWatch subscribes via `control` so per-row edits inside useFieldArray
  // inputs (registered with valueAsNumber) trigger a re-render of the totals.
  // Using formContext.watch() here misses those updates — see task #350/#351.
  const startingSalary = useWatch({ control, name: "chesterton.startingTeacherSalary" }) as number | undefined;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "chesterton.salarySchedule",
  });

  useEffect(() => {
    if (fields.length === 0) {
      const d = buildDefaultChestertonData();
      setValue("chesterton.salarySchedule", d.salarySchedule, { shouldDirty: true });
    }
  }, [fields.length, setValue]);

  const subjects = useWatch({ control, name: "chesterton.salarySchedule" }) as
    | Array<{ periodsPerSection?: number }>
    | undefined;
  const periodsTotal = useMemo(
    () => (subjects || []).reduce((s, r) => s + (Number(r?.periodsPerSection) || 0), 0),
    [subjects],
  );
  const perPeriod = avgSalaryPerPeriod(Number(startingSalary) || 0, FTE_PERIODS);
  const fteEquivalent = periodsTotal / FTE_PERIODS;
  const annualPayroll = perPeriod * periodsTotal;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8" data-testid="chesterton-staffing-step">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3 flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          Salary Schedule (Periods-Based)
        </h2>
        <p className="text-muted-foreground text-lg">
          Chesterton schools pay teachers per <strong>period taught</strong>, not per FTE seat. One full-time teacher
          covers 5 periods/day; a part-time teacher who covers 3 periods earns 3/5 of the same base. Set your starting
          base + step increase here, and list the subjects you'll offer.
        </p>
      </div>

      {showCoach && (
        <WhyThisMatters
          why="Most schools wildly under-budget faculty cost in Year 1 because they think 'one teacher per subject.' The CSN periods-based view forces you to budget the actual classroom hours you'll need, which scales smoothly as the school grows."
          revisit="Refresh annually before April board meeting."
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormInput
          name="chesterton.startingTeacherSalary"
          label="Starting Teacher Salary (Bachelors, FT, Yr 1)"
          type="number"
          prefix="$"
          helperText="Anchors the entire salary schedule. CSN default is $44,000."
        />
        <FormInput
          name="chesterton.benefitsFirstYearAmount"
          label="Benefits Stipend (per FTE, Yr 1)"
          type="number"
          prefix="$"
          helperText="Health/retirement contribution if any."
        />
        <div className="rounded-2xl border border-border bg-muted/30 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Calculator className="h-3 w-3" /> Avg Salary / Period
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">{formatCurrency(perPeriod)}</div>
          <div className="text-xs text-muted-foreground mt-1">{FTE_PERIODS} periods = 1 FTE</div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">Subjects & Periods per Section</h3>
          <button
            type="button"
            data-testid="chesterton-staffing-add-subject"
            onClick={() => append({
              id: `subj-${Date.now()}`,
              subject: "New Subject",
              periodsPerSection: 5,
              notes: "",
            })}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add subject
          </button>
        </div>

        <div className="space-y-2">
          {fields.map((field, index) => {
            const periods = Number(subjects?.[index]?.periodsPerSection) || 0;
            const cost = perPeriod * periods;
            return (
              <div key={field.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center rounded-xl border border-border bg-white p-3">
                <div className="sm:col-span-4"><FormInput name={`chesterton.salarySchedule.${index}.subject`} label="Subject" /></div>
                <div className="sm:col-span-2"><FormInput name={`chesterton.salarySchedule.${index}.periodsPerSection`} label="Periods" type="number" /></div>
                <div className="sm:col-span-3 text-sm text-muted-foreground">
                  Cost / Section: <strong className="text-foreground">{formatCurrency(cost)}</strong>
                </div>
                <div className="sm:col-span-2"><FormInput name={`chesterton.salarySchedule.${index}.notes`} label="Notes" /></div>
                <div className="sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    data-testid={`chesterton-staffing-remove-${index}`}
                    className="text-destructive hover:underline"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Periods / Day</div>
            <div
              className="text-xl font-bold text-foreground"
              data-testid="chesterton-staffing-periods-total"
            >
              {periodsTotal}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">FTE Equivalent</div>
            <div
              className="text-xl font-bold text-foreground"
              data-testid="chesterton-staffing-fte-equivalent"
            >
              {fteEquivalent.toFixed(1)}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Annual Faculty Payroll</div>
            <div
              className="text-xl font-bold text-foreground"
              data-testid="chesterton-staffing-annual-payroll"
            >
              {formatCurrency(annualPayroll)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
