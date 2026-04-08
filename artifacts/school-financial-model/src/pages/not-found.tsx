import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <Layout>
      <SEOHead
        title="Page Not Found"
        description="The page you're looking for doesn't exist or has been moved."
        noIndex
      />
      <div className="flex-1 flex items-center justify-center p-4 py-20">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mb-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground mb-3">Page Not Found</h1>
          <p className="text-muted-foreground mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link href="/" className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
            Go Home
          </Link>
        </div>
      </div>
    </Layout>
  );
}
