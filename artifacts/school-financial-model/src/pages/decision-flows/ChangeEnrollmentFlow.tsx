import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { Loader2, Users, ArrowRight, FileSpreadsheet } from "lucide-react";
import { DecisionFlowShell } from "@/components/decision-flow/DecisionFlowShell";
import { ModelMiniSummary } from "@/components/decision-flow/ModelMiniSummary";
import { ImpactSummary } from "@/components/decision-flow/ImpactSummary";
import {
  buildBlankEnrollmentChangeInputs,
  computeDecisionImpact,
  decisionToPersistedOverrides,
  type EnrollmentChangeInputs,
} from "@/lib/decision-flows";
import type { FullModelData, CustomScenario } from "@/pages/model-wizard/schema";

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

  const canAdvance = step === 1 ? true : step === 2 ? hasAnyChange : step === 3 ? true : scenarioName.trim().length > 0;

  if (isLoading || !model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = async () => {
    const persistedOverrides = decisionToPersistedOverrides(data, { type: "change_enrollment", inputs });
    const existing = ((data as Record<string, unknown>).customScenarios as CustomScenario[] | undefined) ?? [];
    const entry: CustomScenario = {
      name: scenarioName.trim() || "Enrollment change",
      createdAt: new Date().toISOString(),
      overrides: persistedOverrides,
      decisionType: "change_enrollment",
      narrative: narrative.trim(),
    };
    await updateMutation.mutateAsync({
      id: modelId,
      data: {
        data: { ...(data as Record<string, unknown>), customScenarios: [...existing, entry] } as Record<string, unknown>,
      },
    });
    setDone(true);
  };

  return (
    <DecisionFlowShell
      decisionType="change_enrollment"
      modelId={modelId}
      modelName={model.name ?? "Untitled Model"}
      step={step}
      setStep={setStep}
      canAdvance={canAdvance}
      onSave={handleSave}
      isSaving={updateMutation.isPending}
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
    >
      {step === 1 && (
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <Users className="h-3.5 w-3.5" /> Decision: Change enrollment
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground mb-3">
            Adjusting your enrollment plan?
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-5">
            Whether your re-enrollment came in stronger than expected, you're tightening a recruitment
            target, or your board wants to plan for a slower ramp — let's see what the new enrollment
            picture does to revenue, cash, and break-even.
          </p>
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900/90">
            <p className="font-semibold mb-1">What you'll set</p>
            <ul className="list-disc pl-4 space-y-1 text-emerald-900/80">
              <li>How many more (or fewer) students per year — relative to the model</li>
              <li>Optional: a new retention rate</li>
              <li>Optional: a tuition adjustment per student</li>
            </ul>
          </div>
          <div className="mt-5 text-xs text-muted-foreground">
            Current enrollment in this model:{" "}
            <span className="font-mono font-semibold text-foreground">
              {baseEnrollment.map((n, i) => `Y${i + 1}: ${n}`).join(" • ")}
            </span>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="max-w-2xl space-y-5" data-testid="change-enrollment-inputs">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">What's changing?</h2>
            <p className="text-sm text-muted-foreground">Use positive numbers for more students, negative for fewer.</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Enrollment Δ vs. base
            </p>
            <div className="grid grid-cols-5 gap-2">
              {([0, 1, 2, 3, 4] as const).map((i) => (
                <Field key={i} label={`Y${i + 1} (now ${baseEnrollment[i]})`}>
                  <NumberInput
                    value={inputs.enrollmentDelta[i]}
                    onChange={(v) => setInputs((s) => {
                      const next = [...s.enrollmentDelta] as [number, number, number, number, number];
                      next[i] = v;
                      return { ...s, enrollmentDelta: next };
                    })}
                    allowNegative
                    testid={`change-enrollment-delta-${i + 1}`}
                  />
                </Field>
              ))}
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
              Make at least one change to continue.
            </p>
          )}
        </section>
      )}

      {step === 3 && impact && (
        <section className="space-y-3" data-testid="change-enrollment-impact">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">Impact on your model</h2>
            <p className="text-sm text-muted-foreground">
              Here's what this enrollment shift does to your 5-year picture.
            </p>
          </div>
          <ImpactSummary impact={impact} />
        </section>
      )}

      {step === 4 && (
        <section className="max-w-xl space-y-4" data-testid="change-enrollment-save">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">Save this decision</h2>
            <p className="text-sm text-muted-foreground">
              We'll save it as a named scenario tagged "Change enrollment" — easy to revisit when
              re-enrollment numbers come in.
            </p>
          </div>
          <Field label="Scenario name">
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="e.g. Q3 re-enrollment update"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
              data-testid="change-enrollment-scenario-name"
            />
          </Field>
          <Field label="What's behind this change? (optional)">
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Recruitment update, retention surprise, board target, what's driving the shift…"
              rows={4}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
              data-testid="change-enrollment-narrative"
            />
          </Field>
          {done && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900">
              <p className="font-semibold mb-1 inline-flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4" /> Saved as a scenario
              </p>
              <p className="text-emerald-900/80">
                You'll find this under Saved What-If scenarios on your Scenarios page.
              </p>
            </div>
          )}
        </section>
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
