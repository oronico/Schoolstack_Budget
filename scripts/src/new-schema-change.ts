#!/usr/bin/env tsx
/**
 * Scaffold the rollback + affected-records + meta sibling files for the
 * latest Drizzle migration that does not yet have them. Run this right
 * after `pnpm --filter @workspace/db run generate` so the new migration
 * lands as a complete schema-change unit.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run schema-change:new
 *   pnpm --filter @workspace/scripts run schema-change:new -- 0008_my_tag
 */
import fs from "node:fs";
import path from "node:path";
import {
  OPERATIONS_DIR,
  SIBLING_FILES,
  listMigrationTags,
  missingSiblings,
  operationDirFor,
} from "./schema-change-lib.js";

const TEMPLATES: Record<(typeof SIBLING_FILES)[number], (tag: string) => string> = {
  "meta.json": (tag) =>
    `${JSON.stringify(
      {
        tag,
        file: `${tag}.sql`,
        task: "#TODO — task id",
        what: "TODO: one-line description of the schema change.",
        affectedRecords:
          "TODO: human-readable scope, e.g. `All rows in <table>. Count: `SELECT count(*) FROM <table>;``.",
        approach: "`one-shot SQL` (Drizzle migrator).",
        rollback:
          "TODO: how to undo this change. Reference the rollback.sql sibling and explain any operator caveats.",
        window: "`inline` — Drizzle migrator runs on API boot before the server accepts traffic.",
        appliedToProduction: false,
      },
      null,
      2,
    )}\n`,
  "rollback.sql": (tag) =>
    `-- Rollback for ${tag}.\n-- TODO: invert every statement in ../../${tag}.sql.\n-- Use IF EXISTS / DROP CONSTRAINT IF EXISTS so re-running is safe.\n`,
  "affected-records.sql": (tag) =>
    `-- Affected-records query for ${tag}.\n-- TODO: SELECT count(*) over the rows this migration touches, so the\n-- go-live plan generator can size the blast radius against a read-replica.\nSELECT 0 AS affected;\n`,
};

function targetTag(): string {
  const explicit = process.argv[2];
  if (explicit) return explicit;
  const tags = listMigrationTags();
  for (const tag of [...tags].reverse()) {
    if (missingSiblings(tag).length > 0) {
      return tag;
    }
  }
  throw new Error(
    "Every migration already has its sibling files. Pass a tag explicitly if you want to re-scaffold.",
  );
}

function main(): void {
  const tag = targetTag();
  const dir = operationDirFor(tag);
  fs.mkdirSync(dir, { recursive: true });
  let created = 0;
  for (const file of SIBLING_FILES) {
    const dest = path.join(dir, file);
    if (fs.existsSync(dest)) continue;
    fs.writeFileSync(dest, TEMPLATES[file](tag), "utf8");
    created += 1;
  }
  const rel = path.relative(process.cwd(), dir) || dir;
  process.stdout.write(
    `Scaffolded ${created} sibling file(s) for ${tag} in ${rel}.\n` +
      `Fill in the TODOs, then run: pnpm --filter @workspace/scripts run schema-change:lint\n`,
  );
  // Make `created` referenceable for tooling that imports this file.
  void OPERATIONS_DIR;
}

main();
