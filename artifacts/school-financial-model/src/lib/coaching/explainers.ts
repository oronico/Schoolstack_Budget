export type GuidanceLevel = "advanced" | "basics" | "extra";

export type SchoolTypeTrack = "charter" | "private" | "micro" | "general";

export function getSchoolTypeTrack(schoolType?: string): SchoolTypeTrack {
  if (!schoolType) return "general";
  switch (schoolType) {
    case "charter_school":
      return "charter";
    case "private_school":
    case "catholic_school":
      return "private";
    case "microschool":
    case "learning_pod":
    case "homeschool_coop":
      return "micro";
    case "tutoring_center":
    case "other":
      return "micro";
    default:
      return "general";
  }
}

export interface ExplainerBody {
  whatThisMeans: string;
  whyItMatters: string;
  healthyVsRisky: string;
  whatToDoNext: string;
  // Optional, decision-flow-specific. When present, the WhyStep replaces its
  // hard-coded "Common reasons" chips with these so the chip set lives in the
  // same authoritative place as the rest of the coach copy.
  commonReasons?: string[];
}

export interface ExtraDepthContent {
  workedExample?: string;
  benchmarkDetail?: string;
  glossaryTerms?: string;
  financingInsight?: string;
}

export type ExplainerPriority = "high" | "standard";

export interface Explainer {
  id: string;
  title: string;
  body: ExplainerBody;
  extraBody?: ExtraDepthContent;
  schoolTypeVariants?: Partial<Record<SchoolTypeTrack, Partial<ExplainerBody>>>;
  audienceLevel: GuidanceLevel[];
  relatedSection: string;
  dismissible: boolean;
  autoExpandFor: GuidanceLevel[];
  order: number;
  highFriction: boolean;
  priority: ExplainerPriority;
}

export function resolveExplainerBody(explainer: Explainer, schoolType?: string): ExplainerBody {
  const track = getSchoolTypeTrack(schoolType);
  const variant = explainer.schoolTypeVariants?.[track];
  if (!variant) return explainer.body;
  return { ...explainer.body, ...variant };
}

export const EXPLAINERS: Record<string, Explainer> = {
  revenue: {
    id: "revenue",
    title: "Revenue",
    body: {
      whatThisMeans: "Revenue is all the money your school expects to bring in - tuition, public funding, grants, fundraising, and any other income sources. Think of it as the total fuel your school runs on.",
      whyItMatters: "Revenue follows enrollment - demand is the engine of your financial model. The strongest plans are anchored to dependable, enrollment-driven income (tuition, per-pupil funding) rather than uncertain sources like one-time grants. We see this distinction matter a lot in how models hold up over time.",
      healthyVsRisky: "A focused revenue model anchored to enrollment-driven income is a strength, not a weakness. The risk isn't having one dominant stream - it's relying on income that doesn't scale with student demand (like a single large grant). I'd look for revenue that grows reliably as enrollment grows.",
      whatToDoNext: "I'd start with your most certain, demand-driven revenue sources. If you're a tuition-based school, begin there. Add other sources only if you have reasonable confidence they'll come through. Focus on filling seats first - everything else follows.",
    },
    extraBody: {
      workedExample: "A school with 100 students charging $10,000 tuition:\n• Tuition revenue: $1M\n• Per-pupil state funding at $8,500: +$850K\n• Annual grant: +$50K\n• Total Year 1 revenue: $1.9M\n• If the grant ends in Year 3, Year 4 revenue drops to $1.85M unless enrollment grows to offset it\n• Enrollment-driven revenue compounds over time; grants are temporary",
      benchmarkDetail: "Industry benchmarks:\n• Per-pupil public funding: $8,000-$15,000 (varies by state and school type)\n• Private school tuition: $8,000-$25,000\n• Revenue per student below $8,000 is very lean\n• Schools with >70% from a single source need strong justification",
      glossaryTerms: "• Per-Pupil Revenue: Total enrollment-driven revenue divided by total students\n• Revenue Concentration: Percentage of total revenue from your largest single source (above 80% warrants explanation)\n• Earned Revenue: Income directly tied to delivering educational services, as opposed to philanthropic or grant income",
      financingInsight: "Banks rank revenue by reliability:\n• Contracted per-pupil public funding (strongest)\n• Tuition with documented collection rates\n• Multi-year grants with signed agreements\n• Annual fundraising (weakest)\nKeeping your strongest revenue sources front and center strengthens any application.",
    },
    schoolTypeVariants: {
      charter: {
        whatThisMeans: "Revenue for your charter school comes primarily from per-pupil state funding, calculated using your state's ADA or ADM methodology. Additional sources may include federal CSP grants, Title funding, and special education allocations.",
        whyItMatters: "Per-pupil funding is your financial engine. Unlike tuition-based schools, your revenue scales directly with enrollment through a formula set by your state. Understanding your state's funding methodology - ADA vs ADM, count day timing, and payment schedules - is essential for accurate cash flow projections.",
        whatToDoNext: "Start with your state's per-pupil funding formula and your projected enrollment. Layer in any federal or state grants you've applied for or expect to receive. If your state funds on ADA, factor in a realistic attendance rate (typically 93-96%).",
      },
      private: {
        whatThisMeans: "Revenue for your school comes primarily from tuition and fees paid by families. Additional sources may include financial aid endowments, annual fund campaigns, parish or congregation subsidies, and enrollment-based fees.",
        whyItMatters: "Tuition is your primary revenue driver, so your enrollment marketing and retention strategy directly determines financial health. Collection rates, financial aid budgets, and tuition escalation all affect how much revenue you actually realize from enrolled families.",
        whatToDoNext: "Start with your tuition rate and realistic enrollment projections. Factor in your financial aid and scholarship budget - most private schools discount 10-20% of gross tuition. Add registration fees and any other family-paid charges, then layer in fundraising or parish support as supplemental income.",
      },
      micro: {
        whatThisMeans: "Revenue for your school comes from tuition, membership fees, or per-session charges paid by participating families. Some micro and pod models also receive ESA (Education Savings Account) or school choice funds where available.",
        whyItMatters: "With smaller enrollment, each family represents a larger share of your total revenue. Retention is especially important - losing even 2-3 families can significantly impact your budget. Keeping your revenue model simple and predictable helps you plan with confidence.",
        whatToDoNext: "Start with your per-family or per-student charge and your expected group size. If families in your state can use ESA or school choice funds, factor those in. Keep your revenue projections conservative - smaller programs have less room for enrollment shortfalls.",
      },
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
      whatThisMeans: "Enrollment assumptions are your best estimate of how many students will attend your school each year for the next five years. This is the single most important input in your entire model - everything flows from it.",
      whyItMatters: "Demand is the engine. Every revenue line, every staffing decision, and every expense assumption flows from how many students you enroll. If enrollment falls short, the entire model breaks. This is the single most important assumption in any financial model.",
      healthyVsRisky: "Most new schools fill 40-65% of capacity in Year 1. Growth of 15-25% per year is considered strong and realistic. Jumping from 30 to 150 students in one year is worth questioning. What matters most: can you document the demand? Waitlist depth, letters of intent, recruitment pipeline, and retention rates are what make enrollment projections credible.",
      whatToDoNext: "I'd start with how many students you're confident you can enroll in Year 1 based on evidence - signed letters of intent, waitlist data, or community survey results. Then project realistic growth based on your recruitment capacity and retention expectations.",
    },
    extraBody: {
      workedExample: "Starting with 80 students, 85% retention:\n• Year 1: 80 students\n• Year 2: 68 return + 32 new = 100\n• Year 3: 85 return + 35 new = 120\n• Year 4: 102 return + 28 new = 130\n• Year 5: 111 return + 29 new = 140\nStrong retention means you need fewer new students each year. At 75% retention, you'd need 52 new students in Year 2 just to reach 100.",
      benchmarkDetail: "Enrollment benchmarks by setting:\n• Urban schools: 85-95% of capacity by Year 3\n• Rural schools: 70-85% by Year 3 (often slower to fill)\n• Schools without public funding: typically fill slowest\n• Year-over-year growth above 30% is rare and requires documented demand\n• Schools that grow too fast often face quality and staffing problems",
      glossaryTerms: "• Capacity Utilization: Enrolled students divided by facility maximum capacity\n• Retention Rate: Percentage of current students who re-enroll the following year\n• Net Enrollment Growth: New students minus departing students\n• Waitlist Depth: Number of qualified families waiting for a spot (the strongest evidence of demand)",
      financingInsight: "Banks typically stress-test enrollment by 10-20%:\n• The strongest models remain viable at 70-80% of projected Year 1 enrollment\n• That kind of cushion gives everyone confidence the school can weather a slow start",
    },
    schoolTypeVariants: {
      charter: {
        whatThisMeans: "Enrollment assumptions are your best estimate of how many students will attend your charter school each year. Your authorizer and state funding agency will scrutinize these numbers closely - they drive your per-pupil allocation and staffing plan.",
        healthyVsRisky: "Most new charter schools fill 60-80% of capacity in Year 1, growing 15-25% annually. Your authorizer will want to see evidence of demand: lottery applications, waitlist depth, and community engagement data. If your state uses count days, plan your enrollment marketing around those dates.",
        whatToDoNext: "Start with your charter application's projected enrollment - your authorizer will hold you to these numbers. Document demand through lottery applications, community surveys, and info session attendance. If your state uses count days, build your recruitment calendar around them.",
      },
      private: {
        whatThisMeans: "Enrollment assumptions are your best estimate of how many students will attend your school each year. For tuition-driven schools, enrollment is the single most important input - it determines both your revenue and your staffing needs.",
        healthyVsRisky: "Most new private schools fill 40-60% of capacity in Year 1. Growth of 15-25% per year is strong. Retention rates above 85% are a major advantage - returning families are your most reliable enrollment pipeline. Strong schools invest in both recruitment and retention from day one.",
        whatToDoNext: "Start with families who've expressed serious interest - application deposits, signed enrollment agreements, or waitlist positions. Factor in your retention rate for returning families, then estimate how many new families you'll need to recruit each year to hit your targets.",
      },
      micro: {
        whatThisMeans: "Enrollment assumptions are your best estimate of how many students will participate in your program each year. With smaller group sizes, each student has a bigger impact on your financial picture.",
        healthyVsRisky: "Micro programs typically operate with 8-25 students. Growth may mean adding a second cohort or session rather than expanding a single group. A realistic Year 1 target is 60-80% of your ideal group size. With small numbers, losing even 2-3 students can shift your budget significantly - plan for that possibility.",
        whatToDoNext: "Start with the families in your immediate network who've committed or expressed strong interest. For pods and micro models, word-of-mouth and local community connections are usually more effective than broad marketing. Plan your budget to work at 75% of your target enrollment.",
      },
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
      whyItMatters: "Setting tuition too high can limit enrollment. Setting it too low can leave you short on revenue. Collection rates matter too - not every family pays the full amount on time. We'd encourage you to be realistic here rather than optimistic.",
      healthyVsRisky: "A collection rate of 90-95% is realistic for most schools. Planning for 100% collection is risky. Annual tuition increases of 2-4% are common and generally sustainable.",
      whatToDoNext: "I'd research what comparable schools in your area charge. Set a tuition level that balances affordability for families with your school's financial needs. If you're unsure, err slightly conservative - it's easier to adjust up than to recover from overestimating.",
    },
    extraBody: {
      workedExample: "120 students at $12,000 tuition:\n• Gross tuition: $1.44M\n• At 92% collection rate: $1.325M actually collected\n• The $115K gap comes from late payments, financial aid, and uncollectable accounts\n• If you modeled 100% collection, you'd be $115K short\nWith 3% annual tuition increases:\n• Year 1: $12,000\n• Year 2: $12,360\n• Year 3: $12,731\n• Year 4: $13,113\n• Year 5: $13,506",
      benchmarkDetail: "Tuition by school type:\n• Urban independent: $12,000-$22,000\n• Suburban: $15,000-$30,000\n• Faith-based: $5,000-$12,000\n• Montessori: $10,000-$18,000\nCollection rates:\n• New schools: 88-93% in Year 1\n• By Year 3: 93-97% as families stabilize",
      glossaryTerms: "• Gross Tuition: Full tuition amount before financial aid or discounts\n• Net Tuition: What you actually collect after aid, discounts, and uncollected amounts\n• Collection Rate: Percentage of billed tuition you actually receive\n• Tuition Elasticity: How enrollment changes in response to tuition increases (a 5% increase typically reduces enrollment 2-3%)",
    },
    schoolTypeVariants: {
      charter: {
        whatThisMeans: "If your charter school charges any fees (registration, activity, technology), those assumptions go here. Many charter schools are tuition-free but still collect ancillary fees. Your primary revenue comes from per-pupil state funding, covered in the revenue section.",
        whyItMatters: "For charter schools, ancillary fees are a small but meaningful revenue supplement. Some authorizers restrict what fees you can charge, so check your charter agreement. The bigger picture is your per-pupil funding - that's where the real revenue planning happens.",
        whatToDoNext: "Check your charter agreement for any restrictions on fees. If you charge registration, activity, or technology fees, enter them here. Keep fee amounts reasonable - they should supplement your per-pupil funding, not create a barrier to enrollment.",
      },
      private: {
        whatThisMeans: "Your tuition assumptions include the amount you charge per student, financial aid and scholarship budgets, sibling discounts, and how tuition changes over time. This is the largest share of your revenue.",
        whyItMatters: "Setting tuition too high limits enrollment. Setting it too low leaves you short on revenue. Financial aid strategy matters too - most private schools discount 10-20% of gross tuition. Collection rates below 95% should be budgeted for. Be realistic here rather than optimistic.",
        whatToDoNext: "Research what comparable schools in your area charge. Set tuition that balances affordability with your school's financial needs. Budget your financial aid and scholarship commitments explicitly - they're real costs that reduce your net tuition revenue.",
      },
      micro: {
        whatThisMeans: "Your tuition or membership fee assumptions include what you charge per student (or per family), any sibling discounts, and how fees change over time. For smaller programs, keeping the fee structure simple is usually best.",
        healthyVsRisky: "For micro and pod programs, a collection rate of 95-100% is typical because of closer family relationships. Annual fee increases of 2-4% are reasonable. If you offer sibling or multi-session discounts, budget for their impact on total revenue.",
        whatToDoNext: "Set your fee based on what families in your community can sustain, your operating costs, and what comparable programs charge. If you offer different session types or schedules, model each one separately so you can see the revenue impact clearly.",
      },
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
      whyItMatters: "Grants and fundraising can be valuable, but they're inherently uncertain - competitive, time-limited, and subject to donor priorities. We always recommend building a model anchored to earned revenue that scales with enrollment, not to fundraising outcomes.",
      healthyVsRisky: "If grants make up more than 30% of your recurring operating revenue, the model depends on fundraising rather than demand. A healthy model treats philanthropy as supplemental - accelerating growth or funding specific programs - not as the foundation that keeps the lights on.",
      whatToDoNext: "I'd list only the grants and fundraising you have strong reason to expect. Separate one-time startup grants from ongoing support. Focus the model on earned revenue first, then layer in philanthropic upside.",
    },
    extraBody: {
      workedExample: "A school with $1.5M total revenue:\n• $200K startup grant (Year 1 only)\n• $75K/year in annual fundraising\n• Year 1 grant dependency: 13%\n• Year 2 (no startup grant): fundraising is 5% of revenue - healthy\n• If you budgeted the $200K as recurring, Year 2 shows a $200K hole\nAlways model grants as ending in their last confirmed year.",
      benchmarkDetail: "Grant benchmarks:\n• Federal CSP grants: $150K-$750K over 3 years\n• State startup grants: $50K-$500K (varies widely)\n• Foundation grants: $10K-$100K\n• Annual fund targets for new schools: $25K-$75K in Year 1, growing 10-15% annually\n• Mature schools raise $50-$150 per student annually",
      glossaryTerms: "• Restricted Funds: Grant money that must be spent on specific purposes (e.g., technology, professional development)\n• Unrestricted Funds: Donations that can be used for any operational purpose\n• Grant Cliff: The year a multi-year grant ends, creating a sudden revenue drop if not replaced\n• Cost Sharing: When a grant requires the school to fund a portion of the project from its own resources",
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
      whatThisMeans: "Payroll is the total cost of compensating your team - salaries, benefits, payroll taxes, and any other personnel-related expenses. This is almost always the largest single expense category for a school.",
      whyItMatters: "Personnel costs typically represent 50-65% of a school's total budget. If payroll grows faster than revenue, the school will face financial pressure quickly. Getting staffing right is one of the most important parts of your financial model - we can't stress this enough.",
      healthyVsRisky: "Staffing costs under 55% of revenue are generally healthy. Between 55-65% is manageable but worth watching. Above 65% is a warning sign that the school may be overstaffed relative to its revenue.",
      whatToDoNext: "I'd start with your essential roles and build up. Consider which positions can be part-time or shared in the early years. Make sure your staffing plan grows in step with enrollment - that alignment is critical.",
    },
    extraBody: {
      workedExample: "A school with $1.2M revenue and 10 staff members:\n• Base salaries total $650K\n• Add 25% for benefits and payroll taxes (FICA 7.65%, health insurance ~$6K/employee, workers comp ~2%)\n• Loaded cost = $812K\n• That's 68% of revenue - a warning zone\n• Reducing to 9 staff saves ~$81K loaded, dropping to 61% - much healthier\n• Each additional FTE at $65K salary actually costs ~$81K loaded",
      benchmarkDetail: "Staffing cost benchmarks:\n• Schools average 55-65% of revenue on personnel\n• High-performing networks target 50-55%\n• Teacher salaries: $35K-$65K depending on region\n• Head of School: $80K-$130K\n• Operations Manager: $45K-$70K\n• Loaded cost multiplier (benefits + taxes): 1.25x-1.35x of base salary",
      glossaryTerms: "• Loaded Cost: Total compensation including salary, benefits, and employer-paid taxes\n• FTE (Full-Time Equivalent): 1.0 = full-time, 0.5 = half-time\n• Student-to-Teacher Ratio: Total students divided by instructional FTE (most schools target 12:1 to 20:1)\n• Benefits Load: Percentage added to base salary for health insurance, retirement, and payroll taxes (typically 25-35%)",
      financingInsight: "Staffing above 65% of revenue leaves very little room for facilities, debt, and reserves. Banks look at whether staffing scales with enrollment. Building lean and growing thoughtfully signals strong leadership.",
    },
    schoolTypeVariants: {
      charter: {
        whatThisMeans: "Payroll is the total cost of compensating your team - salaries, benefits, payroll taxes, and any other personnel-related expenses. Charter schools typically have structured staffing plans that align with their charter agreement and authorizer expectations.",
        healthyVsRisky: "Charter schools typically spend 55-65% of revenue on personnel. Your authorizer may have expectations about student-to-teacher ratios and minimum staffing levels. Staying under 60% gives you room for facilities and reserves while meeting compliance requirements.",
        whatToDoNext: "Start with the positions required by your charter agreement. Add instructional staff based on your target student-to-teacher ratio, then include operations and administrative roles. Make sure your staffing plan scales with enrollment - authorizers look for this alignment.",
      },
      private: {
        whatThisMeans: "Payroll is the total cost of compensating your team - salaries, benefits, payroll taxes, and any other personnel-related expenses. For private schools, competitive compensation is key to attracting and retaining quality teachers.",
        healthyVsRisky: "Private schools typically spend 50-60% of revenue on personnel. Competitive salaries help with retention, but keeping total personnel costs under 55% of revenue leaves healthy room for programs, facilities, and financial aid. Benefits packages can be a differentiator for recruitment.",
        whatToDoNext: "Research teacher salaries at comparable schools in your area. Start with your essential roles - head of school, lead teachers, and one operations person. Consider which roles can be part-time or shared in early years, and plan to add staff as enrollment grows.",
      },
      micro: {
        whatThisMeans: "Payroll covers the cost of your teaching team and any support staff. In smaller programs, founders often wear multiple hats - teaching, administration, and operations - which keeps personnel costs lean but requires realistic time planning.",
        healthyVsRisky: "Micro programs typically spend 40-55% of revenue on personnel because of smaller teams and multi-role positions. If you're the founder and primary teacher, make sure to include fair compensation for yourself - even if modest at first. Not paying yourself is not a sustainable plan.",
        whatToDoNext: "List every role needed to run your program, including your own. For small teams, define who handles each function (instruction, admin, marketing, bookkeeping). Consider whether part-time specialists or contractors make more sense than full-time hires in the early stages.",
      },
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
      whyItMatters: "Facility costs are usually fixed - they don't change much whether you have 20 students or 100. That makes them especially important for new schools that are still growing enrollment. We see facility costs trip up founders who lock into expensive leases before enrollment proves out.",
      healthyVsRisky: "Occupancy costs between 10-20% of revenue are typical. Above 25% can put pressure on your budget, especially in the early years when enrollment is ramping up. Lease terms and facility costs deserve careful attention.",
      whatToDoNext: "If you have a location, enter your actual costs. If you're still searching, use estimates based on comparable spaces in your area. I'd seriously consider whether sharing space or starting smaller could reduce early-year risk.",
    },
    extraBody: {
      workedExample: "A school leasing 8,000 sqft at $15/sqft:\n• Rent: $120K/year\n• Utilities: $18K\n• Insurance: $5K\n• Maintenance: $8K\n• Total occupancy: $151K\n• Year 1 revenue $800K → occupancy is 19% (acceptable but tight)\n• Year 3 revenue $1.2M → same $151K is only 13% (much healthier)\nFixed facility costs become less burdensome as enrollment grows.",
      benchmarkDetail: "Facility cost benchmarks:\n• Lease rates: $8-$25/sqft depending on market\n• Utilities: $1.50-$3.00/sqft\n• Space needed: 50-80 sqft per student for classrooms + 30-50% for common areas\n• Total facility cost per student: $1,200-$3,000/year is typical\n• Above $3,500/student is a concern",
      glossaryTerms: "• Triple Net Lease (NNN): Tenant pays base rent plus property taxes, insurance, and maintenance (common for school spaces)\n• CAM Charges: Common Area Maintenance fees in shared buildings\n• Occupancy Rate: Facility cost as a percentage of total revenue\n• TI Allowance: Money the landlord provides for build-out (negotiate aggressively for school conversions)",
    },
    schoolTypeVariants: {
      charter: {
        whatThisMeans: "Occupancy costs include your rent or mortgage, utilities, maintenance, insurance, and any other facility-related expenses. Charter schools often lease commercial or repurposed spaces, which may need significant build-out to meet school use requirements.",
        healthyVsRisky: "Charter school occupancy costs between 12-20% of revenue are typical. Above 22% puts pressure on your budget. Many charter schools negotiate below-market leases with community partners or municipalities. If you're in a district-provided space, factor in whether that arrangement has an expiration date.",
        whatToDoNext: "If you have a facility, enter your actual costs including any build-out amortization. If you're still searching, factor in the costs of converting a commercial space to school use (fire safety, ADA compliance, classroom build-out). Consider co-location with community organizations to share costs.",
      },
      private: {
        whatThisMeans: "Occupancy costs include your rent or mortgage, utilities, maintenance, insurance, and any other facility-related expenses. For faith-affiliated schools, this may include parish or congregation-provided space at below-market rates.",
        healthyVsRisky: "Private school occupancy costs between 10-18% of revenue are typical. If your space is donated or provided by a congregation, enter the comparable market rent so your model reflects what would happen if that arrangement changed. Schools in donated spaces should still budget for utilities and maintenance.",
        whatToDoNext: "If your space is provided by a church or organization, enter both the actual cost (which may be $0) and the comparable market rent. This creates a more resilient financial plan. If you're leasing, compare your per-student facility cost against $1,500-$2,500/student benchmarks.",
      },
      micro: {
        whatThisMeans: "Occupancy costs cover your physical space - whether that's a dedicated space, shared facility, community center, or home-based setup. For smaller programs, creative space solutions can significantly reduce overhead.",
        healthyVsRisky: "Micro programs often keep occupancy under 15% of revenue through creative arrangements - home-based setups, shared community spaces, or church partnerships. Even if your space is free or very low cost, budget for utilities, supplies, and a contingency in case the arrangement changes.",
        whatToDoNext: "Enter your actual facility costs, even if they're minimal. If you're home-based, consider costs like additional insurance, dedicated supplies, and any modifications. If you're in a shared space, clarify the terms - especially how much notice you'd get if the arrangement ended.",
      },
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
    extraBody: {
      workedExample: "A school with 100 students:\n• Curriculum: $500/student ($50K)\n• Technology: $200/student ($20K)\n• Supplies: $100/student ($10K)\n• Assessments: $50/student ($5K)\n• Total program expenses: $85K ($850/student)\n• With 2% annual inflation, Year 5 costs rise to $92K\n• Adding 40 students by Year 5 increases total to $119K, but per-student cost stays flat (these are variable costs)",
      benchmarkDetail: "Program expense benchmarks per student:\n• Curriculum/textbooks: $300-$600 (higher for STEM or specialty)\n• Technology (1:1 devices): $200-$400 including replacement cycles\n• Assessment platforms: $30-$75\n• Classroom supplies: $75-$150\n• Field trips and enrichment: $50-$200\n• Total program costs: typically 5-10% of total budget",
    },
    schoolTypeVariants: {
      charter: {
        whatThisMeans: "Program expenses cover the costs directly related to running your educational program: curriculum, technology, assessments, supplies, and professional development. Your charter agreement may specify minimum spending levels for instructional materials.",
        whatToDoNext: "Review your charter agreement for any program spending requirements. Start with your core curriculum costs, then add technology (1:1 devices if required), assessment platforms, and professional development. Many charter schools can access bulk purchasing discounts through their authorizer or network.",
      },
      private: {
        whatThisMeans: "Program expenses cover the costs directly related to running your educational program: curriculum, textbooks, technology, supplies, field trips, assessments, and professional development. For private schools, program quality is a key part of your value proposition to families.",
        whatToDoNext: "Start with your core instructional materials and technology needs. Private schools often invest more in enrichment programs, field trips, and specialty materials that differentiate their offering. Balance program quality with sustainability - start with essentials and add enrichment as enrollment supports it.",
      },
      micro: {
        whatThisMeans: "Program expenses cover your instructional materials, curriculum resources, technology, supplies, and any enrichment activities. Smaller programs can often be more creative and cost-effective with program materials.",
        healthyVsRisky: "Micro programs typically spend $200-500 per student on instructional materials. You may be able to leverage open-source curriculum, shared resources, and community partnerships to keep costs lower. Budget for technology basics but don't over-invest before you know what works.",
        whatToDoNext: "List your essential instructional materials first. Consider free and open-source curriculum options, library partnerships, and shared resources with other educators. Start lean and invest more as you learn what your students need most.",
      },
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
      healthyVsRisky: "New schools often run a small deficit in Year 1 as they ramp up - that's normal. By Year 2 or 3, most viable models show a positive margin. A margin of 5-15% by Year 5 is a strong sign your school is on solid footing.",
      whatToDoNext: "If your model shows persistent deficits, I'd look at the biggest cost drivers first: staffing, rent, and enrollment. Small changes in these areas can have a meaningful impact on your bottom line.",
    },
    extraBody: {
      workedExample: "Healthy trajectory:\n• Year 1: $900K revenue - $950K expenses = -$50K deficit (5.6%)\n• Year 2: $1.1M - $1.05M = +$50K surplus (4.5%)\n• Year 3: $1.3M - $1.15M = +$150K surplus (11.5%)\n• Cumulative position turns positive mid-Year 2\nContrast with a thin trajectory:\n• -$50K, -$30K, -$10K, +$5K, +$15K\n• Technically profitable by Year 4, but razor-thin margins leave no room for surprises",
      benchmarkDetail: "Operating margin benchmarks:\n• Year 1: deficit up to 10% is acceptable if covered by startup reserves\n• Year 3: target 5-10% operating margin\n• Year 5: 8-15% is strong\n• Nonprofit schools above 20% may face questions about mission alignment\n• Schools that never reach positive margin within 5 years have a structural cost problem",
      glossaryTerms: "• Operating Margin: Net income divided by total revenue, expressed as a percentage\n• Cumulative Surplus/Deficit: Running total of all surpluses and deficits across years\n• Breakeven Point: The year annual revenue first equals or exceeds annual expenses",
      financingInsight: "Banks want to see a clear path to profitability within 2-3 years:\n• A Year 1 deficit is understandable if startup costs are clearly identified and non-recurring\n• Persistent deficits beyond Year 2 may signal a structural challenge worth addressing\n• The trend matters more than any single year - improving margins show a viable path forward",
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
      whatThisMeans: "Cash flow tracks the actual movement of money in and out of your school over time. Unlike your annual budget, cash flow shows when money arrives and when it leaves - which can be very different things.",
      whyItMatters: "A school can have a balanced annual budget but still run out of cash in certain months. This happens when expenses come due before revenue arrives, like paying rent in August before tuition payments start in September. We see this catch founders off guard more than almost anything else.",
      healthyVsRisky: "Having at least 2-3 months of operating expenses in cash at all times is a good target. If your cash dips below one month of expenses at any point, that's a risk that needs attention.",
      whatToDoNext: "I'd look at the timing of your major revenue and expenses. If there's a gap, consider how you'll bridge it - whether through a line of credit, earlier payment collection, or building up reserves.",
    },
    extraBody: {
      workedExample: "Monthly expenses of $80K with 10-month tuition schedule:\n• Payroll: $55K/month\n• Rent: $12K/month\n• Other: $13K/month\n• Tuition arrives at $100K/month (Sept-June only)\n• July and August: $0 tuition but $80K in expenses each month\n• Starting cash of $50K minus July expenses = -$30K\n• You'd need at least $160K in starting cash to survive the 2-month gap\nYour annual budget may balance, but timing determines whether you can actually pay bills.",
      benchmarkDetail: "Cash flow benchmarks:\n• Maintain minimum cash balance equal to 45-60 days of operating expenses\n• Most dangerous months: July-September (expenses hit before revenue)\n• Per-pupil funding often arrives quarterly or with a 30-60 day lag\n• Tuition-based schools with 10-month payment plans have a predictable 2-month gap",
      glossaryTerms: "• Cash Trough: Lowest cash balance at any point during the projection (determines whether you survive)\n• Operating Cash Cycle: Time between when you pay expenses and when you collect revenue\n• Line of Credit: Pre-approved borrowing facility for lean months, repaid when revenue arrives",
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
      whyItMatters: "Ending cash tells you whether your school can actually pay its bills. Even if your annual budget shows a surplus, you need enough cash on hand to cover payroll, rent, and other expenses as they come due. This is one of the first things any reviewer will look at.",
      healthyVsRisky: "Ending cash should never go negative - that means you can't cover your obligations. Having 2-3 months of expenses in ending cash provides a reasonable safety cushion.",
      whatToDoNext: "If ending cash drops below zero in any month, I'd review when your revenue arrives versus when your largest expenses are due. Adjust timing assumptions or plan for a startup reserve - even a small one makes a big difference.",
    },
    extraBody: {
      workedExample: "Starting cash $100K, monthly expenses $60K:\n• Year 1: net income -$40K → ending cash $60K (1 month of expenses - dangerously thin)\n• Year 2: net income +$30K → ending cash $90K (1.5 months - better)\n• Year 3: net income +$80K → ending cash $170K (2.5 months - approaching healthy)\nEven with a Year 1 deficit, adequate starting cash prevents a crisis. Without that $100K cushion, cash goes negative by month 8.",
      benchmarkDetail: "Ending cash targets by year:\n• Year 1: at least 1 month of Year 2 operating expenses\n• Year 3: target 2-3 months\n• Year 5: 3-6 months is considered strong\n• Schools entering Year 2 with less than $30K ending cash are in a risky position regardless of budget projections",
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
      whatThisMeans: "Reserves are the savings your school sets aside to handle unexpected costs or revenue shortfalls. This is money that's available but not earmarked for day-to-day operations - your financial safety net.",
      whyItMatters: "Schools without adequate reserves are vulnerable to surprises like enrollment drops, facility repairs, or delayed grant payments. Reserves are a key indicator of financial health - we always look at this when evaluating a model.",
      healthyVsRisky: "Best practice is to build toward 3-6 months of operating expenses in reserves. Schools with less than one month of reserves are in a risky position.",
      whatToDoNext: "If you're starting without reserves, I'd build a plan to accumulate them over time. Even small surpluses set aside each year add up. Consider including a reserve target in your model's assumptions - it shows thoughtful planning.",
    },
    extraBody: {
      workedExample: "Monthly operating expenses $75K, target reserve 3 months ($225K):\n• At $50K surplus/year, it takes 4.5 years to reach your target\n• With a $75K startup reserve plus $50K/year:\n• Year 1: $125K (1.7 months)\n• Year 2: $175K (2.3 months)\n• Year 3: $225K (3.0 months - target reached)\nEven a modest starting reserve dramatically accelerates your path to stability.",
      benchmarkDetail: "Reserve benchmarks:\n• NACSA recommends 45 days of cash on hand minimum\n• Loan covenants often require 60-90 days\n• Highly rated schools maintain 4-6 months\n• Schools in financial distress typically have <15 days\n• Plan to add 3-5% of revenue annually until target is reached",
      glossaryTerms: "• Operating Reserve: Cash set aside for unexpected expenses or shortfalls (measured in months of expenses)\n• Board-Designated Reserve: Reserves earmarked for specific purposes (e.g., facility expansion, technology refresh)\n• Days of Cash on Hand: Ending cash divided by daily operating expenses (a more precise measure than months)",
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
      whyItMatters: "No budget is perfect on the first try. Tracking budget vs actual helps you identify where your assumptions were off so you can improve future projections. Boards and reviewers expect to see this kind of accountability - and honestly, it's one of the best habits you can build.",
      healthyVsRisky: "Small variances (under 5-10%) are normal and expected. Large, repeated variances in the same direction suggest your assumptions need updating. The worst outcome is not tracking this at all.",
      whatToDoNext: "I'd plan to compare your budget against actual results monthly or quarterly once the school is operating. Use what you learn to update your projections and make better decisions going forward.",
    },
    extraBody: {
      workedExample: "Two small variances that compound:\n• Payroll: budgeted $55K/month, actual $58K (mid-year hire) = 5.5% over\n• Revenue: budgeted $100K/month, actual $92K = 8% under\n• Combined monthly impact: -$11K\n• Annualized: -$132K\nIndividually each seems small, but together they create a serious cash crunch by month 9.",
      benchmarkDetail: "Variance tracking guidelines:\n• Review budget vs actual monthly\n• Flag any line item >10% over budget\n• Revenue variances below -5% should trigger a management response\n• Biggest variances tend to be: enrollment, substitute teacher costs, and utilities\n• Year 2 budgets are typically within 5% of actuals (improves with experience)",
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
      whyItMatters: "Philanthropy can provide crucial early-stage funding, but it's inherently uncertain and time-limited. The strongest models are anchored to enrollment-driven revenue. For-profit schools face additional complexity - donors can't claim tax deductions for gifts to a for-profit entity without a fiscal sponsor arrangement.",
      healthyVsRisky: "Philanthropy as 10-25% of total revenue is supplemental and healthy. Above 30% signals dependence on uncertain income. If you're a for-profit school fundraising through a fiscal sponsor, I'd budget for the sponsor's fee - typically 5-10% of the philanthropic revenue they process, entered as an annual dollar amount.",
      whatToDoNext: "I'd start with your most certain fundraising sources. If you're a for-profit school planning to fundraise, establish a fiscal sponsorship early - approval takes 4-8 weeks. Estimate your annual philanthropy, multiply by the sponsor's fee rate (5-10%), and enter that dollar amount as your Fiscal Sponsor Fee expense.",
    },
    extraBody: {
      workedExample: "Planned $150K in Year 1 fundraising vs realistic collection:\n• Gala ($50K planned): nets 60% after event costs = $30K\n• Individual donors ($60K planned): new schools convert 40-50% of pledges = $24K-$30K\n• Foundation grant ($40K planned): if approved, 100% = $40K\n• Realistic total: $94K-$100K vs the planned $150K\nBudget the conservative number and treat the upside as bonus.",
      benchmarkDetail: "Fundraising benchmarks by channel:\n• Annual galas: net 50-65% after expenses\n• Online campaigns: convert 2-4% of recipients\n• Major donor cultivation: takes 12-18 months\n• Foundation grants: 15-25% win rates\nCost to raise $1:\n• Events: $0.30-$0.50\n• Individual giving: $0.15-$0.25\n• Grants: $0.05-$0.10\n• New schools should expect 30-50% less fundraising in Year 1",
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
    extraBody: {
      workedExample: "Fixed costs $600K, variable costs $200K ($2,000/student x 100):\n• Rent: $120K\n• Admin salaries: $280K\n• Insurance: $8K\n• Loan payments: $48K\n• Utilities: $18K\n• Other fixed: $126K\n• Total expenses: $800K\n• Revenue per student: $10,000\n• Break-even enrollment: $600K / ($10,000 - $2,000) = 75 students\n• Every student above 75 contributes $8,000 to surplus\n• At 100 students, surplus = $200K",
      benchmarkDetail: "Cost structure benchmarks:\n• Schools typically have 65-80% fixed and 20-35% variable costs\n• Higher fixed cost ratios mean higher breakeven enrollment\n• Fixed costs below 60% offer more downside protection\nKey fixed costs: leadership salaries, rent, insurance, debt service\nKey variable costs: instructional materials, food service, per-student technology",
      glossaryTerms: "• Fixed Cost: Expense that doesn't change with enrollment (rent, admin salaries, insurance)\n• Variable Cost: Expense that scales with enrollment (per-student supplies, food service)\n• Contribution Margin: Revenue per student minus variable cost per student\n• Operating Leverage: High fixed costs mean profits grow quickly above breakeven but losses mount quickly below it",
    },
    audienceLevel: ["extra"],
    relatedSection: "expenses",
    dismissible: true,
    autoExpandFor: [],
    order: 13,
    highFriction: false,
    priority: "standard",
  },
  facility_occupancy: {
    id: "facility_occupancy",
    title: "Occupancy Costs",
    body: {
      whatThisMeans: "Occupancy costs are everything related to your physical space - rent or mortgage, utilities, insurance, and maintenance. Together, these form your second-largest expense category after payroll.",
      whyItMatters: "Facility costs are almost entirely fixed - they don't shrink when enrollment is low. Locking into an expensive lease before enrollment proves out is one of the most common financial mistakes we see. Your occupancy-to-revenue ratio is worth watching closely.",
      healthyVsRisky: "Total occupancy costs between 10-20% of revenue are typical for schools. Above 25% puts real pressure on your budget, especially in the early years. If your rent alone exceeds 15% of projected Year 1 revenue, consider a smaller or shared space.",
      whatToDoNext: "Add up your monthly rent, annual utilities, insurance, and maintenance to see your total occupancy cost. Compare it against your Year 1 revenue projection. If it's above 20%, explore options to reduce facility costs before committing.",
    },
    extraBody: {
      workedExample: "Two facility options compared (Year 1 revenue $800K):\n• Option A: 10,000 sqft at $18/sqft = $180K/year (22.5% of revenue - risky)\n• Option B: 6,000 sqft shared space at $14/sqft = $84K/year with option to expand (10.5% - healthy)\n• Option B saves $96K/year - enough to fund 1.5 additional teacher positions\n• Even if you outgrow Option B by Year 3, the savings compound: $192K over 2 years",
      benchmarkDetail: "Facility costs by market:\n• Urban high-cost (NYC, SF, DC): $20-$35/sqft\n• Suburban: $10-$20/sqft\n• Rural or church-shared: $5-$12/sqft\nSpace planning:\n• 50-80 sqft per student for classrooms\n• Plus 30-50% for common areas, offices, and storage\n• A 100-student school needs roughly 8,000-12,000 total sqft",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "facilities",
    dismissible: true,
    autoExpandFor: ["basics", "extra"],
    order: 13.5,
    highFriction: true,
    priority: "high",
  },
  facility_maintenance: {
    id: "facility_maintenance",
    title: "Maintenance & Repairs",
    body: {
      whatThisMeans: "Maintenance covers everything that keeps your building functional and safe - janitorial services, HVAC upkeep, plumbing and electrical repairs, grounds maintenance, and general wear-and-tear fixes. This is separate from your rent or mortgage.",
      whyItMatters: "Deferred maintenance is one of the most common budget mistakes we see. Founders skip this line item to keep costs low, then face emergency repairs that blow through their reserves. A model with zero maintenance budget raises concerns for any reviewer.",
      healthyVsRisky: "Plan for 2-4% of your facility's annual value, or $2-5 per square foot per year. Schools spending less than $1/sqft on maintenance are deferring costs that will eventually come due. Every school needs a maintenance line item - don't skip it.",
      whatToDoNext: "If you own or lease, ask your landlord or property manager what typical annual maintenance runs. For a leased space, $2,000-5,000/year is a reasonable starting point for a small school. Include a small buffer for unexpected repairs - they always come.",
    },
    extraBody: {
      workedExample: "8,000 sqft building valued at $500K, budgeting 3% of value ($15K/year):\n• Janitorial contract: $6K\n• HVAC service: $3K\n• General repairs reserve: $4K\n• Grounds/snow: $2K\nIn Year 3, the HVAC fails ($12K replacement). With $0 budgeted, this single event wipes out your quarterly surplus. With the $15K budget, you have $4K in reserve plus can redirect from other categories.",
      benchmarkDetail: "Maintenance benchmarks:\n• Janitorial: $0.75-$1.50/sqft\n• HVAC maintenance: $2,000-$5,000/year (small building)\n• Roof repairs: $5K-$15K when needed\n• Set aside 10-15% of maintenance budget for emergencies\n• Pre-1990 buildings cost 30-50% more to maintain",
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
      whatThisMeans: "Food service covers the cost of providing meals to students - whether you run your own kitchen, contract with a vendor, or participate in the National School Lunch Program (NSLP). This is a per-student cost that scales with enrollment.",
      whyItMatters: "Meal programs can be a significant expense or a revenue-neutral service depending on your approach. Schools participating in NSLP receive federal reimbursement that can offset most costs. Schools providing meals without reimbursement should budget carefully - food costs add up fast.",
      healthyVsRisky: "NSLP reimbursement covers $3.50-4.50 per free lunch. If you're self-funding, expect $4-7 per student per day, or $700-1,300 per student annually. Schools that promise meals without budgeting for them often face mid-year shortfalls.",
      whatToDoNext: "Decide whether you'll participate in NSLP or self-fund meals. If you're not providing meals, enter $0 - but note that some authorizers or state regulations require a meal program. If providing meals, get vendor quotes or estimate per-student daily costs.",
    },
    extraBody: {
      workedExample: "100 students, 180 school days:\n• Self-funded meals at $5/student/day = $90K/year\n• With NSLP and 70% free/reduced-price eligibility:\n• Reimbursement: $4.00/meal x 70 students x 180 days = $50.4K\n• Net cost: $90K - $50.4K = $39.6K ($396/student)\n• That's a 56% reduction from self-funding\nIf you're eligible for NSLP, participation dramatically changes your food service economics.",
      benchmarkDetail: "Meal program benchmarks:\n• NSLP free lunch reimbursement: $4.09 (2024 rate, increases annually)\n• Reduced-price: $3.69\n• Paid: $0.39\n• Vendor-contracted meals: $4.50-$7.00 per meal (varies by region)\n• Schools with >60% free/reduced-price eligible often break even through NSLP\n• Breakfast programs add $1.50-$2.50 per student per day",
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
      whatThisMeans: "Transportation costs include school bus contracts, ride-share partnerships, parent stipends, or any other arrangement to get students to and from school. Some states require schools to provide transportation; others leave it optional.",
      whyItMatters: "Transportation can be a make-or-break factor for enrollment. Families who can't get their children to school won't enroll. But bus contracts are expensive and often locked in for a full year regardless of ridership. We see founders underestimate this cost or commit to transportation they can't sustain.",
      healthyVsRisky: "Full bus service typically costs $800-2,000 per student per year depending on distance and region. Ride-share or stipend models run $500-1,000. If transportation is required by your authorizer or state law, budget for it - $0 isn't an option.",
      whatToDoNext: "Check whether your state or authorizer requires you to provide transportation. If so, get quotes from local bus companies early - prices vary significantly by region. If optional, consider whether offering transportation would meaningfully increase your enrollment.",
    },
    extraBody: {
      workedExample: "Transporting 60 of 100 students, three options compared:\n• Option A: Full bus contract, 2 routes at $45K each = $90K/year ($1,500/student)\n• Option B: Parent transit stipends at $600/student = $36K/year\n• Option C: Public transit partnership at $400/student = $24K/year\n• Option A costs 3.75x more than Option C\n• But Option A may be required by your authorizer or state law",
      benchmarkDetail: "Transportation benchmarks:\n• Bus contracts: $35K-$65K per route per year\n• Average route serves 30-45 students\n• Fuel cost increases: 5-8% annually\n• State reimbursement (where available): $500-$1,200/student\n• Schools spending >8% of revenue on transportation should evaluate alternatives",
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
      whyItMatters: "Schools that invest in PD retain teachers longer and deliver better outcomes. A PD budget signals that leadership takes quality seriously. Skipping PD to save money is a false economy - it leads to higher turnover, which costs far more.",
      healthyVsRisky: "Schools typically budget $500-1,500 per staff member per year for PD. Less than $200 per person signals underinvestment. Some authorizers require a minimum PD budget as a condition of approval.",
      whatToDoNext: "Budget at least $500 per staff member for Year 1. As revenue grows, increase PD spending - it's one of the best investments you can make in school quality and staff retention.",
    },
    extraBody: {
      workedExample: "12 staff members at $1,000/person = $12K PD budget:\n• 4 teachers attend a $2,000 national conference ($8K)\n• Remaining $4K covers online PD subscriptions for all staff\n• Teacher turnover costs $8K-$15K per departure (recruiting, training, lost productivity)\n• If PD prevents even 1 teacher from leaving, it pays for itself\n• Schools with robust PD programs see 15-25% lower turnover",
      benchmarkDetail: "PD spending benchmarks:\n• High-performing school networks: $1,500-$3,000 per staff member\n• Traditional districts: $500-$800\n• Best practice: allocate 1-3% of total personnel budget to PD\n• Required PD hours vary by state: typically 15-30 hours/year for certification",
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
      whatThisMeans: "School insurance typically includes general liability, property insurance, directors & officers (D&O), workers' compensation, and potentially umbrella coverage. This is a non-negotiable operating cost for any school.",
      whyItMatters: "Operating without adequate insurance is both a legal risk and a non-starter for any serious financial plan. Insurance costs tend to escalate 5-8% annually, which founders often forget to factor in. We've seen models that budget Year 1 insurance correctly but don't account for increases.",
      healthyVsRisky: "Most small schools pay $3,000-8,000 annually for a basic insurance package. Schools with transportation or athletics should budget higher ($8,000-15,000). A $0 insurance budget will immediately raise questions from anyone reviewing your model.",
      whatToDoNext: "Get quotes from 2-3 insurance brokers who specialize in schools - they'll know the coverage requirements for your state. Budget the Year 1 quote and plan for 5-8% annual increases in your assumptions.",
    },
    extraBody: {
      workedExample: "Year 1 insurance package:\n• General liability: $2,500\n• Property: $1,200\n• D&O: $1,800\n• Workers' comp: $2,000\n• Umbrella: $1,500\n• Total: $9,000\nWith 6% annual increases:\n• Year 2: $9,540\n• Year 3: $10,112\n• Year 4: $10,719\n• Year 5: $11,362\nOver 5 years, insurance totals $50,733 - 13% more than flat pricing. Always escalate insurance in your projections.",
      benchmarkDetail: "Insurance costs by type:\n• General liability: $1,500-$4,000\n• Property: $800-$3,000 (depends on building value)\n• D&O: $1,200-$3,000\n• Workers' comp: 1.5-3% of payroll\n• Umbrella/excess: $1,000-$3,000\n• Commercial auto (if buses): $3,000-$8,000 per vehicle\n• Total for a 100-student school: $8,000-$18,000",
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
      whatThisMeans: "Debt service is the total amount you pay on any loans - principal plus interest. This includes loans for building renovations, equipment, working capital, or any other borrowed funds.",
      whyItMatters: "Debt service is a fixed obligation that must be paid regardless of enrollment or revenue. Your Debt Service Coverage Ratio (DSCR) - available cash flow divided by debt payments - tells you whether your school can comfortably meet its loan obligations.",
      healthyVsRisky: "A DSCR of 1.2x or higher is considered healthy - meaning you have 20% more cash flow than needed to cover debt. Below 1.0x means you can't cover your payments from operations. If you're applying for financing, most banks require at least 1.15x DSCR.",
      whatToDoNext: "If you plan to take on debt, enter the loan details accurately. If your DSCR comes out below 1.2x, consider whether you can reduce the loan amount, extend the term, or grow revenue faster. Don't take on debt your model can't support.",
    },
    extraBody: {
      workedExample: "$500K loan at 7% interest over 10 years:\n• Annual payment: $71,187 ($35K interest + $36K principal in Year 1)\n• Year 1 net operating income (before debt): $85,000\n• DSCR = $85K / $71K = 1.19x (just below 1.2x threshold)\n• Adding 10 students at $10K each pushes NOI to $165K\n• New DSCR = 2.32x\nSmall enrollment changes have outsized DSCR impact.",
      benchmarkDetail: "Debt benchmarks for schools:\n• School loan rates: 5-9% (varies with credit and collateral)\n• Facility loan terms: 7-15 years\n• Working capital terms: 3-5 years\n• Total debt service should not exceed 15% of revenue\n• Bank DSCR requirements: minimum 1.15x-1.25x\n• CDFIs may accept lower DSCR for mission-aligned schools",
      glossaryTerms: "• DSCR: Net operating income divided by total annual debt payments (1.5x = you earn 50% more than owed)\n• Principal: Portion of payment that reduces outstanding balance\n• Amortization: Schedule by which loan principal is paid down\n• Covenant: Loan condition (like maintaining 1.2x DSCR) you must meet or risk default",
      financingInsight: "DSCR is the single most important metric banks evaluate:\n• Below 1.0x: school can't cover debt from operations\n• 1.0x-1.15x: may require additional security\n• Above 1.25x: gives confidence the school can handle a 10-15% enrollment dip",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "facilities",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 19,
    highFriction: true,
    priority: "high",
  },
  narrative_enrollment_strategy: {
    id: "narrative_enrollment_strategy",
    title: "Writing Your Enrollment Strategy",
    body: {
      whatThisMeans: "This section explains how you'll fill seats - your marketing channels, community outreach, waitlist strategy, and evidence of demand. Anyone reviewing your model will read this to assess whether your enrollment projections are realistic or aspirational.",
      whyItMatters: "Enrollment strategy is the first thing reviewers look at because every revenue line depends on it. They want to see specific, evidence-backed plans - not vague optimism. A founder who can articulate exactly how 50 families will find and choose their school is far more credible than one who writes 'we expect strong community interest.'",
      healthyVsRisky: "Strong: 'We have 35 signed letters of intent and a waitlist of 12 families from our community info sessions. Our marketing plan includes partnerships with 3 local churches and a monthly open house series.' Weak: 'We expect families will be interested because our program is unique and there's demand in the area.'",
      whatToDoNext: "Name your specific recruitment channels (info sessions, church partnerships, social media campaigns, community events). Cite evidence: letters of intent, waitlist numbers, survey results, or pre-registration counts. If you don't have evidence yet, describe your plan to build it before opening day.",
    },
    extraBody: {
      workedExample: "Sample enrollment strategy (target: 80 students Year 1):\n• 47 signed letters of intent as of March 2025\n• 6 community info sessions (avg. 22 attendees, 35% conversion to LOI)\n• Partnership with First Baptist Church (12 LOIs from congregation)\n• Facebook/Instagram campaign (800 clicks, 15% to info session)\n• Conversion funnel: 800 leads → 180 attendees → 63 LOIs → 80 enrolled\n• LOI-to-enrollment rate: ~127% (waitlisted peers confirm)",
      financingInsight: "Banks evaluate demand evidence on a spectrum:\n• Signed contracts/deposits (strongest)\n• Letters of intent (strong)\n• Waitlist sign-ups (moderate)\n• Survey interest (helpful but not decisive)\n• General belief in demand (not enough)\nBuilding toward the top levels strengthens any application.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "narrative",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 20,
    highFriction: true,
    priority: "high",
  },
  narrative_retention: {
    id: "narrative_retention",
    title: "Articulating Your Retention Plan",
    body: {
      whatThisMeans: "This section describes how you'll keep families year over year. Acquiring a new student costs 3-5x more than retaining one, so retention is a key financial lever.",
      whyItMatters: "Strong plans show that you've thought about what happens after families enroll. A school that loses 30% of students each year needs to replace them just to stay flat - and recruitment costs eat into margins. Retention above 85% is what makes 5-year projections believable.",
      healthyVsRisky: "Strong: 'Our re-enrollment process begins in January with family conferences. We track family satisfaction quarterly through surveys, and our parent liaison addresses concerns within 48 hours. We target 90% retention.' Weak: 'We believe families will stay because they'll love our program.'",
      whatToDoNext: "Describe your re-enrollment timeline, family communication plan, and how you'll measure satisfaction. If you have retention data from a pilot or similar school, include it. Specific processes (surveys, conferences, parent liaisons) are more convincing than general intentions.",
    },
    extraBody: {
      workedExample: "Retention compounding over 5 years (100 Year 1 students):\n• At 90% retention: Year 2 returning = 90 (need 10 new)\n• At 80% retention: Year 2 returning = 80 (need 20 new)\n• By Year 5, cumulative new students needed:\n• 90% retention: 41 total\n• 80% retention: 82 total (double the recruitment effort)\n• At $500/student acquisition cost: $20K vs $41K over 5 years",
      benchmarkDetail: "Retention benchmarks:\n• High-performing schools: 90-95%\n• Average: 82-88%\n• Below 80%: constant recruitment just to stay flat\nRe-enrollment best practices:\n• Begin process in January\n• Confirm by March\n• Fill remaining seats April-August\n• Schools that wait until summer consistently underperform",
      glossaryTerms: "• Retention Rate: Returning students divided by prior year enrollment (excluding graduates)\n• Attrition: The opposite - students who leave\n• Churn Cost: Total cost of replacing a departing student (marketing, processing, onboarding)\n• Net Promoter Score (NPS): Parent satisfaction measure - scores above 50 correlate with >90% retention",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "narrative",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 21,
    highFriction: false,
    priority: "standard",
  },
  narrative_risk_mitigation: {
    id: "narrative_risk_mitigation",
    title: "Presenting Risk Mitigation",
    body: {
      whatThisMeans: "This section shows you've stress-tested your plan. What happens if enrollment is 20% below target? What if retention drops to 70%? What expenses can you cut without closing the school?",
      whyItMatters: "Good planning assumes something will go wrong. Founders who acknowledge risks and present specific contingencies are seen as realistic operators. Founders who claim 'everything will go as planned' are seen as inexperienced. This section can make or break reviewer confidence.",
      healthyVsRisky: "Strong: 'If Year 1 enrollment is 20% below target, we'll defer 2 non-essential hires (saving $85K) and reduce marketing spend by $10K. Our lease allows subletting one classroom. We maintain a 60-day operating reserve for cash flow gaps.' Weak: 'If enrollment is low, we'll work harder to recruit students and reduce costs.'",
      whatToDoNext: "Walk through 2-3 specific downside scenarios (low enrollment, delayed funding, unexpected costs) and describe your response for each. Name the expenses you'd cut and the dollar amounts. Show that you've identified which costs are flexible and which are locked in.",
    },
    extraBody: {
      workedExample: "Sample risk mitigation scenarios:\nScenario 1 - Enrollment 20% below target (64 vs 80 students):\n• Revenue impact: -$160K\n• Defer 2 hires: -$110K\n• Reduce supplies budget: -$20K\n• Negotiate rent deferral: -$30K\n• Net gap: $0\nScenario 2 - Grant delayed 6 months ($50K):\n• Bridge with startup reserve ($50K available)\nScenario 3 - Key staff departure mid-year:\n• Cross-trained backup for each critical role\n• $15K emergency recruitment budget reserved",
      financingInsight: "Reviewers look for three things in risk planning:\n• Are the risks realistic (genuine threats, not minor inconveniences)?\n• Are the responses specific (dollar amounts, named actions, timelines)?\n• Is there a contingency plan for severe scenarios?\nFounders who calmly discuss difficult scenarios inspire more confidence, not less.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "narrative",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 22,
    highFriction: true,
    priority: "high",
  },
  narrative_revenue_expenses: {
    id: "narrative_revenue_expenses",
    title: "Explaining Revenue & Expense Assumptions",
    body: {
      whatThisMeans: "This section explains the reasoning behind your financial numbers - why you set tuition at a specific level, why you chose your staffing ratios, and why certain expenses are higher or lower than benchmarks.",
      whyItMatters: "Reviewers don't just read the numbers - they read the logic behind them. A tuition rate of $12,000 needs context: is that below market? At market? Is there data to support families' ability to pay? Every assumption that deviates from benchmarks needs an explanation.",
      healthyVsRisky: "Strong: 'Tuition is set at $11,500, which is 15% below the average for independent schools in our zip code ($13,500). We chose this to maximize enrollment accessibility while covering per-student costs of $9,800.' Weak: 'Our tuition is competitive for the area.'",
      whatToDoNext: "For each major assumption (tuition, staffing ratio, facility cost, growth rate), provide the reasoning and any market data that supports it. If an assumption differs from typical benchmarks, explain why. Concrete numbers and comparisons are always stronger than qualitative statements.",
    },
    extraBody: {
      workedExample: "Sample staffing assumption narrative:\n• 8.5 FTE in Year 1 for 80 students (9.4:1 ratio)\n• 5 teachers (16:1 student-teacher ratio)\n• 1 SpEd coordinator\n• 1 operations manager\n• 1 Head of School\n• 0.5 FTE finance consultant\n• Year 2 adds 2 teachers as enrollment reaches 110 (maintains 16:1)\n• Avg teacher salary $48K benchmarked to district median ($52K) - 7.7% discount for startup stage, offset by PD investment and culture",
      benchmarkDetail: "Assumption justification guidelines:\n• Tuition: reference 2-3 comparable schools with specific dollar amounts\n• Staffing ratios: cite state requirements or authorizer expectations\n• Facility costs: reference actual lease quotes or market comparables\n• Growth rates: justify with documented demand, not aspirational targets\n• Any assumption >15% different from benchmarks needs explicit justification",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "narrative",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 23,
    highFriction: false,
    priority: "standard",
  },
  breakeven_analysis: {
    id: "breakeven_analysis",
    title: "Break-Even Analysis",
    body: {
      whatThisMeans: "Break-even analysis tells you exactly how many students you need to cover all your costs - the point where revenue equals expenses. Below this number, you lose money. Above it, every additional student adds to your surplus.",
      whyItMatters: "Your break-even enrollment is the most important number in your financial model after total enrollment. It tells you how much margin for error you have. If your projected enrollment is barely above break-even, any shortfall puts the school in the red. Any serious reviewer will calculate this number, even if you don't present it.",
      healthyVsRisky: "Healthy: break-even enrollment is 70-80% of projected enrollment, giving you a 20-30% cushion. Risky: break-even is 90%+ of projected enrollment - a small miss puts you underwater. Critical: break-even exceeds projected enrollment - the model doesn't work at any realistic enrollment level.",
      whatToDoNext: "Calculate your break-even point: Total Fixed Costs ÷ (Revenue per Student - Variable Cost per Student). Compare this to your projected enrollment. If break-even is above 85% of projected enrollment, look for ways to reduce fixed costs or increase per-student revenue.",
    },
    extraBody: {
      workedExample: "Fixed costs $600K, revenue $10K/student, variable cost $2K/student:\n• Contribution margin: $10K - $2K = $8K per student\n• Break-even: $600K / $8K = 75 students\n• At 100 students (projected): cushion of 25 students (25%)\n• At 80 students: surplus = 5 x $8K = $40K\n• At 70 students (below break-even): deficit = 5 x $8K = -$40K",
      benchmarkDetail: "Break-even benchmarks:\n• Most viable models break even at 65-80% of target capacity\n• Above 90% of capacity = high risk\n• National average for new schools: ~72% of Year 1 target\n• High fixed costs (expensive leases, large admin teams) push break-even higher",
      glossaryTerms: "• Break-Even Enrollment: Exact number of students needed for revenue to equal expenses\n• Contribution Margin: Revenue per student minus variable cost per student\n• Margin of Safety: Projected enrollment minus break-even enrollment (as a percentage)\n• Operating Leverage: High fixed costs mean fast profit above break-even but fast losses below it",
      financingInsight: "Banks will independently calculate your break-even enrollment:\n• The strongest models show break-even at or below 70% of projected enrollment\n• That cushion gives confidence the school can weather a slow start\n• If break-even exceeds 85% of projections, consider reducing fixed costs before applying",
    },
    audienceLevel: ["extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 24,
    highFriction: true,
    priority: "high",
  },
  dscr_explained: {
    id: "dscr_explained",
    title: "Debt Service Coverage Ratio (DSCR) Explained",
    body: {
      whatThisMeans: "DSCR measures whether your school generates enough cash flow to cover its loan payments. It's calculated as: Net Operating Income ÷ Annual Debt Service. A DSCR of 1.5x means you earn 50% more than you owe in loan payments.",
      whyItMatters: "If you're taking on any debt - facility loans, equipment financing, working capital lines - DSCR is the metric banks use to decide whether to approve your loan and at what rate. It's the financial equivalent of 'can you afford this?'",
      healthyVsRisky: "Above 1.25x: Strong - comfortable position. 1.15x-1.25x: Adequate but tight - may require additional security. 1.0x-1.15x: Marginal - most banks will decline or require personal guarantees. Below 1.0x: The school cannot cover its debt from operations.",
      whatToDoNext: "If your model shows debt, check the DSCR on your Review page. If it's below 1.2x, consider: reducing loan amount, extending loan term (lower annual payments), increasing revenue, or cutting non-essential expenses to improve cash flow.",
    },
    extraBody: {
      workedExample: "Year 1: $1.2M revenue, $1.05M expenses (excluding debt):\n• Net Operating Income: $150K\n• Annual debt service on $600K loan at 7% over 10 years: $85K\n• DSCR = $150K / $85K = 1.76x (healthy)\nStress test - enrollment drops 15%:\n• Revenue falls to $1.02M, NOI drops to -$30K\n• DSCR = -0.35x (can't make loan payments)\nBase case looks fine, but a modest enrollment miss makes debt unsustainable.",
      benchmarkDetail: "DSCR requirements by financing type:\n• Traditional banks: 1.25x-1.50x\n• CDFIs: 1.10x-1.20x (for mission-aligned projects)\n• SBA loans: 1.15x-1.25x\n• Bond financing: 1.30x-1.50x\nDSCR is evaluated on both trailing 12-month and projected figures.",
      glossaryTerms: "• Net Operating Income (NOI): Total revenue minus operating expenses, before debt service\n• Debt Service: Total annual loan payments (principal + interest)\n• Coverage Ratio: NOI divided by debt service (how many times over you can cover payments)\n• Debt Covenant: Loan condition requiring minimum DSCR (typically 1.15x-1.25x); violating it can trigger default",
      financingInsight: "Banks evaluate DSCR three ways:\n• Using your projections\n• Using conservative stress-tested numbers\n• Using peer school benchmarks\nImproving DSCR by even 0.1x can meaningfully improve the terms you're offered.",
    },
    audienceLevel: ["extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 25,
    highFriction: true,
    priority: "high",
  },
  assumptions_cola: {
    id: "assumptions_cola",
    title: "COLA (Cost of Living Adjustment)",
    body: {
      whatThisMeans: "COLA is the annual percentage increase applied to every staff salary in your model. It keeps compensation competitive as the cost of living rises - think of it as the automatic raise your team gets each year.",
      whyItMatters: "If COLA falls below inflation, your staff takes a real pay cut every year - even if their number looks bigger on paper. That's one of the fastest paths to turnover. On the other hand, setting COLA too high without matching revenue growth can squeeze your budget. The goal is to keep COLA at or slightly above your general inflation rate.",
      healthyVsRisky: "A good rule of thumb: set COLA at least equal to your general cost inflation rate (which you set on this same page). If inflation is 2%, COLA should be at least 2-3%. Below inflation makes it harder to retain staff. Above 4% is aggressive and can squeeze your budget in later years.",
      whatToDoNext: "Check your general inflation rate on this page and make sure COLA matches or slightly exceeds it. If you're in a high-cost area (SF, NYC, DC), consider 3.5-4%. In lower-cost areas, 2-2.5% may work. The default of 3% is a solid starting point.",
    },
    schoolTypeVariants: {
      charter: {
        whatToDoNext: "Charter schools often need competitive COLA to retain teachers against district pay scales. If your state raises per-pupil funding annually, align COLA with that increase rate. Most charter networks budget 2.5-3.5% COLA.",
      },
      private: {
        whatToDoNext: "Private schools should align COLA with planned tuition increases. If you raise tuition 3% annually, COLA of 2.5-3% keeps compensation growing in step with revenue. Check what competing schools in your area pay to stay competitive.",
      },
      micro: {
        whatToDoNext: "For smaller programs, even modest COLA matters for retention. If your team is small, consider whether individual raises based on performance might work better than a blanket percentage. The default of 3% is a reasonable starting point.",
      },
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "assumptions",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 30,
    highFriction: false,
    priority: "standard",
  },
  assumptions_benefits_rate: {
    id: "assumptions_benefits_rate",
    title: "Benefits Rate",
    body: {
      whatThisMeans: "The benefits rate is the percentage of each employee's salary that goes toward benefits - health insurance, retirement contributions, disability, and similar. A 25% rate on a $50,000 salary means $12,500 in benefits costs on top of the salary.",
      whyItMatters: "Benefits are a major hidden cost. Many first-time founders budget salaries but underestimate benefits, which can add 20–35% to every payroll dollar. Getting this rate realistic is essential for an accurate staffing budget.",
      healthyVsRisky: "20–25% is common for schools offering a basic benefits package. 25–30% is typical when including strong health coverage and retirement match. Above 30% is generous but can put pressure on smaller budgets. Below 20% may signal limited benefits that make recruiting harder.",
      whatToDoNext: "If you're not sure, 25% is a safe default. If you've already quoted health insurance plans, you can calculate a more precise rate. Individual roles can override this default on the Staffing step.",
    },
    schoolTypeVariants: {
      charter: {
        whatThisMeans: "The benefits rate is the percentage of each employee's salary that goes toward benefits. Charter schools often need competitive benefits to attract teachers from district positions where benefits are typically strong.",
        whatToDoNext: "Research what your local district offers for benefits. Many charter teachers compare total compensation (salary + benefits) against district positions. 25-30% is common for charter schools offering competitive health and retirement packages.",
      },
      private: {
        whatToDoNext: "Private schools vary widely in benefits. Faith-affiliated schools may offer benefits through diocesan or denominational plans. If you're offering a lean benefits package (15-20%), consider whether that affects your ability to recruit. Individual roles can override this on the Staffing step.",
      },
      micro: {
        whatThisMeans: "The benefits rate covers health insurance, retirement, and similar costs on top of salary. For micro programs, benefits costs can be a significant percentage of your total budget since your team is small.",
        whatToDoNext: "If your team is mostly contractors (1099), benefits may not apply - set this lower. For W-2 employees, 20-25% is a reasonable default. If you're the only employee, research individual health insurance costs in your area to set a more precise rate.",
      },
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "assumptions",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 31,
    highFriction: false,
    priority: "standard",
  },
  assumptions_collection_rate: {
    id: "assumptions_collection_rate",
    title: "Collection Rate",
    body: {
      whatThisMeans: "The collection rate is the percentage of billed tuition your school actually receives. A 95% collection rate on $1M in billed tuition means you'll collect $950,000 - the other $50,000 represents late payments, financial hardship, and uncollectible accounts.",
      whyItMatters: "Planning for 100% collection is one of the most common mistakes in school financial models. Real-world collection rates for invoiced families typically range from 92–98%. Even a small gap can mean tens of thousands in missing revenue.",
      healthyVsRisky: "95–98% is realistic for schools with autopay. 92–96% is typical for invoiced families. Below 90% suggests significant collection challenges worth addressing. 100% is only realistic if all families are on autopay with no exceptions.",
      whatToDoNext: "If you're using autopay for most families, 98–100% is reasonable. If you're invoicing, 93–95% is a safer assumption. You can set this per revenue row on the Revenue step if different programs have different collection profiles.",
    },
    schoolTypeVariants: {
      charter: {
        whatThisMeans: "The collection rate applies to any fees your charter school charges (registration, activity, technology fees). For per-pupil state funding, collection is typically 100% once enrollment is verified - this setting mainly affects ancillary fee revenue.",
        whatToDoNext: "If your charter school is tuition-free and only charges minimal fees, a 95-98% collection rate is reasonable. If you don't charge any fees, this setting won't significantly impact your model since per-pupil funding flows through a different mechanism.",
      },
      private: {
        whatToDoNext: "Private schools with robust autopay enrollment can plan for 97-99%. For families on payment plans or invoicing, 92-95% is more realistic. Budget your financial aid separately - collection rate applies to the net amount after aid, not gross tuition.",
      },
      micro: {
        whatThisMeans: "The collection rate is the percentage of fees you actually receive from families. With smaller groups and closer relationships, micro programs often see higher collection rates than larger schools.",
        healthyVsRisky: "Micro programs with upfront or autopay billing often achieve 97-100% collection. If you invoice monthly, 95-98% is realistic. The close relationships in small programs usually mean fewer collection issues.",
      },
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "assumptions",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 32,
    highFriction: false,
    priority: "standard",
  },
  assumptions_general_inflation: {
    id: "assumptions_general_inflation",
    title: "General Cost Inflation",
    body: {
      whatThisMeans: "General cost inflation is the annual percentage increase applied to most non-salary expenses - supplies, insurance, utilities, professional services, and similar operating costs. It reflects the reality that things get more expensive over time.",
      whyItMatters: "Without inflation built in, your Year 5 projections will look artificially strong because expenses stay flat while (hopefully) revenue grows. Realistic inflation keeps your model honest and prevents surprises in later years.",
      healthyVsRisky: "2–3% matches long-term US inflation averages and is appropriate for most schools. 0% means you're assuming costs never rise - optimistic but unrealistic for a 5-year plan. Above 4% may overstate cost growth unless you're in a period of high inflation.",
      whatToDoNext: "The default of 2% is conservative and appropriate for most situations. If you have specific vendor contracts with locked pricing, you might set this lower. Leave it as-is unless you have a reason to change it.",
    },
    schoolTypeVariants: {
      charter: {
        whatToDoNext: "Charter schools should pay attention to inflation on facility costs if you're leasing commercial space, and on insurance/compliance costs that tend to rise faster than general inflation. The default of 2% is reasonable for most charter operating expenses.",
      },
      micro: {
        whatToDoNext: "Micro programs with low overhead may be less sensitive to inflation, but don't set this to 0%. Even home-based programs see cost increases in supplies, insurance, and technology subscriptions. The default of 2% keeps your projections realistic.",
      },
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "assumptions",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 33,
    highFriction: false,
    priority: "standard",
  },
  revenue_timing: {
    id: "revenue_timing",
    title: "Revenue Timing & Cash Flow",
    body: {
      whatThisMeans: "Revenue timing is when money actually arrives in your bank account - not when you earn it on paper. A school can be 'profitable' on an annual basis but still run out of cash if payments arrive late.",
      whyItMatters: "The gap between when you owe bills and when revenue arrives is where most first-year schools feel the squeeze. Understanding payment timing helps you plan for the lean months and avoid surprises.",
      healthyVsRisky: "Healthy: Revenue arrives monthly or quarterly on predictable schedules. Worth watching: Large portions of revenue come from reimbursement-based programs with 45-60 day lag. The risk grows when multiple delayed sources stack up in the same months.",
      whatToDoNext: "For each revenue source, think about when the money actually hits your account. Set the timing controls to match reality. If most of your revenue arrives after September, make sure you have enough cash to cover July and August expenses.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "revenue",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 34,
    highFriction: false,
    priority: "standard",
  },
  staffing_ramp: {
    id: "staffing_ramp",
    title: "Staffing Ramp & Ratios",
    body: {
      whatThisMeans: "Staffing ramp is how your team grows as enrollment increases. You can set each role as a fixed number of people or let it scale automatically with a student-to-staff ratio.",
      whyItMatters: "Personnel is typically 55-65% of a school's budget. Getting staffing right means hiring the people you need when you need them - not too early (which burns cash) and not too late (which hurts quality).",
      healthyVsRisky: "Healthy: Ratio-driven roles for teachers and aides, fixed roles for leadership and operations. Worth watching: Hiring your full Year 5 team in Year 1 when you only have 60 students. A good plan phases in staff as enrollment grows.",
      whatToDoNext: "For teaching roles, try 'Student Ratio' mode - it automatically adjusts headcount as enrollment grows. For leadership and admin roles, 'Fixed FTE' makes more sense since those don't scale linearly with students.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "staffing",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 35,
    highFriction: false,
    priority: "standard",
  },
  expense_categories: {
    id: "expense_categories",
    title: "Expense Categories & Completeness",
    body: {
      whatThisMeans: "Your operating expenses cover everything beyond personnel - facility costs, technology, curriculum, insurance, and professional services. These are grouped into categories to help you think through each area systematically.",
      whyItMatters: "Underestimating expenses is the most common mistake in first-year school budgets. It's better to overestimate slightly and come in under budget than to be surprised by costs you forgot to plan for.",
      healthyVsRisky: "Healthy: Every category has been reviewed and adjusted for your school's reality. Worth watching: Leaving default amounts without checking them. Common gaps: insurance, legal fees, marketing, professional development, and technology refresh costs.",
      whatToDoNext: "Walk through each expense category and ask: 'Does this feel right for my school?' Don't worry about being exact - a reasonable estimate is far better than a gap. You can always refine these numbers later.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "expenses",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 36,
    highFriction: false,
    priority: "standard",
  },
  working_capital: {
    id: "working_capital",
    title: "Working Capital Management",
    body: {
      whatThisMeans: "Working capital is the cash you need to cover day-to-day operations between when expenses are due and when revenue arrives. It's the bridge that keeps your school running during timing gaps in your cash flow.",
      whyItMatters: "Even profitable schools can fail if they run out of cash. Working capital shortfalls are the #1 reason new schools face financial crises in their first two years. You might have a great annual budget, but if your cash runs out in September because tuition hasn't been collected yet, you can't make payroll.",
      healthyVsRisky: "Healthy: 60-90 days of operating expenses available as working capital. Adequate: 30-60 days. Risky: less than 30 days. Critical: relying on next month's revenue to pay this month's bills. Schools in the 'critical' zone are one delayed payment away from a crisis.",
      whatToDoNext: "Calculate your monthly operating expenses (total annual expenses ÷ 12). Multiply by 2-3 to get your minimum working capital target. If your starting cash is below this amount, plan for how you'll bridge the gap - startup grants, a line of credit, or delayed spending.",
    },
    extraBody: {
      workedExample: "Monthly expenses $75K, working capital target 2.5 months ($187.5K):\n• Starting cash: $120K\n• July (before school starts): $75K in expenses, $0 revenue → cash drops to $45K\n• August: another $75K, $0 revenue → cash = -$30K\n• Out of money before a single student arrives\n• You needed $187.5K to safely bridge this gap\n• Solution: secure a $75K line of credit or startup grant to supplement $120K",
      benchmarkDetail: "Working capital benchmarks:\n• Target 60-90 days of operating expenses before doors open\n• Most cash-intensive period: June-September (staff hired, facility prepared, no revenue)\nWorking capital sources:\n• Startup grants (most common)\n• Founder investment\n• Pre-opening fundraising\n• Lines of credit: $25K-$100K from CDFIs (6-10% interest on drawn amounts)",
      glossaryTerms: "• Working Capital: Cash available to cover short-term obligations (current assets minus current liabilities)\n• Cash Conversion Cycle: Time between paying expenses and collecting revenue (30-90 days for schools)\n• Line of Credit: Pre-approved borrowing for lean months (you only pay interest on what you use)\n• Days Cash on Hand: Cash balance divided by daily operating expenses",
      financingInsight: "Banks view working capital as a survival metric:\n• Starting with less than 45 days of expenses in cash is considered risky\n• Your minimum cash position across the entire projection matters\n• If cash goes negative at any point, the model needs work even if the annual budget balances",
    },
    audienceLevel: ["extra"],
    relatedSection: "review",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 26,
    highFriction: true,
    priority: "high",
  },
  accounting_basis: {
    id: "accounting_basis",
    title: "Accounting Basis",
    body: {
      whatThisMeans: "Your accounting basis describes when you record revenue and expenses. Cash basis means you record transactions when money actually changes hands. Accrual basis means you record them when they're earned or incurred, regardless of when payment happens.",
      whyItMatters: "We build every model on an accrual basis - it gives the most complete and accurate picture of your school's financial health. Even if you currently track your books on a cash basis (which is perfectly fine for day-to-day operations), your 5-year projections need to show when revenue is earned and expenses are committed, not just when checks clear.",
      healthyVsRisky: "There's no wrong answer here. Many small schools start on cash basis because it's simpler - that's completely normal. What matters is that your financial model projects on an accrual basis so that anyone reviewing it (a board, an authorizer, a lender) sees a complete picture. Your day-to-day bookkeeping method is a separate decision.",
      whatToDoNext: "Select whichever option describes how you currently keep your books. If you're not sure, choose 'Not sure yet' - we'll note it and your model will work exactly the same either way. All projections use accrual accounting regardless of your selection.",
    },
    extraBody: {
      workedExample: "September tuition billed: $120K, collected by Sept 30: $100K (rest arrives in October):\n• Cash basis: records $100K in September, $20K in October\n• Accrual basis: records $120K in September (when earned)\n• Annual total is the same ($120K)\n• Accrual gives a more accurate monthly picture of your financial position",
      glossaryTerms: "• Cash Basis: Revenue recorded when received, expenses recorded when paid (simplest method)\n• Accrual Basis: Revenue recorded when earned, expenses when incurred (required for GAAP and most grant reporting)\n• Modified Cash Basis: Hybrid approach - cash basis with certain accrual adjustments\n• GAAP: Generally Accepted Accounting Principles (standard US financial reporting framework)",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "school_profile",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 36,
    highFriction: false,
    priority: "standard",
  },
  reading_your_analysis: {
    id: "reading_your_analysis",
    title: "How to Read Your Analysis",
    body: {
      whatThisMeans: "This page summarizes everything you've entered into your financial model. It translates your numbers into key metrics, charts, and a plain-English health check so you can see how your school looks on paper before you share it with anyone else.",
      whyItMatters: "A budget spreadsheet tells you what the numbers are. This analysis tells you what the numbers mean. It's the difference between 'staffing costs are $450K' and 'staffing is 65% of revenue - that's typical for a school your size.' Understanding these patterns helps you spot strengths and weaknesses before a board member, authorizer, or lender does.",
      healthyVsRisky: "Healthy: You understand why each metric is green, yellow, or red, and you've made conscious choices about any watch items. Worth watching: You're not sure what a metric means or why it's flagged. Common misread: Assuming all 'watch' items are problems - some are perfectly normal trade-offs for your school model.",
      whatToDoNext: "Start with 'The bottom line' summary at the top. Then scan the key metrics - focus on any yellow or red items first. Click 'How is this calculated?' on any metric you don't understand. If something looks off, use the 'Jump to step' buttons to go back and adjust your inputs.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "consultant",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 37,
    highFriction: false,
    priority: "standard",
  },
  writing_your_narrative: {
    id: "writing_your_narrative",
    title: "Writing Your Budget Narrative",
    body: {
      whatThisMeans: "Your budget narrative is the story behind the numbers. It explains why you made the financial choices you did, how you plan to hit your targets, and what you'll do if things don't go as planned. Think of it as the 'why' that complements the 'what' in your spreadsheets.",
      whyItMatters: "Numbers alone don't tell a complete story. A board member reviewing your budget will want to know: 'Why did you choose this tuition level?' 'How will you actually get 120 students enrolled?' 'What happens if you fall short?' Your narrative answers these questions and builds confidence that you've thought through the plan, not just the math.",
      healthyVsRisky: "Healthy: Each section is written in your own words, addresses the specific question, and gives concrete details (names of neighborhoods, partner organizations, specific marketing tactics). Worth watching: Generic answers that could apply to any school. Common gap: Skipping the risk mitigation section - that's actually the most important one for building credibility.",
      whatToDoNext: "Start with the three priority sections (marked in amber): enrollment strategy, retention plan, and risk mitigation. Write naturally, as if you're explaining your plan to a supportive mentor. Don't worry about perfect prose - clarity and specificity matter more than polish.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "narrative",
    dismissible: true,
    autoExpandFor: ["extra"],
    order: 38,
    highFriction: false,
    priority: "standard",
  },
  decision_add_program: {
    id: "decision_add_program",
    title: "What an 'Add a program' flow does",
    body: {
      whatThisMeans: "This 4-step flow lets you sketch a new grade band, after-school track, or program on top of your base model so you can see what it adds to revenue and cost without rewriting the model.",
      whyItMatters: "Adding a program looks small on paper - one new grade, a handful of seats - but it almost always touches three lines at once: tuition revenue, teacher salaries, and classroom space. Modelling it explicitly is how you avoid the 'we forgot the second teacher' surprise after the board says yes.",
      healthyVsRisky: "Healthy: the new program holds its own contribution margin within Year 2 and doesn't push DSCR below 1.20. Worth watching: a program that only breaks even in Year 4+ is fine if it's mission-critical, but flag it to the board so the runway question is on the table from day one.",
      whatToDoNext: "Spend a sentence on Step 1 capturing why you're considering it (board ask, family demand, etc.), keep Step 2 inputs realistic (don't assume max enrollment in Year 1), and on Step 3 watch the Y5 net income and break-even shifts before you save.",
      commonReasons: [
        "Mission expansion",
        "Demand from families",
        "Capacity at current grades",
        "Authorizer ask",
        "Board direction",
        "Funding opportunity",
      ],
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "decision_add_program",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 1,
    highFriction: false,
    priority: "standard",
  },
  decision_evaluate_site: {
    id: "decision_evaluate_site",
    title: "What an 'Evaluate a site' flow does",
    body: {
      whatThisMeans: "This 4-step flow plugs a new building, lease, or fit-out cost into your base model so you can see how it shifts DSCR, cash runway, and break-even before you sign anything.",
      whyItMatters: "Facilities are the single biggest decision most school founders make. A monthly rent change of $5,000 quietly compounds into $300,000 over a 5-year lease - and that's before triple-net charges, escalators, and tenant improvements. Modelling the deal is how you keep that conversation honest.",
      healthyVsRisky: "Healthy: the site keeps facilities under 18-22% of revenue and DSCR at or above 1.20 by Year 2. Worth watching: any site that pushes facilities over 25% of revenue is a risk lenders will challenge, even if the building itself is perfect.",
      whatToDoNext: "On Step 2, enter the all-in monthly rent (base + NNN + escalator) - don't just type the headline number. On Step 3, look at the cash-runway delta in addition to DSCR; a site can pencil and still leave you cash-thin in Year 1.",
      commonReasons: [
        "Outgrowing current space",
        "Lease ending",
        "Better neighborhood fit",
        "Lower rent opportunity",
        "Capacity for new programs",
        "Lender / authorizer ask",
      ],
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "decision_evaluate_site",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 1,
    highFriction: false,
    priority: "standard",
  },
  decision_change_enrollment: {
    id: "decision_change_enrollment",
    title: "What a 'Change enrollment' flow does",
    body: {
      whatThisMeans: "This 4-step flow lets you replay your model against a different re-enrollment number, retention rate, or tuition adjustment - useful when reality came in above or below plan or when you're stress-testing for the board.",
      whyItMatters: "Enrollment is the single biggest swing factor in a school budget. A 10% miss on re-enrollment can wipe out a full year's surplus, even if every other line holds. Running the downside scenarios on purpose - before you have to - is how boards stay calm when the actuals come in.",
      healthyVsRisky: "Healthy: your model still hits a positive net margin and keeps reserve months above 1.5 even at a 10% enrollment shortfall. Worth watching: any scenario where a single bad re-enrollment year tips DSCR below 1.0 - that's the conversation to have with your board now, not in October.",
      whatToDoNext: "Run two passes: one optimistic, one pessimistic. Save both - the goal is to give your board a range, not a point estimate. Then 'Apply to model' the one that best matches your current best guess.",
      commonReasons: [
        "Re-enrollment exceeded plan",
        "Re-enrollment under plan",
        "Stress-testing for the board",
        "Authorizer requirement",
        "Conservative downside",
        "Recruitment update",
      ],
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "decision_change_enrollment",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 1,
    highFriction: false,
    priority: "standard",
  },
  accounting_mapping: {
    id: "accounting_mapping",
    title: "Mapping your accounts",
    body: {
      whatThisMeans: "Your accounting system has its own list of account names (the chart of accounts). We auto-detect which ones look like Revenue, which look like Expenses, and which look like Rent - and let you override anything we got wrong with one click.",
      whyItMatters: "Bookkeepers name accounts in their own way. We've seen rent show up as 'Facility Lease,' 'Building Costs,' 'Occupancy,' and a dozen other variants. Without an override, our 'Suggest from latest data' button on the actuals editor would either miss rent entirely or roll it into general expenses.",
      healthyVsRisky: "Healthy: every account that touches more than ~5% of your operating budget is mapped explicitly and you've reviewed the unmapped tail at least once a quarter. Worth watching: leaving a large 'Other' or 'Miscellaneous' account on auto-detect - if a bookkeeper renames it, the suggestion engine will silently shift.",
      whatToDoNext: "Open the panel after your first sync. Re-tag rent and any major program revenue accounts first, then sweep the rest. Your overrides are saved per-model, and we'll offer to reuse them on your next model so you don't redo this work.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "accounting_mapping",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 1,
    highFriction: false,
    priority: "standard",
  },
  actuals_editor: {
    id: "actuals_editor",
    title: "Recording actuals on a saved scenario",
    body: {
      whatThisMeans: "Once a decision is in motion, this editor lets you record the real numbers as they come in - enrollment, revenue, expenses, net income, signed rent. We line them up next to what your model projected so you can see the gap.",
      whyItMatters: "The forecast that shipped six months ago is only useful if you keep checking it against reality. Tracking actuals is how you catch a 15% enrollment shortfall in time to do something about it, instead of finding out at the next board meeting. It's also the only honest way to learn whether your forecasting is improving over time.",
      healthyVsRisky: "Healthy: variance under ~10% on the major lines, and a written explanation in the retro note for anything bigger. Worth watching: a variance bigger than 25% on any major line - either the actual is wrong (a bookkeeping coding error) or the model needs an update.",
      whatToDoNext: "If you've uploaded an accounting export on the wizard's School Profile step, hit 'Suggest from latest data' to prefill from your books. Otherwise type the numbers in directly. You can edit anything we prefilled before saving.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "actuals_editor",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 1,
    highFriction: false,
    priority: "standard",
  },
  accounting_export: {
    id: "accounting_export",
    title: "Uploading a P&L export",
    body: {
      whatThisMeans: "Drop in your latest Profit & Loss export from QuickBooks, Xero, or Wave (CSV or Excel) and we'll read the totals so 'Suggest from latest data' on saved scenarios fills in revenue, expenses, and net income from your real books.",
      whyItMatters: "Re-typing numbers your books already have is the fastest way to introduce errors and the surest way to stop tracking actuals altogether. A clean P&L upload turns a 15-minute data-entry slog into a one-click prefill - and means your scenarios always reflect the most recent close.",
      healthyVsRisky: "Healthy: a single-page P&L export with the standard rows (Total Revenue, Total Expenses, Net Income) and no extra commentary. Worth watching: multi-tab Excel files, exports with hidden subtotals, or files larger than a few hundred KB - those usually need a quick tidy in your accounting tool before re-uploading.",
      whatToDoNext: "Re-export your P&L as CSV or Excel from your accounting system, then drop it here. You can replace it any time - the saved-scenario editor reads whatever the latest upload is.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "accounting_export",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 1,
    highFriction: false,
    priority: "standard",
  },
  dashboard_launcher: {
    id: "dashboard_launcher",
    title: "How decision flows fit your dashboard",
    body: {
      whatThisMeans: "Each tile launches a guided 4-step flow that runs against an existing model - it doesn't rewrite the model, it saves the result as a scenario you can compare and revisit any time.",
      whyItMatters: "Founders rarely sit down to 'rebuild the budget.' What actually happens is small, specific decisions: 'Should I add 5th grade?' 'Can we afford this lease?' 'What if re-enrollment misses by 10%?' Decision flows are scoped to those moments so you don't have to dig through the full wizard every time.",
      healthyVsRisky: "Healthy: you run a flow before the conversation, not after - so the board sees a number-backed answer, not a hunch. Worth watching: a model that hasn't been touched in 90+ days is almost certainly out of step with reality; the stale banner below will surface those for you.",
      whatToDoNext: "Pick the flow that matches your live question. If you don't have a base model yet, hit 'Start a school' first - decision flows need a model to layer on top of.",
    },
    audienceLevel: ["basics", "extra"],
    relatedSection: "dashboard_launcher",
    dismissible: true,
    autoExpandFor: ["basics"],
    order: 1,
    highFriction: false,
    priority: "standard",
  },
};

export function getExplainersForSection(section: string, level: GuidanceLevel): Explainer[] {
  return Object.values(EXPLAINERS)
    .filter((e) => e.relatedSection === section && e.audienceLevel.includes(level))
    .sort((a, b) => a.order - b.order);
}

