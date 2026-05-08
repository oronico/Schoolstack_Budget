import { useFormContext } from "react-hook-form";
import { Building2, Shield, Lightbulb, Info } from "lucide-react";
import { FinancingInsight } from "@/components/coaching/FinancingInsight";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { RationaleField } from "@/components/coaching/RationaleField";
import { AssumptionConfidenceCard } from "@/components/wizard/AssumptionConfidenceCard";
import { ConceptExplainer } from "@/components/coaching/ConceptExplainer";
import { cn } from "@/lib/utils";
import { useYearCount } from "@/lib/use-model-duration";
import type { FullModelData } from "../schema";
import type { SchoolType } from "@/lib/state-funding-data";

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
  const isModified =
    defaultValue !== undefined && value !== undefined && value !== null && value !== defaultValue;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-semibold text-foreground">{label}</label>
        {isModified && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider">
            Modified
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {prefix && <span className="text-sm text-muted-foreground font-medium">{prefix}</span>}
        <input
          type={type}
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = type === "number" ? parseFloat(raw) : raw;
            setValue(
              name,
              raw === "" ? undefined : isNaN(parsed as number) ? undefined : parsed,
              { shouldDirty: true },
            );
          }}
          className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          placeholder={placeholder ?? (defaultValue !== undefined ? String(defaultValue) : undefined)}
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
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description: string;
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

export function CapitalFinancingStep() {
  const { watch } = useFormContext<FullModelData>();
  const schoolType = watch("schoolProfile.schoolType") as SchoolType | undefined;
  const loanAmount = watch("schoolProfile.loanAmount") as number | undefined;
  const loanRate = watch("schoolProfile.loanRate") as number | undefined;
  const loanTermYears = watch("schoolProfile.loanTermYears") as number | undefined;
  const hasLoan = loanAmount !== undefined && loanAmount !== null && loanAmount > 0;
  const dscrByYear = watch("covenantThresholds.dscrByYear") as
    | (number | undefined)[]
    | undefined;
  const yearCount = useYearCount();
  const isSingleYear = yearCount === 1;
  const dscrYears = isSingleYear ? [0] : [0, 1, 2, 3, 4];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Capital &amp; Financing</h2>
        <p className="text-muted-foreground text-lg">
          If you're financing facilities, equipment, or working capital with debt, set the loan terms and lender covenants here. Skip the details if you have no loan - your model still builds without one.
        </p>
        <ConceptExplainer concept="debt_service" className="mt-3 max-w-2xl" />
        <ConceptExplainer concept="beginning_cash" className="mt-2 max-w-2xl" />
        <ConceptExplainer concept="ending_cash" className="mt-2 max-w-2xl" />
      </div>

      <div className="space-y-10">
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
                name="schoolProfile.loanAmount"
                prefix="$"
                usageNote="Total principal amount. Generates annual debt service payments on the Expenses step."
                placeholder="0"
                min={0}
              />

              <AssumptionField
                label="Annual Interest Rate"
                name="schoolProfile.loanRate"
                suffix="%"
                usageNote="Annual rate on outstanding loan balance. Used to calculate monthly/annual debt service payments."
                placeholder="0"
                min={0}
                max={100}
              />

              <AssumptionField
                label="Loan Term"
                name="schoolProfile.loanTermYears"
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

            <RationaleField
              rationaleKey="capitalFinancing:debtTerms"
              label="Why these debt terms?"
              placeholder={
                hasLoan
                  ? `You're modeling a $${(loanAmount ?? 0).toLocaleString()} loan${
                      loanRate ? ` at ${loanRate}%` : ""
                    }${loanTermYears ? ` over ${loanTermYears} years` : ""}. Which lender (or lender type) gave you those terms - a term sheet, an LOI, a comparable deal, or a market rate quote?`
                  : "If you plan to add debt later, capture the lender type, expected rate, and source of those expectations here. Reviewers will look for an anchor."
              }
              helperText="Lenders read this first. A clear source - term sheet, banker conversation, comparable deal - moves the conversation faster."
            />
          </div>
        </section>

        <section>
          <SectionHeader
            icon={<Shield className="h-5 w-5 text-primary" />}
            title={<>{isSingleYear ? "Year 1 " : "Step-Up "}<GlossaryTerm termKey="dscr" schoolType={schoolType}>DSCR</GlossaryTerm> Covenant{isSingleYear ? "" : "s"}</>}
            description={hasLoan
              ? (isSingleYear
                  ? "Set your Year 1 minimum DSCR target. Year 2-5 step-up targets become available when you extend to a 5-year model."
                  : "If you have debt, it's smart to plan for your coverage ratio to improve each year as enrollment grows. Set year-by-year targets.")
              : "These settings become relevant if you add loan details above."}
          />
          <ConceptExplainer concept="dscr" className="mt-3 max-w-2xl" />
          {hasLoan ? (
            <div className="space-y-4">
              <div className={cn("grid gap-3", isSingleYear ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3" : "grid-cols-5")}>
                {dscrYears.map(y => (
                  <AssumptionField
                    key={y}
                    label={`Year ${y + 1}`}
                    name={`covenantThresholds.dscrByYear.${y}`}
                    suffix="x"
                    usageNote={`Minimum DSCR for Year ${y + 1}`}
                    placeholder={[1.10, 1.15, 1.20, 1.25, 1.25][y].toFixed(2)}
                    min={0}
                    max={10}
                    step={0.05}
                  />
                ))}
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900">
                <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  {isSingleYear
                    ? <>A common Year 1 minimum DSCR is around 1.10x while a school is still ramping up. Your Consultant Analysis and workbook will check Year 1 against this threshold. Extend to a 5-year model to set step-up targets for Years 2-5.</>
                    : <>Step-up covenants start lower in early years when your school is still growing, then tighten as cash flow stabilizes. A common pattern is 1.10x → 1.15x → 1.20x → 1.25x → 1.25x. Your Consultant Analysis and workbook will check each year against its specific threshold.</>}
                </span>
              </div>
              <FinancingInsight text={isSingleYear
                ? "If you have loan covenants, missing your Year 1 DSCR target can trigger default provisions - plan conservatively so you have room to meet it."
                : "If you have loan covenants, missing your DSCR targets can trigger default provisions - plan conservatively so you have room to meet each year's target."}
              />
            </div>
          ) : (
            <div className={cn("flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-200/60 p-4")}>
              <Info className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-slate-500 leading-relaxed">
                No loan configured - DSCR covenants don't apply yet. If you add a loan amount in the Debt Terms section above, {isSingleYear ? "a Year 1 covenant target" : "year-by-year covenant targets"} will appear here.
              </p>
            </div>
          )}

          <RationaleField
            rationaleKey="capitalFinancing:dscrCovenants"
            label="Why these covenant thresholds?"
            placeholder={
              hasLoan && Array.isArray(dscrByYear) && dscrByYear.some((v) => (v ?? 0) > 0)
                ? (isSingleYear
                    ? `Your Year 1 DSCR target is ${(dscrByYear[0] ?? 1.10).toFixed(2)}x. What's the source - a draft term sheet, your lender's standard package, or a conservative self-imposed target?`
                    : `Your DSCR ramp is ${dscrByYear
                        .slice(0, 5)
                        .map((v, i) => `Y${i + 1} ${(v ?? [1.10, 1.15, 1.20, 1.25, 1.25][i]).toFixed(2)}x`)
                        .join(" → ")}. What's the source - a draft term sheet, your lender's standard package, or a conservative self-imposed target?`)
                : "If your lender has shared draft covenants, capture them here with the source (term sheet, RFP, banker conversation). Otherwise note the basis for your self-imposed targets."
            }
            helperText={isSingleYear
              ? "A self-imposed Year 1 DSCR target tells lenders you've already stress-tested your model - call out where it came from."
              : "A self-imposed DSCR ramp tells lenders you've already stress-tested your model - call out where the targets came from."}
          />
        </section>
        <AssumptionConfidenceCard stepTitle="Capital & Financing" />
      </div>
    </div>
  );
}
