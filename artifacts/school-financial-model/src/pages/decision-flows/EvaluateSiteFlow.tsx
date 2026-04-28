import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { Loader2, Building2, ArrowRight, FileSpreadsheet } from "lucide-react";
import { DecisionFlowShell } from "@/components/decision-flow/DecisionFlowShell";
import { ModelMiniSummary } from "@/components/decision-flow/ModelMiniSummary";
import { ImpactSummary } from "@/components/decision-flow/ImpactSummary";
import {
  buildBlankSiteInputs,
  computeDecisionImpact,
  decisionToPersistedOverrides,
  type SiteInputs,
} from "@/lib/decision-flows";
import { detectFacilityRent } from "@/lib/whatif-engine";
import type { FullModelData, CustomScenario } from "@/pages/model-wizard/schema";

interface EvaluateSiteFlowProps {
  modelId: number;
}

export function EvaluateSiteFlow({ modelId }: EvaluateSiteFlowProps) {
  const [, setLocation] = useLocation();
  const { data: model, isLoading } = useGetModel(modelId);
  const updateMutation = useUpdateModel();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [inputs, setInputs] = useState<SiteInputs>({ newMonthlyRent: 0 });
  const [scenarioName, setScenarioName] = useState("");
  const [narrative, setNarrative] = useState("");
  const [done, setDone] = useState(false);

  const data = (model?.data ?? {}) as FullModelData;

  useEffect(() => {
    if (model) {
      setInputs(buildBlankSiteInputs(data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  const detected = useMemo(() => {
    if (!model) return { rowId: null, monthlyRent: null };
    return detectFacilityRent(data);
  }, [model, data]);

  const impact = useMemo(() => {
    if (step < 3 || !model) return null;
    return computeDecisionImpact(data, { type: "evaluate_site", inputs });
  }, [step, model, data, inputs]);

  const inputsValid = inputs.newMonthlyRent >= 0;
  const canAdvance = step === 1 ? true : step === 2 ? inputsValid : step === 3 ? true : scenarioName.trim().length > 0;

  if (isLoading || !model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = async () => {
    const persistedOverrides = decisionToPersistedOverrides(data, { type: "evaluate_site", inputs });
    const existing = ((data as Record<string, unknown>).customScenarios as CustomScenario[] | undefined) ?? [];
    const entry: CustomScenario = {
      name: scenarioName.trim() || "Evaluate site",
      createdAt: new Date().toISOString(),
      overrides: persistedOverrides,
      decisionType: "evaluate_site",
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
      decisionType="evaluate_site"
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
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md bg-teal-600 text-white hover:bg-teal-700"
          data-testid="decision-flow-view-scenarios"
        >
          View on Scenarios <ArrowRight className="h-4 w-4" />
        </button>
      }
      sidebar={<ModelMiniSummary data={data} />}
    >
      {step === 1 && (
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
            <Building2 className="h-3.5 w-3.5" /> Decision: Evaluate a site
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground mb-3">
            Considering a new building or lease?
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-5">
            Real estate is the single biggest fixed-cost decision a school makes. Before you sign a
            lease — or commit to fit-out — let's see what happens to your DSCR, cash runway, and
            break-even year if this site becomes reality.
          </p>
          <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 text-sm text-teal-900/90">
            <p className="font-semibold mb-1">What you'll need handy</p>
            <ul className="list-disc pl-4 space-y-1 text-teal-900/80">
              <li>Proposed monthly rent (gross — include CAM/NNN if you have it)</li>
              <li>Annual rent escalation in the lease</li>
              <li>Optional: square footage and a one-time fit-out estimate</li>
              <li>What year this kicks in (signing now? Year 2?)</li>
            </ul>
          </div>
          {detected.monthlyRent && (
            <p className="mt-5 text-xs text-muted-foreground">
              We detected your current modeled rent at <span className="font-mono font-semibold">${detected.monthlyRent.toLocaleString()}/mo</span>.
              We'll compare the new site against that.
            </p>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="max-w-2xl space-y-5" data-testid="evaluate-site-inputs">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">Tell us about the site</h2>
            <p className="text-sm text-muted-foreground">Use the broker's pro forma if you have one — otherwise, your best guess.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="New monthly rent (gross)">
              <NumberInput
                value={inputs.newMonthlyRent}
                onChange={(v) => setInputs((s) => ({ ...s, newMonthlyRent: v }))}
                placeholder="0"
                testid="evaluate-site-rent"
              />
            </Field>
            <Field label="Rent escalation %/yr">
              <NumberInput
                value={inputs.newRentEscalation ?? 3}
                onChange={(v) => setInputs((s) => ({ ...s, newRentEscalation: v }))}
                step={0.5}
                testid="evaluate-site-escalation"
              />
            </Field>
            <Field label="Square footage (optional)">
              <NumberInput
                value={inputs.newSqft ?? 0}
                onChange={(v) => setInputs((s) => ({ ...s, newSqft: v || undefined }))}
                testid="evaluate-site-sqft"
              />
            </Field>
            <Field label="One-time fit-out (Year 1)">
              <NumberInput
                value={inputs.oneTimeFitOut ?? 0}
                onChange={(v) => setInputs((s) => ({ ...s, oneTimeFitOut: v }))}
                testid="evaluate-site-fitout"
              />
            </Field>
          </div>

          <Field label="Effective from year">
            <select
              value={inputs.startYear ?? 1}
              onChange={(e) => setInputs((s) => ({ ...s, startYear: parseInt(e.target.value, 10) }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
              data-testid="evaluate-site-start-year"
            >
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={y}>Year {y}</option>
              ))}
            </select>
          </Field>
          {detected.monthlyRent && (
            <p className="text-xs text-muted-foreground">
              Comparing against current rent of <span className="font-mono font-semibold">${detected.monthlyRent.toLocaleString()}/mo</span>.
            </p>
          )}
        </section>
      )}

      {step === 3 && impact && (
        <section className="space-y-3" data-testid="evaluate-site-impact">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">Impact on your model</h2>
            <p className="text-sm text-muted-foreground">
              Here's what moving to this site would do to your 5-year picture.
            </p>
          </div>
          <ImpactSummary impact={impact} />
        </section>
      )}

      {step === 4 && (
        <section className="max-w-xl space-y-4" data-testid="evaluate-site-save">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground mb-1">Save this decision</h2>
            <p className="text-sm text-muted-foreground">
              We'll save it as a named scenario tagged "Evaluate a site" — easy to share with your board or lender.
            </p>
          </div>
          <Field label="Scenario name">
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="e.g. Maple St. lease"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
              data-testid="evaluate-site-scenario-name"
            />
          </Field>
          <Field label="Notes for your future self (optional)">
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Address, broker contact, lease term, why this site, what's still uncertain…"
              rows={4}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background"
              data-testid="evaluate-site-narrative"
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
