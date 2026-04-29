import { Link, useParams } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { SolutionPageLayout } from "@/components/solutions/SolutionPageLayout";
import { getSolutionBySlug } from "@/data/solution-pages";

export function SolutionPage() {
  const params = useParams<{ slug: string }>();
  const page = getSolutionBySlug(params.slug || "");

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
              The Solutions page you&apos;re looking for doesn&apos;t exist.
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

  return <SolutionPageLayout page={page} />;
}
