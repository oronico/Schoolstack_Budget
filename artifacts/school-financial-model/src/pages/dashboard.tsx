import { Link, useLocation } from "wouter";
import { useListModels, useCreateModel, useDeleteModel, useDuplicateModel, useArchiveModel } from "@workspace/api-client-react";
import { Layout } from "@/components/layout/Layout";
import { Plus, FileSpreadsheet, Trash2, Clock, Loader2, Copy, Archive, Sparkles, ArrowRight, BarChart3, CheckCircle2, Lightbulb, GitBranch, Lock, MessageSquareMore, RefreshCw, SlidersHorizontal } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { FounderPersonaPrompt } from "@/components/coaching/FounderPersonaPrompt";
import { DecisionLauncher, ThingsHaveChangedBanner } from "@/components/decision-flow/DecisionLauncher";
import { FinancialSnapshot } from "@/components/dashboard/FinancialSnapshot";
import { BreakEvenDownsideCard } from "@/components/dashboard/BreakEvenDownsideCard";
import { LaunchReadinessCard } from "@/components/dashboard/LaunchReadinessCard";
import { UnrestrictedCashHero } from "@/components/dashboard/UnrestrictedCashHero";
import { getPersonaTone, hasCompletePersona, isYetToLaunch } from "@/lib/coaching/founder-persona";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-amber-100 text-amber-800" },
  complete: { label: "Complete", className: "bg-green-100 text-green-800" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-500" },
};

const STEP_LABELS = [
  "Story",
  "School Details",
  "Enrollment",
  "Revenue",
  "Staffing",
  "Expenses",
  "Capital & Financing",
  "Assumptions & Sensitivity",
  "Review",
  "Consultant",
  "Lender Narrative",
  "Export",
];
const TOTAL_STEPS = STEP_LABELS.length;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(name: string): string {
  return name.split(" ")[0] || name;
}

export function DashboardPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  
  const { data: models, isLoading, refetch } = useListModels();
  const createMutation = useCreateModel();
  const deleteMutation = useDeleteModel();
  const duplicateMutation = useDuplicateModel();
  const archiveMutation = useArchiveModel();

  if (!user) return null;

  const activeModels = models?.filter(m => m.status !== "archived") || [];
  const completedModels = activeModels.filter(m => m.status === "complete");
  const draftModels = activeModels.filter(m => m.status !== "complete");
  const archivedModels = models?.filter(m => m.status === "archived") || [];
  // Pick the most recently updated non-archived model as the source for the
  // financial snapshot block. The list endpoint already orders by updatedAt
  // desc, so we just take the first eligible row.
  const snapshotModel = activeModels[0];

  const handleCreate = async () => {
    try {
      // Seed `schoolStage` from persona so a yet-to-launch founder skips the
      // "are you operating?" radio entirely (and never sees the actuals /
      // prior-year / QuickBooks panels that hang off `operating_school`).
      // We only seed when persona is set so legacy users keep the manual
      // pick. Existing-school founders default to `operating_school` for the
      // same reason — they expect those panels.
      const seededSchoolStage: "new_school" | "operating_school" | undefined =
        yetToLaunch
          ? "new_school"
          : user?.personaStage === "existing"
            ? "operating_school"
            : undefined;
      // Route through /model/new so the founder picks duration first. Pass
      // persona-derived schoolStage as a query param the picker honors.
      const qs = seededSchoolStage ? `?stage=${seededSchoolStage}` : "";
      setLocation(`/model/new${qs}`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this model?")) {
      await deleteMutation.mutateAsync({ id });
      refetch();
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const newModel = await duplicateMutation.mutateAsync({ id });
      // Carry the source model's migration marker forward so a duplicated
      // legacy model isn't double-bumped, and so a duplicated new-flow model
      // isn't legacy-bumped on first open.
      try {
        const storySrcMarked = window.localStorage.getItem(`wizard:storyMigration:${id}`) === "1";
        if (storySrcMarked) {
          window.localStorage.setItem(`wizard:storyMigration:${newModel.id}`, "1");
        }
        const reorderSrcMarked = window.localStorage.getItem(`wizard:reorderV2:${id}`) === "1";
        if (reorderSrcMarked) {
          window.localStorage.setItem(`wizard:reorderV2:${newModel.id}`, "1");
        }
      } catch {
        /* noop */
      }
      refetch();
    } catch (e) {
      console.error(e);
    }
  };

  const handleArchive = async (id: number) => {
    if (confirm("Are you sure you want to archive this model?")) {
      await archiveMutation.mutateAsync({ id });
      refetch();
    }
  };

  const tone = getPersonaTone(user);
  // Task #597: kept as a *tone* check. The dashboard is account-wide (not
  // scoped to any specific model) so the founder's onboarding persona is
  // the right input — it changes the welcome subtitle and seeds the
  // schoolStage default for the next new-model creation. The structural
  // schoolStage gates that #594/#595/#597 migrated all live on
  // model-scoped surfaces (the wizard steps, the bookkeeping sidebar, the
  // scenarios actuals roll-up).
  const yetToLaunch = isYetToLaunch(user);
  const greetingPrefix = getGreeting();
  const dashboardSubtitle = yetToLaunch
    ? "Here's where your school plans live. Keep building, run a what-if, or start a fresh plan."
    : "Here's where your financial models live. Pick up where you left off or start something new.";

  return (
    <Layout>
      {user && !hasCompletePersona(user) && (
        // Task #302: force every signed-in founder without a *complete*
        // persona to pick one before they continue. Legacy users (created
        // before personas shipped) get prompted on next sign-in too — they
        // can re-pick later from the Navbar settings menu if their situation
        // changes. We require both stage and comfort so partial-data records
        // don't slip through into the generic operator tone.
        <FounderPersonaPrompt onComplete={() => {}} />
      )}
      <div className="py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
                {greetingPrefix}, {getFirstName(user.name)}
              </h1>
              <p className="text-muted-foreground mt-2">{dashboardSubtitle}</p>
            </div>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none"
            >
              {createMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              New Model
            </button>
          </div>

          {!isLoading && snapshotModel && (
            <>
              {/* Task #646 — unrestricted-cash hero card sits above the
                  rest of the snapshot so the founder's first read is the
                  cash figure DSCR + runway are computed off, with a
                  one-click reveal for the legacy accrual number. */}
              <UnrestrictedCashHero
                modelId={snapshotModel.id}
                modelName={snapshotModel.name || "Untitled Model"}
              />
              <FinancialSnapshot
                modelId={snapshotModel.id}
                modelName={snapshotModel.name || "Untitled Model"}
              />
              {/* Task #711 — rolled-up launch checklist for new schools.
                  Renders nothing for operating-school models. */}
              <LaunchReadinessCard
                modelId={snapshotModel.id}
                modelName={snapshotModel.name || "Untitled Model"}
              />
              <BreakEvenDownsideCard
                modelId={snapshotModel.id}
                modelName={snapshotModel.name || "Untitled Model"}
              />
            </>
          )}

          {!isLoading && models && models.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{activeModels.length}</p>
                <p className="text-xs text-muted-foreground font-medium mt-1">Active Models</p>
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-primary">{completedModels.length}</p>
                <p className="text-xs text-muted-foreground font-medium mt-1">Completed</p>
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{draftModels.length}</p>
                <p className="text-xs text-muted-foreground font-medium mt-1">In Progress</p>
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{archivedModels.length}</p>
                <p className="text-xs text-muted-foreground font-medium mt-1">Archived</p>
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : models?.length === 0 ? (
          <div className="space-y-8">
            <DecisionLauncher
              models={[]}
              onStartNew={handleCreate}
              startNewPending={createMutation.isPending}
            />

            <div className="bg-gradient-to-br from-primary/5 via-card to-card border border-primary/20 rounded-3xl p-10 sm:p-16 text-center shadow-sm">
              <div className="mx-auto w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
                <Sparkles className="h-10 w-10 text-primary" />
              </div>
              <h3 className="font-display text-2xl font-bold mb-3">{tone.emptyStateTitle}</h3>
              <p className="text-muted-foreground max-w-md mx-auto mb-8 leading-relaxed">
                {tone.emptyStateBody}
              </p>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                {createMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ArrowRight className="h-5 w-5" /> Start My Model</>}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-card border border-border/60 rounded-2xl p-6">
                <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center mb-4">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <h4 className="font-display font-bold text-foreground mb-2">Answer questions, not formulas</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">We ask about your school in plain English - enrollment, staffing, rent - and build the spreadsheet for you.</p>
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-6">
                <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <h4 className="font-display font-bold text-foreground mb-2">Get a consultant-level review</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">Before you export, we'll analyze your model and flag anything a lender or authorizer might question.</p>
              </div>
              <div className="bg-card border border-border/60 rounded-2xl p-6">
                <div className="w-10 h-10 bg-teal-100 text-teal-700 rounded-xl flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h4 className="font-display font-bold text-foreground mb-2">Export a real Excel workbook</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">Download a multi-tab spreadsheet with live formulas - ready for your authorizer, lender, or board.</p>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <DecisionLauncher
              models={(models || []).map((m) => ({ id: m.id, name: m.name, status: m.status, currentStep: m.currentStep, updatedAt: m.updatedAt }))}
              onStartNew={handleCreate}
              startNewPending={createMutation.isPending}
            />

            <ThingsHaveChangedBanner
              models={(models || []).map((m) => ({ id: m.id, name: m.name, status: m.status, currentStep: m.currentStep, updatedAt: m.updatedAt }))}
              staleDays={30}
            />

            {completedModels.length > 0 && (
              <div className="mb-8 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/80 border border-amber-200/60 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display font-bold text-foreground mb-2">Recommended next steps</h3>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => setLocation(`/model/${completedModels[0].id}`)}
                        className="flex items-center gap-2.5 text-left text-sm bg-white border border-border/60 rounded-xl px-4 py-3 hover:border-amber-300 hover:shadow-sm transition-all group"
                      >
                        <MessageSquareMore className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        <span className="text-foreground/80 group-hover:text-foreground">Request your free expert review</span>
                      </button>
                      <button
                        onClick={() => setLocation(`/model/${completedModels[0].id}/scenarios`)}
                        className="flex items-center gap-2.5 text-left text-sm bg-white border border-border/60 rounded-xl px-4 py-3 hover:border-primary/30 hover:shadow-sm transition-all group"
                      >
                        <SlidersHorizontal className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="text-foreground/80 group-hover:text-foreground">Run a what-if scenario for your board</span>
                      </button>
                      {completedModels.some(m => differenceInDays(new Date(), new Date(m.updatedAt)) > 90) && (
                        <button
                          onClick={() => {
                            const old = completedModels.find(m => differenceInDays(new Date(), new Date(m.updatedAt)) > 90);
                            if (old) setLocation(`/model/${old.id}`);
                          }}
                          className="flex items-center gap-2.5 text-left text-sm bg-white border border-border/60 rounded-xl px-4 py-3 hover:border-teal-300 hover:shadow-sm transition-all group"
                        >
                          <RefreshCw className="h-4 w-4 text-teal-600 flex-shrink-0" />
                          <span className="text-foreground/80 group-hover:text-foreground">Update your assumptions - a lot can change in a quarter</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <h2 className="font-display text-lg font-bold text-foreground mb-4">Your Models</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {models?.map(model => {
                const status = statusConfig[model.status] || statusConfig.draft;
                const isArchived = model.status === "archived";
                const stepProgress = Math.round(((model.currentStep || 1) / TOTAL_STEPS) * 100);

                return (
                  <div key={model.id} className={`group flex flex-col bg-card border border-border/60 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 ${isArchived ? "opacity-70" : ""}`}>
                    <div className="flex-1 cursor-pointer" onClick={() => setLocation(`/model/${model.id}`)}>
                      <div className="flex items-start justify-between mb-4">
                        <div className="p-3 bg-primary/10 text-primary rounded-xl">
                          <FileSpreadsheet className="h-6 w-6" />
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <h3 className="font-display text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                        {model.name || "Untitled Model"}
                      </h3>
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                          <span>{STEP_LABELS[(model.currentStep || 1) - 1] || "Story"}</span>
                          <span>Step {model.currentStep || 1} of {TOTAL_STEPS}</span>
                        </div>
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${stepProgress}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Updated {format(new Date(model.updatedAt), "MMM d, yyyy")}
                      </div>
                    </div>
                    
                    <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setLocation(`/model/${model.id}`)}
                          className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                        >
                          {(model.currentStep ?? 0) >= 9 ? "View Model" : "Continue Building"} <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        {(model.currentStep ?? 0) >= 9 ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setLocation(`/model/${model.id}/scenarios`); }}
                            className="text-sm font-medium text-teal-700 hover:underline flex items-center gap-1"
                          >
                            <GitBranch className="h-3.5 w-3.5" /> Scenarios
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground flex items-center gap-1" title="Reach Review (step 9) to unlock scenarios">
                            <Lock className="h-3 w-3" /> Scenarios
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDuplicate(model.id); }}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Duplicate model"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        {!isArchived && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleArchive(model.id); }}
                            className="p-2 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Archive model"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(model.id); }}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                          title="Delete model"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
