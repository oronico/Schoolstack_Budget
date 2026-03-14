interface SchoolProfile {
  schoolName?: string;
  state?: string;
  schoolType?: string;
  openingYear?: number;
  currentStudents?: number;
  maxCapacity?: number;
  fiscalYearStartMonth?: number;
  isPartialFirstYear?: boolean;
  year1OperatingMonths?: number;
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
  annualTuitionIncrease?: number;
  esaRevenuePerStudent?: number;
  publicFundingPerStudent?: number;
  otherRevenuePerStudent?: number;
  scholarshipRate?: number;
  annualDonations?: number;
  foundationGrants?: number;
  capitalGifts?: number;
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
  facilityMaintenance?: number;
  curriculumCostPerStudent?: number;
  techCostPerStudent?: number;
  annualMarketing?: number;
  professionalDevelopment?: number;
  foodServicePerStudent?: number;
  transportationAnnual?: number;
  studentServicesAnnual?: number;
  otherAnnualExpenses?: number;
  loanAmount?: number;
  annualInterestRate?: number;
  loanTermYears?: number;
  annualSalaryIncrease?: number;
  generalCostInflation?: number;
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

export interface RevenueComposition {
  tuitionPct: number;
  publicPct: number;
  philanthropyPct: number;
}

export interface CostComposition {
  staffingPctOfRevenue: number;
  facilityPctOfRevenue: number;
  totalOpexPctOfRevenue: number;
}

export interface CumulativeYear {
  year: number;
  cumulativeNetIncome: number;
  reserveMonths: number;
}

export interface StressScenario {
  scenario: string;
  y1NetIncome: number;
  y5NetIncome: number;
  breakEvenYear: number | null;
}

export interface ConsultantOutput {
  executiveSummary: string;
  biggestStrength: string;
  biggestRisk: string;
  recommendations: Recommendation[];
  lenderReadiness: "Strong" | "Needs Work" | "Not Yet Ready";
  lenderReadinessExplanation: string;
  keyMetrics: KeyMetric[];
  revenueComposition: RevenueComposition[];
  costComposition: CostComposition[];
  cumulativeFinancials: CumulativeYear[];
  stressTests: StressScenario[];
  enrollmentGuidance: string[];
  generatedAt: string;
}

interface YearFinancials {
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
  totalExpenses: number;
  netIncome: number;
  netMargin: number;
}

function computeAnnualDebtService(loanAmount: number, annualRate: number, termYears: number): number {
  if (loanAmount <= 0 || termYears <= 0) return 0;
  if (annualRate <= 0) return loanAmount / termYears;
  const monthlyRate = annualRate / 12;
  const months = termYears * 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  return monthlyPayment * 12;
}

function computeYearFinancials(
  yearIndex: number,
  students: number,
  rev: Revenue,
  st: Staffing,
  fac: Facilities,
  prorationFactor: number
): YearFinancials {
  const tuitionIncrease = (rev.annualTuitionIncrease || 0) / 100;
  const salaryIncrease = (fac.annualSalaryIncrease || 0) / 100;
  const costInflation = (fac.generalCostInflation || 0) / 100;
  const pf = yearIndex === 0 ? prorationFactor : 1;

  const tuitionPerStudent = (rev.tuitionPerStudent || 0) * Math.pow(1 + tuitionIncrease, yearIndex);
  const esaPerStudent = (rev.esaRevenuePerStudent || 0) * Math.pow(1 + costInflation, yearIndex);
  const publicFundingPerStudent = (rev.publicFundingPerStudent || 0) * Math.pow(1 + costInflation, yearIndex);
  const otherPerStudent = (rev.otherRevenuePerStudent || 0) * Math.pow(1 + tuitionIncrease, yearIndex);
  const scholarshipRate = (rev.scholarshipRate || 0) / 100;
  const donations = (rev.annualDonations ?? rev.annualFundraising ?? 0) * Math.pow(1 + costInflation, yearIndex);
  const grants = (rev.foundationGrants || 0) * Math.pow(1 + costInflation, yearIndex);
  const capitalGifts = yearIndex === 0 ? (rev.capitalGifts || 0) : 0;

  const grossTuition = students * tuitionPerStudent * pf;
  const otherFees = students * otherPerStudent * pf;
  const scholarshipDiscount = grossTuition * scholarshipRate;
  const netTuition = grossTuition + otherFees - scholarshipDiscount;

  const esaRevenue = students * esaPerStudent * pf;
  const publicFunding = students * publicFundingPerStudent * pf;
  const publicRevenue = esaRevenue + publicFunding;

  const philanthropyRevenue = (donations + grants) * pf + capitalGifts;

  const totalRevenue = netTuition + publicRevenue + philanthropyRevenue;

  const salaryEsc = Math.pow(1 + salaryIncrease, yearIndex);
  const studentsPerTeacher = st.studentsPerTeacher || 1;
  const teacherCount = studentsPerTeacher > 0 ? Math.ceil(students / studentsPerTeacher) : 0;
  const teacherPayroll = teacherCount * (st.teacherSalary || 0) * salaryEsc * pf;
  const adminPayroll = (st.adminStaffCount || 0) * (st.adminSalary || 0) * salaryEsc * pf;
  const founderSalary = (st.founderSalary || 0) * salaryEsc * pf;
  const totalSalaries = teacherPayroll + adminPayroll + founderSalary;
  const benefits = totalSalaries * ((st.benefitsRate || 0) / 100);
  const totalStaffingCost = totalSalaries + benefits;

  const infEsc = Math.pow(1 + costInflation, yearIndex);
  const monthlyRent = fac.monthlyRent || 0;
  const rentIncrease = (fac.annualRentIncrease || 0) / 100;
  const annualRent = monthlyRent * 12 * Math.pow(1 + rentIncrease, yearIndex) * pf;
  const utilities = (fac.annualUtilities || 0) * infEsc * pf;
  const insurance = (fac.annualInsurance || 0) * infEsc * pf;
  const maintenance = (fac.facilityMaintenance || 0) * infEsc * pf;
  const facilityCost = annualRent + utilities + insurance + maintenance;

  const curriculum = (fac.curriculumCostPerStudent || 0) * students * infEsc * pf;
  const tech = (fac.techCostPerStudent || 0) * students * infEsc * pf;
  const foodService = (fac.foodServicePerStudent || 0) * students * infEsc * pf;
  const transportation = (fac.transportationAnnual || 0) * infEsc * pf;
  const studentServices = (fac.studentServicesAnnual || 0) * infEsc * pf;
  const marketing = (fac.annualMarketing || 0) * infEsc * pf;
  const profDev = (fac.professionalDevelopment || 0) * infEsc * pf;
  const otherExpenses = (fac.otherAnnualExpenses || 0) * infEsc * pf;

  const debtService = computeAnnualDebtService(
    fac.loanAmount || 0,
    (fac.annualInterestRate || 0) / 100,
    fac.loanTermYears || 0
  ) * pf;

  const totalOpex = facilityCost + curriculum + tech + foodService + transportation +
    studentServices + marketing + profDev + otherExpenses + debtService;

  const totalExpenses = totalStaffingCost + totalOpex;
  const netIncome = totalRevenue - totalExpenses;
  const netMargin = totalRevenue > 0 ? netIncome / totalRevenue : 0;

  return {
    year: yearIndex + 1,
    students,
    totalRevenue,
    tuitionRevenue: netTuition,
    publicRevenue,
    philanthropyRevenue,
    totalStaffingCost,
    facilityCost,
    totalOpex,
    debtService,
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

function runStressScenario(
  label: string,
  enrollmentByYear: number[],
  rev: Revenue,
  st: Staffing,
  fac: Facilities,
  prorationFactor: number,
  modifyEnrollment?: (e: number[]) => number[],
  modifyRev?: (r: Revenue) => Revenue,
  modifyFac?: (f: Facilities) => Facilities,
): StressScenario {
  const adjEnrollment = modifyEnrollment ? modifyEnrollment([...enrollmentByYear]) : enrollmentByYear;
  const adjRev = modifyRev ? modifyRev({ ...rev }) : rev;
  const adjFac = modifyFac ? modifyFac({ ...fac }) : fac;

  const financials = adjEnrollment.map((s, idx) =>
    computeYearFinancials(idx, s, adjRev, st, adjFac, prorationFactor)
  );

  const beIdx = financials.findIndex((yf) => yf.netIncome >= 0);

  return {
    scenario: label,
    y1NetIncome: financials[0].netIncome,
    y5NetIncome: financials[4].netIncome,
    breakEvenYear: beIdx >= 0 ? beIdx + 1 : null,
  };
}

export function runConsultantEngine(rawData: Record<string, unknown>): ConsultantOutput {
  const data = rawData as unknown as ModelData;
  const sp = data.schoolProfile || {};
  const en = data.enrollment || {};
  const rev = data.revenue || {};
  const st = data.staffing || {};
  const fac = data.facilities || {};

  const isPartial = sp.isPartialFirstYear || false;
  const operatingMonths = isPartial ? (sp.year1OperatingMonths || 10) : 12;
  const prorationFactor = operatingMonths / 12;

  const enrollmentByYear = [
    en.year1 || 0,
    en.year2 || 0,
    en.year3 || 0,
    en.year4 || 0,
    en.year5 || 0,
  ];

  const yearFinancials = enrollmentByYear.map((students, idx) =>
    computeYearFinancials(idx, students, rev, st, fac, prorationFactor)
  );

  const y1 = yearFinancials[0];
  const y5 = yearFinancials[4];

  const revenuePerStudent = y1.students > 0 ? y1.totalRevenue / y1.students : 0;
  const staffingCostPct = y1.totalRevenue > 0 ? y1.totalStaffingCost / y1.totalRevenue : 0;
  const opexCostPct = y1.totalRevenue > 0 ? y1.totalOpex / y1.totalRevenue : 0;
  const y1NetMargin = y1.netMargin;
  const y5NetMargin = y5.netMargin;

  const enrollmentGrowthRate =
    y1.students > 0 ? (y5.students - y1.students) / y1.students : 0;

  const revenueGrowth =
    y1.totalRevenue > 0 ? (y5.totalRevenue - y1.totalRevenue) / y1.totalRevenue : 0;

  const breakEvenYear = yearFinancials.findIndex((yf) => yf.netIncome >= 0);
  const capacityUtilY5 =
    sp.maxCapacity && sp.maxCapacity > 0 ? y5.students / sp.maxCapacity : 0;

  const philanthropyPct = y1.totalRevenue > 0 ? y1.philanthropyRevenue / y1.totalRevenue : 0;
  const publicRevenuePct = y1.totalRevenue > 0 ? y1.publicRevenue / y1.totalRevenue : 0;
  const hasDebt = y1.debtService > 0;
  const dscr = hasDebt && y1.netIncome !== undefined
    ? (y1.netIncome + y1.debtService) / y1.debtService
    : 0;

  const revenueComposition: RevenueComposition[] = yearFinancials.map((yf) => ({
    tuitionPct: yf.totalRevenue > 0 ? yf.tuitionRevenue / yf.totalRevenue : 0,
    publicPct: yf.totalRevenue > 0 ? yf.publicRevenue / yf.totalRevenue : 0,
    philanthropyPct: yf.totalRevenue > 0 ? yf.philanthropyRevenue / yf.totalRevenue : 0,
  }));

  const costComposition: CostComposition[] = yearFinancials.map((yf) => ({
    staffingPctOfRevenue: yf.totalRevenue > 0 ? yf.totalStaffingCost / yf.totalRevenue : 0,
    facilityPctOfRevenue: yf.totalRevenue > 0 ? yf.facilityCost / yf.totalRevenue : 0,
    totalOpexPctOfRevenue: yf.totalRevenue > 0 ? yf.totalOpex / yf.totalRevenue : 0,
  }));

  let cumNetIncome = 0;
  const cumulativeFinancials: CumulativeYear[] = yearFinancials.map((yf) => {
    cumNetIncome += yf.netIncome;
    const monthlyExpenses = yf.totalExpenses / 12;
    const reserveMonths = monthlyExpenses > 0 && cumNetIncome > 0
      ? cumNetIncome / monthlyExpenses
      : 0;
    return {
      year: yf.year,
      cumulativeNetIncome: cumNetIncome,
      reserveMonths: Math.round(reserveMonths * 10) / 10,
    };
  });

  const enrollmentGuidance: string[] = [];
  const maxCap = sp.maxCapacity || 0;

  for (let i = 1; i < 5; i++) {
    if (enrollmentByYear[i - 1] > 0 && enrollmentByYear[i] > 0) {
      const growth = (enrollmentByYear[i] - enrollmentByYear[i - 1]) / enrollmentByYear[i - 1];
      if (growth > 0.25) {
        enrollmentGuidance.push(
          `Year ${i} to Year ${i + 1} projects ${Math.round(growth * 100)}% enrollment growth. Growth over 25% in a single year is uncommon and may require aggressive marketing or facility expansion.`
        );
      }
    }
  }
  if (maxCap > 0) {
    for (let i = 0; i < 5; i++) {
      if (enrollmentByYear[i] > maxCap) {
        enrollmentGuidance.push(
          `Year ${i + 1} enrollment of ${enrollmentByYear[i]} exceeds facility capacity of ${maxCap}. You'll need a larger facility or phased admissions.`
        );
      }
    }
  }

  const stressTests: StressScenario[] = [
    runStressScenario(
      "Enrollment 20% Below Plan",
      enrollmentByYear, rev, st, fac, prorationFactor,
      (e) => e.map((s) => Math.round(s * 0.8)),
    ),
    runStressScenario(
      "Loss of Philanthropy",
      enrollmentByYear, rev, st, fac, prorationFactor,
      undefined,
      (r) => ({ ...r, annualDonations: 0, foundationGrants: 0, capitalGifts: 0, annualFundraising: 0 }),
    ),
    runStressScenario(
      "Costs 10% Higher",
      enrollmentByYear, rev, st, fac, prorationFactor,
      undefined,
      undefined,
      (f) => ({
        ...f,
        monthlyRent: (f.monthlyRent || 0) * 1.1,
        annualUtilities: (f.annualUtilities || 0) * 1.1,
        annualInsurance: (f.annualInsurance || 0) * 1.1,
        facilityMaintenance: (f.facilityMaintenance || 0) * 1.1,
        curriculumCostPerStudent: (f.curriculumCostPerStudent || 0) * 1.1,
        techCostPerStudent: (f.techCostPerStudent || 0) * 1.1,
        foodServicePerStudent: (f.foodServicePerStudent || 0) * 1.1,
        transportationAnnual: (f.transportationAnnual || 0) * 1.1,
        studentServicesAnnual: (f.studentServicesAnnual || 0) * 1.1,
        annualMarketing: (f.annualMarketing || 0) * 1.1,
        professionalDevelopment: (f.professionalDevelopment || 0) * 1.1,
        otherAnnualExpenses: (f.otherAnnualExpenses || 0) * 1.1,
      }),
    ),
  ];

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
    name: "Operating Cost (% of Revenue)",
    value: pct(opexCostPct),
    status: opexCostPct <= 0.30 ? "good" : opexCostPct <= 0.40 ? "warning" : "danger",
    interpretation:
      opexCostPct <= 0.30
        ? "Operating costs are lean relative to revenue."
        : opexCostPct <= 0.40
          ? "Operating costs are moderate — watch rent escalation and service costs over the 5-year period."
          : "Operating costs are consuming a large share of revenue — review each cost center for savings.",
  });

  keyMetrics.push({
    name: "Net Margin (Year 1)",
    value: pct(y1NetMargin),
    status: y1NetMargin >= 0.1 ? "good" : y1NetMargin >= 0 ? "warning" : "danger",
    interpretation:
      y1NetMargin >= 0.1
        ? "Year 1 shows a healthy surplus — a strong start for a new school."
        : y1NetMargin >= 0
          ? "Year 1 is near break-even — typical for startup schools, but leaves little room for surprises."
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

  if (hasDebt) {
    keyMetrics.push({
      name: "Debt Service Coverage Ratio (Year 1)",
      value: dscr > 0 ? `${dscr.toFixed(2)}x` : "N/A",
      status: dscr >= 1.25 ? "good" : dscr >= 1.0 ? "warning" : "danger",
      interpretation:
        dscr >= 1.25
          ? "DSCR is above 1.25x — lenders typically want to see at least this level."
          : dscr >= 1.0
            ? "DSCR is above 1.0x but tight — lenders may require additional collateral or guarantees."
            : "DSCR is below 1.0x — the school cannot cover debt payments from operating income alone.",
    });
  }

  if (philanthropyPct > 0.05) {
    keyMetrics.push({
      name: "Philanthropy (% of Revenue)",
      value: pct(philanthropyPct),
      status: philanthropyPct <= 0.15 ? "good" : philanthropyPct <= 0.30 ? "warning" : "danger",
      interpretation:
        philanthropyPct <= 0.15
          ? "Philanthropy supplements but doesn't dominate revenue — a sustainable mix."
          : philanthropyPct <= 0.30
            ? "Donations and grants make up a significant share of revenue — plan for donor diversification."
            : "Heavy reliance on philanthropy — lenders view this as unpredictable revenue. Build toward earned revenue sustainability.",
    });
  }

  if (publicRevenuePct > 0.05) {
    keyMetrics.push({
      name: "Public Funding (% of Revenue)",
      value: pct(publicRevenuePct),
      status: publicRevenuePct <= 0.50 ? "good" : publicRevenuePct <= 0.70 ? "warning" : "danger",
      interpretation:
        publicRevenuePct <= 0.50
          ? "Public funding is a meaningful revenue stream without creating over-dependency."
          : publicRevenuePct <= 0.70
            ? "Significant reliance on public funding — changes in state policy could materially impact revenue."
            : "The model is heavily dependent on public funding — develop contingency plans for policy changes.",
    });
  }

  const y5Reserve = cumulativeFinancials[4];
  if (y5Reserve) {
    keyMetrics.push({
      name: "Operating Reserve (Year 5)",
      value: `${y5Reserve.reserveMonths.toFixed(1)} months`,
      status: y5Reserve.reserveMonths >= 3 ? "good" : y5Reserve.reserveMonths >= 1 ? "warning" : "danger",
      interpretation:
        y5Reserve.reserveMonths >= 3
          ? "By Year 5, the school has built a healthy operating reserve of 3+ months — a strong signal to lenders."
          : y5Reserve.reserveMonths >= 1
            ? "The reserve buffer is thin — target building at least 3 months of expenses as a cushion."
            : "No meaningful reserve has been built by Year 5. This is a significant vulnerability.",
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
  if (hasDebt && dscr >= 1.25) strengths.push("Strong debt service coverage ratio");
  if (publicRevenuePct > 0.1 && publicRevenuePct <= 0.5) strengths.push("Diversified revenue with public funding");
  if (philanthropyPct > 0 && philanthropyPct <= 0.15) strengths.push("Supplemental philanthropy without over-reliance");
  if (y5Reserve && y5Reserve.reserveMonths >= 3) strengths.push("Healthy operating reserve by Year 5");

  if (y1NetMargin < 0) risks.push(`Year 1 projects a ${fmt(Math.abs(y1.netIncome))} deficit`);
  if (staffingCostPct > 0.65) risks.push(`Staffing consumes ${pct(staffingCostPct)} of revenue`);
  if (revenuePerStudent < 7000) risks.push("Per-student revenue is below sustainable levels");
  if (opexCostPct > 0.40) risks.push("Operating costs are high relative to revenue");
  if (y5NetMargin < 0.05) risks.push("Year 5 margin is dangerously thin");
  if (breakEvenYear < 0) risks.push("Model does not reach break-even within 5 years");
  if (capacityUtilY5 < 0.6 && sp.maxCapacity && sp.maxCapacity > 0)
    risks.push("Facility will be significantly underutilized");
  if ((rev.scholarshipRate || 0) > 20)
    risks.push(`High scholarship rate (${rev.scholarshipRate}%) reduces net revenue`);
  if (hasDebt && dscr < 1.0)
    risks.push("Debt service exceeds operating income — loan payments are not sustainable");
  if (philanthropyPct > 0.30)
    risks.push(`Philanthropy represents ${pct(philanthropyPct)} of revenue — unpredictable and hard to sustain`);
  if (publicRevenuePct > 0.70)
    risks.push("Over-reliance on public funding exposes the school to policy risk");
  if (y5Reserve && y5Reserve.reserveMonths < 1)
    risks.push("No operating reserve built by Year 5");

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

  if (hasDebt && dscr < 1.25) {
    recommendations.push({
      title: "Improve Debt Service Coverage",
      description: `Your DSCR of ${dscr.toFixed(2)}x is ${dscr < 1.0 ? "below 1.0x — you cannot cover debt payments from operations" : "below the 1.25x lenders typically require"}. Consider reducing the loan amount, extending the term, or increasing revenue before taking on this debt.`,
      priority: "high",
    });
  }

  if (philanthropyPct > 0.30) {
    recommendations.push({
      title: "Reduce Philanthropy Dependency",
      description: `Donations and grants represent ${pct(philanthropyPct)} of Year 1 revenue. Lenders prefer models where earned revenue drives sustainability. Build a path to reduce philanthropy dependency below 20% by Year 3.`,
      priority: "high",
    });
  }

  if (opexCostPct > 0.40) {
    recommendations.push({
      title: "Review Operating Cost Structure",
      description: `Operating costs represent ${pct(opexCostPct)} of revenue. Review each cost center — facility, student services, and administration — for potential savings. Shared space, volunteer programs, or phased services can help.`,
      priority: "medium",
    });
  }

  if (y5Reserve && y5Reserve.reserveMonths < 3) {
    recommendations.push({
      title: "Build a Cash Reserve",
      description: `By Year 5, your projected reserve covers only ${y5Reserve.reserveMonths.toFixed(1)} months of expenses. Lenders and accreditors look for 3-6 months. Focus on building surplus in early profitable years.`,
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

  if (publicRevenuePct > 0.50) {
    recommendations.push({
      title: "Diversify Away from Public Funding",
      description: `Public funding represents ${pct(publicRevenuePct)} of revenue. While beneficial, changes in state legislation or charter authorization could materially impact your school. Develop supplementary revenue streams.`,
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

  if (dangerMetrics === 0 && y5NetMargin >= 0.1 && breakEvenYear <= 1 && (!hasDebt || dscr >= 1.25)) {
    lenderReadiness = "Strong";
    lenderReadinessExplanation =
      "This model shows the financial fundamentals lenders look for: a clear path to profitability, controlled costs, sustainable revenue mix, and adequate debt coverage.";
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
    revenueComposition,
    costComposition,
    cumulativeFinancials,
    stressTests,
    enrollmentGuidance,
    generatedAt: new Date().toISOString(),
  };
}
