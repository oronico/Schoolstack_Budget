import { FormInput } from "@/components/ui/form-inputs";
import { Settings, Lightbulb } from "lucide-react";
import { SectionExplainers } from "@/components/coaching/SectionExplainers";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";

export function FacilitiesStep({ jumpToStep }: { jumpToStep?: (s: number) => void }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Operations & Expenses</h2>
        <p className="text-muted-foreground text-lg">Define your facility costs, student services, and any outstanding debt. If you're not sure about some of these numbers yet, use your best estimate — you can always come back and update them.</p>
      </div>

      <SectionExplainers section="facilities" />

      <div className="flex items-center gap-2.5 rounded-xl bg-teal-50/60 border border-teal-200 px-4 py-3">
        <Settings className="h-4 w-4 text-teal-700 flex-shrink-0" />
        <p className="text-sm text-teal-800">
          Cost escalation rates (COLA, inflation, rent escalation) are configured on the{" "}
          {jumpToStep ? (
            <button type="button" onClick={() => jumpToStep(2)} className="font-semibold text-teal-900 underline underline-offset-2 hover:text-primary transition-colors">
              Assumptions step
            </button>
          ) : (
            <span className="font-semibold text-teal-900">Assumptions step</span>
          )}.
        </p>
      </div>

      <div className="space-y-8">
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
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50/60 border border-amber-200/60 px-3 py-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">Common pitfall:</span> Budgeting $0 for maintenance. Every building needs upkeep — even leased spaces. Plan for at least $2,000-5,000/year for a small school, more for older buildings.
            </p>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50/60 border border-amber-200/60 px-3 py-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">Insurance tip:</span> School insurance typically escalates 5-8% per year. Get quotes from brokers who specialize in schools — they'll know the coverage your state requires. Every school needs insurance — don't skip this line item.
            </p>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50/60 border border-amber-200/60 px-3 py-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">Utility deposits:</span> Many utility providers require upfront deposits of $500-2,000 for new commercial accounts. Budget for connection fees, security deposits, and first/last month payments — these hit before your first student walks in the door.
            </p>
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
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50/60 border border-amber-200/60 px-3 py-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">Transportation note:</span> Check whether your state or authorizer requires you to provide transportation. Bus contracts typically lock in for a full year regardless of ridership — budget $800-2,000 per student annually for full service.
            </p>
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
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50/60 border border-amber-200/60 px-3 py-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">PD matters:</span> Budget at least $500 per staff member for professional development. Schools that skip PD see higher teacher turnover — which costs far more than training. Investing in your team signals quality leadership.
            </p>
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
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50/60 border border-amber-200/60 px-3 py-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold"><GlossaryTerm termKey="dscr">DSCR</GlossaryTerm> check:</span> If you have a loan, aim for a Debt Service Coverage Ratio of at least 1.15-1.2x — meaning your operating cash flow should be 15-20% more than your annual debt payments. Below 1.0x means operations alone can't cover the loan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
