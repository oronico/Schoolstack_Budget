import { Link } from "wouter";
import {
  Calculator,
  FileSpreadsheet,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Building,
  Briefcase,
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
                Your mission deserves a{" "}
                <span className="text-[#328555]">financial story</span>.
              </h1>

              <p className="text-xl md:text-2xl text-[#1E293B]/70 mb-4 leading-relaxed font-medium">
                For Every K-12 Entrepreneur
              </p>

              <p className="text-lg text-[#1E293B]/60 mb-10 leading-relaxed max-w-2xl">
                Whether you're starting a charter, private school, microschool,
                learning pod, or something entirely new — build a 5-year budget
                that brings your vision to life. No finance degree required.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/underwriting"
                  className="bg-[#D97706] hover:bg-[#B45309] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-[#D97706]/20 flex items-center justify-center gap-2"
                >
                  Build My Model
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

      <section className="py-24 bg-white border-y border-[#1E293B]/5">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              A budget is just the financial story of your mission
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              We all start somewhere. SchoolStack Budget walks you through each
              step — from enrollment to expenses — so you can tell your story
              with confidence.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Calculator className="w-8 h-8 text-[#D97706]" />,
                title: "Guided Wizard",
                desc: "We walk you through enrollment, staffing, and facility planning one step at a time. Your budget is a living document — it gets better every time you revisit it.",
              },
              {
                icon: <FileSpreadsheet className="w-8 h-8 text-[#328555]" />,
                title: "Underwriting Ready",
                desc: "When you're ready, export a polished, multi-tab Excel workbook with real formulas — designed to help lenders and investors see your vision.",
              },
              {
                icon: <ShieldCheck className="w-8 h-8 text-[#0D9488]" />,
                title: "Consultant Guidance",
                desc: "Get friendly, plain-English guidance on your model — with encouragement on what's working and constructive suggestions for areas to strengthen.",
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

      <div id="sample-model">
        <SampleModelShowcase />
      </div>

      <section className="py-24 bg-[#FAF9F7]">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              Built for the moments that matter
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              Every great school started with someone brave enough to take the
              first step. We're here to walk alongside you.
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

      <section className="py-24 bg-[#328555] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#1E293B]/20 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="font-display text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to tell the financial story of your school?
            </h2>
            <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
              Join K-12 entrepreneurs building schools for families. Every great
              school started with someone brave enough to take the first step.
            </p>

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
                Talk to Sales
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
