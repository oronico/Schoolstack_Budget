import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { Loader2, Users, ArrowRight } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { DecisionFlowShell } from "@/components/decision-flow/DecisionFlowShell";
import { ModelMiniSummary } from "@/components/decision-flow/ModelMiniSummary";
import { ImpactSummary } from "@/components/decision-flow/ImpactSummary";
import { WhyStep } from "@/components/decision-flow/WhyStep";
import { SaveActions, type SaveAction } from "@/components/decision-flow/SaveActions";
import { ApplyConfirmation } from "@/components/decision-flow/ApplyConfirmation";
import {
  applyDecisionToData,
  buildBlankEnrollmentChangeInputs,
  computeDecisionImpact,
  decisionToPersistedOverrides,
  enrollmentChangeInputsToOverrides,
  summarizeDecisionChanges,
  type EnrollmentChangeInputs,
  type DecisionFieldChange,
} from "@/lib/decision-flows";
import { encodeOverridesToHash } from "@/lib/whatif-engine";
import type { FullModelData, CustomScenario, AppliedDecisionUndo } from "@/pages/model-wizard/schema";

interface ChangeEnrollmentFlowProps {
  modelId: number;
}

export function ChangeEnrollmentFlow({ modelId }: ChangeEnrollmentFlowProps) {
  const [, setLocation] = useLocation();
  const { data: model, isLoading } = useGetModel(modelId);
  const updateMutation = useUpdateModel();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [inputs, setInputs] = useState<EnrollmentChangeInputs>(buildBlankEnrollmentChangeInputs);
  const [scenarioName, setScenarioName] = useState("");
  const [narrative, setNarrative] = useState("");
  const [done, setDone] = useState(false);
  const [doneAction, setDoneAction] = useState<SaveAction | null>(null);
  // After "Apply to my model" succeeds, we surface a before/after diff modal
  // listing the model fields that changed and offering one-click Undo.
  const [applyResult, setApplyResult] = useState<{
    changes: DecisionFieldChange[];
    snapshot: Record<string, unknown>;
    appliedScenarioName: string;
  } | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

  const data = (model?.data ?? {}) as FullModelData;
  const en = data.enrollment;
  const baseEnrollment = [en?.year1 ?? 0, en?.year2 ?? 0, en?.year3 ?? 0, en?.year4 ?? 0, en?.year5 ?? 0];

  const impact = useMemo(() => {
    if (step < 3 || !model) return null;
    return computeDecisionImpact(data, { type: "change_enrollment", inputs });
  }, [step, model, data, inputs]);

  const hasAnyChange =
    inputs.enrollmentDelta.some((v) => v !== 0) ||
    (inputs.retentionRate !== undefined && inputs.retentionRate !== (en?.retentionRate ?? 85)) ||
    (inputs.tuitionDeltaPerStudent !== undefined && inputs.tuitionDeltaPerStudent !== 0);

  const cumulativeDelta = inputs.enrollmentDelta.reduce((a, b) => a + b, 0);

  const canAdvance = step === 1 ? true : step === 2 ? hasAnyChange : true;

  if (isLoading || !model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = async (action: SaveAction) => {
    const persistedOverrides = decisionToPersistedOverrides(data, { type: "change_enrollment", inputs });
    const existing = ((data as Record<string, unknown>).customScenarios as CustomScenario[] | undefined) ?? [];
    const finalScenarioName = scenarioName.trim() || "Enrollment change";

    // Capture the apply-time field-level diff BEFORE we mutate `data` so the
    // "before" values still reflect the pre-apply model. Persisted on the
    // entry below so the lender / board PDF "Decision history" section can
    // show reviewers exactly which fields the decision moved (Task #375).
    const appliedFieldChanges =
      action === "apply"
        ? summarizeDecisionChanges(data, { type: "change_enrollment", inputs })
        : undefined;

    const entry: CustomScenario = {
      name: finalScenarioName,
      createdAt: new Date().toISOString(),
      overrides: persistedOverrides,
      decisionType: "change_enrollment",
      narrative: narrative.trim(),
      ...(appliedFieldChanges ? { appliedFieldChanges } : {}),
    };

    // Snapshot the pre-mutation data so the apply confirmation modal's Undo
    // button can restore the model exactly as it was before this flow ran.
    // For the apply branch we also persist this snapshot on the model itself
    // (as `appliedDecisionUndo`) so the founder can undo from the model
    // dashboard even after the modal is dismissed or they navigate away.
    const snapshotBeforeApply = data as Record<string, unknown>;

    let nextData: Record<string, unknown> = {
      ...(data as Record<string, unknown>),
      customScenarios: [...existing, entry],
    };

    if (action === "apply") {
      const applied = applyDecisionToData(data, { type: "change_enrollment", inputs });
      const undoRecord: AppliedDecisionUndo = {
        decisionType: "change_enrollment",
        scenarioName: finalScenarioName,
        appliedAt: new Date().toISOString(),
        snapshot: snapshotBeforeApply,
        // Reuse the same diff we already computed once for the persisted
        // CustomScenario (Task #375) so the dashboard banner and the PDF
        // decision-history both narrate the same field-level changes.
        changes: appliedFieldChanges ?? [],
      };
      nextData = {
        ...(applied as Record<string, unknown>),
        customScenarios: [...existing, entry],
        appliedDecisionUndo: undoRecord,
      };
    }

    await updateMutation.mutateAsync({
      id: modelId,
      data: { data: nextData as Record<string, unknown> },
    });
    setDoneAction(action);
    setDone(true);

    if (action === "apply") {
      setApplyResult({
        changes: appliedFieldChanges ?? [],
        snapshot: snapshotBeforeApply,
        appliedScenarioName: finalScenarioName,
      });
    } else if (action === "later") {
      setTimeout(() => setLocation(`/model/${modelId}/scenarios`), 800);
    } else if (action === "planner") {
      const ov = enrollmentChangeInputsToOverrides(inputs);
      const hash = encodeOverridesToHash(ov);
      setTimeout(() => setLocation(`/model/${modelId}/scenarios${hash ? `#${hash}` : ""}`), 600);
    }
  };

  const handleUndoApply = async () => {
    if (!applyResult || isUndoing) return;
    setIsUndoing(true);
    try {
      // Restoring the snapshot also implicitly clears the persisted
      // `appliedDecisionUndo` (the snapshot pre-dates that field), so the
      // model dashboard banner won't keep advertising an undo for a decision
      // we've just rolled back.
      await updateMutation.mutateAsync({
        id: modelId,
        data: { data: applyResult.snapshot },
      });
      setApplyResult(null);
      setDone(false);
      setDoneAction(null);
    } finally {
      setIsUndoing(false);
    }
  };

  const handleContinueAfterApply = () => {
    setApplyResult(null);
    setLocation(`/model/${modelId}`);
  };

  return (
    <DecisionFlowShell
      decisionType="change_enrollment"
      modelId={modelId}
      modelName={model.name ?? "Untitled Model"}
      step={step}
      setStep={setStep}
      canAdvance={canAdvance}
      isSaving={updateMutation.isPending}
      ownSaveActions={step === 4}
      done={done}
      doneCta={
        <button
          onClick={() => setLocation(`/model/${modelId}/scenarios`)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          data-testid="decision-flow-view-scenarios"
        >
          View on Scenarios <ArrowRight className="h-4 w-4" />
        </button>
      }
      sidebar={<ModelMiniSummary data={data} />}
      data={data}
    >
      {step === 1 && (
        <WhyStep
          decisionType="change_enrollment"
          narrative={narrative}
          setNarrative={setNarrative}
          intro={
            <>
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                <Users className="h-3.5 w-3.5" /> Decision: Change enrollment
              </div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-3">
                Adjusting your enrollment plan?
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed">
                Whether your re-enrollment came in stronger than expected, you're tightening a
                recruitment target, or your board wants to plan for a slower ramp — let's see what
                the new enrollment picture does to revenue, cash, and break-even.
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                Current enrollment in this model:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {baseEnrollment.map((n, i) => `Y${i + 1}: ${n}`).join(" • ")}
                </span>
              </p>
            </>
          }
          prepareList={[
            "How many more (or fewer) students per year — relative to your current model",
            "Optional: a new retention rate",
            "Optional: a tuition adjustment per student",
            "Why this change is on the table (re-enrollment, board ask, downside test)",
          ]}
        />
      )}

      {step === 2 && (
        <section className="max-w-2xl space-y-6" data-testid="change-enrollment-inputs">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">What's changing?</h2>
            <p className="text-sm text-muted-foreground">
              Drag each year's slider to model how enrollment differs from your current plan. Move
              right for more students, left for fewer. The cumulative change running across all
              years shows beneath each slider.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Per-year enrollment Δ vs. base
              </p>
              <p className="text-xs text-muted-foreground">
                Cumulative shift over 5 years:{" "}
                <span className={`font-mono font-bold ${cumulativeDelta > 0 ? "text-emerald-700" : cumulativeDelta < 0 ? "text-red-600" : "text-foreground"}`}>
                  {cumulativeDelta > 0 ? "+" : ""}{cumulativeDelta} students
                </span>
              </p>
            </div>
            <div className="space-y-4">
              {([0, 1, 2, 3, 4] as const).map((i) => {
                const base = baseEnrollment[i];
                const delta = inputs.enrollmentDelta[i];
                const newVal = base + delta;
                const cumThruYear = inputs.enrollmentDelta.slice(0, i + 1).reduce((a, b) => a + b, 0);
                // Range: ±50 or ±max(60% of base, 25), whichever is greater. Keeps the slider
                // useful for tiny pre-K cohorts and very large 6-12 schools alike.
                const sliderRange = Math.max(50, Math.round(base * 0.6), 25);
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-border/60 bg-card/50 px-4 py-3"
                    data-testid={`change-enrollment-delta-row-${i + 1}`}
                  >
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-sm font-semibold text-foreground">Year {i + 1}</span>
                      <div className="flex items-baseline gap-3 text-xs">
                        <span className="text-muted-foreground">
                          base <span className="font-mono font-semibold text-foreground">{base}</span>
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-muted-foreground">
                          new <span className="font-mono font-bold text-foreground">{newVal}</span>
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-600" : "text-muted-foreground"
                          }`}
                        >
                          ({delta > 0 ? "+" : ""}{delta})
                        </span>
                      </div>
                    </div>
                    <Slider
                      min={-sliderRange}
                      max={sliderRange}
                      step={1}
                      value={[delta]}
                      onValueChange={([v]: number[]) => setInputs((s) => {
                        const next = [...s.enrollmentDelta] as [number, number, number, number, number];
                        next[i] = v;
                        return { ...s, enrollmentDelta: next };
                      })}
                      data-testid={`change-enrollment-delta-${i + 1}`}
                    />
                    <div className="flex items-baseline justify-between mt-1.5">
                      <span className="text-[11px] text-muted-foreground">−{sliderRange}</span>
                      <span className="text-[11px] text-muted-foreground">
                        cumulative thru Y{i + 1}:{" "}
                        <span className={`font-mono font-semibold ${cumThruYear > 0 ? "text-emerald-700" : cumThruYear < 0 ? "text-red-600" : "text-foreground"}`}>
                          {cumThruYear > 0 ? "+" : ""}{cumThruYear}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">+{sliderRange}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Retention rate (%)">
              <NumberInput
                value={inputs.retentionRate ?? (en?.retentionRate ?? 85)}
                onChange={(v) => setInputs((s) => ({ ...s, retentionRate: v }))}
                testid="change-enrollment-retention"
              />
            </Field>
            <Field label="Tuition Δ per student ($/yr)">
              <NumberInput
                value={inputs.tuitionDeltaPerStudent ?? 0}
                onChange={(v) => setInputs((s) => ({ ...s, tuitionDeltaPerStudent: v }))}
                allowNegative
                testid="change-enrollment-tuition-delta"
              />
            </Field>
          </div>

          {!hasAnyChange && (
            <p className="text-xs text-amber-700">
              Move at least one slider (or change retention/tuition) to continue.
            </p>
          )}
        </section>
      )}

      {step === 3 && impact && (
        <section className="space-y-3" data-testid="change-enrollment-impact">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">Impact on your model</h2>
            <p className="text-sm text-muted-foreground">
              Here's what this enrollment shift does to your 5-year picture — and whether your staffing plan still fits.
            </p>
          </div>
          <ImpactSummary impact={impact} />
        </section>
      )}

      {step === 4 && (
        <SaveActions
          decisionType="change_enrollment"
          scenarioName={scenarioName}
          setScenarioName={setScenarioName}
          defaultName="Q3 re-enrollment update"
          isSaving={updateMutation.isPending}
          done={done}
          doneAction={doneAction}
          onSave={handleSave}
          plannerAvailable={true}
        />
      )}

      {applyResult && (
        <ApplyConfirmation
          decisionType="change_enrollment"
          scenarioName={applyResult.appliedScenarioName}
          changes={applyResult.changes}
          isUndoing={isUndoing}
          onUndo={handleUndoApply}
          onContinue={handleContinueAfterApply}
        />
      )}
    </DecisionFlowShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, step = 1, placeholder, testid, allowNegative }: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  placeholder?: string;
  testid?: string;
  allowNegative?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={allowNegative ? undefined : 0}
      step={step}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(isNaN(v) ? 0 : v);
      }}
      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background font-mono"
      data-testid={testid}
    />
  );
}
