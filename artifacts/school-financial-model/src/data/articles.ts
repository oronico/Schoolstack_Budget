export type ArticleCategory = "Getting Started" | "School Finance 101" | "Accounting Literacy" | "For Lenders" | "School Types";

export interface Article {
  slug: string;
  title: string;
  description: string;
  category: ArticleCategory;
  publishedDate: string;
  readTimeMinutes: number;
  ogImage: string;
  content: string;
}

const DEFAULT_OG_IMAGE = "https://budget.schoolstack.ai/images/og-image.png?v=5";

export const ARTICLES: Article[] = [
  {
    slug: "complete-guide-to-school-budgeting",
    title: "The Complete Guide to School Budgeting",
    description: "Everything school founders need to know about creating a budget that keeps your school financially healthy - from enrollment projections to operating reserves.",
    category: "Getting Started",
    publishedDate: "2026-03-01",
    readTimeMinutes: 12,
    ogImage: DEFAULT_OG_IMAGE,
    content: `
## Why your school budget matters more than you think

A budget isn't just a spreadsheet exercise. For school founders, it's the document that tells you whether your mission is financially sustainable. It's what lenders and authorizers will use to decide whether to fund you. And it's the tool that helps you sleep at night - because you know what's coming.

The good news? You don't need a finance degree to build a solid school budget. You just need to think through a handful of important questions, and then put the numbers together in a way that tells a clear story.

## The building blocks of a school budget

Every school budget has the same basic structure, regardless of whether you're running a charter, a private school, a microschool, or a tutoring center:

- **Revenue** - How much money is coming in? From tuition, per-pupil funding, grants, donations, and other sources.
- **Staffing costs** - What you pay your people. This is almost always the largest line item.
- **Operating expenses** - Everything else: rent, curriculum, technology, insurance, marketing, and professional services.
- **Capital expenditures** - One-time or large purchases like furniture, equipment, or facility improvements.
- **Debt service** - If you have loans, what are the monthly payments?

## Start with enrollment - everything else follows

Your enrollment projection is the single most important assumption in your entire budget. Revenue depends on it. Staffing depends on it. Even your facility choice depends on it.

Here's how to think about it:

**Be honest with yourself.** If you're a brand-new school, your Year 1 enrollment will almost certainly be lower than you hope. That's normal. Plan for 60–75% of your building capacity in Year 1, and grow from there.

**Think in cohorts.** If you're opening with K–2 and adding a grade each year, map out exactly how many students you expect in each grade, each year. This gives you a much more accurate picture than a single enrollment number.

**Consider attrition.** Not every student who enrolls will stay. Budget for 5–10% attrition annually, depending on your school type and community.

## Revenue: know where every dollar comes from

Once you have enrollment, you can build your revenue model. The key revenue sources for most schools include:

**Tuition** - The most straightforward source. Know your rate, your expected enrollment, and be realistic about collection timing. Not every family pays on time, and some may need financial aid or payment plans.

**Per-pupil funding** (charter schools) - If you're a charter, your state provides a per-pupil allocation. This varies widely by state - from under $7,000 to over $15,000 per student. Know your state's rate and any weighted funding categories.

**Grants** - Federal grants (like Title I or CSP grants), state grants, and private foundation grants can provide significant revenue. But be careful: grant funding is often time-limited and shouldn't be relied on for ongoing operating costs.

**Donations and fundraising** - Many schools supplement revenue with annual fund drives, capital campaigns, or church/parish support. Be conservative in your projections here.

## Staffing: your biggest cost and most important investment

For most schools, staffing accounts for 50–65% of total expenses. Getting this right is critical.

**List every position you need** - teachers, assistant teachers, office staff, a principal or director, custodial support, and specialists. Don't forget the founder's salary - if you're working full-time, you need to be compensated.

**Use realistic salary numbers** - Research what schools in your area pay for each role. If you're in a competitive market, underpaying teachers makes it hard to hire and keep good people.

**Think in FTE** - Full-time equivalent. A half-time reading specialist is 0.5 FTE. This helps you compare staffing costs across different configurations.

**Include benefits** - Health insurance, payroll taxes, retirement contributions, and workers' comp can add 20–30% on top of base salaries. Don't skip this.

## Operating expenses: the details that matter

After staffing, your operating expenses include everything from rent to paper clips. The major categories to think through:

- **Facility costs** - Rent or mortgage, utilities, maintenance, insurance
- **Curriculum and instruction** - Textbooks, materials, software licenses, assessments
- **Technology** - Devices for students and staff, internet, IT support
- **Administration** - Office supplies, accounting, legal, HR services
- **Insurance** - General liability, property, directors & officers, student accident
- **Marketing** - Website, advertising, open house events, enrollment outreach
- **Professional development** - Training and conferences for staff
- **Transportation and food** - If your school provides these services

## The five-year view: why one year isn't enough

Lenders and authorizers want to see a multi-year projection - typically five years. This shows them that your school isn't just viable in Year 1, but that it can grow and sustain itself over time.

A five-year model helps you answer critical questions:

- When do you break even?
- How much cash do you need to get through the lean early years?
- What happens if enrollment is 20% lower than projected?
- Can you build a reserve fund over time?

## Common mistakes to avoid

**Being too optimistic about enrollment.** This is the most common mistake school founders make. Build in a conservative scenario and make sure you can survive it.

**Forgetting about cash timing.** Revenue doesn't always arrive when you need it. Per-pupil funding may come quarterly. Grants may reimburse after you've already spent the money. Build a cash flow projection, not just a profit/loss statement.

**Ignoring escalation.** Costs go up every year. Rent increases, salary raises, insurance premiums - if your budget stays flat while expenses grow 3–5% annually, you'll have a problem by Year 3.

**Not building a reserve.** Operating reserves are what keep your school alive when something unexpected happens. Aim for 60–90 days of operating expenses by Year 3–5.

## You don't have to do this alone

Building a school budget can feel overwhelming, but it doesn't have to be. Tools like SchoolStack Budget walk you through each step, provide benchmarks for your school type, and generate the professional financial documents that lenders and authorizers expect to see.

The most important thing is to start. Your numbers will get more refined as you go. And a clear financial plan is one of the most powerful things you can bring to your school's launch.
`,
  },
  {
    slug: "how-to-build-5-year-financial-model",
    title: "How to Build a 5-Year Financial Model for Your School",
    description: "A step-by-step walkthrough for creating a professional multi-year financial projection - the document lenders, authorizers, and board members need to see.",
    category: "Getting Started",
    publishedDate: "2026-03-05",
    readTimeMinutes: 10,
    ogImage: DEFAULT_OG_IMAGE,
    content: `
## What is a 5-year financial model?

A 5-year financial model is a structured projection of your school's finances across five years. It shows expected revenue, expenses, staffing costs, and cash position for each year - and tells the story of how your school grows from launch to sustainability.

This isn't guesswork. It's a disciplined exercise that forces you to think through every major financial assumption: How many students will you enroll? What will you charge? How many teachers will you hire? What will rent cost in Year 3?

## Why five years?

One year isn't enough. Lenders and authorizers need to see that your school can survive the early years (when enrollment is still ramping up) and reach financial stability. Five years is the standard because:

- Most schools don't break even until Year 2 or 3
- It takes time to build enrollment to capacity
- Lenders want to see that you can service debt over time
- It demonstrates that you've thought beyond the launch

## Step 1: Define your school profile

Before you touch any numbers, document the basics:

- **School type** - Charter, private, microschool, pod, co-op, or tutoring center
- **State** - Funding formulas and regulations vary significantly by state
- **Grade levels** - Which grades will you serve, and when will you add new ones?
- **Building capacity** - How many students can your facility hold at maximum?
- **Operating status** - Are you pre-launch, or already operating?

These details shape everything that follows. A charter school in Arizona has a completely different financial profile than a private school in Connecticut.

## Step 2: Project enrollment year by year

Map out expected enrollment for each year. Be specific:

- **Year 1:** Starting enrollment (be conservative - 60–75% of capacity)
- **Year 2–3:** Growth phase (add grades, fill existing seats)
- **Year 4–5:** Stabilization (approaching or at capacity)

Build in attrition - 5–10% of students may leave each year. And if you're adding grades over time, show exactly when each new grade opens.

## Step 3: Build your revenue model

With enrollment set, calculate revenue for each year:

- **Tuition revenue** = enrollment × tuition rate per student
- **Per-pupil funding** = enrollment × state allocation (charter schools)
- **Grants** = specific amounts with start and end dates
- **Fundraising** = conservative annual targets
- **Other income** = after-school programs, facility rentals, etc.

Apply annual increases where appropriate - tuition might increase 2–3% per year, and per-pupil funding often has an annual adjustment.

## Step 4: Plan your staffing

Staffing is typically 50–65% of your budget. For each year, list:

- Every position (title, FTE, salary)
- Benefits cost (typically 20–30% of salary)
- Any positions that phase in as enrollment grows

A common approach is ratio-based staffing: one teacher per 20 students, one admin per 100 students. As enrollment grows, your staffing grows with it - but in planned increments.

## Step 5: Estimate operating expenses

For each category, estimate monthly or annual costs and apply escalation:

- **Rent** - Often increases 2–3% per year per lease terms
- **Curriculum** - May scale with enrollment
- **Technology** - Per-student device costs plus infrastructure
- **Insurance** - Typically increases 5–8% annually
- **Marketing** - May decrease as enrollment stabilizes

Be thorough. Missing a category means your model understates expenses.

## Step 6: Add capital and debt

If you're taking out loans for a facility or equipment:

- Model the loan amount, interest rate, and term
- Calculate annual debt service (principal + interest)
- Show the debt declining over the five years

If you have major capital purchases, show them in the year they occur.

## Step 7: Calculate key metrics

With all the pieces in place, calculate the metrics that lenders and authorizers look for:

- **Net income** - Revenue minus all expenses, for each year
- **Net margin** - Net income as a percentage of revenue
- **Break-even enrollment** - The minimum number of students you need to cover expenses
- **Cash on hand** - How many days of expenses you can cover with available cash
- **Debt service coverage ratio (DSCR)** - Can you comfortably make your loan payments?
- **Staffing ratio** - What percentage of revenue goes to staffing?

## Step 8: Stress-test your assumptions

The best financial models aren't the optimistic ones - they're the ones that have already thought about what could go wrong.

Test scenarios like:

- Enrollment 20% below target
- A grant you were counting on doesn't come through
- Rent increases faster than expected
- You need to hire an additional teacher

If your school can survive the downside scenarios, your model is strong.

## Making it professional

A professional financial model includes:

- Clear assumptions documented on a summary page
- Year-over-year comparison tables
- Charts showing revenue vs. expense trends
- A cover page with school name and date
- Operating statement, balance sheet projections, and cash flow

Tools like SchoolStack Budget generate all of this automatically - including lender-ready PDFs and Excel workbooks with live formulas.
`,
  },
  {
    slug: "cash-vs-accrual-accounting-for-schools",
    title: "Cash vs. Accrual Accounting for Schools",
    description: "Understand the two main accounting methods, how they affect your financial reports, and which one makes sense for your school.",
    category: "School Finance 101",
    publishedDate: "2026-03-10",
    readTimeMinutes: 7,
    ogImage: DEFAULT_OG_IMAGE,
    content: `
## Two ways to count the same money

When you build a school budget, one of the first decisions you'll make is your accounting basis: cash or accrual. This choice affects how your financial statements look, when revenue and expenses show up in your reports, and how lenders and auditors evaluate your school's health.

Neither method is "better" - they just tell different parts of the story. Here's what you need to know.

## Cash basis: simple and intuitive

With cash-basis accounting, you record revenue when money actually hits your bank account, and you record expenses when you actually pay them.

**Example:** A family pays September tuition on October 5th. Under cash basis, that revenue shows up in October - because that's when the cash arrived.

**Advantages:**
- Easy to understand - your books match your bank statement
- Simpler bookkeeping for small schools
- You always know exactly how much cash you have
- Good for very small operations (under $1M in annual revenue)

**Limitations:**
- Doesn't show money you're owed but haven't received yet
- Can make your financial health look lumpy - a big grant arriving in one month inflates that month's revenue
- May not satisfy auditor or authorizer requirements for larger schools

## Accrual basis: the fuller picture

With accrual-basis accounting, you record revenue when it's earned (even if you haven't been paid yet) and expenses when they're incurred (even if you haven't written the check yet).

**Example:** That same September tuition? Under accrual basis, it shows up in September - because that's when the service was provided, regardless of when the payment arrived.

**Advantages:**
- Gives a more accurate picture of financial health at any given time
- Shows accounts receivable (money owed to you) and accounts payable (money you owe)
- Required for GAAP-compliant financial statements
- Expected by most lenders and charter authorizers
- Better for matching revenue to the periods when you actually deliver educational services

**Limitations:**
- More complex bookkeeping
- Requires tracking receivables and payables
- Revenue on paper doesn't mean cash in the bank - you still need to watch cash flow

## Which should your school use?

Here's a practical guide:

**Cash basis makes sense if:**
- You're a very small operation (homeschool co-op, tutoring center, small pod)
- You don't have outstanding receivables or payables
- You don't need audited financial statements
- Simplicity is your priority

**Accrual basis makes sense if:**
- You're a charter school (most authorizers require it)
- You plan to seek loans or significant grant funding
- You have more than about 50 students
- You want financial statements that lenders take seriously
- You plan to grow and want your books to scale with you

## How it affects your budget

When building your 5-year financial model, the accounting basis affects how you project revenue timing:

- **Cash basis** - Revenue shows up when payments are expected to arrive. If families pay monthly, your monthly revenue is spread across the year.
- **Accrual basis** - Revenue is allocated to the months when services are delivered, regardless of payment timing. Your operating statement reflects the economic activity of each period.

Most financial modeling tools, including SchoolStack Budget, let you choose your accounting basis and adjust the projections accordingly. This is important because a lender reviewing your model will want to see it presented on the same basis as your school's actual books.

## The key takeaway

Don't overthink this decision. If you're not sure, accrual basis is the safer choice - it's what lenders expect, what auditors prefer, and what gives the most accurate picture of your school's financial health. You can always work with your accountant to set up the right system for your bookkeeping.

What matters most is that your budget and your books use the same method consistently.
`,
  },
  {
    slug: "what-lenders-look-for-in-school-loan-application",
    title: "What Lenders Look For in a School Loan Application",
    description: "A practical guide to understanding how lenders evaluate school loan applications - and how to present your financial model in the strongest possible light.",
    category: "For Lenders",
    publishedDate: "2026-03-15",
    readTimeMinutes: 9,
    ogImage: DEFAULT_OG_IMAGE,
    content: `
## Lenders want to say yes - help them get there

Here's something school founders often don't realize: most lenders who specialize in school facilities or education loans actually want to fund your school. They believe in the mission. But they need to justify the decision with solid financial evidence.

Your job isn't to convince them your school is a good idea. Your job is to show them that the math works.

## The five things every lender evaluates

### 1. Enrollment assumptions and evidence

Lenders know that enrollment is your primary revenue driver. They'll scrutinize:

- **Are your projections realistic?** A brand-new school projecting 100% capacity in Year 1 raises eyebrows.
- **What's your evidence?** Letters of intent from families, waitlist data, community surveys, and demographic analysis all strengthen your case.
- **What's your growth plan?** Showing a thoughtful ramp-up (starting at 60–75% capacity) signals maturity.
- **What's your attrition assumption?** If you assume zero attrition, that's a concern.

### 2. Revenue diversity and stability

Lenders feel more comfortable when your revenue comes from multiple sources:

- Tuition or per-pupil funding as the foundation
- Grants as supplementary (but not relied upon for debt service)
- Fundraising as a bonus, not a requirement

They'll pay special attention to how much of your loan payment depends on revenue you haven't yet secured.

### 3. Staffing ratio and cost control

A school spending 75% of revenue on staffing has very little room for error. Lenders look for:

- **Staffing costs at 50–65% of revenue** - the healthy range for most school types
- **A plan to hire incrementally** - adding staff as enrollment grows, not all upfront
- **Competitive but reasonable salaries** - underpaying leads to turnover; overpaying strains the budget

### 4. Debt service coverage ratio (DSCR)

This is the single most important metric for lenders. DSCR measures whether your school generates enough cash to cover loan payments:

**DSCR = Net Operating Income ÷ Annual Debt Service**

- **1.0x** means you're making exactly enough to cover payments - no cushion
- **1.2x** is the minimum most lenders require
- **1.5x or higher** makes lenders comfortable

If your DSCR drops below 1.0x in any projected year, that's a significant concern. Make sure your model shows a healthy DSCR even in conservative scenarios.

### 5. Cash reserves and liquidity

Lenders want to know you have a financial cushion:

- **How many days of operating expenses can you cover with cash on hand?**
- **Do you project building reserves over time?** A school with 90 days of cash by Year 3 is in much better shape than one running month-to-month.
- **What happens if a grant is delayed or a payment is late?** Your cash position should be able to absorb short-term disruptions.

## What your loan package should include

A strong loan application tells a complete financial story. At minimum, include:

- **Executive summary** - Your school's mission, location, structure, and funding request
- **5-year financial projections** - Revenue, expenses, and cash flow for each year
- **Enrollment plan** - Year-by-year enrollment with supporting evidence
- **Staffing plan** - Every position, with FTE and compensation
- **Assumptions page** - Every major assumption documented and justified
- **Sensitivity analysis** - What happens if enrollment is 10–20% below target?
- **Balance sheet projection** - Assets, liabilities, and equity over time

## Common mistakes that weaken your application

**No sensitivity analysis.** If you only show the optimistic case, lenders will wonder what happens when things don't go perfectly. Always include a downside scenario.

**Unexplained assumptions.** Every major number in your model should have a brief justification. "Tuition: $12,000/year based on market survey of comparable schools in the area" is much stronger than an unexplained number.

**Inconsistent numbers.** If your staffing plan shows 12 teachers but your expense model only budgets for 10, that's a credibility problem. Make sure every section of your model tells the same story.

**Missing the founder's salary.** Lenders notice when the founder isn't paying themselves. It raises questions about long-term sustainability.

## How SchoolStack Budget helps

SchoolStack Budget generates a complete Lender Conversation Snapshot with all the components above - including formatted PDFs, a 23-tab Founder Planning Workbook with live Excel formulas, and a Board and Funder Summary. The platform also calculates DSCR, break-even enrollment, and cash reserves automatically, so you can see exactly what a lender will see before you submit your application.
`,
  },
  {
    slug: "charter-school-funding-models-explained",
    title: "Charter School Funding Models Explained",
    description: "How charter school funding works across different states - per-pupil allocations, weighted funding, federal grants, and what it all means for your budget.",
    category: "School Finance 101",
    publishedDate: "2026-03-20",
    readTimeMinutes: 8,
    ogImage: DEFAULT_OG_IMAGE,
    content: `
## Charter school funding 101

If you're starting a charter school, understanding your funding model is essential. Unlike private schools that rely on tuition, charter schools are publicly funded - meaning your revenue comes primarily from government allocations based on how many students you enroll.

But "publicly funded" doesn't mean simple. Charter funding varies dramatically by state, and the details matter.

## Per-pupil funding: the foundation

The core of charter school revenue is per-pupil funding - a dollar amount the state provides for each student enrolled in your school.

This amount varies widely:

- **Low end:** States like Idaho and Utah may provide under $7,500 per student
- **Mid range:** States like Ohio and Texas typically provide $8,000–$10,000
- **High end:** States like New York and New Jersey can exceed $15,000 per student

Your per-pupil amount depends on your state's funding formula, and in many states, it also depends on your district, grade levels, and student demographics.

## Weighted funding: not all students fund equally

Many states use weighted funding formulas that provide additional dollars for students with specific needs:

- **Special education** - Students with IEPs typically generate 1.5x–3x the base per-pupil amount
- **English language learners** - Additional funding for ELL students, typically 10–25% above base
- **Free and reduced lunch** - Students from low-income families may generate additional Title I or state compensatory funding
- **Gifted education** - Some states provide supplemental funding for identified gifted students

When building your budget, it's important to estimate the demographics of your student population and factor in weighted funding where applicable.

## Federal funding sources

In addition to state per-pupil funding, charter schools may be eligible for several federal programs:

**Title I** - Provides additional funding for schools with high percentages of students from low-income families. The amount depends on your district's allocation and your school's qualifying percentage.

**Title II** - Supports teacher quality and professional development. Typically a smaller amount per school.

**IDEA (Part B)** - Federal special education funding that flows through your state and district. Charter schools are entitled to a proportional share.

**Charter School Program (CSP) grants** - Federal startup grants specifically for new charter schools. These are competitive and time-limited (typically 3 years), but can provide significant startup capital - sometimes $500,000 or more.

**ESSER / pandemic relief** - While most of these funds have been allocated, some may still be available in certain states.

## What charter schools don't get

It's equally important to understand what charter schools typically don't receive:

- **Facilities funding** - Most states don't provide facilities funding to charter schools, meaning you need to cover rent or mortgage from your operating budget
- **Bond authority** - Unlike districts, most charter schools can't issue tax-exempt bonds
- **Local levy revenue** - In many states, charter schools don't receive a share of local property tax revenue

This is why facility costs are often the biggest financial challenge for charter schools - and why your budget needs to account for them carefully.

## Building your charter budget

When building a charter school financial model:

1. **Know your state's base per-pupil amount.** SchoolStack Budget pre-fills this for your state.
2. **Estimate weighted funding.** Based on your expected student demographics.
3. **Identify federal grants.** Talk to your authorizer about Title I, Title II, and IDEA eligibility.
4. **Apply for CSP grants if eligible.** But don't build your base budget around them.
5. **Plan for facility costs.** Budget 15–20% of revenue for facility costs, including rent, utilities, and maintenance.
6. **Build reserves.** Charter schools face unique political and funding risks. Strong reserves protect you.

## Cash flow timing matters

One challenge unique to charter schools: funding doesn't arrive evenly throughout the year. Some states pay monthly, others quarterly, and some have significant delays at the start of the school year.

Your financial model should include a cash flow projection that accounts for this timing. You may need a line of credit or startup cash to bridge the gap between when expenses start and when funding arrives.

## The bottom line

Charter school funding is complex, but it's knowable. The most important thing is to research your specific state's formula, be conservative in your enrollment projections, and build a model that shows you can sustain operations even if funding is delayed or enrollment falls short.
`,
  },
  {
    slug: "how-to-calculate-break-even-enrollment",
    title: "How to Calculate Your School's Break-Even Enrollment",
    description: "Learn how to find the minimum number of students your school needs to cover its costs - and why this number should be at the center of your financial planning.",
    category: "School Finance 101",
    publishedDate: "2026-03-25",
    readTimeMinutes: 6,
    ogImage: DEFAULT_OG_IMAGE,
    content: `
## What is break-even enrollment?

Break-even enrollment is the minimum number of students your school needs to cover all of its expenses - staffing, rent, curriculum, insurance, debt service, everything. Below this number, you're losing money. Above it, you're generating a surplus.

This is one of the most important numbers in your entire financial plan. It tells you how much enrollment risk you're carrying and whether your school can survive a slower-than-expected start.

## The basic formula

At its simplest:

**Break-even enrollment = Total annual expenses ÷ Revenue per student**

If your school has $800,000 in total annual expenses and generates $10,000 in revenue per student, your break-even is 80 students.

But in practice, it's a bit more nuanced.

## Why the simple formula isn't quite enough

The challenge is that not all expenses are fixed, and not all revenue comes from per-student sources:

**Fixed costs** don't change with enrollment:
- Rent or mortgage payments
- Principal/director salary
- Insurance premiums
- Core administrative staff
- Base technology infrastructure

**Variable costs** scale with enrollment:
- Teacher salaries (if you're adding teachers as enrollment grows)
- Per-student curriculum and supplies
- Student meals and transportation
- Assessment costs

**Non-enrollment revenue** doesn't scale with student count:
- Fixed grants (a $50,000 grant is $50,000 regardless of enrollment)
- Facility rental income
- Fixed fundraising commitments

## A more accurate approach

To get a more precise break-even number:

1. **Calculate total fixed costs** - everything you'd pay even with zero students (though some of these are only relevant once you're operational)
2. **Calculate variable cost per student** - the additional cost of each student beyond your fixed base
3. **Calculate net revenue per student** - revenue per student minus variable cost per student

**Break-even = Fixed costs ÷ Net revenue per student**

### Example

- Fixed costs: $450,000/year (rent, admin salaries, insurance, base operations)
- Revenue per student: $10,000 (tuition or per-pupil funding)
- Variable cost per student: $2,000 (curriculum, supplies, additional staffing)
- Net revenue per student: $8,000

**Break-even = $450,000 ÷ $8,000 = 57 students**

## What your break-even number tells you

Once you know your break-even enrollment, compare it to your projected enrollment and your building capacity:

- **Break-even at 40% of capacity?** You have a strong margin of safety. Even with slow enrollment growth, you'll be fine.
- **Break-even at 70% of capacity?** Manageable, but you need solid enrollment marketing and should have cash reserves for the ramp-up period.
- **Break-even at 90%+ of capacity?** This is tight. A small enrollment shortfall could mean operating at a loss. Consider whether you can reduce fixed costs or increase revenue per student.

## Using break-even for scenario planning

Break-even is especially useful for stress-testing your model:

- What if enrollment is 20% below target? Are you above or below break-even?
- What if you lose a grant? How does that change the break-even number?
- What if rent increases? Does your break-even shift significantly?

Running these scenarios helps you understand where your biggest financial risks are - and what you can do to mitigate them.

## Track it across all five years

Your break-even changes each year as your cost structure evolves:

- **Year 1:** Break-even is highest relative to capacity (lots of fixed startup costs, lower enrollment)
- **Year 2–3:** Break-even typically improves as enrollment grows faster than fixed costs
- **Year 4–5:** Break-even stabilizes as your school reaches steady state

SchoolStack Budget calculates your break-even enrollment automatically for each year of your projection, so you can see exactly where you stand.

## The confidence it gives you

Knowing your break-even enrollment gives you confidence in conversations with lenders, board members, and your own team. It lets you answer the question: "How many students do we need to make this work?" with a specific, well-supported number.

And it helps you plan with eyes wide open - which is exactly what your school deserves.
`,
  },
  {
    slug: "understanding-operating-reserves-for-schools",
    title: "Understanding Operating Reserves for Schools",
    description: "What operating reserves are, why they matter, and how to build them into your school's financial plan from the start.",
    category: "School Finance 101",
    publishedDate: "2026-04-01",
    readTimeMinutes: 7,
    ogImage: DEFAULT_OG_IMAGE,
    content: `
## What are operating reserves?

Operating reserves are the savings your school keeps on hand to cover unexpected expenses or revenue shortfalls. Think of them as your school's financial cushion - the safety net that keeps you operating when something doesn't go as planned.

Reserves are typically expressed in "days of operating expenses" - how many days your school could continue operating using only its cash reserves, with no new revenue coming in.

## Why reserves matter so much

Schools face all kinds of financial surprises:

- A grant you were counting on gets delayed by three months
- Enrollment comes in 15% below projections
- Your building needs an unexpected repair
- A key donor doesn't renew their annual gift
- Insurance premiums increase more than expected

Without reserves, any of these situations could force difficult decisions - cutting programs, delaying payroll, or worse. With adequate reserves, you can absorb the hit and keep your focus on educating students.

## How much is enough?

There's no single "right" answer, but here are widely accepted benchmarks:

- **30 days** - The absolute minimum. Enough to handle minor disruptions.
- **60 days** - A reasonable target for schools in their first 2–3 years of operation.
- **90 days** - The standard recommendation for established schools. This is what most financial advisors and authorizers consider healthy.
- **120+ days** - Excellent. Provides significant flexibility for strategic investments or weathering major disruptions.

For context, 90 days of operating reserves for a school with $1 million in annual expenses means keeping about $247,000 in accessible cash.

## How to calculate your reserves

The formula is straightforward:

**Days of reserves = (Cash + liquid investments) ÷ (Annual operating expenses ÷ 365)**

If you have $150,000 in cash and your annual operating expenses are $900,000:

**Days = $150,000 ÷ ($900,000 ÷ 365) = $150,000 ÷ $2,466 = 61 days**

## Building reserves into your financial model

The best time to plan for reserves is before your school opens - during the financial modeling phase. Here's how:

**Year 1:** Don't expect to build significant reserves in your first year. You may even operate at a small deficit as enrollment ramps up. That's okay.

**Year 2–3:** As enrollment grows and revenue stabilizes, your budget should show a net surplus each year. That surplus goes toward building reserves.

**Year 3–5:** By Year 3, you should be targeting 60 days of reserves. By Year 5, aim for 90 days.

**In your model:** Show a line item for "contribution to reserves" or "net surplus to cash reserves" that clearly demonstrates the path from startup to financial stability.

## Where to keep your reserves

Reserves should be liquid - meaning easily accessible when you need them. Good options include:

- High-yield savings accounts
- Money market accounts
- Short-term Treasury bills or CDs (for the portion you won't need immediately)

Avoid tying reserves up in investments that are hard to access quickly or that could lose value.

## Reserves and lender confidence

When lenders evaluate your school, reserves are one of the first things they look at. A school with 90 days of reserves demonstrates:

- Financial discipline and planning
- Ability to weather disruptions
- Lower risk of default on loan payments
- Mature financial management

Conversely, a school with no reserves (or a plan that never builds them) signals higher risk.

## Common misconceptions

**"We can't afford reserves - every dollar needs to go to students."** Building reserves doesn't mean shortchanging students. It means protecting the school's ability to serve students over the long term. A school that runs out of cash can't serve anyone.

**"Reserves are just savings we're not using."** Reserves aren't idle money. They're working capital that gives you the flexibility to make good decisions under pressure instead of desperate ones.

**"We'll build reserves later."** If your financial model doesn't show a clear path to adequate reserves, lenders and authorizers will notice. Plan for it from the start.

## Getting started

When you build your financial model in SchoolStack Budget, the platform tracks your projected cash position across all five years and calculates your days of reserves automatically. You can see exactly when you'll reach 30, 60, and 90 days - and adjust your plan if the timeline isn't where you want it.

Building reserves isn't glamorous. But it's one of the most important things you can do to make sure your school is still serving students five, ten, and twenty years from now.
`,
  },
  {
    slug: "starting-a-microschool-financial-planning",
    title: "Starting a Microschool: Financial Planning Essentials",
    description: "A financial planning guide specifically for microschool founders - from setting tuition to managing costs in a small-scale learning environment.",
    category: "School Types",
    publishedDate: "2026-04-05",
    readTimeMinutes: 8,
    ogImage: DEFAULT_OG_IMAGE,
    content: `
## The microschool financial model is different

Microschools are small by design - typically serving 10–50 students in a home, community space, or small commercial facility. This intentional smallness is their strength: personalized learning, close-knit community, and flexibility that larger schools can't match.

But it also means the financial model looks different. With fewer students, every enrollment decision, every expense line, and every pricing choice carries more weight. A microschool with 25 students that loses 5 of them has lost 20% of its revenue. That same loss at a 500-student school is 1%.

Understanding these dynamics is essential to building a microschool that's both mission-driven and financially sustainable.

## Setting tuition: the core question

For most microschools, tuition is the primary (and often only) revenue source. Getting the price right means balancing several factors:

**What families in your community can afford.** Research what other schools and learning programs in your area charge. What do local private schools charge? What do tutoring centers and enrichment programs cost?

**What you need to cover your costs.** Work backwards from your expenses: if your total costs are $200,000/year and you plan to serve 20 students, you need at least $10,000 per student just to break even.

**What the market values.** Small class sizes, personalized attention, and flexible scheduling are valuable. Don't underprice yourself out of a sense of modesty - parents who choose a microschool are choosing quality, and they're often willing to pay for it.

**Typical ranges:** Microschool tuition varies widely, from $5,000–$8,000/year for co-op models to $15,000–$25,000/year for full-service private microschools in competitive markets.

## Revenue beyond tuition

While tuition is the foundation, explore additional revenue sources:

- **Education Savings Accounts (ESAs)** - In states with ESA programs (Arizona, Florida, West Virginia, and others), families can use state-funded accounts to pay microschool tuition. This can significantly expand your accessible market.
- **Scholarships and financial aid** - Offering scholarships funded by donations helps serve a broader range of families and strengthens your mission.
- **After-school or enrichment programs** - Additional programs can generate supplementary revenue and serve the community.
- **Summer camps** - Using your space and team for summer programming generates revenue during months when tuition income may be lower.

## Staffing: lean but not too lean

In a microschool, staffing is typically the single largest expense - often 60–70% of total costs. The key roles:

**Lead teacher / learning guide** - The heart of the operation. Compensation should be competitive enough to attract and retain excellent educators. For a full-time lead, budget $45,000–$75,000 depending on your market.

**Assistant or co-teacher** - As enrollment grows past 15–20 students, you'll likely need a second educator. This can start as part-time.

**The founder** - If you're running the school full-time, you need to pay yourself. Budget a realistic salary from Year 1 - even if it's modest. Your long-term sustainability depends on not burning out.

**Administrative support** - Bookkeeping, enrollment management, and communications take time. This might be contracted or part-time to start.

## Facility costs: think creatively

One advantage of microschools is flexibility in facilities:

- **Home-based** - Lowest cost, but check local zoning and licensing requirements
- **Church or community center space** - Often available at below-market rates
- **Shared commercial space** - Co-working for education; becoming more common
- **Small commercial lease** - More expensive, but provides stability and room to grow

Budget 10–20% of revenue for facility costs, including rent, utilities, and any required modifications for educational use.

## The microschool P&L: a realistic example

Here's what a typical Year 1 might look like for a microschool serving 20 students at $12,000/year tuition:

**Revenue:**
- Tuition: $240,000
- ESA payments (5 students): $30,000
- Total: $270,000

**Expenses:**
- Lead teacher: $55,000
- Assistant teacher (part-time): $25,000
- Founder salary: $50,000
- Benefits/payroll taxes: $32,500
- Rent: $24,000
- Curriculum & materials: $10,000
- Technology: $8,000
- Insurance: $6,000
- Marketing: $5,000
- Admin & supplies: $8,000
- Total: $223,500

**Net surplus: $46,500** (to build reserves and invest in Year 2 growth)

## Planning for growth (or intentional stability)

Not every microschool wants to grow. That's perfectly fine. But your financial model should reflect your intention:

**If you plan to grow:** Show how you'll add students and staff over 5 years. What's your enrollment target? When do you add a second classroom or location?

**If you plan to stay small:** Show how your finances stabilize at your target size. Can you build adequate reserves? Can you give raises over time? Is the model sustainable at this scale for 10+ years?

Either path is valid - what matters is that you've thought it through.

## The tools are the same

Whether you're building a 500-student charter school or a 15-student microschool, the financial planning process is the same: project enrollment, model revenue, plan staffing, estimate expenses, and see if the numbers work.

SchoolStack Budget supports microschool models out of the box - including microschool-specific benchmarks and guidance throughout the planning process.

The most important step? Start. Open the tool, enter what you know, and let the platform help you fill in the rest. Your microschool deserves a clear financial plan - and building one is easier than you think.
`,
  },
  {
    slug: "financial-statements-101",
    title: "Financial Statements 101 for School Founders",
    description: "The three reports your bookkeeper produces every month - P&L, Balance Sheet, Cash Flow Statement - explained in plain English with one worked example each.",
    category: "Accounting Literacy",
    publishedDate: "2026-04-29",
    readTimeMinutes: 8,
    ogImage: DEFAULT_OG_IMAGE,
    content: `
## Three reports, one school

Your school's books produce three financial statements every month. They look intimidating in a board handout, but each one answers a single question:

- **The P&L** - Did we make or lose money this month?
- **The Balance Sheet** - What do we own and owe right now?
- **The Cash Flow Statement** - Why did our bank balance change?

Once you can read them, you can talk to a banker, a board treasurer, or an authorizer without flinching. Here's how each one works, with a worked example from one school.

Throughout this primer, we'll use the same school: **Riverbend Academy**, a 120-student K-5 charter, fictional but built on numbers similar to what the SchoolStack Budget wizard would produce in Year 1.

## 1. The Profit & Loss Statement (P&L)

**One-sentence definition:** The P&L lists every dollar of revenue you earned and every dollar of expense you incurred over a period (usually a month or a year), and shows what's left at the bottom.

It's also called the **Income Statement** or, for nonprofits, the **Statement of Activities**. They are the same report under different names.

### How a P&L is structured

A P&L runs top to bottom in roughly this order:

1. **Revenue** - Tuition, per-pupil funding, grants, fundraising, fees
2. **Personnel costs** - Salaries, payroll taxes, benefits
3. **Program costs** - Curriculum, materials, technology, professional development
4. **Facility costs** - Rent or mortgage interest, utilities, insurance
5. **Administrative costs** - Office supplies, accounting, legal, marketing
6. **= Net Income** (or "change in net assets" for nonprofits)

Each line is **time-bounded**: it covers exactly the period the report says it covers. A "September P&L" only includes September's revenue and September's expenses.

### A worked example: Riverbend Academy, September

| Line | Amount |
|---|---|
| Per-pupil funding revenue | $128,000 |
| Tuition fees revenue | $4,200 |
| **Total revenue** | **$132,200** |
| Salaries & wages | $78,000 |
| Payroll taxes & benefits | $19,500 |
| Curriculum & supplies | $6,200 |
| Rent | $11,000 |
| Utilities, insurance, office | $4,800 |
| **Total expenses** | **$119,500** |
| **Net Income** | **$12,700** |

Riverbend ran a $12,700 surplus in September. That's not the same as having $12,700 more in the bank - we'll get to that in the cash flow section - but it does mean the school's economic activity for the month was positive.

### What to ask your bookkeeper for

Ask for "the P&L for the month, and a year-to-date P&L next to it" - usually as a Budget vs. Actual report. Two columns of actuals (this month, year-to-date) and two columns of budget (this month, year-to-date), with variance columns next to each.

## 2. The Balance Sheet

**One-sentence definition:** The Balance Sheet is a snapshot, on a single day, of what your school owns (assets), what it owes (liabilities), and what's left over for the school itself (equity, or "net assets" in nonprofit terms).

The defining identity of the balance sheet is:

> **Assets = Liabilities + Equity**

It always balances. If it doesn't, the books are wrong.

### How a Balance Sheet is structured

Three sections:

1. **Assets** - Cash, accounts receivable (money owed to you), prepaid expenses, equipment, buildings
2. **Liabilities** - Accounts payable (bills you owe), payroll due, loans, deferred tuition revenue
3. **Equity / Net Assets** - Money the founders contributed, plus accumulated surpluses (or losses) since the school opened

Unlike the P&L, the balance sheet is **point-in-time**: it shows exactly what was true at midnight on the date of the report.

### A worked example: Riverbend Academy, September 30

**Assets**
| Line | Amount |
|---|---|
| Cash in bank | $185,000 |
| Tuition receivable | $8,400 |
| Prepaid insurance | $3,200 |
| Furniture & equipment (net) | $42,000 |
| **Total assets** | **$238,600** |

**Liabilities**
| Line | Amount |
|---|---|
| Accounts payable | $14,300 |
| Payroll & benefits payable | $9,800 |
| Equipment loan (long-term portion) | $28,000 |
| **Total liabilities** | **$52,100** |

**Equity / Net Assets**
| Line | Amount |
|---|---|
| Founder contributions | $150,000 |
| Retained earnings (cumulative surplus) | $36,500 |
| **Total equity** | **$186,500** |

**Total liabilities + equity = $238,600 ✓** (matches total assets)

Riverbend has $185,000 of cash, owes $52,100, and has built up $36,500 of cumulative surplus on top of the founder's original $150,000 contribution. A lender looking at this would feel comfortable: cash is more than 3x liabilities, and equity is growing.

### What to ask your bookkeeper for

Ask for "the balance sheet as of the last day of the month, with comparative columns for the same date one year ago." That comparison shows whether the school is building or burning equity over time, which is what board members and lenders actually care about.

## 3. The Cash Flow Statement

**One-sentence definition:** The Cash Flow Statement explains *why* your bank balance went up or down over a period - the bridge between the P&L's net income and the actual cash you ended up with.

This is the report most founders find counterintuitive at first. You earned a $12,700 surplus on the P&L - so why does your bank balance look basically flat?

The cash flow statement answers exactly that question.

### How a Cash Flow Statement is structured

Three sections, always in the same order:

1. **Operating activities** - Cash from running the school day-to-day. Starts with net income, then adjusts for non-cash items (depreciation) and timing of receivables and payables.
2. **Investing activities** - Cash spent on or received from long-term assets (equipment purchases, sale of property)
3. **Financing activities** - Cash from loans, debt repayment, founder contributions, distributions

Each section ends with a subtotal, and the three subtotals together equal the change in cash for the period.

### A worked example: Riverbend Academy, September

**Operating activities**
| Line | Amount |
|---|---|
| Net income (from P&L) | $12,700 |
| Add: depreciation (non-cash expense) | $700 |
| Less: increase in tuition receivable | ($2,400) |
| Add: increase in accounts payable | $3,100 |
| **Cash from operations** | **$14,100** |

**Investing activities**
| Line | Amount |
|---|---|
| Purchase of classroom technology | ($8,500) |
| **Cash from investing** | **($8,500)** |

**Financing activities**
| Line | Amount |
|---|---|
| Equipment loan principal repayment | ($1,200) |
| **Cash from financing** | **($1,200)** |

**Net change in cash:** $14,100 - $8,500 - $1,200 = **$4,400**

So Riverbend's $12,700 surplus on the P&L only translated to $4,400 of new cash - the rest got spent on Chromebooks and ate into receivables and the loan principal. This is exactly why founders need both reports: the P&L tells you whether the school is *economically* viable, and the cash flow statement tells you whether it can pay next month's rent.

### What to ask your bookkeeper for

Most accounting systems can produce the cash flow statement automatically. Ask for "the cash flow statement using the indirect method, monthly and year-to-date." If your bookkeeper can't produce one, that's a sign the chart of accounts may need cleanup before you next apply for a loan.

## Putting it together

The three statements form a closed loop:

1. The **P&L** shows the period's net income.
2. That net income flows into **retained earnings** on the **Balance Sheet**, increasing equity.
3. The **Cash Flow Statement** explains the gap between that net income and the actual change in cash on the balance sheet.

Once you can hold all three in your head, "what's the school's financial health" becomes a question you can actually answer. You'll know which one a lender is looking at when they ask about coverage. You'll know which one a board member is looking at when they ask about reserves. And you'll know which one to bring up first when something feels off.

That's what financial literacy buys you: the ability to steer with the same instruments your banker, your board, and your authorizer use.
`,
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function getArticlesByCategory(category: ArticleCategory): Article[] {
  return ARTICLES.filter((a) => a.category === category);
}

export const CATEGORIES: ArticleCategory[] = [
  "Getting Started",
  "School Finance 101",
  "Accounting Literacy",
  "For Lenders",
  "School Types",
];
