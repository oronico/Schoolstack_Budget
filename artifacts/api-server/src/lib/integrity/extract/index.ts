/**
 * Task #930 / M2 — Output extraction tooling. Public surface area
 * consumed by M4 (Mapping) and M5 (Integrity Harness).
 */
export type { ExtractedValue, SurfaceKind, LocationRef } from "./types.js";
export { extractWorkbook } from "./workbook.js";
export { extractPdf } from "./pdf.js";
export { extractComponentState } from "./component-state.js";
export { extractJsonExport } from "./json-export.js";
export { walkJsonForNumbers, parseNumericString } from "./walk-json.js";
export type { NumericLeaf } from "./walk-json.js";
