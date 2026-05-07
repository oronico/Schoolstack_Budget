/**
 * Task #660 - Plain-English founder summary.
 *
 * Translates the canonical engine output into six short, founder-voice
 * sections suitable for founders, board members, and lenders to skim.
 *
 *   1. What your model says
 *   2. What looks strong
 *   3. What needs more clarity
 *   4. What could create cash pressure
 *   5. What to fix first
 *   6. What someone reviewing this may ask
 *
 * Design constraints (mirroring the narrative-commentary contract):
 *
 *   - Every numeric figure that appears in the prose MUST reconcile to the
 *     canonical engine. We use the same FigureScribe pattern as
 *     build-narrative-commentary.ts so the guard test can prove it.
 *   - Coach voice. No banned words: approved / declined / failed / rejected
 *     / rejection / ineligible. No em-dashes (use stripDashes).
 *   - Read-only. No mutation of the source model.
 *   - Pulls reviewer questions from the canonical ASSUMPTION_REGISTRY so
 *     the questions are scoped to the assumptions actually flagged by the
 *     engine, not hand-typed.
 */

import type { ConsultantOutput } from "../consultant-engine.js";
import type { ModelData } from "../workbook-helpers.js";
import type { AssumptionFlag } from "../assumption-flags.js";
import {
  ASSUMPTION_REGISTRY,
  type AssumptionKey,
  type AssumptionMeta,
} from "@workspace/finance";
import {
  buildNarrativeBundle,
  stripDashes,
  type NarrativeSourceBundle,
} from "./build-narrative-commentary.js";

// ───────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────

export type FounderSummarySectionId =
  | "what_your_model_says"
  | "what_looks_strong"
  | "what_needs_clarity"
  | "what_could_create_cash_pressure"
  | "what_to_fix_first"
  | "what_reviewers_may_ask";

export interface FounderSummarySection {
  id: FounderSummarySectionId;
  title: string;
  /** 1-3 short paragraphs of plain-English prose, in render order. */
  paragraphs: string[];
  /** Optional bulleted callouts (used by "fix first" + "reviewer questions"). */
  bullets?: string[];
}

export interface FounderSummary {
  schoolName: string;
  generatedAt: string;
  sections: FounderSummarySection[];
  /** Every numeric token the prose was authorized to emit. */
  allowedFigures: string[];
  /** Source-of-truth bundle the summary was built from (for in-app preview). */
  bundle: NarrativeSourceBundle;
}

// ───────────────────────────────────────────────────────────────────────
// FigureScribe (subset matching build-narrative-commentary.ts)
// ───────────────────────────────────────────────────────────────────────

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

  monthsCount(months: number): string {
    return this.push(`${months} months`);
  }

  /**
   * Authorize every numeric token that already appears inside an
   * engine-supplied prose snippet (e.g. a recommendation title) so it can
   * be inlined without tripping the guard test. Returns the dash-stripped
   * input.
   */
  absorb(text: string): string {
    const cleaned = stripDashes(text || "");
    if (!cleaned) return cleaned;
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
    const bareIntRe =
      /(?<![\w.,$])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\w%x])/g;
    let m: RegExpExecArray | null;
    while ((m = bareIntRe.exec(residual)) !== null) this.push(m[1]);
    return cleaned;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Section builders
// ───────────────────────────────────────────────────────────────────────

function readinessVerb(r: NarrativeSourceBundle["lenderReadiness"]): string {
  // Coach voice. Avoid "approved" / "ready" verdict words.
  if (r === "Strong") return "reads as a strong starting point for lender conversations";
  if (r === "Needs Work") return "still needs more work before a lender conversation";
  return "is not yet at a place where a lender conversation will land well";
}

function buildWhatYourModelSays(
  bundle: NarrativeSourceBundle,
  f: FigureScribe,
): FounderSummarySection {
  const paragraphs: string[] = [];

  const enrollmentArc =
    `Your plan opens with ${f.num(bundle.enrollmentY1)} students in ${f.yearLabel(1)} ` +
    `and grows to ${f.num(bundle.enrollmentY5)} by ${f.yearLabel(5)}` +
    (bundle.maxCapacity
      ? `, against a stated capacity of ${f.num(bundle.maxCapacity)} seats`
      : "") +
    `. ${f.absorb(bundle.lenderReadinessExplanation)} On the canonical engine, the model ${readinessVerb(bundle.lenderReadiness)}.`;
  paragraphs.push(enrollmentArc);

  const dscrSentence =
    bundle.dscrY1Normalized !== null
      ? `On the same numbers a lender will pull, ${f.yearLabel(1)} debt service coverage lands at ${f.ratio(bundle.dscrY1Normalized)}` +
        (bundle.dscrMinNormalized !== null &&
        bundle.dscrMinNormalizedYear !== null &&
        bundle.dscrMinNormalized !== bundle.dscrY1Normalized
          ? `, with the toughest year at ${f.ratio(bundle.dscrMinNormalized)} in ${f.yearLabel(bundle.dscrMinNormalizedYear)}`
          : "") +
        `.`
      : `The base case carries no senior debt, so debt service coverage is not yet part of the picture.`;
  const runwaySentence =
    bundle.cashRunwayMonths >= 60
      ? `Cash stays positive across the full 5-year window` +
        (bundle.reserveMonthsLastYear !== null
          ? `, reaching about ${f.num(bundle.reserveMonthsLastYear)} months of operating reserves by ${f.yearLabel(bundle.reserveLastYearNumber)}.`
          : `.`)
      : `Operating cash carries the school for ${f.monthsCount(bundle.cashRunwayMonths)} from open before another funding event would be needed` +
        (bundle.troughEndingCash !== null && bundle.troughYear !== null
          ? `, with the tightest point at ${f.signedCurrency(bundle.troughEndingCash)} of ending cash in ${f.yearLabel(bundle.troughYear)}.`
          : `.`);
  paragraphs.push(`${dscrSentence} ${runwaySentence}`);

  return {
    id: "what_your_model_says",
    title: "What your model says",
    paragraphs: paragraphs.map(stripDashes),
  };
}

function buildWhatLooksStrong(
  bundle: NarrativeSourceBundle,
  co: ConsultantOutput,
  f: FigureScribe,
): FounderSummarySection {
  const paragraphs: string[] = [];
  const bullets: string[] = [];

  paragraphs.push(
    `Here is what is working in your favor right now. ${f.absorb(bundle.biggestStrength || "Several pieces of the plan look solid.")}`,
  );

  // Pull healthy health signals from the canonical engine.
  const greens = (co.healthSignals || []).filter((s) => s.status === "healthy");
  for (const s of greens.slice(0, 4)) {
    bullets.push(stripDashes(`${f.absorb(s.label)}: ${f.absorb(s.explanation || "")}`).trim());
  }

  // Strong revenue quality (high contracted share) is a structural strength.
  if (bundle.revenueQualityY1 && bundle.revenueQualityY1.contractedPct >= 50) {
    bullets.push(
      `${f.yearLabel(1)} revenue is ${f.pct(bundle.revenueQualityY1.contractedPct, 0)} contracted, which lenders read as a stable base.`,
    );
  }

  // Healthy break-even inside the modeled window is a strength.
  if (bundle.breakEvenYear !== null) {
    bullets.push(
      `The plan crosses operating break-even in ${f.yearLabel(bundle.breakEvenYear)}, inside the 5-year window.`,
    );
  }

  // Strong DSCR
  if (bundle.dscrY1Normalized !== null && bundle.dscrY1Normalized >= 1.25) {
    bullets.push(
      `${f.yearLabel(1)} debt service coverage of ${f.ratio(bundle.dscrY1Normalized)} clears the ${f.ratio(1.25)} lender benchmark from the start.`,
    );
  }

  if (bullets.length === 0) {
    paragraphs.push(
      `Strengths will surface as the inputs firm up. The risk and clarity sections below tell you what to address first.`,
    );
  }

  return {
    id: "what_looks_strong",
    title: "What looks strong",
    paragraphs: paragraphs.map(stripDashes),
    bullets: bullets.length > 0 ? bullets : undefined,
  };
}

function buildWhatNeedsClarity(
  co: ConsultantOutput,
  flags: AssumptionFlag[],
  f: FigureScribe,
): FounderSummarySection {
  const paragraphs: string[] = [];
  const bullets: string[] = [];

  // Surface every assumption the engine flagged as warning/critical.
  // These are the inputs that need a sourced explanation before a board
  // or lender conversation. Critical first, then warning.
  const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const ordered = [...(flags || [])].sort(
    (a, b) => (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9),
  );

  for (const fl of ordered.slice(0, 6)) {
    const meta = ASSUMPTION_REGISTRY[fl.field as AssumptionKey] as
      | AssumptionMeta
      | undefined;
    const label = meta?.label || fl.field;
    bullets.push(
      stripDashes(
        `${label} (${f.absorb(fl.currentValue)} vs ${f.absorb(fl.benchmark)}): ${f.absorb(fl.nextStep || fl.defaultPrompt)}`,
      ).trim(),
    );
  }

  // Watch / at-risk health signals also belong here.
  const watches = (co.healthSignals || []).filter(
    (s) => s.status === "watch" || s.status === "at_risk",
  );
  for (const s of watches.slice(0, 3)) {
    if (bullets.length >= 8) break;
    bullets.push(
      stripDashes(`${f.absorb(s.label)}: ${f.absorb(s.watchItem || s.explanation || "")}`).trim(),
    );
  }

  if (bullets.length === 0) {
    paragraphs.push(
      `Nothing is currently flagged as needing more sourcing. Keep your supporting documentation handy so you can answer a reviewer's drill-down quickly.`,
    );
  } else {
    paragraphs.push(
      `These are the inputs a reviewer will probe first. Pair each with the source you used (signed letters of intent, comparable schools, vendor quotes) so the conversation moves quickly.`,
    );
  }

  return {
    id: "what_needs_clarity",
    title: "What needs more clarity",
    paragraphs: paragraphs.map(stripDashes),
    bullets: bullets.length > 0 ? bullets : undefined,
  };
}

function buildCashPressure(
  bundle: NarrativeSourceBundle,
  co: ConsultantOutput,
  f: FigureScribe,
): FounderSummarySection {
  const paragraphs: string[] = [];
  const bullets: string[] = [];

  // Headline: trough cash + runway.
  if (bundle.cashRunwayMonths < 60) {
    paragraphs.push(
      `Operating cash runs for ${f.monthsCount(bundle.cashRunwayMonths)} from open before another funding event would be needed` +
        (bundle.troughEndingCash !== null && bundle.troughYear !== null
          ? `. The tightest point is ${f.signedCurrency(bundle.troughEndingCash)} of ending cash in ${f.yearLabel(bundle.troughYear)}, which is the moment to plan around.`
          : `.`),
    );
  } else {
    paragraphs.push(
      `Cash stays positive across the modeled 5 years, so the pressure points below are about preserving that cushion under stress, not surviving the base case.`,
    );
  }

  // Worst stress test from the canonical battery.
  if (bundle.worstStress) {
    const ws = bundle.worstStress;
    const dscrPart =
      ws.minDscr !== null
        ? `minimum debt service coverage holds at ${f.ratio(ws.minDscr)}`
        : `debt service coverage is not modeled in this stress`;
    const cashPart =
      ws.minEndingCash !== null
        ? ` and minimum ending cash dips to ${f.signedCurrency(ws.minEndingCash)}`
        : ``;
    bullets.push(
      stripDashes(`Toughest stress test (${f.absorb(ws.name)}): ${dscrPart}${cashPart}.`),
    );
  }

  // Cash-impacting top issues from the engine.
  const cashKeywords =
    /cash|runway|deficit|burn|liquidity|reserve|operating loss|working capital/i;
  for (const iss of co.topIssues || []) {
    if (bullets.length >= 5) break;
    if (cashKeywords.test(iss.title) || cashKeywords.test(iss.summary)) {
      bullets.push(
        stripDashes(`${f.absorb(iss.title)} (${iss.severity}): ${f.absorb(iss.summary)}`).trim(),
      );
    }
  }

  // Founder-comp cushion. If a founder is drawing well below market, the
  // model has implicit fragility a lender will probe.
  if (bundle.founderCompHasAdjustment && bundle.founderCompTotalDelta > 0) {
    bullets.push(
      `Founder compensation is running ${f.currency(bundle.founderCompTotalDelta)} below market across the modeled period. If you ever pay yourself a market rate, the cushion shrinks.`,
    );
  }

  if (bullets.length === 0 && bundle.cashRunwayMonths >= 60) {
    paragraphs.push(
      `No cash-pressure flags came back from the canonical stress battery. Keep monthly cash visibility once you open so you spot pressure early.`,
    );
  }

  return {
    id: "what_could_create_cash_pressure",
    title: "What could create cash pressure",
    paragraphs: paragraphs.map(stripDashes),
    bullets: bullets.length > 0 ? bullets : undefined,
  };
}

function buildFixFirst(
  bundle: NarrativeSourceBundle,
  co: ConsultantOutput,
  f: FigureScribe,
): FounderSummarySection {
  const paragraphs: string[] = [];
  const bullets: string[] = [];

  // Order: cash-impact (critical issues) > sustainability (high) > polish (medium).
  // The engine has already severity-ordered topIssues; we re-bucket by
  // category for clearer founder framing.
  const cashImpactRe = /cash|runway|deficit|debt service|dscr|liquidity/i;
  const sustainabilityRe =
    /staffing|enrollment|tuition|philanthropy|revenue|capacity/i;

  const issues = co.topIssues || [];
  const ranked = [
    ...issues.filter(
      (i) => i.severity === "critical" || cashImpactRe.test(i.title),
    ),
    ...issues.filter(
      (i) =>
        i.severity === "high" &&
        !cashImpactRe.test(i.title) &&
        sustainabilityRe.test(i.title),
    ),
    ...issues.filter(
      (i) =>
        i.severity !== "critical" &&
        !cashImpactRe.test(i.title) &&
        !(i.severity === "high" && sustainabilityRe.test(i.title)),
    ),
  ];

  // Dedupe while preserving order.
  const seen = new Set<string>();
  const ordered = ranked.filter((i) => {
    if (seen.has(i.title)) return false;
    seen.add(i.title);
    return true;
  });

  for (const iss of ordered.slice(0, 5)) {
    bullets.push(
      stripDashes(
        `${f.absorb(iss.title)}: ${f.absorb(iss.recommendedAction || iss.summary)}`,
      ).trim(),
    );
  }

  // Fall back to high-priority recommendations when no critical/high issues.
  if (bullets.length === 0) {
    for (const a of bundle.highPriorityActions.slice(0, 3)) {
      bullets.push(
        stripDashes(`${f.absorb(a.title)}: ${f.absorb(a.description)}`).trim(),
      );
    }
  }

  if (bullets.length === 0) {
    paragraphs.push(
      `Nothing critical surfaced this pass. Continue tightening sourcing on the assumptions in the clarity section above so the model holds up under reviewer scrutiny.`,
    );
  } else {
    paragraphs.push(
      `Work this list top-down. Cash-impact items come first because they protect the school's ability to operate; sustainability items come next; polish items can wait until you have a working draft.`,
    );
  }

  return {
    id: "what_to_fix_first",
    title: "What to fix first",
    paragraphs: paragraphs.map(stripDashes),
    bullets: bullets.length > 0 ? bullets : undefined,
  };
}

function buildReviewerQuestions(
  bundle: NarrativeSourceBundle,
  flags: AssumptionFlag[],
  f: FigureScribe,
): FounderSummarySection {
  const paragraphs: string[] = [];
  const bullets: string[] = [];

  paragraphs.push(
    `These are the questions someone reviewing this packet will most likely ask. Have a sourced one-line answer ready for each.`,
  );

  const seen = new Set<string>();
  const addQuestion = (q: string) => {
    const cleaned = stripDashes(q).trim();
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      bullets.push(cleaned);
    }
  };

  // Always-asked structural questions, parameterized off the bundle so
  // every figure is canonical.
  addQuestion(
    `What is your evidence base for ${f.num(bundle.enrollmentY1)} students in ${f.yearLabel(1)}?`,
  );
  if (bundle.retentionRatePct !== null) {
    addQuestion(
      `What backs the ${f.pct(bundle.retentionRatePct, 0)} retention assumption (waitlist, comparable schools, prior cohorts)?`,
    );
  }
  if (bundle.revenueQualityY1) {
    if (bundle.revenueQualityY1.donorDependentPct >= 20) {
      addQuestion(
        `${f.pct(bundle.revenueQualityY1.donorDependentPct, 0)} of ${f.yearLabel(1)} revenue is donor-dependent. What is the contingency if the philanthropy comes in lower?`,
      );
    }
    if (bundle.revenueQualityY1.policyDependentPct >= 20) {
      addQuestion(
        `${f.pct(bundle.revenueQualityY1.policyDependentPct, 0)} of ${f.yearLabel(1)} revenue is policy-dependent. What changes if the funding rules shift?`,
      );
    }
  }
  if (bundle.dscrY1Normalized !== null && bundle.dscrY1Normalized < 1.25) {
    addQuestion(
      `${f.yearLabel(1)} debt service coverage of ${f.ratio(bundle.dscrY1Normalized)} is below the ${f.ratio(1.25)} lender benchmark. How will you bridge to that level?`,
    );
  }
  if (bundle.cashRunwayMonths < 18) {
    addQuestion(
      `Operating runway is ${f.monthsCount(bundle.cashRunwayMonths)}. What is your bridge plan if ramp is slower than expected?`,
    );
  }
  if (bundle.founderCompHasAdjustment) {
    addQuestion(
      `Founder compensation is normalized to a market rate for the lender view. How long will you actually run on the planned draw?`,
    );
  }
  if (bundle.breakEvenYear === null) {
    addQuestion(
      `The plan does not reach cumulative break-even within 5 years. What gets you there in Year 6 or 7?`,
    );
  }

  // Flag-driven questions. Every assumption the engine flagged gets a
  // pointed question so the reviewer's drill-down has a prepared answer.
  for (const fl of flags || []) {
    if (bullets.length >= 12) break;
    const meta = ASSUMPTION_REGISTRY[fl.field as AssumptionKey] as
      | AssumptionMeta
      | undefined;
    const label = meta?.label || fl.field;
    addQuestion(
      `On ${label}: ${f.absorb(fl.defaultPrompt)}`,
    );
  }

  return {
    id: "what_reviewers_may_ask",
    title: "What someone reviewing this may ask",
    paragraphs: paragraphs.map(stripDashes),
    bullets: bullets.length > 0 ? bullets : undefined,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Public builder
// ───────────────────────────────────────────────────────────────────────

export function buildFounderSummary(
  modelData: ModelData,
  co: ConsultantOutput,
): FounderSummary {
  const bundle = buildNarrativeBundle(modelData, co);
  const f = new FigureScribe();

  const flags = co.assumptionFlags || [];

  const sections: FounderSummarySection[] = [
    buildWhatYourModelSays(bundle, f),
    buildWhatLooksStrong(bundle, co, f),
    buildWhatNeedsClarity(co, flags, f),
    buildCashPressure(bundle, co, f),
    buildFixFirst(bundle, co, f),
    buildReviewerQuestions(bundle, flags, f),
  ];

  return {
    schoolName: bundle.schoolName,
    generatedAt: new Date().toISOString(),
    sections,
    allowedFigures: f.figures,
    bundle,
  };
}
