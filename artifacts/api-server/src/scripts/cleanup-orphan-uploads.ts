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
// Usage:
//   pnpm --filter @workspace/api-server run cleanup:orphan-uploads          (dry run)
//   pnpm --filter @workspace/api-server run cleanup:orphan-uploads -- --execute
//
// Default mode is dry-run: it prints what *would* be deleted but does
// not touch the bucket. Pass `--execute` (or `--no-dry-run`) to
// actually delete the orphans. The script always logs the full list
// of candidate orphans before deleting any of them.

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

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  const mode = flags.execute ? "EXECUTE" : "DRY-RUN";
  console.log(`[cleanup-orphan-uploads] mode=${mode}`);

  const storage = new ObjectStorageService();

  // 1. Collect every objectPath any model row references today.
  console.log("[cleanup-orphan-uploads] loading referenced objectPaths from financial_models…");
  const rows = await db
    .select({ id: financialModelsTable.id, data: financialModelsTable.data })
    .from(financialModelsTable);
  const referenced = new Set<string>();
  for (const row of rows) {
    for (const p of extractEvidenceObjectPaths(row.data)) referenced.add(p);
  }
  console.log(
    `[cleanup-orphan-uploads] scanned ${rows.length} models, ${referenced.size} referenced objectPaths`,
  );

  // 2. List every uploads/* object that actually exists in the bucket.
  console.log("[cleanup-orphan-uploads] listing uploads/* in App Storage…");
  const inBucket = await storage.listUploadObjectPaths();
  console.log(`[cleanup-orphan-uploads] bucket holds ${inBucket.length} uploads/* objects`);

  // 3. Diff: anything in the bucket that no model references is an orphan.
  const orphans: string[] = [];
  for (const p of inBucket) {
    if (!referenced.has(p)) orphans.push(p);
  }
  console.log(`[cleanup-orphan-uploads] identified ${orphans.length} orphan object(s)`);

  const slice = orphans.slice(
    0,
    Number.isFinite(flags.limit) ? flags.limit : orphans.length,
  );
  for (const p of slice) {
    console.log(`  ${flags.execute ? "DELETE" : "would delete"}  ${p}`);
  }
  if (slice.length < orphans.length) {
    console.log(
      `  …and ${orphans.length - slice.length} more (raise --limit to include them)`,
    );
  }

  // 4. In dry-run mode, stop here. In execute mode, delete one-by-one.
  if (!flags.execute) {
    console.log("[cleanup-orphan-uploads] dry-run complete — no objects deleted.");
    console.log("[cleanup-orphan-uploads] re-run with --execute to actually delete.");
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const p of slice) {
    const ok = await storage.deleteObjectEntity(p);
    if (ok) deleted++;
    else failed++;
  }
  console.log(
    `[cleanup-orphan-uploads] done — deleted=${deleted} failed=${failed} of ${slice.length} candidate(s)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[cleanup-orphan-uploads] fatal error:", err);
    process.exit(1);
  });
