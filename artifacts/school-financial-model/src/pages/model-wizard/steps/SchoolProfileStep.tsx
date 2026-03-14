import { FormInput, FormSelect } from "@/components/ui/form-inputs";

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

export function SchoolProfileStep() {
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
    </div>
  );
}
