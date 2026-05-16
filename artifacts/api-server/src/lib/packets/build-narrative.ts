import type { ConsultantOutput } from "../consultant-engine";
import type { HealthSignal } from "../financial-health";
import type { NarrativeSummary } from "./packet-types";
import { formatRunwayMonths } from "./format-runway";

export function buildNarrative(co: ConsultantOutput): NarrativeSummary {
  const headline = buildHeadline(co);
  const summary = buildSummary(co);
  const keyRisks = extractKeyRisks(co);
  const keyStrengths = extractKeyStrengths(co);
  const recommendedFocus = buildRecommendedFocus(co);

  return { headline, summary, keyRisks, keyStrengths, recommendedFocus };
}

function buildHeadline(co: ConsultantOutput): string {
  const readiness = co.lenderReadiness;
  if (readiness === "Strong") {
    return "This financial model demonstrates strong fundamentals and is well-positioned for lender review.";
  }
  if (readiness === "Needs Work") {
    return "This model shows promise but has areas that should be strengthened before presenting to lenders.";
  }
  return "This model requires significant improvements before it will be ready for financing conversations.";
}

function buildSummary(co: ConsultantOutput): string {
  const parts: string[] = [];

  parts.push(co.executiveSummary);

  const healthyCount = co.healthSignals.filter((s) => s.status === "healthy").length;
  const atRiskCount = co.healthSignals.filter((s) => s.status === "at_risk").length;
  const totalSignals = co.healthSignals.length;

  if (totalSignals > 0) {
    if (atRiskCount === 0) {
      parts.push(`All ${totalSignals} financial health dimensions are in healthy or watch status.`);
    } else if (atRiskCount === 1) {
      const atRisk = co.healthSignals.find((s) => s.status === "at_risk");
      parts.push(`${healthyCount} of ${totalSignals} health dimensions are healthy, with 1 area needing attention: ${atRisk?.dimension.replace(/_/g, " ")}.`);
    } else {
      parts.push(`${healthyCount} of ${totalSignals} health dimensions are healthy, while ${atRiskCount} need attention.`);
    }
  }

  if (co.cashRunwayMonths >= 60) {
    parts.push("Cash remains positive throughout the 5-year projection.");
  } else {
    parts.push(`Cash runway extends ${formatRunwayMonths(co.cashRunwayMonths)} before additional funding would be needed.`);
  }

  return parts.join(" ");
}

function extractKeyRisks(co: ConsultantOutput): string[] {
  const risks: string[] = [];

  if (co.biggestRisk) {
    risks.push(co.biggestRisk);
  }

  for (const issue of co.topIssues) {
    if (issue.severity === "critical" && risks.length < 5) {
      risks.push(`${issue.title}: ${issue.summary}`);
    }
  }

  const atRiskSignals = co.healthSignals.filter((s) => s.status === "at_risk");
  for (const signal of atRiskSignals) {
    if (risks.length < 5) {
      risks.push(formatSignalRisk(signal));
    }
  }

  for (const issue of co.topIssues) {
    if (issue.severity === "high" && risks.length < 5) {
      risks.push(`${issue.title}: ${issue.summary}`);
    }
  }

  return risks.slice(0, 5);
}

function formatSignalRisk(signal: HealthSignal): string {
  const dimension = signal.dimension.replace(/_/g, " ");
  return `${capitalize(dimension)}: ${signal.explanation}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractKeyStrengths(co: ConsultantOutput): string[] {
  const strengths: string[] = [];

  if (co.biggestStrength) {
    strengths.push(co.biggestStrength);
  }

  const healthySignals = co.healthSignals.filter((s) => s.status === "healthy");
  for (const signal of healthySignals) {
    if (strengths.length < 5) {
      const dimension = signal.dimension.replace(/_/g, " ");
      strengths.push(`${capitalize(dimension)}: ${signal.explanation}`);
    }
  }

  const goodMetrics = co.keyMetrics.filter((m) => m.status === "good");
  for (const metric of goodMetrics) {
    if (strengths.length < 5) {
      strengths.push(`${metric.name}: ${metric.value} — ${metric.interpretation}`);
    }
  }

  return strengths.slice(0, 5);
}

function buildRecommendedFocus(co: ConsultantOutput): string {
  const highPriority = co.recommendations.filter((r) => r.priority === "high");

  if (highPriority.length === 0) {
    return "Continue refining the model and monitoring key metrics as the school develops.";
  }

  if (highPriority.length === 1) {
    return `Primary focus: ${highPriority[0].title}. ${highPriority[0].description}`;
  }

  const titles = highPriority.slice(0, 3).map((r) => r.title);
  const last = titles.pop();
  return `Priority areas: ${titles.join(", ")}${titles.length > 0 ? ", and " : ""}${last}. Address these before presenting the model to stakeholders.`;
}
