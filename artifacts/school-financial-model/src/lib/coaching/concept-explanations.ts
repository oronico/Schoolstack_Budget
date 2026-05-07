export type ConceptId =
  | "revenue"
  | "expense"
  | "net_income"
  | "cash_flow"
  | "timing"
  | "break_even"
  | "reserves"
  | "debt_service"
  | "paying_yourself";

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
};
