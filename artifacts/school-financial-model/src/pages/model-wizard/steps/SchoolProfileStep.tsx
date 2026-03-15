import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { FormInput, FormSelect, FormCheckbox } from "@/components/ui/form-inputs";
import { Building2, Rocket, GraduationCap, Landmark, Shuffle, Briefcase, Scale, Users, Building, FileText, Heart, Info } from "lucide-react";
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

function CompactRadioCard({ selected, onSelect, icon, title }: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all w-full",
        selected
          ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
          : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.02]"
      )}
    >
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
        selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
      )}>
        {icon}
      </div>
      <p className={cn("font-semibold text-sm flex-1", selected ? "text-primary" : "text-foreground")}>{title}</p>
      <div className={cn(
        "flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center",
        selected ? "border-primary" : "border-border"
      )}>
        {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
      </div>
    </button>
  );
}

const ENTITY_TYPES = [
  { value: "sole_practitioner", icon: <Briefcase className="h-4 w-4" /> },
  { value: "llc_single", icon: <FileText className="h-4 w-4" /> },
  { value: "llc_partnership", icon: <Users className="h-4 w-4" /> },
  { value: "c_corp", icon: <Building className="h-4 w-4" /> },
  { value: "s_corp", icon: <Scale className="h-4 w-4" /> },
  { value: "nonprofit_501c3", icon: <Heart className="h-4 w-4" /> },
];

export function SchoolProfileStep() {
  const { watch, setValue } = useFormContext();
  const isPartialFirstYear = watch("schoolProfile.isPartialFirstYear");
  const schoolStage = watch("schoolProfile.schoolStage");
  const fundingProfile = watch("schoolProfile.fundingProfile");
  const schoolType = watch("schoolProfile.schoolType");
  const entityType = watch("schoolProfile.entityType");
  const isAccredited = watch("schoolProfile.isAccredited");
  const hasManagementFee = watch("schoolProfile.hasManagementFee");

  const isCharter = schoolType === "charter_school";
  const isPrivate = schoolType === "private_school";

  useEffect(() => {
    if (isCharter && fundingProfile !== "charter_public_funded") {
      setValue("schoolProfile.fundingProfile", "charter_public_funded", { shouldDirty: true });
    }
  }, [isCharter, fundingProfile, setValue]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Tell Us About Your School</h2>
        <p className="text-muted-foreground text-lg">We'll tailor everything to your school's type, stage, and funding model.</p>
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
            title="We're starting a new school"
            description="Planning to open or in our first year of operation"
          />
          <RadioCard
            value="operating_school"
            selected={schoolStage === "operating_school"}
            onSelect={() => setValue("schoolProfile.schoolStage", "operating_school", { shouldDirty: true })}
            icon={<Building2 className="h-5 w-5" />}
            title="We're already operating"
            description="Currently serving students and planning ahead"
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">How is your school funded?</h3>
        {isCharter && (
          <div className="flex items-start gap-2 mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-700">Charter schools are automatically set to Charter / Public-funded. Tuition and ESA revenue categories are not applicable.</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4">
          <RadioCard
            value="tuition_based"
            selected={fundingProfile === "tuition_based"}
            onSelect={() => setValue("schoolProfile.fundingProfile", "tuition_based", { shouldDirty: true })}
            icon={<GraduationCap className="h-5 w-5" />}
            title="Tuition-based"
            description="Primarily funded through tuition, fees, and family payments"
            disabled={isCharter}
          />
          <RadioCard
            value="charter_public_funded"
            selected={fundingProfile === "charter_public_funded"}
            onSelect={() => setValue("schoolProfile.fundingProfile", "charter_public_funded", { shouldDirty: true })}
            icon={<Landmark className="h-5 w-5" />}
            title="Charter / Public-funded"
            description="Primarily funded through state, federal, or local per-pupil revenue"
          />
          <RadioCard
            value="hybrid_mixed"
            selected={fundingProfile === "hybrid_mixed"}
            onSelect={() => setValue("schoolProfile.fundingProfile", "hybrid_mixed", { shouldDirty: true })}
            icon={<Shuffle className="h-5 w-5" />}
            title="Hybrid / Mixed funding"
            description="A combination of tuition, public funding, ESA/vouchers, and contributions"
            disabled={isCharter}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormInput 
          name="schoolProfile.openingYear" 
          label="Opening Year" 
          type="number"
          placeholder="2025"
        />

        <FormInput 
          name="schoolProfile.currentStudents" 
          label="Current Students (if open)" 
          type="number"
          placeholder="0"
          helperText="Leave 0 if not yet open"
        />

        <FormInput 
          name="schoolProfile.maxCapacity" 
          label="Maximum Facility Capacity" 
          type="number"
          placeholder="150"
          helperText="Max students your building can hold"
          className="md:col-span-2"
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
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Management Fee</h3>
        <div className="space-y-4">
          <FormCheckbox
            name="schoolProfile.hasManagementFee"
            label="Does your school pay a management fee to a network or back-office organization?"
            helperText="Common for schools that are part of a charter network or management organization"
          />
          {hasManagementFee && (
            <div className="max-w-sm">
              <FormInput
                name="schoolProfile.managementFeePercent"
                label="Management Fee (% of Revenue)"
                type="number"
                placeholder="5"
                helperText="Percentage of total revenue paid as a management fee"
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">What type of entity are you?</h3>
        <p className="text-sm text-muted-foreground mb-4">This helps us use the right financial terminology in your model and reports.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ENTITY_TYPES.map((et) => (
            <CompactRadioCard
              key={et.value}
              selected={entityType === et.value}
              onSelect={() => {
                setValue("schoolProfile.entityType", et.value, { shouldDirty: true });
                if (et.value === "sole_practitioner") {
                  setValue("schoolProfile.ein", "", { shouldDirty: true });
                }
              }}
              icon={et.icon}
              title={ENTITY_TYPE_LABELS[et.value]}
            />
          ))}
        </div>
        {entityType && entityType !== "sole_practitioner" && (
          <div className="mt-4 max-w-sm">
            <FormInput
              name="schoolProfile.ein"
              label="EIN (Employer Identification Number)"
              placeholder="XX-XXXXXXX"
            />
          </div>
        )}
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

      {schoolStage === "operating_school" && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Prior-Year Snapshot</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Optional: Enter last year's actual numbers so our consultant can compare your projections to real results.
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
