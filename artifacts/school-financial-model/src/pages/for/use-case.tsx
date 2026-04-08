import { Link, useParams } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { getUseCaseBySlug } from "@/data/use-case-pages";
import { motion } from "framer-motion";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-50px" } as const,
};

export function UseCasePage() {
  const params = useParams<{ type: string }>();
  const page = getUseCaseBySlug(params.type || "");

  if (!page) {
    return (
      <Layout>
        <SEOHead title="Page Not Found" noIndex />
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="text-center max-w-md">
            <h1 className="font-display text-3xl font-bold text-[#1E293B] mb-3">
              Page not found
            </h1>
            <p className="text-[#1E293B]/60 mb-8">
              The page you're looking for doesn't exist.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[#328555] font-semibold hover:underline"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEOHead
        title={page.seoTitle}
        description={page.seoDescription}
        path={`/for/${page.slug}`}
      />

      <section className="relative pt-20 pb-24 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-40 -mt-40 w-96 h-96 bg-[#328555]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-[500px] h-[500px] bg-[#328555]/10 rounded-full blur-3xl" />

        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <motion.div {...fadeUp} transition={{ duration: 0.6 }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#328555]/10 text-[#328555] font-bold text-sm mb-6">
              {page.badge}
            </div>

            <h1 className="font-display text-4xl md:text-5xl font-bold text-[#1E293B] leading-tight mb-6">
              {page.headline}{" "}
              <span className="text-[#328555]">{page.headlineAccent}</span>
            </h1>

            <p className="text-lg text-[#1E293B]/70 mb-10 leading-relaxed max-w-2xl">
              {page.subheadline}
            </p>

            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-[#328555] hover:bg-[#276844] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-[#328555]/20"
            >
              {page.ctaText}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="py-20 bg-white border-y border-[#1E293B]/5">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-14"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              Built for exactly this.
            </h2>
            <p className="text-lg text-[#1E293B]/60 max-w-2xl mx-auto">
              Every feature designed around the way your school actually works.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-8">
            {page.features.map((feature, i) => (
              <motion.div
                key={i}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-[#FAF9F7] p-8 rounded-2xl border border-[#1E293B]/5"
              >
                <div className="w-14 h-14 bg-white rounded-xl shadow-sm flex items-center justify-center mb-5">
                  {feature.icon}
                </div>
                <h3 className="font-display text-xl font-bold text-[#1E293B] mb-3">
                  {feature.title}
                </h3>
                <p className="text-[#1E293B]/60 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-[#FAF9F7]">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              What you get.
            </h2>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white p-8 rounded-2xl border border-[#1E293B]/5 shadow-sm"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              {page.audienceBenefits.map((benefit, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 text-[#1E293B]/70 leading-relaxed"
                >
                  <CheckCircle2 className="w-5 h-5 text-[#328555] shrink-0 mt-0.5" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 bg-white border-t border-[#1E293B]/5">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              {page.closingHeadline}
            </h2>
            <p className="text-lg text-[#1E293B]/60 mb-10 leading-relaxed max-w-2xl mx-auto">
              {page.closingText}
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-[#328555] hover:bg-[#276844] text-white px-8 py-4 rounded-xl font-bold text-lg transition shadow-lg shadow-[#328555]/20"
            >
              {page.closingCta}
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
