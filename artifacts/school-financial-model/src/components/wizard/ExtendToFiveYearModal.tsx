import { useEffect, useState } from "react";
import { X, TrendingUp, CheckCircle2, Sliders } from "lucide-react";
import type { SeedDefaults } from "@/lib/seed-five-year";
import { SEED_DEFAULTS_FALLBACK } from "@/lib/seed-five-year";

interface ExtendToFiveYearModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (overrides: SeedDefaults) => void;
  isPending?: boolean;
  /**
   * The escalation rates the seeder will use, resolved from the founder's
   * current Tuition / Facilities / Assumptions inputs (with documented
   * fallbacks). Pre-fills the editable rate inputs.
   */
  defaults?: SeedDefaults;
  /**
   * Year-1 baselines used to render the live Y1 → Y5 preview row inside the
   * modal so founders can sanity-check the curve before confirming. The
   * preview uses the same `round(y1 * (1+rate/100)^4)` formula as the
   * deterministic seeder (`escalate(y1, rate, 4)` in `seed-five-year.ts`).
   */
  y1Enrollment?: number;
  y1TuitionRevenue?: number;
}

function projectYear5(y1: number, ratePct: number): number {
  if (!y1 || y1 <= 0) return 0;
  return Math.round(y1 * Math.pow(1 + ratePct / 100, 4));
}

function formatCurrency(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `$${Math.round(n / 1_000).toLocaleString()}k`;
  }
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Confirmation modal shown when a single-year founder asks to extend to a
 * 5-year projection. Lets founders preview and override the four growth
 * assumptions (enrollment, tuition, salary, cost inflation) before the
 * Y2-Y5 backfill runs. The actual flag flip + seed is wired by the caller
 * via `onConfirm`, which receives the (possibly edited) rates.
 */
export function ExtendToFiveYearModal({
  open,
  onClose,
  onConfirm,
  isPending = false,
  defaults,
  y1Enrollment,
  y1TuitionRevenue,
}: ExtendToFiveYearModalProps) {
  const resolvedDefaults: SeedDefaults = defaults ?? SEED_DEFAULTS_FALLBACK;
  const [rates, setRates] = useState<SeedDefaults>(resolvedDefaults);

  // Re-prime the editable rates whenever the modal opens (or the resolved
  // defaults change while open) so founders always see the *current* form
  // values pre-filled, not a stale snapshot from a previous open.
  useEffect(() => {
    if (open) {
      setRates(resolvedDefaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    resolvedDefaults.enrollmentGrowthPct,
    resolvedDefaults.tuitionEscalationPct,
    resolvedDefaults.salaryEscalationPct,
    resolvedDefaults.costInflationPct,
  ]);

  if (!open) return null;

  const updateRate = (key: keyof SeedDefaults, raw: string) => {
    if (raw === "" || raw === "-") {
      setRates((r) => ({ ...r, [key]: 0 }));
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) {
      setRates((r) => ({ ...r, [key]: n }));
    }
  };

  const rateField = (
    key: keyof SeedDefaults,
    label: string,
    testId: string,
    helper: string,
  ) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="flex-1">
        <span className="block font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{helper}</span>
      </span>
      <span className="relative inline-flex items-center">
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={rates[key]}
          onChange={(e) => updateRate(key, e.target.value)}
          aria-label={label}
          data-testid={testId}
          className="w-20 px-2 py-1.5 pr-6 rounded-lg border border-input bg-background text-right text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <span className="absolute right-2 text-xs text-muted-foreground pointer-events-none">%</span>
      </span>
    </label>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extend-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-1 rounded-lg text-muted-foreground hover:bg-black/5 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <h2 id="extend-modal-title" className="font-display text-2xl font-bold text-foreground">
            Extend to a 5-year projection?
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          We'll seed Years 2&ndash;5 from your Year 1 inputs using your escalation rates,
          then drop you on the Enrollment step so you can review the ramp before continuing.
          You can edit any year afterwards.
        </p>
        <div className="rounded-xl border border-border bg-muted/30 p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Sliders className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Growth assumptions for Years 2&ndash;5</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Pre-filled from your current inputs. Edits apply to the seed and are saved back to the matching wizard fields.
          </p>
          <div className="space-y-3">
            {rateField(
              "enrollmentGrowthPct",
              "Enrollment growth",
              "extend-rate-enrollment",
              "Applied to enrollment, programs, and grade-band rosters.",
            )}
            {rateField(
              "tuitionEscalationPct",
              "Tuition escalation",
              "extend-rate-tuition",
              "Applied to tuition, fees, and tuition-offset revenue rows.",
            )}
            {rateField(
              "salaryEscalationPct",
              "Salary escalation",
              "extend-rate-salary",
              "Applied at compute time to staffing payroll.",
            )}
            {rateField(
              "costInflationPct",
              "Cost inflation",
              "extend-rate-cost",
              "Applied to expense rows and other-revenue rows.",
            )}
          </div>
          {(Boolean(y1Enrollment && y1Enrollment > 0) ||
            Boolean(y1TuitionRevenue && y1TuitionRevenue > 0)) && (
            <div
              data-testid="extend-preview"
              className="mt-4 pt-3 border-t border-border/60"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Year 1 → Year 5 preview
              </p>
              <div className="space-y-1.5 text-sm">
                {y1Enrollment && y1Enrollment > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Enrollment</span>
                    <span className="tabular-nums font-medium text-foreground">
                      <span data-testid="extend-preview-enrollment-y1">
                        {Math.round(y1Enrollment).toLocaleString()}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span data-testid="extend-preview-enrollment-y5">
                        {projectYear5(y1Enrollment, rates.enrollmentGrowthPct).toLocaleString()}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        @ {rates.enrollmentGrowthPct}%/yr
                      </span>
                    </span>
                  </div>
                ) : null}
                {y1TuitionRevenue && y1TuitionRevenue > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Tuition revenue</span>
                    <span className="tabular-nums font-medium text-foreground">
                      <span data-testid="extend-preview-tuition-y1">
                        {formatCurrency(y1TuitionRevenue)}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span data-testid="extend-preview-tuition-y5">
                        {formatCurrency(projectYear5(y1TuitionRevenue, rates.tuitionEscalationPct))}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        @ {rates.tuitionEscalationPct}%/yr
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <ul className="space-y-2 mb-6 text-sm text-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>Your Year 1 numbers stay exactly as you entered them.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>Enrollment, tuition, staffing, and expenses for Years 2&ndash;5 are derived from Year 1 using the rates above (defaults: flat enrollment, 3%/yr tuition, 3%/yr salary, 3%/yr cost inflation).</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>Any Y2&ndash;Y5 values you've already entered are preserved &mdash; only empty years get reseeded.</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <span>Lender Packet, Board Summary, and 5-year exports become available.</span>
          </li>
        </ul>
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-semibold text-muted-foreground hover:bg-black/5 transition-colors"
          >
            Stay on Single-Year
          </button>
          <button
            type="button"
            onClick={() => onConfirm(rates)}
            disabled={isPending}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isPending ? "Extending..." : "Extend to 5-Year"}
          </button>
        </div>
      </div>
    </div>
  );
}
