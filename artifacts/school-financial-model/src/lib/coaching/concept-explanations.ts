export type ConceptId =
  | "revenue"
  | "expense"
  | "net_income"
  | "cash_flow"
  | "timing"
  | "break_even"
  | "reserves"
  | "debt_service"
  | "paying_yourself"
  | "beginning_cash"
  | "ending_cash"
  | "staffing_cost_ratio"
  | "facility_cost_ratio"
  | "public_funding_timing"
  | "tuition_collection_rate"
  | "assumption_confidence"
  | "dscr"
  | "actuals_vs_projections";

export interface ConceptExplanation {
  id: ConceptId;
  title: string;
  body: string;
}

export const CONCEPT_EXPLANATIONS: Record<ConceptId, ConceptExplanation> = {
  revenue: {
    id: "revenue",
    title: "What is revenue?",
    body:
      "Revenue is the money your school earns over a year before any costs come out — tuition, fees, public funding, scholarships, and donations all count. Think of it as the top line of your budget. It's the number every other figure (expenses, surplus, runway) gets compared against, so getting it grounded in real commitments matters more than any other input on this step.",
  },
  expense: {
    id: "expense",
    title: "What is an expense?",
    body:
      "An expense is anything your school spends money on to operate — payroll, rent, insurance, curriculum, technology, utilities. Some expenses are fixed (rent) and some scale with enrollment (food service, per-student supplies). When you add them all up across a year, that total tells you how much revenue you need just to keep the lights on.",
  },
  net_income: {
    id: "net_income",
    title: "What is net income?",
    body:
      "Net income is what's left after you subtract every expense from every dollar of revenue in a year. A positive number means you finished the year with a surplus you can save, reinvest, or use to pay down debt. A negative number means you spent more than you brought in — that's fine for a year or two while you ramp, but it can't continue forever without burning through reserves.",
  },
  cash_flow: {
    id: "cash_flow",
    title: "What is cash flow?",
    body:
      "Cash flow is the actual movement of money in and out of your bank account each month — separate from your annual revenue total. You can have a profitable year on paper but still run out of cash in August if tuition lands in September and payroll is due every two weeks. Tracking cash month-by-month is how you spot when you'll be tight and plan ahead.",
  },
  timing: {
    id: "timing",
    title: "Why timing matters",
    body:
      "Two schools with identical annual revenue can have very different cash positions because of when the money arrives. Tuition usually lands in monthly installments starting in August or September, but payroll, rent, and curriculum bills are due all year. If revenue arrives later than your bills, you need cash on hand or a line of credit to bridge the gap — even a perfectly balanced annual budget can stall in the wrong month.",
  },
  break_even: {
    id: "break_even",
    title: "What is break-even enrollment?",
    body:
      "Break-even enrollment is the number of students you need to cover all your costs in a given year — not a profit target, just the line where revenue equals expenses. If your plan calls for fewer students than that, you're modeling a loss; if it's well above, you have cushion for under-enrollment. Most founders aim for 10-20% of enrollment cushion above break-even so a slow year doesn't sink the school.",
  },
  reserves: {
    id: "reserves",
    title: "What are operating reserves?",
    body:
      "Operating reserves are cash you keep in a separate account specifically to cover expenses during a slow month, an emergency, or a tough year. A common target is 45-90 days of operating expenses set aside — enough to keep payroll running and the doors open if revenue slips. Reserves are what turn a stressful surprise into a manageable bump.",
  },
  debt_service: {
    id: "debt_service",
    title: "What is debt service?",
    body:
      "Debt service is the total of principal plus interest you owe on a loan in a given year — the actual cash you have to send the lender, not just the interest. Lenders look at how comfortably your operating surplus covers that payment (called debt service coverage). The bigger the cushion, the more confident lenders are that you can handle a slow enrollment year without missing a payment.",
  },
  paying_yourself: {
    id: "paying_yourself",
    title: "Why paying yourself eventually matters",
    body:
      "It's common — and often necessary — for founders to take a discounted salary in early years to protect cash. That's a real choice, and we honor it in your plan. But your model should also show what the school would cost to run if a market-rate hire filled your role, because that's the cost lenders, board members, and any future leader will eventually face. Modeling both views protects you from quietly subsidizing the school forever.",
  },
  beginning_cash: {
    id: "beginning_cash",
    title: "What is beginning cash?",
    body:
      "Beginning cash is what you have in the bank on the first day of a month or year — before any new revenue lands and before any new bills go out. It's the starting point for every cash-flow calculation. A healthy beginning cash balance gives you room to cover a slow month without scrambling; a thin one means even a small timing mismatch can put you in the red.",
  },
  ending_cash: {
    id: "ending_cash",
    title: "What is ending cash?",
    body:
      "Ending cash is what's left in the bank at the close of a month or year, after every dollar received and every bill paid. It rolls forward to become next month's beginning cash. Watching ending cash month by month is how you spot the lowest point of the year — usually a summer or pre-launch month — so you can plan reserves or a line of credit before you need them.",
  },
  staffing_cost_ratio: {
    id: "staffing_cost_ratio",
    title: "What is the staffing cost ratio?",
    body:
      "Staffing cost ratio is total personnel cost (salaries, benefits, payroll taxes) divided by total revenue, shown as a percent. It is almost always the largest single line on a school budget, and the healthy range varies by school type — your benchmark on this step is the right reference. When your ratio runs well above that benchmark, it usually means you are staffed for a bigger enrollment than you have, or your revenue is light. Either way, it is a signal to revisit either the headcount plan or the enrollment plan.",
  },
  facility_cost_ratio: {
    id: "facility_cost_ratio",
    title: "What is the facility cost ratio?",
    body:
      "Facility cost ratio is rent, utilities, insurance, and other occupancy costs as a percent of total revenue. A common healthy range is 12% to 20% depending on school type and city. Facility costs are usually fixed — if enrollment comes in lower than expected, the rent does not shrink — so a high facility ratio is one of the strongest signals that your fixed-cost base is heavier than your revenue can comfortably carry.",
  },
  public_funding_timing: {
    id: "public_funding_timing",
    title: "Why public funding timing matters",
    body:
      "Public funding (per-pupil revenue, ESA payments, voucher reimbursements) is usually committed for the year, but the cash often arrives on a state schedule that lags your bills by 30, 60, or 90 days. Your annual model can look balanced and your monthly cash can still get tight if a payment slips. Mapping when each public payment actually lands — and stress-testing what happens if it's late — is one of the highest-value things you can do for credibility.",
  },
  tuition_collection_rate: {
    id: "tuition_collection_rate",
    title: "What is the tuition collection rate?",
    body:
      "Tuition collection rate is the percent of billed tuition you actually receive in cash over the year. It's almost never 100% — late payments, financial-aid adjustments, mid-year withdrawals, and write-offs all reduce it. A realistic rate (often 92% to 98% for established schools, lower for first-year programs) keeps your cash forecast honest. Modeling 100% collection makes the budget look stronger than it really is.",
  },
  assumption_confidence: {
    id: "assumption_confidence",
    title: "What is assumption confidence?",
    body:
      "Every number in your model is either a fact (an actual you can prove) or an assumption (your best estimate). Assumption confidence is a quick read on how much evidence stands behind each estimate — actuals, a signed agreement, a quote, public guidance, research, or a working estimate. Marking each one honestly does not mean your plan is weak; it tells a board, funder, or lender exactly which parts of the model are rock-solid and which still need clarification.",
  },
  dscr: {
    id: "dscr",
    title: "What is DSCR (debt-payment cushion)?",
    body:
      "DSCR — Debt Service Coverage Ratio — is the cushion between your operating cash flow and the loan payment you owe in a year. A DSCR of 1.0x means you generate exactly enough cash to make the payment with nothing left over; 1.25x means you generate $1.25 of cash for every $1 of debt service, leaving a 25% safety margin. Lenders almost always require a minimum (commonly 1.10x to 1.25x for schools) so a slow enrollment year doesn't push you into default. Think of it as: how comfortably can the school keep paying the lender if revenue dips?",
  },
  actuals_vs_projections: {
    id: "actuals_vs_projections",
    title: "Actuals vs. projections — why both matter",
    body:
      "An actual is a number that already happened — last month's payroll, last year's tuition collected, a paid invoice — while a projection is your best estimate of what comes next. The strongest models clearly separate the two: lock the actuals down (they aren't up for debate) and stress-test the projections. Mixing them silently makes a forecast look more certain than it really is. Boards, funders, and lenders trust models that label which is which, because it shows exactly where the certainty ends and the planning begins.",
  },
};
