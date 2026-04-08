import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("WARNING: DATABASE_URL is not set. Database features will be unavailable.");
}

const STATEMENT_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 10_000;

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

export * from "./schema";
