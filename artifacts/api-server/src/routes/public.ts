import { Router, type IRouter, type Request, type Response } from "express";
import { PublicExportUnderwritingBody } from "@workspace/api-zod";
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
    const result = runConsultantEngine(data);
    res.json(result);
  } catch (err) {
    console.error("Public consultant analysis error:", err);
    res.status(500).json({ error: "Something went wrong running the analysis." });
  }
});

router.post("/public/request-review", rateLimiter, async (req: Request, res: Response) => {
  try {
    if (!isEmailConfigured()) {
      res.status(503).json({ error: "Email service is not configured." });
      return;
    }

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      res.status(400).json({ error: "Please provide a valid email address." });
      return;
    }

    const parsed = PublicExportUnderwritingBody.safeParse(modelData);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid model data." });
      return;
    }

    const data = parsed.data as Record<string, unknown>;
    const consultantOutput = runConsultantEngine(data);

    const profile = data.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "Unnamed School";
    const state = (typeof profile?.state === "string" ? profile.state : "") || "N/A";
    const schoolType = schoolTypeDisplay(profile?.schoolType as string);
    const entityType = entityTypeDisplay(profile?.entityType as string);

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

    const findings: string[] = [];
    for (const issue of consultantOutput.topIssues.slice(0, 5)) {
      findings.push(issue.title);
    }

    const [teamResult, confirmResult] = await Promise.all([
      sendReviewRequestToTeam({
        requesterName: trimmedName,
        requesterEmail: trimmedEmail,
        message: trimmedMessage,
        schoolName,
        state,
        schoolType,
        entityType,
        enrollment,
        revenue,
        expenses,
        netIncome,
        dscr,
        reserveMonths,
        cashRunwayMonths,
        daysCashOnHand,
        criticalFindings: findings,
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

router.post("/public/timing", rateLimiter, async (req: Request, res: Response) => {
  try {
    const { step, stepName, durationSeconds, sessionId, wizard } = req.body;
    if (typeof step !== "number" || typeof durationSeconds !== "number") {
      res.status(400).json({ error: "Invalid timing data." });
      return;
    }
    await trackEvent("wizard_step_timing", null, {
      step,
      stepName: String(stepName || ""),
      durationSeconds: Math.round(durationSeconds),
      sessionId: String(sessionId || ""),
      wizard: String(wizard || "public"),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Timing event error:", err);
    res.status(500).json({ error: "Failed to record timing." });
  }
});

export default router;
