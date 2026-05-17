/**
 * Task #930 / M2 — JSON export extractor.
 *
 * Walks a JSON payload returned by one of the export endpoints
 * (`/api/models/:id/export/lender-packet`,
 *  `/api/models/:id/export/board-packet`,
 *  `/api/models/:id/consultant`, etc.) and emits one `ExtractedValue`
 * per numeric leaf. M5 calls this extractor on the live HTTP response
 * so the integrity harness can prove the bytes a downstream consumer
 * deserializes match the registry's canonical values.
 *
 * `producer` should be the endpoint path (without the model id) so
 * failure messages tell the reviewer which endpoint disagreed.
 */
import { walkJsonForNumbers } from "./walk-json.js";
import type { ExtractedValue } from "./types.js";

export interface ExtractJsonExportOptions {
  producer: string;
}

export function extractJsonExport(
  payload: unknown,
  opts: ExtractJsonExportOptions,
): ExtractedValue[] {
  const leaves = walkJsonForNumbers(payload);
  return leaves.map((leaf) => ({
    surface: "json-export",
    producer: opts.producer,
    location: leaf.path,
    value: leaf.value,
    rawToken: leaf.rawToken,
    label: leaf.label,
  }));
}
