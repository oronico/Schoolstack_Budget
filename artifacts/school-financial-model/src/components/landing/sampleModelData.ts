export interface SampleKeyMetric {
  name: string;
  value: string;
  status: "good" | "warning" | "danger";
  interpretation: string;
}

export interface SampleRevenueComposition {
  tuitionPct: number;
  publicPct: number;
  philanthropyPct: number;
}

export interface SampleCostComposition {
  staffingPctOfRevenue: number;
  facilityPctOfRevenue: number;
  totalOpexPctOfRevenue: number;
}

export const sampleModelData = {
  schoolName: "Evergreen Microschool",
  schoolDescription: "A new 501(c)(3) microschool in Austin, TX — tuition-based, growing from 25 to 80 students over 5 years.",

  enrollment: [25, 40, 55, 68, 80],

  executiveSummary:
    "Evergreen Microschool projects steady growth from 25 to 80 students over five years, reaching $1.1M in total revenue by Year 5. The school breaks even in Year 2 with a healthy 14.2% net margin by Year 5. Conservative tuition pricing at $12,500/year combined with modest philanthropic support creates a sustainable funding base. Staffing costs remain well-controlled at 52% of revenue, and the school builds 3.1 months of operating reserves by Year 5 — a solid foundation for long-term viability.",

  biggestStrength:
    "Strong enrollment growth trajectory with a clear path to profitability by Year 2. The tuition-heavy revenue model provides predictable cash flow and reduces dependency on volatile grant funding.",

  biggestRisk:
    "Year 1 operates at a net loss of –$18,200 with only 25 students. If enrollment falls short of the 40-student Year 2 target, the break-even timeline could extend significantly.",

  lenderReadiness: "Strong" as const,
  lenderReadinessExplanation:
    "The model demonstrates a clear path to sustainability with break-even by Year 2, growing margins, and manageable debt service. A lender would view this favorably, especially given the conservative assumptions and realistic enrollment ramp.",

  keyMetrics: [
    {
      name: "Year 5 Net Margin",
      value: "14.2%",
      status: "good" as const,
      interpretation: "Above the 10% benchmark for healthy school operations.",
    },
    {
      name: "Debt Service Coverage (Y5)",
      value: "2.8x",
      status: "good" as const,
      interpretation: "Well above the 1.2x minimum lenders typically require.",
    },
    {
      name: "Revenue per Student (Y5)",
      value: "$13,750",
      status: "good" as const,
      interpretation: "Competitive pricing that supports quality programming.",
    },
    {
      name: "Staffing % of Revenue",
      value: "52%",
      status: "good" as const,
      interpretation: "Within the ideal 45–60% range for microschools.",
    },
    {
      name: "Break-Even Year",
      value: "Year 2",
      status: "good" as const,
      interpretation: "Early break-even reduces startup risk considerably.",
    },
    {
      name: "Operating Reserve (Y5)",
      value: "3.1 months",
      status: "warning" as const,
      interpretation: "Approaching the recommended 3-month minimum. Continue building reserves.",
    },
  ] as SampleKeyMetric[],

  revenueComposition: [
    { tuitionPct: 0.82, publicPct: 0.0, philanthropyPct: 0.18 },
    { tuitionPct: 0.85, publicPct: 0.0, philanthropyPct: 0.15 },
    { tuitionPct: 0.88, publicPct: 0.0, philanthropyPct: 0.12 },
    { tuitionPct: 0.90, publicPct: 0.0, philanthropyPct: 0.10 },
    { tuitionPct: 0.92, publicPct: 0.0, philanthropyPct: 0.08 },
  ] as SampleRevenueComposition[],

  costComposition: [
    { staffingPctOfRevenue: 0.58, facilityPctOfRevenue: 0.28, totalOpexPctOfRevenue: 0.95 },
    { staffingPctOfRevenue: 0.55, facilityPctOfRevenue: 0.22, totalOpexPctOfRevenue: 0.88 },
    { staffingPctOfRevenue: 0.53, facilityPctOfRevenue: 0.19, totalOpexPctOfRevenue: 0.84 },
    { staffingPctOfRevenue: 0.52, facilityPctOfRevenue: 0.17, totalOpexPctOfRevenue: 0.82 },
    { staffingPctOfRevenue: 0.52, facilityPctOfRevenue: 0.15, totalOpexPctOfRevenue: 0.80 },
  ] as SampleCostComposition[],
};
