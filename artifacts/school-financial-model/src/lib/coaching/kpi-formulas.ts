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
      "Total Year 1 revenue from all sources (tuition, funding, grants, other)",
      "Total enrolled students in Year 1",
    ],
    interpretation:
      "This tells you how much revenue your school generates for each student enrolled. Higher values generally mean more resources per student, but the right number depends on your school model, location, and grade levels served.",
  },
  staffingCostPct: {
    id: "staffingCostPct",
    title: "Staffing Cost %",
    formula: "Total Personnel Costs / Total Revenue × 100",
    inputLabels: [
      "Total Year 1 personnel costs (salaries + benefits + payroll taxes)",
      "Total Year 1 revenue from all sources",
    ],
    interpretation:
      "This shows what share of your revenue goes to paying your team. Most schools aim for 50–60%. Above 65% is a warning sign that other budget areas may be underfunded.",
  },
  operatingCostPct: {
    id: "operatingCostPct",
    title: "Operating Cost %",
    formula: "Total Non-Personnel Costs / Total Revenue × 100",
    inputLabels: [
      "Total Year 1 non-personnel costs (operating expenses, facility costs, and capital/debt service)",
      "Total Year 1 revenue from all sources",
    ],
    interpretation:
      "This measures how much of your revenue goes to everything except staffing — rent, materials, technology, debt payments, and other operating costs. Keeping this under 30% generally leaves enough room for staffing and a healthy margin.",
  },
  netMargin: {
    id: "netMargin",
    title: "Net Margin",
    formula: "Net Income / Total Revenue × 100",
    inputLabels: [
      "Net income (total revenue minus all expenses including staffing, operating costs, and debt service)",
      "Total revenue from all sources",
    ],
    interpretation:
      "Net margin shows the percentage of revenue remaining after all expenses. The analysis shows this for both Year 1 and the final year. A positive margin means the school is building reserves. New schools often have thin or negative margins in year one, but most viable models reach 5–15% by year three to five.",
  },
  dscr: {
    id: "dscr",
    title: "Debt Service Coverage Ratio (DSCR)",
    formula: "(Net Income + Loan Debt Service) / Loan Debt Service",
    inputLabels: [
      "Year 1 net income (already includes loan debt service as a deduction)",
      "Year 1 loan debt service (annual loan payments only — excludes non-loan capital expenditures)",
    ],
    interpretation:
      "DSCR tells lenders whether your school generates enough operating income to cover its loan payments. The formula adds loan debt service back to net income to calculate operating income before debt service. A ratio of 1.25x or higher is the standard minimum lenders require. Below 1.0x means operations alone cannot cover the loan payments.",
  },
  reserveMonths: {
    id: "reserveMonths",
    title: "Reserve Months",
    formula: "max(0, Cumulative Net Income) / (Annual Expenses / 12)",
    inputLabels: [
      "Cumulative net income through the final projection year (used as a proxy for available cash reserves; clamped to zero if negative)",
      "Final year average monthly expenses (total annual expenses divided by 12)",
    ],
    interpretation:
      "Reserve months estimate how long your school could operate on its accumulated surplus if revenue stopped. If cumulative net income is negative, reserve months shows zero rather than a negative number. This is a simplified proxy — actual cash reserves may differ based on timing, starting cash, and capital expenditures. The analysis shows the reserve level at the end of the projection period. Best practice is 3–6 months. Less than one month is a significant risk flag.",
  },
  revenueGrowth: {
    id: "revenueGrowth",
    title: "Revenue Growth",
    formula: "(Final Year Revenue − Year 1 Revenue) / Year 1 Revenue × 100",
    inputLabels: [
      "Year 1 total revenue",
      "Final projection year total revenue",
    ],
    interpretation:
      "Revenue growth shows total income increase over the projection period. Growth of 30–80% over the forecast horizon is typical for a healthy school model. Very high growth may look strong but can signal unrealistic enrollment or pricing assumptions.",
  },
  capacityUtilization: {
    id: "capacityUtilization",
    title: "Capacity Utilization",
    formula: "Final Year Enrolled Students / Maximum Capacity × 100",
    inputLabels: [
      "Enrolled students in the final projection year",
      "Maximum student capacity (from school profile)",
    ],
    interpretation:
      "Capacity utilization shows how full your school is projected to be by the end of the forecast period. Operating at 80–95% is optimal. Below 60% often means fixed costs are spread too thin across too few students.",
  },
  breakevenEnrollment: {
    id: "breakevenEnrollment",
    title: "Breakeven Enrollment",
    formula: "Fixed Costs / (Revenue per Student − Variable Cost per Student)",
    inputLabels: [
      "Total fixed costs (expenses that don't change with enrollment — rent, insurance, admin salaries, etc.)",
      "Revenue per student (total Year 1 revenue ÷ enrollment)",
      "Variable cost per student (per-student expenses like curriculum, devices, supplies)",
    ],
    interpretation:
      "Breakeven enrollment is the minimum number of students your school needs just to cover its costs. If your projected enrollment is close to or below this number, the financial model has very little margin for error. Lenders look at this to understand how sensitive your budget is to enrollment shortfalls. A healthy gap between breakeven and projected enrollment signals resilience.",
  },
  occupancyCostPerStudent: {
    id: "occupancyCostPerStudent",
    title: "Occupancy Cost per Student",
    formula: "Total Facility Costs / Enrolled Students",
    inputLabels: [
      "Total Year 1 facility costs (rent, utilities, insurance, maintenance)",
      "Total enrolled students in Year 1",
    ],
    interpretation:
      "This tells you how much your school spends on its physical space for each student. Lenders and authorizers compare this against benchmarks ($1,500–$3,000 per student is typical). Very high numbers may signal an oversized or overpriced facility relative to enrollment.",
  },
  occupancyCostPerSqft: {
    id: "occupancyCostPerSqft",
    title: "Occupancy Cost per Sq Ft",
    formula: "Total Facility Costs / Square Footage",
    inputLabels: [
      "Total Year 1 facility costs",
      "Total square footage of the facility",
    ],
    interpretation:
      "Cost per square foot helps you compare your space against local market rates. If your all-in occupancy cost per sq ft is significantly above comparable commercial space in your area, it may be worth renegotiating or exploring alternatives.",
  },
};

export function getKpiFormula(id: string): KpiFormula | undefined {
  return KPI_FORMULAS[id];
}
