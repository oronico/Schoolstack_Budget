import { useFormContext } from "react-hook-form";
import { FormInput, FormSelect, FormCheckbox } from "@/components/ui/form-inputs";

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

export function SchoolProfileStep() {
  const { watch } = useFormContext();
  const isPartialFirstYear = watch("schoolProfile.isPartialFirstYear");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">School Profile</h2>
        <p className="text-muted-foreground text-lg">Let's start with the basics about your school.</p>
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
    </div>
  );
}
