import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { FormInput, FormSelect, FormCheckbox, getNestedError } from "@/components/ui/form-inputs";
import { Building2, Rocket, Landmark, Info, AlertCircle, DollarSign, Vote, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHOOL_TYPE_LABELS, ENTITY_TYPE_LABELS } from "../schema";

const STATES = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" }, { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" }, { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" }, { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" }, { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" }, { value: "IN", label: "Indiana" }, { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" }, { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" }, { value: "MD", label: "Maryland" }, { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" }, { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" }, { value: "MT", label: "Montana" }, { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" }, { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" }, { value: "NY", label: "New York" }, { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" }, { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" }, { value: "PA", label: "Pennsylvania" }, { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" }, { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" }, { value: "UT", label: "Utah" }, { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" }, { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" }, { value: "WY", label: "Wyoming" }, { value: "DC", label: "Washington D.C." },
];

const MONTHS = [
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

interface RevenueSourceCheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}

function RevenueSourceCheck({ checked, onChange, icon, title, description, disabled }: RevenueSourceCheckProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all",
        checked
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className={cn(
        "mt-0.5 flex h-5 w-5 items-center justify-center rounded border-2 transition-all flex-shrink-0",
        checked ? "border-primary bg-primary" : "border-border bg-background"
      )}>
        {checked && (
          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-muted-foreground", checked && "text-primary")}>{icon}</span>
          <span className="font-semibold text-sm text-foreground">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  );
}

function EINInput() {
  const { watch, setValue } = useFormContext();
  const raw = watch("schoolProfile.ein") || "";

  const formatEIN = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatEIN(e.target.value);
    setValue("schoolProfile.ein", formatted, { shouldDirty: true });
  };

  const display = formatEIN(raw);
  const isComplete = raw.replace(/\D/g, "").length === 9;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="ein" className="text-sm font-semibold text-foreground">
        EIN (Employer Identification Number)
      </label>
      <input
        id="ein"
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        maxLength={10}
        className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 tracking-widest font-mono"
        placeholder="XX-XXXXXXX"
      />
      {display && !isComplete && (
        <p className="text-xs text-muted-foreground">{raw.replace(/\D/g, "").length}/9 digits</p>
      )}
    </div>
  );
}

interface RadioCardProps {
  value: string;
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}

function RadioCard({ selected, onSelect, icon, title, description, disabled }: RadioCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all w-full",
        disabled && "opacity-50 cursor-not-allowed",
        selected
          ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
          : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.02]"
      )}
    >
      <div className={cn(
        "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
        selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold text-base", selected ? "text-primary" : "text-foreground")}>{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className={cn(
        "flex-shrink-0 w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center",
        selected ? "border-primary" : "border-border"
      )}>
        {selected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
      </div>
    </button>
  );
}




export function SchoolProfileStep() {
  const { watch, setValue } = useFormContext();
  const isPartialFirstYear = watch("schoolProfile.isPartialFirstYear");
  const schoolStage = watch("schoolProfile.schoolStage");
  const operatingYear = watch("schoolProfile.operatingYear");
  const fundingProfile = watch("schoolProfile.fundingProfile");
  const schoolType = watch("schoolProfile.schoolType");
  const entityType = watch("schoolProfile.entityType");
  const isAccredited = watch("schoolProfile.isAccredited");

  const revenueSources = watch("revenueSources") as { tuition?: boolean; publicFunding?: boolean; schoolChoice?: boolean; grantsContributions?: boolean } | undefined;

  const isCharter = schoolType === "charter_school";
  const isPrivate = schoolType === "private_school";

  const { formState: { errors } } = useFormContext();
  const stageError = getNestedError(errors, "schoolProfile.schoolStage");
  const fundingError = getNestedError(errors, "schoolProfile.fundingProfile");

  const deriveFundingProfile = (sources: { tuition?: boolean; publicFunding?: boolean; schoolChoice?: boolean; grantsContributions?: boolean }) => {
    const hasTuition = sources.tuition ?? false;
    const hasPublic = sources.publicFunding ?? false;
    const hasChoice = sources.schoolChoice ?? false;

    if (hasPublic && !hasTuition && !hasChoice) return "charter_public_funded";
    if ((hasTuition && hasPublic) || hasChoice) return "hybrid_mixed";
    if (hasTuition) return "tuition_based";
    if (hasPublic) return "charter_public_funded";
    return "hybrid_mixed";
  };

  const handleRevenueSourceChange = (source: string, checked: boolean) => {
    const updated = { ...revenueSources, [source]: checked };
    setValue("revenueSources", updated, { shouldDirty: true });
    const derived = deriveFundingProfile(updated);
    setValue("schoolProfile.fundingProfile", derived, { shouldDirty: true });
  };

  useEffect(() => {
    if (isCharter) {
      setValue("revenueSources.publicFunding", true, { shouldDirty: true });
      setValue("revenueSources.tuition", false, { shouldDirty: true });
      setValue("revenueSources.schoolChoice", false, { shouldDirty: true });
      if (fundingProfile !== "charter_public_funded") {
        setValue("schoolProfile.fundingProfile", "charter_public_funded", { shouldDirty: true });
      }
    }
  }, [isCharter, fundingProfile, setValue]);

  useEffect(() => {
    const anyChecked = revenueSources?.tuition || revenueSources?.publicFunding || revenueSources?.schoolChoice || revenueSources?.grantsContributions;
    if (anyChecked && !fundingProfile) {
      const derived = deriveFundingProfile(revenueSources || {});
      setValue("schoolProfile.fundingProfile", derived, { shouldDirty: true });
    }
  }, [revenueSources, fundingProfile, setValue]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Tell Us About Your School</h2>
        <p className="text-muted-foreground text-lg">We'll tailor everything to your school's type, stage, and revenue sources.</p>
      </div>

      <div>
        <FormInput 
          name="schoolProfile.schoolName" 
          label="What's the name of your school?" 
          placeholder="e.g., Summit Academy"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormSelect
          name="schoolProfile.schoolType"
          label="School Type"
          options={Object.entries(SCHOOL_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        
        {schoolType === "other" && (
          <FormInput
            name="schoolProfile.schoolTypeOther"
            label="Describe Your School Type"
            placeholder="e.g., Montessori Academy"
          />
        )}

        <FormSelect
          name="schoolProfile.state"
          label="State"
          options={STATES}
        />
      </div>

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">What stage is your school?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RadioCard
            value="new_school"
            selected={schoolStage === "new_school"}
            onSelect={() => setValue("schoolProfile.schoolStage", "new_school", { shouldDirty: true })}
            icon={<Rocket className="h-5 w-5" />}
            title="We're planning a new school"
            description="We do not currently enroll students and are planning to open"
          />
          <RadioCard
            value="operating_school"
            selected={schoolStage === "operating_school"}
            onSelect={() => setValue("schoolProfile.schoolStage", "operating_school", { shouldDirty: true })}
            icon={<Building2 className="h-5 w-5" />}
            title="We're already operating"
            description="We currently enroll students and are planning ahead"
          />
        </div>

        {stageError && (
          <div className="flex items-center gap-2 mt-3 text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm font-medium">Please select your school's stage</p>
          </div>
        )}

        {schoolStage === "new_school" && (
          <div className="mt-4 max-w-sm">
            <FormSelect
              name="schoolProfile.plannedOpeningYear"
              label="Planned Opening School Year"
              options={[
                { value: "2026-27", label: "2026–27" },
                { value: "2027-28", label: "2027–28" },
                { value: "2028-29", label: "2028–29" },
              ]}
            />
          </div>
        )}

        {schoolStage === "operating_school" && (
          <div className="mt-4 max-w-sm">
            <FormSelect
              name="schoolProfile.operatingYear"
              label="How long have you been operating?"
              options={[
                { value: "first_year", label: "This is our first year of operation" },
                { value: "second_year_plus", label: "We've completed at least one full school year" },
              ]}
            />
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Revenue Sources</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Check every revenue source that applies to your school. This helps us set up the right line items in your budget.
        </p>
        {isCharter && (
          <div className="flex items-start gap-2 mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-700">Charter schools typically receive public per-pupil funding. We've pre-checked that for you.</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RevenueSourceCheck
            checked={revenueSources?.tuition ?? false}
            onChange={(v) => handleRevenueSourceChange("tuition", v)}
            icon={<DollarSign className="h-5 w-5" />}
            title="Tuition & Fees"
            description="Tuition, registration fees, aftercare, family payments"
            disabled={isCharter}
          />
          <RevenueSourceCheck
            checked={revenueSources?.publicFunding ?? false}
            onChange={(v) => handleRevenueSourceChange("publicFunding", v)}
            icon={<Landmark className="h-5 w-5" />}
            title="Public Funding"
            description="State, federal, or local per-pupil revenue"
          />
          <RevenueSourceCheck
            checked={revenueSources?.schoolChoice ?? false}
            onChange={(v) => handleRevenueSourceChange("schoolChoice", v)}
            icon={<Vote className="h-5 w-5" />}
            title="School Choice / ESA / Vouchers"
            description="ESA accounts, voucher programs, scholarship organizations"
            disabled={isCharter}
          />
          <RevenueSourceCheck
            checked={revenueSources?.grantsContributions ?? false}
            onChange={(v) => handleRevenueSourceChange("grantsContributions", v)}
            icon={<Gift className="h-5 w-5" />}
            title="Grants & Contributions"
            description="Grants, donations, fundraising, philanthropy"
          />
        </div>
        {fundingError && !revenueSources?.tuition && !revenueSources?.publicFunding && !revenueSources?.schoolChoice && !revenueSources?.grantsContributions && (
          <div className="flex items-center gap-2 mt-3 text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm font-medium">Please select at least one revenue source</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {schoolStage === "operating_school" && (
          <>
            <FormInput 
              name="schoolProfile.openingYear" 
              label="Year School Opened" 
              type="number"
              placeholder="2020"
            />
            <FormInput 
              name="schoolProfile.currentStudents" 
              label="Current Enrollment" 
              type="number"
              placeholder="0"
              helperText="Number of students currently enrolled"
            />
          </>
        )}

        <FormInput 
          name="schoolProfile.maxCapacity" 
          label="Maximum Facility Capacity" 
          type="number"
          placeholder="150"
          helperText="Max students your building can hold"
          className={schoolStage === "new_school" ? "" : "md:col-span-2"}
        />
      </div>

      {isPrivate && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Accreditation</h3>
          <div className="space-y-4">
            <FormCheckbox
              name="schoolProfile.isAccredited"
              label="Is your school accredited?"
              helperText="Accreditation status can be important for financial planning and compliance"
            />
            {isAccredited && (
              <div className="max-w-md">
                <FormInput
                  name="schoolProfile.accreditingBody"
                  label="Accrediting Body"
                  placeholder="e.g., SACS, NAIS, AdvancED"
                  helperText="Name of the accrediting organization"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Entity Type</h3>
        <p className="text-sm text-muted-foreground mb-4">This helps us use the right financial terminology in your model and reports.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormSelect
            name="schoolProfile.entityType"
            label="Entity Type"
            options={Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          {entityType && entityType !== "sole_practitioner" && (
            <EINInput />
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Fiscal Year</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormSelect
            name="schoolProfile.fiscalYearStartMonth"
            label="Fiscal Year Start Month"
            options={MONTHS}
            valueAsNumber
            helperText="Most schools use July (Jul-Jun fiscal year)"
          />

          <div className="flex flex-col gap-4 justify-center">
            <FormCheckbox
              name="schoolProfile.isPartialFirstYear"
              label="Year 1 is a partial year"
              helperText="Check if your school opens mid-fiscal-year"
            />
          </div>

          {isPartialFirstYear && (
            <FormInput
              name="schoolProfile.year1OperatingMonths"
              label="Year 1 Operating Months"
              type="number"
              placeholder="10"
              helperText="Number of months the school operates in Year 1"
            />
          )}
        </div>
      </div>

      {schoolStage === "operating_school" && operatingYear === "first_year" && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Current Year Projections</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Your current year numbers give us real data to pressure test your projections and build a stronger financial story for lenders.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput
              name="currentYearProjection.currentEnrollment"
              label="Current Enrollment"
              type="number"
              placeholder="0"
              helperText="Students currently enrolled"
            />
            <FormInput
              name="currentYearProjection.monthsCompleted"
              label="Months of Operation Completed"
              type="number"
              placeholder="8"
              helperText="How many months have you been open?"
            />
            <FormInput
              name="currentYearProjection.projectedRevenue"
              label="Projected End-of-Year Revenue"
              type="number"
              prefix="$"
              placeholder="0"
              helperText="Your best estimate for total revenue this school year"
            />
            <FormInput
              name="currentYearProjection.projectedExpenses"
              label="Projected End-of-Year Expenses"
              type="number"
              prefix="$"
              placeholder="0"
              helperText="Your best estimate for total expenses this school year"
            />
            <FormInput
              name="currentYearProjection.currentCash"
              label="Current Cash on Hand"
              type="number"
              prefix="$"
              placeholder="0"
            />
          </div>
        </div>
      )}

      {schoolStage === "operating_school" && operatingYear === "second_year_plus" && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Prior-Year Actuals</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Last year's real numbers are the foundation for credible projections — they help us stress-test assumptions and give lenders confidence in your plan.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput
              name="priorYearSnapshot.endingEnrollment"
              label="Prior-Year Ending Enrollment"
              type="number"
              placeholder="0"
            />
            <FormInput
              name="priorYearSnapshot.totalRevenue"
              label="Prior-Year Total Revenue"
              type="number"
              prefix="$"
              placeholder="0"
            />
            <FormInput
              name="priorYearSnapshot.totalExpenses"
              label="Prior-Year Total Expenses"
              type="number"
              prefix="$"
              placeholder="0"
            />
            <FormInput
              name="priorYearSnapshot.endingCash"
              label="Prior-Year Ending Cash"
              type="number"
              prefix="$"
              placeholder="0"
            />
          </div>
        </div>
      )}

      {schoolStage && (
        <div className="bg-secondary/50 rounded-2xl p-5 border border-border">
          <p className="text-sm font-medium text-foreground mb-1">Planning Horizon</p>
          <p className="text-sm text-muted-foreground">
            {schoolStage === "new_school"
              ? "Your model will project 5 years (Year 1 through Year 5)."
              : "Your model will project 5 years (Current Year through Year 5)."}
          </p>
        </div>
      )}
    </div>
  );
}
