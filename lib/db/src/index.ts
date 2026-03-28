import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("WARNING: DATABASE_URL is not set. Database features will be unavailable.");
}

function getSslConfig(url: string): pg.PoolConfig["ssl"] {
  if (url.includes("sslmode=require") || url.includes("sslmode=verify")) {
    return { rejectUnauthorized: false };
  }
  const knownSslHosts = ["railway.app", "rlwy.net", "neon.tech", "supabase.co", "amazonaws.com"];
  if (knownSslHosts.some((h) => url.includes(h))) {
    return { rejectUnauthorized: false };
  }
  return undefined;
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
