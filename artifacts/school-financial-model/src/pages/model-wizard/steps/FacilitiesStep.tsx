import { FormInput } from "@/components/ui/form-inputs";

export function FacilitiesStep() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Operations & Expenses</h2>
        <p className="text-muted-foreground text-lg">Define your facility costs, student services, and any outstanding debt. If you're not sure about some of these numbers yet, use your best estimate - you can always come back and update them.</p>
      </div>

      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Growth & Inflation</h3>
          <p className="text-sm text-muted-foreground mb-4">Annual escalation rates applied to costs over the 5-year model. Rent has its own escalation below.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="facilities.annualSalaryIncrease" 
              label="Annual Salary Increase" 
              type="number"
              suffix="%"
              placeholder="3"
              helperText="Teacher, admin, and founder salary escalation"
            />
            
            <FormInput 
              name="facilities.generalCostInflation" 
              label="General Cost Inflation" 
              type="number"
              suffix="%"
              placeholder="3"
              helperText="Applied to utilities, insurance, supplies, services"
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Facility Costs</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="facilities.monthlyRent" 
              label="Monthly Lease / Rent" 
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

            <FormInput 
              name="facilities.facilityMaintenance" 
              label="Annual Maintenance & Repairs" 
              type="number"
              prefix="$"
              placeholder="2000"
              helperText="Janitorial, repairs, grounds upkeep"
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Instructional & Per-Student Costs</h3>
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
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Student Services</h3>
          <p className="text-sm text-muted-foreground mb-4">Costs related to serving students beyond instruction.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="facilities.foodServicePerStudent" 
              label="Food / Meal Service (per student)" 
              type="number"
              prefix="$"
              placeholder="0"
              helperText="Annual per-student cost if you provide meals"
            />
            
            <FormInput 
              name="facilities.transportationAnnual" 
              label="Annual Transportation" 
              type="number"
              prefix="$"
              placeholder="0"
              helperText="Bus service, ride contracts, or stipends"
            />

            <FormInput 
              name="facilities.studentServicesAnnual" 
              label="Other Student Services" 
              type="number"
              prefix="$"
              placeholder="0"
              helperText="Counseling, special ed, health services"
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Administrative & Overhead</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="facilities.annualMarketing" 
              label="Annual Marketing & Admissions" 
              type="number"
              prefix="$"
              placeholder="5000"
            />

            <FormInput 
              name="facilities.professionalDevelopment" 
              label="Professional Development" 
              type="number"
              prefix="$"
              placeholder="2000"
              helperText="Staff training, conferences, certifications"
            />
            
            <FormInput 
              name="facilities.otherAnnualExpenses" 
              label="Other Annual Overhead" 
              type="number"
              prefix="$"
              placeholder="10000"
              helperText="Legal, accounting, software, office supplies"
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Debt Service</h3>
          <p className="text-sm text-muted-foreground mb-4">If your school has a loan for buildout, equipment, or working capital.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormInput 
              name="facilities.loanAmount" 
              label="Total Loan Amount" 
              type="number"
              prefix="$"
              placeholder="0"
            />

            <FormInput 
              name="facilities.annualInterestRate" 
              label="Annual Interest Rate" 
              type="number"
              suffix="%"
              placeholder="0"
            />

            <FormInput 
              name="facilities.loanTermYears" 
              label="Loan Term (Years)" 
              type="number"
              placeholder="0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
