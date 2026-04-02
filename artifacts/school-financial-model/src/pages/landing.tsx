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
    title: "Get your CFO\u2019s take.",
    desc: "Budget analyzes your model and gives you specific, practical recommendations. Not generic advice. Guidance based on YOUR numbers.",
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#328555]/10 text-[#328555] font-bold text-sm mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#328555] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#328555]" />
                </span>
                FREE DURING BETA
              </div>

              <h1 className="font-display text-5xl md:text-6xl font-bold text-[#1E293B] leading-tight mb-6">
                Every school deserves a{" "}
                <span className="text-[#328555]">clear financial plan.</span>
              </h1>

              <p className="text-lg text-[#1E293B]/70 mb-10 leading-relaxed max-w-2xl">
                You started a school because you're a great educator, not because you love spreadsheets.
                SchoolStack Budget walks you through a 5-year financial model, step by step, in plain English.
                When you're done, you'll actually understand your numbers.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/underwriting"
                  className="bg-[#328555] hover:bg-[#276844] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-[#328555]/20 flex items-center justify-center gap-2"
                >
                  Build My Budget
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
                desc: "How many students? What do you charge? What do you pay your teachers? You already know more than you think. The wizard turns what's in your head into a real financial model.",
              },
              {
                icon: <MessageCircle className="w-8 h-8 text-[#328555]" />,
                title: "A CFO who speaks your language.",
                desc: "Budget tells you what your numbers mean. Where you're healthy, where you're at risk, and what to do about it. No jargon. No judgment. Just clear, practical guidance.",
              },
              {
                icon: <Download className="w-8 h-8 text-[#0D9488]" />,
                title: "Take it with you.",
                desc: "Download a Lender-Ready Packet, a Board Summary, a Formula Workbook, or a full Underwriting Package. Share a read-only link with your funder or authorizer. For your board meeting, your bank, or just your own peace of mind.",
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
                You don't have a CFO. You might not even have a bookkeeper. You're making financial
                decisions every week that determine whether your school survives or doesn't.
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
            <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
              About an hour. No credit card. No spreadsheet experience required.
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
