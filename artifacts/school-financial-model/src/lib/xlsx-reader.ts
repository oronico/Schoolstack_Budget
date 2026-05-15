// Lightweight read-only .xlsx parser used by the founder Excel upload
// flow. We only need to pull cell text from the workbook's first sheet
// and feed it to `parseAccountingExportRows` as `string[][]`, so we
// avoid the ~937 KB ExcelJS bundle (which is mostly write-side code for
// styles, charts, and themes the upload path never touches) and instead
// unzip the OOXML container with `fflate` and parse the small handful
// of XML parts we care about with the browser's built-in DOMParser.
//
// Output mirrors what we previously produced via ExcelJS's `cell.text`:
// every cell becomes a string, formulas resolve to their cached `<v>`
// value, and rows that are entirely empty are dropped (so the
// downstream parser's right-most-numeric-column heuristics keep
// working unchanged).

import { unzipSync, strFromU8 } from "fflate";

// Convert an Excel column reference (e.g. "A", "Z", "AA", "AB") into a
// zero-based column index. xlsx cells are addressed as "<col><row>" so
// we need this to place each `<c r="...">` value into the right slot.
function columnLetterToIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i);
    if (code < 65 || code > 90) continue;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

function parseCellRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  return { col: columnLetterToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
}

// Concatenate every <t> descendant of a sharedStrings <si>. Rich-text
// runs nest <t> elements inside <r> children; plain strings have a
// single direct <t>. Either way the displayed text is the concatenation
// of those text nodes in document order.
function readSharedString(si: Element): string {
  const tNodes = si.getElementsByTagName("t");
  if (tNodes.length === 0) return "";
  let out = "";
  for (let i = 0; i < tNodes.length; i++) out += tNodes[i].textContent ?? "";
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const items = doc.getElementsByTagName("si");
  const out: string[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) out[i] = readSharedString(items[i]);
  return out;
}

// Resolve which sheet xml part holds the workbook's first sheet. The
// canonical path is `xl/worksheets/sheet1.xml` but the spec lets the
// authoring tool pick any name and reference it by relationship id, so
// we follow workbook.xml -> workbook.xml.rels rather than hard-coding.
function resolveFirstSheetPath(files: Record<string, Uint8Array>): string | null {
  const wbXml = files["xl/workbook.xml"];
  const relsXml = files["xl/_rels/workbook.xml.rels"];
  if (wbXml && relsXml) {
    const wbDoc = new DOMParser().parseFromString(strFromU8(wbXml), "application/xml");
    const sheets = wbDoc.getElementsByTagName("sheet");
    if (sheets.length > 0) {
      // r:id lives in the relationships namespace; getAttributeNS with
      // a wildcard namespace covers both `r:id` and the (rare) bare
      // `id` attribute some generators emit.
      const rid =
        sheets[0].getAttribute("r:id") ??
        sheets[0].getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ??
        sheets[0].getAttribute("id");
      if (rid) {
        const relsDoc = new DOMParser().parseFromString(strFromU8(relsXml), "application/xml");
        const rels = relsDoc.getElementsByTagName("Relationship");
        for (let i = 0; i < rels.length; i++) {
          if (rels[i].getAttribute("Id") === rid) {
            const target = rels[i].getAttribute("Target");
            if (target) {
              // Targets are relative to xl/ when they don't start with
              // a slash; absolute targets ("/xl/worksheets/...") drop
              // the leading slash.
              if (target.startsWith("/")) return target.slice(1);
              return `xl/${target.replace(/^\.\//, "")}`;
            }
          }
        }
      }
    }
  }
  // Fallbacks for workbooks missing the relationship metadata.
  if (files["xl/worksheets/sheet1.xml"]) return "xl/worksheets/sheet1.xml";
  for (const name of Object.keys(files)) {
    if (/^xl\/worksheets\/sheet[^/]+\.xml$/i.test(name)) return name;
  }
  return null;
}

function readCellText(cell: Element, sharedStrings: string[]): string {
  const type = cell.getAttribute("t") ?? "n";
  if (type === "inlineStr") {
    const is = cell.getElementsByTagName("is")[0];
    return is ? readSharedString(is) : "";
  }
  // For everything else the displayed value lives in <v>. For formula
  // cells (`<c><f>...</f><v>cached</v></c>`) we use the cached `<v>`
  // so formulas resolve to their last-computed result, matching what
  // ExcelJS's `cell.text` returned.
  const vNode = cell.getElementsByTagName("v")[0];
  const raw = vNode?.textContent ?? "";
  if (raw === "") return "";
  if (type === "s") {
    const idx = parseInt(raw, 10);
    return Number.isFinite(idx) ? sharedStrings[idx] ?? "" : "";
  }
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  // n, str, e, d -> emit the raw text. parseAccountingNumber on the
  // downstream side is happy with bare numeric strings ("1234.56"),
  // and label/date columns are stored as shared strings in practice.
  return raw;
}

function parseSheetRows(xml: string, sharedStrings: string[]): string[][] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rowEls = doc.getElementsByTagName("row");
  const out: string[][] = [];
  for (let r = 0; r < rowEls.length; r++) {
    const cellEls = rowEls[r].getElementsByTagName("c");
    if (cellEls.length === 0) continue;
    const row: string[] = [];
    let hasContent = false;
    for (let c = 0; c < cellEls.length; c++) {
      const cell = cellEls[c];
      const text = readCellText(cell, sharedStrings);
      const ref = cell.getAttribute("r");
      const parsed = ref ? parseCellRef(ref) : null;
      const colIdx = parsed ? parsed.col : row.length;
      while (row.length < colIdx) row.push("");
      row.push(text);
      if (text !== "") hasContent = true;
    }
    if (hasContent) out.push(row);
  }
  return out;
}

// Read the first worksheet of an .xlsx workbook and return its cells as
// a `string[][]` grid. Mirrors the surface previously provided by the
// inline ExcelJS code in the upload steps so `parseAccountingExportRows`
// stays untouched.
export async function readXlsxFirstSheetRows(buf: ArrayBuffer): Promise<string[][]> {
  const files = unzipSync(new Uint8Array(buf));
  const sheetPath = resolveFirstSheetPath(files);
  if (!sheetPath || !files[sheetPath]) return [];
  const sharedStrings = files["xl/sharedStrings.xml"]
    ? parseSharedStrings(strFromU8(files["xl/sharedStrings.xml"]))
    : [];
  return parseSheetRows(strFromU8(files[sheetPath]), sharedStrings);
}
