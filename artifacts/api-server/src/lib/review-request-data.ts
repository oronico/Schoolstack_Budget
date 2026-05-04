import crypto from "crypto";
import { db } from "@workspace/db";
import { sharedLinksTable } from "@workspace/db/schema";
import { runConsultantEngine, computeYearFinancialsFromData } from "./consultant-engine.js";
import { computeDaysCashOnHand } from "./workbook-helpers.js";
import { schoolTypeDisplay, entityTypeDisplay } from "./pdf-utils.js";
import type { ReviewRequestData } from "./mailer.js";

const STAGE_MAP: Record<string, string> = {
  pre_launch: "Pre-Launch",
  year_one: "Year 1",
  operating: "Operating (2+ years)",
};
const OWNER_MAP: Record<string, string> = {
  own: "Owned",
  rent: "Leased",
  donated: "Donated / Shared",
  home_based: "Home-Based",
};
const INTENT_MAP: Record<string, string> = {
  plan_to_apply: "Planning to apply for financing",
  want_to_understand: "Want to understand lending readiness",
  budget_only: "Budget planning only",
};

export interface BuildReviewRequestDataOptions {
  /** Founder-supplied identity (set by /request-review). For previews we
   * fill these with placeholder values so the rendered HTML still has a
   * "Reply to" mailto target and looks identical to what advisors see. */
  requesterName: string;
  requesterEmail: string;
  message?: string;
  /** When true, also creates a sharedLinksTable row + APP_URL share URL.
   * Off for previews so we don't leak a real share token before submit. */
  createSharedLink?: boolean;
  modelId: number;
  source: "authenticated" | "public";
}

/**
 * Builds the ReviewRequestData payload from a saved model row in the same
 * way the /request-review endpoint does. Extracted so the in-app preview
 * (Task #477) renders the exact same advisor-brief HTML as the email that
 * actually ships. Both call sites share this helper to prevent drift.
 */
export async function buildReviewRequestData(
  data: Record<string, unknown>,
  opts: BuildReviewRequestDataOptions,
): Promise<ReviewRequestData> {
  const consultantOutput = await runConsultantEngine(data);

  const profile = data.schoolProfile as Record<string, unknown> | undefined;
  const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "Unnamed School";
  const state = (typeof profile?.state === "string" ? profile.state : "") || "N/A";
  const schoolType = schoolTypeDisplay(profile?.schoolType as string);
  const entityType = entityTypeDisplay(profile?.entityType as string);

  const schoolStage = STAGE_MAP[profile?.schoolStage as string] || undefined;
  const openingYear = typeof profile?.openingYear === "number" ? profile.openingYear : undefined;
  const maxCapacity = typeof profile?.maxCapacity === "number" ? profile.maxCapacity : undefined;
  const facilityCity = typeof profile?.facilityCity === "string" && profile.facilityCity ? profile.facilityCity : undefined;
  const ownershipType = OWNER_MAP[profile?.ownershipType as string] || undefined;
  const monthlyRent = typeof profile?.monthlyRent === "number" && profile.monthlyRent > 0 ? profile.monthlyRent : undefined;
  const isFaithAffiliated = profile?.isFaithAffiliated === true;
  const faithAffiliation = typeof profile?.faithAffiliation === "string" ? profile.faithAffiliation : undefined;
  const hasLoan = profile?.hasLoan === true;
  const loanAmount = typeof profile?.loanAmount === "number" && profile.loanAmount > 0 ? profile.loanAmount : undefined;
  const lendingLabIntent = INTENT_MAP[profile?.lendingLabIntent as string] || undefined;

  const staffingRows = Array.isArray(data.staffingRows) ? (data.staffingRows as Record<string, unknown>[]) : [];
  const staffCount = staffingRows.length;

  const yearFinancials = computeYearFinancialsFromData(data);

  const enrollment = yearFinancials.map((yf) => yf.students);
  const revenue = yearFinancials.map((yf) => yf.totalRevenue);
  const expenses = yearFinancials.map((yf) => yf.totalExpenses);
  const netIncome = yearFinancials.map((yf) => yf.netIncome);
  const dscr = yearFinancials.map((yf) =>
    yf.debtService > 0 ? (yf.netIncome + yf.debtService) / yf.debtService : 0,
  );

  const cf = consultantOutput.cumulativeFinancials || [];
  const reserveMonths = cf.length > 0 ? cf[cf.length - 1].reserveMonths : 0;
  const cashRunwayMonths = consultantOutput.cashRunwayMonths || 0;

  const priorSnapshot = (data as Record<string, unknown>).priorYearSnapshot as Record<string, number> | undefined;
  const y1StartingCash = priorSnapshot?.endingCash || 0;
  const y1EndingCash = y1StartingCash + (yearFinancials[0]?.netIncome || 0);
  const daysCashOnHand = computeDaysCashOnHand(y1EndingCash, yearFinancials[0]?.totalExpenses || 0);

  const findings: { title: string; severity: "critical" | "high" | "medium" }[] = [];
  let criticalSeverityCount = 0;
  for (const issue of consultantOutput.topIssues.slice(0, 5)) {
    findings.push({ title: issue.title, severity: issue.severity });
    if (issue.severity === "critical") criticalSeverityCount++;
  }

  let sharedViewUrl: string | undefined;
  if (opts.createSharedLink) {
    try {
      const shareToken = crypto.randomBytes(32).toString("hex");
      const [shareLink] = await db.insert(sharedLinksTable).values({
        modelId: opts.modelId,
        token: shareToken,
        viewerLabel: "SchoolStack Team Review",
      }).returning();
      if (process.env.APP_URL) {
        sharedViewUrl = `${process.env.APP_URL}/shared/${shareLink.token}`;
      } else if (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN) {
        sharedViewUrl = `https://${process.env.REPLIT_DEV_DOMAIN}/shared/${shareLink.token}`;
      }
    } catch (shareErr) {
      console.error("Failed to create team review shared link:", shareErr);
    }
  }

  const y1Rev = revenue[0] || 0;
  const y1StaffingCost = staffingRows.reduce((sum: number, r: Record<string, unknown>) => {
    const salary = typeof r.salary === "number" ? r.salary : 0;
    const count = typeof r.count === "number" ? r.count : 1;
    return sum + salary * count;
  }, 0);
  const staffingCostPercent = y1Rev > 0 ? (y1StaffingCost / y1Rev) * 100 : 0;
  const isSingleYear = (profile?.modelDuration as string | undefined) === "single_year";

  return {
    requesterName: opts.requesterName,
    requesterEmail: opts.requesterEmail,
    message: opts.message,
    schoolName,
    state,
    schoolType,
    entityType,
    schoolStage,
    openingYear,
    maxCapacity,
    facilityCity,
    ownershipType,
    monthlyRent,
    isFaithAffiliated,
    faithAffiliation,
    hasLoan,
    loanAmount,
    lendingLabIntent,
    staffCount,
    staffingCostPercent,
    enrollment,
    revenue,
    expenses,
    netIncome,
    dscr,
    reserveMonths,
    cashRunwayMonths,
    daysCashOnHand,
    criticalFindings: findings,
    criticalSeverityCount,
    sharedViewUrl,
    source: opts.source,
    isSingleYear,
  };
}
