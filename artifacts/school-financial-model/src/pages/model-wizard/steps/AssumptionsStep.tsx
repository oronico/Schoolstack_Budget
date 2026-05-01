import { useFormContext } from "react-hook-form";
import { useEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, TrendingUp, Users, Calendar, DollarSign, RotateCcw, MapPin, Info, Landmark, GraduationCap, Shield, Sprout, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { FinancingInsight } from "@/components/coaching/FinancingInsight";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { InlineHelpCard } from "@/components/coaching/InlineHelpCard";
import { EXPLAINERS } from "@/lib/coaching/explainers";
import { useAuth } from "@/lib/auth-context";
import { isYetToLaunch } from "@/lib/coaching/founder-persona";
import { cn } from "@/lib/utils";
import {
  DEFAULT_BENEFITS_RATE,
  DEFAULT_PAYROLL_TAX_RATE,
  DEFAULT_COLA_PCT,
  DEFAULT_GENERAL_INFLATION_PCT,
  DEFAULT_RENT_ESCALATION_PCT,
  DEFAULT_TUITION_ESCALATION_PCT,
  DEFAULT_RETENTION_RATE,
} from "@workspace/finance";
import { getStateFundingConfig, type SchoolType } from "@/lib/state-funding-data";
import { getStatePayrollTaxEntry, getStatePayrollTaxRate, getQuickPickOptions } from "@/lib/state-payroll-tax-data";
import {
  ENROLLMENT_REVENUE_METHOD_LABELS,
  CHARTER_DEPOSIT_TIMING_LABELS,
  type EnrollmentRevenueMethod,
  type CharterDepositTiming,
} from "@/lib/revenue-defaults";
import type { FullModelData } from "../schema";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const DEFAULTS = {
  annualSalaryIncrease: DEFAULT_COLA_PCT,
  generalCostInflation: DEFAULT_GENERAL_INFLATION_PCT,
  annualRentIncrease: DEFAULT_RENT_ESCALATION_PCT,
  benefitsRate: DEFAULT_BENEFITS_RATE,
  payrollTaxRate: DEFAULT_PAYROLL_TAX_RATE,
  retentionRate: DEFAULT_RETENTION_RATE,
  tuitionEscalationRate: DEFAULT_TUITION_ESCALATION_PCT,
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
  label: React.ReactNode;
  name: string;
  suffix?: string;
  prefix?: string;
  defaultValue?: number;
  usageNote: React.ReactNode;
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
  title: React.ReactNode;
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

function QuickPickButtons({
  options,
  name,
  suffix,
  onSelect,
}: {
  options: { label: string; value: number }[];
  name: string;
  suffix?: string;
  onSelect?: (value: number) => void;
}) {
  const { watch, setValue } = useFormContext();
  const current = watch(name);

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {options.map((opt) => {
        const isActive = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setValue(name, opt.value, { shouldDirty: true });
              onSelect?.(opt.value);
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
              isActive
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white text-foreground/70 border-border hover:border-primary/40 hover:text-primary"
            )}
          >
            {opt.label}{suffix}
          </button>
        );
      })}
    </div>
  );
}

function BenefitsToggleSection({ schoolType }: { schoolType: string }) {
  const { watch, setValue } = useFormContext();
  const offersBenefits = watch("staffing.offersBenefits");

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={offersBenefits === true}
          onClick={() => {
            const next = !offersBenefits;
            setValue("staffing.offersBenefits", next, { shouldDirty: true });
            if (!next) {
              setValue("staffing.benefitsRate", 0, { shouldDirty: true });
            } else {
              const current = watch("staffing.benefitsRate");
              if (!current || current === 0) {
                setValue("staffing.benefitsRate", DEFAULTS.benefitsRate, { shouldDirty: true });
              }
            }
          }}
          className={cn(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            offersBenefits ? "bg-primary" : "bg-gray-300"
          )}
        >
          <span className={cn(
            "inline-block h-4 w-4 rounded-full bg-white transition-transform",
            offersBenefits ? "translate-x-6" : "translate-x-1"
          )} />
        </button>
        <label className="text-sm font-semibold text-foreground cursor-pointer" onClick={() => {
          const next = !offersBenefits;
          setValue("staffing.offersBenefits", next, { shouldDirty: true });
          if (!next) setValue("staffing.benefitsRate", 0, { shouldDirty: true });
          else {
            const current = watch("staffing.benefitsRate");
            if (!current || current === 0) setValue("staffing.benefitsRate", DEFAULTS.benefitsRate, { shouldDirty: true });
          }
        }}>
          Do you offer benefits to FTE staff?
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Health insurance, retirement contributions, and other benefits for full-time employees.
      </p>

      {offersBenefits && (
        <div className="pt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <AssumptionField
            label={<>Default <GlossaryTerm termKey="benefits_rate" schoolType={schoolType}>Benefits Rate</GlossaryTerm></>}
            name="staffing.benefitsRate"
            suffix="%"
            defaultValue={DEFAULTS.benefitsRate}
            usageNote="Percentage of salary paid in benefits. Applied as a default to each new staff role."
            placeholder="25"
            min={0}
            max={100}
          />
          <div className="px-1">
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Quick pick:</p>
            <QuickPickButtons
              name="staffing.benefitsRate"
              suffix="%"
              options={[
                { label: "20", value: 20 },
                { label: "25", value: 25 },
                { label: "30", value: 30 },
              ]}
            />
          </div>
          <InlineHelpCard explainer={EXPLAINERS.assumptions_benefits_rate} section="assumptions" className="mt-2" schoolType={schoolType} />
        </div>
      )}
    </div>
  );
}

function PayrollTaxSection({
  stateCode,
  statePayrollTaxEntry,
  statePayrollTaxRate,
  payrollQuickPicks,
}: {
  stateCode: string;
  statePayrollTaxEntry: ReturnType<typeof getStatePayrollTaxEntry>;
  statePayrollTaxRate: number;
  payrollQuickPicks: { label: string; value: number }[];
}) {
  const { watch, setValue } = useFormContext();
  const schoolType = watch("schoolProfile.schoolType");
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const currentValue = watch("staffing.payrollTaxRate");
  const effectiveDefault = stateCode ? statePayrollTaxRate : DEFAULT_PAYROLL_TAX_RATE;
  const isModified = currentValue !== undefined && currentValue !== null && currentValue !== effectiveDefault;
  const stateName = stateCode || null;

  const handleChange = (val: number | undefined) => {
    setValue("staffing.payrollTaxRate", val, { shouldDirty: true });
    setValue("staffing.payrollTaxRateUserOverride", true, { shouldDirty: true });
  };

  return (
    <div>
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-semibold text-foreground">
            <GlossaryTerm termKey="payroll_tax" schoolType={schoolType}>Payroll Tax Rate</GlossaryTerm>
          </label>
          {isModified && (
            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              {stateName ? `${stateName} default` : "default"}: {effectiveDefault}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={currentValue ?? ""}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              handleChange(isNaN(val) ? undefined : val);
            }}
            className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            placeholder={String(effectiveDefault)}
            min={0}
            max={100}
          />
          <span className="text-sm text-muted-foreground font-medium">%</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Employer-side payroll taxes (FICA, FUTA, state unemployment).
          {stateName ? ` Auto-populated for ${stateName} — ` : " "}
          Applied as a default to each new staff role - override per role on the Staffing step.
        </p>
        {statePayrollTaxEntry.components.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setBreakdownOpen(!breakdownOpen)}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Info className="h-3 w-3" />
              {breakdownOpen ? "Hide breakdown" : "What's included"}
              {breakdownOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {breakdownOpen && (
              <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200/60 p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1">
                  {statePayrollTaxEntry.components.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600">{c.label}</span>
                      <span className="font-medium text-slate-800">{c.rate}%</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-300 mt-1.5 pt-1.5 flex items-center justify-between text-[11px] font-bold">
                    <span className="text-slate-700">Total (recommended)</span>
                    <span className="text-primary">{statePayrollTaxEntry.totalRate}%</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  Uses new-employer SUTA rates. Your actual rate may differ based on experience rating.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 px-1">
        <p className="text-[10px] font-medium text-muted-foreground mb-1">Quick pick:</p>
        <QuickPickButtons
          name="staffing.payrollTaxRate"
          suffix="%"
          options={payrollQuickPicks}
          onSelect={() => setValue("staffing.payrollTaxRateUserOverride", true, { shouldDirty: true })}
        />
      </div>
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

function AssumptionsCallout({
  icon: Icon,
  iconColor,
  borderColor,
  bgColor,
  summary,
  children,
}: {
  icon: typeof Lightbulb;
  iconColor: string;
  borderColor: string;
  bgColor: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={cn("rounded-xl border overflow-hidden", borderColor, bgColor)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsOpen(!isOpen); } }}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-black/[0.02] transition-colors cursor-pointer"
      >
        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        <Icon className={cn("h-4 w-4 flex-shrink-0", iconColor)} />
        <span className="text-sm flex-1">{summary}</span>
      </div>
      {isOpen && (
        <div className="px-4 pb-3 space-y-2 ml-10">
          {children}
        </div>
      )}
    </div>
  );
}

export function AssumptionsStep() {
  const { watch, setValue } = useFormContext<FullModelData>();
  const { user } = useAuth();
  const guidanceLevel = (user?.guidanceLevel as "advanced" | "basics" | "extra") || "basics";
  const showReassurance = guidanceLevel === "extra" || guidanceLevel === "basics";

  const schoolType = watch("schoolProfile.schoolType") as SchoolType | undefined;
  const stateCode = watch("schoolProfile.state") as string || "";
  const fundingProfile = watch("schoolProfile.fundingProfile") || "tuition_based";
  const isCharter = schoolType === "charter_school";
  const isTuitionBased = fundingProfile === "tuition_based" || fundingProfile === "hybrid_mixed";

  const stateFundingConfig = useMemo(
    () => getStateFundingConfig(schoolType as SchoolType, stateCode),
    [stateCode, schoolType]
  );

  useEffect(() => {
    if (!isCharter || !stateFundingConfig) return;
    if (stateFundingConfig.enrollmentRevenueMethod) {
      setValue("schoolProfile.enrollmentRevenueMethod", stateFundingConfig.enrollmentRevenueMethod, { shouldDirty: true });
    } else {
      setValue("schoolProfile.enrollmentRevenueMethod", "adm", { shouldDirty: true });
    }
    if (stateFundingConfig.charterMethodology) {
      setValue("schoolProfile.stateFundingMethodology", stateFundingConfig.charterMethodology, { shouldDirty: true });
    }
  }, [isCharter, stateFundingConfig, setValue]);

  useEffect(() => {
    const currentToggle = watch("staffing.offersBenefits");
    if (currentToggle === undefined || currentToggle === null) {
      const rate = watch("staffing.benefitsRate");
      const hasExplicitRate = rate !== undefined && rate !== null;
      setValue("staffing.offersBenefits", hasExplicitRate ? rate > 0 : true, { shouldDirty: false });
    }
  }, []);

  const statePayrollTaxEntry = useMemo(
    () => getStatePayrollTaxEntry(stateCode),
    [stateCode]
  );
  const statePayrollTaxRate = useMemo(
    () => getStatePayrollTaxRate(stateCode),
    [stateCode]
  );
  const payrollQuickPicks = useMemo(
    () => getQuickPickOptions(stateCode),
    [stateCode]
  );

  const prevStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!stateCode) return;
    const isOverridden = watch("staffing.payrollTaxRateUserOverride");
    const isFirstRun = prevStateRef.current === null;
    const stateChanged = prevStateRef.current !== stateCode;
    prevStateRef.current = stateCode;

    if (isOverridden) return;
    if (isFirstRun || stateChanged) {
      setValue("staffing.payrollTaxRate", statePayrollTaxRate, { shouldDirty: true });
    }
  }, [stateCode, statePayrollTaxRate, setValue, watch]);

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
    setValue("staffing.offersBenefits", true, { shouldDirty: true });
    setValue("staffing.benefitsRate", DEFAULTS.benefitsRate, { shouldDirty: true });
    setValue("staffing.payrollTaxRate", stateCode ? statePayrollTaxRate : DEFAULTS.payrollTaxRate, { shouldDirty: true });
    setValue("staffing.payrollTaxRateUserOverride", false, { shouldDirty: true });
  };

  const resetRevenueDrivers = () => {
    setValue("tuitionEscalation.rate", DEFAULTS.tuitionEscalationRate, { shouldDirty: true });
  };

  const resetRevenueCollection = () => {
    setValue("revenueDefaults.billingMonths", 10, { shouldDirty: true });
    setValue("revenueDefaults.collectionMethod", "autopay", { shouldDirty: true });
    setValue("revenueDefaults.collectionRate", 100, { shouldDirty: true });
    setValue("revenueDefaults.collectionDelayDays", 0, { shouldDirty: true });
  };

  const yetToLaunch = isYetToLaunch(user);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Assumptions &amp; Sensitivity</h2>
        <p className="text-muted-foreground text-lg">
          {yetToLaunch
            ? "The dial-tuning step. Your enrollment, revenue, staffing, expense, and capital plans are in. Use this screen to set the rates, escalators, and structural settings that shape your opening 5-year projection."
            : "The dial-tuning step. Your enrollment, revenue, staffing, expense, and capital decisions are already in. Use this screen to adjust the rates, escalators, and structural settings that stress-test your 5-year model."}
        </p>
      </div>

      {showReassurance && (
        <AssumptionsCallout
          icon={Sprout}
          iconColor="text-emerald-700"
          borderColor="border-emerald-200"
          bgColor="bg-emerald-50/60"
          summary={<><span className="font-semibold">The defaults are a great starting point</span><span className="text-muted-foreground"> — pre-filled with typical rates for schools like yours.</span></>}
        >
          <p className="text-sm text-emerald-800">
            {yetToLaunch
              ? "Most founders leave them as-is on their first pass — you can always come back and fine-tune later as your plan firms up. If a field shows a default badge, it means you've customized it."
              : "Most founders leave them as-is on their first pass - you can always come back and fine-tune later. If a field shows a default badge, it means you've customized it."}
          </p>
        </AssumptionsCallout>
      )}

      <AssumptionsCallout
        icon={Lightbulb}
        iconColor="text-teal-700"
        borderColor="border-teal-200"
        bgColor="bg-teal-50/60"
        summary={<><span className="font-semibold">Why assumptions matter</span><span className="text-muted-foreground"> — every projection flows from the rates you set here.</span></>}
      >
        <p className="text-sm text-teal-800">
          Realistic assumptions are the foundation of a strong plan - they build credibility with anyone reviewing your model.
        </p>
      </AssumptionsCallout>

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
              <div>
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

              </div>
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
                  <span className="text-sm font-semibold text-teal-900">Charter Revenue - {stateCode}</span>
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

                {watch("schoolProfile.enrollmentRevenueMethod") === "ada" && !isYetToLaunch(user) && (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-semibold text-amber-800"><GlossaryTerm termKey="ada" schoolType={schoolType}>ADA</GlossaryTerm> Attendance Ratio</p>
                    <p className="text-[11px] text-amber-700">
                      Your state uses <GlossaryTerm termKey="ada" schoolType={schoolType}>ADA</GlossaryTerm> - funding is adjusted by the ratio of actual attendance to enrollment.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-foreground">Prior-Year <GlossaryTerm termKey="adm" schoolType={schoolType}>ADM</GlossaryTerm></label>
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
                        <label className="text-[11px] font-medium text-foreground">Prior-Year <GlossaryTerm termKey="ada" schoolType={schoolType}>ADA</GlossaryTerm></label>
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
                            {adm > 0 ? "(from your data)" : "(default - enter prior-year data for accuracy)"}
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
            icon={<DollarSign className="h-5 w-5 text-primary" />}
            title="Revenue Collection Defaults"
            description="Default billing and collection behavior applied to new tuition revenue rows. Individual rows can override on the Revenue step."
            onReset={resetRevenueCollection}
          />
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-semibold text-foreground">Billing Months</label>
                  {(watch("revenueDefaults.billingMonths") || 10) !== 10 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider">Modified</span>
                  )}
                </div>
                <select
                  value={watch("revenueDefaults.billingMonths") || 10}
                  onChange={(e) => setValue("revenueDefaults.billingMonths", parseInt(e.target.value) as 9 | 10 | 12, { shouldDirty: true })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                >
                  <option value={9}>9 months (Sep–May)</option>
                  <option value={10}>10 months (Aug–May)</option>
                  <option value={12}>12 months (year-round)</option>
                </select>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  How many months tuition is billed over. Applied as default to tuition rows; override per row on the Revenue step.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-semibold text-foreground">Collection Method</label>
                  {(watch("revenueDefaults.collectionMethod") || "autopay") !== "autopay" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider">Modified</span>
                  )}
                </div>
                <select
                  value={watch("revenueDefaults.collectionMethod") || "autopay"}
                  onChange={(e) => setValue("revenueDefaults.collectionMethod", e.target.value as "autopay" | "invoiced" | "mixed", { shouldDirty: true })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                >
                  <option value="autopay">Autopay (100% on time)</option>
                  <option value="invoiced">Invoiced (manual collection)</option>
                  <option value="mixed">Mixed (autopay + invoiced)</option>
                </select>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Default payment collection approach. Invoiced families may pay late or miss payments, reducing cash inflow timing.
                </p>
              </div>
            </div>

            {(watch("revenueDefaults.collectionMethod") || "autopay") !== "autopay" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <AssumptionField
                    label={<><GlossaryTerm termKey="collection_rate" schoolType={schoolType}>Collection Rate</GlossaryTerm></>}
                    name="revenueDefaults.collectionRate"
                    suffix="%"
                    defaultValue={100}
                    usageNote="Expected percentage of billed tuition actually collected. Most schools see 92–98% for invoiced families - building in a realistic rate matters."
                    placeholder="95"
                    min={0}
                    max={100}
                  />
                  <InlineHelpCard explainer={EXPLAINERS.assumptions_collection_rate} section="assumptions" className="mt-2" schoolType={schoolType} />
                  <FinancingInsight text="A 100% collection rate is optimistic for invoiced families - most schools see 92-98%. Building in a realistic rate protects your cash flow projections." />
                </div>

                <AssumptionField
                  label="Collection Delay (Days)"
                  name="revenueDefaults.collectionDelayDays"
                  suffix=" days"
                  defaultValue={0}
                  usageNote="Average delay from billing date to cash receipt. Shifts monthly cash inflow timing in the cash flow model. Typical: 15–30 days for invoiced families."
                  placeholder="0"
                  min={0}
                  max={90}
                />
              </div>
            )}

            <InfoBadge>
              These defaults apply to new tuition rows. Rows with custom timing show a "Custom" badge on the Revenue step.
              Changing defaults here does not override rows you've already customized.
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
              <div>
                <AssumptionField
                  label={<><GlossaryTerm termKey="cola" schoolType={schoolType}>COLA</GlossaryTerm> (Cost of Living Adjustment)</>}
                  name="facilities.annualSalaryIncrease"
                  suffix="%"
                  defaultValue={DEFAULTS.annualSalaryIncrease}
                  usageNote="Applied to all staff salaries, compounding annually over the 5-year model. Keeps pace with cost of living to retain teachers. National education average: 2.5–3.5%."
                  placeholder="3"
                  min={0}
                  max={100}
                />
                <InlineHelpCard explainer={EXPLAINERS.assumptions_cola} section="assumptions" className="mt-2" schoolType={schoolType} />
              </div>

              <div>
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
                <InlineHelpCard explainer={EXPLAINERS.assumptions_general_inflation} section="assumptions" className="mt-2" schoolType={schoolType} />
              </div>
            </div>

            <AssumptionField
              label={<><GlossaryTerm termKey="escalation_rate" schoolType={schoolType}>Rent Escalation</GlossaryTerm></>}
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
          <div className="space-y-5">
            <BenefitsToggleSection schoolType={schoolType ?? ""} />

            <PayrollTaxSection
              stateCode={stateCode}
              statePayrollTaxEntry={statePayrollTaxEntry}
              statePayrollTaxRate={statePayrollTaxRate}
              payrollQuickPicks={payrollQuickPicks}
            />

            <InfoBadge>
              Individual staff roles, salaries, and FTE counts are configured on the Staffing step.
              COLA (salary escalation) is set above under Cost Escalation.
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
                    {isPartialFirstYear ? `Partial - ${year1OperatingMonths} months` : "Full 12 months"}
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
                  Industry standard for comprehensive financial models. Covers startup through stabilization.
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
