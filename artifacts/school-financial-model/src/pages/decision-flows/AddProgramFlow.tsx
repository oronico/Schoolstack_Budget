import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { Loader2, GraduationCap, ArrowRight } from "lucide-react";
import { DecisionFlowShell } from "@/components/decision-flow/DecisionFlowShell";
import { ModelMiniSummary } from "@/components/decision-flow/ModelMiniSummary";
import { ImpactSummary } from "@/components/decision-flow/ImpactSummary";
import { WhyStep } from "@/components/decision-flow/WhyStep";
import { SaveActions, type SaveAction } from "@/components/decision-flow/SaveActions";
import { ApplyConfirmation } from "@/components/decision-flow/ApplyConfirmation";
import { cn } from "@/lib/utils";
import {
  applyDecisionToData,
  buildBlankAddProgramInputs,
  computeDecisionImpact,
  decisionToPersistedOverrides,
  summarizeDecisionChanges,
  type AddProgramInputs,
  type DecisionFieldChange,
} from "@/lib/decision-flows";
import type { FullModelData, CustomScenario, AppliedDecisionUndo } from "@/pages/model-wizard/schema";

interface AddProgramFlowProps {
  modelId: number;
}

const GRADE_BAND_PRESETS = ["Pre-K", "Kindergarten", "K-2", "3-5", "6-8", "9-12"];

export function AddProgramFlow({ modelId }: AddProgramFlowProps) {
  const [, setLocation] = useLocation();
  const { data: model, isLoading } = useGetModel(modelId);
  const updateMutation = useUpdateModel();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [inputs, setInputs] = useState<AddProgramInputs>(buildBlankAddProgramInputs);
  const [scenarioName, setScenarioName] = useState("");
  const [narrative, setNarrative] = useState("");
  const [done, setDone] = useState(false);
  const [doneAction, setDoneAction] = useState<SaveAction | null>(null);
  // After "Apply to my model" succeeds we surface a confirmation modal that
  // lists the field-level diff and offers Undo. We stash the pre-apply data
  // here so Undo can restore it (including the customScenarios entry that
  // was appended by handleSave).
  const [applyResult, setApplyResult] = useState<{
    changes: DecisionFieldChange[];
    snapshot: Record<string, unknown>;
    appliedScenarioName: string;
  } | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

  const data = (model?.data ?? {}) as FullModelData;

  const impact = useMemo(() => {
    if (step < 3 || !model) return null;
    return computeDecisionImpact(data, { type: "add_program", inputs });
  }, [step, model, data, inputs]);

  const inputsValid =
    inputs.name.trim().length > 0 &&
    inputs.annualTuition >= 0 &&
    inputs.enrollment.some((n) => n > 0);

  const canAdvance = step === 1 ? true : step === 2 ? inputsValid : step === 3 ? true : true;

  if (isLoading || !model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = async (action: SaveAction) => {
    const persistedOverrides = decisionToPersistedOverrides(data, { type: "add_program", inputs });
    const existing = ((data as Record<string, unknown>).customScenarios as CustomScenario[] | undefined) ?? [];
    const finalScenarioName = scenarioName.trim() || `Add ${inputs.name || "program"}`;

    // Capture the apply-time field-level diff BEFORE we mutate `data` so the
    // "before" values still reflect the pre-apply model. Persisted on the
    // entry below so the lender / board PDF "Decision history" section can
    // show reviewers exactly which fields the decision moved (Task #375).
    const appliedFieldChanges =
      action === "apply"
        ? summarizeDecisionChanges(data, { type: "add_program", inputs })
        : undefined;

    const entry: CustomScenario = {
      name: finalScenarioName,
      createdAt: new Date().toISOString(),
      overrides: persistedOverrides,
      decisionType: "add_program",
      narrative: narrative.trim(),
      ...(appliedFieldChanges ? { appliedFieldChanges } : {}),
    };

    // Snapshot the pre-mutation data so Undo can restore it intact (including
    // the customScenarios array as it was before this flow ran). We also
    // persist this snapshot on the model itself for the apply branch so the
    // founder can undo from the model dashboard after navigating away — see
    // `appliedDecisionUndo` below.
    const snapshotBeforeApply = data as Record<string, unknown>;

    let nextData: Record<string, unknown> = {
      ...(data as Record<string, unknown>),
      customScenarios: [...existing, entry],
    };

    if (action === "apply") {
      const applied = applyDecisionToData(data, { type: "add_program", inputs });
      const undoRecord: AppliedDecisionUndo = {
        decisionType: "add_program",
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
      // Surface a before/after confirmation modal instead of auto-redirecting.
      // The user navigates explicitly via "View updated model" or undoes the
      // change via "Undo apply", which restores `snapshotBeforeApply`.
      setApplyResult({
        changes: appliedFieldChanges ?? [],
        snapshot: snapshotBeforeApply,
        appliedScenarioName: finalScenarioName,
      });
    } else if (action === "later") {
      setTimeout(() => setLocation(`/model/${modelId}/scenarios`), 800);
    }
    // "planner" disabled for add_program (handled below)
  };

  const handleUndoApply = async () => {
    if (!applyResult || isUndoing) return;
    setIsUndoing(true);
    try {
      // The snapshot is the data exactly as it was before this apply, which
      // does NOT include the appliedDecisionUndo record we just persisted.
      // Restoring it therefore implicitly clears that record so the model
      // dashboard banner won't keep advertising an undo for a decision that
      // was already rolled back.
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
      decisionType="add_program"
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
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md bg-amber-600 text-white hover:bg-amber-700"
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
          decisionType="add_program"
          narrative={narrative}
          setNarrative={setNarrative}
          intro={
            <>
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                <GraduationCap className="h-3.5 w-3.5" /> Decision: Add a program
              </div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-3">
                Adding a new grade or program?
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed">
                Whether it's a new grade band, an after-school enrichment, or a special-education
                track, adding a program changes both your revenue and your cost base. We'll model the
                trade-off in four short steps so you can decide with the numbers — not just the gut.
              </p>
            </>
          }
          prepareList={[
            "Program name and grade band",
            "Annual tuition you'd charge per student",
            "Rough enrollment for years 1 through 5",
            "Optional: added FTE, salary, and any extra space cost",
          ]}
        />
      )}

      {step === 2 && (
        <section className="max-w-2xl space-y-5" data-testid="add-program-inputs">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">Tell us about the program</h2>
            <p className="text-sm text-muted-foreground">Estimates are fine. We'll refine in the impact step.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Program name">
              <input
                type="text"
                value={inputs.name}
                onChange={(e) => setInputs((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Pre-K, Music enrichment"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
                data-testid="add-program-name"
              />
            </Field>
            <Field label="Annual tuition / student">
              <NumberInput
                value={inputs.annualTuition}
                onChange={(v) => setInputs((s) => ({ ...s, annualTuition: v }))}
                placeholder="0"
                testid="add-program-tuition"
              />
            </Field>
          </div>

          <Field label="Grade band">
            <input
              type="text"
              value={inputs.gradeBand ?? ""}
              onChange={(e) => setInputs((s) => ({ ...s, gradeBand: e.target.value }))}
              placeholder="e.g. K-2, 6-8, Pre-K"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
              data-testid="add-program-grade-band"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {GRADE_BAND_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setInputs((s) => ({ ...s, gradeBand: preset }))}
                  className={cn(
                    "text-[11px] rounded-full px-2.5 py-1 border transition-colors",
                    inputs.gradeBand === preset
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-background text-foreground border-border hover:border-amber-400",
                  )}
                  data-testid={`add-program-grade-band-preset-${preset.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </Field>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Projected enrollment
            </p>
            <div className="grid grid-cols-5 gap-2">
              {([0, 1, 2, 3, 4] as const).map((i) => (
                <Field key={i} label={`Year ${i + 1}`}>
                  <NumberInput
                    value={inputs.enrollment[i]}
                    onChange={(v) => setInputs((s) => {
                      const next = [...s.enrollment] as [number, number, number, number, number];
                      next[i] = v;
                      return { ...s, enrollment: next };
                    })}
                    testid={`add-program-enrollment-${i + 1}`}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="border-t border-border/60 pt-5">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Cost side: staffing & space</p>
                <p className="text-xs text-muted-foreground">Skip these if your existing staff and space cover the program.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={!!inputs.staffingTbd}
                  onChange={(e) => setInputs((s) => ({ ...s, staffingTbd: e.target.checked }))}
                  className="h-4 w-4 rounded border-border text-amber-600"
                  data-testid="add-program-staffing-tbd"
                />
                I haven't figured out staffing yet
              </label>
            </div>
            {inputs.staffingTbd && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
                Got it — we'll skip staff costs in this scenario and surface a reminder in the impact step so
                you remember to fold them in before sharing this with a lender.
              </p>
            )}
            <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-4", inputs.staffingTbd && "opacity-50 pointer-events-none")}>
              <Field label="Added FTE">
                <NumberInput
                  value={inputs.addedFte ?? 0}
                  onChange={(v) => setInputs((s) => ({ ...s, addedFte: v }))}
                  step={0.5}
                  testid="add-program-fte"
                  disabled={inputs.staffingTbd}
                />
              </Field>
              <Field label="Salary / FTE">
                <NumberInput
                  value={inputs.addedFteSalary ?? 0}
                  onChange={(v) => setInputs((s) => ({ ...s, addedFteSalary: v }))}
                  testid="add-program-salary"
                  disabled={inputs.staffingTbd}
                />
              </Field>
              <Field label="Extra annual space cost">
                <NumberInput
                  value={inputs.addedAnnualSpace ?? 0}
                  onChange={(v) => setInputs((s) => ({ ...s, addedAnnualSpace: v }))}
                  testid="add-program-space"
                />
              </Field>
            </div>
          </div>

          {!inputsValid && (
            <p className="text-xs text-amber-700">
              Add a program name, tuition, and at least one year of enrollment to continue.
            </p>
          )}
        </section>
      )}

      {step === 3 && impact && (
        <section className="space-y-3" data-testid="add-program-impact">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">Impact on your model</h2>
            <p className="text-sm text-muted-foreground">
              Here's what adding {inputs.name || "this program"} does to your 5-year picture.
            </p>
          </div>
          <ImpactSummary impact={impact} />
        </section>
      )}

      {step === 4 && (
        <SaveActions
          decisionType="add_program"
          scenarioName={scenarioName}
          setScenarioName={setScenarioName}
          defaultName={`Add ${inputs.name || "Pre-K"}`}
          isSaving={updateMutation.isPending}
          done={done}
          doneAction={doneAction}
          onSave={handleSave}
          plannerAvailable={false}
          plannerUnavailableReason="Add-a-program scenarios use a synthesized revenue row that the live planner can't replay — pick Apply to my model to fold it in instead."
        />
      )}

      {applyResult && (
        <ApplyConfirmation
          decisionType="add_program"
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

function NumberInput({ value, onChange, step = 1, placeholder, testid, disabled }: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  placeholder?: string;
  testid?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={step}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        onChange(isNaN(v) ? 0 : v);
      }}
      className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background font-mono disabled:opacity-50"
      data-testid={testid}
    />
  );
}
