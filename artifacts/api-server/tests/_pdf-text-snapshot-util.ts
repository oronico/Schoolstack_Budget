/**
 * Shared utilities for PDF text-rendering snapshot tests.
 *
 * Extracted from `tests/lender-pdf-text-snapshot.ts` (Task #893) so the
 * sibling board / pro-forma / loan-readiness snapshot tests added in
 * Task #896 can reuse the exact same extractor + date-redaction logic
 * without copy-paste drift between the four scripts.
 *
 * The lender script intentionally keeps its inline copies for now (it's
 * the original template). New snapshot scripts should import from here.
 */
import zlib from "node:zlib";

// ── PDF text extractor ─────────────────────────────────────────────────
// Yields one entry per `(...)` literal / `<...>` hex string inside each
// FlateDecode-compressed content stream. Per-literal granularity (rather
// than per-page concatenation) makes the resulting snapshot a stable,
// human-readable record where each label / dollar figure is its own
// line, so a diff points at the exact regressed token.
export function extractStringLiterals(content: string, out: string[]): void {
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "(") {
      i++;
      let depth = 1;
      let str = "";
      while (i < content.length && depth > 0) {
        const c = content[i];
        if (c === "\\") {
          const n = content[i + 1];
          if (n === undefined) { i++; break; }
          if (n === "n") { str += "\n"; i += 2; continue; }
          if (n === "r") { str += "\r"; i += 2; continue; }
          if (n === "t") { str += "\t"; i += 2; continue; }
          if (n === "b" || n === "f") { i += 2; continue; }
          if (n === "(" || n === ")" || n === "\\") { str += n; i += 2; continue; }
          if (n >= "0" && n <= "7") {
            let oct = "";
            i++;
            while (oct.length < 3 && i < content.length && content[i] >= "0" && content[i] <= "7") {
              oct += content[i];
              i++;
            }
            str += String.fromCharCode(parseInt(oct, 8));
            continue;
          }
          str += n;
          i += 2;
          continue;
        }
        if (c === "(") { depth++; str += c; i++; continue; }
        if (c === ")") {
          depth--;
          if (depth === 0) { i++; break; }
          str += c; i++; continue;
        }
        str += c;
        i++;
      }
      if (str.length > 0) out.push(str);
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      i++;
      let hex = "";
      while (i < content.length && content[i] !== ">") {
        const c = content[i];
        if ((c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F")) {
          hex += c;
        }
        i++;
      }
      if (content[i] === ">") i++;
      if (hex.length % 2 === 1) hex += "0";
      let str = "";
      for (let h = 0; h < hex.length; h += 2) {
        str += String.fromCharCode(parseInt(hex.substr(h, 2), 16));
      }
      if (str.length > 0) out.push(str);
      continue;
    }
    i++;
  }
}

// Redact non-deterministic tokens so re-running the test on a different
// day produces the same snapshot. The packet PDFs render a long-form
// `Month DD, YYYY` date in two places:
//   1. The cover page's "Prepared <date>" line, sourced from
//      `packet.generatedAt` (which we pin to a fixed date in callers).
//   2. The page footer's "Generated <date>" line, which `pdf-utils.ts`
//      `drawFooter` builds from a raw `new Date()` and which we cannot
//      override from the test. PDFKit kerning often splits this date
//      across multiple `(...)` literals (e.g. `"ated Ma"` + `"y 15,
//      2026"`), so naive per-fragment regex redaction misses it. We
//      therefore detect the date span on the JOINED page text, then
//      collapse the run of fragments covering each match to a single
//      `<DATE>` token. This keeps the per-fragment granularity that
//      makes diffs precise while making the snapshot date-independent.
const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`(${MONTHS})\\s+\\d{1,2},\\s+\\d{4}`, "g");

export function redactDatesAcrossFragments(fragments: string[]): string[] {
  if (fragments.length === 0) return fragments;
  const offsets: number[] = new Array(fragments.length);
  let joined = "";
  for (let i = 0; i < fragments.length; i++) {
    offsets[i] = joined.length;
    joined += fragments[i];
  }
  const owner = new Int32Array(joined.length);
  for (let i = 0; i < fragments.length; i++) {
    const start = offsets[i];
    const end = i + 1 < fragments.length ? offsets[i + 1] : joined.length;
    for (let k = start; k < end; k++) owner[k] = i;
  }
  const out = fragments.slice();
  const matches = Array.from(joined.matchAll(DATE_RE));
  for (let m = matches.length - 1; m >= 0; m--) {
    const match = matches[m];
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const firstFrag = owner[start];
    const lastFrag = owner[end - 1];
    for (let f = firstFrag; f <= lastFrag; f++) {
      const fStart = offsets[f];
      const fEnd = f + 1 < fragments.length ? offsets[f + 1] : joined.length;
      const localStart = Math.max(0, start - fStart);
      const localEnd = Math.min(fEnd - fStart, end - fStart);
      const cur = out[f];
      const replacement = f === firstFrag ? "<DATE>" : "";
      out[f] = cur.slice(0, localStart) + replacement + cur.slice(localEnd);
    }
  }
  return out.filter((s) => s.length > 0);
}

export function extractPdfFragments(pdf: Buffer): string[] {
  const out: string[] = [];
  let cursor = 0;
  let page = 0;
  while (cursor < pdf.length) {
    const sIdx = pdf.indexOf("stream", cursor);
    if (sIdx === -1) break;
    let dataStart = sIdx + "stream".length;
    if (pdf[dataStart] === 0x0d) dataStart++;
    if (pdf[dataStart] === 0x0a) dataStart++;
    const eIdx = pdf.indexOf("endstream", dataStart);
    if (eIdx === -1) break;
    let dataEnd = eIdx;
    if (pdf[dataEnd - 1] === 0x0a) dataEnd--;
    if (pdf[dataEnd - 1] === 0x0d) dataEnd--;
    const raw = pdf.subarray(dataStart, dataEnd);
    let body: string;
    try {
      body = zlib.inflateSync(raw).toString("binary");
    } catch {
      body = raw.toString("binary");
    }
    const pageFragments: string[] = [];
    extractStringLiterals(body, pageFragments);
    if (pageFragments.length > 0) {
      page++;
      const redacted = redactDatesAcrossFragments(pageFragments);
      out.push(`--- PAGE ${page} ---`, ...redacted);
    }
    cursor = eIdx + "endstream".length;
  }
  return out;
}

export function diffLines(actual: string[], expected: string[], maxShown = 25): string {
  const lines: string[] = [];
  const max = Math.max(actual.length, expected.length);
  let shown = 0;
  let differingCount = 0;
  for (let i = 0; i < max; i++) {
    const a = actual[i];
    const e = expected[i];
    if (a !== e) {
      differingCount++;
      if (shown < maxShown) {
        lines.push(`    line ${i + 1}:`);
        lines.push(`      expected: ${e === undefined ? "<eof>" : JSON.stringify(e)}`);
        lines.push(`      actual:   ${a === undefined ? "<eof>" : JSON.stringify(a)}`);
        shown++;
      }
    }
  }
  if (differingCount > shown) {
    lines.push(`    ... and ${differingCount - shown} more differing lines`);
  }
  if (actual.length !== expected.length) {
    lines.push(`    length mismatch: expected ${expected.length} lines, got ${actual.length}`);
  }
  return lines.join("\n");
}
