import {
  FileSpreadsheet,
  CalendarRange,
  SlidersHorizontal,
  Landmark,
  Compass,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  SingleYearScreenshots,
  FiveYearScreenshots,
  ScenarioScreenshots,
  DebtScreenshots,
  GuidanceScreenshots,
} from "@/components/solutions/InsideTheProductVisuals";

export interface SolutionStep {
  title: string;
  description: string;
}

export interface SolutionFAQ {
  question: string;
  answer: string;
}

export interface SolutionPageData {
  slug: string;
  seoTitle: string;
  seoDescription: string;
  badge: string;
  Icon: LucideIcon;
  headline: string;
  headlineAccent: string;
  subheadline: string;
  audience: string;
  primaryCta: { label: string; href: string };
  visuals: ReactNode;
  steps: SolutionStep[];
  faqs: SolutionFAQ[];
  closingHeadline: string;
  closingText: string;
  closingCta: { label: string; href: string };
}

export const SOLUTION_PAGES: SolutionPageData[] = [
  {
    slug: "single-year-pro-forma",
    seoTitle: "Single Year Pro Forma for Schools",
    seoDescription:
      "Build a Year 1 income statement for your school in under an hour. Revenue, staffing, expenses, and a clear bottom line - exportable to Excel and PDF.",
    badge: "SINGLE YEAR PRO FORMA",
    Icon: FileSpreadsheet,
    headline: "A clear Year 1 budget,",
    headlineAccent: "ready to share.",
    subheadline:
      "Walk through enrollment, revenue, staffing, and expenses step by step. SchoolStack Budget assembles a Year 1 income statement and current-year tab you can hand to a board, lender, or co-founder the same day.",
    audience:
      "Founders building their opening-year budget, schools refreshing their current operating year, and operators preparing a board packet for a single fiscal year.",
    primaryCta: { label: "Start My Year 1 Budget", href: "/register" },
    visuals: <SingleYearScreenshots />,
    steps: [
      {
        title: "Tell us about your school.",
        description:
          "Pick your school type, state, and grade levels. Budget tailors the rest of the wizard around what's relevant - charter, private, microschool, pod, or co-op.",
      },
      {
        title: "Enter Year 1 revenue and enrollment.",
        description:
          "Set tuition, per-pupil funding, ESA, grants, and donations - with collection-timing helpers for slow-paying funders so the cash math is honest.",
      },
      {
        title: "Add your staff and operating costs.",
        description:
          "Build your staffing roster role by role, then layer in rent, utilities, curriculum, insurance, and marketing. Inline benchmarks flag anything that looks high or low for your school type.",
      },
      {
        title: "Review the Year 1 picture.",
        description:
          "See a one-page Year 1 income statement, key metrics, and Budget's plain-English read of whether the math works.",
      },
      {
        title: "Export and share.",
        description:
          "Download a current-year workbook tab, a one-page board summary, or a shareable read-only link - no login required for the people you send it to.",
      },
    ],
    faqs: [
      {
        question: "I only need a Year 1 budget right now. Do I still have to model 5 years?",
        answer:
          "No. When you start a new model you'll pick \"Single-Year Budget\" - the wizard focuses on Year 1, the Year 1 income statement is the core deliverable, and you can export it for your team. Whenever you're ready to think further out, click \"Extend to 5-year\" and the multi-year view picks up where you left off (Years 2-5 are seeded from your Year 1 ramp).",
      },
      {
        question: "Does this account for cash timing, not just totals?",
        answer:
          "Yes. Tuition collection cadence, grant disbursement timing, and slow-paying funders all affect the monthly cash inflow Budget computes - so you can see when you're tight on cash, not just whether the year balances on paper.",
      },
      {
        question: "Can I export just the current-year numbers?",
        answer:
          "Yes. The export workbook has a dedicated current-year tab that mirrors the in-app review, plus a board summary PDF that fits on one page.",
      },
      {
        question: "What if I'm already operating and want to budget the next school year?",
        answer:
          "Use the same flow with your actuals as a starting point. Budget will help you compare what you're projecting to what similar schools see.",
      },
    ],
    closingHeadline: "Year 1 should not feel like a guess.",
    closingText:
      "About an hour of work and you have a real Year 1 income statement, a board-ready summary, and an Excel tab you can keep updating as the year unfolds.",
    closingCta: { label: "Start My Year 1 Budget", href: "/register" },
  },
  {
    slug: "five-year-pro-forma",
    seoTitle: "Five Year Pro Forma for Schools",
    seoDescription:
      "Build a lender-ready 5-year financial projection for your school. Revenue ramp, staffing growth, expense scaling, and a 21-tab Underwriting Package.",
    badge: "FIVE YEAR PRO FORMA",
    Icon: CalendarRange,
    headline: "Five years of financial story,",
    headlineAccent: "in one model.",
    subheadline:
      "See how revenue, staffing, and expenses scale together as your school grows. Budget builds a full 5-year pro forma you can show a lender, an authorizer, or a board chair without apologizing for the format.",
    audience:
      "Founders preparing for facility financing, charter schools heading into authorization, and existing schools planning a multi-year ramp.",
    primaryCta: { label: "Build My 5-Year Plan", href: "/register" },
    visuals: <FiveYearScreenshots />,
    steps: [
      {
        title: "Project enrollment over five years.",
        description:
          "Set Year 1 enrollment and how you expect to grow. Budget handles grade roll-ups, ramp curves, and capacity caps so the projection stays realistic.",
      },
      {
        title: "Layer in revenue that scales with students.",
        description:
          "Tuition escalators, per-pupil funding adjustments, time-limited grants, and donation goals - all tied to enrollment so the math stays consistent across years.",
      },
      {
        title: "Plan staffing that grows with the school.",
        description:
          "Add roles year by year, set when each hire starts, and watch your staffing ratio against healthy benchmarks across the full ramp.",
      },
      {
        title: "Project facility, curriculum, and operating costs.",
        description:
          "Costs that scale per student, fixed costs that don't, and one-time outlays in specific years - all reflected in the multi-year view.",
      },
      {
        title: "Review and export the full 5-year package.",
        description:
          "Year-by-year income statement, cash flow, and key ratios. Export the Lender-Ready Packet PDF or 21-tab Excel workbook with live formulas.",
      },
    ],
    faqs: [
      {
        question: "How is this different from a 5-year forecast in a spreadsheet?",
        answer:
          "Budget keeps your assumptions and outputs in sync. Change Year 2 enrollment and your staffing ratio, facility load, and DSCR all update - no broken formulas, no copy-paste between tabs.",
      },
      {
        question: "Can I model a school that opens with one grade and adds grades each year?",
        answer:
          "Yes. The enrollment step supports grade-by-grade ramps, capacity caps per grade, and re-enrollment assumptions across the full 5 years.",
      },
      {
        question: "What do lenders actually want to see in a 5-year projection?",
        answer:
          "DSCR above 1.2x, a credible enrollment ramp, staffing as 50-60% of revenue, and a path to operating reserves. Budget calculates each of these and flags where you're tight.",
      },
      {
        question: "Can I export the underlying formulas?",
        answer:
          "Yes. The Formula Workbook export ships with live Excel formulas - your CFO, lender, or accountant can audit every line.",
      },
    ],
    closingHeadline: "A 5-year story, told in numbers.",
    closingText:
      "When a lender or authorizer asks where the school will be in five years, give them a clear answer - and the workbook to back it up.",
    closingCta: { label: "Build My 5-Year Plan", href: "/register" },
  },
  {
    slug: "scenario-planning",
    seoTitle: "School Scenario Planning & What-If Modeling",
    seoDescription:
      "Stress-test your school's financial model. What-If sliders for enrollment, tuition, and costs, plus structured decision flows for adding programs, evaluating sites, and changing enrollment.",
    badge: "SCENARIO PLANNING",
    Icon: SlidersHorizontal,
    headline: "Test the downside",
    headlineAccent: "before it happens.",
    subheadline:
      "Pull sliders to see what happens when enrollment drops or rent goes up. Run structured decision flows for adding a program, evaluating a site, or changing enrollment. Save the scenarios that matter and compare them side by side.",
    audience:
      "Founders pressure-testing a plan before signing a lease or loan, board members evaluating big decisions, and operators who need to know whether the school survives a tough year.",
    primaryCta: { label: "Try the What-If Planner", href: "/register" },
    visuals: <ScenarioScreenshots />,
    steps: [
      {
        title: "Open the What-If drawer.",
        description:
          "From any saved model, pull up sliders for enrollment, tuition, staffing costs, facility expense, and more. The base model stays untouched.",
      },
      {
        title: "Move the sliders that worry you.",
        description:
          "What if enrollment is 20% lower? What if rent goes up 15%? What if a grant doesn't come through? See the impact on revenue, net income, and cash on hand instantly.",
      },
      {
        title: "Run a structured decision flow.",
        description:
          "For bigger questions - adding a grade, evaluating a site, changing enrollment - launch a guided flow that walks through the inputs, tradeoffs, and impact on the full 5-year picture.",
      },
      {
        title: "Save the scenario.",
        description:
          "Name it, write a quick note about what changed, and keep it next to your base model. You can come back any time and re-apply it.",
      },
      {
        title: "Compare scenarios side by side.",
        description:
          "Stack Conservative, Optimistic, and Worst-Case against your base model. Budget shows you which metrics improve, which get worse, and what a lender or board would focus on.",
      },
    ],
    faqs: [
      {
        question: "Will scenario planning overwrite my base model?",
        answer:
          "No. Scenarios are separate. Your base model stays exactly as you built it - scenarios layer on top so you can experiment freely.",
      },
      {
        question: "How many scenarios can I save per model?",
        answer:
          "As many as you want. Most founders end up with three to five - a base case, a stretch case, and a couple of stress cases for the things that actually keep them up at night.",
      },
      {
        question: "What's the difference between a What-If scenario and a decision flow?",
        answer:
          "A What-If scenario is a fast slider-driven adjustment. A decision flow is a guided, structured walkthrough for a specific decision (add a program, evaluate a site, change enrollment) that captures rationale and produces a clear before/after.",
      },
      {
        question: "Can I share a scenario with my board or lender?",
        answer:
          "Yes. Generate a read-only link to your model that includes the saved scenarios, or include the comparison in the Lender-Ready Packet export.",
      },
    ],
    closingHeadline: "Find the cracks before someone else does.",
    closingText:
      "Lenders, boards, and authorizers will all ask 'what if'. Have the answer ready - in a format they can review in minutes.",
    closingCta: { label: "Try the What-If Planner", href: "/register" },
  },
  {
    slug: "debt-analysis",
    seoTitle: "School Debt Analysis & DSCR Modeling",
    seoDescription:
      "Model facility loans and lines of credit for your school. DSCR, debt service coverage, and a Lender-Ready Packet that gives underwriters everything they need.",
    badge: "DEBT ANALYSIS",
    Icon: Landmark,
    headline: "Know your debt service before",
    headlineAccent: "the lender does.",
    subheadline:
      "Model a facility loan, line of credit, or fit-out financing inside your full 5-year plan. See DSCR, monthly debt service, and how much room you really have - then export a packet underwriters know how to read.",
    audience:
      "Founders raising facility financing, schools refinancing existing debt, and CDFIs and lenders evaluating school borrowers.",
    primaryCta: { label: "Build a Lender-Ready Plan", href: "/register" },
    visuals: <DebtScreenshots />,
    steps: [
      {
        title: "Enter your loan and facility inputs.",
        description:
          "Loan amount, rate, amortization, interest-only periods, and any balloon. Budget handles standard terms and the unusual ones lenders sometimes ask for.",
      },
      {
        title: "Connect debt service to your 5-year cash flow.",
        description:
          "Monthly principal and interest land in the cash flow automatically, so you see whether the school can actually carry the payment - not just whether the model balances on paper.",
      },
      {
        title: "Track DSCR year by year.",
        description:
          "See your debt service coverage ratio for each year against the 1.2x lender benchmark. Budget flags the year you're tightest so you can shore it up before underwriting.",
      },
      {
        title: "Stress-test with the Lending Lab.",
        description:
          "Run rate sensitivity, payment shock, and revenue stress scenarios on the loan. See whether DSCR holds up under conditions a lender would reasonably test.",
      },
      {
        title: "Export the Lender-Ready Packet.",
        description:
          "A PDF that bundles 5-year projections, DSCR table, assumptions, and a board summary - the structure underwriters expect, without you formatting a thing.",
      },
    ],
    faqs: [
      {
        question: "What is DSCR and why do lenders care?",
        answer:
          "Debt Service Coverage Ratio is your operating cash divided by annual debt payments. Lenders typically want 1.2x or higher - meaning the school generates 20% more than it owes. Budget calculates this automatically and shows you the trough year.",
      },
      {
        question: "Can I model interest-only periods or a balloon payment?",
        answer:
          "Yes. The loan inputs support standard amortization, interest-only periods, balloons, and irregular draw schedules common in facility financing.",
      },
      {
        question: "Does this work for a CDFI loan with an unusual structure?",
        answer:
          "Yes. CDFI structures with variable rates, deferred payments, or grant-paired financing can all be modeled. The DSCR and cash flow updates accordingly.",
      },
      {
        question: "What does the Lender-Ready Packet actually include?",
        answer:
          "5-year P&L and cash flow, DSCR table, assumptions documentation, sensitivity analysis, and a board summary - bundled as a single PDF underwriters can review in one sitting.",
      },
    ],
    closingHeadline: "Walk into your loan meeting prepared.",
    closingText:
      "DSCR, payment shock, sensitivity - all calculated, all in a packet a lender already knows how to read. Free during beta.",
    closingCta: { label: "Build a Lender-Ready Plan", href: "/register" },
  },
  {
    slug: "budgeting-accounting-guidance",
    seoTitle: "School Budgeting & Accounting Guidance",
    seoDescription:
      "Inline benchmarks, plain-English explainers, a Budget Primer, and accounting CSV uploads. SchoolStack Budget coaches you through every step of building a school budget.",
    badge: "BUDGETING & ACCOUNTING GUIDANCE",
    Icon: Compass,
    headline: "Coaching built into the model -",
    headlineAccent: "right when you need it.",
    subheadline:
      "Inline benchmarks tell you whether your numbers are healthy. Plain-English explainers translate finance jargon. A Budget Primer walks you through the basics. And when you have actuals, upload your CSV and we'll line them up next to your plan.",
    audience:
      "First-time school founders, board members reviewing a budget for the first time, and operators who want a second opinion built into the tool.",
    primaryCta: { label: "Start with Coaching On", href: "/register" },
    visuals: <GuidanceScreenshots />,
    steps: [
      {
        title: "Pick your guidance level.",
        description:
          "Basics, Extra, or Advanced. The platform adjusts how much coaching shows up - from heavy hand-holding for first-time founders to a quiet UI for experienced operators.",
      },
      {
        title: "Get inline benchmarks as you type.",
        description:
          "Setting tuition? See what similar schools charge. Adding a teacher? See typical salary ranges. Every input has a benchmark right next to it.",
      },
      {
        title: "Tap an explainer when you hit jargon.",
        description:
          "DSCR, net margin, days of cash on hand - every metric has a plain-English explainer that says what it means, why it matters, and what's healthy.",
      },
      {
        title: "Open the Budget Primer.",
        description:
          "A short, focused walkthrough of the three financial statements every school operates around - written for educators, not accountants.",
      },
      {
        title: "Upload your accounting actuals.",
        description:
          "Drop in a CSV from QuickBooks or your bookkeeper. Budget maps the categories and shows you actuals next to plan so you can see where you're on or off track.",
      },
    ],
    faqs: [
      {
        question: "Do I need accounting experience to use SchoolStack Budget?",
        answer:
          "No. Budget is built for educators and founders. Every concept is explained in plain English, with benchmarks and examples right where you need them.",
      },
      {
        question: "What's the Budget Primer?",
        answer:
          "A short, in-app walkthrough of the three financial statements every school operates around - income statement, cash flow, and balance sheet. Written for people who didn't go to business school.",
      },
      {
        question: "Can I turn the coaching off if I already know what I'm doing?",
        answer:
          "Yes. Set your guidance level to Advanced and the coaching prompts get out of the way. You can switch back any time.",
      },
      {
        question: "How does the accounting CSV upload work?",
        answer:
          "Export a transactions CSV from QuickBooks or any bookkeeping system, drop it in, and Budget maps it to your plan categories. You see actuals vs plan side by side.",
      },
    ],
    closingHeadline: "You don't need a finance degree to build a real budget.",
    closingText:
      "Coaching, benchmarks, and plain-English guidance are baked into every step - so you make confident decisions, not guesses.",
    closingCta: { label: "Start with Coaching On", href: "/register" },
  },
];

export const SOLUTION_SLUGS = SOLUTION_PAGES.map((p) => p.slug);

export function getSolutionBySlug(slug: string): SolutionPageData | undefined {
  return SOLUTION_PAGES.find((p) => p.slug === slug);
}

export interface SolutionLinkSummary {
  slug: string;
  title: string;
  tagline: string;
  Icon: LucideIcon;
}

export const SOLUTION_LINK_SUMMARIES: SolutionLinkSummary[] = [
  {
    slug: "single-year-pro-forma",
    title: "Single Year Pro Forma",
    tagline: "A clear Year 1 budget you can hand to a board today.",
    Icon: FileSpreadsheet,
  },
  {
    slug: "five-year-pro-forma",
    title: "Five Year Pro Forma",
    tagline: "A lender-ready 5-year projection with live formulas.",
    Icon: CalendarRange,
  },
  {
    slug: "scenario-planning",
    title: "Scenario Planning",
    tagline: "Test what happens if enrollment drops or rent goes up.",
    Icon: SlidersHorizontal,
  },
  {
    slug: "debt-analysis",
    title: "Debt Analysis",
    tagline: "Model facility financing with DSCR built in.",
    Icon: Landmark,
  },
  {
    slug: "budgeting-accounting-guidance",
    title: "Budgeting & Accounting Guidance",
    tagline: "Coaching, benchmarks, and explainers right in the model.",
    Icon: Compass,
  },
];
