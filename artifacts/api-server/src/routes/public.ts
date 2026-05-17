import { Router, type IRouter, type Request, type Response } from "express";
import { PublicExportUnderwritingBody } from "@workspace/api-zod";

import { generateSingleYearBudget } from "../lib/underwriting-export";
import { generateFormulaWorkbook } from "../lib/formula-export";
import { runConsultantEngine } from "../lib/consultant-engine";
import { createRateLimiter } from "../lib/rate-limiter";
import { trackEvent } from "../lib/track-event";
import { logRetiredPublicRouteHit } from "../lib/retired-route-telemetry";

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

// Task #950 — RETIRED. The generated `exportUnderwriting` client in
// lib/api-client-react existed but was never imported anywhere in the
// school-financial-model UI; /api/public/export-budget covers the same
// flow for the unauthenticated wizard. 14 days of hit telemetry on the
// pre-retirement handler showed no legitimate caller fingerprints, so
// the handler is replaced with a 410 Gone stub. Route stays mounted
// (with telemetry) for at least one more deploy cycle so any straggler
// integration sees the 410 and the supported alternative, not a 404.
// Removing the stub itself is a separate future task.
router.post("/public/export-underwriting", rateLimiter, (req: Request, res: Response) => {
  void logRetiredPublicRouteHit(req, "/api/public/export-underwriting");
  res.status(410).json({
    error: "This endpoint has been retired.",
    code: "route_retired",
    alternative: "/api/public/export-budget",
  });
});

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

// Task #950 — RETIRED. The model-scoped POST /api/models/:id/request-review
// is the supported path for review requests; this anonymous variant had
// zero UI callers in the school-financial-model app and 14 days of hit
// telemetry showed no legitimate external integrations. Replaced with a
// 410 Gone stub. Route stays mounted (with telemetry) for at least one
// more deploy cycle so any straggler caller sees the 410 + the supported
// alternative, not a 404.
router.post("/public/request-review", rateLimiter, (req: Request, res: Response) => {
  void logRetiredPublicRouteHit(req, "/api/public/request-review");
  res.status(410).json({
    error: "This endpoint has been retired.",
    code: "route_retired",
    alternative: "/api/models/:id/request-review",
  });
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

// Task #950 — RETIRED. Originally added in Task #708 as a server-side
// P&L import path for a planned QuickBooks-OAuth importer. The wizard
// only ever parses actuals client-side (so the founder's books never
// leave their browser), the QuickBooks-OAuth importer never shipped,
// and 14 days of hit telemetry showed no legitimate callers. Replaced
// with a 410 Gone stub. Route stays mounted (with telemetry) for at
// least one more deploy cycle so any straggler caller sees the 410,
// not a 404. No supported server-side alternative — the client-side
// parser in @workspace/finance is the only path now.
router.post("/public/import-actuals", rateLimiter, (req: Request, res: Response) => {
  void logRetiredPublicRouteHit(req, "/api/public/import-actuals");
  res.status(410).json({
    error: "This endpoint has been retired.",
    code: "route_retired",
    alternative: null,
  });
});

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
