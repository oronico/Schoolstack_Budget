import type { FullModelData } from "@/pages/model-wizard/schema";
import type { GuidanceLevel } from "@/lib/coaching/explainers";
import { LOADED_COST_MULTIPLIER } from "@workspace/finance";

export interface MicroLesson {
  id: string;
  title: string;
  body: string;
  readTimeSeconds: number;
  triggerStep: number;
  checkTrigger: (data: FullModelData) => boolean;
  extraOnly?: boolean;
}

const DISMISSED_KEY = "schoolstack_micro_lessons_dismissed";

export function getDismissedLessons(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function dismissLesson(id: string): void {
  const dismissed = getDismissedLessons();
  dismissed.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
}

export const MICRO_LESSONS: MicroLesson[] = [
  {
    id: "budget_vs_cash_flow",
    title: "Your Budget Isn't Your Cash Flow",
    body: "Here's something we see trip up a lot of first-time founders: a balanced annual budget doesn't mean you'll have money in the bank every month. Revenue often arrives in chunks (tuition payments, grant disbursements), while expenses like rent and payroll happen every month. Many schools with healthy annual budgets still face cash crunches in specific months. I'd encourage you to think about when money arrives, not just how much. — SchoolStack Team",
    readTimeSeconds: 30,
    triggerStep: 4,
    checkTrigger: (data) => {
      const rows = data.revenueRows || [];
      return rows.some((r) => r.enabled);
    },
  },
  {
    id: "realistic_enrollment",
    title: "What Makes Enrollment Realistic?",
    body: "Most new schools fill 40-65% of capacity in Year 1. Year-over-year growth of 15-25% is strong. The best evidence for your projections: signed letters of intent, waitlist depth, community survey data, and comparable schools in your area. Lenders don't just want a number — they want to know why you believe it. We'd recommend documenting your evidence early. — SchoolStack Team",
    readTimeSeconds: 25,
    triggerStep: 3,
    checkTrigger: (data) => {
      const programs = data.programs || [];
      if (programs.some((p) => (p.year1 || 0) > 0)) return true;
      return (data.enrollment?.year1 || 0) > 0;
    },
  },
  {
    id: "timing_matters",
    title: "Why Timing Matters for Your Budget",
    body: "Even if your annual revenue covers all expenses, you might not have cash when you need it. Payroll is due every two weeks. Rent is due every month. But tuition might arrive over 10 months and grants come quarterly. I'd plan for when money moves, not just the annual total. This is the difference between a budget that looks good on paper and one that actually works — and we've seen many strong schools stumble here. — SchoolStack Team",
    readTimeSeconds: 30,
    triggerStep: 4,
    checkTrigger: (data) => {
      const rows = data.revenueRows || [];
      return rows.filter((r) => r.enabled).length >= 2;
    },
  },
  {
    id: "fixed_vs_variable",
    title: "Fixed vs. Variable Costs",
    body: "Some costs stay the same regardless of how many students enroll (rent, insurance, leadership salaries). Others grow with enrollment (supplies per student, food service). When building your budget, knowing the difference matters. If enrollment falls short, your fixed costs don't shrink — but your variable cost savings won't be enough to close the gap. I'd keep this distinction in mind as you build out your expense plan. — SchoolStack Team",
    readTimeSeconds: 25,
    triggerStep: 6,
    checkTrigger: (data) => {
      const rows = data.expenseRows || [];
      return rows.filter((r) => r.enabled).length >= 2;
    },
  },
  {
    id: "staffing_biggest_cost",
    title: "Staffing Is Your Biggest Lever",
    body: "Personnel typically accounts for 50-65% of a school's budget. That means your staffing plan is really your financial plan. Every additional hire before you have the enrollment to support it reduces your margin. We'd recommend phasing roles in as enrollment grows — start lean and add staff as demand proves out. This is one of the most impactful decisions you'll make. — SchoolStack Team",
    readTimeSeconds: 25,
    triggerStep: 5,
    checkTrigger: (data) => {
      const positions = data.staffingRows || [];
      return positions.length >= 2;
    },
  },
  {
    id: "negative_cash_detected",
    title: "Your Cash Goes Negative — Here's What to Do",
    body: "Your model is projecting negative cash in at least one year. Don't worry — this doesn't mean your school can't work. It means the current plan needs adjusting. Common fixes we recommend: reduce Year 1 staffing, secure a line of credit or startup grant, delay non-essential purchases, or phase your facility plan. Small changes in timing can make a big difference, and most founders go through several iterations before the numbers line up. — SchoolStack Team",
    readTimeSeconds: 30,
    triggerStep: 7,
    checkTrigger: (data) => {
      const rows = data.revenueRows || [];
      const staffing = data.staffingRows || [];
      const expenses = data.expenseRows || [];
      let y1Rev = 0;
      for (const r of rows) {
        if (r.enabled) y1Rev += r.amounts?.[0] ?? 0;
      }
      let y1Staff = 0;
      for (const s of staffing) {
        y1Staff += (s.fte || 0) * (s.annualizedRate || 0) * LOADED_COST_MULTIPLIER;
      }
      let y1Exp = 0;
      for (const e of expenses) {
        if (e.enabled) y1Exp += e.amounts?.[0] ?? 0;
      }
      return y1Rev > 0 && (y1Rev - y1Staff - y1Exp) < 0;
    },
  },
  {
    id: "retention_compounding_extra",
    title: "The Math of Retention: 90% vs 80% Over 5 Years",
    body: "Here's a concrete example: you start with 100 students and want to stay at 100 each year. At 90% retention: 90 return in Year 2, so you recruit 10 new. Year 3: 90 return, recruit 10. Over 4 years you recruit 40 total new students. At 80% retention: 80 return in Year 2, recruit 20 new. Year 3: 80 return, recruit 20. Over 4 years you recruit 80 total — double the effort. At $500/student acquisition cost, that's $20K vs $40K in recruitment alone. Retention isn't just a quality metric — it's a financial lever. — SchoolStack Team",
    readTimeSeconds: 40,
    triggerStep: 3,
    extraOnly: true,
    checkTrigger: (data) => {
      const programs = data.programs || [];
      if (programs.some((p) => (p.year1 || 0) > 0)) return true;
      return (data.enrollment?.year1 || 0) > 0;
    },
  },
  {
    id: "staffing_pct_extra",
    title: "Staffing Cost at Different Scales",
    body: "Let's see how staffing percentage changes with enrollment. At 60 students ($600K revenue) with 7 staff ($455K loaded): staffing = 76% of revenue — danger zone. At 80 students ($800K revenue) with 8 staff ($520K loaded): staffing = 65% — improving. At 100 students ($1M revenue) with 9 staff ($585K loaded): staffing = 59% — healthy. At 120 students ($1.2M revenue) with 10 staff ($650K loaded): staffing = 54% — excellent. Notice: each cohort of 20 students drops staffing percentage by ~6 points because revenue grows faster than staffing. This is why enrollment is your biggest financial lever. — SchoolStack Team",
    readTimeSeconds: 45,
    triggerStep: 5,
    extraOnly: true,
    checkTrigger: (data) => {
      const positions = data.staffingRows || [];
      return positions.length >= 3;
    },
  },
  {
    id: "breakeven_math_extra",
    title: "Your Break-Even Number: A Worked Example",
    body: "Here's how break-even works in practice. Say your fixed costs are $500K/year (admin salaries, rent, insurance, debt). Your revenue per student is $10,000, and variable costs are $1,500/student (supplies, food, tech). Contribution margin = $10,000 - $1,500 = $8,500. Break-even = $500K ÷ $8,500 = 59 students. At 60 students you have a $8,500 surplus. At 80 students: surplus = $178,500. At 50 students: deficit = -$76,500. Every student above 59 adds $8,500 to your bottom line. Every student below costs you $8,500. This is why knowing your break-even number is essential. — SchoolStack Team",
    readTimeSeconds: 45,
    triggerStep: 7,
    extraOnly: true,
    checkTrigger: (data) => {
      const rows = data.revenueRows || [];
      const staffing = data.staffingRows || [];
      return rows.some((r) => r.enabled) && staffing.length >= 2;
    },
  },
  {
    id: "cash_timing_extra",
    title: "Monthly Cash Flow: Why August Is Dangerous",
    body: "Here's a real scenario: Monthly expenses are $70K (mostly payroll and rent — they don't pause in summer). Revenue arrives over 10 months (Sept-June) at $84K/month = $840K annually. July expenses: $70K, revenue: $0. August expenses: $70K, revenue: $0. That's $140K out with $0 in. If you start July with $100K cash, you'll be -$40K by September 1st — payday for your teachers. You need at least $140K in starting cash just to survive the summer gap. Budget $200K+ for comfort. This catches first-time founders every year. — SchoolStack Team",
    readTimeSeconds: 40,
    triggerStep: 4,
    extraOnly: true,
    checkTrigger: (data) => {
      const rows = data.revenueRows || [];
      return rows.filter((r) => r.enabled).length >= 1;
    },
  },
];

export function getTriggeredLessons(data: FullModelData, currentStep: number, level?: GuidanceLevel): MicroLesson[] {
  const dismissed = getDismissedLessons();
  return MICRO_LESSONS.filter(
    (lesson) =>
      lesson.triggerStep === currentStep &&
      !dismissed.has(lesson.id) &&
      (!lesson.extraOnly || level === "extra") &&
      lesson.checkTrigger(data)
  );
}
