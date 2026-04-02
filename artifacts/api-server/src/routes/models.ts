import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { financialModelsTable, exportsTable, sharedLinksTable } from "@workspace/db/schema";
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
import { generateSingleYearBudget } from "../lib/underwriting-export";
import { generateUnderwritingWorkbook as generateUnderwritingWorkbookV2 } from "../lib/underwriting-workbook";
import { generateFormulaWorkbook } from "../lib/formula-export";
import { generateWorkbook } from "../lib/excel-export";
import { trackEvent } from "../lib/track-event";
import { runConsultantEngine, computeYearFinancialsFromData } from "../lib/consultant-engine";
import { computeDaysCashOnHand } from "../lib/workbook-helpers.js";
import { buildLenderPacket } from "../lib/packets/build-lender-packet";
import { generateLenderPacketPDF } from "../lib/packets/lender-packet-pdf";
import { buildBoardPacket } from "../lib/packets/build-board-packet";
import { generateBoardPacketPDF } from "../lib/packets/board-packet-pdf";
import { normalizeRevenueRows } from "../lib/workbook-helpers";
import { isEmailConfigured, sendReviewRequestToTeam, sendReviewConfirmation } from "../lib/mailer";
import { schoolTypeDisplay, entityTypeDisplay } from "../lib/pdf-utils";
import type { Response } from "express";

function sendBinary(res: Response, buffer: Buffer | ArrayBuffer | Uint8Array, contentType: string, filename: string) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as unknown as ArrayLike<number>);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buf.length));
  res.end(buf);
}

function normalizeModelData(data: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(data.revenueRows)) {
    return { ...data, revenueRows: normalizeRevenueRows(data.revenueRows as any) };
  }
  return data;
}

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
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

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
      .orderBy(desc(financialModelsTable.updatedAt))
      .limit(limit)
      .offset(offset);

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
      if (process.env.NODE_ENV !== "production") console.error("Update validation errors:", JSON.stringify(parsed.error.issues, null, 2));
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
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)))
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

    await db.delete(financialModelsTable).where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)));
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
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)))
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

    await db
      .update(financialModelsTable)
      .set({
        consultantSummaryJson: consultantOutput as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)));

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

    const data = normalizeModelData(model.data as Record<string, unknown>);
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

    sendBinary(res, buffer, "application/pdf", `${safeName}_Pro_Forma.pdf`);
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const entityType = typeof profile?.entityType === "string" ? profile.entityType : undefined;
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const consultantOutput = await runConsultantEngine(data);

    const buffer = await generateLoanReadinessPDF(consultantOutput, schoolName, entityType);

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "pdf",
    });

    await trackEvent("exported_loan_readiness_pdf", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/pdf", `${safeName}_Loan_Readiness_Report.pdf`);
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
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

    sendBinary(res, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safeName}_Lender_Pro_Forma.xlsx`);
  } catch (err) {
    console.error("Lender Pro Forma export error:", err);
    res.status(500).json({ error: "Something went wrong generating the Lender Pro Forma workbook." });
  }
});

router.get("/models/:id/export/lender-packet", authMiddleware, async (req: AuthRequest, res) => {
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);
    const packet = buildLenderPacket(data as any, consultantOutput, model.id);

    res.json(packet);
  } catch (err) {
    console.error("Lender packet JSON error:", err);
    res.status(500).json({ error: "Something went wrong generating the lender packet." });
  }
});

router.get("/models/:id/export/lender-packet-pdf", authMiddleware, async (req: AuthRequest, res) => {
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const consultantOutput = await runConsultantEngine(data);
    const packet = buildLenderPacket(data as any, consultantOutput, model.id);
    const buffer = await generateLenderPacketPDF(packet);

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "pdf",
    });

    await trackEvent("exported_lender_packet_pdf", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/pdf", `${safeName}_Lender_Packet.pdf`);
  } catch (err) {
    console.error("Lender packet PDF error:", err);
    res.status(500).json({ error: "Something went wrong generating the Lender Packet PDF." });
  }
});

router.get("/models/:id/export/board-packet", authMiddleware, async (req: AuthRequest, res) => {
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);
    const packet = buildBoardPacket(data as any, consultantOutput, model.id);

    res.json(packet);
  } catch (err) {
    console.error("Board packet JSON error:", err);
    res.status(500).json({ error: "Something went wrong generating the board packet." });
  }
});

router.get("/models/:id/export/board-packet-pdf", authMiddleware, async (req: AuthRequest, res) => {
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const consultantOutput = await runConsultantEngine(data);
    const packet = buildBoardPacket(data as any, consultantOutput, model.id);
    const buffer = await generateBoardPacketPDF(packet);

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "pdf",
    });

    await trackEvent("exported_board_packet_pdf", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/pdf", `${safeName}_Board_Summary.pdf`);
  } catch (err) {
    console.error("Board packet PDF error:", err);
    res.status(500).json({ error: "Something went wrong generating the Board Summary PDF." });
  }
});

// QUARANTINED: v1 underwriting export route — backward-compatible shim only.
// Calls generateUnderwritingWorkbookV2 (v2 engine); no v1 math runs here.
// TARGET REMOVAL: Q3 2026 — remove once all clients have migrated to /export/underwriting-v2.
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);
    const computedFlags = (consultantOutput.assumptionFlags || []).map(f => ({
      field: f.field,
      flagType: f.flagType,
      severity: f.severity,
      message: f.defaultPrompt,
      currentValue: f.currentValue,
    }));
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const workbook = await generateUnderwritingWorkbookV2(data, computedFlags);
    const buffer = await workbook.xlsx.writeBuffer();

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_underwriting", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safeName}_Underwriting_Pro_Forma.xlsx`);
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);
    const computedFlags = (consultantOutput.assumptionFlags || []).map(f => ({
      field: f.field,
      flagType: f.flagType,
      severity: f.severity,
      message: f.defaultPrompt,
      currentValue: f.currentValue,
    }));
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const workbook = await generateUnderwritingWorkbookV2(data, computedFlags);
    const buffer = await workbook.xlsx.writeBuffer();

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_underwriting_v2", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safeName}_Underwriting_Model.xlsx`);
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
    const data = normalizeModelData(model.data as Record<string, unknown>);
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

    sendBinary(res, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safeName}_Year_${yearIndex + 1}_Budget.xlsx`);
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";

    const hasRevenueRows = Array.isArray(data?.revenueRows) && (data.revenueRows as unknown[]).length > 0;
    const hasStaffingRows = Array.isArray(data?.staffingRows) && (data.staffingRows as unknown[]).length > 0;
    const hasExpenseRows = Array.isArray(data?.expenseRows) && (data.expenseRows as unknown[]).length > 0;


    const yearCount = hasRevenueRows
      ? ((data.revenueRows as Array<{ amounts: number[] }>)[0]?.amounts?.length || 3)
      : 5;
    const fileName = `${schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}_${yearCount}-Year_Financial_Model.xlsx`;

    const consultantOutput = await runConsultantEngine(data);
    const buffer = await generateWorkbook(data, consultantOutput);

    await db.update(financialModelsTable)
      .set({ lastExportedAt: new Date() })
      .where(eq(financialModelsTable.id, model.id));

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_xlsx", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
  } catch (err) {
    console.error("Export model error:", err);
    res.status(500).json({ error: "Something went wrong generating the workbook." });
  }
});

router.get("/models/:id/review-available", authMiddleware, async (_req: AuthRequest, res) => {
  res.json({ available: isEmailConfigured() });
});

router.post("/models/:id/request-review", authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!isEmailConfigured()) {
      res.status(503).json({ error: "Email service is not configured." });
      return;
    }

    const params = ExportModelParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid model ID." });
      return;
    }

    const { name, email, message } = req.body || {};
    if (!name || !email) {
      res.status(400).json({ error: "Name and email are required." });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: "Please provide a valid email address." });
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

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

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

    const findings: { title: string; severity: "critical" | "high" | "medium" }[] = [];
    let criticalSeverityCount = 0;
    for (const issue of consultantOutput.topIssues.slice(0, 5)) {
      findings.push({ title: issue.title, severity: issue.severity });
      if (issue.severity === "critical") criticalSeverityCount++;
    }

    let sharedViewUrl: string | undefined;
    try {
      const shareToken = crypto.randomBytes(32).toString("hex");
      const [shareLink] = await db.insert(sharedLinksTable).values({
        modelId: model.id,
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

    const [teamResult, confirmResult] = await Promise.all([
      sendReviewRequestToTeam({
        requesterName: name,
        requesterEmail: email,
        message: message || undefined,
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
        criticalSeverityCount,
        sharedViewUrl,
        source: "authenticated",
      }),
      sendReviewConfirmation(email, name, schoolName),
    ]);

    if (!teamResult.success || !confirmResult.success) {
      const failedParts: string[] = [];
      if (!teamResult.success) failedParts.push("team notification");
      if (!confirmResult.success) failedParts.push("confirmation email");
      res.status(500).json({ error: `Failed to send ${failedParts.join(" and ")}. Please try again.` });
      return;
    }

    await trackEvent("requested_model_review", req.userId, { modelId: model.id });
    res.json({ success: true });
  } catch (err) {
    console.error("Request review error:", err);
    res.status(500).json({ error: "Something went wrong submitting the review request." });
  }
});

router.post("/models/:id/share", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid model ID." }); return; }

    const [model] = await db
      .select({ id: financialModelsTable.id })
      .from(financialModelsTable)
      .where(and(eq(financialModelsTable.id, id), eq(financialModelsTable.userId, req.userId!)))
      .limit(1);

    if (!model) { res.status(404).json({ error: "Model not found." }); return; }

    const viewerLabel = typeof req.body?.viewerLabel === "string" ? req.body.viewerLabel.trim().slice(0, 200) : null;
    const token = crypto.randomBytes(32).toString("hex");

    const [link] = await db.insert(sharedLinksTable).values({
      modelId: id,
      token,
      viewerLabel: viewerLabel || null,
    }).returning();

    await trackEvent("shared_model", req.userId, { modelId: id, sharedLinkId: link.id });

    res.status(201).json({
      id: link.id,
      token: link.token,
      viewerLabel: link.viewerLabel,
      createdAt: link.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("Share model error:", err);
    res.status(500).json({ error: "Something went wrong creating the share link." });
  }
});

router.get("/models/:id/shares", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid model ID." }); return; }

    const [model] = await db
      .select({ id: financialModelsTable.id })
      .from(financialModelsTable)
      .where(and(eq(financialModelsTable.id, id), eq(financialModelsTable.userId, req.userId!)))
      .limit(1);

    if (!model) { res.status(404).json({ error: "Model not found." }); return; }

    const links = await db
      .select()
      .from(sharedLinksTable)
      .where(eq(sharedLinksTable.modelId, id))
      .orderBy(desc(sharedLinksTable.createdAt));

    res.json(links.map(l => ({
      id: l.id,
      token: l.token,
      viewerLabel: l.viewerLabel,
      createdAt: l.createdAt.toISOString(),
      revokedAt: l.revokedAt?.toISOString() || null,
    })));
  } catch (err) {
    console.error("List shares error:", err);
    res.status(500).json({ error: "Something went wrong listing share links." });
  }
});

router.delete("/models/:id/share/:token", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid model ID." }); return; }

    const [model] = await db
      .select({ id: financialModelsTable.id })
      .from(financialModelsTable)
      .where(and(eq(financialModelsTable.id, id), eq(financialModelsTable.userId, req.userId!)))
      .limit(1);

    if (!model) { res.status(404).json({ error: "Model not found." }); return; }

    const token = req.params.token as string;
    const [link] = await db
      .select()
      .from(sharedLinksTable)
      .where(and(eq(sharedLinksTable.modelId, id), eq(sharedLinksTable.token, token)))
      .limit(1);

    if (!link) { res.status(404).json({ error: "Share link not found." }); return; }

    await db
      .update(sharedLinksTable)
      .set({ revokedAt: new Date() })
      .where(eq(sharedLinksTable.id, link.id));

    await trackEvent("revoked_share_link", req.userId, { modelId: id, sharedLinkId: link.id });

    res.json({ success: true });
  } catch (err) {
    console.error("Revoke share error:", err);
    res.status(500).json({ error: "Something went wrong revoking the share link." });
  }
});

router.get("/shared/:token", async (req, res) => {
  try {
    const token = req.params.token;
    if (!token || token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) { res.status(400).json({ error: "Invalid share token." }); return; }

    const [link] = await db
      .select()
      .from(sharedLinksTable)
      .where(eq(sharedLinksTable.token, token))
      .limit(1);

    if (!link) { res.status(404).json({ error: "Shared model not found." }); return; }
    if (link.revokedAt) { res.status(410).json({ error: "This share link has been revoked." }); return; }

    const [model] = await db
      .select()
      .from(financialModelsTable)
      .where(eq(financialModelsTable.id, link.modelId))
      .limit(1);

    if (!model) { res.status(404).json({ error: "Model no longer exists." }); return; }

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "Unnamed School";
    const state = typeof profile?.state === "string" ? profile.state : "";
    const schoolType = typeof profile?.schoolType === "string" ? profile.schoolType : "";
    const entityType = typeof profile?.entityType === "string" ? profile.entityType : "";

    const yearFinancials = computeYearFinancialsFromData(data);
    const consultantOutput = await runConsultantEngine(data);

    const enrollment = yearFinancials.map(yf => yf.students);
    const revenue = yearFinancials.map(yf => yf.totalRevenue);
    const expenses = yearFinancials.map(yf => yf.totalExpenses);
    const netIncome = yearFinancials.map(yf => yf.netIncome);
    const staffingCost = yearFinancials.map(yf => yf.totalStaffingCost);
    const facilityCost = yearFinancials.map(yf => yf.facilityCost);
    const debtService = yearFinancials.map(yf => yf.debtService);
    const netMargin = yearFinancials.map(yf => yf.netMargin);
    const dscr = yearFinancials.map(yf =>
      yf.debtService > 0 ? Math.round(((yf.netIncome + yf.debtService) / yf.debtService) * 100) / 100 : 0
    );

    const cf = consultantOutput.cumulativeFinancials || [];
    const reserveMonths = cf.length > 0 ? cf[cf.length - 1].reserveMonths : 0;
    const cashRunwayMonths = consultantOutput.cashRunwayMonths || 0;

    const priorSnapshot = (data as Record<string, unknown>).priorYearSnapshot as Record<string, number> | undefined;
    const y1StartingCash = priorSnapshot?.endingCash || 0;
    const y1EndingCash = y1StartingCash + (yearFinancials[0]?.netIncome || 0);
    const daysCashOnHand = computeDaysCashOnHand(y1EndingCash, yearFinancials[0]?.totalExpenses || 0);

    const revenueComposition = consultantOutput.revenueComposition || [];
    const costComposition = consultantOutput.costComposition || [];

    const revenueBreakdown = yearFinancials.map(yf => ({
      tuition: yf.tuitionRevenue,
      public: yf.publicRevenue,
      philanthropy: yf.philanthropyRevenue,
    }));

    res.json({
      schoolName,
      state,
      schoolType,
      entityType,
      enrollment,
      revenue,
      expenses,
      netIncome,
      staffingCost,
      facilityCost,
      debtService,
      netMargin,
      dscr,
      reserveMonths,
      cashRunwayMonths,
      daysCashOnHand,
      revenueComposition,
      costComposition,
      revenueBreakdown,
      executiveSummary: consultantOutput.executiveSummary || null,
      lenderReadiness: consultantOutput.lenderReadiness || null,
      createdAt: link.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("Get shared model error:", err);
    res.status(500).json({ error: "Something went wrong loading the shared model." });
  }
});

export default router;
