import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const DRIZZLE_DIR = path.join(REPO_ROOT, "lib", "db", "drizzle");
export const OPERATIONS_DIR = path.join(DRIZZLE_DIR, "operations");
export const JOURNAL_PATH = path.join(DRIZZLE_DIR, "meta", "_journal.json");

export const SIBLING_FILES = ["meta.json", "rollback.sql", "affected-records.sql"] as const;

export type SiblingFile = (typeof SIBLING_FILES)[number];

export interface MigrationMeta {
  tag: string;
  file: string;
  task?: string;
  what: string;
  affectedRecords: string;
  approach: string;
  rollback: string;
  window: string;
  appliedToProduction: boolean;
}

export interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
  version: string;
  breakpoints: boolean;
}

export interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

export function readJournal(): Journal {
  const raw = fs.readFileSync(JOURNAL_PATH, "utf8");
  return JSON.parse(raw) as Journal;
}

export function operationDirFor(tag: string): string {
  return path.join(OPERATIONS_DIR, tag);
}

export function missingSiblings(tag: string): SiblingFile[] {
  const dir = operationDirFor(tag);
  if (!fs.existsSync(dir)) {
    return [...SIBLING_FILES];
  }
  return SIBLING_FILES.filter((f) => !fs.existsSync(path.join(dir, f)));
}

export function readMeta(tag: string): MigrationMeta {
  const metaPath = path.join(operationDirFor(tag), "meta.json");
  const raw = fs.readFileSync(metaPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<MigrationMeta>;
  const required: (keyof MigrationMeta)[] = [
    "tag",
    "file",
    "what",
    "affectedRecords",
    "approach",
    "rollback",
    "window",
    "appliedToProduction",
  ];
  for (const key of required) {
    if (parsed[key] === undefined || parsed[key] === null) {
      throw new Error(`meta.json for ${tag} is missing required field "${key}"`);
    }
  }
  return parsed as MigrationMeta;
}

export function readAffectedSql(tag: string): string {
  return fs.readFileSync(path.join(operationDirFor(tag), "affected-records.sql"), "utf8");
}

export function listMigrationTags(): string[] {
  return readJournal().entries.map((e) => e.tag);
}
