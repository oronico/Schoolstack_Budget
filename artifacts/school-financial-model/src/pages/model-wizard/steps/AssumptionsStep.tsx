import { useFormContext } from "react-hook-form";
import { useMemo } from "react";
import { Lightbulb, TrendingUp, Users, Building2, Calendar, DollarSign, RotateCcw, MapPin, Info, Landmark, GraduationCap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStateFundingConfig, type SchoolType } from "@/lib/state-funding-data";
import {
  ENROLLMENT_REVENUE_METHOD_LABELS,
  CHARTER_DEPOSIT_TIMING_LABELS,
  type EnrollmentRevenueMethod,
  type CharterDepositTiming,
} from "@/lib/revenue-defaults";
import type { FullModelData } from "../schema";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const DEFAULTS = {
  annualSalaryIncrease: 3,
  generalCostInflation: 3,
  annualRentIncrease: 3,
  benefitsRate: 25,
  payrollTaxRate: 10,
  retentionRate: 85,
  tuitionEscalationRate: 3,
};

function AssumptionField({
  label,
  name,
  suffix,
  prefix,
  defaultValue,
  usageNote,
  placeholder,
  type = "number",
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  suffix?: string;
  prefix?: string;
  defaultValue?: number;
  usageNote: string;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const { watch, setValue } = useFormContext();
  const value = watch(name);
  const isModified = defaultValue !== undefined && value !== undefined && value !== null && value !== defaultValue;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-semibold text-foreground">{label}</label>
        {isModified && (
          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            default: {prefix}{defaultValue}{suffix}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {prefix && <span className="text-sm text-muted-foreground font-medium">{prefix}</span>}
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setValue(name, isNaN(val) ? undefined : val, { shouldDirty: true });
          }}
          className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          placeholder={placeholder || String(defaultValue ?? "")}
          min={min}
          max={max}
          step={step}
        />
        {suffix && <span className="text-sm text-muted-foreground font-medium">{suffix}</span>}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{usageNote}</p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  onReset,
  resetLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onReset?: () => void;
  resetLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-xl mt-0.5 flex-shrink-0">{icon}</div>
        <div>
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors whitespace-nowrap mt-1"
        >
          <RotateCcw className="h-3 w-3" />
          {resetLabel || "Reset to defaults"}
        </button>
      )}
    </div>
  );
}

function InfoBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-200/60 p-3.5">
      <Info className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-slate-600 leading-relaxed">{children}</p>
    </div>
  );
}

export function AssumptionsStep() {
  const { watch, setValue } = useFormContext<FullModelData>();

  const schoolType = watch("schoolProfile.schoolType") as SchoolType | undefined;
  const stateCode = watch("schoolProfile.state") as string || "";
  const fundingProfile = watch("schoolProfile.fundingProfile") || "tuition_based";
  const isCharter = schoolType === "charter_school";
  const isTuitionBased = fundingProfile === "tuition_based" || fundingProfile === "hybrid_mixed";

  const stateFundingConfig = useMemo(
    () => getStateFundingConfig(schoolType as SchoolType, stateCode),
    [stateCode, schoolType]
  );

  const fiscalYearStartMonth = watch("schoolProfile.fiscalYearStartMonth") || 7;
  const isPartialFirstYear = watch("schoolProfile.isPartialFirstYear") || false;
  const year1OperatingMonths = watch("schoolProfile.year1OperatingMonths") || 12;
  const schoolStage = watch("schoolProfile.schoolStage") || "new_school";

  const resetCostEscalation = () => {
    setValue("facilities.annualSalaryIncrease", DEFAULTS.annualSalaryIncrease, { shouldDirty: true });
    setValue("facilities.generalCostInflation", DEFAULTS.generalCostInflation, { shouldDirty: true });
    setValue("facilities.annualRentIncrease", DEFAULTS.annualRentIncrease, { shouldDirty: true });
  };

  const resetStaffingParams = () => {
    setValue("staffing.benefitsRate", DEFAULTS.benefitsRate, { shouldDirty: true });
    setValue("enrollment.retentionRate", DEFAULTS.retentionRate, { shouldDirty: true });
  };

  const resetRevenueDrivers = () => {
    setValue("tuitionEscalation.rate", DEFAULTS.tuitionEscalationRate, { shouldDirty: true });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Assumptions</h2>
        <p className="text-muted-foreground text-lg">
          The formula dashboard — every rate and driver that powers your 5-year model, in one place.
        </p>
      </div>

      <div className="bg-teal-50/60 border border-teal-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-teal-100 rounded-xl mt-0.5 flex-shrink-0">
            <Lightbulb className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-teal-900 mb-1">Why assumptions matter</p>
            <p className="text-sm text-teal-800 leading-relaxed">
              These are the formulas behind your 5-year model. Every projection on the Review page flows from the assumptions you set here.
              Lenders always review assumptions first — realistic inputs build credibility.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-10">
        <section>
          <SectionHeader
            icon={<DollarSign className="h-5 w-5 text-primary" />}
            title="Revenue Drivers"
            description="Rates and settings that determine how revenue is projected across the 5-year model."
            onReset={resetRevenueDrivers}
          />
          <div className="space-y-4">
            {isTuitionBased && (
              <AssumptionField
                label="Tuition Escalation Rate"
                name="tuitionEscalation.rate"
                suffix="%"
                defaultValue={DEFAULTS.tuitionEscalationRate}
                usageNote="Applied to all tuition programs, compounding each year. A 3% annual increase on $10,000 tuition becomes $10,300 in Year 2 and $10,609 in Year 3."
                placeholder="3"
                min={0}
                max={20}
              />
            )}

            <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
              <label className="text-sm font-semibold text-foreground">Enrollment Growth Rate</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={watch("schoolProfile.enrollmentGrowthRate") ?? ""}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setValue("schoolProfile.enrollmentGrowthRate", isNaN(val) ? undefined : val, { shouldDirty: true });
                  }}
                  className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  placeholder="e.g. 10"
                  step={1}
                  min={0}
                  max={100}
                />
                <span className="text-sm text-muted-foreground font-medium">% per year</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Annual enrollment growth rate used for out-year revenue projections. Applied after your explicit year-by-year enrollment inputs.
              </p>
            </div>

            {isCharter && stateFundingConfig && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-teal-700" />
                  <span className="text-sm font-semibold text-teal-900">Charter Revenue — {stateCode}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Enrollment Revenue Method</label>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-sm font-semibold text-primary">
                        {stateFundingConfig.charterMethodology === "other"
                          ? "State-Specific Method"
                          : ENROLLMENT_REVENUE_METHOD_LABELS[watch("schoolProfile.enrollmentRevenueMethod") as EnrollmentRevenueMethod] || "ADM"}
                      </span>
                    </div>
                    <p className="text-[11px] text-teal-700">Set by your state ({stateCode})</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Deposit Timing</label>
                    <select
                      value={watch("schoolProfile.charterDepositTiming") || "quarterly"}
                      onChange={(e) => setValue("schoolProfile.charterDepositTiming", e.target.value as CharterDepositTiming, { shouldDirty: true })}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                    >
                      {(Object.entries(CHARTER_DEPOSIT_TIMING_LABELS) as [CharterDepositTiming, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-teal-700">How frequently the state deposits per-pupil funds</p>
                  </div>
                </div>

                {watch("schoolProfile.enrollmentRevenueMethod") === "ada" && (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-semibold text-amber-800">ADA Attendance Ratio</p>
                    <p className="text-[11px] text-amber-700">
                      Your state uses ADA — funding is adjusted by the ratio of actual attendance to enrollment.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-foreground">Prior-Year ADM</label>
                        <input
                          type="number"
                          value={watch("schoolProfile.priorYearADM") || ""}
                          onChange={(e) => setValue("schoolProfile.priorYearADM", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          placeholder="e.g. 200"
                          min={0}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-foreground">Prior-Year ADA</label>
                        <input
                          type="number"
                          value={watch("schoolProfile.priorYearADA") || ""}
                          onChange={(e) => setValue("schoolProfile.priorYearADA", parseFloat(e.target.value) || 0, { shouldDirty: true })}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          placeholder="e.g. 190"
                          min={0}
                        />
                      </div>
                    </div>
                    {(() => {
                      const adm = watch("schoolProfile.priorYearADM") || 0;
                      const ada = watch("schoolProfile.priorYearADA") || 0;
                      const ratio = adm > 0 ? ada / adm : 0.95;
                      return (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-foreground">Attendance Ratio:</span>
                          <span className={cn(
                            "font-bold",
                            ratio >= 0.93 ? "text-green-700" : ratio >= 0.85 ? "text-amber-700" : "text-red-700"
                          )}>
                            {(ratio * 100).toFixed(1)}%
                          </span>
                          <span className="text-muted-foreground">
                            {adm > 0 ? "(from your data)" : "(default — enter prior-year data for accuracy)"}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {stateFundingConfig.charterBasePerPupil && (
                  <div className="flex items-start gap-2 text-xs text-teal-800 bg-white/50 rounded-lg p-2.5 border border-teal-100">
                    <Landmark className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      {stateCode} per-pupil range: <strong>${stateFundingConfig.charterBasePerPupil.min.toLocaleString()}</strong> – <strong>${stateFundingConfig.charterBasePerPupil.max.toLocaleString()}</strong>.
                      Midpoint pre-filled in your State/Local Per-Pupil Revenue row.
                    </span>
                  </div>
                )}
              </div>
            )}

            <InfoBadge>
              Revenue line items and amounts are configured on the Revenue step. This section controls only the rates and methodology that drive revenue projections.
            </InfoBadge>
          </div>
        </section>

        <section>
          <SectionHeader
            icon={<TrendingUp className="h-5 w-5 text-primary" />}
            title="Cost Escalation"
            description="How costs increase over the 5-year model. These rates compound annually starting from Year 2."
            onReset={resetCostEscalation}
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AssumptionField
                label="COLA (Cost of Living Adjustment)"
                name="facilities.annualSalaryIncrease"
                suffix="%"
                defaultValue={DEFAULTS.annualSalaryIncrease}
                usageNote="Applied to all staff salaries, compounding annually over the 5-year model. Keeps pace with cost of living to retain teachers. National education average: 2.5–3.5%."
                placeholder="3"
                min={0}
                max={100}
              />

              <AssumptionField
                label="General Cost Inflation"
                name="facilities.generalCostInflation"
                suffix="%"
                defaultValue={DEFAULTS.generalCostInflation}
                usageNote="Applied to utilities, insurance, supplies, and service contracts. Monthly and annual fixed costs escalate by this rate each year."
                placeholder="3"
                min={0}
                max={100}
              />
            </div>

            <AssumptionField
              label="Rent Escalation"
              name="facilities.annualRentIncrease"
              suffix="%"
              defaultValue={DEFAULTS.annualRentIncrease}
              usageNote="Applied to your monthly rent/lease payment per your lease terms. Rent is escalated separately from other costs because it follows lease agreements rather than inflation."
              placeholder="3"
              min={0}
              max={100}
            />

            <InfoBadge>
              Per-student costs (curriculum, devices, supplies) scale with enrollment rather than inflating per unit.
              Percent-of-revenue costs (like management fees) scale automatically with revenue growth.
            </InfoBadge>
          </div>
        </section>

        <section>
          <SectionHeader
            icon={<Users className="h-5 w-5 text-primary" />}
            title="Staffing Parameters"
            description="Default rates applied to staff compensation. Individual roles can override these on the Staffing step."
            onReset={resetStaffingParams}
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AssumptionField
                label="Default Benefits Rate"
                name="staffing.benefitsRate"
                suffix="%"
                defaultValue={DEFAULTS.benefitsRate}
                usageNote="Percentage of salary paid in benefits (health insurance, retirement, etc.) for benefits-eligible employees. Applied as a default to each new staff role."
                placeholder="25"
                min={0}
                max={100}
              />

              <AssumptionField
                label="Student Retention Rate"
                name="enrollment.retentionRate"
                suffix="%"
                defaultValue={DEFAULTS.retentionRate}
                usageNote="Percentage of students expected to return each year. Used for enrollment projections and returning-student revenue calculations. Industry average: 80–90%."
                placeholder="85"
                min={0}
                max={100}
              />
            </div>

            <InfoBadge>
              Individual staff roles, salaries, and FTE counts are configured on the Staffing step.
              COLA (salary escalation) is set above under Cost Escalation.
            </InfoBadge>
          </div>
        </section>

        <section>
          <SectionHeader
            icon={<Building2 className="h-5 w-5 text-primary" />}
            title="Debt Terms"
            description="Loan parameters that flow into your debt service projections and balance sheet."
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AssumptionField
                label="Loan Amount"
                name="facilities.loanAmount"
                prefix="$"
                usageNote="Total principal amount. Generates annual debt service payments on the Expenses step."
                placeholder="0"
                min={0}
              />

              <AssumptionField
                label="Annual Interest Rate"
                name="facilities.annualInterestRate"
                suffix="%"
                usageNote="Annual rate on outstanding loan balance. Used to calculate monthly/annual debt service payments."
                placeholder="0"
                min={0}
                max={100}
              />

              <AssumptionField
                label="Loan Term"
                name="facilities.loanTermYears"
                suffix=" years"
                usageNote="Number of years to fully amortize the loan. Drives the annual payment schedule."
                placeholder="0"
                min={0}
                max={50}
              />
            </div>

            <InfoBadge>
              Debt service payments are automatically computed and included in the Expenses step when a loan is configured.
            </InfoBadge>
          </div>
        </section>

        <section>
          <SectionHeader
            icon={<Calendar className="h-5 w-5 text-primary" />}
            title="Model Configuration"
            description="Structural parameters that shape the timeline and scope of your financial model."
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                <label className="text-sm font-semibold text-foreground">Fiscal Year Start</label>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-sm font-semibold text-primary">
                    <Calendar className="h-3.5 w-3.5" />
                    {MONTH_NAMES[(fiscalYearStartMonth - 1) % 12]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Set on the Profile step. Drives cash flow timing and partial-year proration.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                <label className="text-sm font-semibold text-foreground">First Year</label>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold",
                    isPartialFirstYear
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-green-50 border-green-200 text-green-800"
                  )}>
                    {isPartialFirstYear ? `Partial — ${year1OperatingMonths} months` : "Full 12 months"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isPartialFirstYear
                    ? `Year 1 revenue and expenses are prorated to ${year1OperatingMonths}/12 months.`
                    : "Year 1 uses a full 12-month operating period."}
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                <label className="text-sm font-semibold text-foreground">Model Horizon</label>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-sm font-semibold text-primary">
                    <Shield className="h-3.5 w-3.5" />
                    5-Year Projection
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Industry standard for lender-ready financial models. Covers startup through stabilization.
                </p>
              </div>
            </div>

            <InfoBadge>
              Fiscal year start and partial-year settings are configured on the Profile step. Changes there immediately update projections across all steps.
            </InfoBadge>
          </div>
        </section>
      </div>
    </div>
  );
}
