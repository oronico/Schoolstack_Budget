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
import { generateProFormaPDF } from "../lib/pdf-proforma";
import { generateLoanReadinessPDF } from "../lib/pdf-loan-readiness";
import { generateLenderProFormaWorkbook } from "../lib/lender-proforma-export";
import { generateSingleYearBudget, generateUnderwritingWorkbook } from "../lib/underwriting-export";
import { generateUnderwritingWorkbook as generateUnderwritingWorkbookV2 } from "../lib/underwriting-workbook";
import { generateFormulaWorkbook } from "../lib/formula-export";
import { trackEvent } from "../lib/track-event";
import { runConsultantEngine } from "../lib/consultant-engine";

const router: IRouter = Router();

function extractRowColumns(data: Record<string, unknown>) {
  const d = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  if (d.priorYearSnapshot !== undefined) result.priorYearSnapshotJson = d.priorYearSnapshot;
  if (d.revenueRows !== undefined) result.revenueRowsJson = d.revenueRows;
  if (d.staffingRows !== undefined) result.staffingRowsJson = d.staffingRows;
  if (d.expenseRows !== undefined) result.expenseRowsJson = d.expenseRows;
  if (d.capitalAndDebtRows !== undefined) result.capitalAndDebtRowsJson = d.capitalAndDebtRows;
  return result;
}

function modelResponse(model: typeof financialModelsTable.$inferSelect) {
  return {
    id: model.id,
    name: model.name,
    status: model.status,
    currentStep: model.currentStep,
    schoolStage: model.schoolStage,
    fundingProfile: model.fundingProfile,
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
        schoolStage: financialModelsTable.schoolStage,
        fundingProfile: financialModelsTable.fundingProfile,
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
    const { name, data, currentStep, schoolStage, fundingProfile } = parsed.data;
    const rowCols = extractRowColumns(data as Record<string, unknown>);

    const [model] = await db.insert(financialModelsTable).values({
      userId: req.userId!,
      name,
      currentStep: currentStep ?? 0,
      data: data as Record<string, unknown>,
      schoolStage: schoolStage as typeof financialModelsTable.$inferInsert["schoolStage"],
      fundingProfile: fundingProfile as typeof financialModelsTable.$inferInsert["fundingProfile"],
      ...rowCols,
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
      console.error("Update validation errors:", JSON.stringify(parsed.error.issues, null, 2));
      res.status(400).json({ error: "Invalid model data.", details: parsed.error.issues });
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

    const { name, data, currentStep, status, schoolStage, fundingProfile } = parsed.data;
    const rowCols = extractRowColumns(data as Record<string, unknown>);
    const [model] = await db
      .update(financialModelsTable)
      .set({
        name: name ?? existing.name,
        data: data as Record<string, unknown>,
        currentStep: currentStep ?? existing.currentStep,
        status: status ?? existing.status,
        schoolStage: (schoolStage as typeof financialModelsTable.$inferInsert["schoolStage"]) ?? existing.schoolStage,
        fundingProfile: (fundingProfile as typeof financialModelsTable.$inferInsert["fundingProfile"]) ?? existing.fundingProfile,
        ...rowCols,
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
      schoolStage: existing.schoolStage,
      fundingProfile: existing.fundingProfile,
      priorYearSnapshotJson: existing.priorYearSnapshotJson,
      staffingRowsJson: existing.staffingRowsJson,
      revenueRowsJson: existing.revenueRowsJson,
      expenseRowsJson: existing.expenseRowsJson,
      capitalAndDebtRowsJson: existing.capitalAndDebtRowsJson,
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

router.get("/models/:id/consultant", authMiddleware, async (req: AuthRequest, res) => {
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
    const consultantOutput = runConsultantEngine(data);

    await db
      .update(financialModelsTable)
      .set({
        consultantSummaryJson: consultantOutput as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(financialModelsTable.id, params.data.id));

    res.json(consultantOutput);
  } catch (err) {
    console.error("Consultant engine error:", err);
    res.status(500).json({ error: "Something went wrong running the consultant analysis." });
  }
});

router.get("/models/:id/export/pro-forma-pdf", authMiddleware, async (req: AuthRequest, res) => {
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
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const buffer = await generateProFormaPDF(data);

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "pdf",
    });

    await trackEvent("exported_proforma_pdf", req.userId, { modelId: model.id });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Pro_Forma.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error("Pro Forma PDF export error:", err);
    res.status(500).json({ error: "Something went wrong generating the Pro Forma PDF." });
  }
});

router.get("/models/:id/export/loan-readiness-pdf", authMiddleware, async (req: AuthRequest, res) => {
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
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const entityType = typeof profile?.entityType === "string" ? profile.entityType : undefined;
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const consultantOutput = runConsultantEngine(data);

    const buffer = await generateLoanReadinessPDF(consultantOutput, schoolName, entityType);

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "pdf",
    });

    await trackEvent("exported_loan_readiness_pdf", req.userId, { modelId: model.id });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Loan_Readiness_Report.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error("Loan Readiness PDF export error:", err);
    res.status(500).json({ error: "Something went wrong generating the Loan Readiness PDF." });
  }
});

router.get("/models/:id/export/lender-proforma", authMiddleware, async (req: AuthRequest, res) => {
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
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const buffer = await generateLenderProFormaWorkbook(data);

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_lender_proforma", req.userId, { modelId: model.id });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Lender_Pro_Forma.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error("Lender Pro Forma export error:", err);
    res.status(500).json({ error: "Something went wrong generating the Lender Pro Forma workbook." });
  }
});

router.get("/models/:id/export/underwriting", authMiddleware, async (req: AuthRequest, res) => {
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
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const buffer = await generateUnderwritingWorkbook(data);

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_underwriting", req.userId, { modelId: model.id });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Underwriting_Pro_Forma.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error("Underwriting export error:", err);
    res.status(500).json({ error: "Something went wrong generating the Underwriting Pro Forma workbook." });
  }
});

router.get("/models/:id/export/underwriting-v2", authMiddleware, async (req: AuthRequest, res) => {
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
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const workbook = await generateUnderwritingWorkbookV2(data);
    const buffer = await workbook.xlsx.writeBuffer();

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_underwriting_v2", req.userId, { modelId: model.id });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Underwriting_Model.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error("Underwriting V2 export error:", err);
    res.status(500).json({ error: "Something went wrong generating the Underwriting Model workbook." });
  }
});

router.get("/models/:id/export/single-year", authMiddleware, async (req: AuthRequest, res) => {
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

    const rawYear = parseInt(req.query.year as string || "0", 10);
    const yearIndex = isNaN(rawYear) ? 0 : Math.max(0, Math.min(rawYear, 4));
    const data = model.data as Record<string, unknown>;
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const buffer = await generateSingleYearBudget(data, yearIndex);

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_single_year", req.userId, { modelId: model.id, year: yearIndex + 1 });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Year_${yearIndex + 1}_Budget.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error("Single-year budget export error:", err);
    res.status(500).json({ error: "Something went wrong generating the single-year budget." });
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
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";

    const hasRevenueRows = Array.isArray(data?.revenueRows) && (data.revenueRows as unknown[]).length > 0;
    const hasStaffingRows = Array.isArray(data?.staffingRows) && (data.staffingRows as unknown[]).length > 0;
    const hasExpenseRows = Array.isArray(data?.expenseRows) && (data.expenseRows as unknown[]).length > 0;
    console.log(`[Excel Export] Model ${model.id}: revenueRows=${hasRevenueRows ? (data.revenueRows as unknown[]).length : 0}, staffingRows=${hasStaffingRows ? (data.staffingRows as unknown[]).length : 0}, expenseRows=${hasExpenseRows ? (data.expenseRows as unknown[]).length : 0}, dataKeys=${Object.keys(data || {}).join(",")}`);

    const yearCount = hasRevenueRows
      ? ((data.revenueRows as Array<{ amounts: number[] }>)[0]?.amounts?.length || 3)
      : 5;
    const fileName = `${schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}_${yearCount}-Year_Financial_Model.xlsx`;

    const buffer = await generateFormulaWorkbook(data);

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
