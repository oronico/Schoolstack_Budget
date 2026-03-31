export interface PrimerCard {
  id: string;
  title: string;
  body: string;
  takeaway: string;
  order: number;
}

export const PRIMER_CARDS: PrimerCard[] = [
  {
    id: "revenue",
    title: "Where Does the Money Come From?",
    body: "School revenue typically comes from three sources: tuition and fees (what families pay), public funding (per-pupil allocations from state or federal programs), and philanthropy (grants, donations, and fundraising). Most healthy schools build their model around predictable, enrollment-driven income rather than one-time grants.",
    takeaway: "Focus on revenue that grows as enrollment grows.",
    order: 1,
  },
  {
    id: "expenses",
    title: "Where Does the Money Go?",
    body: "Your biggest expense is always people — typically 50-65% of your budget goes to salaries, benefits, and payroll taxes. After staffing, your largest costs are usually facility (rent, utilities, maintenance) and program (curriculum, supplies, technology). The key is making sure every dollar supports your mission while keeping the school financially sustainable.",
    takeaway: "Staffing is your single biggest financial lever.",
    order: 2,
  },
  {
    id: "budget_vs_cash",
    title: "Budget vs. Cash Flow",
    body: "Your annual budget might balance perfectly — revenue equals expenses — but that doesn't mean you'll have cash when bills are due. Revenue arrives in chunks (tuition payments, quarterly grants), while expenses like payroll and rent happen every month. Cash flow management means making sure money arrives before it needs to go out.",
    takeaway: "A balanced budget and positive cash flow are different things. You need both.",
    order: 3,
  },
  {
    id: "reserves",
    title: "Why Reserves Matter",
    body: "Reserves are cash you set aside for unexpected expenses or revenue shortfalls. Lenders and funders typically want to see 45-90 days of operating expenses in reserve. Without reserves, a single surprise — a delayed grant, unexpected repairs, lower-than-expected enrollment — can put your school at risk.",
    takeaway: "Aim for at least 2-3 months of operating expenses in reserve.",
    order: 4,
  },
  {
    id: "mistakes",
    title: "Common Budgeting Mistakes",
    body: "The most common mistakes new school founders make: (1) Over-projecting enrollment in Year 1, (2) Hiring too many staff before enrollment supports it, (3) Relying heavily on one-time grants for recurring expenses, (4) Ignoring the timing of when money arrives, and (5) Not building in a reserve cushion. These aren't fatal — they're just things to watch for as you build your model.",
    takeaway: "Be conservative in Year 1. You can always grow faster than planned.",
    order: 5,
  },
  {
    id: "lenders",
    title: "What Lenders and Funders Care About",
    body: "When reviewing your financial model, lenders look for: positive net income by Year 2 or 3, staffing costs under 65% of revenue, realistic enrollment projections backed by evidence, adequate cash reserves, and a clear plan for debt repayment. They want to see that you've thought carefully about risks and have realistic assumptions — not that everything is perfect.",
    takeaway: "Lenders want realistic planning, not optimistic projections.",
    order: 6,
  },
];
