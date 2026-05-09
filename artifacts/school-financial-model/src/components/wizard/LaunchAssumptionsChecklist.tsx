import { useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { ClipboardList } from "lucide-react";
import { FormInput } from "@/components/ui/form-inputs";

// Task #703 — Assumptions-first launch checklist for new schools.
//
// Surfaces the brief's required prompt set so a founder building a
// brand-new school is asked the early-stage realities directly:
// committed students, signed enrollment agreements, deposits collected,
// waitlist depth, applications received, projected opening month,
// Year 1 operating months, and the first month each of revenue,
// payroll, and rent will be paid. Plus pre-opening cash needs.
//
// The brief calls for these prompts to feel fundamentally different
// from operating-school actuals — projections grounded in evidence,
// not retrospective bookkeeping. The header copy is the brief's exact
// founder-facing line so a yet_to_launch founder hears the same voice
// across the wizard, exports, and Review.
//
// We reuse existing schema fields wherever they already exist
// (`enrollment.applicationsReceived`, `enrollment.waitlistCount`,
// `schoolProfile.year1OperatingMonths`, `openingBalances.cash`) so
// nothing here changes the wizard's Zod surface. The remaining
// prompts persist under a small `launchAssumptions` map on
// `schoolProfile` — typed as a permissive record so this checklist can
// ship without a schema migration; future tasks can promote individual
// fields into `schoolProfileSchema` when the engine starts reading them.

export function LaunchAssumptionsChecklist({ focused = false }: { focused?: boolean } = {}) {
  const { watch } = useFormContext();
  const stage = watch("schoolProfile.schoolStage");
  // Task #711 — when the founder arrives via the dashboard's Launch
  // readiness card (`?step=3&focus=launch-checklist`), scroll the
  // checklist into view so they don't have to hunt for it inside the
  // (long) Enrollment step.
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focused) return;
    const node = containerRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focused]);

  // Strictly new-school. Operating schools see Actuals Intake instead.
  if (stage !== "new_school") return null;

  return (
    <div
      ref={containerRef}
      data-testid="launch-assumptions-checklist"
      data-focused={focused ? "true" : undefined}
      className="rounded-2xl border border-sky-200 bg-sky-50/40 p-5 sm:p-6 space-y-5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-sky-100 p-2 flex-shrink-0">
          <ClipboardList className="h-4 w-4 text-sky-700" />
        </div>
        <div>
          <h4 className="font-display font-bold text-base text-foreground">
            Launch checklist
          </h4>
          {/* Brief's exact founder-facing line for new-school flow. */}
          <p className="text-sm text-muted-foreground mt-0.5">
            Since you do not have actuals yet, we&apos;ll ground your plan in
            what is already true today — committed students, signed
            agreements, deposits, and the first month each line of cash
            actually moves.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormInput
          name="schoolProfile.launchAssumptions.committedStudents"
          label="Committed students"
          type="number"
          placeholder="0"
          helperText="Students whose families have said yes — verbal or written."
        />
        <FormInput
          name="schoolProfile.launchAssumptions.signedEnrollmentAgreements"
          label="Signed enrollment agreements"
          type="number"
          placeholder="0"
          helperText="Countersigned, on file."
        />
        <FormInput
          name="schoolProfile.launchAssumptions.depositsCollected"
          label="Deposits collected ($)"
          type="number"
          prefix="$"
          placeholder="0"
          helperText="Total non-refundable deposit dollars in the bank."
        />
        <FormInput
          name="enrollment.waitlistCount"
          label="Waitlist"
          type="number"
          placeholder="0"
          helperText="Families behind your committed list."
        />
        <FormInput
          name="enrollment.applicationsReceived"
          label="Applications received"
          type="number"
          placeholder="0"
          helperText="Started or completed applications."
        />
        <FormInput
          name="schoolProfile.launchAssumptions.projectedOpeningMonth"
          label="Projected opening month"
          type="text"
          placeholder="e.g. Aug 2026"
          helperText="When students walk in the door."
        />
        <FormInput
          name="schoolProfile.year1OperatingMonths"
          label="Year 1 operating months"
          type="number"
          placeholder="12"
          helperText="How many months of operations Year 1 covers."
        />
        <FormInput
          name="schoolProfile.launchAssumptions.firstMonthWithRevenue"
          label="First month with revenue"
          type="text"
          placeholder="e.g. Aug 2026"
          helperText="When tuition or other revenue first hits the bank."
        />
        <FormInput
          name="schoolProfile.launchAssumptions.firstMonthWithPayroll"
          label="First month with payroll"
          type="text"
          placeholder="e.g. Jul 2026"
          helperText="When your first staff paycheck goes out."
        />
        <FormInput
          name="schoolProfile.launchAssumptions.firstMonthWithRent"
          label="First month with rent"
          type="text"
          placeholder="e.g. Jun 2026"
          helperText="When the first rent / occupancy payment is due."
        />
        <FormInput
          name="schoolProfile.launchAssumptions.preOpeningCashNeeds"
          label="Pre-opening cash needs ($)"
          type="number"
          prefix="$"
          placeholder="0"
          helperText="Cash required before doors open — deposits, build-out, hires."
        />
        <FormInput
          name="schoolProfile.launchAssumptions.startupCosts"
          label="One-time startup costs ($)"
          type="number"
          prefix="$"
          placeholder="0"
          helperText="Furniture, technology, curriculum, licensing, legal."
        />
      </div>

      <p className="text-xs text-muted-foreground">
        These figures are projections, not actuals — the wizard tags them
        as such on the Review page and in every export so a reviewer
        sees the distinction at a glance.
      </p>
    </div>
  );
}
