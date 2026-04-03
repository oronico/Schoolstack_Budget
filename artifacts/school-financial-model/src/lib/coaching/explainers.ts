export type GuidanceLevel = "advanced" | "basics" | "extra";

export interface ExplainerBody {
  whatThisMeans: string;
  whyItMatters: string;
  healthyVsRisky: string;
  whatToDoNext: string;
}

export type ExplainerPriority = "high" | "standard";

export interface Explainer {
  id: string;
  title: string;
  body: ExplainerBody;
  audienceLevel: GuidanceLevel[];
  relatedSection: string;
  dismissible: boolean;
  autoExpandFor: GuidanceLevel[];
  order: number;
  highFriction: boolean;
  priority: ExplainerPriority;
}

export const EXPLAINERS: Record<string, Explainer> = {
  revenue: {
    id: "revenue",
    title: "Revenue",
    body: {
      whatThisMeans: "Revenue is all the money your school expects to bring in — tuition, public funding, grants, fundraising, and any other income sources. Think of it as the total fuel your school runs on.",
      whyItMatters: "Revenue follows enrollment — demand is the engine of your financial model. Lenders focus on whether your revenue is anchored to dependable, enrollment-driven income (tuition, per-pupil funding) rather than uncertain sources like one-time grants. We see this distinction matter a lot in how models get evaluated.",
      healthyVsRisky: "A focused revenue model anchored to enrollment-driven income is a strength, not a weakness. The risk isn't having one dominant stream — it's relying on income that doesn't scale with student demand (like a single large grant). I'd look for revenue that grows reliably as enrollment grows.",
      whatToDoNext: "I'd start with your most certain, demand-driven revenue sources. If you're a tuition-based school, begin there. Add other sources only if you have reasonable confidence they'll come through. Focus on filling seats first — everything else follows.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "revenue",
    dismissible: true,
    autoExpandFor: ["basics", "extra"],
    order: 1,
    highFriction: true,
    priority: "high",
  },
  enrollment_assumptions: {
    id: "enrollment_assumptions",
    title: "Enrollment Assumptions",
    body: {
      whatThisMeans: "Enrollment assumptions are your best estimate of how many students will attend your school each year for the next five years. This is the single most important input in your entire model — everything flows from it.",
      whyItMatters: "Demand is the engine. Every revenue line, every staffing decision, and every expense assumption flows from how many students you enroll. If enrollment falls short, the entire model breaks. We've seen lenders scrutinize enrollment projections more than any other assumption.",
      healthyVsRisky: "Most new schools fill 40-65% of capacity in Year 1. Growth of 15-25% per year is considered strong and realistic. Jumping from 30 to 150 students in one year is a red flag. What matters most: can you document the demand? Waitlist depth, letters of intent, recruitment pipeline, and retention rates are what make enrollment projections credible.",
      whatToDoNext: "I'd start with how many students you're confident you can enroll in Year 1 based on evidence — signed letters of intent, waitlist data, or community survey results. Then project realistic growth based on your recruitment capacity and retention expectations.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "enrollment",
    dismissible: true,
    autoExpandFor: ["basics", "extra"],
    order: 2,
    highFriction: true,
    priority: "high",
  },
  tuition_assumptions: {
    id: "tuition_assumptions",
    title: "Tuition Assumptions",
    body: {
      whatThisMeans: "Your tuition assumptions include the amount you charge per student, how much you expect to collect, and how tuition changes over time. For private and independent schools, this is often the largest share of revenue.",
      whyItMatters: "Setting tuition too high can limit enrollment. Setting it too low can leave you short on revenue. Collection rates matter too — not every family will pay the full amount on time. We'd encourage you to be realistic here rather than optimistic.",
      healthyVsRisky: "A collection rate of 90-95% is realistic for most schools. Planning for 100% collection is risky. Annual tuition increases of 2-4% are common and generally sustainable.",
      whatToDoNext: "I'd research what comparable schools in your area charge. Set a tuition level that balances affordability for families with your school's financial needs. If you're unsure, err slightly conservative — it's easier to adjust up than to recover from overestimating.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "revenue",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 3,
    highFriction: false,
    priority: "standard",
  },
  grants_fundraising: {
    id: "grants_fundraising",
    title: "Grants and Fundraising",
    body: {
      whatThisMeans: "This includes grants from foundations, government programs, and individual donations. Some of this funding may be restricted to specific purposes, while other funds can be used for general operations.",
      whyItMatters: "Grants and fundraising can be valuable, but they're inherently uncertain — competitive, time-limited, and subject to donor priorities. We always recommend building a model anchored to earned revenue that scales with enrollment, not to fundraising outcomes.",
      healthyVsRisky: "If grants make up more than 30% of your recurring operating revenue, the model depends on fundraising rather than demand. A healthy model treats philanthropy as supplemental — accelerating growth or funding specific programs — not as the foundation that keeps the lights on.",
      whatToDoNext: "I'd list only the grants and fundraising you have strong reason to expect. Separate one-time startup grants from ongoing support. Focus the model on earned revenue first, then layer in philanthropic upside.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "revenue",
    dismissible: true,
    autoExpandFor: [],
    order: 4,
    highFriction: false,
    priority: "standard",
  },
  payroll: {
    id: "payroll",
    title: "Payroll",
    body: {
      whatThisMeans: "Payroll is the total cost of compensating your team — salaries, benefits, payroll taxes, and any other personnel-related expenses. This is almost always the largest single expense category for a school.",
      whyItMatters: "Personnel costs typically represent 50-65% of a school's total budget. If payroll grows faster than revenue, the school will face financial pressure quickly. Getting staffing right is one of the most important parts of your financial model — we can't stress this enough.",
      healthyVsRisky: "Staffing costs under 55% of revenue are generally healthy. Between 55-65% is manageable but worth watching. Above 65% is a warning sign that the school may be overstaffed relative to its revenue.",
      whatToDoNext: "I'd start with your essential roles and build up. Consider which positions can be part-time or shared in the early years. Make sure your staffing plan grows in step with enrollment — that alignment is critical.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "staffing",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 5,
    highFriction: true,
    priority: "high",
  },
  occupancy_rent: {
    id: "occupancy_rent",
    title: "Occupancy and Rent",
    body: {
      whatThisMeans: "Occupancy costs include your rent or mortgage, utilities, maintenance, insurance, and any other facility-related expenses. For many schools, this is the second-largest expense after payroll.",
      whyItMatters: "Facility costs are usually fixed — they don't change much whether you have 20 students or 100. That makes them especially important for new schools that are still growing enrollment. We see facility costs trip up founders who lock into expensive leases before enrollment proves out.",
      healthyVsRisky: "Occupancy costs between 10-20% of revenue are typical. Above 25% can put pressure on your budget, especially in the early years when enrollment is ramping up. Lenders pay close attention to lease terms and facility costs.",
      whatToDoNext: "If you have a location, enter your actual costs. If you're still searching, use estimates based on comparable spaces in your area. I'd seriously consider whether sharing space or starting smaller could reduce early-year risk.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "expenses",
    dismissible: true,
    autoExpandFor: [],
    order: 6,
    highFriction: false,
    priority: "standard",
  },
  program_expenses: {
    id: "program_expenses",
    title: "Program Expenses",
    body: {
      whatThisMeans: "Program expenses cover the costs directly related to running your educational program: curriculum materials, textbooks, technology, supplies, field trips, assessments, and professional development for staff.",
      whyItMatters: "These costs directly affect the quality of education you can deliver. Underfunding your program can hurt student outcomes and make it harder to attract and retain families. But over-spending before you have the revenue to support it can strain your budget. It's a balance we help founders navigate.",
      healthyVsRisky: "Most schools spend $300-800 per student on instructional materials and $150-300 per student on technology. Spending significantly above or below these ranges is worth examining.",
      whatToDoNext: "I'd start with your core instructional needs and add from there. Consider what you truly need in Year 1 versus what can be phased in as the school grows.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "expenses",
    dismissible: true,
    autoExpandFor: [],
    order: 7,
    highFriction: false,
    priority: "standard",
  },
  operating_surplus_deficit: {
    id: "operating_surplus_deficit",
    title: "Operating Surplus or Deficit",
    body: {
      whatThisMeans: "Your operating surplus (or deficit) is the difference between your total revenue and total expenses for a given year. A surplus means you brought in more than you spent. A deficit means expenses exceeded revenue.",
      whyItMatters: "A small surplus is the goal for most schools, especially nonprofits. It shows the school can sustain itself and build reserves. Repeated deficits signal that the current model isn't financially sustainable without changes. We always look at this trend across all five years.",
      healthyVsRisky: "New schools often run a small deficit in Year 1 as they ramp up — that's normal. By Year 2 or 3, most viable models show a positive margin. A margin of 5-15% by Year 5 is a strong signal to lenders.",
      whatToDoNext: "If your model shows persistent deficits, I'd look at the biggest cost drivers first: staffing, rent, and enrollment. Small changes in these areas can have a meaningful impact on your bottom line.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 8,
    highFriction: false,
    priority: "high",
  },
  cash_flow: {
    id: "cash_flow",
    title: "Cash Flow",
    body: {
      whatThisMeans: "Cash flow tracks the actual movement of money in and out of your school over time. Unlike your annual budget, cash flow shows when money arrives and when it leaves — which can be very different things.",
      whyItMatters: "A school can have a balanced annual budget but still run out of cash in certain months. This happens when expenses come due before revenue arrives, like paying rent in August before tuition payments start in September. We see this catch founders off guard more than almost anything else.",
      healthyVsRisky: "Having at least 2-3 months of operating expenses in cash at all times is a good target. If your cash dips below one month of expenses at any point, that's a risk that needs attention.",
      whatToDoNext: "I'd look at the timing of your major revenue and expenses. If there's a gap, consider how you'll bridge it — whether through a line of credit, earlier payment collection, or building up reserves.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: [],
    order: 9,
    highFriction: false,
    priority: "standard",
  },
  ending_cash: {
    id: "ending_cash",
    title: "Ending Cash",
    body: {
      whatThisMeans: "Ending cash is the amount of money your school has at the end of a given period, after accounting for all the cash that came in and went out. Think of it as your bank balance at the end of the month or year.",
      whyItMatters: "Ending cash tells you whether your school can actually pay its bills. Even if your annual budget shows a surplus, you need enough cash on hand to cover payroll, rent, and other expenses as they come due. This is one of the first things a lender will look at.",
      healthyVsRisky: "Ending cash should never go negative — that means you can't cover your obligations. Having 2-3 months of expenses in ending cash provides a reasonable safety cushion.",
      whatToDoNext: "If ending cash drops below zero in any month, I'd review when your revenue arrives versus when your largest expenses are due. Adjust timing assumptions or plan for a startup reserve — even a small one makes a big difference.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: [],
    order: 10,
    highFriction: false,
    priority: "standard",
  },
  reserves: {
    id: "reserves",
    title: "Reserves",
    body: {
      whatThisMeans: "Reserves are the savings your school sets aside to handle unexpected costs or revenue shortfalls. This is money that's available but not earmarked for day-to-day operations — your financial safety net.",
      whyItMatters: "Schools without adequate reserves are vulnerable to surprises like enrollment drops, facility repairs, or delayed grant payments. Lenders consider reserves a key indicator of financial health. We always look at this when evaluating a model.",
      healthyVsRisky: "Best practice is to build toward 3-6 months of operating expenses in reserves. Schools with less than one month of reserves are considered high-risk by most lenders.",
      whatToDoNext: "If you're starting without reserves, I'd build a plan to accumulate them over time. Even small surpluses set aside each year add up. Consider including a reserve target in your model's assumptions — it shows lenders you're thinking ahead.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: [],
    order: 11,
    highFriction: false,
    priority: "standard",
  },
  budget_vs_actual: {
    id: "budget_vs_actual",
    title: "Budget vs Actual",
    body: {
      whatThisMeans: "Budget vs actual compares what you planned to spend and earn against what actually happened. This is how you measure whether your financial model held up in practice.",
      whyItMatters: "No budget is perfect on the first try. Tracking budget vs actual helps you identify where your assumptions were off so you can improve future projections. Lenders and boards expect to see this kind of accountability — and honestly, it's one of the best habits you can build.",
      healthyVsRisky: "Small variances (under 5-10%) are normal and expected. Large, repeated variances in the same direction suggest your assumptions need updating. The worst outcome is not tracking this at all.",
      whatToDoNext: "I'd plan to compare your budget against actual results monthly or quarterly once the school is operating. Use what you learn to update your projections and make better decisions going forward.",
    },
    audienceLevel: ["extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: [],
    order: 12,
    highFriction: false,
    priority: "standard",
  },
  fundraising_strategy: {
    id: "fundraising_strategy",
    title: "Fundraising & Philanthropy",
    body: {
      whatThisMeans: "Fundraising includes annual funds, individual donations, events, and grants from foundations or government programs. For faith-affiliated schools, it may also include parish subsidies or congregation support.",
      whyItMatters: "Philanthropy can provide crucial early-stage funding, but it's inherently uncertain and time-limited. Lenders prefer models anchored to enrollment-driven revenue. For-profit schools face additional complexity — donors can't claim tax deductions for gifts to a for-profit entity without a fiscal sponsor arrangement.",
      healthyVsRisky: "Philanthropy as 10-25% of total revenue is supplemental and healthy. Above 30% signals dependence on uncertain income. If you're a for-profit school fundraising through a fiscal sponsor, I'd budget for the sponsor's fee — typically 5-10% of the philanthropic revenue they process, entered as an annual dollar amount.",
      whatToDoNext: "I'd start with your most certain fundraising sources. If you're a for-profit school planning to fundraise, establish a fiscal sponsorship early — approval takes 4-8 weeks. Estimate your annual philanthropy, multiply by the sponsor's fee rate (5-10%), and enter that dollar amount as your Fiscal Sponsor Fee expense.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "revenue",
    dismissible: true,
    autoExpandFor: [],
    order: 4.5,
    highFriction: false,
    priority: "standard",
  },
  fixed_vs_variable: {
    id: "fixed_vs_variable",
    title: "Fixed vs Variable Costs",
    body: {
      whatThisMeans: "Fixed costs stay roughly the same regardless of how many students you have, like rent and insurance. Variable costs change with enrollment, like instructional materials and food service.",
      whyItMatters: "Understanding this distinction helps you plan for different enrollment scenarios. If most of your costs are fixed, a drop in enrollment hits much harder because those costs don't shrink with fewer students. We think this is one of the most important concepts for new founders to internalize.",
      healthyVsRisky: "A healthy cost structure has a mix of both. Schools with very high fixed costs relative to revenue need higher enrollment certainty to be sustainable. Schools with more variable costs have more flexibility if enrollment comes in lower than planned.",
      whatToDoNext: "I'd look at your expense categories and identify which are fixed and which change with enrollment. This helps you understand your breakeven point and what happens if enrollment comes in lower than planned.",
    },
    audienceLevel: ["extra"],
    relatedSection: "expenses",
    dismissible: true,
    autoExpandFor: [],
    order: 13,
    highFriction: false,
    priority: "standard",
  },
  facility_maintenance: {
    id: "facility_maintenance",
    title: "Maintenance & Repairs",
    body: {
      whatThisMeans: "Maintenance covers everything that keeps your building functional and safe — janitorial services, HVAC upkeep, plumbing and electrical repairs, grounds maintenance, and general wear-and-tear fixes. This is separate from your rent or mortgage.",
      whyItMatters: "Deferred maintenance is one of the most common budget mistakes we see. Founders skip this line item to keep costs low, then face emergency repairs that blow through their reserves. Lenders know this pattern and will flag a model with zero maintenance budget.",
      healthyVsRisky: "Plan for 2-4% of your facility's annual value, or $2-5 per square foot per year. Schools spending less than $1/sqft on maintenance are deferring costs that will eventually come due. Budgeting $0 for maintenance is a red flag for any lender reviewing your model.",
      whatToDoNext: "If you own or lease, ask your landlord or property manager what typical annual maintenance runs. For a leased space, $2,000-5,000/year is a reasonable starting point for a small school. Include a small buffer for unexpected repairs — they always come.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "facilities",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 14,
    highFriction: false,
    priority: "standard",
  },
  food_service: {
    id: "food_service",
    title: "Food & Meal Service",
    body: {
      whatThisMeans: "Food service covers the cost of providing meals to students — whether you run your own kitchen, contract with a vendor, or participate in the National School Lunch Program (NSLP). This is a per-student cost that scales with enrollment.",
      whyItMatters: "Meal programs can be a significant expense or a revenue-neutral service depending on your approach. Schools participating in NSLP receive federal reimbursement that can offset most costs. Schools providing meals without reimbursement should budget carefully — food costs add up fast.",
      healthyVsRisky: "NSLP reimbursement covers $3.50-4.50 per free lunch. If you're self-funding, expect $4-7 per student per day, or $700-1,300 per student annually. Schools that promise meals without budgeting for them often face mid-year shortfalls.",
      whatToDoNext: "Decide whether you'll participate in NSLP (most charter and public schools do) or self-fund meals. If you're not providing meals, enter $0 — but note that some charter authorizers require a meal program. If providing meals, get vendor quotes or estimate per-student daily costs.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "facilities",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 15,
    highFriction: false,
    priority: "standard",
  },
  transportation: {
    id: "transportation",
    title: "Transportation",
    body: {
      whatThisMeans: "Transportation costs include school bus contracts, ride-share partnerships, parent stipends, or any other arrangement to get students to and from school. Some states require charter schools to provide transportation; others leave it optional.",
      whyItMatters: "Transportation can be a make-or-break factor for enrollment. Families who can't get their children to school won't enroll. But bus contracts are expensive and often locked in for a full year regardless of ridership. We see founders underestimate this cost or commit to transportation they can't sustain.",
      healthyVsRisky: "Full bus service typically costs $800-2,000 per student per year depending on distance and region. Ride-share or stipend models run $500-1,000. If transportation is required by your charter or state law, budget for it — $0 isn't an option.",
      whatToDoNext: "Check whether your state or authorizer requires you to provide transportation. If so, get quotes from local bus companies early — prices vary significantly by region. If optional, consider whether offering transportation would meaningfully increase your enrollment.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "facilities",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 16,
    highFriction: false,
    priority: "standard",
  },
  professional_development: {
    id: "professional_development",
    title: "Professional Development",
    body: {
      whatThisMeans: "Professional development (PD) covers teacher training, conferences, certifications, coaching, and any investment in growing your staff's skills. This includes both external programs and internal training time.",
      whyItMatters: "Schools that invest in PD retain teachers longer and deliver better outcomes. Lenders and authorizers look for a PD budget as a sign that leadership takes quality seriously. Skipping PD to save money is a false economy — it leads to higher turnover, which costs far more.",
      healthyVsRisky: "Most schools budget $500-1,500 per staff member per year for PD. Less than $200 per person signals underinvestment. Some charter authorizers require a minimum PD budget as a condition of the charter.",
      whatToDoNext: "Budget at least $500 per staff member for Year 1. As revenue grows, increase PD spending — it's one of the best investments you can make in school quality and staff retention.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "facilities",
    dismissible: true,
    autoExpandFor: [],
    order: 17,
    highFriction: false,
    priority: "standard",
  },
  insurance_coverage: {
    id: "insurance_coverage",
    title: "Insurance",
    body: {
      whatThisMeans: "School insurance typically includes general liability, property insurance, directors & officers (D&O), workers' compensation, and potentially umbrella coverage. This is a non-negotiable operating cost that lenders verify.",
      whyItMatters: "Operating without adequate insurance is both a legal risk and a deal-breaker for lenders. Insurance costs tend to escalate 5-8% annually, which founders often forget to factor in. We've seen models that budget Year 1 insurance correctly but don't account for increases.",
      healthyVsRisky: "Most small schools pay $3,000-8,000 annually for a basic insurance package. Schools with transportation or athletics should budget higher ($8,000-15,000). A $0 insurance budget will immediately raise questions from any lender or authorizer.",
      whatToDoNext: "Get quotes from 2-3 insurance brokers who specialize in schools — they'll know the coverage requirements for your state. Budget the Year 1 quote and plan for 5-8% annual increases in your assumptions.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "facilities",
    dismissible: true,
    autoExpandFor: [],
    order: 18,
    highFriction: false,
    priority: "standard",
  },
  debt_service: {
    id: "debt_service",
    title: "Debt Service",
    body: {
      whatThisMeans: "Debt service is the total amount you pay on any loans — principal plus interest. This includes loans for building renovations, equipment, working capital, or any other borrowed funds.",
      whyItMatters: "Debt service is a fixed obligation that must be paid regardless of enrollment or revenue. Lenders evaluate your Debt Service Coverage Ratio (DSCR) — your available cash flow divided by your debt payments. A low DSCR means the school may struggle to make loan payments.",
      healthyVsRisky: "A DSCR of 1.2x or higher is considered healthy — meaning you have 20% more cash flow than needed to cover debt. Below 1.0x means you can't cover your payments from operations. Most lenders require at least 1.15x DSCR.",
      whatToDoNext: "If you plan to take on debt, enter the loan details accurately. If your DSCR comes out below 1.2x, consider whether you can reduce the loan amount, extend the term, or grow revenue faster. Don't take on debt your model can't support.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "facilities",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 19,
    highFriction: true,
    priority: "high",
  },
};

export function getExplainersForSection(section: string, level: GuidanceLevel): Explainer[] {
  return Object.values(EXPLAINERS)
    .filter((e) => e.relatedSection === section && e.audienceLevel.includes(level))
    .sort((a, b) => a.order - b.order);
}

export function getExplainerById(id: string): Explainer | undefined {
  return EXPLAINERS[id];
}

export function shouldAutoExpand(level: GuidanceLevel, explainer: Explainer): boolean {
  if (level === "advanced") return false;
  return explainer.autoExpandFor.includes(level);
}
