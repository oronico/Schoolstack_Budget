import { Link } from "wouter";
import { ArrowRight, ChevronRight, HelpCircle } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { motion } from "framer-motion";
import type { SolutionPageData } from "@/data/solution-pages";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-50px" } as const,
};

interface SolutionPageLayoutProps {
  page: SolutionPageData;
}

export function SolutionPageLayout({ page }: SolutionPageLayoutProps) {
  const { Icon } = page;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };

  return (
    <Layout>
      <SEOHead
        title={page.seoTitle}
        description={page.seoDescription}
        path={`/solutions/${page.slug}`}
        jsonLd={jsonLd}
      />

      {/* Hero */}
      <section className="relative pt-20 pb-20 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 bg-[#328555]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-[500px] h-[500px] bg-[#328555]/10 rounded-full blur-3xl" />

        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <motion.div {...fadeUp} transition={{ duration: 0.6 }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#328555]/10 text-[#328555] font-bold text-xs mb-6">
              <Icon className="w-3.5 h-3.5" />
              {page.badge}
            </div>

            <h1 className="font-display text-4xl md:text-5xl font-bold text-[#1E293B] leading-tight mb-6">
              {page.headline}{" "}
              <span className="text-[#328555]">{page.headlineAccent}</span>
            </h1>

            <p className="text-lg text-[#1E293B]/70 mb-6 leading-relaxed max-w-2xl">
              {page.subheadline}
            </p>

            <p className="text-sm text-[#1E293B]/60 mb-10 leading-relaxed max-w-2xl">
              <span className="font-semibold text-[#1E293B]/80">Built for: </span>
              {page.audience}
            </p>

            <Link
              href={page.primaryCta.href}
              className="inline-flex items-center gap-2 bg-[#328555] hover:bg-[#276844] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-[#328555]/20"
            >
              {page.primaryCta.label}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Inside the product */}
      <section className="py-20 bg-white border-y border-[#1E293B]/5">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              A look at what you&apos;ll work with.
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              Faithful previews of the views, charts, and controls you&apos;ll
              use in the product.
            </p>
          </motion.div>

          <motion.div {...fadeUp} transition={{ duration: 0.5, delay: 0.1 }}>
            {page.visuals}
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-[#FAF9F7]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              How it works.
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              {page.steps.length} steps from blank page to a finished view you can
              share.
            </p>
          </motion.div>

          <div className="space-y-4">
            {page.steps.map((step, i) => (
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
                  <p className="text-[#1E293B]/60 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white border-t border-[#1E293B]/5">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              Common questions.
            </h2>
          </motion.div>

          <div className="space-y-4">
            {page.faqs.map((faq, i) => (
              <motion.details
                key={i}
                {...fadeUp}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="group bg-[#FAF9F7] rounded-2xl border border-[#1E293B]/5 overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none hover:bg-[#FAF9F7]/60">
                  <div className="flex items-start gap-3">
                    <HelpCircle className="w-5 h-5 text-[#328555] shrink-0 mt-0.5" />
                    <h3 className="font-display font-semibold text-base text-[#1E293B]">
                      {faq.question}
                    </h3>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#1E293B]/40 shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <p className="text-[#1E293B]/70 leading-relaxed px-5 pb-5 pl-13 text-sm">
                  {faq.answer}
                </p>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-24 bg-[#328555] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#1E293B]/20 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />

        <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">
              {page.closingHeadline}
            </h2>
            <p className="text-lg text-white/80 mb-10 leading-relaxed max-w-2xl mx-auto">
              {page.closingText}
            </p>
            <Link
              href={page.closingCta.href}
              className="inline-flex items-center gap-2 bg-white text-[#328555] hover:bg-gray-50 px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg"
            >
              {page.closingCta.label}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
