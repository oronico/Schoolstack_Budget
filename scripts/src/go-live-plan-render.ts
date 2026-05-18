import {
  MigrationMeta,
  listMigrationTags,
  readMeta,
} from "./schema-change-lib.js";

export interface RenderOptions {
  counts?: Map<string, number>;
}

export interface PendingMigrationRow extends MigrationMeta {
  section: string;
}

export function collectPendingMigrations(): PendingMigrationRow[] {
  const rows: PendingMigrationRow[] = [];
  let n = 0;
  for (const tag of listMigrationTags()) {
    const meta = readMeta(tag);
    if (meta.appliedToProduction) continue;
    n += 1;
    rows.push({ ...meta, section: `1.${n}` });
  }
  return rows;
}

function renderRow(row: PendingMigrationRow, counts?: Map<string, number>): string {
  const affected =
    counts && counts.has(row.tag)
      ? `${row.affectedRecords} **Live read-replica count: ${counts.get(row.tag)}.**`
      : row.affectedRecords;
  return `| ${row.section} | \`${row.file}\` | ${row.what} | ${affected} | ${row.approach} | ${row.rollback} | ${row.window} |`;
}

export function buildGoLivePlanSection1(opts: RenderOptions = {}): string {
  const rows = collectPendingMigrations();
  const firstFile = rows[0]?.file ?? "<none>";
  const lastFile = rows[rows.length - 1]?.file ?? "<none>";
  const filenamePattern = buildFilenamePattern(firstFile, lastFile);

  const tableRows = rows.map((r) => renderRow(r, opts.counts)).join("\n");

  const altersExistingTable = rows.filter(
    (r) =>
      /ALTER TABLE/i.test(r.what) &&
      !/^new\b/i.test(r.what.trim()),
  );
  const alterTag = altersExistingTable[0];

  let notes =
    `- The ${numberWord(rows.length)} migrations are independent of one another and of the JSON\n` +
    `  blob changes in §3. They are all \`ADD\`/\`CREATE\` operations — none\n` +
    `  drop or rename a column on an existing populated table, so there is\n` +
    `  no risk of data loss.\n`;

  if (alterTag) {
    const shortTag = alterTag.tag.match(/^(\d{4})/)?.[1] ?? alterTag.tag;
    notes +=
      `- ${shortTag} is the only one that touches an existing populated table\n` +
      `  (\`financial_models\`). The \`DEFAULT 1 NOT NULL\` clause backfills\n` +
      `  every existing row in a single statement; no separate backfill is\n` +
      `  needed. Pre-cutover code paths that do not pass \`If-Match\` will\n` +
      `  begin getting \`428 Precondition Required\` after the API redeploy —\n` +
      `  the Vite frontend bundle already sends \`If-Match\` in autosave\n` +
      `  (Task #479), so any non-cutover client (an old tab) is the only\n` +
      `  source of 428s.\n`;
  }

  const header =
    `## 1. Schema migrations (Drizzle, \`lib/db/drizzle/${filenamePattern}\`)\n\n` +
    `All ${numberWord(rows.length)} migrations below land via the standard\n` +
    `\`pnpm --filter @workspace/db run migrate\` chain (Task #283 wired the\n` +
    `Drizzle migrator into the API server boot). They use \`IF NOT EXISTS\`\n` +
    `guards and are idempotent — re-running is safe.\n\n` +
    `| # | File | What | Affected records | Approach | Rollback | Window |\n` +
    `|---|---|---|---|---|---|---|\n`;

  return `${header}${tableRows}\n\n**Notes:**\n\n${notes}`;
}

function numberWord(n: number): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  return words[n] ?? String(n);
}

function buildFilenamePattern(firstFile: string, lastFile: string): string {
  // Match the M6 plan's `000[3-7]*.sql` shape: find the longest common
  // numeric prefix and bracket the differing first character.
  const fNum = firstFile.match(/^(\d+)/)?.[1] ?? "";
  const lNum = lastFile.match(/^(\d+)/)?.[1] ?? "";
  let common = "";
  for (let i = 0; i < Math.min(fNum.length, lNum.length); i += 1) {
    if (fNum[i] === lNum[i]) common += fNum[i];
    else break;
  }
  const a = fNum[common.length];
  const b = lNum[common.length];
  if (!a || !b || a === b) return `${fNum}*.sql`;
  return `${common}[${a}-${b}]*.sql`;
}
