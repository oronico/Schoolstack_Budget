import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { Loader2, GraduationCap, ArrowRight, FileSpreadsheet } from "lucide-react";
import { DecisionFlowShell } from "@/components/decision-flow/DecisionFlowShell";
import { ModelMiniSummary } from "@/components/decision-flow/ModelMiniSummary";
import { ImpactSummary } from "@/components/decision-flow/ImpactSummary";
import {
  buildBlankAddProgramInputs,
  computeDecisionImpact,
  decisionToPersistedOverrides,
  type AddProgramInputs,
} from "@/lib/decision-flows";
import type { FullModelData, CustomScenario } from "@/pages/model-wizard/schema";

interface AddProgramFlowProps {
  modelId: number;
}

export function AddProgramFlow({ modelId }: AddProgramFlowProps) {
  const [, setLocation] = useLocation();
  const { data: model, isLoading } = useGetModel(modelId);
  const updateMutation = useUpdateModel();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [inputs, setInputs] = useState<AddProgramInputs>(buildBlankAddProgramInputs);
  const [scenarioName, setScenarioName] = useState("");
  const [narrative, setNarrative] = useState("");
  const [done, setDone] = useState(false);

  const data = (model?.data ?? {}) as FullModelData;

  const impact = useMemo(() => {
    if (step < 3 || !model) return null;
    return computeDecisionImpact(data, { type: "add_program", inputs });
  }, [step, model, data, inputs]);

  const inputsValid =
    inputs.name.trim().length > 0 &&
    inputs.annualTuition >= 0 &&
    inputs.enrollment.some((n) => n > 0);

  const canAdvance = step === 1 ? true : step === 2 ? inputsValid : step === 3 ? true : scenarioName.trim().length > 0;

  if (isLoading || !model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = async () => {
    const persistedOverrides = decisionToPersistedOverrides(data, { type: "add_program", inputs });
    const existing = ((data as Record<string, unknown>).customScenarios as CustomScenario[] | undefined) ?? [];
    const entry: CustomScenario = {
      name: scenarioName.trim() || `Add ${inputs.name || "program"}`,
      createdAt: new Date().toISOString(),
      overrides: persistedOverrides,
      decisionType: "add_program",
      narrative: narrative.trim(),
    };
    const next = [...existing, entry];
    await updateMutation.mutateAsync({
      id: modelId,
      data: {
        data: { ...(data as Record<string, unknown>), customScenarios: next } as Record<string, unknown>,
      },
    });
    setDone(true);
  };

  return (
    <DecisionFlowShell
      decisionType="add_program"
      modelId={modelId}
      modelName={model.name ?? "Untitled Model"}
      step={step}
      setStep={setStep}
      canAdvance={canAdvance}
      onSave={handleSave}
      isSaving={updateMutation.isPending}
      done={done}
      doneCta={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocation(`/model/${modelId}/scenarios`)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md bg-amber-600 text-white hover:bg-amber-700"
            data-testid="decision-flow-view-scenarios"
          >
            View on Scenarios <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      }
      sidebar={<ModelMiniSummary data={data} />}
    >
      {step === 1 && (
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
            <GraduationCap className="h-3.5 w-3.5" /> Decision: Add a program
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground mb-3">
            Adding a new grade or program?
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-5">
            Whether it's a new grade band, an after-school enrichment, or a special-education track,
            adding a program changes both your revenue and your cost base. We'll model the trade-off
            in four short steps so you can decide with the numbers — not just the gut.
          </p>
          <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-sm text-amber-900/90">
            <p className="font-semibold mb-1">What you'll need handy</p>
            <ul className="list-disc pl-4 space-y-1 text-amber-900/80">
              <li>Program name and the annual tuition you'd charge per student</li>
              <li>Rough enrollment for years 1 through 5</li>
              <li>Any added FTE (teachers, aides) and a typical salary</li>
              <li>Any extra space or facility cost (optional)</li>
            </ul>
          </div>
          <p className="mt-5 text-xs text-muted-foreground italic">
            None of this rewrites your base model. We'll save the result as a named scenario you can
            revisit, share, or apply later.
          </p>
        </section>
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
            <p className="text-sm font-semibold text-foreground mb-1">Optional: cost side</p>
            <p className="text-xs text-muted-foreground mb-3">Skip these if your existing staff and space cover the program.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Added FTE">
                <NumberInput
                  value={inputs.addedFte ?? 0}
                  onChange={(v) => setInputs((s) => ({ ...s, addedFte: v }))}
                  step={0.5}
                  testid="add-program-fte"
                />
              </Field>
              <Field label="Salary / FTE">
                <NumberInput
                  value={inputs.addedFteSalary ?? 0}
                  onChange={(v) => setInputs((s) => ({ ...s, addedFteSalary: v }))}
                  testid="add-program-salary"
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
        <section className="max-w-xl space-y-4" data-testid="add-program-save">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">Save this decision</h2>
            <p className="text-sm text-muted-foreground">
              We'll save it as a named scenario tagged "Add a program" — you can find it on the Scenarios page.
            </p>
          </div>
          <Field label="Scenario name">
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder={`e.g. Add ${inputs.name || "Pre-K"}`}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
              data-testid="add-program-scenario-name"
            />
          </Field>
          <Field label="Why are you considering this? (optional)">
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="What's driving this decision? Demand, mission, capacity, board ask…"
              rows={4}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
              data-testid="add-program-narrative"
            />
          </Field>
          {done && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900">
              <p className="font-semibold mb-1 inline-flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4" /> Saved as a scenario
              </p>
              <p className="text-emerald-900/80">
                You'll find this under Saved What-If scenarios on your Scenarios page, with the
                "Add a program" tag and your notes.
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

function NumberInput({ value, onChange, step = 1, placeholder, testid }: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  placeholder?: string;
  testid?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
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
