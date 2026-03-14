import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { financialModelsTable, exportsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  CreateModelBody,
  UpdateModelBody,
  GetModelParams,
  UpdateModelParams,
  DeleteModelParams,
  ExportModelParams,
  DuplicateModelParams,
  ArchiveModelParams,
} from "@workspace/api-zod";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";
import { generateWorkbook } from "../lib/excel-export";
import { trackEvent } from "../lib/track-event";

const router: IRouter = Router();

function modelResponse(model: typeof financialModelsTable.$inferSelect) {
  return {
    id: model.id,
    name: model.name,
    status: model.status,
    currentStep: model.currentStep,
    data: model.data,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

router.get("/models", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const models = await db
      .select({
        id: financialModelsTable.id,
        name: financialModelsTable.name,
        status: financialModelsTable.status,
        currentStep: financialModelsTable.currentStep,
        createdAt: financialModelsTable.createdAt,
        updatedAt: financialModelsTable.updatedAt,
      })
      .from(financialModelsTable)
      .where(eq(financialModelsTable.userId, req.userId!))
      .orderBy(desc(financialModelsTable.updatedAt));

    res.json(models);
  } catch (err) {
    console.error("List models error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.post("/models", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const parsed = CreateModelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Model name and data are required." });
      return;
    }
    const { name, data, currentStep } = parsed.data;

    const [model] = await db.insert(financialModelsTable).values({
      userId: req.userId!,
      name,
      currentStep: currentStep ?? 0,
      data: data as Record<string, unknown>,
    }).returning();

    await trackEvent("created_model", req.userId, { modelId: model.id });

    res.status(201).json(modelResponse(model));
  } catch (err) {
    console.error("Create model error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.get("/models/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = GetModelParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid model ID." });
      return;
    }

    const [model] = await db
      .select()
      .from(financialModelsTable)
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)))
      .limit(1);

    if (!model) {
      res.status(404).json({ error: "Model not found." });
      return;
    }

    res.json(modelResponse(model));
  } catch (err) {
    console.error("Get model error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.put("/models/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = UpdateModelParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid model ID." });
      return;
    }
    const parsed = UpdateModelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid model data." });
      return;
    }

    const [existing] = await db
      .select()
      .from(financialModelsTable)
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Model not found." });
      return;
    }

    const { name, data, currentStep, status } = parsed.data;
    const [model] = await db
      .update(financialModelsTable)
      .set({
        name: name ?? existing.name,
        data: data as Record<string, unknown>,
        currentStep: currentStep ?? existing.currentStep,
        status: status ?? existing.status,
        updatedAt: new Date(),
      })
      .where(eq(financialModelsTable.id, params.data.id))
      .returning();

    await trackEvent("updated_model", req.userId, { modelId: model.id });

    res.json(modelResponse(model));
  } catch (err) {
    console.error("Update model error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.delete("/models/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = DeleteModelParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid model ID." });
      return;
    }

    const [existing] = await db
      .select()
      .from(financialModelsTable)
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Model not found." });
      return;
    }

    await db.delete(financialModelsTable).where(eq(financialModelsTable.id, params.data.id));
    await trackEvent("deleted_model", req.userId, { modelId: params.data.id });
    res.json({ message: "Model deleted successfully." });
  } catch (err) {
    console.error("Delete model error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.post("/models/:id/duplicate", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = DuplicateModelParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid model ID." });
      return;
    }

    const [existing] = await db
      .select()
      .from(financialModelsTable)
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Model not found." });
      return;
    }

    const [model] = await db.insert(financialModelsTable).values({
      userId: req.userId!,
      name: `${existing.name} (Copy)`,
      status: "draft",
      currentStep: existing.currentStep,
      data: existing.data as Record<string, unknown>,
      schoolId: existing.schoolId,
    }).returning();

    await trackEvent("duplicated_model", req.userId, { sourceModelId: existing.id, newModelId: model.id });

    res.status(201).json(modelResponse(model));
  } catch (err) {
    console.error("Duplicate model error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.post("/models/:id/archive", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ArchiveModelParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid model ID." });
      return;
    }

    const [existing] = await db
      .select()
      .from(financialModelsTable)
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Model not found." });
      return;
    }

    const [model] = await db
      .update(financialModelsTable)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(financialModelsTable.id, params.data.id))
      .returning();

    await trackEvent("archived_model", req.userId, { modelId: model.id });

    res.json(modelResponse(model));
  } catch (err) {
    console.error("Archive model error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.get("/models/:id/export", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid model ID." });
      return;
    }

    const [model] = await db
      .select()
      .from(financialModelsTable)
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)))
      .limit(1);

    if (!model) {
      res.status(404).json({ error: "Model not found." });
      return;
    }

    const data = model.data as Record<string, unknown>;
    const schoolName = (data?.schoolProfile as any)?.schoolName || "School";
    const fileName = `${schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}_5-Year_Financial_Model.xlsx`;

    const buffer = await generateWorkbook(data);

    await db.update(financialModelsTable)
      .set({ lastExportedAt: new Date() })
      .where(eq(financialModelsTable.id, model.id));

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_xlsx", req.userId, { modelId: model.id });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error("Export model error:", err);
    res.status(500).json({ error: "Something went wrong generating the workbook." });
  }
});

export default router;
