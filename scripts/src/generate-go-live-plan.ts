#!/usr/bin/env tsx
/**
 * Read every Drizzle migration whose sibling meta.json is not marked
 * `appliedToProduction: true` and emit the §1 (schema migrations) section
 * of the go-live data migration plan as Markdown. Optionally runs each
 * affected-records.sql query against DATABASE_URL (intended to be a
 * prod read-replica) and inlines the resulting count next to the query.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run go-live:plan
 *   pnpm --filter @workspace/scripts run go-live:plan -- --with-counts
 */
import { buildGoLivePlanSection1 } from "./go-live-plan-render.js";

async function fetchCounts(): Promise<Map<string, number>> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "--with-counts requires DATABASE_URL to be set (point it at the prod read-replica).",
    );
  }
  const { Client } = await import("pg");
  const { listMigrationTags, readMeta, readAffectedSql } = await import(
    "./schema-change-lib.js"
  );
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const counts = new Map<string, number>();
  try {
    for (const tag of listMigrationTags()) {
      const meta = readMeta(tag);
      if (meta.appliedToProduction) continue;
      const sql = readAffectedSql(tag);
      const res = await client.query(sql);
      const row = res.rows[0] ?? {};
      const raw =
        (row as Record<string, unknown>).affected ?? Object.values(row as object)[0];
      const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
      counts.set(tag, Number.isFinite(n) ? n : 0);
    }
  } finally {
    await client.end();
  }
  return counts;
}

async function main(): Promise<void> {
  const withCounts = process.argv.includes("--with-counts");
  const counts = withCounts ? await fetchCounts() : undefined;
  const markdown = buildGoLivePlanSection1({ counts });
  process.stdout.write(markdown);
}

main().catch((err) => {
  process.stderr.write(`go-live plan generation failed: ${(err as Error).message}\n`);
  process.exit(1);
});
