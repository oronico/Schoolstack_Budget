// Helpers for working with the per-field source labels stored on a
// CustomScenarioActuals' `sourceByField` map. The labels themselves are
// produced by `buildActualsSuggestion` in `lib/finance/decision-engine`,
// and we re-render them here in the saved-scenario UI so the
// books-vs-typed distinction stays visible after save.

// Parses a source label produced by the uploaded-CSV branch of
// `buildActualsSuggestion`. The label shape is either:
//   "From <filename> uploaded <Mon D>"  (when the upload had a timestamp)
//   "From <filename>"                   (when it didn't)
//
// Returns null for labels produced by the live-snapshot, prior-year, or
// current-year branches so the caller (the saved-actuals summary) only
// surfaces the "Pulled from your books" caption when the saved field
// actually originated from an uploaded export.
export function parseExportSourceLabel(
  label: string,
): { filename: string; uploadedLabel?: string } | null {
  const withDate = /^From (.+?) uploaded (.+)$/.exec(label);
  if (withDate) return { filename: withDate[1], uploadedLabel: withDate[2] };
  // Fallback: "From <filename>" with a recognizable spreadsheet/CSV
  // extension. Live-snapshot labels look like "From QuickBooks" (no
  // extension) so they fall through and return null here.
  const noDate = /^From (.+\.(?:csv|tsv|xlsx|xls))$/i.exec(label);
  if (noDate) return { filename: noDate[1] };
  return null;
}
