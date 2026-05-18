#!/usr/bin/env tsx
/**
 * Lint guard: every Drizzle migration in lib/db/drizzle/ must ship with a
 * sibling operations/<tag>/{meta.json, rollback.sql, affected-records.sql}
 * triplet. Run in CI to fail any PR that introduces a schema change without
 * its rollback + affected-records contract.
 */
import { listMigrationTags, missingSiblings, readMeta } from "./schema-change-lib.js";

function main(): number {
  const tags = listMigrationTags();
  const failures: string[] = [];

  for (const tag of tags) {
    const missing = missingSiblings(tag);
    if (missing.length > 0) {
      failures.push(
        `  - ${tag}: missing ${missing.map((f) => `operations/${tag}/${f}`).join(", ")}`,
      );
      continue;
    }
    try {
      readMeta(tag);
    } catch (err) {
      failures.push(`  - ${tag}: ${(err as Error).message}`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(
      [
        "Schema-change lint failed. Every Drizzle migration must ship with",
        "its rollback and affected-records siblings (see",
        "docs/operations/schema-change-checklist.md):",
        "",
        ...failures,
        "",
        "Scaffold the missing files with:",
        "  pnpm --filter @workspace/scripts run schema-change:new",
        "",
      ].join("\n"),
    );
    return 1;
  }

  process.stdout.write(`schema-change lint: ${tags.length} migration(s) OK\n`);
  return 0;
}

process.exit(main());
