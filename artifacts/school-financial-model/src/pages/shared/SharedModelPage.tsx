import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { TrendingUp, TrendingDown, Users, DollarSign, Shield, Clock, AlertTriangle, ArrowRightLeft, Download, ExternalLink, Loader2, Plus, XCircle, Target } from "lucide-react";
import { MAX_COMPARE_KEYS } from "@/lib/share-comparison";
import { BENCHMARK_DSCR_GREEN, BENCHMARK_DSCR_AMBER } from "@/lib/benchmark-thresholds";
import { SEOHead } from "@/components/SEOHead";
import { DECISION_LABELS, type DecisionImpact } from "@/lib/decision-flows";
import { lenderReadinessCoachingHeadline } from "@/lib/coaching/lender-readiness-coaching";
import type { DecisionType } from "@/pages/model-wizard/schema";
import { ImpactSummary } from "@/components/decision-flow/ImpactSummary";
import {
  ASSUMPTION_REGISTRY,
  ASSUMPTION_CONFIDENCE_LABELS,
  isEstimateWithoutEvidence,
  HIGH_IMPACT_CONFIDENCE_KEYS,
  type AssumptionKey,
} from "@workspace/finance";

// Mirrors the (decision-typed) saved scenario shape exposed by GET
// /api/shared/:token. The server precomputes the engine-derived `impact`
// using the same engine the founder's scenarios page uses, so we don't
// need (and never receive) the raw model inputs on this public endpoint.
interface SharedDecisionScenario {
  name: string;
  createdAt: string;
  decisionType: DecisionType;
  narrative?: string;
  impact: DecisionImpact | null;
}

interface SharedModelData {
  schoolName: string;
  state: string;
  schoolType: string;
  entityType: string;
  // "single_year" tells the shared page to render only Year 1 in the
  // Summary/Revenue/Expense tables and the enrollment chart so a founder
  // who built a single-year budget doesn't accidentally show a lender or
  // board $0 in Y2-Y5. Older payloads without the field are treated as
  // 5-year so we never silently collapse an existing share link.
  modelDuration?: "single_year" | "five_year";
  enrollment: number[];
  revenue: number[];
  expenses: number[];
  netIncome: number[];
  staffingCost: number[];
  facilityCost: number[];
  debtService: number[];
  netMargin: number[];
  dscr: number[];
  reserveMonths: number;
  cashRunwayMonths: number;
  daysCashOnHand: number;
  revenueBreakdown: { tuition: number; public: number; philanthropy: number }[];
  executiveSummary: string | null;
  lenderReadiness: string | null;
  createdAt: string;
  // Saved decision-flow scenarios (only those with a decisionType). Each
  // scenario carries a server-precomputed `impact` so the comparison block
  // and PDF stay scoped to the same aggregates the rest of this payload
  // already publishes — no per-line-item model inputs leak over the wire.
  decisionScenarios?: SharedDecisionScenario[];
  // Task #659 — per-assumption confidence + evidence note keyed by
  // AssumptionKey. Empty / omitted on older shared models, in which
  // case the Assumptions Confidence section is silently skipped.
  assumptionConfidence?: Record<
    string,
    { confidence: "actuals" | "signed_agreement" | "quote" | "research" | "estimate"; evidenceNote?: string }
  >;
  // Task #626 — server-precomputed Break-even & downside aggregates so the
  // shared page can render the same card founders see on the dashboard,
  // scenario planner, lender PDF, and underwriting workbook (Task #612). The
  // numbers come from the canonical engine (`computeBaseFinancials` +
  // `computeDownsideBand`) so every surface stays in sync. `null` (or
  // omitted on older share links predating this layer) hides the section.
  breakEvenDownside?: {
    breakEvenStudents: Array<number | null>;
    breakEvenUtilization: Array<number | null>;
    maxCapacity: number | null;
    enrollment: number[];
    downsideBand: {
      minus10: { enrollment: number[]; dscr: number[]; endingCash: number[] };
      minus20: { enrollment: number[]; dscr: number[]; endingCash: number[] };
    };
  } | null;
}

// Task #659 — Assumptions Confidence section. Mirrors the lender PDF /
// underwriting workbook layout: groups every founder-tagged assumption
// by its wizard step, prints confidence + (optional) evidence note, and
// calls out high-impact assumptions still tagged "estimate" with no
// evidence so a recipient can see at a glance where the model is
// anchored vs. still a placeholder. Skipped silently when no entries
// exist (or for older share links predating this layer).
function AssumptionsConfidenceSection({ data }: { data: SharedModelData }) {
  const confidence = data.assumptionConfidence || {};
  const entries = Object.entries(confidence).filter(([k]) =>
    Object.prototype.hasOwnProperty.call(ASSUMPTION_REGISTRY, k),
  ) as Array<[AssumptionKey, { confidence: keyof typeof ASSUMPTION_CONFIDENCE_LABELS; evidenceNote?: string }]>;
  if (entries.length === 0) return null;

  const byStep = new Map<string, AssumptionKey[]>();
  for (const [key] of entries) {
    const step = ASSUMPTION_REGISTRY[key].stepTitle;
    if (!byStep.has(step)) byStep.set(step, []);
    byStep.get(step)!.push(key);
  }
  const orderedSteps = [...byStep.keys()].sort((a, b) => {
    const ka = byStep.get(a)![0];
    const kb = byStep.get(b)![0];
    return ASSUMPTION_REGISTRY[ka].defaultStepNumber - ASSUMPTION_REGISTRY[kb].defaultStepNumber;
  });

  const bareHighImpact = HIGH_IMPACT_CONFIDENCE_KEYS.filter((k) =>
    isEstimateWithoutEvidence(confidence[k]),
  );

  return (
    <section
      className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8"
      data-testid="shared-assumptions-confidence"
    >
      <h2 className="text-lg font-bold text-slate-800 mb-2">Assumptions Confidence</h2>
      <p className="text-sm text-slate-600 mb-4">
        The founder tagged each major assumption with the source they leaned
        on. Higher-confidence sources (actuals, signed agreements, written
        quotes) are stronger evidence than research benchmarks or estimates.
      </p>
      {bareHighImpact.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {bareHighImpact.length} swing-factor assumption
          {bareHighImpact.length === 1 ? "" : "s"} still tagged "estimate" with
          no evidence note: {bareHighImpact
            .map((k) => ASSUMPTION_REGISTRY[k].label)
            .join(", ")}.
        </div>
      )}
      <div className="space-y-5">
        {orderedSteps.map((step) => (
          <div key={step}>
            <h3 className="text-sm font-bold text-slate-700 mb-2">{step}</h3>
            <div className="space-y-2">
              {byStep.get(step)!.map((key) => {
                const entry = confidence[key]!;
                const meta = ASSUMPTION_REGISTRY[key];
                const isBare = isEstimateWithoutEvidence(entry);
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-slate-200 p-3"
                    data-testid={`shared-confidence-row-${key}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="text-sm font-semibold text-slate-800">
                        {meta.label}
                      </div>
                      <span
                        className={`text-xs font-semibold rounded px-2 py-0.5 border ${
                          isBare
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                        }`}
                      >
                        {ASSUMPTION_CONFIDENCE_LABELS[entry.confidence]}
                      </span>
                    </div>
                    {entry.evidenceNote?.trim() && (
                      <div className="mt-1.5 text-sm text-slate-600">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Evidence:{" "}
                        </span>
                        {entry.evidenceNote.trim()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Task #626 — Break-even & downside section. Mirrors the founder dashboard's
// `BreakEvenDownsideCard` (Task #612) so a recipient opening a /shared/:token
// link sees the same Y1 break-even students, utilization vs max capacity, and
// -10% / -20% enrollment downside DSCR + ending cash as the founder, lender
// PDF, and underwriting workbook. The numbers are precomputed server-side
// from the canonical engine (`computeBaseFinancials` + `computeDownsideBand`)
// so every surface stays in sync — no per-line-item model inputs leak over
// the public share endpoint.
function BreakEvenDownsideSection({ data }: { data: SharedModelData }) {
  const bed = data.breakEvenDownside;
  if (!bed) return null;

  const beY1 = bed.breakEvenStudents[0];
  const utilY1 = bed.breakEvenUtilization[0];
  const plannedY1 = bed.enrollment[0] ?? 0;

  const fmtBe = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : Math.round(n).toLocaleString();
  const fmtUtil = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : `${(n * 100).toFixed(0)}%`;
  const fmtDscr = (n: number | null | undefined) =>
    n === null || n === undefined || n === 0 ? "—" : `${n.toFixed(2)}x`;

  let status: "above" | "at" | "below" | "unknown" = "unknown";
  let statusLabel = "";
  let statusClass = "";
  let statusCopy = "";
  if (beY1 !== null && beY1 !== undefined && plannedY1 > 0) {
    const cushion = plannedY1 - beY1;
    const pctCushion = cushion / beY1;
    if (cushion < 0) {
      status = "below";
      statusLabel = "Below break-even";
      statusClass = "bg-red-50 text-red-800 border-red-200";
      statusCopy = `Planned enrollment is ${Math.abs(cushion)} students short of the ${beY1} needed to cover costs in Year 1.`;
    } else if (pctCushion < 0.05) {
      status = "at";
      statusLabel = "At break-even";
      statusClass = "bg-amber-50 text-amber-800 border-amber-200";
      statusCopy = `Planned enrollment is right at the break-even line — only ${cushion} students of cushion above the ${beY1} needed.`;
    } else {
      status = "above";
      statusLabel = "Above break-even";
      statusClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
      statusCopy = `Planned enrollment is ${cushion} students (${(pctCushion * 100).toFixed(0)}%) above the ${beY1} needed to cover Year 1 costs.`;
    }
  }

  return (
    <section
      className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8"
      data-testid="shared-break-even-downside"
    >
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Target className="h-4 w-4 text-amber-600" />
          Break-even &amp; downside
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Students needed to cover costs in Year 1 and what happens if
          enrollment slips.
        </p>
      </div>

      {status !== "unknown" && (
        <div
          data-testid={`shared-break-even-status-${status}`}
          className={`mb-4 border rounded-lg px-3 py-2 text-sm ${statusClass}`}
        >
          <span className="font-semibold">{statusLabel}.</span> {statusCopy}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div
          data-testid="shared-break-even-students-y1"
          className="bg-slate-50 border border-slate-200 rounded-xl p-4"
        >
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Year 1 break-even students
          </p>
          <p className="font-bold text-2xl text-slate-800 mt-1">
            {fmtBe(beY1)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Planned: {plannedY1} students
          </p>
        </div>
        <div
          data-testid="shared-break-even-utilization-y1"
          className="bg-slate-50 border border-slate-200 rounded-xl p-4"
        >
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Year 1 utilization to break even
          </p>
          <p className="font-bold text-2xl text-slate-800 mt-1">
            {fmtUtil(utilY1)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {utilY1 === null || utilY1 === undefined
              ? "Set max capacity to see utilization"
              : `of stated max capacity${bed.maxCapacity ? ` (${bed.maxCapacity})` : ""}`}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5" />
          Downside enrollment band — Year 1
        </h3>
        <div className="overflow-x-auto">
          <table
            data-testid="shared-downside-band-table"
            className="w-full text-sm"
          >
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th className="text-left py-1.5 font-medium">Scenario</th>
                <th className="text-right py-1.5 font-medium">Students</th>
                <th className="text-right py-1.5 font-medium">DSCR</th>
                <th className="text-right py-1.5 font-medium">Ending cash</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "If 10% fewer", d: bed.downsideBand.minus10 },
                { label: "If 20% fewer", d: bed.downsideBand.minus20 },
              ].map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="py-2 text-slate-700">{row.label}</td>
                  <td className="py-2 text-right tabular-nums text-slate-800">
                    {row.d.enrollment[0] ?? 0}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-800">
                    {fmtDscr(row.d.dscr[0])}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-800">
                    {fmt(row.d.endingCash[0] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function MetricCard({ label, value, subtext, icon: Icon, status }: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ElementType;
  status?: "good" | "warning" | "danger";
}) {
  const colors = {
    good: "text-green-600 bg-green-50 border-green-200",
    warning: "text-amber-600 bg-amber-50 border-amber-200",
    danger: "text-red-600 bg-red-50 border-red-200",
  };
  const c = status ? colors[status] : "text-slate-600 bg-slate-50 border-slate-200";
  return (
    <div className={`rounded-xl border p-5 ${c}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 opacity-70" />
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtext && <div className="text-xs mt-1 opacity-70">{subtext}</div>}
    </div>
  );
}

function SummaryTable({ data }: { data: SharedModelData }) {
  // Single-year payloads still return 5-element arrays from the engine; cap
  // the visible columns to Y1 only so a single-year founder doesn't show a
  // lender or board $0 across Y2-Y5.
  const isSingleYear = data.modelDuration === "single_year";
  const cap = isSingleYear ? 1 : 5;
  const allYears = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
  const years = allYears.slice(0, cap);
  const slice = <T,>(arr: T[]) => arr.slice(0, cap);
  const rows: { label: string; values: string[]; bold?: boolean }[] = [
    { label: "Enrollment", values: slice(data.enrollment).map(e => e.toLocaleString()) },
    { label: "Total Revenue", values: slice(data.revenue).map(fmt), bold: true },
    { label: "Total Expenses", values: slice(data.expenses).map(fmt), bold: true },
    { label: "Net Income", values: slice(data.netIncome).map(fmt), bold: true },
    { label: "Net Margin", values: slice(data.netMargin).map(pct) },
  ];

  if (slice(data.dscr).some(d => d > 0)) {
    rows.push({ label: "DSCR", values: slice(data.dscr).map(d => d > 0 ? `${d.toFixed(2)}x` : "N/A") });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-left py-3 pr-4 font-semibold text-slate-500 w-40"></th>
            {years.map(y => (
              <th key={y} className="text-right py-3 px-3 font-semibold text-slate-600 min-w-[100px]">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-slate-100 ${row.bold ? "font-semibold" : ""}`}>
              <td className="py-2.5 pr-4 text-slate-600">{row.label}</td>
              {row.values.map((v, j) => (
                <td key={j} className={`text-right py-2.5 px-3 ${row.label === "Net Income" ? (data.netIncome[j] >= 0 ? "text-green-700" : "text-red-600") : "text-slate-800"}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenueBreakdownSection({ data }: { data: SharedModelData }) {
  const isSingleYear = data.modelDuration === "single_year";
  const cap = isSingleYear ? 1 : 5;
  const years = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"].slice(0, cap);
  const breakdown = data.revenueBreakdown.slice(0, cap);
  const revenue = data.revenue.slice(0, cap);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-left py-3 pr-4 font-semibold text-slate-500 w-40"></th>
            {years.map(y => (
              <th key={y} className="text-right py-3 px-3 font-semibold text-slate-600 min-w-[100px]">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Tuition & Fees</td>
            {breakdown.map((rb, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(rb.tuition)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Public Funding</td>
            {breakdown.map((rb, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(rb.public)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Grants & Philanthropy</td>
            {breakdown.map((rb, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(rb.philanthropy)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100 font-semibold">
            <td className="py-2.5 pr-4 text-slate-600">Total Revenue</td>
            {revenue.map((r, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(r)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ExpenseBreakdownSection({ data }: { data: SharedModelData }) {
  const isSingleYear = data.modelDuration === "single_year";
  const cap = isSingleYear ? 1 : 5;
  const years = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"].slice(0, cap);
  const expenses = data.expenses.slice(0, cap);
  const staffingCost = data.staffingCost.slice(0, cap);
  const facilityCost = data.facilityCost.slice(0, cap);
  const debtService = data.debtService.slice(0, cap);
  const otherOpex = expenses.map((e, i) => e - staffingCost[i] - facilityCost[i] - debtService[i]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200">
            <th className="text-left py-3 pr-4 font-semibold text-slate-500 w-40"></th>
            {years.map(y => (
              <th key={y} className="text-right py-3 px-3 font-semibold text-slate-600 min-w-[100px]">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Staffing</td>
            {staffingCost.map((s, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(s)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Facility</td>
            {facilityCost.map((f, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(f)}</td>
            ))}
          </tr>
          <tr className="border-b border-slate-100">
            <td className="py-2.5 pr-4 text-slate-600">Other Operating</td>
            {otherOpex.map((o, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(o)}</td>
            ))}
          </tr>
          {debtService.some(d => d > 0) && (
            <tr className="border-b border-slate-100">
              <td className="py-2.5 pr-4 text-slate-600">Debt Service</td>
              {debtService.map((d, i) => (
                <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(d)}</td>
              ))}
            </tr>
          )}
          <tr className="border-b border-slate-100 font-semibold">
            <td className="py-2.5 pr-4 text-slate-600">Total Expenses</td>
            {expenses.map((e, i) => (
              <td key={i} className="text-right py-2.5 px-3 text-slate-800">{fmt(e)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function EnrollmentChart({ enrollment }: { enrollment: number[] }) {
  // Length-1 inputs (single-year mode) render a single Y1 bar instead of
  // four ghost bars. Callers should pass the already-sliced array.
  const max = Math.max(...enrollment, 1);

  return (
    <div className="flex items-end gap-3 h-40" data-testid="shared-enrollment-chart">
      {enrollment.map((e, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-semibold text-slate-700">{e}</span>
          <div
            className="w-full bg-amber-500 rounded-t-md transition-all"
            style={{ height: `${Math.max((e / max) * 120, 4)}px` }}
          />
          <span className="text-xs text-slate-500">Y{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

export function LenderReadinessBadge({ readiness }: { readiness: string }) {
  const config = {
    "Strong": { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
    "Needs Work": { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
    "Not Yet Ready": { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  }[readiness] || { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-300" };

  // Task #753 — render the same coaching headline shown on every export
  // surface (lender packet PDF, lender summary PDF, founder summary, etc.)
  // so a recipient who opens the share link sees the same friendly framing
  // they would see in the PDF the founder shared.
  const headline = lenderReadinessCoachingHeadline(readiness) || readiness;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${config.bg} ${config.text} ${config.border}`}>
      {readiness === "Strong" && <Shield className="h-3.5 w-3.5" />}
      {readiness === "Needs Work" && <AlertTriangle className="h-3.5 w-3.5" />}
      {headline}
    </span>
  );
}

// Side-by-side comparison block for the shared page. Mirrors the 2-4 column
// comparison from the founder's own scenarios page so a co-founder, advisor,
// or board chair viewing the share link can pick saved decisions and see the
// same head-to-head impact view. Add/remove column controls match the
// founder's planner UX (`pages/scenarios/index.tsx` ~L2676-L2778), and the
// column cap (MAX_COMPARE_KEYS = 4) is shared via `lib/share-comparison`.
//
// The Download-as-PDF button is only rendered for the binary (2-up) case
// because the underlying PDF generator (`api-server/lib/decision-comparison-pdf`)
// renders an A vs B layout. Recipients with 3-4 columns selected can drop a
// column to bring the button back; we surface that hint in the helper text.
// The PDF call goes to the token-authed counterpart route at
// POST /api/shared/:token/export/decision-comparison-pdf.
function DecisionComparisonBlock({
  token,
  schoolName,
  scenarios,
  isSingleYear,
}: {
  token: string;
  schoolName?: string;
  scenarios: SharedDecisionScenario[];
  isSingleYear?: boolean;
}) {
  const keyOf = (s: SharedDecisionScenario) => `${s.name}|${s.createdAt}`;
  // Initialize with the first two saved decisions so the comparison renders
  // immediately. The recipient can add up to MAX_COMPARE_KEYS columns or
  // swap any of them out.
  const [compareKeys, setCompareKeys] = useState<string[]>(() => {
    const k0 = keyOf(scenarios[0]);
    const k1 = keyOf(scenarios[1] ?? scenarios[0]);
    return k0 === k1 ? [k0] : [k0, k1];
  });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const findByKey = (k: string) => scenarios.find((s) => keyOf(s) === k);

  // Reconcile selection against the current scenario list. Drop keys that no
  // longer resolve, then top up with the first available unused scenario so
  // we always have at least 2 columns when possible. Cap at MAX_COMPARE_KEYS.
  const validKeys = compareKeys.filter((k) => !!findByKey(k));
  let effectiveKeys = [...validKeys];
  for (const cs of scenarios) {
    if (effectiveKeys.length >= 2) break;
    const k = keyOf(cs);
    if (!effectiveKeys.includes(k)) effectiveKeys.push(k);
  }
  effectiveKeys = effectiveKeys.slice(0, MAX_COMPARE_KEYS);

  const usedSet = new Set(effectiveKeys);
  const remainingScenarios = scenarios.filter((cs) => !usedSet.has(keyOf(cs)));
  const canAddMore =
    effectiveKeys.length < MAX_COMPARE_KEYS && remainingScenarios.length > 0;

  const setKeyAt = (idx: number, value: string) => {
    const next = [...effectiveKeys];
    next[idx] = value;
    setCompareKeys(next);
  };
  const removeAt = (idx: number) => {
    if (effectiveKeys.length <= 2) return;
    setCompareKeys(effectiveKeys.filter((_, i) => i !== idx));
  };
  const addColumn = () => {
    if (!canAddMore) return;
    setCompareKeys([...effectiveKeys, keyOf(remainingScenarios[0])]);
  };

  // Detect any duplicate selection so we can surface a clear warning and
  // skip rendering the impact (which would otherwise show a confusing tie).
  const dupSet = new Set<string>();
  let hasDup = false;
  for (const k of effectiveKeys) {
    if (dupSet.has(k)) {
      hasDup = true;
      break;
    }
    dupSet.add(k);
  }

  const selectedScenarios = effectiveKeys.map((k) => findByKey(k));
  // Server pre-computes `impact` for every shared decision scenario. If any
  // selected one is null we can't render that column — surface a friendly
  // error instead of a half-empty grid.
  const missingImpact =
    !hasDup && selectedScenarios.some((s) => s && s.impact === null);
  const computeError = missingImpact
    ? "Couldn't compute impact for one of the selected decisions."
    : null;

  const columns =
    !hasDup && !missingImpact && selectedScenarios.every((s) => !!s && !!s.impact)
      ? selectedScenarios.map((cs) => ({
          impact: cs!.impact as NonNullable<SharedDecisionScenario["impact"]>,
          label: cs!.name,
          narrative: cs!.narrative,
        }))
      : [];

  // Per-column option list: each select shows all scenarios but disables
  // those already chosen in *other* columns so the user can't pick the same
  // scenario twice.
  const optionDisabled = (csKey: string, ownIdx: number) =>
    effectiveKeys.some((k, i) => i !== ownIdx && k === csKey);

  // PDF download is binary-only. Show it only when the recipient has
  // exactly 2 columns selected (and both impacts resolved).
  const canDownload =
    columns.length === 2 &&
    !!selectedScenarios[0]?.impact &&
    !!selectedScenarios[1]?.impact;

  const onDownload = async () => {
    if (!canDownload || downloading) return;
    const a = selectedScenarios[0]!;
    const b = selectedScenarios[1]!;
    const aImpact = a.impact!;
    const bImpact = b.impact!;
    setDownloading(true);
    setDownloadError(null);
    try {
      // Trim to exactly the fields the server validator expects; this
      // mirrors the payload the founder's scenarios page sends so the PDF
      // generator produces identical output.
      const serializeImpact = (im: NonNullable<SharedDecisionScenario["impact"]>) => ({
        base: {
          revenue: im.base.revenue,
          netIncome: im.base.netIncome,
          netMargin: im.base.netMargin,
          dscr: im.base.dscr,
          breakEvenYear: im.base.breakEvenYear,
          cashRunwayMonths: im.base.cashRunwayMonths,
        },
        adjusted: {
          revenue: im.adjusted.revenue,
          netIncome: im.adjusted.netIncome,
          netMargin: im.adjusted.netMargin,
          dscr: im.adjusted.dscr,
          breakEvenYear: im.adjusted.breakEvenYear,
          cashRunwayMonths: im.adjusted.cashRunwayMonths,
        },
        deltas: {
          revenue: im.deltas.revenue,
          netIncome: im.deltas.netIncome,
          breakEvenYearShift: im.deltas.breakEvenYearShift,
          cashRunwayDeltaMonths: im.deltas.cashRunwayDeltaMonths,
        },
        nudges: im.nudges,
      });
      const payload = {
        schoolName,
        primary: {
          label: a.name,
          decisionLabel: DECISION_LABELS[a.decisionType],
          narrative: a.narrative,
          impact: serializeImpact(aImpact),
        },
        compare: {
          label: b.name,
          decisionLabel: DECISION_LABELS[b.decisionType],
          narrative: b.narrative,
          impact: serializeImpact(bImpact),
        },
      };
      const apiBase = import.meta.env.VITE_API_BASE_URL || "";
      const res = await fetch(
        `${apiBase}/api/shared/${token}/export/decision-comparison-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `We couldn't put together that PDF right now — refresh and try again. (${res.status}${errText ? `: ${errText.slice(0, 200)}` : ""})`,
        );
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const m = disposition.match(/filename="?([^";\n]+)"?/);
      const safe = (s: string) =>
        s.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Scenario";
      const fallback = `Decision_Comparison_${safe(a.name)}_vs_${safe(b.name)}.pdf`;
      const filename = m?.[1] || fallback;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      link.remove();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "We couldn't put together that PDF right now — refresh and try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section
      className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8"
      data-testid="shared-decision-comparison-section"
    >
      <div className="flex items-center gap-2 mb-2">
        <ArrowRightLeft className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-bold text-slate-800">Compare decisions side-by-side</h2>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Pick 2-4 saved decisions and see Y5 net income, break-even shift, DSCR, and cash
        runway side-by-side - same numbers as the founder's planner, with the strongest
        column highlighted per metric.
      </p>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3"
        data-testid="shared-decision-compare-pickers"
      >
        {effectiveKeys.map((key, idx) => {
          const palette = ["A", "B", "C", "D"][idx] ?? "?";
          return (
            <div key={idx} className="min-w-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Decision {palette}
                </label>
                {effectiveKeys.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    className="text-[11px] text-slate-500 hover:text-rose-600 transition-colors"
                    data-testid={`shared-decision-compare-remove-${idx}`}
                    aria-label={`Remove decision ${palette}`}
                    title={`Remove decision ${palette}`}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <select
                value={key}
                onChange={(e) => setKeyAt(idx, e.target.value)}
                data-testid={`shared-decision-compare-select-${idx}`}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              >
                {scenarios.map((s) => {
                  const k = keyOf(s);
                  return (
                    <option key={k} value={k} disabled={optionDisabled(k, idx)}>
                      [{DECISION_LABELS[s.decisionType]}] {s.name}
                    </option>
                  );
                })}
              </select>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={addColumn}
          disabled={!canAddMore}
          data-testid="shared-decision-compare-add"
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={
            effectiveKeys.length >= MAX_COMPARE_KEYS
              ? `Maximum ${MAX_COMPARE_KEYS} decisions`
              : remainingScenarios.length === 0
              ? "No more saved decisions to add"
              : "Add another decision to the comparison"
          }
        >
          <Plus className="h-3.5 w-3.5" /> Add another decision
        </button>
        <span className="text-[11px] text-slate-500">
          {effectiveKeys.length} of {MAX_COMPARE_KEYS} columns
        </span>
      </div>
      {hasDup && (
        <p
          className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3"
          data-testid="shared-decision-compare-same-warning"
        >
          You picked the same decision more than once. Pick distinct scenarios to see a
          head-to-head comparison.
        </p>
      )}
      {computeError && (
        <p
          className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3"
          data-testid="shared-decision-compare-error"
        >
          Couldn't compute the comparison: {computeError}
        </p>
      )}
      {columns.length >= 2 && (
        <div className="space-y-4" data-testid="shared-decision-compare-result">
          {/* PDF download is gated to the binary case because the generator
              renders an A vs B layout. For 3-4 column selections we surface
              a hint so the recipient knows how to bring the button back. */}
          {canDownload ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-slate-500">
                Take this comparison straight to the board - one page, the same numbers
                you see here.
              </p>
              <button
                type="button"
                onClick={onDownload}
                disabled={downloading}
                data-testid="shared-decision-compare-download-pdf"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {downloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Preparing PDF…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" /> Download as PDF
                  </>
                )}
              </button>
            </div>
          ) : (
            <p
              className="text-xs text-slate-500 italic"
              data-testid="shared-decision-compare-pdf-hint"
            >
              PDF export is available for 2-decision comparisons. Remove a column to
              download the board-ready PDF.
            </p>
          )}
          {downloadError && (
            <p
              className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
              data-testid="shared-decision-compare-download-error"
            >
              {downloadError}
            </p>
          )}
          <ImpactSummary impact={columns[0].impact} columns={columns} isSingleYear={isSingleYear} />
        </div>
      )}
    </section>
  );
}

export function SharedModelPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<SharedModelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.token) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || "";
    fetch(`${apiBase}/api/shared/${params.token}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load shared model.");
        }
        return res.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Unable to load model</h2>
          <p className="text-slate-500">{error || "This shared link may have expired or been revoked."}</p>
        </div>
      </div>
    );
  }

  const isSingleYear = data.modelDuration === "single_year";
  const y1Margin = data.netMargin[0];
  const y5NetIncome = data.netIncome[4];
  const enrollmentForChart = isSingleYear ? data.enrollment.slice(0, 1) : data.enrollment;
  const summaryHeading = isSingleYear ? "Year 1 Financial Summary" : "5-Year Financial Summary";
  const headerLabel = isSingleYear ? "Single-Year Financial Model" : "5-Year Financial Model";

  return (
    <div className="min-h-screen bg-slate-50">
      <SEOHead
        title={`${data.schoolName} - Shared Model`}
        description="Shared financial model view on SchoolStack Budget."
        path={`/shared/${params.token}`}
        noIndex
      />
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{data.schoolName}</h1>
            <div className="flex items-center gap-3 mt-1">
              {data.state && <span className="text-sm text-slate-500">{data.state}</span>}
              {data.schoolType && <span className="text-sm text-slate-500">• {data.schoolType}</span>}
              {data.lenderReadiness && (
                <LenderReadinessBadge readiness={data.lenderReadiness} />
              )}
            </div>
          </div>
          <div className="text-xs text-slate-400" data-testid="shared-header-label">{headerLabel}</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {data.executiveSummary && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
            <h2 className="text-lg font-bold text-slate-800 mb-3">Executive Summary</h2>
            <p className="text-slate-600 leading-relaxed whitespace-pre-line">{data.executiveSummary}</p>
          </section>
        )}

        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <MetricCard
            label="Year 1 Enrollment"
            value={data.enrollment[0].toLocaleString()}
            subtext={isSingleYear ? undefined : `→ ${data.enrollment[4].toLocaleString()} by Year 5`}
            icon={Users}
          />
          <MetricCard
            label="Year 1 Revenue"
            value={fmt(data.revenue[0])}
            icon={DollarSign}
          />
          <MetricCard
            label="Year 1 Net Margin"
            value={pct(y1Margin)}
            icon={y1Margin >= 0 ? TrendingUp : TrendingDown}
            status={y1Margin >= 0.05 ? "good" : y1Margin >= 0 ? "warning" : "danger"}
          />
          <MetricCard
            label="Days Cash on Hand"
            value={`${data.daysCashOnHand}`}
            icon={Clock}
            status={data.daysCashOnHand >= 60 ? "good" : data.daysCashOnHand >= 30 ? "warning" : "danger"}
          />
          {!isSingleYear && (
            <MetricCard
              label="Year 5 Net Income"
              value={fmt(y5NetIncome)}
              icon={y5NetIncome >= 0 ? TrendingUp : TrendingDown}
              status={y5NetIncome > 0 ? "good" : "danger"}
            />
          )}
        </section>

        {data.dscr.some(d => d > 0) && (
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <MetricCard
              label="Year 1 DSCR"
              value={data.dscr[0] > 0 ? `${data.dscr[0].toFixed(2)}x` : "N/A"}
              subtext="Debt service coverage ratio"
              icon={Shield}
              status={data.dscr[0] >= BENCHMARK_DSCR_GREEN ? "good" : data.dscr[0] >= BENCHMARK_DSCR_AMBER ? "warning" : "danger"}
            />
            <MetricCard
              label="Reserve Months"
              value={data.reserveMonths.toFixed(1)}
              subtext={isSingleYear ? "Operating reserves" : "Operating reserves by Year 5"}
              icon={Clock}
              status={data.reserveMonths >= 3 ? "good" : data.reserveMonths > 0 ? "warning" : "danger"}
            />
            <MetricCard
              label="Cash Runway"
              value={`${data.cashRunwayMonths} mo`}
              subtext="Before cash runs out"
              icon={Clock}
              status={data.cashRunwayMonths >= 36 ? "good" : data.cashRunwayMonths >= 18 ? "warning" : "danger"}
            />
          </section>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Enrollment Projection</h2>
          <EnrollmentChart enrollment={enrollmentForChart} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4" data-testid="shared-summary-heading">{summaryHeading}</h2>
          <SummaryTable data={data} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Revenue Breakdown</h2>
          <RevenueBreakdownSection data={data} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Expense Breakdown</h2>
          <ExpenseBreakdownSection data={data} />
        </section>

        <BreakEvenDownsideSection data={data} />

        <AssumptionsConfidenceSection data={data} />

        {/* Side-by-side decision comparison + Download-as-PDF - only renders
            when the founder has at least two saved decision-flow scenarios.
            The PDF download hits the token-authed counterpart route so the
            recipient never needs an account. */}
        {data.decisionScenarios &&
          data.decisionScenarios.length >= 2 &&
          params.token && (
            <DecisionComparisonBlock
              token={params.token}
              schoolName={data.schoolName}
              scenarios={data.decisionScenarios}
              isSingleYear={data.modelDuration === "single_year"}
            />
          )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Powered by</span>
            <a
              href="https://budget.schoolstack.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-amber-600 hover:text-amber-700 transition-colors inline-flex items-center gap-1"
            >
              SchoolStack <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="text-xs text-slate-400">
            Shared on {new Date(data.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>
        </div>
      </footer>
    </div>
  );
}
