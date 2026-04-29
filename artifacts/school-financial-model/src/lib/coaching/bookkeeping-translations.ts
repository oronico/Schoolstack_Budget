export type StatementKind = "pl" | "balance_sheet" | "cash_flow" | "memo";

export interface BookkeepingLine {
  label: string;
  glossaryKey?: string;
  account: string;
  statement: StatementKind;
  note?: string;
}

export interface BookkeepingTranslation {
  intro: string;
  lines: BookkeepingLine[];
  footnote?: string;
}

export const STATEMENT_LABELS: Record<StatementKind, string> = {
  pl: "P&L",
  balance_sheet: "Balance Sheet",
  cash_flow: "Cash Flow",
  memo: "Memo only",
};

export const BOOKKEEPING_TRANSLATIONS: Record<number, BookkeepingTranslation> = {
  1: {
    intro:
      "Your story doesn't post to a ledger, but it sets the lens your bookkeeper will use - what counts as program vs. admin, what's restricted vs. unrestricted, and what board memo each variance ends up in.",
    lines: [
      {
        label: "Mission and program scope",
        glossaryKey: "pl_statement",
        account: "Used to design your Chart of Accounts categories",
        statement: "memo",
        note: "Programs you describe here become the natural P&L sub-classes (e.g. Lower School, Aftercare).",
      },
      {
        label: "Restricted vs. unrestricted donor intent",
        glossaryKey: "equity",
        account: "Net Assets - Restricted vs Unrestricted (nonprofits) on the Balance Sheet",
        statement: "balance_sheet",
        note: "Your story shapes which donor gifts get tagged restricted in the books and which fund general operations.",
      },
    ],
  },
  2: {
    intro:
      "Most of School Details is bookkeeping setup metadata - it picks the right entity tax form, the right facility account, and whether donations book as revenue or contributions.",
    lines: [
      {
        label: "Entity type and EIN",
        account: "Drives tax form (1120, 1120-S, 1065, 990) and how Equity is named",
        glossaryKey: "equity",
        statement: "memo",
      },
      {
        label: "Lease (rent your space)",
        account: "Rent Expense (operating expense, monthly)",
        glossaryKey: "rent_expense",
        statement: "pl",
        note: "NNN pass-throughs (CAM, taxes, utilities) book as separate expense lines, not as a markup on rent.",
      },
      {
        label: "Owned facility",
        account: "Building and Land sit in Fixed Assets; Depreciation hits the P&L monthly",
        glossaryKey: "fixed_assets",
        statement: "balance_sheet",
        note: "If there's a mortgage, the unpaid balance is a long-term Liability and the interest portion of each payment is an expense.",
      },
      {
        label: "Leasehold improvements",
        account: "Capitalized as a Fixed Asset; depreciated over the shorter of useful life or remaining lease",
        glossaryKey: "leasehold_improvements",
        statement: "balance_sheet",
      },
    ],
  },
  3: {
    intro:
      "Assumptions don't post to your books directly - they're the dials your bookkeeper will use to roll the budget forward and explain next year's variances.",
    lines: [
      {
        label: "Tuition escalation rate",
        account: "Used to project next year's Tuition Revenue line",
        glossaryKey: "escalation_rate",
        statement: "memo",
      },
      {
        label: "COLA (annual salary bump)",
        account: "Used to project Salaries & Wages",
        glossaryKey: "cola",
        statement: "memo",
      },
      {
        label: "Benefits rate and payroll tax rate",
        account: "Become the Employee Benefits and Payroll Tax Expense projections",
        glossaryKey: "payroll_expense",
        statement: "memo",
      },
    ],
    footnote:
      "Cash vs. accrual choice (set by your bookkeeper, not here) decides whether September tuition gets booked when invoiced or when collected.",
  },
  4: {
    intro:
      "Enrollment counts don't show up on the P&L themselves - but they're the multiplier behind every per-student line your books carry.",
    lines: [
      {
        label: "Total enrolled",
        account: "Drives Tuition Revenue, Per-Pupil Funding, and per-student costs (curriculum, food, tech)",
        glossaryKey: "pl_statement",
        statement: "memo",
      },
      {
        label: "Re-enrolled vs. new students",
        account: "Affects deposit timing - returning families often pre-pay earlier in the year",
        statement: "memo",
        note: "Pre-paid tuition sits as a Liability (Deferred Revenue) until the month of instruction.",
      },
    ],
  },
  5: {
    intro:
      "Every line you turn on here maps to a specific revenue account on your Profit & Loss.",
    lines: [
      {
        label: "Tuition and fees",
        account: "Tuition Revenue (most schools split by program - Lower, Middle, Aftercare, Summer)",
        glossaryKey: "pl_statement",
        statement: "pl",
      },
      {
        label: "Tuition offsets (financial aid, sibling discount)",
        account: "Contra-revenue line that reduces Tuition Revenue, not an expense",
        glossaryKey: "tuition_offsets",
        statement: "pl",
        note: "Lenders read net tuition (gross less offsets) - keep them on a contra-line so the math is visible.",
      },
      {
        label: "Public funding / per-pupil",
        account: "State Per-Pupil Revenue (charter) or Title I/IDEA Federal Revenue",
        glossaryKey: "per_pupil",
        statement: "pl",
      },
      {
        label: "ESA / vouchers",
        account: "Tuition Revenue - ESA or School Choice (separate sub-account so deposits reconcile)",
        statement: "pl",
      },
      {
        label: "Donations and grants",
        account: "Contributions Revenue (501(c)(3)) - split unrestricted vs. restricted",
        statement: "pl",
        note: "Restricted gifts must be released into unrestricted only when their purpose is met.",
      },
    ],
  },
  6: {
    intro:
      "Staffing is usually 60-80% of total expense. The fully-loaded cost lands in three separate accounts on your P&L.",
    lines: [
      {
        label: "Annualized salaries",
        account: "Salaries & Wages",
        glossaryKey: "payroll_expense",
        statement: "pl",
      },
      {
        label: "Employer-side payroll taxes",
        account: "Payroll Tax Expense (FICA, FUTA, SUTA)",
        glossaryKey: "payroll_tax",
        statement: "pl",
      },
      {
        label: "Health, retirement, paid leave",
        account: "Employee Benefits",
        glossaryKey: "benefits_rate",
        statement: "pl",
      },
      {
        label: "Contract instructors",
        account: "Contract Services or 1099 Contractors (no payroll tax or benefits)",
        statement: "pl",
        note: "Misclassifying a W-2 role as 1099 is a frequent audit finding - check IRS guidance before you decide.",
      },
    ],
  },
  7: {
    intro:
      "Each expense category here lands in one of four buckets on your monthly P&L.",
    lines: [
      {
        label: "Curriculum, classroom supplies, field trips",
        account: "Program Expenses (instructional)",
        statement: "pl",
      },
      {
        label: "Tech (devices, SaaS, internet)",
        account: "Technology Expense",
        statement: "pl",
      },
      {
        label: "Rent, utilities, maintenance, insurance",
        account: "Facility / Occupancy Expenses",
        glossaryKey: "rent_expense",
        statement: "pl",
      },
      {
        label: "Marketing, legal, accounting, office",
        account: "Admin & General Expenses",
        statement: "pl",
        note: "Funders look hard at this bucket - if Admin runs over ~15% of total expense it usually needs an explanation.",
      },
      {
        label: "Big one-time purchases (buildout, vehicles)",
        account: "Fixed Assets on the balance sheet, then Depreciation Expense over their useful life",
        glossaryKey: "depreciation",
        statement: "balance_sheet",
      },
    ],
  },
  8: {
    intro:
      "Review pulls the whole picture together. Opening Balances populate the Balance Sheet on day one; everything else flows through your monthly P&L.",
    lines: [
      {
        label: "Opening cash, receivables, fixed assets",
        account: "Asset side of the opening Balance Sheet",
        glossaryKey: "balance_sheet",
        statement: "balance_sheet",
      },
      {
        label: "Opening payables, current and long-term debt",
        account: "Liability side of the opening Balance Sheet",
        glossaryKey: "liabilities",
        statement: "balance_sheet",
      },
      {
        label: "Net Income each year",
        account: "Closes into Retained Earnings (or Unrestricted Net Assets) at year-end",
        glossaryKey: "retained_earnings",
        statement: "balance_sheet",
      },
      {
        label: "Cash trough month",
        account: "The lowest month on your projected Cash Flow Statement",
        glossaryKey: "cash_flow_statement",
        statement: "cash_flow",
        note: "Plan a line of credit or a reserve draw before the trough hits, not during.",
      },
    ],
  },
  9: {
    intro:
      "The consultant view is analytical - it doesn't post to the GL. But the metrics it surfaces are the same ones a bookkeeper would compute from your P&L and Balance Sheet each month.",
    lines: [
      {
        label: "DSCR (Debt Service Coverage Ratio)",
        account: "Computed from Operating Income ÷ annual Debt Service",
        glossaryKey: "dscr",
        statement: "memo",
      },
      {
        label: "Reserve months",
        account: "Cash on Balance Sheet ÷ average monthly Operating Expense",
        glossaryKey: "reserve_months",
        statement: "memo",
      },
      {
        label: "Net margin",
        account: "Net Income ÷ Total Revenue from the P&L",
        glossaryKey: "net_margin",
        statement: "memo",
      },
    ],
  },
  10: {
    intro:
      "Lender narrative is the story behind the numbers. Lenders also pull your last 12-24 months of actual P&L and Balance Sheet to confirm the story matches the books.",
    lines: [
      {
        label: "Annual debt service",
        account: "Interest portion is on the P&L; principal portion reduces the loan Liability",
        glossaryKey: "debt_service",
        statement: "balance_sheet",
      },
      {
        label: "Reserves and runway claims",
        account: "Lender will recompute from your Balance Sheet cash and last 3 months of expenses",
        glossaryKey: "balance_sheet",
        statement: "memo",
      },
      {
        label: "EBITDA / operating income",
        account: "Lender adds back interest and depreciation from your P&L to compute it",
        glossaryKey: "ebitda",
        statement: "memo",
      },
    ],
  },
  11: {
    intro:
      "The Excel export is a budget your bookkeeper can drop next to the live P&L. Most accounting systems will import it as the 'Budget' column on a Budget vs. Actual report.",
    lines: [
      {
        label: "Annual P&L tab",
        account: "Pastes into the Budget column of QuickBooks/Xero Budget vs. Actual",
        glossaryKey: "pl_statement",
        statement: "pl",
      },
      {
        label: "Monthly cash flow tab",
        account: "Used to time draws on a line of credit or pre-fund the cash trough",
        glossaryKey: "cash_flow_statement",
        statement: "cash_flow",
      },
      {
        label: "Opening balances tab",
        account: "Reconciles to the Balance Sheet your accountant produces at year-end",
        glossaryKey: "balance_sheet",
        statement: "balance_sheet",
      },
    ],
    footnote:
      "Once it's in your accounting tool, do variance analysis monthly - the gap between this Budget column and Actual is what you'll discuss at every board meeting.",
  },
};
