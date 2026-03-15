import { Router, type IRouter, type Request, type Response } from "express";
import { PublicExportUnderwritingBody } from "@workspace/api-zod";
import { generateUnderwritingWorkbook, generateUnderwritingWorkbookToFile } from "../lib/underwriting-export";
import { runConsultantEngine } from "../lib/consultant-engine";
import { createRateLimiter } from "../lib/rate-limiter";
import fs from "fs";
import path from "path";
import os from "os";

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
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 100);

    const tmpFile = path.join(os.tmpdir(), `schoolstack-${Date.now()}.xlsx`);
    await generateUnderwritingWorkbookToFile(data, tmpFile);

    const stat = fs.statSync(tmpFile);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=schoolstack-underwriting-model.xlsx"
    );

    res.setHeader("Content-Length", stat.size);

    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on("end", () => fs.unlink(tmpFile, () => {}));
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
