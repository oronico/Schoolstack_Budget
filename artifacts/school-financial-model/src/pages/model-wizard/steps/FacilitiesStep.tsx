import { FormInput } from "@/components/ui/form-inputs";

export function FacilitiesStep() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Facilities & Operations</h2>
        <p className="text-muted-foreground text-lg">Define your building and operating overhead costs.</p>
      </div>

      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Facility</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="facilities.monthlyRent" 
              label="Monthly Lease/Rent" 
              type="number"
              prefix="$"
              placeholder="5000"
            />
            
            <FormInput 
              name="facilities.annualRentIncrease" 
              label="Annual Rent Escalation" 
              type="number"
              suffix="%"
              placeholder="3"
            />
            
            <FormInput 
              name="facilities.annualUtilities" 
              label="Annual Utilities" 
              type="number"
              prefix="$"
              placeholder="8000"
            />

            <FormInput 
              name="facilities.annualInsurance" 
              label="Annual Insurance" 
              type="number"
              prefix="$"
              placeholder="3500"
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Operations (Per Student)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="facilities.curriculumCostPerStudent" 
              label="Curriculum & Supplies (per student)" 
              type="number"
              prefix="$"
              placeholder="300"
            />
            
            <FormInput 
              name="facilities.techCostPerStudent" 
              label="Technology (per student)" 
              type="number"
              prefix="$"
              placeholder="150"
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Other Overhead</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="facilities.annualMarketing" 
              label="Annual Marketing & Admissions" 
              type="number"
              prefix="$"
              placeholder="5000"
            />
            
            <FormInput 
              name="facilities.otherAnnualExpenses" 
              label="Other Annual Overhead" 
              type="number"
              prefix="$"
              placeholder="10000"
              helperText="Legal, accounting, software, etc."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
