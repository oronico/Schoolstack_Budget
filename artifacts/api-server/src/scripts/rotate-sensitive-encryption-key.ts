// Task #788 — Re-wrap every borrower-data row whose encrypted ref was
// produced by an older KEK so the new active KEK
// (`SENSITIVE_ENCRYPTION_KEY`) becomes the only key needed to read
// it.
//
// How rotation works in plain terms:
//   1. The operator generates a new 32-byte KEK and deploys it as
//      `SENSITIVE_ENCRYPTION_KEY`. The previous live key is moved to
//      `SENSITIVE_ENCRYPTION_KEY_PREVIOUS` (or appended to a JSON
//      array there if multiple older keys are still in flight).
//      Reads keep working immediately because `decryptSensitive`
//      tries every loaded KEK.
//   2. The operator runs this script. It walks every row that
//      carries an `*_encrypted_ref`, looks at the embedded `kekId`,
//      and — for any row whose `kekId` is not the active one —
//      decrypts with the matching previous KEK and re-encrypts with
//      the active KEK.
//   3. Once the script reports zero remaining rows on the old KEK,
//      the operator deletes `SENSITIVE_ENCRYPTION_KEY_PREVIOUS` from
//      the deployment environment and the old KEK is fully retired.
//
// Usage:
//   pnpm --filter @workspace/api-server run rotate:sensitive-encryption-key            (dry run)
//   pnpm --filter @workspace/api-server run rotate:sensitive-encryption-key -- --execute
//
// Default mode is dry-run: the script prints how many rows would be
// re-wrapped per table, without writing anything. Pass `--execute`
// (or `--no-dry-run`) to perform the updates. `--limit=N` caps the
// number of rows processed per table — useful for staged rollouts on
// very large tables.

import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  borrowerEntitiesTable,
  founderProfilesTable,
} from "@workspace/db/schema";
import {
  decryptSensitive,
  encryptSensitive,
  getActiveKekId,
  listLoadedKekIds,
  readKekIdFromRef,
} from "../lib/sensitive-encryption.js";

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
        "Usage: rotate-sensitive-encryption-key [--execute] [--limit=N]\n" +
          "  --execute   Actually re-wrap rows (default: dry-run)\n" +
          "  --limit=N   Only process the first N rows per table\n",
      );
      process.exit(0);
    }
  }
  return out;
}

export interface TableRotationSummary {
  table: string;
  scanned: number;
  alreadyOnActive: number;
  rewrapped: number;
  failed: number;
  failures: Array<{ id: number; error: string }>;
}

interface RotatableRow {
  id: number;
  encryptedRef: string | null;
  last4: string | null;
}

interface RotatableTableSpec {
  label: string;
  /** Fetch every row that has an encrypted ref (paged externally). */
  fetchAll: () => Promise<RotatableRow[]>;
  /** Persist a freshly re-wrapped (encryptedRef, last4) onto a row. */
  updateRow: (id: number, encryptedRef: string, last4: string) => Promise<void>;
}

async function rotateTable(
  spec: RotatableTableSpec,
  flags: CliFlags,
  activeKekId: string,
): Promise<TableRotationSummary> {
  const summary: TableRotationSummary = {
    table: spec.label,
    scanned: 0,
    alreadyOnActive: 0,
    rewrapped: 0,
    failed: 0,
    failures: [],
  };

  const rows = await spec.fetchAll();
  for (const row of rows) {
    if (summary.scanned >= flags.limit) break;
    summary.scanned++;
    const ref = row.encryptedRef;
    if (!ref) {
      // Row has a NULL encrypted_ref — nothing to rotate.
      continue;
    }
    let kekId: string;
    try {
      kekId = readKekIdFromRef(ref);
    } catch (err) {
      summary.failed++;
      summary.failures.push({ id: row.id, error: `unparseable ref: ${(err as Error).message}` });
      continue;
    }
    if (kekId === activeKekId) {
      summary.alreadyOnActive++;
      continue;
    }
    try {
      const plaintext = decryptSensitive(ref, {
        actorRole: "system",
        purpose: `rotate KEK ${kekId} -> ${activeKekId} on ${spec.label}#${row.id}`,
      });
      const reEncrypted = encryptSensitive(plaintext);
      if (flags.execute) {
        await spec.updateRow(row.id, reEncrypted.encryptedRef, reEncrypted.last4);
      }
      summary.rewrapped++;
    } catch (err) {
      summary.failed++;
      summary.failures.push({ id: row.id, error: (err as Error).message });
    }
  }
  return summary;
}

export async function runRotation(
  flags: CliFlags,
  database = db,
): Promise<{ activeKekId: string; loadedKekIds: string[]; results: TableRotationSummary[] }> {
  if (!database) {
    throw new Error("DATABASE_URL is not configured; cannot rotate encrypted refs.");
  }

  const activeKekId = getActiveKekId();
  const loadedKekIds = listLoadedKekIds();

  const specs: RotatableTableSpec[] = [
    {
      label: "borrower_entities",
      fetchAll: async () => {
        const rows = await database
          .select({
            id: borrowerEntitiesTable.id,
            encryptedRef: borrowerEntitiesTable.einEncryptedRef,
            last4: borrowerEntitiesTable.einLast4,
          })
          .from(borrowerEntitiesTable);
        return rows;
      },
      updateRow: async (id, encryptedRef, last4) => {
        await database
          .update(borrowerEntitiesTable)
          .set({ einEncryptedRef: encryptedRef, einLast4: last4, updatedAt: new Date() })
          .where(eq(borrowerEntitiesTable.id, id));
      },
    },
    {
      label: "founder_profiles",
      fetchAll: async () => {
        const rows = await database
          .select({
            id: founderProfilesTable.id,
            encryptedRef: founderProfilesTable.ssnEncryptedRef,
            last4: founderProfilesTable.ssnLast4,
          })
          .from(founderProfilesTable);
        return rows;
      },
      updateRow: async (id, encryptedRef, last4) => {
        await database
          .update(founderProfilesTable)
          .set({ ssnEncryptedRef: encryptedRef, ssnLast4: last4, updatedAt: new Date() })
          .where(eq(founderProfilesTable.id, id));
      },
    },
  ];

  const results: TableRotationSummary[] = [];
  for (const spec of specs) {
    results.push(await rotateTable(spec, flags, activeKekId));
  }
  return { activeKekId, loadedKekIds, results };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  console.log(
    `[rotate-sensitive-encryption-key] mode=${flags.execute ? "EXECUTE" : "dry-run"} limit=${
      Number.isFinite(flags.limit) ? flags.limit : "all"
    }`,
  );

  const { activeKekId, loadedKekIds, results } = await runRotation(flags);
  console.log(`[rotate-sensitive-encryption-key] active KEK id: ${activeKekId}`);
  console.log(`[rotate-sensitive-encryption-key] loaded KEK ids: [${loadedKekIds.join(", ")}]`);

  let totalRewrapped = 0;
  let totalFailed = 0;
  for (const r of results) {
    console.log(
      `  ${r.table}: scanned=${r.scanned} already_on_active=${r.alreadyOnActive} ` +
        `rewrapped=${r.rewrapped} failed=${r.failed}`,
    );
    if (r.failures.length > 0) {
      for (const f of r.failures) {
        console.error(`    FAIL ${r.table}#${f.id}: ${f.error}`);
      }
    }
    totalRewrapped += r.rewrapped;
    totalFailed += r.failed;
  }

  if (!flags.execute && totalRewrapped > 0) {
    console.log(
      `[rotate-sensitive-encryption-key] dry-run: ${totalRewrapped} rows would be re-wrapped. ` +
        `Re-run with --execute to apply.`,
    );
  } else if (flags.execute) {
    console.log(
      `[rotate-sensitive-encryption-key] re-wrapped ${totalRewrapped} rows. ` +
        `If failed=0 across every table you can now remove SENSITIVE_ENCRYPTION_KEY_PREVIOUS.`,
    );
  } else {
    console.log("[rotate-sensitive-encryption-key] nothing to do — every row is already on the active KEK.");
  }

  if (totalFailed > 0) process.exit(1);
}

const invokedDirectly = (() => {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    const url = new URL(`file://${entry}`).href;
    return import.meta.url === url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error("[rotate-sensitive-encryption-key] crashed:", err);
    process.exit(1);
  });
}
