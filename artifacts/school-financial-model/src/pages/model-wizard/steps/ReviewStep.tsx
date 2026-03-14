import { useFormContext } from "react-hook-form";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Edit2 } from "lucide-react";

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
        <Item label="Capacity" value={data.schoolProfile?.maxCapacity} />
      </Section>

      <Section title="Enrollment" step={2}>
        <Item label="Year 1" value={data.enrollment?.year1} />
        <Item label="Year 5" value={data.enrollment?.year5} />
      </Section>

      <Section title="Revenue" step={3}>
        <Item label="Tuition" value={formatCurrency(data.revenue?.tuitionPerStudent)} />
        <Item label="Scholarship Rate" value={formatPercent(data.revenue?.scholarshipRate)} />
        <Item label="ESA Funding" value={formatCurrency(data.revenue?.esaRevenuePerStudent)} />
        <Item label="Annual Fundraising" value={formatCurrency(data.revenue?.annualFundraising)} />
      </Section>

      <Section title="Staffing" step={4}>
        <Item label="Target Ratio" value={`1:${data.staffing?.studentsPerTeacher || 0}`} />
        <Item label="Teacher Salary" value={formatCurrency(data.staffing?.teacherSalary)} />
        <Item label="Founder Salary" value={formatCurrency(data.staffing?.founderSalary)} />
        <Item label="Benefits Rate" value={formatPercent(data.staffing?.benefitsRate)} />
      </Section>

      <Section title="Facilities & Ops" step={5}>
        <Item label="Monthly Rent" value={formatCurrency(data.facilities?.monthlyRent)} />
        <Item label="Curriculum/Student" value={formatCurrency(data.facilities?.curriculumCostPerStudent)} />
        <Item label="Annual Utilities" value={formatCurrency(data.facilities?.annualUtilities)} />
      </Section>
    </div>
  );
}
