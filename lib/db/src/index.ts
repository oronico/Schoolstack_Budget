import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema";

const { Pool } = pg;

// Resolve the SQL migrations folder. We probe a small list of candidate paths
// so the same code works in dev (tsx) and in the esbuild-bundled prod build.
//   - dev: this file is at <repo>/lib/db/src/index.ts; ../drizzle is the
//     migrations folder.
//   - prod: build.ts copies lib/db/drizzle next to the bundled CJS file at
//     <repo>/artifacts/api-server/dist/drizzle.
function resolveMigrationsFolder(): string {
  // Builders may inject an absolute path via `process.env.DRIZZLE_MIGRATIONS_DIR`
  // (the api-server build sets this so the bundled CJS finds the migrations
  // copied next to it). Otherwise we probe candidate locations relative to this
  // source file (dev/tsx) and the working directory.
  const candidates: string[] = [];
  if (process.env.DRIZZLE_MIGRATIONS_DIR) {
    candidates.push(process.env.DRIZZLE_MIGRATIONS_DIR);
  }
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.resolve(here, "..", "drizzle"));
    candidates.push(path.resolve(here, "drizzle"));
  } catch {
    // import.meta.url may be undefined under bundlers that polyfill CJS; ignore
    // and rely on the cwd-based fallbacks below.
  }
  candidates.push(path.resolve(process.cwd(), "lib", "db", "drizzle"));
  candidates.push(path.resolve(process.cwd(), "drizzle"));
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "meta", "_journal.json"))) {
      return candidate;
    }
  }
  // Fall back to the first candidate so the eventual migrate() call surfaces
  // a clear error pointing at a real location.
  return candidates[0] ?? path.resolve(process.cwd(), "lib", "db", "drizzle");
}

export const MIGRATIONS_FOLDER = resolveMigrationsFolder();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("WARNING: DATABASE_URL is not set. Database features will be unavailable.");
}

const STATEMENT_TIMEOUT_MS = 120_000;
const IDLE_TIMEOUT_MS = 30_000;

export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("railway.app") || databaseUrl.includes("rlwy.net") || databaseUrl.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : undefined,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      query_timeout: STATEMENT_TIMEOUT_MS,
      idle_in_transaction_session_timeout: IDLE_TIMEOUT_MS,
    })
  : (null as unknown as pg.Pool);

export const db = databaseUrl
  ? drizzle(pool, { schema })
  : (null as unknown as ReturnType<typeof drizzle>);

export async function runMigrations(): Promise<void> {
  if (!db) {
    console.warn("[migrations] Skipping: DATABASE_URL is not configured.");
    return;
  }
  await drizzleMigrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

export * from "./schema";
