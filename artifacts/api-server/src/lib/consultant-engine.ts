interface SchoolProfile {
  schoolName?: string;
  state?: string;
  schoolType?: string;
  openingYear?: number;
  currentStudents?: number;
  maxCapacity?: number;
}

interface Enrollment {
  year1?: number;
  year2?: number;
  year3?: number;
  year4?: number;
  year5?: number;
}

interface Revenue {
  tuitionPerStudent?: number;
  esaRevenuePerStudent?: number;
  otherRevenuePerStudent?: number;
  scholarshipRate?: number;
  annualFundraising?: number;
}

interface Staffing {
  studentsPerTeacher?: number;
  teacherSalary?: number;
  adminStaffCount?: number;
  adminSalary?: number;
  founderSalary?: number;
  benefitsRate?: number;
}

interface Facilities {
  monthlyRent?: number;
  annualRentIncrease?: number;
  annualUtilities?: number;
  annualInsurance?: number;
  curriculumCostPerStudent?: number;
  techCostPerStudent?: number;
  annualMarketing?: number;
  otherAnnualExpenses?: number;
}

interface ModelData {
  schoolProfile?: SchoolProfile;
  enrollment?: Enrollment;
  revenue?: Revenue;
  staffing?: Staffing;
  facilities?: Facilities;
}

export interface KeyMetric {
  name: string;
  value: string;
  status: "good" | "warning" | "danger";
  interpretation: string;
}

export interface Recommendation {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export interface ConsultantOutput {
  executiveSummary: string;
  biggestStrength: string;
  biggestRisk: string;
  recommendations: Recommendation[];
  lenderReadiness: "Strong" | "Needs Work" | "Not Yet Ready";
  lenderReadinessExplanation: string;
  keyMetrics: KeyMetric[];
  generatedAt: string;
}

interface YearFinancials {
  year: number;
  students: number;
  totalRevenue: number;
  totalStaffingCost: number;
  totalOpex: number;
  totalExpenses: number;
  netIncome: number;
  netMargin: number;
}

function computeYearFinancials(
  yearIndex: number,
  students: number,
  rev: Revenue,
  st: Staffing,
  fac: Facilities
): YearFinancials {
  const tuitionPerStudent = rev.tuitionPerStudent || 0;
  const esaPerStudent = rev.esaRevenuePerStudent || 0;
  const otherPerStudent = rev.otherRevenuePerStudent || 0;
  const scholarshipRate = (rev.scholarshipRate || 0) / 100;
  const fundraising = rev.annualFundraising || 0;

  const grossTuition = students * tuitionPerStudent;
  const grossEsa = students * esaPerStudent;
  const grossOther = students * otherPerStudent;
  const grossRevenue = grossTuition + grossEsa + grossOther;
  const scholarshipDiscount = grossTuition * scholarshipRate;
  const totalRevenue = grossRevenue - scholarshipDiscount + fundraising;

  const studentsPerTeacher = st.studentsPerTeacher || 1;
  const teacherCount = studentsPerTeacher > 0 ? Math.ceil(students / studentsPerTeacher) : 0;
  const teacherPayroll = teacherCount * (st.teacherSalary || 0);
  const adminPayroll = (st.adminStaffCount || 0) * (st.adminSalary || 0);
  const founderSalary = st.founderSalary || 0;
  const totalSalaries = teacherPayroll + adminPayroll + founderSalary;
  const benefits = totalSalaries * ((st.benefitsRate || 0) / 100);
  const totalStaffingCost = totalSalaries + benefits;

  const monthlyRent = fac.monthlyRent || 0;
  const rentIncrease = (fac.annualRentIncrease || 0) / 100;
  const annualRent = monthlyRent * 12 * Math.pow(1 + rentIncrease, yearIndex);
  const utilities = fac.annualUtilities || 0;
  const insurance = fac.annualInsurance || 0;
  const curriculum = (fac.curriculumCostPerStudent || 0) * students;
  const tech = (fac.techCostPerStudent || 0) * students;
  const marketing = fac.annualMarketing || 0;
  const otherExpenses = fac.otherAnnualExpenses || 0;
  const totalOpex = annualRent + utilities + insurance + curriculum + tech + marketing + otherExpenses;

  const totalExpenses = totalStaffingCost + totalOpex;
  const netIncome = totalRevenue - totalExpenses;
  const netMargin = totalRevenue > 0 ? netIncome / totalRevenue : 0;

  return {
    year: yearIndex + 1,
    students,
    totalRevenue,
    totalStaffingCost,
    totalOpex,
    totalExpenses,
    netIncome,
    netMargin,
  };
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function runConsultantEngine(rawData: Record<string, unknown>): ConsultantOutput {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const rev = data.revenue || {};
  const st = data.staffing || {};
  const fac = data.facilities || {};

  const enrollmentByYear = [
    en.year1 || 0,
    en.year2 || 0,
    en.year3 || 0,
    en.year4 || 0,
    en.year5 || 0,
  ];

  const yearFinancials = enrollmentByYear.map((students, idx) =>
    computeYearFinancials(idx, students, rev, st, fac)
  );

  const y1 = yearFinancials[0];
  const y5 = yearFinancials[4];

  const revenuePerStudent = y1.students > 0 ? y1.totalRevenue / y1.students : 0;
  const staffingCostPct = y1.totalRevenue > 0 ? y1.totalStaffingCost / y1.totalRevenue : 0;
  const facilityCostPct = y1.totalRevenue > 0 ? y1.totalOpex / y1.totalRevenue : 0;
  const y1NetMargin = y1.netMargin;
  const y5NetMargin = y5.netMargin;

  const enrollmentGrowthRate =
    y1.students > 0 ? (y5.students - y1.students) / y1.students : 0;

  const revenueGrowth =
    y1.totalRevenue > 0 ? (y5.totalRevenue - y1.totalRevenue) / y1.totalRevenue : 0;

  const breakEvenYear = yearFinancials.findIndex((yf) => yf.netIncome >= 0);
  const capacityUtilY5 =
    sp.maxCapacity && sp.maxCapacity > 0 ? y5.students / sp.maxCapacity : 0;

  const keyMetrics: KeyMetric[] = [];

  keyMetrics.push({
    name: "Revenue per Student (Year 1)",
    value: fmt(revenuePerStudent),
    status: revenuePerStudent >= 10000 ? "good" : revenuePerStudent >= 7000 ? "warning" : "danger",
    interpretation:
      revenuePerStudent >= 10000
        ? "Healthy per-student revenue provides a solid foundation for sustainability."
        : revenuePerStudent >= 7000
          ? "Per-student revenue is moderate — consider whether tuition or supplemental funding can increase."
          : "Per-student revenue is low — this may make it difficult to cover costs as you scale.",
  });

  keyMetrics.push({
    name: "Staffing Cost (% of Revenue)",
    value: pct(staffingCostPct),
    status: staffingCostPct <= 0.55 ? "good" : staffingCostPct <= 0.65 ? "warning" : "danger",
    interpretation:
      staffingCostPct <= 0.55
        ? "Staffing costs are well-controlled — you have room for other priorities."
        : staffingCostPct <= 0.65
          ? `Payroll is ${pct(staffingCostPct)} of revenue — most sustainable schools keep this under 65%.`
          : `Payroll is ${pct(staffingCostPct)} of revenue — this is high and could threaten financial stability.`,
  });

  keyMetrics.push({
    name: "Facility & Ops Cost (% of Revenue)",
    value: pct(facilityCostPct),
    status: facilityCostPct <= 0.25 ? "good" : facilityCostPct <= 0.35 ? "warning" : "danger",
    interpretation:
      facilityCostPct <= 0.25
        ? "Operating costs are lean relative to revenue."
        : facilityCostPct <= 0.35
          ? "Operating costs are moderate — watch rent escalation over the 5-year period."
          : "Operating costs are consuming a large share of revenue — consider renegotiating lease terms.",
  });

  keyMetrics.push({
    name: "Net Margin (Year 1)",
    value: pct(y1NetMargin),
    status: y1NetMargin >= 0.1 ? "good" : y1NetMargin >= 0 ? "warning" : "danger",
    interpretation:
      y1NetMargin >= 0.1
        ? "Year 1 shows a healthy surplus — a strong start for a new school."
        : y1NetMargin >= 0
          ? "Year 1 is near break-even — typical for startup schools, but leave little room for surprises."
          : `Year 1 projects a ${fmt(Math.abs(y1.netIncome))} deficit — plan for how this will be funded.`,
  });

  keyMetrics.push({
    name: "Net Margin (Year 5)",
    value: pct(y5NetMargin),
    status: y5NetMargin >= 0.15 ? "good" : y5NetMargin >= 0.05 ? "warning" : "danger",
    interpretation:
      y5NetMargin >= 0.15
        ? "By Year 5 the model shows strong profitability — attractive to lenders."
        : y5NetMargin >= 0.05
          ? "Year 5 margin is thin — a small revenue shortfall could push you into the red."
          : "Year 5 margin is concerning — lenders will want to see a clearer path to profitability.",
  });

  keyMetrics.push({
    name: "5-Year Revenue Growth",
    value: pct(revenueGrowth),
    status: revenueGrowth >= 0.5 ? "good" : revenueGrowth >= 0.2 ? "warning" : "danger",
    interpretation:
      revenueGrowth >= 0.5
        ? "Strong projected revenue growth over the five-year period."
        : revenueGrowth >= 0.2
          ? "Moderate growth — consider whether enrollment targets are ambitious enough."
          : "Low projected growth — this could signal difficulty scaling the school.",
  });

  if (sp.maxCapacity && sp.maxCapacity > 0) {
    keyMetrics.push({
      name: "Capacity Utilization (Year 5)",
      value: pct(capacityUtilY5),
      status: capacityUtilY5 >= 0.8 ? "good" : capacityUtilY5 >= 0.6 ? "warning" : "danger",
      interpretation:
        capacityUtilY5 >= 0.8
          ? "Year 5 enrollment approaches facility capacity — efficient use of space."
          : capacityUtilY5 >= 0.6
            ? "You have room to grow into your facility — plan marketing to fill seats."
            : "Facility will be underutilized by Year 5 — consider a smaller space or higher enrollment targets.",
    });
  }

  const strengths: string[] = [];
  const risks: string[] = [];

  if (y5NetMargin >= 0.15) strengths.push("Strong Year 5 profitability");
  if (staffingCostPct <= 0.55) strengths.push("Well-controlled staffing costs");
  if (revenuePerStudent >= 10000) strengths.push("Healthy per-student revenue");
  if (revenueGrowth >= 0.5) strengths.push("Strong 5-year revenue growth trajectory");
  if (breakEvenYear === 0) strengths.push("Profitable from Year 1");
  if (capacityUtilY5 >= 0.8) strengths.push("Efficient facility utilization by Year 5");
  if (enrollmentGrowthRate >= 0.5) strengths.push("Significant enrollment growth planned");

  if (y1NetMargin < 0) risks.push(`Year 1 projects a ${fmt(Math.abs(y1.netIncome))} deficit`);
  if (staffingCostPct > 0.65) risks.push(`Staffing consumes ${pct(staffingCostPct)} of revenue`);
  if (revenuePerStudent < 7000) risks.push("Per-student revenue is below sustainable levels");
  if (facilityCostPct > 0.35) risks.push("Facility costs are high relative to revenue");
  if (y5NetMargin < 0.05) risks.push("Year 5 margin is dangerously thin");
  if (breakEvenYear < 0) risks.push("Model does not reach break-even within 5 years");
  if (capacityUtilY5 < 0.6 && sp.maxCapacity && sp.maxCapacity > 0)
    risks.push("Facility will be significantly underutilized");
  if ((rev.scholarshipRate || 0) > 20)
    risks.push(`High scholarship rate (${rev.scholarshipRate}%) reduces net revenue`);

  const biggestStrength =
    strengths.length > 0
      ? strengths[0]
      : "The model captures a complete financial picture — a great starting point.";

  const biggestRisk =
    risks.length > 0
      ? risks[0]
      : "No major red flags detected — continue refining assumptions as you gather real data.";

  const recommendations: Recommendation[] = [];

  if (y1NetMargin < 0) {
    recommendations.push({
      title: "Plan Year 1 Funding Gap",
      description: `Your model projects a ${fmt(Math.abs(y1.netIncome))} deficit in Year 1. Identify specific sources — startup grants, personal investment, or a line of credit — to cover this gap before launch.`,
      priority: "high",
    });
  }

  if (staffingCostPct > 0.65) {
    recommendations.push({
      title: "Reduce Staffing Cost Ratio",
      description: `At ${pct(staffingCostPct)} of revenue, payroll is above the 65% threshold most sustainable schools target. Consider adjusting student-teacher ratios, phasing in admin hires, or increasing class sizes slightly.`,
      priority: "high",
    });
  }

  if (revenuePerStudent < 7000) {
    recommendations.push({
      title: "Increase Per-Student Revenue",
      description: `At ${fmt(revenuePerStudent)} per student, revenue is below the sustainable threshold. Explore tuition increases, ESA/voucher programs in your state, or fee-based enrichment programs.`,
      priority: "high",
    });
  }

  if (facilityCostPct > 0.35) {
    recommendations.push({
      title: "Negotiate Facility Costs",
      description: `Facility and operating costs represent ${pct(facilityCostPct)} of revenue. Consider shared space arrangements, church or community partnerships, or a phased facility plan.`,
      priority: "medium",
    });
  }

  if (breakEvenYear > 1) {
    recommendations.push({
      title: "Accelerate Path to Break-Even",
      description: `Your model doesn't break even until Year ${breakEvenYear + 1}. Consider front-loading enrollment growth or phasing expenses to reach profitability sooner.`,
      priority: "medium",
    });
  }

  if ((rev.annualFundraising || 0) > y1.totalRevenue * 0.2 && y1.totalRevenue > 0) {
    recommendations.push({
      title: "Reduce Fundraising Dependency",
      description: `Fundraising represents more than 20% of Year 1 revenue. Lenders prefer models where tuition and fees drive sustainability. Gradually reduce reliance on grants and donations.`,
      priority: "medium",
    });
  }

  if (capacityUtilY5 < 0.6 && sp.maxCapacity && sp.maxCapacity > 0) {
    recommendations.push({
      title: "Right-Size Your Facility",
      description: `By Year 5, you'll only use ${pct(capacityUtilY5)} of your ${sp.maxCapacity}-student capacity. A smaller, less expensive facility could improve your cost structure.`,
      priority: "low",
    });
  }

  while (recommendations.length < 3) {
    if (recommendations.length === 0) {
      recommendations.push({
        title: "Build a Cash Reserve",
        description:
          "Even with healthy projections, aim to build 3–6 months of operating expenses as a reserve fund. This signals financial maturity to lenders.",
        priority: "medium",
      });
    } else if (recommendations.length === 1) {
      recommendations.push({
        title: "Stress-Test Your Enrollment Assumptions",
        description:
          "Model what happens if enrollment comes in 20% below plan. Understanding your downside scenario helps you prepare contingency plans.",
        priority: "medium",
      });
    } else {
      recommendations.push({
        title: "Document Your Growth Strategy",
        description:
          "Lenders want to see not just numbers, but the marketing and enrollment plan behind them. Prepare a narrative that explains how you'll hit these targets.",
        priority: "low",
      });
    }
  }

  let lenderReadiness: ConsultantOutput["lenderReadiness"];
  let lenderReadinessExplanation: string;

  const goodMetrics = keyMetrics.filter((m) => m.status === "good").length;
  const dangerMetrics = keyMetrics.filter((m) => m.status === "danger").length;

  if (dangerMetrics === 0 && y5NetMargin >= 0.1 && breakEvenYear <= 1) {
    lenderReadiness = "Strong";
    lenderReadinessExplanation =
      "This model shows the financial fundamentals lenders look for: a clear path to profitability, controlled costs, and sustainable growth.";
  } else if (dangerMetrics <= 1 && y5NetMargin >= 0) {
    lenderReadiness = "Needs Work";
    lenderReadinessExplanation =
      "The model has promise but a few areas need attention before approaching lenders. Address the recommendations above to strengthen your position.";
  } else {
    lenderReadiness = "Not Yet Ready";
    lenderReadinessExplanation =
      "Several key metrics fall outside lender comfort zones. Focus on the high-priority recommendations to build a more compelling financial case.";
  }

  const schoolName = sp.schoolName || "Your school";
  let executiveSummary: string;

  if (lenderReadiness === "Strong") {
    executiveSummary = `${schoolName} projects ${fmt(y5.totalRevenue)} in Year 5 revenue with a ${pct(y5NetMargin)} net margin. The model shows a financially sustainable path with ${goodMetrics} of ${keyMetrics.length} key metrics in healthy range.`;
  } else if (lenderReadiness === "Needs Work") {
    executiveSummary = `${schoolName} projects ${fmt(y5.totalRevenue)} in Year 5 revenue, but the ${pct(y5NetMargin)} net margin and ${dangerMetrics > 0 ? `${dangerMetrics} metric${dangerMetrics > 1 ? "s" : ""} requiring attention` : "thin margins"} suggest the model needs refinement before it's lender-ready.`;
  } else {
    executiveSummary = `${schoolName} projects ${fmt(y5.totalRevenue)} in Year 5 revenue, but ${dangerMetrics} of ${keyMetrics.length} key metrics are in the danger zone. Significant adjustments to revenue, costs, or enrollment are needed.`;
  }

  return {
    executiveSummary,
    biggestStrength,
    biggestRisk,
    recommendations: recommendations.slice(0, 3),
    lenderReadiness,
    lenderReadinessExplanation,
    keyMetrics,
    generatedAt: new Date().toISOString(),
  };
}
