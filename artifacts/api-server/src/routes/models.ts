import { Router, type IRouter } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@workspace/db";
import { financialModelsTable, exportsTable, sharedLinksTable, usersTable } from "@workspace/db/schema";
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
import { ObjectStorageService } from "../lib/objectStorage";
import { createRateLimiter } from "../lib/rate-limiter";
import { isRequestAborted } from "../lib/request-abort";

// Round-4 #22: dedicated rate limiter for the unauth /shared/:token surface.
// Both /shared/:token and /shared/:token/export/decision-comparison-pdf run
// heavy work per request — runConsultantEngine + per-scenario decision impact
// recompute, plus a multi-page PDF render on the export route — and previously
// had ZERO rate limiting. Anyone with a leaked share token (forwarded email,
// screenshot, accidental git commit) could pin the API by hammering it. We
// allow 30/min/IP, which is generous for legitimate recipients refreshing
// the page but cuts off the trivial DoS pattern.
const sharedLinkRateLimiter = createRateLimiter(60_000, 30);
import { generateProFormaPDF } from "../lib/pdf-proforma";
import { computeAnnualDscr } from "@workspace/finance";
import { generateLoanReadinessPDF } from "../lib/pdf-loan-readiness";
import { generateLenderProFormaWorkbook } from "../lib/lender-proforma-export";
import { generateSingleYearBudget } from "../lib/underwriting-export";
import { generateUnderwritingWorkbook as generateUnderwritingWorkbookV2 } from "../lib/underwriting-workbook";
import { generateChestertonOperatingManual } from "../lib/packets/chesterton-operating-manual";
import { generateFormulaWorkbook } from "../lib/formula-export";
import { generateWorkbook } from "../lib/excel-export";
import { trackEvent } from "../lib/track-event";
import { runConsultantEngine, computeYearFinancialsFromData } from "../lib/consultant-engine";
import { type AssumptionFlag } from "../lib/assumption-flags";
import {
  buildNarrativeBundle,
  buildBoardCommentary,
  buildGrantCommentary,
  buildLenderCommentary,
} from "../lib/packets/build-narrative-commentary";
import { computeDaysCashOnHand } from "../lib/workbook-helpers.js";
import {
  computeDecisionImpactFromPersisted,
  coercePersistedDecisionOverrides,
  isDecisionType,
  type DecisionImpact,
  type DecisionType as DecisionEngineDecisionType,
} from "@workspace/finance";
import type { Response } from "express";

// Postgres `serial` (int4) caps at 2,147,483,647. `zod.coerce.number()` on
// the generated path-param schemas accepts fractional ("1.5"), exponential
// ("1e10"), and overflow ("9999999999999999999") strings — every one of
// which used to crash the route with a 500 + an error_logs row when
// Drizzle bound the bogus value to the int4 column. This guard matches
// the contract the DB actually enforces.
function isValidModelId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647;
}

// Strip control bytes that crash Postgres or render badly in PDFs/UI:
// NULs (0x00) trigger Postgres's "invalid byte sequence for encoding UTF8"
// when bound to a TEXT column (raising 500 + error_logs noise); other C0
// control chars and DEL (0x7F) survive Postgres but render as garbage in
// lender PDFs and email subject lines. We strip rather than reject so a
// founder pasting a name from a richtext source doesn't lose the save.
function sanitizeModelName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
}

// Task #479 — full optimistic concurrency. We now have a dedicated
// monotonic `version` integer column on `financial_models` that
// increments on every PUT, and the ETag / If-Match token is the
// version (e.g. `"7"`). Clients are required to send `If-Match` on
// every PUT — omitting the header is a 428 Precondition Required —
// and a stale token is a 409 with the latest server state.
//
// Task #480 superseded the hand-rolled `validateModelDataHardening`
// helper that used to live here: those rules (maxCapacity >= 1,
// collectionRate 0..100, non-negative snapshot/projection money
// fields, monthsCompleted 0..12) are now expressed in the OpenAPI
// spec and enforced automatically by the generated zod schemas in
// `UpdateModelBody.safeParse`, so a duplicate runtime check would
// just diverge over time.
const reviewRequestEmailSchema = z.string().trim().min(1).max(254).email();

function buildEtag(version: number): string {
  return `"${version}"`;
}

// Accept both quoted (`"7"`, the canonical RFC 7232 form) and bare
// (`7`) values for client convenience, and tolerate accidental
// whitespace. Returns the numeric version, or NaN if unparseable.
function parseIfMatchVersion(raw: string): number {
  const trimmed = raw.trim().replace(/^W\//i, "");
  const unquoted = trimmed.replace(/^"|"$/g, "");
  return Number.parseInt(unquoted, 10);
}

function abortGuard(req: AuthRequest, res: Response): boolean {
  if (isRequestAborted(req)) {
    if (!res.headersSent) {
      res.status(503).json({ error: "Request aborted." });
    }
    return true;
  }
  return false;
}

// DATA MODEL: Assumption flags use a dual-source architecture:
//   - `assumptionFlags` (computed): Engine-generated flags with field, flagType, severity,
//     currentValue, benchmark, defaultPrompt. Recomputed on each consultant run.
//   - `assumptionFlagResponses` (user input): User-provided reasons keyed by flagType:field.
//     Stored separately since flags are recomputed but reasons persist.
//   - API response merges both into a canonical shape with `reason` field included.
//   - Persisted `assumptionFlags` also includes merged `reason` for export consumers.
function checkUnresolvedFlags(
  flags: AssumptionFlag[],
  responses: Array<{ field: string; flagType: string; reason?: string }>,
): { blocked: boolean; message: string } {
  const responseMap = new Map<string, string>();
  for (const r of responses) {
    responseMap.set(`${r.flagType}:${r.field}`, r.reason || "");
  }
  // POLICY: Block export for unresolved warning AND critical flags.
  // Rationale: Lender-ready documents must never contain unexplained anomalies.
  // Info-level flags are informational only and do not block export.
  // This policy is intentionally enforced identically in:
  //   1. Server-side: checkUnresolvedFlags (this function) — used by all 6 export routes
  //   2. Client-side: wizard step 9 validation in model-wizard/index.tsx
  const unresolved = flags.filter(
    f => (f.severity === "critical" || f.severity === "warning") &&
         !responseMap.get(`${f.flagType}:${f.field}`)?.trim()
  );
  if (unresolved.length === 0) return { blocked: false, message: "" };
  return {
    blocked: true,
    message: `Export blocked: ${unresolved.length} flagged assumption(s) require an explanation before exporting. Lenders should never see unexplained anomalies.`,
  };
}
import { buildLenderPacket } from "../lib/packets/build-lender-packet";
import { generateLenderPacketPDF } from "../lib/packets/lender-packet-pdf";
import { buildLenderSummary } from "../lib/packets/build-lender-summary";
import { buildBoardPacket } from "../lib/packets/build-board-packet";
import { generateBoardPacketPDF } from "../lib/packets/board-packet-pdf";
import { buildFounderSummary, type FounderSummary } from "../lib/packets/build-founder-summary";
import {
  ACCURACY_METRICS,
  type AccuracyMetricKey,
  type ForecastAccuracyFilter,
} from "@workspace/finance";
import {
  generateDecisionComparisonPDF,
  validateDecisionComparisonRequest,
  buildComparisonFileName,
} from "../lib/decision-comparison-pdf";
import { normalizeRevenueRows } from "../lib/workbook-helpers";
import { isEmailConfigured, sendReviewRequestToTeam, sendReviewConfirmation, renderReviewRequestEmail } from "../lib/mailer";
import { buildReviewRequestData } from "../lib/review-request-data";
import { schoolTypeDisplay, entityTypeDisplay } from "../lib/pdf-utils";

// Pull the founder's on-screen Forecast Accuracy filter off an export request
// (`?metric=enrollment|revenue|...&asOfYear=1..5`). Used by the lender / board
// packet routes so the printable PDFs (and the JSON preview) mirror the slice
// the founder was looking at when they clicked Download (Task #391).
//
// Unknown / out-of-range / NaN values fall back to `null` for that axis
// rather than throwing — a stale or hand-typed link should never block an
// otherwise-valid export. Returns `null` when no filter applies.
const ACCURACY_METRIC_KEYS = ACCURACY_METRICS.map((m) => m.key);
function parseForecastAccuracyFilter(
  query: Record<string, unknown>,
): ForecastAccuracyFilter | null {
  const rawMetric = typeof query.metric === "string" ? query.metric : null;
  const metric: AccuracyMetricKey | null =
    rawMetric && (ACCURACY_METRIC_KEYS as string[]).includes(rawMetric)
      ? (rawMetric as AccuracyMetricKey)
      : null;

  const rawYear = typeof query.asOfYear === "string" ? query.asOfYear : null;
  const yearNum = rawYear !== null ? Number(rawYear) : NaN;
  const asOfYear =
    Number.isInteger(yearNum) && yearNum >= 1 && yearNum <= 5 ? yearNum : null;

  if (!metric && asOfYear === null) return null;
  return { metric, asOfYear };
}

function sendBinary(res: Response, buffer: Buffer | ArrayBuffer | Uint8Array, contentType: string, filename: string) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as unknown as ArrayLike<number>);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buf.length));
  res.end(buf);
}

// Task #733 — enforce the AssumptionConfidenceCard caps on the server
// so a misbehaving / malicious client can't record arbitrary evidence
// metadata (e.g. claim a 5 GB lease PDF or stuff 500 fake attachments
// in a single row) and bloat exports / break the lender PDF appendix.
// Mirrors MAX_EVIDENCE_FILE_BYTES / MAX_EVIDENCE_FILES_PER_ROW in
// artifacts/school-financial-model/src/components/wizard/AssumptionConfidenceCard.tsx
// and the matching `.max(...)` on the wizard schema's evidenceFiles
// array. Keep all three in sync.
const MAX_EVIDENCE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_EVIDENCE_FILES_PER_ROW = 25;

function validateEvidenceFiles(
  data: Record<string, unknown> | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!data || typeof data !== "object") return { ok: true };
  const conf = (data as Record<string, unknown>).assumptionConfidence;
  if (!conf || typeof conf !== "object") return { ok: true };
  for (const [key, raw] of Object.entries(conf as Record<string, unknown>)) {
    const entry = raw as Record<string, unknown> | null | undefined;
    if (!entry || typeof entry !== "object") continue;
    const files = entry.evidenceFiles;
    if (files === undefined || files === null) continue;
    if (!Array.isArray(files)) {
      return { ok: false, error: `assumptionConfidence.${key}.evidenceFiles must be an array.` };
    }
    if (files.length > MAX_EVIDENCE_FILES_PER_ROW) {
      return {
        ok: false,
        error: `assumptionConfidence.${key}.evidenceFiles has ${files.length} files; the cap is ${MAX_EVIDENCE_FILES_PER_ROW} per assumption.`,
      };
    }
    for (let i = 0; i < files.length; i++) {
      const f = files[i] as Record<string, unknown> | null | undefined;
      if (!f || typeof f !== "object") continue;
      const size = f.size;
      if (typeof size === "number" && Number.isFinite(size) && size > MAX_EVIDENCE_FILE_BYTES) {
        return {
          ok: false,
          error: `assumptionConfidence.${key}.evidenceFiles[${i}].size is ${size} bytes; the per-file cap is ${MAX_EVIDENCE_FILE_BYTES} bytes (25 MB).`,
        };
      }
    }
  }
  return { ok: true };
}

function normalizeModelData(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...data };
  if (Array.isArray(normalized.revenueRows)) {
    normalized.revenueRows = normalizeRevenueRows(normalized.revenueRows as any).map((row) => ({
      ...row,
      escalationRateOverridden: row.escalationRateOverridden ?? true,
    }));
  }
  if (Array.isArray(normalized.expenseRows)) {
    normalized.expenseRows = (normalized.expenseRows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      escalationRateOverridden: (row.escalationRateOverridden as boolean | undefined) ?? true,
    }));
  }
  return normalized;
}

/**
 * Look up the requesting user's `personaComfort` so packet builders can
 * pick the right tone for the wage-base cap savings copy (Task #322).
 * Returns null if the column is missing/blank or anything goes wrong —
 * the packet builders treat null as the legacy/technical wording.
 */
async function fetchPersonaComfort(
  userId: number,
): Promise<"new_to_budgeting" | "comfortable" | null> {
  try {
    const [user] = await db
      .select({ personaComfort: usersTable.personaComfort })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const v = user?.personaComfort;
    if (v === "new_to_budgeting" || v === "comfortable") return v;
    return null;
  } catch {
    return null;
  }
}

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Task #736 — collect every App Storage `objectPath` referenced by a
// model's assumptionConfidence evidence files. Used by the model PUT
// (to clean up paths the founder removed in this save) and DELETE
// (to clean up everything the model owned) handlers so attachments
// don't accumulate as orphan objects in App Storage. Tolerant of
// legacy / partially-typed data — non-string objectPaths are skipped.
function extractEvidenceObjectPaths(data: unknown): string[] {
  const out: string[] = [];
  if (!data || typeof data !== "object") return out;
  const confidence = (data as Record<string, unknown>).assumptionConfidence;
  if (!confidence || typeof confidence !== "object") return out;
  for (const entry of Object.values(confidence as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const files = (entry as Record<string, unknown>).evidenceFiles;
    if (!Array.isArray(files)) continue;
    for (const f of files) {
      if (!f || typeof f !== "object") continue;
      const p = (f as Record<string, unknown>).objectPath;
      if (typeof p === "string" && p.length > 0) out.push(p);
    }
  }
  return out;
}

async function deleteOrphanedObjects(paths: Iterable<string>): Promise<void> {
  for (const p of paths) {
    try {
      await objectStorageService.deleteObjectEntity(p);
    } catch (err) {
      console.warn("[models] orphan object delete failed", { p, err });
    }
  }
}

// Task #736 — duplicating a model copies its `data` JSON verbatim,
// so two `financial_models` rows can legitimately reference the same
// `/objects/<id>` evidence file. The inline cleanup paths in PUT and
// DELETE must therefore only delete an object once the *last* model
// referencing it lets go — otherwise removing an attachment in one
// copy would silently break the same attachment in another copy.
//
// Returns the set of objectPaths still referenced by any model OTHER
// than `excludeModelId`. Callers intersect this with their candidate
// removal set and only delete the ones that fall outside it.
//
// Implemented as an in-process scan rather than a JSONB query because
// the path lives several layers deep in `assumptionConfidence` and
// the row count is small (one row per model per founder). The orphan
// sweeper uses the same shape so semantics stay aligned.
async function pathsReferencedByOtherModels(
  excludeModelId: number,
): Promise<Set<string>> {
  const rows = await db
    .select({
      id: financialModelsTable.id,
      data: financialModelsTable.data,
    })
    .from(financialModelsTable);
  const refs = new Set<string>();
  for (const row of rows) {
    if (row.id === excludeModelId) continue;
    for (const p of extractEvidenceObjectPaths(row.data)) refs.add(p);
  }
  return refs;
}

async function safeDeleteUnreferenced(
  candidatePaths: string[],
  excludeModelId: number,
): Promise<void> {
  if (candidatePaths.length === 0) return;
  let stillReferenced: Set<string>;
  try {
    stillReferenced = await pathsReferencedByOtherModels(excludeModelId);
  } catch (err) {
    // If we can't prove the paths are orphans, do NOT delete — the
    // sweeper will catch them on the next pass.
    console.warn("[models] reference check failed; skipping inline delete", err);
    return;
  }
  const truly = candidatePaths.filter((p) => !stillReferenced.has(p));
  if (truly.length > 0) {
    await deleteOrphanedObjects(truly);
  }
}

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
    version: model.version,
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
    const { name, currentStep, schoolStage, fundingProfile } = parsed.data;
    const cleanName = sanitizeModelName(name);
    if (!cleanName) {
      res.status(400).json({ error: "Model name is required." });
      return;
    }
    const rawData = (req.body as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const evidenceCheck = validateEvidenceFiles(rawData);
    if (!evidenceCheck.ok) {
      res.status(400).json({ error: evidenceCheck.error, code: "evidence_cap_exceeded" });
      return;
    }
    const normalizedData = normalizeModelData(rawData ?? {});
    const rowCols = extractRowColumns(normalizedData);

    const [model] = await db.insert(financialModelsTable).values({
      userId: req.userId!,
      name: cleanName,
      currentStep: currentStep ?? 0,
      data: normalizedData,
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
    if (!params.success || !isValidModelId(params.data.id)) {
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

    res.setHeader("ETag", buildEtag(model.version));
    res.json(modelResponse(model));
  } catch (err) {
    console.error("Get model error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

function stripEmptyValues(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj === "string") return obj === "" ? undefined : obj;
  if (Array.isArray(obj)) return obj.map(stripEmptyValues);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const cleaned = stripEmptyValues(value);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result;
  }
  return obj;
}

router.put("/models/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = UpdateModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
      res.status(400).json({ error: "Invalid model ID." });
      return;
    }
    req.body = stripEmptyValues(req.body);
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

    const { name, currentStep, status, schoolStage, fundingProfile } = parsed.data;
    const nextName = name === undefined ? existing.name : sanitizeModelName(name);
    if (!nextName) {
      res.status(400).json({ error: "Model name is required." });
      return;
    }
    const rawData = (req.body as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const evidenceCheck = validateEvidenceFiles(rawData);
    if (!evidenceCheck.ok) {
      res.status(400).json({ error: evidenceCheck.error, code: "evidence_cap_exceeded" });
      return;
    }
    const normalizedData = normalizeModelData(rawData ?? {});

    // Single-year mode is one-way. Once a model has been promoted to
    // five_year (whether at creation via the /model/new picker or via the
    // Extend-to-5-year modal), the founder cannot drop back to single_year:
    // the seeded Y2-Y5 inputs, scenarios, decision history, and any
    // already-issued shared lender/board exports would all silently
    // misrepresent what's actually in the model. The reverse direction
    // (single_year → five_year) is allowed and is the documented Extend
    // flow. A missing/legacy modelDuration on the existing row counts as
    // five_year (matches getModelDuration's default), so the legacy back-compat
    // path is also locked.
    const existingProfile = (existing.data as Record<string, unknown> | null)
      ?.schoolProfile as Record<string, unknown> | undefined;
    const existingDuration =
      existingProfile?.modelDuration === "single_year" ? "single_year" : "five_year";
    const incomingProfile = normalizedData?.schoolProfile as
      | Record<string, unknown>
      | undefined;
    const incomingDurationRaw = incomingProfile?.modelDuration;
    if (
      existingDuration === "five_year" &&
      incomingDurationRaw === "single_year"
    ) {
      res.status(400).json({
        error:
          "modelDuration cannot be downgraded from five_year to single_year. Create a new single-year model instead.",
        code: "duration_downgrade_forbidden",
      });
      return;
    }

    // Task #479 — mandatory optimistic concurrency. The client must
    // send `If-Match: "<version>"` echoing the server's last-known
    // `version`. Omitting the header is a 428 Precondition Required
    // (so a misconfigured client fails loudly instead of silently
    // last-write-wins-ing); a stale token is a 409 with the latest
    // server state so the caller can refresh-and-retry or surface
    // a "reload" notice to the user.
    const ifMatchRaw = (req.headers["if-match"] as string | undefined)?.trim();
    if (!ifMatchRaw) {
      res.setHeader("ETag", buildEtag(existing.version));
      res.status(428).json({
        error: "Missing If-Match header. Reload the model and retry.",
        code: "if_match_required",
        currentVersion: existing.version,
        model: modelResponse(existing),
      });
      return;
    }
    const clientVersion = parseIfMatchVersion(ifMatchRaw);
    if (!Number.isFinite(clientVersion) || clientVersion !== existing.version) {
      res.setHeader("ETag", buildEtag(existing.version));
      res.status(409).json({
        error: "Model was updated by another tab or session. Reload to see the latest changes.",
        code: "version_conflict",
        currentVersion: existing.version,
        model: modelResponse(existing),
      });
      return;
    }

    const rowCols = extractRowColumns(normalizedData);
    // Task #479 — bump `version` by exactly 1 on every successful PUT.
    // The increment is part of the same UPDATE so two concurrent writers
    // who both pass the If-Match check cannot both win: the first PUT
    // moves version forward, and the second's WHERE on the prior version
    // (added below) matches zero rows. We then return 409 instead of
    // pretending the save succeeded.
    const [model] = await db
      .update(financialModelsTable)
      .set({
        name: nextName,
        data: normalizedData,
        currentStep: currentStep ?? existing.currentStep,
        status: status ?? existing.status,
        schoolStage: (schoolStage as typeof financialModelsTable.$inferInsert["schoolStage"]) ?? existing.schoolStage,
        fundingProfile: (fundingProfile as typeof financialModelsTable.$inferInsert["fundingProfile"]) ?? existing.fundingProfile,
        ...rowCols,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(and(
        eq(financialModelsTable.id, params.data.id),
        eq(financialModelsTable.userId, req.userId!),
        eq(financialModelsTable.version, clientVersion),
      ))
      .returning();

    if (!model) {
      // Lost the race against a concurrent PUT that bumped version
      // between our SELECT and UPDATE. Re-read and 409.
      const [fresh] = await db
        .select()
        .from(financialModelsTable)
        .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)))
        .limit(1);
      if (fresh) {
        res.setHeader("ETag", buildEtag(fresh.version));
        res.status(409).json({
          error: "Model was updated by another tab or session. Reload to see the latest changes.",
          code: "version_conflict",
          currentVersion: fresh.version,
          model: modelResponse(fresh),
        });
      } else {
        res.status(404).json({ error: "Model not found." });
      }
      return;
    }

    await trackEvent("updated_model", req.userId, { modelId: model.id });

    // Task #736 — diff the previous evidence-file objectPaths against
    // the saved set and delete any that the founder removed in this
    // save. Done after the DB write so a failed App Storage delete
    // can never roll back the model save itself; we just log and let
    // the orphan sweeper catch it on the next pass.
    try {
      const prev = new Set(extractEvidenceObjectPaths(existing.data));
      const next = new Set(extractEvidenceObjectPaths(model.data));
      const removed: string[] = [];
      for (const p of prev) if (!next.has(p)) removed.push(p);
      // Gate behind a global reference check: a duplicated model
      // (POST /models/:id/duplicate copies `data` verbatim) can still
      // reference the same objectPath, so we only delete once it's
      // truly unreferenced.
      void safeDeleteUnreferenced(removed, model.id);
    } catch (cleanupErr) {
      console.warn("[models] evidence cleanup diff failed", cleanupErr);
    }

    res.setHeader("ETag", buildEtag(model.version));
    res.json(modelResponse(model));
  } catch (err) {
    console.error("Update model error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.delete("/models/:id", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = DeleteModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    // Task #736 — drop every App Storage object the model owned
    // (lease PDFs, MOUs, photos…) so they don't outlive the row that
    // referenced them. Best-effort: a sidecar/network blip should not
    // turn a successful model delete into a 500.
    try {
      const paths = extractEvidenceObjectPaths(existing.data);
      // The row is already gone, so a global scan implicitly excludes
      // it; pass -1 (no-op exclusion) to keep the helper signature
      // consistent. Duplicates of this model that still reference any
      // of these paths will keep them alive.
      void safeDeleteUnreferenced(paths, -1);
    } catch (cleanupErr) {
      console.warn("[models] evidence cleanup on delete failed", cleanupErr);
    }

    res.json({ message: "Model deleted successfully." });
  } catch (err) {
    console.error("Delete model error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

router.post("/models/:id/duplicate", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = DuplicateModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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
    if (!params.success || !isValidModelId(params.data.id)) {
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
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const rawData = data as unknown as Record<string, unknown>;
    const existingResponses = (rawData.assumptionFlagResponses || []) as Array<{ field: string; flagType: string; reason?: string }>;
    const responseMap = new Map<string, string>();
    for (const r of existingResponses) {
      responseMap.set(`${r.flagType}:${r.field}`, r.reason || "");
    }

    const persistedFlags = (consultantOutput.assumptionFlags || []).map(f => ({
      field: f.field,
      flagType: f.flagType,
      severity: f.severity,
      currentValue: f.currentValue,
      benchmark: f.benchmark,
      defaultPrompt: f.defaultPrompt,
      // Task #658 — persist coach-voice next step alongside the prompt so
      // it survives across reloads and downstream packet builds.
      nextStep: f.nextStep,
      reason: responseMap.get(`${f.flagType}:${f.field}`) || "",
    }));
    const updatedData = { ...data, assumptionFlags: persistedFlags };

    await db
      .update(financialModelsTable)
      .set({
        data: updatedData as unknown as Record<string, unknown>,
        consultantSummaryJson: consultantOutput as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(and(eq(financialModelsTable.id, params.data.id), eq(financialModelsTable.userId, req.userId!)));

    // Task #745 — surface the canonical-engine narrative commentaries
    // (board / grant / lender) on the consultant response so the wizard's
    // Lender Narrative step can render the same fallback prose the PDFs
    // would render when a founder hasn't customized the audience draft.
    // Each commentary is figure-allowlisted by the same guard that
    // protects the PDF render path, so the preview can never drift from
    // what will ship.
    const narrativeBundle = buildNarrativeBundle(data, consultantOutput);
    const narrativeCommentaries = {
      board: buildBoardCommentary(narrativeBundle),
      grant: buildGrantCommentary(narrativeBundle),
      lender: buildLenderCommentary(narrativeBundle),
    };

    const outputWithReasons = {
      ...consultantOutput,
      assumptionFlags: persistedFlags,
      narrativeCommentaries,
    };
    res.json(outputWithReasons);
  } catch (err) {
    console.error("Consultant engine error:", err);
    res.status(500).json({ error: "Something went wrong running the consultant analysis." });
  }
});

router.get("/models/:id/export/pro-forma-pdf", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const buffer = await generateProFormaPDF(data);

    if (abortGuard(req, res)) return;

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
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const entityType = typeof profile?.entityType === "string" ? profile.entityType : undefined;
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const buffer = await generateLoanReadinessPDF(consultantOutput, schoolName, entityType);

    if (abortGuard(req, res)) return;

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
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    // Task #615 — feed the canonical engine output into the workbook so the
    // new "Lender Summary" tab is sourced from the same engine as the
    // dashboard / lender packet PDF (no hand-typed values).
    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const buffer = await generateLenderProFormaWorkbook(data, consultantOutput);

    if (abortGuard(req, res)) return;

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
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const raw = data as unknown as Record<string, unknown>;
    const flagResponses = (raw.assumptionFlagResponses || []) as Array<{ field: string; flagType: string; reason?: string }>;
    const flagCheck = checkUnresolvedFlags(consultantOutput.assumptionFlags || [], flagResponses);
    if (flagCheck.blocked) {
      res.status(422).json({ error: flagCheck.message });
      return;
    }

    const personaComfort = await fetchPersonaComfort(req.userId!);
    // Forward the on-screen Forecast Accuracy filter from the founder's
    // current view (`?metric=…&asOfYear=…`) into the JSON preview so the
    // packet preview modal mirrors the slice they were looking at — the same
    // forwarding the PDF route does (Task #391).
    const forecastAccuracyFilter = parseForecastAccuracyFilter(req.query);
    const packet = buildLenderPacket(
      data as any,
      consultantOutput,
      model.id,
      personaComfort,
      forecastAccuracyFilter,
    );

    res.json(packet);
  } catch (err) {
    console.error("Lender packet JSON error:", err);
    res.status(500).json({ error: "Something went wrong generating the Lender Conversation Snapshot." });
  }
});

// Lender Packet PDF — Task #485 audit: this stays a 5-year-only deliverable
// by product decision. The cover page reads "5-Year Financial Model", the
// debt-service section renders Y1-Y5 DSCR + reserve trend tables, and the
// scenario/forecast-accuracy sections all key off multi-year trajectories.
// A Y1-only variant would not satisfy the lender use case (lenders ask for
// the multi-year forecast directly), so single-year founders are gated to
// "Extend to 5-year" upstream in ExportStep.tsx rather than here.
router.get("/models/:id/export/lender-packet-pdf", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const raw = data as unknown as Record<string, unknown>;
    const flagResponses = (raw.assumptionFlagResponses || []) as Array<{ field: string; flagType: string; reason?: string }>;
    const flagCheck = checkUnresolvedFlags(consultantOutput.assumptionFlags || [], flagResponses);
    if (flagCheck.blocked) {
      res.status(422).json({ error: flagCheck.message });
      return;
    }

    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const personaComfort = await fetchPersonaComfort(req.userId!);
    // Forward the on-screen Forecast Accuracy filter so the PDF mirrors what
    // the founder was looking at when they hit "Download" (Task #391). The
    // filter shape matches the URL the planner page exposes
    // (`?metric=enrollment|revenue|...&asOfYear=1..5`); unknown / out-of-range
    // values are silently coerced to "no filter" so a stale link never blocks
    // an export.
    const forecastAccuracyFilter = parseForecastAccuracyFilter(req.query);
    const packet = buildLenderPacket(
      data as any,
      consultantOutput,
      model.id,
      personaComfort,
      forecastAccuracyFilter,
    );
    // Task #615 — lead the lender packet PDF with a one-page summary
    // sourced from the canonical engine. Same builder powers the new
    // workbook tab so the PDF and Excel one-pagers carry identical
    // numbers.
    const lenderSummary = buildLenderSummary(data, consultantOutput);
    const buffer = await generateLenderPacketPDF(packet, lenderSummary);

    if (abortGuard(req, res)) return;

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "pdf",
    });

    await trackEvent("exported_lender_packet_pdf", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/pdf", `${safeName}_Lender_Conversation_Snapshot.pdf`);
  } catch (err) {
    console.error("Lender packet PDF error:", err);
    res.status(500).json({ error: "Something went wrong generating the Lender Conversation Snapshot PDF." });
  }
});

// Task #660 — Plain-English founder summary. Read-only JSON endpoint that
// powers the in-app /model/:id/summary route and is also embedded into the
// Board and Funder Summary PDF + Founder Planning Workbook XLSX. Same
// canonical engine pass that powers every other export, so the numbers
// can never drift across surfaces.
router.get("/models/:id/summary", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const summary = buildFounderSummary(data, consultantOutput);
    res.json(summary);
  } catch (err) {
    console.error("Founder summary error:", err);
    res.status(500).json({ error: "Something went wrong generating the plain-English summary." });
  }
});

router.get("/models/:id/export/board-packet", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const raw = data as unknown as Record<string, unknown>;
    const flagResponses = (raw.assumptionFlagResponses || []) as Array<{ field: string; flagType: string; reason?: string }>;
    const flagCheck = checkUnresolvedFlags(consultantOutput.assumptionFlags || [], flagResponses);
    if (flagCheck.blocked) {
      res.status(422).json({ error: flagCheck.message });
      return;
    }

    const personaComfort = await fetchPersonaComfort(req.userId!);
    // Mirror the lender JSON route — forward the founder's on-screen Forecast
    // Accuracy filter so the preview modal matches the sliced view (Task #391).
    const forecastAccuracyFilter = parseForecastAccuracyFilter(req.query);
    const packet = buildBoardPacket(
      data as any,
      consultantOutput,
      model.id,
      personaComfort,
      forecastAccuracyFilter,
    );

    res.json(packet);
  } catch (err) {
    console.error("Board packet JSON error:", err);
    res.status(500).json({ error: "Something went wrong generating the board packet." });
  }
});

// Board Summary PDF — Task #485 audit: same product call as the Lender
// Packet PDF above. Cover reads "5-Year Financial Overview for Board
// Review", and the cash-runway / scenario-comparison / recruiting-projection
// sections all assume a 5-year window (trough callouts only make sense over
// multiple years; the Y5 scenario snapshot is the headline trustees ask for).
// Single-year founders are routed through the "Extend to 5-year" gate in
// ExportStep.tsx; we do not render a Y1-only board PDF.
router.get("/models/:id/export/board-packet-pdf", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const raw = data as unknown as Record<string, unknown>;
    const flagResponses = (raw.assumptionFlagResponses || []) as Array<{ field: string; flagType: string; reason?: string }>;
    const flagCheck = checkUnresolvedFlags(consultantOutput.assumptionFlags || [], flagResponses);
    if (flagCheck.blocked) {
      res.status(422).json({ error: flagCheck.message });
      return;
    }

    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const personaComfort = await fetchPersonaComfort(req.userId!);
    // Forward the on-screen Forecast Accuracy filter so the board PDF mirrors
    // the founder's filtered view at the moment of export (Task #391).
    const forecastAccuracyFilter = parseForecastAccuracyFilter(req.query);
    const packet = buildBoardPacket(
      data as any,
      consultantOutput,
      model.id,
      personaComfort,
      forecastAccuracyFilter,
    );
    // Task #660 - Plain-English founder summary leads the body of the
    // Board and Funder Summary PDF (six sections, coach voice, every
    // figure sourced from the canonical engine).
    const founderSummary: FounderSummary = buildFounderSummary(data, consultantOutput);
    const buffer = await generateBoardPacketPDF(packet, founderSummary);

    if (abortGuard(req, res)) return;

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "pdf",
    });

    await trackEvent("exported_board_packet_pdf", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/pdf", `${safeName}_Board_and_Funder_Summary.pdf`);
  } catch (err) {
    console.error("Board packet PDF error:", err);
    res.status(500).json({ error: "Something went wrong generating the Board and Funder Summary PDF." });
  }
});

// Side-by-side decision comparison PDF. Founders compose the comparison on
// the scenarios page (two saved decision-flow scenarios re-run against the
// current base model). The client posts the already-computed impacts plus
// labels/narratives — no model math runs here, only layout — and we return a
// board-ready PDF that mirrors the on-screen ImpactComparison block.
router.post(
  "/models/:id/export/decision-comparison-pdf",
  authMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const params = ExportModelParams.safeParse(req.params);
      if (!params.success || !isValidModelId(params.data.id)) {
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

      if (abortGuard(req, res)) return;

      const validated = validateDecisionComparisonRequest(req.body);
      if (!validated) {
        res.status(400).json({
          error: "Invalid comparison payload. Expected primary and compare sides with computed impacts.",
        });
        return;
      }

      // If the client didn't tag a school name, fall back to the persisted one
      // so the PDF subtitle still reads naturally.
      if (!validated.schoolName) {
        const data = normalizeModelData(model.data as Record<string, unknown>);
        const profile = data?.schoolProfile as Record<string, unknown> | undefined;
        const sn = typeof profile?.schoolName === "string" ? profile.schoolName : "";
        if (sn) validated.schoolName = sn;
      }

      const buffer = await generateDecisionComparisonPDF(validated);

      if (abortGuard(req, res)) return;

      await db.insert(exportsTable).values({
        userId: req.userId!,
        modelId: model.id,
        format: "pdf",
      });

      await trackEvent("exported_decision_comparison_pdf", req.userId, {
        modelId: model.id,
        primary: validated.primary.label,
        compare: validated.compare.label,
      });

      const filename = buildComparisonFileName(validated.primary.label, validated.compare.label);
      sendBinary(res, buffer, "application/pdf", filename);
    } catch (err) {
      console.error("Decision comparison PDF error:", err);
      res.status(500).json({
        error: "Something went wrong generating the Decision Comparison PDF.",
      });
    }
  },
);

// QUARANTINED: v1 underwriting export route — backward-compatible shim only.
// Calls generateUnderwritingWorkbookV2 (v2 engine); no v1 math runs here.
// TARGET REMOVAL: Q3 2026 — remove once all clients have migrated to /export/underwriting-v2.
router.get("/models/:id/export/underwriting", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const raw1 = data as unknown as Record<string, unknown>;
    const flagResponses1 = (raw1.assumptionFlagResponses || []) as Array<{ field: string; flagType: string; reason?: string }>;
    const flagCheck1 = checkUnresolvedFlags(consultantOutput.assumptionFlags || [], flagResponses1);
    if (flagCheck1.blocked) {
      res.status(422).json({ error: flagCheck1.message });
      return;
    }

    const computedFlags = (consultantOutput.assumptionFlags || []).map(f => ({
      field: f.field,
      flagType: f.flagType,
      severity: f.severity,
      message: f.defaultPrompt,
      currentValue: f.currentValue,
      nextStep: f.nextStep,
    }));
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    // Task #660 - Plain-English Summary tab uses the canonical engine
    // output already computed above.
    const founderSummary = buildFounderSummary(data, consultantOutput);
    const workbook = await generateUnderwritingWorkbookV2(data, computedFlags, founderSummary);
    const buffer = await workbook.xlsx.writeBuffer();

    if (abortGuard(req, res)) return;

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_underwriting", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safeName}_Lender_Pro_Forma.xlsx`);
  } catch (err) {
    console.error("Lender Pro Forma export error:", err);
    res.status(500).json({ error: "Something went wrong generating the Lender Pro Forma workbook." });
  }
});

router.get("/models/:id/export/underwriting-v2", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const raw2 = data as unknown as Record<string, unknown>;
    const flagResponses2 = (raw2.assumptionFlagResponses || []) as Array<{ field: string; flagType: string; reason?: string }>;
    const flagCheck2 = checkUnresolvedFlags(consultantOutput.assumptionFlags || [], flagResponses2);
    if (flagCheck2.blocked) {
      res.status(422).json({ error: flagCheck2.message });
      return;
    }

    const computedFlags = (consultantOutput.assumptionFlags || []).map(f => ({
      field: f.field,
      flagType: f.flagType,
      severity: f.severity,
      message: f.defaultPrompt,
      currentValue: f.currentValue,
      nextStep: f.nextStep,
    }));
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    // Task #660 - Plain-English Summary tab in the Founder Planning
    // Workbook is sourced from the canonical engine output we just ran,
    // so it cannot disagree with the in-app /summary view or the Board
    // and Funder Summary PDF.
    const founderSummary = buildFounderSummary(data, consultantOutput);
    const workbook = await generateUnderwritingWorkbookV2(data, computedFlags, founderSummary);
    const buffer = await workbook.xlsx.writeBuffer();

    if (abortGuard(req, res)) return;

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_underwriting_v2", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safeName}_Founder_Planning_Workbook.xlsx`);
  } catch (err) {
    console.error("Underwriting V2 export error:", err);
    res.status(500).json({ error: "Something went wrong generating the Founder Planning Workbook." });
  }
});

// Chesterton Schools Network "Operating Manual" workbook export. Mirrors
// the CSN-published .xlsx so a Chesterton founder can hand the file to
// their regional director without re-keying anything. Only meaningful
// when schoolType === "chesterton_academy"; we still let any model hit
// the route (the workbook just falls back to defaults) so the founder
// can preview the format even before they finish the wizard.
//
// Task #485 audit: this export is intentionally independent of the
// `schoolProfile.modelDuration` setting. The CSN workbook is a 5-year
// template by design (Tab "1 - 5 YR FINANCIAL PROJECTIONS"), and its
// inputs come from `data.chesterton.*` (phaseEnrollment carries year0..
// year5 directly), not from the wizard's collapsed single-year shape.
// A founder who selected "Single-Year" mode can still export a complete
// CSN manual — empty future-year cells just stay blank in the workbook,
// matching the behavior of the unmodified CSN template. As a result,
// ExportStep.tsx does NOT gate the Chesterton card on isSingleYear (only
// on isChesterton).
router.get("/models/:id/export/chesterton-operating-manual", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "Chesterton_Academy";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const workbook = await generateChestertonOperatingManual({
      schoolName,
      chesterton: (data as Record<string, unknown>).chesterton as Parameters<typeof generateChestertonOperatingManual>[0]["chesterton"],
    });
    const buffer = await workbook.xlsx.writeBuffer();

    if (abortGuard(req, res)) return;

    await db.insert(exportsTable).values({
      userId: req.userId!,
      modelId: model.id,
      format: "xlsx",
    });

    await trackEvent("exported_chesterton_operating_manual", req.userId, { modelId: model.id });

    sendBinary(res, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${safeName}_CSN_Operating_Manual.xlsx`);
  } catch (err) {
    console.error("Chesterton Operating Manual export error:", err);
    res.status(500).json({ error: "Something went wrong generating the CSN Operating Manual workbook." });
  }
});

router.get("/models/:id/export/single-year", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const rawYear = parseInt(req.query.year as string || "0", 10);
    const yearIndex = isNaN(rawYear) ? 0 : Math.max(0, Math.min(rawYear, 4));
    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";
    const safeName = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");

    const buffer = await generateSingleYearBudget(data, yearIndex);

    if (abortGuard(req, res)) return;

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
    if (!params.success || !isValidModelId(params.data.id)) {
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

    if (abortGuard(req, res)) return;

    const data = normalizeModelData(model.data as Record<string, unknown>);
    const profile = data?.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "School";

    const hasRevenueRows = Array.isArray(data?.revenueRows) && (data.revenueRows as unknown[]).length > 0;
    const hasStaffingRows = Array.isArray(data?.staffingRows) && (data.staffingRows as unknown[]).length > 0;
    const hasExpenseRows = Array.isArray(data?.expenseRows) && (data.expenseRows as unknown[]).length > 0;


    const yearCount = hasRevenueRows
      ? ((data.revenueRows as Array<{ amounts: number[] }>)[0]?.amounts?.length || 3)
      : 5;
    const safeSchool = schoolName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
    const fileName = yearCount === 1
      ? `${safeSchool}_1-Year_Operating_Budget.xlsx`
      : `${safeSchool}_5-Year_Financial_Model.xlsx`;

    const consultantOutput = await runConsultantEngine(data);

    if (abortGuard(req, res)) return;

    const buffer = await generateWorkbook(data, consultantOutput);

    if (abortGuard(req, res)) return;

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
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
      res.status(400).json({ error: "Invalid model ID." });
      return;
    }

    const { name, email, message } = req.body || {};
    if (!name || typeof name !== "string" || !email || typeof email !== "string") {
      res.status(400).json({ error: "Name and email are required." });
      return;
    }

    // Task #472 — Zod email check runs BEFORE the email-service config
    // gate so a bad address always surfaces a deterministic 400, not
    // a 503 that would mask the real validation error from the caller.
    const emailParse = reviewRequestEmailSchema.safeParse(email);
    if (!emailParse.success) {
      res.status(400).json({
        error: "Please provide a valid email address.",
        code: "invalid_email",
      });
      return;
    }
    const validatedEmail = emailParse.data;

    if (!isEmailConfigured()) {
      res.status(503).json({ error: "Email service is not configured." });
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
    const profile = data.schoolProfile as Record<string, unknown> | undefined;
    const schoolName = (typeof profile?.schoolName === "string" ? profile.schoolName : "") || "Unnamed School";

    const reviewData = await buildReviewRequestData(data, {
      requesterName: name,
      requesterEmail: validatedEmail,
      message: message || undefined,
      createSharedLink: true,
      modelId: model.id,
      source: "authenticated",
    });

    const [teamResult, confirmResult] = await Promise.all([
      sendReviewRequestToTeam(reviewData),
      sendReviewConfirmation(validatedEmail, name, schoolName),
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

// Task #477 — In-app preview of the advisor brief that POST /request-review
// would email out. Uses the same buildReviewRequestData helper + the same
// renderReviewRequestEmail renderer so the preview can never drift from
// what the team actually receives. No share token is created (createSharedLink
// false) so a preview never burns a real share link before the founder
// commits to submitting.
router.get("/models/:id/review-preview", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const params = ExportModelParams.safeParse(req.params);
    if (!params.success || !isValidModelId(params.data.id)) {
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

    // Placeholder identity so the rendered "Reply to" mailto stays well-formed
    // in the preview without exposing the founder's real address before they
    // choose to submit (they may not have entered one yet at this point).
    const reviewData = await buildReviewRequestData(data, {
      requesterName: "Preview",
      requesterEmail: "preview@example.com",
      message: undefined,
      createSharedLink: false,
      modelId: model.id,
      source: "authenticated",
    });

    const { subject, html, priority } = renderReviewRequestEmail(reviewData);
    res.json({
      subject,
      html,
      priority,
      isSingleYear: reviewData.isSingleYear === true,
    });
  } catch (err) {
    console.error("Review preview error:", err);
    res.status(500).json({ error: "Failed to render review preview." });
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

router.get("/shared/:token", sharedLinkRateLimiter, async (req, res) => {
  try {
    // Express 5's overloaded router.get(path, mw, handler) widens
    // req.params[":token"] to `string | string[]`. The route-pattern
    // guarantees a single segment, so narrow it explicitly.
    const token = req.params.token as string;
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
    const modelDuration: "single_year" | "five_year" =
      profile?.modelDuration === "single_year" ? "single_year" : "five_year";

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
    const dscr = yearFinancials.map(yf => {
      const raw = computeAnnualDscr(yf);
      return raw === null ? 0 : Math.round(raw * 100) / 100;
    });

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

    // Surface the decision-typed saved scenarios so the shared page can offer
    // the same side-by-side comparison + Download-as-PDF experience the founder
    // sees in their own scenarios page. We precompute each decision's impact
    // server-side using the same engine the scenarios page uses, and embed it
    // alongside the scenario. This way the wire payload stays scoped to the
    // shared aggregates the rest of this response already publishes — we
    // never expose per-line-item model inputs (revenueRows, expenseRows,
    // staffing, etc.) or private scenario fields (status, retrospective,
    // actuals) on the public share endpoint.
    const allScenarios = (data as Record<string, unknown>).customScenarios as
      | Array<Record<string, unknown>>
      | undefined;
    const decisionScenarios = (allScenarios ?? [])
      .filter((s) => typeof s?.decisionType === "string" && isDecisionType(s.decisionType))
      .map((s) => {
        const decisionType = s.decisionType as DecisionEngineDecisionType;
        const overrides = coercePersistedDecisionOverrides(
          s.overrides as Record<string, unknown> | null | undefined,
        );
        let impact: DecisionImpact | null = null;
        try {
          impact = computeDecisionImpactFromPersisted(data, decisionType, overrides);
        } catch (err) {
          console.error("Failed to precompute decision impact for share link", { token, decisionType, error: err });
        }
        return {
          name: typeof s.name === "string" ? s.name : "",
          createdAt: typeof s.createdAt === "string" ? s.createdAt : "",
          decisionType,
          narrative: typeof s.narrative === "string" ? s.narrative : undefined,
          impact,
        };
      });

    // Task #478 — surface the model duration so the shared page can collapse
    // its 5-year tables/headlines to Y1 for single-year models. The engine
    // still emits length-5 arrays (Y2-Y5 are extrapolated from Y1), but
    // single-year founders never confirmed those values.
    const isSingleYear = (profile?.modelDuration as string | undefined) === "single_year";

    res.json({
      schoolName,
      state,
      schoolType,
      entityType,
      modelDuration,
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
      decisionScenarios,
      isSingleYear,
      // Task #659 — surface the founder's per-assumption confidence + evidence
      // notes so the share-link page can render the same Assumptions
      // Confidence section as the lender PDF and underwriting workbook. Empty
      // map (or omitted entirely on older models) renders no section.
      assumptionConfidence:
        ((data as Record<string, unknown>).assumptionConfidence as
          | Record<string, { confidence: string; evidenceNote?: string }>
          | undefined) || {},
    });
  } catch (err) {
    console.error("Get shared model error:", err);
    res.status(500).json({ error: "Something went wrong loading the shared model." });
  }
});

// Token-authed counterpart to POST /models/:id/export/decision-comparison-pdf
// so a recipient of a /shared/:token link (co-founder, advisor, board chair)
// can download the same board-ready comparison PDF without an account. The
// payload (precomputed impacts) and the PDF generator are identical — the
// only difference is the auth surface: the share token replaces the Bearer
// token, and the share record's modelId is used in place of the URL :id.
router.post("/shared/:token/export/decision-comparison-pdf", sharedLinkRateLimiter, async (req, res) => {
  try {
    // Express 5's overloaded router.post(path, mw, handler) widens
    // req.params[":token"] to `string | string[]`. The route-pattern
    // guarantees a single segment, so narrow it explicitly.
    const token = req.params.token as string;
    if (!token || token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) {
      res.status(400).json({ error: "Invalid share token." });
      return;
    }

    const [link] = await db
      .select()
      .from(sharedLinksTable)
      .where(eq(sharedLinksTable.token, token))
      .limit(1);

    if (!link) {
      res.status(404).json({ error: "Shared model not found." });
      return;
    }
    if (link.revokedAt) {
      res.status(410).json({ error: "This share link has been revoked." });
      return;
    }

    const [model] = await db
      .select()
      .from(financialModelsTable)
      .where(eq(financialModelsTable.id, link.modelId))
      .limit(1);

    if (!model) {
      res.status(404).json({ error: "Model no longer exists." });
      return;
    }

    const validated = validateDecisionComparisonRequest(req.body);
    if (!validated) {
      res.status(400).json({
        error: "Invalid comparison payload. Expected primary and compare sides with computed impacts.",
      });
      return;
    }

    if (!validated.schoolName) {
      const data = normalizeModelData(model.data as Record<string, unknown>);
      const profile = data?.schoolProfile as Record<string, unknown> | undefined;
      const sn = typeof profile?.schoolName === "string" ? profile.schoolName : "";
      if (sn) validated.schoolName = sn;
    }

    const buffer = await generateDecisionComparisonPDF(validated);

    // Record the share-token export against the model owner so it appears in
    // the founder's exports history alongside their own downloads. The
    // exports row is tagged with `sharedLinkId` (and the link's
    // `viewerLabel`, when set) so consumers of the exports table can tell
    // "the founder downloaded this" from "a co-founder/advisor/board chair
    // downloaded this via the share link" — see exports schema in
    // lib/db/src/schema/exports.ts. The analytics event continues to fire
    // for engagement tracking.
    await db.insert(exportsTable).values({
      userId: model.userId,
      modelId: model.id,
      format: "pdf",
      sharedLinkId: link.id,
      viewerLabel: link.viewerLabel,
    });

    await trackEvent("exported_decision_comparison_pdf_via_share", model.userId, {
      modelId: model.id,
      sharedLinkId: link.id,
      primary: validated.primary.label,
      compare: validated.compare.label,
    });

    const filename = buildComparisonFileName(validated.primary.label, validated.compare.label);
    sendBinary(res, buffer, "application/pdf", filename);
  } catch (err) {
    console.error("Shared decision comparison PDF error:", err);
    res.status(500).json({
      error: "Something went wrong generating the Decision Comparison PDF.",
    });
  }
});

export default router;
