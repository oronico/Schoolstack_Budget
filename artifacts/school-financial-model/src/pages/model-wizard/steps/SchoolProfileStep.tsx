import { useFormContext } from "react-hook-form";
import { FormInput, FormSelect, FormCheckbox } from "@/components/ui/form-inputs";
import { Building2, Rocket, GraduationCap, Landmark, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

function RadioCard({ selected, onSelect, icon, title, description }: RadioCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all w-full",
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
  const fundingProfile = watch("schoolProfile.fundingProfile");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">School Profile</h2>
        <p className="text-muted-foreground text-lg">Let's start with the basics about your school.</p>
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
        <div className="grid grid-cols-1 gap-4">
          <RadioCard
            value="tuition_based"
            selected={fundingProfile === "tuition_based"}
            onSelect={() => setValue("schoolProfile.fundingProfile", "tuition_based", { shouldDirty: true })}
            icon={<GraduationCap className="h-5 w-5" />}
            title="Tuition-based"
            description="Primarily funded through tuition, fees, and family payments"
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
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormInput 
          name="schoolProfile.schoolName" 
          label="School Name" 
          placeholder="e.g., Summit Academy"
          className="md:col-span-2"
        />
        
        <FormSelect
          name="schoolProfile.schoolType"
          label="School Type"
          options={[
            { value: "microschool", label: "Microschool" },
            { value: "private_school", label: "Traditional Private School" },
            { value: "charter_school", label: "Charter School" },
            { value: "other", label: "Other" }
          ]}
        />
        
        <FormSelect
          name="schoolProfile.state"
          label="State"
          options={STATES}
        />

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
            Optional: Enter last year's actuals to provide context for your projections. This helps our consultant give more relevant guidance.
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
              ? "Your model will project 3 years (Year 1, Year 2, Year 3). You can extend to 5 years later."
              : "Your model will project 4 years (Current Year, Year 2, Year 3, Year 4). You can extend to 5 years later."}
          </p>
        </div>
      )}
    </div>
  );
}
