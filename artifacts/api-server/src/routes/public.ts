import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { PublicExportUnderwritingBody } from "@workspace/api-zod";
import { generateUnderwritingWorkbook } from "../lib/underwriting-export";
import { runConsultantEngine } from "../lib/consultant-engine";

const router: IRouter = Router();

const MAX_PAYLOAD_SIZE = 512 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 5;

const ipHits = new Map<string, { count: number; resetAt: number }>();

function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = ipHits.get(ip);

  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    next();
    return;
  }

  entry.count++;
  if (entry.count > RATE_MAX_REQUESTS) {
    res.status(429).json({ error: "Too many requests. Please wait a minute before trying again." });
    return;
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits) {
    if (now > entry.resetAt) ipHits.delete(ip);
  }
}, 300_000);

router.post("/public/export-underwriting", rateLimiter, async (req: Request, res: Response) => {
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
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 100);

    const buffer = await generateUnderwritingWorkbook(data);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Underwriting_Pro_Forma.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error("Public underwriting export error:", err);
    res.status(500).json({ error: "Something went wrong generating the workbook." });
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

export default router;
