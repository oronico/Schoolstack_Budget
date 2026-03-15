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
  schoolDescription: "A new 501(c)(3) microschool in Austin, TX — tuition-based, growing from 18 to 36 students over 5 years.",

  enrollment: [18, 22, 26, 31, 36],

  executiveSummary:
    "Evergreen Microschool projects measured growth from 18 to 36 students over five years, reaching $330K in total revenue by Year 5. The school operates at a loss in Years 1–2 before reaching cash-flow positive in Year 3. Tuition at $8,200/year is priced accessibly for the Austin market, supplemented by a modest scholarship fund and small grants. Staffing costs average 55% of revenue, and the school targets 2 months of operating reserves by Year 5 — a realistic plan that reflects actual microschool economics.",

  biggestStrength:
    "Lean cost structure with only 2 full-time staff in Year 1 keeps the burn rate manageable. The tuition-heavy model provides predictable monthly cash flow and avoids dependence on competitive grant cycles.",

  biggestRisk:
    "Years 1–2 operate at a combined net loss of –$28K. If enrollment growth stalls below 22 students in Year 2, the school may need to draw on its startup reserve or raise an additional $15–20K in bridge funding.",

  lenderReadiness: "Moderate" as const,
  lenderReadinessExplanation:
    "The model shows a credible path to sustainability, but the thin margins in Years 1–3 mean lenders will likely want to see committed enrollment deposits and a personal guarantee or co-signer. The plan is honest — which is exactly what underwriters want to see.",

  keyMetrics: [
    {
      name: "Year 5 Net Margin",
      value: "6.8%",
      status: "warning" as const,
      interpretation: "Below the 10% benchmark, but realistic for a school of this size.",
    },
    {
      name: "Debt Service Coverage (Y5)",
      value: "1.5x",
      status: "good" as const,
      interpretation: "Above the 1.2x minimum lenders typically require.",
    },
    {
      name: "Revenue per Student (Y5)",
      value: "$9,170",
      status: "warning" as const,
      interpretation: "Modest but reflects accessible pricing for the target community.",
    },
    {
      name: "Staffing % of Revenue",
      value: "55%",
      status: "good" as const,
      interpretation: "Within the ideal 45–60% range for microschools.",
    },
    {
      name: "Break-Even Year",
      value: "Year 3",
      status: "warning" as const,
      interpretation: "Typical for microschools — plan for 18–24 months of startup runway.",
    },
    {
      name: "Operating Reserve (Y5)",
      value: "2.0 months",
      status: "danger" as const,
      interpretation: "Below the recommended 3-month minimum. Fundraising or retained earnings needed.",
    },
  ] as SampleKeyMetric[],

  revenueComposition: [
    { tuitionPct: 0.78, publicPct: 0.0, philanthropyPct: 0.22 },
    { tuitionPct: 0.80, publicPct: 0.0, philanthropyPct: 0.20 },
    { tuitionPct: 0.83, publicPct: 0.0, philanthropyPct: 0.17 },
    { tuitionPct: 0.86, publicPct: 0.0, philanthropyPct: 0.14 },
    { tuitionPct: 0.88, publicPct: 0.0, philanthropyPct: 0.12 },
  ] as SampleRevenueComposition[],

  costComposition: [
    { staffingPctOfRevenue: 0.62, facilityPctOfRevenue: 0.30, totalOpexPctOfRevenue: 1.12 },
    { staffingPctOfRevenue: 0.58, facilityPctOfRevenue: 0.26, totalOpexPctOfRevenue: 1.04 },
    { staffingPctOfRevenue: 0.55, facilityPctOfRevenue: 0.22, totalOpexPctOfRevenue: 0.92 },
    { staffingPctOfRevenue: 0.54, facilityPctOfRevenue: 0.20, totalOpexPctOfRevenue: 0.88 },
    { staffingPctOfRevenue: 0.53, facilityPctOfRevenue: 0.18, totalOpexPctOfRevenue: 0.85 },
  ] as SampleCostComposition[],
};
