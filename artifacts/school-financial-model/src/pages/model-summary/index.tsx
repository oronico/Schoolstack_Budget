import { useRoute, Link } from "wouter";
import { ArrowLeft, FileText } from "lucide-react";
import { useGetFounderSummary } from "@workspace/api-client-react";
import type { FounderSummary, FounderSummarySection } from "@workspace/api-client-react";

function SectionCard({ section }: { section: FounderSummarySection }) {
  return (
    <section
      data-testid={`founder-summary-section-${section.id}`}
      className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm"
    >
      <h2 className="font-display text-2xl font-bold text-slate-900 mb-4">
        {section.title}
      </h2>
      {section.paragraphs.map((p, i) => (
        <p
          key={i}
          className="text-slate-700 leading-relaxed mb-3 last:mb-0 whitespace-pre-line"
        >
          {p}
        </p>
      ))}
      {section.bullets && section.bullets.length > 0 && (
        <ul className="mt-4 space-y-2 list-disc list-outside pl-6">
          {section.bullets.map((b, i) => (
            <li key={i} className="text-slate-700 leading-relaxed">
              {b}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ModelSummaryPage() {
  const [, params] = useRoute<{ id: string }>("/model/:id/summary");
  const modelId = params?.id ? Number(params.id) : 0;
  const { data, isLoading, error } = useGetFounderSummary(modelId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-3">
            Could not load summary
          </h1>
          <p className="text-slate-600 mb-6">
            We couldn't generate a plain-English summary for this model. Open
            the planner and confirm your inputs, then try again.
          </p>
          <Link href={`/model/${modelId}`}>
            <a className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90">
              <ArrowLeft className="h-4 w-4" /> Back to model
            </a>
          </Link>
        </div>
      </div>
    );
  }

  const summary = data as FounderSummary;
  const generatedDate = new Date(summary.generatedAt).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <Link href={`/model/${modelId}`}>
            <a className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4">
              <ArrowLeft className="h-4 w-4" /> Back to model
            </a>
          </Link>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900">
                Plain-English Summary
              </h1>
              <p className="text-slate-600 mt-1">
                {summary.schoolName} &middot; Built from your model on{" "}
                {generatedDate}
              </p>
              <p
                className="text-xs text-slate-500 mt-2"
                data-testid="founder-summary-provenance"
              >
                Read-only. Every figure is sourced from the same canonical
                engine that powers your dashboard and exports.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {summary.sections.map((s) => (
            <SectionCard key={s.id} section={s} />
          ))}
        </div>

        <div className="mt-10 text-center text-xs text-slate-500">
          <p>
            This page mirrors the founder summary embedded in your Founder
            Planning Workbook (Plain-English Summary tab) and your Board and
            Funder Summary PDF.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ModelSummaryPage;
