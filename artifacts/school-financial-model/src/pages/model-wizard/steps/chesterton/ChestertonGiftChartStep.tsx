import { useEffect, useMemo } from "react";
import { useFormContext, useFieldArray, useWatch } from "react-hook-form";
import { Plus, Trash2, Trophy, Users } from "lucide-react";
import { FormInput } from "@/components/ui/form-inputs";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { useOptionalAuth } from "@/lib/auth-context";
import { formatCurrency } from "@/lib/utils";
import { buildDefaultChestertonData } from "@/lib/chesterton/template";

export function ChestertonGiftChartStep() {
  const { control, setValue } = useFormContext();
  // Task #416: hide the WhyThisMatters intro from advanced founders.
  const user = useOptionalAuth()?.user ?? null;
  const guidanceLevel = (user?.guidanceLevel as "advanced" | "basics" | "extra") || "basics";
  const showCoach = guidanceLevel !== "advanced";
  // useWatch (not formContext.watch) so per-row gift edits inside the
  // useFieldArray rows trigger a live re-render of the pyramid totals —
  // same root cause as task #350.
  const goal = useWatch({ control, name: "chesterton.totalFundraisingGoal" }) as number | undefined;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "chesterton.giftChart",
  });

  useEffect(() => {
    if (fields.length === 0) {
      const defaults = buildDefaultChestertonData();
      setValue("chesterton.giftChart", defaults.giftChart, { shouldDirty: true });
    }
  }, [fields.length, setValue]);

  const rows = useWatch({ control, name: "chesterton.giftChart" }) as
    | Array<{ giftAmount?: number; numberOfGifts?: number; numberOfProspects?: number }>
    | undefined;
  const totals = useMemo(() => {
    const safe = rows || [];
    let totalGifts = 0;
    let totalProspects = 0;
    let totalRaised = 0;
    for (const r of safe) {
      const a = Number(r?.giftAmount) || 0;
      const g = Number(r?.numberOfGifts) || 0;
      const p = Number(r?.numberOfProspects) || 0;
      totalGifts += g;
      totalProspects += p;
      totalRaised += a * g;
    }
    return { totalGifts, totalProspects, totalRaised };
  }, [rows]);

  const goalNum = Number(goal) || 0;
  const goalGap = goalNum ? goalNum - totals.totalRaised : 0;
  const coveragePct = goalNum > 0 ? (totals.totalRaised / goalNum) * 100 : 0;
  const coverageBarPct = Math.max(0, Math.min(100, coveragePct));
  const coverageColor = coveragePct >= 100 ? "bg-emerald-500" : coveragePct >= 75 ? "bg-primary" : "bg-amber-500";

  return (
    <div className="space-y-8" data-testid="chesterton-gift-chart-step">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3 flex items-center gap-3">
          <Trophy className="h-8 w-8 text-primary" />
          Sample Gift Chart
        </h2>
        <p className="text-muted-foreground text-lg">
          Map the donor pyramid you'll need to hit your goal. The rule of thumb is{" "}
          <strong>3× more prospects than gifts at every level</strong>: most asks won't close, so the prospect column tells the
          recruiting team how many doors to knock on.
        </p>
      </div>

      {showCoach && (
        <WhyThisMatters
          why="A gift chart converts your fundraising goal from a single big number into a list of conversations. Lenders and board members trust schools that can answer 'where do those 5 major gifts come from?' — this step forces that answer."
          revisit="Refresh this every fall before campaign season opens."
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Goal</div>
          <div className="text-xl font-bold text-foreground mt-1">{formatCurrency(goalNum)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Pyramid Total</div>
          <div className="text-xl font-bold text-foreground mt-1">{formatCurrency(totals.totalRaised)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Gifts</div>
          <div className="text-xl font-bold text-foreground mt-1">{totals.totalGifts.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-border bg-muted/20 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Prospects</div>
          <div className="text-xl font-bold text-foreground mt-1">{totals.totalProspects.toLocaleString()}</div>
        </div>
      </div>

      {goalNum > 0 && (
        <div
          className="rounded-2xl border border-border bg-white p-4"
          data-testid="chesterton-gift-chart-coverage"
        >
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-medium text-foreground">Goal coverage</div>
            <div className="text-sm text-muted-foreground">
              <strong className="text-foreground" data-testid="chesterton-gift-chart-coverage-pct">
                {coveragePct.toFixed(0)}%
              </strong>
              {" of "}
              {formatCurrency(goalNum)}
            </div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border" aria-hidden>
            <div
              className={`h-full ${coverageColor} transition-all`}
              style={{ width: `${coverageBarPct}%` }}
            />
          </div>
        </div>
      )}

      {goalNum > 0 && Math.abs(goalGap) > 100 && (
        <div className={`rounded-2xl border p-4 text-sm ${goalGap > 0 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
          {goalGap > 0
            ? <>Your pyramid is short of goal by <strong>{formatCurrency(goalGap)}</strong>. Add larger gifts or more prospects to close the gap.</>
            : <>Your pyramid exceeds goal by <strong>{formatCurrency(-goalGap)}</strong>. You have headroom for missed asks.</>}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Pyramid Tiers (largest gifts at the top)
          </h3>
          <button
            type="button"
            data-testid="chesterton-gift-chart-add-row"
            onClick={() => append({
              id: `gift-${Date.now()}`,
              giftAmount: 0,
              numberOfGifts: 0,
              numberOfProspects: 0,
            })}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add tier
          </button>
        </div>

        <div className="space-y-2">
          {fields.map((field, index) => {
            const r = rows?.[index];
            const tierTotal = (Number(r?.giftAmount) || 0) * (Number(r?.numberOfGifts) || 0);
            return (
              <div key={field.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center rounded-xl border border-border bg-white p-3">
                <div className="sm:col-span-3">
                  <FormInput name={`chesterton.giftChart.${index}.giftAmount`} label="Gift Amount" type="number" prefix="$" />
                </div>
                <div className="sm:col-span-2">
                  <FormInput name={`chesterton.giftChart.${index}.numberOfGifts`} label="# Gifts" type="number" />
                </div>
                <div className="sm:col-span-2">
                  <FormInput name={`chesterton.giftChart.${index}.numberOfProspects`} label="# Prospects" type="number" />
                </div>
                <div className="sm:col-span-3 text-sm text-muted-foreground">
                  Total: <strong className="text-foreground">{formatCurrency(tierTotal)}</strong>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    data-testid={`chesterton-gift-chart-remove-${index}`}
                    className="inline-flex items-center gap-1 text-sm text-destructive hover:underline"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
