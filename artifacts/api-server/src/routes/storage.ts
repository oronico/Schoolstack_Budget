import { Router, type IRouter, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  EVIDENCE_INLINE_PREVIEW_MAX_BYTES,
  classifyEvidenceFileEmbed,
} from "@workspace/finance";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { rasterizePdfFirstPage } from "../lib/pdf-rasterize";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Task #759 — mirror the per-file cap enforced on save in
// artifacts/api-server/src/routes/models.ts (validateEvidenceFiles)
// and on the wizard in AssumptionConfidenceCard.tsx. Surfacing the
// oversize case from the presigned-URL endpoint with the same
// `code: "evidence_cap_exceeded"` shape lets the wizard show a
// friendly inline explanation instead of a generic upload failure.
const MAX_EVIDENCE_FILE_BYTES = 25 * 1024 * 1024;

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 *
 * Task #734 — gated behind `authMiddleware` so the planned owner
 * (req.userId) can be encoded into the object name and later
 * verified at finalize/download time.
 */
router.post(
  "/storage/uploads/request-url",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    // Task #759 — surface the per-file cap with a stable error code
    // BEFORE generic Zod parsing rejects the oversize body for the
    // same reason. This way the wizard can show a friendly inline
    // explanation that names the offending file instead of the
    // generic "Couldn't get upload URL (400)" error.
    const rawBody = (req.body ?? {}) as { name?: unknown; size?: unknown };
    const rawSize = rawBody.size;
    if (typeof rawSize === "number" && Number.isFinite(rawSize) && rawSize > MAX_EVIDENCE_FILE_BYTES) {
      const rawName = typeof rawBody.name === "string" && rawBody.name.length > 0
        ? rawBody.name
        : "the selected file";
      res.status(400).json({
        error: `"${rawName}" is ${rawSize} bytes; the per-file cap is ${MAX_EVIDENCE_FILE_BYTES} bytes (25 MB).`,
        code: "evidence_cap_exceeded",
      });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;

      const uploadURL = await objectStorageService.getObjectEntityUploadURL(req.userId);
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      console.error("[storage] Error generating upload URL", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

/**
 * POST /storage/uploads/finalize
 *
 * Task #734 — call this after the browser PUT to the presigned URL
 * succeeds. The server verifies the requesting user is the planned
 * owner encoded in the object name, then writes an ACL policy with
 * `owner: <userId>, visibility: "private"` so the download route can
 * later allow only that user through.
 */
router.post(
  "/storage/uploads/finalize",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const body = (req.body ?? {}) as { objectPath?: unknown };
    const objectPath = typeof body.objectPath === "string" ? body.objectPath : "";
    if (!objectPath || !objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "objectPath is required" });
      return;
    }
    const plannedOwner = objectStorageService.parseOwnerUserIdFromObjectPath(objectPath);
    if (!plannedOwner || plannedOwner !== String(req.userId)) {
      res.status(403).json({ error: "You can only finalize uploads you initiated" });
      return;
    }
    try {
      const objectPathWithAcl = await objectStorageService.trySetObjectEntityAclPolicy(
        objectPath,
        { owner: String(req.userId), visibility: "private" },
      );
      res.json({ objectPath: objectPathWithAcl });
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      console.error("[storage] Error finalizing upload", error);
      res.status(500).json({ error: "Failed to finalize upload" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req, res) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("[storage] Error serving public object", error);
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 *
 * Task #734 — locked down to the founder who uploaded the file.
 * Requires a valid Bearer token (authMiddleware), and then asks the
 * ACL framework whether the requesting user has READ permission. As
 * a defense-in-depth fallback, the path-encoded planned owner from
 * `request-url` must also match the requesting user when no ACL
 * policy has been written yet (e.g. legacy files uploaded but never
 * finalized).
 */
router.get(
  "/storage/objects/*path",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

      const userIdStr = String(req.userId);

      const canAccess = await objectStorageService.canAccessObjectEntity({
        userId: userIdStr,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });

      // Defense in depth: when no ACL has been written yet, fall back
      // to the planned-owner segment encoded in the object name at
      // request-url time. This keeps the route safe even if a client
      // forgets to call /storage/uploads/finalize.
      const plannedOwner = objectStorageService.parseOwnerUserIdFromObjectPath(objectPath);
      const plannedOwnerMatches = plannedOwner !== undefined && plannedOwner === userIdStr;

      if (!canAccess && !plannedOwnerMatches) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const response = await objectStorageService.downloadObject(objectFile);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        console.warn("[storage] Object not found", error);
        res.status(404).json({ error: "Object not found" });
        return;
      }
      console.error("[storage] Error serving object", error);
      res.status(500).json({ error: "Failed to serve object" });
    }
  },
);

/**
 * GET /storage/evidence-thumbnail/objects/*
 *
 * Task #839 — return a small PNG/JPEG thumbnail for an evidence file
 * stored in App Storage so the wizard's Review-step rollup (and other
 * in-app surfaces showing the assumption-confidence rollup) can render
 * the same first-page preview that the lender / board PDFs embed —
 * without shipping mupdf-wasm to the browser. Behaviour:
 *
 *   - Auth + ACL identical to /storage/objects/*  — only the founder
 *     who uploaded the file can fetch its thumbnail.
 *   - PNG / JPEG: pass the original bytes through with their Content-Type.
 *   - PDF: rasterize the first page server-side via the shared
 *     `rasterizePdfFirstPage` helper (mupdf-wasm) and return PNG bytes.
 *   - Anything else (DOCX / XLSX / GIF / WEBP / HEIC / oversize): 415 so
 *     the UI degrades to the per-file-type indicator badge.
 *
 * The per-file size cap mirrors the lender appendix's
 * `EVIDENCE_INLINE_PREVIEW_MAX_BYTES` so the wizard preview tells the
 * founder exactly which files will preview inline in the export.
 */
router.get(
  "/storage/evidence-thumbnail/objects/*path",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const raw = req.params.path;
      const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
      const objectPath = `/objects/${wildcardPath}`;
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

      const userIdStr = String(req.userId);

      const canAccess = await objectStorageService.canAccessObjectEntity({
        userId: userIdStr,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      const plannedOwner = objectStorageService.parseOwnerUserIdFromObjectPath(objectPath);
      const plannedOwnerMatches = plannedOwner !== undefined && plannedOwner === userIdStr;
      if (!canAccess && !plannedOwnerMatches) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const [meta] = await objectFile.getMetadata();
      const sourceContentType =
        (meta as { contentType?: string } | undefined)?.contentType ?? "";
      const sourceSize = Number(
        (meta as { size?: number | string } | undefined)?.size ?? 0,
      );

      // Use the shared classifier so this endpoint and the wizard's
      // attachments-preview surface (and the PDF appendix renderer)
      // never disagree about which files preview inline.
      const klass = classifyEvidenceFileEmbed({
        mimeType: sourceContentType,
        name: objectPath,
        size: Number.isFinite(sourceSize) ? sourceSize : undefined,
      });
      const lower = sourceContentType.toLowerCase();
      const isImage = lower === "image/png" || lower === "image/jpeg" || lower === "image/jpg";
      const isPdf = lower === "application/pdf";

      if (!isImage && !isPdf) {
        res.status(415).json({ error: "Thumbnail not available for this file type" });
        return;
      }
      if (klass.disposition === "too_large") {
        res.status(413).json({ error: "File exceeds the inline-preview size cap" });
        return;
      }

      const [bytes] = await objectFile.download();
      if (!bytes || bytes.length === 0) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      // Belt-and-braces: re-check the actual byte length against the
      // per-file cap in case the Cloud Storage metadata under-reported
      // the size (e.g. legacy uploads predating finalize).
      if (bytes.length > EVIDENCE_INLINE_PREVIEW_MAX_BYTES) {
        res.status(413).json({ error: "File exceeds the inline-preview size cap" });
        return;
      }

      // Caching: thumbnails are derived from immutable App Storage
      // objects, so the founder's browser can hold onto them for the
      // life of the session without coordination. Private so the
      // shared CDN never reuses one founder's bytes for another.
      res.setHeader("Cache-Control", "private, max-age=3600");

      if (isImage) {
        res.setHeader("Content-Type", lower === "image/jpg" ? "image/jpeg" : lower);
        res.status(200).send(bytes);
        return;
      }

      // PDF — rasterize first page to PNG. Failures (encrypted /
      // malformed) fall back to a 415 so the UI shows the file-type
      // badge instead of a broken image.
      const png = await rasterizePdfFirstPage(bytes);
      if (!png || png.length === 0) {
        res.status(415).json({ error: "Could not rasterize PDF first page" });
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.status(200).send(png);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      console.error("[storage] Error generating evidence thumbnail", error);
      res.status(500).json({ error: "Failed to generate thumbnail" });
    }
  },
);

export default router;
