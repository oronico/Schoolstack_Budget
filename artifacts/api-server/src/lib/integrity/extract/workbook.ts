/**
 * Task #930 / M2 — Workbook extractor.
 *
 * Loads a generated `.xlsx` buffer with ExcelJS and emits one
 * `ExtractedValue` per populated numeric cell, including formula cells
 * (we read the cached `.result` that ExcelJS resolves on parse, which
 * is what Excel actually shows the founder when they open the file).
 *
 * Label hint: the nearest non-numeric text cell on the same row to the
 * left, falling back to the first non-numeric cell directly above in
 * the same column. This mirrors how a human reads a budget tab — the
 * row label sits to the left of the value, or the header sits on top.
 */
import ExcelJS from "exceljs";
import type { ExtractedValue } from "./types.js";

function cellNumericValue(cell: ExcelJS.Cell): { value: number; rawToken?: string } | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return { value: v };
  if (typeof v === "object" && v !== null) {
    // Formula cells: ExcelJS shapes them as { formula, result } where
    // `result` is the cached value from the last calc the writer ran.
    if ("result" in v) {
      const r = (v as { result: unknown }).result;
      if (typeof r === "number" && Number.isFinite(r)) {
        return { value: r };
      }
    }
  }
  return null;
}

function cellTextValue(cell: ExcelJS.Cell): string | undefined {
  const v = cell.value;
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "object" && v !== null) {
    if ("richText" in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      const joined = (v as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join("")
        .trim();
      return joined || undefined;
    }
    if ("text" in v && typeof (v as { text: unknown }).text === "string") {
      return ((v as { text: string }).text).trim() || undefined;
    }
  }
  return undefined;
}

function nearestLabel(ws: ExcelJS.Worksheet, row: number, col: number): string | undefined {
  // Walk left on the same row.
  for (let c = col - 1; c >= 1; c--) {
    const t = cellTextValue(ws.getCell(row, c));
    if (t) return t;
  }
  // Fall back to the first non-empty text cell directly above.
  for (let r = row - 1; r >= 1; r--) {
    const t = cellTextValue(ws.getCell(r, col));
    if (t) return t;
  }
  return undefined;
}

export interface ExtractWorkbookOptions {
  producer: string;
}

export async function extractWorkbook(
  buffer: Buffer | ArrayBuffer,
  opts: ExtractWorkbookOptions,
): Promise<ExtractedValue[]> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS accepts ArrayBuffer or Buffer; normalize to ArrayBuffer for
  // its typings.
  const ab = buffer instanceof Buffer
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    : buffer;
  await wb.xlsx.load(ab as ArrayBuffer);
  const out: ExtractedValue[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const numeric = cellNumericValue(cell);
        if (!numeric) return;
        out.push({
          surface: "workbook",
          producer: opts.producer,
          location: `${ws.name}!${cell.address}`,
          value: numeric.value,
          rawToken: numeric.rawToken,
          label: nearestLabel(ws, rowNumber, colNumber),
        });
      });
    });
  }
  return out;
}
