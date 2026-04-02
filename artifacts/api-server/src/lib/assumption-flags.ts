import {
  resolveEsc,
  computeEffectiveFte,
  type RevenueRow,
  type StaffingRow,
  type ExpenseRow,
  type CapitalDebtRow,
  type TuitionTier,
  type SchoolProfile,
  type ModelData,
} from "./workbook-helpers.js";

type YearFinancials = {
  year: number;
  students: number;
  totalRevenue: number;
  tuitionRevenue: number;
  publicRevenue: number;
  philanthropyRevenue: number;
  totalStaffingCost: number;
  facilityCost: number;
  totalOpex: number;
  debtService: number;
  loanDebtService?: number;
  totalExpenses: number;
  netIncome: number;
  netMargin: number;
};

export type FlagSeverity = "info" | "warning" | "critical";

export interface AssumptionFlag {
  field: string;
  flagType: string;
  currentValue: string;
  benchmark: string;
  severity: FlagSeverity;
  defaultPrompt: string;
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
  retentionRate?: number;
}

interface Facilities {
  annualSalaryIncrease?: number;
  generalCostInflation?: number;
  [k: string]: unknown;
}

function buildEnrollmentArray(en: Enrollment, yearCount: number): number[] {
  return [
    en.year1 || 0,
    en.year2 || 0,
    en.year3 || 0,
    ...(yearCount > 3 ? [en.year4 || 0] : []),
    ...(yearCount > 4 ? [en.year5 || 0] : []),
  ];
}


function pctStr(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export async function detectUnusualAssumptions(rawData: Record<string, unknown>): Promise<AssumptionFlag[]> {
  const data = rawData as unknown as ModelData;
  const flags: AssumptionFlag[] = [];
  const sp = (data.schoolProfile || {}) as SchoolProfile;
  const en = (data.enrollment || {}) as Enrollment;
  const facilities = (data.facilities || {}) as Facilities;

  const hasRowData = !!(
    (data.revenueRows && data.revenueRows.length > 0) ||
    (data.staffingRows && data.staffingRows.length > 0) ||
    (data.expenseRows && data.expenseRows.length > 0)
  );

  const yearCount = hasRowData
    ? (data.revenueRows?.[0]?.amounts?.length || data.expenseRows?.[0]?.amounts?.length || (sp.schoolStage === "operating_school" ? 5 : 3))
    : 5;

  const enrollmentByYear = buildEnrollmentArray(en, yearCount);
  const retentionRate = en.retentionRate ?? 85;
  const costInflationPct = facilities.generalCostInflation || 0;

  // --- ENROLLMENT-CENTRIC FLAGS (highest priority) ---

  if (retentionRate < 80) {
    flags.push({
      field: "enrollment.retentionRate",
      flagType: "low_retention",
      currentValue: `${retentionRate}%`,
      benchmark: "80%+",
      severity: "critical",
      defaultPrompt: `Your retention rate is ${retentionRate}%. High attrition is the #1 killer of school financial models. What specific strategies will you use to keep families year over year?`,
    });
  }

  for (let y = 1; y < enrollmentByYear.length; y++) {
    const prev = enrollmentByYear[y - 1];
    if (prev > 0) {
      const growthRate = (enrollmentByYear[y] - prev) / prev;
      if (growthRate > 0.30) {
        flags.push({
          field: `enrollment.year${y + 1}`,
          flagType: "enrollment_spike",
          currentValue: `${(growthRate * 100).toFixed(0)}% growth (Year ${y} → ${y + 1})`,
          benchmark: "≤ 30% year-over-year",
          severity: "warning",
          defaultPrompt: `You're projecting ${(growthRate * 100).toFixed(0)}% enrollment growth from Year ${y} to Year ${y + 1}. What's driving this — a new grade level, second location, or marketing push? Lenders will want specifics.`,
        });
        break;
      }
    }
  }

  const maxCapacity = sp.maxCapacity || 0;
  if (maxCapacity > 0 && enrollmentByYear[0] > 0 && enrollmentByYear[0] < maxCapacity * 0.5) {
    flags.push({
      field: "enrollment.year1",
      flagType: "low_initial_capacity",
      currentValue: `${enrollmentByYear[0]} students (${((enrollmentByYear[0] / maxCapacity) * 100).toFixed(0)}% of ${maxCapacity} capacity)`,
      benchmark: "≥ 50% of building capacity",
      severity: "info",
      defaultPrompt: `Year 1 enrollment fills only ${((enrollmentByYear[0] / maxCapacity) * 100).toFixed(0)}% of your building capacity. Is this a phased growth strategy, or could you open with more students?`,
    });
  }

  if (enrollmentByYear.length > 2 && enrollmentByYear[0] > 0) {
    const decliningYears = enrollmentByYear.slice(1).filter((e, i) => e <= enrollmentByYear[i]).length;
    const totalTransitions = enrollmentByYear.length - 1;
    if (decliningYears === totalTransitions) {
      flags.push({
        field: "enrollment",
        flagType: "flat_declining_enrollment",
        currentValue: `Enrollment is flat or declining after Year 1`,
        benchmark: "Growth expected",
        severity: "warning",
        defaultPrompt: "Your enrollment doesn't grow after Year 1. Is this intentional (e.g., a single-cohort model), or did you miss entering growth targets?",
      });
    } else if (decliningYears > 0) {
      const declineYearIndices = enrollmentByYear.slice(1).map((e, i) => e < enrollmentByYear[i] ? i + 2 : null).filter(Boolean);
      if (declineYearIndices.length > 0) {
        flags.push({
          field: "enrollment",
          flagType: "flat_declining_enrollment",
          currentValue: `Enrollment declines in Year(s) ${declineYearIndices.join(", ")}`,
          benchmark: "Sustained growth expected",
          severity: "info",
          defaultPrompt: `Your enrollment declines in some years. Is this intentional (e.g., planned cohort exit), or does it reflect a conservative assumption?`,
        });
      }
    }
  }

  // --- FINANCIAL FLAGS (use engine helpers for math integrity) ---

  if (hasRowData) {
    const expenseRows = (data.expenseRows || []) as ExpenseRow[];
    for (const row of expenseRows) {
      if (!row.enabled) continue;
      if (row.escalationRate === 0) {
        const resolved = resolveEsc(row.escalationRate, costInflationPct);
        if (costInflationPct > 0 && resolved === costInflationPct) {
          flags.push({
            field: `expenseRows.${row.id}`,
            flagType: "zero_escalation",
            currentValue: `0% explicit escalation on "${row.lineItem}" (falls through to ${costInflationPct}% inflation)`,
            benchmark: `General cost inflation: ${costInflationPct}%`,
            severity: "warning",
            defaultPrompt: `You set 0% escalation on "${row.lineItem}" but your general cost inflation is ${costInflationPct}%. The system uses the inflation fallback. If you intend truly flat costs, explain why this line item won't increase with inflation.`,
          });
        } else {
          flags.push({
            field: `expenseRows.${row.id}`,
            flagType: "zero_escalation",
            currentValue: `0% explicit escalation on "${row.lineItem}"`,
            benchmark: `Costs typically rise 2-4% per year`,
            severity: "warning",
            defaultPrompt: `You set 0% escalation on "${row.lineItem}". Costs typically rise with inflation. Is this line item contractually fixed, or should it increase over time?`,
          });
        }
      }
    }

    const revenueRows = data.revenueRows || [];
    const grossTuition = revenueRows.find(r => r.id === "gross_tuition" && r.enabled);
    if (grossTuition) {
      const resolvedTuitionEsc = resolveEsc(grossTuition.escalationRate, costInflationPct);
      if (resolvedTuitionEsc > 5) {
        flags.push({
          field: "revenueRows.gross_tuition.escalationRate",
          flagType: "high_tuition_growth",
          currentValue: `${resolvedTuitionEsc}% annual tuition escalation`,
          benchmark: "≤ 5% per year",
          severity: "warning",
          defaultPrompt: `You're increasing tuition by ${resolvedTuitionEsc}% per year. That's aggressive — what market conditions, program enhancements, or competitive positioning justifies this?`,
        });
      }
    }

    const staffingRows = data.staffingRows || [];
    const capDebtRows = data.capitalAndDebtRows || [];
    const salaryEscRate = (facilities.annualSalaryIncrease || 0) / 100;
    const isPartial = sp.isPartialFirstYear || false;
    const operatingMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
    const prorationFactor = operatingMonths / 12;

    const debtIncluded = sp.debtIncluded !== false;
    const effectiveCapDebtRows = debtIncluded
      ? capDebtRows
      : capDebtRows.filter(r => !r.isLoan);

    const { computeAllYearsFromRows } = await import("./consultant-engine");
    const yearFinancials: YearFinancials[] = computeAllYearsFromRows(
        enrollmentByYear,
        revenueRows as RevenueRow[],
        staffingRows as StaffingRow[],
        expenseRows as ExpenseRow[],
        effectiveCapDebtRows as CapitalDebtRow[],
        salaryEscRate,
        prorationFactor,
        (data.tuitionTiers || []) as TuitionTier[],
        costInflationPct,
        sp as SchoolProfile,
        retentionRate,
      );

    for (let y = 0; y < yearFinancials.length; y++) {
      const yf = yearFinancials[y];
      if (yf.netMargin < -0.10) {
        flags.push({
          field: `year${y + 1}.netMargin`,
          flagType: "deep_losses",
          currentValue: `${(yf.netMargin * 100).toFixed(1)}% net margin in Year ${y + 1}`,
          benchmark: "> -10%",
          severity: "warning",
          defaultPrompt: `Year ${y + 1} shows a ${(yf.netMargin * 100).toFixed(1)}% net margin — deep losses that need explanation. What's your plan to reach breakeven?`,
        });
        break;
      }
    }

    if (yearFinancials.length > 0) {
      const y1 = yearFinancials[0];
      if (y1.totalExpenses > 0 && y1.tuitionRevenue / y1.totalExpenses < 0.70) {
        const tuitionPct = (y1.tuitionRevenue / y1.totalExpenses * 100).toFixed(0);
        flags.push({
          field: "year1.tuitionCoverage",
          flagType: "low_tuition_coverage",
          currentValue: `Tuition covers ${tuitionPct}% of Year 1 total expenses`,
          benchmark: "≥ 70%",
          severity: "info",
          defaultPrompt: `Tuition accounts for only ${tuitionPct}% of Year 1 expenses, meaning you depend on grants or donations to cover costs. What's your plan if that external funding doesn't materialize?`,
        });
      }
    }

    const hasLoanRows = capDebtRows.some(r => r.enabled && r.isLoan && (r.loanPrincipal || 0) > 0);
    if (hasLoanRows && yearFinancials.length > 0) {
      const y1 = yearFinancials[0];
      const y1LoanDS = y1.loanDebtService ?? y1.debtService;
      if (y1LoanDS === 0) {
        flags.push({
          field: "capitalAndDebtRows",
          flagType: "no_debt_service",
          currentValue: "Loan rows present but $0 debt service computed",
          benchmark: "Debt service > $0 when loans exist",
          severity: "info",
          defaultPrompt: "You have loan rows in your model but no debt service is being calculated. Check your loan terms and rates — this might be a configuration issue.",
        });
      }
    }

    // Staffing ratio flag (only flag absurdly high ratios — data entry errors)
    if (enrollmentByYear[0] > 0 && staffingRows.length > 0) {
      const teacherCategories = ["instruction", "teaching", "teacher"];
      let totalTeacherFte = 0;
      for (const row of staffingRows) {
        const cat = (row.functionCategory || "").toLowerCase();
        if (teacherCategories.some(t => cat.includes(t))) {
          totalTeacherFte += computeEffectiveFte(row, 0, enrollmentByYear[0]);
        }
      }
      if (totalTeacherFte > 0) {
        const ratio = enrollmentByYear[0] / totalTeacherFte;
        if (ratio > 50) {
          flags.push({
            field: "staffingRows.teacherRatio",
            flagType: "extreme_staffing_ratio",
            currentValue: `1:${Math.round(ratio)} student-teacher ratio`,
            benchmark: "< 1:50",
            severity: "warning",
            defaultPrompt: `Your student-teacher ratio is 1:${Math.round(ratio)}, which seems unusually high. Is this correct, or might you need to add more teaching staff?`,
          });
        }
      }
    }
  }

  return flags;
}
