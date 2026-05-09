/**
 * Task #729 — One-time migration that lifts inline-base64 evidence files
 * out of `financial_models.data.assumptionConfidence[*].evidenceFiles[]`
 * into App Storage, replacing each `dataBase64` field with an
 * `objectPath` reference.
 *
 * Older models (Task #707) stored uploaded evidence as base64 strings
 * inline in the model JSON, which bloats every read/write of the row.
 * Newer uploads (Task #714) go directly to App Storage. This script
 * normalises the older rows so we can delete the back-compat readers.
 *
 * Idempotent:
 *   - rows with no `dataBase64` payloads are skipped silently
 *   - files that already carry an `objectPath` have their inline
 *     duplicate dropped without re-uploading
 *   - upload failures for an individual file leave that file untouched
 *     and the script continues; the row is only updated if at least one
 *     file was successfully migrated
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run migrate:inline-evidence
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, pool, financialModelsTable } from "@workspace/db";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

interface InlineFile {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: string;
  dataBase64?: string;
  objectPath?: string;
}

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set. Configure App Storage in the Replit Object Storage tool first.",
    );
  }
  return dir;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const p = path.startsWith("/") ? path : `/${path}`;
  const parts = p.split("/");
  if (parts.length < 3) {
    throw new Error(`Invalid object path: ${path}`);
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function signPutUrl(bucketName: string, objectName: string): Promise<string> {
  const res = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + 900 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to sign upload URL (${res.status}). Are you running on Replit?`);
  }
  const { signed_url } = (await res.json()) as { signed_url: string };
  return signed_url;
}

function normalizeUploadUrlToObjectPath(uploadUrl: string): string {
  // Mirrors ObjectStorageService.normalizeObjectEntityPath in api-server.
  if (!uploadUrl.startsWith("https://storage.googleapis.com/")) {
    return uploadUrl;
  }
  const url = new URL(uploadUrl);
  const rawObjectPath = url.pathname;
  let entityDir = getPrivateObjectDir();
  if (!entityDir.endsWith("/")) entityDir = `${entityDir}/`;
  if (!rawObjectPath.startsWith(entityDir)) {
    return rawObjectPath;
  }
  const entityId = rawObjectPath.slice(entityDir.length);
  return `/objects/${entityId}`;
}

async function uploadBytes(bytes: Buffer, mime: string): Promise<string> {
  const privateDir = getPrivateObjectDir();
  const objectId = randomUUID();
  const fullPath = `${privateDir}/uploads/${objectId}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const uploadUrl = await signPutUrl(bucketName, objectName);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime || "application/octet-stream" },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`PUT failed (${res.status})`);
  }
  return normalizeUploadUrlToObjectPath(uploadUrl);
}

async function migrateOne(file: InlineFile): Promise<"uploaded" | "stripped" | "noop" | "error"> {
  if (!file || typeof file !== "object") return "noop";
  if (!file.dataBase64) return "noop";

  if (file.objectPath) {
    // File already lives in App Storage — just drop the redundant inline copy.
    delete file.dataBase64;
    return "stripped";
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(file.dataBase64, "base64");
  } catch {
    console.error(`  ! could not decode base64 for "${file.name ?? "(unnamed)"}"; leaving as-is`);
    return "error";
  }
  if (bytes.byteLength === 0) {
    delete file.dataBase64;
    return "stripped";
  }

  try {
    const objectPath = await uploadBytes(bytes, file.mimeType || "application/octet-stream");
    file.objectPath = objectPath;
    delete file.dataBase64;
    return "uploaded";
  } catch (err) {
    console.error(`  ! upload failed for "${file.name ?? "(unnamed)"}":`, err);
    return "error";
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[migrate-inline-evidence] DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!db) {
    console.error("[migrate-inline-evidence] DB client unavailable.");
    process.exit(1);
  }

  const rows = await db.select().from(financialModelsTable);
  console.log(`[migrate-inline-evidence] Scanning ${rows.length} model row(s)…`);

  let updatedRows = 0;
  let uploadedFiles = 0;
  let strippedDuplicates = 0;
  let errors = 0;

  for (const row of rows) {
    const data = row.data as Record<string, unknown> | null | undefined;
    if (!data || typeof data !== "object") continue;
    const ac = (data as { assumptionConfidence?: unknown }).assumptionConfidence;
    if (!ac || typeof ac !== "object") continue;

    let mutated = false;
    for (const key of Object.keys(ac as Record<string, unknown>)) {
      const entry = (ac as Record<string, { evidenceFiles?: InlineFile[] } | undefined>)[key];
      const files = entry?.evidenceFiles;
      if (!Array.isArray(files) || files.length === 0) continue;
      for (const f of files) {
        const outcome = await migrateOne(f);
        if (outcome === "uploaded") {
          uploadedFiles++;
          mutated = true;
        } else if (outcome === "stripped") {
          strippedDuplicates++;
          mutated = true;
        } else if (outcome === "error") {
          errors++;
        }
      }
    }

    if (mutated) {
      await db
        .update(financialModelsTable)
        .set({ data })
        .where(eq(financialModelsTable.id, row.id));
      updatedRows++;
      console.log(`  ✓ model #${row.id} (${row.name})`);
    }
  }

  console.log(
    `[migrate-inline-evidence] Done. rows_updated=${updatedRows} files_uploaded=${uploadedFiles} duplicates_stripped=${strippedDuplicates} errors=${errors}`,
  );

  if (pool) {
    await pool.end().catch(() => {});
  }
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[migrate-inline-evidence] Crashed:", err);
  process.exit(1);
});
