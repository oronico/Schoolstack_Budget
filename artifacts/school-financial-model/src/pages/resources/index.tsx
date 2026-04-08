import { useState } from "react";
import { Link } from "wouter";
import { Clock, ArrowRight } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { ARTICLES, CATEGORIES, type ArticleCategory } from "@/data/articles";

export function ResourcesPage() {
  const [activeCategory, setActiveCategory] = useState<ArticleCategory | "All">("All");

  const filtered =
    activeCategory === "All"
      ? ARTICLES
      : ARTICLES.filter((a) => a.category === activeCategory);

  return (
    <Layout>
      <SEOHead
        title="Resources"
        description="Free guides and articles on school budgeting, financial modeling, charter funding, and everything school founders need to build a sustainable school."
        path="/resources"
      />

      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-[#1E293B] mb-4">
              Resources for School Founders
            </h1>
            <p className="text-lg text-[#1E293B]/60 leading-relaxed">
              Practical guides on budgeting, financial planning, and everything
              you need to build a school that lasts. Written for educators, not
              accountants.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mb-10">
            <button
              onClick={() => setActiveCategory("All")}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeCategory === "All"
                  ? "bg-[#328555] text-white"
                  : "bg-[#FAF9F7] text-[#1E293B]/60 hover:text-[#1E293B] border border-[#1E293B]/10"
              }`}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  activeCategory === cat
                    ? "bg-[#328555] text-white"
                    : "bg-[#FAF9F7] text-[#1E293B]/60 hover:text-[#1E293B] border border-[#1E293B]/10"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {filtered.map((article) => (
              <Link
                key={article.slug}
                href={`/resources/${article.slug}`}
                className="group bg-white rounded-2xl border border-[#1E293B]/5 p-6 hover:shadow-lg hover:border-[#328555]/20 transition-all duration-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex px-2.5 py-1 rounded-full bg-[#328555]/10 text-[#328555] text-xs font-semibold">
                    {article.category}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[#1E293B]/40">
                    <Clock className="w-3 h-3" />
                    {article.readTimeMinutes} min read
                  </span>
                </div>
                <h2 className="font-display text-lg font-bold text-[#1E293B] mb-2 group-hover:text-[#328555] transition-colors">
                  {article.title}
                </h2>
                <p className="text-sm text-[#1E293B]/55 leading-relaxed mb-4">
                  {article.description}
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#328555] group-hover:gap-2 transition-all">
                  Read article
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
