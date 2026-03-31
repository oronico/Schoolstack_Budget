import type { FullModelData } from "@/pages/model-wizard/schema";
import { LOADED_COST_MULTIPLIER } from "@workspace/finance";

export interface MicroLesson {
  id: string;
  title: string;
  body: string;
  readTimeSeconds: number;
  triggerStep: number;
  checkTrigger: (data: FullModelData) => boolean;
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
    body: "A balanced annual budget doesn't mean you'll have money in the bank every month. Revenue often arrives in chunks (tuition payments, grant disbursements), while expenses like rent and payroll happen every month. Many schools with healthy annual budgets still face cash crunches in specific months. Think about when money arrives, not just how much.",
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
    body: "Most new schools fill 40-65% of capacity in Year 1. Year-over-year growth of 15-25% is strong. The best evidence for your projections: signed letters of intent, waitlist depth, community survey data, and comparable schools in your area. Lenders don't just want a number — they want to know why you believe it.",
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
    body: "Even if your annual revenue covers all expenses, you might not have cash when you need it. Payroll is due every two weeks. Rent is due every month. But tuition might arrive over 10 months and grants come quarterly. Plan for when money moves, not just the annual total. This is the difference between a budget that looks good on paper and one that actually works.",
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
    body: "Some costs stay the same regardless of how many students enroll (rent, insurance, leadership salaries). Others grow with enrollment (supplies per student, food service). When building your budget, know the difference. If enrollment falls short, your fixed costs don't shrink — but your variable cost savings won't be enough to close the gap.",
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
    body: "Personnel typically accounts for 50-65% of a school's budget. This means your staffing plan is really your financial plan. Every additional hire before you have the enrollment to support it reduces your margin. Consider phasing roles in as enrollment grows — start lean and add staff as demand proves out.",
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
    body: "Your model is projecting negative cash in at least one year. This doesn't mean your school can't work — it means the current plan needs adjusting. Common fixes: reduce Year 1 staffing, secure a line of credit or startup grant, delay non-essential purchases, or phase your facility plan. Small changes in timing can make a big difference.",
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
];

export function getTriggeredLessons(data: FullModelData, currentStep: number): MicroLesson[] {
  const dismissed = getDismissedLessons();
  return MICRO_LESSONS.filter(
    (lesson) =>
      lesson.triggerStep === currentStep &&
      !dismissed.has(lesson.id) &&
      lesson.checkTrigger(data)
  );
}
