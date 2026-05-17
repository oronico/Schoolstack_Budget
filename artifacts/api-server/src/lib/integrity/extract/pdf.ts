/**
 * Task #930 / M2 — PDF extractor.
 *
 * Reuses the MuPDF-backed `extractPdfFragments` helper from
 * `tests/_pdf-text-snapshot-util.ts` (Task #922) so we read the same
 * Unicode text PDF viewers show. Each per-page line is scanned for
 * numeric tokens — currency, percentage, ratio (`x`), months, and
 * bare numbers — and we emit one `ExtractedValue` per token with the
 * preceding line text as a label hint.
 *
 * Location format: `page=<n>:line=<i>:token=<j>` where `<i>` is the
 * 1-based line index WITHIN the page (excluding the page marker) and
 * `<j>` is the 1-based numeric-token index within that line. This is
 * deterministic enough for M4 to key on while still being human-
 * readable in failure messages.
 */
import * as mupdf from "mupdf";
import { parseNumericString } from "./walk-json.js";
import type { ExtractedValue } from "./types.js";

// Match every printable numeric token in a line. Anchored at word
// boundaries so we don't eat the trailing letters of regular prose.
// Order matters: longer suffix forms (e.g. "1.45x", "$1,234.56K") are
// tried before the bare-number form.
const TOKEN_RE = new RegExp(
  [
    "-?\\$\\s?-?[\\d,]+(?:\\.\\d+)?\\s?[KMB]?", // $1,234 / $1.2M / $-500K
    "-?[\\d,]+(?:\\.\\d+)?\\s?%",                // 12.5%
    "-?[\\d,]+(?:\\.\\d+)?\\s?x",                // 1.45x
    "-?[\\d,]+(?:\\.\\d+)?\\s?(?:months?|mo)\\b", // 8.0 mo / 12 months
    "-?[\\d,]+(?:\\.\\d+)?",                     // 1234, 1,234.56
  ].join("|"),
  "gi",
);

function extractPagesText(pdf: Buffer): string[] {
  const doc = mupdf.Document.openDocument(pdf, "application/pdf") as mupdf.Document;
  try {
    const out: string[] = [];
    const n = doc.countPages();
    for (let i = 0; i < n; i++) {
      const page = doc.loadPage(i);
      const stext = page.toStructuredText("preserve-whitespace");
      out.push(stext.asText());
      stext.destroy();
      page.destroy();
    }
    return out;
  } finally {
    doc.destroy();
  }
}

export interface ExtractPdfOptions {
  producer: string;
}

export function extractPdf(pdf: Buffer, opts: ExtractPdfOptions): ExtractedValue[] {
  const pages = extractPagesText(pdf);
  const out: ExtractedValue[] = [];
  for (let p = 0; p < pages.length; p++) {
    const lines = pages[p]
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    let previousLine: string | undefined;
    for (let l = 0; l < lines.length; l++) {
      const line = lines[l];
      const matches = Array.from(line.matchAll(TOKEN_RE));
      if (matches.length === 0) {
        previousLine = line;
        continue;
      }
      // Label hint: text on this line BEFORE the first numeric token,
      // falling back to the previous line if the value sits at the
      // start of its own line (common for tabular layouts).
      const firstMatch = matches[0];
      const prefix = line.slice(0, firstMatch.index ?? 0).trim();
      const label = prefix.length >= 2 ? prefix : previousLine;
      for (let t = 0; t < matches.length; t++) {
        const raw = matches[t][0];
        const parsed = parseNumericString(raw);
        if (parsed === null) continue;
        out.push({
          surface: "pdf",
          producer: opts.producer,
          location: `page=${p + 1}:line=${l + 1}:token=${t + 1}`,
          value: parsed,
          rawToken: raw,
          label,
        });
      }
      previousLine = line;
    }
  }
  return out;
}
