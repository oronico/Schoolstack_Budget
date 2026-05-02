import zlib from "node:zlib";

// Minimal PDF text extractor. pdfkit (used by the api-server's packet
// renderers) emits FlateDecode-compressed content streams; rendered text
// lives inside PDF string literals `(...)` and hex strings `<...>`. We
// inflate each stream and pull both forms out. This mirrors the helper
// in artifacts/api-server/tests/decision-comparison-pdf-route.ts —
// duplicated here (rather than imported) because the e2e suite must not
// reach into another artifact's test internals.
//
// This is good enough for asserting that a known caption string was
// rendered into the printed bytes; it is NOT a general-purpose PDF
// parser.

function extractStringLiterals(content: string): string {
  let result = "";
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
          if (n === undefined) {
            i++;
            break;
          }
          if (n === "n") {
            str += "\n";
            i += 2;
            continue;
          }
          if (n === "r") {
            str += "\r";
            i += 2;
            continue;
          }
          if (n === "t") {
            str += "\t";
            i += 2;
            continue;
          }
          if (n === "b" || n === "f") {
            i += 2;
            continue;
          }
          if (n === "(" || n === ")" || n === "\\") {
            str += n;
            i += 2;
            continue;
          }
          if (n >= "0" && n <= "7") {
            let oct = "";
            i++;
            while (
              oct.length < 3 &&
              i < content.length &&
              content[i] >= "0" &&
              content[i] <= "7"
            ) {
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
        if (c === "(") {
          depth++;
          str += c;
          i++;
          continue;
        }
        if (c === ")") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
          str += c;
          i++;
          continue;
        }
        str += c;
        i++;
      }
      result += str;
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      i++;
      let hex = "";
      while (i < content.length && content[i] !== ">") {
        const c = content[i];
        if (
          (c >= "0" && c <= "9") ||
          (c >= "a" && c <= "f") ||
          (c >= "A" && c <= "F")
        ) {
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
      result += str;
      continue;
    }
    i++;
  }
  return result;
}

export function extractPdfText(pdf: Buffer): string {
  const out: string[] = [];
  let cursor = 0;
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
    out.push(extractStringLiterals(body));
    cursor = eIdx + "endstream".length;
  }
  return out.join("\n");
}
