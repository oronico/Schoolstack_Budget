import { FormInput } from "@/components/ui/form-inputs";

export function RevenueStep() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Revenue Assumptions</h2>
        <p className="text-muted-foreground text-lg">What do families typically pay, and what other funding do you receive?</p>
      </div>

      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormInput 
            name="revenue.tuitionPerStudent" 
            label="Annual Tuition per Student" 
            type="number"
            prefix="$"
            placeholder="8500"
          />
          
          <FormInput 
            name="revenue.scholarshipRate" 
            label="Scholarship/Discount Rate" 
            type="number"
            suffix="%"
            placeholder="15"
            helperText="% of total tuition awarded as scholarships"
          />
        </div>

        <hr className="border-border" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormInput 
            name="revenue.esaRevenuePerStudent" 
            label="ESA/Voucher Funding per Student" 
            type="number"
            prefix="$"
            placeholder="0"
            helperText="State funding per eligible student"
          />
          
          <FormInput 
            name="revenue.otherRevenuePerStudent" 
            label="Other Revenue per Student" 
            type="number"
            prefix="$"
            placeholder="250"
            helperText="Fees, aftercare, uniforms, etc."
          />
          
          <FormInput 
            name="revenue.annualFundraising" 
            label="Annual Fundraising Target" 
            type="number"
            prefix="$"
            placeholder="25000"
            className="md:col-span-2"
            helperText="Total expected from donations and grants each year"
          />
        </div>
      </div>
    </div>
  );
}
