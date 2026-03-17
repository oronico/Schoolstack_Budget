export type GuidanceLevel = "advanced" | "basics" | "extra";

export interface ExplainerBody {
  whatThisMeans: string;
  whyItMatters: string;
  healthyVsRisky: string;
  whatToDoNext: string;
}

export interface Explainer {
  id: string;
  title: string;
  body: ExplainerBody;
  audienceLevel: GuidanceLevel[];
  relatedSection: string;
  dismissible: boolean;
  autoExpandFor: GuidanceLevel[];
}

export const EXPLAINERS: Record<string, Explainer> = {
  revenue: {
    id: "revenue",
    title: "Revenue",
    body: {
      whatThisMeans: "Revenue is all the money your school expects to bring in. This includes tuition, public funding, grants, fundraising, and any other income sources.",
      whyItMatters: "Revenue is the foundation of your financial model. If your revenue projections are off, everything else will be too. Lenders and funders look closely at how realistic and diversified your revenue assumptions are.",
      healthyVsRisky: "Schools with two or more revenue streams are considered lower risk. Relying heavily on a single source, like one large grant, can be risky if that funding changes. A healthy model shows steady, diversified income that grows with enrollment.",
      whatToDoNext: "Start with your most certain revenue sources first. If you're a tuition-based school, begin there. Add other sources only if you have reasonable confidence they'll come through.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "revenue",
    dismissible: true,
    autoExpandFor: ["basics", "extra"],
  },
  enrollment_assumptions: {
    id: "enrollment_assumptions",
    title: "Enrollment Assumptions",
    body: {
      whatThisMeans: "Enrollment assumptions are your best estimate of how many students will attend your school each year for the next five years. This drives nearly every other number in your model.",
      whyItMatters: "Enrollment is the single biggest driver of both revenue and expenses. If you assume too many students too quickly, your budget will look great on paper but may not hold up in practice. Lenders pay close attention to whether your growth assumptions are realistic.",
      healthyVsRisky: "Most new schools fill 40-65% of capacity in year one. Growth of 15-25% per year is considered strong and realistic. Jumping from 30 to 150 students in one year is a red flag for funders.",
      whatToDoNext: "Start with how many students you're confident you can enroll in year one. Then project realistic growth based on your waitlist, marketing plans, and community demand.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "enrollment",
    dismissible: true,
    autoExpandFor: ["basics", "extra"],
  },
  tuition_assumptions: {
    id: "tuition_assumptions",
    title: "Tuition Assumptions",
    body: {
      whatThisMeans: "Your tuition assumptions include the amount you charge per student, how much you expect to collect, and how tuition changes over time. This often represents the largest share of revenue for private and independent schools.",
      whyItMatters: "Setting tuition too high can limit enrollment. Setting it too low can leave you short on revenue. Collection rates matter too, because not every family will pay the full amount on time.",
      healthyVsRisky: "A collection rate of 90-95% is realistic for most schools. Planning for 100% collection is risky. Annual tuition increases of 2-4% are common and generally sustainable.",
      whatToDoNext: "Research what comparable schools in your area charge. Set a tuition level that balances affordability for families with your school's financial needs.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "revenue",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  grants_fundraising: {
    id: "grants_fundraising",
    title: "Grants and Fundraising",
    body: {
      whatThisMeans: "This includes grants from foundations, government programs, and individual donations. Some of this funding may be restricted to specific purposes, while other funds can be used for general operations.",
      whyItMatters: "Grants and fundraising can be a powerful supplement to tuition and public funding, but they're often unpredictable. Lenders distinguish between one-time grants and recurring support, because they want to know what you can count on year after year.",
      healthyVsRisky: "If grants make up more than 30-40% of your recurring operating revenue, funders may see that as a risk. A healthy model treats grants as supplemental rather than foundational. Having a mix of small and large donors is stronger than depending on one big gift.",
      whatToDoNext: "List only the grants and fundraising you have strong reason to expect. Separate one-time startup grants from ongoing support so your projections stay honest.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "revenue",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  payroll: {
    id: "payroll",
    title: "Payroll",
    body: {
      whatThisMeans: "Payroll is the total cost of compensating your team, including salaries, benefits, payroll taxes, and any other personnel-related expenses. This is almost always the largest single expense category for a school.",
      whyItMatters: "Personnel costs typically represent 50-65% of a school's total budget. If payroll grows faster than revenue, the school will face financial pressure quickly. Getting staffing right is one of the most important parts of your financial model.",
      healthyVsRisky: "Staffing costs under 55% of revenue are generally healthy. Between 55-65% is manageable but worth watching. Above 65% is a warning sign that the school may be overstaffed relative to its revenue.",
      whatToDoNext: "Start with your essential roles and build up. Consider which positions can be part-time or shared in the early years. Make sure your staffing plan grows in step with enrollment.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "staffing",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  occupancy_rent: {
    id: "occupancy_rent",
    title: "Occupancy and Rent",
    body: {
      whatThisMeans: "Occupancy costs include your rent or mortgage, utilities, maintenance, insurance, and any other facility-related expenses. For many schools, this is the second-largest expense after payroll.",
      whyItMatters: "Facility costs are usually fixed, meaning they don't change much whether you have 20 students or 100. That makes them especially important for new schools that are still growing enrollment.",
      healthyVsRisky: "Occupancy costs between 10-20% of revenue are typical. Above 25% can put pressure on your budget, especially in the early years when enrollment is ramping up. Lenders pay close attention to lease terms and facility costs.",
      whatToDoNext: "If you have a location, enter your actual costs. If you're still searching, use estimates based on comparable spaces in your area. Consider whether sharing space or starting smaller could reduce early-year risk.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "expenses",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  program_expenses: {
    id: "program_expenses",
    title: "Program Expenses",
    body: {
      whatThisMeans: "Program expenses cover the costs directly related to running your educational program: curriculum materials, textbooks, technology, supplies, field trips, assessments, and professional development for staff.",
      whyItMatters: "These costs directly affect the quality of education you can deliver. Underfunding your program can hurt student outcomes and make it harder to attract and retain families. But over-spending before you have the revenue to support it can strain your budget.",
      healthyVsRisky: "Most schools spend $300-800 per student on instructional materials and $150-300 per student on technology. Spending significantly above or below these ranges is worth examining.",
      whatToDoNext: "Start with your core instructional needs and add from there. Consider what you truly need in year one versus what can be phased in as the school grows.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "expenses",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  operating_surplus_deficit: {
    id: "operating_surplus_deficit",
    title: "Operating Surplus or Deficit",
    body: {
      whatThisMeans: "Your operating surplus (or deficit) is the difference between your total revenue and total expenses for a given year. A surplus means you brought in more than you spent. A deficit means expenses exceeded revenue.",
      whyItMatters: "A small surplus is the goal for most schools, especially nonprofits. It shows the school can sustain itself and build reserves. Repeated deficits signal that the current model isn't financially sustainable without changes.",
      healthyVsRisky: "New schools often run a small deficit in year one as they ramp up. By year two or three, most viable models show a positive margin. A margin of 5-15% by year five is a strong signal to lenders.",
      whatToDoNext: "If your model shows persistent deficits, look at the biggest cost drivers first: staffing, rent, and enrollment. Small changes in these areas can have a meaningful impact on your bottom line.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  cash_flow: {
    id: "cash_flow",
    title: "Cash Flow",
    body: {
      whatThisMeans: "Cash flow tracks the actual movement of money in and out of your school over time. Unlike your annual budget, cash flow shows when money arrives and when it leaves, which can be very different things.",
      whyItMatters: "A school can have a balanced annual budget but still run out of cash in certain months. This happens when expenses come due before revenue arrives, like paying rent in August before tuition payments start in September.",
      healthyVsRisky: "Having at least 2-3 months of operating expenses in cash at all times is a good target. If your cash dips below one month of expenses at any point, that's a risk that needs attention.",
      whatToDoNext: "Look at the timing of your major revenue and expenses. If there's a gap, consider how you'll bridge it, whether through a line of credit, earlier payment collection, or building up reserves.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  ending_cash: {
    id: "ending_cash",
    title: "Ending Cash",
    body: {
      whatThisMeans: "Ending cash is the amount of money your school has at the end of a given period, after accounting for all the cash that came in and went out. Think of it as your bank balance at the end of the month or year.",
      whyItMatters: "Ending cash tells you whether your school can actually pay its bills. Even if your annual budget shows a surplus, you need enough cash on hand to cover payroll, rent, and other expenses as they come due.",
      healthyVsRisky: "Ending cash should never go negative, because that means you can't cover your obligations. Having 2-3 months of expenses in ending cash provides a reasonable safety cushion.",
      whatToDoNext: "If ending cash drops below zero in any month, review when your revenue arrives versus when your largest expenses are due. Adjust timing assumptions or plan for a startup reserve.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  reserves: {
    id: "reserves",
    title: "Reserves",
    body: {
      whatThisMeans: "Reserves are the savings your school sets aside to handle unexpected costs or revenue shortfalls. This is money that's available but not earmarked for day-to-day operations.",
      whyItMatters: "Reserves are your safety net. Schools without adequate reserves are vulnerable to surprises like enrollment drops, facility repairs, or delayed grant payments. Lenders consider reserves a key indicator of financial health.",
      healthyVsRisky: "Best practice is to build toward 3-6 months of operating expenses in reserves. Schools with less than one month of reserves are considered high-risk by most lenders.",
      whatToDoNext: "If you're starting without reserves, build a plan to accumulate them over time. Even small surpluses set aside each year add up. Consider including a reserve target in your model's assumptions.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  budget_vs_actual: {
    id: "budget_vs_actual",
    title: "Budget vs Actual",
    body: {
      whatThisMeans: "Budget vs actual compares what you planned to spend and earn against what actually happened. This is how you measure whether your financial model held up in practice.",
      whyItMatters: "No budget is perfect on the first try. Tracking budget vs actual helps you identify where your assumptions were off so you can improve future projections. Lenders and boards expect to see this kind of accountability.",
      healthyVsRisky: "Small variances (under 5-10%) are normal and expected. Large, repeated variances in the same direction suggest your assumptions need updating. The worst outcome is not tracking this at all.",
      whatToDoNext: "Plan to compare your budget against actual results monthly or quarterly once the school is operating. Use what you learn to update your projections and make better decisions.",
    },
    audienceLevel: ["extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
  fixed_vs_variable: {
    id: "fixed_vs_variable",
    title: "Fixed vs Variable Costs",
    body: {
      whatThisMeans: "Fixed costs stay roughly the same regardless of how many students you have, like rent and insurance. Variable costs change with enrollment, like instructional materials and food service.",
      whyItMatters: "Understanding this distinction helps you plan for different enrollment scenarios. If most of your costs are fixed, a drop in enrollment hits much harder because those costs don't shrink with fewer students.",
      healthyVsRisky: "A healthy cost structure has a mix of both. Schools with very high fixed costs relative to revenue need higher enrollment certainty to be sustainable. Schools with more variable costs have more flexibility.",
      whatToDoNext: "Look at your expense categories and identify which are fixed and which change with enrollment. This helps you understand your breakeven point and what happens if enrollment comes in lower than planned.",
    },
    audienceLevel: ["extra"],
    relatedSection: "expenses",
    dismissible: true,
    autoExpandFor: ["extra"],
  },
};

export function getExplainersForSection(section: string, level: GuidanceLevel): Explainer[] {
  return Object.values(EXPLAINERS).filter(
    (e) => e.relatedSection === section && e.audienceLevel.includes(level)
  );
}

export function getExplainerById(id: string): Explainer | undefined {
  return EXPLAINERS[id];
}

export function shouldAutoExpand(level: GuidanceLevel, explainer: Explainer): boolean {
  return explainer.autoExpandFor.includes(level);
}
