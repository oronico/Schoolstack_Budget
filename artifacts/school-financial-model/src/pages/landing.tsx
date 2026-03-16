import { Link } from "wouter";
import {
  Calculator,
  LineChart,
  Users,
  Clock,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Settings,
  Download,
  Activity,
  Briefcase,
  Building,
  GraduationCap,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { motion } from "framer-motion";
import { SampleModelShowcase } from "@/components/landing/SampleModelShowcase";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-50px" } as const,
};

export function LandingPage() {
  return (
    <Layout>
      {/* Hero */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 bg-[#328555]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-[500px] h-[500px] bg-[#D97706]/10 rounded-full blur-3xl" />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            <motion.div {...fadeUp} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#328555]/10 text-[#328555] font-bold text-sm mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#328555] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#328555]" />
                </span>
                ALPHA
              </div>

              <h1 className="font-display text-5xl md:text-6xl font-bold text-[#1E293B] leading-tight mb-6">
                Build Your Budget and{" "}
                <span className="text-[#328555]">Financial Model</span>
              </h1>

              <p className="text-xl md:text-2xl text-[#1E293B]/70 mb-4 leading-relaxed font-medium">
                Your budget is the financial story to fuel your mission.
              </p>

              <p className="text-lg text-[#1E293B]/60 mb-10 leading-relaxed max-w-2xl">
                An easy-to-follow, step-by-step guide designed specifically for
                school founders to build robust pro forma and financial models
                without needing a finance degree.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/underwriting"
                  className="bg-[#D97706] hover:bg-[#B45309] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-[#D97706]/20 flex items-center justify-center gap-2"
                >
                  Start Your Budget
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href="#sample-model"
                  className="bg-white hover:bg-gray-50 text-[#1E293B] border border-[#1E293B]/10 px-8 py-4 rounded-xl font-bold text-lg transition flex items-center justify-center"
                >
                  View Sample Model
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* What You'll Build */}
      <section className="py-24 bg-white border-y border-[#1E293B]/5">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              What You'll Build
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              A comprehensive financial package ready for authorizers, lenders,
              and your founding board.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <LineChart className="w-8 h-8 text-[#328555]" />,
                title: "Revenue Projections",
                desc: "Accurate forecasts based on per-pupil funding, categorical grants, and fundraising goals.",
              },
              {
                icon: <Calculator className="w-8 h-8 text-[#D97706]" />,
                title: "Expense Planning",
                desc: "Detailed categorization of instructional, operational, and facility costs.",
              },
              {
                icon: <Users className="w-8 h-8 text-[#0D9488]" />,
                title: "Staffing Model",
                desc: "Salary schedules, benefits, and hiring timelines aligned with enrollment growth.",
              },
              {
                icon: <Clock className="w-8 h-8 text-[#5B7CFA]" />,
                title: "Cash Flow Timeline",
                desc: "Month-by-month cash flow analysis to identify and plan for funding gaps.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-[#FAF9F7] p-8 rounded-2xl border border-[#1E293B]/5 hover:shadow-lg transition group"
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

      {/* Features */}
      <section className="py-24 bg-[#1E293B] text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#328555]/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3" />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="mb-16 md:w-2/3"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Budgeting made for school founders.
            </h2>
            <p className="text-xl text-white/60">
              Stop fighting with broken spreadsheet templates. SchoolStack
              Budget guides you through the process with built-in education
              finance logic.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: <Activity className="w-6 h-6 text-white" />,
                color: "bg-[#328555]",
                title: "Guided Walkthrough",
                desc: "A step-by-step interview process that asks you questions in plain English and translates your answers into financial data.",
              },
              {
                icon: <Settings className="w-6 h-6 text-white" />,
                color: "bg-[#D97706]",
                title: "Smart Defaults",
                desc: "Start with pre-populated assumptions based on school benchmarks for your state and region.",
              },
              {
                icon: <FileSpreadsheet className="w-6 h-6 text-white" />,
                color: "bg-[#0D9488]",
                title: "Real-Time Modeling",
                desc: "Change an assumption—like student enrollment or teacher salaries—and instantly see how it ripples through your entire budget.",
              },
              {
                icon: <Download className="w-6 h-6 text-white" />,
                color: "bg-[#5B7CFA]",
                title: "Export Ready",
                desc: "Generate professional, presentation-ready reports for authorizer meetings, board presentations, and loan applications.",
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="flex gap-6 p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
              >
                <div
                  className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${feature.color}`}
                >
                  {feature.icon}
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-white/60 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Sample Model Showcase */}
      <div id="sample-model">
        <SampleModelShowcase />
      </div>

      {/* Who It's For */}
      <section className="py-24 bg-[#FAF9F7]">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              Built for the crucial moments
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              SchoolStack Budget provides the financial credibility you need
              when it matters most.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <GraduationCap className="w-8 h-8 text-[#328555]" />,
                bg: "bg-[#328555]/10",
                title: "Authorizer Meetings",
                desc: "Demonstrate financial viability and operational competence to secure approval and funding.",
              },
              {
                icon: <Building className="w-8 h-8 text-[#D97706]" />,
                bg: "bg-[#D97706]/10",
                title: "Loan Applications",
                desc: "Provide lenders with the detailed cash flow projections required for facility financing.",
              },
              {
                icon: <Briefcase className="w-8 h-8 text-[#0D9488]" />,
                bg: "bg-[#0D9488]/10",
                title: "Board Presentations",
                desc: "Give your founding board clear, transparent financial models they can confidently stand behind.",
              },
            ].map((card, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-white p-8 rounded-2xl shadow-sm border border-[#1E293B]/5 flex flex-col items-center text-center"
              >
                <div
                  className={`w-16 h-16 rounded-full ${card.bg} flex items-center justify-center mb-6`}
                >
                  {card.icon}
                </div>
                <h3 className="font-display text-xl font-bold text-[#1E293B] mb-3">
                  {card.title}
                </h3>
                <p className="text-[#1E293B]/60">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-sell */}
      <section className="py-20 bg-white border-t border-[#1E293B]/5">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <p className="text-sm font-bold tracking-widest text-[#1E293B]/40 uppercase mb-4">
              From the SchoolStack Suite
            </p>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[#1E293B] mb-6">
              Connecting your facilities, budget, and project plan.
            </h2>
            <p className="text-lg text-[#1E293B]/60 mb-8">
              SchoolStack Budget works seamlessly alongside SchoolStack Space
              (facility planning) and the flagship SchoolStack project
              management platform to keep your entire founding journey aligned.
            </p>
            <div className="flex justify-center gap-4 text-sm font-bold">
              <span className="flex items-center gap-2 text-[#5B7CFA]">
                <CheckCircle2 className="w-4 h-4" /> Space
              </span>
              <span className="flex items-center gap-2 text-[#328555]">
                <CheckCircle2 className="w-4 h-4" /> Budget
              </span>
              <span className="flex items-center gap-2 text-[#D97706]">
                <CheckCircle2 className="w-4 h-4" /> Project
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-[#328555] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#1E293B]/20 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to tell your financial story?
            </h2>
            <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
              Join the Alpha program today and be among the first founders to
              build a better budget with SchoolStack.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/underwriting"
                className="bg-white text-[#328555] hover:bg-gray-50 px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg flex items-center justify-center"
              >
                Build Your First Budget
              </Link>
              <a
                href="mailto:hello@schoolstack.ai"
                className="bg-transparent border border-white/30 text-white hover:bg-white/10 px-8 py-4 rounded-xl font-bold text-lg transition flex items-center justify-center"
              >
                Talk to Sales
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
