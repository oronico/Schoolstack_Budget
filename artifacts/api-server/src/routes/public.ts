import { Router, type IRouter, type Request, type Response } from "express";
import { PublicExportUnderwritingBody } from "@workspace/api-zod";
import { generateSingleYearBudget } from "../lib/underwriting-export";
import { generateFormulaWorkbook } from "../lib/formula-export";
import { runConsultantEngine } from "../lib/consultant-engine";
import { createRateLimiter } from "../lib/rate-limiter";

const router: IRouter = Router();

const MAX_PAYLOAD_SIZE = 512 * 1024;
const rateLimiter = createRateLimiter();

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

    const buffer = await generateFormulaWorkbook(data);

    const sp = (data.schoolProfile || {}) as { schoolName?: string };
    const rawName = (sp.schoolName || "School").trim();
    const safeName = rawName.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-");
    const filename = `${safeName}-Financial-Model.xlsx`;

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

    return res.end(Buffer.from(buffer));
  } catch (err) {
    console.error("Public underwriting export error:", err);
    res.status(500).json({ error: "Something went wrong generating the workbook." });
  }
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
    return res.end(Buffer.from(buffer));
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

export default router;
