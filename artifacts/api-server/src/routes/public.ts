import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { PublicExportUnderwritingBody } from "@workspace/api-zod";

// Task #472 — strict email validation for review-request handlers.
const reviewRequestEmailSchema = z.string().trim().min(1).max(254).email();
import { generateSingleYearBudget } from "../lib/underwriting-export";
import { generateFormulaWorkbook } from "../lib/formula-export";
import { runConsultantEngine, computeYearFinancialsFromData } from "../lib/consultant-engine";
import { computeDaysCashOnHand } from "../lib/workbook-helpers.js";
import { createRateLimiter } from "../lib/rate-limiter";
import { trackEvent } from "../lib/track-event";
import { isEmailConfigured, sendReviewRequestToTeam, sendReviewConfirmation } from "../lib/mailer";
import { schoolTypeDisplay, entityTypeDisplay } from "../lib/pdf-utils";

const router: IRouter = Router();

const MAX_PAYLOAD_SIZE = 512 * 1024;
const rateLimiter = createRateLimiter();

async function handleBudgetExport(req: Request, res: Response) {
  try {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > MAX_PAYLOAD_SIZE) {
      res.status(413).json({ error: "Payload too large." });
      return;
    }

    const parsed = PublicExportUnderwritingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid model data.", details: parsed.error.issues });
      return;
    }

    const data = parsed.data as Record<string, unknown>;

    const buffer = await generateFormulaWorkbook(data);

    const sp = (data.schoolProfile || {}) as { schoolName?: string };
    const rawName = (sp.schoolName || "School").trim();
    const safeName = rawName.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-");
    const filename = `${safeName}-Budget-Model.xlsx`;

    res.status(200);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Content-Length", String(buffer.length));

    res.end(Buffer.from(buffer));
    return;
  } catch (err) {
    console.error("Public budget export error:", err);
    res.status(500).json({ error: "Something went wrong generating the workbook." });
  }
}

router.post("/public/export-budget", rateLimiter, handleBudgetExport);
router.post("/public/export-underwriting", rateLimiter, handleBudgetExport);

router.post("/public/export-single-year", rateLimiter, async (req: Request, res: Response) => {
  try {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > MAX_PAYLOAD_SIZE) {
      res.status(413).json({ error: "Payload too large." });
      return;
    }

    const parsed = PublicExportUnderwritingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid model data.", details: parsed.error.issues });
      return;
    }

    const data = parsed.data as Record<string, unknown>;

    // Task #472 — gate the single-year endpoint by modelDuration. The
    // multi-year code path produces a different workbook layout, and
    // routing those models here silently truncated their projections.
    // Surfacing a clean 400 lets the caller pick the multi-year export
    // route instead of getting a confusing single-year file.
    const profileForGate = (data.schoolProfile || {}) as Record<string, unknown>;
    if (profileForGate.modelDuration !== "single_year") {
      res.status(400).json({
        error: "Single-year export is only available for single-year models. Use the multi-year export endpoint instead.",
        code: "wrong_model_duration",
      });
      return;
    }

    const rawYear = parseInt(req.query.year as string || "0", 10);
    const yearIndex = isNaN(rawYear) ? 0 : Math.max(0, Math.min(rawYear, 4));

    const buffer = await generateSingleYearBudget(data, yearIndex);

    const sp = (data.schoolProfile || {}) as { schoolName?: string };
    const rawName = (sp.schoolName || "School").trim();
    const safeName = rawName.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-");
    const filename = `${safeName}-Year-${yearIndex + 1}-Budget.xlsx`;

    res.status(200);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(Buffer.from(buffer));
    return;
  } catch (err) {
    console.error("Public single-year export error:", err);
    res.status(500).json({ error: "Something went wrong generating the single-year budget." });
  }
});

router.post("/public/consultant", rateLimiter, async (req: Request, res: Response) => {
  try {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > MAX_PAYLOAD_SIZE) {
      res.status(413).json({ error: "Payload too large." });
      return;
    }

    const parsed = PublicExportUnderwritingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid model data.", details: parsed.error.issues });
      return;
    }

    const data = parsed.data as Record<string, unknown>;
    const result = await runConsultantEngine(data);
    res.json(result);
  } catch (err) {
    console.error("Public consultant analysis error:", err);
    res.status(500).json({ error: "Something went wrong running the analysis." });
  }
});

router.post("/public/request-review", rateLimiter, async (req: Request, res: Response) => {
  try {
    // Task #472 — email-service config gate moved BELOW input validation
    // so a malformed payload always returns 400, not 503.
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > MAX_PAYLOAD_SIZE) {
      res.status(413).json({ error: "Payload too large." });
      return;
    }

    const { name, email, message, modelData } = req.body || {};
    if (!name || typeof name !== "string" || !email || typeof email !== "string" || !modelData || typeof modelData !== "object") {
      res.status(400).json({ error: "Name, email, and model data are required." });
      return;
    }

    const trimmedName = name.trim().slice(0, 200);
    const trimmedEmail = email.trim().slice(0, 254);
    const trimmedMessage = typeof message === "string" ? message.trim().slice(0, 2000) : undefined;

    if (!trimmedName || !trimmedEmail) {
      res.status(400).json({ error: "Name and email are required." });
      return;
    }

    // Task #472 — Zod email so a bad address surfaces a clean 400
    // rather than 500ing out of the mailer when Resend rejects it.
    const emailParse = reviewRequestEmailSchema.safeParse(trimmedEmail);
    if (!emailParse.success) {
      res.status(400).json({
        error: "Please provide a valid email address.",
        code: "invalid_email",
      });
      return;
    }

    if (!isEmailConfigured()) {
      res.status(503).json({ error: "Email service is not configured." });
      return;
    }

    const parsed = PublicExportUnderwritingBody.safeParse(modelData);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid model data." });
      return;
    }

    const data = parsed.data as Record<string, unknown>;
    const consultantOutput = await runConsultantEngine(data);

    const profile = data.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "Unnamed School";
    const state = (typeof profile?.state === "string" ? profile.state : "") || "N/A";
    const schoolType = schoolTypeDisplay(profile?.schoolType as string);
    const entityType = entityTypeDisplay(profile?.entityType as string);

    const stageMap: Record<string, string> = { pre_launch: "Pre-Launch", year_one: "Year 1", operating: "Operating (2+ years)" };
    const ownerMap: Record<string, string> = { own: "Owned", rent: "Leased", donated: "Donated / Shared", home_based: "Home-Based" };
    const intentMap: Record<string, string> = { plan_to_apply: "Planning to apply for financing", want_to_understand: "Want to understand lending readiness", budget_only: "Budget planning only" };

    const schoolStage = stageMap[profile?.schoolStage as string] || undefined;
    const openingYear = typeof profile?.openingYear === "number" ? profile.openingYear : undefined;
    const maxCapacity = typeof profile?.maxCapacity === "number" ? profile.maxCapacity : undefined;
    const facilityCity = typeof profile?.facilityCity === "string" && profile.facilityCity ? profile.facilityCity : undefined;
    const ownershipType = ownerMap[profile?.ownershipType as string] || undefined;
    const monthlyRent = typeof profile?.monthlyRent === "number" && profile.monthlyRent > 0 ? profile.monthlyRent : undefined;
    const isFaithAffiliated = profile?.isFaithAffiliated === true;
    const faithAffiliation = typeof profile?.faithAffiliation === "string" ? profile.faithAffiliation : undefined;
    const hasLoan = profile?.hasLoan === true;
    const loanAmount = typeof profile?.loanAmount === "number" && profile.loanAmount > 0 ? profile.loanAmount : undefined;
    const lendingLabIntent = intentMap[profile?.lendingLabIntent as string] || undefined;

    const staffingRows = Array.isArray(data.staffingRows) ? data.staffingRows : [];
    const staffCount = staffingRows.length;

    const yearFinancials = computeYearFinancialsFromData(data);
    const enrollment = yearFinancials.map(yf => yf.students);
    const revenue = yearFinancials.map(yf => yf.totalRevenue);
    const expenses = yearFinancials.map(yf => yf.totalExpenses);
    const netIncome = yearFinancials.map(yf => yf.netIncome);
    const dscr = yearFinancials.map(yf =>
      yf.debtService > 0 ? (yf.netIncome + yf.debtService) / yf.debtService : 0
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

    const y1Rev = revenue[0] || 0;
    const y1StaffingCost = staffingRows.reduce((sum: number, r: Record<string, unknown>) => {
      const salary = typeof r.salary === "number" ? r.salary : 0;
      const count = typeof r.count === "number" ? r.count : 1;
      return sum + salary * count;
    }, 0);
    const staffingCostPercent = y1Rev > 0 ? (y1StaffingCost / y1Rev) * 100 : 0;

    const [teamResult, confirmResult] = await Promise.all([
      sendReviewRequestToTeam({
        requesterName: trimmedName,
        requesterEmail: trimmedEmail,
        message: trimmedMessage,
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
        source: "public",
      }),
      sendReviewConfirmation(trimmedEmail, trimmedName, schoolName),
    ]);

    if (!teamResult.success || !confirmResult.success) {
      res.status(500).json({ error: "Failed to send review request. Please try again." });
      return;
    }

    await trackEvent("requested_model_review", null, { schoolName, source: "public" });
    res.json({ success: true });
  } catch (err) {
    console.error("Public review request error:", err);
    res.status(500).json({ error: "Something went wrong submitting the review request." });
  }
});

const CTA_EVENT_NAMES = new Set([
  "capability_cta_click",
  "audience_card_click",
  "capability_cross_link_click",
  "capability_section_impression",
  "capability_scroll_depth",
]);

const CAPABILITY_SLUGS = new Set([
  "single-year-pro-forma",
  "five-year-pro-forma",
  "scenario-planning",
  "debt-analysis",
  "budgeting-accounting-guidance",
]);

const AUDIENCE_SLUGS = new Set([
  "charter-schools",
  "private-schools",
  "microschools",
  "school-founders",
  "lenders",
]);

const CTA_POSITIONS = new Set(["primary", "closing"]);

const CAPABILITY_SECTION_IDS = new Set([
  "hero",
  "inside_product",
  "how_it_works",
  "faq",
  "closing_cta",
]);

const SCROLL_DEPTH_VALUES = new Set([25, 50, 75, 100]);

function sanitizeSlug(value: unknown, allowed: Set<string>): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 64);
  return allowed.has(trimmed) ? trimmed : null;
}

router.post("/public/track-cta", rateLimiter, async (req: Request, res: Response) => {
  try {
    const { event, source, audience, position, sessionId, section, depth } =
      req.body || {};
    if (typeof event !== "string" || !CTA_EVENT_NAMES.has(event)) {
      res.status(400).json({ error: "Invalid event name." });
      return;
    }

    const metadata: Record<string, unknown> = {};

    if (event === "capability_cta_click") {
      const sourceSlug = sanitizeSlug(source, CAPABILITY_SLUGS);
      if (!sourceSlug) {
        res.status(400).json({ error: "Invalid capability source." });
        return;
      }
      metadata.source = sourceSlug;
      const pos = typeof position === "string" && CTA_POSITIONS.has(position) ? position : "primary";
      metadata.position = pos;
      const sectionId = sanitizeSlug(section, CAPABILITY_SECTION_IDS);
      if (sectionId) {
        metadata.section = sectionId;
      }
    } else if (event === "audience_card_click") {
      const audienceSlug = sanitizeSlug(audience, AUDIENCE_SLUGS);
      if (!audienceSlug) {
        res.status(400).json({ error: "Invalid audience." });
        return;
      }
      metadata.audience = audienceSlug;
    } else if (event === "capability_cross_link_click") {
      const audienceSlug = sanitizeSlug(audience, AUDIENCE_SLUGS);
      const sourceSlug = sanitizeSlug(source, CAPABILITY_SLUGS);
      if (!audienceSlug || !sourceSlug) {
        res.status(400).json({ error: "Invalid audience or capability." });
        return;
      }
      metadata.audience = audienceSlug;
      metadata.source = sourceSlug;
    } else if (event === "capability_section_impression") {
      const sourceSlug = sanitizeSlug(source, CAPABILITY_SLUGS);
      const sectionId = sanitizeSlug(section, CAPABILITY_SECTION_IDS);
      if (!sourceSlug || !sectionId) {
        res.status(400).json({ error: "Invalid capability or section." });
        return;
      }
      metadata.source = sourceSlug;
      metadata.section = sectionId;
    } else if (event === "capability_scroll_depth") {
      const sourceSlug = sanitizeSlug(source, CAPABILITY_SLUGS);
      const numericDepth = typeof depth === "number" ? depth : Number.NaN;
      if (!sourceSlug || !SCROLL_DEPTH_VALUES.has(numericDepth)) {
        res.status(400).json({ error: "Invalid capability or depth." });
        return;
      }
      metadata.source = sourceSlug;
      metadata.depth = numericDepth;
    }

    if (typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 64) {
      metadata.sessionId = sessionId;
    }

    await trackEvent(event, null, metadata);
    res.json({ ok: true });
  } catch (err) {
    console.error("CTA tracking error:", err);
    res.status(500).json({ error: "Failed to record CTA." });
  }
});

// Round-3 #19: bound every field before it lands in events.metadata.
// Without these caps an unauth caller can pump multi-MB strings into
// jsonb (5MB body limit was the only ceiling), and Infinity / NaN /
// negative values pollute analytics aggregations.
const TIMING_FIELD_MAX_LEN = 64;
const TIMING_STEP_MAX = 100;
const TIMING_DURATION_MAX_SECONDS = 24 * 60 * 60; // 24h is well past any sane wizard session

router.post("/public/timing", rateLimiter, async (req: Request, res: Response) => {
  try {
    const { step, stepName, durationSeconds, sessionId, wizard } = req.body ?? {};
    if (
      typeof step !== "number" ||
      !Number.isInteger(step) ||
      step < 0 ||
      step > TIMING_STEP_MAX ||
      typeof durationSeconds !== "number" ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0 ||
      durationSeconds > TIMING_DURATION_MAX_SECONDS
    ) {
      res.status(400).json({ error: "Invalid timing data." });
      return;
    }
    await trackEvent("wizard_step_timing", null, {
      step: Math.floor(step),
      stepName: String(stepName ?? "").slice(0, TIMING_FIELD_MAX_LEN),
      durationSeconds: Math.round(durationSeconds),
      sessionId: String(sessionId ?? "").slice(0, TIMING_FIELD_MAX_LEN),
      wizard: String(wizard ?? "public").slice(0, TIMING_FIELD_MAX_LEN),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Timing event error:", err);
    res.status(500).json({ error: "Failed to record timing." });
  }
});

export default router;
