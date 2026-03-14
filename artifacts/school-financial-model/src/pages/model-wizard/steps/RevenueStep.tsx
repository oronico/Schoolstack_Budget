import { FormInput } from "@/components/ui/form-inputs";

export function RevenueStep() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Revenue Assumptions</h2>
        <p className="text-muted-foreground text-lg">Where does your school's income come from? Include all expected revenue streams.</p>
      </div>

      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Tuition & Fees</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="revenue.tuitionPerStudent" 
              label="Annual Tuition per Student" 
              type="number"
              prefix="$"
              placeholder="8500"
              helperText="What do families typically pay each year?"
            />
            
            <FormInput 
              name="revenue.scholarshipRate" 
              label="Scholarship / Discount Rate" 
              type="number"
              suffix="%"
              placeholder="15"
              helperText="% of tuition awarded as financial aid"
            />

            <FormInput 
              name="revenue.otherRevenuePerStudent" 
              label="Other Fees per Student" 
              type="number"
              prefix="$"
              placeholder="250"
              helperText="Aftercare, uniforms, activity fees, etc."
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Public & Aid Revenue</h3>
          <p className="text-sm text-muted-foreground mb-4">Government or state-funded revenue your school is eligible for.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="revenue.esaRevenuePerStudent" 
              label="ESA / Voucher Funding per Student" 
              type="number"
              prefix="$"
              placeholder="0"
              helperText="State education savings account or voucher amount"
            />
            
            <FormInput 
              name="revenue.publicFundingPerStudent" 
              label="Per-Pupil Public Funding" 
              type="number"
              prefix="$"
              placeholder="0"
              helperText="Charter per-pupil, Title I, state aid, or IDEA funds"
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Philanthropy & Grants</h3>
          <p className="text-sm text-muted-foreground mb-4">Fundraising and donations you expect to receive each year.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="revenue.annualDonations" 
              label="Annual Donations / Individual Giving" 
              type="number"
              prefix="$"
              placeholder="15000"
              helperText="Annual fund, individual donors, recurring gifts"
            />

            <FormInput 
              name="revenue.foundationGrants" 
              label="Foundation & Corporate Grants" 
              type="number"
              prefix="$"
              placeholder="10000"
              helperText="Foundation, corporate, or government grants"
            />

            <FormInput 
              name="revenue.capitalGifts" 
              label="One-Time / Capital Gifts" 
              type="number"
              prefix="$"
              placeholder="0"
              helperText="Major gifts or capital campaign (Year 1 only in model)"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
