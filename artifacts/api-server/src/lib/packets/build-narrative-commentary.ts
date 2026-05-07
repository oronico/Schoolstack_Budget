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
  lenderReadiness: "Strong" | "Needs Work" | "Not Yet Ready";
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

  // Worst-case stress (lowest min DSCR across the battery)
  let worstStress: NarrativeSourceBundle["worstStress"] = null;
  const stressScenarios = co.lenderStressTests?.scenarios ?? [];
  for (const s of stressScenarios) {
    const minD = s.dscr.filter((d) => d !== 0 && Number.isFinite(d));
    const minDscr = minD.length > 0 ? Math.min(...minD) : null;
    const minEndingCash =
      s.endingCash.length > 0 ? Math.min(...s.endingCash) : null;
    // Prefer scenarios with a defined minDscr; among those, pick the lowest.
    // Only fall back to a null-DSCR scenario when nothing better is available.
    const replace =
      worstStress === null ||
      (minDscr !== null && worstStress.minDscr === null) ||
      (minDscr !== null &&
        worstStress.minDscr !== null &&
        minDscr < worstStress.minDscr);
    if (replace) {
      worstStress = { name: s.name, minDscr, minEndingCash };
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
    return this.push(`${months} months`);
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
      /\d+\s+months\b/g,
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
  const verdictSentence = `Based on the canonical financial engine that powers this packet, the model rates as ${bundle.lenderReadiness} for lender review. ${f.absorb(
    bundle.lenderReadinessExplanation,
  )}`;
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

  // Paragraph 5 - closing with strongest stress test + highest-priority action
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
  paragraphs.push(
    `${dscrLine} The packet currently reads as ${bundle.lenderReadiness} for lender review. ${f.absorb(
      bundle.lenderReadinessExplanation,
    )}`,
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
