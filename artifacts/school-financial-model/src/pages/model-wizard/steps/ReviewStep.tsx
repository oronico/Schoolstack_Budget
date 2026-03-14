import { useFormContext } from "react-hook-form";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Edit2 } from "lucide-react";
import { useMemo } from "react";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const REVENUE_CATEGORY_LABELS: Record<string, string> = {
  tuition_and_fees: "Tuition & Student Fees",
  tuition_offsets: "Tuition Offsets",
  public_funding: "Public Funding",
  school_choice: "School Choice / Choice Funding",
  grants_contributions: "Grants, Contributions & Other Support",
  other_revenue: "Other Revenue",
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  instructional_program: "Instructional / Program",
  technology: "Technology",
  occupancy_facility: "Occupancy / Facility",
  administrative_general: "Administrative / General",
};

const FUNC_CATEGORY_LABELS: Record<string, string> = {
  school_leadership: "School Leadership",
  instructional: "Instructional",
  student_support: "Student Support",
  operations: "Operations",
  administrative: "Administrative",
  other: "Other",
};

function computeDriverValue(amounts: number[] | undefined, yearIdx: number, driverType: string, students: number): number {
  const base = amounts?.[yearIdx] ?? 0;
  switch (driverType) {
    case "monthly": return base * 12;
    case "per_student": return base * students;
    case "annual_fixed": return base;
    default: return base;
  }
}

function computeAnnualDebtService(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0 || termYears <= 0) return 0;
  if (annualRate <= 0) return principal / termYears;
  const mr = annualRate / 12;
  const months = termYears * 12;
  return (principal * (mr * Math.pow(1 + mr, months)) / (Math.pow(1 + mr, months) - 1)) * 12;
}

export function ReviewStep({ jumpToStep }: { jumpToStep: (step: number) => void, modelId?: number }) {
  const { getValues } = useFormContext();
  const data = getValues();

  const revenueRows = data.revenueRows || [];
  const staffingRows = data.staffingRows || [];
  const expenseRows = data.expenseRows || [];
  const capitalAndDebtRows = data.capitalAndDebtRows || [];
  const hasRowData = revenueRows.length > 0 || staffingRows.length > 0 || expenseRows.length > 0;

  const yearCount = hasRowData
    ? (revenueRows[0]?.amounts?.length || expenseRows[0]?.amounts?.length || 3)
    : 5;

  const year1Students = data.enrollment?.year1 || 0;

  const revenueSummary = useMemo(() => {
    const enabled = revenueRows.filter((r: any) => r.enabled);
    const rowValues = new Map<string, number>();

    for (const row of enabled) {
      if (row.driverType === "percent_of_base") continue;
      rowValues.set(row.id, computeDriverValue(row.amounts, 0, row.driverType, year1Students));
    }
    for (const row of enabled) {
      if (row.driverType !== "percent_of_base") continue;
      const baseVal = rowValues.get(row.percentBase || "") || 0;
      const pct = (row.amounts?.[0] ?? 0) / 100;
      rowValues.set(row.id, baseVal * pct);
    }

    const byCategory = new Map<string, number>();
    for (const row of enabled) {
      const val = rowValues.get(row.id) || 0;
      const cat = row.category;
      const current = byCategory.get(cat) || 0;
      if (cat === "tuition_offsets") {
        byCategory.set(cat, current - Math.abs(val));
      } else {
        byCategory.set(cat, current + val);
      }
    }

    let total = 0;
    byCategory.forEach(v => total += v);
    return { count: enabled.length, byCategory, total };
  }, [revenueRows, year1Students]);

  const staffingSummary = useMemo(() => {
    let totalFTE = 0;
    let totalCost = 0;
    const byFunc = new Map<string, { count: number; cost: number }>();

    for (const row of staffingRows) {
      totalFTE += row.fte;
      const annualCost = row.fte * row.annualizedRate;
      const isContractNotPayrollLike = row.employmentType === "contract" && !row.payrollLike;
      let rowCost = annualCost;
      if (!isContractNotPayrollLike) {
        if (row.benefitsEligible) rowCost += annualCost * (row.benefitsRate / 100);
        rowCost += annualCost * (row.payrollTaxRate / 100);
      }
      totalCost += rowCost;

      const entry = byFunc.get(row.functionCategory) || { count: 0, cost: 0 };
      entry.count++;
      entry.cost += rowCost;
      byFunc.set(row.functionCategory, entry);
    }

    return { count: staffingRows.length, totalFTE: Math.round(totalFTE * 10) / 10, totalCost, byFunc };
  }, [staffingRows]);

  const expenseSummary = useMemo(() => {
    const enabled = expenseRows.filter((r: any) => r.enabled);
    const byCategory = new Map<string, number>();
    let total = 0;

    for (const row of enabled) {
      let val: number;
      if (row.driverType === "percent_of_revenue") {
        val = ((row.amounts?.[0] ?? 0) / 100) * revenueSummary.total;
      } else {
        val = computeDriverValue(row.amounts, 0, row.driverType, year1Students);
      }
      total += val;
      const cat = row.category;
      byCategory.set(cat, (byCategory.get(cat) || 0) + val);
    }

    return { count: enabled.length, byCategory, total };
  }, [expenseRows, year1Students, revenueSummary.total]);

  const capitalDebtSummary = useMemo(() => {
    const enabled = capitalAndDebtRows.filter((r: any) => r.enabled);
    let total = 0;

    for (const row of enabled) {
      if (row.isLoan && row.loanPrincipal && row.loanPrincipal > 0) {
        total += computeAnnualDebtService(row.loanPrincipal, (row.loanRate || 0) / 100, row.loanTermYears || 0);
      } else {
        total += computeDriverValue(row.amounts, 0, row.driverType, year1Students);
      }
    }

    return { count: enabled.length, total };
  }, [capitalAndDebtRows, year1Students]);

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
      {children}
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
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
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
        </dl>
      </Section>

      <Section title="Enrollment" step={2}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Item label="Year 1" value={data.enrollment?.year1} />
          <Item label="Year 2" value={data.enrollment?.year2} />
          <Item label="Year 3" value={data.enrollment?.year3} />
          {yearCount > 3 && <Item label="Year 4" value={data.enrollment?.year4} />}
          {yearCount > 4 && <Item label="Year 5" value={data.enrollment?.year5} />}
        </dl>
      </Section>

      {hasRowData ? (
        <>
          <Section title="Revenue Schedule" step={3}>
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-semibold">
                {revenueSummary.count} items
              </span>
              <span className="text-sm text-muted-foreground">
                Year 1 Net Revenue: <span className="font-semibold text-foreground">{formatCurrency(revenueSummary.total)}</span>
              </span>
            </div>
            <div className="space-y-2">
              {Array.from(revenueSummary.byCategory.entries()).map(([cat, val]) => (
                <div key={cat} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium text-foreground">{REVENUE_CATEGORY_LABELS[cat] || cat}</span>
                  <span className={`text-sm font-semibold ${val < 0 ? 'text-red-600' : 'text-foreground'}`}>
                    {formatCurrency(val)}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Staffing & Personnel" step={4}>
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-semibold">
                {staffingSummary.count} positions
              </span>
              <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground rounded-full px-3 py-1 text-sm font-medium">
                {staffingSummary.totalFTE} FTE
              </span>
              <span className="text-sm text-muted-foreground">
                Total Annual Cost: <span className="font-semibold text-foreground">{formatCurrency(staffingSummary.totalCost)}</span>
              </span>
            </div>
            <div className="space-y-2">
              {Array.from(staffingSummary.byFunc.entries()).map(([func, info]) => (
                <div key={func} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium text-foreground">
                    {FUNC_CATEGORY_LABELS[func] || func}
                    <span className="ml-2 text-muted-foreground">({info.count} {info.count === 1 ? 'position' : 'positions'})</span>
                  </span>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(info.cost)}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Operating Expenses" step={5}>
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-semibold">
                {expenseSummary.count} items
              </span>
              <span className="text-sm text-muted-foreground">
                Year 1 Total: <span className="font-semibold text-foreground">{formatCurrency(expenseSummary.total)}</span>
              </span>
            </div>
            <div className="space-y-2">
              {Array.from(expenseSummary.byCategory.entries()).map(([cat, val]) => (
                <div key={cat} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium text-foreground">{EXPENSE_CATEGORY_LABELS[cat] || cat}</span>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(val)}</span>
                </div>
              ))}
            </div>
            {capitalDebtSummary.count > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-semibold text-foreground">Capital & Debt</span>
                  <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {capitalDebtSummary.count} items
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium text-foreground">Annual Debt / Capital Costs</span>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(capitalDebtSummary.total)}</span>
                </div>
              </div>
            )}
          </Section>
        </>
      ) : (
        <>
          <Section title="Revenue" step={3}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Item label="Tuition per Student" value={formatCurrency(data.revenue?.tuitionPerStudent)} />
              <Item label="Annual Tuition Increase" value={formatPercent(data.revenue?.annualTuitionIncrease)} />
              <Item label="Scholarship Rate" value={formatPercent(data.revenue?.scholarshipRate)} />
              <Item label="Other Fees per Student" value={formatCurrency(data.revenue?.otherRevenuePerStudent)} />
              <Item label="ESA / Voucher per Student" value={formatCurrency(data.revenue?.esaRevenuePerStudent)} />
              <Item label="Public Funding per Student" value={formatCurrency(data.revenue?.publicFundingPerStudent)} />
              <Item label="Annual Donations" value={formatCurrency(data.revenue?.annualDonations)} />
              <Item label="Foundation Grants" value={formatCurrency(data.revenue?.foundationGrants)} />
              <Item label="Capital Gifts" value={formatCurrency(data.revenue?.capitalGifts)} />
            </dl>
          </Section>

          <Section title="Staffing" step={4}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Item label="Target Ratio" value={`1:${data.staffing?.studentsPerTeacher || 0}`} />
              <Item label="Teacher Salary" value={formatCurrency(data.staffing?.teacherSalary)} />
              <Item label="Admin Staff" value={data.staffing?.adminStaffCount} />
              <Item label="Admin Salary" value={formatCurrency(data.staffing?.adminSalary)} />
              <Item label="Founder Salary" value={formatCurrency(data.staffing?.founderSalary)} />
              <Item label="Benefits Rate" value={formatPercent(data.staffing?.benefitsRate)} />
            </dl>
          </Section>

          <Section title="Operations & Expenses" step={5}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
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
            </dl>
          </Section>
        </>
      )}
    </div>
  );
}
