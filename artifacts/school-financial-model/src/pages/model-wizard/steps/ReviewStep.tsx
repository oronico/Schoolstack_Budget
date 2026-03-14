import { useFormContext } from "react-hook-form";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Edit2 } from "lucide-react";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function ReviewStep({ jumpToStep }: { jumpToStep: (step: number) => void, modelId?: number }) {
  const { getValues } = useFormContext();
  const data = getValues();

  const Section = ({ title, step, children }: { title: string, step: number, children: React.ReactNode }) => (
    <div className="mb-8 bg-background rounded-2xl p-6 border border-border">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <h3 className="font-display font-bold text-xl">{title}</h3>
        <button 
          onClick={() => jumpToStep(step)}
          className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Edit2 className="h-4 w-4" /> Edit
        </button>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {children}
      </dl>
    </div>
  );

  const Item = ({ label, value }: { label: string, value: string | number | undefined }) => (
    <div className="flex flex-col">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold text-foreground mt-1">{value !== undefined ? value : '-'}</dd>
    </div>
  );

  const fyMonth = data.schoolProfile?.fiscalYearStartMonth || 7;

  return (
    <div>
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Review Your Assumptions</h2>
        <p className="text-muted-foreground text-lg mb-8">Make sure everything looks correct before generating your financial model.</p>
      </div>

      <Section title="School Profile" step={1}>
        <Item label="School Name" value={data.schoolProfile?.schoolName} />
        <Item label="Type" value={data.schoolProfile?.schoolType?.replace('_', ' ')} />
        <Item label="State" value={data.schoolProfile?.state} />
        <Item label="Opening Year" value={data.schoolProfile?.openingYear} />
        <Item label="Current Students" value={data.schoolProfile?.currentStudents} />
        <Item label="Max Capacity" value={data.schoolProfile?.maxCapacity} />
        <Item label="Fiscal Year Start" value={MONTH_NAMES[fyMonth] || "July"} />
        {data.schoolProfile?.isPartialFirstYear && (
          <Item label="Year 1 Operating Months" value={data.schoolProfile?.year1OperatingMonths || 12} />
        )}
      </Section>

      <Section title="Enrollment" step={2}>
        <Item label="Year 1" value={data.enrollment?.year1} />
        <Item label="Year 2" value={data.enrollment?.year2} />
        <Item label="Year 3" value={data.enrollment?.year3} />
        <Item label="Year 4" value={data.enrollment?.year4} />
        <Item label="Year 5" value={data.enrollment?.year5} />
      </Section>

      <Section title="Revenue" step={3}>
        <Item label="Tuition per Student" value={formatCurrency(data.revenue?.tuitionPerStudent)} />
        <Item label="Annual Tuition Increase" value={formatPercent(data.revenue?.annualTuitionIncrease)} />
        <Item label="Scholarship Rate" value={formatPercent(data.revenue?.scholarshipRate)} />
        <Item label="Other Fees per Student" value={formatCurrency(data.revenue?.otherRevenuePerStudent)} />
        <Item label="ESA / Voucher per Student" value={formatCurrency(data.revenue?.esaRevenuePerStudent)} />
        <Item label="Public Funding per Student" value={formatCurrency(data.revenue?.publicFundingPerStudent)} />
        <Item label="Annual Donations" value={formatCurrency(data.revenue?.annualDonations)} />
        <Item label="Foundation Grants" value={formatCurrency(data.revenue?.foundationGrants)} />
        <Item label="Capital Gifts" value={formatCurrency(data.revenue?.capitalGifts)} />
      </Section>

      <Section title="Staffing" step={4}>
        <Item label="Target Ratio" value={`1:${data.staffing?.studentsPerTeacher || 0}`} />
        <Item label="Teacher Salary" value={formatCurrency(data.staffing?.teacherSalary)} />
        <Item label="Admin Staff" value={data.staffing?.adminStaffCount} />
        <Item label="Admin Salary" value={formatCurrency(data.staffing?.adminSalary)} />
        <Item label="Founder Salary" value={formatCurrency(data.staffing?.founderSalary)} />
        <Item label="Benefits Rate" value={formatPercent(data.staffing?.benefitsRate)} />
      </Section>

      <Section title="Operations & Expenses" step={5}>
        <Item label="Annual Salary Increase" value={formatPercent(data.facilities?.annualSalaryIncrease)} />
        <Item label="General Cost Inflation" value={formatPercent(data.facilities?.generalCostInflation)} />
        <Item label="Monthly Rent" value={formatCurrency(data.facilities?.monthlyRent)} />
        <Item label="Rent Escalation" value={formatPercent(data.facilities?.annualRentIncrease)} />
        <Item label="Utilities" value={formatCurrency(data.facilities?.annualUtilities)} />
        <Item label="Insurance" value={formatCurrency(data.facilities?.annualInsurance)} />
        <Item label="Maintenance" value={formatCurrency(data.facilities?.facilityMaintenance)} />
        <Item label="Curriculum / Student" value={formatCurrency(data.facilities?.curriculumCostPerStudent)} />
        <Item label="Technology / Student" value={formatCurrency(data.facilities?.techCostPerStudent)} />
        <Item label="Food Service / Student" value={formatCurrency(data.facilities?.foodServicePerStudent)} />
        <Item label="Transportation" value={formatCurrency(data.facilities?.transportationAnnual)} />
        <Item label="Student Services" value={formatCurrency(data.facilities?.studentServicesAnnual)} />
        <Item label="Marketing" value={formatCurrency(data.facilities?.annualMarketing)} />
        <Item label="Professional Development" value={formatCurrency(data.facilities?.professionalDevelopment)} />
        <Item label="Other Overhead" value={formatCurrency(data.facilities?.otherAnnualExpenses)} />
        {(data.facilities?.loanAmount > 0) && (
          <>
            <Item label="Loan Amount" value={formatCurrency(data.facilities?.loanAmount)} />
            <Item label="Interest Rate" value={formatPercent(data.facilities?.annualInterestRate)} />
            <Item label="Loan Term" value={`${data.facilities?.loanTermYears || 0} years`} />
          </>
        )}
      </Section>
    </div>
  );
}
