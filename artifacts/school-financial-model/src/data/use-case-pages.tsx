import {
  DollarSign,
  Users,
  BarChart3,
  Download,
  MessageCircle,
  CheckCircle2,
  SlidersHorizontal,
  BookOpen,
  TrendingUp,
  FileText,
  Home,
  Lightbulb,
  Target,
  Calculator,
  PiggyBank,
  Handshake,
  ClipboardCheck,
} from "lucide-react";
import { type ReactNode } from "react";

export interface UseCaseFeature {
  icon: ReactNode;
  title: string;
  description: string;
}

export interface UseCasePageData {
  slug: string;
  seoTitle: string;
  seoDescription: string;
  badge: string;
  headline: string;
  headlineAccent: string;
  subheadline: string;
  ctaText: string;
  features: UseCaseFeature[];
  audienceBenefits: string[];
  closingHeadline: string;
  closingText: string;
  closingCta: string;
}

export const USE_CASE_PAGES: UseCasePageData[] = [
  {
    slug: "charter-schools",
    seoTitle: "Charter School Budgeting Software",
    seoDescription:
      "Build lender-ready 5-year financial projections for your charter school. Per-pupil funding models, weighted funding, CSP grant planning, and authorizer-ready exports.",
    badge: "FOR CHARTER SCHOOLS",
    headline: "Financial planning built for",
    headlineAccent: "charter schools.",
    subheadline:
      "Per-pupil funding formulas, weighted allocations, CSP grant planning, and authorizer-ready financial packages - all in one guided platform. No finance degree required.",
    ctaText: "Build My Charter School Budget",
    features: [
      {
        icon: <DollarSign className="w-7 h-7 text-[#328555]" />,
        title: "Per-pupil funding models",
        description:
          "Enter your state's per-pupil allocation and any weighted funding categories. Budget calculates your total revenue based on projected enrollment - year by year, automatically.",
      },
      {
        icon: <Users className="w-7 h-7 text-[#D97706]" />,
        title: "Staffing that scales with enrollment",
        description:
          "Plan your staffing to grow with your school. Add teachers and staff as enrollment ramps up, and see how your staffing ratio compares to healthy benchmarks.",
      },
      {
        icon: <BarChart3 className="w-7 h-7 text-[#0D9488]" />,
        title: "Break-even and DSCR analysis",
        description:
          "Know exactly how many students you need to cover costs, and whether your projected cash flow can support debt service. These are the numbers your authorizer will ask for.",
      },
      {
        icon: <Download className="w-7 h-7 text-[#328555]" />,
        title: "Authorizer-ready exports",
        description:
          "Export a Lender Conversation Snapshot PDF, Board and Funder Summary, 23-tab Founder Planning Workbook, and 5-Year Financial Model with live Excel math. Everything your authorizer needs in one click.",
      },
    ],
    audienceBenefits: [
      "State-aware per-pupil funding that adjusts to your enrollment projections",
      "Weighted funding support for special education, ELL, and Title I students",
      "CSP grant planning with time-limited revenue modeling",
      "Facility cost planning - because charter schools typically fund their own space",
      "Cash flow timing that accounts for quarterly or delayed state payments",
      "What-If scenarios to stress-test enrollment, funding delays, and cost overruns",
    ],
    closingHeadline: "Your authorizer expects a professional financial model.",
    closingText:
      "SchoolStack Budget helps you build one - with the metrics, formatting, and depth that demonstrate financial readiness. Free during beta.",
    closingCta: "Start My Charter School Budget",
  },
  {
    slug: "microschools",
    seoTitle: "Microschool Financial Planning Software",
    seoDescription:
      "Build a sustainable financial plan for your microschool or learning pod. Tuition modeling, ESA funding, lean staffing, and break-even analysis - all guided, step by step.",
    badge: "FOR MICROSCHOOLS & PODS",
    headline: "A financial plan your",
    headlineAccent: "microschool can grow on.",
    subheadline:
      "Microschools run lean - which means every dollar matters more. Budget helps you set the right tuition, plan your staffing, and see exactly what it takes to be sustainable.",
    ctaText: "Build My Microschool Budget",
    features: [
      {
        icon: <Home className="w-7 h-7 text-[#328555]" />,
        title: "Tuition and ESA revenue modeling",
        description:
          "Set your tuition rate, model financial aid tiers, and include ESA funding for eligible students. Budget shows you total revenue across five years based on your enrollment plan.",
      },
      {
        icon: <Users className="w-7 h-7 text-[#D97706]" />,
        title: "Lean staffing that makes sense",
        description:
          "Model your lead teacher, assistant, and founder salary. See what percentage of revenue goes to people - and whether there's enough left for everything else.",
      },
      {
        icon: <Calculator className="w-7 h-7 text-[#0D9488]" />,
        title: "Break-even with small numbers",
        description:
          "When you serve 15–50 students, losing even a few changes everything. Budget calculates your break-even enrollment so you know exactly where your floor is.",
      },
      {
        icon: <PiggyBank className="w-7 h-7 text-[#328555]" />,
        title: "Reserve planning from day one",
        description:
          "See how quickly you can build 30, 60, or 90 days of operating reserves. Budget tracks your projected cash position so you can plan for the unexpected.",
      },
    ],
    audienceBenefits: [
      "Designed for schools serving 10–50 students - not scaled-down versions of big-school tools",
      "Flexible facility cost modeling for home-based, church, co-working, or leased spaces",
      "ESA and voucher revenue support for states with school choice programs",
      "Summer camp and enrichment revenue planning for year-round sustainability",
      "Founder salary planning - because you need to pay yourself too",
      "Simple exports for board discussions or personal financial planning",
    ],
    closingHeadline: "Small school. Big clarity.",
    closingText:
      "Your microschool deserves the same financial planning tools that larger schools have - just designed for your scale. SchoolStack Budget makes it easy. Free during beta.",
    closingCta: "Start My Microschool Budget",
  },
  {
    slug: "private-schools",
    seoTitle: "Private School Budget & Financial Modeling Software",
    seoDescription:
      "Build professional 5-year financial projections for your private school. Tuition modeling, financial aid planning, staffing analysis, and lender-ready export packages.",
    badge: "FOR PRIVATE SCHOOLS",
    headline: "Professional financial modeling for",
    headlineAccent: "private schools.",
    subheadline:
      "Whether you're launching a new private school or strengthening an existing one, Budget helps you build the financial model that lenders, boards, and families expect to see.",
    ctaText: "Build My Private School Budget",
    features: [
      {
        icon: <DollarSign className="w-7 h-7 text-[#328555]" />,
        title: "Tuition and financial aid modeling",
        description:
          "Set tuition rates with annual escalation, model multiple tuition tiers, and build in financial aid and scholarship programs. Budget shows net tuition revenue after discounts.",
      },
      {
        icon: <FileText className="w-7 h-7 text-[#D97706]" />,
        title: "Lender-ready financial packages",
        description:
          "Export everything a lender needs: 5-year projections, staffing plans, cash flow analysis, DSCR calculations, and a 5-Year Financial Model with live Excel formulas.",
      },
      {
        icon: <TrendingUp className="w-7 h-7 text-[#0D9488]" />,
        title: "Multi-year growth planning",
        description:
          "Model enrollment growth across grade levels, plan for facility expansion, and see how your school's financial health improves as you reach capacity.",
      },
      {
        icon: <MessageCircle className="w-7 h-7 text-[#328555]" />,
        title: "Built-in financial analysis",
        description:
          "Budget analyzes your model automatically - flagging where you're strong, where you need attention, and what a lender or board member will focus on.",
      },
    ],
    audienceBenefits: [
      "Multi-tier tuition modeling with financial aid, sibling discounts, and payment plans",
      "Endowment and donation revenue planning alongside tuition",
      "Competitive salary benchmarking to attract and retain great teachers",
      "Capital expenditure planning for facilities, technology, and campus improvements",
      "Board-ready summary reports that communicate financial health clearly",
      "What-If scenarios for enrollment shortfalls, tuition increases, and cost changes",
    ],
    closingHeadline: "The financial model your school's future depends on.",
    closingText:
      "Private school financial planning shouldn't require a CFO. SchoolStack Budget gives you the tools to build a professional, lender-ready model - step by step. Free during beta.",
    closingCta: "Start My Private School Budget",
  },
  {
    slug: "school-founders",
    seoTitle: "Financial Planning for First-Time School Founders",
    seoDescription:
      "New to school finance? SchoolStack Budget walks first-time founders through enrollment, revenue, staffing, and expenses - step by step, in plain English.",
    badge: "FOR SCHOOL FOUNDERS",
    headline: "You started a school because you're a great educator.",
    headlineAccent: "We'll handle the spreadsheet.",
    subheadline:
      "Building a financial model feels overwhelming when you've never done it before. Budget walks you through every step, explains everything in plain English, and gives you a professional result you can share with confidence.",
    ctaText: "Start My Financial Plan",
    features: [
      {
        icon: <BookOpen className="w-7 h-7 text-[#328555]" />,
        title: "Guided, step-by-step planning",
        description:
          "Budget asks you questions about your school - enrollment, tuition, staffing, expenses - and builds a 5-year financial model from your answers. No spreadsheet experience required.",
      },
      {
        icon: <Lightbulb className="w-7 h-7 text-[#D97706]" />,
        title: "Contextual coaching at every step",
        description:
          "Not sure what to enter? Every section includes benchmarks, explainers, and practical guidance. It's like having a financial advisor sitting next to you.",
      },
      {
        icon: <SlidersHorizontal className="w-7 h-7 text-[#0D9488]" />,
        title: "Test your assumptions",
        description:
          "The What-If Scenario Planner lets you adjust enrollment, costs, and revenue with sliders - and see instantly whether your school can survive the downside.",
      },
      {
        icon: <CheckCircle2 className="w-7 h-7 text-[#328555]" />,
        title: "Expert review when you're ready",
        description:
          "When your model is complete, you can request a free review from our school finance team. They'll tell you what's strong, what needs work, and what a lender will ask about.",
      },
    ],
    audienceBenefits: [
      "No finance background needed - Budget explains every concept as you go",
      "Works for charter schools, private schools, microschools, pods, and co-ops",
      "Save your progress and come back anytime - your model is always here",
      "Professional exports that make you look prepared (because you are)",
      "Inline benchmarks so you know if your numbers are in a healthy range",
      "A clear path from blank page to complete financial model in about an hour",
    ],
    closingHeadline: "Every founder starts somewhere.",
    closingText:
      "You don't need a finance degree. You don't need an accountant. You just need to start - and SchoolStack Budget will walk you through the rest. Free during beta.",
    closingCta: "Start My Financial Plan",
  },
  {
    slug: "lenders",
    seoTitle: "School Financial Modeling for Lenders & CDFIs",
    seoDescription:
      "SchoolStack Budget helps your borrowers build professional, consistent financial models - so you get the underwriting data you need, in the format you expect.",
    badge: "FOR LENDERS & CDFIs",
    headline: "Better borrower financials.",
    headlineAccent: "Less back-and-forth.",
    subheadline:
      "When your borrowers use SchoolStack Budget, they arrive with professional 5-year projections, consistent formatting, and the key metrics you need to underwrite - DSCR, break-even enrollment, cash reserves, and staffing ratios.",
    ctaText: "Recommend to Your Borrowers",
    features: [
      {
        icon: <ClipboardCheck className="w-7 h-7 text-[#328555]" />,
        title: "Consistent, structured financials",
        description:
          "Every model follows the same professional format - 5-year projections, documented assumptions, and standardized metrics. No more deciphering homegrown spreadsheets.",
      },
      {
        icon: <Target className="w-7 h-7 text-[#D97706]" />,
        title: "Key metrics calculated automatically",
        description:
          "DSCR, break-even enrollment, net margin, staffing ratio, and days of cash on hand - all calculated from the borrower's actual inputs, not estimates.",
      },
      {
        icon: <Download className="w-7 h-7 text-[#0D9488]" />,
        title: "Lender Conversation Snapshot exports",
        description:
          "Borrowers export a complete planning package: Lender Conversation Snapshot PDF, 23-tab Founder Planning Workbook with live formulas, Board and Funder Summary, and documented assumptions.",
      },
      {
        icon: <Handshake className="w-7 h-7 text-[#328555]" />,
        title: "Shareable read-only links",
        description:
          "Borrowers can generate a secure, read-only link to their model. Review the full financial projection online - no login required, no file transfers.",
      },
    ],
    audienceBenefits: [
      "Standardized financial format across all borrower applications",
      "DSCR, break-even, and cash reserve metrics calculated from actual inputs",
      "23-tab Excel workbook with transparent, auditable formulas",
      "Sensitivity analysis showing how borrower financials perform under stress",
      "Shareable read-only links for quick team review without file management",
      "Free for borrowers - reducing barriers to quality financial submissions",
    ],
    closingHeadline: "Spend less time chasing numbers. More time making decisions.",
    closingText:
      "Recommend SchoolStack Budget to your borrowers. They get guided financial planning. You get consistent, professional underwriting data. Everyone saves time.",
    closingCta: "Recommend to Your Borrowers",
  },
];

export function getUseCaseBySlug(slug: string): UseCasePageData | undefined {
  return USE_CASE_PAGES.find((p) => p.slug === slug);
}
