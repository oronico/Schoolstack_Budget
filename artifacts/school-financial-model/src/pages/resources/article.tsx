import { Link, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Clock, Calendar } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { getArticleBySlug, ARTICLES } from "@/data/articles";

export function ArticlePage() {
  const params = useParams<{ slug: string }>();
  const article = getArticleBySlug(params.slug || "");

  if (!article) {
    return (
      <Layout>
        <SEOHead title="Article Not Found" noIndex />
        <div className="flex-1 flex items-center justify-center p-4 py-20">
          <div className="text-center max-w-md">
            <h1 className="font-display text-3xl font-bold text-[#1E293B] mb-3">
              Article not found
            </h1>
            <p className="text-[#1E293B]/60 mb-8">
              The article you're looking for doesn't exist or may have been moved.
            </p>
            <Link
              href="/resources"
              className="inline-flex items-center gap-2 text-[#328555] font-semibold hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Resources
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const currentIndex = ARTICLES.findIndex((a) => a.slug === article.slug);
  const nextArticle = ARTICLES[currentIndex + 1] || ARTICLES[0];

  const [year, month, day] = article.publishedDate.split("-").map(Number);
  const publishedFormatted = new Date(year, month - 1, day).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );

  const articleUrl = `https://budget.schoolstack.ai/resources/${article.slug}`;

  return (
    <Layout>
      <SEOHead
        title={article.title}
        description={article.description}
        path={`/resources/${article.slug}`}
        image={article.ogImage}
        ogType="article"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.description,
          url: articleUrl,
          mainEntityOfPage: articleUrl,
          datePublished: article.publishedDate,
          dateModified: article.publishedDate,
          image: article.ogImage,
          author: {
            "@type": "Organization",
            name: "SchoolStack Budget",
            url: "https://budget.schoolstack.ai",
          },
          publisher: {
            "@type": "Organization",
            name: "Building Hope Impact Fund",
            url: "https://schoolstack.ai",
            logo: {
              "@type": "ImageObject",
              url: "https://budget.schoolstack.ai/logos/schoolstack-mark.svg",
            },
          },
        }}
      />

      <article className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-6">
          <Link
            href="/resources"
            className="inline-flex items-center gap-2 text-sm text-[#1E293B]/50 hover:text-[#328555] transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            All Resources
          </Link>

          <header className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex px-2.5 py-1 rounded-full bg-[#328555]/10 text-[#328555] text-xs font-semibold">
                {article.category}
              </span>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#1E293B] mb-4 leading-tight">
              {article.title}
            </h1>
            <p className="text-lg text-[#1E293B]/60 leading-relaxed mb-5">
              {article.description}
            </p>
            <div className="flex items-center gap-4 text-sm text-[#1E293B]/40">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {publishedFormatted}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {article.readTimeMinutes} min read
              </span>
            </div>
          </header>

          <div className="border-t border-[#1E293B]/5 pt-8">
            <MarkdownRenderer content={article.content} />
          </div>

          <div className="mt-16 p-8 rounded-2xl bg-gradient-to-br from-[#328555]/5 to-[#0D9488]/5 border border-[#328555]/15">
            <h3 className="font-display text-xl font-bold text-[#1E293B] mb-3">
              Ready to build your school's financial plan?
            </h3>
            <p className="text-[#1E293B]/60 leading-relaxed mb-6">
              SchoolStack Budget walks you through every step - enrollment,
              revenue, staffing, expenses - and generates lender-ready documents
              automatically. Free during beta.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-[#328555] hover:bg-[#276844] text-white px-6 py-3 rounded-xl font-bold transition shadow-lg shadow-[#328555]/20"
            >
              Start My Financial Plan
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-12 pt-8 border-t border-[#1E293B]/5">
            <p className="text-sm font-semibold text-[#1E293B]/40 uppercase tracking-wide mb-4">
              Up next
            </p>
            <Link
              href={`/resources/${nextArticle.slug}`}
              className="group flex items-center justify-between p-5 rounded-xl border border-[#1E293B]/5 hover:border-[#328555]/20 hover:shadow-md transition-all"
            >
              <div>
                <p className="font-display font-bold text-[#1E293B] group-hover:text-[#328555] transition-colors">
                  {nextArticle.title}
                </p>
                <p className="text-sm text-[#1E293B]/50 mt-1">
                  {nextArticle.readTimeMinutes} min read
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-[#1E293B]/30 group-hover:text-[#328555] transition-colors" />
            </Link>
          </div>
        </div>
      </article>
    </Layout>
  );
}
