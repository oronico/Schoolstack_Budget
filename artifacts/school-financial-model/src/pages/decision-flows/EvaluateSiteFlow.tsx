import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetModel, useUpdateModel } from "@workspace/api-client-react";
import { Loader2, Building2, ArrowRight } from "lucide-react";
import { DecisionFlowShell } from "@/components/decision-flow/DecisionFlowShell";
import { ModelMiniSummary } from "@/components/decision-flow/ModelMiniSummary";
import { ImpactSummary } from "@/components/decision-flow/ImpactSummary";
import { WhyStep } from "@/components/decision-flow/WhyStep";
import { SaveActions, type SaveAction } from "@/components/decision-flow/SaveActions";
import {
  applyDecisionToData,
  buildBlankSiteInputs,
  computeDecisionImpact,
  decisionToPersistedOverrides,
  siteInputsToOverrides,
  type SiteInputs,
} from "@/lib/decision-flows";
import { detectFacilityRent, encodeOverridesToHash } from "@/lib/whatif-engine";
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
  const [doneAction, setDoneAction] = useState<SaveAction | null>(null);

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
  const canAdvance = step === 1 ? true : step === 2 ? inputsValid : true;

  if (isLoading || !model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = async (action: SaveAction) => {
    const persistedOverrides = decisionToPersistedOverrides(data, { type: "evaluate_site", inputs });
    const existing = ((data as Record<string, unknown>).customScenarios as CustomScenario[] | undefined) ?? [];
    const entry: CustomScenario = {
      name: scenarioName.trim() || "Evaluate site",
      createdAt: new Date().toISOString(),
      overrides: persistedOverrides,
      decisionType: "evaluate_site",
      narrative: narrative.trim(),
    };

    let nextData: Record<string, unknown> = {
      ...(data as Record<string, unknown>),
      customScenarios: [...existing, entry],
    };

    if (action === "apply") {
      const applied = applyDecisionToData(data, { type: "evaluate_site", inputs });
      nextData = {
        ...(applied as Record<string, unknown>),
        customScenarios: [...existing, entry],
      };
    }

    await updateMutation.mutateAsync({
      id: modelId,
      data: { data: nextData as Record<string, unknown> },
    });
    setDoneAction(action);
    setDone(true);

    if (action === "apply") {
      setTimeout(() => setLocation(`/model/${modelId}`), 800);
    } else if (action === "later") {
      setTimeout(() => setLocation(`/model/${modelId}/scenarios`), 800);
    } else if (action === "planner") {
      const ov = siteInputsToOverrides(data, inputs);
      const hash = encodeOverridesToHash(ov);
      setTimeout(() => setLocation(`/model/${modelId}/scenarios${hash ? `#${hash}` : ""}`), 600);
    }
  };

  return (
    <DecisionFlowShell
      decisionType="evaluate_site"
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
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md bg-teal-600 text-white hover:bg-teal-700"
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
          decisionType="evaluate_site"
          narrative={narrative}
          setNarrative={setNarrative}
          intro={
            <>
              <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
                <Building2 className="h-3.5 w-3.5" /> Decision: Evaluate a site
              </div>
              <h1 className="font-display text-3xl font-bold text-foreground mb-3">
                Considering a new building or lease?
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed">
                Real estate is the single biggest fixed-cost decision a school makes. Before you sign
                a lease — or commit to fit-out — let's see what happens to your DSCR, cash runway, and
                break-even year if this site becomes reality.
              </p>
              {detected.monthlyRent && (
                <p className="mt-4 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 inline-block">
                  We detected your current modeled rent at{" "}
                  <span className="font-mono font-semibold text-foreground">
                    ${detected.monthlyRent.toLocaleString()}/mo
                  </span>
                  . We'll compare the new site against that.
                </p>
              )}
            </>
          }
          prepareList={[
            "Proposed monthly rent (gross — include CAM/NNN if you have it)",
            "Annual rent escalation in the lease",
            "Optional: square footage and a one-time fit-out estimate",
            "What year this kicks in (signing now? Year 2?)",
          ]}
        />
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
              Here's what moving to this site would do to your 5-year picture — through a lender's eyes.
            </p>
          </div>
          <ImpactSummary impact={impact} />
        </section>
      )}

      {step === 4 && (
        <SaveActions
          decisionType="evaluate_site"
          scenarioName={scenarioName}
          setScenarioName={setScenarioName}
          defaultName="Maple St. lease"
          isSaving={updateMutation.isPending}
          done={done}
          doneAction={doneAction}
          onSave={handleSave}
          plannerAvailable={!inputs.oneTimeFitOut || inputs.oneTimeFitOut <= 0}
          plannerUnavailableReason="Your scenario includes a one-time fit-out cost, which the live planner can't replay yet. Pick Apply to my model to fold the full picture in, or save & review later to keep the fit-out for the lender packet."
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
