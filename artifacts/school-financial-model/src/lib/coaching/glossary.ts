import type { SchoolTypeTrack } from "./explainers";

export interface GlossaryEntry {
  term: string;
  short: string;
  long?: string;
  applicableTo?: SchoolTypeTrack[];
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  fte: {
    term: "FTE",
    short: "Full-Time Equivalent - a way to measure staffing. 1.0 FTE = one full-time position; 0.5 FTE = half-time.",
    long: "FTE lets you compare staffing across roles regardless of hours. Two half-time teachers (0.5 each) equal one FTE. Most schools budget 1.0 FTE for 40 hours/week over the contract year.",
  },
  dscr: {
    term: "DSCR",
    short: "Debt Service Coverage Ratio - how comfortably your school can cover its loan payments from operating income.",
    long: "Calculated as net operating income divided by annual debt payments. A DSCR of 1.25 means you earn $1.25 for every $1.00 of debt owed. Most lenders look for at least 1.20.",
  },
  cola: {
    term: "COLA",
    short: "Cost of Living Adjustment - the annual percentage increase applied to salaries to keep pace with inflation.",
    long: "Typically 2-4% per year. At 3%, a $50,000 salary becomes $51,500 in Year 2. Set COLA at or above your general inflation rate - if inflation outpaces COLA, your staff effectively takes a pay cut every year.",
  },
  ffe: {
    term: "FF&E",
    short: "Furniture, Fixtures & Equipment - desks, chairs, whiteboards, playground equipment, and other physical items your school needs.",
    long: "FF&E is usually a one-time startup cost or a periodic replacement cost. New schools typically budget $500–$1,500 per student for initial FF&E.",
  },
  adm: {
    term: "ADM",
    short: "Average Daily Membership - the average number of students enrolled each day, used to calculate state funding for charter schools.",
    long: "ADM counts enrolled students whether or not they attend on a given day. Some states use ADM as the basis for per-pupil funding. It's usually higher than ADA.",
    applicableTo: ["charter"],
  },
  ada: {
    term: "ADA",
    short: "Average Daily Attendance - the average number of students actually present each day. Some states base funding on ADA rather than ADM.",
    long: "ADA is always less than or equal to ADM because it only counts students who show up. If your state funds on ADA, a 95% attendance rate means you receive 95% of the per-pupil amount.",
    applicableTo: ["charter"],
  },
  nnn: {
    term: "NNN",
    short: "Triple Net Lease - a lease where the tenant pays rent plus property taxes, insurance, and maintenance costs on top.",
    long: "NNN leases are common for school facilities. Make sure to budget the 'triple net' costs separately - they can add 20–40% on top of base rent.",
  },
  tuition_offsets: {
    term: "Tuition Offsets",
    short: "Reductions to gross tuition revenue - scholarships, financial aid, sibling discounts, and other fee waivers.",
    long: "Tuition offsets reduce the total tuition you actually collect. If you charge $10,000 tuition but offer an average $1,000 discount, your net tuition per student is $9,000. Budget these realistically.",
    applicableTo: ["private"],
  },
  accounts_receivable: {
    term: "Accounts Receivable",
    short: "Money families or funders owe you that you haven't collected yet - tuition payments due, grant reimbursements pending, etc.",
  },
  accounts_payable: {
    term: "Accounts Payable",
    short: "Bills your school owes but hasn't paid yet - vendor invoices, contractor payments, utility bills awaiting payment.",
  },
  fixed_assets: {
    term: "Fixed Assets",
    short: "Long-term physical property your school owns - buildings, vehicles, large equipment. These appear on your balance sheet.",
  },
  leasehold_improvements: {
    term: "Leasehold Improvements",
    short: "Upgrades you make to a rented space - classroom buildouts, plumbing, HVAC, or ADA modifications. These are capitalized and depreciated over time.",
    long: "Leasehold improvements typically can't be taken with you if you move. They're depreciated over the shorter of the useful life or the remaining lease term.",
  },
  depreciation: {
    term: "Depreciation",
    short: "Spreading the cost of a big purchase (like equipment or a buildout) across multiple years instead of expensing it all at once.",
    long: "Depreciation is a non-cash expense that reduces your reported income but doesn't affect your cash flow. A $50,000 buildout depreciated over 10 years adds $5,000/year to expenses.",
  },
  net_margin: {
    term: "Net Margin",
    short: "The percentage of revenue left over after all expenses. A 5% net margin on $1M in revenue means $50,000 in surplus.",
    long: "For nonprofits, this is often called 'change in net assets.' Healthy school budgets typically target 3–8% net margin. Below 0% means you're spending more than you earn.",
  },
  reserve_months: {
    term: "Reserve Months",
    short: "How many months your school could keep operating using only its cash reserves, with no new revenue coming in.",
    long: "Calculated as cash on hand divided by average monthly expenses. Most school finance experts recommend at least 2–3 months of reserves. Lenders typically want to see 60–90 days.",
  },
  cash_trough: {
    term: "Cash Trough",
    short: "The lowest point your cash balance hits during the year - usually in summer when tuition isn't coming in but bills keep going out.",
    long: "Identifying your cash trough helps you plan for bridge financing or adjust payment timing. If your trough goes negative, you'll need a line of credit or reserves to cover the gap.",
  },
  escalation_rate: {
    term: "Escalation Rate",
    short: "The annual percentage increase applied to costs like rent, supplies, or insurance to account for inflation over your forecast period.",
  },
  collection_rate: {
    term: "Collection Rate",
    short: "The percentage of billed tuition or fees you actually collect. A 95% collection rate means 5% goes unpaid.",
    long: "Even schools with strong collection processes typically see 2–5% uncollected. Factor this into your revenue projections to avoid overestimating income.",
  },
  payroll_tax: {
    term: "Payroll Tax",
    short: "Employer-side taxes on wages - Social Security (6.2%), Medicare (1.45%), FUTA, and state unemployment tax. The rate is auto-populated based on your school's state and typically ranges from 8–12% of salary.",
    long: "This rate is automatically set based on the state you selected in your School Details, using new-employer SUTA rates plus any mandatory state employer taxes (like disability insurance or paid family leave). You can see the full breakdown on the Assumptions step. Your actual rate may differ once you establish an experience rating with your state — you can override it anytime.",
  },
  per_pupil: {
    term: "Per-Pupil Funding",
    short: "The dollar amount a school receives from public sources for each enrolled student. Varies widely by state.",
    long: "Per-pupil funding ranges from about $6,000 to over $20,000 depending on the state and district. Charter schools typically receive 70–95% of what traditional public schools get.",
    applicableTo: ["charter"],
  },
  benefits_rate: {
    term: "Benefits Rate",
    short: "The percentage of salary allocated for employee benefits - health insurance, retirement contributions, and other perks.",
    long: "Typical school benefits rates range from 15–30% of salary. This is on top of payroll taxes. A teacher earning $50,000 with 20% benefits adds $10,000 in benefit costs.",
  },
  chart_of_accounts: {
    term: "Chart of Accounts",
    short: "The list of every income and expense category your bookkeeper uses - the labels behind every line on your Profit & Loss.",
    long: "When we map your accounting system, we look at this list and decide which accounts feed Revenue, which feed Expenses, and which feed Rent. If your bookkeeper renames an account, the mapping breaks until you re-tag it.",
  },
  pl_statement: {
    term: "P&L Statement",
    short: "Profit & Loss statement - a one-page summary of revenue, expenses, and net income over a period of time.",
    long: "Also called the Income Statement. Most accounting systems can export it as CSV or Excel in two clicks. We read the totals from this report to suggest 'actuals' on saved scenarios so you don't re-type numbers your books already have.",
  },
  actuals: {
    term: "Actuals",
    short: "The real numbers that came in - what actually happened - as opposed to the 'projected' numbers in your model.",
    long: "Tracking actuals next to projections is how you tell whether the plan is working. A 5% miss on enrollment is normal noise; a 25% miss is a signal that the model needs an update.",
  },
  variance: {
    term: "Variance",
    short: "The gap between what you projected and what actually happened, usually shown as a dollar amount or a percentage.",
    long: "A 'favorable variance' means actuals beat the plan; an 'unfavorable variance' means they came in short. Most boards want explanations for any variance bigger than ~10% on a major line.",
  },
  break_even: {
    term: "Break-even",
    short: "The year your school's revenue first covers its expenses - the point at which you're no longer running at a loss.",
    long: "Most new schools take 2-4 years to break even. Lenders and authorizers want to see a credible path to break-even before Year 5; a model that never gets there is a red flag.",
  },
  realm: {
    term: "Realm",
    short: "QuickBooks' name for the specific company file you're connected to - one realm per company in your QuickBooks account.",
    long: "When you authorize an accounting connection, the realm ID identifies which set of books we're reading. If you switch QuickBooks companies you'll need to reconnect, and your account mappings are saved per realm so they don't bleed between companies.",
  },
  oauth: {
    term: "OAuth",
    short: "The 'Sign in with Google'-style handshake your accounting system uses to grant us read-only access without ever sharing your password.",
    long: "OAuth lets you click 'Connect to QuickBooks/Xero', approve a specific scope (typically read-only access to your Profit & Loss), and revoke it any time from inside your accounting tool. We never see or store your bookkeeping login.",
  },
};
