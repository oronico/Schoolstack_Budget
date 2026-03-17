export interface KpiFormula {
  id: string;
  title: string;
  formula: string;
  inputLabels: string[];
  interpretation: string;
}

export const KPI_FORMULAS: Record<string, KpiFormula> = {
  revenuePerStudent: {
    id: "revenuePerStudent",
    title: "Revenue per Student",
    formula: "Total Revenue / Number of Students",
    inputLabels: ["Total revenue (all sources)", "Total enrolled students"],
    interpretation:
      "This tells you how much revenue your school generates for each student enrolled. Higher values generally mean more resources per student, but the right number depends on your school model and location.",
  },
  staffingCostPct: {
    id: "staffingCostPct",
    title: "Staffing Cost %",
    formula: "Total Personnel Costs / Total Revenue × 100",
    inputLabels: ["Total salaries, benefits, and payroll taxes", "Total revenue"],
    interpretation:
      "This shows what share of your revenue goes to paying your team. Most schools aim for 50-60%. If staffing takes more than 65% of revenue, there may not be enough left to cover rent, materials, and other essentials.",
  },
  operatingCostPct: {
    id: "operatingCostPct",
    title: "Operating Cost %",
    formula: "Non-Personnel Expenses / Total Revenue × 100",
    inputLabels: ["Total non-personnel operating expenses", "Total revenue"],
    interpretation:
      "This measures how much of your revenue goes to non-personnel costs like rent, materials, and technology. Keeping this under 30% generally leaves enough room for staffing and a healthy margin.",
  },
  netMargin: {
    id: "netMargin",
    title: "Net Margin",
    formula: "(Total Revenue - Total Expenses) / Total Revenue × 100",
    inputLabels: ["Total revenue", "Total expenses"],
    interpretation:
      "Net margin shows the percentage of revenue left after all expenses. A positive margin means you're building reserves. New schools often have thin or negative margins in year one, but most viable models reach 5-15% by year three to five.",
  },
  dscr: {
    id: "dscr",
    title: "Debt Service Coverage Ratio (DSCR)",
    formula: "Net Operating Income / Annual Debt Payments",
    inputLabels: ["Net operating income (revenue minus operating expenses)", "Annual loan payments (principal + interest)"],
    interpretation:
      "DSCR tells lenders whether your school generates enough income to cover its loan payments. A ratio of 1.25 or higher is the standard minimum. Below 1.0 means you can't cover your debt from operations.",
  },
  reserveMonths: {
    id: "reserveMonths",
    title: "Reserve Months",
    formula: "Ending Cash Balance / (Annual Expenses / 12)",
    inputLabels: ["Cash on hand at end of period", "Average monthly expenses"],
    interpretation:
      "Reserve months tell you how many months your school could operate if all revenue stopped. Best practice is 3-6 months. Less than one month is a significant risk that lenders and boards will flag.",
  },
  revenueGrowth: {
    id: "revenueGrowth",
    title: "Revenue Growth",
    formula: "(Year 5 Revenue - Year 1 Revenue) / Year 1 Revenue × 100",
    inputLabels: ["Year 1 total revenue", "Year 5 total revenue"],
    interpretation:
      "Revenue growth shows how much your income increases over the projection period. Growth of 30-80% over five years is typical for a healthy school model. Very high growth may look good but can signal unrealistic assumptions.",
  },
  capacityUtilization: {
    id: "capacityUtilization",
    title: "Capacity Utilization",
    formula: "Enrolled Students / Maximum Capacity × 100",
    inputLabels: ["Current enrollment", "Maximum student capacity"],
    interpretation:
      "Capacity utilization shows how full your school is relative to its maximum size. Operating at 80-95% is optimal, leaving room for new students while generating enough revenue to cover fixed costs. Below 60% often means fixed costs are spread too thin.",
  },
};

export function getKpiFormula(id: string): KpiFormula | undefined {
  return KPI_FORMULAS[id];
}
