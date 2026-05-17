/**
 * Task #617 — Lender-ready and Board-ready narrative commentary blocks.
 *
 * These render as the lead block on the Lender Conversation Snapshot PDF
 * and the Board and Funder Summary PDF (after cover / one-page summary,
 * before the existing executive summary). They are also exposed on the
 * packet JSON so the in-app preview can surface them with a "Regenerate"
 * action prior to download.
 *
 * Design constraints (from the task requirements):
 *
 *  - Every numeric figure that appears in the commentary MUST reconcile
 *    to the canonical engine. We achieve this by building an explicit
 *    `NarrativeSourceBundle` from `ConsultantOutput` + `ModelData`,
 *    formatting every figure through helpers that record the formatted
 *    string into an `allowedFigures` set, and then a guard test parses
 *    the rendered paragraphs and asserts every numeric token appears in
 *    that set. No hand-typed numbers, no AI inference loop.
 *
 *  - No em-dashes anywhere in generated copy (banned style). Use periods,
 *    commas, semicolons, or " - " (ASCII hyphen with spaces) instead.
 *
 *  - Lender commentary: 3-6 paragraphs covering school summary,
 *    base-case (DSCR / runway / break-even), risks plus mitigants,
 *    founder normalization, and a closing.
 *
 *  - Board commentary: warmer tone, focus on enrollment trajectory,
 *    mission alignment, cash position, and decisions to make this period.
 */

import type { ConsultantOutput } from "../consultant-engine";
import type { ModelData } from "../workbook-helpers";
import { lenderReadinessCoachingHeadline } from "../lender-readiness-coaching.js";
import { formatRunwayMonths } from "./format-runway";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface NarrativeSourceBundle {
  // School identification
  schoolName: string;
  state: string | null;
  schoolType: string | null;
  schoolStage: string | null;

  // Headline verdict
  lenderReadiness: "Strong" | "Almost There" | "Needs Work" | "Not Yet Ready";
  lenderReadinessExplanation: string;
  biggestStrength: string;
  biggestRisk: string;

  // Enrollment trajectory
  enrollmentY1: number;
  enrollmentY5: number;
  retentionRatePct: number | null;
  maxCapacity: number | null;

  // Base-case financials (normalized = lender primary, reported = founder plan)
  dscrY1Normalized: number | null;
  dscrY1Reported: number | null;
  dscrMinNormalized: number | null;
  dscrMinNormalizedYear: number | null;
  cashRunwayMonths: number;
  reserveMonthsLastYear: number | null;
  reserveLastYearNumber: number;
  troughEndingCash: number | null;
  troughYear: number | null;
  breakEvenYear: number | null;
  breakEvenStudentsY1: number | null;
  breakEvenUtilizationY1Pct: number | null;

  // Founder comp normalization
  founderCompHasAdjustment: boolean;
  founderCompTotalDelta: number;

  // Revenue quality (Year 1, percent-form 0-100)
  revenueQualityY1: {
    contractedPct: number;
    projectedPct: number;
    donorDependentPct: number;
    policyDependentPct: number;
  } | null;

  // Top risks paired with their mitigants (already severity-ordered)
  topRisks: Array<{
    title: string;
    severity: "critical" | "high" | "medium";
    summary: string;
    mitigant: string;
  }>;

  // Worst-case stress test (lowest min DSCR across the battery)
  worstStress: {
    name: string;
    minDscr: number | null;
    minEndingCash: number | null;
  } | null;

  // Task #918 — every stress scenario whose Year-5 net income lands
  // negative. Drives the Lender Commentary closing paragraph so the
  // narrative names the failing scenarios (e.g. "Hard revenue only")
  // instead of telling the reader "no major red flags" while the Stress
  // Testing table on the same packet shows N of M scenarios in the red.
  // Pulled from `co.lenderStressTests.scenarios[*].netIncome[4]`, the
  // same source the Stress Tests section reads from.
  negativeY5StressScenarios: Array<{ name: string; y5NetIncome: number }>;

  // High-priority recommended actions for the board / founder
  highPriorityActions: Array<{ title: string; description: string }>;
}

export interface NarrativeCommentary {
  /** 3-6 paragraphs of prose, in render order. */
  paragraphs: string[];
  /**
   * Every formatted numeric figure that appears in `paragraphs`. The guard
   * test parses every numeric token out of the rendered paragraphs and
   * asserts each one is present in this list, proving no hallucinated
   * numbers slipped in.
   */
  allowedFigures: string[];
  /**
   * Source-of-truth bundle used to build the paragraphs. Surfaced on the
   * packet JSON so the in-app preview can show the founder which canonical
   * inputs the commentary was built from.
   */
  bundle: NarrativeSourceBundle;
  /** ISO timestamp the commentary was generated. Drives the "Regenerated at" stamp in the UI. */
  generatedAt: string;
}

// ───────────────────────────────────────────────────────────────────────
// Bundle builder
// ───────────────────────────────────────────────────────────────────────

export function buildNarrativeBundle(
  modelData: ModelData,
  co: ConsultantOutput,
): NarrativeSourceBundle {
  const raw = modelData as unknown as Record<string, unknown>;
  const sp = (raw.schoolProfile as Record<string, unknown>) || {};
  const en = (raw.enrollment as Record<string, unknown>) || {};

  const schoolName =
    (typeof sp.schoolName === "string" && sp.schoolName.trim()) || "the school";
  const state = typeof sp.state === "string" && sp.state.trim() ? sp.state : null;
  const schoolType =
    typeof sp.schoolType === "string" && sp.schoolType.trim()
      ? String(sp.schoolType).replace(/_/g, " ")
      : null;
  const schoolStage =
    typeof sp.schoolStage === "string" && sp.schoolStage.trim()
      ? String(sp.schoolStage).replace(/_/g, " ")
      : null;

  const enrollmentY1 = Number(en.year1 ?? 0);
  const enrollmentY5 = Number(en.year5 ?? 0);
  const retentionRaw = en.retentionRate;
  const retentionRatePct =
    retentionRaw === undefined || retentionRaw === null
      ? null
      : Number(retentionRaw);

  const maxCapRaw = sp.maxCapacity;
  const maxCapacity =
    typeof maxCapRaw === "number" && maxCapRaw > 0 ? maxCapRaw : null;

  // DSCR series: normalized (founder comp at market) is lender-primary; the
  // reported series is the founder's planned draw and exists only when the
  // normalized view actually applied an adjustment.
  const reportedDscr = co.normalizedView?.reported.dscr ?? [];
  const normalizedDscr = co.normalizedView?.normalized.dscr ?? [];

  const finiteOrNull = (n: number | null | undefined): number | null =>
    typeof n === "number" && Number.isFinite(n) ? n : null;

  const dscrY1Normalized = finiteOrNull(normalizedDscr[0]);
  const dscrY1Reported = finiteOrNull(reportedDscr[0]);

  // Min DSCR over modeled years, ignoring the engine's "no debt service"
  // sentinel (0). Identifies the year a lender will probe hardest on.
  let dscrMinNormalized: number | null = null;
  let dscrMinNormalizedYear: number | null = null;
  for (let i = 0; i < normalizedDscr.length; i++) {
    const v = normalizedDscr[i];
    if (!Number.isFinite(v) || v === 0) continue;
    if (dscrMinNormalized === null || v < dscrMinNormalized) {
      dscrMinNormalized = v;
      dscrMinNormalizedYear = i + 1;
    }
  }

  // Reserve months in the final modeled year
  const lastCum =
    co.cumulativeFinancials.length > 0
      ? co.cumulativeFinancials[co.cumulativeFinancials.length - 1]
      : null;
  const reserveMonthsLastYear =
    lastCum && Number.isFinite(lastCum.reserveMonths) ? lastCum.reserveMonths : null;
  const reserveLastYearNumber = lastCum ? lastCum.year : co.cumulativeFinancials.length;

  // Trough cash year (lowest ending cash). Ending cash = openingCash + cumulativeNetIncome.
  const ob = (raw.openingBalances as Record<string, unknown>) || {};
  const openingCash = typeof ob.cash === "number" ? ob.cash : 0;
  let troughEndingCash: number | null = null;
  let troughYear: number | null = null;
  for (const cf of co.cumulativeFinancials) {
    const ending = openingCash + cf.cumulativeNetIncome;
    if (troughEndingCash === null || ending < troughEndingCash) {
      troughEndingCash = ending;
      troughYear = cf.year;
    }
  }

  // Break-even year — first year where cumulative net income turns positive.
  let breakEvenYear: number | null = null;
  for (const cf of co.cumulativeFinancials) {
    if (cf.cumulativeNetIncome >= 0) {
      breakEvenYear = cf.year;
      break;
    }
  }

  // Year-1 break-even students + utilization, from lender stress base.
  const stressBase = co.lenderStressTests?.base;
  const breakEvenStudentsY1 = finiteOrNull(stressBase?.breakEvenStudents?.[0]);
  const breakEvenUtilY1Raw =
    breakEvenStudentsY1 !== null && maxCapacity
      ? (breakEvenStudentsY1 / maxCapacity) * 100
      : null;
  const breakEvenUtilizationY1Pct =
    breakEvenUtilY1Raw === null || !Number.isFinite(breakEvenUtilY1Raw)
      ? null
      : breakEvenUtilY1Raw;

  // Founder comp normalization
  const fc = co.normalizedView?.founderComp;
  const founderCompHasAdjustment = fc?.hasAdjustment ?? false;
  const founderCompTotalDelta = fc?.totalDelta ?? 0;

  // Revenue quality (Year 1)
  const rqY1 =
    co.revenueQuality.find((r) => r.year === 1) || co.revenueQuality[0] || null;
  const revenueQualityY1 = rqY1
    ? {
        // pctByBucket from canonical engine is a 0..1 fraction; convert to percent.
        contractedPct: rqY1.pctByBucket.contracted * 100,
        projectedPct: rqY1.pctByBucket.projected * 100,
        donorDependentPct: rqY1.pctByBucket.donor_dependent * 100,
        policyDependentPct: rqY1.pctByBucket.policy_dependent * 100,
      }
    : null;

  // Top 3 risks paired with mitigants (engine has already severity-ordered)
  const topRisks = co.topIssues.slice(0, 3).map((iss) => ({
    title: iss.title,
    severity: iss.severity,
    summary: iss.summary,
    mitigant: iss.recommendedAction,
  }));

  // Worst-case stress (the "toughest stress" the closing paragraph
  // names).
  //
  // Task #924 — Canonical "toughest stress" criterion (deterministic,
  // documented so the Commentary's claim is reproducible from the
  // packet's own Lender Stress Tests table):
  //
  //   PRIMARY:   lowest minimum DSCR across the scenario's 5 years
  //              (DSCR readings of 0 / non-finite are ignored — they
  //              represent years with no debt service modeled).
  //   TIEBREAK:  largest Year-1 net income decline vs. base
  //              (i.e. most negative `Y1NI_scenario - Y1NI_base`).
  //
  // Scenarios with no finite DSCR reading at all (no debt service
  // anywhere in the 5-year window) are only selected as the fallback
  // worst stress when nothing better exists.
  let worstStress: NarrativeSourceBundle["worstStress"] = null;
  let worstY1NiDelta: number | null = null;
  const stressScenarios = co.lenderStressTests?.scenarios ?? [];
  const baseY1Ni = co.lenderStressTests?.base?.netIncome?.[0] ?? 0;
  for (const s of stressScenarios) {
    const minD = s.dscr.filter((d) => d !== 0 && Number.isFinite(d));
    const minDscr = minD.length > 0 ? Math.min(...minD) : null;
    const minEndingCash =
      s.endingCash.length > 0 ? Math.min(...s.endingCash) : null;
    const y1NiDelta = (s.netIncome?.[0] ?? 0) - baseY1Ni;

    let replace = false;
    if (worstStress === null) {
      replace = true;
    } else if (minDscr !== null && worstStress.minDscr === null) {
      // Promote: any finite DSCR beats a null DSCR.
      replace = true;
    } else if (minDscr !== null && worstStress.minDscr !== null) {
      if (minDscr < worstStress.minDscr) {
        replace = true;
      } else if (
        // Tie on primary key — pick the scenario with the larger
        // Y1 NI decline (i.e. more negative delta).
        minDscr === worstStress.minDscr &&
        worstY1NiDelta !== null &&
        y1NiDelta < worstY1NiDelta
      ) {
        replace = true;
      }
    }
    if (replace) {
      worstStress = { name: s.name, minDscr, minEndingCash };
      worstY1NiDelta = y1NiDelta;
    }
  }

  // Task #918 — collect every stress scenario whose Y5 net income is
  // negative. Uses `netIncome[4]` (5-year horizon) — the same source the
  // Stress Tests section's "N of M stress scenarios result in negative
  // Year 5 net income" headline reads from in `buildStressTests`.
  const negativeY5StressScenarios: NarrativeSourceBundle["negativeY5StressScenarios"] = [];
  for (const s of stressScenarios) {
    const y5 = s.netIncome?.[4];
    if (typeof y5 === "number" && Number.isFinite(y5) && y5 < 0) {
      negativeY5StressScenarios.push({ name: s.name, y5NetIncome: y5 });
    }
  }

  // High-priority recommended actions
  const highPriorityActions = co.recommendations
    .filter((r) => r.priority === "high")
    .slice(0, 3)
    .map((r) => ({ title: r.title, description: r.description }));

  return {
    schoolName,
    state,
    schoolType,
    schoolStage,
    lenderReadiness: co.lenderReadiness,
    lenderReadinessExplanation: co.lenderReadinessExplanation,
    biggestStrength: co.biggestStrength,
    biggestRisk: co.biggestRisk,
    enrollmentY1,
    enrollmentY5,
    retentionRatePct,
    maxCapacity,
    dscrY1Normalized,
    dscrY1Reported,
    dscrMinNormalized,
    dscrMinNormalizedYear,
    cashRunwayMonths: co.cashRunwayMonths,
    reserveMonthsLastYear,
    reserveLastYearNumber,
    troughEndingCash,
    troughYear,
    breakEvenYear,
    breakEvenStudentsY1,
    breakEvenUtilizationY1Pct,
    founderCompHasAdjustment,
    founderCompTotalDelta,
    revenueQualityY1,
    topRisks,
    worstStress,
    negativeY5StressScenarios,
    highPriorityActions,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Figure formatters that auto-record into `allowedFigures`
// ───────────────────────────────────────────────────────────────────────

/**
 * A small "scribe" that records every formatted figure it emits. Each
 * commentary builder makes one of these, threads it through formatters,
 * and returns its `figures` so the guard test can verify that nothing
 * outside this allow-list ever appears in the rendered paragraphs.
 *
 * No em-dashes are emitted by any helper here (banned style).
 */
class FigureScribe {
  readonly figures: string[] = [];

  private push(s: string): string {
    if (!this.figures.includes(s)) this.figures.push(s);
    return s;
  }

  num(n: number): string {
    return this.push(
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n),
    );
  }

  currency(n: number): string {
    return this.push(
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n),
    );
  }

  /** Currency for a possibly-negative figure, formatted as "($12,345)" when negative. */
  signedCurrency(n: number): string {
    if (n < 0) {
      return this.push(
        "(" +
          new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(Math.abs(n)) +
          ")",
      );
    }
    return this.currency(n);
  }

  pct(n: number, decimals = 0): string {
    return this.push(`${n.toFixed(decimals)}%`);
  }

  ratio(n: number): string {
    return this.push(`${n.toFixed(2)}x`);
  }

  yearLabel(year: number): string {
    return this.push(`Year ${year}`);
  }

  rawYearNumber(year: number): string {
    return this.push(String(year));
  }

  monthsCount(months: number): string {
    // Task #937 — `cashRunwayMonths` is a fractional coverage ratio
    // (year-end cash / monthly fixed costs). Route every runway render
    // through the shared formatter so the surface always shows a clean
    // 1-decimal value, with the 60+ cap applied consistently.
    return this.push(formatRunwayMonths(months));
  }

  /**
   * Absorbs a prose snippet that came from the canonical engine (e.g.
   * `lenderReadinessExplanation`, a risk title, a recommendation title)
   * by extracting every numeric figure inside it and adding the figures
   * to the allowed list. We trust these inputs because the engine is the
   * source of truth; the absorb step just teaches the scribe which
   * already-canonical figures are about to appear in the rendered prose.
   *
   * Returns the (dash-stripped) input so it can be inlined ergonomically.
   */
  absorb(text: string): string {
    const cleaned = stripDashes(text || "");
    if (!cleaned) return cleaned;
    // Mirrors the guard test's extraction regexes so any token the test
    // can detect, the scribe can authorize.
    const patterns: RegExp[] = [
      /\(?\$\d[\d,]*(?:\.\d+)?\)?/g,
      /\d+(?:\.\d+)?%/g,
      /-?\d+(?:\.\d+)?x\b/gi,
      /Year\s+\d+/g,
      /60\+\s+months\b/g,
      /\d+(?:\.\d+)?\s+months\b/g,
    ];
    let residual = cleaned;
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(cleaned)) !== null) {
        this.push(m[0]);
        residual = residual.split(m[0]).join(" ");
      }
    }
    // Bare numbers left in the residual (e.g. "12 students").
    const bareIntRe = /(?<![\w.,$])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\w%x])/g;
    let m: RegExpExecArray | null;
    while ((m = bareIntRe.exec(residual)) !== null) this.push(m[1]);
    return cleaned;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Lender commentary
// ───────────────────────────────────────────────────────────────────────

export function buildLenderCommentary(
  bundle: NarrativeSourceBundle,
): NarrativeCommentary {
  const f = new FigureScribe();
  const paragraphs: string[] = [];

  // Paragraph 1 - school summary + readiness verdict
  const schoolDescriptor = [
    bundle.schoolType,
    bundle.state ? `based in ${bundle.state}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const enrollmentArc = `${bundle.schoolName} projects enrollment of ${f.num(
    bundle.enrollmentY1,
  )} students in ${f.yearLabel(1)}, growing to ${f.num(
    bundle.enrollmentY5,
  )} by ${f.yearLabel(5)}${
    bundle.maxCapacity
      ? ` against a stated capacity of ${f.num(bundle.maxCapacity)} seats`
      : ""
  }.`;
  // Task #751 — surface the same coaching headline the in-app Consultant
  // view renders, instead of the bare verdict word ("Strong" / "Needs
  // Work" / "Not Yet Ready"). The headline carries the actionable
  // framing the founder already sees on screen.
  const verdictSentence = `Based on the canonical financial engine that powers this packet, the model reads as: ${lenderReadinessCoachingHeadline(
    bundle.lenderReadiness,
  )} ${f.absorb(bundle.lenderReadinessExplanation)}`;
  paragraphs.push(
    [
      schoolDescriptor
        ? `${bundle.schoolName} is a ${schoolDescriptor}.`
        : null,
      enrollmentArc,
      verdictSentence,
    ]
      .filter(Boolean)
      .join(" "),
  );

  // Paragraph 2 - base case: DSCR, runway, break-even
  const dscrSentence = bundle.dscrY1Normalized !== null
    ? `On the normalized base case (founder compensation marked to market), ${f.yearLabel(
        1,
      )} debt service coverage is ${f.ratio(bundle.dscrY1Normalized)}${
        bundle.dscrMinNormalized !== null &&
        bundle.dscrMinNormalizedYear !== null &&
        bundle.dscrMinNormalized !== bundle.dscrY1Normalized
          ? `, with the trough at ${f.ratio(
              bundle.dscrMinNormalized,
            )} in ${f.yearLabel(bundle.dscrMinNormalizedYear)}`
          : ""
      }.`
    : "Debt service coverage is not modeled because the school carries no senior debt in the base case.";
  const runwaySentence = bundle.cashRunwayMonths >= 60
    ? `Cash remains positive across the full 5-year projection, with reserves reaching ${
        bundle.reserveMonthsLastYear !== null
          ? `${f.num(bundle.reserveMonthsLastYear)} months of operating expense by ${f.yearLabel(
              bundle.reserveLastYearNumber,
            )}`
          : "a healthy operating cushion by the end of the model"
      }.`
    : `Operating cash runway extends ${f.monthsCount(
        bundle.cashRunwayMonths,
      )} from the open before additional capital would be required${
        bundle.troughEndingCash !== null && bundle.troughYear !== null
          ? `, with the tightest position at ${f.signedCurrency(
              bundle.troughEndingCash,
            )} of ending cash in ${f.yearLabel(bundle.troughYear)}`
          : ""
      }.`;
  const breakEvenSentence =
    bundle.breakEvenYear !== null
      ? `The model crosses operating break-even in ${f.yearLabel(
          bundle.breakEvenYear,
        )}${
          bundle.breakEvenStudentsY1 !== null
            ? `, and ${f.yearLabel(1)} requires ${f.num(
                bundle.breakEvenStudentsY1,
              )} students to cover fixed costs and debt service${
                bundle.breakEvenUtilizationY1Pct !== null
                  ? ` (${f.pct(bundle.breakEvenUtilizationY1Pct, 0)} of stated capacity)`
                  : ""
              }`
            : ""
        }.`
      : `The model does not yet reach cumulative break-even within the 5-year window${
          bundle.breakEvenStudentsY1 !== null
            ? `, and ${f.yearLabel(1)} would require ${f.num(
                bundle.breakEvenStudentsY1,
              )} students to cover fixed costs and debt service in the opening year`
            : ""
        }.`;
  paragraphs.push([dscrSentence, runwaySentence, breakEvenSentence].filter(Boolean).join(" "));

  // Paragraph 3 - revenue quality + top risks paired with mitigants
  const rqSentence = bundle.revenueQualityY1
    ? `${f.yearLabel(1)} revenue mix is ${f.pct(
        bundle.revenueQualityY1.contractedPct,
        0,
      )} contracted, ${f.pct(
        bundle.revenueQualityY1.projectedPct,
        0,
      )} projected enrollment-driven, ${f.pct(
        bundle.revenueQualityY1.policyDependentPct,
        0,
      )} policy-dependent, and ${f.pct(
        bundle.revenueQualityY1.donorDependentPct,
        0,
      )} donor-dependent.`
    : "Revenue quality detail is not available for this model.";

  let riskSentence: string;
  if (bundle.topRisks.length === 0) {
    riskSentence = `The canonical engine flagged no critical or high-severity risks; ${f.absorb(
      bundle.biggestRisk || "the model's greatest watch item is documented in the risk section below.",
    )}`;
  } else {
    const riskLines = bundle.topRisks
      .map(
        (r) =>
          `${f.absorb(r.title)} (${r.severity}). Mitigant: ${f.absorb(
            r.mitigant,
          )}`,
      )
      .join("; ");
    riskSentence = `The top ${bundle.topRisks.length === 1 ? "risk surfaced is" : `${f.num(bundle.topRisks.length)} risks surfaced are`}: ${riskLines}.`;
  }

  paragraphs.push([rqSentence, riskSentence].filter(Boolean).join(" "));

  // Paragraph 4 - founder normalization context
  if (bundle.founderCompHasAdjustment) {
    const directionWord =
      bundle.founderCompTotalDelta >= 0 ? "below" : "above";
    const absDelta = Math.abs(bundle.founderCompTotalDelta);
    const dscrDelta =
      bundle.dscrY1Normalized !== null && bundle.dscrY1Reported !== null
        ? `On a planned-comp basis the ${f.yearLabel(1)} DSCR would read ${f.ratio(
            bundle.dscrY1Reported,
          )}; on the normalized basis it lands at ${f.ratio(
            bundle.dscrY1Normalized,
          )}, which is the figure used throughout this packet.`
        : "";
    paragraphs.push(
      `Founder compensation has been normalized to market for underwriting. Across the modeled period the founder is drawing ${f.currency(
        absDelta,
      )} ${directionWord} a market salary for the role. ${dscrDelta} The lender-primary view in this packet underwrites the school at the market cost of running it, not the founder's voluntary discount.`.trim(),
    );
  } else {
    paragraphs.push(
      `Founder compensation already reflects a market-rate salary for the role, so the lender-primary numbers in this packet match the founder's planned draw without adjustment.`,
    );
  }

  // Paragraph 5 - closing with strongest stress test + highest-priority action.
  // Task #918 — when any stress scenario lands negative-Y5 net income,
  // lead the paragraph with that explicit failure list so the Lender
  // Commentary cannot tell the reader the model has "no major red flags"
  // while the Stress Testing table on the same packet shows scenarios in
  // the red. We name every failing scenario (e.g. "Hard revenue only"
  // for the public-funding persona) and frame the loss-of-funding risk,
  // matching the canonical signal `buildStressTests` already reports.
  const failingStressClause =
    bundle.negativeY5StressScenarios.length > 0
      ? (() => {
          const phrases = bundle.negativeY5StressScenarios
            .map(
              (s) =>
                `under the ${f.absorb(s.name)} stress, ${f.yearLabel(
                  5,
                )} net income falls to ${f.signedCurrency(s.y5NetIncome)}`,
            )
            .join("; ");
          const countWord = f.num(bundle.negativeY5StressScenarios.length);
          return `Lender stress battery flags loss-of-funding risk: ${phrases} (${countWord} scenario${
            bundle.negativeY5StressScenarios.length === 1 ? "" : "s"
          }). The model carries limited cushion against the modeled downside${
            bundle.negativeY5StressScenarios.length === 1 ? "" : "s"
          }.`;
        })()
      : null;
  const stressClause =
    bundle.worstStress && bundle.worstStress.minDscr !== null
      ? `Under the toughest stress in the lender battery (${f.absorb(
          bundle.worstStress.name,
        )}), minimum DSCR holds at ${f.ratio(bundle.worstStress.minDscr)}${
          bundle.worstStress.minEndingCash !== null
            ? ` and minimum ending cash at ${f.signedCurrency(
                bundle.worstStress.minEndingCash,
              )}`
            : ""
        }.`
      : null;
  const closingAction = bundle.highPriorityActions[0]
    ? `Recommended next step before lender conversations: ${f.absorb(
        bundle.highPriorityActions[0].title,
      )}.`
    : `The full risk and recommendation set follows in the body of the packet.`;
  paragraphs.push(
    [
      failingStressClause,
      stressClause,
      `${f.absorb(bundle.biggestStrength || "Key strengths are documented below.")}`,
      closingAction,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return {
    paragraphs: paragraphs.map(stripDashes),
    allowedFigures: f.figures,
    bundle,
    generatedAt: new Date().toISOString(),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Board commentary (warmer tone)
// ───────────────────────────────────────────────────────────────────────

export function buildBoardCommentary(
  bundle: NarrativeSourceBundle,
): NarrativeCommentary {
  const f = new FigureScribe();
  const paragraphs: string[] = [];

  // Paragraph 1 - mission and enrollment trajectory
  paragraphs.push(
    `Trustees, this update is a snapshot of where ${bundle.schoolName} stands financially as of today, drawn directly from the canonical model that the dashboard and lender packet share. We are planning for ${f.num(
      bundle.enrollmentY1,
    )} students in ${f.yearLabel(1)}, growing to ${f.num(
      bundle.enrollmentY5,
    )} by ${f.yearLabel(5)}${
      bundle.maxCapacity
        ? ` within a building capacity of ${f.num(bundle.maxCapacity)} seats`
        : ""
    }${
      bundle.retentionRatePct !== null
        ? `, holding a ${f.pct(bundle.retentionRatePct, 0)} year-over-year retention assumption`
        : ""
    }. Growth funds the mission; the rest of this commentary frames how the financial picture supports it.`,
  );

  // Paragraph 2 - cash position (warmer wording than lender version)
  const cashOpener = bundle.cashRunwayMonths >= 60
    ? `The model keeps cash positive across all five years${
        bundle.reserveMonthsLastYear !== null
          ? `, and operating reserves reach roughly ${f.num(
              bundle.reserveMonthsLastYear,
            )} months by ${f.yearLabel(bundle.reserveLastYearNumber)}`
          : ""
      }.`
    : `Operating cash carries the school for ${f.monthsCount(
        bundle.cashRunwayMonths,
      )} from open before another funding event is needed${
        bundle.troughEndingCash !== null && bundle.troughYear !== null
          ? `, with the tightest year landing at ${f.signedCurrency(
              bundle.troughEndingCash,
            )} of cash on hand in ${f.yearLabel(bundle.troughYear)}`
          : ""
      }.`;
  const breakEvenWarm = bundle.breakEvenYear !== null
    ? `Operating break-even is reached in ${f.yearLabel(bundle.breakEvenYear)}.`
    : `The plan does not yet reach cumulative break-even inside the 5-year window, which is a board-level conversation surfaced below.`;
  paragraphs.push([cashOpener, breakEvenWarm].filter(Boolean).join(" "));

  // Paragraph 3 - DSCR + lender readiness, framed for trustees
  const dscrLine = bundle.dscrY1Normalized !== null
    ? `On the same basis a lender will use, ${f.yearLabel(1)} debt service coverage is ${f.ratio(
        bundle.dscrY1Normalized,
      )}${
        bundle.dscrMinNormalized !== null &&
        bundle.dscrMinNormalizedYear !== null &&
        bundle.dscrMinNormalized !== bundle.dscrY1Normalized
          ? `, with the toughest year at ${f.ratio(
              bundle.dscrMinNormalized,
            )} in ${f.yearLabel(bundle.dscrMinNormalizedYear)}`
          : ""
      }.`
    : `The school carries no senior debt in the base case, so lender ratios do not yet apply.`;
  // Task #751 — board commentary mirrors the lender packet's coaching
  // phrasing so trustees see the same headline the founder sees in-app
  // and on the lender PDF, not the raw verdict noun.
  paragraphs.push(
    `${dscrLine} The packet currently reads as: ${lenderReadinessCoachingHeadline(
      bundle.lenderReadiness,
    )} ${f.absorb(bundle.lenderReadinessExplanation)}`,
  );

  // Paragraph 4 - decisions to make this period (top risks framed as choices)
  if (bundle.topRisks.length > 0) {
    const decisionLines = bundle.topRisks
      .slice(0, 3)
      .map(
        (r) =>
          `${f.absorb(r.title)}. Suggested response: ${f.absorb(r.mitigant)}`,
      )
      .join(". ");
    paragraphs.push(
      `Three matters merit board attention this period. ${decisionLines}.`,
    );
  } else {
    paragraphs.push(
      `No critical or high-severity issues are flagged this period. The risk section below documents the watch items the team is tracking proactively.`,
    );
  }

  // Paragraph 5 - closing: strength + recommended actions
  const closingAction = bundle.highPriorityActions[0]
    ? `Where the board can help: ${f.absorb(bundle.highPriorityActions[0].title)}.`
    : `No urgent board ask this period; the team will continue executing the plan.`;
  paragraphs.push(
    `${f.absorb(bundle.biggestStrength || "The school continues to execute against plan.")} ${closingAction}`,
  );

  return {
    paragraphs: paragraphs.map(stripDashes),
    allowedFigures: f.figures,
    bundle,
    generatedAt: new Date().toISOString(),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Grant commentary (mission-aligned tone, multi-year impact framing)
// ───────────────────────────────────────────────────────────────────────

export function buildGrantCommentary(
  bundle: NarrativeSourceBundle,
): NarrativeCommentary {
  const f = new FigureScribe();
  const paragraphs: string[] = [];

  // Paragraph 1 - mission-anchored opening with the multi-year impact arc.
  paragraphs.push(
    `Thank you for considering ${bundle.schoolName}. This narrative is drawn directly from the same canonical financial model the board and any lender would see, so the numbers that follow tie back line for line to our budget. Over the grant horizon we are planning for ${f.num(
      bundle.enrollmentY1,
    )} students in ${f.yearLabel(1)}, growing to ${f.num(
      bundle.enrollmentY5,
    )} by ${f.yearLabel(5)}${
      bundle.retentionRatePct !== null
        ? ` while holding a ${f.pct(bundle.retentionRatePct, 0)} year-over-year retention assumption`
        : ""
    }. Each additional seat funded by this grant translates directly into students served against that mission.`,
  );

  // Paragraph 2 - how the grant fits the funding mix. We use the donor-dependent
  // share of Year-1 revenue (from the revenue-quality breakdown) as the closest
  // canonical proxy for philanthropic share.
  const donorShare = bundle.revenueQualityY1
    ? bundle.revenueQualityY1.donorDependentPct
    : null;
  const mixLine = donorShare !== null
    ? `Philanthropic and other donor-dependent support currently represents about ${f.pct(donorShare, 0)} of our ${f.yearLabel(1)} revenue mix.`
    : `Philanthropic support is a meaningful share of our funding plan in ${f.yearLabel(1)}.`;
  paragraphs.push(
    `${mixLine} Grant funding is what bridges the gap between our enrollment ramp and operating sustainability — without it the model would not reach the trajectory described above. The plan does not assume any single funder closes that gap on their own; instead, it relies on a portfolio of grants and earned revenue that grows year over year.`,
  );

  // Paragraph 3 - sustainability: cash, break-even, and the path off subsidy.
  const cashLine = bundle.cashRunwayMonths >= 60
    ? `The model holds positive operating cash across all five years${
        bundle.reserveMonthsLastYear !== null
          ? `, with operating reserves reaching roughly ${f.num(
              bundle.reserveMonthsLastYear,
            )} months by ${f.yearLabel(bundle.reserveLastYearNumber)}`
          : ""
      }.`
    : `Operating cash carries the school for ${f.monthsCount(
        bundle.cashRunwayMonths,
      )} from open before the next funding milestone is needed${
        bundle.troughEndingCash !== null && bundle.troughYear !== null
          ? `, with the tightest year landing at ${f.signedCurrency(
              bundle.troughEndingCash,
            )} of cash on hand in ${f.yearLabel(bundle.troughYear)}`
          : ""
      }.`;
  const breakEvenGrant = bundle.breakEvenYear !== null
    ? `Operating break-even is reached in ${f.yearLabel(bundle.breakEvenYear)}, which is the point at which earned revenue alone would cover operating expenses.`
    : `Within the 5-year window the model does not yet reach cumulative break-even, which is why sustained philanthropic support over the grant period remains essential.`;
  paragraphs.push(`${cashLine} ${breakEvenGrant}`);

  // Paragraph 4 - stewardship + risks the funder should know about.
  if (bundle.topRisks.length > 0) {
    const riskLines = bundle.topRisks
      .slice(0, 2)
      .map(
        (r) =>
          `${f.absorb(r.title)}. Our planned response is to ${f.absorb(r.mitigant)}`,
      )
      .join(". ");
    paragraphs.push(
      `Two stewardship matters we want to surface up front for our funders. ${riskLines}.`,
    );
  } else {
    paragraphs.push(
      `No critical or high-severity issues are flagged at this time; the watch items the team is tracking are documented in the body of the model.`,
    );
  }

  // Paragraph 5 - close with strength and next-step ask.
  const closingAction = bundle.highPriorityActions[0]
    ? `The most immediate use of grant funding would support ${f.absorb(bundle.highPriorityActions[0].title)}.`
    : `Grant funding will be applied directly to enrollment ramp expenses described in the budget.`;
  paragraphs.push(
    `${f.absorb(bundle.biggestStrength || "The school is executing against a clearly documented plan.")} ${closingAction} We are happy to walk through any line of the model in detail with the funder.`,
  );

  return {
    paragraphs: paragraphs.map(stripDashes),
    allowedFigures: f.figures,
    bundle,
    generatedAt: new Date().toISOString(),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

/**
 * Strip em-dashes (banned style for this surface). We collapse U+2014 and
 * U+2013 to ASCII " - " so any narrative copy pulled in from other engine
 * outputs (consultant explanations, recommendation titles) remains
 * compliant. Repeated whitespace is normalized.
 */
export function stripDashes(s: string): string {
  return (s || "").replace(/[\u2014\u2013]/g, " - ").replace(/\s+/g, " ").trim();
}
