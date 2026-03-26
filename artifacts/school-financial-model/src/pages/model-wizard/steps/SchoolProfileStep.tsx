import { useEffect, useMemo, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { FormInput, FormSelect, FormCheckbox, getNestedError } from "@/components/ui/form-inputs";
import { Building2, Rocket, AlertCircle, MapPin, Home, Key, HelpCircle, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHOOL_TYPE_LABELS, ENTITY_TYPE_LABELS, isForProfit } from "../schema";

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




const FACILITY_BENCHMARKS: Record<string, string> = {
  microschool: "$1,500–$4,000/mo",
  learning_pod: "$800–$2,500/mo",
  private_school: "$5,000–$15,000/mo",
  charter_school: "$8,000–$25,000/mo",
  homeschool_coop: "$500–$2,000/mo",
  tutoring_center: "$1,500–$4,000/mo",
  other: "$2,000–$8,000/mo",
};

const CURRENT_YEAR = new Date().getFullYear();
const LEASE_EXPIRATION_YEARS = Array.from({ length: 15 }, (_, i) => ({
  value: String(CURRENT_YEAR + i),
  label: String(CURRENT_YEAR + i),
}));

export function SchoolProfileStep() {
  const { watch, setValue } = useFormContext();
  const isPartialFirstYear = watch("schoolProfile.isPartialFirstYear");
  const schoolStage = watch("schoolProfile.schoolStage");
  const operatingYear = watch("schoolProfile.operatingYear");
  const schoolType = watch("schoolProfile.schoolType");
  const entityType = watch("schoolProfile.entityType");
  const isAccredited = watch("schoolProfile.isAccredited");
  const lendingLabIntent = watch("schoolProfile.lendingLabIntent");

  const locationSecured = watch("schoolProfile.locationSecured");
  const ownershipType = watch("schoolProfile.ownershipType");
  const isNNNLease = watch("schoolProfile.isNNNLease");
  const hasMortgage = watch("schoolProfile.hasMortgage");
  const forProfit = isForProfit(entityType);

  const isCharter = schoolType === "charter_school";
  const isPrivate = schoolType === "private_school";

  const allowedEntityTypes = useMemo(() => {
    const all = Object.entries(ENTITY_TYPE_LABELS);
    if (isCharter || isPrivate || schoolType === "homeschool_coop") {
      return all.filter(([v]) => v !== "sole_practitioner");
    }
    return all;
  }, [schoolType, isCharter, isPrivate]);

  useEffect(() => {
    if (!schoolType || !entityType) return;
    const allowed = allowedEntityTypes.map(([v]) => v);
    if (!allowed.includes(entityType)) {
      setValue("schoolProfile.entityType", undefined);
    }
  }, [schoolType, entityType, allowedEntityTypes, setValue]);

  const prevLocationSecured = useRef(locationSecured);
  useEffect(() => {
    if (prevLocationSecured.current && !locationSecured) {
      setValue("schoolProfile.ownershipType", undefined, { shouldDirty: true });
      setValue("schoolProfile.facilityStreet", "", { shouldDirty: true });
      setValue("schoolProfile.facilityCity", "", { shouldDirty: true });
      setValue("schoolProfile.facilityState", "", { shouldDirty: true });
      setValue("schoolProfile.facilityZip", "", { shouldDirty: true });
      setValue("schoolProfile.monthlyRent", 0, { shouldDirty: true });
      setValue("schoolProfile.isNNNLease", false, { shouldDirty: true });
      setValue("schoolProfile.hasMortgage", false, { shouldDirty: true });
    }
    if (!prevLocationSecured.current && locationSecured) {
      setValue("schoolProfile.estimatedMonthlyFacilityBudget", 0, { shouldDirty: true });
    }
    prevLocationSecured.current = locationSecured;
  }, [locationSecured, setValue]);

  const schoolState = watch("schoolProfile.state");
  const facilityState = watch("schoolProfile.facilityState");
  useEffect(() => {
    if (locationSecured && schoolState && !facilityState) {
      setValue("schoolProfile.facilityState", schoolState, { shouldDirty: true });
    }
  }, [locationSecured, schoolState, facilityState, setValue]);

  const prevOwnership = useRef(ownershipType);
  useEffect(() => {
    if (prevOwnership.current !== ownershipType) {
      if (ownershipType === "own") {
        setValue("schoolProfile.monthlyRent", 0, { shouldDirty: true });
        setValue("schoolProfile.isNNNLease", false, { shouldDirty: true });
        setValue("schoolProfile.nnnCamCharges", 0, { shouldDirty: true });
        setValue("schoolProfile.nnnMaintenance", 0, { shouldDirty: true });
        setValue("schoolProfile.nnnUtilities", 0, { shouldDirty: true });
      }
      if (ownershipType === "rent") {
        setValue("schoolProfile.propertyTaxAnnual", 0, { shouldDirty: true });
        setValue("schoolProfile.hasMortgage", false, { shouldDirty: true });
        setValue("schoolProfile.mortgageMonthlyPayment", 0, { shouldDirty: true });
      }
      prevOwnership.current = ownershipType;
    }
  }, [ownershipType, setValue]);

  const { formState: { errors } } = useFormContext();
  const stageError = getNestedError(errors, "schoolProfile.schoolStage");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Tell Us About Your School</h2>
        <p className="text-muted-foreground text-lg">We'll tailor everything to your school's type, stage, and structure. There are no wrong answers here - just tell us where you are today, and we'll meet you there.</p>
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
        <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl", stageError && "ring-2 ring-destructive/50 p-1")}>
          <RadioCard
            value="new_school"
            selected={schoolStage === "new_school"}
            onSelect={() => setValue("schoolProfile.schoolStage", "new_school", { shouldDirty: true, shouldValidate: true })}
            icon={<Rocket className="h-5 w-5" />}
            title="We're planning a new school"
            description="We do not currently enroll students and are planning to open"
          />
          <RadioCard
            value="operating_school"
            selected={schoolStage === "operating_school"}
            onSelect={() => setValue("schoolProfile.schoolStage", "operating_school", { shouldDirty: true, shouldValidate: true })}
            icon={<Building2 className="h-5 w-5" />}
            title="We're already operating"
            description="We currently enroll students and are planning ahead"
          />
        </div>

        {stageError && (
          <div className="flex items-center gap-2 mt-3 text-destructive" data-error="true">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p className="text-sm font-medium">{stageError}</p>
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
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4 flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" /> Are you building this model to support a Lending Lab microloan application?
        </h3>
        <div className="space-y-3">
          <RadioCard
            value="plan_to_apply"
            selected={lendingLabIntent === "plan_to_apply"}
            onSelect={() => setValue("schoolProfile.lendingLabIntent", "plan_to_apply", { shouldDirty: true })}
            icon={<Rocket className="h-5 w-5" />}
            title="Yes, I plan to apply"
            description="I'm preparing my model for a Lending Lab microloan application"
          />
          <RadioCard
            value="want_to_understand"
            selected={lendingLabIntent === "want_to_understand"}
            onSelect={() => setValue("schoolProfile.lendingLabIntent", "want_to_understand", { shouldDirty: true })}
            icon={<HelpCircle className="h-5 w-5" />}
            title="Maybe - I want to understand what would be needed"
            description="I'd like to see what a lender-ready model looks like"
          />
          <RadioCard
            value="budget_only"
            selected={lendingLabIntent === "budget_only"}
            onSelect={() => setValue("schoolProfile.lendingLabIntent", "budget_only", { shouldDirty: true })}
            icon={<Building2 className="h-5 w-5" />}
            title="No, I'm building a budget/model only"
            description="I just need a financial plan for my school"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-3 italic">
          Selecting yes helps tailor your export and next steps. It does not submit a loan application.
        </p>
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

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" /> Facility & Location
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Your facility situation affects how we project expenses - especially rent escalation, lease renewals, and property costs.
        </p>

        <div className="space-y-5">
          <FormCheckbox
            name="schoolProfile.locationSecured"
            label="I have a location secured (signed lease or owned property)"
            helperText="If not, we'll ask for an estimate so your model still works"
          />

          {!locationSecured && (
            <div className="rounded-2xl border border-border bg-secondary/30 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <HelpCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm text-foreground">
                  <span className="font-semibold">No worries - an estimate is fine.</span>{" "}
                  {schoolType && FACILITY_BENCHMARKS[schoolType]
                    ? `Most ${SCHOOL_TYPE_LABELS[schoolType]?.toLowerCase() || "school"}s budget around ${FACILITY_BENCHMARKS[schoolType]} for rent.`
                    : "Most small schools budget $2,000–$8,000/month for facility costs."}
                </div>
              </div>
              <FormInput
                name="schoolProfile.estimatedMonthlyFacilityBudget"
                label="Estimated Monthly Facility Budget"
                type="number"
                prefix="$"
                placeholder="3000"
                helperText="Your best guess for monthly rent + utilities. We'll flag this as an estimate in your model."
              />
            </div>
          )}

          {locationSecured && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <FormInput
                    name="schoolProfile.facilityStreet"
                    label="Street Address"
                    placeholder="123 Main St"
                  />
                </div>
                <FormInput
                  name="schoolProfile.facilityCity"
                  label="City"
                  placeholder="Springfield"
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormSelect
                    name="schoolProfile.facilityState"
                    label="State"
                    options={STATES}
                  />
                  <FormInput
                    name="schoolProfile.facilityZip"
                    label="ZIP Code"
                    placeholder="62701"
                  />
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-foreground mb-3">Do you own or rent your space?</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <RadioCard
                    value="own"
                    selected={ownershipType === "own"}
                    onSelect={() => setValue("schoolProfile.ownershipType", "own", { shouldDirty: true })}
                    icon={<Home className="h-5 w-5" />}
                    title="We own our space"
                    description="Purchased property or building"
                  />
                  <RadioCard
                    value="rent"
                    selected={ownershipType === "rent"}
                    onSelect={() => setValue("schoolProfile.ownershipType", "rent", { shouldDirty: true })}
                    icon={<Key className="h-5 w-5" />}
                    title="We rent / lease"
                    description="Renting or leasing a space"
                  />
                </div>
              </div>

              {ownershipType === "own" && (
                <div className="rounded-2xl border border-border bg-secondary/30 p-5 space-y-4">
                  {forProfit && (
                    <FormInput
                      name="schoolProfile.propertyTaxAnnual"
                      label="Annual Property Tax"
                      type="number"
                      prefix="$"
                      placeholder="5000"
                      helperText="As a for-profit entity, property tax will be added to your expenses automatically"
                    />
                  )}
                  <FormCheckbox
                    name="schoolProfile.hasMortgage"
                    label="We have a mortgage on this property"
                  />
                  {hasMortgage && (
                    <FormInput
                      name="schoolProfile.mortgageMonthlyPayment"
                      label="Monthly Mortgage Payment"
                      type="number"
                      prefix="$"
                      placeholder="2500"
                    />
                  )}
                  {!forProfit && !hasMortgage && (
                    <p className="text-sm text-muted-foreground italic">
                      Great - owning your space with no mortgage means lower facility costs in your model.
                    </p>
                  )}
                </div>
              )}

              {ownershipType === "rent" && (
                <div className="rounded-2xl border border-border bg-secondary/30 p-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput
                      name="schoolProfile.monthlyRent"
                      label="Monthly Rent"
                      type="number"
                      prefix="$"
                      placeholder="5000"
                    />
                    <FormInput
                      name="schoolProfile.annualRentEscalation"
                      label="Annual Rent Escalation %"
                      type="number"
                      placeholder="3"
                      helperText="Typical: 2–5% per year"
                    />
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-3">When does your lease expire?</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      This matters - for years beyond your lease, we'll model a conservative rent increase to reflect renewal risk.
                    </p>
                    <div className="grid grid-cols-2 gap-4 max-w-sm">
                      <FormSelect
                        name="schoolProfile.leaseExpirationMonth"
                        label="Month"
                        options={MONTHS}
                        valueAsNumber
                      />
                      <FormSelect
                        name="schoolProfile.leaseExpirationYear"
                        label="Year"
                        options={LEASE_EXPIRATION_YEARS}
                        valueAsNumber
                      />
                    </div>
                  </div>

                  <FormInput
                    name="schoolProfile.postLeaseRenewalBump"
                    label="Post-Lease Renewal Rent Increase %"
                    type="number"
                    placeholder="15"
                    helperText="When your lease expires, how much higher might rent be? Default 15% reflects market renewal risk."
                  />

                  <div className="border-t border-border pt-4">
                    <FormCheckbox
                      name="schoolProfile.isNNNLease"
                      label="This is a Triple Net (NNN) lease"
                      helperText="NNN leases mean you're responsible for property taxes, maintenance, and utilities on top of base rent"
                    />
                  </div>

                  {isNNNLease && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-0">
                      <FormInput
                        name="schoolProfile.nnnCamCharges"
                        label="Monthly CAM Charges"
                        type="number"
                        prefix="$"
                        placeholder="500"
                        helperText="Common area maintenance"
                      />
                      <FormInput
                        name="schoolProfile.nnnMaintenance"
                        label="Monthly Maintenance"
                        type="number"
                        prefix="$"
                        placeholder="300"
                        helperText="Repairs & upkeep"
                      />
                      <FormInput
                        name="schoolProfile.nnnUtilities"
                        label="Monthly Utilities"
                        type="number"
                        prefix="$"
                        placeholder="400"
                        helperText="Electric, water, gas"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
            options={allowedEntityTypes.map(([value, label]) => ({ value, label }))}
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
            Last year's real numbers are the foundation for credible projections - they help us stress-test assumptions and give lenders confidence in your plan.
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
