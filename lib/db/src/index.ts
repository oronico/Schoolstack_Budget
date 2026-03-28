import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("WARNING: DATABASE_URL is not set. Database features will be unavailable.");
}

function getSslConfig(url: string): pg.PoolConfig["ssl"] {
  if (url.includes("localhost") || url.includes("127.0.0.1") || url.includes("/tmp/")) {
    return undefined;
  }
  return { rejectUnauthorized: false };
}

export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: getSslConfig(databaseUrl),
    })
  : (null as unknown as pg.Pool);

export const db = databaseUrl
  ? drizzle(pool, { schema })
  : (null as unknown as ReturnType<typeof drizzle>);

export * from "./schema";
