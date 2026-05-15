import { type Request, type RequestHandler, type Response } from "express";
import { pool } from "@workspace/db";
import { getMigrationError, getMigrationStatus } from "./server-state";
import { summarizeRetiredKekUsage } from "./sensitive-encryption.js";

export type DbStatus = "not_configured" | "connected" | "unreachable";

export async function defaultCheckDb(): Promise<DbStatus> {
  try {
    if (!pool) return "not_configured";
    await pool.query("SELECT 1");
    return "connected";
  } catch {
    return "unreachable";
  }
}

// Operator-facing snapshot of "are any rows still wrapped under a
// retired KEK?". Surfaced in the deep health endpoint so an operator
// reviewing rotation progress can see — at a glance — whether
// `SENSITIVE_ENCRYPTION_KEY_PREVIOUS` is still load-bearing.
//
// Shape variants:
//   - `{ rowsOnRetiredKek, retiredKekIds }` — happy path. When
//     `rowsOnRetiredKek === 0` the previous-KEK env var can be safely
//     removed.
//   - `{ status: "not_configured" }` — no DB pool at all (CI / local
//     without a database).
//   - `{ status: "unavailable", error }` — the DB query failed (e.g.
//     transient outage). Surfaced rather than swallowed so operators
//     don't see "0 rows" and assume rotation is done when really we
//     just couldn't check.
export type EncryptionStatus =
  | { status: "ok"; rowsOnRetiredKek: number; retiredKekIds: string[] }
  | { status: "not_configured" }
  | { status: "unavailable"; error: string };

export async function defaultCheckEncryption(): Promise<EncryptionStatus> {
  if (!pool) return { status: "not_configured" };
  try {
    const refs: Array<string | null> = [];
    const borrower = await pool.query<{ ein_encrypted_ref: string | null }>(
      "SELECT ein_encrypted_ref FROM borrower_entities WHERE ein_encrypted_ref IS NOT NULL",
    );
    for (const row of borrower.rows) refs.push(row.ein_encrypted_ref);
    const founder = await pool.query<{ ssn_encrypted_ref: string | null }>(
      "SELECT ssn_encrypted_ref FROM founder_profiles WHERE ssn_encrypted_ref IS NOT NULL",
    );
    for (const row of founder.rows) refs.push(row.ssn_encrypted_ref);
    const summary = summarizeRetiredKekUsage(refs);
    return {
      status: "ok",
      rowsOnRetiredKek: summary.rowsOnRetiredKek,
      retiredKekIds: summary.retiredKekIds,
    };
  } catch (err) {
    return { status: "unavailable", error: (err as Error).message };
  }
}

export interface HealthHandlerOptions {
  // When true, the handler runs a live `SELECT 1` against the pool and adds
  // a `db` field to the response. Off for the lightweight platform-probe
  // paths so probes don't pay the cost of a DB query on every tick.
  includeDb: boolean;
  // Override the DB check, primarily for tests that want to pin down the
  // response shape across all three DbStatus values without depending on a
  // real Postgres connection.
  checkDb?: () => Promise<DbStatus>;
  // Override the retired-KEK check. Only invoked when `includeDb` is true
  // — the cheap probe paths skip this for the same reason they skip the
  // DB ping (it walks every borrower / founder row).
  checkEncryption?: () => Promise<EncryptionStatus>;
}

export function createHealthHandler(options: HealthHandlerOptions): RequestHandler {
  const dbCheck = options.checkDb ?? defaultCheckDb;
  const encryptionCheck = options.checkEncryption ?? defaultCheckEncryption;
  return async (_req: Request, res: Response): Promise<void> => {
    const migrations = getMigrationStatus();
    const db = options.includeDb ? await dbCheck() : undefined;
    const encryption = options.includeDb ? await encryptionCheck() : undefined;

    if (migrations === "failed") {
      const body: Record<string, unknown> = {
        status: "degraded",
        migrations: "failed",
        error: getMigrationError(),
      };
      if (options.includeDb) {
        body.db = db;
        body.encryption = encryption;
      }
      res.status(503).json(body);
      return;
    }

    const body: Record<string, unknown> = { status: "ok", migrations };
    if (options.includeDb) {
      body.db = db;
      body.encryption = encryption;
    }
    res.json(body);
  };
}

// The lightweight migration-only handler used by the platform probe paths
// (`/health` and `/healthz`). Kept cheap so probes don't hit the DB on every
// tick.
export const respondHealth: RequestHandler = createHealthHandler({ includeDb: false });

// The richer handler exposed under `/api/health*` for operators. Adds a live
// `SELECT 1` against the pool so a transient DB outage is visible even when
// startup migrations completed cleanly.
export const respondHealthWithDb: RequestHandler = createHealthHandler({ includeDb: true });
