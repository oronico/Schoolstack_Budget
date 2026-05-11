// Task #736 — Sweeper for orphaned evidence uploads in App Storage.
//
// Evidence files attached to a financial model live in App Storage at
// `<PRIVATE_OBJECT_DIR>/uploads/<uuid>` and are referenced from
// `financial_models.data.assumptionConfidence[*].evidenceFiles[*].objectPath`
// as `/objects/<uuid>`. Founders can detach a file or delete a model
// without us noticing — historically those bytes just stayed in the
// bucket forever. The PUT/DELETE handlers in `routes/models.ts` now
// clean up inline going forward; this script catches the historical
// backlog plus anything that slipped past a failed inline delete.
//
// Usage (CLI):
//   pnpm --filter @workspace/api-server run cleanup:orphan-uploads          (dry run)
//   pnpm --filter @workspace/api-server run cleanup:orphan-uploads -- --execute
//
// Default mode is dry-run: it prints what *would* be deleted but does
// not touch the bucket. Pass `--execute` (or `--no-dry-run`) to
// actually delete the orphans. The script always logs the full list
// of candidate orphans before deleting any of them.
//
// Task #757 — the same logic is also called on a recurring schedule
// from `src/index.ts` (see `runOrphanUploadsCleanup`). Whenever the
// in-process scheduler runs, it emits a single tagged summary line
// (`[orphan-uploads-summary] {...}`) into the deployment logs so an
// operator can grep production logs to confirm the sweeper is healthy.
//
// Task #758 — the pure helpers `extractEvidenceObjectPaths` and
// `identifyOrphanObjectPaths` are exported so unit tests can exercise
// the sweeper's identify-orphans rule without standing up GCS or
// Postgres.

import { db } from "@workspace/db";
import { financialModelsTable } from "@workspace/db/schema";
import { ObjectStorageService } from "../lib/objectStorage.js";

interface CliFlags {
  execute: boolean;
  limit: number;
}

function parseFlags(argv: string[]): CliFlags {
  const out: CliFlags = { execute: false, limit: Number.POSITIVE_INFINITY };
  for (const arg of argv.slice(2)) {
    if (arg === "--execute" || arg === "--no-dry-run") {
      out.execute = true;
    } else if (arg === "--dry-run") {
      out.execute = false;
    } else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: cleanup-orphan-uploads [--execute] [--limit=N]\n" +
          "  --execute   Actually delete orphan objects (default: dry-run)\n" +
          "  --limit=N   Only process the first N orphan candidates\n",
      );
      process.exit(0);
    }
  }
  return out;
}

export function extractEvidenceObjectPaths(data: unknown): string[] {
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

/**
 * Task #758 — pure diff helper extracted so the unit test can exercise
 * the sweeper's identify-orphans rule against a fake bucket listing
 * + a fake referenced-paths set without standing up GCS or Postgres.
 *
 * An object in the bucket counts as an orphan iff no model row
 * references its `/objects/<id>` path. The set comparison is exact
 * (no normalization) so callers must pass the same shape the script
 * itself uses (`/objects/uploads/<owner>/<uuid>`).
 */
export function identifyOrphanObjectPaths(
  inBucket: Iterable<string>,
  referenced: ReadonlySet<string> | Iterable<string>,
): string[] {
  const refSet = referenced instanceof Set ? referenced : new Set(referenced);
  const orphans: string[] = [];
  for (const p of inBucket) {
    if (!refSet.has(p)) orphans.push(p);
  }
  return orphans;
}

export interface OrphanCleanupSummary {
  mode: "dry-run" | "execute";
  scannedModels: number;
  referencedPaths: number;
  bucketObjects: number;
  orphans: number;
  considered: number;
  deleted: number;
  failed: number;
  durationMs: number;
}

export interface OrphanCleanupOptions {
  execute?: boolean;
  limit?: number;
  /**
   * Logger used for human-readable progress lines. Defaults to `console.log`
   * for CLI use; the in-process scheduler injects a prefixed logger so the
   * lines are easy to find in deployment logs.
   */
  logger?: (msg: string) => void;
}

/**
 * Reusable entry point for the orphan-uploads sweeper. Returns a
 * structured summary so callers (CLI, scheduler, future tooling) can
 * decide what to do with the result. Never throws — failures bubble
 * up via the promise rejection.
 */
export async function runOrphanUploadsCleanup(
  options: OrphanCleanupOptions = {},
): Promise<OrphanCleanupSummary> {
  const execute = options.execute === true;
  const limit =
    options.limit !== undefined && Number.isFinite(options.limit) && options.limit > 0
      ? options.limit
      : Number.POSITIVE_INFINITY;
  const log = options.logger ?? ((msg: string) => console.log(msg));

  const startedAt = Date.now();
  const mode = execute ? "EXECUTE" : "DRY-RUN";
  log(`[cleanup-orphan-uploads] mode=${mode}`);

  const storage = new ObjectStorageService();

  // 1. Collect every objectPath any model row references today.
  log("[cleanup-orphan-uploads] loading referenced objectPaths from financial_models…");
  const rows = await db
    .select({ id: financialModelsTable.id, data: financialModelsTable.data })
    .from(financialModelsTable);
  const referenced = new Set<string>();
  for (const row of rows) {
    for (const p of extractEvidenceObjectPaths(row.data)) referenced.add(p);
  }
  log(
    `[cleanup-orphan-uploads] scanned ${rows.length} models, ${referenced.size} referenced objectPaths`,
  );

  // 2. List every uploads/* object that actually exists in the bucket.
  log("[cleanup-orphan-uploads] listing uploads/* in App Storage…");
  const inBucket = await storage.listUploadObjectPaths();
  log(`[cleanup-orphan-uploads] bucket holds ${inBucket.length} uploads/* objects`);

  // 3. Diff: anything in the bucket that no model references is an orphan.
  const orphans = identifyOrphanObjectPaths(inBucket, referenced);
  log(`[cleanup-orphan-uploads] identified ${orphans.length} orphan object(s)`);

  const slice = orphans.slice(
    0,
    Number.isFinite(limit) ? limit : orphans.length,
  );
  for (const p of slice) {
    log(`  ${execute ? "DELETE" : "would delete"}  ${p}`);
  }
  if (slice.length < orphans.length) {
    log(
      `  …and ${orphans.length - slice.length} more (raise limit to include them)`,
    );
  }

  let deleted = 0;
  let failed = 0;
  if (!execute) {
    log("[cleanup-orphan-uploads] dry-run complete — no objects deleted.");
  } else {
    for (const p of slice) {
      const ok = await storage.deleteObjectEntity(p);
      if (ok) deleted++;
      else failed++;
    }
    log(
      `[cleanup-orphan-uploads] done — deleted=${deleted} failed=${failed} of ${slice.length} candidate(s)`,
    );
  }

  return {
    mode: execute ? "execute" : "dry-run",
    scannedModels: rows.length,
    referencedPaths: referenced.size,
    bucketObjects: inBucket.length,
    orphans: orphans.length,
    considered: slice.length,
    deleted,
    failed,
    durationMs: Date.now() - startedAt,
  };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  await runOrphanUploadsCleanup({ execute: flags.execute, limit: flags.limit });
}

// Task #758 — only auto-run when invoked directly (e.g. via the
// `cleanup:orphan-uploads` pnpm script). Tests import this module to
// exercise `extractEvidenceObjectPaths` / `identifyOrphanObjectPaths`
// in isolation and must not trigger a real bucket sweep on import.
// Task #757's scheduler also imports `runOrphanUploadsCleanup` from
// `src/index.ts` and similarly relies on this guard.
const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const metaUrl =
      typeof import.meta !== "undefined" && import.meta && typeof import.meta.url === "string"
        ? import.meta.url
        : undefined;
    if (!metaUrl) return false;
    const url = new URL(`file://${entry}`).href;
    return metaUrl === url || metaUrl.endsWith(entry);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[cleanup-orphan-uploads] fatal error:", err);
      process.exit(1);
    });
}
