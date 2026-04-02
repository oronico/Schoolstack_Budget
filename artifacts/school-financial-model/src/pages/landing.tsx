import { lazy, Suspense } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  School,
  Users,
  DollarSign,
  ClipboardList,
  BarChart3,
  MessageCircle,
  Download,
  CheckCircle2,
  Building2,
  SlidersHorizontal,
  Lightbulb,
  RefreshCw,
  Lock,
  BookOpen,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { motion } from "framer-motion";

const SampleModelShowcase = lazy(() =>
  import("@/components/landing/SampleModelShowcase").then(m => ({ default: m.SampleModelShowcase }))
);

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-50px" } as const,
};

const HOW_IT_WORKS = [
  {
    icon: <School className="w-6 h-6" />,
    title: "Tell us about your school.",
    desc: "Charter, private, microschool, pod, co-op, or tutoring center. New or already operating. We adjust everything based on your school type.",
  },
  {
    icon: <DollarSign className="w-6 h-6" />,
    title: "Enter your revenue.",
    desc: "Tuition, ESA funding, charter allocations, grants, donations. We help you think through all of it, including discount tiers and collection timing.",
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: "Plan your team.",
    desc: "Add every role: teachers, admin, support staff, founder salary. Set FTE, benefits, and payroll. Budget shows you what percentage of your spending goes to people, so you can make sure there\u2019s enough left for everything else.",
  },
  {
    icon: <ClipboardList className="w-6 h-6" />,
    title: "Add your costs.",
    desc: "Rent, utilities, curriculum, technology, insurance, marketing. Line by line. Budget flags anything that looks off.",
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "See the whole picture.",
    desc: "Revenue vs. expenses across five years. Where you break even. How much cash you have on hand. Whether your school can sustain itself. All of it, in charts and plain English.",
  },
  {
    icon: <MessageCircle className="w-6 h-6" />,
    title: "See what your numbers are really saying.",
    desc: "Budget analyzes your model and gives you specific, practical recommendations. Not generic advice. Guidance based on YOUR numbers — automatically, as you build.",
  },
  {
    icon: <Download className="w-6 h-6" />,
    title: "Export and share.",
    desc: "Lender-Ready Packet PDF, Board Summary PDF, a 21-tab Underwriting Package, and a Formula Workbook with live Excel math. Or generate a shareable read-only link so your lender or board can view the model online — no login required.",
  },
];

export function LandingPage() {
  return (
    <Layout>
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 bg-[#328555]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-[500px] h-[500px] bg-[#328555]/10 rounded-full blur-3xl" />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            <motion.div {...fadeUp} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#328555]/10 text-[#328555] font-bold text-sm mb-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#328555] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#328555]" />
                </span>
                FREE DURING BETA
              </div>
              <p className="text-sm text-[#1E293B]/50 mb-6">
                Your data stays yours. When pricing launches, you'll get advance notice and the option to export everything.
              </p>

              <h1 className="font-display text-5xl md:text-6xl font-bold text-[#1E293B] leading-tight mb-6">
                Every school deserves a{" "}
                <span className="text-[#328555]">clear financial plan.</span>
              </h1>

              <p className="text-lg text-[#1E293B]/70 mb-10 leading-relaxed max-w-2xl">
                You started a school because you're a great educator, not because you love spreadsheets.
                We help school founders build lender-ready budgets — with a platform that
                makes the math make sense.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/underwriting"
                  className="bg-[#328555] hover:bg-[#276844] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-[#328555]/20 flex items-center justify-center gap-2"
                >
                  Start My Financial Plan
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/login"
                  className="bg-white hover:bg-gray-50 text-[#1E293B] border border-[#1E293B]/10 px-8 py-4 rounded-xl font-bold text-lg transition flex items-center justify-center"
                >
                  Log into existing
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white border-y border-[#1E293B]/5">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              A financial planning platform built for school founders.
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              SchoolStack Budget walks you through every step and makes the math make sense.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5 }}
              className="bg-[#FAF9F7] p-8 rounded-2xl border border-[#1E293B]/5"
            >
              <div className="w-14 h-14 bg-[#328555]/10 rounded-xl flex items-center justify-center mb-5">
                <ClipboardList className="w-7 h-7 text-[#328555]" />
              </div>
              <h3 className="font-display text-xl font-bold text-[#1E293B] mb-3">Guided financial planning</h3>
              <p className="text-[#1E293B]/60 leading-relaxed">
                Our platform walks you through enrollment, revenue, staffing, and expenses — step by step, in plain English. You answer questions about your school; we build a professional 5-year financial model.
              </p>
            </motion.div>
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-[#FAF9F7] p-8 rounded-2xl border border-[#328555]/20 ring-1 ring-[#328555]/10"
            >
              <div className="w-14 h-14 bg-[#D97706]/10 rounded-xl flex items-center justify-center mb-5">
                <MessageCircle className="w-7 h-7 text-[#D97706]" />
              </div>
              <h3 className="font-display text-xl font-bold text-[#1E293B] mb-3">Expert review available — free</h3>
              <p className="text-[#1E293B]/60 leading-relaxed">
                When your model is ready, you can request a review from our school finance advisors. They'll share what's strong, what needs work, and what a lender will look for. Free, no strings — but entirely your choice.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-white border-y border-[#1E293B]/5">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              We'll walk you through the whole thing.
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              No finance degree. No accountant. No 47-tab spreadsheet you inherited
              from someone who left. Just clear steps and honest guidance.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <School className="w-8 h-8 text-[#D97706]" />,
                title: "Start with what you know.",
                desc: "How many students? What do you charge? What do you pay your teachers? You already know more than you think. We turn what you know into a professional financial model.",
              },
              {
                icon: <MessageCircle className="w-8 h-8 text-[#328555]" />,
                title: "Analysis you can actually understand.",
                desc: "Budget flags where you're healthy, where you're at risk, and what to do about it. No jargon. No judgment. Just clear, practical guidance — built right into the platform.",
              },
              {
                icon: <CheckCircle2 className="w-8 h-8 text-[#0D9488]" />,
                title: "Expert review when you want it.",
                desc: "Once your model is complete, you can request a free review from our school finance team. They'll tell you what looks strong, what needs work, and what a lender will ask about. Totally optional — your model stands on its own.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-[#FAF9F7] p-8 rounded-2xl border border-[#1E293B]/5 hover:shadow-lg transition group flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h3 className="font-display text-xl font-bold text-[#1E293B] mb-3">
                  {item.title}
                </h3>
                <p className="text-[#1E293B]/60 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-[#FAF9F7]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              What you'll build in about an hour.
            </h2>
          </motion.div>

          <div className="space-y-6">
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="flex items-start gap-5 bg-white p-6 rounded-2xl border border-[#1E293B]/5 shadow-sm"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#328555]/10 text-[#328555] shrink-0 font-display font-bold text-lg">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-[#1E293B] mb-1">
                    {step.title}
                  </h3>
                  <p className="text-[#1E293B]/60 leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white border-t border-[#1E293B]/5">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              Budget coaches you while you build.
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              You're never guessing alone. Context-specific guidance appears right when you need it.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.4 }}
              className="bg-[#FAF9F7] p-6 rounded-2xl border border-[#1E293B]/5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center shrink-0">
                  <Lightbulb className="w-6 h-6 text-[#D97706]" />
                </div>
                <h3 className="font-display font-bold text-lg text-[#1E293B]">
                  Inline explainers
                </h3>
              </div>
              <p className="text-[#1E293B]/60 leading-relaxed text-sm">
                Entering salaries? We'll show you that most schools spend 50–60% on staffing, right next to the input.
                Setting tuition? You'll see what similar schools charge. Every section has contextual guidance
                that helps you make confident decisions — like having a consultant sitting next to you.
              </p>
            </motion.div>
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="bg-[#FAF9F7] p-6 rounded-2xl border border-[#1E293B]/5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6 text-[#328555]" />
                </div>
                <h3 className="font-display font-bold text-lg text-[#1E293B]">
                  Plain-English explanations
                </h3>
              </div>
              <p className="text-[#1E293B]/60 leading-relaxed text-sm">
                What does DSCR mean? Why do lenders care about your staffing ratio?
                Budget explains every metric in language you actually understand — what it means,
                why it matters, what's healthy vs. risky, and what to do about it.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-[#FAF9F7]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              What if things don't go perfectly?
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              The best financial plans aren't the optimistic ones. They're the ones
              that have already accounted for what could go wrong.
            </p>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white p-8 rounded-2xl border border-[#1E293B]/5 shadow-sm mb-8"
          >
            <div className="flex items-start gap-5">
              <div className="w-12 h-12 rounded-xl bg-[#D97706]/10 flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-6 h-6 text-[#D97706]" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-[#1E293B] mb-3">
                  The What-If Scenario Planner
                </h3>
                <p className="text-[#1E293B]/60 leading-relaxed mb-4">
                  After you build your base model, use sliders to test what happens when assumptions change.
                  Adjust enrollment, tuition, staffing costs, facility expenses, and more — and see the impact
                  on your bottom line instantly.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    "What if enrollment is 20% lower than projected?",
                    "What if you lose a grant you were counting on?",
                    "What if rent goes up 15% after Year 2?",
                    "What if you need to hire an extra teacher?",
                    "What if tuition collection falls short?",
                    "Can your school survive if things don't go perfectly?",
                  ].map((q, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-[#1E293B]/70">
                      <span className="text-[#D97706] shrink-0 mt-0.5">&#x2022;</span>
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-white p-8 rounded-2xl border border-[#1E293B]/5 shadow-sm"
          >
            <div className="flex items-start gap-5">
              <div className="w-12 h-12 rounded-xl bg-[#0D9488]/10 flex items-center justify-center shrink-0">
                <BarChart3 className="w-6 h-6 text-[#0D9488]" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-[#1E293B] mb-3">
                  Compare scenarios side by side
                </h3>
                <p className="text-[#1E293B]/60 leading-relaxed">
                  Create multiple scenarios — "Conservative," "Optimistic," "What if we lose the lease" — and
                  compare them against your base model. We show you which metrics improve, which get worse,
                  and give you a clear verdict. It's the analysis that answers: <span className="font-semibold text-[#1E293B]">can
                  my school survive the downside?</span>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-white border-t border-[#1E293B]/5">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              What to have handy before you start.
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              You don't need all of this — estimates work fine for most fields.
              But having these nearby will make the process faster and your model stronger.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                icon: <School className="w-6 h-6 text-[#328555]" />,
                title: "The basics",
                items: [
                  "Your school type (charter, private, micro, pod, etc.)",
                  "What state you're in",
                  "How many students you expect in Year 1",
                  "Your building capacity",
                ],
              },
              {
                icon: <DollarSign className="w-6 h-6 text-[#D97706]" />,
                title: "Revenue & funding",
                items: [
                  "Tuition rate (or an estimate)",
                  "Per-pupil funding amount (charter schools)",
                  "Any grants or donations you expect",
                  "ESA or voucher amounts (if applicable)",
                ],
              },
              {
                icon: <Users className="w-6 h-6 text-[#0D9488]" />,
                title: "Your team",
                items: [
                  "Roles you plan to hire (teachers, admin, etc.)",
                  "Salary ranges for each role",
                  "Full-time vs. part-time vs. contract",
                ],
              },
              {
                icon: <Building2 className="w-6 h-6 text-[#1E293B]" />,
                title: "Your space & costs",
                items: [
                  "Monthly rent or mortgage payment",
                  "Lease terms (if you have them)",
                  "Estimates for insurance, utilities, curriculum",
                  "Any loans or debt you're planning",
                ],
              },
            ].map((group, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="bg-[#FAF9F7] p-6 rounded-2xl border border-[#1E293B]/5"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center shrink-0">
                    {group.icon}
                  </div>
                  <h3 className="font-display font-bold text-lg text-[#1E293B]">
                    {group.title}
                  </h3>
                </div>
                <ul className="space-y-2.5">
                  {group.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-[#1E293B]/60 text-sm leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-[#328555]/50 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>

          <motion.p
            {...fadeUp}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="text-center text-sm text-[#1E293B]/40 mt-8"
          >
            Don't have everything? No problem. You can save your progress and come back anytime.
          </motion.p>
        </div>
      </section>

      <div id="sample-model">
        <Suspense fallback={<div className="py-24 bg-white" />}>
          <SampleModelShowcase />
        </Suspense>
      </div>

      <section className="py-24 bg-[#FAF9F7]">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-8 text-center">
              Built for the people actually running the school.
            </h2>
            <div className="text-lg text-[#1E293B]/70 leading-relaxed space-y-6">
              <p>
                You might be a former teacher who just opened a microschool in a strip mall.
                A charter founder three years in who has never been sure if the math actually works.
                A parent who started a learning pod and it grew into something bigger than you expected.
              </p>
              <p>
                You don't have a finance team. You might not even have a bookkeeper. You're making financial
                decisions every week that determine whether your school survives or doesn't.
              </p>
              <p>
                Sometimes the model shows you something difficult. That's the point.
                Better to find out now — while you can adjust your plan, rethink your staffing,
                or renegotiate your lease — than after you've committed. The hard truths are the
                ones that save schools.
              </p>
              <p className="font-semibold text-[#1E293B]">
                SchoolStack Budget was built for you.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 bg-[#FAF9F7] border-t border-[#1E293B]/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <p className="text-sm font-bold tracking-widest text-[#1E293B]/40 uppercase mb-6">
              From the SchoolStack Suite
            </p>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[#1E293B] mb-5">
              Connecting your facilities, budget, and back office.
            </h2>
            <p className="text-lg text-[#1E293B]/60 mb-10 max-w-2xl mx-auto">
              SchoolStack Space works alongside <span className="font-semibold text-[#1E293B]">SchoolStack Budget</span> (financial modeling) and the
              flagship <a href="https://schoolstack.ai" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#D97706] hover:text-[#B45309] transition">SchoolStack</a> back
              office platform to keep your entire founding journey aligned.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
              <a
                href="https://space.schoolstack.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 group"
              >
                <span className="w-7 h-7 rounded-full border-2 border-[#328555] flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[#328555]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                <span className="font-semibold text-[#1E293B] group-hover:text-[#328555] transition text-lg">Space</span>
                <span className="text-sm font-medium text-[#328555]">Beta</span>
              </a>

              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full border-2 border-[#1E293B] flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[#1E293B]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                <span className="font-semibold text-[#1E293B] text-lg">Budget</span>
                <span className="text-sm font-medium text-[#4A7CB8]">Alpha</span>
              </div>

              <a
                href="https://schoolstack.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 group"
              >
                <span className="w-7 h-7 rounded-full border-2 border-[#D97706] flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-[#D97706]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                <span className="font-semibold text-[#1E293B] group-hover:text-[#D97706] transition text-lg">SchoolStack</span>
                <span className="text-sm font-medium text-[#D97706]">Fall 2026</span>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-[#328555] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#1E293B]/20 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-6">
              You already know how to teach.
              <br />
              Let's make sure you know your numbers.
            </h2>
            <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
              About an hour. No credit card. No spreadsheet experience required.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mb-10 text-sm text-white/70">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Save and return anytime — adjust assumptions and re-run your model
              </span>
              <span className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Your model is private. No one sees it unless you share it.
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/underwriting"
                className="bg-white text-[#328555] hover:bg-gray-50 px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg flex items-center justify-center gap-2"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="mailto:hello@schoolstack.ai"
                className="bg-transparent border border-white/30 text-white hover:bg-white/10 px-8 py-4 rounded-xl font-bold text-lg transition flex items-center justify-center"
              >
                Questions? Reach Out
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
