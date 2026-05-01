// Account-scoped routes — anything that lives on the user's profile
// rather than a single financial model. Today this is just the saved
// accounting-upload (P&L CSV/XLSX) inventory: a profile-page panel reads
// the GET to render every model that still has an `accountingExport`
// attached, and DELETE prunes individual entries without forcing the
// founder to open each model first. Mounted at the same router root as
// /auth so paths read as `/api/account/...`.

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { financialModelsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { trackEvent } from "../lib/track-event";

const router: IRouter = Router();

interface StoredAccountingExport {
  filename?: unknown;
  uploadedAt?: unknown;
  totals?: unknown;
  parseWarnings?: unknown;
}

// Pull the saved upload subobject off a model's freeform `data` jsonb.
// Returns null when the model has no upload, or when the upload is
// malformed (no filename string) — both should be filtered out of the
// list response so the panel never renders an unactionable row.
function readUpload(data: unknown): StoredAccountingExport | null {
  if (!data || typeof data !== "object") return null;
  const exp = (data as Record<string, unknown>).accountingExport;
  if (!exp || typeof exp !== "object") return null;
  const filename = (exp as StoredAccountingExport).filename;
  if (typeof filename !== "string" || filename.length === 0) return null;
  return exp as StoredAccountingExport;
}

router.get("/account/accounting-uploads", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        id: financialModelsTable.id,
        name: financialModelsTable.name,
        status: financialModelsTable.status,
        data: financialModelsTable.data,
        updatedAt: financialModelsTable.updatedAt,
      })
      .from(financialModelsTable)
      .where(eq(financialModelsTable.userId, req.userId!))
      .orderBy(desc(financialModelsTable.updatedAt));

    const uploads = rows
      .map((row) => {
        const upload = readUpload(row.data);
        if (!upload) return null;
        const uploadedAt =
          typeof upload.uploadedAt === "string" ? upload.uploadedAt : null;
        const parseWarnings = Array.isArray(upload.parseWarnings)
          ? upload.parseWarnings.length
          : 0;
        const totals =
          upload.totals && typeof upload.totals === "object"
            ? (upload.totals as Record<string, unknown>)
            : null;
        return {
          modelId: row.id,
          modelName: row.name,
          modelStatus: row.status,
          filename: upload.filename as string,
          uploadedAt,
          modelUpdatedAt: row.updatedAt.toISOString(),
          parseWarningCount: parseWarnings,
          totals,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // Most-recently uploaded first, with a stable fallback on the model's
    // own updatedAt so a missing/garbled `uploadedAt` still gets a sensible
    // place in the list.
    uploads.sort((a, b) => {
      const aKey = a.uploadedAt ?? a.modelUpdatedAt;
      const bKey = b.uploadedAt ?? b.modelUpdatedAt;
      return bKey.localeCompare(aKey);
    });

    res.json(uploads);
  } catch (err) {
    console.error("List accounting uploads error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.delete(
  "/account/accounting-uploads/:modelId",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const rawId = req.params.modelId;
      const modelId = Number.parseInt(
        Array.isArray(rawId) ? rawId[0] ?? "" : rawId ?? "",
        10,
      );
      if (!Number.isFinite(modelId) || modelId <= 0) {
        res.status(400).json({ error: "Invalid model ID." });
        return;
      }

      const [existing] = await db
        .select()
        .from(financialModelsTable)
        .where(
          and(
            eq(financialModelsTable.id, modelId),
            eq(financialModelsTable.userId, req.userId!),
          ),
        )
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "Model not found." });
        return;
      }

      const upload = readUpload(existing.data);
      if (!upload) {
        // No saved upload to forget. Returning 404 is what the panel
        // expects; the row never should have been rendered in the first
        // place, and surfacing a different status would mask the staleness.
        res.status(404).json({ error: "No saved upload on this model." });
        return;
      }

      const data = (existing.data as Record<string, unknown>) ?? {};
      const { accountingExport: _omitted, ...rest } = data;

      await db
        .update(financialModelsTable)
        .set({ data: rest, updatedAt: new Date() })
        .where(
          and(
            eq(financialModelsTable.id, modelId),
            eq(financialModelsTable.userId, req.userId!),
          ),
        );

      await trackEvent("forgot_accounting_upload", req.userId, {
        modelId,
        filename: upload.filename,
      });

      res.json({ message: "Upload forgotten." });
    } catch (err) {
      console.error("Delete accounting upload error:", err);
      res.status(500).json({ error: "Something went wrong." });
    }
  },
);

export default router;
