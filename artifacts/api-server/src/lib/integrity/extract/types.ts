/**
 * Task #930 / M2 — Output Extraction Tooling: shared types.
 *
 * Every extractor in this directory emits a stream of `ExtractedValue`
 * records. Each record pins one numeric value to ONE location on ONE
 * surface, plus a best-effort label hint so M4 (Mapping) can connect
 * the value back to a registry metricId.
 *
 * Extractors observe outputs only. They never modify producers and
 * never round/normalize the raw value — that lives in M4/M5 where the
 * registry's per-unit tolerances are applied.
 */

export type SurfaceKind = "workbook" | "pdf" | "component-state" | "json-export";

/**
 * Stable, human-readable location string for a value on its surface.
 * Format depends on the surface:
 *   - workbook:        `<sheetName>!<cellRef>`         e.g. "Summary!B12"
 *   - pdf:             `page=<n>:line=<i>:token=<j>`    e.g. "page=3:line=14:token=2"
 *   - component-state: dotted JSON path                  e.g. "narrative.keyMetrics[2].value"
 *   - json-export:     dotted JSON path                  e.g. "sections[0].linkedMetrics[1].value"
 */
export type LocationRef = string;

export interface ExtractedValue {
  surface: SurfaceKind;
  /** Identifier of the file/endpoint/component the value was pulled
   *  from. e.g. "lender-packet-pdf", "underwriting-workbook",
   *  "ConsultantAnalysisView". M4 keys its surface allowlist on this. */
  producer: string;
  location: LocationRef;
  /** Raw numeric value. Always finite; NaN/Infinity values are dropped
   *  by the extractor (they indicate a bug worth surfacing through a
   *  different channel). */
  value: number;
  /** Original printed token (e.g. "$1,234", "12.5%", "1.45x", "8 mo").
   *  Preserved verbatim so M4 can recover the unit hint without having
   *  to reparse the surface. Undefined for surfaces where there is no
   *  printed token (raw JSON leaves). */
  rawToken?: string;
  /** Best-effort label. For workbooks: the nearest text cell to the
   *  left or above. For PDFs: the preceding text fragment on the same
   *  line. For JSON/component state: the last non-numeric path segment
   *  (the field name). M4 uses this as the primary mapping signal. */
  label?: string;
}
