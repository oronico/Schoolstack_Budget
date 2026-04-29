import { Link } from "wouter";
import { ArrowRight, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { SOLUTION_LINK_SUMMARIES, SOLUTION_PAGES } from "@/data/solution-pages";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-50px" } as const,
};

const SEO_TITLE = "All Solutions for School Financial Planning";
const SEO_DESCRIPTION =
  "Browse every SchoolStack Budget capability in one place - single-year and 5-year pro formas, scenario planning, debt analysis, and built-in budgeting guidance.";

export function SolutionsIndexPage() {
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "SchoolStack Budget Capabilities",
    itemListElement: SOLUTION_PAGES.map((page, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: page.seoTitle,
      url: `https://budget.schoolstack.ai/solutions/${page.slug}`,
      description: page.seoDescription,
    })),
  };

  return (
    <Layout>
      <SEOHead
        title={SEO_TITLE}
        description={SEO_DESCRIPTION}
        path="/solutions"
        jsonLd={itemListJsonLd}
      />

      {/* Hero */}
      <section className="relative pt-20 pb-16 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 bg-[#328555]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-[500px] h-[500px] bg-[#328555]/10 rounded-full blur-3xl" />

        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <motion.div {...fadeUp} transition={{ duration: 0.6 }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#328555]/10 text-[#328555] font-bold text-xs mb-6">
              ALL CAPABILITIES
            </div>

            <h1 className="font-display text-4xl md:text-5xl font-bold text-[#1E293B] leading-tight mb-6">
              Everything SchoolStack Budget can do,{" "}
              <span className="text-[#328555]">in one place.</span>
            </h1>

            <p className="text-lg text-[#1E293B]/70 leading-relaxed max-w-2xl">
              Five capabilities that work together as one model - from a Year 1 pro forma to a lender-ready debt analysis - so your numbers stay consistent no matter who is asking the question.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Capability cards */}
      <section className="py-16 bg-white border-y border-[#1E293B]/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-6">
            {SOLUTION_PAGES.map((page, i) => {
              const Icon = page.Icon;
              const summary = SOLUTION_LINK_SUMMARIES.find((s) => s.slug === page.slug);
              const tagline = summary?.tagline ?? "";
              const title = summary?.title ?? page.seoTitle;
              return (
                <motion.div
                  key={page.slug}
                  {...fadeUp}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                >
                  <Link
                    href={`/solutions/${page.slug}`}
                    className="group block h-full rounded-2xl border border-[#1E293B]/10 bg-[#FAF9F7] p-8 hover:border-[#328555]/40 hover:shadow-lg hover:bg-white transition-all"
                    data-testid={`solution-card-${page.slug}`}
                  >
                    <div className="flex items-start gap-5">
                      <div className="w-14 h-14 rounded-xl bg-white border border-[#1E293B]/5 shadow-sm flex items-center justify-center shrink-0">
                        <Icon className="w-7 h-7 text-[#328555]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold tracking-widest text-[#328555] uppercase mb-2">
                          {page.badge}
                        </p>
                        <h2 className="font-display text-xl font-bold text-[#1E293B] mb-2 group-hover:text-[#328555] transition-colors">
                          {title}
                        </h2>
                        <p className="text-sm text-[#1E293B]/70 leading-relaxed mb-4">
                          {tagline}
                        </p>
                        <p className="text-sm text-[#1E293B]/60 leading-relaxed mb-5">
                          {page.subheadline}
                        </p>
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#328555] group-hover:gap-2.5 transition-all">
                          See how it works
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-24 bg-[#FAF9F7] border-t border-[#1E293B]/5">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              One model. Every audience.
            </h2>
            <p className="text-lg text-[#1E293B]/60 mb-10 leading-relaxed max-w-2xl mx-auto">
              Build it once, then export the slice your board, lender, or authorizer wants to see. Free during beta.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-[#328555] hover:bg-[#276844] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-[#328555]/20"
            >
              Start Building Your Model
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
