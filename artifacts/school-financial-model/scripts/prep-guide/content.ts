/**
 * Task #889 — content for the printable Model Prep Guide PDF.
 *
 * Each section mirrors a wizard step (in wizard order) and lists:
 *   - `intro`: a short plain-language explanation of what the step is for.
 *   - `gather`: documents / records the founder should pull together.
 *   - `decisions`: numbers / decisions they should have an opinion on.
 *   - `screenshot`: filename inside `public/images/prep-guide/` of the
 *     matching wizard screenshot. The build script renders a labelled
 *     placeholder when the file is missing so the PDF is still complete
 *     before the capture script has been run.
 *
 * Kept in plain data so this file can be diffed easily when copy changes,
 * and so the PDF build (which lives in `build-prep-guide.ts`) is a pure
 * mapping from this content + the screenshot folder to bytes on disk.
 */

export interface PrepGuideSection {
  /** Short anchor used in the cover summary. */
  shortTitle: string;
  /** Heading shown at the top of the section page. */
  title: string;
  /** Optional badge text — used to mark the operating-only section. */
  badge?: string;
  /** Plain-language explanation of what this wizard step does. */
  intro: string;
  /** Filename inside `public/images/prep-guide/`. */
  screenshot: string;
  /** Documents / records to pull. */
  gather: string[];
  /** Numbers / decisions to have ready. */
  decisions: string[];
  /** Optional one-line tip shown in the section footer. */
  tip?: string;
}

export const COVER = {
  title: "Model Prep Guide",
  subtitle:
    "Everything to pull together before you sit down to build your school's 5-year financial plan.",
  byline: "SchoolStack Budget — by SchoolStack.ai",
  intro:
    "Most founders walk into the model wizard and bounce back out because they don't have the numbers in front of them. This guide lays out — step by step, in the same order as the wizard — exactly which documents to gather and which decisions to have an opinion on. Print it, mark it up, and bring it with you when you sit down to build. You don't need every answer to start; smart defaults and \"I don't know yet\" options are everywhere. But the more of this you have ready, the faster the build goes and the stronger your model will be.",
};

export const AT_A_GLANCE: { section: string; bullets: string[] }[] = [
  {
    section: "Before you start",
    bullets: [
      "About an hour of focused time",
      "A folder (digital or paper) with the documents below",
      "Your best estimates — exact numbers can come later",
    ],
  },
  {
    section: "Documents to have nearby",
    bullets: [
      "Lease or LOI for your facility (or a rent estimate)",
      "Most recent payroll register or staffing plan",
      "Last year's P&L and balance sheet (if already operating)",
      "Loan term sheet or quote (if you're financing capital)",
      "Any grant award letters, ESA / voucher rules, per-pupil rates",
    ],
  },
  {
    section: "Decisions to have an opinion on",
    bullets: [
      "Year-1 enrollment target by grade",
      "Tuition (and any sibling / financial-aid discounts)",
      "Founder + leadership salaries (market rate)",
      "Teacher salary band and student-to-teacher ratio",
      "How much capital you're putting in vs. borrowing",
    ],
  },
];

export const SECTIONS: PrepGuideSection[] = [
  {
    shortTitle: "Story",
    title: "Story — what kind of school you're building",
    intro:
      "Five plain-language questions about the school: type, name, who it's for, and where you are in your launch journey. No numbers required. This is what every coaching tip the wizard shows later keys off, so it's worth doing thoughtfully.",
    screenshot: "01-story.png",
    gather: [
      "A working name for the school (you can change it later)",
      "A one-sentence description of the model you're building",
      "Notes on which families you're serving and what makes the school different",
    ],
    decisions: [
      "School type: charter, private, microschool, pod, co-op, or tutoring center",
      "Where you are: still planning, opening soon, or already operating",
      "Whether you're a sole practitioner, LLC, partnership, or 501(c)(3)",
      "Your comfort level with financial modeling (Guided Builder vs. CFO Mode)",
    ],
    tip: "If you're already operating, the wizard will offer an \"Actuals Intake\" step right after this one. Skip ahead to that section of the guide to see what to bring.",
  },
  {
    shortTitle: "School Details",
    title: "School Details — the basics",
    intro:
      "State, opening year, fiscal-year start, and building capacity. The wizard uses these to pick sensible defaults (per-pupil rates, payroll tax rules, calendar) so you're not starting from a blank sheet.",
    screenshot: "02-school-details.png",
    gather: [
      "Articles of incorporation or LLC paperwork (for the entity type)",
      "Lease or LOI showing the building's permitted occupancy",
      "Your fiscal-year start month (most schools use July)",
    ],
    decisions: [
      "What state the school is in",
      "Year you plan to open (or current operating year)",
      "Maximum capacity of your building once fully built out",
      "Whether Year 1 is a partial year (and if so, how many operating months)",
    ],
  },
  {
    shortTitle: "Enrollment",
    title: "Enrollment — students by grade and year",
    intro:
      "The single biggest driver of every other number in the model. The wizard lets you enter enrollment by grade and ramp it across five years, so this is the place to be honest about how fast you can really fill seats.",
    screenshot: "03-enrollment.png",
    gather: [
      "Waitlist or interest-list counts, if you have them",
      "Demographic data on school-age children in your service area",
      "Notes from any open houses, info sessions, or family interviews",
    ],
    decisions: [
      "Year-1 enrollment target, broken out by grade",
      "How many grades you'll serve in Year 1 (and which you'll add in Years 2-5)",
      "A realistic re-enrollment / retention rate from year to year",
      "Class-size cap or student-to-teacher ratio you're committed to",
    ],
    tip: "Lenders and boards will probe your enrollment ramp harder than any other input. Be ready to defend it.",
  },
  {
    shortTitle: "Revenue",
    title: "Revenue — tuition, funding, grants, donations",
    intro:
      "Every dollar coming in: tuition, ESA / voucher payments, charter per-pupil funding, grants, donations, ancillary fees. The wizard handles discount tiers (sibling, financial aid) and collection timing too, so bring your real pricing schedule if you have one.",
    screenshot: "04-revenue.png",
    gather: [
      "Your published or proposed tuition schedule (with discounts)",
      "Per-pupil funding rates for your state (charter)",
      "ESA / voucher amounts and eligibility rules (if applicable)",
      "Grant award letters or pledges from named donors",
      "A copy of your fundraising plan or development calendar",
    ],
    decisions: [
      "Tuition rate per student (or by grade band)",
      "Financial-aid discount: percent of families and average award",
      "Sibling discount, if you'll offer one",
      "Realistic tuition collection rate (95-98% is typical)",
      "Any non-tuition revenue: aftercare, summer programs, fees",
    ],
  },
  {
    shortTitle: "Staffing",
    title: "Staffing — every role, every salary",
    intro:
      "Teachers, leadership, admin, support staff, contractors. The wizard tracks each role's FTE, salary, benefits, and payroll tax. Staffing is usually 50-70% of total spending, so getting this section honest is what separates a model that survives from one that doesn't.",
    screenshot: "05-staffing.png",
    gather: [
      "Your most recent payroll register (if operating)",
      "Salary benchmarks for teachers in your area (state DOE data, NAIS, NCES)",
      "Benefits quote: health, dental, retirement match",
      "Job descriptions for any roles you haven't hired yet",
    ],
    decisions: [
      "Founder / head-of-school salary at market rate (not founder discount)",
      "Teacher salary band — starting salary and top of scale",
      "Number of teachers in Year 1, plus any aides or specials staff",
      "Admin and operations roles you'll need (registrar, ops manager, etc.)",
      "Benefits load: usually 18-25% on top of base salary",
      "Annual raise assumption (3% is typical)",
    ],
    tip: "Pay yourself a real salary in the model even if you plan to defer it in Year 1. A model that only works because the founder works for free is not a viable model.",
  },
  {
    shortTitle: "Expenses",
    title: "Expenses — facility, operations, instruction",
    intro:
      "Everything that isn't payroll: rent, utilities, curriculum, technology, insurance, marketing, professional services. The wizard groups these into facility, instruction, operations, and other so the categories match how lenders read a P&L.",
    screenshot: "06-expenses.png",
    gather: [
      "Lease or LOI showing rent + NNN (taxes, insurance, maintenance)",
      "Utility estimates from your landlord or comparable buildings",
      "Curriculum quotes from your chosen publishers",
      "Insurance quote: general liability, property, D&O, workers' comp",
      "Marketing plan with proposed channels and spend",
    ],
    decisions: [
      "Monthly rent + NNN (or mortgage payment)",
      "Curriculum + instructional materials per student per year",
      "Technology cost per student (devices, software, internet)",
      "Marketing budget for the year",
      "Professional services: accounting, legal, audit, payroll provider",
      "Annual inflation assumption for non-salary costs (3% is typical)",
    ],
  },
  {
    shortTitle: "Capital & Financing",
    title: "Capital & Financing — how you'll fund the launch",
    intro:
      "Loans, lines of credit, founder capital, deferred founder pay, restricted gifts. The wizard turns this into the debt-service and DSCR (Debt Service Coverage Ratio) numbers a lender will ask about first.",
    screenshot: "07-capital-financing.png",
    gather: [
      "Loan term sheet or quote (amount, rate, term, amortization)",
      "Donor pledge agreements for any restricted capital gifts",
      "Personal financial statement, if you're guaranteeing the loan",
      "Build-out / leasehold improvement quotes from your contractor",
    ],
    decisions: [
      "Total capital needed before opening day",
      "How much you're putting in personally vs. borrowing",
      "Loan amount, interest rate, term in years",
      "DSCR target your lender will require (1.20-1.30 is common)",
      "Whether you'll need a line of credit for working capital",
      "Any restricted gifts (carve-outs that can't fund operations)",
    ],
    tip: "Restricted gifts can't legally cover operating costs or debt service. Keep them separate in your head before you enter them.",
  },
  {
    shortTitle: "Assumptions",
    title: "Assumptions & Sensitivity — what could go wrong",
    intro:
      "Every key driver — enrollment, tuition, salaries, rent — has an assumption row where you flag your confidence and attach evidence. The wizard then runs sensitivity scenarios so you can see what happens if reality is 10-20% off.",
    screenshot: "08-assumptions.png",
    gather: [
      "Source documents for any number you'll mark as \"high confidence\" (a signed lease, a state per-pupil rate sheet, a payroll register)",
      "Notes on which numbers are still estimates vs. firm",
    ],
    decisions: [
      "For each major driver: high / medium / low confidence",
      "Which downside scenarios you want to stress-test (\"enrollment 20% short\", \"lose a grant\", \"rent +15%\")",
      "Your own DSCR / cash-runway thresholds for \"acceptable risk\"",
    ],
  },
  {
    shortTitle: "Actuals Intake",
    title: "Actuals Intake — only if you're already operating",
    badge: "Already operating",
    intro:
      "Skip this if you haven't opened yet. If you have, the wizard pulls your prior-year actuals (from a P&L upload or manual entry) and uses them to seed Year 1 — so your projections start from real history instead of a blank slate.",
    screenshot: "09-actuals-intake.png",
    gather: [
      "Last fiscal year's profit & loss statement (P&L)",
      "Last year's balance sheet — especially cash on hand, restricted vs. unrestricted",
      "Last year's payroll summary by role",
      "Last year's enrollment count by grade as of October 1 (or your state's audit date)",
      "Bank statements or accounting export covering the last 12 months",
    ],
    decisions: [
      "Which prior fiscal year you're using as the baseline",
      "Whether to upload a QuickBooks / Xero export or enter line items manually",
      "How to allocate any one-time items (startup grants, capital campaigns) so they don't distort Year 1 trends",
    ],
    tip: "If you have a bookkeeper, ask them to send the trial balance or a categorized P&L — it's the single fastest way through this step.",
  },
  {
    shortTitle: "Review & Export",
    title: "Review & Export — what you'll walk away with",
    intro:
      "The last screen of the wizard. You'll see consultant-style analysis, a lender-narrative draft, and the export options: Lender Conversation Snapshot PDF, Board & Funder Summary PDF, a 23-tab Founder Planning Workbook, and a 5-Year Financial Model with live Excel formulas. You can also generate a shareable read-only link.",
    screenshot: "10-review-export.png",
    gather: [
      "Your contact info for any expert review you want to request",
      "A short list of the lenders / board members / funders you'll share the model with",
    ],
    decisions: [
      "Which exports you actually need (lender packet vs. board packet vs. workbook)",
      "Whether to request the free expert review from the SchoolStack team",
      "Whether to publish a read-only share link or keep the model private",
    ],
    tip: "Plan to come back to the wizard after every real-world change — a new lease, an actual enrollment count, a hire. Your budget is a living document.",
  },
];
