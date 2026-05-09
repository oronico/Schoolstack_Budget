// Task #705 — Simple Summary vs CFO Detail metric contracts.
//
// SimpleSummaryPanel surfaces, in plain language, what a founder needs
// to act on right now: top strengths, items to clarify, the single
// thing to fix first, and the lowest cash month. Every clarify / fix
// item carries the canonical `Next step:` line emitted by the
// diagnostics engine (Task #686 contract).
//
// CfoDetailPanel surfaces the lender / board-prep metrics in one
// place: staffing % of revenue, facility % of revenue, reserves
// months, debt payment cushion, founder-comp status, and revenue
// quality (grant / public dependency). The Assumption Confidence
// rollup card stays a separate sibling so both views share it.

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { runDiagnostics, type DiagnosticFinding, type ComputedMetrics } from "@/lib/coaching/diagnostics-engine";
import type { FullModelData } from "@/pages/model-wizard/schema";
import { formatCurrency } from "@/lib/utils";

export interface ReviewMetricsCommonProps {
  data: FullModelData;
  metrics: ComputedMetrics;
  lowestCash: { monthLabel: string; amount: number; isNegative: boolean } | null;
}

interface SimpleSummaryPanelProps extends ReviewMetricsCommonProps {
  onJumpToStep?: (step: number) => void;
}

interface Strength {
  label: string;
  detail: string;
}

function deriveStrengths(
  data: FullModelData,
  metrics: ComputedMetrics,
  lowestCash: ReviewMetricsCommonProps["lowestCash"],
): Strength[] {
  const out: Strength[] = [];
  const { y1Revenue, y1StaffingCost, y1FacilityCost, y1NetIncome, enrollment, breakevenEnrollment, grantRevenue } = metrics;
  if (y1Revenue > 0) {
    const staffPct = (y1StaffingCost / y1Revenue) * 100;
    if (staffPct > 0 && staffPct <= 60) out.push({ label: "Staffing in healthy range", detail: `${Math.round(staffPct)}% of revenue (target ≤ 60%).` });
    const facPct = (y1FacilityCost / y1Revenue) * 100;
    if (facPct > 0 && facPct <= 20) out.push({ label: "Facility costs are lean", detail: `${Math.round(facPct)}% of revenue (target ≤ 25%).` });
    const grantPct = (grantRevenue / y1Revenue) * 100;
    if (grantRevenue > 0 && grantPct < 25) out.push({ label: "Diversified revenue mix", detail: `Grants are only ${Math.round(grantPct)}% of revenue.` });
  }
  if (y1NetIncome > 0) out.push({ label: "Year 1 surplus", detail: `${formatCurrency(y1NetIncome)} projected after expenses.` });
  if (enrollment[0] > 0 && breakevenEnrollment > 0 && breakevenEnrollment !== Infinity && enrollment[0] >= breakevenEnrollment * 1.1) {
    out.push({ label: "Comfortably above breakeven", detail: `${enrollment[0]} students vs. ${breakevenEnrollment} needed.` });
  }
  if (lowestCash && !lowestCash.isNegative && lowestCash.amount > 0) {
    out.push({ label: "Cash stays positive every month", detail: `Lowest point ${formatCurrency(lowestCash.amount)} in ${lowestCash.monthLabel}.` });
  }
  const opening = data.openingBalances?.cash ?? 0;
  if (opening > 0 && y1Revenue > 0) {
    const months = opening / (metrics.y1TotalExpenses / 12);
    if (months >= 2) out.push({ label: "Solid opening reserves", detail: `${months.toFixed(1)} months of operating cushion at start.` });
  }
  return out.slice(0, 3);
}

export function SimpleSummaryPanel({ data, metrics, lowestCash, onJumpToStep }: SimpleSummaryPanelProps) {
  const findings = useMemo(() => runDiagnostics(data, 6), [data]);
  const criticals = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning").slice(0, 3);
  const strengths = useMemo(() => deriveStrengths(data, metrics, lowestCash), [data, metrics, lowestCash]);
  const fixFirst: DiagnosticFinding | null = criticals[0] ?? warnings[0] ?? null;

  return (
    <div data-testid="simple-summary-panel" className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm space-y-5">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-lg">Simple Summary</h3>
      </div>

      <section data-testid="simple-strengths">
        <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2 inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Top strengths
        </p>
        {strengths.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Add a few more inputs to see strengths surface here.</p>
        ) : (
          <ul className="space-y-1.5">
            {strengths.map((s, i) => (
              <li key={i} className="text-sm text-foreground"><span className="font-semibold">{s.label}.</span> <span className="text-muted-foreground">{s.detail}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="simple-clarify">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> Top items to clarify
        </p>
        {warnings.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Nothing flagged at the warning level.</p>
        ) : (
          <ul className="space-y-2.5">
            {warnings.map((w) => (
              <li key={w.id} className="text-sm">
                <p className="font-semibold text-foreground">{w.headline}</p>
                <p className="text-xs text-muted-foreground mt-0.5"><span className="font-semibold text-foreground">Next step:</span> {w.nextStep}</p>
                {onJumpToStep && (
                  <button type="button" onClick={() => onJumpToStep(w.targetStep)} className="text-[11px] inline-flex items-center gap-0.5 text-primary mt-0.5 hover:underline">
                    Jump to Step {w.targetStep} <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="simple-fix-first">
        <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide mb-2 inline-flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" /> What to fix first
        </p>
        {fixFirst ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-bold text-rose-900">{fixFirst.headline}</p>
            <p className="text-xs text-rose-800 mt-1"><span className="font-semibold">Next step:</span> {fixFirst.nextStep}</p>
          </div>
        ) : (
          <p className="text-sm text-emerald-700">Nothing critical right now — keep refining.</p>
        )}
      </section>

      <section data-testid="simple-lowest-cash">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" /> Lowest cash month
        </p>
        {lowestCash ? (
          <p className="text-sm text-foreground">
            <span className="font-bold">{lowestCash.monthLabel}</span> at <span className={lowestCash.isNegative ? "font-bold text-rose-700" : "font-bold text-foreground"}>{formatCurrency(lowestCash.amount)}</span>.
            <span className="text-muted-foreground"> See the cash flow chart below for the full curve.</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Add revenue + expense rows to see your lowest cash month.</p>
        )}
      </section>
    </div>
  );
}

interface CfoDetailPanelProps extends ReviewMetricsCommonProps {
  annualDebtService: number;
}

interface CfoMetric {
  testId: string;
  label: string;
  value: string;
  status: "ok" | "warn" | "bad" | "neutral";
  hint?: string;
}

export function CfoDetailPanel({ data, metrics, lowestCash, annualDebtService }: CfoDetailPanelProps) {
  const rows: CfoMetric[] = useMemo(() => {
    const out: CfoMetric[] = [];
    const { y1Revenue, y1StaffingCost, y1FacilityCost, y1TotalExpenses, y1NetIncome, grantRevenue, publicY1Revenue } = metrics;
    const opening = data.openingBalances?.cash ?? 0;

    const staffPct = y1Revenue > 0 ? (y1StaffingCost / y1Revenue) * 100 : 0;
    out.push({
      testId: "cfo-staffing-pct",
      label: "Staffing % of revenue",
      value: y1Revenue > 0 ? `${Math.round(staffPct)}%` : "—",
      status: staffPct === 0 ? "neutral" : staffPct < 60 ? "ok" : staffPct < 75 ? "warn" : "bad",
      hint: "Target 50–60%; lender concern above 75%.",
    });

    const facPct = y1Revenue > 0 ? (y1FacilityCost / y1Revenue) * 100 : 0;
    out.push({
      testId: "cfo-facility-pct",
      label: "Facility % of revenue",
      value: y1Revenue > 0 ? `${Math.round(facPct)}%` : "—",
      status: facPct === 0 ? "neutral" : facPct < 20 ? "ok" : facPct < 25 ? "warn" : "bad",
      hint: "Target ≤ 25%.",
    });

    const monthlyOpex = y1TotalExpenses / 12;
    const reservesMonths = monthlyOpex > 0 ? opening / monthlyOpex : 0;
    out.push({
      testId: "cfo-reserves-months",
      label: "Operating reserves",
      value: monthlyOpex > 0 ? `${reservesMonths.toFixed(1)} months` : "—",
      status: monthlyOpex === 0 ? "neutral" : reservesMonths >= 2 ? "ok" : reservesMonths >= 1 ? "warn" : "bad",
      hint: "Best practice is 45–60 days minimum.",
    });

    const noi = y1NetIncome + annualDebtService;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;
    out.push({
      testId: "cfo-debt-cushion",
      label: "Debt payment cushion",
      value: annualDebtService > 0 ? `${dscr.toFixed(2)}x` : "No debt service",
      status: annualDebtService === 0 ? "neutral" : dscr >= 1.25 ? "ok" : dscr >= 1.0 ? "warn" : "bad",
      hint: "Lenders typically want ≥ 1.25x.",
    });

    const founderCompFinding = runDiagnostics(data, 20).find((f) => f.id === "founder_compensation_missing");
    out.push({
      testId: "cfo-founder-comp",
      label: "Founder compensation",
      value: founderCompFinding ? "Missing or below market" : "Modeled",
      status: founderCompFinding ? "warn" : "ok",
      hint: founderCompFinding ? founderCompFinding.nextStep : "Founder / head-of-school salary is in the staffing model.",
    });

    const dependentRev = grantRevenue + publicY1Revenue;
    const qualityPct = y1Revenue > 0 ? (dependentRev / y1Revenue) * 100 : 0;
    out.push({
      testId: "cfo-revenue-quality",
      label: "Revenue from grants + public funding",
      value: y1Revenue > 0 ? `${Math.round(qualityPct)}%` : "—",
      status: y1Revenue === 0 ? "neutral" : qualityPct < 40 ? "ok" : qualityPct < 60 ? "warn" : "bad",
      hint: "Above 40% concentration is a lender flag (concentration / timing risk).",
    });

    if (lowestCash) {
      out.push({
        testId: "cfo-lowest-cash",
        label: "Lowest cash month",
        value: `${lowestCash.monthLabel} · ${formatCurrency(lowestCash.amount)}`,
        status: lowestCash.isNegative ? "bad" : lowestCash.amount < (data.openingBalances?.cash ?? 0) * 0.25 ? "warn" : "ok",
        hint: "Driven by per-stream collection timing vs. payroll cadence.",
      });
    }

    return out;
  }, [data, metrics, lowestCash, annualDebtService]);

  return (
    <div data-testid="cfo-detail-panel" className="bg-white rounded-2xl p-6 border border-border/60 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="h-5 w-5 text-primary" />
        <h3 className="font-display font-bold text-lg">CFO Detail metrics</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((m) => (
          <div key={m.testId} data-testid={m.testId} data-status={m.status} className="rounded-xl border border-border/50 bg-secondary/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</p>
            <p
              className={
                m.status === "bad"
                  ? "text-lg font-display font-bold text-rose-700 mt-0.5"
                  : m.status === "warn"
                  ? "text-lg font-display font-bold text-amber-700 mt-0.5"
                  : m.status === "ok"
                  ? "text-lg font-display font-bold text-emerald-700 mt-0.5"
                  : "text-lg font-display font-bold text-foreground mt-0.5"
              }
            >
              {m.value}
            </p>
            {m.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{m.hint}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
