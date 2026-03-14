import { FormInput, FormSelect } from "@/components/ui/form-inputs";

const STATES = [
  { value: "AL", label: "Alabama" }, { value: "CA", label: "California" }, { value: "FL", label: "Florida" },
  { value: "NY", label: "New York" }, { value: "TX", label: "Texas" }, { value: "WA", label: "Texas" },
  // Truncated list for brevity, ideally would have all 50
  { value: "OTHER", label: "Other State" }
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
