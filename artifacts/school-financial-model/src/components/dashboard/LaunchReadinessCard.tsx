import { useGetModel } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { ClipboardList, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import type { FullModelData } from "@/pages/model-wizard/schema";
import {
  isNewSchool,
  summarizeLaunchReadiness,
} from "@/lib/launch-readiness";

// Task #711 — Launch readiness on the dashboard.
//
// Surfaces a rolled-up summary of the new-school launch checklist
// (Enrollment step) so a yet-to-launch founder can see at a glance
// how much launch evidence is filled in without clicking into the
// wizard. Operating-school models render nothing — they have actuals
// instead.
//
// The deep-link target is the Enrollment step (step 3 in the
// canonical wizard layout). We pass `?step=3&focus=launch-checklist`
// so `LaunchAssumptionsChecklist` scrolls into view on arrival.
//
// Field list + ordering live in `@/lib/launch-readiness` so the
// lender narrative + consultant packets (Task #718) can render the
// same readiness signal without drift.

interface Props {
  modelId: number;
  modelName: string;
}

export function LaunchReadinessCard({ modelId, modelName }: Props) {
  const [, setLocation] = useLocation();
  const { data: model, isLoading } = useGetModel(modelId, {
    query: { queryKey: [`/api/models/${modelId}`, "launch-readiness"] },
  });

  if (isLoading || !model?.data) return null;
  const data = model.data as unknown as FullModelData;

  // New-school only. Operating schools see Actuals on the wizard
  // and don't have a launch-checklist surface to summarize.
  if (!isNewSchool(data)) return null;

  const summary = summarizeLaunchReadiness(data);
  const filled = summary.filled.length;
  const total = summary.total;
  const firstMissing = summary.missing[0];
  const pct = Math.round((filled / total) * 100);
  const complete = filled === total;

  const goToChecklist = () => {
    setLocation(`/model/${modelId}?step=3&focus=launch-checklist`);
  };

  return (
    <button
      type="button"
      onClick={goToChecklist}
      data-testid="dashboard-launch-readiness"
      className="w-full text-left bg-white border border-sky-200/70 rounded-2xl p-5 sm:p-6 shadow-sm mb-8 hover:border-sky-400 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-sky-700" />
            Launch readiness
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            From{" "}
            <span className="font-medium text-foreground">{modelName}</span>{" "}
            — the launch evidence reviewers look at first.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-sky-700 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <p
            data-testid="launch-readiness-progress"
            className="text-sm text-foreground"
          >
            <span className="font-display font-bold text-2xl text-sky-700 tabular-nums">
              {filled}
            </span>{" "}
            <span className="text-muted-foreground">
              of {total} launch-checklist items filled
            </span>
          </p>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {pct}%
          </span>
        </div>
        <div
          className="w-full h-2 bg-sky-100 rounded-full overflow-hidden"
          aria-hidden
        >
          <div
            data-testid="launch-readiness-bar"
            className="h-full bg-sky-600 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {complete ? (
        <div
          data-testid="launch-readiness-complete"
          className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            Every launch-checklist item is filled — your plan is grounded in
            evidence.
          </span>
        </div>
      ) : firstMissing ? (
        <div
          data-testid="launch-readiness-missing"
          className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
          <span>
            Still missing:{" "}
            <span className="font-semibold">{firstMissing.label}</span>
            {filled === 0
              ? " — start here to anchor the rest of your plan."
              : "."}
          </span>
        </div>
      ) : null}
    </button>
  );
}
