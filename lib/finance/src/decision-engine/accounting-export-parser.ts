// Parser for an uploaded accounting export (e.g. a QuickBooks-style Profit
// & Loss CSV). Lives in @workspace/finance so the api-server, the wizard
// upload UI, and the suggestion engine all share a single source of truth
// for what we can pull out of the file.
//
// Scope is intentionally narrow: we extract the headline P&L totals
// (revenue, expenses, net income) since those are the figures the saved
// scenario actuals editor actually uses. Sub-category extraction (tuition
// vs. philanthropy, payroll vs. facility, etc.) is deferred until we have
// enough real-world fixtures to do it without false positives.

export interface AccountingExportTotals {
  totalRevenue?: number;
  totalExpenses?: number;
  netIncome?: number;
}

export interface ParsedAccountingExport {
  totals: AccountingExportTotals;
  // Founder-facing notes about anything we couldn't confidently extract
  // (e.g. "Couldn't find a Total Expenses row."). The upload UI shows these
  // inline so the founder knows whether to re-export with different
  // settings or supply the missing numbers manually.
  parseWarnings: string[];
  // Number of recognized rows we matched. Used by callers to distinguish
  // "we read the file but it had nothing useful" from "we read N totals".
  recognizedRowCount: number;
}

// 1 MB is a comfortable cap for a P&L CSV (typical files are under 10 KB).
// We refuse anything larger to avoid pathological parser inputs.
export const MAX_ACCOUNTING_EXPORT_BYTES = 1_000_000;

const REVENUE_LABEL_PATTERNS: RegExp[] = [
  /^total\s+(income|revenue|revenues)$/i,
  /^total\s+ordinary\s+(income|revenue)$/i,
  /^income$/i,
  /^revenue$/i,
];

const EXPENSE_LABEL_PATTERNS: RegExp[] = [
  /^total\s+expenses?$/i,
  /^total\s+operating\s+expenses?$/i,
  /^total\s+ordinary\s+expenses?$/i,
];

const NET_INCOME_LABEL_PATTERNS: RegExp[] = [
  /^net\s+(income|loss|ordinary\s+income)$/i,
  /^net\s+income\s*\(loss\)$/i,
  /^profit\s*\/?\s*loss$/i,
  /^net\s+profit$/i,
];

export function parseAccountingExportCsv(text: string): ParsedAccountingExport {
  if (!text || text.trim().length === 0) {
    return {
      totals: {},
      parseWarnings: ["The file appears to be empty."],
      recognizedRowCount: 0,
    };
  }
  if (text.length > MAX_ACCOUNTING_EXPORT_BYTES) {
    return {
      totals: {},
      parseWarnings: [
        `File is larger than ${Math.round(MAX_ACCOUNTING_EXPORT_BYTES / 1000)} KB. Trim it to a single P&L summary and re-upload.`,
      ],
      recognizedRowCount: 0,
    };
  }

  const rows = parseCsvRows(text);
  const totals: AccountingExportTotals = {};
  let recognizedRowCount = 0;

  for (const row of rows) {
    const label = (row[0] ?? "").trim();
    if (!label) continue;
    const value = pickRowValue(row);
    if (value === undefined) continue;

    if (totals.totalRevenue === undefined && REVENUE_LABEL_PATTERNS.some((p) => p.test(label))) {
      totals.totalRevenue = Math.round(value);
      recognizedRowCount += 1;
      continue;
    }
    if (totals.totalExpenses === undefined && EXPENSE_LABEL_PATTERNS.some((p) => p.test(label))) {
      totals.totalExpenses = Math.round(value);
      recognizedRowCount += 1;
      continue;
    }
    if (totals.netIncome === undefined && NET_INCOME_LABEL_PATTERNS.some((p) => p.test(label))) {
      totals.netIncome = Math.round(value);
      recognizedRowCount += 1;
      continue;
    }
  }

  // Derive net income when the export gave us both totals but no explicit
  // net row — saves the founder a manual subtraction.
  if (
    totals.netIncome === undefined &&
    totals.totalRevenue !== undefined &&
    totals.totalExpenses !== undefined
  ) {
    totals.netIncome = totals.totalRevenue - totals.totalExpenses;
  }

  const parseWarnings: string[] = [];
  if (totals.totalRevenue === undefined) {
    parseWarnings.push("Couldn't find a Total Revenue or Total Income row.");
  }
  if (totals.totalExpenses === undefined) {
    parseWarnings.push("Couldn't find a Total Expenses row.");
  }

  return { totals, parseWarnings, recognizedRowCount };
}

// Minimal RFC-4180-style CSV row splitter. Handles quoted fields with
// embedded commas and escaped quotes ("") since accounting exports often
// quote money columns. We don't need a full CSV library for what amounts
// to a flat label-then-numbers table.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// Picks the right-most numeric cell from a row. Accounting exports place
// the headline period total in the rightmost column (with sub-period
// columns to the left), so right-to-left scanning naturally lands on the
// "grand total" the founder cares about.
function pickRowValue(row: string[]): number | undefined {
  for (let i = row.length - 1; i >= 1; i--) {
    const v = parseAccountingNumber(row[i]);
    if (v !== undefined) return v;
  }
  return undefined;
}

// Exported for tests; handles negatives wrapped in parens (a common
// accounting convention), leading dashes, currency symbols, and thousands
// separators.
export function parseAccountingNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  let s = raw.trim();
  if (s.length === 0) return undefined;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  }
  // Strip currency symbols and thousands separators.
  s = s.replace(/[$£€¥,\s]/g, "");
  // Treat empty-after-stripping or accounting "no value" markers as missing.
  if (s === "" || s === "-" || s === "—" || s === "–") return undefined;
  const n = Number(s);
  if (!isFinite(n)) return undefined;
  return negative ? -n : n;
}
