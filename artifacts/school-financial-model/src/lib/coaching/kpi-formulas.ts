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
    formula: "Total Revenue / Enrolled Students",
    inputLabels: [
      "Total revenue from all sources (tuition, funding, grants, other)",
      "Total enrolled students in the given year",
    ],
    interpretation:
      "This tells you how much revenue your school generates for each student enrolled. Higher values generally mean more resources per student, but the right number depends on your school model, location, and grade levels served.",
  },
  staffingCostPct: {
    id: "staffingCostPct",
    title: "Staffing Cost %",
    formula: "Total Personnel Costs / Total Revenue × 100",
    inputLabels: [
      "Total personnel costs (salaries + benefits + payroll taxes)",
      "Total revenue from all sources",
    ],
    interpretation:
      "This shows what share of your revenue goes to paying your team. Most schools aim for 50–60%. Above 65% is a warning sign that other budget areas may be underfunded.",
  },
  operatingCostPct: {
    id: "operatingCostPct",
    title: "Operating Cost %",
    formula: "Non-Personnel Expenses / Total Revenue × 100",
    inputLabels: [
      "Total non-personnel operating expenses (rent, materials, technology, etc.)",
      "Total revenue from all sources",
    ],
    interpretation:
      "This measures how much of your revenue goes to non-personnel costs. Keeping this under 30% generally leaves enough room for staffing and a healthy margin.",
  },
  netMargin: {
    id: "netMargin",
    title: "Net Margin",
    formula: "Net Income / Total Revenue × 100",
    inputLabels: [
      "Net income (total revenue minus total expenses including debt service)",
      "Total revenue from all sources",
    ],
    interpretation:
      "Net margin shows the percentage of revenue remaining after all expenses. A positive margin means the school is building reserves. New schools often have thin or negative margins in year one, but most viable models reach 5–15% by year three to five.",
  },
  dscr: {
    id: "dscr",
    title: "Debt Service Coverage Ratio (DSCR)",
    formula: "(Net Income + Debt Payments) / Debt Payments",
    inputLabels: [
      "Net income after all expenses (already includes debt service deduction)",
      "Annual debt payments (principal + interest)",
    ],
    interpretation:
      "DSCR tells lenders whether your school generates enough operating income to cover its loan payments. The formula adds debt payments back to net income to calculate operating income before debt service. A ratio of 1.25x or higher is the standard minimum lenders require. Below 1.0x means operations alone cannot cover the debt.",
  },
  reserveMonths: {
    id: "reserveMonths",
    title: "Reserve Months",
    formula: "Cumulative Net Income / (Annual Expenses / 12)",
    inputLabels: [
      "Cumulative net income (used as a proxy for available cash reserves)",
      "Average monthly operating expenses",
    ],
    interpretation:
      "Reserve months estimate how long your school could operate on its accumulated surplus if revenue stopped. This is a simplified proxy — actual cash reserves may differ based on timing and capital expenditures. Best practice is 3–6 months. Less than one month is a significant risk flag.",
  },
  revenueGrowth: {
    id: "revenueGrowth",
    title: "Revenue Growth",
    formula: "(Final Year Revenue - Year 1 Revenue) / Year 1 Revenue × 100",
    inputLabels: [
      "Year 1 total revenue",
      "Final year total revenue",
    ],
    interpretation:
      "Revenue growth shows total income increase over the projection period. Growth of 30–80% over five years is typical for a healthy school model. Very high growth may look strong but can signal unrealistic enrollment or pricing assumptions.",
  },
  capacityUtilization: {
    id: "capacityUtilization",
    title: "Capacity Utilization",
    formula: "Enrolled Students / Maximum Capacity × 100",
    inputLabels: [
      "Enrolled students in the given year",
      "Maximum student capacity (from school profile)",
    ],
    interpretation:
      "Capacity utilization shows how full your school is relative to its stated maximum. Operating at 80–95% is optimal. Below 60% often means fixed costs are spread too thin across too few students.",
  },
};

export function getKpiFormula(id: string): KpiFormula | undefined {
  return KPI_FORMULAS[id];
}
