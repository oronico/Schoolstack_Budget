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
  schoolName: "Bright Horizon Academy",
  schoolDescription: "A new independent K-8 school in Austin, TX - tuition-based, growing from 18 to 36 students over 5 years as it builds a community of families.",

  enrollment: [18, 22, 26, 31, 36],

  executiveSummary:
    "Bright Horizon Academy projects thoughtful growth from 18 to 36 students over five years, reaching $330K in total revenue by Year 5. Like many early-stage schools, it operates at a loss in Years 1–2 before turning a corner in Year 3 - a completely normal trajectory for a founder-led school. Tuition at $8,200/year is priced accessibly for families, supplemented by a modest scholarship fund and small grants. Staffing costs average 55% of revenue, and the school targets 2 months of operating reserves by Year 5 - a solid foundation to keep building on.",

  biggestStrength:
    "Lean, intentional cost structure with only 2 full-time staff in Year 1 keeps the budget manageable while the school finds its stride. The tuition-driven model provides predictable monthly cash flow and avoids dependence on competitive grant cycles.",

  biggestRisk:
    "Years 1–2 show a combined net shortfall of –$28K, which is an area to plan around. If enrollment grows more slowly than projected, the school may want to draw on its startup reserve or explore an additional $15–20K in bridge funding - a common step for early-stage schools.",

  lenderReadiness: "Moderate" as const,
  lenderReadinessExplanation:
    "The model tells a credible story of a school building toward sustainability. The thinner margins in Years 1–3 mean lenders will likely want to see committed enrollment deposits and a personal guarantee or co-signer. The honesty of this plan is a strength - it's exactly what underwriters appreciate.",

  keyMetrics: [
    {
      name: "Year 5 Net Margin",
      value: "6.8%",
      status: "warning" as const,
      interpretation: "Below the 10% benchmark, but realistic and very common for a school at this stage. This will strengthen as enrollment grows.",
    },
    {
      name: "Debt Service Coverage (Y5)",
      value: "1.5x",
      status: "good" as const,
      interpretation: "Above the 1.2x minimum lenders typically require - a great sign for your financial story.",
    },
    {
      name: "Revenue per Student (Y5)",
      value: "$9,170",
      status: "warning" as const,
      interpretation: "Modest but reflects accessible, family-friendly pricing. There's room to grow this over time.",
    },
    {
      name: "Staffing % of Revenue",
      value: "55%",
      status: "good" as const,
      interpretation: "Well within the healthy 45–60% range - you're investing in your team without overextending.",
    },
    {
      name: "Break-Even Year",
      value: "Year 3",
      status: "warning" as const,
      interpretation: "Very typical for early-stage schools - plan for 18–24 months of startup runway and you'll be in great shape.",
    },
    {
      name: "Operating Reserve (Y5)",
      value: "2.0 months",
      status: "danger" as const,
      interpretation: "Below the recommended 3-month target - an area to strengthen through fundraising or retained earnings as you grow.",
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
