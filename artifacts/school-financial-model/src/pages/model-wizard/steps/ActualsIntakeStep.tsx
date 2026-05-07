import { useFormContext } from "react-hook-form";
import { ClipboardCheck, Upload, ArrowLeftRight } from "lucide-react";
import { FormInput } from "@/components/ui/form-inputs";
import { hasActualsSeedData } from "@/lib/seed-from-actuals";

// Task #657 — Actuals Intake step.
//
// Surfaced right after Story whenever the founder picked the "actuals"
// pathway (operating school). Captures last year's six headline numbers
// (revenue, expenses, ending cash, ending enrollment, plus an optional
// breakdown by source / category) which then seed the empty Year-1 cells
// of the projection on Continue. A future task will hook in QuickBooks /
// Xero auto-pull (#407, #408) — until then the optional P&L upload field
// is a noop placeholder so we can ship the founder-visible flow today.
export function ActualsIntakeStep({ jumpToStep }: { jumpToStep?: (s: number) => void }) {
  const { watch, setValue } = useFormContext();
  const snapshot = (watch("priorYearSnapshot") as Record<string, unknown> | undefined) ?? {};
  const seeded = hasActualsSeedData(snapshot as never);

  const switchToAssumptions = () => {
    setValue("schoolProfile.wizardPathway", "assumptions", { shouldDirty: true });
    if (jumpToStep) jumpToStep(1);
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 mb-4">
          <ClipboardCheck className="h-7 w-7 text-emerald-700" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Last year's numbers
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
          You picked the operating path, so we'll start with what actually happened last year. These six numbers seed your Year-1 projection - you can refine every line on the steps that follow.
        </p>
      </div>

      <div
        data-testid="actuals-intake-form"
        className="rounded-2xl border border-border bg-card p-6 space-y-6"
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-1">The six headline numbers</h3>
          <p className="text-xs text-muted-foreground">All optional - skip any you don't have on hand and we'll leave the matching Year-1 cell blank.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormInput
            name="priorYearSnapshot.totalRevenue"
            label="1. Last-year total revenue"
            type="number"
            prefix="$"
            placeholder="0"
            helperText="Everything that came in last year - tuition, public funding, philanthropy, fundraising."
          />
          <FormInput
            name="priorYearSnapshot.totalExpenses"
            label="2. Last-year total expenses paid"
            type="number"
            prefix="$"
            placeholder="0"
            helperText="Everything that went out the door last year - cash basis is fine."
          />
          <FormInput
            name="priorYearSnapshot.endingCash"
            label="3. Cash on hand at year-end"
            type="number"
            prefix="$"
            placeholder="0"
            helperText="Combined balance across operating + savings accounts on the last day of last year."
          />
          <FormInput
            name="priorYearSnapshot.endingEnrollment"
            label="4. Ending enrollment"
            type="number"
            placeholder="0"
            helperText="Headcount on the last day of school last year."
          />
        </div>

        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-primary hover:underline">
            5 + 6. Revenue sources & expense categories (optional breakdown)
          </summary>
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">5. Where revenue came from</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput name="priorYearSnapshot.tuitionRevenue" label="Tuition & Fees" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.publicFundingRevenue" label="Public Funding" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.philanthropyRevenue" label="Philanthropy & Grants" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.otherRevenue" label="Other Revenue" type="number" prefix="$" placeholder="0" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">6. What expenses paid for</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput name="priorYearSnapshot.personnelExpenses" label="Personnel (Salaries & Benefits)" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.facilityExpenses" label="Facility & Occupancy" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.instructionalExpenses" label="Instructional & Program" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.adminExpenses" label="Admin & Operations" type="number" prefix="$" placeholder="0" />
              </div>
            </div>
          </div>
        </details>

        <div className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-3 flex items-start gap-3">
          <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">P&amp;L upload</p>
            <p className="text-xs">Drop your QuickBooks / Xero P&amp;L export on the School Details step to auto-fill these numbers. (Coming soon as a one-click pull.)</p>
          </div>
        </div>

        {seeded && (
          <div
            data-testid="actuals-intake-seed-confirmation"
            className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3"
          >
            <p className="text-sm text-emerald-800">
              <span className="font-semibold">Got it.</span> When you continue, we'll seed Year-1 enrollment, opening cash, revenue, and expenses from these numbers. You can edit any line on the steps that follow.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center">
        <button
          type="button"
          data-testid="actuals-switch-to-assumptions"
          onClick={switchToAssumptions}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary underline"
        >
          <ArrowLeftRight className="h-4 w-4" /> Switch to the assumptions path instead
        </button>
      </div>
    </div>
  );
}
