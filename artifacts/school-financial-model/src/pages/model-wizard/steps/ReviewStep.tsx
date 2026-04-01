import { useFormContext } from "react-hook-form";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Edit2, Users, DollarSign, TrendingDown, ArrowUpRight, ArrowDownRight, Building2, AlertTriangle, Rocket } from "lucide-react";
import { useMemo } from "react";
import { computeAnnualDebt } from "@workspace/finance";
import { SCHOOL_TYPE_LABELS, ENTITY_TYPE_LABELS, profitLabel } from "../schema";
import { SectionExplainers } from "@/components/coaching/SectionExplainers";
import { DiagnosticPanel } from "@/components/coaching/DiagnosticPanel";
import { computeMetrics } from "@/lib/coaching/diagnostics-engine";
import { computeMonthlyCashInflow } from "@/lib/revenue-defaults";
import type { FullModelData } from "../schema";

interface ReviewRevenueRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  percentBase?: string;
}

interface ReviewStaffingRow {
  id: string;
  roleName: string;
  functionCategory: string;
  employmentType: string;
  fte: number;
  annualizedRate: number;
  benefitsEligible: boolean;
  benefitsRate: number;
  payrollTaxRate: number;
  payrollLike: boolean;
}

interface ReviewExpenseRow {
  id: string;
  category: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
}

interface ReviewCapDebtRow {
  id: string;
  lineItem: string;
  enabled: boolean;
  driverType: string;
  amounts: number[];
  isLoan?: boolean;
  loanPrincipal?: number;
  loanRate?: number;
  loanTermYears?: number;
}

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const REVENUE_CATEGORY_LABELS: Record<string, string> = {
  tuition_and_fees: "Tuition & Student Fees",
  tuition_offsets: "Tuition Offsets",
  public_funding: "Public Funding",
  school_choice: "School Choice / Choice Funding",
  grants_contributions: "Philanthropy",
  philanthropy: "Philanthropy",
  other_revenue: "Other Revenue",
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  instructional_program: "Program",
  technology: "Technology",
  occupancy_facility: "Facility",
  administrative_general: "Admin & Operations",
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

const computeAnnualDebtService = computeAnnualDebt;

export function ReviewStep({ jumpToStep }: { jumpToStep: (step: number) => void, modelId?: number }) {
  const { getValues, watch } = useFormContext();
  const data = getValues();
  const entityType = watch("schoolProfile.entityType");
  const niLabel = profitLabel(entityType);

  const revenueRows = data.revenueRows || [];
  const staffingRows = data.staffingRows || [];
  const expenseRows = data.expenseRows || [];
  const capitalAndDebtRows = data.capitalAndDebtRows || [];
  const hasRowData = revenueRows.length > 0 || staffingRows.length > 0 || expenseRows.length > 0;

  const yearCount = hasRowData
    ? (revenueRows[0]?.amounts?.length || expenseRows[0]?.amounts?.length || 5)
    : 5;

  const year1Students = data.enrollment?.year1 || 0;

  const revenueSummary = useMemo(() => {
    const enabled = (revenueRows as ReviewRevenueRow[]).filter((r) => r.enabled);
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
    const enabled = (expenseRows as ReviewExpenseRow[]).filter((r) => r.enabled);
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
    const enabled = (capitalAndDebtRows as ReviewCapDebtRow[]).filter((r) => r.enabled);
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

  const totalExpenses = staffingSummary.totalCost + expenseSummary.total + capitalDebtSummary.total;
  const netIncome = revenueSummary.total - totalExpenses;

  const lendingLabIntent = data.schoolProfile?.lendingLabIntent;
  const schoolStage = data.schoolProfile?.schoolStage;

  const diagnosticMetrics = useMemo(() => computeMetrics(data as FullModelData), [data]);

  const monthlyCashFlow = useMemo(() => {
    if (!hasRowData || year1Students === 0) return null;
    const monthlyInflows = computeMonthlyCashInflow(revenueRows, 0, year1Students);
    const monthlyExpense = totalExpenses / 12;
    const startingCash = data.openingBalances?.cash ?? 0;
    const months: { month: string; beginBalance: number; inflow: number; outflow: number; endBalance: number }[] = [];
    let runningBalance = startingCash;
    const calendarMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fyStart = (data.schoolProfile?.fiscalYearStartMonth || 7) - 1;
    for (let i = 0; i < 12; i++) {
      const mIdx = (fyStart + i) % 12;
      const label = calendarMonths[mIdx] || `M${i + 1}`;
      const inflow = monthlyInflows[i] || 0;
      const outflow = monthlyExpense;
      const endBalance = runningBalance + inflow - outflow;
      months.push({ month: label, beginBalance: runningBalance, inflow, outflow, endBalance });
      runningBalance = endBalance;
    }
    return months;
  }, [hasRowData, revenueRows, totalExpenses, year1Students, data.openingBalances?.cash, data.schoolProfile?.fiscalYearStartMonth]);

  const facilityKpis = useMemo(() => {
    const phases = data.schoolProfile?.facilityPhases || data.facilityPhases || [];
    let totalSqft = 0;
    let hasRenewal = false;
    let earliestExpiry: string | undefined;
    for (const p of phases) {
      if (p.squareFootage) totalSqft += p.squareFootage;
      if (p.hasRenewalOption) hasRenewal = true;
      if (p.facilityArrangementEndDate) {
        if (!earliestExpiry || p.facilityArrangementEndDate < earliestExpiry) earliestExpiry = p.facilityArrangementEndDate;
      }
    }
    let leaseTermRemainingMonths: number | undefined;
    if (earliestExpiry) {
      const end = new Date(earliestExpiry);
      const now = new Date();
      leaseTermRemainingMonths = Math.max(0, Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
    }
    const facilityCost = diagnosticMetrics.y1FacilityCost;
    const costPerStudent = year1Students > 0 ? facilityCost / year1Students : 0;
    const costPerSqft = totalSqft > 0 ? facilityCost / totalSqft : 0;
    return { totalSqft, costPerStudent, costPerSqft, facilityCost, hasRenewal, leaseTermRemainingMonths, earliestExpiry };
  }, [data.facilityPhases, data.schoolProfile?.facilityPhases, diagnosticMetrics.y1FacilityCost, year1Students]);

  const finalYearStudents = data.enrollment?.[`year${yearCount}`] || data.enrollment?.year5 || data.enrollment?.year3 || 0;
  const studentGrowth = year1Students > 0 && finalYearStudents > year1Students
    ? Math.round(((finalYearStudents - year1Students) / year1Students) * 100)
    : 0;
  const marginPct = revenueSummary.total > 0 ? Math.round((netIncome / revenueSummary.total) * 100) : 0;

  const Section = ({ title, step, icon, children }: { title: string; step: number; icon?: React.ReactNode; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-primary">{icon}</span>}
          <h3 className="font-display font-bold text-lg">{title}</h3>
        </div>
        <button
          onClick={() => jumpToStep(step)}
          className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-primary/5"
        >
          <Edit2 className="h-3.5 w-3.5" /> Edit
        </button>
      </div>
      {children}
    </div>
  );

  const Item = ({ label, value }: { label: string; value: string | number | undefined }) => (
    <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-secondary/30">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value !== undefined && value !== "" ? value : "-"}</span>
    </div>
  );

  const fyMonth = data.schoolProfile?.fiscalYearStartMonth || 7;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Does Everything Look Right?</h2>
        <p className="text-muted-foreground text-lg">Review your inputs before we run the numbers. You can go back and make changes anytime. Remember, this is your first draft - every version of your budget gets stronger.</p>
        <SectionExplainers section="review" className="mt-4" />
      </div>

      <DiagnosticPanel
        data={data as FullModelData}
        onNavigateToStep={(step) => jumpToStep(step)}
        className="mt-2"
      />

      {hasRowData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-green-700" />
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year 1 Revenue</p>
            <p className="font-display font-bold text-xl text-foreground mt-1">{formatCurrency(revenueSummary.total)}</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-rose-600" />
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year 1 Expenses</p>
            <p className="font-display font-bold text-xl text-foreground mt-1">{formatCurrency(totalExpenses)}</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${netIncome >= 0 ? "bg-green-100" : "bg-rose-100"}`}>
                <DollarSign className={`h-4 w-4 ${netIncome >= 0 ? "text-green-700" : "text-rose-600"}`} />
              </div>
              {revenueSummary.total > 0 && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${marginPct >= 0 ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-600"}`}>
                  {marginPct >= 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                  {Math.abs(marginPct)}% margin
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year 1 {niLabel}</p>
            <p className={`font-display font-bold text-xl mt-1 ${netIncome >= 0 ? "text-green-700" : "text-rose-600"}`}>
              {formatCurrency(netIncome)}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-border/60 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-700" />
              </div>
              {studentGrowth > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                  <ArrowUpRight className="h-2.5 w-2.5" />
                  +{studentGrowth}%
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year 1 Students</p>
            <p className="font-display font-bold text-xl text-foreground mt-1">{year1Students}</p>
          </div>
        </div>
      )}

      <Section title="School Profile" step={1} icon={<Building2 className="h-5 w-5" />}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <Item label="School Name" value={data.schoolProfile?.schoolName} />
          <Item label="Type" value={data.schoolProfile?.schoolType === "other" && data.schoolProfile?.schoolTypeOther ? data.schoolProfile.schoolTypeOther : SCHOOL_TYPE_LABELS[data.schoolProfile?.schoolType] || data.schoolProfile?.schoolType} />
          <Item label="Entity Type" value={ENTITY_TYPE_LABELS[data.schoolProfile?.entityType] || data.schoolProfile?.entityType} />
          {data.schoolProfile?.ein && <Item label="EIN" value={data.schoolProfile.ein} />}
          <Item label="State" value={data.schoolProfile?.state} />
          <Item label="Opening Year" value={data.schoolProfile?.openingYear} />
          <Item label="Current Students" value={data.schoolProfile?.currentStudents} />
          <Item label="Max Capacity" value={data.schoolProfile?.maxCapacity} />
          <Item label="Fiscal Year Start" value={MONTH_NAMES[fyMonth] || "July"} />
          {data.schoolProfile?.isPartialFirstYear && (
            <Item label="Year 1 Operating Months" value={data.schoolProfile?.year1OperatingMonths || 12} />
          )}
          {data.schoolProfile?.schoolType === "private_school" && (
            <Item label="Accredited" value={data.schoolProfile?.isAccredited ? `Yes${data.schoolProfile?.accreditingBody ? ` (${data.schoolProfile.accreditingBody})` : ''}` : 'No'} />
          )}
          {data.schoolProfile?.hasManagementFee && (
            <Item label="Management Fee" value={`${data.schoolProfile?.managementFeePercent || 0}% of Revenue`} />
          )}
        </dl>
      </Section>

      <Section title="Assumptions" step={2} icon={<DollarSign className="h-5 w-5" />}>
        <div className="space-y-1.5">
          <Item label="COLA (Cost of Living Adjustment)" value={formatPercent(data.facilities?.annualSalaryIncrease)} />
          <Item label="General Cost Inflation" value={formatPercent(data.facilities?.generalCostInflation)} />
          <Item label="Rent Escalation" value={formatPercent(data.facilities?.annualRentIncrease)} />
          {data.tuitionEscalation?.rate !== undefined && (
            <Item label="Tuition Escalation" value={formatPercent(data.tuitionEscalation?.rate)} />
          )}
          <Item label="Enrollment Growth Rate" value={formatPercent(data.schoolProfile?.enrollmentGrowthRate)} />
          {data.enrollment?.retentionRate !== undefined && (
            <Item label="Student Retention" value={formatPercent(data.enrollment?.retentionRate)} />
          )}
          <Item label="Benefits Rate" value={formatPercent(data.staffing?.benefitsRate)} />
          <Item label="Payroll Tax Rate" value={formatPercent(data.staffing?.payrollTaxRate ?? 8)} />
          {data.schoolProfile?.schoolType === "charter_school" && (
            <>
              <Item label="Charter Methodology" value={data.schoolProfile?.enrollmentRevenueMethod === "ada" ? "ADA" : data.schoolProfile?.enrollmentRevenueMethod === "count_days" ? "Count Days" : "ADM"} />
              <Item label="Deposit Timing" value={(data.schoolProfile?.charterDepositTiming || "quarterly").replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())} />
            </>
          )}
          {(data.schoolProfile?.loanAmount ?? 0) > 0 && (
            <>
              <Item label="Loan Amount" value={formatCurrency(data.schoolProfile?.loanAmount)} />
              <Item label="Interest Rate" value={formatPercent(data.schoolProfile?.loanRate)} />
              <Item label="Loan Term" value={`${data.schoolProfile?.loanTermYears || 0} years`} />
            </>
          )}
          {data.revenueDefaults && (
            <>
              <Item label="Billing Months" value={`${data.revenueDefaults.billingMonths ?? 10} months`} />
              <Item label="Collection Method" value={(data.revenueDefaults.collectionMethod ?? "autopay").replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())} />
              <Item label="Collection Rate" value={formatPercent(data.revenueDefaults.collectionRate ?? 100)} />
              <Item label="Collection Delay" value={`${data.revenueDefaults.collectionDelayDays ?? 0} days`} />
            </>
          )}
        </div>
      </Section>

      <Section title="Enrollment" step={3} icon={<Users className="h-5 w-5" />}>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
          {["year1", "year2", "year3", "year4", "year5"].slice(0, yearCount).map((key, i) => {
            const val = data.enrollment?.[key];
            return (
              <div key={key} className="text-center py-3 px-2 rounded-xl bg-secondary/30">
                <p className="text-xs font-medium text-muted-foreground mb-1">Year {i + 1}</p>
                <p className="font-display font-bold text-xl text-foreground">{val || "-"}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {data.tuitionTiers && data.tuitionTiers.length > 0 && data.schoolProfile?.schoolType !== "charter_school" && (
        <Section title="Tuition Discount Tiers" step={3}>
          <div className="space-y-1.5">
            {data.tuitionTiers.map((tier: { id: string; label: string; discountPercent: number; studentCounts: number[] }) => {
              const y1Count = tier.studentCounts?.[0] || 0;
              return (
                <div key={tier.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-secondary/30">
                  <span className="text-sm font-medium text-foreground">
                    {tier.label}
                    <span className="ml-2 text-muted-foreground text-xs">({tier.discountPercent}% discount)</span>
                  </span>
                  <span className="text-sm font-semibold text-foreground">{y1Count} students (Y1)</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {hasRowData ? (
        <>
          <Section title="Revenue Schedule" step={4} icon={<DollarSign className="h-5 w-5" />}>
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-semibold">
                {revenueSummary.count} items
              </span>
              <span className="text-sm text-muted-foreground">
                Year 1 Net Revenue: <span className="font-semibold text-foreground">{formatCurrency(revenueSummary.total)}</span>
              </span>
            </div>
            <div className="space-y-1.5">
              {Array.from(revenueSummary.byCategory.entries()).map(([cat, val]) => (
                <div key={cat} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-secondary/30">
                  <span className="text-sm font-medium text-foreground">{REVENUE_CATEGORY_LABELS[cat] || cat}</span>
                  <span className={`text-sm font-semibold ${val < 0 ? 'text-red-600' : 'text-foreground'}`}>
                    {formatCurrency(val)}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Staffing & Personnel" step={5} icon={<Users className="h-5 w-5" />}>
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-semibold">
                {staffingSummary.count} positions
              </span>
              <span className="inline-flex items-center gap-1 bg-secondary text-muted-foreground rounded-full px-3 py-1 text-sm font-medium">
                {staffingSummary.totalFTE} FTE
              </span>
              <span className="text-sm text-muted-foreground">
                Total Annual Cost: <span className="font-semibold text-foreground">{formatCurrency(staffingSummary.totalCost)}</span>
              </span>
            </div>
            <div className="space-y-1.5">
              {Array.from(staffingSummary.byFunc.entries()).map(([func, info]) => (
                <div key={func} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-secondary/30">
                  <span className="text-sm font-medium text-foreground">
                    {FUNC_CATEGORY_LABELS[func] || func}
                    <span className="ml-2 text-muted-foreground text-xs">({info.count} {info.count === 1 ? 'position' : 'positions'})</span>
                  </span>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(info.cost)}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Expenses by Category" step={6}>
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-semibold">
                {expenseSummary.count} items
              </span>
              <span className="text-sm text-muted-foreground">
                Year 1 Total: <span className="font-semibold text-foreground">{formatCurrency(expenseSummary.total)}</span>
              </span>
            </div>
            <div className="space-y-1.5">
              {Array.from(expenseSummary.byCategory.entries()).map(([cat, val]) => (
                <div key={cat} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-secondary/30">
                  <span className="text-sm font-medium text-foreground">{EXPENSE_CATEGORY_LABELS[cat] || cat}</span>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(val)}</span>
                </div>
              ))}
            </div>
            {capitalDebtSummary.count > 0 && (
              <div className="mt-4 pt-4 border-t border-border/40">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-semibold text-foreground">Capital & Debt</span>
                  <span className="inline-flex items-center gap-1 bg-secondary text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
                    {capitalDebtSummary.count} items
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-secondary/30">
                  <span className="text-sm font-medium text-foreground">Annual Debt / Capital Costs</span>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(capitalDebtSummary.total)}</span>
                </div>
              </div>
            )}
          </Section>

          {hasRowData && diagnosticMetrics.breakevenEnrollment > 0 && diagnosticMetrics.breakevenEnrollment !== Infinity && (
            <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Key Financial Indicators
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl bg-secondary/30 p-4 text-center">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Breakeven Enrollment</p>
                  <p className="font-display font-bold text-2xl text-foreground">{diagnosticMetrics.breakevenEnrollment}</p>
                  <p className="text-xs text-muted-foreground mt-1">students needed</p>
                  {year1Students > 0 && (
                    <p className={`text-xs font-medium mt-2 ${year1Students >= diagnosticMetrics.breakevenEnrollment ? "text-green-600" : "text-rose-600"}`}>
                      {year1Students >= diagnosticMetrics.breakevenEnrollment
                        ? `${Math.round(((year1Students - diagnosticMetrics.breakevenEnrollment) / diagnosticMetrics.breakevenEnrollment) * 100)}% above breakeven`
                        : `${Math.round(((diagnosticMetrics.breakevenEnrollment - year1Students) / diagnosticMetrics.breakevenEnrollment) * 100)}% below breakeven`}
                    </p>
                  )}
                </div>
                {facilityKpis.facilityCost > 0 && year1Students > 0 && (
                  <div className="rounded-xl bg-secondary/30 p-4 text-center">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Facility Cost / Student</p>
                    <p className="font-display font-bold text-2xl text-foreground">{formatCurrency(facilityKpis.costPerStudent)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {facilityKpis.costPerStudent > 3000 ? "Above typical range ($1,500–$3,000)" : facilityKpis.costPerStudent < 1500 ? "Below typical range" : "Within typical range ($1,500–$3,000)"}
                    </p>
                  </div>
                )}
                {facilityKpis.totalSqft > 0 && facilityKpis.facilityCost > 0 && (
                  <div className="rounded-xl bg-secondary/30 p-4 text-center">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Facility Cost / Sq Ft</p>
                    <p className="font-display font-bold text-2xl text-foreground">{formatCurrency(facilityKpis.costPerSqft)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{facilityKpis.totalSqft.toLocaleString()} sq ft total</p>
                  </div>
                )}
                {facilityKpis.leaseTermRemainingMonths !== undefined && (
                  <div className="rounded-xl bg-secondary/30 p-4 text-center">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Lease Term Remaining</p>
                    <p className="font-display font-bold text-2xl text-foreground">{facilityKpis.leaseTermRemainingMonths} mo</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {facilityKpis.hasRenewal ? "Renewal option available" : "No renewal option"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {monthlyCashFlow && monthlyCashFlow.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display font-bold text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Year 1 Monthly Cash Flow
                </h3>
                {monthlyCashFlow.some(m => m.endBalance < 0) && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-rose-100 text-rose-700">
                    <AlertTriangle className="h-3 w-3" /> Negative months
                  </span>
                )}
              </div>
              {lendingLabIntent === "plan_to_apply" && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3 mb-4">
                  <Rocket className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">Lenders look at monthly cash flow to spot timing gaps between when you collect revenue and when bills are due.</p>
                </div>
              )}
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-semibold text-muted-foreground">Month</th>
                      <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Beginning</th>
                      <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Inflows</th>
                      <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Outflows</th>
                      <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Net Cash Flow</th>
                      <th className="text-right py-2 px-2 font-semibold text-muted-foreground">Ending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyCashFlow.map((m, i) => (
                      <tr key={i} className={`border-b border-border/30 ${m.endBalance < 0 ? "bg-rose-50" : i % 2 === 0 ? "bg-secondary/20" : ""}`}>
                        <td className="py-2 px-2 font-medium">{m.month}</td>
                        <td className="py-2 px-2 text-right">{formatCurrency(m.beginBalance)}</td>
                        <td className="py-2 px-2 text-right text-green-700">{formatCurrency(m.inflow)}</td>
                        <td className="py-2 px-2 text-right text-rose-600">({formatCurrency(m.outflow)})</td>
                        <td className={`py-2 px-2 text-right ${m.inflow - m.outflow >= 0 ? "text-green-700" : "text-rose-600"}`}>{formatCurrency(m.inflow - m.outflow)}</td>
                        <td className={`py-2 px-2 text-right font-semibold ${m.endBalance < 0 ? "text-rose-700" : ""}`}>
                          {formatCurrency(m.endBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {schoolStage === "operating_school" && data.priorYearSnapshot && (data.priorYearSnapshot.totalRevenue || data.priorYearSnapshot.tuitionRevenue || data.priorYearSnapshot.publicFundingRevenue || data.priorYearSnapshot.philanthropyRevenue || data.priorYearSnapshot.totalExpenses || data.priorYearSnapshot.personnelExpenses) && (
            <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
              <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-primary" />
                Prior Year vs. Projected Year 1
              </h3>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Category</th>
                      <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Prior Year</th>
                      <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Year 1 Projected</th>
                      <th className="text-right py-2 px-3 font-semibold text-muted-foreground">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const pyTotalRev = data.priorYearSnapshot.totalRevenue || ((data.priorYearSnapshot.tuitionRevenue || 0) + (data.priorYearSnapshot.publicFundingRevenue || 0) + (data.priorYearSnapshot.philanthropyRevenue || 0) + (data.priorYearSnapshot.otherRevenue || 0));
                      if (!pyTotalRev) return null;
                      return (
                        <tr className="border-b border-border/30 bg-secondary/20 font-semibold">
                          <td className="py-2 px-3">Total Revenue</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(pyTotalRev)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(revenueSummary.total)}</td>
                          <td className={`py-2 px-3 text-right ${revenueSummary.total >= pyTotalRev ? "text-green-600" : "text-rose-600"}`}>
                            {revenueSummary.total >= pyTotalRev ? "+" : ""}{Math.round(((revenueSummary.total - pyTotalRev) / pyTotalRev) * 100)}%
                          </td>
                        </tr>
                      );
                    })()}
                    {(() => {
                      const revCatMap: Array<{ label: string; pyKey: "tuitionRevenue" | "publicFundingRevenue" | "philanthropyRevenue" | "otherRevenue"; projCats: string[] }> = [
                        { label: "Tuition & Fees", pyKey: "tuitionRevenue", projCats: ["tuition_and_fees", "tuition_offsets"] },
                        { label: "Public Funding", pyKey: "publicFundingRevenue", projCats: ["public_funding", "school_choice"] },
                        { label: "Philanthropy", pyKey: "philanthropyRevenue", projCats: ["philanthropy", "grants_contributions"] },
                        { label: "Other Revenue", pyKey: "otherRevenue", projCats: ["other_revenue"] },
                      ];
                      return revCatMap.map(({ label, pyKey, projCats }) => {
                        const pyVal = data.priorYearSnapshot?.[pyKey];
                        if (!pyVal) return null;
                        const projVal = projCats.reduce((s, c) => s + (revenueSummary.byCategory.get(c) || 0), 0);
                        const varPct = pyVal > 0 ? Math.round(((projVal - pyVal) / pyVal) * 100) : 0;
                        return (
                          <tr key={pyKey} className="border-b border-border/30">
                            <td className="py-1.5 px-3 pl-6 text-muted-foreground">{label}</td>
                            <td className="py-1.5 px-3 text-right">{formatCurrency(pyVal)}</td>
                            <td className="py-1.5 px-3 text-right">{formatCurrency(projVal)}</td>
                            <td className={`py-1.5 px-3 text-right ${projVal >= pyVal ? "text-green-600" : "text-rose-600"}`}>
                              {projVal >= pyVal ? "+" : ""}{varPct}%
                            </td>
                          </tr>
                        );
                      });
                    })()}
                    {(() => {
                      const pyTotalExp = data.priorYearSnapshot.totalExpenses || ((data.priorYearSnapshot.personnelExpenses || 0) + (data.priorYearSnapshot.facilityExpenses || 0) + (data.priorYearSnapshot.instructionalExpenses || 0) + (data.priorYearSnapshot.adminExpenses || 0));
                      if (!pyTotalExp) return null;
                      return (
                      <>
                        <tr className="border-b border-border/30 bg-secondary/20 font-semibold">
                          <td className="py-2 px-3">Total Expenses</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(pyTotalExp)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(totalExpenses)}</td>
                          <td className={`py-2 px-3 text-right ${totalExpenses <= pyTotalExp ? "text-green-600" : "text-rose-600"}`}>
                            {totalExpenses >= pyTotalExp ? "+" : ""}{Math.round(((totalExpenses - pyTotalExp) / pyTotalExp) * 100)}%
                          </td>
                        </tr>
                        {data.priorYearSnapshot.personnelExpenses ? (
                          <tr className="border-b border-border/30">
                            <td className="py-1.5 px-3 pl-6 text-muted-foreground">Personnel</td>
                            <td className="py-1.5 px-3 text-right">{formatCurrency(data.priorYearSnapshot.personnelExpenses)}</td>
                            <td className="py-1.5 px-3 text-right">{formatCurrency(staffingSummary.totalCost)}</td>
                            <td className={`py-1.5 px-3 text-right ${staffingSummary.totalCost <= data.priorYearSnapshot.personnelExpenses ? "text-green-600" : "text-rose-600"}`}>
                              {staffingSummary.totalCost >= data.priorYearSnapshot.personnelExpenses ? "+" : ""}{Math.round(((staffingSummary.totalCost - data.priorYearSnapshot.personnelExpenses) / data.priorYearSnapshot.personnelExpenses) * 100)}%
                            </td>
                          </tr>
                        ) : null}
                        {(() => {
                          const expCatMap: Array<{ label: string; pyKey: "facilityExpenses" | "instructionalExpenses" | "adminExpenses"; projCats: string[] }> = [
                            { label: "Facility", pyKey: "facilityExpenses", projCats: ["occupancy_facility"] },
                            { label: "Instructional", pyKey: "instructionalExpenses", projCats: ["instructional_program"] },
                            { label: "Admin & Ops", pyKey: "adminExpenses", projCats: ["administrative_general", "technology"] },
                          ];
                          return expCatMap.map(({ label, pyKey, projCats }) => {
                            const pyVal = data.priorYearSnapshot?.[pyKey];
                            if (!pyVal) return null;
                            const projVal = projCats.reduce((s, c) => s + (expenseSummary.byCategory.get(c) || 0), 0);
                            const varPct = pyVal > 0 ? Math.round(((projVal - pyVal) / pyVal) * 100) : 0;
                            return (
                              <tr key={pyKey} className="border-b border-border/30">
                                <td className="py-1.5 px-3 pl-6 text-muted-foreground">{label}</td>
                                <td className="py-1.5 px-3 text-right">{formatCurrency(pyVal)}</td>
                                <td className="py-1.5 px-3 text-right">{formatCurrency(projVal)}</td>
                                <td className={`py-1.5 px-3 text-right ${projVal <= pyVal ? "text-green-600" : "text-rose-600"}`}>
                                  {projVal >= pyVal ? "+" : ""}{varPct}%
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </>
                      );
                    })()}
                    {data.priorYearSnapshot.endingEnrollment ? (
                      <tr className="border-b border-border/30 bg-secondary/20">
                        <td className="py-2 px-3 font-medium">Enrollment</td>
                        <td className="py-2 px-3 text-right font-semibold">{data.priorYearSnapshot.endingEnrollment}</td>
                        <td className="py-2 px-3 text-right font-semibold">{year1Students}</td>
                        <td className={`py-2 px-3 text-right font-semibold ${year1Students >= data.priorYearSnapshot.endingEnrollment ? "text-green-600" : "text-rose-600"}`}>
                          {year1Students >= data.priorYearSnapshot.endingEnrollment ? "+" : ""}{Math.round(((year1Students - data.priorYearSnapshot.endingEnrollment) / data.priorYearSnapshot.endingEnrollment) * 100)}%
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.openingBalances && (
            (data.openingBalances.cash || data.openingBalances.accountsReceivable || data.openingBalances.fixedAssets || data.openingBalances.otherAssets || data.openingBalances.accountsPayable || data.openingBalances.currentDebtPortion || data.openingBalances.longTermDebt) ? (
              <div className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
                <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Opening Balance Sheet
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assets</p>
                    <div className="space-y-1.5">
                      {data.openingBalances.cash ? <Item label="Cash & Cash Equivalents" value={formatCurrency(data.openingBalances.cash)} /> : null}
                      {data.openingBalances.accountsReceivable ? <Item label="Accounts Receivable" value={formatCurrency(data.openingBalances.accountsReceivable)} /> : null}
                      {data.openingBalances.fixedAssets ? <Item label="Fixed Assets (Net)" value={formatCurrency(data.openingBalances.fixedAssets)} /> : null}
                      {data.openingBalances.otherAssets ? <Item label="Other Assets" value={formatCurrency(data.openingBalances.otherAssets)} /> : null}
                      <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-primary/10 font-semibold">
                        <span className="text-sm text-foreground">Total Assets</span>
                        <span className="text-sm text-foreground">{formatCurrency((data.openingBalances.cash || 0) + (data.openingBalances.accountsReceivable || 0) + (data.openingBalances.fixedAssets || 0) + (data.openingBalances.otherAssets || 0))}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Liabilities</p>
                    <div className="space-y-1.5">
                      {data.openingBalances.accountsPayable ? <Item label="Accounts Payable" value={formatCurrency(data.openingBalances.accountsPayable)} /> : null}
                      {data.openingBalances.currentDebtPortion ? <Item label="Current Portion of Debt" value={formatCurrency(data.openingBalances.currentDebtPortion)} /> : null}
                      {data.openingBalances.longTermDebt ? <Item label="Long-Term Debt" value={formatCurrency(data.openingBalances.longTermDebt)} /> : null}
                      <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-primary/10 font-semibold">
                        <span className="text-sm text-foreground">Total Liabilities</span>
                        <span className="text-sm text-foreground">{formatCurrency((data.openingBalances.accountsPayable || 0) + (data.openingBalances.currentDebtPortion || 0) + (data.openingBalances.longTermDebt || 0))}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-secondary/50 font-bold">
                        <span className="text-sm text-foreground">Net Position</span>
                        <span className="text-sm text-foreground">{formatCurrency(
                          (data.openingBalances.cash || 0) + (data.openingBalances.accountsReceivable || 0) + (data.openingBalances.fixedAssets || 0) + (data.openingBalances.otherAssets || 0) -
                          (data.openingBalances.accountsPayable || 0) - (data.openingBalances.currentDebtPortion || 0) - (data.openingBalances.longTermDebt || 0)
                        )}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null
          )}
        </>
      ) : (
        <>
          <Section title="Revenue" step={4} icon={<DollarSign className="h-5 w-5" />}>
            <div className="space-y-1.5">
              <Item label="Tuition per Student" value={formatCurrency(data.revenue?.tuitionPerStudent)} />
              <Item label="Annual Tuition Increase" value={formatPercent(data.revenue?.annualTuitionIncrease)} />
              <Item label="Scholarship Rate" value={formatPercent(data.revenue?.scholarshipRate)} />
              <Item label="Other Fees per Student" value={formatCurrency(data.revenue?.otherRevenuePerStudent)} />
              <Item label="ESA / Voucher per Student" value={formatCurrency(data.revenue?.esaRevenuePerStudent)} />
              <Item label="Public Funding per Student" value={formatCurrency(data.revenue?.publicFundingPerStudent)} />
              <Item label="Annual Donations" value={formatCurrency(data.revenue?.annualDonations)} />
              <Item label="Foundation Grants" value={formatCurrency(data.revenue?.foundationGrants)} />
              <Item label="Capital Gifts" value={formatCurrency(data.revenue?.capitalGifts)} />
            </div>
          </Section>

          <Section title="Staffing" step={5} icon={<Users className="h-5 w-5" />}>
            <div className="space-y-1.5">
              <Item label="Target Ratio" value={`1:${data.staffing?.studentsPerTeacher || 0}`} />
              <Item label="Teacher Salary" value={formatCurrency(data.staffing?.teacherSalary)} />
              <Item label="Admin Staff" value={data.staffing?.adminStaffCount} />
              <Item label="Admin Salary" value={formatCurrency(data.staffing?.adminSalary)} />
              <Item label="Founder Salary" value={formatCurrency(data.staffing?.founderSalary)} />
              <Item label="Benefits Rate" value={formatPercent(data.staffing?.benefitsRate)} />
            </div>
          </Section>

          <Section title="Operations & Expenses" step={6}>
            <div className="space-y-1.5">
              <Item label="Monthly Rent" value={formatCurrency(data.facilities?.monthlyRent)} />
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
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
