import { useEffect, useMemo } from "react";
import { useFormContext, useFieldArray, useWatch } from "react-hook-form";
import { Plus, Trash2, Target, HandHeart } from "lucide-react";
import { FormInput } from "@/components/ui/form-inputs";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { useOptionalAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/utils";
import { DEFAULT_CHESTERTON_FUNDRAISING, buildDefaultChestertonData } from "@/lib/chesterton/template";

export function ChestertonFundraisingStep() {
  const { control, setValue } = useFormContext();
  // Task #416: hide the WhyThisMatters intro from advanced founders.
  const user = useOptionalAuth()?.user ?? null;
  const guidanceLevel = (user?.guidanceLevel as "advanced" | "basics" | "extra") || "basics";
  const showCoach = guidanceLevel !== "advanced";
  // useWatch (not formContext.watch) so per-row goalAmount edits inside the
  // useFieldArray rows trigger a live re-render of the "Committed so far"
  // summary — see task #350.
  const planningYear = useWatch({ control, name: "chesterton.planningYear" }) as number | undefined;
  const goal = useWatch({ control, name: "chesterton.totalFundraisingGoal" }) as number | undefined;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "chesterton.fundraisingGoals",
  });

  // Seed defaults the first time the founder lands on the step.
  useEffect(() => {
    if (fields.length === 0) {
      const defaults = buildDefaultChestertonData();
      setValue("chesterton.fundraisingGoals", defaults.fundraisingGoals, { shouldDirty: true });
      if (!goal) {
        setValue("chesterton.totalFundraisingGoal", defaults.totalFundraisingGoal, { shouldDirty: true });
      }
    }
  }, [fields.length, goal, setValue]);

  const rows = useWatch({ control, name: "chesterton.fundraisingGoals" }) as
    | Array<{ goalAmount?: number }>
    | undefined;
  const computedTotal = useMemo(() => (rows || []).reduce((sum, r) => sum + (Number(r?.goalAmount) || 0), 0), [rows]);
  const goalNum = Number(goal) || 0;
  const coveragePct = goalNum > 0 ? (computedTotal / goalNum) * 100 : 0;
  const coverageBarPct = Math.max(0, Math.min(100, coveragePct));
  const coverageColor = coveragePct >= 100 ? "bg-emerald-500" : coveragePct >= 75 ? "bg-primary" : "bg-amber-500";

  return (
    <div className="space-y-8" data-testid="chesterton-fundraising-step">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3 flex items-center gap-3">
          <HandHeart className="h-8 w-8 text-primary" />
          Fundraising Campaign Goals
        </h2>
        <p className="text-muted-foreground text-lg">
          The CSN Operating Manual breaks every Chesterton launch fundraising plan into campaign components.
          Set a goal for each so your team knows what to ask, and from whom, by when.
        </p>
      </div>

      {showCoach && (
        <WhyThisMatters
          why="Chesterton schools start each year with a fundraising plan, not a wish. Splitting your goal into Major / Mid-Major / Annual Fund / Grassroots / Events makes the work concrete — and lets the gift chart math work backwards from real prospect counts."
          revisit="Update this every spring once you know what you closed and what carried into next year."
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FormInput
          name="chesterton.planningYear"
          label="Planning Year"
          type="number"
          helperText="The fall the school year begins (e.g. 2027 = 2027–28)."
        />
        <FormInput
          name="chesterton.totalFundraisingGoal"
          label="Total Fundraising Goal"
          type="number"
          prefix="$"
          helperText="Sum of all campaign component goals."
        />
        <div
          className="rounded-2xl border border-border bg-muted/30 p-4"
          data-testid="chesterton-fundraising-summary"
        >
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Committed so far</div>
          <div className="text-2xl font-bold text-foreground mt-1" data-testid="chesterton-fundraising-committed">
            {formatCurrency(computedTotal)}
          </div>
          {goalNum > 0 ? (
            <>
              <div className="text-xs text-muted-foreground mt-1">
                of <strong className="text-foreground">{formatCurrency(goalNum)}</strong> goal
                {" · "}
                <span data-testid="chesterton-fundraising-coverage-pct">{coveragePct.toFixed(0)}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border" aria-hidden>
                <div
                  className={`h-full ${coverageColor} transition-all`}
                  style={{ width: `${coverageBarPct}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground mt-1">Set a Total Fundraising Goal to track coverage.</div>
          )}
          {goalNum > 0 && Math.abs(computedTotal - goalNum) > 1 && (
            <button
              type="button"
              className="mt-2 text-xs text-primary underline"
              onClick={() => setValue("chesterton.totalFundraisingGoal", computedTotal, { shouldDirty: true })}
            >
              Sync goal to {formatCurrency(computedTotal)}
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Campaign Components
            {planningYear ? <span className="text-sm font-normal text-muted-foreground">({planningYear}–{String(planningYear + 1).slice(-2)})</span> : null}
          </h3>
          <button
            type="button"
            data-testid="chesterton-fundraising-add-row"
            onClick={() => append({
              id: `fund-${Date.now()}`,
              category: "New campaign component",
              goalAmount: 0,
              numberOfGifts: 0,
              averageGift: 0,
              notes: "",
            })}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add component
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="rounded-2xl border border-border bg-white p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormInput name={`chesterton.fundraisingGoals.${index}.category`} label="Component" />
                <FormInput name={`chesterton.fundraisingGoals.${index}.goalAmount`} label="Goal Amount" type="number" prefix="$" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormInput name={`chesterton.fundraisingGoals.${index}.numberOfGifts`} label="# of Gifts" type="number" />
                <FormInput name={`chesterton.fundraisingGoals.${index}.averageGift`} label="Avg Gift" type="number" prefix="$" />
                <FormInput name={`chesterton.fundraisingGoals.${index}.notes`} label="Notes" />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => remove(index)}
                  data-testid={`chesterton-fundraising-remove-${index}`}
                  className="inline-flex items-center gap-1 text-sm text-destructive hover:underline"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            </div>
          ))}

          {fields.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No components yet. Click "Add component" or {" "}
              <button
                type="button"
                className="text-primary underline"
                onClick={() => {
                  const defaults = buildDefaultChestertonData();
                  setValue("chesterton.fundraisingGoals", defaults.fundraisingGoals, { shouldDirty: true });
                  setValue("chesterton.totalFundraisingGoal", defaults.totalFundraisingGoal, { shouldDirty: true });
                }}
              >
                load the standard CSN template ({DEFAULT_CHESTERTON_FUNDRAISING.length} components)
              </button>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
