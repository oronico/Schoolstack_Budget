import { pool, runMigrations } from "@workspace/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "[migrate] FATAL: DATABASE_URL is not set — refusing to start the API against an unmigrated database.",
    );
    process.exit(1);
  }

  console.log("[migrate] Running database migrations...");
  try {
    await runMigrations();
    console.log("[migrate] Schema up to date.");
  } catch (err) {
    console.error("[migrate] FAILED:", err);
    if (pool) {
      await pool.end().catch(() => {});
    }
    process.exit(1);
  }

  if (pool) {
    await pool.end().catch(() => {});
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] Unexpected error:", err);
  process.exit(1);
});
